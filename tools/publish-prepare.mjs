// 发布前：把本机私有数据挪出项目目录，并写出脱敏 + 分享模式的 config.json
//
// 背景（2026-09-17）：发布工具只排除 node_modules / .git / 构建产物，
// **不读 .gitignore**。所以 config.json 里的 apiKey、chats/ 里的对话记录、
// memory*.json 里的记忆、usage.json 里的用量，都会被整包传上公开链接。
// 实测线上 curl <link>/api/chats 能列出全部对话、/api/memory 能读到记忆条目。
//
// 用法：
//   node tools/publish-prepare.mjs      # 发布前跑这个
//   ...发布...
//   node tools/publish-restore.mjs      # 发布完立刻跑这个，把数据搬回来
//
// 挪走的东西放在项目目录**外**的 .automods-publish-stash/<时间戳>/ ——
// 留在项目里会被一起传上去，等于白挪。
//
// 除了挪文件，还会把 config.json 写成 shareMode: true，让线上服务端
// 直接把 /api/chats、/api/memory、/api/usage、/api/context 挡掉（403）。
// 双保险：万一哪天忘了挪文件，接口层也不会把本机数据吐出去。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STASH_BASE = path.join(path.dirname(ROOT), '.automods-publish-stash');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const STASH = path.join(STASH_BASE, stamp);

const PRIVATE = ['chats', 'memory.json', 'memory-store.json', 'usage.json'];
const moved = [];
const problems = [];

function scanKeys() {
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['node_modules', '.git', 'build', path.basename(STASH_BASE)].includes(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (full === STASH || full.startsWith(STASH + path.sep)) continue;
      let txt = '';
      try { txt = fs.readFileSync(full, 'latin1'); } catch { continue; }
      if (/sk-[A-Za-z0-9]{16,}/.test(txt)) hits.push(path.relative(ROOT, full));
    }
  };
  walk(ROOT);
  return hits;
}

console.log(`项目根 : ${ROOT}`);
console.log(`暂存到 : ${STASH}\n`);

fs.mkdirSync(STASH, { recursive: true });

// 1. 挪走私有数据（含 config.json 的自动备份 config.json.bak-*，里面同样有 key）
const toMove = [...PRIVATE];
for (const name of fs.readdirSync(ROOT)) {
  if (/^config\.json\.bak-/.test(name)) toMove.push(name);
}
for (const name of toMove) {
  const src = path.join(ROOT, name);
  if (!fs.existsSync(src)) continue;
  try {
    fs.renameSync(src, path.join(STASH, name));
    moved.push(name);
    console.log(`  挪走 ${name}`);
  } catch (e) {
    problems.push(`${name} 挪不动（${e.code}）—— 服务还在跑？先关掉它再试`);
  }
}

// 2. config.json：备份原件，写一份脱敏 + shareMode 的
const cfgPath = path.join(ROOT, 'config.json');
if (fs.existsSync(cfgPath)) {
  const raw = fs.readFileSync(cfgPath, 'utf8');
  fs.writeFileSync(path.join(STASH, 'config.json'), raw);
  const cfg = JSON.parse(raw.replace(/^\ufeff/, ''));
  const before = { apiKey: cfg.apiKey, imageApiKey: cfg.imageApiKey };
  cfg.apiKey = '';
  cfg.imageApiKey = '';
  cfg.shareMode = true;
  fs.writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`);
  console.log('  写出脱敏 config.json（apiKey / imageApiKey 置空 + shareMode: true）');
  console.log(`    原 key 前缀: ${before.apiKey ? before.apiKey.slice(0, 6) + '…' : '(本来就空)'}`);
  if (before.imageApiKey) console.log(`    原 imageApiKey 前缀: ${before.imageApiKey.slice(0, 6)}…`);
}

// 3. 记录清单，restore 靠它还原
fs.writeFileSync(path.join(STASH, 'manifest.json'),
  `${JSON.stringify({ root: ROOT, stamp, moved }, null, 2)}\n`);

// 4. 自检
const leftovers = toMove.filter((n) => fs.existsSync(path.join(ROOT, n)));
const keyHits = scanKeys();

console.log('\n---- 自检 ----');
console.log('私有文件是否已全部挪走 :', leftovers.length === 0 ? '是' : `否 —— 还剩 ${leftovers.join('、')}`);
console.log('全目录 sk- 密钥扫描     :', keyHits.length === 0 ? '干净' : `命中 ${keyHits.join('、')}`);
const cfgNow = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
console.log('config.shareMode       :', cfgNow.shareMode === true ? 'true（线上会挡掉私有接口）' : 'false（不对！）');
console.log('config.apiKeySet       :', cfgNow.apiKey ? '仍有 key（不对！）' : 'false');

if (problems.length) {
  console.log('\n[问题]');
  problems.forEach((p) => console.log('  -', p));
}
const ok = leftovers.length === 0 && keyHits.length === 0 && !cfgNow.apiKey && cfgNow.shareMode === true && problems.length === 0;
console.log(ok ? '\n✅ 可以发布了。发完记得 node tools/publish-restore.mjs' : '\n❌ 还有问题，先别发布。');
process.exit(ok ? 0 : 1);
