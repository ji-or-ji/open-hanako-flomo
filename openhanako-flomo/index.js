/**
 * index.js — OpenHanako-flomo v2 入口。
 *
 * 这里是 App 的“后端”：登记工具、把 webhook 落到运行时能读的文件里、把卡片上的
 * 「引用」投递进会话。卡片页面的数据和动作都走 127.0.0.1:47811 那个受管运行时
 * （它才能碰文件系统和下载目录）。
 */

import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineApp } from "./sdk/app-contract/server-client.js";
import { register as registerWriteMemo } from "./tools/write-memo.js";
import { register as registerSearchMemo } from "./tools/search-memo.js";
import { register as registerSetConfig } from "./tools/set-config.js";
import { register as registerImportMemos } from "./tools/import-memos.js";
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

/** 运行时按文件读 webhook：改配置后立刻生效，不用重启运行时。 */

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

export default defineApp(async (sdk) => {
  await registerWriteMemo(sdk);
  await registerSearchMemo(sdk);
  await registerSetConfig(sdk);
  await registerImportMemos(sdk);

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

  const memos = readMemos(sdk.dataDir);
  await sdk.logger.info(`OpenHanako-flomo 已加载，${memos ? memos.length : 0} 条笔记`);
});
