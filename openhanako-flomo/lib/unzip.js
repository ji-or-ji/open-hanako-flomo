/**
 * lib/unzip.js — 只做一件事：把 flomo 导出的 .zip 在内存里解开。
 *
 * v1 那版是 execSync("unzip ...")，在 Windows 上根本跑不通；v2 的进程又拿不到
 * 子进程权限，所以干脆自己读 zip 结构。flomo 导出用的是 stored / deflate 两种
 * 老办法，Node 自带的 zlib.inflateRawSync 就够，不需要第三方库。
 */

import { inflateRawSync } from "node:zlib";

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;

function toBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value));
  if (typeof value === "string") return Buffer.from(value, "binary");
  throw new Error("无法识别的字节内容");
}

/** @returns {{ name: string, content: Buffer }[]} */
export function unzip(bufLike) {
  const buf = toBuffer(bufLike);

  // 从尾部往回找 EOCD（注释最多 65535 字节）
  let eocd = -1;
  const floor = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= floor; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("不是有效的 zip 文件（找不到目录结尾）");

  const count = buf.readUInt16LE(eocd + 10);
  let cursor = buf.readUInt32LE(eocd + 16);
  if (cursor === 0xffffffff) throw new Error("不支持 zip64 格式，请重新导出一份");

  const entries = [];
  for (let i = 0; i < count; i += 1) {
    if (cursor + 46 > buf.length || buf.readUInt32LE(cursor) !== CENTRAL_SIG) break;
    const method = buf.readUInt16LE(cursor + 10);
    const compSize = buf.readUInt32LE(cursor + 20);
    const nameLen = buf.readUInt16LE(cursor + 28);
    const extraLen = buf.readUInt16LE(cursor + 30);
    const commentLen = buf.readUInt16LE(cursor + 32);
    const localOff = buf.readUInt32LE(cursor + 42);
    const name = buf.toString("utf8", cursor + 46, cursor + 46 + nameLen);
    cursor += 46 + nameLen + extraLen + commentLen;

    if (!name || name.endsWith("/")) continue;

    const localNameLen = buf.readUInt16LE(localOff + 26);
    const localExtraLen = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + localNameLen + localExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);

    let content;
    if (method === 0) content = Buffer.from(raw);
    else if (method === 8) content = inflateRawSync(raw);
    else throw new Error(`不支持的压缩方式 ${method}：${name}`);

    entries.push({ name, content });
  }

  if (entries.length === 0) throw new Error("zip 里没有任何文件");
  return entries;
}

/** 在解出来的条目里挑一个 .html（只认顶层或一层子目录） */
export function pickHtmlEntry(entries) {
  const htmls = entries.filter((e) => /\.html?$/i.test(e.name));
  if (htmls.length === 0) return null;
  if (htmls.length === 1) return htmls[0];
  const shallow = htmls.filter((e) => e.name.split("/").length <= 2);
  return shallow.length === 1 ? shallow[0] : null;
}
