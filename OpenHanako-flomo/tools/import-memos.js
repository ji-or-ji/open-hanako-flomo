/**
 * import_memos tool
 * 导入 flomo 导出数据。支持：
 * 1. 拖入 .zip 后 Hanako 解压的文件夹路径（推荐）
 * 2. 直接传入 .html 文件路径
 * 3. 直接粘贴 HTML 内容
 */

import { readFileSync, existsSync, writeFileSync, readdirSync, statSync, mkdirSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { execSync } from "node:child_process";
import { parseFlomoExport } from "../lib/parse-export.js";

export const name = "import_memos";
export const description = "导入 flomo 导出数据：支持直接把解压后的文件夹路径传进来，"
  + "自动找到里面的 .html 文件并解析。也支持传入单个 .html 文件路径。";
export const parameters = {
  type: "object",
  properties: {
    sourcePath: {
      type: "string",
      description: "flomo 导出数据的路径。可以是："
        + "1）直接把 .zip 文件路径传进来，插件会自动解压；"
        + "2）拖入 .zip 后 Hanako 自动解压得到的文件夹路径；"
        + "3）解压后里面的 .html 文件路径。"
        + "插件会自动查找 .html 文件。"
    },
    htmlContent: {
      type: "string",
      description: "flomo 导出 .html 文件的完整内容（备用，当不方便提供路径时用）"
    }
  }
};

export async function execute(input, toolCtx) {
  let html = "";

  if (input.sourcePath) {
    const srcPath = input.sourcePath.trim();
    if (!existsSync(srcPath)) {
      return `路径不存在：${srcPath}`;
    }

    const stat = statSync(srcPath);
    let actualHtmlPath = null;

    if (stat.isDirectory()) {
      // 在目录中查找 .html 文件
      const htmlFiles = findHtmlFiles(srcPath);
      if (htmlFiles.length === 0) {
        return `在目录中未找到 .html 文件：${srcPath}\n请确认文件已完整解压，或直接传入 .html 文件路径。`;
      }
      if (htmlFiles.length > 1) {
        return `找到多个 .html 文件，请指定具体文件路径：\n${htmlFiles.join("\n")}`;
      }
      actualHtmlPath = htmlFiles[0];
    } else if (stat.isFile() && srcPath.toLowerCase().endsWith(".zip")) {
      // 直接处理 .zip 文件：解压到临时目录
      const extractDir = join(toolCtx.dataDir, "extracted", basename(srcPath, ".zip"));
      mkdirSync(extractDir, { recursive: true });
      try {
        execSync(`unzip -o "${srcPath}" -d "${extractDir}"`, { stdio: "pipe" });
      } catch (err) {
        return `解压 .zip 失败：${err.message}`;
      }
      const htmlFiles = findHtmlFiles(extractDir);
      if (htmlFiles.length === 0) {
        return `在 .zip 中未找到 .html 文件。请确认导出的 .zip 来自 flomo。`;
      }
      if (htmlFiles.length > 1) {
        return `在 .zip 中找到多个 .html 文件：\n${htmlFiles.join("\n")}\n请用 sourcePath 指定具体路径。`;
      }
      actualHtmlPath = htmlFiles[0];
    } else if (stat.isFile()) {
      actualHtmlPath = srcPath;
    }

    if (!actualHtmlPath) {
      return `不支持的文件类型：${srcPath}`;
    }

    try {
      html = readFileSync(actualHtmlPath, "utf-8");
    } catch (err) {
      return `读取文件失败（${actualHtmlPath}）：${err.message}`;
    }
  } else if (input.htmlContent) {
    html = input.htmlContent;
  } else {
    return "请提供 flomo 导出数据。支持：\n"
      + "1. 直接把 flomo 导出的 .zip 拖入输入框（Hanako 会自动解压），把得到的文件夹路径传给我\n"
      + "2. 传入 .html 文件路径\n"
      + "3. 粘贴 HTML 内容";
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

/**
 * 在目录中递归查找 .html 文件（只查一层子目录）
 */
function findHtmlFiles(dir) {
  const results = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".html")) {
        results.push(join(dir, entry.name));
      } else if (entry.isDirectory()) {
        // 只查一层子目录
        try {
          const subEntries = readdirSync(join(dir, entry.name), { withFileTypes: true });
          for (const sub of subEntries) {
            if (sub.isFile() && sub.name.endsWith(".html")) {
              results.push(join(dir, entry.name, sub.name));
            }
          }
        } catch { /* 跳过无法读取的子目录 */ }
      }
    }
  } catch { /* 跳过无法读取的目录 */ }
  return results;
}
