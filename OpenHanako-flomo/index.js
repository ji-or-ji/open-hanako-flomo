/**
 * index.js - OpenHanako-flomo 生命周期入口
 *
 * 职责：
 * - 启动时加载已有的 memo 索引
 */

import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export default class OpenHanakoFlomoPlugin {
  async onload() {
    const ctx = this.ctx;
    mkdirSync(ctx.dataDir, { recursive: true });

    // 检查已有的 memo 索引
    const memosPath = join(ctx.dataDir, "memos.json");
    let count = 0;
    if (existsSync(memosPath)) {
      try {
        const raw = readFileSync(memosPath, "utf-8");
        const memos = JSON.parse(raw);
        if (Array.isArray(memos)) count = memos.length;
      } catch { /* 忽略 */ }
    }

    ctx.log.info(`OpenHanako-flomo 已加载，${count} 条笔记`);
  }

  onunload() {
    this.ctx.log.info("OpenHanako-flomo 已卸载");
  }
}
