import { loadStudyState, recordDictationResult, removeWrongRecord } from "./store.js";
import { getGistConfig, saveGistConfig, syncWithGitHubGist } from "./gist_sync.js";

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getEnglishHint(fam) {
  const hints = [];
  for (const b of (fam.pos_branches || [])) {
    for (const l of (b.lemmas || [])) {
      if (l.lemma.toLowerCase() === fam.headword.toLowerCase() && l.def_en) {
        hints.push(`(${b.pos}) ${l.def_en}`);
      }
    }
  }
  if (!hints.length) {
    for (const b of (fam.pos_branches || [])) {
      for (const l of (b.lemmas || [])) {
        if (l.def_en) {
          hints.push(`(${b.pos}) ${l.def_en}`);
          break;
        }
      }
      if (hints.length) break;
    }
  }
  return hints.length ? hints.slice(0, 2).join(" | ") : `(${fam.primary_pos}) No English definition available`;
}

function getChinesePreview(fam) {
  for (const b of (fam.pos_branches || [])) {
    for (const l of (b.lemmas || [])) {
      if (l.def_zh) return l.def_zh;
    }
  }
  return "";
}

export class DictationController {
  constructor(ctx) {
    this.ctx = ctx;
    this.activeTab = "setup"; // setup | quiz | summary | wrong | sync
    this.queue = [];
    this.currentIndex = 0;
    this.hintLevel = 0;
    this.answered = false;
    this.sessionStats = { total: 0, correct: 0, wrong: 0 };
    this.bindGlobalShortcut();
  }

  bindGlobalShortcut() {
    document.addEventListener("keydown", (e) => {
      const overlay = document.getElementById("dictationModalOverlay");
      if (!overlay || !overlay.classList.contains("open")) return;

      if (e.key === "Escape" && this.activeTab !== "quiz") {
        this.close();
        return;
      }

      // 默写进行中：无论输入框是否聚焦，按回车都能提交或跳转下一题
      if (this.activeTab === "quiz" && e.key === "Enter") {
        if (e.target && e.target.tagName === "BUTTON") return;
        e.preventDefault();
        if (!this.answered) {
          this.submitAnswer(false);
        } else {
          this.nextQuestion();
        }
      }
    });
  }

  open(defaultTab = "setup") {
    this.activeTab = defaultTab;
    document.getElementById("dictationModalOverlay").classList.add("open");
    this.render();
  }

  close() {
    document.getElementById("dictationModalOverlay").classList.remove("open");
  }

  switchTab(tab) {
    this.activeTab = tab;
    this.render();
  }

  buildQueue({ sourceMode, minRank, maxRank, posFilter, count, includeWrongReview }) {
    const families = this.ctx.getFamilies();
    const state = loadStudyState();
    const favSet = new Set(state.favorites || []);
    const masteredSet = new Set(state.mastered_ranks || []);
    const wrongStats = state.wrong_stats || {};

    let pool = families.filter(f => {
      if (sourceMode === "FAV") {
        if (!favSet.has(f.rank)) return false;
      } else if (sourceMode === "WRONG") {
        if (!wrongStats[String(f.rank)]) return false;
      } else {
        if (f.rank < minRank || f.rank > maxRank) return false;
      }

      if (posFilter && posFilter !== "ALL") {
        if (posFilter === "OTHER") {
          if (["v.", "n.", "adj.", "adv."].includes(f.primary_pos)) return false;
        } else if (f.primary_pos !== posFilter) {
          return false;
        }
      }
      return true;
    });

    if (!pool.length) return [];

    if (sourceMode === "WRONG") {
      pool.sort((a, b) => (wrongStats[String(b.rank)]?.count || 0) - (wrongStats[String(a.rank)]?.count || 0));
      return pool.slice(0, count);
    }

    const wrongInPool = [];
    const unmasteredInPool = [];
    const masteredInPool = [];

    for (const f of pool) {
      const wInfo = wrongStats[String(f.rank)];
      if (includeWrongReview && wInfo && wInfo.count > 0) {
        wrongInPool.push(f);
      } else if (!masteredSet.has(f.rank)) {
        unmasteredInPool.push(f);
      } else {
        masteredInPool.push(f);
      }
    }

    wrongInPool.sort((a, b) => (wrongStats[String(b.rank)]?.count || 0) - (wrongStats[String(a.rank)]?.count || 0));

    return [
      ...wrongInPool,
      ...shuffle(unmasteredInPool),
      ...shuffle(masteredInPool)
    ].slice(0, count);
  }

