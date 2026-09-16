/* 教程页逻辑：接 /api/learn/* 那四个口子。
 * 章节列表、正文、章内提问、AI 生成新章节。 */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const make = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };

  let currentId = '';
  const history = [];

  let toastTimer = 0;
  function toast(text) {
    const box = $('toast');
    box.textContent = text;
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.hidden = true; }, 3000);
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      headers: options.body ? { 'Content-Type': 'application/json' } : {},
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  /* ---- 目录 ---- */

  async function loadTracks() {
    const data = await api('/api/learn/tracks');
    const host = $('tracks');
    host.textContent = '';
    (data.tracks || []).forEach((track) => {
      const box = make('div', 'learn-track');
      box.appendChild(make('b', null, track.title));
      (track.chapters || []).forEach((chapter) => {
        const btn = make('button', `learn-chapter${chapter.id === currentId ? ' on' : ''}`);
        btn.type = 'button';
        btn.appendChild(make('span', null, chapter.short || chapter.title));
        if (chapter.lead) btn.appendChild(make('small', null, chapter.lead));
        btn.onclick = () => openChapter(chapter.id);
        if (chapter.custom) {
          const del = make('em', null, ' ×');
          del.title = '删除这一章';
          del.onclick = async (event) => {
            event.stopPropagation();
            try {
              await api(`/api/learn/chapter?id=${encodeURIComponent(chapter.id)}`, { method: 'DELETE' });
              await loadTracks();
              toast('已删除');
            } catch (e) {
              toast(e.message || '删不掉');
            }
          };
          btn.appendChild(del);
        }
        box.appendChild(btn);
      });
      host.appendChild(box);
    });
  }

  async function openChapter(id) {
    const data = await api(`/api/learn/chapter?id=${encodeURIComponent(id)}`);
    const chapter = data.chapter;
    currentId = id;
    history.length = 0;
    $('answers').textContent = '';
    const host = $('body');
    host.innerHTML = chapter.body || `<h1>${chapter.title}</h1>`;
    if (!/^<h1/m.test(chapter.body || '')) {
      host.insertBefore(make('h1', null, chapter.title), host.firstChild);
    }
    if (chapter.lead) {
      const lead = make('p', 'learn-lead', chapter.lead);
      const first = host.querySelector('h1');
      if (first && first.nextSibling) host.insertBefore(lead, first.nextSibling);
      else host.appendChild(lead);
    }
    host.scrollTop = 0;
    await loadTracks();
  }

  /* ---- 章内提问（SSE） ---- */

  async function ask() {
    const input = $('ask');
    const question = input.value.trim();
    if (!question) return;
    if (!currentId) {
      toast('先在左边挑一章');
      return;
    }
    input.value = '';
    const host = $('answers');
    const qa = make('div', 'learn-qa');
    qa.appendChild(make('b', null, question));
    const out = make('div', null, '…');
    qa.appendChild(out);
    host.appendChild(qa);
    host.scrollTop = host.scrollHeight;

    history.push({ role: 'user', content: question });

    let res;
    try {
      res = await fetch('/api/learn/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chapterId: currentId, question, history: history.slice(0, -1) }),
      });
    } catch (e) {
      out.textContent = `连不上：${e.message}`;
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let text = '';
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
        if (!event) continue;
        if (event.k === 'say_delta' || event.k === 'delta' || event.k === 'text') {
          text += event.text || event.delta || '';
        } else if (event.k === 'say_settled' || event.k === 'content') {
          text = event.text || event.content || text;
        } else if (event.k === 'error') {
          text += `\n出错了：${event.text || ''}`;
        }
      }
      out.textContent = text || '…';
      host.scrollTop = host.scrollHeight;
    }
    out.textContent = text || '（没收到回答）';
    if (text) history.push({ role: 'assistant', content: text });
  }

  /* ---- AI 生成新章节 ---- */

  async function generate() {
    const topic = $('genTopic').value.trim();
    if (!topic) {
      toast('先写个主题');
      return;
    }
    const note = $('genNote');
    note.textContent = '正在写这一章，可能要一两分钟…';
    $('genGo').disabled = true;
    try {
      const res = await fetch('/api/learn/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, track: 'custom' }),
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
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
          if (!event) continue;
          if (event.k === 'status') note.textContent = event.text;
          if (event.k === 'error') throw new Error(event.text || '生成失败');
        }
      }
      note.textContent = '写好了，在「自定义章节」里';
      $('genTopic').value = '';
      await loadTracks();
    } catch (e) {
      note.textContent = e.message || '生成失败';
    }
    $('genGo').disabled = false;
  }

  /* ---- 绑定 ---- */

  $('askGo').onclick = ask;
  $('ask').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      ask();
    }
  });
  $('ask').addEventListener('input', () => {
    const el = $('ask');
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  });
  $('genGo').onclick = generate;

  loadTracks().catch((e) => toast(e.message || '目录没拉到'));
})();
