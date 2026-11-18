let pvData = null;
let pvMode = 'verb'; // 'verb' | 'particle'
let selectedVerb = '';
let selectedParticle = 'up';
let pvQuery = '';

function ensureModal() {
  let overlay = document.getElementById('pvLabOverlay');
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'pvLabOverlay';
  overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;align-items:center;justify-content:center;padding:14px;backdrop-filter:blur(2px);';
  overlay.onclick = (e) => { if (e.target === overlay) closePhrasalLab(); };
  overlay.innerHTML = `
    <div style="background:#fff;width:min(1120px,98vw);height:min(88vh,860px);border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,.25);display:flex;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="padding:12px 18px;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:10px;">
          <strong style="font-size:16px;">🔗 核心动词短语图谱</strong>
          <span id="pvStatsBadge" style="font-size:12px;background:#1e293b;color:#94a3b8;padding:2px 8px;border-radius:99px;">加载中...</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <button id="pvTabVerb" onclick="window.__pvLab.setMode('verb')" style="padding:5px 12px;border-radius:6px;border:1px solid #3b82f6;background:#2563eb;color:#fff;font-size:12.5px;cursor:pointer;font-weight:600;">按核心动词</button>
          <button id="pvTabParticle" onclick="window.__pvLab.setMode('particle')" style="padding:5px 12px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#cbd5e1;font-size:12.5px;cursor:pointer;">按小品词反查</button>
          <input id="pvSearchInput" type="text" placeholder="搜短语 / 中文释义..." oninput="window.__pvLab.search(this.value)" style="padding:5px 10px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#fff;font-size:12.5px;width:170px;outline:none;">
          <button onclick="window.__pvLab.close()" style="padding:5px 10px;border-radius:6px;border:1px solid #475569;background:transparent;color:#cbd5e1;font-size:13px;cursor:pointer;">✕ 关闭</button>
        </div>
      </div>
      <div id="pvLabBody" style="flex:1;display:flex;overflow:hidden;background:#f8fafc;"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function speakText(txt) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(txt);
  u.lang = 'en-US';
  u.rate = 0.95;
  window.speechSynthesis.speak(u);
}

function renderPhraseCard(item, showVerbBadge = false) {
  const tags = [];
  if (item.sep) tags.push(`<span style="font-size:11px;padding:1px 6px;border-radius:4px;background:#f1f5f9;color:#475569;">${esc(item.sep)}</span>`);
  (item.reg || []).forEach(r => tags.push(`<span style="font-size:11px;padding:1px 6px;border-radius:4px;background:#fef3c7;color:#92400e;">${esc(r)}</span>`));

  const sensesHtml = (item.s || []).map((s, idx) => `
    <div style="margin-top:${idx ? '8px' : '4px'};padding-left:8px;border-left:2px solid #cbd5e1;">
      <div style="font-size:13.5px;color:#0f172a;font-weight:500;">${item.s.length > 1 ? (idx + 1) + '. ' : ''}${esc(s.m)}</div>
      ${s.en ? `<div style="font-size:12.5px;color:#334155;margin-top:3px;cursor:pointer;" onclick="window.__pvLab.speak('${esc(s.en).replace(/'/g, "\\'")}')" title="点击朗读例句">🔊 ${esc(s.en)}</div>` : ''}
      ${s.zh ? `<div style="font-size:12px;color:#64748b;margin-top:1px;">${esc(s.zh)}</div>` : ''}
    </div>
  `).join('');

  return `
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:10px;box-shadow:0 1px 2px rgba(0,0,0,.03);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:16px;font-weight:700;color:#1d4ed8;cursor:pointer;" onclick="window.__pvLab.speak('${esc(item.p).replace(/'/g, "\\'")}')" title="点击朗读短语">${esc(item.p)} 🔊</span>
          ${showVerbBadge && item._verb ? `<span style="font-size:11px;background:#eff6ff;color:#2563eb;padding:1px 7px;border-radius:99px;">动词: ${esc(item._verb)}</span>` : ''}
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap;">${tags.join('')}</div>
      </div>
      ${sensesHtml}
    </div>
  `;
}

function renderLab() {
  const body = document.getElementById('pvLabBody');
  if (!pvData || !body) return;
  const q = pvQuery.trim().toLowerCase();

  // 全局搜索模式
  if (q) {
    const matches = [];
    for (const vObj of pvData.verbs) {
      for (const [part, list] of Object.entries(vObj.g)) {
        for (const it of list) {
          const hitP = it.p.toLowerCase().includes(q);
          const hitM = (it.s || []).some(s => (s.m || '').toLowerCase().includes(q));
          if (hitP || hitM) {
            matches.push({ ...it, _verb: vObj.v });
          }
        }
      }
      if (matches.length >= 120) break;
    }
    body.innerHTML = `
      <div style="flex:1;overflow-y:auto;padding:16px 20px;">
        <div style="font-size:13px;color:#475569;margin-bottom:12px;">搜索 “<strong>${esc(pvQuery)}</strong>” 共匹配 <strong>${matches.length}${matches.length >= 120 ? '+' : ''}</strong> 条动词短语：</div>
        ${matches.length ? matches.map(m => renderPhraseCard(m, true)).join('') : '<div style="text-align:center;color:#94a3b8;padding:40px;">未找到匹配的短语，换个词试试</div>'}
      </div>
    `;
    return;
  }

  if (pvMode === 'verb') {
    if (!selectedVerb && pvData.verbs.length) selectedVerb = pvData.verbs[0].v;
    const leftHtml = pvData.verbs.map(vObj => {
      const active = vObj.v === selectedVerb;
      return `
        <div onclick="window.__pvLab.selectVerb('${esc(vObj.v)}')" style="padding:9px 12px;border-bottom:1px solid #f1f5f9;cursor:pointer;background:${active ? '#eff6ff' : '#fff'};border-left:3px solid ${active ? '#2563eb' : 'transparent'};display:flex;justify-content:space-between;align-items:center;gap:6px;">
          <div style="min-width:0;">
            <div style="font-weight:700;font-size:14px;color:${active ? '#1d4ed8' : '#0f172a'};">${esc(vObj.v)} <span style="font-weight:400;font-size:11px;color:#94a3b8;">#${vObj.r < 99999 ? vObj.r : '-'}</span></div>
            <div style="font-size:11.5px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(vObj.zh)}</div>
          </div>
          <span style="font-size:11px;font-weight:600;background:${active ? '#2563eb' : '#f1f5f9'};color:${active ? '#fff' : '#475569'};padding:2px 7px;border-radius:99px;flex-shrink:0;">${vObj.n}</span>
        </div>
      `;
    }).join('');

    const cur = pvData.verbs.find(x => x.v === selectedVerb) || pvData.verbs[0];
    const groups = cur ? Object.entries(cur.g).sort((a, b) => b[1].length - a[1].length) : [];
    const rightHtml = cur ? `
      <div style="margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #e2e8f0;display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div>
          <span style="font-size:22px;font-weight:800;color:#0f172a;">${esc(cur.v)}</span>
          <span style="font-size:13.5px;color:#475569;margin-left:8px;">${esc(cur.zh)}</span>
        </div>
        <span style="font-size:12px;color:#64748b;">共收录 <strong>${cur.n}</strong> 个高频短语 · 按小品词分组</span>
      </div>
      ${groups.map(([part, items]) => `
        <div style="margin-bottom:18px;">
          <div style="font-size:12.5px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
            <span style="background:#dbeafe;padding:2px 8px;border-radius:5px;">+ ${esc(part)}</span>
            <span style="color:#94a3b8;font-weight:400;">(${items.length})</span>
          </div>
          ${items.map(it => renderPhraseCard(it, false)).join('')}
        </div>
      `).join('')}
    ` : '';

    body.innerHTML = `
      <div style="width:230px;flex-shrink:0;background:#fff;border-right:1px solid #e2e8f0;overflow-y:auto;">${leftHtml}</div>
      <div style="flex:1;overflow-y:auto;padding:16px 20px;">${rightHtml}</div>
    `;
  } else {
    // 按小品词反查模式
    const leftHtml = pvData.particles.map(p => {
      const active = p === selectedParticle;
      return `
        <div onclick="window.__pvLab.selectParticle('${esc(p)}')" style="padding:10px 14px;border-bottom:1px solid #f1f5f9;cursor:pointer;background:${active ? '#eff6ff' : '#fff'};border-left:3px solid ${active ? '#2563eb' : 'transparent'};font-weight:${active ? '700' : '500'};color:${active ? '#1d4ed8' : '#1e293b'};font-size:14px;">
          + ${esc(p)}
        </div>
      `;
    }).join('');

    const list = [];
    for (const vObj of pvData.verbs) {
      if (vObj.g[selectedParticle]) {
        for (const it of vObj.g[selectedParticle]) {
          list.push({ ...it, _verb: vObj.v });
        }
      }
    }
    const rightHtml = `
      <div style="margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;">
        <div style="font-size:18px;font-weight:800;color:#0f172a;">小品词 <span style="color:#2563eb;">+ ${esc(selectedParticle)}</span> 短语网络</div>
        <span style="font-size:12px;color:#64748b;">共 <strong>${list.length}</strong> 条（按核心动词词频排序）</span>
      </div>
      ${list.slice(0, 150).map(it => renderPhraseCard(it, true)).join('')}
    `;
    body.innerHTML = `
      <div style="width:170px;flex-shrink:0;background:#fff;border-right:1px solid #e2e8f0;overflow-y:auto;">${leftHtml}</div>
      <div style="flex:1;overflow-y:auto;padding:16px 20px;">${rightHtml}</div>
    `;
  }
}

export async function openPhrasalLab(initialVerb = '') {
  const overlay = ensureModal();
  overlay.style.display = 'flex';
  if (initialVerb) {
    pvMode = 'verb';
    selectedVerb = initialVerb.toLowerCase();
  }
  if (!pvData) {
    const resp = await fetch('./phrasal_verbs_lab.json');
    pvData = await resp.json();
    const badge = document.getElementById('pvStatsBadge');
    if (badge) badge.textContent = `${pvData.total_verbs} 核心动词 · ${pvData.total_phrases} 短语`;
  }
  renderLab();
}

export function closePhrasalLab() {
  const overlay = document.getElementById('pvLabOverlay');
  if (overlay) overlay.style.display = 'none';
}

window.__pvLab = {
  open: openPhrasalLab,
  close: closePhrasalLab,
  speak: speakText,
  selectVerb(v) { selectedVerb = v; renderLab(); },
  selectParticle(p) { selectedParticle = p; renderLab(); },
  search(q) { pvQuery = q; renderLab(); },
  setMode(m) {
    pvMode = m;
    pvQuery = '';
    const inp = document.getElementById('pvSearchInput');
    if (inp) inp.value = '';
    const bv = document.getElementById('pvTabVerb');
    const bp = document.getElementById('pvTabParticle');
    if (bv && bp) {
      bv.style.background = m === 'verb' ? '#2563eb' : '#1e293b';
      bv.style.color = m === 'verb' ? '#fff' : '#cbd5e1';
      bv.style.borderColor = m === 'verb' ? '#3b82f6' : '#334155';
      bp.style.background = m === 'particle' ? '#2563eb' : '#1e293b';
      bp.style.color = m === 'particle' ? '#fff' : '#cbd5e1';
      bp.style.borderColor = m === 'particle' ? '#3b82f6' : '#334155';
    }
    renderLab();
  }
};
