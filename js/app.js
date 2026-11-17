import { loadStudyState, saveStudyState } from "./store.js";
import { DictationController } from "./dictation.js";

const APP_VERSION = "2026.11.17.04";
const DATA_URL = `./word_families_final.json?v=${APP_VERSION}`;
const VP_URL = `./verb_phrases.json?v=${APP_VERSION}`;
const TOPIC_URL = `./topic_taxonomy.json?v=${APP_VERSION}`;

let allFamilies = [];
let familyByRank = new Map();
let familyByWord = new Map();
let searchIndexMap = new Map();
let currentFilteredList = [];
let activeRank = null;
let verbPhrasesMap = {};
let topicTaxonomy = [];
let sidebarMode = "freq";
let activeTopicSubKey = null;

let visualHintByRank = new Map();
const VISUAL_SUB_HINTS = {
  mammals: "animal",
  birds: "bird",
  reptiles_amphibians: "reptile",
  marine_life: "fish",
  insects_invertebrates: "insect",
  trees_plants: "plant",
  crops_produce: "food",
  anatomy_organs: "anatomy",
  food_cooking: "food",
  clothing_textiles: "clothing",
  architecture_home: "",
  transport_vehicles: "vehicle",
  arts_music: ""
};

function buildVisualHintsFromTaxonomy(taxList) {
  visualHintByRank.clear();
  for (const cat of (taxList || [])) {
    for (const sub of (cat.subcategories || [])) {
      if (sub.id in VISUAL_SUB_HINTS && !visualHintByRank.has) {}
      if (Object.prototype.hasOwnProperty.call(VISUAL_SUB_HINTS, sub.id)) {
        const hint = VISUAL_SUB_HINTS[sub.id];
        for (const it of (sub.items || [])) {
          if (!visualHintByRank.has(it.rank)) {
            visualHintByRank.set(it.rank, hint);
          }
        }
      }
    }
  }
}


let studyState = loadStudyState();
let favoriteRanks = new Set(studyState.favorites);
let hideRare = localStorage.getItem("dict_hide_rare") === "true";
let showImages = localStorage.getItem("dict_show_images") !== "false";
const wikiImageCache = new Map();

let currentVoiceName = "默认系统语音";
let selectedPos = "ALL";
let onlyFav = false;
let includeSecondaryPos = localStorage.getItem("wf_include_secondary_pos") === "1";
let baseStatusText = "";

function refreshStateFromStore(newState) {
  studyState = newState || loadStudyState();
  favoriteRanks = new Set(studyState.favorites || []);
  const secChk = document.getElementById("includeSecondaryPosCheck");
  if (secChk) secChk.checked = includeSecondaryPos;
  updateFavBadge();
  if (allFamilies.length) {
    applyFilters();
    if (activeRank) selectFamily(activeRank, false, false);
  }
}

function updateFavBadge() {
  const badge = document.getElementById("favCountBadge");
  if (badge) badge.textContent = favoriteRanks.size ? `(${favoriteRanks.size})` : "";
  const bar = document.getElementById("favToolsBar");
  if (bar) bar.style.display = onlyFav ? "flex" : "none";
}

function toggleFavorite(rank) {
  if (favoriteRanks.has(rank)) {
    favoriteRanks.delete(rank);
  } else {
    favoriteRanks.add(rank);
  }
  studyState.favorites = [...favoriteRanks];
  saveStudyState(studyState);
  updateFavBadge();
  if (onlyFav) applyFilters();
  selectFamily(rank, false, false);
}

