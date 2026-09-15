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
  gradleCmd: '',
  gradleTimeoutSec: 180,
  // GitHub 更新源：owner/repo，例如 43456-awa/automods-lite
  updateRepo: '',
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
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(cfg) {
  const next = { ...loadConfig(), ...cfg };
  delete next.port;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function maskConfig(cfg) {
  const { apiKey, ...rest } = cfg;
  return {
    ...rest,
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

/* ---------------- MIME ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
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

function toPascal(id) {
  return String(id).split(/[_-]/).filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join('');
}

function systemPrompt(cfg, project) {
  return `你是「automods-lite」本地工作台的 NeoForge 开发助手。当前目标：
- Minecraft ${cfg.mcVersion}
- 加载器 NeoForge
- 模组 id：${cfg.modId}
- 工程名：${cfg.workspaceName}
- 本对话工程目录：workspace/projects/${project}/

规则：
1. 需要落盘的代码/JSON/资源，必须调用 write_file，不要只贴在对话里让用户复制。
2. 一次可以写多个文件。Java 包名与路径一致：src/main/java/...
3. 资源：src/main/resources/META-INF/neoforge.mods.toml、assets/${cfg.modId}/...、data/${cfg.modId}/...
4. 注册用 DeferredRegister + modEventBus；modId 全小写。
5. 回复用简体中文，短句说明你做了什么、下一步建议。
6. 不要编造未实现的 API；不确定时选 1.21.1 常见写法并说明。
7. 用户要求编译/构建时，调用 run_gradle（默认参数 build）。工程里需要有 gradlew 或用户已配置 gradleCmd。
8. 贴图 png 无法用工具生成，路径写好并告诉用户自己放文件。

标准目录：
src/main/java/com/example/${cfg.modId}/
  ${toPascal(cfg.modId)}Mod.java
  registry/ModItems.java
src/main/resources/META-INF/neoforge.mods.toml
src/main/resources/assets/${cfg.modId}/lang/zh_cn.json
src/main/resources/assets/${cfg.modId}/models/item/xxx.json
`;
}

function toApiMessages(chat, cfg) {
  const out = [{ role: 'system', content: systemPrompt(cfg, chat.project || 'default') }];
  const src = chat.messages || [];
  const BUDGET = 36;
  let start = Math.max(0, src.length - BUDGET);
  while (start > 0 && src[start]?.role === 'tool') start -= 1;

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
      out.push({ role: 'tool', tool_call_id: m.tool_call_id, content: m.content || '' });
    } else if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    }
  }
  return out;
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
export async function callChatStream(cfg, messages, tools, signal, emit) {
  const base = String(cfg.baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('未配置 baseUrl');
  if (!cfg.apiKey || cfg.apiKey.startsWith('sk-在这里')) throw new Error('未配置 apiKey');

  const url = `${base}/chat/completions`;
  const body = {
    model: cfg.model,
    messages,
    temperature: 0.4,
    tools,
    tool_choice: 'auto',
    stream: true,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 429) throw new Error('上游限流，请稍后再试');
    if (res.status === 401) throw new Error('API Key 无效或已过期');
    throw new Error(`API ${res.status}: ${text.slice(0, 400)}`);
  }
  if (!res.body) throw new Error('上游未返回流');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let content = '';
  /** @type {{id:string,name:string,args:string}[]} */
  const toolMap = new Map(); // index -> {id,name,args}

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n');
    buf = parts.pop() || '';
    for (const line of parts) {
      const t = line.trim();
      if (!t.startsWith('data:')) continue;
      const payload = t.slice(5).trim();
      if (payload === '[DONE]') continue;
      let json;
      try { json = JSON.parse(payload); } catch { continue; }
      const delta = json.choices?.[0]?.delta;
      if (!delta) continue;
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
    }
  }

  const toolCalls = [...toolMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => ({ id: v.id, name: v.name || 'tool', args: v.args || '{}' }));

  return { content, toolCalls };
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

  const messages = toApiMessages(chat, cfg);
  let liveNode = false; // 是否已有流式气泡

  try {
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      if (ac.signal.aborted) {
        emit({ k: 'error', text: '已手动停止' });
        break;
      }
      emit({ k: 'status', text: round === 0 ? '正在思考…' : `工具执行后继续（第 ${round + 1} 轮）` });

      const { content, toolCalls } = await callChatStream(
        cfg, messages, TOOLS, ac.signal, emit,
      );

      // 流式正文：有 delta 时前端已有气泡，这里发 say_settled 收口
      if (content) {
        emit({ k: 'say_settled', text: content });
        liveNode = false;
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
        try { args = JSON.parse(tc.args || '{}'); } catch { args = {}; }
        emit({ k: 'tool', id: tc.id, name: tc.name, brief: args.path || args.task || '' });
        const result = await execTool(tc.name, args, project, emit);
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
      emit({ k: 'say_settle_cancel' });
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
    emit({ k: 'run_end' });
    emit({ k: 'files', files: await listProjectFiles(project), project });
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
      json(res, 200, { files, project, root: `workspace/projects/${project}` });
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
