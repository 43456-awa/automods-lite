/* automods-lite — 工作台 + 模式切换 + 设置 */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);

  const state = {
    mode: "learn",
    chatId: null,
    project: "default",
    title: "新对话",
    busy: false,
    files: [],
    steps: 0,
    freshPaths: new Set(),
    stepNodes: new Map(),
    liveBubble: null,
    liveText: "",
  };

  const els = {
    sidebar: $("sidebar"),
    chatList: $("chatList"),
    conversation: $("conversation"),
    hero: $("hero"),
    input: $("input"),
    composer: $("composer"),
    sendButton: $("sendButton"),
    runFlag: $("runFlag"),
    pageTitle: $("pageTitle"),
    workCard: $("workCard"),
    workTitle: $("workTitle"),
    workNow: $("workNow"),
    workCount: $("workCount"),
    workSteps: $("workSteps"),
    fileList: $("fileList"),
    fileCount: $("fileCount"),
    filePreview: $("filePreview"),
    previewPath: $("previewPath"),
    previewCode: $("previewCode"),
    btnDownload: $("btnDownload"),
    assets: $("assets"),
    backdrop: $("backdrop"),
    toast: $("toast"),
    settingsModal: $("settingsModal"),
    settingsForm: $("settingsForm"),
    keyHint: $("keyHint"),
    draftHint: $("draftHint"),
    projectLabel: $("projectLabel"),
    viewLearn: $("viewLearn"),
    viewBench: $("viewBench"),
    learnSide: $("learnSide"),
    benchSide: $("benchSide"),
    thinkBox: $("thinkBox"),
    thinkText: $("thinkText"),
    thinkBody: $("thinkBody"),
    ctxMeter: $("ctxMeter"),
    ctxText: $("ctxText"),
    ctxFill: $("ctxFill"),
    ctxDetail: $("ctxDetail"),
    loaderQuick: $("loaderQuick"),
    mcQuick: $("mcQuick"),
    memoryModal: $("memoryModal"),
    planModal: $("planModal"),
    planBody: $("planBody"),
    planTitle: $("planTitle"),
    planCount: $("planCount"),
    planSwitch: $("planSwitch"),
    planToggleHint: $("planToggleHint"),
  };

  let thinkAcc = "";
  let ctxUsage = 0;
  let ctxDetailData = null;
  let planState = { original: "", plan: null, picks: {} };
  let pendingQueue = [];
  let streamAbort = null;

  function openPlanModal() {
    if (els.planModal) {
      els.planModal.hidden = false;
      els.backdrop.hidden = false;
    }
  }
  function closePlanModal() {
    if (els.planModal) els.planModal.hidden = true;
    if (window.NFHideBackdropIfIdle) window.NFHideBackdropIfIdle();
  }

  function renderPlan(plan, original) {
    planState = { original, plan, picks: {} }; // picks[gid] = [ {oid,label,detail,...}, ... ]
    if (els.planTitle) els.planTitle.textContent = plan.title || "模组规划";
    const groups = plan.groups || [];

    const allPicks = () => Object.values(planState.picks).flat().filter(Boolean);

    function refreshCount() {
      if (els.planCount) {
        const n = allPicks().length;
        els.planCount.textContent = n
          ? `想法池 ${n} 条 · 同组可多选 · 卡片可改写`
          : "点创意加入想法池；同组可多选，点标题/说明可改写";
      }
      const ul = document.getElementById("planPoolList");
      if (ul) {
        ul.textContent = "";
        allPicks().forEach((p) => {
          const li = document.createElement("li");
          li.textContent = `${p.groupTitle} → ${p.label}${p.detail ? `：${p.detail}` : ""}`;
          ul.appendChild(li);
        });
      }
    }

    function readCard(btn) {
      const labelEl = btn.querySelector(".opt-label");
      const detailEl = btn.querySelector(".opt-detail");
      return {
        oid: btn.dataset.oid,
        groupTitle: btn.dataset.gtitle,
        label: (labelEl?.textContent || btn.dataset.label || "").trim(),
        detail: (detailEl?.textContent || btn.dataset.detail || "").trim(),
      };
    }

    function syncCard(btn) {
      const key = `${btn.dataset.gid}::${btn.dataset.oid}`;
      const list = planState.picks[btn.dataset.gid] || [];
      const idx = list.findIndex((x) => x.key === key);
      if (idx >= 0) {
        const card = readCard(btn);
        list[idx] = { ...list[idx], ...card, key };
        planState.picks[btn.dataset.gid] = list;
        refreshCount();
      }
    }

    const html = [];
    html.push(`<div class="plan-pool"><b>想法池 · 可多选</b><ul id="planPoolList"></ul></div>`);
    groups.forEach((g) => {
      html.push(`<div class="plan-group" data-gid="${escapeHtml(g.id)}">
        <h3>${escapeHtml(g.title || g.id)}</h3>
        <p class="desc">${escapeHtml(g.desc || "")}</p>
        <div class="plan-opts">`);
      (g.options || []).forEach((o) => {
        html.push(`<div class="plan-opt" role="button" tabindex="0"
          data-gid="${escapeHtml(g.id)}"
          data-oid="${escapeHtml(o.id)}"
          data-label="${escapeHtml(o.label)}"
          data-detail="${escapeHtml(o.detail || "")}"
          data-gtitle="${escapeHtml(g.title || g.id)}">
          ${o.recommended ? '<span class="tagrec">推荐</span>' : ""}
          <b class="opt-label" contenteditable="true" spellcheck="false" title="点击可改写">${escapeHtml(o.label)}</b>
          <small class="opt-detail" contenteditable="true" spellcheck="false" title="点击可改写">${escapeHtml(o.detail || "")}</small>
          <span class="pick-hint">点一下加入 / 再点取消</span>
        </div>`);
      });
      html.push(`<div class="plan-custom">
        <small style="color:var(--muted);font-size:11px">自定义（可多条）</small>
        <input type="text" data-gid="${escapeHtml(g.id)}" data-gtitle="${escapeHtml(g.title || g.id)}" placeholder="输入你的方案…" />
        <button type="button" class="btn btn-ghost btn-sm plan-custom-add">加入</button>
      </div>`);
      html.push(`</div></div>`);
    });

    if (!els.planBody) {
      openPlanModal();
      return;
    }
    els.planBody.innerHTML = html.join("");

    els.planBody.querySelectorAll(".plan-opt").forEach((btn) => {
      const toggle = () => {
        // 点在可编辑文字上时，不切换选中，方便改写
        const gid = btn.dataset.gid;
        const key = `${gid}::${btn.dataset.oid}`;
        if (!planState.picks[gid]) planState.picks[gid] = [];
        const list = planState.picks[gid];
        const idx = list.findIndex((x) => x.key === key);
        if (idx >= 0) {
          list.splice(idx, 1);
          btn.classList.remove("picked");
          const h = btn.querySelector(".pick-hint");
          if (h) h.textContent = "点一下加入 / 再点取消";
        } else {
          const card = readCard(btn);
          list.push({ ...card, key });
          btn.classList.add("picked");
          const h = btn.querySelector(".pick-hint");
          if (h) h.textContent = "已加入 · 再点取消";
        }
        refreshCount();
      };

      btn.addEventListener("click", (e) => {
        if (e.target.closest("[contenteditable=true]")) return;
        toggle();
      });
      btn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });

      btn.querySelectorAll("[contenteditable=true]").forEach((el) => {
        el.addEventListener("click", (e) => e.stopPropagation());
        el.addEventListener("blur", () => syncCard(btn));
        el.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            el.blur();
          }
        });
      });
    });

    els.planBody.querySelectorAll(".plan-custom-add").forEach((btn) => {
      btn.onclick = () => {
        const box = btn.closest(".plan-custom");
        const input = box?.querySelector("input");
        const val = (input?.value || "").trim();
        if (!val) {
          toast("先写自定义方案");
          return;
        }
        const gid = input.dataset.gid;
        if (!planState.picks[gid]) planState.picks[gid] = [];
        const key = `${gid}::custom_${Date.now()}`;
        planState.picks[gid].push({
          key,
          oid: key,
          groupTitle: input.dataset.gtitle,
          label: val,
          detail: "自定义",
        });
        input.value = "";
        refreshCount();
        toast("已加入想法池");
      };
    });

    refreshCount();
    openPlanModal();
  }

  function buildPromptFromPlan() {
    const picks = allPicksFlat();
    if (!picks.length) return planState.original;
    // 按组合并
    const byGroup = new Map();
    picks.forEach((p) => {
      if (!byGroup.has(p.groupTitle)) byGroup.set(p.groupTitle, []);
      byGroup.get(p.groupTitle).push(p);
    });
    const lines = [];
    byGroup.forEach((arr, g) => {
      const items = arr.map((p) => `${p.label}${p.detail ? `（${p.detail}）` : ""}`).join("；");
      lines.push(`- ${g}：${items}`);
    });
    return `${planState.original}

已选定的实现方案（同组可多条，请全部按这些决策做）：
${lines.join("\n")}

请直接开始写代码落盘，不要再问选哪套。`;
  }

  function allPicksFlat() {
    return Object.values(planState.picks || {}).flat().filter(Boolean);
  }

  async function startPlan(text) {
    openPlanModal();
    if (els.planTitle) els.planTitle.textContent = "模组规划";
    if (els.planCount) els.planCount.textContent = "正在把你的想法拆成创意…";
    if (els.planBody) {
      els.planBody.innerHTML = '<div class="empty-state">正在生成创意，请稍候…（限流时会自动重试）</div>';
    }
    try {
      const res = await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      renderPlan(data.plan || {}, text);
    } catch (e) {
      const msg = e.message || "规划失败";
      if (els.planBody) {
        els.planBody.innerHTML = `
          <div class="empty-state">
            ${escapeHtml(msg)}
            <div style="margin-top:12px;display:flex;gap:8px;justify-content:center">
              <button type="button" class="btn btn-primary" id="btnPlanRetry">重试</button>
              <button type="button" class="btn btn-ghost" id="btnPlanSkip">不规划，直接开工</button>
            </div>
          </div>`;
        const retry = document.getElementById("btnPlanRetry");
        if (retry) retry.onclick = () => startPlan(text);
        const skip = document.getElementById("btnPlanSkip");
        if (skip) {
          skip.onclick = () => {
            closePlanModal();
            sendMessage(text);
          };
        }
      }
      toast(msg);
    }
  }

  function toast(msg) {
    if (window.NFToast) window.NFToast(msg);
    else {
      els.toast.textContent = msg;
      els.toast.hidden = false;
    }
  }

  function clock() {
    const d = new Date();
    return [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map((n) => String(n).padStart(2, "0")).join(":");
  }

  function fmtSize(n) {
    if (n >= 1048576) return `${(n / 1048576).toFixed(1)} MB`;
    if (n >= 1024) return `${Math.round(n / 1024)} KB`;
    return `${n} B`;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderMd(text, host) {
    host.innerHTML = "";
    const lines = String(text).split("\n");
    let i = 0;
    const flushInline = (raw, node) => {
      const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
      let last = 0, hit;
      while ((hit = re.exec(raw))) {
        if (hit.index > last) node.appendChild(document.createTextNode(raw.slice(last, hit.index)));
        if (hit[1]) {
          const b = document.createElement("strong");
          b.textContent = hit[1];
          node.appendChild(b);
        } else {
          const c = document.createElement("code");
          c.textContent = hit[2];
          node.appendChild(c);
        }
        last = hit.index + hit[0].length;
      }
      if (last < raw.length) node.appendChild(document.createTextNode(raw.slice(last)));
    };
    while (i < lines.length) {
      if (/^\s*```/.test(lines[i])) {
        i += 1;
        const body = [];
        while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
        i += 1;
        const pre = document.createElement("pre");
        pre.className = "md-code";
        pre.textContent = body.join("\n");
        host.appendChild(pre);
      } else if (!lines[i].trim()) {
        i += 1;
      } else {
        const p = document.createElement("p");
        p.style.margin = "6px 0 0";
        const buf = [];
        while (i < lines.length && lines[i].trim() && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
        flushInline(buf.join("\n"), p);
        host.appendChild(p);
      }
    }
  }

  function setMode(mode) {
    state.mode = mode === "bench" ? "bench" : "learn";
    document.querySelectorAll(".mode-btn").forEach((btn) => {
      const on = btn.dataset.mode === state.mode;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    els.viewLearn.hidden = state.mode !== "learn";
    els.viewBench.hidden = state.mode !== "bench";
    els.learnSide.hidden = state.mode !== "learn";
    els.benchSide.hidden = state.mode !== "bench";
    $("btnClearHistory").hidden = state.mode !== "bench";
    $("btnFilesMobile").hidden = state.mode !== "bench";
    if (state.mode === "learn") {
      els.pageTitle.textContent = window.NFLearn?.chapter?.title || "学习";
      els.runFlag.hidden = true;
      els.projectLabel.textContent = "";
    } else {
      els.pageTitle.textContent = state.title || "工作台";
      els.runFlag.hidden = false;
      updateProjectLabel();
    }
    closeDrawers();
  }
  window.NFSetMode = setMode;

  /** 思考框内容更新后滚到底部，方便盯最新推理 */
  function syncThinkScroll() {
    if (!els.thinkBody || els.thinkBody.hidden) return;
    els.thinkBody.scrollTop = els.thinkBody.scrollHeight;
  }

  function showThink(label, keepAcc) {
    if (!els.thinkBox) return;
    els.thinkBox.hidden = false;
    if (els.thinkText) els.thinkText.textContent = label || "正在思考…";
    // keepAcc=true 时不清理已有推理（限流重试等）
    if (!keepAcc && thinkAcc) {
      /* 保留 thinkAcc，只更新标题 */
    }
    if (els.thinkBody) {
      if (thinkAcc) {
        els.thinkBody.hidden = false;
        els.thinkBody.textContent = thinkAcc.slice(-2000);
        syncThinkScroll();
      } else {
        els.thinkBody.hidden = true;
      }
    }
  }

  function appendThink(text) {
    if (!els.thinkBox) return;
    els.thinkBox.hidden = false;
    thinkAcc += text || "";
    if (els.thinkText) els.thinkText.textContent = "模型推理中…";
    if (els.thinkBody) {
      els.thinkBody.hidden = false;
      els.thinkBody.textContent = thinkAcc.slice(-2000);
      syncThinkScroll();
    }
  }

  /** collapse think box but KEEP text for retry; hard=true 清空 */
  function hideThink(hard) {
    if (hard !== false) thinkAcc = "";
    if (els.thinkBox) els.thinkBox.hidden = true;
    if (els.thinkBody) {
      els.thinkBody.hidden = true;
      if (hard !== false) els.thinkBody.textContent = "";
    }
  }

  function collapseThinkKeep() {
    if (els.thinkBox) els.thinkBox.hidden = true;
  }

  function shortNum(n) {
    if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
    return String(n);
  }

  function updateCtxMeter(extra) {
    let chars = 0;
    let userN = 0;
    let asstN = 0;
    let otherN = 0;
    const samples = [];
    try {
      const nodes = [...els.conversation.querySelectorAll(".msg")];
      nodes.forEach((n) => {
        const t = n.textContent || "";
        chars += t.length;
        if (n.classList.contains("user")) userN += 1;
        else if (n.classList.contains("assistant")) asstN += 1;
        else otherN += 1;
        samples.push({
          role: n.classList.contains("user") ? "user" : n.classList.contains("assistant") ? "assistant" : "system",
          len: t.length,
          preview: t.slice(0, 40),
        });
      });
    } catch { /* ignore */ }
    if (extra) chars += String(extra).length;
    ctxUsage = Math.round(chars / 3.2);
    const f = els.settingsForm;
    const hist = parseInt(f?.historyLimit?.value, 10) || 36;
    const cap = Math.max(4000, hist * 400);
    if (els.ctxText) els.ctxText.textContent = `上下文 ~${shortNum(ctxUsage)}`;
    if (els.ctxFill) {
      const share = Math.min(1, ctxUsage / cap);
      els.ctxFill.style.width = `${(share * 100).toFixed(1)}%`;
      els.ctxFill.classList.toggle("hot", share > 0.7);
      els.ctxFill.classList.toggle("over", share > 0.92);
    }
    if (els.ctxMeter) {
      els.ctxMeter.title = `点击看明细 · 约 ${ctxUsage} tokens`;
    }
    ctxDetailData = {
      tokens: ctxUsage,
      chars,
      cap,
      hist,
      userN,
      asstN,
      otherN,
      share: Math.min(1, ctxUsage / cap),
      samples: samples.slice(-12).reverse(),
    };
  }

  function openCtxDetail() {
    if (!els.ctxDetail) return;
    updateCtxMeter();
    const d = ctxDetailData;
    if (!d) return;
    const pct = Math.round(d.share * 100);
    els.ctxDetail.innerHTML = `
      <div class="pop-head">
        <b>上下文占用</b>
        <button type="button" class="pop-close" id="btnCloseCtxPop" aria-label="关闭">×</button>
      </div>
      <div class="ctx-stats">
        <div class="row"><span>估算 tokens</span><b>~${shortNum(d.tokens)}</b></div>
        <div class="row"><span>字符数</span><b>${d.chars}</b></div>
        <div class="row"><span>消息条数</span><b>用户 ${d.userN} · 助手 ${d.asstN}${d.otherN ? ` · 其他 ${d.otherN}` : ""}</b></div>
        <div class="row"><span>历史档位</span><b>${d.hist} 条 · 预算约 ${shortNum(d.cap)}</b></div>
        <div class="row"><span>占用比例</span><b>${pct}%</b></div>
      </div>
      <p class="hint-line" style="margin-top:6px">粗估（约 3.2 字符 ≈ 1 token），非上游精确计费。</p>
      <div class="section-label" style="margin-top:8px">最近消息</div>
      <ul class="ctx-break">
        ${d.samples.map((s) => `<li>${s.role} · ${s.len}字 · ${escapeHtml(s.preview)}…</li>`).join("")}
      </ul>
    `;
    els.ctxDetail.hidden = false;
    const close = document.getElementById("btnCloseCtxPop");
    if (close) close.onclick = (e) => { e.stopPropagation(); closeCtxDetail(); };
  }

  function closeCtxDetail() {
    if (!els.ctxDetail) return;
    els.ctxDetail.hidden = true;
  }

  function toggleCtxDetail(e) {
    if (e) e.stopPropagation();
    if (els.ctxDetail && !els.ctxDetail.hidden) closeCtxDetail();
    else openCtxDetail();
  }

  function setBusy(busy, label) {
    state.busy = busy;
    els.runFlag.textContent = label || (busy ? "制作中" : "空闲");
    els.runFlag.classList.toggle("busy", busy);
    // 忙时：有字→插话；没字→停止
    const hasText = Boolean(els.input.value.trim());
    if (busy) {
      els.sendButton.disabled = false;
      els.sendButton.textContent = hasText ? "插话" : "停止";
      els.sendButton.title = hasText ? "当前这轮做完后自动接上这条" : "停止这一轮";
      els.sendButton.classList.toggle("stopping", !hasText);
    } else {
      els.sendButton.disabled = !hasText;
      els.sendButton.textContent = "发送";
      els.sendButton.title = "发送（Shift + 回车）";
      els.sendButton.classList.remove("stopping");
      if (pendingQueue.length) {
        const next = pendingQueue.shift();
        setTimeout(() => sendMessage(next), 300);
      }
    }
    els.workCard.hidden = !busy && !state.steps;
    els.workCard.classList.toggle("running", busy);
    const stopBtn = $("btnStop");
    if (stopBtn) stopBtn.hidden = !busy;
    if (!busy) {
      els.workTitle.textContent = state.steps ? "这一轮做完了" : "正在制作";
    }
  }

  async function stopCurrent() {
    if (!state.chatId) return;
    try {
      await fetch("/api/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: state.chatId }),
      });
      if (streamAbort) {
        streamAbort.abort();
        streamAbort = null;
      }
      toast("已请求停止");
    } catch {
      toast("停止失败");
    }
  }

  function dispatchText(text) {
    if (!text) return;
    if (els.planSwitch && els.planSwitch.checked && !state.busy) {
      startPlan(text);
      return;
    }
    sendMessage(text);
  }

  function ensureLiveBubble() {
    if (state.liveBubble) return state.liveBubble;
    els.hero.hidden = true;
    const node = document.createElement("div");
    node.className = "msg assistant streaming";
    els.conversation.appendChild(node);
    state.liveBubble = node;
    state.liveText = "";
    return node;
  }

  function appendLive(text) {
    const node = ensureLiveBubble();
    state.liveText += text;
    node.textContent = state.liveText;
    els.conversation.scrollTop = els.conversation.scrollHeight;
  }

  function settleLive(fullText) {
    if (state.liveBubble) {
      state.liveBubble.remove();
      state.liveBubble = null;
    }
    if (fullText) addMsg("assistant", fullText);
    state.liveText = "";
  }

  function cancelLive() {
    if (state.liveBubble) {
      if (state.liveText.trim()) addMsg("assistant", state.liveText + "\n\n（中断）");
      else state.liveBubble.remove();
    }
    state.liveBubble = null;
    state.liveText = "";
  }

  function addMsg(role, text) {
    els.hero.hidden = true;
    const node = document.createElement("div");
    node.className = `msg ${role}`;
    if (role === "system") node.textContent = text;
    else if (role === "assistant") renderMd(text, node);
    else node.textContent = text;
    els.conversation.appendChild(node);
    els.conversation.scrollTop = els.conversation.scrollHeight;
    return node;
  }

  function resetWorkCard() {
    state.steps = 0;
    state.stepNodes.clear();
    els.workSteps.textContent = "";
    els.workCount.textContent = "0 步";
    els.workNow.textContent = "";
    els.workCard.hidden = true;
    els.workCard.classList.remove("running");
    els.workTitle.textContent = "正在制作";
    // 新一轮才清空思考
    hideThink(true);
  }

  function addStep(label, brief, bad, id) {
    if (id && state.stepNodes.has(id)) {
      const node = state.stepNodes.get(id);
      const nameEl = node.querySelector(".name");
      const briefEl = node.querySelector(".brief");
      if (nameEl) nameEl.textContent = label;
      if (briefEl) briefEl.textContent = brief || "";
      node.classList.toggle("bad", Boolean(bad));
      els.workNow.textContent = `${label}${brief ? " · " + brief : ""}`.slice(0, 48);
      return;
    }
    state.steps += 1;
    els.workCount.textContent = `${state.steps} 步`;
    els.workCard.hidden = false;
    const li = document.createElement("li");
    if (bad) li.classList.add("bad");
    const time = document.createElement("time");
    time.textContent = clock();
    const body = document.createElement("div");
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = label;
    const briefEl = document.createElement("span");
    briefEl.className = "brief";
    briefEl.textContent = brief ? ` ${brief}` : "";
    body.appendChild(name);
    body.appendChild(briefEl);
    li.appendChild(time);
    li.appendChild(body);
    els.workSteps.appendChild(li);
    if (id) state.stepNodes.set(id, li);
    els.workSteps.scrollTop = els.workSteps.scrollHeight;
    els.workNow.textContent = `${label}${brief ? " · " + brief : ""}`.slice(0, 48);
  }

  function updateProjectLabel() {
    if (state.mode !== "bench") return;
    els.projectLabel.textContent = state.project && state.project !== "default"
      ? `工程 ${state.project}` : "";
  }

  async function loadFiles(markFresh) {
    if (state.mode !== "bench" && !state.chatId) return;
    const project = state.project || "default";
    try {
      const res = await fetch(`/api/files?project=${encodeURIComponent(project)}`);
      const data = await res.json();
      state.files = data.files || [];
      els.fileCount.textContent = String(state.files.length);
      const rootEl = $("assetsRoot");
      if (rootEl) rootEl.textContent = data.root || `workspace/projects/${project}`;
      if (!state.files.length) {
        els.fileList.innerHTML = '<div class="empty">这个对话还没有文件。<br />让助手 write_file 后会出现在这里。</div>';
        return;
      }
      els.fileList.textContent = "";
      for (const f of state.files) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "file-item" + (markFresh && state.freshPaths.has(f.path) ? " fresh" : "");
        const name = document.createElement("span");
        name.textContent = f.path;
        const meta = document.createElement("span");
        meta.className = "meta";
        meta.textContent = fmtSize(f.size);
        btn.appendChild(name);
        btn.appendChild(meta);
        btn.onclick = () => openFile(f.path);
        els.fileList.appendChild(btn);
      }
      state.freshPaths.clear();
    } catch {
      toast("读取文件列表失败");
    }
  }

  async function openFile(rel) {
    const project = state.project || "default";
    try {
      const res = await fetch(`/api/file?project=${encodeURIComponent(project)}&path=${encodeURIComponent(rel)}`);
      if (!res.ok) throw new Error("not found");
      const data = await res.json();
      els.previewPath.textContent = rel;
      els.previewCode.textContent = data.content;
      els.filePreview.hidden = false;
      els.btnDownload.href = `/dl/${encodeURIComponent(project)}/${rel.split("/").map(encodeURIComponent).join("/")}`;
      els.btnDownload.setAttribute("download", rel.split("/").pop());
    } catch {
      toast("打不开这个文件");
    }
  }

  async function refreshChats() {
    try {
      const res = await fetch("/api/chats");
      const data = await res.json();
      const chats = data.chats || [];
      els.chatList.textContent = "";
      if (!chats.length) {
        const empty = document.createElement("div");
        empty.className = "foot-note";
        empty.style.textAlign = "left";
        empty.textContent = "还没有对话";
        els.chatList.appendChild(empty);
        return;
      }
      for (const c of chats) {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "chat-item" + (c.id === state.chatId ? " active" : "");
        const span = document.createElement("span");
        span.textContent = c.title;
        item.appendChild(span);
        const del = document.createElement("span");
        del.className = "del";
        del.textContent = "×";
        del.title = "删除对话";
        del.onclick = async (e) => {
          e.stopPropagation();
          if (state.busy && c.id === state.chatId) {
            toast("先停止这一轮");
            return;
          }
          if (!confirm("删除对话？工程文件保留。")) return;
          await fetch(`/api/chats/${c.id}`, { method: "DELETE" });
          if (state.chatId === c.id) startNewChat(false);
          else refreshChats();
        };
        item.appendChild(del);
        item.onclick = () => openChat(c.id);
        els.chatList.appendChild(item);
      }
    } catch { /* ignore */ }
  }

  async function openChat(id) {
    if (state.busy) {
      toast("这一轮还在做，先点停止");
      return;
    }
    try {
      const res = await fetch(`/api/chats/${id}`);
      if (!res.ok) throw new Error("missing");
      const chat = (await res.json()).chat;
      state.chatId = chat.id;
      state.project = chat.project || "default";
      state.title = chat.title;
      els.pageTitle.textContent = chat.title;
      els.conversation.textContent = "";
      state.liveBubble = null;
      state.liveText = "";
      resetWorkCard();
      updateProjectLabel();
      const msgs = (chat.messages || []).filter((m) => m.role === "user" || m.role === "assistant");
      if (msgs.length) {
        els.hero.hidden = true;
        for (const m of msgs) addMsg(m.role, m.content || "");
      } else {
        els.hero.hidden = false;
      }
      updateCtxMeter();
      refreshChats();
      loadFiles(false);
      closeDrawers();
    } catch {
      toast("打不开对话");
    }
  }

  function startNewChat(focus = true) {
    state.chatId = null;
    state.project = "default";
    state.title = "新对话";
    els.pageTitle.textContent = "工作台";
    els.conversation.textContent = "";
    state.liveBubble = null;
    state.liveText = "";
    els.hero.hidden = false;
    resetWorkCard();
    updateProjectLabel();
    refreshChats();
    els.fileList.innerHTML = '<div class="empty">发送第一条消息后会创建独立工程目录。</div>';
    els.fileCount.textContent = "0";
    els.filePreview.hidden = true;
    if (focus) els.input.focus();
  }

  function handleEvent(data) {
    switch (data.k) {
      case "chat":
        state.chatId = data.chatId;
        state.project = data.project || state.project;
        state.title = data.title || state.title;
        if (state.mode === "bench") els.pageTitle.textContent = state.title;
        updateProjectLabel();
        refreshChats();
        break;
      case "user_echo":
        addMsg("user", data.text);
        break;
      case "status":
        // 只更新文案；真正 busy 由 started/run_end 等控制
        if (state.busy) {
          els.runFlag.textContent = data.text || "制作中";
          els.workNow.textContent = data.text || "";
          // 限流重试时保留已有 thinkAcc
          showThink(data.text || "正在思考…", true);
        }
        break;
      case "think_delta":
        if (!state.busy) break;
        els.runFlag.textContent = "思考中…";
        appendThink(data.text || "");
        els.workNow.textContent = "思考中…";
        break;
      case "say_delta":
        // 正文开始后收起思考框，但不清空 thinkAcc（若又被限流可继续）
        collapseThinkKeep();
        appendLive(data.text || "");
        updateCtxMeter(data.text);
        break;
      case "say_settled":
      case "say":
        collapseThinkKeep();
        settleLive(data.text || "");
        updateCtxMeter();
        break;
      case "say_settle_cancel":
        cancelLive();
        break;
      case "tool":
        addStep(data.name || "工具", data.brief || "", false, data.id);
        break;
      case "tool_note":
        if (data.type === "write" && data.path) {
          state.freshPaths.add(data.path);
          loadFiles(true);
        }
        break;
      case "tool_done":
        addStep(data.ok ? "完成" : "失败", (data.out || "").slice(0, 80), !data.ok, data.id);
        break;
      case "error":
        addMsg("system", data.text || "出错");
        els.conversation.lastChild?.classList.add("err");
        break;
      case "files":
        if (data.project) state.project = data.project;
        loadFiles(true);
        break;
      case "memory_updated":
        toast(`已记住 ${data.count || 1} 条`);
        break;
      case "memory_status":
        // 收尾后的后台动作，只提示，不改 busy
        els.draftHint.textContent = data.text || "";
        break;
      case "think_keep":
        // 限流/出错：保留思考，只改标题
        if (els.thinkBox) els.thinkBox.hidden = false;
        if (els.thinkText) els.thinkText.textContent = "思考已中断 · 已保留";
        if (els.thinkBody && thinkAcc) {
          els.thinkBody.hidden = false;
          els.thinkBody.textContent = thinkAcc.slice(-2000);
          syncThinkScroll();
        }
        break;
      case "run_end":
        if (state.liveBubble) cancelLive();
        // 有错误时不硬清思考
        hideThink(true);
        streamAbort = null;
        setBusy(false);
        loadFiles(true);
        refreshChats();
        updateCtxMeter();
        break;
      default:
        break;
    }
  }

  function friendlyNetErr(e) {
    const raw = String(e?.message || e || "");
    if (/network error|failed to fetch|load failed|err_connection|ERR_/i.test(raw)) {
      return "网络连不上上游。请检查：代理/VPN 是否开着、Base URL 是否正确、稍后重试。";
    }
    return raw || "未知错误";
  }

  async function ensureApiKey() {
    try {
      const res = await fetch("/api/config");
      const cfg = await res.json();
      if (cfg.apiKeySet) return true;
    } catch { /* 网络失败时放行，让后端报具体错 */ }
    toast("尚未保存 API Key，请在设置里填写并保存");
    openSettings();
    return false;
  }

  async function sendMessage(text) {
    if (!text) return;
    if (state.busy) {
      pendingQueue.push(text);
      addMsg("system", `已排队插话：${text.slice(0, 60)}${text.length > 60 ? "…" : ""}`);
      toast("已排队，这一轮做完自动接上");
      return;
    }
    if (!(await ensureApiKey())) return;
    setBusy(true, "连接中…");
    resetWorkCard();
    // 空窗期立刻给反馈
    showThink("正在思考中… 连接上游", true);
    els.workCard.hidden = false;
    els.workCard.classList.add("running");
    els.workNow.textContent = "正在思考中…";
    els.filePreview.hidden = true;

    streamAbort = new AbortController();
    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, chatId: state.chatId }),
      signal: streamAbort.signal,
    }).then(async (res) => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try { handleEvent(JSON.parse(line.slice(6))); } catch { /* ignore */ }
        }
      }
      if (state.liveBubble) cancelLive();
      streamAbort = null;
      setBusy(false);
      loadFiles(true);
    }).catch((e) => {
      streamAbort = null;
      if (e?.name === "AbortError") {
        if (state.liveBubble) cancelLive();
        hideThink(true);
        setBusy(false);
        return;
      }
      if (state.liveBubble) cancelLive();
      addMsg("system", friendlyNetErr(e));
      els.conversation.lastChild?.classList.add("err");
      // 失败保留思考过程
      if (els.thinkBox) els.thinkBox.hidden = false;
      if (els.thinkText) els.thinkText.textContent = "本轮失败 · 思考已保留";
      if (els.thinkBody && thinkAcc) {
        els.thinkBody.hidden = false;
        els.thinkBody.textContent = thinkAcc.slice(-2000);
        syncThinkScroll();
      }
      setBusy(false);
    });
  }

  const CW_TO_HISTORY = {
    "16k": 12,
    "32k": 24,
    "64k": 36,
    "128k": 64,
    "200k": 96,
    "1m": 160,
  };

  function historyToContextWindow(n) {
    const h = Number(n) || 36;
    if (h <= 16) return "16k";
    if (h <= 28) return "32k";
    if (h <= 40) return "64k";
    if (h <= 80) return "128k";
    if (h <= 120) return "200k";
    return "1m";
  }

  async function loadSettings() {
    try {
      const res = await fetch("/api/config");
      const cfg = await res.json();
      const f = els.settingsForm;
      f.baseUrl.value = cfg.baseUrl || "";
      f.model.value = cfg.model || "";
      f.modId.value = cfg.modId || "";
      f.mcVersion.value = cfg.mcVersion || "";
      f.workspaceName.value = cfg.workspaceName || "";
      if (f.loader) f.loader.value = cfg.loader || "neoforge";
      if (f.apiRetries) f.apiRetries.value = cfg.apiRetries ?? 4;
      if (f.autoMemory) f.autoMemory.checked = cfg.autoMemory !== false;
      if (els.loaderQuick) els.loaderQuick.value = cfg.loader || "neoforge";
      if (els.mcQuick && cfg.mcVersion) {
        const exists = [...els.mcQuick.options].some((o) => o.value === cfg.mcVersion);
        if (!exists) {
          const opt = document.createElement("option");
          opt.value = cfg.mcVersion;
          opt.textContent = cfg.mcVersion;
          els.mcQuick.appendChild(opt);
        }
        els.mcQuick.value = cfg.mcVersion;
      }
      if (f.gradleCmd) f.gradleCmd.value = cfg.gradleCmd || "";
      if (f.updateRepo) f.updateRepo.value = cfg.updateRepo || "";
      if (f.gradleTimeoutSec) f.gradleTimeoutSec.value = cfg.gradleTimeoutSec || 180;
      if (f.temperature) f.temperature.value = cfg.temperature ?? 0.4;
      if (f.topP) f.topP.value = cfg.topP ?? 1;
      if (f.maxTokens) f.maxTokens.value = cfg.maxTokens ?? 32768;
      if (f.reasoningEffort) f.reasoningEffort.value = cfg.reasoningEffort || "off";
      if (f.reasoningStyle) f.reasoningStyle.value = cfg.reasoningStyle || "auto";
      if (f.historyLimit) f.historyLimit.value = cfg.historyLimit ?? 36;
      if (f.contextWindow) f.contextWindow.value = historyToContextWindow(cfg.historyLimit ?? 36);
      if (f.apiTimeoutSec) f.apiTimeoutSec.value = cfg.apiTimeoutSec ?? 180;
      f.apiKey.value = "";
      els.keyHint.textContent = cfg.apiKeySet
        ? `已保存：${cfg.apiKeyHint}（留空则不改）`
        : "尚未配置 API Key";
    } catch { /* ignore */ }
  }

  function openSettings() {
    loadSettings();
    els.settingsModal.hidden = false;
    els.backdrop.hidden = false;
  }

  function closeSettings() {
    els.settingsModal.hidden = true;
    if (window.NFHideBackdropIfIdle) window.NFHideBackdropIfIdle();
  }

  function closeDrawers() {
    els.sidebar.classList.remove("open");
    els.assets?.classList.remove("open");
    if (window.NFHideBackdropIfIdle) window.NFHideBackdropIfIdle();
  }
  window.NFCloseDrawersApp = closeDrawers;

  function growInput() {
    els.input.style.height = "auto";
    els.input.style.height = `${Math.min(160, els.input.scrollHeight)}px`;
  }

  function bind() {
    $("btnNew").onclick = () => {
      if (state.busy) { toast("先停止这一轮"); return; }
      setMode("bench");
      startNewChat();
    };
    $("btnSettings").onclick = () => {
      openSettings();
      const f = els.settingsForm;
      if (f.contextWindow && f.historyLimit && !f.contextWindow.dataset.wired) {
        f.contextWindow.dataset.wired = "1";
        f.contextWindow.addEventListener("change", () => {
          f.historyLimit.value = String(CW_TO_HISTORY[f.contextWindow.value] || 36);
        });
      }
    };
    $("btnSettings2").onclick = () => $("btnSettings").click();

    // 顶栏快捷：加载器 / MC 版本 — 改完立刻写进配置
    async function saveQuick(payload, okMsg) {
      try {
        const res = await fetch("/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("fail");
        toast(okMsg || "已保存");
      } catch {
        toast("保存失败");
      }
    }
    if (els.loaderQuick) {
      els.loaderQuick.onchange = () => {
        saveQuick({ loader: els.loaderQuick.value }, `加载器：${els.loaderQuick.value}`);
      };
    }
    if (els.mcQuick) {
      els.mcQuick.onchange = () => {
        saveQuick({ mcVersion: els.mcQuick.value }, `版本：${els.mcQuick.value}`);
      };
    }

    // 优化想法
    const btnRefine = $("btnRefine");
    if (btnRefine) {
      btnRefine.onclick = async () => {
        const text = els.input.value.trim();
        if (!text) {
          toast("先写一句想法");
          return;
        }
        btnRefine.disabled = true;
        btnRefine.textContent = "优化中…";
        try {
          const res = await fetch("/api/refine", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          const refined = (data.refined || "").trim();
          if (refined) {
            els.input.value = refined;
            growInput();
            toast("已整理成可开工需求，可再改");
          }
        } catch (e) {
          toast(e.message || "优化失败");
        } finally {
          btnRefine.disabled = false;
          btnRefine.textContent = "优化想法";
        }
      };
    }

    if (els.ctxMeter) {
      els.ctxMeter.onclick = toggleCtxDetail;
      els.ctxMeter.style.cursor = "pointer";
    }
    // 点外面关小面板
    document.addEventListener("click", (e) => {
      if (!els.ctxDetail || els.ctxDetail.hidden) return;
      if (e.target.closest(".ctx-wrap")) return;
      closeCtxDetail();
    });

    // 记忆（事实列表）
    const memList = $("memList");
    const memText = $("memText");
    const memKind = $("memKind");
    const memSearch = $("memSearch");

    const renderMemList = (facts) => {
      if (!memList) return;
      if (!facts || !facts.length) {
        memList.innerHTML = '<div class="empty-state">暂无记忆。可手动添加，或开着自动总结做完一轮对话。</div>';
        return;
      }
      memList.textContent = "";
      facts.forEach((f) => {
        const row = document.createElement("div");
        row.className = "mem-item";
        const kind = document.createElement("span");
        kind.className = `kind ${f.kind || "fact"}`;
        kind.textContent = f.kind || "fact";
        const mid = document.createElement("div");
        const text = document.createElement("div");
        text.className = "text";
        text.textContent = f.text || "";
        const meta = document.createElement("div");
        meta.className = "meta";
        const d = new Date(f.createdAt || Date.now());
        meta.textContent = `${(f.tags || []).join(" · ") || "—"} · ${d.toLocaleString()} · ${f.source || ""}`;
        mid.appendChild(text);
        mid.appendChild(meta);
        const del = document.createElement("button");
        del.type = "button";
        del.className = "del";
        del.textContent = "×";
        del.title = "删除这条记忆";
        del.onclick = async () => {
          try {
            const res = await fetch(`/api/memory/${encodeURIComponent(f.id)}`, { method: "DELETE" });
            const data = await res.json();
            renderMemList(data.facts || []);
            toast("已删除");
          } catch {
            toast("删除失败");
          }
        };
        row.appendChild(kind);
        row.appendChild(mid);
        row.appendChild(del);
        memList.appendChild(row);
      });
    };

    const loadMem = async (q) => {
      try {
        const url = q ? `/api/memory?q=${encodeURIComponent(q)}` : "/api/memory";
        const res = await fetch(url);
        const data = await res.json();
        renderMemList(data.facts || []);
      } catch {
        toast("读取记忆失败");
      }
    };

    const openMemory = async () => {
      if (!els.memoryModal) return;
      await loadMem(memSearch?.value?.trim() || "");
      els.memoryModal.hidden = false;
      els.backdrop.hidden = false;
    };
    const closeMemory = () => {
      if (!els.memoryModal) return;
      els.memoryModal.hidden = true;
      if (window.NFHideBackdropIfIdle) window.NFHideBackdropIfIdle();
    };
    const btnMemory = $("btnMemory");
    if (btnMemory) btnMemory.onclick = openMemory;
    $("btnCloseMemory") && ($("btnCloseMemory").onclick = closeMemory);
    $("btnCancelMemory") && ($("btnCancelMemory").onclick = closeMemory);

    const btnMemAdd = $("btnMemAdd");
    if (btnMemAdd) {
      btnMemAdd.onclick = async () => {
        const text = (memText?.value || "").trim();
        if (!text) {
          toast("先写要记住的内容");
          return;
        }
        try {
          const res = await fetch("/api/memory", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, kind: memKind?.value || "fact", tags: ["manual"] }),
          });
          if (!res.ok) throw new Error("fail");
          const data = await res.json();
          if (memText) memText.value = "";
          renderMemList(data.facts || []);
          toast("已添加");
        } catch {
          toast("添加失败");
        }
      };
    }
    $("btnMemRefresh") && ($("btnMemRefresh").onclick = () => loadMem(memSearch?.value?.trim() || ""));
    $("btnMemClear") && ($("btnMemClear").onclick = async () => {
      if (!confirm("清空全部记忆？")) return;
      try {
        await fetch("/api/memory", { method: "DELETE" });
        renderMemList([]);
        toast("已清空");
      } catch {
        toast("清空失败");
      }
    });
    if (memSearch) {
      let t = null;
      memSearch.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(() => loadMem(memSearch.value.trim()), 250);
      });
    }

    const btnModels = $("btnFetchModels");
    if (btnModels) {
      btnModels.onclick = async () => {
        if (btnModels.disabled) return;
        const f = els.settingsForm;
        const baseUrl = f.baseUrl.value.trim();
        const apiKey = f.apiKey.value.trim();
        const prev = btnModels.textContent;
        btnModels.disabled = true;
        btnModels.textContent = "获取中…";
        try {
          const res = await fetch("/api/models", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              baseUrl,
              ...(apiKey ? { apiKey } : {}),
              model: f.model.value.trim(),
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          const models = data.models || [];
          const dl = document.getElementById("modelPresets");
          if (!dl) throw new Error("找不到下拉列表");
          if (!models.length) {
            toast("上游没有返回模型");
            return;
          }
          // 保留内置几条，再合并上游列表
          const keep = ["deepseek-chat", "deepseek-reasoner"];
          dl.textContent = "";
          models.forEach((id) => {
            const opt = document.createElement("option");
            opt.value = id;
            dl.appendChild(opt);
          });
          keep.forEach((id) => {
            if (!models.includes(id)) {
              const opt = document.createElement("option");
              opt.value = id;
              dl.appendChild(opt);
            }
          });
          // datalist 会按输入框当前文字过滤，输入框里若还是 deepseek-chat
          // 下拉就只剩匹配项。改成完整可点列表，避免“加载了 8 个却只看见 1 个”。
          const listBox = document.getElementById("modelList");
          const allIds = models.slice();
          keep.forEach((id) => { if (!allIds.includes(id)) allIds.push(id); });
          if (listBox) {
            listBox.hidden = false;
            listBox.textContent = "";
            const active = f.model.value.trim();
            allIds.forEach((id) => {
              const b = document.createElement("button");
              b.type = "button";
              b.textContent = id;
              b.title = "点击填入模型名";
              if (id === active) b.classList.add("is-active");
              b.onclick = () => {
                f.model.value = id;
                listBox.querySelectorAll("button").forEach((x) => x.classList.remove("is-active"));
                b.classList.add("is-active");
              };
              listBox.appendChild(b);
            });
          }
          // 刷新 datalist：先清空再恢复，避免旧过滤状态卡住
          const cur = f.model.value;
          f.model.value = "";
          f.model.value = cur;
          toast(`已加载 ${models.length} 个模型 · 点下方模型名选择`);
          // 「获取列表」本身不落盘。若表单里填了 key，顺手保存，
          // 否则用户以为配好了，工作台对话仍会报「未配置 apiKey」。
          if (apiKey) {
            try {
              await fetch("/api/config", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ apiKey }),
              });
              els.keyHint.textContent = `已保存：${apiKey.slice(0, 6)}…${apiKey.slice(-4)}（留空则不改）`;
            } catch { /* 保存失败不打断列表 */ }
          }
        } catch (e) {
          toast(e.message || "获取列表失败");
        } finally {
          btnModels.disabled = false;
          btnModels.textContent = prev || "获取列表";
        }
      };
    }

    const btnUpd = $("btnCheckUpdate");
    if (btnUpd) {
      btnUpd.onclick = async () => {
        btnUpd.disabled = true;
        btnUpd.textContent = "检查中…";
        try {
          const res = await fetch("/api/update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            toast(data.error || "检查更新失败");
            if (data.local) toast(`本地版本 ${data.local}`);
            return;
          }
          if (!data.updateAvailable) {
            toast(`已是最新（${data.local}）`);
            return;
          }
          toast(`发现新版本 ${data.remote}（本地 ${data.local}）`);
          const go = confirm(
            `发现新版本 ${data.remote}\n本地：${data.local}\n\n${data.notes || ""}\n\n点「确定」一键更新（保留配置与工程数据）。\n更新后请关闭窗口，用 npm start 或 node boot.js 重新打开。`
          );
          if (!go) return;
          btnUpd.textContent = "更新中…";
          const applyRes = await fetch("/api/update/apply", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          });
          const apply = await applyRes.json().catch(() => ({}));
          if (!apply.ok) {
            toast(apply.message || "更新失败");
            return;
          }
          alert(
            `更新完成：${apply.message}\n\n已覆盖：${(apply.copied || []).join("、")}\n\n请关闭本页，然后重新运行：\nnpm start\n（或 node boot.js）`
          );
        } catch {
          toast("检查更新失败（网络）");
        } finally {
          btnUpd.disabled = false;
          btnUpd.textContent = "检查更新";
        }
      };
    }
    $("btnCloseSettings").onclick = closeSettings;
    $("btnCancelSettings").onclick = closeSettings;
    $("btnRefresh").onclick = () => loadFiles(false);
    $("btnClosePreview").onclick = () => { els.filePreview.hidden = true; };

    const stopBtn = $("btnStop");
    if (stopBtn) {
      stopBtn.onclick = () => stopCurrent();
    }

    $("btnClearHistory").onclick = async () => {
      if (!state.chatId) { toast("当前是新对话"); return; }
      if (state.busy) { toast("先停止这一轮"); return; }
      const keep = prompt("保留最近几轮对话？\n0 = 全部清空（文件保留）", "0");
      if (keep === null) return;
      const n = Math.max(0, parseInt(keep, 10) || 0);
      try {
        const res = await fetch(`/api/chats/${state.chatId}/clear`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keepTurns: n }),
        });
        if (!res.ok) throw new Error("fail");
        toast(n ? `已保留最近 ${n} 轮` : "已清空对话");
        openChat(state.chatId);
      } catch {
        toast("清理失败");
      }
    };

    $("btnMenu").onclick = () => {
      els.sidebar.classList.add("open");
      els.backdrop.hidden = false;
    };
    $("btnFilesMobile").onclick = () => {
      els.assets.classList.add("open");
      els.backdrop.hidden = false;
    };
    $("btnCloseAssets").onclick = closeDrawers;
    els.backdrop.onclick = () => {
      closeDrawers();
      closeSettings();
      const gen = $("genModal");
      if (gen && !gen.hidden && !window.NFLearn?.genBusy) gen.hidden = true;
      const checker = $("checker");
      if (checker?.classList.contains("is-open")) {
        checker.classList.remove("is-open");
        checker.setAttribute("aria-hidden", "true");
      }
      const mem = $("memoryModal");
      if (mem && !mem.hidden) mem.hidden = true;
      const pm = $("planModal");
      if (pm && !pm.hidden) pm.hidden = true;
      if (window.NFHideBackdropIfIdle) window.NFHideBackdropIfIdle();
    };

    els.composer.onsubmit = (e) => {
      e.preventDefault();
      const text = els.input.value.trim();
      // 忙且没字 → 当停止键用
      if (state.busy && !text) {
        stopCurrent();
        return;
      }
      if (!text) return;
      els.input.value = "";
      growInput();
      dispatchText(text);
    };

    if (els.planSwitch) {
      els.planSwitch.onchange = () => {
        if (els.planToggleHint) {
          els.planToggleHint.textContent = els.planSwitch.checked
            ? "打开 · 先拆创意再开工"
            : "关闭 · 原话直接制作";
        }
      };
    }
    $("btnClosePlan") && ($("btnClosePlan").onclick = closePlanModal);
    $("btnCancelPlan") && ($("btnCancelPlan").onclick = closePlanModal);
    $("btnPlanSendRaw") && ($("btnPlanSendRaw").onclick = () => {
      const raw = planState.original;
      closePlanModal();
      if (raw) sendMessage(raw);
    });
    $("btnPlanBuild") && ($("btnPlanBuild").onclick = () => {
      const prompt = buildPromptFromPlan();
      closePlanModal();
      if (prompt) sendMessage(prompt);
    });

    els.input.addEventListener("input", () => {
      growInput();
      els.draftHint.textContent = els.input.value ? `${els.input.value.length} 字` : "";
      if (state.busy) {
        const has = Boolean(els.input.value.trim());
        els.sendButton.textContent = has ? "插话" : "停止";
        els.sendButton.classList.toggle("stopping", !has);
      } else {
        els.sendButton.disabled = !els.input.value.trim();
      }
    });

    els.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        els.composer.requestSubmit();
      }
    });

    document.querySelectorAll(".starters button").forEach((btn) => {
      btn.onclick = () => {
        const text = btn.getAttribute("data-ask");
        if (text) dispatchText(text);
      };
    });

    els.settingsForm.onsubmit = async (e) => {
      e.preventDefault();
      const f = els.settingsForm;
      const payload = {
        baseUrl: f.baseUrl.value.trim(),
        model: f.model.value.trim(),
        modId: f.modId.value.trim(),
        mcVersion: f.mcVersion.value.trim(),
        workspaceName: f.workspaceName.value.trim(),
      };
      if (f.loader) payload.loader = f.loader.value || "neoforge";
      if (f.apiRetries) {
        const r = parseInt(f.apiRetries.value, 10);
        if (r >= 0) payload.apiRetries = r;
      }
      if (f.autoMemory) payload.autoMemory = Boolean(f.autoMemory.checked);
      if (f.temperature) {
        const t = Number(f.temperature.value);
        if (Number.isFinite(t)) payload.temperature = t;
      }
      if (f.topP) {
        const tp = Number(f.topP.value);
        if (Number.isFinite(tp) && tp > 0 && tp <= 1) payload.topP = tp;
      }
      if (f.maxTokens) {
        const m = parseInt(f.maxTokens.value, 10);
        if (m > 0) payload.maxTokens = m;
      }
      if (f.reasoningEffort) payload.reasoningEffort = f.reasoningEffort.value || "off";
      if (f.reasoningStyle) payload.reasoningStyle = f.reasoningStyle.value || "auto";
      // 优先：高级里手填的 historyLimit；否则按上下文窗口下拉换算
      let history = 0;
      if (f.historyLimit && f.historyLimit.value) {
        history = parseInt(f.historyLimit.value, 10) || 0;
      }
      if (!history && f.contextWindow) {
        history = CW_TO_HISTORY[f.contextWindow.value] || 36;
      }
      if (history > 0) payload.historyLimit = history;
      if (f.apiTimeoutSec) {
        const s = parseInt(f.apiTimeoutSec.value, 10);
        if (s > 0) payload.apiTimeoutSec = s;
      }
      if (f.gradleCmd) payload.gradleCmd = f.gradleCmd.value.trim();
      if (f.updateRepo) payload.updateRepo = f.updateRepo.value.trim();
      if (f.gradleTimeoutSec) payload.gradleTimeoutSec = Number(f.gradleTimeoutSec.value) || 180;
      if (f.apiKey.value.trim()) payload.apiKey = f.apiKey.value.trim();
      try {
        const res = await fetch("/api/config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error("save failed");
        toast("设置已保存");
        closeSettings();
      } catch {
        toast("保存失败");
      }
    };
  }

  async function init() {
    bind();
    growInput();
    setMode("learn");
    refreshChats();
    loadSettings();
    if (window.NFLearnInit) await window.NFLearnInit();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
