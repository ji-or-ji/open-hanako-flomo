/**
 * lib/sync.mjs — 从「flomo 网页版的导出」把笔记拉回来。
 *
 * 为什么不直接调接口：flomo 的公开 API 只有写入（Incoming Webhook），读笔记要么走
 * 官方 MCP（MAX 会员 + Token），要么用网页版的「导入导出 → 导出全部笔记」。我们选
 * 后者：用的是你自己那套登录态，不碰 cookie，也不需要额外凭据。
 *
 * 于是这里做的事很朴素——盯着几个常见的下载目录，等那份导出包落盘，然后解压、解析、
 * 合并进本地索引。用户在页面里点一次「导出」，剩下的自动发生。
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseFlomoExport } from "./parse-export.mjs";
import { pickHtmlEntry, unzip } from "./unzip.mjs";

/** 可能落盘的目录，按可能性排序。 */
export function candidateDirs(extra = []) {
  const home = homedir();
  const dirs = [
    join(home, "Downloads"),
    join(home, "Desktop"),
    join(home, "Documents"),
    join(home, "桌面"),
    join(home, "下载"),
    ...extra,
  ];
  return [...new Set(dirs)].filter((d) => {
    try {
      return existsSync(d) && statSync(d).isDirectory();
    } catch {
      return false;
    }
  });
}

function isExportish(name) {
  return /\.(zip|html?)$/i.test(name);
}

/** 在候选目录里找 sinceMs 之后出现/变动过的候选文件，最新的排前面。 */
export function findRecentCandidates(dirs, sinceMs) {
  const hits = [];
  for (const dir of dirs) {
    let names = [];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!isExportish(name)) continue;
      const path = join(dir, name);
      try {
        const st = statSync(path);
        if (!st.isFile()) continue;
        if (st.mtimeMs + 1000 < sinceMs) continue;
        hits.push({ path, name, size: st.size, mtimeMs: st.mtimeMs });
      } catch {
        /* 正在写入或已删除，下次再说 */
      }
    }
  }
  return hits.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/** 读一份导出（zip 或 html），返回 memo 数组；不是 flomo 导出就返回空数组。 */
export function parseExportFile(path) {
  const bytes = readFileSync(path);
  let html;
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const entry = pickHtmlEntry(unzip(bytes));
    if (!entry) return [];
    html = entry.content.toString("utf8");
  } else {
    html = bytes.toString("utf8");
  }
  if (!/class="memo"/.test(html)) return [];
  return parseFlomoExport(html);
}

/** 解析出的笔记合并进已有索引（按 id 去重；id 换了但时间+正文相同的也当同一条）。 */
export function mergeIntoExisting(parsed, existing) {
  const known = new Set(existing.map((m) => m.id));
  const fingerprint = (m) => `${m.time}\u0000${m.content}`;
  const knownPrint = new Set(existing.map(fingerprint));
  const added = parsed.filter((m) => !known.has(m.id) && !knownPrint.has(fingerprint(m)));
  const merged = [...existing, ...added].sort((a, b) => String(b.time).localeCompare(String(a.time)));
  return { added, merged };
}
