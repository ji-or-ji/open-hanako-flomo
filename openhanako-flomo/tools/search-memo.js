import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readMemos, textResult } from "../lib/store.js";

/** 卡片上的编号（#12）到底指哪条，存在 dataDir/numbers.json 里。 */
function readNumbers(dataDir) {
  try {
    return JSON.parse(readFileSync(join(dataDir, "numbers.json"), "utf8")) || {};
  } catch {
    return {};
  }
}

export async function register(sdk) {
  await sdk.tools.register({
    name: "search_memo",
    description:
      "在已导入的浮墨笔记中搜索，支持关键词、标签、时间范围；也可以直接传编号获取某一条全文（卡片上显示的 #12 就是这个编号）。",
    parameters: {
      type: "object",
      properties: {
        no: { type: "number", description: "笔记编号（引用时看到的 #12 里的 12），传了就直接返回那一条全文" },
        query: { type: "string", description: "搜索关键词，匹配笔记正文与标签" },
        tag: { type: "string", description: "按标签筛选，如 镜片、镜片/1。留空则不限制" },
        from: { type: "string", description: "起始日期，格式 YYYY-MM-DD。留空则不限制" },
        to: { type: "string", description: "结束日期，格式 YYYY-MM-DD。留空则不限制" },
        limit: { type: "number", description: "返回结果数量上限，默认 20" },
      },
    },
    sessionPermission: { readOnly: true },
    execute: async (args) => {
      const memos = readMemos(sdk.dataDir);
      if (memos === null) {
        return textResult("还没有导入任何笔记。先把 flomo 导出的 .zip 或 .html 发给我，用 import_memos 导入。");
      }
      if (memos.length === 0) {
        return textResult("笔记库为空，请先导入 flomo 导出文件。");
      }

      const query = (args?.query || "").trim().toLowerCase();
      const wantNo = Number(args?.no) || 0;
      if (wantNo) {
        const numbers = readNumbers(sdk.dataDir);
        const hit = memos.find((m) => numbers[m.id] === wantNo);
        if (!hit) return textResult(`没有编号 #${wantNo} 的笔记。`);
        const tags = Array.isArray(hit.tags) && hit.tags.length ? ` [${hit.tags.join(", ")}]` : "";
        return textResult(`#${wantNo} · ${hit.time}${tags}\n\n${hit.content}`);
      }
      const tagFilter = (args?.tag || "").trim();
      const from = args?.from || "";
      const to = args?.to || "";
      const limit = Math.min(Math.max(Number(args?.limit) || 20, 1), 200);

      let results = memos;
      if (query) {
        results = results.filter((m) =>
          String(m.content || "").toLowerCase().includes(query)
          || (Array.isArray(m.tags) && m.tags.some((t) => String(t).toLowerCase().includes(query))));
      }
      if (tagFilter) {
        results = results.filter((m) =>
          Array.isArray(m.tags) && m.tags.some((t) => t === tagFilter || String(t).startsWith(`${tagFilter}/`)));
      }
      if (from) results = results.filter((m) => String(m.time) >= from);
      if (to) results = results.filter((m) => String(m.time) <= `${to} 23:59:59`);

      results.sort((a, b) => String(b.time).localeCompare(String(a.time)));
      const total = results.length;
      results = results.slice(0, limit);

      if (results.length === 0) return textResult("未找到匹配的笔记。");

      const lines = [`找到 ${total} 条匹配笔记，显示前 ${results.length} 条：`, ""];
      const numbers = readNumbers(sdk.dataDir);
      for (const memo of results) {
        const tags = Array.isArray(memo.tags) && memo.tags.length > 0 ? ` [${memo.tags.join(", ")}]` : "";
        const no = numbers[memo.id] ? `#${numbers[memo.id]} ` : "";
        lines.push(`--- ${no}${memo.time}${tags}`);
        lines.push(memo.content);
        lines.push("");
      }
      return textResult(lines.join("\n"));
    },
  });
}
