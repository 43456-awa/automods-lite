/* 学习模式：轨道、章节、提问、生成 */
(function () {
  "use strict";

  const learn = {
    mode: "learn",
    tracks: [],
    chapterId: null,
    chapter: null,
    askHistory: [],
    askBusy: false,
    genBusy: false,
  };
  window.NFLearn = learn;

  const $ = (id) => document.getElementById(id);
  const els = {
    trackList: $("trackList"),
    chapterRoot: $("chapterRoot"),
    learnHero: $("learnHero"),
    askThread: $("askThread"),
    askInput: $("askInput"),
    askSend: $("askSend"),
    askForm: $("askForm"),
    askChapterLabel: $("askChapterLabel"),
    pageTitle: $("pageTitle"),
    genModal: $("genModal"),
    genForm: $("genForm"),
    genTopic: $("genTopic"),
    genStatus: $("genStatus"),
    checker: $("checker"),
    codeInput: $("codeInput"),
    checkResults: $("checkResults"),
    checkHint: $("checkHint"),
    toast: $("toast"),
    backdrop: $("backdrop"),
  };

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { els.toast.hidden = true; }, 2400);
  }
  window.NFToast = toast;

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

  async function loadTracks() {
    try {
      const res = await fetch("/api/learn/tracks");
      const data = await res.json();
      learn.tracks = data.tracks || [];
      renderTracks();
    } catch {
      toast("课程加载失败");
    }
  }

  function renderTracks() {
    els.trackList.textContent = "";
    for (const track of learn.tracks) {
      const block = document.createElement("div");
      block.className = "track-block";
      const head = document.createElement("div");
      head.className = "track-head";
      head.innerHTML = `<b>${escapeHtml(track.title)}</b><small>${escapeHtml(track.description || "")}</small>`;
      block.appendChild(head);
      for (const ch of track.chapters || []) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chapter-link" + (ch.id === learn.chapterId ? " is-active" : "");
        btn.dataset.id = ch.id;
        btn.innerHTML = `<span class="name">${escapeHtml(ch.short || ch.title)}</span>`;
        if (ch.custom) {
          const badge = document.createElement("span");
          badge.className = "tag-mini";
          badge.textContent = "自定义";
          btn.appendChild(badge);
        }
        btn.onclick = () => openChapter(ch.id);
        block.appendChild(btn);
      }
      if (track.id === "custom" && !(track.chapters || []).length) {
        const empty = document.createElement("div");
        empty.className = "foot-note";
        empty.style.textAlign = "left";
        empty.textContent = "还没有自定义章节";
        block.appendChild(empty);
      }
      els.trackList.appendChild(block);
    }
  }

  async function openChapter(id) {
    try {
      const res = await fetch(`/api/learn/chapter?id=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error("missing");
      const data = await res.json();
      const ch = data.chapter;
      learn.chapterId = ch.id;
      learn.chapter = ch;
      learn.askHistory = [];
      els.pageTitle.textContent = ch.title;
      els.askChapterLabel.textContent = `《${ch.title}》`;
      els.askInput.disabled = false;
      els.askSend.disabled = false;
      els.askThread.innerHTML = "";
      renderChapter(ch);
      renderTracks();
      closeDrawers();
      window.scrollTo(0, 0);
    } catch {
      toast("打不开章节");
    }
  }

  function wireCopy(root) {
    root.querySelectorAll(".codeblock").forEach((block) => {
      const btn = block.querySelector(".btn-copy");
      if (!btn || btn.dataset.wired) return;
      btn.dataset.wired = "1";
      btn.addEventListener("click", async () => {
        const pre = block.querySelector("pre");
        const text = pre ? pre.innerText : "";
        try {
          await navigator.clipboard.writeText(text);
          toast("已复制");
        } catch {
          toast("复制失败");
        }
      });
    });
  }

  function renderChapter(ch) {
    const tags = (ch.tags || []).map((t, i) =>
      `<span class="tag ${i === 0 ? "ok" : i === 1 ? "diamond" : ""}">${escapeHtml(t)}</span>`
    ).join("");

    els.chapterRoot.innerHTML = `
      <p class="chapter-kicker">${ch.custom ? "自定义章节" : "Chapter"} · ${escapeHtml(ch.track || "")}</p>
      <h1>${escapeHtml(ch.title)}</h1>
      <p class="chapter-lead">${escapeHtml(ch.lead || "")}</p>
      ${tags ? `<div class="tag-row">${tags}</div>` : ""}
      <div class="chapter-body">${ch.body || ""}</div>
      ${ch.custom ? `<div class="chapter-actions"><button type="button" class="btn btn-ghost" id="btnDelChapter">删除本自定义章节</button></div>` : ""}
    `;
    wireCopy(els.chapterRoot);
    const del = $("btnDelChapter");
    if (del) {
      del.onclick = async () => {
        if (!confirm("删除这个自定义章节？")) return;
        await fetch(`/api/learn/chapter?id=${encodeURIComponent(ch.id)}`, { method: "DELETE" });
        toast("已删除");
        learn.chapterId = null;
        learn.chapter = null;
        els.chapterRoot.innerHTML = `<div class="hero"><h1>章节已删除</h1><p>左侧再选一章，或用 AI 生成新的。</p></div>`;
        els.askInput.disabled = true;
        els.askSend.disabled = true;
        loadTracks();
      };
    }
  }

  function addAskMsg(role, text, streaming) {
    const node = document.createElement("div");
    node.className = `msg ${role}`;
    if (role === "assistant") {
      if (streaming) node.textContent = text;
      else renderMd(text, node);
    } else {
      node.textContent = text;
    }
    els.askThread.appendChild(node);
    els.askThread.scrollTop = els.askThread.scrollHeight;
    return node;
  }

  async function askQuestion(question) {
    if (!learn.chapterId || learn.askBusy) return;
    learn.askBusy = true;
    els.askSend.disabled = true;
    addAskMsg("user", question);
    const live = addAskMsg("assistant", "", true);
    let acc = "";

    try {
      const res = await fetch("/api/learn/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterId: learn.chapterId,
          question,
          history: learn.askHistory.slice(-6),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let data;
          try { data = JSON.parse(line.slice(6)); } catch { continue; }
          if (data.k === "delta" || data.k === "say_delta") {
            acc += data.text || "";
            live.textContent = acc;
            els.askThread.scrollTop = els.askThread.scrollHeight;
          } else if (data.k === "say_settled" || data.k === "done") {
            if (data.text) acc = data.text;
          } else if (data.k === "error") {
            throw new Error(data.text || "提问失败");
          }
        }
      }
      if (acc) {
        live.remove();
        addAskMsg("assistant", acc);
        learn.askHistory.push({ role: "user", content: question });
        learn.askHistory.push({ role: "assistant", content: acc });
      }
    } catch (e) {
      live.textContent = `出错：${e.message || e}`;
    } finally {
      learn.askBusy = false;
      els.askSend.disabled = false;
    }
  }

  /* 生成章节 */
  function openGen() {
    els.genModal.hidden = false;
    els.backdrop.hidden = false;
    els.genStatus.hidden = true;
    els.genStatus.textContent = "";
  }
  function closeGen() {
    if (learn.genBusy) return;
    els.genModal.hidden = true;
    hideBackdropIfIdle();
  }

  async function generate() {
    const topic = els.genTopic.value.trim();
    if (!topic) { toast("先写主题"); return; }
    if (learn.genBusy) return;
    learn.genBusy = true;
    els.genStatus.hidden = false;
    els.genStatus.textContent = "正在生成…";
    $("btnStartGen").disabled = true;

    try {
      const res = await fetch("/api/learn/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let saved = null;
      let preview = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() || "";
        for (const part of parts) {
          const line = part.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          let data;
          try { data = JSON.parse(line.slice(6)); } catch { continue; }
          if (data.k === "delta") {
            preview += data.text || "";
            els.genStatus.textContent = "生成中… " + preview.slice(-80);
          } else if (data.k === "saved") {
            saved = data.chapter;
          } else if (data.k === "error") {
            throw new Error(data.text || "生成失败");
          }
        }
      }
      if (saved) {
        toast(`已生成《${saved.title}》`);
        els.genModal.hidden = true;
        els.genTopic.value = "";
        await loadTracks();
        await openChapter(saved.id);
      }
    } catch (e) {
      els.genStatus.textContent = e.message || String(e);
    } finally {
      learn.genBusy = false;
      $("btnStartGen").disabled = false;
      hideBackdropIfIdle();
    }
  }

  /* checker */
  let checkerLang = "java";
  function openChecker() {
    els.checker.classList.add("is-open");
    els.checker.setAttribute("aria-hidden", "false");
    els.backdrop.hidden = false;
    setTimeout(() => els.codeInput.focus(), 40);
  }
  function closeChecker() {
    els.checker.classList.remove("is-open");
    els.checker.setAttribute("aria-hidden", "true");
    hideBackdropIfIdle();
  }

  function updateCheckHint() {
    const n = els.codeInput.value ? els.codeInput.value.split("\n").length : 0;
    els.checkHint.textContent = `${n} 行`;
  }

  function runCheck() {
    const code = els.codeInput.value || "";
    if (!code.trim()) {
      els.checkResults.innerHTML = '<div class="empty-state">先粘贴代码。</div>';
      return;
    }
    if (!window.NFChecker?.runCheck) {
      els.checkResults.innerHTML = '<div class="empty-state">检查器未加载</div>';
      return;
    }
    const result = window.NFChecker.runCheck(checkerLang, code);
    const head = `<div class="check-summary">
      <div class="stat error"><div class="stat-n">${result.errors}</div><div class="stat-l">错误</div></div>
      <div class="stat warn"><div class="stat-n">${result.warns}</div><div class="stat-l">警告</div></div>
      <div class="stat ok"><div class="stat-n">${result.infos}</div><div class="stat-l">提示</div></div>
    </div>`;
    if (!result.issues.length) {
      els.checkResults.innerHTML = head + '<div class="all-good">未发现问题</div>';
      return;
    }
    const body = result.issues.map((issue) => {
      const cls = issue.level === "error" ? "error" : issue.level === "warn" ? "warn" : "info";
      const label = issue.level === "error" ? "错误" : issue.level === "warn" ? "警告" : "提示";
      return `<div class="issue">
        <div class="issue-head"><span class="badge ${cls}">${label}</span>
        <span class="issue-title">${escapeHtml(issue.title)}</span></div>
        <div class="issue-body">${escapeHtml(issue.body || "")}</div>
        ${issue.fix ? `<div class="issue-fix">${escapeHtml(issue.fix)}</div>` : ""}
      </div>`;
    }).join("");
    els.checkResults.innerHTML = head + body;
  }

  function hideBackdropIfIdle() {
    const bench = window.NFBench;
    const settingsOpen = !$("settingsModal").hidden;
    const genOpen = !els.genModal.hidden;
    const checkerOpen = els.checker.classList.contains("is-open");
    const sideOpen = $("sidebar").classList.contains("open");
    const assetsOpen = $("assets")?.classList.contains("open");
    if (!settingsOpen && !genOpen && !checkerOpen && !sideOpen && !assetsOpen) {
      els.backdrop.hidden = true;
    }
  }

  function closeDrawers() {
    $("sidebar").classList.remove("open");
    $("assets")?.classList.remove("open");
    hideBackdropIfIdle();
  }
  window.NFCloseDrawers = closeDrawers;
  window.NFHideBackdropIfIdle = hideBackdropIfIdle;

  function bind() {
    document.querySelectorAll(".mode-btn").forEach((btn) => {
      btn.onclick = () => {
        const mode = btn.dataset.mode;
        window.NFSetMode(mode);
      };
    });

    $("btnGenChapter").onclick = openGen;
    $("btnCloseGen").onclick = closeGen;
    $("btnCancelGen").onclick = closeGen;
    els.genForm.onsubmit = (e) => { e.preventDefault(); generate(); };

    $("btnChecker").onclick = openChecker;
    $("btnCloseChecker").onclick = closeChecker;
    $("btnRunCheck").onclick = runCheck;
    $("btnClearCheck").onclick = () => {
      els.codeInput.value = "";
      updateCheckHint();
      els.checkResults.innerHTML = '<div class="empty-state">粘贴后点「开始检查」。</div>';
    };
    els.codeInput.addEventListener("input", updateCheckHint);
    els.checker.querySelectorAll(".tab").forEach((tab) => {
      tab.onclick = () => {
        checkerLang = tab.dataset.lang;
        els.checker.querySelectorAll(".tab").forEach((t) => {
          t.classList.toggle("is-active", t === tab);
        });
      };
    });

    els.askForm.onsubmit = (e) => {
      e.preventDefault();
      const q = els.askInput.value.trim();
      if (!q || !learn.chapterId) return;
      els.askInput.value = "";
      askQuestion(q);
    };

    // 回车发送，Shift+回车换行（与工作台输入框一致）
    els.askInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        els.askForm.requestSubmit();
      }
    });
  }

  window.NFLearnInit = async function initLearn() {
    bind();
    updateCheckHint();
    await loadTracks();
  };
})();
