/**
 * automods-lite v0.2 — 本地对话式 NeoForge 工作台
 * - OpenAI 兼容流式对话 + 工具写文件
 * - 每个对话独立工程目录 workspace/projects/<id>/
 * - 可选本机 Gradle 构建
 * - 历史清理
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { getTracks, getChapter, askAboutChapter, generateChapter, deleteCustom } from './learn.mjs';
import { applyGithubUpdate } from './updater.mjs';
import {
  listFacts, addFact, addFacts, deleteFact, clearFacts,
  searchFacts, memoryPromptBlock, parseFactsJson,
} from './memory.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const WORKSPACE = path.join(ROOT, 'workspace');
const PROJECTS = path.join(WORKSPACE, 'projects');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const CHATS_DIR = path.join(ROOT, 'chats');
const PORT = Number(process.env.PORT) || 8787;

fs.mkdirSync(WORKSPACE, { recursive: true });
fs.mkdirSync(PROJECTS, { recursive: true });
fs.mkdirSync(CHATS_DIR, { recursive: true });

const DEFAULT_CONFIG = {
  baseUrl: 'https://api.deepseek.com/v1',
  apiKey: '',
  model: 'deepseek-chat',
  workspaceName: 'MyNeoForgeMod',
  modId: 'mymod',
  mcVersion: '1.21.1',
  // neoforge | forge
  loader: 'neoforge',
  gradleCmd: '',
  gradleTimeoutSec: 180,
  updateRepo: '43456-awa/automods-lite',
  temperature: 0.4,
  topP: 1,
  maxTokens: 32768,
  reasoningEffort: 'off',
  reasoningStyle: 'auto',
  // 上下文长度：256k 或 1m（token 预算）。打包历史时按这个截断，
  // 比「多少条消息」直观——一条工具回执可能顶几十条对话。
  contextLength: '256k',
  // 条数兜底：再怎么着也不超过这么多条消息
  historyLimit: 36,
  apiTimeoutSec: 180,
  // 上游 429/5xx 最多重试几次
  apiRetries: 6,
  // 对话结束后自动总结制作者偏好到 memory.json
  autoMemory: true,

  /* ---- 图片生成（贴图工坊）----
   * 留空就沿用上面的 baseUrl / apiKey，省得同一个账号填两遍。
   * 商汤 SenseNova U1.5 Lite / U1-fast 走 OpenAI 标准的 /images/generations。
   * 参数照 https://platform.sensenova.cn/docs 给的那些：
   *   model / prompt / size / n / watermark / output_format / response_format / prompt_extend
   * 另有一个独立的图生图接口 /v1/images/edits（仅 U1.5 Lite，必须传参考图）。 */
  imageBaseUrl: '',
  imageApiKey: '',
  imageModel: 'sensenova-u1.5-lite',
  imageSize: '2048x2048',
  // watermark: 官方 true=带 Logo 水印；false=无水印，公测免费（以后可能转付费）
  imageWatermark: false,
  // png / jpeg / webp，仅 U1.5 Lite 支持
  imageOutputFormat: 'png',
  // b64_json / url，仅 U1.5 Lite 支持；url 有效期 24 小时（U1 Fast 只有 1 小时）
  imageResponseFormat: 'b64_json',
  // 提示词自动润色优化
  imagePromptExtend: true,
  // 存进工程前缩到多少像素（0 = 不缩放，直接存原图）
  imageScale: 64,
  port: PORT,
};

const LOCAL_VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
})();

