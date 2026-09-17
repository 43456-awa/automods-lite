// 回归检查：/api/chat 的 SSE 流到底会不会关。
//
// 背景（2026-09-17）：服务端 sseOpen() 写完 text/event-stream 响应头就撒手，
// 从来不调 res.end()，连接靠 keep-alive 一直挂着；前端 runChat() 的读取循环
// 只在读到「流结束」时才 finishRun()，于是 run_end 之后界面永远停在「制作中」、
// 右下角发送键一直是灰的，必须刷新页面才能继续。
//
// 用法（需要服务已在跑）：
//   node tools/check-stream.mjs [baseUrl]      # 默认 http://127.0.0.1:8787
//
// 退出码：0 = 流在 run_end 后正常关闭；1 = 没关（回归了）。
import http from 'node:http';

const BASE = process.argv[2] || 'http://127.0.0.1:8787';
const t0 = Date.now();
const el = () => `[${((Date.now() - t0) / 1000).toFixed(1)}s]`;
const log = (...a) => console.log(el(), ...a);

const payload = Buffer.from(JSON.stringify({ text: '（check-stream 回归检查，可删）' }));

const req = http.request(
  `${BASE}/api/chat`,
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length },
    timeout: 0,
  },
  (res) => {
    log('HTTP', res.statusCode);
    let buf = '';
    let sawRunEnd = false;
    let closed = false;

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
        if (ev.k === 'chat') log('chat →', ev.chatId, ev.project);
        else if (ev.k === 'run_end') { sawRunEnd = true; log('★ run_end'); }
        else if (ev.k === 'files') log('files', (ev.files || []).length, '个');
        else if (ev.k === 'error') log('error:', String(ev.text || '').slice(0, 90));
      }
    });
    res.on('end', () => { closed = true; log('★ 流关闭'); });

    const judge = () => {
      log('---- 判定 ----');
      log('run_end 已发:', sawRunEnd, '| 流已关闭:', closed);
      if (sawRunEnd && closed) {
        log('✅ 通过：run_end 之后流正常关闭，前端能收尾');
        process.exit(0);
      }
      if (sawRunEnd && !closed) {
        log('❌ 回归：run_end 发了但流不关 —— 界面会卡在「制作中」，发送键变灰');
        process.exit(1);
      }
      log('⚠️ 没等到 run_end，本次检查无效（服务在跑吗？）');
      process.exit(2);
    };

    // run_end 之后给 15 秒；最迟 90 秒收摊
    const iv = setInterval(() => {
      if (sawRunEnd && Date.now() - t0 > 15000) { clearInterval(iv); judge(); }
    }, 500);
    setTimeout(() => { clearInterval(iv); judge(); }, 90000);
  },
);

req.on('error', (e) => { log('请求失败:', e.message, '（服务没在跑？）'); process.exit(2); });
req.end(payload);