function exportFavorites() {
  const payload = {
    exported_at: new Date().toISOString(),
    ranks: [...favoriteRanks],
    words: [...favoriteRanks].map(r => familyByRank.get(r)?.headword).filter(Boolean)
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `wordfamily_favorites_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importFavorites(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    try {
      const data = JSON.parse(evt.target.result);
      const ranks = Array.isArray(data) ? data : (data.ranks || []);
      ranks.forEach(r => { if (familyByRank.has(Number(r))) favoriteRanks.add(Number(r)); });
      studyState.favorites = [...favoriteRanks];
      saveStudyState(studyState);
      updateFavBadge();
      applyFilters();
      if (activeRank) selectFamily(activeRank, false, false);
      alert(`成功导入并合并 ${ranks.length} 条收藏记录！`);
    } catch {
      alert("导入失败：JSON 格式无效。");
    }
  };
  reader.readAsText(file);
  e.target.value = "";
}

function toggleImages(checked) {
  showImages = checked;
  localStorage.setItem("dict_show_images", checked ? "true" : "false");
  document.getElementById("mainView").classList.toggle("hide-images", !showImages);
  if (showImages) loadVisibleVisuals();
}

async function fetchWikiThumb(word, hint = "") {
  const key = word.toLowerCase();
  const cacheKey = hint ? `${key}|${hint}` : key;
  if (wikiImageCache.has(cacheKey)) return wikiImageCache.get(cacheKey);
  try {
    const sumUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(key)}`;
    const resp = await fetch(sumUrl);
    if (resp.ok) {
      const data = await resp.json();
      if (data.type !== "disambiguation" && data.thumbnail?.source) {
        wikiImageCache.set(cacheKey, data.thumbnail.source);
        return data.thumbnail.source;
      }
    }
    const searchQuery = hint ? `${key} ${hint}` : key;
    const apiUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(searchQuery)}&gsrlimit=3&prop=pageimages&pithumbsize=320&format=json&origin=*`;
    const sResp = await fetch(apiUrl);
    if (sResp.ok) {
      const sData = await sResp.json();
      const pages = sData.query?.pages ? Object.values(sData.query.pages) : [];
      pages.sort((a, b) => (a.index || 99) - (b.index || 99));
      const hit = pages.find(p => p.thumbnail?.source);
      if (hit) {
        wikiImageCache.set(cacheKey, hit.thumbnail.source);
        return hit.thumbnail.source;
      }
    }
    wikiImageCache.set(cacheKey, null);
    return null;
  } catch {
    wikiImageCache.set(cacheKey, null);
    return null;
  }
}

function loadVisibleVisuals() {
  if (!showImages) return;
  document.querySelectorAll(".lemma-visual-wrap[data-visual-word]").forEach(async (box) => {
    const word = box.dataset.visualWord;
    const hint = box.dataset.visualHint || (visualHintByRank.get(activeRank) || "");
    const thumb = await fetchWikiThumb(word, hint);
    if (!thumb) {
      box.remove();
      return;
    }
    box.classList.remove("loading");
    box.innerHTML = `<img src="${thumb}" alt="${word}" loading="lazy" onerror="this.parentElement.remove()">`;
    box.onclick = () => window.open(thumb, "_blank");
  });
}

function openMobileDrawer() {
  document.getElementById("sidebar").classList.add("open");
  document.getElementById("drawerBackdrop").classList.add("open");
}

function closeMobileDrawer() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("drawerBackdrop").classList.remove("open");
}

function speakCurrentHeadword(lang = "en-US") {
  const fam = familyByRank.get(activeRank);
  const btn = document.getElementById("mobileDockSpeakBtn");
  if (fam) speakText(fam.headword, lang, btn);
}

function toggleCurrentFavorite() {
  if (activeRank) toggleFavorite(activeRank);
}

function syncMobileDockState() {
  const favBtn = document.getElementById("mobileDockFavBtn");
  if (favBtn && activeRank) {
    const isFav = favoriteRanks.has(activeRank);
    favBtn.textContent = isFav ? "⭐" : "☆";
    favBtn.classList.toggle("active", isFav);
  }
}

function stepFamily(delta) {
  const list = currentFilteredList.length ? currentFilteredList : allFamilies;
  if (!list.length) return;
  const idx = list.findIndex(f => f.rank === activeRank);
  const nextIdx = idx === -1 ? 0 : Math.max(0, Math.min(list.length - 1, idx + delta));
  selectFamily(list[nextIdx].rank, false, true);
  document.getElementById("mainView").scrollTop = 0;
}

let activeAudioEl = null;

function updateVoiceBadge(label) {
  currentVoiceName = label;
  const badge = document.getElementById("voiceStatusBadge");
  if (badge) badge.textContent = `当前语音: ${label}`;
}

function pickBestVoice(lang) {
  const voices = window.speechSynthesis.getVoices();
  const langVoices = voices.filter(v => v.lang.replace("_", "-").toLowerCase() === lang.toLowerCase());
  const pool = langVoices.length ? langVoices : voices.filter(v => v.lang.toLowerCase().startsWith("en"));
  const nonRobotic = pool.filter(v => !/Fred|Albert|Bad|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Good|Hysterical|Junior|Kathy|Organ|Princess|Ralph|Trinoids|Whisper|Zarvox/i.test(v.name));
  const candidates = nonRobotic.length ? nonRobotic : pool;
  const scoreVoice = (v) => {
    let s = 0;
    if (/Premium|Enhanced|Natural|Neural|Siri/i.test(v.name)) s += 100;
    if (/Google/i.test(v.name)) s += 60;
    if (/Ava|Zoe|Evan|Tom|Allison|Susan|Serena|Daniel|Kate|Oliver|Samantha/i.test(v.name)) s += 30;
    if (v.localService) s += 10;
    return s;
  };
  candidates.sort((a, b) => scoreVoice(b) - scoreVoice(a));
  return candidates[0] || null;
}

function fallbackSystemSpeak(text, lang, btnEl) {
  if (!("speechSynthesis" in window)) {
    if (btnEl) btnEl.classList.remove("speaking");
    return;
  }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = lang;
  utter.rate = 0.98;

  const bestVoice = pickBestVoice(lang);
  if (bestVoice) {
    utter.voice = bestVoice;
    updateVoiceBadge(`系统备用 (${bestVoice.name})`);
  }

  utter.onend = () => { if (btnEl) btnEl.classList.remove("speaking"); };
  utter.onerror = () => { if (btnEl) btnEl.classList.remove("speaking"); };
  window.speechSynthesis.speak(utter);
}

function speakText(text, lang = "en-US", btnEl = null) {
  const cleanText = String(text || "").trim();
  if (!cleanText) return;

  // 停止正在播放的音频与系统语音
  if (activeAudioEl) {
    try { activeAudioEl.pause(); activeAudioEl.currentTime = 0; } catch {}
    activeAudioEl = null;
  }
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  document.querySelectorAll(".tts-btn.speaking").forEach(b => b.classList.remove("speaking"));
  if (btnEl) btnEl.classList.add("speaking");

  const isUK = lang.toLowerCase().includes("gb") || lang.toLowerCase().includes("uk");
  const accentType = isUK ? 1 : 2; // 1: 英音真人, 2: 美音真人
  const accentLabel = isUK ? "在线真人 (英音)" : "在线真人 (美音)";

  // 清理短语占位符（如 sb / sth）以便接口流畅朗读
  const ttsQuery = cleanText
    .replace(/\bsb\/sth\b/gi, "something")
    .replace(/\bsb\b/gi, "somebody")
    .replace(/\bsth\b/gi, "something");

  // 超过 120 字符的长句直接走在线流或分段，优先尝试在线真人音频流
  const audioUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(ttsQuery)}&type=${accentType}`;
  const audio = new Audio(audioUrl);
  activeAudioEl = audio;

  let settled = false;
  const fallbackTimer = setTimeout(() => {
    if (!settled) {
      settled = true;
      try { audio.pause(); } catch {}
      fallbackSystemSpeak(cleanText, lang, btnEl);
    }
  }, 2200);

  audio.onplaying = () => {
    settled = true;
    clearTimeout(fallbackTimer);
    updateVoiceBadge(accentLabel);
  };

  audio.onended = () => {
    clearTimeout(fallbackTimer);
    if (btnEl) btnEl.classList.remove("speaking");
    if (activeAudioEl === audio) activeAudioEl = null;
  };

  audio.onerror = () => {
    if (!settled) {
      settled = true;
      clearTimeout(fallbackTimer);
      fallbackSystemSpeak(cleanText, lang, btnEl);
    }
  };

  audio.play().catch(() => {
    if (!settled) {
      settled = true;
      clearTimeout(fallbackTimer);
      fallbackSystemSpeak(cleanText, lang, btnEl);
    }
  });
}

if ("speechSynthesis" in window) {
  window.speechSynthesis.getVoices();
}

