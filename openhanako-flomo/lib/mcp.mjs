/**
 * lib/mcp.mjs — flomo 官方 MCP 的最小客户端（streamable HTTP）。
 *
 * flomo 的 MCP 端点：https://flomoapp.com/mcp，认证是 `Authorization: Bearer <Token>`，
 * Token 在 网页版 → 设置 → MCP / API → Token 授权模式 里创建（文档写的是需要 MAX 会员）。
 *
 * 我们没法拿真实 Token 试，所以这里刻意不做“硬编码某几个工具名”的假设：
 *   · 连上先 initialize + tools/list，把工具名列出来；
 *   · 再按名字猜哪个是搜索、哪个是新建、哪个是修改，也允许设置里显式指定；
 *   · 猜不到就如实报“没找到对应工具”，不假装成功。
 *
 * 会话（Mcp-Session-Id）与协议版本都按 2025-06-18 走；服务端返回 SSE 时按 data: 行读。
 */

const PROTOCOL_VERSION = "2025-06-18";

export class McpError extends Error {
  constructor(message, { status = 0, body = "" } = {}) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/** 把 SSE 文本里第一条匹配 id 的 JSON-RPC 响应挑出来。 */
function pickFromSse(text, id) {
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const raw = line.slice(5).trim();
    if (!raw || raw === "[DONE]") continue;
    try {
      const msg = JSON.parse(raw);
      if (msg && (msg.id === id || msg.id === undefined)) return msg;
    } catch {
      /* 忽略无法解析的行 */
    }
  }
  return null;
}

export class FlomoMcp {
  constructor({ url = "https://flomoapp.com/mcp", token = "", timeoutMs = 20000 } = {}) {
    this.url = url;
    this.token = token;
    this.timeoutMs = timeoutMs;
    this.sessionId = "";
    this.protocolVersion = PROTOCOL_VERSION;
    this.serverInfo = null;
    this.nextId = 1;
    this.tools = [];
  }

  get configured() {
    return Boolean(this.token);
  }

  async #rpc(method, params, { notification = false } = {}) {
    if (!this.token) throw new McpError("还没配 MCP Token（网页版 → 设置 → MCP / API）", { status: 401 });
    const id = notification ? undefined : this.nextId++;
    const body = { jsonrpc: "2.0", method };
    if (params !== undefined) body.params = params;
    if (id !== undefined) body.id = id;

