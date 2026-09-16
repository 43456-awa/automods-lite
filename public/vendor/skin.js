/* 站点样式（皮肤）开关。每一页 <head> 里最先执行，样式表之前——首屏就是对的样子，
 * 不会先闪一下经典样式再换。
 *
 *   html[data-skin]  三个值：classic（经典，也就是 2026-09 之前的样子）、
 *                    studio（工坊，重构后的默认）、pixel（像素）。
 *   html[data-theme] light / dark，原来就有，这里顺手一起管。
 *
 * 存两处：localStorage 是首屏用的（同步读，零延迟）；账号上 ui_skin / ui_theme 是
 * 跨设备用的（PATCH /api/auth/profile）。每个会话只对一次账号：有令牌、还没对过，
 * 就问一次 /api/auth/me，服务端有值且和本地不同，以服务端为准。
 *
 * 样式本身在 skins.css，全部写在 html[data-skin="…"] 底下；classic 一条规则都没有，
 * 所以选它等于什么都没发生。 */
(function () {
  var SKINS = ['classic', 'studio', 'pixel'];
  var DEFAULT_SKIN = 'studio';
  var SKIN_KEY = 'blockforge.skin';
  var THEME_KEY = 'blockforge.theme';
  var SYNC_KEY = 'blockforge.skinSynced';
  var root = document.documentElement;

  function read(key) {
    try { return localStorage.getItem(key) || ''; } catch (e) { return ''; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* 隐私模式 */ }
  }
  function token() {
    try {
      return localStorage.getItem('blockforge.authToken')
        || sessionStorage.getItem('blockforge.sessionToken') || '';
    } catch (e) { return ''; }
  }
  function apiBase() {
    return location.pathname.indexOf('/lab/') === 0 ? '/lab/api' : '/api';
  }

  function applySkin(name) {
    if (SKINS.indexOf(name) < 0) name = DEFAULT_SKIN;
    root.dataset.skin = name;
    return name;
  }
  function applyTheme(name) {
    if (name !== 'dark' && name !== 'light') return root.dataset.theme || 'light';
    root.dataset.theme = name;
    return name;
  }

  // 首屏：本地有什么用什么，没有就是默认皮肤。主题不在这里改默认——页面各自
  // 原来就有一段读 blockforge.theme 的脚本，这里只是提前把它做掉。
  applySkin(read(SKIN_KEY) || DEFAULT_SKIN);
  var savedTheme = read(THEME_KEY);
  if (savedTheme) applyTheme(savedTheme);

  function save(fields) {
    var bearer = token();
    if (!bearer) return Promise.resolve(false);
    return fetch(apiBase() + '/auth/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + bearer },
      body: JSON.stringify(fields),
    }).then(function (r) { return r.ok; }).catch(function () { return false; });
  }

  function sync() {
    var bearer = token();
    if (!bearer) return;
    try { if (sessionStorage.getItem(SYNC_KEY)) return; } catch (e) { /* 忽略 */ }
    fetch(apiBase() + '/auth/me', { headers: { Authorization: 'Bearer ' + bearer }, cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (me) {
        if (!me) return;
        try { sessionStorage.setItem(SYNC_KEY, '1'); } catch (e) { /* 忽略 */ }
        var pending = {};
        if (me.ui_skin && SKINS.indexOf(me.ui_skin) >= 0) {
          if (me.ui_skin !== root.dataset.skin) { applySkin(me.ui_skin); write(SKIN_KEY, me.ui_skin); }
        } else if (me.ui_skin === '') {
          // 账号上还没存过：把这台机器现在用的记上去，换设备就能跟着走。
          pending.ui_skin = root.dataset.skin;
        }
        if (me.ui_theme === 'dark' || me.ui_theme === 'light') {
          if (me.ui_theme !== root.dataset.theme) { applyTheme(me.ui_theme); write(THEME_KEY, me.ui_theme); }
        } else if (me.ui_theme === '' && savedTheme) {
          pending.ui_theme = savedTheme;
        }
        if (Object.keys(pending).length) save(pending);
        window.dispatchEvent(new CustomEvent('blockforge:skin', { detail: { skin: root.dataset.skin, theme: root.dataset.theme } }));
      })
      .catch(function () { /* 拿不到就用本地的 */ });
  }

  window.BlockForgeSkin = {
    skins: SKINS.slice(),
    labels: { classic: '经典', studio: '工坊', pixel: '像素' },
    get: function () { return root.dataset.skin || DEFAULT_SKIN; },
    theme: function () { return root.dataset.theme || 'light'; },
    set: function (name) {
      var applied = applySkin(name);
      write(SKIN_KEY, applied);
      window.dispatchEvent(new CustomEvent('blockforge:skin', { detail: { skin: applied, theme: root.dataset.theme } }));
      return save({ ui_skin: applied });
    },
    setTheme: function (name) {
      var applied = applyTheme(name);
      write(THEME_KEY, applied);
      window.dispatchEvent(new CustomEvent('blockforge:skin', { detail: { skin: root.dataset.skin, theme: applied } }));
      return save({ ui_theme: applied });
    },
    sync: sync,
  };

  // 页面里原来那颗 ◐ 只改 localStorage，不知道账号这回事。监听它改过之后的结果，
  // 顺手存到账号上；用 MutationObserver 而不是改每一页的点击处理。
  var last = root.dataset.theme;
  if (window.MutationObserver) {
    new MutationObserver(function () {
      var now = root.dataset.theme;
      if (now && now !== last) { last = now; write(THEME_KEY, now); save({ ui_theme: now }); }
    }).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
  else sync();
})();
