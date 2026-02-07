const STATE_KEY = 'tukuyomi-2ch-state-v1';
const UI_MODE_KEY = 'tukuyomi-2ch-ui-mode';

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripHtml(html) {
  return String(html || '').replace(/<[^>]*>/g, '');
}

function parseTitleHtml(titleHtml) {
  const raw = String(titleHtml || '');
  const featured = raw.includes('gold-title');

  const subtitleMatch = raw.match(/<div\s+class="title-subtitle">\s*([\s\S]*?)\s*<\/div>/i);
  const subtitleText = subtitleMatch ? stripHtml(subtitleMatch[1]).trim() : '';
  const titleOnly = raw.replace(/<div\s+class="title-subtitle">[\s\S]*?<\/div>/i, '');
  const titleText = stripHtml(titleOnly).trim();
  return { titleText, subtitleText, featured };
}

function format2chDate(date) {
  const d = date instanceof Date ? date : new Date();
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  const pad2 = (n) => String(n).padStart(2, '0');
  const pad3 = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}(${weekday}) ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(Math.floor(d.getMilliseconds() / 10))}`;
}

function parseDateToMillis(dateStr) {
  const cleaned = String(dateStr || '').replace(/\([^)]+\)/, '').replace(/\.\d+$/, '');
  const ms = Date.parse(cleaned);
  return Number.isFinite(ms) ? ms : 0;
}

function normalizeIdPart(input) {
  const raw = String(input || '').trim();
  const part = raw.startsWith('ID:') ? raw.slice(3) : raw;
  return part.trim();
}

function generateRandomIdPart() {
  const bytes = new Uint8Array(8);
  (self.crypto || window.crypto).getRandomValues(bytes);
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('').toUpperCase();
}

function safeThreadId(input) {
  const id = String(input || '').trim();
  if (!id) return '';
  if (!/^[a-z0-9_-]+$/i.test(id)) return '';
  return id;
}

class App {
  constructor() {
    this.container = document.querySelector('.container');
    this.mode = 'index';
    this.currentThreadId = null;
    this.uiMode = this.loadUiMode();
    this.state = null;
    this._seedWaiter = null;
  }

  loadUiMode() {
    try {
      const m = localStorage.getItem(UI_MODE_KEY);
      return m === 'edit' ? 'edit' : 'view';
    } catch {
      return 'view';
    }
  }

  saveUiMode(mode) {
    this.uiMode = mode === 'edit' ? 'edit' : 'view';
    try {
      localStorage.setItem(UI_MODE_KEY, this.uiMode);
    } catch { }
  }

  loadState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.schemaVersion !== 1 || !Array.isArray(parsed.threads)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  saveState() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(this.state));
    } catch (e) {
      alert('保存失败：localStorage 可能已满或被禁用。');
      console.warn('Save failed:', e);
    }
  }

  async init() {
    const urlParams = new URLSearchParams(window.location.search);
    const threadId = urlParams.get('id');

    if (threadId) {
      this.mode = 'thread';
      this.currentThreadId = threadId;
    } else {
      this.mode = 'index';
      if (window.location.pathname.endsWith('thread.html')) {
        window.location.href = 'index.html';
        return;
      }
    }

    this.state = this.loadState();
    if (!this.state) {
      this.container.innerHTML = `<p>Loading data...</p>`;
      this.state = await this.seedFromFiles();
      this.saveState();
    }

    this.bindEvents();
    this.render();
  }

  async evalThreadScript(path, expectedFn) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Fetch failed: ${path} (${res.status})`);
      const code = await res.text();

      let captured = null;
      const app = {
        setThreadList: (data) => { captured = { fn: 'setThreadList', data }; },
        setThreadData: (data) => { captured = { fn: 'setThreadData', data }; }
      };

      // eslint-disable-next-line no-new-func
      new Function('app', code)(app);

      if (!captured || captured.fn !== expectedFn) {
        throw new Error(`Seed script did not call ${expectedFn}: ${path}`);
      }
      return captured.data;
    } catch (err) {
      return await this.evalThreadScriptByTag(path, expectedFn);
    }
  }

  evalThreadScriptByTag(path, expectedFn) {
    return new Promise((resolve, reject) => {
      const previousWaiter = this._seedWaiter;
      const timer = setTimeout(() => {
        this._seedWaiter = previousWaiter;
        reject(new Error(`Seed load timeout: ${path}`));
      }, 8000);

      this._seedWaiter = {
        expectedFn,
        resolve: (data) => {
          clearTimeout(timer);
          this._seedWaiter = previousWaiter;
          resolve(data);
        }
      };

      const script = document.createElement('script');
      script.src = path;
      script.onerror = () => {
        clearTimeout(timer);
        this._seedWaiter = previousWaiter;
        reject(new Error(`Failed to load seed script: ${path}`));
      };
      script.onload = () => {
        // Execution happens before onload; keep DOM tidy.
        try { script.remove(); } catch { }
      };
      document.body.appendChild(script);
    });
  }

  // Compatibility for file:// usage (threads/*.js call these).
  setThreadList(data) {
    if (this._seedWaiter && this._seedWaiter.expectedFn === 'setThreadList') {
      this._seedWaiter.resolve(data);
    }
  }

  setThreadData(data) {
    if (this._seedWaiter && this._seedWaiter.expectedFn === 'setThreadData') {
      this._seedWaiter.resolve(data);
    }
  }

  async seedFromFiles() {
    const list = await this.evalThreadScript('threads/index.js', 'setThreadList');
    const threads = [];

    for (const meta of list.threads || []) {
      const id = String(meta.id || '').trim();
      if (!id) continue;
      const threadData = await this.evalThreadScript(`threads/${id}.js`, 'setThreadData');

      const parsedTitle = parseTitleHtml(threadData.title || meta.title || '');
      const featured = Boolean(meta.title && String(meta.title).includes('gold-title')) || parsedTitle.featured;
      const posts = Array.isArray(threadData.posts) ? threadData.posts : [];

      const authors = {};
      const normalizedPosts = posts.map((p, idx) => {
        const number = Number.isFinite(p.number) ? p.number : (idx + 1);
        const name = String(p.name || '').trim() || '名無しさん';
        const date = String(p.date || '').trim() || format2chDate(new Date());
        const body = String(p.body || '');

        const seedId = normalizeIdPart(p.uid || '');
        const authorKey = seedId ? seedId : `author_${number}`;
        if (!authors[authorKey]) {
          authors[authorKey] = {
            uidMode: seedId ? 'custom' : 'random',
            uidValue: seedId || '',
            uidColor: ''
          };
        }

        return {
          number,
          name,
          authorKey,
          date,
          body,
          bodyColor: ''
        };
      });

      threads.push({
        id,
        titleText: parsedTitle.titleText || stripHtml(meta.title || id),
        subtitleText: parsedTitle.subtitleText || '',
        featured,
        listDate: String(meta.date || normalizedPosts[0]?.date || ''),
        posts: normalizedPosts,
        authors
      });
    }

    return {
      schemaVersion: 1,
      threads
    };
  }

  bindEvents() {
    if (this.container.dataset.bound) return;
    this.container.dataset.bound = '1';

    this.container.addEventListener('click', (e) => {
      const target = e.target;
      const actionEl = target.closest('[data-action]');
      if (!actionEl) return;
      e.preventDefault();

      const action = actionEl.dataset.action;
      if (action === 'toggle-mode') {
        this.saveUiMode(this.uiMode === 'edit' ? 'view' : 'edit');
        this.render();
        return;
      }

      if (action === 'edit-thread') {
        this.fillThreadForm(actionEl.dataset.threadId || '');
        return;
      }
      if (action === 'delete-thread') {
        this.deleteThread(actionEl.dataset.threadId || '');
        return;
      }
      if (action === 'edit-post') {
        this.fillPostForm(Number(actionEl.dataset.postNumber || '0'));
        return;
      }
      if (action === 'delete-post') {
        this.deletePost(Number(actionEl.dataset.postNumber || '0'));
        return;
      }
      if (action === 'cancel-thread-form') {
        this.resetThreadForm();
        return;
      }
      if (action === 'cancel-post-form') {
        this.resetPostForm();
        return;
      }
    });

    this.container.addEventListener('submit', (e) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.id === 'thread-form') {
        e.preventDefault();
        this.submitThreadForm(form);
        return;
      }
      if (form.id === 'post-form') {
        e.preventDefault();
        this.submitPostForm(form);
        return;
      }
    });

    this.container.addEventListener('change', (e) => {
      const el = e.target;
      if (!(el instanceof HTMLSelectElement)) return;
      if (el.id === 'post-uid-mode') {
        const wrap = this.container.querySelector('#post-uid-value-wrap');
        if (wrap) {
          wrap.style.display = el.value === 'custom' ? 'block' : 'none';
        }
      }
    });
  }

  getSortedThreads() {
    const threads = [...(this.state.threads || [])];
    threads.sort((a, b) => {
      if (a.id === 'intro') return -1;
      if (b.id === 'intro') return 1;
      return parseDateToMillis(b.listDate) - parseDateToMillis(a.listDate);
    });
    return threads;
  }

  getThread(threadId) {
    return (this.state.threads || []).find((t) => t.id === threadId) || null;
  }

  render() {
    if (this.mode === 'thread') {
      this.renderThread(this.currentThreadId);
    } else {
      this.renderIndex();
    }
  }

  renderIndex() {
    const threads = this.getSortedThreads();
    const isEdit = this.uiMode === 'edit';

    const rows = threads.map((t) => {
      const titleHtml = t.featured
        ? `<span class="gold-title">${escapeHtml(t.titleText)}</span>`
        : escapeHtml(t.titleText);

      const count = Array.isArray(t.posts) ? t.posts.length : 0;
      const date = this.convertToJapaneseDate(t.listDate || '');

      const editActions = isEdit
        ? ` <span class="edit-actions">[<a href="#" data-action="edit-thread" data-thread-id="${escapeHtml(t.id)}">编辑</a>] [<a href="#" data-action="delete-thread" data-thread-id="${escapeHtml(t.id)}">删除</a>]</span>`
        : '';

      return `
        <tr>
          <td>
            <a href="thread.html?id=${encodeURIComponent(t.id)}">${titleHtml} (${count})</a>${editActions}
          </td>
          <td style="white-space:nowrap; text-align:right; color:#666;">${date}</td>
        </tr>
      `;
    }).join('');

    const threadEditor = isEdit
      ? `
        <form id="thread-form" class="editor-box" autocomplete="off">
          <input type="hidden" id="thread-form-mode" value="create" />
          <div class="editor-grid">
            <label>
              <span class="label">Thread ID</span>
              <input id="thread-id" name="id" placeholder="e.g. my_thread" />
            </label>
            <label>
              <span class="label">标题</span>
              <input id="thread-title" name="title" placeholder="标题" />
            </label>
            <label>
              <span class="label">副标题(可选)</span>
              <input id="thread-subtitle" name="subtitle" placeholder="副标题" />
            </label>
            <label class="inline">
              <input id="thread-featured" name="featured" type="checkbox" />
              <span>加精(良スレ)</span>
            </label>
          </div>
          <div class="editor-actions">
            <button type="submit">保存</button>
            <button type="button" data-action="cancel-thread-form">取消</button>
          </div>
          <div class="hint">说明：Thread ID 只允许字母数字、下划线和短横线。</div>
        </form>
      `
      : '';

    this.container.innerHTML = `
      <header class="site-header">
        <h1 class="site-title">所长的谣言板</h1>
        <div class="site-nav">
          <a href="../hub/">Hub</a><span class="sep">|</span><a href="../">Twitter</a>
          <span class="sep">|</span>
          <a href="#" data-action="toggle-mode">${isEdit ? '查看模式' : '编辑模式'}</a>
        </div>
      </header>
      ${threadEditor}
      <div style="padding: 10px;">
        <table class="thread-table">
          <thead>
            <tr><th colspan="2" class="section-header">近期热帖</th></tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="2" style="color:#666;">(空)</td></tr>'}
          </tbody>
        </table>
      </div>
    `;

    document.title = '所长的谣言板';
  }

  renderThread(threadId) {
    const thread = this.getThread(threadId);
    const isEdit = this.uiMode === 'edit';

    if (!thread) {
      this.container.innerHTML = `
        <div class="site-header">
          <div class="site-nav">
            <a href="index.html" style="text-decoration:none; color: #CC0000;">&lt; 戻る</a>
            <span class="sep">|</span>
            <a href="../hub/">Hub</a><span class="sep">|</span><a href="../">Twitter</a>
          </div>
        </div>
        <p style="padding: 10px; color:#666;">Thread not found: ${escapeHtml(threadId)}</p>
      `;
      document.title = 'Thread not found';
      return;
    }

    const titleHtml = (() => {
      const main = thread.featured
        ? `<span class="gold-title">${escapeHtml(thread.titleText)}</span>`
        : escapeHtml(thread.titleText);
      const sub = thread.subtitleText ? `<div class="title-subtitle">${escapeHtml(thread.subtitleText)}</div>` : '';
      return `${main}${sub}`;
    })();

    const posts = Array.isArray(thread.posts) ? thread.posts : [];
    const postCards = posts.map((post) => {
      const uidInfo = this.getAuthorUid(thread, post.authorKey);
      const uidColor = uidInfo.color ? ` style="color:${escapeHtml(uidInfo.color)}"` : '';
      const bodyColor = post.bodyColor ? ` style="color:${escapeHtml(post.bodyColor)}"` : '';

      const processedBody = this.processBody(post.body);
      const controls = isEdit
        ? ` <span class="edit-actions">[<a href="#" data-action="edit-post" data-post-number="${post.number}">编辑</a>] [<a href="#" data-action="delete-post" data-post-number="${post.number}">删除</a>]</span>`
        : '';

      return `
        <div class="post" id="post-${post.number}">
          <div class="post-meta">
            <span class="post-number">${post.number}</span> ：
            <span class="post-name"><b>${escapeHtml(post.name)}</b></span>
            <span class="post-date">${this.convertToJapaneseDate(post.date)}</span>
            <span class="post-uid"${uidColor}>${escapeHtml(uidInfo.uid)}</span>
            ${controls}
          </div>
          <div class="post-body"${bodyColor}>${processedBody}</div>
        </div>
      `;
    }).join('');

    const postEditor = isEdit
      ? `
        <form id="post-form" class="editor-box" autocomplete="off">
          <input type="hidden" id="post-form-mode" value="create" />
          <input type="hidden" id="post-number" name="number" value="" />
          <div class="editor-grid">
            <label>
              <span class="label">姓名</span>
              <input id="post-name" name="name" placeholder="名無しさん" />
            </label>
            <label>
              <span class="label">发言人标记(authorKey)</span>
              <input id="post-author-key" name="authorKey" placeholder="A / B / C ..." />
            </label>
            <label>
              <span class="label">ID 模式</span>
              <select id="post-uid-mode" name="uidMode">
                <option value="random">随机(同贴固定)</option>
                <option value="custom">自定义</option>
              </select>
            </label>
            <label id="post-uid-value-wrap" style="display:none;">
              <span class="label">自定义 ID</span>
              <input id="post-uid-value" name="uidValue" placeholder="例如 AbCdEf12" />
            </label>
            <label>
              <span class="label">ID 颜色(可选)</span>
              <input id="post-uid-color" name="uidColor" placeholder="#666666" />
            </label>
            <label>
              <span class="label">正文颜色(可选)</span>
              <input id="post-body-color" name="bodyColor" placeholder="#000000" />
            </label>
            <label class="full">
              <span class="label">日期</span>
              <input id="post-date" name="date" />
            </label>
            <label class="full">
              <span class="label">正文</span>
              <textarea id="post-body" name="body" rows="6" placeholder="正文..."></textarea>
            </label>
          </div>
          <div class="editor-actions">
            <button type="submit">保存楼层</button>
            <button type="button" data-action="cancel-post-form">取消</button>
          </div>
          <div class="hint">提示：支持锚点 <code>&gt;&gt;1</code> 与 <code>&lt;div class=&quot;fake-trans&quot;&gt;</code> 翻译块。</div>
        </form>
      `
      : '';

    this.container.innerHTML = `
      <div class="site-header">
        <div class="site-nav">
          <a href="index.html" style="text-decoration:none; color: #CC0000;">&lt; 戻る</a>
          <span class="sep">|</span>
          <a href="../hub/">Hub</a><span class="sep">|</span><a href="../">Twitter</a>
          <span class="sep">|</span>
          <a href="#" data-action="toggle-mode">${isEdit ? '查看模式' : '编辑模式'}</a>
        </div>
      </div>
      <h1 class="thread-title">${titleHtml}</h1>
      <hr class="title-divider" />
      <div class="posts">${postCards || '<p style="color:#666;">(空)</p>'}</div>
      <div class="thread-footer">
        <a href="#" onclick="return false;">全部読む</a>
        <a href="#" onclick="return false;">最新50</a>
        <a href="#" onclick="return false;">1-100</a>
        <a href="index.html">この板の主なスレッド一覧</a>
        <a href="#" onclick="location.reload(); return false;">リロード</a>
      </div>
      ${postEditor}
    `;

    document.title = stripHtml(thread.titleText || threadId);

    if (isEdit) {
      // Default form values for "create post"
      this.resetPostForm();
    }
  }

  fillThreadForm(threadId) {
    const thread = this.getThread(threadId);
    if (!thread) return;
    const modeEl = this.container.querySelector('#thread-form-mode');
    const idEl = this.container.querySelector('#thread-id');
    const titleEl = this.container.querySelector('#thread-title');
    const subtitleEl = this.container.querySelector('#thread-subtitle');
    const featuredEl = this.container.querySelector('#thread-featured');
    if (!modeEl || !idEl || !titleEl || !subtitleEl || !featuredEl) return;

    modeEl.value = 'edit';
    idEl.value = thread.id;
    idEl.disabled = true;
    titleEl.value = thread.titleText || '';
    subtitleEl.value = thread.subtitleText || '';
    featuredEl.checked = Boolean(thread.featured);
  }

  resetThreadForm() {
    const modeEl = this.container.querySelector('#thread-form-mode');
    const idEl = this.container.querySelector('#thread-id');
    const titleEl = this.container.querySelector('#thread-title');
    const subtitleEl = this.container.querySelector('#thread-subtitle');
    const featuredEl = this.container.querySelector('#thread-featured');
    if (!modeEl || !idEl || !titleEl || !subtitleEl || !featuredEl) return;

    modeEl.value = 'create';
    idEl.disabled = false;
    idEl.value = '';
    titleEl.value = '';
    subtitleEl.value = '';
    featuredEl.checked = false;
  }

  submitThreadForm(form) {
    const mode = (form.querySelector('#thread-form-mode')?.value || 'create').trim();
    const id = safeThreadId(form.querySelector('#thread-id')?.value || '');
    const titleText = String(form.querySelector('#thread-title')?.value || '').trim();
    const subtitleText = String(form.querySelector('#thread-subtitle')?.value || '').trim();
    const featured = Boolean(form.querySelector('#thread-featured')?.checked);

    if (mode === 'create') {
      if (!id) {
        alert('Thread ID 不合法。');
        return;
      }
      if (this.getThread(id)) {
        alert('Thread ID 已存在。');
        return;
      }
      if (!titleText) {
        alert('标题不能为空。');
        return;
      }
      this.state.threads.push({
        id,
        titleText,
        subtitleText,
        featured,
        listDate: format2chDate(new Date()),
        posts: [],
        authors: {}
      });
      this.saveState();
      this.resetThreadForm();
      this.renderIndex();
      return;
    }

    // Edit existing
    const thread = this.getThread(id);
    if (!thread) return;
    if (!titleText) {
      alert('标题不能为空。');
      return;
    }
    thread.titleText = titleText;
    thread.subtitleText = subtitleText;
    thread.featured = featured;
    this.saveState();
    this.resetThreadForm();
    this.renderIndex();
  }

  deleteThread(threadId) {
    const thread = this.getThread(threadId);
    if (!thread) return;
    if (!confirm(`确定删除 thread: ${threadId} ?`)) return;
    this.state.threads = (this.state.threads || []).filter((t) => t.id !== threadId);
    this.saveState();
    this.renderIndex();
  }

  fillPostForm(postNumber) {
    const thread = this.getThread(this.currentThreadId);
    if (!thread) return;
    const post = (thread.posts || []).find((p) => p.number === postNumber);
    if (!post) return;

    const modeEl = this.container.querySelector('#post-form-mode');
    const numberEl = this.container.querySelector('#post-number');
    const nameEl = this.container.querySelector('#post-name');
    const authorEl = this.container.querySelector('#post-author-key');
    const uidModeEl = this.container.querySelector('#post-uid-mode');
    const uidValueEl = this.container.querySelector('#post-uid-value');
    const uidColorEl = this.container.querySelector('#post-uid-color');
    const bodyColorEl = this.container.querySelector('#post-body-color');
    const dateEl = this.container.querySelector('#post-date');
    const bodyEl = this.container.querySelector('#post-body');
    if (!modeEl || !numberEl || !nameEl || !authorEl || !uidModeEl || !uidValueEl || !uidColorEl || !bodyColorEl || !dateEl || !bodyEl) return;

    const authorKey = String(post.authorKey || '').trim() || 'A';
    const author = (thread.authors || {})[authorKey] || { uidMode: 'random', uidValue: '', uidColor: '' };

    modeEl.value = 'edit';
    numberEl.value = String(post.number);
    nameEl.value = post.name || '';
    authorEl.value = authorKey;
    uidModeEl.value = author.uidMode === 'custom' ? 'custom' : 'random';
    uidValueEl.value = author.uidValue || '';
    uidColorEl.value = author.uidColor || '';
    bodyColorEl.value = post.bodyColor || '';
    dateEl.value = post.date || '';
    bodyEl.value = post.body || '';

    const wrap = this.container.querySelector('#post-uid-value-wrap');
    if (wrap) wrap.style.display = uidModeEl.value === 'custom' ? 'block' : 'none';
  }

  resetPostForm() {
    const modeEl = this.container.querySelector('#post-form-mode');
    const numberEl = this.container.querySelector('#post-number');
    const nameEl = this.container.querySelector('#post-name');
    const authorEl = this.container.querySelector('#post-author-key');
    const uidModeEl = this.container.querySelector('#post-uid-mode');
    const uidValueEl = this.container.querySelector('#post-uid-value');
    const uidColorEl = this.container.querySelector('#post-uid-color');
    const bodyColorEl = this.container.querySelector('#post-body-color');
    const dateEl = this.container.querySelector('#post-date');
    const bodyEl = this.container.querySelector('#post-body');
    if (!modeEl || !numberEl || !nameEl || !authorEl || !uidModeEl || !uidValueEl || !uidColorEl || !bodyColorEl || !dateEl || !bodyEl) return;

    modeEl.value = 'create';
    numberEl.value = '';
    nameEl.value = '';
    authorEl.value = 'A';
    uidModeEl.value = 'random';
    uidValueEl.value = '';
    uidColorEl.value = '';
    bodyColorEl.value = '';
    dateEl.value = format2chDate(new Date());
    bodyEl.value = '';

    const wrap = this.container.querySelector('#post-uid-value-wrap');
    if (wrap) wrap.style.display = 'none';
  }

  submitPostForm(form) {
    const thread = this.getThread(this.currentThreadId);
    if (!thread) return;

    const mode = (form.querySelector('#post-form-mode')?.value || 'create').trim();
    const numberRaw = Number(form.querySelector('#post-number')?.value || '0');
    const name = String(form.querySelector('#post-name')?.value || '').trim() || '名無しさん';
    const authorKey = String(form.querySelector('#post-author-key')?.value || '').trim() || 'A';
    const uidMode = String(form.querySelector('#post-uid-mode')?.value || 'random') === 'custom' ? 'custom' : 'random';
    const uidValue = normalizeIdPart(form.querySelector('#post-uid-value')?.value || '');
    const uidColor = String(form.querySelector('#post-uid-color')?.value || '').trim();
    const bodyColor = String(form.querySelector('#post-body-color')?.value || '').trim();
    const date = String(form.querySelector('#post-date')?.value || '').trim() || format2chDate(new Date());
    const body = String(form.querySelector('#post-body')?.value || '');

    if (!body.trim()) {
      alert('正文不能为空。');
      return;
    }
    if (uidMode === 'custom' && !uidValue) {
      alert('自定义 ID 不能为空。');
      return;
    }

    if (!thread.authors) thread.authors = {};
    const author = thread.authors[authorKey] || { uidMode: 'random', uidValue: '', uidColor: '' };
    author.uidMode = uidMode;
    author.uidValue = uidMode === 'custom' ? uidValue : (author.uidValue || generateRandomIdPart());
    author.uidColor = uidColor;
    thread.authors[authorKey] = author;

    if (mode === 'create') {
      const nextNumber = Math.max(0, ...(thread.posts || []).map((p) => p.number || 0)) + 1;
      thread.posts.push({
        number: nextNumber,
        name,
        authorKey,
        date,
        body,
        bodyColor
      });
      thread.listDate = date;
      this.saveState();
      this.resetPostForm();
      this.renderThread(thread.id);
      return;
    }

    const post = (thread.posts || []).find((p) => p.number === numberRaw);
    if (!post) return;
    post.name = name;
    post.authorKey = authorKey;
    post.date = date;
    post.body = body;
    post.bodyColor = bodyColor;
    thread.listDate = date;
    this.saveState();
    this.resetPostForm();
    this.renderThread(thread.id);
  }

  deletePost(postNumber) {
    const thread = this.getThread(this.currentThreadId);
    if (!thread) return;
    const post = (thread.posts || []).find((p) => p.number === postNumber);
    if (!post) return;
    if (!confirm(`确定删除楼层 #${postNumber} ?`)) return;

    thread.posts = (thread.posts || []).filter((p) => p.number !== postNumber);
    // Renumber to keep it simple.
    thread.posts.forEach((p, idx) => { p.number = idx + 1; });
    thread.listDate = thread.posts.length ? thread.posts[thread.posts.length - 1].date : format2chDate(new Date());
    this.saveState();
    this.resetPostForm();
    this.renderThread(thread.id);
  }

  getAuthorUid(thread, authorKey) {
    const key = String(authorKey || '').trim() || 'A';
    if (!thread.authors) thread.authors = {};
    const author = thread.authors[key] || { uidMode: 'random', uidValue: '', uidColor: '' };
    if (author.uidMode === 'custom') {
      const part = normalizeIdPart(author.uidValue || '');
      return { uid: `ID:${part}`, color: author.uidColor || '' };
    }
    if (!author.uidValue) {
      author.uidValue = generateRandomIdPart();
      thread.authors[key] = author;
      this.saveState();
    }
    return { uid: `ID:${author.uidValue}`, color: author.uidColor || '' };
  }

  processBody(text) {
    if (!text) return '';

    // 1. Remove newlines before <div class="fake-trans"> to prevent huge gaps
    let result = String(text).replace(/[\n\r\s]+(<div class="fake-trans">)/g, '$1');

    // 2. Newlines to <br> (for the rest of the text)
    result = result.replace(/\n/g, '<br>');

    // 3. Anchor Links (>>1)
    result = result.replace(/(&gt;&gt;|>>)(\d+)/g, (match, p1, p2) => {
      return `<span class="anchor-link" onclick="app.scrollToPost(${p2})">&gt;&gt;${p2}</span>`;
    });

    return result;
  }

  convertToJapaneseDate(dateStr) {
    if (!dateStr) return '';
    const weekdayMap = {
      'Mon': '月',
      'Tue': '火',
      'Wed': '水',
      'Thu': '木',
      'Fri': '金',
      'Sat': '土',
      'Sun': '日'
    };
    return String(dateStr).replace(/\((Mon|Tue|Wed|Thu|Fri|Sat|Sun)\)/g, (match, day) => {
      return `(${weekdayMap[day]})`;
    });
  }

  scrollToPost(num) {
    const el = document.getElementById(`post-${num}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el.style.backgroundColor = '#FFFFCC';
      setTimeout(() => { el.style.backgroundColor = 'transparent'; }, 2000);
    }
  }
}

window.app = new App();
document.addEventListener('DOMContentLoaded', () => {
  window.app.init().catch((e) => {
    console.error(e);
    document.querySelector('.container').innerHTML = `<p style="color:red">Error: ${escapeHtml(e.message || String(e))}</p>`;
  });
});
