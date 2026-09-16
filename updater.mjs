/**
 * 从 GitHub 下载 main 分支 zip，覆盖源码（保留本地数据）。
 * 无第三方依赖：fetch + PowerShell Expand-Archive。
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const KEEP = new Set([
  'config.json',
  'chats',
  'workspace',
  'chapters',
  '.git',
  'node_modules',
  '.update-staging',
  '.update-applied',
  'server.pending.js',
  'boot.js', // 启动器尽量不被热更打断；若仓库里有更新版本会在下轮再覆盖
]);

const COPY_FILES = [
  'server.js',
  'learn.mjs',
  'updater.mjs',
  'memory.mjs',
  'package.json',
  'update.json',
  'README.md',
  'config.example.json',
  '.gitignore',
  'boot.js',
  'start.bat',
  'DESIGN.md',
];

const COPY_DIRS = ['public', 'content'];

function runPs(script) {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (c) => { out += c; });
    child.stderr.on('data', (c) => { err += c; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(err || out || `powershell exit ${code}`));
    });
  });
}

async function downloadZip(repo, dest) {
  const urls = [
    `https://codeload.github.com/${repo}/zip/refs/heads/main`,
    `https://codeload.github.com/${repo}/zip/refs/heads/master`,
  ];
  let lastErr;
  for (const url of urls) {
    try {
      const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(60000) });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 100) {
        lastErr = new Error('zip 过小');
        continue;
      }
      await fsp.writeFile(dest, buf);
      return buf.length;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('下载失败');
}

async function copyDir(src, dest) {
  await fsp.mkdir(dest, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const ent of entries) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) await copyDir(s, d);
    else await fsp.copyFile(s, d);
  }
}

/**
 * @returns {Promise<{ok:boolean, message:string, copied:string[], skipped:string[]}>}
 */
export async function applyGithubUpdate(repo, root) {
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
    return { ok: false, message: '未配置 updateRepo（owner/repo）', copied: [], skipped: [] };
  }

  const staging = path.join(root, '.update-staging');
  await fsp.rm(staging, { recursive: true, force: true });
  await fsp.mkdir(staging, { recursive: true });

  const zipPath = path.join(staging, `src-${randomUUID()}.zip`);
  const bytes = await downloadZip(repo, zipPath);

  const extractDir = path.join(staging, 'extract');
  await fsp.mkdir(extractDir, { recursive: true });
  await runPs(`Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`);

  // GitHub zip 根目录一般是 <repo>-main/
  const kids = await fsp.readdir(extractDir, { withFileTypes: true });
  const folder = kids.find((k) => k.isDirectory());
  if (!folder) throw new Error('压缩包结构异常');
  const srcRoot = path.join(extractDir, folder.name);

  const copied = [];
  const skipped = [];

  for (const name of COPY_FILES) {
    const s = path.join(srcRoot, name);
    if (!fs.existsSync(s)) {
      skipped.push(name);
      continue;
    }
    const d = path.join(root, name);
    if (name === 'server.js' || name === 'boot.js') {
      // 运行中的文件可能被锁：先写 pending，boot.js 下次启动时替换
      try {
        await fsp.copyFile(s, d);
        copied.push(name);
      } catch {
        const pending = path.join(root, `${path.basename(name, '.js')}.pending.js`);
        await fsp.copyFile(s, pending);
        copied.push(`${name} → ${path.basename(pending)}`);
      }
    } else {
      await fsp.copyFile(s, d);
      copied.push(name);
    }
  }

  // 兜底：根目录所有 .mjs 一并同步，避免新增模块漏拷
  try {
    const roots = await fsp.readdir(srcRoot, { withFileTypes: true });
    for (const ent of roots) {
      if (!ent.isFile() || !ent.name.endsWith('.mjs')) continue;
      if (COPY_FILES.includes(ent.name)) continue;
      await fsp.copyFile(path.join(srcRoot, ent.name), path.join(root, ent.name));
      copied.push(ent.name);
    }
  } catch { /* ignore */ }

  for (const dir of COPY_DIRS) {
    const s = path.join(srcRoot, dir);
    if (!fs.existsSync(s)) {
      skipped.push(dir + '/');
      continue;
    }
    await copyDir(s, path.join(root, dir));
    copied.push(dir + '/');
  }

  // 自定义章节与工程数据绝不覆盖
  for (const keep of KEEP) {
    if (!fs.existsSync(path.join(root, keep))) skipped.push(keep);
  }

  await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});

  return {
    ok: true,
    message: `已下载 ${(bytes / 1024).toFixed(0)} KB 并应用 ${copied.length} 项`,
    copied,
    skipped,
  };
}
