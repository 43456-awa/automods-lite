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
import path from 'node:path';
import { spawn } from 'node:child_process';
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
  historyLimit: 36,
  apiTimeoutSec: 180,
  // 上游 429/5xx 最多重试几次
  apiRetries: 4,
  // 对话结束后自动总结制作者偏好到 memory.json
  autoMemory: true,
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

function toApiMessages(chat, cfg) {
  const src = chat.messages || [];
  const lastUser = [...src].reverse().find((m) => m.role === 'user')?.content || '';
  const out = [{ role: 'system', content: systemPrompt(cfg, chat.project || 'default', lastUser) }];
  const BUDGET = Math.max(8, Number(cfg.historyLimit) || 36);
  let start = Math.max(0, src.length - BUDGET);
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
8. 用户要求编译/构建时，调用 run_gradle（默认 build）。
9. 贴图 png 无法用工具生成，路径写好并告诉用户自己放文件。
10. 若 write_file 返回「参数 JSON 不完整」，立刻重试一次完整 JSON，不要改聊别的。
11. **思考/reasoning 必须全程用简体中文**，禁止用英文推理；正文回复也用简体中文。
12. 历史里标了「历史回执已压缩」的工具结果只是摘要，不是文件现状；改旧文件前先 read_file。

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

function runGradle(root, task, emit) {
  return new Promise((resolve) => {
    const cfg = loadConfig();
    const detected = detectGradleCmd(root, cfg);
    if (!detected) {
      resolve({
        ok: false,
        out: '未找到 gradlew，也未在设置里配置 gradleCmd。请把 NeoForge MDK 的 gradlew 拷进工程，或在设置填写本机 gradle 路径。',
      });
      return;
    }

    const timeoutMs = Math.max(30, Number(cfg.gradleTimeoutSec) || 180) * 1000;
    const args = [task];
    emit({ k: 'status', text: `Gradle ${task}…` });

    let child;
    try {
      child = spawn(detected.cmd, args, {
        cwd: root,
        env: { ...process.env, JAVA_HOME: process.env.JAVA_HOME },
        windowsHide: true,
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
      resolve({
        ok,
        out: (ok ? '构建成功\n' : `构建失败（exit ${code}）\n`) + tail(out, 8000),
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

  const max = Math.max(0, Number(cfg.apiRetries) || 4);
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

    const ra = Number(res.headers.get('Retry-After'));
    const wait = (ra > 0 ? ra * 1000 : Math.min(15000, 1200 * 2 ** attempt + Math.floor(Math.random() * 600)));
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
  const max = Math.max(0, Number(cfg.apiRetries) || 4);
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

    const ra = Number(res.headers.get('Retry-After'));
    const wait = (ra > 0 ? ra * 1000 : Math.min(15000, 1200 * 2 ** attempt + Math.floor(Math.random() * 600)));
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
  const cmd = process.platform === 'win32' ? 'gradle.bat' : 'gradle';
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, ['-v'], { windowsHide: true });
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
      json(res, result.ok ? 200 : 500, result);
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

server.listen(PORT, '127.0.0.1', () => {
  console.log(`automods-lite v0.2 → http://127.0.0.1:${PORT}`);
  console.log(`工程根: ${PROJECTS}`);
  console.log(`配置: ${CONFIG_PATH}${fs.existsSync(CONFIG_PATH) ? '' : '（可到页面设置里填写）'}`);
});