  startSession(config) {
    const selected = this.buildQueue(config);
    if (!selected.length) {
      alert("当前筛选范围内没有符合条件的单词，请放宽词频或词性条件。");
      return;
    }
    this.queue = selected;
    this.currentIndex = 0;
    this.hintLevel = 0;
    this.answered = false;
    this.sessionStats = { total: selected.length, correct: 0, wrong: 0 };
    this.activeTab = "quiz";
    this.render();
    this.playCurrentAudio();
  }

  playCurrentAudio(lang = "en-US") {
    const fam = this.queue[this.currentIndex];
    if (fam) this.ctx.speakText(fam.headword, lang);
  }

  revealHint() {
    if (this.answered) return;
    this.hintLevel = Math.min(2, this.hintLevel + 1);
    this.render();
    const inp = document.getElementById("dictSpellInput");
    if (inp) inp.focus();
  }

  submitAnswer(giveUp = false) {
    if (this.answered) {
      this.nextQuestion();
      return;
    }
    const fam = this.queue[this.currentIndex];
    if (!fam) return;

    const inp = document.getElementById("dictSpellInput");
    const userVal = giveUp ? "" : (inp ? inp.value.trim() : "");
    const target = fam.headword.trim();
    const isCorrect = !giveUp && userVal.toLowerCase() === target.toLowerCase();

    this.answered = true;
    const state = loadStudyState();
    recordDictationResult(state, fam.rank, isCorrect);
    if (this.ctx.onStateSync) this.ctx.onStateSync(state);

    if (isCorrect) {
      this.sessionStats.correct += 1;
    } else {
      this.sessionStats.wrong += 1;
    }

    this.render(userVal, isCorrect);
    this.ctx.speakText(target, "en-US");
  }

  nextQuestion() {
    if (this.currentIndex + 1 < this.queue.length) {
      this.currentIndex += 1;
      this.hintLevel = 0;
      this.answered = false;
      this.render();
      this.playCurrentAudio();
    } else {
      this.activeTab = "summary";
      this.render();
    }
  }

  jumpToWord(rank) {
    this.close();
    this.ctx.selectFamily(rank, true, true);
  }

  deleteWrong(rank) {
    const state = loadStudyState();
    removeWrongRecord(state, rank);
    if (this.ctx.onStateSync) this.ctx.onStateSync(state);
    this.render();
  }

  async triggerSync() {
    const statusEl = document.getElementById("gistSyncStatus");
    const tokenInp = document.getElementById("gistTokenInput");
    const idInp = document.getElementById("gistIdInput");
    if (tokenInp) {
      saveGistConfig(tokenInp.value, idInp ? idInp.value : "");
    }
    if (statusEl) {
      statusEl.style.color = "#1d4ed8";
      statusEl.textContent = "正在连接 GitHub Gist 进行双向合并同步...";
    }
    try {
      const res = await syncWithGitHubGist((merged) => {
        if (this.ctx.onStateSync) this.ctx.onStateSync(merged);
      });
      if (idInp && res.gistId) idInp.value = res.gistId;
      if (statusEl) {
        statusEl.style.color = "#15803d";
        statusEl.textContent = res.created
          ? `✅ 已自动创建私密 Gist 并同步成功！Gist ID: ${res.gistId}`
          : `✅ 双向同步完成！当前已合并 ${res.state.favorites.length} 个收藏、${res.state.mastered_ranks.length} 个已默写词、${Object.keys(res.state.wrong_stats).length} 个错题记录。`;
      }
    } catch (err) {
      if (statusEl) {
        statusEl.style.color = "#b91c1c";
        statusEl.textContent = `❌ ${err.message}`;
      }
    }
  }

