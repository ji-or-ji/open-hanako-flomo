#!/usr/bin/env node
/**
 * runtime/server.mjs — 受管运行时：只负责“更新自己”这一件事。
 *
 * 为什么非得起个进程：App 后端跑在 AppHost 沙盒里，没有 net，也写不了
 * <HANA_HOME>/apps/<id>；卡片页面是浏览器环境，更碰不到文件系统。更新要
 * 下载 + 解压 + 换目录，只能在沙盒外面的本机进程里做。
 *
 * 端口固定 47811：页面里的按钮直接打到 127.0.0.1:47811，端口一变就失联。
 */
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyUpdate, checkUpdate, dirSize } from "../lib/updater.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const INSTALL_DIR = join(HERE, "..");

function arg(name, fallback) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}

const PORT = Number(arg("port", "47811"));
const DATA_DIR = arg("data", process.cwd());
const VERSION = arg("version", "");

const log = {
  info: (...a) => console.log("[flomo]", ...a),
  warn: (...a) => console.warn("[flomo]", ...a),
  error: (...a) => console.error("[flomo]", ...a),
};

let busy = "";
let lastResult = null;

function send(res, code, data) {
  const body = Buffer.from(JSON.stringify(data));
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-max-age": "600",
    });
    res.end();
    return;
  }
  const url = new URL(req.url, "http://127.0.0.1");
  try {
    if (url.pathname === "/__health") {
      send(res, 200, { ok: true, version: VERSION, pid: process.pid, installDir: INSTALL_DIR, size: dirSize(INSTALL_DIR) });
      return;
    }
    if (url.pathname === "/__update/check") {
      const info = await checkUpdate({ currentVersion: VERSION });
      send(res, 200, { ok: true, ...info });
      return;
    }
    if (url.pathname === "/__update/apply" && req.method === "POST") {
      if (busy) {
        send(res, 409, { ok: false, error: "已经在更新了" });
        return;
      }
      if (!existsSync(join(INSTALL_DIR, "manifest.json"))) {
        send(res, 500, { ok: false, error: "安装目录里没有 manifest.json" });
        return;
      }
      const current = JSON.parse(readFileSync(join(INSTALL_DIR, "manifest.json"), "utf8"));
      busy = "checking";
      try {
        const info = await checkUpdate({ currentVersion: current.version });
        if (!info.newer) {
          busy = "";
          send(res, 200, { ok: true, upToDate: true, current: current.version, latest: info.latest });
          return;
        }
        busy = "downloading";
        const result = await applyUpdate({ installDir: INSTALL_DIR, dataDir: DATA_DIR, info: { ...info, current: current.version }, log });
        lastResult = result;
        busy = "";
        send(res, 200, { ...result, restart: true });
      } catch (err) {
        busy = "";
        log.error("更新失败", err?.message || err);
        send(res, 500, { ok: false, error: String(err?.message || err) });
      }
      return;
    }
    if (url.pathname === "/__update/status") {
      send(res, 200, { ok: true, busy, lastResult });
      return;
    }
    send(res, 404, { ok: false, error: "not found" });
  } catch (err) {
    log.error("请求出错", err?.message || err);
    send(res, 500, { ok: false, error: String(err?.message || err) });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  log.info(`更新服务就绪 http://127.0.0.1:${PORT} · 版本 ${VERSION} · ${INSTALL_DIR}`);
  console.log("FLOMO_RUNTIME_READY");
});

server.on("error", (err) => {
  log.error(`端口 ${PORT} 起不来：${err?.message || err}`);
  if (err && err.code === "EADDRINUSE") process.exit(3);
  process.exit(1);
});
