/* 站内的像素图标。

   之前入口和空态用的是系统 emoji（🧊 🎒 🧱 📮 …），一台机器一个样，和网站做的
   东西（Minecraft）也不是一路的。这里换成 16×16 的像素画：每个图标是 16 行字符，
   一个字符一个像素，字母查调色板。渲成 SVG 的 <rect>，放大不糊、跟着主题不变色
   （像素画自己带颜色，本来就不该跟主题走）。

   用法：
     <i class="mc-ico" data-mc-icon="chest"></i>     页面里写这个，DOMContentLoaded 后自动填
     MCIcons.html('chest')                              模板字符串里直接拼 SVG
     MCIcons.el('chest')                                拿一个 SVG 节点
     MCIcons.mount(root)                                动态插进去的节点再扫一遍

   加图标：ICONS 里加一项，rows 十六行、每行十六个字符，'.' 是透明。 */
(function () {
  var ICONS = {
    /* 箱子 —— 模型市场 */
    chest: {
      pal: { '#': '#3b2412', d: '#b8803a', c: '#cf9a4e', b: '#8e5c27', a: '#6e4419', g: '#8d8d8d', h: '#c9c9c9' },
      rows: [
        '................',
        '..############..',
        '.#dccccccccccd#.',
        '.#dccccccccccd#.',
        '.#dccccccccccd#.',
        '.##############.',
        '.#bbbbbb##bbbb#.',
        '.#bbbbb#hg#bbb#.',
        '.#bbbbb#gg#bbb#.',
        '.#bbbbbb##bbbb#.',
        '.#bbbbbbbbbbbb#.',
        '.#bbbbbbbbbbbb#.',
        '.#aaaaaaaaaaaa#.',
        '.#aaaaaaaaaaaa#.',
        '..############..',
        '................',
      ],
    },
    /* 方块 —— 建模（紫，和侧栏那颗按钮同一个色相） */
    cube: {
      pal: { '#': '#3a2352', t: '#d9bdff', L: '#9b6ad9', R: '#6d3fb0' },
      rows: [
        '................',
        '.......##.......',
        '.....##tt##.....',
        '...##tttttt##...',
        '.##tttttttttt##.',
        '.#L#tttttttt#R#.',
        '.#LL##tttt##RR#.',
        '.#LLLL####RRRR#.',
        '.#LLLLL##RRRRR#.',
        '.#LLLLL##RRRRR#.',
        '.#LLLLL##RRRRR#.',
        '.#LLLLL##RRRRR#.',
        '.##LLLL##RRRR##.',
        '...##LL##RR##...',
        '.....######.....',
        '................',
      ],
    },
    /* 草方块 —— 通用的"方块 / 模型"（模型市场空态、成品卡） */
    grass: {
      pal: { '#': '#26351b', g: '#7bc04a', G: '#5f9e38', d: '#8b5a2b', D: '#6e4420', e: '#a4713a' },
      rows: [
        '................',
        '.##############.',
        '.#gggGgggGgggg#.',
        '.#GgggGgggGggg#.',
        '.#gGggggGgggGg#.',
        '.#GGgGGGgGGgGG#.',
        '.#dGdddGdddGdd#.',
        '.#ddddeddddedd#.',
        '.#dedddddeddde#.',
        '.#ddddDddddddd#.',
        '.#dDdddddeddDd#.',
        '.#ddddedddDddd#.',
        '.#DdDdddDddddD#.',
        '.#DDDDDDDDDDDD#.',
        '.##############.',
        '................',
      ],
    },
    /* 刷子 —— 贴图工坊 */
    brush: {
      pal: { '#': '#2c2118', h: '#b27a3c', H: '#8a5a26', m: '#9aa4ad', b: '#efe9d8', g: '#5aa83f', G: '#3f8520' },
      rows: [
        '................',
        '............##..',
        '...........#hH#.',
        '..........#hhH#.',
        '.........#hhH#..',
        '........#hhH#...',
        '.......#hhH#....',
        '......#hhH#.....',
        '.....#mmm#......',
        '....#mmmm#......',
        '...#bbbbm#......',
        '..#bbbbb#.......',
        '.#gbbbb#........',
        '.#Ggg##.........',
        '..###...........',
        '................',
      ],
    },
    /* 背包 —— 我的资产 / 我的仓库 */
    bag: {
      pal: { '#': '#3a2412', b: '#b7773a', d: '#8a5626', g: '#3f8520', G: '#2d6519', s: '#d8a460' },
      rows: [
        '................',
        '......#..#......',
        '.....#g##g#.....',
        '.....#gggg#.....',
        '....#bbbbbb#....',
        '...#bbbbbbbb#...',
        '..#bbsbbbbsbb#..',
        '..#gggggggggg#..',
        '..#GGGGGGGGGG#..',
        '..#bbbbbbbbbb#..',
        '..#bbbbbbbbbb#..',
        '..#dbbbbbbbbd#..',
        '..#ddbbbbbbdd#..',
        '...#dddddddd#...',
        '....########....',
        '................',
      ],
    },
    /* 放大镜 */
    search: {
      pal: { '#': '#2b2f36', g: '#cfe2f5', G: '#9cc3e6', h: '#6b4a2b', H: '#4a321c' },
      rows: [
        '................',
        '....#####.......',
        '...#ggggg#......',
        '..#gGgggGg#.....',
        '.#ggggggggg#....',
        '.#gGgggggGg#....',
        '.#ggggggggg#....',
        '.#gGgggggGg#....',
        '.#ggggggggg#....',
        '..#gGgggGg#.....',
        '...#ggggg##.....',
        '....#####h#.....',
        '..........#h#...',
        '...........#h#..',
        '............#H#.',
        '.............#..',
      ],
    },
    /* 锁 */
    lock: {
      pal: { '#': '#2b2b2b', m: '#b9bec6', M: '#8d949e', y: '#e2b93b', Y: '#b8901f', k: '#3d3d3d' },
      rows: [
        '................',
        '.....######.....',
        '....#mmmmmm#....',
        '...#mM####Mm#...',
        '...#m#....#m#...',
        '...#m#....#m#...',
        '...#m#....#m#...',
        '.##############.',
        '.#yyyyyyyyyyyy#.',
        '.#yyyyyykyyyyy#.',
        '.#yyyyykkkyyyy#.',
        '.#yyyyyykyyyyy#.',
        '.#yyyyyykyyyyy#.',
        '.#YYYYYYYYYYYY#.',
        '.##############.',
        '................',
      ],
    },
    /* 信封 —— 投稿 / 消息 */
    mail: {
      pal: { '#': '#3b3b3b', p: '#f3efe2', P: '#d9d2bd', g: '#5aa83f' },
      rows: [
        '................',
        '................',
        '.##############.',
        '.#pppppppppppp#.',
        '.#Pppppppppppp#.',
        '.#pPppppppppPp#.',
        '.#ppPpppppppPp#.',
        '.#pppPppppPppp#.',
        '.#ppppPppPpppp#.',
        '.#pppppPPppppp#.',
        '.#pppppppppppp#.',
        '.#pppppppppppp#.',
        '.#pppppppppppp#.',
        '.##############.',
        '................',
        '................',
      ],
    },
    /* 画 —— 贴图空态 */
    picture: {
      pal: { '#': '#3a2412', f: '#b7773a', s: '#8ec8ee', S: '#5aa0d8', g: '#5aa83f', G: '#3f8520', y: '#f4d35e' },
      rows: [
        '................',
        '.##############.',
        '.#ffffffffffff#.',
        '.#f##########f#.',
        '.#f#ssssssyy#f#.',
        '.#f#ssssssyy#f#.',
        '.#f#Ssssssss#f#.',
        '.#f#SSssGsss#f#.',
        '.#f#SSSGGGss#f#.',
        '.#f#GGGGGGGG#f#.',
        '.#f#GGGGGGGG#f#.',
        '.#f##########f#.',
        '.#ffffffffffff#.',
        '.##############.',
        '................',
        '................',
      ],
    },
    /* 木箱 —— 模组 / 其他 */
    crate: {
      pal: { '#': '#3a2412', w: '#b7773a', W: '#c9925a', d: '#8a5626' },
      rows: [
        '................',
        '.##############.',
        '.#WwwwwwwwwwwW#.',
        '.#w#wwwwwwww#w#.',
        '.#ww#wwwwww#ww#.',
        '.#www#wwww#www#.',
        '.#wwww#ww#wwww#.',
        '.#wwwww##wwwww#.',
        '.#wwwww##wwwww#.',
        '.#wwww#ww#wwww#.',
        '.#www#wwww#www#.',
        '.#ww#wwwwww#ww#.',
        '.#w#wwwwwwww#w#.',
        '.#dddddddddddd#.',
        '.##############.',
        '................',
      ],
    },
    /* 感叹 —— 警告 */
    warn: {
      pal: { '#': '#3b2f10', y: '#f4c542', Y: '#cf9e1f', k: '#2b2b2b' },
      rows: [
        '................',
        '.......##.......',
        '......#yy#......',
        '......#yy#......',
        '.....#yyyy#.....',
        '.....#ykky#.....',
        '....#yykkyy#....',
        '....#yykkyy#....',
        '...#yyykkyyy#...',
        '...#yyyyyyyy#...',
        '..#yyyykkyyyy#..',
        '..#yyyykkyyyy#..',
        '.#YYYYYYYYYYYY#.',
        '.##############.',
        '................',
        '................',
      ],
    },
    /* 火焰剑 / 爪印 / 灯 / 浆果 —— 新手示例 */
    sword: {
      pal: { '#': '#2b2b2b', b: '#cfe6f7', B: '#8fb8d8', h: '#6b4a2b', g: '#c9a24a', f: '#ff8c1a', F: '#ffd23f' },
      rows: [
        '..........F.....',
        '.........FfF....',
        '.........#f#F...',
        '........#bB#F...',
        '.......#bB#.....',
        '......#bB#......',
        '.....#bB#.......',
        '....#bB#........',
        '.#.#bB#.........',
        '.#g#B#..........',
        '..#g##..........',
        '..#hg#g#........',
        '.#hh#.#.........',
        '#hh#............',
        '.##.............',
        '................',
      ],
    },
    paw: {
      pal: { '#': '#3a2412', p: '#b7773a', P: '#8a5626' },
      rows: [
        '................',
        '....##....##....',
        '...#pp#..#pp#...',
        '...#pp#..#pp#...',
        '....##....##....',
        '.##..........##.',
        '#pp#........#pp#',
        '#pp#..####..#pp#',
        '.##..#pppp#..##.',
        '....#pppppp#....',
        '....#pppppp#....',
        '....#pPppPp#....',
        '....#PPPPPP#....',
        '.....######.....',
        '................',
        '................',
      ],
    },
    lamp: {
      pal: { '#': '#3a2f14', y: '#ffe27a', Y: '#f2b632', o: '#c98a1c', w: '#f7f1de', m: '#6b6b6b' },
      rows: [
        '................',
        '.....######.....',
        '....#yyyyyy#....',
        '...#yywwwyyy#...',
        '...#ywyyyyyy#...',
        '...#ywyyyyyy#...',
        '...#yyyyyyyy#...',
        '...#Yyyyyyyy#...',
        '....#YYYYYY#....',
        '.....#oooo#.....',
        '.....#oooo#.....',
        '.....######.....',
        '.....#mmmm#.....',
        '.....#mmmm#.....',
        '......####......',
        '................',
      ],
    },
    berry: {
      pal: { '#': '#1f2a3a', b: '#5a6fd6', B: '#3d4fb0', l: '#8fb1f0', g: '#3f8520', G: '#5aa83f' },
      rows: [
        '................',
        '......#g#.......',
        '.....#GGg#......',
        '....#gg#........',
        '...#####........',
        '..#bbbbb#.......',
        '.#blbbbbb#.###..',
        '.#bbbbbbb##bbb#.',
        '.#bbbbbbb#blbb#.',
        '.#BbbbbbB#bbbb#.',
        '..#BBBBB#bbbbb#.',
        '...#####BbbbbB#.',
        '........#BBBB#..',
        '.........####...',
        '................',
        '................',
      ],
    },
    /* 文件 —— 资产栏。同一张纸，不同颜色的标签带 + 小字。 */
    'file-java': {
      pal: { '#': '#4b3b2a', p: '#f4efe1', P: '#e3dbc6', t: '#d98a2b', w: '#fff7e6' },
      rows: [
        '................',
        '..#########.....',
        '..#ppppppp##....',
        '..#ppppppp#p#...',
        '..#ppppppp####..',
        '..#pppppppppp#..',
        '..#tttttttttt#..',
        '..#tttttwwttt#..',
        '..#tttttwwttt#..',
        '..#ttwttwwttt#..',
        '..#tttwwwtttt#..',
        '..#pppppppppp#..',
        '..#pPPPPPpppp#..',
        '..#pPPPpppppp#..',
        '..############..',
        '................',
      ],
    },
    'file-json': {
      pal: { '#': '#3a4b66', p: '#f4efe1', P: '#e3dbc6', t: '#4a7fd6', w: '#eaf3ff' },
      rows: [
        '................',
        '..#########.....',
        '..#ppppppp##....',
        '..#ppppppp#p#...',
        '..#ppppppp####..',
        '..#pppppppppp#..',
        '..#tttttttttt#..',
        '..#twwttttwwt#..',
        '..#wttttttttw#..',
        '..#twwttttwwt#..',
        '..#tttttttttt#..',
        '..#pppppppppp#..',
        '..#pPPPPPpppp#..',
        '..#pPPPpppppp#..',
        '..############..',
        '................',
      ],
    },
    'file-config': {
      pal: { '#': '#3f4750', p: '#f4efe1', P: '#e3dbc6', t: '#7b8794', w: '#f3f5f7' },
      rows: [
        '................',
        '..#########.....',
        '..#ppppppp##....',
        '..#ppppppp#p#...',
        '..#ppppppp####..',
        '..#pppppppppp#..',
        '..#tttttttttt#..',
        '..#tttwwwwttt#..',
        '..#ttttttwttt#..',
        '..#tttwwwwttt#..',
        '..#tttttttttt#..',
        '..#pppppppppp#..',
        '..#pPPPPPpppp#..',
        '..#pPPPpppppp#..',
        '..############..',
        '................',
      ],
    },
    'file-sound': {
      pal: { '#': '#3d2f5a', p: '#f4efe1', P: '#e3dbc6', t: '#8a5cd6', w: '#f4edff' },
      rows: [
        '................',
        '..#########.....',
        '..#ppppppp##....',
        '..#ppppppp#p#...',
        '..#ppppppp####..',
        '..#pppppppppp#..',
        '..#tttttttttt#..',
        '..#tttttwwwtt#..',
        '..#tttttwtttt#..',
        '..#tttwwwtttt#..',
        '..#tttwwwtttt#..',
        '..#pppppppppp#..',
        '..#pPPPPPpppp#..',
        '..#pPPPpppppp#..',
        '..############..',
        '................',
      ],
    },
    'file-doc': {
      pal: { '#': '#5a5145', p: '#f4efe1', P: '#cfc6ae' },
      rows: [
        '................',
        '..#########.....',
        '..#ppppppp##....',
        '..#ppppppp#p#...',
        '..#ppppppp####..',
        '..#pppppppppp#..',
        '..#pPPPPPPPpp#..',
        '..#pppppppppp#..',
        '..#pPPPPPPPpp#..',
        '..#pppppppppp#..',
        '..#pPPPPPPPpp#..',
        '..#pppppppppp#..',
        '..#pPPPPPpppp#..',
        '..#pppppppppp#..',
        '..############..',
        '................',
      ],
    },
    'file-jar': {
      pal: { '#': '#26351b', g: '#7bc04a', G: '#5f9e38', d: '#8b5a2b', D: '#6e4420', e: '#a4713a' },
      rows: [
        '................',
        '..############..',
        '..#gggGgggGgg#..',
        '..#GgggGgggGg#..',
        '..#gGggggGggg#..',
        '..#GGgGGGgGGG#..',
        '..#dGdddGdddG#..',
        '..#ddddedddde#..',
        '..#dedddddedd#..',
        '..#ddddDddddd#..',
        '..#dDdddddedd#..',
        '..#ddddedddDd#..',
        '..#DdDdddDddd#..',
        '..#DDDDDDDDDD#..',
        '..############..',
        '................',
      ],
    },
    /* 文件夹 */
    folder: {
      pal: { '#': '#7a5a1e', y: '#f2c85b', Y: '#d9a83a' },
      rows: [
        '................',
        '................',
        '.#######........',
        '.#yyyyy########.',
        '.#yyyyyyyyyyyy#.',
        '.##############.',
        '.#YYYYYYYYYYYY#.',
        '.#YYYYYYYYYYYY#.',
        '.#YYYYYYYYYYYY#.',
        '.#YYYYYYYYYYYY#.',
        '.#YYYYYYYYYYYY#.',
        '.#YYYYYYYYYYYY#.',
        '.##############.',
        '................',
        '................',
        '................',
      ],
    },
    /* 上传箭头（本机上传那一行） */
    upload: {
      pal: { '#': '#26351b', g: '#5aa83f', G: '#3f8520', w: '#ffffff' },
      rows: [
        '................',
        '.......##.......',
        '......#gg#......',
        '.....#gggg#.....',
        '....#gggggg#....',
        '...#gggggggg#...',
        '..#ggg#gg#ggg#..',
        '..####.gg.####..',
        '......#gg#......',
        '......#gg#......',
        '......#gg#......',
        '......####......',
        '.##############.',
        '.#GGGGGGGGGGGG#.',
        '.##############.',
        '................',
      ],
    },
  };

  var cache = {};

  function build(name) {
    var icon = ICONS[name];
    if (!icon) return '';
    if (cache[name]) return cache[name];
    var out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true" focusable="false">';
    // 同一行里连续同色的像素合成一个 rect，节点数少一半以上。
    for (var y = 0; y < icon.rows.length; y += 1) {
      var row = icon.rows[y];
      var x = 0;
      while (x < row.length) {
        var ch = row[x];
        var color = icon.pal[ch];
        if (!color) { x += 1; continue; }
        var run = 1;
        while (x + run < row.length && row[x + run] === ch) run += 1;
        out += '<rect x="' + x + '" y="' + y + '" width="' + run + '" height="1" fill="' + color + '"/>';
        x += run;
      }
    }
    out += '</svg>';
    cache[name] = out;
    return out;
  }

  function el(name) {
    var wrap = document.createElement('i');
    wrap.className = 'mc-ico';
    wrap.innerHTML = build(name);
    return wrap.firstChild;
  }

  function mount(root) {
    var nodes = (root || document).querySelectorAll('[data-mc-icon]:not([data-mc-ready])');
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      var markup = build(node.getAttribute('data-mc-icon'));
      if (!markup) continue;
      node.innerHTML = markup;
      node.classList.add('mc-ico');
      node.setAttribute('data-mc-ready', '1');
    }
  }

  window.MCIcons = {
    names: Object.keys(ICONS),
    has: function (name) { return Boolean(ICONS[name]); },
    svg: build,
    html: function (name, cls) {
      return '<i class="mc-ico' + (cls ? ' ' + cls : '') + '" data-mc-ready="1">' + build(name) + '</i>';
    },
    el: el,
    mount: mount,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { mount(); });
  else mount();
})();
