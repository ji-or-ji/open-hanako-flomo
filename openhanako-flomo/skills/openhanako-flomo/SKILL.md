---
name: openhanako-flomo
description: "浮墨笔记（flomo）App：写入、搜索、导入 flomo 笔记。用户提到「记到 flomo」「搜一下 flomo」「浮墨笔记」「导入 flomo」「配置 flomo」「我的笔记」时触发。"
---

# OpenHanako-flomo

四个工具，全部属于 `openhanako-flomo` 这个 App：

## write_memo

把内容写进 flomo。需要先配好 Incoming Webhook（设置页或 `set_config`）。
用户说「记到 flomo：xxx」时直接调用，正文里的 `#标签` 原样带上，不要自己改写或加解释。

## search_memo

在本地已导入的笔记里搜索，支持关键词、标签、起止日期和条数上限。
用户问「我之前记过 xxx 吗」「搜一下 flomo 里关于 xxx 的」时用。没导入过数据就直说，让用户先导入。

## import_memos

导入 flomo 导出数据。`sourcePath` 可以给 `.zip` 文件、解压后的目录、或其中的 `.html`；
不方便给路径时用 `htmlContent` 直接贴 HTML。重复导入按笔记 id 去重，可以放心重跑。

## set_config

读写 webhook 地址。用户把 webhook URL 发过来时调用它保存，不要把地址回显成密钥。

## 注意

- 设置页在 设置 → 扩展 → OpenHanako-flomo，字段名 Incoming Webhook URL。
- 写入走网络，只放行 `flomoapp.com`；用户给别的域名会被宿主拦下，如实说明即可。
