/**
 * 学习模块：内置轨道 + 自定义章节 + 章内提问 / 生成章节
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTENT = path.join(__dirname, 'content');
const CUSTOM_DIR = path.join(__dirname, 'chapters');

fs.mkdirSync(CUSTOM_DIR, { recursive: true });

function loadWindowExport(file, name) {
  const code = fs.readFileSync(file, 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox, { filename: file });
  return sandbox.window[name] || [];
}

function loadBuiltin() {
  const neoforge = loadWindowExport(path.join(CONTENT, 'neoforge-chapters.js'), 'NF_CHAPTERS');
  const java = loadWindowExport(path.join(CONTENT, 'java-chapters.js'), 'NF_JAVA_CHAPTERS');
  return { neoforge, java };
}

function listCustom() {
  try {
    return fs.readdirSync(CUSTOM_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          return JSON.parse(fs.readFileSync(path.join(CUSTOM_DIR, f), 'utf8'));
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  } catch {
    return [];
  }
}

function saveCustom(ch) {
  const id = ch.id || `c_${randomUUID().slice(0, 8)}`;
  const doc = { ...ch, id, custom: true, createdAt: ch.createdAt || Date.now() };
  fs.writeFileSync(path.join(CUSTOM_DIR, `${id}.json`), JSON.stringify(doc, null, 2), 'utf8');
  return doc;
}

export function deleteCustom(id) {
  const abs = path.join(CUSTOM_DIR, `${id}.json`);
  if (!abs.startsWith(CUSTOM_DIR)) return false;
  try {
    fs.unlinkSync(abs);
    return true;
  } catch {
    return false;
  }
}

function publicMeta(c, trackId) {
  return {
    id: c.id,
    title: c.title,
    short: c.short || c.title,
    lead: c.lead || '',
    tags: c.tags || [],
    track: trackId,
    custom: Boolean(c.custom),
  };
}

export function getTracks() {
  const { neoforge, java } = loadBuiltin();
  const custom = listCustom();
  return [
    {
      id: 'neoforge',
      title: 'NeoForge 模组',
      description: '环境、注册、资源、事件、配方',
      chapters: neoforge.map((c) => publicMeta(c, 'neoforge')),
    },
    {
      id: 'java',
      title: 'Java 基础',
      description: '写模组够用的 Java',
      chapters: java.map((c) => publicMeta(c, 'java')),
    },
    {
      id: 'custom',
      title: '自定义章节',
      description: '让 AI 按你的主题写一章',
      chapters: custom.map((c) => publicMeta(c, 'custom')),
    },
  ];
}

export function getChapter(id) {
  const { neoforge, java } = loadBuiltin();
  const all = [...neoforge, ...java, ...listCustom()];
  const found = all.find((c) => c.id === id);
  if (!found) return null;
  const track = neoforge.find((c) => c.id === id) ? 'neoforge'
    : java.find((c) => c.id === id) ? 'java' : 'custom';
  return { ...found, track };
}

function sseSend(res, obj) {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

function openSse(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(': ok\n\n');
}

/** 章内提问：带上章节正文作上下文 */
export async function askAboutChapter(res, { chapterId, question, history }, loadConfig, fetchChatStream) {
  const ch = getChapter(chapterId);
  if (!ch) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '章节不存在' }));
    return;
  }
  const cfg = loadConfig();
  if (!cfg.apiKey || cfg.apiKey.startsWith('sk-在这里')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '请先在设置里配置 API Key' }));
    return;
  }

  openSse(res);
  const emit = (obj) => { try { sseSend(res, obj); } catch { /* ignore */ } };

  const bodyText = String(ch.body || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 12000);
  const messages = [
    {
      role: 'system',
      content: `你是 NeoForge/Java 教学助手。用户正在学习章节《${ch.title}》。
章节摘要：${ch.lead || ''}
章节要点（去标签）：${bodyText}

要求：用简体中文、口语化、短句回答。可给最小代码示例。不确定就说明。不要复述整章。`,
    },
    ...(Array.isArray(history) ? history.slice(-8) : []).map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 4000),
    })),
    { role: 'user', content: String(question || '').slice(0, 4000) },
  ];

  try {
    await fetchChatStream(cfg, messages, [], undefined, emit);
    emit({ k: 'done' });
  } catch (e) {
    emit({ k: 'error', text: String(e.message || e) });
  } finally {
    try { res.end(); } catch { /* ignore */ }
  }
}

