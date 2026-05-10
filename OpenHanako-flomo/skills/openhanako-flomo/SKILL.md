---
name: openhanako-flomo
description: "浮墨笔记（flomo）插件：写入、搜索、管理 flomo 笔记。用户提到「记到 flomo」「搜一下 flomo」「浮墨笔记」「导入 flomo」「配置 flomo」「我的笔记」时触发。"
---

# OpenHanako-flomo

本插件提供四个工具：

## openhanako-flomo_set_config
配置插件参数（webhook URL）。必须先配置才能写入。

**用法：** 用户说「帮我配置 flomo webhook URL」时调用。用户提供 URL 后调用此工具保存。

## openhanako-flomo_write_memo
将内容写入 flomo。需先配置 webhook URL。

**用法：** 用户说「记到 flomo：xxx」

## openhanako-flomo_search_memo
在已导入的 flomo 笔记中搜索。需先通过 import_memos 导入数据。

**用法：** 用户说「搜一下 flomo 里关于 xxx 的笔记」

## openhanako-flomo_import_memos
导入 flomo 的导出 HTML 文件。需要用户提供文件路径。

**用法：** 用户说「帮我导入 flomo 的导出文件」
