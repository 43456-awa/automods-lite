/* 冒烟：拿 config.json 里现在这份上游实跑一轮，把 SSE 事件按时间打出来 */
const text = process.argv[2] || '加一个会发光的方块，放在地上能照亮周围';

const res = await fetch('http://127.0.0.1:8787/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ text }),
});

if (!res.ok) {
  console.log('HTTP', res.status, await res.text());
  process.exit(1);
}

const t0 = Date.now();
const el = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const reader = res.body.getReader();
const dec = new TextDecoder();
let buf = '';
const counts = {};
let thinkChars = 0;
let sayChars = 0;
const tools = [];

for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  let cut = buf.indexOf('\n\n');
  while (cut >= 0) {
    const raw = buf.slice(0, cut);
    buf = buf.slice(cut + 2);
    cut = buf.indexOf('\n\n');
    if (!raw.startsWith('data:')) continue;
    let ev;
    try { ev = JSON.parse(raw.slice(5).trim()); } catch { continue; }
    counts[ev.k] = (counts[ev.k] || 0) + 1;
    const clip = (s, n = 70) => String(s || '').replace(/\s+/g, ' ').slice(0, n);
    switch (ev.k) {
      case 'chat':
        console.log(`[${el()}] chat  id=${ev.chatId} project=${ev.project} title=${ev.title}`);
        break;
      case 'status':
        console.log(`[${el()}] status  ${clip(ev.text)}`);
        break;
      case 'think_delta':
        thinkChars += (ev.text || '').length;
        if (counts.think_delta <= 3) console.log(`[${el()}] think   ${clip(ev.text)}`);
        break;
      case 'say_delta':
        sayChars += (ev.text || '').length;
        break;
      case 'say_settled':
        console.log(`[${el()}] say     ${clip(ev.text, 200)}`);
        break;
      case 'tool':
        tools.push(ev.name);
        console.log(`[${el()}] tool    ${ev.name} ${clip(ev.brief, 60)}`);
        break;
      case 'tool_done':
        console.log(`[${el()}] done    ok=${ev.ok} ${clip(ev.out, 90)}`);
        break;
      case 'tool_note':
        console.log(`[${el()}] note    ${ev.type} ${clip(ev.path, 70)}`);
        break;
      case 'release':
        console.log(`[${el()}] release ${ev.name} rev=${ev.rev} size=${ev.size}`);
        break;
      case 'files':
        console.log(`[${el()}] files   ${(ev.files || []).length} 个文件`);
        (ev.files || []).forEach((f) => console.log(`           - ${f.path}  ${f.size}B`));
        console.log('\n---- 汇总 ----');
        console.log('事件计数:', JSON.stringify(counts));
        console.log('思考字数:', thinkChars, ' 正文字数:', sayChars);
        console.log('工具调用:', tools.join(', ') || '（无）');
        console.log('总耗时:', el());
        // 后面还有记忆总结的尾巴，不等它了
        process.exit(0);
        break;
      case 'error':
        console.log(`[${el()}] ERROR   ${clip(ev.text, 200)}`);
        break;
      case 'run_end':
        console.log(`[${el()}] run_end`);
        break;
      default:
        break;
    }
  }
}

console.log('\n---- 汇总 ----');
console.log('事件计数:', JSON.stringify(counts));
console.log('思考字数:', thinkChars, ' 正文字数:', sayChars);
console.log('工具调用:', tools.join(', ') || '（无）');
console.log('总耗时:', el());
