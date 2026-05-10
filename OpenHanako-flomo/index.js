/**
 * index.js - OpenHanako-flomo 生命周期入口
 *
 * 职责：
 * - 启动时加载已有的 memo 索引到缓存
 * - 提供 bus handler 供 routes 和 tools 查询 memo 数据
 * - 管理定时刷新（后续可做自动同步）
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const MEMOS_FILENAME = "memos.json";
const CONFIG_FILENAME = "config.json";
let memoCache = [];

export default class OpenHanakoFlomoPlugin {
  async onload() {
    const ctx = this.ctx;
    const dataDir = ctx.dataDir;

    // 确保 dataDir 存在
    mkdirSync(dataDir, { recursive: true });

    // 加载已有 memo 索引
    this._loadMemos();

    // 注册 bus handler，供 routes 查询 memo 数据
    if (ctx.bus.handle) {
      this.register(ctx.bus.handle("openhanako-flomo:get-memos", async () => {
        return { memos: memoCache };
      }));

      this.register(ctx.bus.handle("openhanako-flomo:refresh-memos", async () => {
        this._loadMemos();
        return { count: memoCache.length };
      }));

      this.register(ctx.bus.handle("openhanako-flomo:save-memos", async (payload) => {
        if (!payload || !Array.isArray(payload.memos)) {
          return { ok: false, error: "无效的 memo 数据" };
        }
        this._saveMemos(payload.memos);
        return { ok: true, count: memoCache.length };
      }));
    }

    ctx.log.info(`OpenHanako-flomo 已加载，当前 ${memoCache.length} 条笔记`);
  }

  onunload() {
    memoCache = [];
    this.ctx.log.info("OpenHanako-flomo 已卸载");
  }

  _loadMemos() {
    const memosPath = join(this.ctx.dataDir, MEMOS_FILENAME);
    if (existsSync(memosPath)) {
      try {
        const raw = readFileSync(memosPath, "utf-8");
        memoCache = JSON.parse(raw);
        if (!Array.isArray(memoCache)) memoCache = [];
      } catch (err) {
        this.ctx.log.error("加载 memo 索引失败:", err.message);
        memoCache = [];
      }
    }
  }

  _saveMemos(memos) {
    const memosPath = join(this.ctx.dataDir, MEMOS_FILENAME);
    memoCache = Array.isArray(memos) ? memos : [];
    writeFileSync(memosPath, JSON.stringify(memoCache, null, 2), "utf-8");
  }
}