function loadConfig() {
  const readOnce = () => {
    // Windows/PowerShell 有时会写出 UTF-8 BOM，JSON.parse 会直接失败
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8').replace(/^﻿/, '');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  };
  try {
    return readOnce();
  } catch {
    // 并发写入可能读到半截文件，稍候重试一次
    try {
      const wait = Date.now() + 80;
      while (Date.now() < wait) { /* spin briefly */ }
      return readOnce();
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }
}

function saveConfig(cfg) {
  const next = { ...loadConfig(), ...cfg };
  delete next.port;
  const tmp = `${CONFIG_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tmp, CONFIG_PATH);
  return next;
}

function maskConfig(cfg) {
  const { apiKey, ...rest } = cfg;
  return {
    ...rest,
    localVersion: LOCAL_VERSION,
    apiKeySet: Boolean(apiKey && !apiKey.startsWith('sk-在这里')),
    apiKeyHint: apiKey ? `${apiKey.slice(0, 6)}…${apiKey.slice(-4)}` : '',
  };
}

/** 1.2.10 > 1.2.9；返回 -1 本地旧，0 相同，1 本地新 */
function compareSemver(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/* ---------------- projects / path ---------------- */
function projectDir(project) {
  const id = String(project || 'default').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!id || id.includes('..')) return null;
  return path.join(PROJECTS, id);
}

function ensureProject(project) {
  const dir = projectDir(project);
  if (!dir) return null;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function safeJoin(base, rel) {
  const cleaned = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!cleaned || cleaned.includes('..')) return null;
  const abs = path.resolve(base, cleaned);
  const root = path.resolve(base);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

async function listFilesIn(dirRel, acc = [], prefix = '') {
  const abs = dirRel ? safeJoin(dirRel, '') : dirRel;
  // dirRel here is already absolute project root when prefix empty — use dedicated walker
  return acc;
}

async function walkDir(rootAbs, rel = '', acc = []) {
  let entries;
  try {
    entries = await fsp.readdir(path.join(rootAbs, rel), { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const ent of entries) {
    const next = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      await walkDir(rootAbs, next, acc);
    } else {
      try {
        const st = await fsp.stat(path.join(rootAbs, next));
        acc.push({ path: next, size: st.size, mtime: st.mtimeMs });
      } catch {
        /* ignore */
      }
    }
  }
  return acc;
}

async function listProjectFiles(project) {
  const dir = ensureProject(project);
  if (!dir) return [];
  const files = await walkDir(dir);
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

/** 把工程内某目录（或整个工程）打成 zip，返回临时文件路径 */
async function zipProjectPath(project, relPath = '') {
  const root = ensureProject(project);
  if (!root) throw new Error('bad project');
  const src = relPath ? safeJoin(root, relPath) : root;
  if (!src) throw new Error('bad path');
  let st;
  try { st = await fsp.stat(src); } catch { throw new Error('路径不存在'); }
  const os = await import('node:os');
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'automods-zip-'));
  const base = relPath ? path.basename(src) : `${project}`;
  const zipPath = path.join(tmpDir, `${base || 'project'}.zip`);
  // Compress-Archive 对目录会把目录本身打进去；空 rel 时对整个工程目录打包
  const psPath = (p) => String(p).replace(/'/g, "''");
  const script = st.isDirectory()
    ? `Compress-Archive -LiteralPath '${psPath(src)}' -DestinationPath '${psPath(zipPath)}' -Force`
    : `Compress-Archive -LiteralPath '${psPath(src)}' -DestinationPath '${psPath(zipPath)}' -Force`;
  await runPs(script);
  return { zipPath, tmpDir, filename: path.basename(zipPath) };
}

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

function releasesDir(project) {
  const root = ensureProject(project);
  if (!root) return null;
  const d = path.join(root, 'releases');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function readRevision(project) {
  const d = releasesDir(project);
  if (!d) return 0;
  try {
    return Number(fs.readFileSync(path.join(d, 'revision.txt'), 'utf8').trim()) || 0;
  } catch {
    return 0;
  }
}

function writeRevision(project, n) {
  const d = releasesDir(project);
  if (!d) return;
  fs.writeFileSync(path.join(d, 'revision.txt'), String(n), 'utf8');
}

/** build 成功后把 jar 拷到 releases/ 并打上 rN */
async function publishRelease(project, note = '') {
  const root = ensureProject(project);
  if (!root) return { ok: false, out: '工程目录非法' };
  const libs = path.join(root, 'build', 'libs');
  let jars = [];
  try {
    jars = (await fsp.readdir(libs)).filter((f) => f.endsWith('.jar') && !f.endsWith('-sources.jar') && !f.endsWith('-javadoc.jar'));
  } catch {
    return { ok: false, out: 'build/libs 下没有 jar，先执行 Gradle build' };
  }
  if (!jars.length) return { ok: false, out: 'build/libs 下没有 jar' };
  // 取最新的一个
  const jarName = jars.sort()[jars.length - 1];
  const rev = readRevision(project) + 1;
  const cfg = loadConfig();
  const modId = String(cfg.modId || 'mod').replace(/[^a-zA-Z0-9_-]/g, '') || 'mod';
  const outName = `${modId}-1.0.0-r${rev}.jar`;
  const rd = releasesDir(project);
  await fsp.copyFile(path.join(libs, jarName), path.join(rd, outName));
  writeRevision(project, rev);
  const metaPath = path.join(rd, 'index.json');
  let meta = [];
  try { meta = JSON.parse(await fsp.readFile(metaPath, 'utf8')); } catch { meta = []; }
  const st = await fsp.stat(path.join(rd, outName));
  meta.push({ name: outName, rev, size: st.size, mtime: st.mtimeMs, note: note || '', from: jarName });
  await fsp.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  return { ok: true, out: `已发布 ${outName}（${st.size} 字节）`, name: outName, rev, size: st.size };
}

async function listReleases(project) {
  const rd = releasesDir(project);
  if (!rd) return [];
  try {
    const meta = JSON.parse(await fsp.readFile(path.join(rd, 'index.json'), 'utf8'));
    return meta;
  } catch {
    return [];
  }
}

/* ---------------- 图片生成（贴图工坊） ---------------- */

/** 工程里 assets 下第一个目录就是 modid；没有就用 config 里的 */
async function detectModId(root, fallback) {
  const assets = path.join(root, 'src', 'main', 'resources', 'assets');
  const dirs = await readdirSafe(assets);
  return dirs[0] || fallback || 'mymod';
}

/** 调上游 /images/generations，返回 PNG Buffer */
/** 官方给的尺寸约束：宽高都是 32 的倍数，512–4096，最长边比最短边不超过 3:1 */
function validateSize(size) {
  const text = String(size || '').trim();
  if (text === 'auto') return { ok: true };
  const m = text.match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (!m) return { ok: false, message: '尺寸要写成 宽x高，例如 2048x2048' };
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (w % 32 !== 0 || h % 32 !== 0) return { ok: false, message: '宽高必须是 32 的倍数' };
  if (w < 512 || h < 512 || w > 4096 || h > 4096) {
    return { ok: false, message: '宽高要在 512–4096 之间' };
  }
  if (Math.max(w, h) / Math.min(w, h) > 3.0001) {
    return { ok: false, message: '最极端只能 3:1' };
  }
  return { ok: true };
}

/* 两个模型的建议分辨率，文档里给的；前端按选中的模型换下拉内容 */
const IMAGE_SIZES = {
  'sensenova-u1.5-lite': {
    label: 'U1.5 Lite（生成 + 编辑一体）',
    sizes: [
      { v: '2048x2048', label: '2048×2048 · 1:1 · 2K' },
      { v: '2720x1536', label: '2720×1536 · 16:9 · 2K' },
      { v: '1536x2720', label: '1536×2720 · 9:16 · 2K' },
      { v: '1664x2496', label: '1664×2496 · 2:3 · 2K' },
      { v: '2496x1664', label: '2496×1664 · 3:2 · 2K' },
      { v: '4096x4096', label: '4096×4096 · 1:1 · 4K' },
    ],
    formats: true,      // 支持 output_format / response_format
    edits: true,        // 支持 /images/edits
  },
  'sensenova-u1-fast': {
    label: 'U1 Fast（加速版，信息图突出）',
    sizes: [
      { v: '2048x2048', label: '2048×2048 · 1:1' },
      { v: '2752x1536', label: '2752×1536 · 16:9' },
      { v: '1536x2752', label: '1536×2752 · 9:16' },
      { v: '3072x1376', label: '3072×1376 · 21:9' },
      { v: '1344x3136', label: '1344×3136 · 9:21' },
      { v: '1664x2496', label: '1664×2496 · 2:3' },
      { v: '2496x1664', label: '2496×1664 · 3:2' },
      { v: '1760x2368', label: '1760×2368 · 3:4' },
      { v: '2368x1760', label: '2368×1760 · 4:3' },
      { v: '1824x2272', label: '1824×2272 · 4:5' },
      { v: '2272x1824', label: '2272×1824 · 5:4' },
    ],
    formats: false,
    edits: false,
  },
};

/** 把 b64_json / url 两种响应统一成 Buffer */
async function bufferFromImageResult(first) {
  if (!first) throw new Error('上游没返回图片');
  if (first.b64_json) return Buffer.from(first.b64_json, 'base64');
  if (first.url) {
    const img = await fetch(first.url, { signal: AbortSignal.timeout(60000) });
    if (!img.ok) throw new Error('下载生成的图片失败');
    return Buffer.from(await img.arrayBuffer());
  }
  throw new Error('上游返回里既没有 b64_json 也没有 url');
}

async function postImageApi(base, key, path, body, timeoutSec) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Math.max(30, Number(timeoutSec) || 180) * 1000),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      const parsed = JSON.parse(text);
      msg = parsed.error?.message || parsed.error || parsed.message || text;
    } catch { /* 不是 JSON */ }
    throw new Error(`生图失败（${res.status}）：${String(msg).slice(0, 300)}`);
  }
  try { return JSON.parse(text); } catch { throw new Error('上游返回的不是 JSON'); }
}

/* 文档给的全套参数：
   model / prompt / size / n / watermark / output_format / response_format / prompt_extend
   后三个只有 U1.5 Lite 支持，U1 Fast 传了会报错，所以按模型筛。 */
async function generateImage(cfg, opts) {
  const base = String(cfg.imageBaseUrl || cfg.baseUrl || '').replace(/\/+$/, '');
  const key = cfg.imageApiKey || cfg.apiKey;
  if (!base) throw new Error('没填接口地址');
  if (!key || key.startsWith('sk-在这里')) throw new Error('没填密钥');

  const model = opts.model || cfg.imageModel || 'sensenova-u1.5-lite';
  const spec = IMAGE_SIZES[model] || { formats: false };
  const size = opts.size || cfg.imageSize || '2048x2048';
  const check = validateSize(size);
  if (!check.ok) throw new Error(check.message);

  const body = {
    model,
    prompt: String(opts.prompt || '').trim(),
    n: 1,
    size,
    watermark: opts.watermark === undefined
      ? Boolean(cfg.imageWatermark) : Boolean(opts.watermark),
    prompt_extend: opts.promptExtend === undefined
      ? Boolean(cfg.imagePromptExtend) : Boolean(opts.promptExtend),
  };
  if (spec.formats) {
    if (opts.outputFormat || cfg.imageOutputFormat) {
      body.output_format = opts.outputFormat || cfg.imageOutputFormat;
    }
    if (opts.responseFormat || cfg.imageResponseFormat) {
      body.response_format = opts.responseFormat || cfg.imageResponseFormat;
    }
  }

  const data = await postImageApi(base, key, '/images/generations', body, cfg.apiTimeoutSec);
  return bufferFromImageResult((data.data || [])[0]);
}

/** 图生图：/v1/images/edits，仅 U1.5 Lite，必须传参考图 */
async function generateImageEdit(cfg, opts) {
  const base = String(cfg.imageBaseUrl || cfg.baseUrl || '').replace(/\/+$/, '');
  const key = cfg.imageApiKey || cfg.apiKey;
  if (!base) throw new Error('没填接口地址');
  if (!key || key.startsWith('sk-在这里')) throw new Error('没填密钥');

  const model = opts.model || cfg.imageModel || 'sensenova-u1.5-lite';
  const spec = IMAGE_SIZES[model];
  if (spec && !spec.edits) {
    throw new Error(`${model} 不支持图生图编辑，换 sensenova-u1.5-lite`);
  }
  if (!opts.imageUrl) throw new Error('图生图要先传一张参考图');

  const size = opts.size || cfg.imageSize || 'auto';
  if (size !== 'auto') {
    const check = validateSize(size);
    if (!check.ok) throw new Error(check.message);
  }

  const body = {
    model,
    images: [{ image_url: opts.imageUrl }],
    prompt: String(opts.prompt || '').trim(),
    n: 1,
    size,
    watermark: opts.watermark === undefined
      ? Boolean(cfg.imageWatermark) : Boolean(opts.watermark),
    prompt_extend: opts.promptExtend === undefined
      ? Boolean(cfg.imagePromptExtend) : Boolean(opts.promptExtend),
  };
  if (spec && spec.formats && (opts.responseFormat || cfg.imageResponseFormat)) {
    body.response_format = opts.responseFormat || cfg.imageResponseFormat;
  }

  const data = await postImageApi(base, key, '/images/edits', body, cfg.apiTimeoutSec);
  return bufferFromImageResult((data.data || [])[0]);
}

/** 贴图像素化：MC 贴图越硬边越对味，所以缩放走 NearestNeighbor */
async function scalePng(srcPath, destPath, px) {
  const script = `
Add-Type -AssemblyName System.Drawing
$src = [System.Drawing.Image]::FromFile('${String(srcPath).replace(/'/g, "''")}')
$bmp = New-Object System.Drawing.Bitmap ${px}, ${px}
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
$g.DrawImage($src, 0, 0, ${px}, ${px})
$g.Dispose()
$bmp.Save('${String(destPath).replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
$src.Dispose()`;
  await runPs(script);
}

/** 存进工程：assets/<modid>/textures/<kind>/<name>.png */
async function saveTexture(project, kind, name, buf, scale) {
  const root = ensureProject(project);
  if (!root) throw new Error('bad project');
  const cfg = loadConfig();
  const modid = await detectModId(root, cfg.modId);
  const dir = path.join(root, 'src', 'main', 'resources', 'assets', modid, 'textures', kind);
  await fsp.mkdir(dir, { recursive: true });
  const safe = String(name).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48) || 'texture';
  const finalPath = path.join(dir, `${safe}.png`);

  const px = Number(scale) || 0;
  if (px > 0) {
    const tmp = path.join(dir, `.${safe}.raw.png`);
    await fsp.writeFile(tmp, buf);
    try {
      await scalePng(tmp, finalPath, px);
    } catch (e) {
      // 缩放失败就存原图，别把图丢了
      await fsp.writeFile(finalPath, buf);
      await fsp.unlink(tmp).catch(() => {});
      return { path: path.relative(root, finalPath).replace(/\\/g, '/'), scaled: false, note: String(e.message || e) };
    }
    await fsp.unlink(tmp).catch(() => {});
  } else {
    await fsp.writeFile(finalPath, buf);
  }
  return {
    path: path.relative(root, finalPath).replace(/\\/g, '/'),
    scaled: px > 0,
    px: px || null,
  };
}

/* ---------------- 预览台 ----------------
 * 扫 lang/models/textures/recipes 凑出物品、方块、配方、模型清单
 * 给前端网格用：物品 = 显示名 + 贴图；配方 = 材料 + 成品 */
async function scanBench(root) {
  const assets = path.join(root, 'src', 'main', 'resources', 'assets');
  const mods = await readdirSafe(assets);
  const out = { modid: mods[0] || '', items: [], blocks: [], recipes: [], models: [] };
  if (!out.modid) return out;
  const modDir = path.join(assets, out.modid);

  // lang 文件剥出 item.* / block.* → {id, name, nameEn}
  const lang = {};
  const langEn = {};
  /* 中文表和英文表要分开读：之前第一个循环把 en_us 也 assign 进 lang，
   * 而 en_us 在数组里靠后，直接把中文名覆盖成了英文。 */
  for (const file of ['zh_cn.json', 'zh_cn.lang']) {
    const text = await readTextSafe(path.join(modDir, 'lang', file));
    if (!text) continue;
    try {
      if (file.endsWith('.json')) Object.assign(lang, JSON.parse(text));
    } catch { /* 留空 */ }
  }
  for (const file of ['en_us.json', 'en_us.lang']) {
    const text = await readTextSafe(path.join(modDir, 'lang', file));
    if (!text) continue;
    try {
      if (file.endsWith('.json')) Object.assign(langEn, JSON.parse(text));
    } catch { /* 留空 */ }
  }

  // MC 里物品和方块常共用一个 id 和贴图。扫两个目录后按 id 合并，
  // 避免界面重复显示；每条记下它原本属于哪一类、贴图在哪边。
  const itemModels = await walkJsonSafe(path.join(modDir, 'models', 'item'));
  const blockModels = await walkJsonSafe(path.join(modDir, 'models', 'block'));
  const blockStates = await walkJsonSafe(path.join(modDir, 'blockstates'));

  const entriesById = new Map();
  for (const entry of itemModels) {
    const id = entry.replace(/\.json$/, '');
    entriesById.set(id, {
      id,
      kind: 'item',
      name: stripItemBlock(lang[`item.${out.modid}.${id}`]) || id,
      nameEn: stripItemBlock(langEn[`item.${out.modid}.${id}`]) || '',
      icon: `src/main/resources/assets/${out.modid}/textures/item/${id}.png`,
      hasModel: true,
      hasIcon: await existsSafe(path.join(modDir, 'textures', 'item', `${id}.png`)),
    });
  }
  for (const entry of blockModels) {
    const id = entry.replace(/\.json$/, '');
    const existing = entriesById.get(id);
    const block = {
      kind: 'block',
      name: stripItemBlock(lang[`block.${out.modid}.${id}`]) || id,
      nameEn: stripItemBlock(langEn[`block.${out.modid}.${id}`]) || '',
      icon: `src/main/resources/assets/${out.modid}/textures/block/${id}.png`,
      hasModel: true,
      hasState: blockStates.includes(`${id}.json`),
      hasIcon: await existsSafe(path.join(modDir, 'textures', 'block', `${id}.png`)),
    };
    if (existing) {
      // 同 id 共存：标记 kind=both，贴图有哪个用哪个，名字谁有算谁
      existing.kind = 'both';
      existing.hasItemModel = true;
      existing.hasBlockState = block.hasState;
      if (!existing.hasIcon && block.hasIcon) {
        existing.icon = block.icon;
        existing.hasIcon = true;
      }
      if (!existing.nameEn && block.nameEn) existing.nameEn = block.nameEn;
      if (existing.name === existing.id && block.name !== block.id) existing.name = block.name;
    } else {
      entriesById.set(id, { id, ...block });
    }
  }
  // 同时扫贴图目录：有些资源只有贴图没有模型（用户自己导的）
  const texItem = await walkJsonSafe(path.join(modDir, 'textures', 'item'));
  for (const file of texItem) {
    const id = file.replace(/\.png$/, '');
    if (entriesById.has(id)) continue;
    entriesById.set(id, {
      id,
      kind: 'item',
      name: stripItemBlock(lang[`item.${out.modid}.${id}`]) || id,
      nameEn: stripItemBlock(langEn[`item.${out.modid}.${id}`]) || '',
      icon: `src/main/resources/assets/${out.modid}/textures/item/${id}.png`,
      hasIcon: true,
      hasModel: false,
    });
  }
  const texBlock = await walkJsonSafe(path.join(modDir, 'textures', 'block'));
  for (const file of texBlock) {
    const id = file.replace(/\.png$/, '');
    const ex = entriesById.get(id);
    if (ex) {
      if (!ex.hasIcon) {
        ex.icon = `src/main/resources/assets/${out.modid}/textures/block/${id}.png`;
        ex.hasIcon = true;
      }
      continue;
    }
    entriesById.set(id, {
      id,
      kind: 'block',
      name: stripItemBlock(lang[`block.${out.modid}.${id}`]) || id,
      nameEn: stripItemBlock(langEn[`block.${out.modid}.${id}`]) || '',
      icon: `src/main/resources/assets/${out.modid}/textures/block/${id}.png`,
      hasIcon: true,
      hasModel: false,
      hasState: false,
    });
  }

  // 老的 items/blocks 字段保留，兼容前端；merged 是新字段
  out.entries = [...entriesById.values()].sort((a, b) => a.id.localeCompare(b.id));
  out.items = out.entries.filter((e) => e.kind === 'item' || e.kind === 'both');
  out.blocks = out.entries.filter((e) => e.kind === 'block' || e.kind === 'both');

  // 模型总数（统计行用）
  out.models = [
    ...itemModels.map((n) => `item/${n}`),
    ...blockModels.map((n) => `block/${n}`),
  ];

  // 配方：MC 1.21+ 改成了单数 recipe/，1.20- 还是 recipes/，两个都扫
  // 注意配方在 src/main/resources/data/<modid>/，不在 assets 下
  const dataDir = path.join(root, 'src', 'main', 'resources', 'data', out.modid);
  for (const sub of ['recipes', 'recipe']) {
    const recipeFiles = await walkJsonSafe(path.join(dataDir, sub));
    for (const file of recipeFiles) {
      const text = await readTextSafe(path.join(dataDir, sub, file));
      if (!text) continue;
      let json;
      try { json = JSON.parse(text); } catch { continue; }
      const outSpec = json && json.result;
      if (!outSpec) continue;
      // MC 1.21+ 字段是 id，1.20- 是 item/block；字符串直接就是 id
      const outId = typeof outSpec === 'string'
        ? outSpec.replace(/^\d+x/, '')
        : (outSpec.id || outSpec.item || outSpec.block || '');
      if (!outId) continue;
      const cleanId = outId.replace(/^[^:]+:/, '').replace(/^\d+x/, '');
      out.recipes.push({
        id: `${sub}/${file.replace(/\.json$/, '')}`,
        out: cleanId,
        count: typeof outSpec === 'string' ? Number(outSpec.match(/^(\d+)x/)?.[1] || 1)
          : Number(outSpec.count || 1),
        // 显式声明 shapeless 才是无序，其它（有 pattern 或 type 是 shaped）都算有序
        shaped: json.type !== 'minecraft:crafting_shapeless',
        pattern: Array.isArray(json.pattern) ? json.pattern.slice() : [],
        /* 键剥前缀方便前端按 ID 查。
         * MC 1.21+ 的 key 值是对象（{"item":"minecraft:blaze_rod"}），
         * 1.20- 是字符串（"minecraft:blaze_rod"）；标签写成 "#minecraft:planks"。
         * 之前只当字符串处理，1.21 的配方全变成 "[object Object]"。 */
        keys: Object.fromEntries(Object.entries(json.key || {}).map(([k, v]) => {
          const raw = typeof v === 'string'
            ? v
            : (v && (v.item || v.id || v.tag)) || '';
          return [k, String(raw).replace(/^#/, '').replace(/^[^:]+:/, '')];
        })),
        keyTags: Object.fromEntries(Object.entries(json.key || {}).map(([k, v]) => [
          k, Boolean((typeof v === 'object' && v && v.tag) || String(v).startsWith('#')),
        ])),
      });
    }
  }
  return out;
}

function stripItemBlock(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

async function readdirSafe(dir) {
  try { return await fsp.readdir(dir); } catch { return []; }
}

async function readTextSafe(file) {
  try { return await fsp.readFile(file, 'utf8'); } catch { return null; }
}

async function existsSafe(file) {
  try { await fsp.access(file); return true; } catch { return false; }
}

async function walkJsonSafe(dir) {
  try {
    const entries = await fsp.readdir(dir);
    return entries.filter((n) => n.endsWith('.json')).sort();
  } catch { return []; }
}

/* ---------------- MIME ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/* ---------------- chat store ---------------- */
function chatPath(id) {
  return path.join(CHATS_DIR, `${id}.json`);
}

function loadChat(id) {
  try {
    return JSON.parse(fs.readFileSync(chatPath(id), 'utf8'));
  } catch {
    return null;
  }
}

function saveChat(chat) {
  fs.writeFileSync(chatPath(chat.id), JSON.stringify(chat, null, 2), 'utf8');
}

function listChats() {
  try {
    return fs.readdirSync(CHATS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const c = JSON.parse(fs.readFileSync(path.join(CHATS_DIR, f), 'utf8'));
          return {
            id: c.id,
            title: c.title || '未命名',
            updatedAt: c.updatedAt || 0,
            busy: Boolean(c.busy),
            project: c.project || 'default',
            messageCount: (c.messages || []).length,
            archived: Boolean(c.archived),
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

function trimForStore(text, max = 4000) {
  const s = String(text ?? '');
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…（已截断，共 ${s.length} 字）`;
}

/** 旧工具回执瘦身：不把陈年 write/read 全文反复塞进上下文 */
const TOOL_THIN_KEEP_CHARS = 400;
const TOOL_THIN_KEEP_RECENT = 4; // 最近 N 条 tool 回执保留全文

function parseToolArgs(args) {
  if (!args) return {};
  if (typeof args === 'object') return args;
  try {
    return JSON.parse(String(args)) || {};
  } catch {
    return {};
  }
}

function thinToolContent(raw, toolName, toolPath) {
  const s = String(raw ?? '');
  if (s.length <= TOOL_THIN_KEEP_CHARS) return s;
  const lines = s.split('\n').length;
  const pathPart = toolPath ? ` ${toolPath}` : '';
  if (toolName === 'write_file') {
    return `（历史回执已压缩）已写入${pathPart || '文件'}，约 ${lines} 行 / ${s.length} 字。需要当前内容时请调用 read_file，不要臆造。`;
  }
  if (toolName === 'read_file') {
    return `（历史回执已压缩）曾读取${pathPart || '文件'}，约 ${lines} 行 / ${s.length} 字。需要再次查看请调用 read_file。`;
  }
  if (toolName === 'run_gradle') {
    const head = s.slice(0, 240).replace(/\s+/g, ' ').trim();
    return `（历史回执已压缩）run_gradle 摘要：${head}… [共 ${s.length} 字]`;
  }
  return `（历史回执已压缩）${toolName || 'tool'} 结果约 ${s.length} 字，需要时请重调工具。`;
}

/* 上下文长度档位：主人嫌「16 条 / 64 条」看不懂，直接按 token 给两档 */
const CONTEXT_TOKENS = {
  '256k': 256 * 1024,
  '1m': 1024 * 1024,
};

function contextBudget(cfg) {
  const key = String(cfg && cfg.contextLength || '256k').toLowerCase();
  return CONTEXT_TOKENS[key] || CONTEXT_TOKENS['256k'];
}

/** 粗估 token：中文 1 字 ≈ 1，英文 1 字 ≈ 0.25，统一按字符 / 2 折 */
function estTokens(text) {
  return Math.ceil(String(text || '').length / 2);
}

function toApiMessages(chat, cfg) {
  const src = chat.messages || [];
  const lastUser = [...src].reverse().find((m) => m.role === 'user')?.content || '';
  const out = [{ role: 'system', content: systemPrompt(cfg, chat.project || 'default', lastUser) }];
  // 先按条数兜底，再按 token 预算从后往前缩
  const BUDGET = Math.max(8, Number(cfg.historyLimit) || 36);
  let start = Math.max(0, src.length - BUDGET);
  // 预留三成给系统提示 + 本轮回复，剩下的才是历史能吃的额度
  const tokenCap = Math.floor(contextBudget(cfg) * 0.7) - estTokens(out[0].content || '');
  let spent = 0;
  for (let i = src.length - 1; i >= start; i -= 1) {
    const m = src[i];
    const cost = estTokens(m?.content) + (m?.tool_calls
      ? m.tool_calls.reduce((s, tc) => s + estTokens(tc.args || tc.arguments), 0) : 0);
    if (spent + cost > tokenCap && i < src.length - 1) {
      start = i + 1;
      break;
    }
    spent += cost;
  }
  while (start > 0 && src[start]?.role === 'tool') start -= 1;

  // tool_call_id → 工具名/路径，便于瘦身时写清楚压的是哪个文件
  const callMeta = new Map();
  for (const m of src) {
    if (m.role !== 'assistant' || !m.tool_calls?.length) continue;
    for (const tc of m.tool_calls) {
      const args = parseToolArgs(tc.args || tc.arguments);
      callMeta.set(tc.id, { name: tc.name || '', path: args.path || '' });
    }
  }

  // 从后往前数，最近几条 tool 保留全文
  const toolIdx = [];
  for (let i = src.length - 1; i >= 0; i -= 1) {
    if (src[i]?.role === 'tool') toolIdx.push(i);
  }
  const keepFull = new Set(toolIdx.slice(0, TOOL_THIN_KEEP_RECENT));

  for (let i = start; i < src.length; i += 1) {
    const m = src[i];
    if (!m) continue;
    if (m.role === 'assistant') {
      const item = { role: 'assistant', content: m.content || null };
      if (m.tool_calls?.length) {
        item.tool_calls = m.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.args || tc.arguments || '{}' },
        }));
      }
      if (item.content || item.tool_calls) out.push(item);
    } else if (m.role === 'tool') {
      let content = m.content || '';
      if (!keepFull.has(i)) {
        const meta = callMeta.get(m.tool_call_id) || {};
        content = thinToolContent(content, m.name || meta.name, meta.path);
      }
      out.push({ role: 'tool', tool_call_id: m.tool_call_id, content });
    } else if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    }
  }
  return out;
}

