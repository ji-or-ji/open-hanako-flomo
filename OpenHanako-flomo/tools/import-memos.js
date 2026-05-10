/**
 * import_memos tool
 * 导入 flomo 导出 HTML 文件，解析并建立搜索索引
 */

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseFlomoExport } from "../lib/parse-export.js";

export const name = "import_memos";
export const description = "导入 flomo 的导出 HTML 文件，解析笔记并建立本地搜索索引。"
  + "调用前需要用户提供 flomo 导出的 .html 文件路径。";
export const parameters = {
  type: "object",
  properties: {
    htmlPath: {
      type: "string",
      description: "flomo 导出 .html 文件的完整路径。如：D:/path/to/export.html"
    },
    htmlContent: {
      type: "string",
      description: "flomo 导出 .html 文件的完整内容（如果文件路径不方便提供，可粘贴内容）"
    }
  }
};

export async function execute(input, toolCtx) {
  let html = "";

  if (input.htmlPath) {
    const filePath = input.htmlPath.trim();
    if (!existsSync(filePath)) {
      return `文件不存在：${filePath}`;
    }
    try {
      html = readFileSync(filePath, "utf-8");
    } catch (err) {
      return `读取文件失败：${err.message}`;
    }
  } else if (input.htmlContent) {
    html = input.htmlContent;
  } else {
    return "请提供 flomo 导出 .html 文件的路径（htmlPath）。";
  }

  if (!html.trim()) {
    return "HTML 内容为空。";
  }

  let memos;
  try {
    memos = parseFlomoExport(html);
  } catch (err) {
    return `解析 HTML 失败：${err.message}`;
  }

  if (memos.length === 0) {
    return "未在 HTML 中找到任何笔记。请确认文件是 flomo 导出的格式。";
  }

  const memosPath = join(toolCtx.dataDir, "memos.json");
  let existing = [];
  if (existsSync(memosPath)) {
    try {
      existing = JSON.parse(readFileSync(memosPath, "utf-8"));
    } catch { /* 忽略 */ }
  }

  const existingIds = new Set(existing.map(m => m.id));
  const newMemos = memos.filter(m => !existingIds.has(m.id));
  const merged = [...existing, ...newMemos];

  merged.sort((a, b) => b.time.localeCompare(a.time));

  writeFileSync(memosPath, JSON.stringify(merged, null, 2), "utf-8");

  const tagSet = new Set();
  for (const m of merged) {
    for (const t of m.tags) tagSet.add(t);
  }

  const lines = [
    `导入完成！`,
    `- 本次解析：${memos.length} 条笔记`,
    `- 新增：${newMemos.length} 条`,
    `- 已有（跳过）：${existing.length} 条`,
    `- 总计：${merged.length} 条笔记`,
    `- 标签数：${tagSet.size} 个`,
    "",
  ];

  if (tagSet.size > 0) {
    lines.push("标签列表：");
    const sortedTags = [...tagSet].sort();
    sortedTags.forEach(t => lines.push(`  #${t}`));
  }

  return lines.join("\n");
}
