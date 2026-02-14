const STATE_KEY = 'tukuyomi-2ch-state-v1';
const UI_MODE_KEY = 'tukuyomi-2ch-ui-mode';
const STATE_SCHEMA_VERSION = 2;
const DATA_VERSION = 1;
const INTRO_THREAD_ID = 'intro';
const APP_STATE_DB_NAME = 'Tukuyomi2chDB';
const APP_STATE_DB_VERSION = 1;
const APP_STATE_STORE = 'appState';
const APP_STATE_RECORD_KEY = 'current';
const APP_BUILD_TAG = 'b20260214-2';

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

function normalizeSubtitleText(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  const wrappedMatch = raw.match(/^[（(]\s*([\s\S]*?)\s*[）)]$/);
  return wrappedMatch ? wrappedMatch[1].trim() : raw;
}

function parseTitleHtml(titleHtml) {
  const raw = String(titleHtml || '');
  const featured = raw.includes('gold-title');

  const subtitleMatch = raw.match(/<div\s+class="title-subtitle">\s*([\s\S]*?)\s*<\/div>/i);
  const subtitleText = subtitleMatch ? normalizeSubtitleText(stripHtml(subtitleMatch[1])) : '';
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

function normalizeThreadIdentifier(input) {
  if (input === null || input === undefined) return '';
  return String(input).trim();
}



function cloneDeep(obj) {
  return JSON.parse(JSON.stringify(obj));
}

class App {
  constructor() {
    this.container = document.querySelector('.container');
    this.mode = 'index';
    this.currentThreadId = null;
    this.editingPostNumber = null;
    this.uiMode = this.loadUiMode();
    this.state = null;
    this._dbPromise = null;
    this._persistQueue = Promise.resolve();
    this._seedWaiter = null;
    this._seedWaiters = new Map();
    this._threadSeedPromises = new Map();
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

  normalizeStateShape(raw) {
    if (!raw || !Array.isArray(raw.threads)) return null;
    const normalizedThreads = raw.threads
      .map((thread) => {
        if (!thread || typeof thread !== 'object') return null;
        const normalized = cloneDeep(thread);
        normalized.id = normalizeThreadIdentifier(normalized.id);
        if (!normalized.id) return null;
        normalized.titleText = String(normalized.titleText || '').trim();
        normalized.subtitleText = normalizeSubtitleText(normalized.subtitleText);
        return normalized;
      })
      .filter(Boolean);
    return {
      schemaVersion: STATE_SCHEMA_VERSION,
      dataVersion: Number.isFinite(raw.dataVersion) ? raw.dataVersion : 0,
      threads: normalizedThreads
    };
  }

  mergePosts(defaultPosts, savedPosts) {
    const base = Array.isArray(defaultPosts) ? defaultPosts : [];
    const saved = Array.isArray(savedPosts) ? savedPosts : [];
    const savedMap = new Map(saved.map((post) => [Number(post?.number || 0), post]));
    const merged = [];

    for (const post of base) {
      const number = Number(post?.number || 0);
      const savedPost = savedMap.get(number);
      merged.push(savedPost ? { ...cloneDeep(post), ...cloneDeep(savedPost) } : cloneDeep(post));
    }

    const baseNumbers = new Set(base.map((post) => Number(post?.number || 0)));
    for (const post of saved) {
      const number = Number(post?.number || 0);
      if (!baseNumbers.has(number)) {
        merged.push(cloneDeep(post));
      }
    }

    merged.sort((a, b) => Number(a?.number || 0) - Number(b?.number || 0));
    return merged;
  }

  mergeIntroThread(defaultThread, savedThread) {
    const baseThread = cloneDeep(defaultThread || {});
    if (!savedThread) return baseThread;

    const basePosts = Array.isArray(defaultThread?.posts) ? defaultThread.posts : [];
    const savedPosts = Array.isArray(savedThread?.posts) ? savedThread.posts : [];
    const baseNumbers = new Set(basePosts.map((post) => Number(post?.number || 0)));
    const extraPosts = savedPosts
      .filter((post) => !baseNumbers.has(Number(post?.number || 0)))
      .map((post) => cloneDeep(post));

    baseThread.posts = [...cloneDeep(basePosts), ...extraPosts];
    baseThread.posts.sort((a, b) => Number(a?.number || 0) - Number(b?.number || 0));
    baseThread.authors = {
      ...(defaultThread?.authors || {}),
      ...(savedThread?.authors || {})
    };
    return baseThread;
  }

  mergeThreads(defaultThreads, savedThreads) {
    const base = Array.isArray(defaultThreads) ? defaultThreads : [];
    const saved = Array.isArray(savedThreads) ? savedThreads : [];
    const savedMap = new Map(saved.map((thread) => [String(thread?.id || ''), thread]));
    const merged = [];

    for (const thread of base) {
      const id = String(thread?.id || '');
      const savedThread = savedMap.get(id);
      if (!savedThread) {
        merged.push(cloneDeep(thread));
        continue;
      }

      if (id === INTRO_THREAD_ID) {
        merged.push(this.mergeIntroThread(thread, savedThread));
        continue;
      }

      const next = { ...cloneDeep(thread), ...cloneDeep(savedThread) };
      next.posts = this.mergePosts(thread.posts, savedThread.posts);
      next.authors = { ...(thread.authors || {}), ...(savedThread.authors || {}) };
      merged.push(next);
    }

    const baseIds = new Set(base.map((thread) => String(thread?.id || '')));
    for (const thread of saved) {
      const id = String(thread?.id || '');
      if (!baseIds.has(id)) {
        merged.push(cloneDeep(thread));
      }
    }
    return merged;
  }

  mergeState(defaultState, savedState) {
    const base = this.normalizeStateShape(defaultState) || { schemaVersion: STATE_SCHEMA_VERSION, dataVersion: DATA_VERSION, threads: [] };
    const saved = this.normalizeStateShape(savedState);
    if (!saved) return base;
    return {
      schemaVersion: STATE_SCHEMA_VERSION,
      dataVersion: DATA_VERSION,
      threads: this.mergeThreads(base.threads, saved.threads)
    };
  }

  readLegacyStateFromLocalStorage() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  clearLegacyStateFromLocalStorage() {
    try {
      localStorage.removeItem(STATE_KEY);
    } catch { }
  }

  async openStateDb() {
    if (this._dbPromise) return this._dbPromise;
    if (!window.indexedDB) return null;

    this._dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(APP_STATE_DB_NAME, APP_STATE_DB_VERSION);
      req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(APP_STATE_STORE)) {
          db.createObjectStore(APP_STATE_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
    }).catch((err) => {
      console.warn('IndexedDB unavailable, fallback to localStorage:', err);
      return null;
    });

    return this._dbPromise;
  }

  async readStateFromIndexedDb() {
    const db = await this.openStateDb();
    if (!db) return null;
    return await new Promise((resolve) => {
      const tx = db.transaction([APP_STATE_STORE], 'readonly');
      const store = tx.objectStore(APP_STATE_STORE);
      const req = store.get(APP_STATE_RECORD_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  }

  async writeStateToIndexedDb(state) {
    const db = await this.openStateDb();
    if (!db) return false;
    return await new Promise((resolve) => {
      const tx = db.transaction([APP_STATE_STORE], 'readwrite');
      const store = tx.objectStore(APP_STATE_STORE);
      const req = store.put(cloneDeep(state), APP_STATE_RECORD_KEY);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  }

  async loadState(defaultState) {
    const baseState = this.normalizeStateShape(defaultState) || { schemaVersion: STATE_SCHEMA_VERSION, dataVersion: DATA_VERSION, threads: [] };
    let fromLegacy = false;

    let persisted = await this.readStateFromIndexedDb();
    if (!persisted) {
      persisted = this.readLegacyStateFromLocalStorage();
      fromLegacy = Boolean(persisted);
    }

    const savedState = this.normalizeStateShape(persisted);
    let nextState = baseState;
    if (savedState) {
      nextState = this.mergeState(baseState, savedState);
    }

    nextState.schemaVersion = STATE_SCHEMA_VERSION;
    nextState.dataVersion = DATA_VERSION;
    this.state = nextState;
    this.saveState();

    if (fromLegacy) {
      this.clearLegacyStateFromLocalStorage();
    }

    return nextState;
  }

  saveState() {
    const snapshot = cloneDeep(this.state || { schemaVersion: STATE_SCHEMA_VERSION, dataVersion: DATA_VERSION, threads: [] });
    this._persistQueue = this._persistQueue
      .then(async () => {
        const ok = await this.writeStateToIndexedDb(snapshot);
        if (!ok) {
          localStorage.setItem(STATE_KEY, JSON.stringify(snapshot));
          return;
        }
        this.clearLegacyStateFromLocalStorage();
      })
      .catch((e) => {
        console.warn('Save failed:', e);
        try {
          localStorage.setItem(STATE_KEY, JSON.stringify(snapshot));
        } catch (fallbackErr) {
          console.warn('Fallback localStorage save failed:', fallbackErr);
        }
      });
  }

  parseLegacyCreateRequest(urlParams) {
    if (!(urlParams instanceof URLSearchParams)) return null;

    // Legacy fallback: native GET submit from thread form produced ?id=&title=&subtitle=
    const id = safeThreadId(normalizeThreadIdentifier(urlParams.get('id')));
    const hasTitleParam = urlParams.has('title');
    const titleText = String(urlParams.get('title') || '').trim();
    const subtitleText = normalizeSubtitleText(urlParams.get('subtitle'));

    if (!id || !hasTitleParam || !titleText) return null;
    return { id, titleText, subtitleText };
  }

  applyLegacyCreateRequest(request) {
    if (!request || !request.id) return;

    let changed = false;
    let thread = this.getThread(request.id);
    if (!thread) {
      this.state.threads.push({
        id: request.id,
        titleText: request.titleText,
        subtitleText: request.subtitleText || '',
        featured: false,
        listDate: format2chDate(new Date()),
        posts: [],
        authors: {},
        seedLoaded: true,
        seedCount: 0,
        seedSource: 'local'
      });
      changed = true;
      thread = this.getThread(request.id);
    }

    if (changed) {
      this.saveState();
    }

    this.mode = 'thread';
    this.currentThreadId = request.id;
    this.editingPostNumber = null;

    const targetUrl = `thread.html?id=${encodeURIComponent(request.id)}`;
    try {
      window.history.replaceState(null, '', targetUrl);
    } catch {
      window.location.href = targetUrl;
    }
  }

  async init() {
    const urlParams = new URLSearchParams(window.location.search);
    const legacyCreateRequest = this.parseLegacyCreateRequest(urlParams);
    const threadId = normalizeThreadIdentifier(urlParams.get('id'));

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

    this.container.innerHTML = `<p>Loading data...</p>`;
    const defaultState = await this.seedFromFiles();
    this.state = await this.loadState(defaultState);
    if (legacyCreateRequest) {
      this.applyLegacyCreateRequest(legacyCreateRequest);
    }

    this.bindEvents();
    this.render();
  }

  async evalThreadScript(path, expectedFn) {
    try {
      const res = await fetch(`${path}?v=${APP_BUILD_TAG}`, { cache: 'no-store' });
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
      const pathWithVersion = `${path}?v=${APP_BUILD_TAG}`;
      const script = document.createElement('script');
      script.src = pathWithVersion;
      const waiterKey = script.src;

      const timer = setTimeout(() => {
        this._seedWaiters.delete(waiterKey);
        this._seedWaiter = previousWaiter;
        reject(new Error(`Seed load timeout: ${path}`));
      }, 8000);

      // Backward-compatible fallback waiter (sequential mode).
      this._seedWaiter = {
        expectedFn,
        resolve: (data) => {
          clearTimeout(timer);
          this._seedWaiters.delete(waiterKey);
          this._seedWaiter = previousWaiter;
          resolve(data);
        }
      };

      // Primary waiter keyed by script src (supports parallel script loads).
      this._seedWaiters.set(waiterKey, {
        expectedFn,
        resolve: (data) => {
          clearTimeout(timer);
          this._seedWaiters.delete(waiterKey);
          if (this._seedWaiter === previousWaiter) {
            this._seedWaiter = null;
          }
          resolve(data);
        }
      });

      script.onerror = () => {
        clearTimeout(timer);
        this._seedWaiters.delete(waiterKey);
        this._seedWaiter = previousWaiter;
        reject(new Error(`Failed to load seed script: ${pathWithVersion}`));
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
    const currentScript = document.currentScript;
    const currentSrc = currentScript && currentScript.src ? currentScript.src : '';
    const keyedWaiter = currentSrc ? this._seedWaiters.get(currentSrc) : null;
    if (keyedWaiter && keyedWaiter.expectedFn === 'setThreadList') {
      keyedWaiter.resolve(data);
      return;
    }
    if (this._seedWaiter && this._seedWaiter.expectedFn === 'setThreadList') {
      this._seedWaiter.resolve(data);
    }
  }

  setThreadData(data) {
    const currentScript = document.currentScript;
    const currentSrc = currentScript && currentScript.src ? currentScript.src : '';
    const keyedWaiter = currentSrc ? this._seedWaiters.get(currentSrc) : null;
    if (keyedWaiter && keyedWaiter.expectedFn === 'setThreadData') {
      keyedWaiter.resolve(data);
      return;
    }
    if (this._seedWaiter && this._seedWaiter.expectedFn === 'setThreadData') {
      this._seedWaiter.resolve(data);
    }
  }

  async seedFromFiles() {
    const list = await this.evalThreadScript('threads/index.js', 'setThreadList');
    const threadMeta = (list.threads || []).filter((meta) => String(meta?.id || '').trim());
    const threads = threadMeta.map((meta) => {
      const id = String(meta.id || '').trim();
      const parsedTitle = parseTitleHtml(meta.title || '');
      const featured = Boolean(meta.title && String(meta.title).includes('gold-title')) || parsedTitle.featured;

      return {
        id,
        titleText: parsedTitle.titleText || stripHtml(meta.title || id),
        subtitleText: parsedTitle.subtitleText || '',
        featured,
        listDate: String(meta.date || ''),
        posts: [],
        authors: {},
        seedLoaded: false,
        seedCount: Number.isFinite(meta.count) ? Number(meta.count) : 0,
        seedSource: 'file'
      };
    });

    return {
      schemaVersion: STATE_SCHEMA_VERSION,
      dataVersion: DATA_VERSION,
      threads
    };
  }

  normalizeThreadPostsAndAuthors(rawPosts) {
    const posts = Array.isArray(rawPosts) ? rawPosts : [];
    const authors = {};
    const normalizedPosts = posts.map((p, idx) => {
      const number = Number.isFinite(p.number) ? p.number : (idx + 1);
      const name = String(p.name || '').trim() || '名無しさん';
      const date = String(p.date || '').trim() || format2chDate(new Date());
      const body = String(p.body || '');
      const seedColor = String(p.uidColor || '').trim();

      const seedId = normalizeIdPart(p.uid || '');
      const authorKey = seedId ? seedId : `author_${number}`;
      if (!authors[authorKey]) {
        authors[authorKey] = {
          uidMode: seedId ? 'custom' : 'random',
          uidValue: seedId || '',
          uidColor: seedColor
        };
      } else if (!authors[authorKey].uidColor && seedColor) {
        authors[authorKey].uidColor = seedColor;
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

    return { posts: normalizedPosts, authors };
  }

  async ensureThreadSeeded(threadId) {
    const id = normalizeThreadIdentifier(threadId);
    if (!id) return null;
    const thread = this.getThread(id);
    if (!thread) return null;
    if (thread.seedSource !== 'file') {
      thread.seedLoaded = true;
      return thread;
    }
    if (thread.seedLoaded) return thread;

    if (this._threadSeedPromises.has(id)) {
      await this._threadSeedPromises.get(id);
      return this.getThread(id);
    }

    const loadPromise = (async () => {
      const threadData = await this.evalThreadScript(`threads/${id}.js`, 'setThreadData');
      const parsedTitle = parseTitleHtml(threadData.title || thread.titleText || id);
      const normalized = this.normalizeThreadPostsAndAuthors(threadData.posts || []);

      thread.titleText = thread.titleText || parsedTitle.titleText || id;
      thread.subtitleText = thread.subtitleText || parsedTitle.subtitleText || '';
      thread.featured = Boolean(thread.featured || parsedTitle.featured);
      thread.posts = this.mergePosts(normalized.posts, thread.posts);
      thread.authors = { ...normalized.authors, ...(thread.authors || {}) };
      thread.seedLoaded = true;
      thread.seedCount = thread.posts.length;
      if (!thread.listDate) {
        thread.listDate = thread.posts.length ? thread.posts[thread.posts.length - 1].date : '';
      }
    })();

    this._threadSeedPromises.set(id, loadPromise);
    try {
      await loadPromise;
    } finally {
      this._threadSeedPromises.delete(id);
    }

    return this.getThread(id);
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
        const nextMode = this.uiMode === 'edit' ? 'view' : 'edit';
        this.saveUiMode(nextMode);
        if (nextMode !== 'edit') {
          this.editingPostNumber = null;
        }
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
      if (action === 'cancel-edit-post') {
        this.editingPostNumber = null;
        this.renderThread(this.currentThreadId);
        return;
      }
      if (action === 'delete-post') {
        this.deletePost(Number(actionEl.dataset.postNumber || '0'));
        return;
      }
      if (action === 'submit-thread') {
        const form = this.container.querySelector('#thread-form');
        if (form instanceof HTMLFormElement) {
          this.submitThreadForm(form);
        } else {
          alert('未找到发帖表单。');
        }
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
      if (action === 'add-quote-item') {
        const form = actionEl.closest('form');
        if (form instanceof HTMLFormElement) {
          this.addQuoteItem(form);
        }
        return;
      }
      if (action === 'remove-quote-item') {
        const form = actionEl.closest('form');
        const quoteNumber = Number(actionEl.dataset.quoteNumber || '0');
        if (form instanceof HTMLFormElement && quoteNumber > 0) {
          this.removeQuoteItem(form, quoteNumber);
        }
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
      if (form.classList.contains('post-form')) {
        e.preventDefault();
        this.submitPostForm(form);
        return;
      }
    });

    this.container.addEventListener('change', (e) => {
      const el = e.target;
      if (!(el instanceof HTMLSelectElement)) return;
      if (el.classList.contains('post-uid-mode')) {
        const form = el.closest('form');
        const wrap = form ? form.querySelector('.uid-custom-wrap') : null;
        if (wrap) {
          wrap.style.display = el.value === 'custom' ? 'flex' : 'none';
        }
      }
    });

    this.container.addEventListener('keydown', (e) => {
      const el = e.target;
      if (!(el instanceof HTMLInputElement)) return;
      if (!el.classList.contains('quote-number-input')) return;

      const form = el.closest('form');
      if (!(form instanceof HTMLFormElement)) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        this.addQuoteItem(form);
        return;
      }

      if (e.key === 'Backspace' && !el.value.trim()) {
        const hidden = form.querySelector('input[name="quote"]');
        if (!(hidden instanceof HTMLInputElement)) return;
        const numbers = this.parseQuoteNumbers(hidden.value);
        if (!numbers.length) return;
        e.preventDefault();
        this.removeQuoteItem(form, numbers[numbers.length - 1]);
      }
    });
  }

  getSortedThreads() {
    const threads = [...(this.state.threads || [])];
    threads.sort((a, b) => {
      if (normalizeThreadIdentifier(a?.id) === INTRO_THREAD_ID) return -1;
      if (normalizeThreadIdentifier(b?.id) === INTRO_THREAD_ID) return 1;
      return parseDateToMillis(b.listDate) - parseDateToMillis(a.listDate);
    });
    return threads;
  }

  getThread(threadId) {
    const targetId = normalizeThreadIdentifier(threadId);
    if (!targetId) return null;
    return (this.state.threads || []).find((t) => normalizeThreadIdentifier(t?.id) === targetId) || null;
  }

  render() {
    if (this.mode === 'thread') {
      this.renderThread(this.currentThreadId).catch((e) => {
        console.error(e);
        this.container.innerHTML = `<p style="color:red">Error: ${escapeHtml(e.message || String(e))}</p>`;
      });
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
      const subtitleHtml = t.subtitleText
        ? `<div class="thread-list-subtitle" style="margin-top:2px;color:#777;font-size:12px;line-height:1.35;">${escapeHtml(t.subtitleText)}</div>`
        : '';

      const postCount = Array.isArray(t.posts) ? t.posts.length : 0;
      const count = postCount > 0 ? postCount : (t.seedLoaded ? postCount : Number(t.seedCount || 0));
      const date = this.convertToJapaneseDate(t.listDate || '');

      const editActions = isEdit
        ? `<span class="edit-actions">[<a href="#" data-action="edit-thread" data-thread-id="${escapeHtml(t.id)}">编辑</a>] [<a href="#" data-action="delete-thread" data-thread-id="${escapeHtml(t.id)}">删除</a>]</span>`
        : '';

      return `
        <tr>
          <td>
            <div class="thread-list-title-line">
              <a class="thread-link" href="thread.html?id=${encodeURIComponent(t.id)}">${titleHtml} (${count})</a>${editActions}
            </div>
            ${subtitleHtml}
          </td>
          <td class="thread-list-date">${date}</td>
        </tr>
      `;
    }).join('');

    const threadEditor = isEdit
      ? `
        <form id="thread-form" class="editor-box thread-editor-shell" autocomplete="off">
          <input type="hidden" id="thread-form-mode" value="create" />
          <div class="post-editor-heading">■ 发帖</div>
          <div class="editor-form-grid">
            <div class="editor-field">
              <span class="label">帖子 ID</span>
              <input id="thread-id" name="id" placeholder="例如 my_thread" />
            </div>
            <div class="editor-field">
              <span class="label">标题</span>
              <input id="thread-title" name="title" placeholder="标题" />
            </div>
            <div class="editor-field">
              <span class="label">标题翻译</span>
              <input id="thread-subtitle" name="subtitle" placeholder="中文翻译（可选）" />
            </div>
            <div class="editor-field">
              <span class="label">选项</span>
              <label class="thread-featured-check">
                <input id="thread-featured" name="featured" type="checkbox" />
                <span>加精(良スレ)</span>
              </label>
            </div>
          </div>
          <div class="post-editor-actions">
            <button type="submit">保存帖子</button>
            <button type="button" data-action="cancel-thread-form">取消</button>
          </div>
          <div class="post-editor-hint">说明: 帖子 ID 只允许字母数字、下划线和短横线。</div>
        </form>
      `
      : '';

    this.container.innerHTML = `
      <header class="site-header">
        <h1 class="site-title">所长的谣言板 <span class="build-tag" title="build">${APP_BUILD_TAG}</span></h1>
        <div class="site-nav">
          <a href="../hub/">Hub</a><span class="sep">|</span><a href="../twi/">Twitter</a>
          <span class="sep">|</span>
          <a href="#" data-action="toggle-mode">${isEdit ? '查看模式' : '编辑模式'}</a>
        </div>
      </header>
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
      ${threadEditor}
    `;

    document.title = '所长的谣言板';
  }

  async renderThread(threadId) {
    let thread = this.getThread(threadId);
    const isEdit = this.uiMode === 'edit';

    if (!thread) {
      this.container.innerHTML = `
        <div class="site-header">
          <div class="site-nav">
            <a href="index.html" style="text-decoration:none; color: #CC0000;">&lt; 返回</a>
            <span class="sep">|</span>
            <a href="../hub/">Hub</a><span class="sep">|</span><a href="../twi/">Twitter</a>
          </div>
        </div>
        <p style="padding: 10px; color:#666;">Thread not found: ${escapeHtml(threadId)}</p>
      `;
      document.title = 'Thread not found';
      return;
    }

    if (thread.seedSource === 'file' && !thread.seedLoaded) {
      this.container.innerHTML = `<p style="padding:10px;color:#666;">Loading thread...</p>`;
      await this.ensureThreadSeeded(threadId);
      thread = this.getThread(threadId);
      if (!thread) {
        this.container.innerHTML = `<p style="padding:10px;color:#666;">Thread not found: ${escapeHtml(threadId)}</p>`;
        document.title = 'Thread not found';
        return;
      }
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
      const isEditingThisPost = isEdit && this.editingPostNumber === post.number;
      const controls = isEdit
        ? ` <span class="edit-actions">[<a href="#" data-action="edit-post" data-post-number="${post.number}">${isEditingThisPost ? '收起' : '编辑'}</a>] [<a href="#" data-action="delete-post" data-post-number="${post.number}">删除</a>]</span>`
        : '';
      const inlineEditor = isEditingThisPost
        ? `<div class="post-inline-editor">${this.renderPostEditor(thread, { mode: 'edit', post })}</div>`
        : '';

      return `
        <div class="post${isEditingThisPost ? ' is-editing' : ''}" id="post-${post.number}" data-post-number="${post.number}">
          <div class="post-meta">
            <span class="post-number">${post.number}</span> :
            <span class="post-name"><b>${escapeHtml(post.name)}</b></span>
            <span class="post-date">${this.convertToJapaneseDate(post.date)}</span>
            <span class="post-uid"${uidColor}>${escapeHtml(uidInfo.uid)}</span>
            ${controls}
          </div>
          <div class="post-body"${bodyColor}>${processedBody}</div>
          ${inlineEditor}
        </div>
      `;
    }).join('');

    const postEditor = isEdit
      ? this.renderPostEditor(thread, { mode: 'create' })
      : '';

    this.container.innerHTML = `
      <div class="site-header">
        <div class="site-nav">
          <a href="index.html" style="text-decoration:none; color: #CC0000;">&lt; 返回</a>
          <span class="sep">|</span>
          <a href="../hub/">Hub</a><span class="sep">|</span><a href="../twi/">Twitter</a>
          <span class="sep">|</span>
          <a href="#" data-action="toggle-mode">${isEdit ? '查看模式' : '编辑模式'}</a>
        </div>
      </div>
      <h1 class="thread-title">${titleHtml}</h1>
      <hr class="title-divider" />
      <div class="posts">${postCards || '<p style="color:#666;">(空)</p>'}</div>
      <div class="thread-footer">
        <a href="#" onclick="return false;">全部</a>
        <a href="#" onclick="return false;">最新50</a>
        <a href="#" onclick="return false;">1-100</a>
        <a href="index.html">回到列表</a>
        <a href="#" onclick="location.reload(); return false;">刷新</a>
      </div>
      ${postEditor}
    `;

    document.title = stripHtml(thread.titleText || threadId);
  }

  splitBodyParts(rawBody) {
    const raw = String(rawBody || '').replace(/\r\n/g, '\n');
    const lines = raw.split('\n');
    const quoteLines = [];
    const bodyLines = [];

    for (const line of lines) {
      if (/^\s*(?:>>|&gt;&gt;)\d+/.test(line.trim())) {
        quoteLines.push(line.trim());
      } else {
        bodyLines.push(line);
      }
    }

    let bodyText = bodyLines.join('\n').trim();
    let transText = '';
    const transMatch = bodyText.match(/<div\s+class=["'“”]fake-trans["'“”]>([\s\S]*?)<\/div>/i);
    if (transMatch) {
      transText = transMatch[1].trim();
      bodyText = bodyText.replace(transMatch[0], '').trim();
    }

    return {
      quote: quoteLines.join('\n'),
      body: bodyText,
      trans: transText
    };
  }

  parseQuoteNumbers(quoteText) {
    const raw = String(quoteText || '');
    const parts = raw.split(/[\n,\s]+/);
    const nums = [];
    for (const part of parts) {
      const m = part.match(/^(?:>>|&gt;&gt;)?(\d+)$/);
      if (!m) continue;
      const n = Number(m[1]);
      if (!Number.isFinite(n) || n <= 0) continue;
      if (!nums.includes(n)) nums.push(n);
    }
    return nums;
  }

  quoteNumbersToText(numbers) {
    return numbers.map((n) => `>>${n}`).join('\n');
  }

  renderQuoteItems(numbers) {
    return numbers.map((n) => {
      return `<span class="quote-chip">>>${n}<button type="button" data-action="remove-quote-item" data-quote-number="${n}">x</button></span>`;
    }).join('');
  }

  syncQuoteUi(form) {
    const hidden = form.querySelector('input[name="quote"]');
    const list = form.querySelector('.quote-chip-list');
    if (!(hidden instanceof HTMLInputElement) || !(list instanceof HTMLElement)) return;
    const nums = this.parseQuoteNumbers(hidden.value);
    list.innerHTML = this.renderQuoteItems(nums);
  }

  addQuoteItem(form) {
    const input = form.querySelector('.quote-number-input');
    const hidden = form.querySelector('input[name="quote"]');
    if (!(input instanceof HTMLInputElement) || !(hidden instanceof HTMLInputElement)) return;
    const next = Number(input.value.trim());
    if (!Number.isFinite(next) || next <= 0) {
      input.value = '';
      return;
    }
    const nums = this.parseQuoteNumbers(hidden.value);
    if (!nums.includes(next)) nums.push(next);
    hidden.value = this.quoteNumbersToText(nums);
    input.value = '';
    this.syncQuoteUi(form);
    input.focus();
  }

  removeQuoteItem(form, quoteNumber) {
    const hidden = form.querySelector('input[name="quote"]');
    if (!(hidden instanceof HTMLInputElement)) return;
    const nums = this.parseQuoteNumbers(hidden.value).filter((n) => n !== quoteNumber);
    hidden.value = this.quoteNumbersToText(nums);
    this.syncQuoteUi(form);
  }

  composeBodyFromParts(quote, body, trans) {
    const chunks = [];
    const quoteText = String(quote || '').trim();
    const bodyText = String(body || '').trim();
    const transText = String(trans || '').trim();

    if (quoteText) chunks.push(quoteText);
    if (bodyText) chunks.push(bodyText);
    if (transText) chunks.push(`<div class="fake-trans">${transText}</div>`);
    return chunks.join('\n');
  }

  getPostFormValues(thread, post = null) {
    if (post) {
      const authorKey = String(post.authorKey || '').trim() || 'A';
      const author = (thread.authors || {})[authorKey] || { uidMode: 'random', uidValue: '', uidColor: '' };
      const bodyParts = this.splitBodyParts(post.body || '');
      return {
        number: post.number,
        name: post.name || '',
        authorKey,
        uidMode: author.uidMode === 'custom' ? 'custom' : 'random',
        uidValue: author.uidValue || '',
        uidColor: author.uidColor || '',
        bodyColor: post.bodyColor || '',
        date: post.date || format2chDate(new Date()),
        quote: bodyParts.quote,
        body: bodyParts.body,
        trans: bodyParts.trans
      };
    }

    return {
      number: '',
      name: '',
      authorKey: 'A',
      uidMode: 'random',
      uidValue: '',
      uidColor: '',
      bodyColor: '',
      date: format2chDate(new Date()),
      quote: '',
      body: '',
      trans: ''
    };
  }

  renderPostEditor(thread, options = {}) {
    const mode = options.mode === 'edit' ? 'edit' : 'create';
    const post = mode === 'edit' ? options.post : null;
    const values = this.getPostFormValues(thread, post);

    const heading = mode === 'edit'
      ? `编辑楼层 #${values.number}`
      : '发新楼层';
    const submitLabel = mode === 'edit' ? '保存楼层' : '追加楼层';
    const cancelButton = mode === 'edit'
      ? `<button type="button" data-action="cancel-edit-post" data-post-number="${escapeHtml(values.number)}">取消</button>`
      : '<button type="button" data-action="cancel-post-form">清空</button>';
    const uidCustomDisplay = values.uidMode === 'custom' ? 'flex' : 'none';
    const modeClass = mode === 'edit' ? 'is-inline' : 'is-create';
    const quoteNumbers = this.parseQuoteNumbers(values.quote);
    const quoteText = this.quoteNumbersToText(quoteNumbers);
    const quoteChips = this.renderQuoteItems(quoteNumbers);

    return `
      <div class="post-editor-shell ${modeClass}">
        <div class="post-editor-heading">■ ${heading}</div>
        <form class="post-form" data-mode="${mode}" autocomplete="off">
          <input type="hidden" name="number" value="${escapeHtml(values.number)}" />
          <div class="editor-form-grid">
            <div class="editor-field">
              <span class="label">姓名</span>
              <input name="name" value="${escapeHtml(values.name)}" placeholder="名無しさん" />
            </div>
            <div class="editor-field">
              <span class="label">发言人</span>
              <input name="authorKey" value="${escapeHtml(values.authorKey)}" placeholder="A / B / C" />
              <span class="field-hint">同一名字 → 自动分配相同 ID</span>
            </div>
            <div class="editor-field">
              <span class="label">ID</span>
              <div class="uid-row">
                <select name="uidMode" class="post-uid-mode">
                  <option value="random"${values.uidMode === 'custom' ? '' : ' selected'}>自动（同一发言人共享）</option>
                  <option value="custom"${values.uidMode === 'custom' ? ' selected' : ''}>手动指定</option>
                </select>
                <span class="uid-custom-wrap" style="display:${uidCustomDisplay};">
                  <input name="uidValue" value="${escapeHtml(values.uidValue)}" placeholder="如 AbCdEf12" />
                </span>
              </div>
            </div>
            <div class="editor-field">
              <span class="label">ID 颜色</span>
              <input name="uidColor" value="${escapeHtml(values.uidColor)}" placeholder="#666666" />
            </div>
            <div class="editor-field">
              <span class="label">正文颜色</span>
              <input name="bodyColor" value="${escapeHtml(values.bodyColor)}" placeholder="#000000" />
            </div>
            <div class="editor-field">
              <span class="label">日期</span>
              <input name="date" value="${escapeHtml(values.date)}" />
            </div>
            <div class="editor-field full">
              <span class="label">引用</span>
              <div class="quote-builder">
                <input type="hidden" name="quote" value="${escapeHtml(quoteText)}" />
                <input class="quote-number-input" inputmode="numeric" pattern="[0-9]*" placeholder="楼层号" />
                <button type="button" data-action="add-quote-item">添加</button>
                <div class="quote-chip-list">${quoteChips}</div>
              </div>
            </div>
            <div class="editor-field full">
              <span class="label">正文</span>
              <textarea name="body" rows="${mode === 'edit' ? '5' : '6'}" placeholder="正文...">${escapeHtml(values.body)}</textarea>
            </div>
            <div class="editor-field full">
              <span class="label">翻译</span>
              <textarea name="trans" rows="3" placeholder="会自动包装成 fake-trans 区块">${escapeHtml(values.trans)}</textarea>
            </div>
          </div>
          <div class="post-editor-actions">
            <button type="submit">${submitLabel}</button>
            ${cancelButton}
          </div>
          <div class="post-editor-hint">提示: 引用支持连续添加，空输入按退格可回删最后一项；保存时会自动组合正文与翻译块。</div>
        </form>
      </div>
    `;
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
    const subtitleText = normalizeSubtitleText(form.querySelector('#thread-subtitle')?.value || '');
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
        authors: {},
        seedLoaded: true,
        seedCount: 0,
        seedSource: 'local'
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
    const targetId = normalizeThreadIdentifier(threadId);
    const thread = this.getThread(targetId);
    if (!thread) return;
    if (!confirm(`确定删除 thread: ${targetId} ?`)) return;
    this.state.threads = (this.state.threads || []).filter((t) => normalizeThreadIdentifier(t?.id) !== targetId);
    this.saveState();
    this.renderIndex();
  }

  fillPostForm(postNumber) {
    const thread = this.getThread(this.currentThreadId);
    if (!thread) return;
    const post = (thread.posts || []).find((p) => p.number === postNumber);
    if (!post) return;

    this.editingPostNumber = this.editingPostNumber === postNumber ? null : postNumber;
    this.renderThread(thread.id);

    if (this.editingPostNumber === postNumber) {
      const bodyEl = this.container.querySelector(`#post-${postNumber} .post-form textarea[name="body"]`);
      if (bodyEl instanceof HTMLTextAreaElement) {
        bodyEl.focus();
        const len = bodyEl.value.length;
        bodyEl.setSelectionRange(len, len);
      }
    }
  }

  resetPostForm() {
    const form = this.container.querySelector('.post-form[data-mode="create"]');
    if (!(form instanceof HTMLFormElement)) return;
    form.reset();

    const authorEl = form.querySelector('input[name="authorKey"]');
    if (authorEl instanceof HTMLInputElement) authorEl.value = 'A';

    const uidModeEl = form.querySelector('select[name="uidMode"]');
    if (uidModeEl instanceof HTMLSelectElement) uidModeEl.value = 'random';

    const uidValueEl = form.querySelector('input[name="uidValue"]');
    if (uidValueEl instanceof HTMLInputElement) uidValueEl.value = '';

    const quoteEl = form.querySelector('input[name="quote"]');
    if (quoteEl instanceof HTMLInputElement) quoteEl.value = '';

    const dateEl = form.querySelector('input[name="date"]');
    if (dateEl instanceof HTMLInputElement) dateEl.value = format2chDate(new Date());

    const transEl = form.querySelector('textarea[name="trans"]');
    if (transEl instanceof HTMLTextAreaElement) transEl.value = '';

    const wrap = form.querySelector('.uid-custom-wrap');
    if (wrap instanceof HTMLElement) wrap.style.display = 'none';
    this.syncQuoteUi(form);
  }

  submitPostForm(form) {
    const thread = this.getThread(this.currentThreadId);
    if (!thread) return;

    const mode = form.dataset.mode === 'edit' ? 'edit' : 'create';
    const formData = new FormData(form);

    const numberRaw = Number(formData.get('number') || '0');
    const name = String(formData.get('name') || '').trim() || '名無しさん';
    const authorKey = String(formData.get('authorKey') || '').trim() || 'A';
    const uidMode = String(formData.get('uidMode') || 'random') === 'custom' ? 'custom' : 'random';
    const uidValue = normalizeIdPart(formData.get('uidValue') || '');
    const uidColor = String(formData.get('uidColor') || '').trim();
    const bodyColor = String(formData.get('bodyColor') || '').trim();
    const date = String(formData.get('date') || '').trim() || format2chDate(new Date());
    const quote = String(formData.get('quote') || '').trim();
    const bodyMain = String(formData.get('body') || '').trim();
    const trans = String(formData.get('trans') || '').trim();
    const body = this.composeBodyFromParts(quote, bodyMain, trans);

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
      this.renderThread(thread.id);
      this.scrollToPost(nextNumber);
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
    this.editingPostNumber = null;
    this.saveState();
    this.renderThread(thread.id);
    this.scrollToPost(post.number);
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
    this.editingPostNumber = null;
    this.saveState();
    this.renderThread(thread.id);
  }

  async submitThread() {
    const form = this.container.querySelector('#thread-form');
    if (form instanceof HTMLFormElement) {
      this.submitThreadForm(form);
      return;
    }
    alert('未找到发帖表单。');
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
    let result = String(text).replace(/[\n\r\s]+(<div\s+class=["'“”]fake-trans["'“”]>)/gi, '$1');

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



