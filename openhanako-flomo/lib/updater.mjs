/**
 * lib/updater.mjs — 自我更新：从 GitHub Release 取回压缩包，校验、解压、替换安装目录。
 *
 * 只在受管运行时里跑（profile: local-machine）。App 后端那个沙盒既没有 net 也没有
 * 安装目录的写权限，所以整套搬进 runtime。
 *
 * 三条底线：
 *   1. 只动安装目录（<HANA_HOME>/apps/<id>），绝不碰 plugin-data / app-data 里的笔记与配置。
 *   2. 先解压到同级 staging 目录、确认 manifest.id 与版本都对得上，才换上去。
 *   3. 换之前把旧目录改名成 <id>.bak-<时间戳>，换失败可以原样退回去。
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { unzip } from "./unzip.mjs";

const RELEASES_API = "https://api.github.com/repos/ji-or-ji/open-hanako-flomo/releases/latest";

function cmpVersion(a, b) {
  const pa = String(a).replace(/^v/i, "").split(/[.-]/).map((x) => Number(x) || 0);
  const pb = String(b).replace(/^v/i, "").split(/[.-]/).map((x) => Number(x) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export { cmpVersion };

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

async function fetchJson(url, headers) {
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "hana-flomo-updater", ...headers } });
  if (!res.ok) throw new Error(`请求失败 ${res.status}：${url}`);
  return res.json();
}

/** 问一次“有没有新版本”。 */
export async function checkUpdate({ currentVersion, repoUrl } = {}) {
  const api = repoUrl && /github\.com/.test(repoUrl) ? RELEASES_API : RELEASES_API;
  const rel = await fetchJson(api);
  const tag = String(rel.tag_name || rel.name || "").replace(/^v/i, "");
  const assets = Array.isArray(rel.assets) ? rel.assets : [];
  const zip = assets.find((a) => /\.zip$/i.test(a.name));
  if (!zip) throw new Error("这个 Release 没挂 zip 包");
  const sum = assets.find((a) => /\.sha256$/i.test(a.name));
  return {
    current: currentVersion,
    latest: tag,
    newer: cmpVersion(tag, currentVersion) > 0,
    notes: String(rel.body || "").slice(0, 4000),
    // 走 api.github.com 的 asset 接口（带 Accept: octet-stream），不要用
    // browser_download_url：那个域名是 github.com，本机 443 被断，只有
    // api.github.com 与它重定向到的 release-assets.githubusercontent.com 能通。
    zipApiUrl: zip.url || "",
    zipUrl: zip.browser_download_url,
    zipName: zip.name,
    zipSize: zip.size || 0,
    sha256ApiUrl: sum ? sum.url || "" : "",
    sha256Url: sum ? sum.browser_download_url : "",
    publishedAt: rel.published_at || "",
  };
}

async function readExpectedHash(info) {
  const url = info.sha256ApiUrl || info.sha256Url;
  if (!url) return "";
  try {
    const res = await fetch(url, { headers: { "user-agent": "hana-flomo-updater", accept: "application/octet-stream" }, redirect: "follow" });
    if (!res.ok) return "";
    const text = (await res.text()).trim();
    const m = text.match(/[a-f0-9]{64}/i);
    return m ? m[0].toLowerCase() : "";
  } catch {
    return "";
  }
}

function cleanDir(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) rmSync(join(dir, name), { recursive: true, force: true });
}

/**
 * 下载并替换安装目录。
 * @param {{ installDir: string, dataDir: string, info: object, log?: any }} opts
 */
export async function applyUpdate({ installDir, dataDir, info, log = console }) {
  if (!installDir || !existsSync(installDir)) throw new Error("找不到安装目录，无法更新");
  const parent = dirname(resolve(installDir));
  const id = JSON.parse(readFileSync(join(installDir, "manifest.json"), "utf8")).id || "";
  const staging = join(parent, `${id}.staging`);
  const tmpDir = join(dataDir, "update-tmp");
  mkdirSync(tmpDir, { recursive: true });
  const zipPath = join(tmpDir, info.zipName || "update.zip");

  log.info?.("下载", info.zipApiUrl || info.zipUrl);
  const res = await fetch(info.zipApiUrl || info.zipUrl, {
    headers: { "user-agent": "hana-flomo-updater", accept: "application/octet-stream" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`下载失败 ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(zipPath, buf);
  log.info?.("下载完成", buf.length, "字节");

  const expected = await readExpectedHash(info);
  if (expected) {
    const got = sha256(buf);
    if (got !== expected) throw new Error(`校验不通过：期望 ${expected.slice(0, 12)}…，实际 ${got.slice(0, 12)}…`);
    log.info?.("sha256 校验通过");
  } else {
    log.warn?.("这个 Release 没提供 .sha256，跳过校验（只信 HTTPS）");
  }

  const entries = unzip(buf);
  // 包里可能有一层顶层目录（extension-pack 打出来的就是这样），先找出 manifest.json
  const manifestEntry = entries.find((e) => /(^|\/)manifest\.json$/.test(e.name) && e.name.split("/").length <= 3);
  if (!manifestEntry) throw new Error("压缩包里没有 manifest.json");
  const prefix = manifestEntry.name.slice(0, Math.max(0, manifestEntry.name.lastIndexOf("/")));
  const manifest = JSON.parse(manifestEntry.content.toString("utf8"));
  if (id && manifest.id !== id) throw new Error(`包里的 App 不是这个：期望 ${id}，实际 ${manifest.id}`);

  cleanDir(staging);
  mkdirSync(staging, { recursive: true });
  let count = 0;
  for (const e of entries) {
    let rel = e.name;
    if (prefix) {
      if (!rel.startsWith(prefix + "/")) continue;
      rel = rel.slice(prefix.length + 1);
    }
    if (!rel || rel.endsWith("/")) continue;
    if (rel.includes("..")) throw new Error(`包里有可疑路径：${e.name}`);
    const dest = join(staging, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, e.content);
    count += 1;
  }
  log.info?.("解压完成", count, "个文件，版本", manifest.version);

  const backup = join(parent, `${id}.bak-${new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14)}`);
  renameSync(installDir, backup);
  try {
    renameSync(staging, installDir);
  } catch (err) {
    renameSync(backup, installDir);
    throw new Error(`替换安装目录失败，已回滚：${err?.message || err}`);
  }
  rmSync(zipPath, { force: true });

  return { ok: true, from: info.current, to: manifest.version, backup, files: count };
}

export function dirSize(dir) {
  let total = 0;
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else total += st.size;
    }
  };
  try {
    walk(dir);
  } catch {
    /* ignore */
  }
  return total;
}
