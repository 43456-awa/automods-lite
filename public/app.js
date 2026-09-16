/* AutoMods Lite · 前端
 *
 * 页面结构、类名、配色全部对齐 automods.cn（样式在 /vendor 下那份线上 CSS 里）。
 * 数据和能力来自本机的 server.js：对话走 /api/chat（SSE），产物走 /api/files，
 * 编译走 /api/build，配置和模型走 /api/config、/api/models。
 *
 * 这里没有登录、没有积分、没有队列——那几块在主站是云端的，本地版换成
 * 本机就绪检测、请求计数和"排队牌常隐"。 */
(() => {
  'use strict';

  /* ------------------------------------------------------------ 小工具 */

  const $ = (id) => document.getElementById(id);
  const make = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };
  const esc = (s) => String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function size(bytes) {
    const n = Number(bytes) || 0;
    if (!n) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  function clock(ms) {
    const d = new Date(ms || Date.now());
    const p = (v) => String(v).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  }

  function ago(ms) {
    if (!ms) return '';
    const diff = Date.now() - ms;
    const m = Math.floor(diff / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return `${m} 分钟前`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} 小时前`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d} 天前`;
    return new Date(ms).toLocaleDateString('zh-CN');
  }

  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(`automods.${key}`);
        return raw === null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(`automods.${key}`, JSON.stringify(value)); } catch { /* 隐私模式 */ }
    },
  };

  async function api(path, options = {}) {
    const res = await fetch(path, {
      headers: options.body ? { 'Content-Type': 'application/json' } : {},
      ...options,
    });
    const type = res.headers.get('content-type') || '';
    if (!type.includes('application/json')) {
      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
      return text;
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  let toastTimer = 0;
  function toast(text, tone) {
    const box = $('toast');
    if (!box) return;
    box.textContent = text;
    box.hidden = false;
    box.classList.toggle('bad', tone === 'bad');
    box.classList.toggle('good', tone === 'good');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.hidden = true; }, 3200);
  }

  /** 极简 Markdown：代码块、行内代码、粗体、无序列表、段落 */
  function renderMd(text, host) {
    const src = String(text || '');
    host.textContent = '';
    const blocks = src.split(/```/);
    blocks.forEach((block, index) => {
      if (index % 2 === 1) {
        const lines = block.replace(/^[a-zA-Z0-9+#-]*\n/, '');
        host.appendChild(make('pre', null)).textContent = lines;
        return;
      }
      const chunks = block.split(/\n{2,}/);
      chunks.forEach((chunk) => {
        const body = chunk.trim();
        if (!body) return;
        if (/^[-*+]\s+/m.test(body) && !body.includes('\n\n')) {
          const ul = make('ul');
          body.split('\n').forEach((line) => {
            const li = make('li');
            li.innerHTML = inline(line.replace(/^[-*+]\s+/, ''));
            ul.appendChild(li);
          });
          host.appendChild(ul);
          return;
        }
        const p = make('p');
        p.innerHTML = inline(body).replace(/\n/g, '<br />');
        host.appendChild(p);
      });
    });
    return host;
  }

  function inline(text) {
    return esc(text)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  }

  /* ------------------------------------------------------------ 状态 */

  const state = {
    cfg: null,
    env: null,
    chats: [],
    chatId: '',
    project: '',
    title: '对话制作',
    running: false,
    abort: null,
    // 一轮之内的渲染句柄
    work: null,
    live: null,
    liveText: '',
    answerText: '',
    pendingTool: new Map(),
    steps: 0,
    // 资产栏
    files: [],
    releases: [],
    opened: new Set(),
    assetSig: '',
    // 输入区
    models: [],
    planOpen: false,
    planData: null,
    planPicked: new Map(),
    queue: [],
  };

  const MC_VERSIONS = ['1.21.8', '1.21.7', '1.21.5', '1.21.4', '1.21.1', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.18.2'];
  const LOADERS = [
    { id: 'neoforge', name: 'NeoForge', note: '1.21 系列首选' },
    { id: 'forge', name: 'Forge', note: '老版本生态全' },
    { id: 'fabric', name: 'Fabric', note: '轻，启动快' },
  ];
  const EFFORTS = [
    { id: 'low', name: '快', note: '想一下就动手' },
    { id: 'medium', name: '标准', note: '想清楚再写' },
    { id: 'high', name: '深', note: '慢慢想，写得稳' },
    { id: 'max', name: '极深', note: '会想很久，慎用' },
  ];
  const CTX_CHOICES = [
    { id: 16, name: '16 条', note: '省 token' },
    { id: 24, name: '24 条', note: '推荐' },
    { id: 36, name: '36 条', note: '长对话' },
    { id: 64, name: '64 条', note: '很长的对话' },
  ];

  const draft = {
    mcVersion: store.get('mcVersion', ''),
    loader: store.get('loader', 'neoforge'),
    effort: store.get('effort', 'high'),
    ctxLimit: store.get('ctxLimit', 24),
  };

  /* ------------------------------------------------------------ 启动 */

  async function boot() {
    bindStatic();
    try {
      state.cfg = await api('/api/config');
    } catch (e) {
      state.cfg = { apiKeySet: false, model: '' };
    }
    $('loginVersion').textContent = state.cfg.localVersion || '';
    paintReady();

    const seen = store.get('entered', false);
    const skip = location.hash.includes('enter') || location.search.includes('app=1');
    if (seen || skip) {
      if (skip) store.set('entered', true);
      enterApp(false);
    } else {
      $('loginView').hidden = false;
    }

    // 后台把工程列表和模型列表准备好，进工作台时不用等
    loadChats().catch(() => {});
    loadModels().catch(() => {});
  }

  function paintReady() {
    const cfg = state.cfg || {};
    const keyDot = $('readyKeyDot');
    const modelDot = $('readyModelDot');
    const gradleDot = $('readyGradleDot');

    if (cfg.apiKeySet) {
      keyDot.className = 'local-dot ok';
      $('readyKeyState').textContent = cfg.apiKeyHint || '已填写';
    } else {
      keyDot.className = 'local-dot bad';
      $('readyKeyState').textContent = '还没填，点下面的按钮去填';
    }

    if (cfg.model) {
      modelDot.className = 'local-dot ok';
      $('readyModelState').textContent = `${cfg.model} · ${cfg.baseUrl || ''}`;
    } else {
      modelDot.className = 'local-dot warn';
      $('readyModelState').textContent = '还没选模型';
    }

    gradleDot.className = 'local-dot warn';
    $('readyGradleState').textContent = '工程里有 gradlew 就能编译';

    api('/api/env').then((env) => {
      state.env = env;
      const ok = env && env.gradle && env.gradle.ok;
      gradleDot.className = `local-dot ${ok ? 'ok' : 'warn'}`;
      $('readyGradleState').textContent = ok
        ? `已找到 ${env.gradle.name}`
        : '没找到，可以先把源码拿走再编译';
    }).catch(() => {
      $('readyGradleState').textContent = '未检测';
    });
  }

  function enterApp(first) {
    $('loginView').hidden = true;
    $('appView').hidden = false;
    store.set('entered', true);
    loadChats().catch(() => {});
    refreshUsage();
    if (first) maybeOnboard();
    if (!state.chatId) newDraft();
  }

  /* ------------------------------------------------------------ 侧栏项目 */

  async function loadChats() {
    const data = await api('/api/chats');
    state.chats = (data.chats || []).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    renderChats();
  }

  function renderChats() {
    const host = $('projectList');
    host.textContent = '';
    $('projectEmpty').hidden = state.chats.length > 0;
    state.chats.forEach((chat) => {
      const item = make('button', `project-item${chat.id === state.chatId ? ' active' : ''}`);
      item.type = 'button';
      item.appendChild(make('b', null, chat.title || '未命名模组'));
      item.appendChild(make('small', null, ago(chat.updatedAt)));
      item.onclick = () => selectChat(chat.id);

      const del = make('button', 'project-del', '×');
      del.type = 'button';
      del.title = '删除这个项目';
      del.onclick = async (event) => {
        event.stopPropagation();
        if (!window.confirm(`删除「${chat.title}」？它的工程目录会一起删掉。`)) return;
        try {
          await api(`/api/chats/${chat.id}?purge=1`, { method: 'DELETE' });
          if (state.chatId === chat.id) {
            state.chatId = '';
            state.project = '';
            newDraft();
          }
          await loadChats();
          toast('已删除', 'good');
        } catch (e) {
          toast(e.message || '删不掉', 'bad');
        }
      };
      item.appendChild(del);
      host.appendChild(item);
    });
  }

  function newDraft() {
    state.chatId = '';
    state.project = '';
    state.title = '对话制作';
    $('pageTitle').textContent = state.title;
    $('projectId').hidden = true;
    $('conversation').textContent = '';
    $('hero').hidden = false;
    $('starters').hidden = store.get('level', '') !== 'novice';
    state.files = [];
    state.releases = [];
    state.assetSig = '';
    renderAssets();
    updateBlank();
    if (window.MCIcons) window.MCIcons.mount($('starters'));
  }

  async function selectChat(id) {
    if (state.running) {
      toast('这一轮还在跑，先停一下', 'bad');
      return;
    }
    let chat;
    try {
      const data = await api(`/api/chats/${id}`);
      chat = data.chat;
    } catch {
      toast('这个项目打不开了', 'bad');
      return;
    }
    state.chatId = chat.id;
    state.project = chat.project;
    state.title = chat.title || '对话制作';
    $('pageTitle').textContent = state.title;
    $('projectId').hidden = false;
    $('projectId').textContent = chat.project || '';
    $('hero').hidden = (chat.messages || []).length > 0;
    $('starters').hidden = true;
    renderHistory(chat.messages || []);
    renderChats();
    setRunState('空闲', false);
    await loadAssets(true);
  }

  /** 把服务端存的消息重放成页面。工具回执不落地，所以只还原正文。 */
  function renderHistory(messages) {
    const host = $('conversation');
    host.textContent = '';
    state.work = null;
    state.live = null;
    messages.forEach((msg) => {
      if (msg.role === 'user') {
        const node = make('div', 'message user');
        node.appendChild(make('div', null, msg.content));
        host.appendChild(node);
        return;
      }
      if (msg.role !== 'assistant') return;
      if (!msg.content) return;
      const node = make('div', 'message assistant');
      const body = make('div');
      renderMd(msg.content, body);
      node.appendChild(body);
      host.appendChild(node);
    });
    updateBlank();
    stick(true);
  }

  /** 空白屏与对话屏之间的类名切换：CSS 那边负责给 .hx-hero 做展开动画 */
  function updateBlank() {
    const col = $('chatColumn');
    if (!col) return;
    const empty = $('conversation').children.length === 0;
    col.classList.toggle('blank', empty);
    const project = document.querySelector('.project-content');
    if (!project) return;
    project.classList.toggle('assets-closed', empty);
    $('openAssets').hidden = !empty;
  }

  /* ------------------------------------------------------------ 对话滚动 */

  function atBottom() {
    const box = $('conversation');
    return box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  }

  function stick(was) {
    if (was === false) return;
    const box = $('conversation');
    box.scrollTop = box.scrollHeight;
  }

  /* ------------------------------------------------------------ 工作记录卡 */

  function workCard() {
    if (state.work) return state.work;
    const wrap = make('div', 'hx-turn');
    const card = make('details', 'hx-work');
    const head = make('summary');
    head.appendChild(make('i', 'hx-live'));
    head.appendChild(make('b', null, '正在制作'));
    const now = make('small', 'hx-now', '正在准备工作台…');
    head.appendChild(now);
    head.appendChild(make('span', 'grow'));
    const tier = make('small', 'hx-run-model', state.cfg && state.cfg.model ? state.cfg.model : '');
    head.appendChild(tier);
    const count = make('small', null, '0 步');
    head.appendChild(count);
    card.appendChild(head);
    const list = make('ul', 'hx-steps');
    card.appendChild(list);
    card._list = list;
    card._head = head.querySelector('b');
    card._now = now;
    card._count = count;
    card._tools = new Map();
    wrap.appendChild(card);
    $('conversation').appendChild(wrap);
    state.work = card;
    state.steps = 0;
    return card;
  }

  function stepRow(label, brief, bad) {
    const card = workCard();
    const row = make('li', bad ? 'bad' : '');
    row.appendChild(make('time', null, clock()));
    const body = make('div');
    body.appendChild(make('span', 'hx-name', label));
    if (brief) {
      body.appendChild(document.createTextNode(' '));
      body.appendChild(make('span', 'hx-brief', brief));
    }
    row.appendChild(body);
    card._list.appendChild(row);
    state.steps += 1;
    card._count.textContent = `${state.steps} 步`;
    card._now.textContent = `${label}${brief ? ` · ${brief}` : ''}`.slice(0, 46);
    stick(atBottom());
    return { row, body, card };
  }

  function assistantBubble() {
    const node = make('div', 'message assistant');
    const body = make('div');
    node.appendChild(body);
    $('conversation').appendChild(node);
    return body;
  }

  function systemLine(text) {
    const node = make('div', 'message system');
    node.appendChild(make('span', null, text));
    $('conversation').appendChild(node);
    stick(atBottom());
  }

  /* ------------------------------------------------------------ 发送 */

  function setRunState(text, running) {
    state.running = running;
    $('runState').textContent = text;
    $('runState').classList.toggle('busy', running);
    $('stopButton').hidden = !running;
    $('sendButton').disabled = running;
  }

  async function send(text, extra) {
    if (state.running) return;
    const words = String(text || '').trim();
    if (!words) return;

    if (!state.chatId) {
      // 主站规矩：新工程先问清版本，再交给 AI
      openSetup(words, extra);
      return;
    }
    await runChat(words, extra);
  }

  async function runChat(words, extra) {
    const payload = { chatId: state.chatId, text: words };
    if (extra) payload.extra = extra;

    $('hero').hidden = true;
    $('starters').hidden = true;
    const mine = make('div', 'message user');
    mine.appendChild(make('div', null, words));
    if (extra && extra.files && extra.files.length) {
      const strip = make('div', 'hx-bubble-files');
      extra.files.forEach((name) => strip.appendChild(make('span', null, name)));
      mine.appendChild(strip);
    }
    $('conversation').appendChild(mine);
    stick(true);

    state.work = null;
    state.live = null;
    state.liveText = '';
    state.answerText = '';
    state.pendingTool = new Map();
    setRunState('制作中', true);

    let res;
    try {
      res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      setRunState('空闲', false);
      toast(e.message || '连不上本机服务', 'bad');
      return;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let msg = text;
      try { msg = JSON.parse(text).error || text; } catch { /* 不是 JSON */ }
      setRunState('空闲', false);
      toast(msg || '发送失败', 'bad');
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let cut = buffer.indexOf('\n\n');
        while (cut >= 0) {
          const raw = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          cut = buffer.indexOf('\n\n');
          if (!raw.startsWith('data:')) continue;
          let event = null;
          try { event = JSON.parse(raw.slice(5).trim()); } catch { continue; }
          if (event) handleEvent(event);
        }
      }
    } catch (e) {
      toast(`连接断了：${e.message || e}`, 'bad');
    }
    finishRun();
  }

  function finishRun() {
    setRunState('空闲', false);
    if (state.work) {
      state.work._head.textContent = '制作记录';
      state.work._now.textContent = `${state.steps} 步 · 点开看它都做了什么`;
      const live = state.work.querySelector('.hx-live');
      if (live) live.remove();
      state.work = null;
    }
    loadChats().catch(() => {});
    loadAssets(true).catch(() => {});
    refreshUsage();
  }

  function handleEvent(event) {
    switch (event.k) {
      case 'chat':
        state.chatId = event.chatId;
        state.project = event.project;
        state.title = event.title || state.title;
        $('pageTitle').textContent = state.title;
        $('projectId').hidden = false;
        $('projectId').textContent = event.project || '';
        break;

      case 'user_echo':
        break;

      case 'status':
        if (state.work) state.work._now.textContent = event.text;
        break;

      case 'think_delta': {
        const text = String(event.text || '').replace(/\*\*/g, '').trim();
        if (!text) break;
        stepRow('思考', text.slice(0, 60));
        break;
      }

      case 'think_keep':
        break;

      case 'say_delta':
        if (!state.live) {
          state.live = assistantBubble();
          state.liveText = '';
        }
        state.liveText += event.text || '';
        state.live.textContent = state.liveText;
        stick(atBottom());
        break;

      case 'say_settled':
        if (state.answerText && state.live) {
          const box = make('details');
          box.appendChild(make('summary', null, '阶段小结'));
          renderMd(state.answerText, box.appendChild(make('div', 'hx-report')));
          stepRow('阶段小结', '').body.appendChild(box);
          const stale = state.live.closest('.message');
          if (stale) stale.remove();
        }
        if (!state.live) state.live = assistantBubble();
        renderMd(event.text || '', state.live);
        state.answerText = event.text || '';
        state.live = null;
        stick(atBottom());
        break;

      case 'say_settle_cancel':
        break;

      case 'tool': {
        const names = {
          write_file: '写文件', read_file: '读文件', list_files: '列目录',
          run_gradle: '编译', delete_file: '删文件',
        };
        const entry = stepRow(names[event.name] || event.name || '工具', event.brief || '');
        state.pendingTool.set(event.id, entry);
        break;
      }

      case 'tool_done': {
        const entry = state.pendingTool.get(event.id);
        if (!entry) break;
        if (!event.ok) entry.row.classList.add('bad');
        if (event.out) {
          const box = make('details');
          box.appendChild(make('summary', null, event.ok ? '看输出' : '看报错'));
          box.appendChild(make('pre', 'hx-out', event.out));
          entry.body.appendChild(box);
        }
        break;
      }

      case 'tool_note':
        if (event.type === 'write' && event.path) {
          stepRow('写出', `${event.path} · ${size(event.bytes)}`);
        } else if (event.type === 'release') {
          stepRow('发布成品', event.path || '');
        }
        break;

      case 'release':
        toast(`编译出 ${event.name}`, 'good');
        stepRow('成品就绪', `${event.name || ''}`);
        break;

      case 'error':
        systemLine(`出错了：${event.text || '未知原因'}`);
        toast(event.text || '出错了', 'bad');
        break;

      case 'files':
        state.files = event.files || [];
        renderAssets();
        break;

      case 'run_end':
        break;

      default:
        break;
    }
  }

  /* ------------------------------------------------------------ 资产栏 */

  async function loadAssets(force) {
    if (!state.project) {
      state.files = [];
      renderAssets();
      return;
    }
    try {
      const data = await api(`/api/files?project=${encodeURIComponent(state.project)}`);
      state.files = data.files || [];
      state.releases = data.releases || [];
      renderAssets();
    } catch {
      if (force) toast('产物列表没拉到', 'bad');
    }
  }

  function fileURL(item) {
    return `/dl/${encodeURIComponent(state.project)}/${String(item.path).split('/').map(encodeURIComponent).join('/')}`;
  }

  function renderAssets() {
    const host = $('assetContent');
    const files = state.files || [];
    host.textContent = '';
    $('assetCount').textContent = `${files.length} 个文件`;
    $('bundleButton').hidden = files.length === 0;
    if (state.buildButton) state.buildButton.hidden = !state.project;

    if (!files.length) {
      host.appendChild(make('p', 'assets-empty',
        '还没有产物。\nAI 写出代码、贴图和模型后会出现在这里。'));
      return;
    }

    if (state.releases && state.releases.length) {
      const last = state.releases[state.releases.length - 1];
      const card = make('a', 'jar-card');
      card.href = fileURL({ path: `releases/${last.name}` });
      const body = make('div');
      body.appendChild(make('b', null, '下载成品 jar'));
      body.appendChild(make('small', null,
        [last.name, size(last.size), last.rev ? `第 ${last.rev} 版` : ''].filter(Boolean).join(' · ')));
      card.appendChild(make('i'));
      card.appendChild(body);
      card.appendChild(make('span', null, '↓'));
      host.appendChild(card);
    }

    host.appendChild(make('p', 'assets-split', '全部文件'));
    const tree = treeOf(files);
    const top = tree.dirs.size === 1 && !tree.files.length
      ? [...tree.dirs.values()][0] : tree;
    host.appendChild(branch(top, '', 0));
  }

  function treeOf(files) {
    const root = { dirs: new Map(), files: [] };
    files.forEach((item) => {
      const parts = String(item.path).split('/');
      const name = parts.pop();
      let node = root;
      parts.forEach((part) => {
        if (!node.dirs.has(part)) node.dirs.set(part, { dirs: new Map(), files: [] });
        node = node.dirs.get(part);
      });
      node.files.push({ ...item, name });
    });
    return root;
  }

  function countOf(node) {
    let total = node.files.length;
    node.dirs.forEach((child) => { total += countOf(child); });
    return total;
  }

  function branch(node, path, depth) {
    const box = make('div', 'tree-branch');
    [...node.dirs.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([name, child]) => box.appendChild(folderRow(name, child, `${path}/${name}`, depth)));
    node.files.slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((item) => box.appendChild(treeFile(item, depth)));
    return box;
  }

  function folderRow(name, node, path, depth) {
    const box = make('div', 'tree-dir');
    const head = make('button', 'tree-head');
    head.type = 'button';
    head.style.paddingLeft = `${depth * 12 + 6}px`;
    const open = state.opened.has(path);
    head.appendChild(make('i', 'tree-caret', open ? '▾' : '▸'));
    head.appendChild(make('b', null, name));
    head.appendChild(make('em', null, String(countOf(node))));
    head.onclick = () => {
      if (state.opened.has(path)) state.opened.delete(path);
      else state.opened.add(path);
      renderAssets();
    };
    box.appendChild(head);
    if (open) box.appendChild(branch(node, path, depth + 1));
    return box;
  }

  function treeFile(item, depth) {
    const row = make('div', 'tree-file');
    row.style.paddingLeft = `${depth * 12 + 6}px`;
    const thumb = make('i', 'tree-icon');
    if (/\.png$/i.test(item.name)) {
      const img = new Image();
      img.src = fileURL(item);
      img.alt = '';
      thumb.appendChild(img);
    } else {
      thumb.textContent = fileGlyph(item.name);
    }
    row.appendChild(thumb);
    const body = make('div');
    body.appendChild(make('b', null, item.name));
    body.appendChild(make('small', null, size(item.size)));
    body.title = item.path;
    row.appendChild(body);

    const open = make('button', 'asset-get', '↓');
    open.title = '下载这个文件';
    open.onclick = () => { window.location.href = fileURL(item); };
    row.appendChild(open);
    return row;
  }

  function fileGlyph(name) {
    const n = String(name).toLowerCase();
    if (n.endsWith('.jar')) return '⬢';
    if (n.endsWith('.java')) return '☕';
    if (n.endsWith('.json')) return '{}';
    if (n.endsWith('.png')) return '▨';
    if (n.endsWith('.bbmodel')) return '◳';
    if (n.endsWith('.gradle') || n.endsWith('.properties')) return '⚙';
    if (n.endsWith('.toml')) return '⚙';
    if (n.endsWith('.md') || n.endsWith('.txt')) return '≡';
    return '·';
  }

  async function buildJar() {
    if (!state.project) return;
    const btn = state.buildButton;
    if (btn) {
      btn.disabled = true;
      btn.textContent = '编译中…';
    }
    toast('开始编译，先看资产栏的日志');
    try {
      const result = await api('/api/build', {
        method: 'POST',
        body: JSON.stringify({ project: state.project, task: 'build' }),
      });
      toast(result.ok ? '编译通过，成品已发布' : '编译没过，看提示', result.ok ? 'good' : 'bad');
      await loadAssets(true);
    } catch (e) {
      toast(e.message || '编译失败', 'bad');
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = '编译 Jar';
    }
  }

  /* ------------------------------------------------------------ 用量 */

  async function refreshUsage() {
    try {
      const data = await api('/api/usage');
      $('balance').textContent = `${data.requests || 0} 次请求`;
      $('balance').title = `本机累计：${data.requests || 0} 次请求 · 约 ${size(data.bytes || 0)} 输出`;
    } catch {
      $('balance').textContent = '-- 次请求';
    }
    const total = (state.cfg && Number(state.cfg.historyLimit)) || 24;
    const used = 0;
    $('ctxText').textContent = `上下文 ${used} / ${total} 条`;
  }

  /* ------------------------------------------------------------ 模型列表 */

  async function loadModels() {
    try {
      const data = await api('/api/models', { method: 'POST', body: JSON.stringify({}) });
      state.models = data.models || [];
    } catch {
      state.models = [];
    }
    const current = (state.cfg && state.cfg.model) || '';
    const label = document.querySelector('#modelSwitch .model-switch-current');
    if (label) label.textContent = current || '未设置';
  }

  /* ------------------------------------------------------------ 弹窗 */

  function openModal(id) { $(id).hidden = false; }
  function closeModal(id) { $(id).hidden = true; }

  /* ---- 构建配置：新工程第一句话之前问一次 ---- */

  let setupPayload = null;

  function openSetup(words, extra) {
    setupPayload = { words, extra };
    const host = $('setupContent');
    host.textContent = '';

    host.appendChild(make('p', 'set-head', '游戏版本'));
    const versions = make('div', 'version-grid');
    MC_VERSIONS.forEach((version) => {
      const pick = make('button', `version-choice${draft.mcVersion === version ? ' selected' : ''}`, version);
      pick.type = 'button';
      pick.onclick = () => {
        draft.mcVersion = version;
        store.set('mcVersion', version);
        openSetup(words, extra);
      };
      versions.appendChild(pick);
    });
    host.appendChild(versions);

    host.appendChild(make('p', 'set-head', '加载器'));
    const loaders = make('div', 'loader-grid');
    LOADERS.forEach((loader) => {
      const cell = make('button', `loader-choice${draft.loader === loader.id ? ' selected' : ''}`);
      cell.type = 'button';
      const mark = make('span', 'loader-mark');
      const img = new Image();
      img.src = `/assets/loaders/${loader.id}.png`;
      img.alt = loader.name;
      mark.appendChild(img);
      cell.appendChild(mark);
      cell.appendChild(make('b', null, loader.name));
      cell.appendChild(make('small', null, loader.note));
      cell.onclick = () => {
        draft.loader = loader.id;
        store.set('loader', loader.id);
        openSetup(words, extra);
      };
      loaders.appendChild(cell);
    });
    host.appendChild(loaders);

    host.appendChild(make('p', 'set-head', 'AI 想多久'));
    const efforts = make('div', 'loader-grid');
    EFFORTS.forEach((item) => {
      const cell = make('button', `loader-choice${draft.effort === item.id ? ' selected' : ''}`);
      cell.type = 'button';
      cell.appendChild(make('span', 'loader-mark')).textContent = item.name.slice(0, 1);
      cell.appendChild(make('b', null, item.name));
      cell.appendChild(make('small', null, item.note));
      cell.onclick = () => {
        draft.effort = item.id;
        store.set('effort', item.id);
        openSetup(words, extra);
      };
      efforts.appendChild(cell);
    });
    host.appendChild(efforts);

    openModal('setupDialog');
  }

  async function confirmSetup() {
    closeModal('setupDialog');
    const payload = setupPayload || { words: '' };
    try {
      await api('/api/config', {
        method: 'POST',
        body: JSON.stringify({
          mcVersion: draft.mcVersion || (state.cfg && state.cfg.mcVersion) || '1.21.1',
          loader: draft.loader,
          reasoningEffort: draft.effort,
          historyLimit: draft.ctxLimit,
        }),
      });
      state.cfg = await api('/api/config');
    } catch (e) {
      toast(e.message || '配置没存上', 'bad');
    }
    await runChat(payload.words, payload.extra);
  }

  /* ---- AI 构建：先把需求拆成创意 ---- */

  function openPlan(words) {
    state.planPicked = new Map();
    $('planInput').value = words || '';
    $('planContent').textContent = '';
    $('planAsk').hidden = false;
    $('planLoading').hidden = true;
    $('planBuild').hidden = true;
    $('planCount').textContent = '先说说你想做什么，AI 会拆成一组创意任你挑';
    openModal('planDialog');
  }

  async function generatePlan() {
    const words = String($('planInput').value || '').trim();
    if (!words) {
      toast('先说一句你想做什么', 'bad');
      return;
    }
    $('planAsk').hidden = true;
    $('planLoading').hidden = false;
    $('planContent').textContent = '';
    try {
      const data = await api('/api/plan', {
        method: 'POST',
        body: JSON.stringify({ text: words }),
      });
      state.planData = data.plan;
      state.planPicked = new Map();
      (data.plan.groups || []).forEach((group) => {
        const first = (group.options || []).find((o) => o.recommended) || (group.options || [])[0];
        if (first) state.planPicked.set(group.id, first.id);
      });
      renderPlan(data.plan);
    } catch (e) {
      toast(e.message || '创意没生成出来', 'bad');
      $('planAsk').hidden = false;
    }
    $('planLoading').hidden = true;
  }

  function renderPlan(plan) {
    const host = $('planContent');
    host.textContent = '';
    if (!plan) return;
    if (plan.title) host.appendChild(make('h3', null, plan.title));
    if (plan.summary) host.appendChild(make('p', 'plan-summary', plan.summary));
    (plan.groups || []).forEach((group) => {
      const box = make('div', 'plan-group');
      box.appendChild(make('b', null, group.title || ''));
      if (group.desc) box.appendChild(make('small', null, group.desc));
      const row = make('div', 'plan-options');
      (group.options || []).forEach((option) => {
        const cell = make('button',
          `plan-option${state.planPicked.get(group.id) === option.id ? ' selected' : ''}`);
        cell.type = 'button';
        cell.appendChild(make('b', null, option.label || ''));
        cell.appendChild(make('small', null, option.detail || ''));
        cell.onclick = () => {
          state.planPicked.set(group.id, option.id);
          renderPlan(plan);
        };
        row.appendChild(cell);
      });
      box.appendChild(row);
      host.appendChild(box);
    });
    $('planCount').textContent = `挑好了就开工，一共 ${(plan.groups || []).length} 组`;
    $('planBuild').hidden = false;
  }

  function planToWords() {
    const plan = state.planData;
    if (!plan) return String($('planInput').value || '').trim();
    const base = String($('planInput').value || '').trim();
    const picks = [];
    (plan.groups || []).forEach((group) => {
      const id = state.planPicked.get(group.id);
      const option = (group.options || []).find((o) => o.id === id);
      if (option) picks.push(`${group.title}：${option.label}${option.detail ? `（${option.detail}）` : ''}`);
    });
    return `${base}\n\n按下面的选择来做：\n${picks.map((line) => `- ${line}`).join('\n')}`;
  }

  /* ---- 改名：本地版用来给项目起名 ---- */

  let renameTarget = null;

  function openRename() {
    const chat = state.chats.find((item) => item.id === state.chatId);
    if (!chat) {
      toast('先打开一个项目', 'bad');
      return;
    }
    renameTarget = chat.id;
    $('renameTitle').textContent = '给这个项目改个名字';
    $('renameNow').textContent = chat.title || '未命名模组';
    $('renameInput').value = chat.title || '';
    $('renameAck').checked = false;
    $('renameGo').disabled = true;
    const warn = $('renameContent').querySelector('.rename-warn');
    if (warn) warn.hidden = true;
    openModal('renameDialog');
  }

  async function confirmRename() {
    const name = String($('renameInput').value || '').trim();
    if (!name) return;
    closeModal('renameDialog');
    try {
      await api(`/api/chats/${renameTarget}/rename`, {
        method: 'POST',
        body: JSON.stringify({ title: name }),
      });
      state.title = name;
      $('pageTitle').textContent = name;
      await loadChats();
      toast('改好了', 'good');
    } catch (e) {
      toast(e.message || '没改成', 'bad');
    }
  }

  /* ---- 本机设置 ---- */

  function openSettings() {
    const cfg = state.cfg || {};
    const host = $('settingsContent');
    host.textContent = '';

    const field = (label, node, note) => {
      const wrap = make('label', 'set-field');
      wrap.appendChild(make('span', null, label));
      wrap.appendChild(node);
      if (note) wrap.appendChild(make('small', null, note));
      host.appendChild(wrap);
      return node;
    };

    host.appendChild(make('p', 'set-head', '上游接口'));
    const baseUrl = field('接口地址', make('input'), 'OpenAI 兼容的 /chat/completions 地址');
    baseUrl.value = cfg.baseUrl || '';
    baseUrl.placeholder = 'https://…/v1';
    const apiKey = field('密钥', make('input'), cfg.apiKeyHint ? `已经存了一个（${cfg.apiKeyHint}），不填就沿用` : '只写进本机 config.json');
    apiKey.type = 'password';
    apiKey.placeholder = cfg.apiKeySet ? '已保存，留空不改动' : 'sk-…';

    host.appendChild(make('p', 'set-head', '模型'));
    const model = field('模型名', make('input'), '点下面的按钮拉取可用模型');
    model.value = cfg.model || '';
    const pick = make('button', 'login-settings', '拉取模型列表');
    pick.type = 'button';
    pick.onclick = async () => {
      pick.disabled = true;
      pick.textContent = '拉取中…';
      try {
        const data = await api('/api/models', {
          method: 'POST',
          body: JSON.stringify({ baseUrl: baseUrl.value.trim(), apiKey: apiKey.value.trim() }),
        });
        state.models = data.models || [];
        renderModelPicker(host, model, state.models);
        toast(`拿到 ${state.models.length} 个模型`, 'good');
      } catch (e) {
        toast(e.message || '没拉到模型', 'bad');
      }
      pick.disabled = false;
      pick.textContent = '拉取模型列表';
    };
    host.appendChild(pick);
    const listHost = make('div');
    host.appendChild(listHost);
    renderModelPicker(listHost, model, state.models);

    host.appendChild(make('p', 'set-head', '行为'));
    const grid = make('div', 'set-grid');
    host.appendChild(grid);

    const effort = make('select');
    EFFORTS.forEach((item) => {
      const opt = make('option', null, `${item.name} · ${item.note}`);
      opt.value = item.id;
      effort.appendChild(opt);
    });
    effort.value = draft.effort;
    const ctx = make('select');
    CTX_CHOICES.forEach((item) => {
      const opt = make('option', null, `${item.name} · ${item.note}`);
      opt.value = String(item.id);
      ctx.appendChild(opt);
    });
    ctx.value = String(draft.ctxLimit);

    const g1 = make('label', 'set-field');
    g1.appendChild(make('span', null, '思考深度'));
    g1.appendChild(effort);
    const g2 = make('label', 'set-field');
    g2.appendChild(make('span', null, '上下文条数'));
    g2.appendChild(ctx);
    grid.appendChild(g1);
    grid.appendChild(g2);

    const timeout = make('input');
    timeout.type = 'number';
    timeout.value = cfg.apiTimeoutSec || 180;
    const gradle = make('input');
    gradle.value = cfg.gradleCmd || '';
    gradle.placeholder = '留空就用工程里的 gradlew';
    const g3 = make('label', 'set-field');
    g3.appendChild(make('span', null, '上游超时（秒）'));
    g3.appendChild(timeout);
    const g4 = make('label', 'set-field');
    g4.appendChild(make('span', null, '本机 Gradle 命令'));
    g4.appendChild(gradle);
    grid.appendChild(g3);
    grid.appendChild(g4);

    host._collect = () => {
      const body = {
        baseUrl: baseUrl.value.trim(),
        model: model.value.trim(),
        reasoningEffort: effort.value,
        historyLimit: Number(ctx.value) || 24,
        apiTimeoutSec: Number(timeout.value) || 180,
        gradleCmd: gradle.value.trim(),
      };
      if (apiKey.value.trim()) body.apiKey = apiKey.value.trim();
      return body;
    };
    host._effort = effort;

    openModal('settingsDialog');
  }

  function renderModelPicker(host, input, models) {
    host.textContent = '';
    if (!models || !models.length) return;
    const box = make('div', 'set-models');
    models.slice(0, 200).forEach((item) => {
      const name = typeof item === 'string' ? item : (item.id || item.name || '');
      if (!name) return;
      const btn = make('button', `set-model${input.value === name ? ' on' : ''}`, name);
      btn.type = 'button';
      btn.onclick = () => {
        input.value = name;
        renderModelPicker(host, input, models);
      };
      box.appendChild(btn);
    });
    host.appendChild(box);
  }

  async function saveSettings() {
    const host = $('settingsContent');
    const body = host._collect ? host._collect() : {};
    try {
      state.cfg = await api('/api/config', { method: 'POST', body: JSON.stringify(body) });
      draft.effort = body.reasoningEffort || draft.effort;
      draft.ctxLimit = body.historyLimit || draft.ctxLimit;
      store.set('effort', draft.effort);
      store.set('ctxLimit', draft.ctxLimit);
      closeModal('settingsDialog');
      toast('已保存到 config.json', 'good');
      await loadModels();
      paintReady();
      refreshUsage();
    } catch (e) {
      toast(e.message || '没存上', 'bad');
    }
  }

  /* ---- 公告：本地版拿来放版本说明 ---- */

  function openAnnouncement(title, html, link) {
    $('announcementTone').textContent = '本机提示';
    $('announcementTitle').textContent = title;
    $('announcementContent').innerHTML = html;
    const a = $('announcementLink');
    if (link) {
      a.href = link;
      a.textContent = '打开仓库';
      a.hidden = false;
    } else {
      a.hidden = true;
    }
    openModal('announcementDialog');
  }

  async function checkUpdate() {
    toast('正在查远端版本…');
    try {
      const data = await api('/api/update', { method: 'POST', body: JSON.stringify({}) });
      const notes = String(data.notes || '这次没写说明').replace(/\n/g, '<br />');
      if (data.updateAvailable) {
        openAnnouncement(`有新版本 ${data.remote}`,
          `本机是 <b>${esc(data.local)}</b>，远端是 <b>${esc(data.remote)}</b>。<br /><br />${esc(notes)}`,
          `https://github.com/${data.repo}`);
        $('announcementConfirm').textContent = '知道了';
      } else {
        openAnnouncement(`已经是最新（${data.local}）`,
          `远端也是 <b>${esc(data.remote)}</b>，不用更新。<br /><br />${esc(notes)}`,
          `https://github.com/${data.repo}`);
      }
    } catch (e) {
      toast(e.message || '查不到远端版本', 'bad');
    }
  }

  async function openUsageBoard() {
    let data = { requests: 0, bytes: 0, since: '' };
    try { data = await api('/api/usage'); } catch { /* 用默认值 */ }
    const kb = size(data.bytes || 0);
    openAnnouncement('本机用量', `
      <ul>
        <li>累计发起 <b>${Number(data.requests || 0)}</b> 次请求</li>
        <li>模型输出约 <b>${esc(kb || '0 B')}</b></li>
        <li>统计从 ${esc(data.since ? new Date(data.since).toLocaleString('zh-CN') : '第一次运行')} 开始</li>
        <li>本地版不扣积分，花的是你自己上游账号的钱</li>
      </ul>`);
    $('announcementConfirm').textContent = '知道了';
  }

  /* ------------------------------------------------------------ 引导 */

  const TOUR = [
    { at: '#sidebar', title: '左边是做过的东西', copy: '每次新建模组都会留在这里，点一下就能接着改。' },
    { at: '#composer', title: '在这里说话', copy: '想到什么写什么。写完按 Shift + 回车，或者直接点右边那颗箭头。' },
    { at: '#modelSwitch', title: '换模型和想多久', copy: '这里选哪台模型、让它想多深。想得越深越慢，也越费 token。' },
    { at: '#assetsPanel', title: '做出来都在右边', copy: '源码、贴图、编译好的 jar 都会出现在这里，随时能单独下载或者整包拿走。' },
  ];

  function maybeOnboard() {
    if (store.get('onboarded', false)) return;
    $('onboarding').hidden = false;
  }

  function startTour(level) {
    store.set('level', level);
    $('rolePick').hidden = true;
    $('tour').hidden = false;
    if (level === 'veteran') {
      finishTour();
      return;
    }
    state.tourIndex = 0;
    renderTour();
  }

  function renderTour() {
    const step = TOUR[state.tourIndex];
    if (!step) return;
    const target = document.querySelector(step.at);
    $('tourTitle').textContent = step.title;
    $('tourCopy').textContent = step.copy;
    $('tourCount').textContent = `${state.tourIndex + 1} / ${TOUR.length}`;
    const dots = $('tourDots');
    dots.textContent = '';
    TOUR.forEach((_, index) => {
      dots.appendChild(make('i', index === state.tourIndex ? 'on' : ''));
    });
    $('tourBack').disabled = state.tourIndex === 0;
    $('tourNext').textContent = state.tourIndex === TOUR.length - 1 ? '开始做' : '下一步';
    if (target) {
      const box = target.getBoundingClientRect();
      const focus = $('tourFocus');
      focus.style.left = `${box.left - 6}px`;
      focus.style.top = `${box.top - 6}px`;
      focus.style.width = `${box.width + 12}px`;
      focus.style.height = `${box.height + 12}px`;
    }
  }

  function finishTour() {
    $('onboarding').hidden = true;
    store.set('onboarded', true);
    $('starters').hidden = false;
    if (window.MCIcons) window.MCIcons.mount($('starters'));
  }

  /* ------------------------------------------------------------ 附件与语音 */

  const pendingFiles = [];

  function renderFileChips() {
    const host = $('fileChips');
    host.textContent = '';
    host.hidden = pendingFiles.length === 0;
    pendingFiles.forEach((file, index) => {
      const chip = make('span', 'file-chip', file.name);
      const del = make('button', null, '×');
      del.type = 'button';
      del.onclick = () => {
        pendingFiles.splice(index, 1);
        renderFileChips();
      };
      chip.appendChild(del);
      host.appendChild(chip);
    });
  }

  function mountVoice() {
    const btn = $('micButton');
    if (!btn) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      btn.title = '这个浏览器不支持语音输入';
      btn.onclick = () => toast('这个浏览器不支持语音输入', 'bad');
      return;
    }
    let rec = null;
    btn.onclick = () => {
      if (rec) {
        rec.stop();
        return;
      }
      rec = new SR();
      rec.lang = 'zh-CN';
      rec.interimResults = true;
      rec.continuous = true;
      btn.setAttribute('aria-pressed', 'true');
      btn.classList.add('on');
      rec.onresult = (event) => {
        let text = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          text += event.results[i][0].transcript;
        }
        const input = $('input');
        input.value = `${input.value}${text}`;
        autoGrow();
      };
      rec.onerror = (event) => toast(`语音没听清：${event.error || ''}`, 'bad');
      rec.onend = () => {
        rec = null;
        btn.setAttribute('aria-pressed', 'false');
        btn.classList.remove('on');
      };
      rec.start();
    };
  }

  /* ------------------------------------------------------------ 事件绑定 */

  function autoGrow() {
    const input = $('input');
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 200)}px`;
  }

  function bindStatic() {
    // 启动页
    $('loginEnter').onclick = () => enterApp(true);
    $('loginSettings').onclick = () => openSettings();

    // 主题
    $('themeToggle').onclick = () => {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      localStorage.setItem('blockforge.theme', next);
      if (window.BlockForgeSkin) window.BlockForgeSkin.setTheme(next);
    };

    // 侧栏
    $('newProject').onclick = () => {
      if (state.running) {
        toast('这一轮还在跑，先停一下', 'bad');
        return;
      }
      newDraft();
      $('input').focus();
    };
    $('collapseSide').onclick = () => {
      document.querySelector('.shell').classList.add('side-closed');
      $('openSide').hidden = false;
    };
    $('openSide').onclick = () => {
      document.querySelector('.shell').classList.remove('side-closed');
      $('openSide').hidden = true;
    };
    ['newTexture', 'modelEntry', 'marketEntry', 'assetsEntry'].forEach((id) => {
      $(id).onclick = (event) => {
        event.preventDefault();
        toast('这一块在主站是云端服务，本地版没接', 'bad');
      };
    });

    // 顶栏
    $('projectId').onclick = async () => {
      try {
        await navigator.clipboard.writeText($('projectId').textContent || '');
        toast('编号已复制', 'good');
      } catch { /* 没权限就算了 */ }
    };
    $('stopButton').onclick = async () => {
      try {
        await api('/api/stop', {
          method: 'POST',
          body: JSON.stringify({ chatId: state.chatId }),
        });
        toast('已请求停止');
      } catch (e) {
        toast(e.message || '停不下来', 'bad');
      }
    };
    $('activityLink').onclick = (event) => {
      event.preventDefault();
      openUsageBoard();
    };
    $('balance').onclick = () => openUsageBoard();
    $('profileButton').onclick = () => openSettings();

    // 资产栏
    $('collapseAssets').onclick = () => {
      const off = document.querySelector('.project-content').classList.toggle('assets-closed');
      $('openAssets').hidden = !off;
    };
    $('openAssets').onclick = () => {
      document.querySelector('.project-content').classList.remove('assets-closed');
      $('openAssets').hidden = true;
    };
    $('bundleButton').onclick = () => {
      if (!state.project) return;
      window.location.href = `/api/zip?project=${encodeURIComponent(state.project)}`;
    };
    // 编译 Jar：主站是后台自动编，本地版给个按钮自己点
    const bundle = $('bundleButton');
    const build = make('button', 'bundle-get', '编译 Jar');
    build.type = 'button';
    build.hidden = true;
    build.onclick = buildJar;
    bundle.parentNode.insertBefore(build, bundle);
    state.buildButton = build;

    // 输入区
    const input = $('input');
    input.addEventListener('input', autoGrow);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submitComposer();
      }
    });
    $('composer').onsubmit = (event) => {
      event.preventDefault();
      submitComposer();
    };
    $('attachButton').onclick = (event) => {
      event.preventDefault();
      $('fileInput').click();
    };
    $('fileInput').onchange = (event) => {
      Array.from(event.target.files || []).forEach((file) => pendingFiles.push(file));
      renderFileChips();
      event.target.value = '';
    };
    $('planSwitch').onchange = (event) => {
      const on = event.target.checked;
      $('planToggle').querySelector('.ai-build-copy small').textContent =
        on ? '开启 · 先拆创意再动手' : '关闭 · 原话直接制作';
    };

    // 模型切换
    bindSwitch('#modelSwitch', async () => {
      const items = state.models.length
        ? state.models.map((m) => ({ id: m, name: m }))
        : [{ id: state.cfg && state.cfg.model, name: (state.cfg && state.cfg.model) || '当前模型' }];
      return items;
    }, async (id) => {
      try {
        state.cfg = await api('/api/config', { method: 'POST', body: JSON.stringify({ model: id }) });
        toast(`模型换成 ${id}`, 'good');
        loadModels();
      } catch (e) {
        toast(e.message || '没换成功', 'bad');
      }
    });

    bindSwitch('#crewSwitch', async () => [
      { id: 'auto', name: '自动 · 本机一次跑一个' },
      { id: '1', name: '1 个 · 本机只能这样' },
    ], async () => {
      toast('本地版没有帮手集群，一次就一个', 'bad');
    });

    bindSwitch('#ctxSwitch', async () => CTX_CHOICES.map((item) => ({
      id: String(item.id), name: `${item.name} · ${item.note}`,
    })), async (id) => {
      draft.ctxLimit = Number(id) || 24;
      store.set('ctxLimit', draft.ctxLimit);
      document.querySelector('#ctxSwitch .model-switch-current').textContent = `${draft.ctxLimit} 条`;
      $('ctxText').textContent = `上下文 0 / ${draft.ctxLimit} 条`;
      try {
        state.cfg = await api('/api/config', {
          method: 'POST', body: JSON.stringify({ historyLimit: draft.ctxLimit }),
        });
        toast('上下文条数已改', 'good');
      } catch { /* 静默 */ }
    });

    // 弹窗
    $('setupCancel').onclick = () => closeModal('setupDialog');
    $('setupConfirm').onclick = confirmSetup;
    $('planCancel').onclick = () => closeModal('planDialog');
    $('planGo').onclick = generatePlan;
    $('planBuild').onclick = () => {
      closeModal('planDialog');
      send(planToWords());
    };
    $('renameCancel').onclick = () => closeModal('renameDialog');
    $('renameGo').onclick = confirmRename;
    $('renameInput').oninput = () => {
      const ok = /^[a-zA-Z][a-zA-Z0-9_]*$/.test($('renameInput').value.trim())
        || $('renameInput').value.trim().length > 0;
      $('renameGo').disabled = !ok;
    };
    $('renameAck').onchange = (event) => {
      $('renameGo').disabled = !event.target.checked;
    };
    $('settingsCancel').onclick = () => closeModal('settingsDialog');
    $('settingsSave').onclick = saveSettings;
    $('settingsCheck').onclick = checkUpdate;
    $('announcementConfirm').onclick = () => closeModal('announcementDialog');
    $('announcementLater').onclick = () => closeModal('announcementDialog');

    // 引导
    document.querySelectorAll('.hx-role-card').forEach((card) => {
      card.onclick = () => startTour(card.dataset.level);
    });
    $('tourSkip').onclick = finishTour;
    $('tourBack').onclick = () => {
      state.tourIndex = Math.max(0, (state.tourIndex || 0) - 1);
      renderTour();
    };
    $('tourNext').onclick = () => {
      if ((state.tourIndex || 0) >= TOUR.length - 1) {
        finishTour();
        return;
      }
      state.tourIndex = (state.tourIndex || 0) + 1;
      renderTour();
    };
    window.addEventListener('resize', () => {
      if (!$('tour').hidden) renderTour();
    });

    // 示例
    document.querySelectorAll('#starters button').forEach((btn) => {
      btn.onclick = () => {
        $('input').value = btn.dataset.ask || '';
        autoGrow();
        $('input').focus();
      };
    });

    // 改名入口：顶栏标题上双击
    $('pageTitle').ondblclick = openRename;

    mountVoice();
    if (window.MCIcons) window.MCIcons.mount(document.body);
  }

  function bindSwitch(selector, loader, onPick) {
    const box = document.querySelector(selector);
    if (!box) return;
    const trigger = box.querySelector('.model-switch-trigger');
    const menu = box.querySelector('.model-switch-menu');
    trigger.onclick = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const open = !menu.hidden;
      document.querySelectorAll('.model-switch-menu').forEach((m) => { m.hidden = true; });
      if (open) return;
      menu.textContent = '';
      menu.appendChild(make('small', null, '读取中…'));
      menu.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');
      let items = [];
      try { items = await loader(); } catch { items = []; }
      menu.textContent = '';
      items.forEach((item) => {
        const btn = make('button', 'model-option', item.name);
        btn.type = 'button';
        btn.onclick = async (e) => {
          e.stopPropagation();
          menu.hidden = true;
          trigger.setAttribute('aria-expanded', 'false');
          const label = box.querySelector('.model-switch-current');
          if (label) label.textContent = item.id;
          await onPick(item.id);
        };
        menu.appendChild(btn);
      });
      if (!items.length) menu.appendChild(make('small', null, '没有可选项'));
    };
    document.addEventListener('click', (event) => {
      if (!box.contains(event.target)) {
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function submitComposer() {
    const input = $('input');
    const words = input.value.trim();
    if (!words) return;
    if (state.running) {
      toast('这一轮还在跑，等它做完', 'bad');
      return;
    }
    if ($('planSwitch') && $('planSwitch').checked) {
      openPlan(words);
      return;
    }
    input.value = '';
    autoGrow();
    const extra = pendingFiles.length
      ? { files: pendingFiles.map((file) => file.name) }
      : null;
    send(words, extra);
  }

  /* ------------------------------------------------------------ go */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
