# OpenHanako-flomo

浮墨笔记（flomo）接入插件，为 Hanako 提供 flomo 笔记的写入、搜索和管理能力。

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
