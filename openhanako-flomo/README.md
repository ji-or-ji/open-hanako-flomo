# OpenHanako-flomo

浮墨笔记（flomo）接入：网页版直接嵌在卡片里，写入、搜索、导入笔记，卡片自己会更新。

## Agent 用法（原技能，见 docs/agent-usage.md）

四个工具：write_memo（写）、search_memo（搜本地索引）、import_memos（导入导出包）、set_config（存 webhook）。触发词和调用规矩都在 docs/agent-usage.md 里。

> 2.0.2 起不再随包携带 skills/：宿主会为 App 的技能目录开一个目录句柄，导致 App 运行中无法热更新（安装时报 EPERM）。技能内容挪到 docs/，工具描述本身也够模型用。

## 卡片

卡片中心里名叫 **flomo** 的一张，打开就是一整页 `v.flomoapp.com/mine`——写、翻、搜都在那里，用的是你自己的登录。左下角有一簇小按键，平时几乎看不见，鼠标过去才亮：

- **刷新** —— iframe 卡住时重新加载
- **同步笔记** —— 把 flomo 里的笔记拉回本地索引。点完它去页面里点 设置 → 导入导出 → 导出，导出包一落盘（下载 / 桌面 / 文档都盯着）就自动解压、解析、去重合并。`n- **选文件 / 拖进来** —— 卡片内嵌的页面是沙箱 iframe，浏览器会拦掉它触发的下载；导出被拦时点「外部打开」在系统浏览器里导出，再把 zip 拖回这张卡片（或点「选文件」），一样自动入库
- **外部打开** —— 用系统浏览器打开，登录不了时走这条

同步服务跑在 `127.0.0.1:47811`，是受管运行时（`runtime/server.mjs`）：App 后端读不到你的下载目录，卡片页面碰不到文件系统，只能放在沙盒外做。端口起不来只影响同步按钮，不影响记笔记。

补充一句边界：flomo 公开的 API 只有写入（Incoming Webhook），读笔记只有两条正道——官方 MCP（MAX 会员 + Token）或网页版的导出。这里走后者，不伪造 cookie、不走苹小路。想接 MCP 也可以，把 Token 给我就能加。

运行时里还留着一组 `/__update/*`（按 GitHub Release 自我更新），卡片界面没放入口，只在会话里手动用。

## 功能

- **写入笔记** — 通过 Agent 对话，将灵感、总结、待办等一键写入 flomo
- **导入与搜索** — 导入 flomo 的导出 HTML 文件，建立本地搜索索引。支持关键词、标签、时间范围筛选
- **Agent 驱动** — 所有操作通过对话完成，未来将加入可视化配置页

## 安装

1. 下载或克隆本仓库
2. 打开 Hanako → 设置 → 插件，将 `OpenHanako-flomo` 文件夹（或 .zip）拖入安装区
3. 在设置 → 插件中启用

## 使用

所有操作通过对话中的 Agent 完成：

| 操作 | 告诉 Agent |
|------|-----------|
| 配置 webhook | "帮我配置 flomo webhook URL，地址是 https://flomoapp.com/iwh/xxx/xxx/xxx/" |
| 写入笔记 | "记到 flomo：今天学到了新东西 #学习" |
| 导入导出文件 | "帮我导入 flomo 的导出文件，路径是 D:/xxx/xxx.html" |
| 搜索笔记 | "搜一下 flomo 里关于镜片的笔记" |

## 文件结构

```
OpenHanako-flomo/
├── manifest.json          # 插件清单
├── index.js               # 生命周期
├── lib/
│   └── parse-export.js    # flomo 导出 HTML 解析器
├── tools/
│   ├── set-config.js      # 配置 webhook URL
│   ├── write-memo.js      # 写入笔记
│   ├── search-memo.js     # 搜索笔记
│   └── import-memos.js    # 导入导出文件
└── skills/
    └── openhanako-flomo/
        └── SKILL.md       # 知识注入
```

## 许可

Apache License 2.0

## MCP（可选，需 flomo MAX）

设置 → 扩展 → OpenHanako-flomo 填 `MCP Token`（网页版 → 设置 → MCP / API → Token 授权模式）。填了之后：

- 卡片底部「发送」改走 MCP，标题旁的计数会多一个 `· MCP`
- 每条笔记多一个「改」，双击正文也能就地改；保存走 MCP 改线上，成功后再同步本地那条
- Agent 可以直接用 `flomo_mcp` 工具：`probe`（列出 MCP 实际提供的工具）、`search`、`create`、`update`

### 这部分是照文档写的，没跑通过

没有 MAX 会员就拿不到 Token，所以下面这些只能在拿到权限后才知道对不对：

- **已验证**：`https://flomoapp.com/mcp` 存在，要求 `Authorization: Bearer <Token>`（拿假 token 请求，服务端回 401，说明请求形状没错）
- **未验证**：工具名与参数名。所以代码里不硬编码：先 `tools/list`，再按名字猜哪个是搜索/新建/修改；猜不对可以在设置里手填 `mcpToolSearch` / `mcpToolCreate` / `mcpToolUpdate`
- `probe` 会把工具清单原样列出来，拿到 Token 后第一件事就跑它

还有一个结构性的坑写在明处：本地索引里的笔记 id 是我们解析导出时自己生成的（`时间_短哈希`），跟 flomo 线上的 id 不是一回事。所以「改」的时候要先用原文前 24 字搜一次、从结果里猜线上 id；猜不到就报错，不会假装改成功。

### 兼容性做了什么

- **参数名不猜了**：先读每个工具的 `inputSchema.properties`，按 schema 里真实的字段名填（`content`/`text`/`body`/`markdown`、`id`/`memo_id`/`noteId` 都能对上），必填字段缺失时按类型补。没有 schema 才退回“多别名一起发”
- **协议版本退档**：握手从 2025-06-18 起，失败依次退 2025-03-26、2024-11-05；鉴权错不退版本
- **成败判定**：认 `isError`，也认结构化文本里的错误
- **没有 MCP 也能改**：每条笔记的「改」始终在——没 Token 就只改本地副本，标一个「未同步」；配了 Token 再改会顺带推回线上，成功了标记才消失