    const headers = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${this.token}`,
      "mcp-protocol-version": this.protocolVersion,
    };
    if (this.sessionId) headers["mcp-session-id"] = this.sessionId;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    let res;
    try {
      res = await fetch(this.url, { method: "POST", headers, body: JSON.stringify(body), signal: ac.signal });
    } catch (err) {
      clearTimeout(timer);
      throw new McpError(`连不上 MCP：${err?.message || err}`);
    }
    clearTimeout(timer);

    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;

    if (res.status === 401 || res.status === 403) {
      throw new McpError("Token 不对或已注销（401/403）", { status: res.status });
    }
    if (notification) return null;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new McpError(`MCP 回了 ${res.status}`, { status: res.status, body: text.slice(0, 400) });
    }

    const ctype = String(res.headers.get("content-type") || "");
    let msg = null;
    if (ctype.includes("text/event-stream")) {
      msg = pickFromSse(await res.text(), id);
    } else {
      const text = await res.text();
      try {
        msg = JSON.parse(text);
      } catch {
        msg = pickFromSse(text, id);
      }
    }
    if (!msg) throw new McpError("MCP 返回里没有可用的 JSON-RPC 响应");
    if (msg.error) throw new McpError(`MCP 报错：${msg.error.message || JSON.stringify(msg.error)}`);
    return msg.result;
  }

  async initialize() {
    // 协议版本从新到旧试：新版握手失败就退一档，宿主/MCP 实现参差不齐。
    const versions = [PROTOCOL_VERSION, "2025-03-26", "2024-11-05"];
    let lastErr = null;
    for (const v of versions) {
      try {
        this.protocolVersion = v;
        const result = await this.#rpc("initialize", {
          protocolVersion: v,
          capabilities: {},
          clientInfo: { name: "hana-flomo", version: "1.0.0" },
        });
        this.serverInfo = result?.serverInfo || null;
        if (result?.protocolVersion) this.protocolVersion = result.protocolVersion;
        try {
          await this.#rpc("notifications/initialized", undefined, { notification: true });
        } catch {
          /* 某些实现不收这条，忽略 */
        }
        return result;
      } catch (err) {
        lastErr = err;
        // 鉴权错就别退版本了，换版本也没用
        if (err instanceof McpError && (err.status === 401 || err.status === 403)) throw err;
      }
    }
    throw lastErr || new McpError("MCP 握手失败");
  }

  async listTools() {
    const result = await this.#rpc("tools/list", {});
    this.tools = Array.isArray(result?.tools) ? result.tools : [];
    return this.tools;
  }

  async callTool(name, args) {
    const result = await this.#rpc("tools/call", { name, arguments: args || {} });
    return result;
  }

  /**
   * 拿工具的输入 schema 拼参数。
   *
   * 不猜参数名、不写死：不同实现会把正文叫 content / text / body / markdown，把 id 叫
   * memo_id / noteId。有 inputSchema 就按 schema 里的属性名映射，只填它真有的字段。
   * 没有 schema 时才退回“多别名一起发，服务端自己挑”的笨办法。
   */
  buildArgs(toolName, want = {}) {
    const tool = this.tools.find((t) => t.name === toolName);
    const props = tool?.inputSchema?.properties;
    const names = props && typeof props === "object" ? Object.keys(props) : [];

    const pickName = (exact, loose) => names.find((n) => exact.test(n)) || names.find((n) => loose.test(n)) || "";

    if (names.length) {
      const args = {};
      const textKey = pickName(/^(content|text|body|markdown|memo|note)$/i, /content|text|body|markdown|memo/i);
      const idKey = pickName(/^(id|memo_?id|note_?id|memoId|noteId)$/i, /(^|_)id$|id$/i);
      const queryKey = pickName(/^(query|keyword|q|search|term)$/i, /query|keyword|search|term/i);
      const limitKey = pickName(/^(limit|count|size|top_?k)$/i, /limit|count|size/i);
      if (textKey && typeof want.text === "string") args[textKey] = want.text;
      if (idKey && want.id) args[idKey] = want.id;
      if (queryKey && typeof want.query === "string") args[queryKey] = want.query;
      if (limitKey && want.limit) args[limitKey] = String(want.limit);
      // schema 里只写了别的必填字段，就看着办：能按类型给就给
      const required = Array.isArray(tool?.inputSchema?.required) ? tool.inputSchema.required : [];
      for (const key of required) {
        if (key in args) continue;
        const type = props?.[key]?.type;
        if (type === "string") args[key] = typeof want.text === "string" ? want.text : String(want.query || "");
        else if (type === "number" || type === "integer") args[key] = Number(want.limit) || 20;
        else if (type === "boolean") args[key] = true;
      }
      if (Object.keys(args).length) return args;
    }

    // 没 schema：把常见叫法一起发
    const args = {};
    if (typeof want.text === "string") {
      args.content = want.text;
      args.text = want.text;
      args.markdown = want.text;
    }
    if (want.id) {
      args.id = want.id;
      args.memo_id = want.id;
    }
    if (typeof want.query === "string") {
      args.query = want.query;
      args.keyword = want.query;
      args.q = want.query;
    }
    if (want.limit) args.limit = Number(want.limit) || 20;
    return args;
  }

  /** 连一次、把工具名拿回来；已经连过就直接返回缓存的。 */
  async ready() {
    if (this.tools.length) return this.tools;
    if (!this.serverInfo) await this.initialize();
    return this.listTools();
  }
}

const SEARCH_HINT = /search|query|find|lookup|retrieve|match/i;
const CREATE_HINT = /create|add|new|save|write|append|insert/i;
const UPDATE_HINT = /update|edit|modify|patch|rewrite|change/i;
const LIST_HINT = /list|recent|timeline|latest|all/i;

/** 按名字挑工具；显式配置优先。 */
export function pickTools(tools, overrides = {}) {
  const byName = (n) => tools.find((t) => t.name === n);
  const byHint = (hint, exclude = []) =>
    tools.find((t) => !exclude.includes(t.name) && hint.test(t.name)) ||
    tools.find((t) => !exclude.includes(t.name) && hint.test(t.description || ""));

  const search = (overrides.search && byName(overrides.search)) || byHint(SEARCH_HINT);
  const create = (overrides.create && byName(overrides.create)) || byHint(CREATE_HINT);
  const update =
    (overrides.update && byName(overrides.update)) || byHint(UPDATE_HINT, [search?.name, create?.name].filter(Boolean));
  const list =
    (overrides.list && byName(overrides.list)) || byHint(LIST_HINT, [search?.name, create?.name, update?.name].filter(Boolean));

  return {
    search: search?.name || "",
    create: create?.name || "",
    update: update?.name || "",
    list: list?.name || "",
  };
}

/** 工具结果里把文本拼出来（MCP 的 content 是 [{type:"text",text}]）。 */
export function toolText(result) {
  const parts = [];
  for (const item of result?.content || []) {
    if (item?.type === "text" && typeof item.text === "string") parts.push(item.text);
    else if (item?.type === "resource" && item.resource?.text) parts.push(item.resource.text);
  }
  if (!parts.length && result?.structuredContent) parts.push(JSON.stringify(result.structuredContent, null, 2));
  return parts.join("\n").trim();
}

/** 统一判成败：有的实现用 isError，有的直接在文本里写 error。 */
export function toolOutcome(result) {
  const text = toolText(result);
  const isError = result?.isError === true;
  if (!isError) return { ok: true, text };
  return { ok: false, text: text || "工具报了错但没给原因" };
}
