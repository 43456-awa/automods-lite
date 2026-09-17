/* 冒烟：拿 config.json 里现在这份上游实跑一轮，把 SSE 事件按时间打出来 + 汇总。
 *
 * 用 node:http 而不是 fetch：undici 的 bodyTimeout 默认 300 秒，且不受 AbortSignal
 * 影响。长任务（几十个 write_file + 429 重试等待）会被它硬掐成 "TypeError:
 * terminated / BodyTimeoutError"，看着像服务挂了，其实是脚本自己的连接断了。
 * 这里自己管连接，不设 body 超时。
 *
 * 用法：node tools/smoke.mjs "做一把会喷火的剑"
 */
import http from 'node:http';

const text = process.argv[2] || '加一个会发光的方块，放在地上能照亮周围';
const payload = JSON.stringify({ text });

const t0 = Date.now();
const el = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const clip = (s, n = 70) => String(s || '').replace(/\s+/g, ' ').slice(0, n);

const counts = {};
let thinkChars = 0;
let sayChars = 0;
const tools = [];
let buf = '';
let sawFiles = false;

function handle(ev) {
  counts[ev.k] = (counts[ev.k] || 0) + 1;
  switch (ev.k) {
    case 'chat':
      console.log(`[${el()}] chat  id=${ev.chatId} project=${ev.project} title=${clip(ev.title)}`);
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
    case 'error':
      console.log(`[${el()}] ERROR   ${clip(ev.text, 200)}`);
      break;
    case 'run_end':
      console.log(`[${el()}] run_end`);
      break;
    case 'files':
      sawFiles = true;
      console.log(`[${el()}] files   ${(ev.files || []).length} 个文件`);
      (ev.files || []).forEach((f) => console.log(`           - ${f.path}  ${f.size}B`));
      summary();
      // 后面还有记忆总结的尾巴，不等它了
      process.exit(0);
      break;
    default:
      break;
  }
}

function summary() {
  console.log('\n---- 汇总 ----');
  console.log('事件计数:', JSON.stringify(counts));
  console.log('思考字数:', thinkChars, ' 正文字数:', sayChars);
  console.log('工具调用:', tools.length, '次 ·', tools.join(', ') || '（无）');
  console.log('总耗时:', el());
}

const req = http.request(
  {
    host: '127.0.0.1',
    port: Number(process.env.PORT) || 8787,
    path: '/api/chat',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
    timeout: 0,
  },
  (res) => {
    if (res.statusCode !== 200) {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        console.log('HTTP', res.statusCode, body.slice(0, 300));
        process.exit(1);
      });
      return;
    }
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      buf += chunk;
      let cut = buf.indexOf('\n\n');
      while (cut >= 0) {
        const raw = buf.slice(0, cut);
        buf = buf.slice(cut + 2);
        cut = buf.indexOf('\n\n');
        if (!raw.startsWith('data:')) continue;
        let ev;
        try { ev = JSON.parse(raw.slice(5).trim()); } catch { continue; }
        if (ev) handle(ev);
      }
    });
    res.on('end', () => {
      if (!sawFiles) {
        console.log('\n---- 连接结束（没等到 files 事件）----');
        summary();
      }
    });
  },
);

req.on('error', (e) => {
  console.log('请求失败:', e.message);
  process.exit(1);
});
req.end(payload);
