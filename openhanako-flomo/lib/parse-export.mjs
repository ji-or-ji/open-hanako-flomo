/**
 * parse-export.js
 * 解析 flomo 导出的 HTML 文件，提取 memo 数据
 */

/**
 * 从 flomo 导出 HTML 中提取所有 memo
 * @param {string} html - 完整的 HTML 文本
 * @returns {Array<{id: string, time: string, content: string, tags: string[], images: string[]}>}
 */
export function parseFlomoExport(html) {
  const memos = [];
  const memoBlocks = extractMemoBlocks(html);

  for (const block of memoBlocks) {
    const time = extractTime(block);
    const rawContent = extractContent(block);
    const { cleanContent, tags } = extractTags(rawContent);
    const images = extractImages(block);

    memos.push({
      id: extractUpstreamId(block) || generateId(time, cleanContent),
      time,
      content: cleanContent,
      tags,
      images
    });
  }

  return memos;
}

/**
 * 按标签深度切出所有 <div class="memo">…</div> 块。
 *
 * 不用正则懒匹配：memo 里套着 <div class="content"> 这些子 div，懒匹配会在第一个
 * </div> 就断开，块一多就会丢数据（实测两份笔记只解析出一份）。改成从开标签位置
 * 往下数 div 深度，回到 0 才结束。
 */
function extractMemoBlocks(html) {
  const blocks = [];
  const openRe = /<div\s+class="memo">/g;
  let m;
  while ((m = openRe.exec(html)) !== null) {
    const start = m.index + m[0].length;
    const tagRe = /<\/div\s*>|<div\b/g;
    tagRe.lastIndex = start;
    let depth = 1;
    let end = -1;
    let t;
    while ((t = tagRe.exec(html)) !== null) {
      if (t[0].startsWith("</")) {
        depth -= 1;
        if (depth === 0) {
          end = t.index;
          break;
        }
      } else {
        depth += 1;
      }
    }
    if (end < 0) end = html.length;
    blocks.push(html.slice(start, end));
    openRe.lastIndex = end;
  }
  return blocks;
}

/**
 * 提取时间
 */
function extractTime(block) {
  const match = block.match(/<div\s+class="time">(.*?)<\/div>/);
  return match ? match[1].trim() : "";
}

/**
 * 提取正文 HTML，去掉标签，保留纯文本
 */
function extractContent(block) {
  const match = block.match(/<div\s+class="content">(.*?)<\/div>/s);
  if (!match) return "";

  let html = match[1];
  // 替换 <br> 为换行
  html = html.replace(/<br\s*\/?>/gi, "\n");
  // 去掉其他 HTML 标签
  html = html.replace(/<[^>]+>/g, "");
  // 解码 HTML 实体
  html = html.replace(/&amp;/g, "&")
             .replace(/&lt;/g, "<")
             .replace(/&gt;/g, ">")
             .replace(/&quot;/g, "\"")
             .replace(/&#39;/g, "'")
             .replace(/&nbsp;/g, " ");
  // 压缩空白行
  html = html.replace(/\n{3,}/g, "\n\n").trim();

  return html;
}

/**
 * 从正文中提取 #标签，返回清理后的正文和标签列表
 */
function extractTags(content) {
  const tags = [];
  const cleaned = content.replace(/#([\u4e00-\u9fa5\w\/\-\.]+)/g, (_, tag) => {
    const cleanedTag = tag.trim();
    if (cleanedTag && !tags.includes(cleanedTag)) {
      tags.push(cleanedTag);
    }
    return "";
  });

  return {
    cleanContent: cleaned.replace(/\n{3,}/g, "\n\n").trim(),
    tags
  };
}

/**
 * 提取附件图片路径
 */
function extractImages(block) {
  const images = [];
  const regex = /<img\s+[^>]*src="([^"]+)"/g;
  let match;
  while ((match = regex.exec(block)) !== null) {
    images.push(match[1]);
  }
  return images;
}

/**
 * 为 memo 生成唯一 ID
 */
/**
 * 先认 flomo 自己的笔记 id：导出页里一般会带 memo_id 或链接。
 * 这样本地 id 跟线上就是同一个，改笔记不用再去搜一次猜 id。
 * 实在没有才退回自造 id。
 */
function extractUpstreamId(block) {
  const patterns = [
    /memo_id[=\s:"'&]+([A-Za-z0-9_-]{5,})/i,
    /data-(?:memo-)?id\s*=\s*"([^"]{5,})"/i,
    /\bid\s*=\s*"memo[-_]?([A-Za-z0-9_-]{5,})"/i,
    /href\s*=\s*"[^"]*\/(?:mine\/\?memo_id=|m\/)([A-Za-z0-9_-]{5,})/i,
  ];
  for (const re of patterns) {
    const m = String(block || "").match(re);
    if (m) return m[1];
  }
  return "";
}

function generateId(time, content) {
  const hash = simpleHash(content);
  return `${time}_${hash}`;
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).slice(0, 8);
}
