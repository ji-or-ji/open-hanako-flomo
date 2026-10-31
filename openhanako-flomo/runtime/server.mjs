#!/usr/bin/env node
/**
 * runtime/server.mjs — 受管运行时：笔记卡的数据与动作。
 *
 * 为什么非得起个进程：
 *   · App 后端读不到用户的下载目录（导入要找 Downloads 里的导出包）
 *   · 卡片页面碰不到文件系统，跨源也带不上 webhook 凭据
 *   · 打开系统浏览器、落引用队列，都在沙盒外更省事
 *
 * 端口固定 47811：卡片里的按钮直接打到 127.0.0.1:47811，端口一变就失联。
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyUpdate, checkUpdate, dirSize } from "../lib/updater.mjs";
import { candidateDirs, findRecentCandidates, mergeIntoExisting, parseExportFile } from "../lib/sync.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const INSTALL_DIR = join(HERE, "..");

function arg(name, fallback) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

const PORT = Number(arg("port", "47811"));
const DATA_DIR = arg("data", process.cwd());
const VERSION = arg("version", "");

const log = {
  info: (...a) => console.log("[flomo]", ...a),
  warn: (...a) => console.warn("[flomo]", ...a),
  error: (...a) => console.error("[flomo]", ...a),
};

mkdirSync(DATA_DIR, { recursive: true });

// ---------- 本地索引（和 App 后端共用同一份 memos.json） ----------

const memosPath = () => join(DATA_DIR, "memos.json");
const queueDir = () => join(DATA_DIR, "quote-queue");
const webhookPath = () => join(DATA_DIR, "webhook.txt");
const numbersPath = () => join(DATA_DIR, "numbers.json");
const mcpQueueDir = () => join(DATA_DIR, "mcp-queue");
const mcpResultDir = () => join(DATA_DIR, "mcp-results");
const mcpStatusPath = () => join(DATA_DIR, "mcp-status.json");

/** 引用时只报编号，不报整篇；超过这个字数就不附正文了。 */
const QUOTE_TEXT_LIMIT = 800;

