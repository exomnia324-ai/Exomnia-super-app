'use strict';
/* ═══════════════════════════════════════════════════════════════
   DEEP SPACE COMBAT — PRESTIGE / REBIRTH SYSTEM
   Prestige.js  |  Standalone module, loaded after game.js
   Commander Level is a persistent meta-progression track (separate
   from the in-run pilot level). Reaching LEVEL_CAP unlocks Prestige:
   resets the Commander Level back to 1 but grants a permanent
   title/badge. Coins, ships, and weapons are NEVER touched.
   ═══════════════════════════════════════════════════════════════ */

const PRESTIGE = (function () {

  const KEY_XP        = 'exomniaLifetimeXP';
  const KEY_PRESTIGE   = 'exomniaPrestigeCount';
  const LEVEL_CAP      = 30;

  function needForLevel(L){ return 150*L; }
  function xpToReachCap(){
    let sum=0; for(let L=1;L<LEVEL_CAP;L++) sum+=needForLevel(L);
    return sum;
  }
  const XP_TO_CAP = xpToReachCap();

  function getXP(){ return parseInt(localStorage.getItem(KEY_XP)||'0'); }
  function setXP(v){ try{localStorage.setItem(KEY_XP,String(Math.max(0,v)));}catch(e){} }
  function getPrestigeCount(){ return parseInt(localStorage.getItem(KEY_PRESTIGE)||'0'); }
  function setPrestigeCount(v){ try{localStorage.setItem(KEY_PRESTIGE,String(v));}catch(e){} }

  // Returns {level, into, need, capped}
  function levelInfo(){
    let xp=getXP(), level=1;
    while(level<LEVEL_CAP && xp>=needForLevel(level)){ xp-=needForLevel(level); level++; }
    const capped = level>=LEVEL_CAP;
    return { level, into: capped?XP_TO_CAP:xp, need: capped?XP_TO_CAP:needForLevel(level), capped, totalXP:getXP() };
  }

  function isEligible(){ return getXP()>=XP_TO_CAP; }

  function prestigeTitle(count){
    if(count<=0) return '';
    const stars='⭐'.repeat(Math.min(count,5));
    return stars+' PRESTIGE '+count;
  }

  /* ── Called after every run to add lifetime XP ── */
  function recordRun(runStats){
    const gain=Math.round((runStats.score||0)/8 + (runStats.kills||0)*4);
    if(gain>0) setXP(getXP()+gain);
    updateLevelBadge();
  }

  function doPrestige(){
    if(!isEligible()){ if(window.showToast) showToast('REACH COMMANDER LEVEL '+LEVEL_CAP+' FIRST'); return; }
    setXP(0);
    const count=getPrestigeCount()+1;
    setPrestigeCount(count);
    try{ localStorage.setItem('exomniaTitle', prestigeTitle(count)); }catch(e){}
    if(window.showToast) showToast('★ PRESTIGE '+count+' ACHIEVED! ★');
    updateLevelBadge();
    applyRankOverride();
    closeModal();
  }

  function closeModal(){
    const m=document.getElementById('prestigeModal');
    if(m) m.remove();
  }

  function openModal(){
    closeModal();
    const info=levelInfo();
    const eligible=isEligible();
    const count=getPrestigeCount();
    const pct=Math.round(info.into/info.need*100);

    const modal=document.createElement('div');
    modal.id='prestigeModal';
    modal.style.cssText=`
      position:fixed;inset:0;z-index:500;background:rgba(0,2,14,0.92);
      display:flex;align-items:center;justify-content:center;padding:20px;
      font-family:'Courier New',monospace;animation:prestFadeIn .25s ease;
    `;
    modal.innerHTML=`
      <style>@keyframes prestFadeIn{from{opacity:0}to{opacity:1}}</style>
      <div style="width:min(340px,100%);background:rgba(0,10,28,0.98);border:1px solid rgba(255,215,0,0.35);
        border-radius:12px;padding:22px;box-shadow:0 0 40px rgba(255,215,0,0.15);">
        <div style="text-align:center;margin-bottom:14px;">
          <div style="font-size:9px;letter-spacing:5px;color:rgba(255,215,0,0.6);margin-bottom:4px;">META PROGRESSION</div>
          <div style="font-size:20px;font-weight:900;letter-spacing:3px;color:#ffd700;text-shadow:0 0 20px #ffd700;">⭐ PRESTIGE</div>
        </div>
        <div style="text-align:center;margin-bottom:16px;">
          <div style="font-size:11px;letter-spacing:2px;color:#fff;margin-bottom:6px;">COMMANDER LEVEL ${info.level}${info.capped?' (MAX)':''}</div>
          <div style="height:7px;background:rgba(255,215,0,0.1);border-radius:4px;overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#ffd700,#ff9900);border-radius:4px;box-shadow:0 0 10px #ffd70088;"></div>
          </div>
          <div style="font-size:8px;letter-spacing:1px;color:rgba(255,255,255,0.5);margin-top:5px;">${info.into} / ${info.need} XP</div>
        </div>
        ${count>0?`<div style="text-align:center;font-size:10px;letter-spacing:1px;color:#ffd700;margin-bottom:14px;">Current title: ${prestigeTitle(count)}</div>`:''}
        <div style="font-size:9px;letter-spacing:1px;color:rgba(255,255,255,0.6);line-height:1.6;margin-bottom:16px;">
          ${eligible
            ? 'You are ready to Prestige! This resets your Commander Level back to 1 and grants a permanent title. <span style="color:#00ff8c;">Coins, ships and weapons are NOT affected.</span>'
            : 'Reach Commander Level '+LEVEL_CAP+' by playing missions to unlock Prestige. Every kill and point of score earns Commander XP.'}
        </div>
        <div style="display:flex;gap:10px;">
          <div onclick="document.getElementById('prestigeModal').remove()" style="flex:1;text-align:center;padding:10px;border-radius:7px;
            border:1px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.6);font-size:10px;letter-spacing:1px;cursor:pointer;">CLOSE</div>
          ${eligible?`<div id="prestigeConfirmBtn" style="flex:1;text-align:center;padding:10px;border-radius:7px;
            border:1px solid rgba(255,215,0,0.5);background:linear-gradient(145deg,rgba(255,215,0,0.18),rgba(255,215,0,0.05));
            color:#ffd700;font-size:10px;font-weight:900;letter-spacing:1px;cursor:pointer;">PRESTIGE NOW</div>`:''}
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e=>{ if(e.target===modal) modal.remove(); });
    const confirmBtn=document.getElementById('prestigeConfirmBtn');
    if(confirmBtn){
      confirmBtn.onclick=()=>{
        confirmBtn.textContent='TAP AGAIN TO CONFIRM';
        confirmBtn.onclick=()=>doPrestige();
      };
    }
  }

  /* ── Small level badge injected under the pilot rank ── */
  function updateLevelBadge(){
    const card=document.getElementById('lbyPilotCard');
    if(!card) return;
    let el=document.getElementById('prestigeLevelBadge');
    if(!el){
      el=document.createElement('div');
      el.id='prestigeLevelBadge';
      el.style.cssText=`
        margin-top:4px;font-size:8px;letter-spacing:1px;color:#ffd700;
        display:flex;align-items:center;gap:5px;cursor:pointer;
      `;
      el.onclick=()=>openModal();
      const rankEl=document.getElementById('pilotRank');
      if(rankEl && rankEl.parentNode) rankEl.parentNode.insertBefore(el, rankEl.nextSibling);
      else card.appendChild(el);
    }
    const info=levelInfo();
    const count=getPrestigeCount();
    const pct=Math.round(info.into/info.need*100);
    el.innerHTML=`
      <span>${count>0?'⭐×'+count+' ':''}CMDR LV.${info.level}</span>
      <span style="flex:1;height:3px;background:rgba(255,215,0,0.12);border-radius:2px;overflow:hidden;min-width:30px;">
        <span style="display:block;height:100%;width:${pct}%;background:#ffd700;"></span>
      </span>
    `;
  }

  /* ── Override the rank badge text with prestige title when applicable ── */
  function applyRankOverride(){
    const count=getPrestigeCount();
    if(count<=0) return;
    const rankEl=document.getElementById('pilotRank');
    if(rankEl) rankEl.textContent=prestigeTitle(count);
  }

  /* ══ Hook into game events ══ */
  function hookGameEvents(){
    const _origSave=window._saveRunStats;
    if(typeof _origSave==='function'){
      window._saveRunStats=function(){
        _origSave();
        try{ recordRun({ score:(window.G&&G.score)||0, kills:(window.G&&G.kills)||0 }); }catch(e){}
      };
    }
    const _origRefresh=window.refreshLobbyStats;
    if(typeof _origRefresh==='function'){
      window.refreshLobbyStats=function(){
        _origRefresh();
        setTimeout(()=>{ updateLevelBadge(); applyRankOverride(); }, 200);
      };
    }
  }

  function injectLobbyBtn(){
    const tryInject=()=>{
      const btnRow=document.getElementById('lbyBtnRow');
      if(!btnRow){ setTimeout(tryInject,400); return; }
      if(document.getElementById('lbyPrestigeBtn')) return;
      const btn=document.createElement('div');
      btn.id='lbyPrestigeBtn';
      btn.className='lby-action-btn';
      btn.style.cssText=`
        flex:none;width:52px;padding:10px 0;border-radius:7px;
        font-size:20px;cursor:pointer;position:relative;
        border:1px solid rgba(255,215,0,0.35);
        background:linear-gradient(145deg,rgba(255,215,0,0.07),rgba(255,215,0,0.02));
        display:flex;align-items:center;justify-content:center;
        touch-action:manipulation;
      `;
      btn.innerHTML='⭐';
      btn.title='Prestige';
      btn.onclick=()=>openModal();
      const chalBtn=document.getElementById('lbyChalBtn');
      if(chalBtn && chalBtn.nextSibling) btnRow.insertBefore(btn, chalBtn.nextSibling);
      else btnRow.appendChild(btn);
    };
    tryInject();
  }

  function init(){
    hookGameEvents();
    injectLobbyBtn();
    setTimeout(()=>{ updateLevelBadge(); applyRankOverride(); }, 1800);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    window.addEventListener('load', ()=>setTimeout(init,200));
  }

  return { openModal, doPrestige, levelInfo, isEligible, getPrestigeCount };

})();
