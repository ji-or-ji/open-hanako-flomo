# OpenHanako-flomo

浮墨笔记（flomo）接入：网页版直接嵌在卡片里，写入、搜索、导入笔记，卡片自己会更新。

## 卡片

卡片中心里名叫 **flomo** 的一张，打开就是一整页 `v.flomoapp.com/mine`——写、翻、搜都在那里，用的是你自己的登录。左下角有一簇小按键，平时几乎看不见，鼠标过去才亮：

- **刷新** —— iframe 卡住时重新加载
- **同步笔记** —— 把 flomo 里的笔记拉回本地索引。用的就是你自己那套登录态：点完这个按钮，去页面里点 设置 → 导入导出 → 导出，导出包一落盘（下载目录 / 桌面 / 文档都盯着）就自动解压、解析、按 id 去重合并，不用再管
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
