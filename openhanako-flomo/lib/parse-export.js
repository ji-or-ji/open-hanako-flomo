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
      id: generateId(time, cleanContent),
      time,
      content: cleanContent,
      tags,
      images
    });
  }

  return memos;
}

/**
 * 用正则提取所有 <div class="memo">...</div> 块
 */
function extractMemoBlocks(html) {
  const blocks = [];
  const regex = /<div\s+class="memo">(.*?)<\/div>\s*\n?\s*(?=<div\s+class="memo">|$)/gs;
  let match;
  while ((match = regex.exec(html)) !== null) {
    blocks.push(match[1]);
  }

  // fallback: 如果上面的 regex 没匹配到，用简化方式
  if (blocks.length === 0) {
    const simpleRegex = /<div\s+class="memo">(.*?)<\/div>/gs;
    while ((match = simpleRegex.exec(html)) !== null) {
      blocks.push(match[1]);
    }
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
