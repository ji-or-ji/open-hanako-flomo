/**
 * lib/store.js — 导入后的笔记索引，落在插件自己的 dataDir 里。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function memosPath(dataDir) {
  return join(dataDir, "memos.json");
}

export function readMemos(dataDir) {
  const path = memosPath(dataDir);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeMemos(dataDir, memos) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(memosPath(dataDir), JSON.stringify(memos, null, 2), "utf-8");
}

export function textResult(text) {
  return { content: [{ type: "text", text }] };
}