function escapeAttr(str) {
  return String(str).replace(/&/g, "&amp;").replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

const FREQ_BANDS = [
  { id: "band-1", label: "超高频核心 (Top 1 – 1,000)", min: 1, max: 1000, defaultOpen: true },
  { id: "band-2", label: "高频常用 (1,001 – 3,000)", min: 1001, max: 3000, defaultOpen: false },
  { id: "band-3", label: "中频进阶 (3,001 – 6,000)", min: 3001, max: 6000, defaultOpen: false },
  { id: "band-4", label: "中高阶词汇 (6,001 – 10,000)", min: 6001, max: 10000, defaultOpen: false },
  { id: "band-5", label: "母语深度扩展 (10,001 – 18,000)", min: 10001, max: 18000, defaultOpen: false },
  { id: "band-6", label: "低频与罕见词族 (18,001+)", min: 18001, max: 999999, defaultOpen: false }
];

const SUB_STEP = 200;
const openState = new Map([
  ["band-1", true],
  ["sub-1-200", true]
]);

const POS_META = {
  "n.": { cls: "pos-n", name: "名词 Noun" },
  "v.": { cls: "pos-v", name: "动词 Verb" },
  "adj.": { cls: "pos-adj", name: "形容词 Adjective" },
  "adv.": { cls: "pos-adv", name: "副词 Adverb" },
  "prep.": { cls: "pos-prep", name: "介词 Preposition" },
  "conj.": { cls: "pos-conj", name: "连词 Conjunction" },
  "pron.": { cls: "pos-pron", name: "代词 Pronoun" },
  "det.": { cls: "pos-det", name: "限定词 Determiner" }
};

function getPosBadgeHtml(pos, showFullName = false) {
  const meta = POS_META[pos] || { cls: "pos-other", name: pos };
  const text = showFullName ? `${pos} (${meta.name})` : pos;
  return `<span class="pos-badge ${meta.cls}">${text}</span>`;
}

const SLOT_NAMES = {
  base: "原形", plural: "复数", comparative: "比较级", superlative: "最高级",
  third_person_sg: "第三人称单数", "3rd_person_sg": "第三人称单数",
  "3rd_sg_pres": "第三人称单数", "1st_sg_pres": "第一人称单数",
  pres_pl: "现在时复数", past_or_pp: "过去式 / 过去分词",
  past_sg: "过去式单数", past_pl: "过去式复数",
  past_participle: "过去分词", pres_participle: "现在分词"
};

function buildSearchIndex() {
  searchIndexMap.clear();
  for (const fam of allFamilies) {
    const parts = [fam.headword];
    for (const b of fam.pos_branches) {
      for (const l of b.lemmas) {
        parts.push(l.lemma);
        if (l.def_zh) parts.push(l.def_zh);
        if (l.inflections && typeof l.inflections === "object") {
          for (const val of Object.values(l.inflections)) {
            if (Array.isArray(val)) parts.push(...val);
            else if (typeof val === "string") parts.push(val);
          }
        }
      }
    }
    const vpEntry = verbPhrasesMap[fam.headword.toLowerCase()];
    if (vpEntry) {
      for (const cat of ["phrasal_verbs", "idioms", "collocations"]) {
        for (const item of (vpEntry[cat] || [])) {
          parts.push(item.phrase);
          for (const s of (item.senses || [])) {
            if (s.meaning) parts.push(s.meaning);
            if (s.example_en) parts.push(s.example_en);
            if (s.example_zh) parts.push(s.example_zh);
          }
        }
      }
    }
    searchIndexMap.set(fam.rank, parts.join("\n").toLowerCase());
  }
}

function resolveRankFromHash() {
  const raw = decodeURIComponent(window.location.hash.replace(/^#/, "")).trim().toLowerCase();
  if (!raw) return null;
  if (/^\d+$/.test(raw) && familyByRank.has(Number(raw))) return Number(raw);
  if (familyByWord.has(raw)) return familyByWord.get(raw);
  return null;
}

function initData(data, sourceLabel = "已自动加载") {
  allFamilies = data;
  familyByRank.clear();
  familyByWord.clear();
  for (const f of allFamilies) {
    familyByRank.set(f.rank, f);
    const key = f.headword.toLowerCase();
    if (!familyByWord.has(key)) familyByWord.set(key, f.rank);
  }
  buildSearchIndex();
  updateFavBadge();
  baseStatusText = `${sourceLabel} (${allFamilies.length.toLocaleString()} 词族)`;
  applyFilters();

  const hashRank = resolveRankFromHash();
  const initialRank = hashRank || (allFamilies.length > 0 ? allFamilies[0].rank : null);
  if (initialRank) selectFamily(initialRank, false, false);
}

function setPosFilter(pos) {
  if (pos === "FAV") {
    onlyFav = !onlyFav;
  } else {
    selectedPos = pos;
  }
  document.querySelectorAll(".pos-chip").forEach(btn => {
    if (btn.dataset.pos === "FAV") {
      btn.classList.toggle("active", onlyFav);
    } else {
      btn.classList.toggle("active", btn.dataset.pos === selectedPos);
    }
  });
  updateFavBadge();
  applyFilters();
}

function toggleSecondaryPos(checked) {
  includeSecondaryPos = Boolean(checked);
  localStorage.setItem("wf_include_secondary_pos", includeSecondaryPos ? "1" : "0");
  applyFilters();
}

function isPosMatch(pos, target) {
  if (target === "OTHER") {
    return !["v.", "n.", "adj.", "adv."].includes(pos);
  }
  return pos === target;
}

function matchesSearchQuery(fam, q) {
  if (!q) return true;
  if (!fam._wordIndex) {
    const words = new Set([fam.headword.toLowerCase()]);
    const zhs = [];
    for (const b of (fam.pos_branches || [])) {
      for (const l of (b.lemmas || [])) {
        if (l.lemma) words.add(l.lemma.toLowerCase());
        if (l.def_zh) zhs.push(l.def_zh.toLowerCase());
        if (l.inflections) {
          for (const forms of Object.values(l.inflections)) {
            if (Array.isArray(forms)) {
              for (const form of forms) {
                if (form) words.add(form.toLowerCase());
              }
            }
          }
        }
      }
    }
    fam._wordIndex = Array.from(words).join(" ");
    fam._zhIndex = zhs.join(" ");
  }
  const hasChinese = /[\u4e00-\u9fa5]/.test(q);
  return hasChinese ? fam._zhIndex.includes(q) : fam._wordIndex.includes(q);
}

function matchesPos(fam) {
  if (onlyFav && !favoriteRanks.has(fam.rank)) return false;
  if (selectedPos === "ALL") return true;

  // 1. 主词性直接命中
  if (isPosMatch(fam.primary_pos, selectedPos)) return true;

  // 2. 若开启「包含兼类词性」，检查是否存在目标词性且包含非罕见（tier !== "rare"）的词条
  if (includeSecondaryPos) {
    return (fam.pos_branches || []).some(branch => {
      if (!isPosMatch(branch.pos, selectedPos)) return false;
      return (branch.lemmas || []).some(l => (l.tier || "").toLowerCase() !== "rare");
    });
  }

  return false;
}

function applyFilters() {
  const q = document.getElementById("searchInput").value.trim().toLowerCase();
  const filtered = allFamilies.filter(f => {
    if (!matchesPos(f)) return false;
    if (!q) return true;
    return matchesSearchQuery(f, q);
  });

  currentFilteredList = filtered;

  const statusEl = document.getElementById("loadStatus");
  if (selectedPos === "ALL" && !onlyFav && !q) {
    statusEl.textContent = baseStatusText;
  } else {
    const parts = [];
    if (onlyFav) parts.push("已收藏");
    if (selectedPos !== "ALL") {
      parts.push(selectedPos === "OTHER" ? "虚词/其他" : selectedPos);
    } else if (!onlyFav) {
      parts.push("全部词性");
    }
    statusEl.textContent = `筛选 [${parts.join(" · ")}]: ${filtered.length.toLocaleString()} 词族`;
  }

  if (sidebarMode === "topic") {
    renderTopicSidebar(new Set(filtered.map(f => f.rank)), Boolean(q));
  } else {
    renderGroupedSidebar(filtered, Boolean(q));
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  try {
    const [famResp, vpResp] = await Promise.all([
      fetch(DATA_URL),
      fetch(VP_URL).catch(() => null)
    ]);
    if (!famResp.ok) throw new Error(`HTTP ${famResp.status}`);
    if (vpResp && vpResp.ok) {
      verbPhrasesMap = (await vpResp.json()) || {};
    }
    const data = await famResp.json();
    initData(data, "已自动加载");
    ensureTopicTaxonomyLoaded();
  } catch (err) {
    document.getElementById("loadStatus").textContent = "自动加载受限，请选本地文件";
    document.getElementById("mainView").innerHTML = `
      <div style="padding:20px; color:#475569; line-height:1.7;">
        <h3>未检测到同源 HTTP 服务</h3>
        <p>请点击左上角的 <strong>「本地文件」</strong> 按钮手动选择 <code>word_families_final.json</code>，或通过 GitHub Pages 访问。</p>
      </div>
    `;
  }
});

window.addEventListener("hashchange", () => {
  const r = resolveRankFromHash();
  if (r && r !== activeRank) selectFamily(r, false, false);
});

document.getElementById("jsonFile").addEventListener("change", function(e) {
  const file = e.target.files[0];
  if (!file) return;
  document.getElementById("loadStatus").textContent = "正在解析本地文件...";
  const reader = new FileReader();
  reader.onload = function(evt) {
    initData(JSON.parse(evt.target.result), "已加载本地文件");
  };
  reader.readAsText(file);
});

let searchTimer = null;
document.getElementById("searchInput").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applyFilters, 110);
});

