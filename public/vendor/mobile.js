/* ===========================================================================
   手机版的开合行为（只给 /hx/ 工作台用）

   一条原则：不新增功能，也不改原有功能。页面上所有按钮还是原来那几个对象——
   这里只是把它们搬到手机上够得着的位置，再补上抽屉、底部弹层这类手机特有的开合
   动作。搬家用的是 appendChild（同一个节点换个爹），所以 hx.js 绑在上面的事件、
   拿到的引用、后续对它们的 hidden/textContent 改动，全都照旧生效。

   拖回大屏（或转成横屏变宽）时会原样搬回去，位置精确到原来的前后邻居。
   =========================================================================== */
(function () {
  'use strict';

  /* 跟 mobile.css 开头那条 @media 必须一模一样：一个管长相，一个管开合，
     两边判断不一致就会出现「样式已经是手机版了，但汉堡键还没建出来」。 */
  var PHONE = window.matchMedia(
    '(max-width: 820px), (max-height: 520px) and (pointer: coarse)');
  var body = document.body;

  /* 记住每个被搬走的节点原来待在哪儿：[原父节点, 原来的后一个兄弟]。 */
  var homes = new Map();
  var chrome = null;          // 手机上才建的那几件东西
  var layers = [];            // 当前叠着的层：'drawer' / 'sheet'
  var pushed = 0;             // 我们往浏览器历史里压了几层
  var live = false;

  function pick(id) { return document.getElementById(id); }

  function make(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  function move(node, into) {
    if (!node || !into) return;
    if (!homes.has(node)) homes.set(node, [node.parentNode, node.nextSibling]);
    into.appendChild(node);
  }

  function moveBack() {
    homes.forEach(function (home, node) {
      var parent = home[0];
      var next = home[1];
      if (!parent) return;
      parent.insertBefore(node, next && next.parentNode === parent ? next : null);
    });
    homes.clear();
  }

  /* ------------------------------------------------------------ 层的开合

     抽屉和底部弹层都算"盖在页面上的一层"。开一层就往浏览器历史里压一格，这样
     安卓的返回键、iOS 的边缘右滑，退的是这一层而不是直接离开页面——手机上不这么
     做，用户想关掉抽屉一按返回就被弹回上一个网页了。 */

  function paint() {
    var drawer = layers.indexOf('drawer') >= 0;
    var sheet = layers.indexOf('sheet') >= 0;
    body.classList.toggle('m-drawer', drawer);
    body.classList.toggle('m-sheet', sheet);
    body.classList.toggle('m-lock', drawer || sheet);
    if (chrome && chrome.menu) chrome.menu.setAttribute('aria-expanded', drawer ? 'true' : 'false');
  }

  function open(kind) {
    if (!live || layers.indexOf(kind) >= 0) return;
    layers.push(kind);
    try {
      history.pushState({ mLayer: kind }, '');
      pushed += 1;
    } catch (error) { /* 历史写不进去就算了，点蒙版一样能关 */ }
    paint();
  }

  function close(kind, fromBack) {
    var at = layers.indexOf(kind);
    if (at < 0) return;
    layers.splice(at, 1);
    paint();
    if (!fromBack && pushed > 0) {
      pushed -= 1;
      try { history.back(); } catch (error) { /* 同上 */ }
    }
  }

  function closeTop(fromBack) {
    if (!layers.length) return false;
    close(layers[layers.length - 1], fromBack);
    return true;
  }

  window.addEventListener('popstate', function () {
    if (!layers.length) return;
    pushed = Math.max(0, pushed - 1);
    closeTop(true);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeTop();
  });

  /* ------------------------------------------------------- 建手机上那几件 */

  function build() {
    if (chrome) return chrome;

    var scrim = make('div', 'm-scrim');
    scrim.addEventListener('click', function () { closeTop(); });
    body.appendChild(scrim);

    var menu = make('button', 'm-menu', '☰');
    menu.type = 'button';
    menu.setAttribute('aria-label', '打开项目列表');
    menu.addEventListener('click', function () { open('drawer'); });

    var title = make('div', 'm-title');
    var sub = make('div', 'm-title-sub');
    title.appendChild(sub);

    var foot = make('div', 'm-drawer-foot');

    var fab = make('button', 'm-assets');
    fab.type = 'button';
    fab.setAttribute('aria-label', '查看本项目产物');
    var fabIcon = make('i', null, '◧');
    var fabWord = make('span', null, '资产');
    var fabNum = make('b', null, '0');
    fab.appendChild(fabIcon);
    fab.appendChild(fabWord);
    fab.appendChild(fabNum);
    fab.addEventListener('click', function () { open('sheet'); });

    var grab = make('div', 'm-sheet-grab');
    grab.setAttribute('aria-hidden', 'true');

    var shut = make('button', 'm-sheet-close', '✕');
    shut.type = 'button';
    shut.setAttribute('aria-label', '收起产物');
    shut.addEventListener('click', function () { close('sheet'); });

    chrome = { scrim: scrim, menu: menu, title: title, sub: sub, foot: foot,
               fab: fab, num: fabNum, grab: grab, shut: shut };
    return chrome;
  }

  /* --------------------------------------------------------- 弹层往下拖走

     捏着顶上那根横条往下拉能关掉，跟各家 App 的底部弹层一个手感。拖过一段距离
     才算数，免得手指只是抖了一下就给关了。 */

  function dragging(panel, grab) {
    var from = 0;
    var at = 0;
    var on = false;

    grab.addEventListener('touchstart', function (event) {
      if (!event.touches || event.touches.length !== 1) return;
      on = true;
      from = event.touches[0].clientY;
      at = 0;
      panel.style.transition = 'none';
    }, { passive: true });

    grab.addEventListener('touchmove', function (event) {
      if (!on) return;
      at = Math.max(0, event.touches[0].clientY - from);
      panel.style.transform = 'translateY(' + at + 'px)';
    }, { passive: true });

    grab.addEventListener('touchend', function () {
      if (!on) return;
      on = false;
      panel.style.transition = '';
      panel.style.transform = '';
      if (at > 90) close('sheet');
    });
  }

  /* ------------------------------------------------------------ 产物计数

     胶囊上那个数字跟着资产栏的"N 个文件"走。文案是 hx.js 写的，这里只读不改。 */

  function watchCount(kit) {
    var label = pick('assetCount');
    if (!label) return;
    var sync = function () {
      var hit = /\d+/.exec(label.textContent || '');
      kit.num.textContent = hit ? hit[0] : '0';
    };
    sync();
    new MutationObserver(sync).observe(label,
      { childList: true, characterData: true, subtree: true });
  }

  /* 还没说第一句话的那一屏没有产物可看，胶囊藏起来，别挡着输入框。 */
  function watchBlank(kit) {
    var column = pick('chatColumn');
    if (!column) return;
    var sync = function () { kit.fab.hidden = column.classList.contains('blank'); };
    sync();
    new MutationObserver(sync).observe(column, { attributes: true, attributeFilter: ['class'] });
  }

  /* --------------------------------------------------------------- 进出 */

  function enter() {
    if (live) return;
    var bar = document.querySelector('.topbar');
    var side = pick('sidebar');
    var panel = pick('assetsPanel');
    var content = document.querySelector('.project-content');
    if (!bar || !side || !panel || !content) return;

    var kit = build();
    live = true;

    // 顶栏：汉堡 · 标题（两行）· 停止 · 积分 · 头像
    bar.insertBefore(kit.menu, bar.firstChild);
    bar.insertBefore(kit.title, kit.menu.nextSibling);
    move(pick('pageTitle'), kit.title);
    kit.title.appendChild(kit.sub);
    move(pick('runState'), kit.sub);

    // 顶栏塞不下的杂项收进抽屉底部。对话编号也放这儿：它是报障时才用的东西，
    // 摆在标题下面又点不中（那行字才十来个像素高）。
    side.appendChild(kit.foot);
    move(pick('legacyLink'), kit.foot);
    move(pick('workbenchLink'), kit.foot);
    move(pick('themeToggle'), kit.foot);
    move(pick('projectId'), kit.foot);

    // 产物：输入框上方一颗胶囊 + 从底下拉上来的弹层
    var dock = document.querySelector('.chat-column > .dock') || content;
    dock.appendChild(kit.fab);
    panel.insertBefore(kit.grab, panel.firstChild);
    var head = panel.querySelector('header');
    if (head) head.appendChild(kit.shut);
    dragging(panel, kit.grab);

    watchCount(kit);
    watchBlank(kit);

    // 选中一个项目、或者新建，抽屉就该退回去——手机上它盖着整个对话区。
    // 行内那几个小按钮（置顶/归档/删除）自己 stopPropagation 了，不会走到这儿。
    var list = pick('projectList');
    if (list) list.addEventListener('click', function () { close('drawer'); });
    var fresh = pick('newProject');
    if (fresh) fresh.addEventListener('click', function () { close('drawer'); });

    paint();
  }

  function leave() {
    if (!live) return;
    live = false;
    while (layers.length) closeTop(true);
    pushed = 0;
    moveBack();
    if (chrome) {
      [chrome.menu, chrome.title, chrome.foot, chrome.fab,
       chrome.grab, chrome.shut].forEach(function (node) {
        if (node && node.parentNode) node.parentNode.removeChild(node);
      });
    }
    paint();
  }

  function sync() { if (PHONE.matches) enter(); else leave(); }

  /* ------------------------------------------------------------ 软键盘

     安卓 Chrome 认 viewport 里的 interactive-widget，键盘一弹页面自己就缩了。
     iOS 不缩：window.innerHeight 还是整屏那么高，键盘直接盖在输入框上——正在打的
     字自己看不见。所以量一下"看得见的那块"矮了多少，把这个数交给样式表去扣。 */

  function keyboard() {
    var vv = window.visualViewport;
    if (!vv) return;
    var fit = function () {
      if (!live) {
        document.documentElement.style.removeProperty('--m-keys');
        return;
      }
      var gap = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      // 几像素的零头是浏览器工具栏在收放，不是键盘，跟着动会一直抖
      document.documentElement.style.setProperty('--m-keys', (gap > 60 ? gap : 0) + 'px');
    };
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
  }

  /* hx.js 登录后才把 .shell 显出来并铺好顶栏，等它铺完再搬。 */
  function start() {
    sync();
    keyboard();
    if (PHONE.addEventListener) PHONE.addEventListener('change', sync);
    else PHONE.addListener(sync);

    var app = pick('appView');
    if (app) {
      new MutationObserver(sync).observe(app, { attributes: true, attributeFilter: ['hidden'] });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
