import { basename } from "node:path";
import { parseFlomoExport } from "../lib/parse-export.js";
import { pickHtmlEntry, unzip } from "../lib/unzip.mjs";
import { readMemos, textResult, writeMemos } from "../lib/store.js";

function extractContent(result) {
  if (result == null) return null;
  if (typeof result === "string") return result;
  if (Buffer.isBuffer(result)) return result;
  if (result instanceof Uint8Array) return Buffer.from(result);
  if (typeof result.content === "string") return result.content;
  if (result.content instanceof Uint8Array) return Buffer.from(result.content);
  if (Buffer.isBuffer(result.content)) return result.content;
  if (typeof result.text === "string") return result.text;
  return null;
}

function normalizeEntries(result) {
  const list = Array.isArray(result) ? result : Array.isArray(result?.entries) ? result.entries : [];
  return list
    .map((entry) => {
      if (typeof entry === "string") return { name: basename(entry), path: entry };
      const name = entry?.name || entry?.basename || "";
      const path = entry?.path || entry?.fullPath || entry?.filePath || "";
      const isDir = entry?.kind === "directory" || entry?.type === "directory" || entry?.isDirectory === true;
      return { name: String(name), path: String(path || name), isDir };
    })
    .filter((entry) => entry.name);
}

async function readBytes(sdk, path) {
  const result = await sdk.resources.read({ kind: "local-file", path });
  const content = extractContent(result);
  if (content == null) throw new Error("宿主没有返回文件内容");
  return typeof content === "string" ? Buffer.from(content, "utf8") : content;
}

function looksLikeZip(buf) {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b;
}

/** 把 sourcePath 拆成 html 文本；失败时抛带人话的错。 */
async function loadHtmlFromPath(sdk, sourcePath) {
  let bytes;
  try {
    bytes = await readBytes(sdk, sourcePath);
  } catch (err) {
    // 不是文件，按目录试一次
    let entries = [];
    try {
      entries = normalizeEntries(await sdk.resources.list({ kind: "local-file", path: sourcePath }));
    } catch {
      throw new Error(`读不到这个路径：${sourcePath}（${err?.message || err}）`);
    }
    const htmls = entries.filter((e) => !e.isDir && /\.html?$/i.test(e.name));
    const zips = entries.filter((e) => !e.isDir && /\.zip$/i.test(e.name));
    if (htmls.length === 1) return loadHtmlFromPath(sdk, htmls[0].path);
    if (htmls.length > 1) throw new Error(`目录里有多个 .html，请指定具体的那个：\n${htmls.map((e) => e.path).join("\n")}`);
    if (zips.length === 1) return loadHtmlFromPath(sdk, zips[0].path);
    if (zips.length > 1) throw new Error(`目录里有多个 .zip，请指定具体的那个：\n${zips.map((e) => e.path).join("\n")}`);
    throw new Error(`这个目录里没找到 flomo 导出的 .html 或 .zip：${sourcePath}`);
  }

  if (looksLikeZip(bytes)) {
    const html = pickHtmlEntry(unzip(bytes));
    if (!html) throw new Error("zip 里没找到唯一一份 .html，请直接告诉我 html 文件路径");
    return html.content.toString("utf8");
  }
  return bytes.toString("utf8");
}

export async function register(sdk) {
  await sdk.tools.register({
    name: "import_memos",
    description:
      "导入 flomo 导出数据：可以直接传 .zip 文件路径、解压后的文件夹路径、单个 .html 文件路径，"
      + "或者把 HTML 内容整段贴进来。重复导入时按 id 去重。",
    parameters: {
      type: "object",
      properties: {
        sourcePath: {
          type: "string",
          description: "flomo 导出数据的路径：.zip 文件、解压后的文件夹、或其中的 .html 文件",
        },
        htmlContent: {
          type: "string",
          description: "flomo 导出 .html 文件的完整内容（不方便给路径时用）",
        },
      },
    },
    sessionPermission: { readOnly: true },
    execute: async (args) => {
      let html = "";

      if (typeof args?.sourcePath === "string" && args.sourcePath.trim()) {
        try {
          html = await loadHtmlFromPath(sdk, args.sourcePath.trim());
        } catch (err) {
          return textResult(`导入失败：${err?.message || err}`);
        }
      } else if (typeof args?.htmlContent === "string" && args.htmlContent.trim()) {
        html = args.htmlContent;
      } else {
        return textResult(
          "请提供 flomo 导出数据：\n"
          + "1. 把导出的 .zip 拖进对话，把文件路径给我\n"
          + "2. 给我解压后的文件夹或 .html 路径\n"
          + "3. 直接把 HTML 内容贴进来",
        );
      }

      if (!html.trim()) return textResult("HTML 内容为空。");

      let parsed;
      try {
        parsed = parseFlomoExport(html);
      } catch (err) {
        return textResult(`解析 HTML 失败：${err?.message || err}`);
      }
      if (parsed.length === 0) return textResult("未在 HTML 中找到任何笔记。请确认文件是 flomo 导出的格式。");

      const existing = readMemos(sdk.dataDir) || [];
      const known = new Set(existing.map((m) => m.id));
      const added = parsed.filter((m) => !known.has(m.id));
      const merged = [...existing, ...added].sort((a, b) => String(b.time).localeCompare(String(a.time)));
      writeMemos(sdk.dataDir, merged);

      const tagSet = new Set();
      for (const memo of merged) for (const tag of memo.tags || []) tagSet.add(tag);

      const lines = [
        "导入完成！",
        `- 本次解析：${parsed.length} 条笔记`,
        `- 新增：${added.length} 条`,
        `- 已有（跳过）：${existing.length} 条`,
        `- 总计：${merged.length} 条笔记`,
        `- 标签数：${tagSet.size} 个`,
        "",
      ];
      if (tagSet.size > 0) {
        lines.push("标签列表：");
        for (const tag of [...tagSet].sort()) lines.push(`  #${tag}`);
      }
      return textResult(lines.join("\n"));
    },
  });
}
