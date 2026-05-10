# OpenHanako-flomo

浮墨笔记（flomo）接入插件，为 Hanako 提供 flomo 笔记的写入、搜索和管理能力。

## 功能

- **写入笔记** — 通过 Agent 对话或插件界面，将灵感、总结、待办等一键写入 flomo
- **导入与搜索** — 导入 flomo 的导出 HTML 文件，建立本地搜索索引。支持关键词、标签、时间范围筛选
- **标签管理** — 自动识别导入笔记中的标签，支持按标签树筛选

## 架构

```
OpenHanako-flomo/
├── manifest.json        # 插件清单（full-access）
├── index.js             # 生命周期：加载/缓存 memo 索引
├── lib/
│   └── parse-export.js  # flomo 导出 HTML 解析器
├── tools/
│   ├── write-memo.js    # 工具：写入笔记（webhook POST）
│   └── search-memo.js   # 工具：搜索已导入的笔记
└── routes/
    └── page.js          # 配置页 + 搜索界面 + API 端点
```

## 安装

### 方式一：拖拽安装

1. 下载或克隆本仓库到本地
2. 打开 Hanako → 设置 → 插件
3. 将 `OpenHanako-flomo` 文件夹（或打包的 `.zip`）拖入安装区

### 方式二：手动安装

1. 将 `OpenHanako-flomo` 文件夹复制到 Hanako 的插件目录
2. 在设置 → 插件中启用

> 插件需要 `full-access` 权限，安装后需在设置 → 插件中开启"允许全权插件"开关。

## 使用

### 首次配置

1. 安装后在侧边栏找到 **Flomo** 页面入口
2. 在"设置"标签页填入你的 flomo incoming webhook URL
3. 在"导入"标签页上传 flomo 导出的 `.html` 文件

### Agent 工具

安装后 Agent 自动获得两个新工具：

| 工具名 | 说明 |
|--------|------|
| `openhanako-flomo_write_memo` | 写入一条笔记到 flomo（需先配置 webhook） |
| `openhanako-flomo_search_memo` | 在已导入的笔记中搜索 |

## 写入：Incoming Webhook

通过 flomo PRO 会员提供的 incoming webhook 实现写入：

- 获取方式：flomo 设置 → 会员 → 会员功能 → Incoming Webhook
- 格式：`https://flomoapp.com/iwh/xxx/xxx/xxx/`
- 写入支持纯文本，正文中可用 `#标签` 格式

## 读取：导出 HTML 解析

通过 flomo 设置 → 导出数据 下载 `.zip`，解压后得到 `.html` 文件。插件解析 HTML 结构，提取每条 memo 的时间、正文、标签和附件图片路径，建立本地搜索索引。

## 开发

```bash
# 创建插件目录
mkdir OpenHanako-flomo && cd OpenHanako-flomo

# 可选：使用官方 scaffolding 工具
python3 /path/to/openhanako/skills2set/hana-plugin-creator/scripts/create_hana_plugin.py \
  "OpenHanako-flomo" --path . --kind full

# 参考本仓库的目录结构开发即可
```

## 许可

Apache License 2.0
