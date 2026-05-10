/**
 * set_config tool
 * 配置插件参数（webhook URL 等）
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export const name = "set_config";
export const description = "配置 OpenHanako-flomo 插件的参数。目前支持设置 webhookUrl（flomo 的 incoming webhook URL）。";
export const parameters = {
  type: "object",
  properties: {
    webhookUrl: {
      type: "string",
      description: "flomo incoming webhook URL。格式：https://flomoapp.com/iwh/xxx/xxx/xxx/"
    }
  }
};

export async function execute(input, toolCtx) {
  const configPath = join(toolCtx.dataDir, "config.json");

  // 读取现有配置
  let config = {};
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch { /* 忽略 */ }
  }

  const changes = [];

  if (input.webhookUrl !== undefined) {
    config.webhookUrl = input.webhookUrl.trim();
    changes.push(`webhookUrl = ${config.webhookUrl}`);
  }

  if (changes.length === 0) {
    // 返回当前配置
    const status = config.webhookUrl ? "已配置" : "未配置";
    return `当前配置状态：${status}\nwebhookUrl：${config.webhookUrl || "（空）"}`;
  }

  // 保存
  mkdirSync(toolCtx.dataDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

  return `配置已更新：\n${changes.join("\n")}`;
}
