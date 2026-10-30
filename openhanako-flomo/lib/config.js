/**
 * lib/config.js — webhook 地址解析。
 *
 * 正门是设置页声明的 webhookUrl（ctx.config）。0.3.0 及更早的版本把地址写在
 * dataDir/config.json 里，这里读一份做兜底：同一个数据目录里如果还留着那份文件，
 * 就不用再填一遍。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export function legacyConfigPath(dataDir) {
  return join(dataDir, "config.json");
}

export function readLegacyConfig(dataDir) {
  const path = legacyConfigPath(dataDir);
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function resolveWebhook(sdk) {
  let fromSettings = "";
  try {
    fromSettings = await sdk.config.get("webhookUrl");
  } catch {
    fromSettings = "";
  }
  if (typeof fromSettings === "string" && fromSettings.trim()) return fromSettings.trim();

  const legacy = readLegacyConfig(sdk.dataDir);
  if (typeof legacy.webhookUrl === "string" && legacy.webhookUrl.trim()) {
    return legacy.webhookUrl.trim();
  }
  return "";
}

/** 运行时按文件读 webhook：改配置后立刻生效，不用重启运行时。 */
export function writeWebhookFile(dataDir, url) {
  try {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, "webhook.txt"), url || "", "utf8");
  } catch {
    /* 写不进去就算了，写笔记时会报“还没配 webhook” */
  }
}