/** 生成自定义章节 */
export async function generateChapter(res, { topic, track }, loadConfig, fetchChatStream) {
  const cfg = loadConfig();
  if (!cfg.apiKey || cfg.apiKey.startsWith('sk-在这里')) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '请先在设置里配置 API Key' }));
    return;
  }
  const topicText = String(topic || '').trim();
  if (!topicText) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: '缺少主题' }));
    return;
  }

  openSse(res);
  const emit = (obj) => { try { sseSend(res, obj); } catch { /* ignore */ } };

  const messages = [
    {
      role: 'system',
      content: `你是 NeoForge 1.21.1 教材作者。根据用户主题写一章完整教程。
只输出一个 JSON 对象，不要 markdown 围栏，字段：
{
  "title": "章标题",
  "short": "侧栏短名",
  "lead": "一段导语",
  "tags": ["标签1","标签2"],
  "body": "HTML 片段，可用 h2/h3/p/ul/ol/div.codeblock/div.note/div.exercise/div.tree/table"
}

body 规范：
- 中文
- codeblock 结构：<div class="codeblock" data-lang="java"><div class="codeblock-head"><span class="codeblock-lang">java</span><button type="button" class="btn btn-ghost btn-copy">复制</button></div><pre><code>...代码HTML转义...</code></pre></div>
- 代码里 < > & 要写成 &lt; &gt; &amp;
- 至少 2 个可运行级别的代码示例
- 结尾有 .exercise 练习
- 适配 Minecraft ${cfg.mcVersion} / NeoForge / modId ${cfg.modId}`,
    },
    { role: 'user', content: `主题：${topicText}\n轨道偏好：${track || 'neoforge'}` },
  ];

  let raw = '';
  try {
    // 复用流式：只收 content
    const base = String(cfg.baseUrl || '').replace(/\/+$/, '');
    const resHttp = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: Number.isFinite(Number(cfg.temperature)) ? Number(cfg.temperature) : 0.5,
        top_p: Number.isFinite(Number(cfg.topP)) ? Number(cfg.topP) : undefined,
        max_tokens: Number(cfg.maxTokens) > 0 ? Number(cfg.maxTokens) : undefined,
        stream: true,
      }),
    });
    if (!resHttp.ok) {
      const t = await resHttp.text().catch(() => '');
      throw new Error(`API ${resHttp.status}: ${t.slice(0, 200)}`);
    }
    const reader = resHttp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split('\n');
      buf = parts.pop() || '';
      for (const line of parts) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const j = JSON.parse(payload);
          const d = j.choices?.[0]?.delta?.content;
          if (d) {
            raw += d;
            emit({ k: 'delta', text: d });
          }
        } catch { /* ignore */ }
      }
    }

    let doc;
    try {
      const jsonText = raw.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
      const start = jsonText.indexOf('{');
      const end = jsonText.lastIndexOf('}');
      doc = JSON.parse(jsonText.slice(start, end + 1));
    } catch {
      throw new Error('模型未返回合法 JSON，可重试或换个说法');
    }

    const saved = saveCustom({
      title: doc.title || topicText,
      short: doc.short || doc.title || topicText,
      lead: doc.lead || '',
      tags: doc.tags || [],
      body: doc.body || '<p>（空章节）</p>',
      topic: topicText,
    });
    emit({ k: 'saved', chapter: publicMeta(saved, 'custom') });
    emit({ k: 'done' });
  } catch (e) {
    emit({ k: 'error', text: String(e.message || e) });
  } finally {
    try { res.end(); } catch { /* ignore */ }
  }
}
