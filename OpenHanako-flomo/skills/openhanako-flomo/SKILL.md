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
导入 flomo 的导出数据。支持直接传入 .zip 文件路径、解压后的文件夹路径、或 .html 文件路径，自动解析。

**用法：** 用户把 flomo 导出的 .zip 文件拖入聊天后，用 sourcePath 参数传入路径（支持 .zip 文件本身）。或用户说「帮我导入 flomo 的导出文件，路径是 xxx」