function toPascal(id) {
  return String(id).split(/[_-]/).filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join('');
}

/** 上下文用量分类：中文 1 字约 1 token，英文 1 字约 0.25 token；
 * 粗估统一按字符/2 算 token，分到 4 类让前端照主站那张饼图 */
function buildContextReport(chat, cfg) {
  // 容量按主人选的上下文长度档位（256K / 1M），不再用 maxTokens
  const limit = contextBudget(cfg);
  const sysText = systemPrompt(cfg, chat.project || 'default', '');
  let sysTokens = 0;
  if (typeof sysText === 'string') sysTokens = Math.ceil(sysText.length / 2);
  else if (sysText && sysText.content) sysTokens = Math.ceil(sysText.content.length / 2);

  let msgTokens = 0;
  let toolTokens = 0;
  (chat.messages || []).forEach((m) => {
    const content = String(m.content || '');
    if (m.role === 'user' || m.role === 'assistant') {
      msgTokens += Math.ceil(content.length / 2);
      if (m.tool_calls && m.tool_calls.length) {
        m.tool_calls.forEach((tc) => {
          const args = tc.args || tc.arguments || '{}';
          toolTokens += Math.ceil(String(args).length / 2);
        });
      }
    } else if (m.role === 'tool') {
      toolTokens += Math.ceil(content.length / 2);
    }
  });

  // 技能 / MCP 这两类本地版暂无任何调用，固定 0 但保留分类让前端画栏
  const skillTokens = 0;
  const mcpTokens = 0;

  const used = sysTokens + msgTokens + toolTokens + skillTokens + mcpTokens;
  const pct = (used / limit) * 100;
  const cat = (used, name, color) => ({
    name,
    color,
    used,
    pct: Math.round((used / limit) * 1000) / 10,
  });
  return {
    limit,
    used,
    pct: Math.round(pct * 10) / 10,
    categories: [
      cat(sysTokens, '系统提示词', 'blue'),
      cat(toolTokens, '工具及子智能体', 'green'),
      cat(msgTokens, '对话消息', 'orange'),
      cat(mcpTokens, '连接器及MCP', 'purple'),
      cat(skillTokens, '技能', 'pink'),
    ],
  };
}

function systemPrompt(cfg, project, userQuery) {
  const loader = String(cfg.loader || 'neoforge').toLowerCase();
  const isForge = loader === 'forge';
  const memBlock = memoryPromptBlock(userQuery || `${cfg.modId} ${cfg.workspaceName} ${project}`);

  const tomlPath = isForge
    ? `src/main/resources/META-INF/mods.toml`
    : `src/main/resources/META-INF/neoforge.mods.toml`;
  const depLine = isForge
    ? `依赖写 forge / minecraft；注册注意 Forge 与 NeoForge API 差异。`
    : `依赖写 neoforge / minecraft；注册用 DeferredRegister + modEventBus。`;

  return `你是「automods-lite」本地工作台的 Minecraft 模组开发助手。当前目标：
- Minecraft ${cfg.mcVersion}
- 加载器：${isForge ? 'Forge' : 'NeoForge'}
- 模组 id：${cfg.modId}
- 工程名：${cfg.workspaceName}
- 本对话工程目录：workspace/projects/${project}/
${memBlock}
节奏（极重要，优先于“想全再做”）：
1. **禁止长时间闷头推理**。思考里只列「这一步要写哪几个文件」，不要写完整代码、不要完整架构论文。
2. **每轮必须马上动手**：先用 1～3 句中文正文说明本轮做什么，**同一轮立刻调用 write_file**（可多个）。不要只思考不调工具。
3. 大需求拆成多轮：骨架/注册 → 核心逻辑 → 渲染/特效 → 语言与资源 → 编译。每轮都落盘，而不是憋到最后一轮。
4. 宁可先写能编译的最小实现，再下一轮补细节；禁止“想完美再开始”。

规则：
1. 需要落盘的代码/JSON/资源，必须调用 write_file，不要只贴在对话里让用户复制。
2. 一次可以写多个文件。Java 包名与路径一致：src/main/java/...
3. **单文件尽量一次写完**；若超过约 300 行，拆成多次 write_file（先骨架再补全），避免 arguments 被截断。
4. 清单文件：${tomlPath}；资源 assets/${cfg.modId}/...、data/${cfg.modId}/...
5. ${depLine}modId 全小写。
6. 回复用简体中文，短句说明你做了什么、下一步建议。
7. 不要编造未实现的 API；不确定时选该版本常见写法并说明。
8. 用户要求编译/构建时，调用 run_gradle（默认 build）。**更重要的是：写完一批
   Java 代码后自己主动调一次 run_gradle 验证，不用等用户开口** —— 编译错误比
   想象中常见，而且只有编译能抓到。报错就照着一行行改，改完再编译，直到通过。
   NeoForge 1.21 上最容易写错的几处：
   - `ArmorMaterial` 要包成 `Holder<ArmorMaterial>`（用 `Holder.direct(...)` 或注册它）
   - `SimpleTier` 的第一个参数是 `TagKey<Block>`（比如 `BlockTags.INCORRECT_FOR_...`），
     不是 int
   - 物品/方块的 `registerItem` 用 `props.attributes(...)`，别用旧的 `new SwordItem(tier, atk, spd, props)`
   - 别给不存在的方法加 `@Override`
9. 贴图 png 你生不了，但**不要因此说「做不到」**：按规范把路径和文件名写好
   （assets/<modid>/textures/item 或 block/<id>.png），然后在收尾里告诉用户
   「到侧栏的『贴图工坊』里按这个文件名生成一张就行」。工坊会用生图模型出图、
   缩到 16/32/64/128 像素并直接落到这个路径，用户不用自己画。
10. 若 write_file 返回「参数 JSON 不完整」，立刻重试一次完整 JSON，不要改聊别的。
11. **思考/reasoning 必须全程用简体中文**，禁止用英文推理；正文回复也用简体中文。
12. 历史里标了「历史回执已压缩」的工具结果只是摘要，不是文件现状；改旧文件前先 read_file。
13. 写 gradle.properties 时，**neo_version 必须写真实存在的版本号**：
    1.21.1 对应 21.1.x，而 x 是 build 号，实际长这样：21.1.250。
    不要写 21.1.0 / 21.1.1 / 21.1.10 这类整齐数字 —— maven 上没有，
    编译会直接报 Could not find net.neoforged:neoforge。拿不准就写 21.1.250。
    同理 minecraft_version 写 1.21.1、neoform 相关的版本别自己编。

标准目录：
src/main/java/com/example/${cfg.modId}/
  ${toPascal(cfg.modId)}Mod.java
  registry/ModItems.java
${tomlPath}
src/main/resources/assets/${cfg.modId}/lang/zh_cn.json
src/main/resources/assets/${cfg.modId}/models/item/xxx.json
`;
}

const liveRuns = new Map();
const gradleRuns = new Map();

/* ---------------- tools ---------------- */
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: '把完整文件内容写入当前对话的工程目录。路径相对工程根，例如 src/main/java/com/example/mymod/MyMod.java',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '相对路径，正斜杠' },
          content: { type: 'string', description: '文件完整内容' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: '读取工程内已有文件全文',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: '列出当前工程所有文件路径',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: '删除工程内一个文件',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string' } },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_gradle',
      description: '在工程目录执行 Gradle 任务（需要工程含 gradlew，或设置里配置了 gradleCmd）。常用：build、runClient、compileJava',
      parameters: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'Gradle 任务名，默认 build' },
        },
      },
    },
  },
];

async function execTool(name, args, project, emit) {
  const root = ensureProject(project);
  if (!root) return { ok: false, out: '工程目录非法' };

  try {
    if (name === 'write_file') {
      const abs = safeJoin(root, args.path);
      if (!abs) return { ok: false, out: '路径非法' };
      await fsp.mkdir(path.dirname(abs), { recursive: true });
      await fsp.writeFile(abs, args.content ?? '', 'utf8');
      const bytes = Buffer.byteLength(args.content ?? '');
      emit({ k: 'tool_note', type: 'write', path: args.path, bytes });
      return { ok: true, out: `已写入 ${args.path}（${bytes} 字节）` };
    }
    if (name === 'read_file') {
      const abs = safeJoin(root, args.path);
      if (!abs) return { ok: false, out: '路径非法' };
      const text = await fsp.readFile(abs, 'utf8');
      emit({ k: 'tool_note', type: 'read', path: args.path });
      return { ok: true, out: text.slice(0, 120000) };
    }
    if (name === 'list_files') {
      const files = await listProjectFiles(project);
      emit({ k: 'tool_note', type: 'list', count: files.length });
      return { ok: true, out: files.map((f) => f.path).join('\n') || '（空工程）' };
    }
    if (name === 'delete_file') {
      const abs = safeJoin(root, args.path);
      if (!abs) return { ok: false, out: '路径非法' };
      await fsp.unlink(abs);
      emit({ k: 'tool_note', type: 'delete', path: args.path });
      return { ok: true, out: `已删除 ${args.path}` };
    }
    if (name === 'run_gradle') {
      const result = await runGradle(root, args.task || 'build', emit);
      // build 成功 → 发布 rN jar，方便网页直接下载
      if (result.ok && /^(build|assemble|jar)$/i.test(String(args.task || 'build'))) {
        try {
          const pub = await publishRelease(project, `run_gradle ${args.task || 'build'}`);
          if (pub.ok) {
            result.out += `\n${pub.out}`;
            result.release = pub;
            emit({ k: 'tool_note', type: 'release', path: `releases/${pub.name}`, bytes: pub.size, rev: pub.rev });
            emit({ k: 'release', name: pub.name, rev: pub.rev, size: pub.size });
          }
        } catch (e) {
          result.out += `\n发布 jar 失败：${e.message || e}`;
        }
      }
      return result;
    }
    return { ok: false, out: `未知工具 ${name}` };
  } catch (e) {
    return { ok: false, out: String(e.message || e) };
  }
}

