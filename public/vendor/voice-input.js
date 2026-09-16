/* 语音输入：录音 → 16k 单声道 WAV → 桥的 /voice → 文字（原话 + 润色后）。

   为什么在浏览器里压成 WAV 而不是直接传 MediaRecorder 吐的 webm/mp4：
     ASR 网关是 vLLM 的 Qwen3-ASR，那台机器和桥所在的机器都没有 ffmpeg，webm/opus
     解不解得开全看它那边的 librosa 心情；而 WAV 谁都认。16k/16bit/mono 是 32 KB/s，
     一分钟 1.9 MB，比 webm 大，但省掉了服务端一整条转码链和一处会静默失败的地方。

   为什么用 ScriptProcessorNode 而不是 AudioWorklet：worklet 要单独一份脚本文件或
   Blob URL，CSP、缓存版本号都得多照顾一层；ScriptProcessor 虽标了 deprecated，
   Chrome / Safari / Firefox 至今全认，采 PCM 这点活它够用。

   这个文件不依赖任何页面的全局变量，任何一页想给某个输入框加麦克风都能用：

     const rec = await BFVoice.start({ onLevel(v) {...} });   // v ∈ [0,1]
     const wav = await rec.stop();                              // Blob(audio/wav)
     const out = await BFVoice.transcribe(wav, { endpoint, token, polish, kind });
     // out = { text, polished, polish_by, seconds, asr_ms, polish_ms }
*/
(function () {
  'use strict';

  const TARGET_RATE = 16000;
  const MAX_SECONDS = 120;

  function supported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia
      && (window.AudioContext || window.webkitAudioContext));
  }

  /* 把 float32 PCM 按整数倍或分数比例压到 16k：每个输出样本取一段输入的平均值。
     线性插值在降采样时会混叠，取平均相当于顺手做了个低通，人声这个频段够了。 */
  function downsample(chunks, fromRate) {
    let total = 0;
    for (const c of chunks) total += c.length;
    const input = new Float32Array(total);
    let at = 0;
    for (const c of chunks) { input.set(c, at); at += c.length; }
    if (fromRate === TARGET_RATE) return input;
    const ratio = fromRate / TARGET_RATE;
    const outLength = Math.floor(input.length / ratio);
    const output = new Float32Array(outLength);
    let pos = 0;
    for (let i = 0; i < outLength; i++) {
      const next = Math.min(Math.round((i + 1) * ratio), input.length);
      let sum = 0; let n = 0;
      for (let j = Math.round(pos); j < next; j++) { sum += input[j]; n++; }
      output[i] = n ? sum / n : 0;
      pos = next;
    }
    return output;
  }

  /* 剪掉头尾的静音，各留 0.3 秒。

     不是为了省流量：Qwen3-ASR 遇到一长段数字静音会在尾巴上长出 "No, no, no…" 的幻觉
     并死循环（2026-09-16 实测 10 秒话 + 22 秒零值静音，网关 170 秒不回）。说完话隔几秒
     才按停是最常见的用法，尾巴必须剪。阈值取 int16 的 ±130 左右：真麦克风的底噪
     通常在这上面，剪不掉它没关系，服务端还有第二道。 */
  function trimSilence(samples, rate) {
    const threshold = 0.004;
    const pad = Math.round(rate * 0.3);
    let first = 0;
    while (first < samples.length && Math.abs(samples[first]) < threshold) first++;
    if (first >= samples.length) return samples.subarray(0, 0);
    let last = samples.length - 1;
    while (last > first && Math.abs(samples[last]) < threshold) last--;
    const from = Math.max(0, first - pad);
    const to = Math.min(samples.length, last + 1 + pad);
    return samples.subarray(from, to);
  }

  function encodeWav(samples, rate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const ascii = (offset, text) => { for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i)); };
    ascii(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    ascii(8, 'WAVE');
    ascii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);          // PCM
    view.setUint16(22, 1, true);          // mono
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);   // byte rate
    view.setUint16(32, 2, true);          // block align
    view.setUint16(34, 16, true);         // bits
    ascii(36, 'data');
    view.setUint32(40, samples.length * 2, true);
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  /* 开始录音。拿不到麦克风权限抛错（err.name === 'NotAllowedError' / 'NotFoundError'）。 */
  async function start(options) {
    const opts = options || {};
    if (!supported()) throw Object.assign(new Error('这个浏览器不支持录音'), { name: 'NotSupported' });
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    // iOS 上 AudioContext 建出来常是 suspended，得在这次点击里 resume 一次。
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (_) { /* 下面照常 */ } }
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    let samples = 0;
    let stopped = false;
    const startedAt = Date.now();
    const maxSeconds = Math.min(MAX_SECONDS, Math.max(5, opts.maxSeconds || MAX_SECONDS));
    let onLevel = typeof opts.onLevel === 'function' ? opts.onLevel : null;
    let onLimit = typeof opts.onLimit === 'function' ? opts.onLimit : null;

    processor.onaudioprocess = (event) => {
      if (stopped) return;
      const data = event.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(data));
      samples += data.length;
      if (onLevel) {
        let sum = 0;
        for (let i = 0; i < data.length; i += 8) sum += data[i] * data[i];
        const rms = Math.sqrt(sum / (data.length / 8));
        // 人声 rms 常在 0.02–0.3 之间；拉一下曲线让小声也看得见在动。
        onLevel(Math.min(1, Math.pow(rms * 4, 0.6)));
      }
      if (samples / ctx.sampleRate >= maxSeconds && onLimit) {
        const cb = onLimit; onLimit = null; cb();
      }
    };
    source.connect(processor);
    // 不接 destination 的话 Chrome 不会跑 onaudioprocess；接一个 0 增益的节点当垫子。
    const mute = ctx.createGain();
    mute.gain.value = 0;
    processor.connect(mute);
    mute.connect(ctx.destination);

    function teardown() {
      stopped = true;
      onLevel = null;
      try { processor.disconnect(); } catch (_) { /* 已断 */ }
      try { source.disconnect(); } catch (_) { /* 已断 */ }
      try { mute.disconnect(); } catch (_) { /* 已断 */ }
      stream.getTracks().forEach((track) => track.stop());
      ctx.close().catch(() => {});
    }

    return {
      startedAt,
      get seconds() { return samples / ctx.sampleRate; },
      async stop() {
        if (stopped) throw new Error('已经停了');
        teardown();
        const pcm = trimSilence(downsample(chunks, ctx.sampleRate), TARGET_RATE);
        return encodeWav(pcm, TARGET_RATE);
      },
      cancel() { if (!stopped) teardown(); },
    };
  }

  /* 把 WAV 交给桥。endpoint 形如 '/hx/api/voice'；token 是站内登录令牌。 */
  async function transcribe(blob, options) {
    const opts = options || {};
    const params = new URLSearchParams();
    params.set('polish', opts.polish === false ? '0' : '1');
    params.set('kind', opts.kind || 'mod');
    const headers = { 'Content-Type': blob.type || 'audio/wav' };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    const response = await fetch(`${opts.endpoint || '/hx/api/voice'}?${params}`, {
      method: 'POST', headers, body: blob, signal: opts.signal,
    });
    let payload = {};
    try { payload = await response.json(); } catch (_) { payload = {}; }
    if (!response.ok) {
      const error = new Error(payload.error || `语音服务出错（${response.status}）`);
      error.status = response.status;
      error.code = payload.code || '';
      throw error;
    }
    return payload;
  }

  window.BFVoice = { supported, start, transcribe, encodeWav, MAX_SECONDS };
}());
