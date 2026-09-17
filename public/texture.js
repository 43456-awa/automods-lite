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
  let MODELS = {};        // /api/image/sizes 给的：模型 → 支持哪些尺寸/格式
  let mode = 'generate';  // generate | edit
  let refDataUrl = '';

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

  /* ---- 模型 / 尺寸 ----
   * 官方给的两个模型支持的分辨率不一样，切模型就得换下拉内容；
   * output_format / response_format 只有 U1.5 Lite 支持，U1 Fast 传了会报错。 */

  async function loadModels() {
    const data = await api('/api/image/sizes');
    MODELS = data.models || {};
    const sel = $('model');
    sel.textContent = '';
    Object.entries(MODELS).forEach(([id, spec]) => {
      const opt = make('option', null, spec.label || id);
      opt.value = id;
      sel.appendChild(opt);
    });
    if (!sel.value && Object.keys(MODELS).length) sel.value = Object.keys(MODELS)[0];
    applyModel();
  }

  function applyModel() {
    const spec = MODELS[$('model').value] || {};
    const sizes = spec.sizes || [];
    const sel = $('size');
    const keep = sel.value;
    sel.textContent = '';
    sizes.forEach((item) => {
      const opt = make('option', null, item.label || item.v);
      opt.value = item.v;
      sel.appendChild(opt);
    });
    const custom = make('option', null, '自定义…');
    custom.value = '__custom';
    sel.appendChild(custom);
    if (sizes.some((s) => s.v === keep)) sel.value = keep;

    // 只有 U1.5 Lite 认这两个字段
    $('outFmtBox').hidden = !spec.formats;
    $('respFmtBox').hidden = !spec.formats;
    // 图生图也只有 U1.5 Lite 支持
    $('modeEdit').disabled = !spec.edits;
    if (!spec.edits && mode === 'edit') setMode('generate');

    const bits = [];
    bits.push(spec.formats ? '支持输出格式 / 返回方式' : '不支持 output_format / response_format');
    bits.push(spec.edits ? '支持图生图编辑' : '不支持图生图');
    $('modelNote').textContent = bits.join(' · ');
  }

  function setMode(next) {
    mode = next;
    $('modeGen').classList.toggle('on', next === 'generate');
    $('modeEdit').classList.toggle('on', next === 'edit');
    $('refBox').hidden = next !== 'edit';
    $('go').textContent = next === 'edit' ? '生成（图生图）' : '生成贴图';
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
        const seg = file.path.split('/');
        const kind = seg[1] === 'block' ? 'block' : 'item';
        const name = seg[seg.length - 1].replace(/\.png$/, '');
        const url = `/dl/${encodeURIComponent(project)}/${file.path.split('/').map(encodeURIComponent).join('/')}`;
        const chip = make('div', 'tex-chip');
        const img = new Image();
        img.src = url;
        img.alt = '';
        chip.appendChild(img);
        chip.appendChild(make('span', null, name));
        // 「以此为参考」：把现有贴图当图生图的输入，复用 U1.5 Lite 的编辑能力
        const asRef = make('button', 'tex-chip-ref', '以此为参考');
        asRef.title = '切到图生图，把这张图当参考';
        asRef.onclick = async () => {
          if (!MODELS[$('model').value] || !MODELS[$('model').value].edits) {
            note('当前模型不支持图生图，换 sensenova-u1.5-lite 再试', 'bad');
            return;
          }
          try {
            const r = await fetch(url);
            const blob = await r.blob();
            refDataUrl = await new Promise((res, rej) => {
              const fr = new FileReader();
              fr.onload = () => res(String(fr.result || ''));
              fr.onerror = rej;
              fr.readAsDataURL(blob);
            });
            $('refImg').src = refDataUrl;
            $('refPreview').hidden = false;
            setMode('edit');
            note('已把这张贴图设为参考，可改 prompt 再生成', 'good');
          } catch (e) { note(e.message || '参考图加载失败', 'bad'); }
        };
        chip.appendChild(asRef);
        // 「删除」：在工作坊里也能删（与 app.js 详情弹窗的删除共用同一接口）
        const del = make('button', 'tex-chip-del', '×');
        del.title = '删除这张贴图';
        del.onclick = () => {
          if (!window.confirm(`删掉 ${kind}/${name}.png？模型若还引用它会变成紫黑缺资源。`)) return;
          fetch(`/api/textures/${encodeURIComponent(project)}/${kind}/${name}`, { method: 'DELETE' })
            .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
            .then(({ ok, j }) => {
              if (!ok) throw new Error(j.error || '删除失败');
              toast('已删除', 'good');
              loadExisting();
            })
            .catch((e) => toast(e.message || '删除失败', 'bad'));
        };
        chip.appendChild(del);
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
    if (mode === 'edit' && !refDataUrl) {
      note('图生图要先选一张参考图', 'bad');
      return;
    }

    note(save ? '正在生成并存进工程…' : '正在生成，通常几十秒…');
    $('go').disabled = true;
    if (save) $('save').disabled = true;
    try {
      const data = await api('/api/image', {
        method: 'POST',
        body: JSON.stringify({
          mode,
          prompt,
          size: $('size').value === '__custom' ? $('sizeCustom').value : $('size').value,
          model: $('model').value,
          watermark: $('watermark').checked,
          outputFormat: $('outputFormat').value,
          responseFormat: $('responseFormat').value,
          promptExtend: $('promptExtend').checked,
          imageUrl: mode === 'edit' ? refDataUrl : undefined,
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

  /* ---- 上传本地贴图 ---- */
  function scaleImage(file, px) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const w = px > 0 ? px : Math.max(img.naturalWidth || img.width, 1);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = w;
        const ctx = canvas.getContext('2d');
        // 像素图风格：不抗锯齿；主人自己传的可以保留平滑，按 imageScale 大小决定
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0, w, w);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error('图片读不出'));
      img.src = URL.createObjectURL(file);
    });
  }

  async function uploadLocal() {
    const project = $('project').value;
    if (!project) { note('先选一个工程', 'bad'); return; }
    const name = String($('name').value || '').trim();
    if (!name) { note('先填贴图标识（名字）', 'bad'); return; }
    const file = ($('uploadFile').files || [])[0];
    if (!file) { note('没选文件', 'bad'); return; }
    const px = Number($('scale').value) || 0;
    $('upload').disabled = true;
    note('上传中…');
    try {
      const dataUrl = await scaleImage(file, px);
      const res = await api('/api/textures', {
        method: 'POST',
        body: JSON.stringify({
          project,
          kind: $('kind').value,
          name,
          data: dataUrl,
        }),
      });
      toast(`已存到 ${res.path}`, 'good');
      note('上传好了，下方列表已刷新', 'good');
      $('uploadFile').value = ''; // 清掉选过的文件，不然下次选同一个不会触发 change
      await loadExisting();
    } catch (e) {
      note(e.message || '上传失败', 'bad');
      toast(e.message || '上传失败', 'bad');
    }
    $('upload').disabled = false;
  }

  /* ---- ?ref= 加载外部参考图 ---- */
  async function loadRefFromUrl(url) {
    if (!url) return;
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error('拉不到参考图');
      const blob = await r.blob();
      refDataUrl = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result || ''));
        fr.onerror = rej;
        fr.readAsDataURL(blob);
      });
      $('refImg').src = refDataUrl;
      $('refPreview').hidden = false;
      setMode('edit');
    } catch (e) {
      note(e.message || '参考图加载失败', 'bad');
    }
  }

  /* ---- 表单持久化 ----
   * 之前每次「点出去再回来」字段都恢复默认 —— 改起来烦。
   * 把要保的字段写进 localStorage，重新打开页面时还原。
   * 不存 refDataUrl（太大）、不存 lastB64（页面刷新就废）。 */
  const FORM_KEY = 'automods.textureForm';
  function snapForm() {
    try {
      return {
        project: $('project').value,
        model: $('model').value,
        mode,
        name: $('name').value,
        kind: $('kind').value,
        prompt: $('prompt').value,
        size: $('size').value,
        sizeCustom: $('sizeCustom').value,
        scale: $('scale').value,
        watermark: $('watermark').checked,
        outputFormat: $('outputFormat').value,
        responseFormat: $('responseFormat').value,
        promptExtend: $('promptExtend').checked,
        mcStyle: $('mcStyle').checked,
        advOpen: !$('adv').hidden,
      };
    } catch { return null; }
  }
  function applyFormToDom(s) {
    if (!s) return;
    // 静态字段先填上；动态下拉（model/size/project）等到各自的异步加载完再填
    if (s.name != null) $('name').value = s.name;
    if (s.kind) $('kind').value = s.kind;
    if (s.prompt != null) $('prompt').value = s.prompt;
    if (s.sizeCustom) $('sizeCustom').value = s.sizeCustom;
    if (s.scale != null) $('scale').value = s.scale;
    if (typeof s.watermark === 'boolean') $('watermark').checked = s.watermark;
    if (s.outputFormat) $('outputFormat').value = s.outputFormat;
    if (s.responseFormat) $('responseFormat').value = s.responseFormat;
    if (typeof s.promptExtend === 'boolean') $('promptExtend').checked = s.promptExtend;
    if (typeof s.mcStyle === 'boolean') $('mcStyle').checked = s.mcStyle;
  }
  function saveForm() {
    try { localStorage.setItem(FORM_KEY, JSON.stringify(snapForm() || {})); } catch { /* 满了/关了 */ }
  }
  function loadForm() {
    try { return JSON.parse(localStorage.getItem(FORM_KEY) || 'null'); } catch { return null; }
  }
  // 任何字段改动都顺手存一下
  ['name', 'kind', 'prompt', 'sizeCustom', 'scale', 'watermark',
    'outputFormat', 'responseFormat', 'promptExtend', 'mcStyle'].forEach((id) => {
    $(id).addEventListener('input', saveForm);
    $(id).addEventListener('change', saveForm);
  });

  /* ---- 绑定 ---- */

  $('go').onclick = () => generate(false);
  $('again').onclick = () => generate(false);
  $('save').onclick = () => generate(true);
  $('project').onchange = () => { saveForm(); loadExisting(); };
  $('upload').onclick = () => $('uploadFile').click();
  $('uploadFile').onchange = () => uploadLocal();

  $('download').onclick = () => {
    if (!lastB64) return;
    const a = document.createElement('a');
    a.href = `data:image/png;base64,${lastB64}`;
    a.download = `${String($('name').value || 'texture').replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;
    a.click();
  };

  $('model').onchange = () => { applyModel(); saveForm(); };
  $('size').onchange = () => {
    const custom = $('size').value === '__custom';
    $('sizeCustom').hidden = !custom;
    if (custom) $('sizeCustom').focus();
    saveForm();
  };
  $('modeGen').onclick = () => { setMode('generate'); saveForm(); };
  $('modeEdit').onclick = () => {
    const spec = MODELS[$('model').value] || {};
    if (!spec.edits) {
      note('这个模型不支持图生图，换 sensenova-u1.5-lite', 'bad');
      return;
    }
    setMode('edit');
    saveForm();
  };
  $('advToggle').onclick = () => {
    const hidden = $('adv').hidden;
    $('adv').hidden = !hidden;
    $('advToggle').textContent = hidden ? '▾ 上游参数' : '▸ 上游参数';
    saveForm();
  };
  $('refFile').onchange = (event) => {
    const file = (event.target.files || [])[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      refDataUrl = String(reader.result || '');
      $('refImg').src = refDataUrl;
      $('refPreview').hidden = false;
    };
    reader.readAsDataURL(file);
  };

  /* ---- 初始化 ---- */
  (async () => {
    const saved = loadForm();
    // 静态字段不需要等异步加载，立即还原
    applyFormToDom(saved);

    await Promise.allSettled([
      loadModels().catch((e) => note(e.message || '模型列表没拉到', 'bad')),
      loadProjects().catch((e) => note(e.message || '工程列表没拉到', 'bad')),
    ]);

    // 异步加载后再补上 model / project / size（这些下拉的 options 是动态塞进去的）
    if (saved) {
      if (saved.project && [...$('project').options].some((o) => o.value === saved.project)) $('project').value = saved.project;
      if (saved.model && MODELS[saved.model]) $('model').value = saved.model;
      applyModel();
      if (saved.size && [...$('size').options].some((o) => o.value === saved.size)) $('size').value = saved.size;
      $('sizeCustom').hidden = $('size').value !== '__custom';
      if (saved.advOpen) { $('adv').hidden = false; $('advToggle').textContent = '▾ 上游参数'; }
      if (saved.mode === 'edit') setMode('edit');
    }

    // URL 参数覆盖
    const sp = new URLSearchParams(location.search);
    if (sp.get('mode') === 'edit') setMode('edit');
    if (sp.get('adv') === '1') {
      $('adv').hidden = false;
      $('advToggle').textContent = '▾ 上游参数';
    }
    if (sp.get('ref')) loadRefFromUrl(sp.get('ref'));
  })();

  if (window.MCIcons) window.MCIcons.mount(document.body);
})();
