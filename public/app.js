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
  };

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

  function setBusy(busy, label) {
    state.busy = busy;
    els.runFlag.textContent = label || (busy ? "制作中" : "空闲");
    els.runFlag.classList.toggle("busy", busy);
    els.sendButton.disabled = busy;
    els.sendButton.textContent = busy ? "制作中…" : "发送";
    els.workCard.hidden = !busy && !state.steps;
    els.workCard.classList.toggle("running", busy);
    const stopBtn = $("btnStop");
    if (stopBtn) stopBtn.hidden = !busy;
    if (!busy) {
      els.workTitle.textContent = state.steps ? "这一轮做完了" : "正在制作";
    }
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
        setBusy(true, data.text || "制作中");
        els.workNow.textContent = data.text || "";
        break;
      case "think_delta":
        // R1 等思考过程：只更新状态行，不进对话正文
        setBusy(true, "思考中…");
        els.workNow.textContent = ("思考中… " + (data.text || "")).slice(0, 48);
        break;
      case "say_delta":
        appendLive(data.text || "");
        break;
      case "say_settled":
      case "say":
        settleLive(data.text || "");
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
      case "run_end":
        if (state.liveBubble) cancelLive();
        setBusy(false);
        loadFiles(true);
        refreshChats();
        break;
      default:
        break;
    }
  }

  function sendMessage(text) {
    if (state.busy) {
      toast("这一轮还在做，稍等");
      return;
    }
    setBusy(true, "连接中…");
    resetWorkCard();
    els.workCard.hidden = false;
    els.workCard.classList.add("running");
    els.filePreview.hidden = true;

    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, chatId: state.chatId }),
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
      setBusy(false);
      loadFiles(true);
    }).catch((e) => {
      if (state.liveBubble) cancelLive();
      addMsg("system", e.message || String(e));
      els.conversation.lastChild?.classList.add("err");
      setBusy(false);
    });
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
      if (f.gradleCmd) f.gradleCmd.value = cfg.gradleCmd || "";
      if (f.updateRepo) f.updateRepo.value = cfg.updateRepo || "";
      if (f.gradleTimeoutSec) f.gradleTimeoutSec.value = cfg.gradleTimeoutSec || 180;
      if (f.temperature) f.temperature.value = cfg.temperature ?? 0.4;
      if (f.topP) f.topP.value = cfg.topP ?? 1;
      if (f.maxTokens) f.maxTokens.value = cfg.maxTokens ?? 8192;
      if (f.reasoningEffort) f.reasoningEffort.value = cfg.reasoningEffort || "off";
      if (f.historyLimit) f.historyLimit.value = cfg.historyLimit ?? 36;
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
    $("btnSettings").onclick = openSettings;
    $("btnSettings2").onclick = openSettings;

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
      stopBtn.onclick = async () => {
        if (!state.chatId) return;
        stopBtn.disabled = true;
        try {
          await fetch("/api/stop", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chatId: state.chatId }),
          });
          toast("已请求停止");
        } catch {
          toast("停止失败");
        } finally {
          stopBtn.disabled = false;
        }
      };
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
      if (window.NFHideBackdropIfIdle) window.NFHideBackdropIfIdle();
    };

    els.composer.onsubmit = (e) => {
      e.preventDefault();
      const text = els.input.value.trim();
      if (!text) return;
      els.input.value = "";
      growInput();
      sendMessage(text);
    };

    els.input.addEventListener("input", () => {
      growInput();
      els.draftHint.textContent = els.input.value ? `${els.input.value.length} 字` : "";
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
        if (text) sendMessage(text);
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
      if (f.historyLimit) {
        const h = parseInt(f.historyLimit.value, 10);
        if (h > 0) payload.historyLimit = h;
      }
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