function detectGradleCmd(root, cfg) {
  if (cfg.gradleCmd && String(cfg.gradleCmd).trim()) {
    return { cmd: String(cfg.gradleCmd).trim(), argsPrefix: [] };
  }
  const bat = path.join(root, 'gradlew.bat');
  const sh = path.join(root, 'gradlew');
  if (process.platform === 'win32' && fs.existsSync(bat)) {
    return { cmd: bat, argsPrefix: [] };
  }
  if (fs.existsSync(sh)) {
    return { cmd: process.platform === 'win32' ? sh : sh, argsPrefix: [] };
  }
  // 常见：用户把 MDK 放进工程，但包装器未 chmod；Windows 直接 gradle
  return null;
}

async function runGradle(root, task, emit) {
  const cfg = loadConfig();
  const detected = detectGradleCmd(root, cfg);
  if (!detected) {
    return {
      ok: false,
      out: '未找到 gradlew，也未在设置里配置 gradleCmd。'
        + '点输入栏的「构建」徽章 →「一键准备构建环境」可以自动装一个。',
    };
  }

  /* NeoForge 1.21 要 JDK 21，但 PATH 里的 java 未必是 21。
   * 这里把 JAVA_HOME 和 PATH 都指向找到的 JDK 21，
   * 否则 gradlew 内部调 java 会拿到旧版本，报「Unsupported class file major version」。 */
  const jdk = await detectJdk21();
  const env = { ...process.env };
  if (jdk.ok && jdk.home) {
    env.JAVA_HOME = jdk.home;
    env.PATH = `${path.join(jdk.home, 'bin')}${path.delimiter}${env.PATH || ''}`;
  }

  /* 内存不够就别开跑了：NeoForge 第一次编译要反编译整个 Minecraft，
   * 4G 可用内存都撑不住（实测 4.1G 时 JVM 直接崩在 G1 virtual space 上）。
   * 与其让人等五分钟看一句 "insufficient memory"，不如提前说清楚。 */
  const freeGb = os.freemem() / 1024 / 1024 / 1024;
  if (freeGb < 4) {
    const stale = staleJavaProcesses();
    const staleText = stale.length
      ? `\n另外检测到 ${stale.length} 个占内存的 java 进程（多半是上次编译崩掉后没退出的）：\n`
        + stale.map((p) => `  PID ${p.pid} · 占 ${(p.memKb / 1024 / 1024).toFixed(1)} GB`).join('\n')
        + '\n把它们结束掉能立刻腾出内存：任务管理器里结束 java.exe，'
        + '或命令行执行 taskkill /PID <上面的 PID> /F。\n'
      : '';
    return {
      ok: false,
      out: `可用内存只有 ${freeGb.toFixed(1)} GB，先不开编译了。\n`
        + 'NeoForge 第一次编译要把整个 Minecraft 反编译一遍，至少需要 4-5 GB 空闲内存，\n'
        + '不然 JVM 会直接崩（不是代码问题）。\n'
        + staleText
        + '\n请先关掉浏览器、游戏、IDE 等占内存的程序，然后重新点编译。\n'
        + '（Gradle 和依赖已经下好了，第二次会快很多。）',
    };
  }

  return new Promise((resolve) => {
    const timeoutMs = Math.max(30, Number(cfg.gradleTimeoutSec) || 180) * 1000;
    const args = [task];
    emit({
      k: 'status',
      text: jdk.ok
        ? `Gradle ${task}…（JDK ${jdk.version}）`
        : `Gradle ${task}…（没找到 JDK 21，PATH 里是 ${jdk.version || '未知'}）`,
    });

    let child;
    try {
      /* Windows 上不能直接 spawn .bat/.cmd —— Node 从 v20 起（CVE-2024-27980 的修复）
       * 会直接抛 spawn EINVAL。必须走 shell，而且路径带空格（比如
       * "C:\Users\...\Claude Code\..."）时得自己加引号，否则 cmd.exe 解析错。 */
      const isBat = /\.(bat|cmd)$/i.test(detected.cmd);
      child = spawn(isBat ? `"${detected.cmd}"` : detected.cmd, args, {
        cwd: root,
        env,
        windowsHide: true,
        shell: isBat,
      });
    } catch (e) {
      resolve({ ok: false, out: `无法启动 Gradle：${e.message || e}` });
      return;
    }

    gradleRuns.set(root, child);
    let out = '';
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      try { child.kill('tree'); } catch { try { child.kill(); } catch { /* ignore */ } }
    }, timeoutMs);

    const append = (chunk) => {
      const s = chunk.toString('utf8');
      out += s;
      if (out.length > 120000) out = out.slice(-120000);
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);

    child.on('error', (e) => {
      clearTimeout(timer);
      gradleRuns.delete(root);
      resolve({ ok: false, out: `Gradle 启动失败：${e.message}` });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      gradleRuns.delete(root);
      if (killed) {
        resolve({ ok: false, out: `Gradle 超时被终止。\n${tail(out, 4000)}` });
        return;
      }
      const ok = code === 0;
      /* 反编译 Minecraft 是 NeoForge 第一次编译最吃内存的一步，
       * 撑不住时 JVM 会直接崩，输出里只有一行 "insufficient memory"
       * 和一堆 hs_err 路径。这种不是代码问题，得明确告诉人怎么办。 */
      let hint = '';
      if (!ok && /insufficient memory|OutOfMemoryError|hs_err_pid/i.test(out)) {
        const freeGb = os.freemem() / 1024 / 1024 / 1024;
        hint = '\n\n【这次是内存不够，不是代码问题】\n'
          + `当前可用内存约 ${freeGb.toFixed(1)} GB。NeoForge 第一次编译要反编译整个 `
          + 'Minecraft，至少需要 4-5 GB 空闲。\n'
          + '建议：关掉浏览器、游戏等占内存的程序，然后重新点编译。\n'
          + '（已经下好的依赖会留着，第二次编译快很多。）\n';
      }
      resolve({
        ok,
        out: (ok ? '构建成功\n' : `构建失败（exit ${code}）\n`) + tail(out, 8000) + hint,
      });
    });
  });
}

function tail(s, n) {
  return s.length <= n ? s : `…\n${s.slice(-n)}`;
}

/* ---------------- OpenAI streaming (shared) ---------------- */
function detectReasoningStyle(cfg) {
  const explicit = String(cfg.reasoningStyle || 'auto').toLowerCase();
  if (explicit && explicit !== 'auto') return explicit;
  const base = String(cfg.baseUrl || '').toLowerCase();
  const model = String(cfg.model || '').toLowerCase();
  if (/qwen|dashscope|aliyun/.test(base) || model.startsWith('qwen')) return 'qwen';
  if (/generativelanguage|gemini/.test(base) || model.includes('gemini')) return 'gemini';
  if (/deepseek/.test(base) && model.includes('reasoner')) return 'none'; // R1 用模型名即可
  if (effortOff(cfg)) return 'none';
  return 'openai';
}

function effortOff(cfg) {
  const e = String(cfg.reasoningEffort || 'off').toLowerCase();
  return !e || e === 'off';
}

/** 把 off/low/medium/high 映射到各家上游字段 */
function applyReasoning(body, cfg) {
  const effort = String(cfg.reasoningEffort || 'off').toLowerCase();
  if (!effort || effort === 'off') return;
  const style = detectReasoningStyle(cfg);

  if (style === 'none') return;

  if (style === 'qwen') {
    // DashScope / 通义：enable_thinking + thinking_budget（约）
    body.enable_thinking = true;
    const budget = { low: 512, medium: 2048, high: 8192, xhigh: 16384, max: 32768 }[effort] || 2048;
    body.thinking_budget = budget;
    // 部分网关还要这个
    body.chat_template_kwargs = { enable_thinking: true };
    return;
  }

  if (style === 'gemini') {
    // Gemini OpenAI 兼容层 / 原生风格字段（尽量兼容）
    body.reasoning_effort = effort;
    body.thinkingConfig = {
      thinkingBudget: { low: 512, medium: 2048, high: 8192 }[effort] || 2048,
    };
    return;
  }

  // openai 及大多数中转
  body.reasoning_effort = effort;
}

function buildChatBody(cfg, messages, tools) {
  const temperature = Number(cfg.temperature);
  const topP = Number(cfg.topP);
  const maxTokens = Number(cfg.maxTokens);
  const body = {
    model: cfg.model,
    messages,
    temperature: Number.isFinite(temperature) ? temperature : 0.4,
    stream: true,
  };
  if (Number.isFinite(topP) && topP > 0 && topP <= 1) body.top_p = topP;
  if (Number.isFinite(maxTokens) && maxTokens > 0) {
    // 兼容不同网关字段名
    body.max_tokens = maxTokens;
    body.max_completion_tokens = maxTokens;
  }
  if (tools && tools.length) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }
  applyReasoning(body, cfg);
  return body;
}

