/**
 * index.js — OpenHanako-flomo v2 入口。
 *
 * 这里是 App 的“后端”：登记工具、把 webhook 落到运行时能读的文件里、把卡片上的
 * 「引用 / MCP 操作」投递进会话或交给 MCP。卡片页面的数据和动作都走 127.0.0.1:47811
 * 那个受管运行时（它才能碰文件系统和下载目录）。
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineApp } from "./sdk/app-contract/server-client.js";
import { register as registerWriteMemo } from "./tools/write-memo.js";
import { register as registerSearchMemo } from "./tools/search-memo.js";
import { register as registerSetConfig } from "./tools/set-config.js";
import { register as registerImportMemos } from "./tools/import-memos.js";
import { register as registerMcp } from "./tools/mcp.js";
import { describeError, connect } from "./tools/mcp.js";
import { resolveWebhook, writeWebhookFile } from "./lib/config.js";
import { readMemos } from "./lib/store.js";

const RUNTIME_PORT = 47811;

/** sdk 上没挂 manifest，版本号自己从安装目录里读。 */
function readVersion() {
  try {
    return JSON.parse(readFileSync(fileURLToPath(new URL("./manifest.json", import.meta.url)), "utf8")).version || "";
  } catch {
    return "";
  }
}

function writeJson(path, data) {
  try {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
  } catch {
    /* 写不进去就算了 */
  }
}

/** 卡片点了「引用」→ 运行时落一个队列文件 → 这里取走并发进会话。 */
function startQuoteDrain(sdk) {
  const dir = join(sdk.dataDir, "quote-queue");
  let running = false;

  const drain = async () => {
    if (running) return;
    running = true;
    try {
      let names = [];
      try {
        names = readdirSync(dir).filter((n) => n.endsWith(".json")).sort();
      } catch {
        names = [];
      }
      for (const name of names.slice(0, 8)) {
        const path = join(dir, name);
        let item = null;
        try {
          item = JSON.parse(readFileSync(path, "utf8"));
        } catch {
          rmSync(path, { force: true });
          continue;
        }
        try {
          const target = {};
          if (item.sessionPath) target.sessionPath = item.sessionPath;
          if (item.sessionId) target.sessionId = item.sessionId;
          await sdk.sessions.send({ ...target, text: item.text });
          await sdk.logger.info(`引用已投递：${String(item.text).slice(0, 24)}…`);
        } catch (err) {
          await sdk.logger.warn(`引用投递失败：${err?.message || err}`);
        }
        rmSync(path, { force: true });
      }
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void drain(), 1500);
  timer.unref?.();
  return () => clearInterval(timer);
}

/** 从 MCP 的工具输出里尽量抠出一个笔记 id（不同实现长得不一样）。 */
function guessNoteId(text) {
  const patterns = [
    /"id"\s*:\s*"([^"]{6,64})"/,
    /\bid\s*[:=]\s*([A-Za-z0-9_-]{6,64})/,
    /\bmemo[_-]?id["':\s]+([A-Za-z0-9_-]{6,64})/i,
  ];
  for (const re of patterns) {
    const m = String(text || "").match(re);
    if (m) return m[1];
  }
  return "";
}

/**
 * 卡片发来的 MCP 操作（探针 / 搜索 / 新建 / 修改）。
 *
 * 为什么绕一圈文件：卡片在浏览器沙箱里，既没有 Token 也发不出去；后端有 config 和网络，
 * 但拿不到卡片的点击。两边用 dataDir 下的队列交接，谁都不越界。
 */
