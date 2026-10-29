import { readMemos, textResult } from "../lib/store.js";

export async function register(sdk) {
  await sdk.tools.register({
    name: "search_memo",
    description: "在已导入的浮墨笔记中搜索，支持关键词、标签和时间范围筛选。",
    parameters: {
      type: "object",
      properties: {
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
      for (const memo of results) {
        const tags = Array.isArray(memo.tags) && memo.tags.length > 0 ? ` [${memo.tags.join(", ")}]` : "";
        lines.push(`--- ${memo.time}${tags}`);
        lines.push(memo.content);
        lines.push("");
      }
      return textResult(lines.join("\n"));
    },
  });
}
