/**
 * 稳定启动入口：优先应用挂起的 server 更新，再加载主服务。
 * 用户以后用 node boot.js（或 npm start）启动。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const pending = path.join(ROOT, 'server.pending.js');
const target = path.join(ROOT, 'server.js');
const stamp = path.join(ROOT, '.update-applied');

try {
  if (fs.existsSync(pending)) {
    fs.copyFileSync(pending, target);
    fs.unlinkSync(pending);
    fs.writeFileSync(stamp, String(Date.now()));
    console.log('[boot] 已应用挂起的 server.js 更新');
  }
} catch (e) {
  console.warn('[boot] 应用 server.pending.js 失败：', e.message || e);
}

await import(pathToFileURL(target).href);