function startMcpDrain(sdk) {
  const dir = join(sdk.dataDir, "mcp-queue");
  const resultDir = join(sdk.dataDir, "mcp-results");
  let running = false;
  let cached = null;

  const getConn = async () => {
    if (cached) return cached;
    cached = await connect(sdk);
    return cached;
  };

  const handle = async (op, payload) => {
    const { client, tools, picked } = await getConn();
    if (op === "probe") {
      return {
        ok: true,
        url: client.url,
        server: client.serverInfo || null,
        protocol: client.protocolVersion,
        tools: tools.map((t) => ({ name: t.name, description: String(t.description || "").slice(0, 200) })),
        picked,
      };
    }
    if (op === "create") {
      if (!picked.create) return { ok: false, error: "MCP 里没有新建工具" };
      const text = String(payload?.text || "").trim();
      if (!text) return { ok: false, error: "正文为空" };
      const res = await client.callTool(picked.create, { content: text, text, markdown: text });
      return { ok: true, tool: picked.create, raw: res };
    }
    if (op === "search") {
      if (!picked.search) return { ok: false, error: "MCP 里没有搜索工具" };
      const q = String(payload?.query || "").trim();
      const res = await client.callTool(picked.search, { query: q, keyword: q, q, limit: Number(payload?.limit) || 20 });
      return { ok: true, tool: picked.search, raw: res };
    }
    if (op === "update") {
      if (!picked.update) return { ok: false, error: "MCP 里没有修改工具" };
      const text = String(payload?.text || "").trim();
      if (!text) return { ok: false, error: "新正文为空" };
      let id = String(payload?.id || "").trim();
      if (!id) {
        // 本地索引里的 id 是我们自己生成的，跟 flomo 线上不是一回事；
        // 只能用原文前缀搜一次，再从返回里猜它的线上 id。
        const hint = String(payload?.hint || text).slice(0, 24);
        if (!picked.search) return { ok: false, error: "没有线上 id，MCP 里又没有搜索工具，改不了" };
        const found = await client.callTool(picked.search, { query: hint, keyword: hint, q: hint, limit: 5 });
        const flat = JSON.stringify(found);
        id = guessNoteId(flat);
        if (!id) return { ok: false, error: "搜索没返回可识别的笔记 id", raw: found };
      }
      const res = await client.callTool(picked.update, { id, content: text, text, markdown: text });
      return { ok: true, tool: picked.update, id, raw: res };
    }
    return { ok: false, error: `不认识的 op：${op}` };
  };

  const drain = async () => {
    if (running) return;
    running = true;
    try {
      let names = [];
      try {
        names = readdirSync(dir).filter((n) => n.endsWith(".json")).sort();
      } catch {
        names = [];
      }
      for (const name of names.slice(0, 4)) {
        const path = join(dir, name);
        let req = null;
        try {
          req = JSON.parse(readFileSync(path, "utf8"));
        } catch {
          rmSync(path, { force: true });
          continue;
        }
        mkdirSync(resultDir, { recursive: true });
        let result;
        try {
          result = await handle(req.op, req.payload || {});
        } catch (err) {
          result = { ok: false, error: describeError(err) };
        }
        writeJson(join(resultDir, `${req.id}.json`), { id: req.id, ...result, at: Date.now() });
        rmSync(path, { force: true });
      }
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void drain(), 900);
  timer.unref?.();
  return () => clearInterval(timer);
}

/** 把 MCP 是否可用写成文件，卡片读它决定按钮走哪条路。 */
async function writeMcpStatus(sdk) {
  let status = { configured: false };
  try {
    const token = await sdk.config.get("mcpToken");
    status = { configured: Boolean(typeof token === "string" && token.trim()) };
    if (status.configured) {
      const { tools, picked } = await connect(sdk);
      status.tools = tools.map((t) => t.name);
      status.picked = picked;
    }
  } catch (err) {
    status = { configured: true, error: describeError(err) };
  }
  writeJson(join(sdk.dataDir, "mcp-status.json"), { ...status, at: Date.now() });
}

export default defineApp(async (sdk) => {
  await registerWriteMemo(sdk);
  await registerSearchMemo(sdk);
  await registerSetConfig(sdk);
  await registerImportMemos(sdk);
  await registerMcp(sdk);

  writeWebhookFile(sdk.dataDir, await resolveWebhook(sdk));

  const version = readVersion();
  try {
    const info = await sdk.runtime.start({
      runtime: "node",
      entry: "runtime/server.mjs",
      profile: "local-machine",
      network: "external",
      args: ["--data", sdk.dataDir, "--port", String(RUNTIME_PORT), "--version", version],
      service: { port: RUNTIME_PORT, readyMarker: "FLOMO_RUNTIME_READY", id: "flomo" },
    });
    await sdk.logger.info(`本地服务已启动 ${info.runtimeId}`);
  } catch (err) {
    await sdk.logger.warn(`本地服务没起来：${err?.message || err}`);
  }

  startQuoteDrain(sdk);
  startMcpDrain(sdk);
  void writeMcpStatus(sdk);

  const memos = readMemos(sdk.dataDir);
  await sdk.logger.info(`OpenHanako-flomo 已加载，${memos ? memos.length : 0} 条笔记`);
});
