/**
 * 轻量事实记忆（灵感来自 Mem0 的 add / search，但零依赖、纯本地）
 * memory-store.json 结构：
 * {
 *   "facts": [
 *     { "id", "text", "kind": "pref|project|style|avoid|fact", "tags": [], "createdAt", "source" }
 *   ]
 * }
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.join(__dirname, 'memory-store.json');
const LEGACY_PATH = path.join(__dirname, 'memory.json');

function loadStore() {
  try {
    const s = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    if (Array.isArray(s.facts)) return { facts: s.facts };
  } catch { /* ignore */ }
  // 迁移旧版 notes/likes/avoid
  try {
    const old = JSON.parse(fs.readFileSync(LEGACY_PATH, 'utf8'));
    const facts = [];
    const push = (text, kind) => {
      const t = String(text || '').trim();
      if (t) facts.push(makeFact(t, kind, ['migrated']));
    };
    push(old.notes, 'project');
    push(old.likes, 'style');
    push(old.avoid, 'avoid');
    if (facts.length) {
      const store = { facts };
      saveStore(store);
      return store;
    }
  } catch { /* ignore */ }
  return { facts: [] };
}

function saveStore(store) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function makeFact(text, kind = 'fact', tags = [], source = 'manual') {
  return {
    id: randomUUID().slice(0, 8),
    text: String(text).trim().slice(0, 300),
    kind,
    tags: tags.slice(0, 6),
    createdAt: Date.now(),
    source,
  };
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, '');
}

function tokenize(s) {
  // 中英混合：英文单词 + 中文按 2-gram
  const t = String(s || '').toLowerCase();
  const en = t.match(/[a-z0-9_]{2,}/g) || [];
  const zh = t.replace(/[a-z0-9_\s]/gi, '');
  const grams = [];
  for (let i = 0; i < zh.length - 1; i += 1) grams.push(zh.slice(i, i + 2));
  return new Set([...en, ...grams]);
}

export function listFacts() {
  return loadStore().facts.sort((a, b) => b.createdAt - a.createdAt);
}

export function addFact(text, kind, tags, source) {
  const store = loadStore();
  const t = String(text || '').trim();
  if (!t) return null;
  // 去重：完全相同或高度重叠
  const key = norm(t);
  const dup = store.facts.find((f) => norm(f.text) === key);
  if (dup) return dup;
  const fact = makeFact(t, kind || 'fact', tags || [], source || 'manual');
  store.facts.push(fact);
  // 上限，防无限膨胀
  if (store.facts.length > 200) store.facts = store.facts.slice(-200);
  saveStore(store);
  return fact;
}

export function addFacts(items, source = 'auto') {
  const out = [];
  for (const it of items || []) {
    if (!it || !it.text) continue;
    const f = addFact(it.text, it.kind, it.tags, source);
    if (f) out.push(f);
  }
  return out;
}

export function deleteFact(id) {
  const store = loadStore();
  const n = store.facts.length;
  store.facts = store.facts.filter((f) => f.id !== id);
  saveStore(store);
  return store.facts.length < n;
}

export function clearFacts() {
  saveStore({ facts: [] });
  return true;
}

/** 关键字检索：与 query 相关的 topK 条 */
export function searchFacts(query, topK = 8) {
  const qTokens = tokenize(query);
  const facts = loadStore().facts;
  if (!facts.length) return [];
  const scored = facts.map((f) => {
    const fTokens = tokenize(f.text);
    let score = 0;
    for (const tok of qTokens) {
      if (fTokens.has(tok)) score += 1;
      if (f.text.toLowerCase().includes(tok)) score += 0.5;
    }
    // 偏好/避免稍微加权，更该被遵守
    if (f.kind === 'pref' || f.kind === 'style') score += 0.3;
    if (f.kind === 'avoid') score += 0.2;
    // 新的稍优先
    score += Math.min(0.2, (Date.now() - f.createdAt) / (1000 * 60 * 60 * 24 * 30) * 0.05);
    return { f, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const hits = scored.filter((x) => x.score > 0).slice(0, topK).map((x) => x.f);
  // 若全无命中，退回最近 4 条 project/pref/avoid
  if (!hits.length) {
    return facts
      .filter((f) => f.kind === 'project' || f.kind === 'pref' || f.kind === 'avoid' || f.kind === 'style')
      .slice(0, 4);
  }
  return hits;
}

/** 注入 system prompt 的记忆块 */
export function memoryPromptBlock(query) {
  const facts = searchFacts(query, 8);
  if (!facts.length) return '';
  const lines = facts.map((f) => `- [${f.kind}] ${f.text}`);
  return `\n制作者记忆（检索自本地 memory-store，优先遵守）：\n${lines.join('\n')}\n`;
}

/** 从对话提炼多条事实（调用外部 LLM，由 server 注入） */
export function parseFactsJson(raw) {
  if (!raw) return [];
  let t = String(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const s = t.indexOf('[');
  const e = t.lastIndexOf(']');
  if (s >= 0 && e > s) t = t.slice(s, e + 1);
  try {
    const arr = JSON.parse(t);
    if (!Array.isArray(arr)) return [];
    return arr
      .map((x) => {
        if (typeof x === 'string') return { text: x, kind: 'fact', tags: [] };
        return {
          text: x.text || x.memory || x.fact || '',
          kind: x.kind || x.type || 'fact',
          tags: Array.isArray(x.tags) ? x.tags : [],
        };
      })
      .filter((x) => x.text && x.text.trim().length > 1);
  } catch {
    return [];
  }
}