/** 拉上游 /models */
export async function fetchModelList(cfg) {
  const base = String(cfg.baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('未配置 baseUrl');
  if (!cfg.apiKey || cfg.apiKey.startsWith('sk-在这里')) throw new Error('未配置 apiKey');
  const url = `${base}/models`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`上游 /models ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const arr = Array.isArray(data?.data) ? data.data
    : Array.isArray(data?.models) ? data.models
    : Array.isArray(data) ? data : [];
  const ids = arr
    .map((m) => (typeof m === 'string' ? m : m?.id || m?.name || ''))
    .filter(Boolean)
    .map(String);
  const uniq = [...new Set(ids)].sort((a, b) => a.localeCompare(b));
  return uniq;
}

function withTimeoutSignal(signal, sec) {
  const ms = Math.max(15, Number(sec) || 180) * 1000;
  const timeout = AbortSignal.timeout(ms);
  if (!signal) return timeout;
  return AbortSignal.any([signal, timeout]);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 非流式单次补全（想法优化 / 记忆总结 / 规划用）— 含 429/5xx 重试 */
async function callChatCompletionsOnce(cfg, messages, opts = {}) {
  const base = String(cfg.baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('未配置 baseUrl');
  if (!cfg.apiKey || cfg.apiKey.startsWith('sk-在这里')) throw new Error('未配置 apiKey');
  const body = {
    model: cfg.model,
    messages,
    temperature: opts.temperature ?? 0.5,
    max_tokens: opts.maxTokens ?? 800,
  };
  if (opts.jsonMode) body.response_format = { type: 'json_object' };

  const max = Math.max(0, Number(cfg.apiRetries) || 6);
  let attempt = 0;
  let lastErr = null;

  while (attempt <= max) {
    let res;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(opts.timeoutMs || 60000),
      });
    } catch (e) {
      lastErr = e;
      if (attempt >= max) throw e;
      const wait = Math.min(15000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 500);
      await sleep(wait);
      attempt += 1;
      continue;
    }

    if (res.ok) {
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }

    const t = await res.text().catch(() => '');
    // json_mode 不支持时去掉再试一次（不占重试额度）
    if (opts.jsonMode && (res.status === 400 || res.status === 422)) {
      return callChatCompletionsOnce(cfg, messages, { ...opts, jsonMode: false });
    }

    lastErr = new Error(`API ${res.status}: ${t.slice(0, 220)}`);

    const retriable = res.status === 429 || res.status >= 500 || res.status === 408;
    if (!retriable || attempt >= max) throw lastErr;

    /* 退避策略：429 单独放宽。
     * 长任务（一次几十个 write_file）很容易撞限流，而上游恢复往往要几十秒——
     * 之前统一封顶 15 秒，四次重试加起来只等了 19 秒，基本注定失败。 */
    const ra = Number(res.headers.get('Retry-After'));
    const isRate = res.status === 429;
    const cap = isRate ? 60000 : 20000;
    const floor = isRate ? 5000 : 1000;
    const wait = ra > 0
      ? Math.min(cap, ra * 1000)
      : Math.max(floor, Math.min(cap, 1500 * 2 ** attempt + Math.floor(Math.random() * 800)));
    opts.onRetry?.({ attempt: attempt + 1, max, waitMs: wait, status: res.status });
    await sleep(wait);
    attempt += 1;
  }
  throw lastErr || new Error('上游请求失败');
}

/** 尽量从模型输出里抠出合法 JSON */
function extractJsonObject(raw) {
  if (!raw) return null;
  let t = String(raw).trim();
  // 去掉 ```json ... ```
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  // 直接试
  try { return JSON.parse(t); } catch { /* continue */ }
  // 找第一段平衡的 {...}
  const start = t.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i += 1) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        const slice = t.slice(start, i + 1);
        try { return JSON.parse(slice); } catch { /* try repair */ }
        // 简单修复：去掉尾逗号
        try {
          return JSON.parse(slice.replace(/,\s*([}\]])/g, '$1'));
        } catch { /* continue */ }
        break;
      }
    }
  }
  // lastIndexOf 兜底
  const end = t.lastIndexOf('}');
  if (end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch { /* ignore */ }
  }
  return null;
}

function normalizePlan(plan) {
  if (!plan || typeof plan !== 'object') return null;
  const groups = Array.isArray(plan.groups) ? plan.groups : [];
  const cleaned = groups
    .map((g, gi) => ({
      id: String(g.id || `g${gi + 1}`),
      title: String(g.title || `决策 ${gi + 1}`),
      desc: String(g.desc || ''),
      options: (Array.isArray(g.options) ? g.options : [])
        .map((o, oi) => ({
          id: String(o.id || `o${oi + 1}`),
          label: String(o.label || o.title || `方案 ${oi + 1}`),
          detail: String(o.detail || o.desc || ''),
          recommended: Boolean(o.recommended || o.rec),
        }))
        .filter((o) => o.label && o.label !== `方案 ${o.id}`)
        .slice(0, 4),
    }))
    .filter((g) => g.options.length > 0)
    .slice(0, 6);
  if (!cleaned.length) return null;
  return {
    title: String(plan.title || '模组规划'),
    summary: String(plan.summary || ''),
    groups: cleaned,
  };
}

/** 429/5xx 自动重试；超时只约束「连上/无数据」，不约束整段思考时长 */
async function fetchChatWithRetry(url, init, cfg, emit) {
  const max = Math.max(0, Number(cfg.apiRetries) || 6);
  // 推理强度越高，上游越可能很久才回响应头/首包
  const effort = String(cfg.reasoningEffort || 'off').toLowerCase();
  const connectTimeoutSec = effort === 'max' || effort === 'xhigh' ? 180
    : effort === 'high' ? 120
    : 60;
  let attempt = 0;
  let lastErr = null;

  const isTimeoutErr = (e) => {
    const name = String(e?.name || '');
    const msg = String(e?.message || e || '');
    return name === 'TimeoutError'
      || name === 'AbortError'
      || /timeout|aborted due to timeout|ETIMEDOUT|UND_ERR/i.test(msg);
  };

  while (attempt <= max) {
    if (init.signal?.aborted) throw new Error('已手动停止');
    // 连接超时只约束「拿到响应头」；拿到后立刻解除，避免把整段流式思考也一起 abort
    const connectCtrl = new AbortController();
    const connectTimer = setTimeout(() => {
      connectCtrl.abort(new Error(`connect timeout ${connectTimeoutSec}s`));
    }, connectTimeoutSec * 1000);
    const attemptSignal = init.signal
      ? AbortSignal.any([init.signal, connectCtrl.signal])
      : connectCtrl.signal;

    let res;
    try {
      res = await fetch(url, { ...init, signal: attemptSignal });
      // 响应头已到：取消连接计时，后续 body 只受用户停止 / idle 超时约束
      clearTimeout(connectTimer);
    } catch (e) {
      clearTimeout(connectTimer);
      lastErr = e;
      // 用户手动停止
      if (init.signal?.aborted) throw new Error('已手动停止');
      const isTimeout = isTimeoutErr(e) || /connect timeout/i.test(String(e?.message || e));
      if (attempt >= max) {
        throw new Error(isTimeout
          ? `连接上游超时（${connectTimeoutSec}s 无响应）。推理强度较高时首包会更慢，可到设置把「推理强度」降到 high/medium，或稍后重试。`
          : String(e?.message || e));
      }
      const wait = Math.min(15000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 500);
      emit?.({
        k: 'status',
        text: isTimeout
          ? `连接上游超时（${connectTimeoutSec}s），${Math.round(wait / 1000)}s 后重试（${attempt + 1}/${max}）`
          : `网络异常，${Math.round(wait / 1000)}s 后重试（${attempt + 1}/${max}）`,
      });
      await sleep(wait);
      attempt += 1;
      continue;
    }

    if (res.status !== 429 && res.status < 500) return res;

    const text = await res.text().catch(() => '');
    lastErr = new Error(`API ${res.status}: ${text.slice(0, 200)}`);
    if (attempt >= max) return res;

    /* 退避策略：429 单独放宽。
     * 长任务（一次几十个 write_file）很容易撞限流，而上游恢复往往要几十秒——
     * 之前统一封顶 15 秒，四次重试加起来只等了 19 秒，基本注定失败。 */
    const ra = Number(res.headers.get('Retry-After'));
    const isRate = res.status === 429;
    const cap = isRate ? 60000 : 20000;
    const floor = isRate ? 5000 : 1000;
    const wait = ra > 0
      ? Math.min(cap, ra * 1000)
      : Math.max(floor, Math.min(cap, 1500 * 2 ** attempt + Math.floor(Math.random() * 800)));
    emit?.({
      k: 'status',
      text: res.status === 429
        ? `上游限流，${Math.round(wait / 1000)}s 后自动重试（${attempt + 1}/${max}）· 已保留思考`
        : `上游 ${res.status}，${Math.round(wait / 1000)}s 后重试（${attempt + 1}/${max}）`,
    });
    await sleep(wait);
    attempt += 1;
  }
  throw lastErr || new Error('上游请求失败');
}

/** 读流：每收到一块就重置 idle 计时；连续无数据才超时 */
async function readStreamWithIdleTimeout(reader, onChunk, idleSec, outerSignal, emit) {
  const idleMs = Math.max(30, idleSec) * 1000;
  let idleTimer = null;
  let timedOut = false;
  // 心跳按时间节流：上游一个 token 一块，按概率抽会把前端那行字刷成走马灯
  let lastBeat = 0;

  const arm = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      timedOut = true;
      try { reader.cancel('idle timeout'); } catch { /* ignore */ }
    }, idleMs);
  };

  const disarm = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  };

  arm();
  try {
    while (true) {
      if (outerSignal?.aborted) throw new Error('已手动停止');
      let result;
      try {
        result = await reader.read();
      } catch (e) {
        if (timedOut) {
          throw new Error(`上游 ${Math.round(idleMs / 1000)}s 无新数据（思考或正文卡住）。可点停止后重试，或提高「上游超时」。`);
        }
        throw e;
      }
      if (result.done) break;
      arm(); // 有数据 → 续命
      onChunk(result.value);
      if (emit && Date.now() - lastBeat > 15000) {
        lastBeat = Date.now();
        emit({ k: 'status', text: '思考/输出中…（有数据，不会超时）' });
      }
    }
  } finally {
    disarm();
  }
}

export async function callChatStream(cfg, messages, tools, signal, emit) {
  const base = String(cfg.baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('未配置 baseUrl');
  if (!cfg.apiKey || cfg.apiKey.startsWith('sk-在这里')) throw new Error('未配置 apiKey');

  const url = `${base}/chat/completions`;
  const body = buildChatBody(cfg, messages, tools);

  const res = await fetchChatWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
    signal, // 交给 retry 内部做每次尝试的超时
  }, cfg, emit);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 429) throw new Error('上游限流，已重试仍失败，请稍后再试');
    if (res.status === 401) throw new Error('API Key 无效或已过期');
    throw new Error(`API ${res.status}: ${text.slice(0, 400)}`);
  }
  if (!res.body) throw new Error('上游未返回流');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let content = '';
  let finishReason = '';
  const toolMap = new Map();
  let thinkChars = 0;
  let lastHeartbeat = Date.now();
  // max/xhigh 推理时，上游可能长时间只出 reasoning 或整段缓冲，idle 放宽
  const effort = String(cfg.reasoningEffort || 'off').toLowerCase();
  const idleFloor = (effort === 'max' || effort === 'xhigh') ? 240 : 45;
  const idleSec = Math.max(idleFloor, Number(cfg.apiTimeoutSec) || 180);

  const handleLine = (line) => {
    const t = line.trim();
    if (!t.startsWith('data:')) return;
    const payload = t.slice(5).trim();
    if (payload === '[DONE]') return;
    let json;
    try { json = JSON.parse(payload); } catch { return; }
    if (json.choices?.[0]?.finish_reason) finishReason = json.choices[0].finish_reason;
    const delta = json.choices?.[0]?.delta;
    if (!delta) return;
    const think = delta.reasoning_content || delta.reasoning;
    if (think) {
      thinkChars += think.length;
      emit({ k: 'think_delta', text: think });
      const now = Date.now();
      if (now - lastHeartbeat > 15000) {
        lastHeartbeat = now;
        emit({
          k: 'status',
          text: `思考中…（约 ${Math.round(thinkChars / 1000)}k 字，有数据不会超时）`,
        });
      }
    }
    if (delta.content) {
      content += delta.content;
      emit({ k: 'say_delta', text: delta.content });
    }
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        if (!toolMap.has(idx)) {
          toolMap.set(idx, { id: tc.id || `call_${idx}_${randomUUID()}`, name: '', args: '' });
        }
        const slot = toolMap.get(idx);
        if (tc.id) slot.id = tc.id;
        if (tc.function?.name) slot.name += tc.function.name;
        if (tc.function?.arguments) slot.args += tc.function.arguments;
      }
    }
  };

  try {
    await readStreamWithIdleTimeout(reader, (value) => {
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n');
      buf = parts.pop() || '';
      for (const line of parts) handleLine(line);
    }, idleSec, signal, emit);
  } catch (e) {
    const msg = String(e?.message || e);
    const gotAnything = Boolean(content || toolMap.size);
    // 半路断了：有正文/工具就尽量继续；只有思考也要明确告诉用户
    if (/idle timeout|network|terminated|aborted|socket|ECONNRESET|UND_ERR|无新数据/i.test(msg)) {
      if (gotAnything) {
        emit({ k: 'status', text: '上游中途断开，使用已收到的部分继续…' });
      } else {
        emit({
          k: 'error',
          text: `上游在思考阶段断开（${msg.slice(0, 80)}）。已保留思考。可发送「继续写文件」，并把推理强度调到 high。`,
        });
        emit({ k: 'think_keep' });
        throw new Error(msg);
      }
    } else {
      throw e;
    }
  }

  // 收尾：处理缓冲区残留
  if (buf.trim()) {
    for (const line of buf.split('\n')) handleLine(line);
  }

  const toolCalls = [...toolMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => ({
      id: v.id,
      name: v.name || 'tool',
      args: v.args || '{}',
      // 参数 JSON 明显不完整（被 max_tokens 截断）时标记
      truncated: finishReason === 'length' && v.args && !v.args.trim().endsWith('}'),
    }));

  if (finishReason === 'length') {
    emit({ k: 'status', text: '输出被 max_tokens 截断，正在尽量恢复…' });
  }

  return { content, toolCalls, finishReason };
}

/**
 * 自动提炼制作者事实记忆（Mem0 风格：多条 add-only facts）
 * 失败静默，不打断主流程
 */
async function autoSummarizeMemory(chat, cfg, emit) {
  try {
    if (cfg.autoMemory === false) return;
    const turns = (chat.messages || []).filter((m) => m.role === 'user' || m.role === 'assistant');
    if (turns.length < 2) return;

    const recent = turns.slice(-12).map((m) => {
      const text = String(m.content || '').replace(/\s+/g, ' ').slice(0, 350);
      return `${m.role === 'user' ? '用户' : '助手'}: ${text}`;
    }).join('\n');

    emit?.({ k: 'memory_status', text: '正在提炼制作记忆…' });

    // 太短的轮次不提炼，避免每轮都多一次 LLM 往返
    const userChars = turns.filter((m) => m.role === 'user')
      .reduce((n, m) => n + String(m.content || '').length, 0);
    if (userChars < 40 && turns.length < 4) return;

    const raw = await callChatCompletionsOnce(cfg, [
      {
        role: 'system',
        content: `你是记忆整理器。从对话里提炼「可复用、可检索」的制作者事实，只保留有把握的。
只输出 JSON 数组，不要围栏：
[
  { "text": "一条事实，40字内", "kind": "project|pref|style|avoid|fact", "tags": ["可选标签"] }
]
kind 含义：
- project：版本/加载器/包名/在做什么模组
- pref：明确偏好（命名、目录、库）
- style：代码/回复风格
- avoid：明确不要做的事
- fact：其它稳定事实
最多 5 条；没有值得记的就输出 []。不要编造。`,
      },
      { role: 'user', content: recent },
    ], { temperature: 0.2, maxTokens: 800 });

    const items = parseFactsJson(raw);
    if (!items.length) return;
    const added = addFacts(items, 'auto');
    if (added.length) {
      emit?.({ k: 'memory_updated', count: added.length, added: added.map((f) => f.text) });
    }
  } catch {
    /* 记忆失败不影响对话 */
  }
}

const MAX_ROUNDS = 12;

async function runAgent(chat, emit) {
  const cfg = loadConfig();
  const project = chat.project || 'default';
  ensureProject(project);
  const ac = new AbortController();
  liveRuns.set(chat.id, ac);
  chat.busy = true;
  saveChat(chat);
  // 本次新增的 assistant 字符数：本轮开始前的历史长度，留给 finally 算差值
  const baselineAsst = chat.messages
    .filter((m) => m.role === 'assistant')
    .reduce((sum, m) => sum + String(m.content || '').length, 0);

  const messages = toApiMessages(chat, cfg);
  let liveNode = false; // 是否已有流式气泡

  try {
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      if (ac.signal.aborted) {
        emit({ k: 'error', text: '已手动停止' });
        break;
      }
      emit({ k: 'status', text: round === 0 ? '正在思考…' : `工具执行后继续（第 ${round + 1} 轮）` });

      const { content, toolCalls, finishReason } = await callChatStream(
        cfg, messages, TOOLS, ac.signal, emit,
      );

      // 流式正文：有 delta 时前端已有气泡，这里发 say_settled 收口
      if (content) {
        emit({ k: 'say_settled', text: content });
        liveNode = false;
      }

      // 只有思考、没有正文也没有工具 → 必须明确报错，不能静默结束
      if (!content && !toolCalls.length) {
        if (finishReason === 'length') {
          emit({
            k: 'error',
            text: '本轮思考太多，被 max_tokens 截断，没有正文也没有写文件。请把推理强度改为 high，然后发送「继续写文件」。',
          });
        } else {
          emit({
            k: 'error',
            text: '本轮只有思考、没有输出正文或工具调用，已停止。请发送「继续写文件」，或把推理强度调到 high 再试。',
          });
        }
        emit({ k: 'say_settle_cancel' });
        emit({ k: 'think_keep' });
        chat.messages.push({
          role: 'assistant',
          content: finishReason === 'length'
            ? '出错了：思考被 max_tokens 截断，本轮未写文件'
            : '出错了：本轮只有思考，没有正文或工具',
          at: Date.now(),
        });
        break;
      }

      emit({
        k: 'step',
        step: {
          round,
          content,
          toolCalls: toolCalls.map((t) => ({ id: t.id, name: t.name, args: t.args })),
        },
      });

      if (content || toolCalls.length) {
        const stored = { role: 'assistant', content: content || null, at: Date.now() };
        if (toolCalls.length) {
          stored.tool_calls = toolCalls.map((t) => ({
            id: t.id, name: t.name, args: t.args,
          }));
        }
        chat.messages.push(stored);

        const apiMsg = { role: 'assistant', content: content || null };
        if (toolCalls.length) apiMsg.tool_calls = toolCalls.map((t) => ({
          id: t.id,
          type: 'function',
          function: { name: t.name, arguments: t.args },
        }));
        messages.push(apiMsg);
      }

      if (!toolCalls.length) break;

      for (const tc of toolCalls) {
        if (ac.signal.aborted) break;
        let args = {};
        let parseErr = '';
        try {
          args = JSON.parse(tc.args || '{}');
        } catch {
          // 截断/畸形参数：尽量抠 JSON，仍失败则把错误喂回模型让它重试
          args = extractJsonObject(tc.args) || {};
          if (!args || !Object.keys(args).length) parseErr = '工具参数 JSON 不完整';
        }
        if (tc.truncated && !parseErr) parseErr = '工具参数可能被截断';

        emit({ k: 'tool', id: tc.id, name: tc.name, brief: args.path || args.task || (parseErr || '') });

        let result;
        if (parseErr && tc.name === 'write_file' && !args.path) {
          result = {
            ok: false,
            out: `${parseErr}。请重新调用 write_file；若文件很长，请拆成多次 write_file（先写骨架再补全），并确保 arguments 是完整 JSON。`,
          };
        } else {
          result = await execTool(tc.name, args, project, emit);
        }
        emit({ k: 'tool_done', id: tc.id, ok: result.ok, out: result.out.slice(0, 4000) });
        const toolText = result.ok ? result.out : `错误：${result.out}`;
        chat.messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          name: tc.name,
          content: trimForStore(toolText),
          at: Date.now(),
        });
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: toolText.slice(0, 12000),
        });
      }
      saveChat(chat);
    }
  } catch (e) {
    if (ac.signal.aborted || e?.name === 'AbortError') {
      emit({ k: 'error', text: '已手动停止' });
      emit({ k: 'say_settle_cancel' });
    } else {
      emit({ k: 'error', text: String(e.message || e) });
      // 失败时保留思考框，不要清空（用户反馈限流后思考全没了）
      emit({ k: 'say_settle_cancel' });
      emit({ k: 'think_keep' });
      chat.messages.push({
        role: 'assistant',
        content: `出错了：${e.message || e}`,
        at: Date.now(),
      });
    }
  } finally {
    liveRuns.delete(chat.id);
    chat.busy = false;
    chat.updatedAt = Date.now();
    saveChat(chat);
    // 这一轮写进工程的内容总长，当作输出量记一笔
    const nowAsst = chat.messages
      .filter((m) => m.role === 'assistant')
      .reduce((sum, m) => sum + String(m.content || '').length, 0);
    bumpUsage(Math.max(0, nowAsst - baselineAsst));
    emit({ k: 'run_end' });
    emit({ k: 'files', files: await listProjectFiles(project), project });
    // 收尾后再总结记忆；用 memory_status，前端不会再把界面打回「停止」
    autoSummarizeMemory(chat, cfg, emit).catch(() => {});
  }
}

/* ---------------- HTTP helpers ---------------- */
function json(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 8_000_000) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

function sseOpen(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': ok\n\n');
}

function sseSend(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

/* ---------------- 本机用量统计 ----------------
 * 本地版没有积分，但主人还是想知道自己到底跑了多少次、花了多少字。
 * 只记条数和输出字节，不记内容。 */
const USAGE_PATH = path.join(ROOT, 'usage.json');

function loadUsage() {
  try {
    const raw = fs.readFileSync(USAGE_PATH, 'utf8').replace(/^﻿/, '');
    return { requests: 0, bytes: 0, since: Date.now(), ...JSON.parse(raw) };
  } catch {
    return { requests: 0, bytes: 0, since: Date.now() };
  }
}

function bumpUsage(bytes) {
  const usage = loadUsage();
  usage.requests = Number(usage.requests || 0) + 1;
  usage.bytes = Number(usage.bytes || 0) + (Number(bytes) || 0);
  try {
    const tmp = `${USAGE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(usage, null, 2), 'utf8');
    fs.renameSync(tmp, USAGE_PATH);
  } catch { /* 记不下来也不影响主流程 */ }
  return usage;
}

