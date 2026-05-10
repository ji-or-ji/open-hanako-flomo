/**
 * write-memo tool
 * 通过 flomo incoming webhook 写入一条笔记
 */

export const name = "write_memo";
export const description = "写入一条笔记到浮墨笔记（flomo）。支持标签，标签用 # 号标注。";
export const parameters = {
  type: "object",
  properties: {
    content: {
      type: "string",
      description: "笔记正文，可在末尾或开头附上标签。如：今天学到了新东西 #学习/编程"
    }
  },
  required: ["content"]
};

export async function execute(input, toolCtx) {
  const content = typeof input.content === "string" ? input.content.trim() : "";

  if (!content) {
    return "内容不能为空。";
  }

  // 从插件配置读取 webhook URL
  const webhookUrl = toolCtx.config?.webhookUrl;
  if (!webhookUrl) {
    return "尚未配置 flomo webhook URL。请在 Flomo 插件设置页中配置。";
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "无响应体");
      return `写入失败（${response.status}）：${errText}`;
    }

    const result = await response.text().catch(() => "ok");
    toolCtx.log.info(`memo written: ${content.slice(0, 50)}...`);
    return `笔记已写入 flomo。\n${result}`;
  } catch (err) {
    toolCtx.log.error("write-memo error:", err.message);
    return `写入失败：${err.message}`;
  }
}