function readMemos() {
  try {
    const parsed = JSON.parse(readFileSync(memosPath(), "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMemos(list) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(memosPath(), JSON.stringify(list, null, 2), "utf8");
}

/**
 * 给每条笔记一个稳定编号（#1、#2…），落盘记住。
 * 不按当前位置临时算：排序一变编号就飘，引用出去的 #12 就对不上人了。
 */
function memoNumbers(memos) {
  let map = {};
  try {
    map = JSON.parse(readFileSync(numbersPath(), "utf8")) || {};
  } catch {
    map = {};
  }
  let max = 0;
  for (const v of Object.values(map)) if (Number.isFinite(v) && v > max) max = v;
  let changed = false;
  for (const m of [...memos].sort((a, b) => String(a.time).localeCompare(String(b.time)))) {
    if (!map[m.id]) {
      map[m.id] = ++max;
      changed = true;
    }
  }
  if (changed) {
    try {
      writeFileSync(numbersPath(), JSON.stringify(map, null, 2), "utf8");
    } catch {
      /* 写不进去也不影响读 */
    }
  }
  return map;
}

/**
 * 把“引用一条”组装成发给助手的文本。
 *   · 划词引用：只发选中那一段 + 来源编号
 *   · 整条引用：正文不超限才附上，超了只给编号与开头，让助手需要时用 search_memo 去取
 */
function composeQuote({ no, text, kind, sessionId, sessionPath }) {
  const memos = readMemos();
  const numbers = memoNumbers(memos);
  const n = Number(no) || 0;
  const memo = n ? memos.find((m) => numbers[m.id] === n) : null;

  const head = memo ? `引用 flomo 笔记 #${n} · ${memo.time}` : `引用 flomo 笔记${n ? ` #${n}` : ""}`;
  let body = String(text || "").trim();
  let tail = "";

  if (!memo && !body) throw new Error("没有内容可引用");

  if (kind === "note" && memo) {
    const full = String(memo.content || "");
    if (full.length > QUOTE_TEXT_LIMIT) {
      body = `（正文 ${full.length} 字，过长未附。开头：${full.slice(0, 60)}…）`;
      tail = "\n需要全文时用 search_memo 按这段开头检索。";
    } else {
      body = full;
    }
  } else if (kind === "selection" && body.length > QUOTE_TEXT_LIMIT) {
    body = body.slice(0, QUOTE_TEXT_LIMIT) + "…（选区过长，已截断）";
  }

  if (!body) throw new Error("没有内容可引用");
  const quoted = body.split("\n").map((line) => `> ${line}`).join("\n");
  const label = kind === "selection" ? "（划词摘录）" : "";
  return {
    text: `${head}${label}\n${quoted}${tail}`,
    sessionId: sessionId || "",
    sessionPath: sessionPath || "",
  };
}

function importFile(path) {
  const parsed = parseExportFile(path);
  if (!parsed.length) return { ok: false, reason: "这个文件里没有 flomo 笔记" };
  const { added, merged } = mergeIntoExisting(parsed, readMemos());
  writeMemos(merged);
  return { ok: true, parsed: parsed.length, added: added.length, total: merged.length };
}

/** webhook 由 App 后端写在 dataDir/webhook.txt 里，这里每次现读，改了立刻生效。 */
function webhookUrl() {
  try {
    return readFileSync(webhookPath(), "utf8").trim();
  } catch {
    return "";
  }
}

// ---------- 等待导出包落盘 ----------

const sync = { state: "idle", sinceMs: 0, deadline: 0, dirs: [], message: "", result: null };
let syncTimer = null;

function stopSync(state, message) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = null;
  sync.state = state;
  sync.message = message || "";
}

function scanOnce() {
  for (const hit of findRecentCandidates(sync.dirs, sync.sinceMs)) {
    let res;
    try {
      res = importFile(hit.path);
    } catch (err) {
      res = { ok: false, reason: String(err?.message || err) };
    }
    if (res.ok) {
      sync.result = { file: hit.path, ...res };
      stopSync("done", `已同步：新增 ${res.added} 条，共 ${res.total} 条`);
      return;
    }
  }
  if (Date.now() > sync.deadline) {
    stopSync("timeout", "没等到导出文件。下载可能被内嵌页面的沙箱拦了：点「外部打开」，在浏览器里导出，再把包拖回这张卡片。");
    return;
  }
  syncTimer = setTimeout(scanOnce, 1200);
}

function startSync(seconds) {
  const span = Math.max(20, Math.min(900, Number(seconds) || 300));
  sync.sinceMs = Date.now() - 5000;
  sync.deadline = Date.now() + span * 1000;
  sync.dirs = candidateDirs([DATA_DIR]);
  sync.result = null;
  sync.state = "watching";
  sync.message = "等你点导出…";
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(scanOnce, 600);
  return { dirs: sync.dirs, seconds: span };
}

// ---------- 引用队列（App 后端取走并投进会话） ----------

function enqueueQuote({ text, sessionId, sessionPath }) {
  const body = String(text || "").trim();
  if (!body) throw new Error("没有内容可引用");
  mkdirSync(queueDir(), { recursive: true });
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  writeFileSync(
    join(queueDir(), `${id}.json`),
    JSON.stringify({ id, text: body, sessionId: sessionId || "", sessionPath: sessionPath || "", at: Date.now() }),
    "utf8",
  );
  return { id };
}

// ---------- 自我更新（备用，无界面入口） ----------

let busy = "";
let lastResult = null;

function send(res, code, data) {
  const body = Buffer.from(JSON.stringify(data));
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-max-age": "600",
    });
    res.end();
    return;
  }
  const url = new URL(req.url, "http://127.0.0.1");
  try {
    if (url.pathname === "/__health") {
      send(res, 200, {
        ok: true,
        version: VERSION,
        pid: process.pid,
        memos: readMemos().length,
        webhook: Boolean(webhookUrl()),
        size: dirSize(INSTALL_DIR),
      });
      return;
    }

    // ---- 笔记数据 ----
    if (url.pathname === "/__memos") {
      const memos = readMemos();
      const numbers = memoNumbers(memos);
      const tags = new Map();
      for (const m of memos) for (const t of m.tags || []) tags.set(t, (tags.get(t) || 0) + 1);
      send(res, 200, {
        ok: true,
        total: memos.length,
        tags: [...tags.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
        memos: memos.map((m) => ({ ...m, no: numbers[m.id] || 0, length: String(m.content || "").length })),
      });
      return;
    }
    if (url.pathname === "/__memo/new" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const text = String(body.text || "").trim();
      if (!text) {
        send(res, 400, { ok: false, error: "内容为空" });
        return;
      }
      const hook = webhookUrl();
      if (!hook) {
        send(res, 400, { ok: false, error: "还没配 Incoming Webhook：设置 → 扩展 → OpenHanako-flomo" });
        return;
      }
      const r = await fetch(hook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: text }),
      });
      if (!r.ok) {
        send(res, 502, { ok: false, error: `flomo 回了 ${r.status}` });
        return;
      }
      send(res, 200, { ok: true, sent: text.length });
      return;
    }
    if (url.pathname === "/__quote" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      send(res, 200, { ok: true, ...enqueueQuote(composeQuote(body)) });
      return;
    }

    // ---- 导入 ----
    if (url.pathname === "/__sync/start" && req.method === "POST") {
      send(res, 200, { ok: true, ...startSync(url.searchParams.get("seconds")) });
      return;
    }
    if (url.pathname === "/__sync/status") {
      send(res, 200, { ok: true, ...sync });
      return;
    }
    if (url.pathname === "/__sync/stop" && req.method === "POST") {
      stopSync("idle", "");
      send(res, 200, { ok: true });
      return;
    }
    if (url.pathname === "/__sync/upload" && req.method === "POST") {
      const buf = await readBody(req);
      if (!buf.length) {
        send(res, 400, { ok: false, error: "空文件" });
        return;
      }
      const rawName = url.searchParams.get("name") || "upload.zip";
      const safe = rawName.replace(/[^\w.\-]/g, "_").slice(-60) || "upload.zip";
      const tmp = join(DATA_DIR, `upload-${Date.now()}-${safe}`);
      writeFileSync(tmp, buf);
      let r;
      try {
        r = importFile(tmp);
      } finally {
        rmSync(tmp, { force: true });
      }
      send(res, 200, { ...r, file: rawName, bytes: buf.length });
      return;
    }
    if (url.pathname === "/__sync/import" && req.method === "POST") {
      const path = url.searchParams.get("path");
      if (!path || !existsSync(path)) {
        send(res, 404, { ok: false, error: "找不到这个文件" });
        return;
      }
      send(res, 200, { ...importFile(path), file: path });
      return;
    }

    // ---- 写系统剪贴板（沙箱里的页面没 clipboard 权限，只能从外面写） ----
    if (url.pathname === "/__copy" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const text = String(body.text || "");
      if (!text) {
        send(res, 400, { ok: false, error: "没有内容" });
        return;
      }
      const tmp = join(DATA_DIR, `clip-${Date.now()}.txt`);
      writeFileSync(tmp, text, "utf8");
      const code = await new Promise((resolve) => {
        const ps = spawn(
          "powershell.exe",
          ["-NoProfile", "-NonInteractive", "-Command", `Get-Content -LiteralPath '${tmp}' -Raw -Encoding UTF8 | Set-Clipboard`],
          { windowsHide: true, stdio: "ignore" },
        );
        ps.on("error", () => resolve(-1));
        ps.on("exit", (c) => resolve(c ?? -1));
      });
      rmSync(tmp, { force: true });
      if (code === 0) send(res, 200, { ok: true, chars: text.length });
      else send(res, 500, { ok: false, error: `剪贴板写入失败（exit ${code}）` });
      return;
    }

    if (url.pathname === "/__memo/append" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const text = String(body.text || "").trim();
      if (!text) {
        send(res, 400, { ok: false, error: "内容为空" });
        return;
      }
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const time = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      const tags = [...new Set([...text.matchAll(/#([^\s#]+)/g)].map((m) => m[1]))];
      const memo = { id: `local-${now.getTime()}`, time, content: text, tags, images: [], origin: "local" };
      const memos = readMemos();
      memos.push(memo);
      memos.sort((a, b) => String(b.time).localeCompare(String(a.time)));
      writeMemos(memos);
      send(res, 200, { ok: true, memo, total: memos.length });
      return;
    }

    if (url.pathname === "/__memo/patch" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const id = String(body.id || "");
      const text = String(body.text || "").trim();
      if (!id || !text) {
        send(res, 400, { ok: false, error: "缺 id 或正文" });
        return;
      }
      const memos = readMemos();
      const idx = memos.findIndex((m) => m.id === id);
      if (idx < 0) {
        send(res, 404, { ok: false, error: "本地没有这条" });
        return;
      }
      memos[idx] = { ...memos[idx], content: text };
      writeMemos(memos);
      send(res, 200, { ok: true });
      return;
    }

    // ---- MCP：卡片把请求放进队列，App 后端接走并回结果 ----
    if (url.pathname === "/__mcp/status") {
      let status = { configured: false };
      try {
        status = JSON.parse(readFileSync(mcpStatusPath(), "utf8"));
      } catch {
        status = { configured: false, note: "状态文件还没生成" };
      }
      send(res, 200, { ok: true, ...status });
      return;
    }
    if (url.pathname === "/__mcp/op" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const op = String(body.op || "");
      if (!["probe", "search", "create", "update"].includes(op)) {
        send(res, 400, { ok: false, error: "op 只能是 probe/search/create/update" });
        return;
      }
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      mkdirSync(mcpQueueDir(), { recursive: true });
      writeFileSync(
        join(mcpQueueDir(), `${id}.json`),
        JSON.stringify({ id, op, payload: body.payload || {}, at: Date.now() }),
        "utf8",
      );
      const deadline = Date.now() + 25000;
      const resultPath = join(mcpResultDir(), `${id}.json`);
      while (Date.now() < deadline) {
        if (existsSync(resultPath)) {
          let result = { ok: false, error: "结果读不出来" };
          try {
            result = JSON.parse(readFileSync(resultPath, "utf8"));
          } catch {
            /* 保持默认 */
          }
          rmSync(resultPath, { force: true });
          send(res, 200, result);
          return;
        }
        await new Promise((r) => setTimeout(r, 320));
      }
      send(res, 504, { ok: false, error: "MCP 没在 25 秒内回结果（App 后端可能没在跑）" });
      return;
    }

    // ---- 诊断：把卡片里拿到的原始数据落盘，便于对宿主返回形状 ----
    if (url.pathname === "/__debug" && req.method === "POST") {
      const raw = (await readBody(req)).toString("utf8");
      writeFileSync(join(DATA_DIR, "debug-card.json"), raw.slice(0, 20000), "utf8");
      send(res, 200, { ok: true, bytes: raw.length });
      return;
    }

    // ---- 打开系统浏览器（卡片里的 window.open 会被沙箱挡） ----
    if (url.pathname === "/__open" && req.method === "POST") {
      const body = JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const target = String(body.url || "");
      if (!/^https?:\/\//i.test(target)) {
        send(res, 400, { ok: false, error: "只允许 http(s) 链接" });
        return;
      }
      spawn("cmd", ["/c", "start", "", target], { detached: true, stdio: "ignore", windowsHide: true }).unref();
      send(res, 200, { ok: true });
      return;
    }

    // ---- 自我更新（无界面入口，留给会话里手动调） ----
    if (url.pathname === "/__update/check") {
      send(res, 200, { ok: true, ...(await checkUpdate({ currentVersion: VERSION })) });
      return;
    }
    if (url.pathname === "/__update/apply" && req.method === "POST") {
      if (busy) {
        send(res, 409, { ok: false, error: "已经在更新了" });
        return;
      }
      if (!existsSync(join(INSTALL_DIR, "manifest.json"))) {
        send(res, 500, { ok: false, error: "安装目录里没有 manifest.json" });
        return;
      }
      const current = JSON.parse(readFileSync(join(INSTALL_DIR, "manifest.json"), "utf8"));
      busy = "checking";
      try {
        const info = await checkUpdate({ currentVersion: current.version });
        if (!info.newer) {
          busy = "";
          send(res, 200, { ok: true, upToDate: true, current: current.version, latest: info.latest });
          return;
        }
        busy = "downloading";
        lastResult = await applyUpdate({
          installDir: INSTALL_DIR,
          dataDir: DATA_DIR,
          info: { ...info, current: current.version },
          log,
        });
        busy = "";
        send(res, 200, { ...lastResult, restart: true });
      } catch (err) {
        busy = "";
        log.error("更新失败", err?.message || err);
        send(res, 500, { ok: false, error: String(err?.message || err) });
      }
      return;
    }

    send(res, 404, { ok: false, error: "not found" });
  } catch (err) {
    log.error("请求出错", err?.message || err);
    send(res, 500, { ok: false, error: String(err?.message || err) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  log.info(`运行时就绪 http://127.0.0.1:${PORT} · 版本 ${VERSION} · ${INSTALL_DIR}`);
  console.log("FLOMO_RUNTIME_READY");
});

server.on("error", (err) => {
  log.error(`端口 ${PORT} 起不来：${err?.message || err}`);
  if (err && err.code === "EADDRINUSE") process.exit(3);
  process.exit(1);
});
