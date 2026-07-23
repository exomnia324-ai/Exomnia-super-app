'use strict';
/* ═══════════════════════════════════════════════════════════════
   DEEP SPACE COMBAT — WEEKLY CHALLENGES
   Challenges.js  |  Standalone module, loaded after game.js + Achievements.js
   ═══════════════════════════════════════════════════════════════ */

const CHAL = (function () {

  /* ── Storage keys ── */
  const KEY_WEEK_ID    = 'exomniaChalWeekId';
  const KEY_BASELINE   = 'exomniaChalBaseline';   // snapshot of lifetime counters at week start
  const KEY_WEEKPROG   = 'exomniaChalWeekProg';   // counters accumulated purely this week (kills, coins, games, bestScore, bestCombo, bestWave)
  const KEY_CLAIMED    = 'exomniaChalClaimed';    // comma-separated ids claimed this week

  /* ══ Pool of possible challenges — 5 are picked per week, deterministically ══ */
  const POOL = [
    { id:'survivor',   icon:'🎮', name:'SURVIVOR',      desc:'Play 5 missions this week',        target:5,    key:'games',     reward:60  },
    { id:'exterminate',icon:'💀', name:'EXTERMINATOR',  desc:'Destroy 150 enemies this week',    target:150,  key:'kills',      reward:100 },
    { id:'bosshunt',   icon:'☠️', name:'BOSS HUNTER',    desc:'Defeat 3 bosses this week',        target:3,    key:'bossKills',  reward:150 },
    { id:'highroller', icon:'◈', name:'HIGH ROLLER',    desc:'Earn 300 coins this week',         target:300,  key:'coins',      reward:80  },
    { id:'sharpshoot', icon:'⭐', name:'SHARPSHOOTER',   desc:'Score 5,000+ in a single run',     target:5000, key:'bestScore',  reward:120 },
    { id:'combomaster',icon:'🔥', name:'COMBO MASTER',   desc:'Hit a 15× combo in a single run',  target:15,   key:'bestCombo',  reward:90  },
    { id:'wavecrush',  icon:'🌊', name:'WAVE CRUSHER',   desc:'Reach Wave 8 in a single run',     target:8,    key:'bestWave',   reward:100 },
  ];
  const PICKS_PER_WEEK = 5;

  /* ── ISO-ish week id: YYYY-Www, resets every Monday ── */
  function getWeekId() {
    const d = new Date();
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() + 3 - ((d.getDay()+6)%7)); // nearest Thursday
    const week1 = new Date(d.getFullYear(),0,4);
    const wk = 1 + Math.round(((d-week1)/86400000 - 3 + ((week1.getDay()+6)%7))/7);
    return d.getFullYear()+'-W'+wk;
  }

  function msUntilNextMonday() {
    const now = new Date();
    const day = now.getDay(); // 0 Sun .. 6 Sat
    const daysUntilMon = (8 - day) % 7 || 7;
    const next = new Date(now);
    next.setHours(0,0,0,0);
    next.setDate(now.getDate() + daysUntilMon);
    return next - now;
  }

  function fmtCountdown(ms) {
    const h = Math.floor(ms/3600000), d = Math.floor(h/24);
    const hh = h % 24, mm = Math.floor((ms%3600000)/60000);
    return d>0 ? `${d}d ${hh}h` : `${hh}h ${mm}m`;
  }

  /* ── This-week picks, deterministic by week id so all players see the same set ── */
  function seededPicks(weekId) {
    let seed = 0;
    for (let i=0;i<weekId.length;i++) seed = (seed*31 + weekId.charCodeAt(i)) >>> 0;
    const pool = POOL.slice();
    const picks = [];
    for (let i=0;i<PICKS_PER_WEEK && pool.length;i++) {
      seed = (seed*1103515245 + 12345) >>> 0;
      const idx = seed % pool.length;
      picks.push(pool.splice(idx,1)[0]);
    }
    return picks;
  }

  /* ── Lifetime stat readers (mirrors Achievements.js) ── */
  function lifetimeStats() {
    return {
      games:      parseInt(localStorage.getItem('exomniaGames')      || '0'),
      totalKills: parseInt(localStorage.getItem('exomniaTotalKills') || '0'),
      totalCoins: parseInt(localStorage.getItem('exomniaTotalCoins') || '0'),
      bossKills:  parseInt(localStorage.getItem('exomniaBossKills')  || '0'),
    };
  }

  function getBaseline() {
    try { return JSON.parse(localStorage.getItem(KEY_BASELINE) || '{}'); } catch { return {}; }
  }
  function setBaseline(obj) {
    try { localStorage.setItem(KEY_BASELINE, JSON.stringify(obj)); } catch {}
  }
  function getWeekProg() {
    try { return JSON.parse(localStorage.getItem(KEY_WEEKPROG) || '{}'); } catch { return {}; }
  }
  function setWeekProg(obj) {
    try { localStorage.setItem(KEY_WEEKPROG, JSON.stringify(obj)); } catch {}
  }
  function getClaimed() {
    try { return (localStorage.getItem(KEY_CLAIMED) || '').split(',').filter(Boolean); } catch { return []; }
  }
  function setClaimed(arr) {
    try { localStorage.setItem(KEY_CLAIMED, arr.join(',')); } catch {}
  }

  /* ── Ensure the week is current; roll over + reset if not ── */
  function ensureWeek() {
    const wk = getWeekId();
    const storedWk = localStorage.getItem(KEY_WEEK_ID);
    if (storedWk !== wk) {
      localStorage.setItem(KEY_WEEK_ID, wk);
      setBaseline(lifetimeStats());
      setWeekProg({ games:0, kills:0, coins:0, bossKills:0, bestScore:0, bestCombo:0, bestWave:0 });
      setClaimed([]);
    }
    return wk;
  }

  /* ── Current progress values for each stat key ── */
  function currentValues() {
    ensureWeek();
    const base = getBaseline();
    const life = lifetimeStats();
    const wp   = getWeekProg();
    return {
      games:     Math.max(0, life.games      - (base.games      || 0)),
      kills:     Math.max(0, life.totalKills - (base.totalKills || 0)),
      coins:     Math.max(0, life.totalCoins - (base.totalCoins || 0)),
      bossKills: Math.max(0, life.bossKills  - (base.bossKills  || 0)),
      bestScore: wp.bestScore || 0,
      bestCombo: wp.bestCombo || 0,
      bestWave:  wp.bestWave  || 0,
    };
  }

  /* ── Called after every run to update per-run-max style stats ── */
  function recordRun(runStats) {
    ensureWeek();
    const wp = getWeekProg();
    wp.bestScore = Math.max(wp.bestScore || 0, runStats.score || 0);
    wp.bestCombo = Math.max(wp.bestCombo || 0, runStats.maxCombo || 0);
    wp.bestWave  = Math.max(wp.bestWave  || 0, runStats.wave || 0);
    setWeekProg(wp);
    updateChalBadge();
  }

  function claim(id) {
    const wk = ensureWeek();
    const picks = seededPicks(wk);
    const c = picks.find(p => p.id === id);
    if (!c) return;
    const claimed = getClaimed();
    if (claimed.includes(id)) { if (window.showToast) showToast('ALREADY CLAIMED'); return; }
    const vals = currentValues();
    if ((vals[c.key]||0) < c.target) { if (window.showToast) showToast('NOT COMPLETE YET'); return; }
    claimed.push(id);
    setClaimed(claimed);
    try {
      const cur = parseInt(localStorage.getItem('exomniaTotalCoins') || '0');
      localStorage.setItem('exomniaTotalCoins', cur + c.reward);
    } catch {}
    const topCoin = document.getElementById('lbyCoinDisplay');
    if (topCoin) topCoin.textContent = parseInt(localStorage.getItem('exomniaTotalCoins')||'0');
    if (window.showToast) showToast('✔ CLAIMED: +'+c.reward+' COINS');
    updateChalBadge();
    openPanel(); // refresh
  }

  function claimableCount() {
    const wk = ensureWeek();
    const picks = seededPicks(wk);
    const claimed = getClaimed();
    const vals = currentValues();
    return picks.filter(c => !claimed.includes(c.id) && (vals[c.key]||0) >= c.target).length;
  }

  function updateChalBadge() {
    const btn = document.getElementById('lbyChalBtn');
    if (!btn) return;
    const n = claimableCount();
    let dot = btn.querySelector('.chal-badge-dot');
    if (n > 0) {
      if (!dot) {
        dot = document.createElement('div');
        dot.className = 'chal-badge-dot';
        dot.style.cssText = `
          position:absolute;top:-4px;right:-4px;min-width:16px;height:16px;
          border-radius:50%;background:#ff3366;color:#fff;font-size:9px;
          font-weight:900;display:flex;align-items:center;justify-content:center;
          box-shadow:0 0 8px #ff3366;padding:0 3px;
        `;
        btn.appendChild(dot);
      }
      dot.textContent = n;
    } else if (dot) {
      dot.remove();
    }
  }

  /* ══ Panel UI (visually mirrors the Achievements panel) ══ */
  function openPanel() {
    const old = document.getElementById('chalPanel');
    if (old) old.remove();

    const wk = ensureWeek();
    const picks = seededPicks(wk);
    const claimed = getClaimed();
    const vals = currentValues();
    const countdown = fmtCountdown(msUntilNextMonday());

    const panel = document.createElement('div');
    panel.id = 'chalPanel';
    panel.style.cssText = `
      position:fixed;inset:0;z-index:400;
      background:rgba(0,2,14,0.97);
      display:flex;flex-direction:column;
      font-family:'Courier New',monospace;
      animation:chalPanelIn 0.3s cubic-bezier(0.34,1.2,0.64,1);
      overflow:hidden;
    `;

    const doneCount = picks.filter(c => claimed.includes(c.id)).length;
    const pct = Math.round(doneCount / picks.length * 100);

    const cards = picks.map(c => {
      const isClaimed = claimed.includes(c.id);
      const v = Math.min(vals[c.key]||0, c.target);
      const ready = !isClaimed && v >= c.target;
      const barPct = Math.round(v/c.target*100);
      const col = isClaimed ? '#4a6a85' : ready ? '#00ff8c' : '#00d4ff';
      return `
        <div style="
          background:${isClaimed?'rgba(0,10,28,0.55)':'rgba(0,10,28,0.9)'};
          border:1px solid ${col}55;border-radius:8px;padding:12px;
          display:flex;align-items:center;gap:12px;
          opacity:${isClaimed?'0.55':'1'};position:relative;overflow:hidden;
        ">
          <div style="font-size:26px;line-height:1;flex-shrink:0;
            filter:${isClaimed?'grayscale(1) brightness(0.5)':'drop-shadow(0 0 8px '+col+')'};">${c.icon}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:11px;font-weight:900;letter-spacing:2px;color:${isClaimed?'rgba(255,255,255,0.4)':'#fff'};margin-bottom:2px;">${c.name}</div>
            <div style="font-size:8px;letter-spacing:1px;color:rgba(255,255,255,0.5);line-height:1.4;margin-bottom:6px;">${c.desc}</div>
            <div style="height:5px;background:rgba(255,255,255,0.08);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${barPct}%;background:${col};border-radius:3px;box-shadow:0 0 8px ${col}88;transition:width .6s;"></div>
            </div>
            <div style="font-size:8px;letter-spacing:1px;color:${col};margin-top:4px;">${v}/${c.target} &nbsp;·&nbsp; ◈${c.reward}</div>
          </div>
          ${isClaimed
            ? `<div style="font-size:8px;letter-spacing:1px;color:#4a6a85;flex-shrink:0;">✔ DONE</div>`
            : ready
              ? `<div class="chal-claim-btn" data-id="${c.id}" style="flex-shrink:0;padding:8px 12px;border-radius:6px;background:linear-gradient(145deg,rgba(0,255,140,0.18),rgba(0,255,140,0.05));border:1px solid rgba(0,255,140,0.5);color:#00ff8c;font-size:9px;font-weight:900;letter-spacing:1px;cursor:pointer;">CLAIM</div>`
              : `<div style="flex-shrink:0;width:22px;height:22px;border-radius:50%;border:1.5px solid rgba(255,255,255,0.12);"></div>`
          }
        </div>
      `;
    }).join('');

    panel.innerHTML = `
      <style>
        @keyframes chalPanelIn { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
      </style>
      <div style="
        padding:16px 16px 12px;border-bottom:1px solid rgba(0,229,255,0.12);
        display:flex;align-items:center;gap:12px;
        background:linear-gradient(180deg,rgba(0,10,28,0.98),transparent);flex-shrink:0;
      ">
        <div style="flex:1;">
          <div style="font-size:8px;letter-spacing:5px;color:rgba(0,229,255,0.5);margin-bottom:2px;">RESETS IN ${countdown}</div>
          <div style="font-size:clamp(15px,5vw,22px);font-weight:900;letter-spacing:4px;color:#00e5ff;text-shadow:0 0 20px #00e5ff;">🎯 WEEKLY CHALLENGES</div>
        </div>
        <div onclick="document.getElementById('chalPanel').remove()"
          style="width:36px;height:36px;border-radius:50%;border:1px solid rgba(0,229,255,0.25);
            display:flex;align-items:center;justify-content:center;color:#00e5ff;font-size:14px;cursor:pointer;
            background:rgba(0,20,50,0.6);">✕</div>
      </div>

      <div style="padding:12px 16px 10px;flex-shrink:0;background:rgba(0,5,18,0.5);">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span style="font-size:8px;letter-spacing:3px;color:rgba(0,229,255,0.5);">COMPLETION</span>
          <span style="font-size:9px;font-weight:900;letter-spacing:2px;color:#00e5ff;">${doneCount} / ${picks.length} &nbsp;(${pct}%)</span>
        </div>
        <div style="height:5px;background:rgba(0,229,255,0.08);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#00e5ff,#0077ff);border-radius:3px;box-shadow:0 0 10px #00e5ff88;transition:width 0.8s ease;"></div>
        </div>
      </div>

      <div style="flex:1;overflow-y:auto;padding:14px 14px 30px;-webkit-overflow-scrolling:touch;">
        <div style="display:flex;flex-direction:column;gap:8px;">${cards}</div>
      </div>
    `;

    document.body.appendChild(panel);
    panel.addEventListener('click', e => {
      if (e.target === panel) panel.remove();
      const btn = e.target.closest('.chal-claim-btn');
      if (btn) claim(btn.dataset.id);
    });
  }

  /* ══ Inject lobby button (next to Achievements button) ══ */
  function injectLobbyBtn() {
    const tryInject = () => {
      const btnRow = document.getElementById('lbyBtnRow');
      if (!btnRow) { setTimeout(tryInject, 400); return; }
      if (document.getElementById('lbyChalBtn')) return;

      const btn = document.createElement('div');
      btn.id = 'lbyChalBtn';
      btn.className = 'lby-action-btn';
      btn.style.cssText = `
        flex:none;width:52px;padding:10px 0;border-radius:7px;
        font-size:20px;cursor:pointer;position:relative;
        border:1px solid rgba(0,255,140,0.35);
        background:linear-gradient(145deg,rgba(0,255,140,0.07),rgba(0,255,140,0.02));
        display:flex;align-items:center;justify-content:center;
        touch-action:manipulation;
      `;
      btn.innerHTML = '🎯';
      btn.title = 'Weekly Challenges';
      btn.onclick = () => openPanel();

      const achBtn = document.getElementById('lbyAchBtn');
      if (achBtn && achBtn.nextSibling) btnRow.insertBefore(btn, achBtn.nextSibling);
      else if (achBtn) btnRow.appendChild(btn);
      else btnRow.appendChild(btn);

      updateChalBadge();
    };
    tryInject();
  }

  /* ══ Hook into game events ══ */
  function hookGameEvents() {
    const _origSave = window._saveRunStats;
    if (typeof _origSave === 'function') {
      window._saveRunStats = function () {
        _origSave();
        try {
          recordRun({ score: (window.G&&G.score)||0, maxCombo: (window.G&&G.maxCombo)||0, wave: (window.G&&G.wave)||0 });
        } catch {}
        setTimeout(updateChalBadge, 250);
      };
    }
    setTimeout(updateChalBadge, 1500);
    const _origRefresh = window.refreshLobbyStats;
    if (typeof _origRefresh === 'function') {
      window.refreshLobbyStats = function () {
        _origRefresh();
        setTimeout(updateChalBadge, 300);
      };
    }
  }

  function init() {
    ensureWeek();
    injectLobbyBtn();
    hookGameEvents();
    setTimeout(updateChalBadge, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    window.addEventListener('load', () => setTimeout(init, 150));
  }

  return { openPanel, updateChalBadge, claim, POOL };

})();
