'use strict';
/* ═══════════════════════════════════════════════════════════════
   DEEP SPACE COMBAT — ACHIEVEMENT SYSTEM
   achievements.js  |  Standalone module, loaded after game.js
   ═══════════════════════════════════════════════════════════════ */

const ACH = (function () {

  /* ── Storage keys ── */
  const KEY_UNLOCKED = 'exomniaAchievements';
  const KEY_PROGRESS = 'exomniaAchProgress';
  const KEY_NEW_FLAG  = 'exomniaAchNew';       // comma-separated ids of unseen unlocks

  /* ══════════════════════════════════════
     ACHIEVEMENT DEFINITIONS
     Each entry:
       id       – unique string key
       icon     – emoji shown in UI
       name     – short title
       desc     – how to unlock
       hint     – shown while locked
       tier     – 'bronze'|'silver'|'gold'|'legendary'
       reward   – { coins, weaponName, title }   (all optional)
       check    – function(stats) → true if unlocked
     ══════════════════════════════════════ */
  const ACHIEVEMENTS = [

    /* ── FIRST STEPS ── */
    {
      id:'first_blood', icon:'🩸', tier:'bronze',
      name:'FIRST BLOOD',
      desc:'Complete your first mission',
      hint:'Play 1 game',
      reward:{ coins:30 },
      check: s => s.games >= 1,
    },
    {
      id:'kill10', icon:'💀', tier:'bronze',
      name:'BODY COUNT',
      desc:'Destroy 10 enemies',
      hint:'Kill 10 enemies total',
      reward:{ coins:40 },
      check: s => s.totalKills >= 10,
    },
    {
      id:'score1k', icon:'⭐', tier:'bronze',
      name:'RISING STAR',
      desc:'Score 1,000 points in a single run',
      hint:'Reach 1,000 score',
      reward:{ coins:50 },
      check: s => s.bestScore >= 1000,
    },
    {
      id:'wave3', icon:'🌊', tier:'bronze',
      name:'WAVE BREAKER',
      desc:'Reach Wave 3',
      hint:'Survive until Wave 3',
      reward:{ coins:40 },
      check: s => s.bestWave >= 3,
    },

    /* ── COMBAT ── */
    {
      id:'kill100', icon:'⚔️', tier:'silver',
      name:'WARMONGER',
      desc:'Destroy 100 enemies',
      hint:'Kill 100 enemies total',
      reward:{ coins:80 },
      check: s => s.totalKills >= 100,
    },
    {
      id:'kill500', icon:'☠️', tier:'gold',
      name:'GRIM REAPER',
      desc:'Destroy 500 enemies',
      hint:'Kill 500 enemies total',
      reward:{ coins:200, title:'☠️ REAPER' },
      check: s => s.totalKills >= 500,
    },
    {
      id:'kill1000', icon:'💣', tier:'legendary',
      name:'ANNIHILATOR',
      desc:'Destroy 1,000 enemies',
      hint:'Kill 1,000 enemies in total',
      reward:{ coins:400, title:'💣 ANNIHILATOR' },
      check: s => s.totalKills >= 1000,
    },
    {
      id:'combo10', icon:'🔥', tier:'silver',
      name:'ON FIRE',
      desc:'Achieve a 10× combo',
      hint:'Build a 10-kill combo streak',
      reward:{ coins:60 },
      check: s => s.bestCombo >= 10,
    },
    {
      id:'combo25', icon:'🌋', tier:'gold',
      name:'UNSTOPPABLE',
      desc:'Achieve a 25× combo',
      hint:'Build a 25-kill combo streak',
      reward:{ coins:150, title:'🌋 UNSTOPPABLE' },
      check: s => s.bestCombo >= 25,
    },

    /* ── SURVIVAL ── */
    {
      id:'wave5', icon:'🛡', tier:'silver',
      name:'FRONTLINE',
      desc:'Reach Wave 5',
      hint:'Survive until Wave 5',
      reward:{ coins:75 },
      check: s => s.bestWave >= 5,
    },
    {
      id:'wave10', icon:'🏆', tier:'gold',
      name:'SECTOR CLEARED',
      desc:'Reach Wave 10',
      hint:'Survive until Wave 10',
      reward:{ coins:200, weaponName:'RAILGUN', title:'🏆 COMMANDER' },
      check: s => s.bestWave >= 10,
    },
    {
      id:'wave15', icon:'🌌', tier:'legendary',
      name:'BEYOND THE VEIL',
      desc:'Reach Wave 15',
      hint:'Survive until Wave 15',
      reward:{ coins:500, title:'🌌 ADMIRAL' },
      check: s => s.bestWave >= 15,
    },

    /* ── SCORE ── */
    {
      id:'score10k', icon:'💫', tier:'silver',
      name:'ACE PILOT',
      desc:'Score 10,000 points in a single run',
      hint:'Reach 10,000 score',
      reward:{ coins:100 },
      check: s => s.bestScore >= 10000,
    },
    {
      id:'score50k', icon:'🌠', tier:'gold',
      name:'LEGEND CLASS',
      desc:'Score 50,000 points in a single run',
      hint:'Reach 50,000 score',
      reward:{ coins:300, title:'🌠 LEGEND CLASS' },
      check: s => s.bestScore >= 50000,
    },
    {
      id:'score100k', icon:'👑', tier:'legendary',
      name:'DEEP SPACE GOD',
      desc:'Score 100,000 points in a single run',
      hint:'Reach 100,000 score',
      reward:{ coins:1000, title:'👑 DEEP SPACE GOD' },
      check: s => s.bestScore >= 100000,
    },

    /* ── DEDICATION ── */
    {
      id:'games5', icon:'🎮', tier:'bronze',
      name:'CADET',
      desc:'Play 5 missions',
      hint:'Play 5 games',
      reward:{ coins:50 },
      check: s => s.games >= 5,
    },
    {
      id:'games20', icon:'🚀', tier:'silver',
      name:'VETERAN',
      desc:'Play 20 missions',
      hint:'Play 20 games',
      reward:{ coins:120 },
      check: s => s.games >= 20,
    },
    {
      id:'games50', icon:'🛸', tier:'gold',
      name:'DEEP SPACE PILOT',
      desc:'Play 50 missions',
      hint:'Play 50 games',
      reward:{ coins:250, title:'🛸 DEEP SPACE PILOT' },
      check: s => s.games >= 50,
    },

    /* ── ECONOMY ── */
    {
      id:'coins100', icon:'◈', tier:'bronze',
      name:'COIN COLLECTOR',
      desc:'Accumulate 100 coins',
      hint:'Earn 100 coins total',
      reward:{ coins:20 },
      check: s => s.totalCoins >= 100,
    },
    {
      id:'coins500', icon:'💰', tier:'silver',
      name:'SPACE MERCHANT',
      desc:'Accumulate 500 coins',
      hint:'Earn 500 coins total',
      reward:{ coins:60 },
      check: s => s.totalCoins >= 500,
    },
    {
      id:'coins2000', icon:'🏦', tier:'gold',
      name:'GALACTIC BANKER',
      desc:'Accumulate 2,000 coins',
      hint:'Earn 2,000 coins total',
      reward:{ coins:200, title:'🏦 BANKER' },
      check: s => s.totalCoins >= 2000,
    },

    /* ── DAILY STREAK ── */
    {
      id:'streak3', icon:'🗓', tier:'bronze',
      name:'REGULAR',
      desc:'Claim daily reward 3 days in a row',
      hint:'3-day login streak',
      reward:{ coins:60 },
      check: s => s.dailyStreak >= 3,
    },
    {
      id:'streak7', icon:'🔥', tier:'silver',
      name:'DEDICATED',
      desc:'Claim daily reward 7 days in a row',
      hint:'7-day login streak',
      reward:{ coins:150, weaponName:'EMP' },
      check: s => s.dailyStreak >= 7,
    },
    {
      id:'streak30', icon:'⚡', tier:'legendary',
      name:'IMMORTAL',
      desc:'Claim daily reward 30 days in a row',
      hint:'30-day login streak',
      reward:{ coins:1000, title:'⚡ IMMORTAL' },
      check: s => s.dailyStreak >= 30,
    },

    /* ── BOSS ── */
    {
      id:'boss1', icon:'👾', tier:'silver',
      name:'BOSS SLAYER',
      desc:'Defeat your first boss',
      hint:'Kill a boss enemy',
      reward:{ coins:100 },
      check: s => s.bossKills >= 1,
    },
    {
      id:'boss5', icon:'🤖', tier:'gold',
      name:'DESTROYER',
      desc:'Defeat 5 bosses',
      hint:'Kill 5 boss enemies',
      reward:{ coins:250, title:'🤖 DESTROYER' },
      check: s => s.bossKills >= 5,
    },

    /* ── SECRET ── */
    {
      id:'no_damage_wave', icon:'👻', tier:'gold',
      name:'GHOST PROTOCOL',
      desc:'Complete a wave without taking any damage',
      hint:'???',
      reward:{ coins:200, title:'👻 GHOST' },
      check: s => s.perfectWaves >= 1,
    },
    {
      id:'arsenal', icon:'🔫', tier:'silver',
      name:'ARMS DEALER',
      desc:'Own 5 different weapons',
      hint:'Buy weapons from the shop',
      reward:{ coins:100 },
      check: s => s.ownedWeapons >= 5,
    },
    {
      id:'fleet', icon:'🚢', tier:'gold',
      name:'FLEET ADMIRAL',
      desc:'Own all ships',
      hint:'Unlock every spacecraft',
      reward:{ coins:400, title:'🚢 FLEET ADMIRAL' },
      check: s => s.ownedShips >= 5,
    },
  ];

  /* ── Tier config ── */
  const TIER = {
    bronze:    { color:'#cd7f32', glow:'rgba(205,127,50,',  label:'BRONZE'    },
    silver:    { color:'#c0c0c0', glow:'rgba(192,192,192,', label:'SILVER'    },
    gold:      { color:'#ffd700', glow:'rgba(255,215,0,',   label:'GOLD'      },
    legendary: { color:'#cc44ff', glow:'rgba(204,68,255,',  label:'LEGENDARY' },
  };

  /* ══ Storage helpers ══ */
  function getUnlocked() {
    try { return JSON.parse(localStorage.getItem(KEY_UNLOCKED) || '[]'); } catch { return []; }
  }
  function saveUnlocked(arr) {
    try { localStorage.setItem(KEY_UNLOCKED, JSON.stringify(arr)); } catch {}
  }
  function getProgress() {
    try { return JSON.parse(localStorage.getItem(KEY_PROGRESS) || '{}'); } catch { return {}; }
  }
  function saveProgress(obj) {
    try { localStorage.setItem(KEY_PROGRESS, JSON.stringify(obj)); } catch {}
  }
  function getNewFlags() {
    try { return (localStorage.getItem(KEY_NEW_FLAG) || '').split(',').filter(Boolean); } catch { return []; }
  }
  function addNewFlag(id) {
    const flags = getNewFlags();
    if (!flags.includes(id)) flags.push(id);
    try { localStorage.setItem(KEY_NEW_FLAG, flags.join(',')); } catch {}
  }
  function clearNewFlag(id) {
    const flags = getNewFlags().filter(f => f !== id);
    try { localStorage.setItem(KEY_NEW_FLAG, flags.join(',')); } catch {}
  }

  /* ══ Build current stats snapshot ══ */
  function buildStats() {
    return {
      games:       parseInt(localStorage.getItem('exomniaGames') || '0'),
      bestScore:   parseInt(localStorage.getItem('exomniaBestScore') || '0'),
      bestWave:    parseInt(localStorage.getItem('exomniaBestWave') || '0'),
      totalKills:  parseInt(localStorage.getItem('exomniaTotalKills') || '0'),
      totalCoins:  parseInt(localStorage.getItem('exomniaTotalCoins') || '0'),
      bestCombo:   parseInt(localStorage.getItem('exomniaBestCombo') || '0'),
      bossKills:   parseInt(localStorage.getItem('exomniaBossKills') || '0'),
      perfectWaves:parseInt(localStorage.getItem('exomniaPerfectWaves') || '0'),
      dailyStreak: parseInt(localStorage.getItem('exomniaDailyStreak') || '0'),
      ownedWeapons:(()=>{ try{const w=JSON.parse(localStorage.getItem('exomniaOwnedWeapons')||'[]');return w.length;}catch{return 2;} })(),
      ownedShips:  (()=>{ try{const s=JSON.parse(localStorage.getItem('exomniaOwnedShips')||'[0]');return s.length;}catch(e){return 1;} })(),
    };
  }

  /* ══ Apply reward ══ */
  function applyReward(ach) {
    const r = ach.reward || {};
    if (r.coins) {
      const cur = parseInt(localStorage.getItem('exomniaTotalCoins') || '0');
      localStorage.setItem('exomniaTotalCoins', cur + r.coins);
      const el = document.getElementById('lbyCoinDisplay');
      if (el) el.textContent = cur + r.coins;
    }
    if (r.weaponName && typeof WEAPONS !== 'undefined') {
      const w = WEAPONS.find(x => x.name === r.weaponName);
      if (w && !w.owned) {
        w.owned = true;
        if (typeof saveOwnedWeapons === 'function') saveOwnedWeapons();
      }
    }
    if (r.title) {
      try { localStorage.setItem('exomniaTitle', r.title); } catch {}
      const rankEl = document.getElementById('pilotRank');
      if (rankEl) rankEl.textContent = r.title;
    }
  }

  /* ══ Check & unlock ══ */
  function checkAll() {
    const stats    = buildStats();
    const unlocked = getUnlocked();
    const newly    = [];

    ACHIEVEMENTS.forEach(ach => {
      if (unlocked.includes(ach.id)) return;
      if (ach.check(stats)) {
        unlocked.push(ach.id);
        newly.push(ach);
        addNewFlag(ach.id);
        applyReward(ach);
      }
    });

    if (newly.length) {
      saveUnlocked(unlocked);
      // Show notifications sequentially
      newly.forEach((a, i) => setTimeout(() => showUnlockToast(a), i * 3400));
      // Update badge on lobby button
      updateAchBadge();
    }

    return newly;
  }

  /* ══ Unlock toast notification ══ */
  function showUnlockToast(ach) {
    const t = TIER[ach.tier];
    const existing = document.getElementById('achToast');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.id = 'achToast';
    el.style.cssText = `
      position:fixed;
      top:18px; left:50%; transform:translateX(-50%) translateY(-80px);
      z-index:9999;
      background:linear-gradient(135deg,rgba(0,5,18,0.97),rgba(0,10,28,0.97));
      border:1px solid ${t.color}88;
      border-radius:10px;
      padding:12px 18px;
      display:flex; align-items:center; gap:12px;
      min-width:260px; max-width:92vw;
      box-shadow:0 0 30px ${t.glow}0.3), 0 4px 20px rgba(0,0,0,0.6);
      font-family:'Courier New',monospace;
      transition:transform 0.45s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s;
      pointer-events:none;
    `;
    el.innerHTML = `
      <div style="font-size:28px;line-height:1;filter:drop-shadow(0 0 8px ${t.color});">${ach.icon}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:8px;letter-spacing:4px;color:${t.color};margin-bottom:2px;font-weight:900;">
          🏅 ACHIEVEMENT UNLOCKED · ${t.label}
        </div>
        <div style="font-size:13px;font-weight:900;letter-spacing:3px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${ach.name}
        </div>
        <div style="font-size:9px;letter-spacing:1.5px;color:rgba(255,255,255,0.45);margin-top:2px;">
          ${ach.desc}
        </div>
      </div>
      ${ach.reward?.coins ? `<div style="font-size:10px;font-weight:900;letter-spacing:1px;color:#ffd700;white-space:nowrap;">+◈${ach.reward.coins}</div>` : ''}
    `;
    document.body.appendChild(el);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transform = 'translateX(-50%) translateY(0)';
      });
    });

    // Animate out
    setTimeout(() => {
      el.style.transform = 'translateX(-50%) translateY(-80px)';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 400);
    }, 3000);
  }

  /* ══ Badge on lobby button ══ */
  function updateAchBadge() {
    const btn = document.getElementById('lbyAchBtn');
    if (!btn) return;
    const newCount = getNewFlags().length;
    let badge = btn.querySelector('.ach-badge');
    if (newCount > 0) {
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'ach-badge';
        badge.style.cssText = `
          position:absolute;top:-5px;right:-5px;
          background:#ff3366;color:#fff;
          border-radius:50%;width:17px;height:17px;
          font-size:9px;font-weight:900;font-family:'Courier New',monospace;
          display:flex;align-items:center;justify-content:center;
          border:1px solid rgba(255,255,255,0.3);
          box-shadow:0 0 8px #ff336688;
          pointer-events:none;
          z-index:2;
        `;
        btn.style.position = 'relative';
        btn.appendChild(badge);
      }
      badge.textContent = newCount > 9 ? '9+' : newCount;
    } else {
      if (badge) badge.remove();
    }
  }

  /* ══ ACHIEVEMENTS PANEL (full-screen overlay) ══ */
  function openPanel() {
    const old = document.getElementById('achPanel');
    if (old) { old.remove(); return; }

    // Mark all as seen
    getNewFlags().forEach(id => clearNewFlag(id));
    updateAchBadge();

    const unlocked = getUnlocked();
    const stats    = buildStats();

    const panel = document.createElement('div');
    panel.id = 'achPanel';
    panel.style.cssText = `
      position:fixed;inset:0;z-index:400;
      background:rgba(0,2,14,0.97);
      display:flex;flex-direction:column;
      font-family:'Courier New',monospace;
      animation:achPanelIn 0.3s cubic-bezier(0.34,1.2,0.64,1);
      overflow:hidden;
    `;

    const doneCount = unlocked.length;
    const totalCount = ACHIEVEMENTS.length;
    const pct = Math.round(doneCount / totalCount * 100);

    // Build tier groups
    const tiers = ['legendary','gold','silver','bronze'];
    const tierSections = tiers.map(tier => {
      const list = ACHIEVEMENTS.filter(a => a.tier === tier);
      const t = TIER[tier];
      const cards = list.map(ach => {
        const done = unlocked.includes(ach.id);
        const isNew = getNewFlags().includes(ach.id);
        const r = ach.reward || {};
        const rewardTags = [
          r.coins   ? `◈${r.coins}` : '',
          r.weaponName ? `🔫 ${r.weaponName}` : '',
          r.title   ? `🏅` : '',
        ].filter(Boolean).join('  ');

        return `
          <div style="
            background:${done ? 'rgba(0,10,28,0.9)' : 'rgba(0,5,15,0.7)'};
            border:1px solid ${done ? t.color+'66' : 'rgba(255,255,255,0.07)'};
            border-radius:8px;padding:12px;
            display:flex;align-items:center;gap:12px;
            opacity:${done ? '1' : '0.55'};
            position:relative;overflow:hidden;
            box-shadow:${done ? '0 0 14px '+t.glow+'0.12)' : 'none'};
            transition:.2s;
          ">
            ${done && isNew ? `<div style="position:absolute;top:6px;right:8px;font-size:7px;letter-spacing:2px;color:#ff3366;font-weight:900;">NEW</div>` : ''}
            <div style="
              font-size:26px;line-height:1;
              filter:${done ? 'drop-shadow(0 0 8px '+t.color+')' : 'grayscale(1) brightness(0.4)'};
              flex-shrink:0;
            ">${ach.icon}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-size:11px;font-weight:900;letter-spacing:2px;
                color:${done ? '#fff' : 'rgba(255,255,255,0.4)'};
                margin-bottom:2px;">${ach.name}</div>
              <div style="font-size:8px;letter-spacing:1px;
                color:${done ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.22)'};
                line-height:1.4;">${done ? ach.desc : ach.hint}</div>
              ${rewardTags && done ? `<div style="margin-top:4px;font-size:8px;letter-spacing:1px;color:${t.color};opacity:0.8;">${rewardTags}</div>` : ''}
            </div>
            <div style="
              width:22px;height:22px;border-radius:50%;flex-shrink:0;
              border:1.5px solid ${done ? t.color : 'rgba(255,255,255,0.12)'};
              background:${done ? t.color+'22' : 'transparent'};
              display:flex;align-items:center;justify-content:center;
            ">
              ${done ? `<svg width="11" height="11" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke="${t.color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="filter:drop-shadow(0 0 3px ${t.color})"/></svg>` : ''}
            </div>
          </div>
        `;
      }).join('');

      const doneInTier = list.filter(a => unlocked.includes(a.id)).length;
      return `
        <div style="margin-bottom:20px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
            <div style="height:1px;flex:1;background:${t.color}33;"></div>
            <div style="font-size:8px;letter-spacing:4px;color:${t.color};font-weight:900;">${t.label} &nbsp;${doneInTier}/${list.length}</div>
            <div style="height:1px;flex:1;background:${t.color}33;"></div>
          </div>
          <div style="display:flex;flex-direction:column;gap:8px;">${cards}</div>
        </div>
      `;
    }).join('');

    panel.innerHTML = `
      <style>
        @keyframes achPanelIn { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
      </style>
      <!-- HEADER -->
      <div style="
        padding:16px 16px 12px;
        border-bottom:1px solid rgba(0,229,255,0.12);
        display:flex;align-items:center;gap:12px;
        background:linear-gradient(180deg,rgba(0,10,28,0.98),transparent);
        flex-shrink:0;
      ">
        <div style="flex:1;">
          <div style="font-size:8px;letter-spacing:5px;color:rgba(0,229,255,0.5);margin-bottom:2px;">MISSION RECORD</div>
          <div style="font-size:clamp(15px,5vw,22px);font-weight:900;letter-spacing:5px;color:#00e5ff;
            text-shadow:0 0 20px #00e5ff;">🏅 ACHIEVEMENTS</div>
        </div>
        <div onclick="document.getElementById('achPanel').remove()"
          style="width:36px;height:36px;border-radius:50%;
            border:1px solid rgba(0,229,255,0.25);
            display:flex;align-items:center;justify-content:center;
            color:#00e5ff;font-size:14px;cursor:pointer;
            background:rgba(0,20,50,0.6);">✕</div>
      </div>

      <!-- PROGRESS BAR -->
      <div style="padding:12px 16px 10px;flex-shrink:0;background:rgba(0,5,18,0.5);">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span style="font-size:8px;letter-spacing:3px;color:rgba(0,229,255,0.5);">COMPLETION</span>
          <span style="font-size:9px;font-weight:900;letter-spacing:2px;color:#00e5ff;">${doneCount} / ${totalCount} &nbsp;(${pct}%)</span>
        </div>
        <div style="height:5px;background:rgba(0,229,255,0.08);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#00e5ff,#0077ff);
            border-radius:3px;box-shadow:0 0 10px #00e5ff88;transition:width 0.8s ease;"></div>
        </div>
        <!-- Tier dots -->
        <div style="display:flex;gap:6px;margin-top:10px;">
          ${tiers.map(tier=>{
            const t=TIER[tier];
            const list=ACHIEVEMENTS.filter(a=>a.tier===tier);
            const done=list.filter(a=>unlocked.includes(a.id)).length;
            return `<div style="flex:1;text-align:center;">
              <div style="font-size:7px;letter-spacing:1px;color:${t.color};font-weight:900;">${t.label}</div>
              <div style="font-size:9px;color:${t.color};">${done}/${list.length}</div>
            </div>`;
          }).join('')}
        </div>
      </div>

      <!-- LIST -->
      <div style="flex:1;overflow-y:auto;padding:14px 14px 30px;-webkit-overflow-scrolling:touch;">
        ${tierSections}
      </div>
    `;

    document.body.appendChild(panel);
    panel.addEventListener('click', e => { if (e.target === panel) panel.remove(); });
  }

  /* ══ Inject lobby button ══ */
  function injectLobbyBtn() {
    const tryInject = () => {
      const btnRow = document.getElementById('lbyBtnRow');
      if (!btnRow) { setTimeout(tryInject, 400); return; }
      if (document.getElementById('lbyAchBtn')) return;

      const btn = document.createElement('div');
      btn.id = 'lbyAchBtn';
      btn.className = 'lby-action-btn';
      btn.style.cssText = `
        flex:none;width:52px;padding:10px 0;border-radius:7px;
        font-size:20px;cursor:pointer;position:relative;
        border:1px solid rgba(255,215,0,0.35);
        background:linear-gradient(145deg,rgba(255,215,0,0.07),rgba(255,215,0,0.02));
        display:flex;align-items:center;justify-content:center;
        touch-action:manipulation;
      `;
      btn.innerHTML = '🏅';
      btn.title = 'Achievements';
      btn.onclick = () => openPanel();

      // Insert after daily btn or append
      const dailyBtn = document.getElementById('lbyDailyBtn');
      if (dailyBtn && dailyBtn.nextSibling) btnRow.insertBefore(btn, dailyBtn.nextSibling);
      else btnRow.appendChild(btn);

      updateAchBadge();
    };
    tryInject();
  }

  /* ══ Hook into game events ══ */
  function hookGameEvents() {
    // Poll after game over — patch _saveRunStats if available
    const _origSave = window._saveRunStats;
    if (typeof _origSave === 'function') {
      window._saveRunStats = function () {
        _origSave();
        // small delay so localStorage is written first
        setTimeout(checkAll, 200);
      };
    }

    // Also check on page load (for achievements earned offline / via daily)
    setTimeout(checkAll, 1500);

    // Re-check whenever lobby is refreshed
    const _origRefresh = window.refreshLobbyStats;
    if (typeof _origRefresh === 'function') {
      window.refreshLobbyStats = function () {
        _origRefresh();
        setTimeout(checkAll, 300);
      };
    }
  }

  /* ══ INIT ══ */
  function init() {
    injectLobbyBtn();
    hookGameEvents();
    // Initial check (catches anything earned before this session)
    setTimeout(checkAll, 2000);
  }

  // Boot after DOM + game.js are ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // game.js sets up stuff on 'load' — wait a tick after that
    window.addEventListener('load', () => setTimeout(init, 100));
  }

  // Public
  return { checkAll, openPanel, updateAchBadge, ACHIEVEMENTS };

})();
