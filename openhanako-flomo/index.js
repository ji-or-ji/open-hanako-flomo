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

  const memos = readMemos(sdk.dataDir);
  await sdk.logger.info(`OpenHanako-flomo 已加载，${memos ? memos.length : 0} 条笔记`);
});