/** 本机有没有能用的 gradle（不看具体工程，只看机器） */
function detectSystemGradle() {
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'gradle.bat' : 'gradle';
  return new Promise((resolve) => {
    let child;
    try {
      // Windows 上 gradle 是 .bat，spawn 必须走 shell，否则 EINVAL
      child = spawn(cmd, ['-v'], { windowsHide: true, shell: isWin });
    } catch {
      resolve({ ok: false, name: '' });
      return;
    }
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk.toString(); });
    child.stderr.on('data', (chunk) => { out += chunk.toString(); });
    child.on('error', () => resolve({ ok: false, name: '' }));
    child.on('close', (code) => {
      if (code !== 0) {
        resolve({ ok: false, name: '' });
        return;
      }
      const line = (out.match(/Gradle\s+([\d.]+)/) || [])[1] || '';
      resolve({ ok: true, name: line ? `gradle ${line}` : 'gradle' });
    });
    setTimeout(() => {
      try { child.kill(); } catch { /* 已经退出了 */ }
    }, 8000);
  });
}

/** 工程里已经带了 gradlew 也算「能编译」 */
function anyProjectHasWrapper() {
  try {
    if (!fs.existsSync(PROJECTS)) return false;
    return fs.readdirSync(PROJECTS).some((name) => {
      const dir = path.join(PROJECTS, name);
      return fs.existsSync(path.join(dir, 'gradlew'))
        || fs.existsSync(path.join(dir, 'gradlew.bat'));
    });
  } catch {
    return false;
  }
}

/* ---------------- 残留的编译进程 ----------------
 * Gradle daemon / 反编译进程在 JVM 崩掉时不会自己退出，会一直挂着几百 MB
 * 到几 GB 内存（实测撞见过一个占 4.4 GB 的），下次编译就没内存了。
 * 这里只负责列出来，杀不杀由用户决定。 */
function staleJavaProcesses() {
  if (process.platform !== 'win32') return [];
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq java.exe" /FO CSV /NH', {
      encoding: 'utf8',
      timeout: 10000,
      windowsHide: true,
    });
    return out.trim().split('\n')
      .filter((line) => line.trim())
      .map((line) => {
        const cols = line.split('","');
        const pid = String(cols[1] || '').replace(/"/g, '').trim();
        const memKb = Number(String(cols[4] || '').replace(/[^0-9]/g, '')) || 0;
        return { pid, memKb };
      })
      .filter((p) => p.pid && p.memKb > 200 * 1024); // 只看超过 200MB 的
  } catch {
    return [];
  }
}

/* ---------------- JDK 检测 ----------------
 * NeoForge 1.21 要 JDK 21。但机器上 PATH 里的 java 未必是 21
 * （实测主人这台 PATH 是 17，jdk-21 其实装在 Program Files 里，只是没进 PATH），
 * 所以要主动去常见安装位置翻一遍，编译时把 JAVA_HOME 指过去。 */
const JDK_BASES = [
  'C:\\Program Files\\Java',
  'C:\\Program Files\\Eclipse Adoptium',
  'C:\\Program Files\\Microsoft',
  'C:\\Program Files\\Amazon Corretto',
  'C:\\Program Files\\Zulu',
  'C:\\Program Files\\BellSoft',
];

function javaMajorVersion(javaCmd) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(javaCmd, ['-version'], { windowsHide: true });
    } catch {
      resolve(0);
      return;
    }
    let out = '';
    child.stdout.on('data', (c) => { out += c.toString(); });
    child.stderr.on('data', (c) => { out += c.toString(); });
    child.on('error', () => resolve(0));
    child.on('close', () => {
      const m = out.match(/version "(\d+)/);
      resolve(m ? Number(m[1]) : 0);
    });
    setTimeout(() => { try { child.kill(); } catch { /* 已退出 */ } }, 8000);
  });
}

/** 找 JDK 21：环境变量 → 常见安装目录 → PATH 里的 java */
async function detectJdk21() {
  const exe = process.platform === 'win32' ? 'java.exe' : 'java';
  const candidates = [];

  if (process.env.JAVA_HOME) candidates.push(process.env.JAVA_HOME);
  for (const base of JDK_BASES) {
    for (const dir of await readdirSafe(base)) {
      if (/jdk-?21/i.test(dir)) candidates.push(path.join(base, dir));
    }
  }

  for (const home of candidates) {
    const java = path.join(home, 'bin', exe);
    if (!fs.existsSync(java)) continue;
    if (await javaMajorVersion(java) === 21) return { ok: true, home, java, version: 21 };
  }

  // PATH 里的兜底
  const pathVer = await javaMajorVersion('java');
  if (pathVer === 21) return { ok: true, home: process.env.JAVA_HOME || '', java: 'java', version: 21 };
  return { ok: false, version: pathVer, tried: candidates.slice(0, 6) };
}

/* ---------------- 准备构建环境 ----------------
 * 工程里没有 gradlew 时，从 Gradle 官方仓库把 wrapper 拿下来装上。
 * 只需要一个 43KB 的 jar + 几个脚本，之后 gradlew 自己会去下 Gradle 发行版。 */
const WRAPPER_URL = 'https://raw.githubusercontent.com/gradle/gradle/v8.10.0/gradle/wrapper/gradle-wrapper.jar';

const GRADLEW_SH = `#!/bin/sh
# Gradle wrapper —— 由 automods-lite 自动放置
DIR=\$(cd "\$(dirname "\$0")" && pwd)
APP_HOME=\$DIR
CLASSPATH=\$APP_HOME/gradle/wrapper/gradle-wrapper.jar
exec java -classpath "\$CLASSPATH" org.gradle.wrapper.GradleWrapperMain "\$@"
`;

const GRADLEW_BAT = `@rem Gradle wrapper —— 由 automods-lite 自动放置
@echo off
setlocal
set DIRNAME=%~dp0
set APP_HOME=%DIRNAME%
set CLASSPATH=%APP_HOME%\\gradle\\wrapper\\gradle-wrapper.jar
"%JAVA_HOME%\\bin\\java.exe" -classpath "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain %*
set EXIT_CODE=%ERRORLEVEL%
endlocal & exit /b %EXIT_CODE%
`;
/* 注意最后那行：endlocal 会把 ERRORLEVEL 抹掉，必须先把退出码存下来再
 * endlocal & exit /b，否则 gradle 报 BUILD FAILED 时 bat 却返回 0，
 * 上层（runGradle 按 code === 0 判定）会把失败当成成功。 */

async function downloadWrapperJar(dest) {
  const res = await fetch(WRAPPER_URL, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) throw new Error(`下载 gradle-wrapper.jar 失败（HTTP ${res.status}）`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 10000 || buf[0] !== 0x50 || buf[1] !== 0x4b) {
    throw new Error('下载到的不是有效的 jar');
  }
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  await fsp.writeFile(dest, buf);
  return buf.length;
}

/* NeoForge 版本号要去 maven 查。模型经常编一个不存在的 ——
 * 实测它给 1.21.1 写的是 `21.1.0`，而 maven 上这个系列是 `21.1.250`
 * 这种带 build 号的，21.1.0 直接 404，编译必然失败。 */
const NEOFORGE_METADATA = 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml';

