# OpenHanako-flomo

浮墨笔记（flomo）接入 App，为 Hana 提供 flomo 笔记的写入、搜索和导入能力。

> 这个仓库现在有两条线：
> - `main` 分支：v1 插件（`manifestVersion 1`），Hana 把它当永久冻结的兼容层继续装载。
> - `v2` 分支（默认）：v2 App（`manifestVersion 2`），装在 `<HANA_HOME>/apps/` 下，走新的授权与生命周期。
>
> 两者功能等价，装哪一个都能用；新装建议用 `v2`。

## 功能

- **写入笔记** — 一句话把灵感、总结、待办写进 flomo
- **导入与搜索** — 导入 flomo 导出数据（.zip / 解压目录 / .html / 直接贴 HTML），建本地索引，支持关键词、标签、时间范围筛选
- **设置页** — webhook 地址直接填在 设置 → 扩展 → OpenHanako-flomo 里，也可以让 Agent 用工具代填

## 安装（v2）

1. 下载或克隆本仓库
2. 把 `openhanako-flomo/` 整个目录（或打包出的 .zip）装进 Hana 的设置 → 扩展 → 已安装 → App 类目的安装入口
3. 首次装载会弹一次确认卡，看过声明的能力再批准

要求的宿主版本：HanaAgent 1.3.6-beta 及以上。

## 使用

所有操作都可以通过对话完成：

| 操作 | 告诉 Agent |
|------|-----------|
| 配置 webhook | "帮我配置 flomo webhook URL，地址是 https://flomoapp.com/iwh/xxx/xxx/xxx/" |
| 写入笔记 | "记到 flomo：今天学到了新东西 #学习" |
| 导入导出文件 | "帮我导入 flomo 的导出文件，路径是 D:/xxx/flomo.zip" |
| 搜索笔记 | "搜一下 flomo 里关于镜片的笔记" |

## 文件结构

```
openhanako-flomo/            # App 目录（目录名必须等于 manifest.id）
├── manifest.json            # v2 清单
├── index.js                 # defineApp 入口，注册工具
├── assets/icon.png          # App 图标
├── lib/
│   ├── parse-export.js      # flomo 导出 HTML 解析器
│   ├── unzip.js             # 纯 JS 解压，替代靠系统 unzip 的老实现
│   ├── config.js            # webhook 来源解析（设置页优先，兼容 v1 遗留文件）
│   └── store.js             # 本地笔记索引读写
├── tools/
│   ├── write-memo.js
│   ├── search-memo.js
│   ├── set-config.js
│   └── import-memos.js
├── skills/
│   └── openhanako-flomo/SKILL.md
└── sdk/                     # 随包携带的 @hana/app-sdk 运行时闭包
```

## 从 v1 升上来

v1 插件的数据在 `<HANA_HOME>/plugin-data/openhanako-flomo/`，v2 App 用的是 `<HANA_HOME>/app-data/openhanako-flomo/`，两边不互通。
换过来之后需要做两件事：在设置页重填一次 webhook，再把 flomo 导出的 .html / .zip 导入一次（导入按 id 去重，重复导入不会产生重复笔记）。
旧的 v1 插件可以留着不动，也可以卸掉——两条线互不干扰。

## 许可

Apache License 2.0