document.addEventListener("keydown", (e) => {
  const overlay = document.getElementById("dictationModalOverlay");
  if (overlay && overlay.classList.contains("open")) return;

  const isInput = e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");
  if (e.key === "Escape" && isInput) {
    e.target.value = "";
    applyFilters();
    e.target.blur();
    return;
  }
  if (isInput || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === "/") {
    e.preventDefault();
    openMobileDrawer();
    const inp = document.getElementById("searchInput");
    inp.focus();
    inp.select();
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    stepFamily(-1);
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    stepFamily(1);
  }
});

function toggleGroup(groupId) {
  const el = document.getElementById(groupId);
  if (!el) return;
  const willCollapse = !el.classList.contains("collapsed");
  el.classList.toggle("collapsed", willCollapse);
  openState.set(groupId, !willCollapse);
}


async function ensureTopicTaxonomyLoaded() {
  if (topicTaxonomy.length) return topicTaxonomy;
  try {
    const resp = await fetch(TOPIC_URL);
    if (resp.ok) {
      topicTaxonomy = (await resp.json()) || [];
      buildVisualHintsFromTaxonomy(topicTaxonomy);
    }
  } catch (e) {
    console.warn("主题索引加载失败:", e);
  }
  return topicTaxonomy;
}

async function setSidebarMode(mode) {
  sidebarMode = mode;
  document.querySelectorAll(".view-mode-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
  if (mode === "topic") {
    document.getElementById("familyList").innerHTML = '<div style="padding:20px;color:#64748b;font-size:13px;text-align:center;">正在加载语义主题分类树...</div>';
    await ensureTopicTaxonomyLoaded();
  }
  applyFilters();
}

function renderTopicSidebar(allowedRanksSet, forceExpandAll = false) {
  const container = document.getElementById("familyList");
  if (!topicTaxonomy.length) {
    container.innerHTML = '<div style="padding:20px;color:#94a3b8;font-size:13px;text-align:center;">未加载到 topic_taxonomy.json</div>';
    return;
  }

  let html = "";
  const activeRankOrder = [];

  topicTaxonomy.forEach((cat, cIdx) => {
    const catId = `topic-cat-${cat.id}`;
    const isCatOpen = forceExpandAll ? true : (openState.has(catId) ? openState.get(catId) : (cIdx === 0));
    let subHtml = "";
    let catTotal = 0;

    (cat.subcategories || []).forEach((sub, sIdx) => {
      const matchedItems = (sub.items || []).filter(it => allowedRanksSet.has(it.rank));
      if (!matchedItems.length) return;
      catTotal += matchedItems.length;
      matchedItems.forEach(it => {
        const fam = familyByRank.get(it.rank);
        if (fam) activeRankOrder.push(fam);
      });

      const subId = `topic-sub-${cat.id}-${sub.id}`;
      const isSubOpen = forceExpandAll ? true : (openState.has(subId) ? openState.get(subId) : (cIdx === 0 && sIdx === 0));

      const itemsHtml = matchedItems.map(it => {
        const fam = familyByRank.get(it.rank);
        if (!fam) return "";
        return `
          <div class="family-item ${fam.rank === activeRank ? "active" : ""}" data-rank="${fam.rank}" data-sub-key="${subId}" onclick="activeTopicSubKey='${subId}';selectFamily(${fam.rank}, true, true)">
            <span>${favoriteRanks.has(fam.rank) ? "⭐ " : ""}${fam.headword}</span>
            <span class="family-meta">
              ${it.note ? `<span class="topic-hit-note" title="${escapeAttr(it.note)}">${it.note}</span>` : ""}
              <span class="family-rank">#${fam.rank}</span>
            </span>
          </div>
        `;
      }).join("");

      subHtml += `
        <div class="sub-group ${isSubOpen ? "" : "collapsed"}" id="${subId}">
          <div class="sub-group-header" onclick="toggleGroup('${subId}')">
            <span><span class="arrow-icon">▼</span>${sub.name}</span>
            <span class="sub-count">${matchedItems.length} 词</span>
          </div>
          <div class="sub-group-body">
            ${itemsHtml}
          </div>
        </div>
      `;
    });

    if (!catTotal) return;

    html += `
      <div class="freq-group ${isCatOpen ? "" : "collapsed"}" id="${catId}">
        <div class="freq-group-header" onclick="toggleGroup('${catId}')">
          <span><span class="arrow-icon">▼</span>${cat.icon || "📁"} ${cat.name}</span>
          <span class="group-count">${catTotal.toLocaleString()} 词</span>
        </div>
        <div class="freq-group-body">
          ${subHtml}
        </div>
      </div>
    `;
  });

  // 精准锁定当前所在的二级分类作为「上一词 / 下一词」翻页序列，避免多分类展开时串台
  let lockedItems = [];
  if (activeTopicSubKey) {
    for (const cat of topicTaxonomy) {
      for (const sub of (cat.subcategories || [])) {
        if (`topic-sub-${cat.id}-${sub.id}` === activeTopicSubKey) {
          lockedItems = (sub.items || []).filter(it => allowedRanksSet.has(it.rank)).map(it => familyByRank.get(it.rank)).filter(Boolean);
          break;
        }
      }
      if (lockedItems.length) break;
    }
  }
  if (!lockedItems.length && activeRank) {
    for (const cat of topicTaxonomy) {
      for (const sub of (cat.subcategories || [])) {
        const subItems = (sub.items || []).filter(it => allowedRanksSet.has(it.rank));
        if (subItems.some(it => it.rank === activeRank)) {
          activeTopicSubKey = `topic-sub-${cat.id}-${sub.id}`;
          lockedItems = subItems.map(it => familyByRank.get(it.rank)).filter(Boolean);
          break;
        }
      }
      if (lockedItems.length) break;
    }
  }
  if (lockedItems.length) {
    currentFilteredList = lockedItems;
  } else if (activeRankOrder.length) {
    currentFilteredList = activeRankOrder;
  }

  container.innerHTML = html || '<div style="padding:20px;color:#94a3b8;font-size:13px;text-align:center;">当前筛选条件下无匹配主题词族</div>';
}

function renderGroupedSidebar(list, forceExpandAll = false) {
  const container = document.getElementById("familyList");
  if (!list.length) {
    container.innerHTML = '<div style="padding:20px;color:#94a3b8;font-size:13px;text-align:center;">当前筛选条件下无匹配词族</div>';
    return;
  }

  let html = "";

  FREQ_BANDS.forEach(band => {
    const bandItems = list.filter(f => f.rank >= band.min && f.rank <= band.max);
    if (bandItems.length === 0) return;

    const isBandOpen = forceExpandAll ? true : (openState.has(band.id) ? openState.get(band.id) : band.defaultOpen);
    const maxRankInBand = Math.min(band.max, bandItems[bandItems.length - 1].rank);
    let subHtml = "";

    const activeStep = (selectedPos === "ALL") ? SUB_STEP : 1000;
    for (let start = band.min; start <= maxRankInBand; start += activeStep) {
      const end = Math.min(start + activeStep - 1, band.max);
      const subItems = bandItems.filter(f => f.rank >= start && f.rank <= end);
      if (subItems.length === 0) continue;

      const subId = `sub-${start}-${end}`;
      const isSubOpen = forceExpandAll ? true : (openState.get(subId) || false);

      const itemsHtml = subItems.map(f => `
        <div class="family-item ${f.rank === activeRank ? "active" : ""}" data-rank="${f.rank}" onclick="selectFamily(${f.rank}, true, true)">
          <span>${favoriteRanks.has(f.rank) ? "⭐ " : ""}${f.headword}</span>
          <span class="family-meta">
            ${selectedPos === "ALL" ? `<span class="mini-pos">${f.primary_pos}</span>` : ""}
            <span class="family-rank">#${f.rank}</span>
          </span>
        </div>
      `).join("");

      subHtml += `
        <div class="sub-group ${isSubOpen ? "" : "collapsed"}" id="${subId}">
          <div class="sub-group-header" onclick="toggleGroup('${subId}')">
            <span><span class="arrow-icon">▼</span>${start.toLocaleString()} – ${end.toLocaleString()}</span>
            <span class="sub-count">${subItems.length} 词</span>
          </div>
          <div class="sub-group-body">
            ${itemsHtml}
          </div>
        </div>
      `;
    }

    html += `
      <div class="freq-group ${isBandOpen ? "" : "collapsed"}" id="${band.id}">
        <div class="freq-group-header" onclick="toggleGroup('${band.id}')">
          <span><span class="arrow-icon">▼</span>${band.label}</span>
          <span class="group-count">${bandItems.length.toLocaleString()} 词</span>
        </div>
        <div class="freq-group-body">
          ${subHtml}
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function revealAndHighlightInSidebar(rank) {
  if (sidebarMode === "topic") {
    const q = document.getElementById("searchInput").value.trim();
    const allowed = new Set((currentFilteredList.length ? currentFilteredList : allFamilies).map(f => f.rank));
    if (activeTopicSubKey) {
      openState.set(activeTopicSubKey, true);
      const parts = activeTopicSubKey.split("-");
      if (parts.length >= 4) openState.set(`topic-cat-${parts[2]}`, true);
    }
    renderTopicSidebar(allowed, Boolean(q));
    const selector = activeTopicSubKey
      ? `.family-item[data-sub-key="${activeTopicSubKey}"][data-rank="${rank}"]`
      : `.family-item[data-rank="${rank}"]`;
    const topicEl = document.querySelector(selector) || document.querySelector(`.family-item[data-rank="${rank}"]`);
    document.querySelectorAll(".family-item").forEach(item => item.classList.remove("active"));
    if (topicEl) {
      topicEl.classList.add("active");
      topicEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    return;
  }
  let el = document.querySelector(`.family-item[data-rank="${rank}"]`);
  if (!el) {
    const band = FREQ_BANDS.find(b => rank >= b.min && rank <= b.max);
    if (band) {
      openState.set(band.id, true);
      const activeStep = (selectedPos === "ALL") ? SUB_STEP : 1000;
      const start = band.min + Math.floor((rank - band.min) / activeStep) * activeStep;
      const end = Math.min(start + activeStep - 1, band.max);
      openState.set(`sub-${start}-${end}`, true);
      const q = document.getElementById("searchInput").value.trim();
      renderGroupedSidebar(currentFilteredList.length ? currentFilteredList : allFamilies, Boolean(q));
      el = document.querySelector(`.family-item[data-rank="${rank}"]`);
    }
  }
  document.querySelectorAll(".family-item").forEach(item => {
    item.classList.toggle("active", Number(item.dataset.rank) === rank);
  });
  if (el) {
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function selectFamily(rank, autoCloseMobile = true, syncHash = true) {
  activeRank = rank;
  const fam = familyByRank.get(rank);
  if (!fam) return;

  if (syncHash) {
    const targetHash = `#${encodeURIComponent(fam.headword.toLowerCase())}`;
    if (window.location.hash !== targetHash) {
      history.replaceState(null, "", targetHash);
    }
  }

  revealAndHighlightInSidebar(rank);
  renderFamilyDetail(fam);

  syncMobileDockState();
  const mobileTitle = document.getElementById("mobileCurrentWord");
  if (mobileTitle) mobileTitle.textContent = `${fam.headword} (#${fam.rank})`;

  if (autoCloseMobile) {
    closeMobileDrawer();
    document.getElementById("mainView").scrollTop = 0;
  }
}

function toggleRare(checked) {
  hideRare = checked;
  localStorage.setItem("dict_hide_rare", checked ? "true" : "false");
  const main = document.getElementById("mainView");
  main.classList.toggle("hide-rare", hideRare);
  main.classList.toggle("hide-images", !showImages);
}

function getHeadwordPhonetic(fam) {
  if (fam.phonetic) return fam.phonetic;
  for (const b of fam.pos_branches) {
    for (const l of b.lemmas) {
      if (l.lemma.toLowerCase() === fam.headword.toLowerCase() && l.phonetic) {
        return l.phonetic;
      }
    }
  }
  return "";
}

function formatIpaDisplay(rawIpa) {
  if (!rawIpa) return "";
  const cleaned = rawIpa.replace(/^美\s*/, "").replace(/^\/|\/$/g, "").trim();
  return cleaned ? `美 /${cleaned}/` : "";
}

function toggleVpItem(el) {
  el.closest(".vp-item").classList.toggle("open");
}

function toggleAllVpItems(btn) {
  const container = btn.closest(".pos-section");
  const items = container.querySelectorAll(".vp-item");
  const expand = btn.dataset.expanded !== "true";
  items.forEach(it => it.classList.toggle("open", expand));
  container.querySelectorAll(".vp-group").forEach(g => g.classList.toggle("show-all", expand));
  container.querySelectorAll(".vp-more-btn").forEach(b => b.style.display = expand ? "none" : "block");
  btn.dataset.expanded = expand ? "true" : "false";
  btn.textContent = expand ? "收起全部例句 ▴" : "展开全部例句 ▾";
}

function renderVerbPhrasesSection(headword) {
  const vp = verbPhrasesMap[(headword || "").toLowerCase()];
  if (!vp) return "";
  const groups = [
    { key: "phrasal_verbs", title: "动词短语 Phrasal Verbs", tagColor: "#1d4ed8", limit: 6 },
    { key: "idioms", title: "地道习语 Idioms", tagColor: "#a16207", limit: 4 },
    { key: "collocations", title: "常用搭配 Collocations", tagColor: "#15803d", limit: 4 }
  ];
  const hasAny = groups.some(g => Array.isArray(vp[g.key]) && vp[g.key].length > 0);
  if (!hasAny) return "";

  const qNow = (document.getElementById("searchInput")?.value || "").trim().toLowerCase();
  let sectionsHtml = "";

  for (const g of groups) {
    const items = vp[g.key] || [];
    if (!items.length) continue;

    let hasMatchedItem = false;

    const rows = items.map((item, idx) => {
      const pSafe = escapeAttr(item.phrase);
      const senses = item.senses || [];
      const badges = [];
      if (item.grammar_type === "phrasal-prepositional") {
        badges.push('<span style="font-size:10.5px;background:#e0e7ff;color:#3730a3;padding:1px 5px;border-radius:4px;font-weight:600;flex-shrink:0;">三词短语</span>');
      }
      if (item.separable === "separable") {
        badges.push('<span title="及物可分短语：代词宾语须放中间（如 turn it off）" style="font-size:10.5px;background:#dcfce7;color:#166534;padding:1px 5px;border-radius:4px;font-weight:600;flex-shrink:0;">可分</span>');
      } else if (item.separable === "inseparable") {
        badges.push('<span title="不可分短语：宾语须跟在整体短语后（如 look after it）" style="font-size:10.5px;background:#f1f5f9;color:#475569;padding:1px 5px;border-radius:4px;font-weight:600;flex-shrink:0;">不可分</span>');
      }
      if (Array.isArray(item.register)) {
        item.register.forEach(r => {
          badges.push(`<span style="font-size:10.5px;background:#fef3c7;color:#92400e;padding:1px 5px;border-radius:4px;font-weight:600;flex-shrink:0;">${r}</span>`);
        });
      }

      const isMatch = Boolean(qNow) && (
        item.phrase.toLowerCase().includes(qNow) ||
        senses.some(s => (s.meaning || "").toLowerCase().includes(qNow) || (s.example_en || "").toLowerCase().includes(qNow) || (s.example_zh || "").toLowerCase().includes(qNow))
      );
      if (isMatch) hasMatchedItem = true;

      const previewText = senses.length > 1
        ? senses.map((s, i) => `${i + 1}. ${s.meaning}`).join("  ·  ")
        : (senses[0]?.meaning || "");

      const sensesHtml = senses.map((s, i) => {
        const exSafe = escapeAttr(s.example_en || "");
        const numBadge = senses.length > 1 ? `<span style="color:#2563eb;font-weight:700;margin-right:4px;">${i + 1}.</span>` : "";
        return `
          <div class="vp-sense-row">
            <div class="vp-sense-meaning">${numBadge}${s.meaning}</div>
            ${s.example_en ? `
              <div class="vp-sense-en">• ${s.example_en} <button class="tts-btn" style="padding:1px 6px;font-size:11px;" title="朗读例句" onclick="event.stopPropagation();speakText('${exSafe}', 'en-US', this)">🔊</button></div>
              <div class="vp-sense-zh">${s.example_zh || ""}</div>
            ` : ""}
          </div>`;
      }).join("");

      const hiddenCls = (idx >= g.limit && !hasMatchedItem) ? "vp-hidden-item" : "";
      const openCls = isMatch ? "open vp-match" : "";
      return `
        <div class="vp-item ${hiddenCls} ${openCls}">
          <div class="vp-summary" onclick="toggleVpItem(this)">
            <span class="vp-chevron">▶</span>
            <span class="vp-phrase-title">${item.phrase}</span>${badges.join("")}
            <button class="tts-btn" style="padding:2px 7px;font-size:11.5px;flex-shrink:0;" title="朗读短语" onclick="event.stopPropagation();speakText('${pSafe}', 'en-US', this)">🔊</button>
            <span class="vp-meaning-preview" title="${escapeAttr(previewText)}">${previewText}</span>
          </div>
          <div class="vp-details">
            ${sensesHtml}
          </div>
        </div>`;
    }).join("");

    const extraCount = items.length - g.limit;
    const moreBtnHtml = (extraCount > 0 && !hasMatchedItem)
      ? `<button class="vp-more-btn" onclick="this.closest('.vp-group').classList.add('show-all');this.style.display='none';">展开其余 ${extraCount} 条${g.title.split(" ")[0]} ▾</button>`
      : "";

    sectionsHtml += `
      <div class="vp-group ${hasMatchedItem ? "show-all" : ""}" style="margin-top:12px;">
        <div style="font-size:13px;font-weight:700;color:${g.tagColor};margin-bottom:6px;">${g.title}（${items.length}）</div>
        ${rows}
        ${moreBtnHtml}
      </div>`;
  }

  return `
    <div class="pos-section" style="background:#f8fafc;">
      <div class="pos-header" style="margin-bottom:4px;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span>🧩 高频短语、习语与固定搭配</span>
          <span style="font-size:12px;font-weight:500;color:#64748b;">(点击短语展开多义项例句)</span>
        </div>
        <button class="desktop-nav-btn" style="font-size:12px;padding:3px 9px;" data-expanded="false" onclick="toggleAllVpItems(this)">展开全部例句 ▾</button>
      </div>
      ${sectionsHtml}
    </div>`;
}

function renderFamilyDetail(fam) {
  const main = document.getElementById("mainView");
  main.classList.toggle("hide-rare", hideRare);
  main.classList.toggle("hide-images", !showImages);
  const hwSafe = escapeAttr(fam.headword);
  const hwIpaText = formatIpaDisplay(getHeadwordPhonetic(fam));
  const vInit = pickBestVoice("en-US");
  if (vInit) currentVoiceName = vInit.name;

  const guideHtml = (fam.family_guide && (fam.family_guide.root_logic || fam.family_guide.core_distinction)) ? `
    <div class="guide-box">
      ${fam.family_guide.root_logic ? `<div><strong>构词与词源逻辑：</strong>${fam.family_guide.root_logic}</div>` : ""}
      ${fam.family_guide.core_distinction ? `<div class="guide-distinction"><strong>易混辨析：</strong>${fam.family_guide.core_distinction}</div>` : ""}
      ${(fam.related_forms && fam.related_forms.length) ? `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed #bae6fd;display:flex;flex-wrap:wrap;align-items:center;gap:8px;"><strong style="color:#0369a1;">🔗 关联词形：</strong>${fam.related_forms.map(rf => `<button onclick="selectFamily(${rf.rank}, false, true)" style="background:#ffffff;border:1px solid #7dd3fc;color:#0369a1;padding:3px 10px;border-radius:999px;font-size:13px;cursor:pointer;font-weight:500;">${rf.label}：<strong>${rf.word}</strong> <span style="opacity:0.75;">(#${rf.rank})</span> ↗</button>`).join("")}</div>` : ""}
    </div>
  ` : "";

  const branchesHtml = fam.pos_branches.map(b => {
    const lemmasHtml = b.lemmas.map(l => {
      const tierLabel = l.tier === "core" ? "CORE 核心" : (l.tier === "common" ? "COMMON 常见" : (l.tier === "uncommon" ? "UNCOMMON 进阶" : "RARE 罕见"));
      const wSafe = escapeAttr(l.lemma);
      const lIpaText = formatIpaDisplay(l.phonetic);

      const defHtml = (l.def_zh || l.def_en) ? `
        <div class="lemma-def">
          ${l.def_zh ? `<span class="def-zh">${l.def_zh}</span>` : ""}
          ${l.def_en ? `<span class="def-en">${l.def_en}</span>` : ""}
        </div>
      ` : "";

      const usageHtml = l.usage_note ? `<div class="lemma-usage"><strong>💡 用法与搭配：</strong>${l.usage_note}</div>` : "";

      const examplesHtml = (l.examples && l.examples.length) ? `
        <div class="lemma-examples">
          ${l.examples.map(ex => `
            <div class="example-item">
              <div class="ex-en">• ${ex.en} <button class="tts-btn" style="padding:1px 6px;font-size:11px;margin-left:4px;" title="朗读例句" onclick="speakText('${escapeAttr(ex.en)}', 'en-US', this)">🔊</button></div>
              ${ex.zh ? `<div class="ex-zh">${ex.zh}</div>` : ""}
            </div>
          `).join("")}
        </div>
      ` : "";

      const infHtml = Object.entries(l.inflections || {}).map(([slot, words]) => {
        const arr = Array.isArray(words) ? words : [words];
        const clickableWords = arr.map(w =>
          `<strong class="word-click" title="点击发音: ${w}" onclick="speakText('${escapeAttr(w)}', 'en-US')">${w}</strong>`
        ).join(", ");
        return `
          <div class="slot-pill">
            <span class="slot-label">${SLOT_NAMES[slot] || slot}:</span>
            ${clickableWords}
          </div>
        `;
      }).join("");

      const topicHint = visualHintByRank.has(fam.rank) ? visualHintByRank.get(fam.rank) : null;
      const visualHtml = (b.pos === "n." && l.img)
        ? `<div class="lemma-visual-wrap" onclick="window.open('./images/${l.img}', '_blank')" title="点击查看大图"><img src="./images/${l.img}" alt="${wSafe}" loading="lazy" onerror="this.parentElement.remove()"></div>`
        : ((b.pos === "n." && topicHint !== null && l.tier !== "rare")
            ? `<div class="lemma-visual-wrap loading" data-visual-word="${wSafe}" data-visual-hint="${escapeAttr(topicHint)}" title="点击查看大图"></div>`
            : "");

      return `
        <div class="lemma-card tier-${l.tier}">
          <div class="lemma-body-flex">
            <div class="lemma-text-col">
              <div class="lemma-top">
                <span class="lemma-word">${l.lemma}</span>
                ${lIpaText ? `<span class="phonetic-sm" title="点击朗读美音" onclick="speakText('${wSafe}', 'en-US')">${lIpaText}</span>` : ""}
                <button class="tts-btn" title="美式发音" onclick="speakText('${wSafe}', 'en-US', this)">🔊 美</button>
                <button class="tts-btn" title="英式发音" onclick="speakText('${wSafe}', 'en-GB', this)">🔊 英</button>
                <span class="tag tag-${l.tier}">${tierLabel}</span>
                <span style="font-size:12px;color:#94a3b8;">Zipf: ${l.zipf}</span>
              </div>
              ${defHtml}
              ${usageHtml}
              ${examplesHtml}
              <div class="inflection-grid">${infHtml}</div>
            </div>
            ${visualHtml}
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="pos-section">
        <div class="pos-header">${getPosBadgeHtml(b.pos, true)} 词性分支</div>
        ${lemmasHtml}
      </div>
    `;
  }).join("");

  main.innerHTML = `
    <div class="toolbar-wrap">
      <div class="toolbar-main-row">
        <div class="toolbar-title-group">
          <span class="header-title">${fam.headword}</span>
          ${hwIpaText ? `<span class="phonetic-tag" title="点击朗读美音" onclick="speakText('${hwSafe}', 'en-US')">${hwIpaText}</span>` : ""}
          <button class="tts-btn" title="美式发音" onclick="speakText('${hwSafe}', 'en-US', this)">🔊 美音</button>
          <button class="tts-btn" title="英式发音" onclick="speakText('${hwSafe}', 'en-GB', this)">🔊 英音</button>
        </div>
        <div class="toolbar-action-group">
          <button class="dict-trigger-btn" onclick="window.__dictCtrl.open('setup')">✍️ 默写 / 错题本</button>
          <button class="fav-btn ${favoriteRanks.has(fam.rank) ? "active" : ""}" onclick="toggleFavorite(${fam.rank})">${favoriteRanks.has(fam.rank) ? "⭐ 已收藏" : "☆ 收藏"}</button>
          <div class="desktop-nav-group">
            <button class="desktop-nav-btn" title="上一个词族 (快捷键 ←)" onclick="stepFamily(-1)">‹ 上一词</button>
            <button class="desktop-nav-btn" title="下一个词族 (快捷键 →)" onclick="stepFamily(1)">下一词 ›</button>
          </div>
        </div>
      </div>
      <div class="toolbar-sub-row">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="color:#64748b;font-size:13px;font-weight:600;">Rank #${fam.rank}</span>
          <span style="color:#cbd5e1;">|</span>
          <span style="color:#64748b;font-size:13px;">主词性</span>
          ${getPosBadgeHtml(fam.primary_pos, false)}
        </div>
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
          <span class="voice-status" id="voiceStatusBadge">当前语音: ${currentVoiceName}</span>
          <label style="font-size:13px; color:#475569; cursor:pointer; user-select:none; display:inline-flex; align-items:center; gap:4px;">
            <input type="checkbox" ${showImages ? "checked" : ""} onchange="toggleImages(this.checked)"> 实物配图
          </label>
          <label style="font-size:13px; color:#475569; cursor:pointer; user-select:none; display:inline-flex; align-items:center; gap:4px;">
            <input type="checkbox" ${hideRare ? "checked" : ""} onchange="toggleRare(this.checked)"> 隐藏罕见词 (Rare)
          </label>
        </div>
      </div>
    </div>
    ${guideHtml}
    ${branchesHtml}
    ${renderVerbPhrasesSection(fam.headword)}
  `;
  loadVisibleVisuals();
}

// 挂载全局供内联事件调用
window.openMobileDrawer = openMobileDrawer;
window.closeMobileDrawer = closeMobileDrawer;
window.stepFamily = stepFamily;
window.speakCurrentHeadword = speakCurrentHeadword;
window.toggleCurrentFavorite = toggleCurrentFavorite;
window.speakText = speakText;
window.setSidebarMode = setSidebarMode;
window.setPosFilter = setPosFilter;
window.toggleSecondaryPos = toggleSecondaryPos;
window.toggleGroup = toggleGroup;
window.selectFamily = selectFamily;
window.toggleRare = toggleRare;
window.toggleImages = toggleImages;
window.toggleFavorite = toggleFavorite;
window.exportFavorites = exportFavorites;
window.importFavorites = importFavorites;
window.toggleVpItem = toggleVpItem;
window.toggleAllVpItems = toggleAllVpItems;

window.__dictCtrl = new DictationController({
  getFamilies: () => allFamilies,
  getFamilyByRank: (r) => familyByRank.get(r),
  speakText,
  selectFamily,
  onStateSync: refreshStateFromStore
});
