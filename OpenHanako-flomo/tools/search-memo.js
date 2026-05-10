/**
 * search-memo tool
 * 在已导入的 flomo 笔记中搜索
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const name = "search_memo";
export const description = "在已导入的浮墨笔记中搜索，支持关键词、标签和时间范围筛选。";
export const parameters = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "搜索关键词，匹配笔记正文"
    },
    tag: {
      type: "string",
      description: "按标签筛选，如 镜片、镜片/1。留空则不限制"
    },
    from: {
      type: "string",
      description: "起始日期，格式 YYYY-MM-DD。留空则不限制"
    },
    to: {
      type: "string",
      description: "结束日期，格式 YYYY-MM-DD。留空则不限制"
    },
    limit: {
      type: "number",
      description: "返回结果数量上限，默认 20"
    }
  }
};

export async function execute(input, toolCtx) {
  const memosPath = join(toolCtx.dataDir, "memos.json");

  if (!existsSync(memosPath)) {
    return "尚未导入任何笔记。请在 Flomo 插件设置页中导入 flomo 的导出文件。";
  }

  let memos;
  try {
    const raw = readFileSync(memosPath, "utf-8");
    memos = JSON.parse(raw);
  } catch {
    return "笔记数据文件损坏，请重新导入。";
  }

  if (!Array.isArray(memos) || memos.length === 0) {
    return "笔记库为空，请先导入 flomo 导出文件。";
  }

  const query = (input.query || "").trim().toLowerCase();
  const tagFilter = (input.tag || "").trim();
  const from = input.from || "";
  const to = input.to || "";
  const limit = Math.min(Math.max(input.limit || 20, 1), 200);

  let results = memos;

  // 按关键词搜索
  if (query) {
    results = results.filter(m =>
      m.content.toLowerCase().includes(query) ||
      m.tags.some(t => t.toLowerCase().includes(query))
    );
  }

  // 按标签筛选
  if (tagFilter) {
    results = results.filter(m =>
      m.tags.some(t => t === tagFilter || t.startsWith(tagFilter + "/"))
    );
  }

  // 按时间范围筛选
  if (from) {
    results = results.filter(m => m.time >= from);
  }
  if (to) {
    results = results.filter(m => m.time <= to + " 23:59:59");
  }

  // 按时间倒序排列
  results.sort((a, b) => b.time.localeCompare(a.time));

  const total = results.length;
  results = results.slice(0, limit);

  if (results.length === 0) {
    return "未找到匹配的笔记。";
  }

  const lines = [`找到 ${total} 条匹配笔记，显示前 ${results.length} 条：`, ""];
  for (const memo of results) {
    const tags = memo.tags.length > 0 ? ` [${memo.tags.join(", ")}]` : "";
    lines.push(`--- ${memo.time}${tags}`);
    lines.push(memo.content);
    lines.push("");
  }

  return lines.join("\n");
}
