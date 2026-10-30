# OpenHanako-flomo

浮墨笔记（flomo）接入：网页版直接嵌在卡片里，写入、搜索、导入笔记，卡片自己会更新。

## 卡片

卡片中心里名叫 **flomo** 的一张，打开就是一整页 `v.flomoapp.com/mine`——写、翻、搜都在那里，用的是你自己的登录。左下角有一簇小按键，平时几乎看不见，鼠标过去才亮：

- **刷新** —— iframe 卡住时重新加载
- **一键更新** —— 去 GitHub Release 取回最新压缩包，校验、解压、换掉安装目录。点第一次是“查”、第二次才是“更”； 更新完重启 Hana 生效，旧版本留在 `apps/openhanako-flomo.bak-<时间>` 里可退
- **外部打开** —— 用系统浏览器打开，登录不了时走这条

更新服务跑在 `127.0.0.1:47811`，是受管运行时（`runtime/server.mjs`）。它必须在沙盒外：要下载、要写安装目录，App 后端两样都干不了。端口起不来只影响更新按钮，不影响记笔记。

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
