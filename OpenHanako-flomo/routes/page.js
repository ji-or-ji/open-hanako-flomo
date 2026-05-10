/**
 * routes/page.js - OpenHanako-flomo 页面路由
 *
 * 提供：
 * - GET  /page            配置页 + 搜索页前端
 * - GET  /api/config      读取配置
 * - POST /api/config      保存配置（webhook URL）
 * - POST /api/import      导入 flomo 导出 HTML
 * - GET  /api/memos       搜索/列出笔记
 * - GET  /api/tags        列出所有标签
 * - GET  /api/stats       笔记统计
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseFlomoExport } from "../lib/parse-export.js";

// ---------- 颜色主题 ----------
const THEME_CSS = `
  :root {
    --bg: #f5f5f0;
    --card: #ffffff;
    --text: #2c2c2c;
    --text-secondary: #787878;
    --border: #e8e8e0;
    --accent: #30cf79;
    --accent-hover: #28b868;
    --danger: #e74c3c;
    --tag-bg: #e8f5e9;
    --tag-text: #2e7d32;
    --shadow: 0 1px 4px rgba(0,0,0,0.06);
  }
`;

export default function registerPluginUiRoutes(app, ctx) {
  const dataDir = ctx.dataDir;
  mkdirSync(dataDir, { recursive: true });

  // ---- 前端页面（CSS 和 JS 内联，无需额外静态文件服务）----
  app.get("/page", (c) => {
    const theme = c.req.query("hana-theme") || "inherit";
    const base = `/api/plugins/${ctx.pluginId}`;

    return c.html(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenHanako-flomo</title>
  <style>${THEME_CSS}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,'Noto Sans SC',sans-serif;background:var(--bg);color:var(--text);line-height:1.6;padding:0;min-height:100vh}#app{max-width:720px;margin:0 auto;padding:24px 16px 64px}header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;gap:16px;flex-wrap:wrap}header h1{font-size:20px;font-weight:600;display:flex;align-items:center;gap:8px;color:var(--text)}nav{display:flex;gap:4px;background:var(--card);border-radius:8px;padding:3px;box-shadow:var(--shadow)}.tab-btn{background:none;border:none;padding:8px 16px;border-radius:6px;font-size:14px;cursor:pointer;color:var(--text-secondary);transition:all .15s}.tab-btn:hover{color:var(--text)}.tab-btn.active{background:var(--accent);color:#fff;font-weight:500}.tab-content{display:none}.tab-content.active{display:block}.card{background:var(--card);border-radius:10px;padding:20px;margin-bottom:16px;box-shadow:var(--shadow)}.card h2{font-size:16px;font-weight:600;margin-bottom:12px}.hint{font-size:13px;color:var(--text-secondary);margin-bottom:16px;line-height:1.7}label{display:block;margin-bottom:16px}label span{display:block;font-size:13px;font-weight:500;margin-bottom:6px;color:var(--text-secondary)}input[type="url"],input[type="text"],input[type="date"],select{width:100%;padding:10px 12px;border:1px solid var(--border);border-radius:6px;font-size:14px;background:var(--bg);color:var(--text);outline:none;transition:border-color .15s}input:focus,select:focus{border-color:var(--accent);box-shadow:0 0 0 2px rgba(48,207,121,.15)}.actions{display:flex;align-items:center;gap:12px}.btn-primary,.btn-secondary{padding:9px 20px;border:none;border-radius:6px;font-size:14px;font-weight:500;cursor:pointer;transition:all .15s}.btn-primary{background:var(--accent);color:#fff}.btn-primary:hover{background:var(--accent-hover)}.btn-secondary{background:var(--bg);color:var(--text);border:1px solid var(--border)}.btn-secondary:hover{background:var(--border)}.status{font-size:13px;color:var(--text-secondary)}.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}.dot-red{background:#e74c3c}.dot-green{background:#27ae60}.dot-yellow{background:#f39c12}.upload-area{border:2px dashed var(--border);border-radius:10px;padding:40px 20px;text-align:center;cursor:pointer;transition:all .15s}.upload-area:hover,.upload-area.dragover{border-color:var(--accent);background:rgba(48,207,121,.04)}.upload-area svg{display:block;margin:0 auto 12px;color:var(--text-secondary)}.upload-area p{font-size:14px;color:var(--text-secondary)}.search-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;align-items:center}.search-bar input[type="text"]{flex:1;min-width:160px}.search-bar input[type="date"]{width:auto;flex-shrink:0}.search-bar select{width:auto;min-width:120px;flex-shrink:0}#search-results,.memo-list{font-size:14px}.memo-item{padding:14px 0;border-bottom:1px solid var(--border)}.memo-item:last-child{border-bottom:none}.memo-time{font-size:12px;color:var(--text-secondary);margin-bottom:4px}.memo-content{line-height:1.7;white-space:pre-wrap;word-break:break-word}.memo-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.memo-tag{font-size:11px;padding:2px 8px;border-radius:4px;background:var(--tag-bg);color:var(--tag-text)}.memo-images{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}.memo-images img{max-width:120px;max-height:120px;border-radius:4px;border:1px solid var(--border)}.pagination{display:flex;justify-content:center;align-items:center;gap:12px;margin-top:16px;font-size:13px;color:var(--text-secondary)}.empty-state{text-align:center;padding:40px 20px;color:var(--text-secondary);font-size:14px}.error-state{color:var(--danger);font-size:14px}.loading{text-align:center;padding:20px;color:var(--text-secondary)}</style>
</head>
<body data-hana-theme="${escapeAttr(theme)}" data-surface="page">
  <div id="app">
    <header>
      <h1>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v16M4 12h16"/></svg>
        OpenHanako-flomo
      </h1>
      <nav>
        <button class="tab-btn active" data-tab="config">设置</button>
        <button class="tab-btn" data-tab="import">导入</button>
        <button class="tab-btn" data-tab="search">搜索</button>
      </nav>
    </header>
    <main>
      <!-- 设置 -->
      <section id="tab-config" class="tab-content active">
        <div class="card">
          <h2>Webhook 配置</h2>
          <p class="hint">填入 flomo 的 incoming webhook URL，用于写入笔记。</p>
          <label>
            <span>Webhook URL</span>
            <input type="url" id="webhook-url" placeholder="https://flomoapp.com/iwh/xxx/xxx/xxx/" />
          </label>
          <div class="actions">
            <button id="save-config" class="btn-primary">保存配置</button>
            <span id="config-status" class="status"></span>
          </div>
        </div>
        <div class="card">
          <h2>连接状态</h2>
          <div id="connection-status" style="display:flex;align-items:center;font-size:14px;">
            <span class="dot dot-red"></span>
            <span>未配置 webhook URL</span>
          </div>
          <div id="memo-stats" style="margin-top:12px;font-size:14px;color:var(--text-secondary);"></div>
        </div>
      </section>

      <!-- 导入 -->
      <section id="tab-import" class="tab-content">
        <div class="card">
          <h2>导入 flomo 导出文件</h2>
          <p class="hint">上传 flomo 设置页导出的 .html 文件，插件将解析并建立搜索索引。<br>
          导出路径：设置 → 导出数据 → 下载的 .zip 中的 HTML 文件。</p>
          <div class="upload-area" id="upload-area">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <p>拖入 .html 文件到此区域，或点击选择文件</p>
            <input type="file" id="file-input" accept=".html" hidden />
          </div>
          <div id="import-result" style="display:none;"></div>
        </div>
        <div class="card" id="import-preview-card" style="display:none;">
          <h2>导入预览</h2>
          <div id="import-preview"></div>
          <div class="actions" style="margin-top:12px;">
            <button id="confirm-import" class="btn-primary">确认导入</button>
            <button id="cancel-import" class="btn-secondary">取消</button>
          </div>
        </div>
      </section>

      <!-- 搜索 -->
      <section id="tab-search" class="tab-content">
        <div class="card">
          <h2>搜索笔记</h2>
          <div class="search-bar">
            <input type="text" id="search-query" placeholder="关键词..." />
            <select id="search-tag">
              <option value="">所有标签</option>
            </select>
            <input type="date" id="search-from" />
            <span style="color:var(--text-secondary);font-size:13px;">至</span>
            <input type="date" id="search-to" />
            <button id="search-btn" class="btn-primary">搜索</button>
          </div>
          <div id="search-results" class="memo-list"></div>
        </div>
      </section>
    </main>
  </div>
  <script type="module">
// Plugin UI 就绪信号
window.parent.postMessage({
  protocol: 'hana.plugin.ui',
  version: 1,
  kind: 'event',
  type: 'hana.ready'
}, '*');

const BASE = '${base}';
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let pendingImportMemos = null;

// ---- Tab 切换 ----
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.tab-btn').forEach(b => b.classList.remove('active'));
    $$('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ---- 加载配置 ----
async function loadConfig() {
  const res = await fetch(BASE + '/api/config');
  const config = await res.json();
  if (config.webhookUrl) {
    $('#webhook-url').value = config.webhookUrl;
    updateConnectionStatus(true);
  }
}

function updateConnectionStatus(hasWebhook) {
  const el = $('#connection-status');
  if (hasWebhook) {
    el.innerHTML = '<span class="dot dot-green"></span><span>Webhook 已配置，可写入笔记</span>';
  } else {
    el.innerHTML = '<span class="dot dot-red"></span><span>未配置 webhook URL</span>';
  }
}

async function loadStats() {
  const res = await fetch(BASE + '/api/stats');
  const stats = await res.json();
  $('#memo-stats').textContent = \`笔记库：\${stats.totalMemos} 条笔记，\${stats.totalTags} 个标签\`;
  if (stats.hasWebhook && !$('#webhook-url').value) {
    updateConnectionStatus(true);
  }
}

// ---- 保存配置 ----
$('#save-config').addEventListener('click', async () => {
  const url = $('#webhook-url').value.trim();
  const status = $('#config-status');
  if (!url) {
    status.textContent = '请输入 webhook URL';
    status.style.color = 'var(--danger)';
    return;
  }
  const res = await fetch(BASE + '/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ webhookUrl: url })
  });
  if (res.ok) {
    status.textContent = '已保存';
    status.style.color = 'var(--accent)';
    updateConnectionStatus(true);
  } else {
    status.textContent = '保存失败';
    status.style.color = 'var(--danger)';
  }
  setTimeout(() => status.textContent = '', 3000);
});

// ---- 文件上传 ----
const uploadArea = $('#upload-area');
const fileInput = $('#file-input');

uploadArea.addEventListener('click', () => fileInput.click());

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('dragover');
});
uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('dragover');
});
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

async function handleFile(file) {
  if (!file.name.endsWith('.html')) {
    showImportError('请上传 .html 文件');
    return;
  }
  $('#import-result').style.display = 'none';

  const text = await file.text();
  const res = await fetch(BASE + '/api/import-preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ html: text })
  });
  const data = await res.json();
  if (!data.ok) {
    showImportError(data.error);
    return;
  }

  pendingImportMemos = { html: text };

  // 显示预览
  const card = $('#import-preview-card');
  card.style.display = 'block';
  const preview = $('#import-preview');
  preview.innerHTML = \`<p style="margin-bottom:12px;font-size:14px;color:var(--text-secondary);">找到 <strong>\${data.total}</strong> 条笔记</p>\`;

  const list = document.createElement('div');
  list.className = 'memo-list';
  data.memos.slice(0, 10).forEach(m => {
    const item = document.createElement('div');
    item.className = 'memo-item';
    item.innerHTML = \`
      <div class="memo-time">\${m.time}</div>
      <div class="memo-content">\${escapeHtml(m.content.slice(0, 200))}\${m.content.length > 200 ? '...' : ''}</div>
      \${m.tags.length ? '<div class="memo-tags">' + m.tags.map(t => '<span class="memo-tag">' + escapeHtml(t) + '</span>').join('') + '</div>' : ''}
    \`;
    list.appendChild(item);
  });
  if (data.total > 10) {
    const more = document.createElement('p');
    more.style.cssText = 'text-align:center;padding:12px;font-size:13px;color:var(--text-secondary);';
    more.textContent = \`... 还有 \${data.total - 10} 条\`;
    list.appendChild(more);
  }
  preview.appendChild(list);
}

function showImportError(msg) {
  const el = $('#import-result');
  el.style.display = 'block';
  el.className = 'error-state';
  el.textContent = msg;
}

// ---- 确认导入 ----
$('#confirm-import').addEventListener('click', async () => {
  if (!pendingImportMemos) return;
  const btn = $('#confirm-import');
  btn.textContent = '导入中...';
  btn.disabled = true;

  const res = await fetch(BASE + '/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pendingImportMemos)
  });
  const data = await res.json();

  btn.textContent = '确认导入';
  btn.disabled = false;

  const el = $('#import-result');
  el.style.display = 'block';
  if (data.ok) {
    el.className = '';
    el.style.color = 'var(--accent)';
    el.textContent = \`导入完成：新增 \${data.added} 条，已存在 \${data.skipped} 条，共 \${data.total} 条笔记\`;
    $('#import-preview-card').style.display = 'none';
    pendingImportMemos = null;
    loadStats();
    loadTags();
  } else {
    el.className = 'error-state';
    el.textContent = data.error || '导入失败';
  }
});

$('#cancel-import').addEventListener('click', () => {
  $('#import-preview-card').style.display = 'none';
  pendingImportMemos = null;
});

// ---- 搜索 ----
let currentPage = 0;

async function loadTags() {
  const res = await fetch(BASE + '/api/tags');
  const data = await res.json();
  const select = $('#search-tag');
  select.innerHTML = '<option value="">所有标签</option>';
  data.tags.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    select.appendChild(opt);
  });
}

async function doSearch(page = 0) {
  const query = $('#search-query').value.trim();
  const tag = $('#search-tag').value;
  const from = $('#search-from').value;
  const to = $('#search-to').value;
  const limit = 20;

  const params = new URLSearchParams();
  if (query) params.set('query', query);
  if (tag) params.set('tag', tag);
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  params.set('limit', String(limit * (page + 1)));

  const res = await fetch(BASE + '/api/memos?' + params.toString());
  const data = await res.json();

  const container = $('#search-results');
  if (!data.memos || data.memos.length === 0) {
    container.innerHTML = '<div class="empty-state">未找到匹配的笔记</div>';
    return;
  }

  currentPage = page;
  let html = '';
  data.memos.forEach(m => {
    html += \`<div class="memo-item">
      <div class="memo-time">\${m.time}</div>
      <div class="memo-content">\${escapeHtml(m.content)}</div>
      \${m.tags.length ? '<div class="memo-tags">' + m.tags.map(t => '<span class="memo-tag">' + escapeHtml(t) + '</span>').join('') + '</div>' : ''}
      \${m.images.length ? '<div class="memo-images">' + m.images.map(img => '<img src="' + escapeAttr(img) + '" alt="memo image" />').join('') + '</div>' : ''}
    </div>\`;
  });

  const totalPages = Math.ceil(data.total / limit);
  if (totalPages > 1) {
    html += \`<div class="pagination">
      <button class="btn-secondary" \${page <= 0 ? 'disabled' : ''} onclick="doSearch(\${page - 1})">上一页</button>
      <span>\${page + 1} / \${totalPages}（共 \${data.total} 条）</span>
      <button class="btn-secondary" \${page >= totalPages - 1 ? 'disabled' : ''} onclick="doSearch(\${page + 1})">下一页</button>
    </div>\`;
  }

  container.innerHTML = html;
}

$('#search-btn').addEventListener('click', () => doSearch(0));

// 回车触发搜索
$('#search-query').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doSearch(0);
});

// ---- 工具函数 ----
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---- 初始化 ----
loadConfig();
loadStats();
loadTags();
  <\/script>
</body>
</html>`);
  });

  // ---- API: 获取配置 ----
  app.get("/api/config", (c) => {
    const config = loadConfig(dataDir);
    return c.json(config);
  });

  // ---- API: 保存配置 ----
  app.post("/api/config", async (c) => {
    const body = await c.req.json();
    const config = loadConfig(dataDir);
    if (body.webhookUrl !== undefined) config.webhookUrl = body.webhookUrl;
    saveConfig(dataDir, config);
    return c.json({ ok: true });
  });

  // ---- API: 导入 HTML ----
  app.post("/api/import", async (c) => {
    const body = await c.req.json();
    const html = body.html || "";

    if (!html.trim()) {
      return c.json({ ok: false, error: "HTML 内容为空" });
    }

    try {
      const memos = parseFlomoExport(html);

      // 去重：保留已有的 memo
      const existingPath = join(dataDir, "memos.json");
      let existing = [];
      if (existsSync(existingPath)) {
        try {
          existing = JSON.parse(readFileSync(existingPath, "utf-8"));
        } catch { /* ignore */ }
      }

      const existingIds = new Set(existing.map(m => m.id));
      const newMemos = memos.filter(m => !existingIds.has(m.id));
      const merged = [...existing, ...newMemos];

      // 按时间排序（新在前）
      merged.sort((a, b) => b.time.localeCompare(a.time));

      writeFileSync(existingPath, JSON.stringify(merged, null, 2), "utf-8");

      // 通知 index.js 刷新缓存
      try {
        await ctx.bus.request("openhanako-flomo:refresh-memos", {});
      } catch { /* 非 full-access 跳过 */ }

      return c.json({
        ok: true,
        total: merged.length,
        added: newMemos.length,
        skipped: existing.length
      });
    } catch (err) {
      return c.json({ ok: false, error: `解析失败：${err.message}` });
    }
  });

  // ---- API: 预览导入但不保存 ----
  app.post("/api/import-preview", async (c) => {
    const body = await c.req.json();
    const html = body.html || "";

    if (!html.trim()) {
      return c.json({ ok: false, error: "HTML 内容为空" });
    }

    try {
      const memos = parseFlomoExport(html);
      return c.json({ ok: true, memos: memos.slice(0, 50), total: memos.length });
    } catch (err) {
      return c.json({ ok: false, error: `解析失败：${err.message}` });
    }
  });

  // ---- API: 搜索笔记 ----
  app.get("/api/memos", (c) => {
    const memosPath = join(dataDir, "memos.json");
    let memos = [];
    if (existsSync(memosPath)) {
      try {
        memos = JSON.parse(readFileSync(memosPath, "utf-8"));
      } catch { /* ignore */ }
    }

    const query = (c.req.query("query") || "").trim().toLowerCase();
    const tag = (c.req.query("tag") || "").trim();
    const from = c.req.query("from") || "";
    const to = c.req.query("to") || "";
    const limit = Math.min(Math.max(parseInt(c.req.query("limit") || "50"), 1), 500);

    let results = memos;

    if (query) {
      results = results.filter(m =>
        m.content.toLowerCase().includes(query) ||
        m.tags.some(t => t.toLowerCase().includes(query))
      );
    }

    if (tag) {
      results = results.filter(m =>
        m.tags.some(t => t === tag || t.startsWith(tag + "/"))
      );
    }

    if (from) {
      results = results.filter(m => m.time >= from);
    }
    if (to) {
      results = results.filter(m => m.time <= to + " 23:59:59");
    }

    // 按时间倒序
    results.sort((a, b) => b.time.localeCompare(a.time));

    const total = results.length;
    results = results.slice(0, limit);

    return c.json({ memos: results, total });
  });

  // ---- API: 标签列表 ----
  app.get("/api/tags", (c) => {
    const memosPath = join(dataDir, "memos.json");
    let memos = [];
    if (existsSync(memosPath)) {
      try {
        memos = JSON.parse(readFileSync(memosPath, "utf-8"));
      } catch { /* ignore */ }
    }

    const tagSet = new Set();
    for (const m of memos) {
      for (const t of m.tags) tagSet.add(t);
    }

    const tags = [...tagSet].sort((a, b) => {
      // 按层级排序：顶层标签在前
      const aDepth = a.split("/").length;
      const bDepth = b.split("/").length;
      if (aDepth !== bDepth) return aDepth - bDepth;
      return a.localeCompare(b, "zh");
    });

    return c.json({ tags });
  });

  // ---- API: 统计 ----
  app.get("/api/stats", (c) => {
    const memosPath = join(dataDir, "memos.json");
    let memos = [];
    if (existsSync(memosPath)) {
      try {
        memos = JSON.parse(readFileSync(memosPath, "utf-8"));
      } catch { /* ignore */ }
    }

    const tagSet = new Set();
    for (const m of memos) {
      for (const t of m.tags) tagSet.add(t);
    }

    return c.json({
      totalMemos: memos.length,
      totalTags: tagSet.size,
      hasWebhook: !!loadConfig(dataDir).webhookUrl
    });
  });
}

function loadConfig(dataDir) {
  const configPath = join(dataDir, "config.json");
  if (existsSync(configPath)) {
    try {
      return JSON.parse(readFileSync(configPath, "utf-8"));
    } catch { /* ignore */ }
  }
  return {};
}

function saveConfig(dataDir, config) {
  const configPath = join(dataDir, "config.json");
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
}

function escapeAttr(str) {
  return String(str).replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
