---
name: openhanako-flomo
description: "浮墨笔记（flomo）插件：写入、搜索和管理 flomo 笔记。用户提到「记到 flomo」「搜一下 flomo」「浮墨笔记」「我的笔记」时触发。"
---

# OpenHanako-flomo

本插件提供两个工具：

## openhanako-flomo_write_memo

将内容写入 flomo。使用 incoming webhook，需先在插件设置页配置 webhook URL。

**用法：**
- 用户说「记到 flomo：xxx」或「帮我把这个记到浮墨」时调用
- 参数 `content`：笔记正文，支持 `#标签` 格式

## openhanako-flomo_search_memo

在已导入的 flomo 笔记中搜索。搜索前需要用户在插件设置页导入 flomo 的 HTML 导出文件。

**用法：**
- 用户说「帮我查一下 flomo 里关于 xxx 的笔记」
- 支持按关键词、标签、时间范围搜索
