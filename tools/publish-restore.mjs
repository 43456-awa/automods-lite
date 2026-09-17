// 发布后：把 publish-prepare.mjs 挪走的私有数据搬回来
//
// 用法：
//   node tools/publish-restore.mjs              # 还原最近一次暂存
//   node tools/publish-restore.mjs <暂存目录>    # 指定某一次
//
// 会断言：config.json 的 key 前缀回来了、私有文件都在原位。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STASH_BASE = path.join(path.dirname(ROOT), '.automods-publish-stash');

let stash = process.argv[2];
if (!stash) {
  if (!fs.existsSync(STASH_BASE)) {
    console.log(`找不到暂存目录 ${STASH_BASE} —— 没跑过 publish-prepare？`);
    process.exit(1);
  }
  const stamps = fs.readdirSync(STASH_BASE).filter((n) => fs.statSync(path.join(STASH_BASE, n)).isDirectory()).sort();
  if (!stamps.length) {
    console.log(`${STASH_BASE} 里没有暂存记录`);
    process.exit(1);
  }
  stash = path.join(STASH_BASE, stamps[stamps.length - 1]);
}

const manifestPath = path.join(stash, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.log(`${stash} 里没有 manifest.json，认不出该还原什么`);
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

console.log(`暂存目录: ${stash}`);
console.log(`项目根  : ${manifest.root}`);
console.log(`该还原  : ${manifest.moved.join('、') || '(空)'}\n`);

let bad = 0;

// 1. 私有数据搬回来
//    注意：暂存期间服务可能被起过，于是 chats/ 这类目录又被重新生成了。
//    这种情况**逐项合并**进去，而不是把整份真实数据顶成 chats.restored-xxx
//    —— 否则主人的历史记录会在界面上「消失」。
const ts = Date.now();
for (const name of manifest.moved) {
  const src = path.join(stash, name);
  const dst = path.join(ROOT, name);
  if (!fs.existsSync(src)) { console.log(`  [跳过] ${name} 在暂存里不存在`); continue; }

  const srcIsDir = fs.statSync(src).isDirectory();
  if (!fs.existsSync(dst)) {
    fs.renameSync(src, dst);
    console.log(`  还原 ${name}`);
    continue;
  }
  if (srcIsDir && fs.statSync(dst).isDirectory()) {
    let moved = 0;
    let kept = 0;
    for (const child of fs.readdirSync(src)) {
      const target = path.join(dst, child);
      if (fs.existsSync(target)) {
        fs.renameSync(path.join(src, child), `${target}.restored-${ts}`);
        kept += 1;
      } else {
        fs.renameSync(path.join(src, child), target);
        moved += 1;
      }
    }
    console.log(`  合并 ${name}/（新增 ${moved} 项${kept ? `，${kept} 项同名已存为 *.restored-${ts}` : ''}）`);
    continue;
  }
  /* 文件：让「主人的原件」占主路径，把暂存期新生成的那个挪去旁路。
   * 这些文件（memory.json / usage.json）在分享模式下产生的都是访客数据，
   * 对主人没意义；反过来的话主人的数据会藏在 *.restored-* 里，看着像丢了。 */
  fs.renameSync(dst, `${dst}.shared-${ts}`);
  fs.renameSync(src, dst);
  console.log(`  还原 ${name}（暂存期那份已存为 ${name}.shared-${ts}，确认后可删）`);
}

// 2. config.json 还原原件
const cfgBackup = path.join(stash, 'config.json');
const cfgPath = path.join(ROOT, 'config.json');
if (fs.existsSync(cfgBackup)) {
  const original = fs.readFileSync(cfgBackup, 'utf8');
  fs.copyFileSync(cfgBackup, cfgPath);
  const cfg = JSON.parse(original.replace(/^\ufeff/, ''));
  const key = cfg.apiKey || '';
  console.log(`  还原 config.json（apiKey 前缀: ${key ? key.slice(0, 6) + '…' : '(原本就是空的)'}）`);
  if (cfg.shareMode === true) {
    console.log('  [注意] 原件里 shareMode 就是 true —— 本机自用的话记得改成 false');
  }
} else {
  console.log('  [跳过] 暂存里没有 config.json');
  bad += 1;
}

// 3. 断言
console.log('\n---- 自检 ----');
const cfgNow = JSON.parse(fs.readFileSync(cfgPath, 'utf8').replace(/^\ufeff/, ''));
console.log('apiKey 回来了      :', cfgNow.apiKey ? '是' : '否（原本就是空的也算正常）');
console.log('shareMode 已复位   :', cfgNow.shareMode === true ? '否 —— 仍是 true，本机跑会被挡掉私有接口' : '是（false）');
for (const name of manifest.moved) {
  const ok = fs.existsSync(path.join(ROOT, name));
  console.log(`${name.padEnd(18)}:`, ok ? '在原位' : '不在原位（看上面的提示）');
  if (!ok) bad += 1;
}

console.log(`\n暂存目录保留着（含 config.json 原件），确认没问题后可以手动删：\n  ${stash}`);
process.exit(bad ? 1 : 0);
