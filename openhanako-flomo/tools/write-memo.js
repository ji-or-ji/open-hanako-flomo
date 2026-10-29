import { resolveWebhook } from "../lib/config.js";
import { textResult } from "../lib/store.js";

export async function register(sdk) {
  await sdk.tools.register({
    name: "write_memo",
    description:
      "写入一条笔记到浮墨笔记（flomo）。支持标签，标签用 # 号标注。"
      + "需要先在 OpenHanako-flomo 的设置页（或 set_config 工具）填好 Incoming Webhook。",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "笔记正文，可在末尾或开头附上标签。如：今天学到了新东西 #学习/编程",
        },
      },
      required: ["content"],
    },
    sessionPermission: { kind: "external_side_effect" },
    execute: async (args) => {
      const content = typeof args?.content === "string" ? args.content.trim() : "";
      if (!content) return textResult("内容不能为空。");

      const webhookUrl = await resolveWebhook(sdk);
      if (!webhookUrl) {
        return textResult(
          "尚未配置 flomo webhook URL。去 设置 → 扩展 → OpenHanako-flomo → Flomo 里填 Incoming Webhook，"
          + "或者直接告诉我地址，我用 set_config 存下来。",
        );
      }

      try {
        const response = await sdk.network.fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        const body = await response.text().catch(() => "");
        if (!response.ok) {
          return textResult(`写入失败（${response.status}）：${body || "无响应体"}`);
        }
        await sdk.logger.info(`memo written: ${content.slice(0, 50)}`);
        return textResult(`笔记已写入 flomo。\n${body || "ok"}`);
      } catch (err) {
        await sdk.logger.error(`write-memo error: ${err?.message || err}`);
        return textResult(`写入失败：${err?.message || err}`);
      }
    },
  });
}