  render(lastUserInput = "", lastIsCorrect = false) {
    const state = loadStudyState();
    const wrongEntries = Object.entries(state.wrong_stats || {})
      .map(([r, info]) => ({
        rank: Number(r),
        count: info.count || 1,
        last_wrong: info.last_wrong || 0,
        fam: this.ctx.getFamilyByRank(Number(r))
      }))
      .filter(x => x.fam)
      .sort((a, b) => b.count - a.count || b.last_wrong - a.last_wrong);

    const modal = document.getElementById("dictationModalContent");
    if (!modal) return;

    const headerHtml = `
      <div class="dict-modal-header">
        <div class="dict-tabs">
          <button class="dict-tab ${this.activeTab === "setup" || this.activeTab === "quiz" || this.activeTab === "summary" ? "active" : ""}" onclick="window.__dictCtrl.switchTab('setup')">✍️ 默写设置</button>
          <button class="dict-tab ${this.activeTab === "wrong" ? "active" : ""}" onclick="window.__dictCtrl.switchTab('wrong')">📕 错题本 (${wrongEntries.length})</button>
          <button class="dict-tab ${this.activeTab === "sync" ? "active" : ""}" onclick="window.__dictCtrl.switchTab('sync')">☁️ Gist 云同步</button>
        </div>
        <button class="desktop-nav-btn" onclick="window.__dictCtrl.close()">✕ 关闭</button>
      </div>
    `;

    let bodyHtml = "";

    if (this.activeTab === "setup") {
      bodyHtml = `
        <div class="dict-form-grid">
          <div class="dict-field">
            <label>1. 选词来源</label>
            <select id="dictSourceMode" onchange="document.getElementById('rankRangeRow').style.display = this.value === 'RANGE' ? 'grid' : 'none'">
              <option value="RANGE">按词频范围 + 词性抽词</option>
              <option value="FAV">⭐ 仅从已收藏选词 (${state.favorites.length} 词)</option>
              <option value="WRONG">📕 专攻错题本 (${wrongEntries.length} 词)</option>
            </select>
          </div>
          <div class="dict-field">
            <label>2. 词性筛选</label>
            <select id="dictPosFilter">
              <option value="ALL">全部词性</option>
              <option value="v.">动词 v.</option>
              <option value="n.">名词 n.</option>
              <option value="adj.">形容词 adj.</option>
              <option value="adv.">副词 adv.</option>
              <option value="OTHER">虚词/其他</option>
            </select>
          </div>
        </div>

        <div class="dict-form-grid" id="rankRangeRow">
          <div class="dict-field">
            <label>起始词频 Rank（最小 1）</label>
            <input type="number" id="dictMinRank" value="1" min="1" max="30000">
          </div>
          <div class="dict-field">
            <label>结束词频 Rank（如 1000 / 3000）</label>
            <input type="number" id="dictMaxRank" value="1000" min="1" max="30000">
          </div>
        </div>

        <div class="dict-form-grid">
          <div class="dict-field">
            <label>3. 本轮自定义默写个数</label>
            <input type="number" id="dictCount" value="20" min="1" max="500">
          </div>
          <div class="dict-field">
            <label>当前累计已默写掌握</label>
            <input type="text" value="${state.mastered_ranks.length.toLocaleString()} 个词族（自动跳过已掌握词）" disabled style="background:#f8fafc;color:#475569;">
          </div>
        </div>

        <label class="dict-check-row">
          <input type="checkbox" id="dictIncludeWrong" checked>
          <span>错题复习选项：优先把该词频/筛选范围内「曾经错过」的词加入本轮默写</span>
        </label>

        <button class="dict-trigger-btn" style="width:100%;justify-content:center;padding:11px;font-size:15px;" onclick="window.__dictCtrl.handleStartClick()">
          🎧 开始听音默写
        </button>
      `;
    } else if (this.activeTab === "quiz") {
      const fam = this.queue[this.currentIndex];
      const pct = Math.round(((this.currentIndex + (this.answered ? 1 : 0)) / this.queue.length) * 100);
      const wrongCountNow = state.wrong_stats[String(fam.rank)]?.count || 0;
      const enHint = getEnglishHint(fam);
      const maskedWord = fam.headword[0] + " " + "_ ".repeat(Math.max(1, fam.headword.length - 1)).trim() + ` (${fam.headword.length} 字母)`;

      let hintArea = "";
      if (this.hintLevel >= 1) {
        hintArea += `<div class="quiz-hint-card"><strong>💡 英文释义提示：</strong>${enHint}</div>`;
      }
      if (this.hintLevel >= 2) {
        hintArea += `<div class="quiz-hint-card" style="background:#f0f9ff;border-color:#bae6fd;border-left-color:#0284c7;color:#0369a1;"><strong>🔤 拼写轮廓提示：</strong><code style="font-size:15px;font-weight:700;">${maskedWord}</code></div>`;
      }

      let feedbackArea = "";
      if (this.answered) {
        const zhDef = getChinesePreview(fam);
        if (lastIsCorrect) {
          feedbackArea = `
            <div class="quiz-feedback ok">
              <div style="font-weight:700;font-size:15px;">✅ 拼写正确：${fam.headword} <span style="font-weight:400;opacity:0.85;">(Rank #${fam.rank})</span></div>
              <div style="margin-top:4px;">${enHint}</div>
              <div style="margin-top:2px;color:#15803d;">${zhDef}</div>
            </div>
          `;
        } else {
          feedbackArea = `
            <div class="quiz-feedback err">
              <div style="font-weight:700;font-size:15px;">❌ 正确拼写：<span style="text-decoration:underline;">${fam.headword}</span>（你的输入：${lastUserInput || "未填写"}）· 累计错 ${wrongCountNow} 次</div>
              <div style="margin-top:4px;">${enHint}</div>
              <div style="margin-top:2px;">${zhDef}</div>
              <div style="margin-top:8px;">
                <button class="fallback-btn" onclick="window.__dictCtrl.jumpToWord(${fam.rank})">查看完整词族与短语详情 ↗</button>
              </div>
            </div>
          `;
        }
      }

      bodyHtml = `
        <div style="display:flex;justify-content:space-between;align-items:center;font-size:12.5px;color:#64748b;margin-bottom:6px;">
          <span>进度：第 <strong>${this.currentIndex + 1}</strong> / ${this.queue.length} 词 ${wrongCountNow ? `<span class="wrong-count-tag" style="margin-left:6px;">历史错 ${wrongCountNow} 次</span>` : ""}</span>
          <span>本轮：✅ ${this.sessionStats.correct} · ❌ ${this.sessionStats.wrong}</span>
        </div>
        <div class="quiz-progress-bar"><div class="quiz-progress-fill" style="width:${pct}%"></div></div>

        <div class="quiz-audio-box">
          <div style="font-size:13px;color:#64748b;margin-bottom:10px;">请听发音并拼写出对应的英语单词（支持直接按 <strong>Enter ↵</strong> 提交或进入下一题）</div>
          <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;">
            <button class="tts-btn" style="padding:7px 14px;font-size:13.5px;" onclick="window.__dictCtrl.playCurrentAudio('en-US')">🔊 再听美音</button>
            <button class="tts-btn" style="padding:7px 14px;font-size:13.5px;" onclick="window.__dictCtrl.playCurrentAudio('en-GB')">🔊 听英音</button>
            ${!this.answered ? `<button class="fav-btn" onclick="window.__dictCtrl.revealHint()">💡 需要提示 (${this.hintLevel}/2)</button>` : ""}
          </div>
        </div>

        ${hintArea}

        <input type="text" id="dictSpellInput" class="quiz-input ${this.answered ? (lastIsCorrect ? "correct" : "wrong") : ""}"
          value="${lastUserInput.replace(/"/g, "&quot;")}"
          placeholder="在此输入英文拼写..."
          autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">

        ${feedbackArea}

        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:10px;">
          ${!this.answered ? `
            <button class="desktop-nav-btn" onclick="window.__dictCtrl.submitAnswer(true)">不会 / 直接看答案</button>
            <button class="dict-trigger-btn" onclick="window.__dictCtrl.submitAnswer(false)">提交校验 ↵</button>
          ` : `
            <button class="dict-trigger-btn" onclick="window.__dictCtrl.nextQuestion()">${this.currentIndex + 1 < this.queue.length ? "下一题 (Enter ↵)" : "查看本轮总结 (Enter ↵)"}</button>
          `}
        </div>
      `;
    } else if (this.activeTab === "summary") {
      const acc = this.sessionStats.total ? Math.round((this.sessionStats.correct / this.sessionStats.total) * 100) : 0;
      bodyHtml = `
        <div style="text-align:center;padding:24px 10px;">
          <div style="font-size:36px;margin-bottom:8px;">🎯</div>
          <h3 style="margin:0 0 8px 0;color:#0f172a;">本轮默写完成！</h3>
          <p style="color:#475569;font-size:14px;margin-bottom:18px;">
            共默写 <strong>${this.sessionStats.total}</strong> 词 · 一次拼对 <strong style="color:#16a34a;">${this.sessionStats.correct}</strong> 词 · 错题 <strong style="color:#dc2626;">${this.sessionStats.wrong}</strong> 词（正确率 ${acc}%）
          </p>
          <div style="display:flex;justify-content:center;gap:10px;flex-wrap:wrap;">
            <button class="desktop-nav-btn" onclick="window.__dictCtrl.switchTab('wrong')">查看错题本排行</button>
            <button class="desktop-nav-btn" onclick="window.__dictCtrl.switchTab('sync')">☁️ 同步到 GitHub Gist</button>
            <button class="dict-trigger-btn" onclick="window.__dictCtrl.switchTab('setup')">再来一轮默写</button>
          </div>
        </div>
      `;
    } else if (this.activeTab === "wrong") {
      if (!wrongEntries.length) {
        bodyHtml = `<div style="text-align:center;padding:36px 16px;color:#64748b;">暂无错题记录，继续保持！</div>`;
      } else {
        const rowsHtml = wrongEntries.map(item => `
          <div class="wrong-card">
            <div class="wrong-card-main">
              <div class="wrong-card-top">
                <span class="wrong-word-title" onclick="window.__dictCtrl.jumpToWord(${item.rank})">${item.fam.headword}</span>
                <span class="wrong-meta-badge">#${item.rank} · ${item.fam.primary_pos}</span>
                <span class="wrong-count-tag">错 ${item.count} 次</span>
                <button class="tts-btn" style="padding:2px 7px;font-size:11.5px;" onclick="window.__dictCtrl.ctx.speakText('${item.fam.headword.replace(/'/g, "\\'")}', 'en-US')">🔊</button>
              </div>
              <div class="wrong-def-text">${getChinesePreview(item.fam)}</div>
            </div>
            <div class="wrong-card-actions">
              <button class="fallback-btn" onclick="window.__dictCtrl.jumpToWord(${item.rank})">详情 ↗</button>
              <button class="fallback-btn" style="color:#dc2626;border-color:#fecaca;" onclick="window.__dictCtrl.deleteWrong(${item.rank})">移出</button>
            </div>
          </div>
        `).join("");

        bodyHtml = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
            <span style="font-size:13px;color:#475569;">按累计错误次数从高到低排序（共 ${wrongEntries.length} 词）</span>
            <button class="dict-trigger-btn" onclick="window.__dictCtrl.startSession({ sourceMode: 'WRONG', posFilter: 'ALL', count: Math.min(20, ${wrongEntries.length}), includeWrongReview: true })">
              🔥 一键重默 Top ${Math.min(20, wrongEntries.length)} 高频错题
            </button>
          </div>
          <div class="wrong-list-container">
            ${rowsHtml}
          </div>
        `;
      }
    } else if (this.activeTab === "sync") {
      const cfg = getGistConfig();
      bodyHtml = `
        <div style="font-size:13.5px;color:#334155;line-height:1.65;margin-bottom:14px;">
          通过 <strong>GitHub Secret Gist</strong> 实现多设备（Mac / iPhone / iPad）无服务器双向同步<strong>收藏夹、已默写记录、错题本及错误次数</strong>。<br>
          <span style="font-size:12px;color:#64748b;">• 首次使用：只需填写勾选了 <code>gist</code> 权限的 GitHub Token 并点击「立即双向同步」，系统会自动为你创建私密 Gist 并生成 Gist ID。<br>• 其他设备：填入相同的 Token 和 Gist ID 点击同步即可自动合并。Token 仅保存在当前浏览器本地。</span>
        </div>
        <div class="dict-field" style="margin-bottom:12px;">
          <label>GitHub Personal Access Token（需勾选 gist 权限）</label>
          <input type="password" id="gistTokenInput" value="${(cfg.token || "").replace(/"/g, "&quot;")}" placeholder="ghp_xxxxxxxxxxxxxxxxxxxx">
        </div>
        <div class="dict-field" style="margin-bottom:14px;">
          <label>Gist ID（首次留空自动创建；第二台设备请粘贴已生成的 ID）</label>
          <input type="text" id="gistIdInput" value="${(cfg.gistId || "").replace(/"/g, "&quot;")}" placeholder="例如：a1b2c3d4e5f67890...">
        </div>
        <button class="dict-trigger-btn" style="width:100%;justify-content:center;padding:10px;" onclick="window.__dictCtrl.triggerSync()">
          ☁️ 立即双向合并同步
        </button>
        <div id="gistSyncStatus" style="margin-top:12px;font-size:13px;line-height:1.55;word-break:break-all;"></div>
      `;
    }

    modal.innerHTML = headerHtml + `<div class="dict-modal-body">${bodyHtml}</div>`;

    if (this.activeTab === "quiz") {
      setTimeout(() => {
        const inp = document.getElementById("dictSpellInput");
        if (inp) inp.focus();
      }, 20);
    }
  }

  handleStartClick() {
    const sourceMode = document.getElementById("dictSourceMode").value;
    const posFilter = document.getElementById("dictPosFilter").value;
    const minRank = Math.max(1, Number(document.getElementById("dictMinRank").value) || 1);
    const maxRank = Math.max(minRank, Number(document.getElementById("dictMaxRank").value) || 1000);
    const count = Math.max(1, Math.min(500, Number(document.getElementById("dictCount").value) || 20));
    const includeWrongReview = document.getElementById("dictIncludeWrong").checked;

    this.startSession({ sourceMode, minRank, maxRank, posFilter, count, includeWrongReview });
  }
}
