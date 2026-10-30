import { resolveWebhook, writeWebhookFile } from "../lib/config.js";
import { textResult } from "../lib/store.js";

export async function register(sdk) {
  await sdk.tools.register({
    name: "set_config",
    description:
      "配置 OpenHanako-flomo 的参数。目前支持设置 webhookUrl（flomo 的 incoming webhook URL）。"
      + "不传参数时只回报当前配置状态。",
    parameters: {
      type: "object",
      properties: {
        webhookUrl: {
          type: "string",
          description: "flomo incoming webhook URL。格式：https://flomoapp.com/iwh/xxx/xxx/xxx/",
        },
      },
    },
    execute: async (args) => {
      const incoming = typeof args?.webhookUrl === "string" ? args.webhookUrl.trim() : "";

      if (!incoming) {
        const current = await resolveWebhook(sdk);
        return textResult(`当前配置状态：${current ? "已配置" : "未配置"}\nwebhookUrl：${current || "（空）"}`);
      }

      try {
        await sdk.config.set("webhookUrl", incoming);
      } catch (err) {
        return textResult(`保存失败：${err?.message || err}`);
      }
      // 卡片里的「发一条」走运行时，它读这个文件
      writeWebhookFile(sdk.dataDir, incoming);
      return textResult(`配置已更新：\nwebhookUrl = ${incoming}`);
    },
  });
}
