/**
 * index.js — OpenHanako-flomo v2 入口。
 *
 * v2 的入口就是一个 apply：在这里把工具登记上去，宿主负责在卸载时回收。
 */

import { defineApp } from "./sdk/app-contract/server-client.js";
import { register as registerWriteMemo } from "./tools/write-memo.js";
import { register as registerSearchMemo } from "./tools/search-memo.js";
import { register as registerSetConfig } from "./tools/set-config.js";
import { register as registerImportMemos } from "./tools/import-memos.js";
import { readMemos } from "./lib/store.js";

export default defineApp(async (sdk) => {
  await registerWriteMemo(sdk);
  await registerSearchMemo(sdk);
  await registerSetConfig(sdk);
  await registerImportMemos(sdk);

  // 更新服务：卡片上的“一键更新”直接打 127.0.0.1:47811。
  // 它必须在沙盒外跑（要下载、要写安装目录），所以开一个受管运行时。
  // 起不来也不影响记笔记：卡片会提示“连不上更新服务”。
  const version = sdk.manifest?.version || "";
  try {
    const info = await sdk.runtime.start({
      runtime: "node",
      entry: "runtime/server.mjs",
      profile: "local-machine",
      network: "external",
      args: ["--data", sdk.dataDir, "--port", "47811", "--version", version],
      service: { port: 47811, readyMarker: "FLOMO_RUNTIME_READY", id: "flomo" },
    });
    await sdk.logger.info(`更新服务已启动 ${info.runtimeId}`);
  } catch (err) {
    await sdk.logger.warn(`更新服务没起来：${err?.message || err}`);
  }

  const memos = readMemos(sdk.dataDir);
  await sdk.logger.info(`OpenHanako-flomo 已加载，${memos ? memos.length : 0} 条笔记`);
});
