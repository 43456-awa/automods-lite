/* 探一下这个上游到底怎么生图：先试 OpenAI 标准 /images/generations，
 * 再试统一多模态常见的 chat/completions 出图。 */
import fs from 'node:fs';

const cfg = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const base = String(cfg.baseUrl).replace(/\/+$/, '');
const key = cfg.apiKey;
const MODEL = process.argv[2] || 'sensenova-u1.5-lite';
const PROMPT = 'a 16x16 pixel art Minecraft-style glowing lantern block texture, transparent background';

async function tryImages() {
  console.log('\n=== A) POST /images/generations ===');
  try {
    const r = await fetch(`${base}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, prompt: PROMPT, n: 1, size: '1024x1024' }),
    });
    const t = await r.text();
    console.log('status', r.status);
    console.log(t.slice(0, 600));
    return r.ok;
  } catch (e) {
    console.log('ERR', e.message);
    return false;
  }
}

async function tryChat() {
  console.log('\n=== B) POST /chat/completions（统一多模态出图）===');
  try {
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: PROMPT }],
        stream: false,
      }),
    });
    const t = await r.text();
    console.log('status', r.status);
    console.log(t.slice(0, 1500));
    return r.ok;
  } catch (e) {
    console.log('ERR', e.message);
    return false;
  }
}

const a = await tryImages();
if (!a) await tryChat();