async function neoVersionExists(version) {
  try {
    /* 用 GET 不用 HEAD：maven.neoforged.net 对 HEAD 不返回 200，
     * 会把存在说成不存在（实测 21.1.250 明明有，却被判成"不存在"，
     * 于是每跑一次 setup 就把版本号"改成"同一个值，看着很怪）。
     * pom 只有几 KB，直接 GET 不心疼。 */
    const res = await fetch(
      `https://maven.neoforged.net/releases/net/neoforged/neoforge/${version}/neoforge-${version}.pom`,
      { signal: AbortSignal.timeout(20000) },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** 取某个系列（如 21.1）里最大的版本号 */
async function latestNeoForgeVersion(series) {
  const res = await fetch(NEOFORGE_METADATA, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`查 NeoForge 版本表失败（HTTP ${res.status}）`);
  const xml = await res.text();
  const all = [...xml.matchAll(/<version>([\d.]+)<\/version>/g)].map((m) => m[1]);
  const hit = all.filter((v) => v.startsWith(`${series}.`));
  if (!hit.length) return '';
  hit.sort((a, b) => {
    const pa = a.split('.').map(Number);
    const pb = b.split('.').map(Number);
    return (pa[0] - pb[0]) || (pa[1] - pb[1]) || (pa[2] - pb[2]);
  });
  return hit[hit.length - 1];
}

/** 给工程装 gradlew；已存在就跳过 */
async function setupBuildEnv(root, cfg) {
  const steps = [];

  // 1) JDK 21
  const jdk = await detectJdk21();
  steps.push(jdk.ok
    ? { ok: true, text: `找到 JDK 21：${jdk.home || 'PATH 里的 java'}` }
    : { ok: false, text: `没找到 JDK 21（PATH 里的 java 是 ${jdk.version || '未知'} 版）。NeoForge 1.21 必须要 21。` });

  // 2) wrapper
  const bat = path.join(root, 'gradlew.bat');
  const sh = path.join(root, 'gradlew');
  const jar = path.join(root, 'gradle', 'wrapper', 'gradle-wrapper.jar');
  const props = path.join(root, 'gradle', 'wrapper', 'gradle-wrapper.properties');

  const batText = fs.existsSync(bat) ? (await readTextSafe(bat)) || '' : '';
  const isMine = batText.includes('automods-lite'); // 之前自动放的（可能有旧版要更新）

  if (fs.existsSync(bat) && fs.existsSync(jar) && !isMine) {
    steps.push({ ok: true, text: '工程里已经有 gradlew（你自己放的），跳过' });
  } else {
    try {
      if (!fs.existsSync(jar)) {
        const bytes = await downloadWrapperJar(jar);
        steps.push({ ok: true, text: `下载 gradle-wrapper.jar（${(bytes / 1024).toFixed(0)} KB）` });
      }
      // 自己放的 bat 要能更新（旧版忘了 exit /b，失败会被当成成功）
      if (!fs.existsSync(bat) || isMine) await fsp.writeFile(bat, GRADLEW_BAT, 'utf8');
      if (!fs.existsSync(sh)) {
        await fsp.writeFile(sh, GRADLEW_SH, 'utf8');
        try { await fsp.chmod(sh, 0o755); } catch { /* Windows 上不重要 */ }
      }
      if (!fs.existsSync(props)) {
        await fsp.writeFile(props, [
          'distributionBase=GRADLE_USER_HOME',
          'distributionPath=wrapper/dists',
          'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.10-bin.zip',
          'networkTimeout=10000',
          'validateDistributionUrl=true',
          'zipStoreBase=GRADLE_USER_HOME',
          'zipStorePath=wrapper/dists',
          '',
        ].join('\n'), 'utf8');
      }
      steps.push({ ok: true, text: '装好 gradlew（第一次编译它会自己下 Gradle 8.10，约 130MB）' });
    } catch (e) {
      steps.push({ ok: false, text: `装 wrapper 失败：${e.message || e}` });
    }
  }

  // 3) gradle.properties：检查 neo_version 是不是真存在
  const gp = path.join(root, 'gradle.properties');
  if (!fs.existsSync(gp)) {
    steps.push({ ok: false, text: '工程里没有 gradle.properties，编译会缺 mod_id / neo_version' });
  } else {
    const text = (await readTextSafe(gp)) || '';
    const cur = (text.match(/neo_version\s*=\s*(\S+)/) || [])[1];
    if (!cur) {
      steps.push({ ok: false, text: 'gradle.properties 里缺 neo_version，NeoForge 插件会解析失败' });
    } else if (await neoVersionExists(cur)) {
      steps.push({ ok: true, text: `neo_version=${cur}（maven 上有这个版本）` });
    } else {
      // 版本是编的，从 maven 找同系列最新的替上
      const series = cur.split('.').slice(0, 2).join('.');
      try {
        const latest = await latestNeoForgeVersion(series);
        if (latest) {
          await fsp.writeFile(gp, text.replace(/neo_version\s*=\s*\S+/, `neo_version=${latest}`), 'utf8');
          steps.push({ ok: true, text: `neo_version 从 ${cur} 改成 ${latest}（${cur} 在 maven 上不存在，${series} 系列最新是 ${latest}）` });
        } else {
          steps.push({ ok: false, text: `neo_version=${cur} 在 maven 上找不到，也没查到 ${series} 系列的可选版本` });
        }
      } catch (e) {
        steps.push({ ok: false, text: `校正 neo_version 失败：${e.message || e}` });
      }
    }

    /* 内存：NeoForge 第一次编译要反编译整个 Minecraft，默认 2G 堆会直接
     * 把 JVM 撑崩（实测 hs_err 里就是 "insufficient memory ... G1 virtual space"）。
     * 3G 堆 + 1G metaspace 是这台 16G 机器上比较稳的档位。 */
    const text2 = (await readTextSafe(gp)) || '';
    const jvmLine = text2.match(/org\.gradle\.jvmargs\s*=\s*(.*)/)?.[1] || '';
    const heapMb = Number(jvmLine.match(/-Xmx(\d+)([GgMm])/)?.[1]
      ? Number(jvmLine.match(/-Xmx(\d+)/)[1]) * (/[Gg]/.test(jvmLine) ? 1024 : 1)
      : 0);
    if (heapMb < 3072) {
      const want = 'org.gradle.jvmargs=-Xmx3G -XX:MaxMetaspaceSize=1G';
      const next = /org\.gradle\.jvmargs\s*=/.test(text2)
        ? text2.replace(/org\.gradle\.jvmargs\s*=.*/, want)
        : `${want}\n${text2}`;
      await fsp.writeFile(gp, next, 'utf8');
      steps.push({
        ok: true,
        text: heapMb
          ? `把 Gradle 堆从 ${heapMb}M 提到 3G（反编译 Minecraft 很吃内存，2G 会崩）`
          : '加上 Gradle 内存设置（-Xmx3G，反编译 Minecraft 需要）',
      });
    } else {
      steps.push({ ok: true, text: `Gradle 堆 ${heapMb}M，够用` });
    }
  }

  // 4) 顺手看一眼当前可用内存
  const freeGb = os.freemem() / 1024 / 1024 / 1024;
  if (freeGb < 6) {
    const stale = staleJavaProcesses();
    const staleText = stale.length
      ? `；另有 ${stale.length} 个 java 进程占着 `
        + `${(stale.reduce((s, p) => s + p.memKb, 0) / 1024 / 1024).toFixed(1)} GB`
        + `（PID ${stale.map((p) => p.pid).join(', ')}，多半是上次编译崩溃残留）`
      : '';
    steps.push({
      ok: false,
      text: `当前只剩 ${freeGb.toFixed(1)} GB 可用内存${staleText}。`
        + '反编译 Minecraft 至少要 4-5 GB，建议先关掉浏览器等占内存的程序再编译。',
    });
  }

  return { steps, jdk };
}

async function serveStatic(req, res, urlPath) {
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  rel = decodeURIComponent(rel.split('?')[0]);
  if (rel.includes('..')) {
    res.writeHead(400);
    res.end('bad path');
    return;
  }
  const abs = path.join(PUBLIC, rel);
  if (!abs.startsWith(PUBLIC)) {
    res.writeHead(400);
    res.end('bad path');
    return;
  }
  try {
    const data = await fsp.readFile(abs);
    const ext = path.extname(abs).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}

function newChat(title) {
  const id = randomUUID();
  return {
    id,
    title: title || '新对话',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    busy: false,
    project: `p_${id.slice(0, 8)}`,
    messages: [],
    archived: false,
  };
}

/* ---------------- router ---------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const p = url.pathname;

  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (p === '/api/health') {
      json(res, 200, { ok: true, workspace: WORKSPACE, version: LOCAL_VERSION });
      return;
    }

    /** 本机环境：给启动页那张「本机就绪」卡用 */
    if (p === '/api/env' && req.method === 'GET') {
      const cfg = loadConfig();
      const sys = await detectSystemGradle();
      const wrapper = anyProjectHasWrapper();
      const ok = sys.ok || Boolean(cfg.gradleCmd) || wrapper;
      json(res, 200, {
        platform: process.platform,
        node: process.version,
        workspace: WORKSPACE,
        gradle: {
          ok,
          name: sys.name || (cfg.gradleCmd ? '设置里指定的 gradle' : '工程自带的 gradlew'),
          system: sys.ok,
          wrapper,
        },
      });
      return;
    }

    /** 本机用量：顶栏那颗「积分」在本地版显示的就是这个 */
    if (p === '/api/usage' && req.method === 'GET') {
      json(res, 200, loadUsage());
      return;
    }

    /** 上下文用量详情：弹窗里那张按类拆分 */
    if (p === '/api/context' && req.method === 'GET') {
      const chatId = url.searchParams.get('chatId');
      if (!chatId) return json(res, 400, { error: '缺 chatId' });
      const chat = loadChat(chatId);
      if (!chat) return json(res, 404, { error: 'chat not found' });
      json(res, 200, buildContextReport(chat, loadConfig()));
      return;
    }

    if (p === '/api/memory' && req.method === 'GET') {
      const q = url.searchParams.get('q') || '';
      const facts = q ? searchFacts(q, 20) : listFacts();
      json(res, 200, { facts, total: listFacts().length });
      return;
    }

    if (p === '/api/memory' && req.method === 'POST') {
      const body = await readJson(req);
      // 兼容旧表单：notes/likes/avoid → 三条 fact
      if (body.notes !== undefined || body.likes !== undefined || body.avoid !== undefined) {
        const out = [];
        if (body.notes) out.push(addFact(body.notes, 'project', ['manual'], 'manual'));
        if (body.likes) out.push(addFact(body.likes, 'style', ['manual'], 'manual'));
        if (body.avoid) out.push(addFact(body.avoid, 'avoid', ['manual'], 'manual'));
        json(res, 200, { facts: listFacts(), added: out.filter(Boolean).length });
        return;
      }
      if (body.text) {
        const f = addFact(body.text, body.kind || 'fact', body.tags || [], 'manual');
        json(res, 200, { fact: f, facts: listFacts() });
        return;
      }
      json(res, 400, { error: '缺少 text 或 notes/likes/avoid' });
      return;
    }

    if (p.startsWith('/api/memory/') && req.method === 'DELETE') {
      const id = path.basename(p);
      const ok = deleteFact(id);
      json(res, 200, { ok, facts: listFacts() });
      return;
    }

    if (p === '/api/memory' && req.method === 'DELETE') {
      clearFacts();
      json(res, 200, { ok: true, facts: [] });
      return;
    }

    /** AI 构建：把一句话拆成可选创意组 */
    if (p === '/api/plan' && req.method === 'POST') {
      const cfg = loadConfig();
      const body = await readJson(req);
      const idea = String(body.text || '').trim();
      if (!idea) return json(res, 400, { error: 'text 为空' });
      try {
        const messages = [
          {
            role: 'system',
            content: `你是 Minecraft 模组玩法策划。把用户想法拆成 3～5 个「决策组」，每组恰好 3 个可选方案。
严格只输出一个 JSON 对象，不要 markdown，不要解释：
{"title":"简短标题","summary":"一句话","groups":[{"id":"g1","title":"组名","desc":"定什么","options":[{"id":"o1","label":"方案名","detail":"20字内","recommended":true},{"id":"o2","label":"…","detail":"…"},{"id":"o3","label":"…","detail":"…"}]}]}
用简体中文。方案具体可实现。label/detail 必须是字符串。`,
          },
          { role: 'user', content: `MC ${cfg.mcVersion} · ${cfg.loader || 'neoforge'} · ${idea}` },
        ];

        let plan = null;
        let raw = '';
        for (let attempt = 0; attempt < 3 && !plan; attempt += 1) {
          raw = await callChatCompletionsOnce(cfg, messages, {
            temperature: attempt === 0 ? 0.3 : 0.1,
            maxTokens: 1600,
            jsonMode: attempt > 0,
            timeoutMs: 90000,
          });
          plan = normalizePlan(extractJsonObject(raw));
        }
        if (!plan) {
          // 本地兜底：用原话组一个最小规划，保证流程不断
          plan = {
            title: idea.slice(0, 24) || '模组规划',
            summary: idea,
            groups: [
              {
                id: 'g1',
                title: '核心玩法',
                desc: '先定要做什么',
                options: [
                  { id: 'o1', label: '按原话实现', detail: idea.slice(0, 40), recommended: true },
                  { id: 'o2', label: '简化版', detail: '只做最小可运行子集' },
                  { id: 'o3', label: '增强版', detail: '补创造栏/语言/配方' },
                ],
              },
            ],
          };
        }
        json(res, 200, { original: idea, plan, rawPreview: raw.slice(0, 200) });
      } catch (e) {
        json(res, 502, { error: String(e.message || e) });
      }
      return;
    }

    /** 想法优化：把一句需求整理成更可执行的制作说明 */
    if (p === '/api/refine' && req.method === 'POST') {
      const cfg = loadConfig();
      const body = await readJson(req);
      const idea = String(body.text || '').trim();
      if (!idea) return json(res, 400, { error: 'text 为空' });
      try {
        const result = await callChatCompletionsOnce(cfg, [
          {
            role: 'system',
            content: `你是 Minecraft 模组需求整理助手。把用户一句话想法改成「可直接开工」的说明。
只输出整理后的需求本身，不要开场白。要求：
- 明确玩法/物品或方块行为
- 明确触发方式（右键/左键/tick/合成等）
- 有数值就写清数值（伤害、冷却、堆叠）
- 补上常见遗漏（创造栏、语言文件、模型/贴图、配方）
- 控制在 120 字以内，简体中文`,
          },
          { role: 'user', content: idea },
        ]);
        json(res, 200, { original: idea, refined: result || idea });
      } catch (e) {
        json(res, 502, { error: String(e.message || e), original: idea });
      }
      return;
    }

    if (p === '/api/models' && req.method === 'POST') {
      const cfg = loadConfig();
      const body = await readJson(req);
      const merged = { ...cfg, ...body };
      try {
        const models = await fetchModelList(merged);
        json(res, 200, { models, count: models.length });
      } catch (e) {
        json(res, 502, { error: String(e.message || e) });
      }
      return;
    }

    if (p === '/api/update/apply' && req.method === 'POST') {
      const cfg = loadConfig();
      const body = await readJson(req);
      const repo = String(body.repo || cfg.updateRepo || '').trim();
      try {
        const result = await applyGithubUpdate(repo, ROOT);
        json(res, result.ok ? 200 : 400, { ...result, local: LOCAL_VERSION, repo });
      } catch (e) {
        json(res, 500, { ok: false, message: String(e.message || e), local: LOCAL_VERSION, repo });
      }
      return;
    }

    if (p === '/api/update' && req.method === 'POST') {
      const cfg = loadConfig();
      const body = await readJson(req);
      const repo = String(body.repo || cfg.updateRepo || '').trim();
      if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
        json(res, 400, { error: '未配置 updateRepo（owner/repo）', local: LOCAL_VERSION });
        return;
      }
      const urls = [
        `https://raw.githubusercontent.com/${repo}/main/update.json`,
        `https://raw.githubusercontent.com/${repo}/master/update.json`,
      ];
      let remote = null;
      let used = '';
      for (const u of urls) {
        try {
          const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
          if (r.ok) {
            remote = await r.json();
            used = u;
            break;
          }
        } catch { /* try next */ }
      }
      if (!remote) {
        json(res, 502, { error: '拉取远程版本失败，检查仓库名或网络', local: LOCAL_VERSION, repo });
        return;
      }
      const remoteVer = String(remote.version || '0.0.0');
      const cmp = compareSemver(LOCAL_VERSION, remoteVer);
      json(res, 200, {
        local: LOCAL_VERSION,
        remote: remoteVer,
        updateAvailable: cmp < 0,
        notes: remote.notes || '',
        repo,
        source: used,
      });
      return;
    }

    /* ---- 学习 ---- */
    if (p === '/api/learn/tracks' && req.method === 'GET') {
      json(res, 200, { tracks: getTracks() });
      return;
    }

    if (p === '/api/learn/chapter' && req.method === 'GET') {
      const id = url.searchParams.get('id');
      const ch = getChapter(id);
      if (!ch) return json(res, 404, { error: '章节不存在' });
      json(res, 200, { chapter: ch });
      return;
    }

    if (p === '/api/learn/chapter' && req.method === 'DELETE') {
      const id = url.searchParams.get('id');
      const ch = getChapter(id);
      if (!ch) return json(res, 404, { error: 'not found' });
      if (!ch.custom) return json(res, 400, { error: '只能删除自定义章节' });
      const ok = deleteCustom(id);
      json(res, 200, { ok });
      return;
    }

    if (p === '/api/learn/ask' && req.method === 'POST') {
      const body = await readJson(req);
      await askAboutChapter(res, body, loadConfig, callChatStream);
      return;
    }

    if (p === '/api/learn/generate' && req.method === 'POST') {
      const body = await readJson(req);
      await generateChapter(res, body, loadConfig, callChatStream);
      return;
    }

    if (p === '/api/config' && req.method === 'GET') {
      json(res, 200, maskConfig(loadConfig()));
      return;
    }

    if (p === '/api/config' && req.method === 'POST') {
      const body = await readJson(req);
      const saved = saveConfig(body);
      json(res, 200, maskConfig(saved));
      return;
    }

    if (p === '/api/chats' && req.method === 'GET') {
      json(res, 200, { chats: listChats() });
      return;
    }

    if (p === '/api/chats' && req.method === 'POST') {
      const body = await readJson(req);
      const chat = newChat(body.title);
      ensureProject(chat.project);
      saveChat(chat);
      json(res, 200, { chat });
      return;
    }

    // 项目改名：本地版没有 mod 标识那回事，改的是侧栏里显示的名字
    if (p.match(/^\/api\/chats\/[^/]+\/rename$/) && req.method === 'POST') {
      const id = p.split('/')[3];
      const chat = loadChat(id);
      if (!chat) return json(res, 404, { error: 'not found' });
      const body = await readJson(req);
      const title = String(body.title || '').trim().slice(0, 40);
      if (!title) return json(res, 400, { error: '名字不能为空' });
      chat.title = title;
      chat.updatedAt = Date.now();
      saveChat(chat);
      json(res, 200, { ok: true, chat: { id: chat.id, title: chat.title } });
      return;
    }

    // 归档 / 恢复
    if (p.match(/^\/api\/chats\/[^/]+\/archive$/) && req.method === 'POST') {
      const id = p.split('/')[3];
      const chat = loadChat(id);
      if (!chat) return json(res, 404, { error: 'not found' });
      const body = await readJson(req);
      const archived = Boolean(body.archived);
      chat.archived = archived;
      chat.updatedAt = Date.now();
      saveChat(chat);
      json(res, 200, { ok: true, archived: chat.archived });
      return;
    }

    // 历史清理：keep 可选 turns（保留最近 N 轮 user+assistant；0/缺省=清空消息）
    if (p.match(/^\/api\/chats\/[^/]+\/clear$/) && req.method === 'POST') {
      const id = p.split('/')[3];
      const chat = loadChat(id);
      if (!chat) return json(res, 404, { error: 'not found' });
      if (chat.busy || liveRuns.has(id)) return json(res, 409, { error: '这一轮还在跑' });
      const body = await readJson(req);
      const keepTurns = Number(body.keepTurns);
      if (keepTurns > 0) {
        // 从后往前保留 keepTurns 个 user 消息及其后续
        const msgs = chat.messages || [];
        let users = 0;
        let start = msgs.length;
        for (let i = msgs.length - 1; i >= 0; i -= 1) {
          if (msgs[i].role === 'user') {
            users += 1;
            if (users > keepTurns) break;
          }
          start = i;
        }
        chat.messages = msgs.slice(start);
      } else {
        chat.messages = [];
      }
      chat.updatedAt = Date.now();
      saveChat(chat);
      json(res, 200, { ok: true, remaining: chat.messages.length });
      return;
    }

    // 删除对话并可选删除其工程目录
    if (p.startsWith('/api/chats/') && req.method === 'DELETE') {
      const parts = p.split('/');
      const id = parts[3];
      const purge = url.searchParams.get('purge') === '1';
      const chat = loadChat(id);
      if (chat && (chat.busy || liveRuns.has(id))) {
        return json(res, 409, { error: '这一轮还在跑，请先停止' });
      }
      try { fs.unlinkSync(chatPath(id)); } catch { /* ignore */ }
      if (purge && chat?.project) {
        const dir = projectDir(chat.project);
        if (dir && dir.startsWith(PROJECTS)) {
          try { await fsp.rm(dir, { recursive: true, force: true }); } catch { /* ignore */ }
        }
      }
      json(res, 200, { ok: true });
      return;
    }

    if (p.startsWith('/api/chats/') && req.method === 'GET') {
      const id = path.basename(p);
      const chat = loadChat(id);
      if (!chat) return json(res, 404, { error: 'not found' });
      json(res, 200, { chat });
      return;
    }

    if (p === '/api/chat' && req.method === 'POST') {
      const body = await readJson(req);
      let chat;
      if (body.chatId) {
        chat = loadChat(body.chatId);
        if (!chat) return json(res, 404, { error: '对话不存在' });
        if (chat.busy || liveRuns.has(chat.id)) return json(res, 409, { error: '这一轮还在跑' });
      } else {
        chat = newChat((body.text || '新对话').slice(0, 24));
        ensureProject(chat.project);
      }
      const text = String(body.text || '').trim();
      if (!text) return json(res, 400, { error: 'text 为空' });

      chat.messages.push({ role: 'user', content: text, at: Date.now() });
      chat.updatedAt = Date.now();
      if (chat.messages.filter((m) => m.role === 'user').length === 1) {
        chat.title = text.slice(0, 24);
      }
      chat.busy = true;
      saveChat(chat);

      sseOpen(res);
      sseSend(res, {
        k: 'chat',
        chatId: chat.id,
        title: chat.title,
        project: chat.project,
      });
      sseSend(res, { k: 'user_echo', text });

      const emit = (obj) => {
        try { sseSend(res, obj); } catch { /* client gone */ }
      };
      runAgent(chat, emit).catch((e) => {
        sseSend(res, { k: 'error', text: String(e.message || e) });
        sseSend(res, { k: 'run_end' });
      });
      return;
    }

    if (p === '/api/stop' && req.method === 'POST') {
      const body = await readJson(req);
      const id = body.chatId;
      if (!id) return json(res, 400, { error: '缺少 chatId' });
      const ac = liveRuns.get(id);
      if (ac) {
        ac.abort();
        json(res, 200, { ok: true, stopped: true });
      } else {
        const chat = loadChat(id);
        if (chat?.busy) {
          chat.busy = false;
          saveChat(chat);
        }
        json(res, 200, { ok: true, stopped: false });
      }
      return;
    }

    if (p === '/api/files' && req.method === 'GET') {
      const project = url.searchParams.get('project') || 'default';
      const files = await listProjectFiles(project);
      const releases = await listReleases(project);
      json(res, 200, { files, project, root: `workspace/projects/${project}`, releases });
      return;
    }

    /** 两个模型各自支持的分辨率，前端切模型时用它换下拉内容 */
    if (p === '/api/image/sizes' && req.method === 'GET') {
      json(res, 200, { models: IMAGE_SIZES });
      return;
    }

    /** 生图 / 图生图：save=1 直接落进工程 textures/<kind>/，否则只返回 base64 给前端预览 */
    if (p === '/api/image' && req.method === 'POST') {
      const cfg = loadConfig();
      const body = await readJson(req);
      const prompt = String(body.prompt || '').trim();
      if (!prompt) return json(res, 400, { error: '没写描述' });
      try {
        const shared = {
          prompt,
          size: body.size,
          model: body.model,
          watermark: body.watermark,
          outputFormat: body.outputFormat,
          responseFormat: body.responseFormat,
          promptExtend: body.promptExtend,
        };
        const buf = body.mode === 'edit'
          ? await generateImageEdit(cfg, { ...shared, imageUrl: body.imageUrl })
          : await generateImage(cfg, shared);
        if (body.save) {
          const saved = await saveTexture(
            body.project || 'default',
            body.kind === 'item' ? 'item' : 'block',
            body.name || 'texture',
            buf,
            body.scale !== undefined ? body.scale : cfg.imageScale,
          );
          json(res, 200, {
            ok: true,
            ...saved,
            b64: buf.toString('base64'),
            files: await listProjectFiles(body.project || 'default'),
          });
          return;
        }
        json(res, 200, { ok: true, b64: buf.toString('base64') });
      } catch (e) {
        json(res, 502, { error: String(e.message || e) });
      }
      return;
    }

    /** 预览台：扫工程的 lang/models/textures/recipes 凑出 items/blocks/recipes 给前端摆网格 */
    if (p === '/api/bench' && req.method === 'GET') {
      const project = url.searchParams.get('project') || 'default';
      const root = ensureProject(project);
      if (!root) return json(res, 400, { error: 'bad project' });
      try {
        const bench = await scanBench(root);
        json(res, 200, { project, ...bench });
      } catch (e) {
        json(res, 500, { error: String(e.message || e) });
      }
      return;
    }

    if (p === '/api/releases' && req.method === 'GET') {
      const project = url.searchParams.get('project') || 'default';
      json(res, 200, { releases: await listReleases(project), rev: readRevision(project), project });
      return;
    }

    if (p === '/api/build' && req.method === 'POST') {
      const body = await readJson(req);
      const project = body.project || 'default';
      const root = ensureProject(project);
      if (!root) return json(res, 400, { error: 'bad project' });
      const result = await runGradle(root, body.task || 'build', () => {});
      if (result.ok) return json(res, 200, result);
      /* 编译失败是「环境没配好」或「代码有问题」，不是服务器故障。
       * 返回 500 的话前端只会显示一句 HTTP 500，把真正的原因
       * （没找到 gradlew / 编译报错全文）全吞掉。 */
      json(res, 400, { ...result, error: result.out || '编译没通过' });
      return;
    }

    /** 一键准备构建环境：找 JDK 21 + 给工程装 gradlew */
    if (p === '/api/build/setup' && req.method === 'POST') {
      const body = await readJson(req);
      const project = body.project || 'default';
      const root = ensureProject(project);
      if (!root) return json(res, 400, { error: 'bad project' });
      try {
        const result = await setupBuildEnv(root, loadConfig());
        json(res, 200, { ok: result.steps.every((s) => s.ok), ...result });
      } catch (e) {
        json(res, 500, { error: String(e.message || e) });
      }
      return;
    }

    /** JDK / Gradle 体检，给前端显示 */
    if (p === '/api/build/doctor' && req.method === 'GET') {
      const jdk = await detectJdk21();
      const sys = await detectSystemGradle();
      json(res, 200, {
        jdk: { ok: jdk.ok, version: jdk.version, home: jdk.home || '' },
        gradle: sys,
        wrapperAny: anyProjectHasWrapper(),
      });
      return;
    }

    if (p === '/api/zip' && req.method === 'GET') {
      const project = url.searchParams.get('project') || 'default';
      const rel = url.searchParams.get('path') || '';
      try {
        const { zipPath, filename } = await zipProjectPath(project, rel);
        const data = await fsp.readFile(zipPath);
        res.writeHead(200, {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${filename}"`,
        });
        res.end(data);
        fsp.unlink(zipPath).catch(() => {});
      } catch (e) {
        json(res, 400, { error: String(e.message || e) });
      }
      return;
    }

    if (p === '/api/file' && req.method === 'GET') {
      const project = url.searchParams.get('project') || 'default';
      const rel = url.searchParams.get('path') || '';
      const root = ensureProject(project);
      if (!root) return json(res, 400, { error: 'bad project' });
      const abs = safeJoin(root, rel);
      if (!abs) return json(res, 400, { error: 'bad path' });
      try {
        const content = await fsp.readFile(abs, 'utf8');
        json(res, 200, { path: rel, content, project });
      } catch {
        json(res, 404, { error: 'not found' });
      }
      return;
    }

    if (p === '/api/file' && req.method === 'DELETE') {
      const body = await readJson(req);
      const root = ensureProject(body.project || 'default');
      if (!root) return json(res, 400, { error: 'bad project' });
      const abs = safeJoin(root, body.path);
      if (!abs) return json(res, 400, { error: 'bad path' });
      try {
        await fsp.unlink(abs);
        json(res, 200, { ok: true });
      } catch {
        json(res, 404, { error: 'not found' });
      }
      return;
    }

    // 下载：/dl/<project>/<path...>
    if (p.startsWith('/dl/')) {
      const rest = p.slice(4);
      const slash = rest.indexOf('/');
      if (slash < 0) {
        res.writeHead(400);
        res.end('bad path');
        return;
      }
      const project = rest.slice(0, slash);
      const rel = decodeURIComponent(rest.slice(slash + 1));
      const root = projectDir(project);
      const abs = root && safeJoin(root, rel);
      if (!abs) {
        res.writeHead(400);
        res.end('bad path');
        return;
      }
      try {
        const data = await fsp.readFile(abs);
        res.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${path.basename(abs)}"`,
        });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end('not found');
      }
      return;
    }

    if (p.startsWith('/api/')) {
      json(res, 404, { error: 'unknown api' });
      return;
    }

    await serveStatic(req, res, p);
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
});

/* 绑 0.0.0.0 是为了能发布到线上沙箱（反向代理要能从外部连进来）；
 * 只想本机用就设 HOST=127.0.0.1。 */
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  const shown = HOST === '0.0.0.0' ? '127.0.0.1' : HOST;
  console.log(`automods-lite v0.4 → http://${shown}:${PORT}`);
  console.log(`工程根: ${PROJECTS}`);
  console.log(`配置: ${CONFIG_PATH}${fs.existsSync(CONFIG_PATH) ? '' : '（可到页面设置里填写）'}`);
});
