#!/usr/bin/env node
/**
 * runtime/server.mjs — 受管运行时：同步笔记 + （可选）从 Release 更新自身。
 *
 * 为什么非得起个进程：App 后端跑在 AppHost 沙盒里，读不到用户的下载目录；卡片页面
 * 是浏览器环境，也碰不到文件系统。同步要「盯着下载目录 + 解压 + 写索引」，只能在
 * 沙盒外面的本机进程里做。
 *
 * 端口固定 47811：页面里的按钮直接打到 127.0.0.1:47811，端口一变就失联。
 */
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

// ---------- 笔记索引（和 App 后端共用同一份 memos.json） ----------

function memosPath() {
  return join(DATA_DIR, "memos.json");
}

function readMemos() {
  const p = memosPath();
  if (!existsSync(p)) return [];
  try {
    const parsed = JSON.parse(readFileSync(p, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeMemos(list) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(memosPath(), JSON.stringify(list, null, 2), "utf8");
}

/** 解析一份导出并合并进索引。 */
function importFile(path) {
  const parsed = parseExportFile(path);
  if (!parsed.length) return { ok: false, reason: "这个文件里没有 flomo 笔记" };
  const existing = readMemos();
  const { added, merged } = mergeIntoExisting(parsed, existing);
  writeMemos(merged);
  return { ok: true, parsed: parsed.length, added: added.length, total: merged.length };
}

// ---------- 等待导出包落盘 ----------

const sync = {
  state: "idle", // idle | watching | done | timeout | error
  sinceMs: 0,
  deadline: 0,
  dirs: [],
  message: "",
  result: null,
};
let syncTimer = null;

function stopSync(state, message) {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = null;
  sync.state = state;
  sync.message = message || "";
}

function scanOnce() {
  const hits = findRecentCandidates(sync.dirs, sync.sinceMs);
  for (const hit of hits) {
    // 有些 zip 正在写，先跳过尺寸还在变的
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
    stopSync("timeout", "没等到导出文件。在 flomo 页面里点 设置 → 导入导出 → 导出，下载完我这边会自动接上。");
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

// ---------- 自我更新（备用：卡片界面没有入口，留给会话里手动调） ----------

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
      const memos = readMemos();
      send(res, 200, {
        ok: true,
        version: VERSION,
        pid: process.pid,
        installDir: INSTALL_DIR,
        size: dirSize(INSTALL_DIR),
        memos: memos.length,
      });
      return;
    }
    if (url.pathname === "/__sync/start" && req.method === "POST") {
      const info = startSync(url.searchParams.get("seconds"));
      send(res, 200, { ok: true, ...info });
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
    if (url.pathname === "/__sync/import" && req.method === "POST") {
      const path = url.searchParams.get("path");
      if (!path) {
        send(res, 400, { ok: false, error: "缺少 path" });
        return;
      }
      if (!existsSync(path)) {
        send(res, 404, { ok: false, error: "找不到这个文件" });
        return;
      }
      const r = importFile(path);
      send(res, 200, { ...r, file: path });
      return;
    }
    if (url.pathname === "/__update/check") {
      const info = await checkUpdate({ currentVersion: VERSION });
      send(res, 200, { ok: true, ...info });
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
        const result = await applyUpdate({ installDir: INSTALL_DIR, dataDir: DATA_DIR, info: { ...info, current: current.version }, log });
        lastResult = result;
        busy = "";
        send(res, 200, { ...result, restart: true });
      } catch (err) {
        busy = "";
        log.error("更新失败", err?.message || err);
        send(res, 500, { ok: false, error: String(err?.message || err) });
      }
      return;
    }
    if (url.pathname === "/__update/status") {
      send(res, 200, { ok: true, busy, lastResult });
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
