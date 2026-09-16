/* 贴图工坊：接 /api/image 生图，存进工程的 assets/<modid>/textures/<kind>/ */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const make = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };

  let lastB64 = '';
  let lastMeta = null;

  let toastTimer = 0;
  function toast(text, tone) {
    const box = $('toast');
    box.textContent = text;
    box.hidden = false;
    box.classList.toggle('bad', tone === 'bad');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.hidden = true; }, 3200);
  }

  function note(text, tone) {
    const el = $('note');
    el.textContent = text || '';
    el.className = `tex-note${tone ? ` ${tone}` : ''}`;
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

  /* ---- 工程列表 ---- */

  async function loadProjects() {
    const data = await api('/api/chats');
    const list = (data.chats || []).slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const sel = $('project');
    sel.textContent = '';
    if (!list.length) {
      sel.appendChild(make('option', null, '（还没有工程）')).value = '';
      return;
    }
    list.forEach((chat) => {
      const opt = make('option', null, chat.title || '未命名模组');
      opt.value = chat.project || '';
      sel.appendChild(opt);
    });
    const want = new URLSearchParams(location.search).get('project');
    if (want) sel.value = want;
    await loadExisting();
  }

  async function loadExisting() {
    const project = $('project').value;
    const host = $('list');
    host.textContent = '';
    if (!project) return;
    try {
      const data = await api(`/api/files?project=${encodeURIComponent(project)}`);
      const files = (data.files || []).filter((f) => /textures\/.+\.png$/i.test(f.path));
      files.forEach((file) => {
        const chip = make('div', 'tex-chip');
        const img = new Image();
        img.src = `/dl/${encodeURIComponent(project)}/${file.path.split('/').map(encodeURIComponent).join('/')}`;
        img.alt = '';
        chip.appendChild(img);
        chip.appendChild(make('span', null, file.path.split('/').pop().replace(/\.png$/, '')));
        host.appendChild(chip);
      });
    } catch { /* 静默 */ }
  }

  /* ---- 生成 ---- */

  const MC_PREFIX = 'Minecraft-style pixel art texture, 16-bit, crisp edges, no anti-aliasing, '
    + 'clean silhouette, game asset, ';

  function buildPrompt() {
    const raw = String($('prompt').value || '').trim();
    if (!raw) return '';
    return $('mcStyle').checked ? MC_PREFIX + raw : raw;
  }

  async function generate(save) {
    const prompt = buildPrompt();
    if (!prompt) {
      note('先写一句描述', 'bad');
      return;
    }
    const project = $('project').value;
    const name = String($('name').value || '').trim();
    if (save && !project) {
      note('先选一个工程', 'bad');
      return;
    }
    if (save && !name) {
      note('先填贴图标识', 'bad');
      return;
    }

    note(save ? '正在生成并存进工程…' : '正在生成，通常几十秒…');
    $('go').disabled = true;
    if (save) $('save').disabled = true;
    try {
      const data = await api('/api/image', {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          size: $('size').value,
          scale: Number($('scale').value),
          save: save ? 1 : 0,
          project,
          name,
          kind: $('kind').value,
        }),
      });
      lastB64 = data.b64 || '';
      lastMeta = data;
      if (lastB64) {
        $('img').src = `data:image/png;base64,${lastB64}`;
        $('preview').hidden = false;
        $('empty').hidden = true;
      }
      if (save) {
        note(`已存到 ${data.path}${data.scaled ? `（缩到 ${data.px}×${data.px}）` : ''}`, 'good');
        toast('贴图已存进工程', 'good');
        await loadExisting();
      } else {
        const px = Number($('scale').value);
        $('meta').textContent = px > 0
          ? `预览是原图，存进工程时会缩到 ${px}×${px}`
          : '预览是原图，存进工程时不缩放';
        note('出图了，看看要不要存', 'good');
      }
    } catch (e) {
      note(e.message || '生成失败', 'bad');
      toast(e.message || '生成失败', 'bad');
    }
    $('go').disabled = false;
    if (save) $('save').disabled = false;
  }

  /* ---- 绑定 ---- */

  $('go').onclick = () => generate(false);
  $('again').onclick = () => generate(false);
  $('save').onclick = () => generate(true);
  $('project').onchange = loadExisting;

  $('download').onclick = () => {
    if (!lastB64) return;
    const a = document.createElement('a');
    a.href = `data:image/png;base64,${lastB64}`;
    a.download = `${String($('name').value || 'texture').replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
    a.click();
  };

  loadProjects().catch((e) => note(e.message || '工程列表没拉到', 'bad'));
  if (window.MCIcons) window.MCIcons.mount(document.body);
})();
