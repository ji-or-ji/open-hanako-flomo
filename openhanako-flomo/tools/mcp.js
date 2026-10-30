/**
 * tools/mcp.js — 让 Agent 直接用 flomo 官方 MCP（读、搜、写、改）。
 *
 * 走的是 https://flomoapp.com/mcp，认证用设置里的 mcpToken。
 * 工具名不硬编码：每次先 tools/list，再按名字挑 search / create / update；
 * 设置里可以显式指定，猜不到就如实说“这个 MCP 没有对应工具”。
 */

import { FlomoMcp, McpError, pickTools, toolOutcome } from "../lib/mcp.mjs";
import { textResult } from "../lib/store.js";

async function readMcpConfig(sdk) {
  const get = async (key, fallback = "") => {
    try {
      const v = await sdk.config.get(key);
      return typeof v === "string" && v.trim() ? v.trim() : fallback;
    } catch {
      return fallback;
    }
  };
  return {
    token: await get("mcpToken"),
    url: await get("mcpUrl", "https://flomoapp.com/mcp"),
    search: await get("mcpToolSearch"),
    create: await get("mcpToolCreate"),
    update: await get("mcpToolUpdate"),
  };
}

export async function connect(sdk) {
  const cfg = await readMcpConfig(sdk);
  const client = new FlomoMcp({ url: cfg.url, token: cfg.token });
  const tools = await client.ready();
  return { client, tools, picked: pickTools(tools, cfg) };
}

export function describeError(err) {
  if (err instanceof McpError) return err.message;
  return String(err?.message || err);
}

export async function register(sdk) {
  await sdk.tools.register({
    name: "flomo_mcp",
    description:
      "通过 flomo 官方 MCP 直接操作浮墨笔记：探测连接、搜索、新建、修改。"
      + "需要先在设置里填 MCP Token（网页版 → 设置 → MCP / API → Token 授权模式）。"
      + "action=probe 会列出这个 MCP 实际提供了哪些工具。",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["probe", "search", "create", "update"],
          description: "probe 探测并列出工具；search 搜索；create 新建；update 修改",
        },
        query: { type: "string", description: "search 的关键词" },
        text: { type: "string", description: "create 的正文；update 的新正文" },
        id: { type: "string", description: "update 时要改的那条笔记 id（MCP 返回里带的那个）" },
        limit: { type: "number", description: "search 返回条数上限" },
      },
      required: ["action"],
    },
    execute: async (args) => {
      const action = String(args?.action || "").trim();
      let conn;
      try {
        conn = await connect(sdk);
      } catch (err) {
        return textResult(`MCP 连不上：${describeError(err)}\n\n检查：设置 → 扩展 → OpenHanako-flomo → MCP Token。`);
      }
      const { client, tools, picked } = conn;

      if (action === "probe") {
        const lines = [
          `MCP 已连上：${client.url}`,
          `服务端：${client.serverInfo?.name || "?"} ${client.serverInfo?.version || ""}`.trim(),
          `协议：${client.protocolVersion}`,
          "",
          `共 ${tools.length} 个工具：`,
        ];
        for (const t of tools) {
          lines.push(`· ${t.name}${t.description ? ` —— ${String(t.description).split("\n")[0].slice(0, 80)}` : ""}`);
        }
        lines.push("", "我的猜测：");
        lines.push(`  搜索 -> ${picked.search || "（没猜出来）"}`);
        lines.push(`  新建 -> ${picked.create || "（没猜出来）"}`);
        lines.push(`  修改 -> ${picked.update || "（没猜出来）"}`);
        const withSchema = tools.filter((t) => t.inputSchema?.properties);
        if (withSchema.length) {
          lines.push("", "参数名（按各工具 schema 自动映射，不再是猜）：");
          for (const t of withSchema) {
            lines.push(`  ${t.name}: ${Object.keys(t.inputSchema.properties).join(", ")}`);
          }
        }
        return textResult(lines.join("\n"));
      }

      const call = async (name, want) => {
        const args = client.buildArgs(name, want);
        const res = await client.callTool(name, args);
        const out = toolOutcome(res);
        return out.ok ? out.text || "（工具没有返回文本）" : `工具报错：${out.text}`;
      };

      try {
        if (action === "search") {
          if (!picked.search) return textResult("这个 MCP 里找不到搜索工具。先用 action=probe 看看有哪些。");
          return textResult(await call(picked.search, { query: String(args?.query || "").trim(), limit: Number(args?.limit) || 20 }));
        }
        if (action === "create") {
          if (!picked.create) return textResult("这个 MCP 里找不到新建工具。先用 action=probe 看看有哪些。");
          const text = String(args?.text || "").trim();
          if (!text) return textResult("没给正文。");
          return textResult(await call(picked.create, { text }));
        }
        if (action === "update") {
          if (!picked.update) return textResult("这个 MCP 里找不到修改工具。先用 action=probe 看看有哪些。");
          const text = String(args?.text || "").trim();
          if (!text) return textResult("没给新正文。");
          return textResult(await call(picked.update, { text, id: String(args?.id || "") }));
        }
        return textResult("action 只能是 probe / search / create / update。");
      } catch (err) {
        return textResult(`MCP 调用失败：${describeError(err)}`);
      }
    },
  });
}
