'use strict';
/* ═══════════════════════════════════════════════════════════════
   DEEP SPACE COMBAT — COMEBACK BONUS
   Comeback.js  |  Standalone module, loaded after game.js
   Rewards players who return after being away for a few days.
   Separate from the daily-streak system (which resets on absence);
   this one specifically welcomes people BACK instead of punishing
   the gap, so a missed day doesn't just feel like a loss.
   ═══════════════════════════════════════════════════════════════ */

const COMEBACK = (function () {

  const KEY_LAST_VISIT = 'exomniaLastVisit';
  const KEY_LAST_BONUS  = 'exomniaComebackLast';
  const MIN_GAP_DAYS    = 3;     // must be away at least this many days
  const COOLDOWN_DAYS   = 3;     // don't show again within this many days of the last comeback bonus

  function daysAgo(ts){
    if(!ts) return Infinity;
    return (Date.now()-ts)/86400000;
  }

  function bonusForGap(gapDays){
    if(gapDays>=14) return 250;
    if(gapDays>=7)  return 150;
    return 80; // 3–6 days
  }

  function checkAndShow(){
    let lastVisit, lastBonus;
    try{
      lastVisit = parseInt(localStorage.getItem(KEY_LAST_VISIT)||'0');
      lastBonus = parseInt(localStorage.getItem(KEY_LAST_BONUS)||'0');
    }catch(e){ return; }

    const gap = daysAgo(lastVisit);
    const sinceLastBonus = daysAgo(lastBonus);

    // Stamp this visit regardless, so next session's gap is measured correctly.
    try{ localStorage.setItem(KEY_LAST_VISIT, String(Date.now())); }catch(e){}

    if(lastVisit && gap>=MIN_GAP_DAYS && sinceLastBonus>=COOLDOWN_DAYS){
      showModal(Math.floor(gap));
    }
  }

  function showModal(gapDays){
    const old=document.getElementById('comebackModal');
    if(old) old.remove();

    const bonus=bonusForGap(gapDays);

    const modal=document.createElement('div');
    modal.id='comebackModal';
    modal.style.cssText=`
      position:fixed;inset:0;z-index:520;background:rgba(0,2,14,0.94);
      display:flex;align-items:center;justify-content:center;padding:20px;
      font-family:'Courier New',monospace;animation:comebackFadeIn .3s ease;
    `;
    modal.innerHTML=`
      <style>
        @keyframes comebackFadeIn{from{opacity:0;transform:scale(.94)}to{opacity:1;transform:scale(1)}}
        @keyframes comebackGlow{0%,100%{box-shadow:0 0 30px rgba(0,229,255,0.25)}50%{box-shadow:0 0 50px rgba(0,229,255,0.5)}}
      </style>
      <div style="width:min(320px,100%);background:rgba(0,10,28,0.98);border:1px solid rgba(0,229,255,0.4);
        border-radius:14px;padding:26px 22px;text-align:center;animation:comebackGlow 2.4s ease-in-out infinite;">
        <div style="font-size:38px;margin-bottom:10px;filter:drop-shadow(0 0 12px #00e5ff);">🚀</div>
        <div style="font-size:16px;font-weight:900;letter-spacing:3px;color:#00e5ff;text-shadow:0 0 20px #00e5ff;margin-bottom:6px;">WELCOME BACK, COMMANDER</div>
        <div style="font-size:9px;letter-spacing:1px;color:rgba(255,255,255,0.55);line-height:1.6;margin-bottom:18px;">
          It's been ${gapDays} day${gapDays===1?'':'s'} since your last mission.<br>The galaxy missed you.
        </div>
        <div style="background:rgba(0,229,255,0.07);border:1px solid rgba(0,229,255,0.25);border-radius:8px;padding:12px;margin-bottom:18px;">
          <div style="font-size:8px;letter-spacing:2px;color:rgba(0,229,255,0.6);margin-bottom:4px;">COMEBACK BONUS</div>
          <div style="font-size:20px;font-weight:900;color:#00e5ff;">◈ ${bonus} COINS</div>
        </div>
        <div id="comebackClaimBtn" style="padding:11px;border-radius:8px;
          border:1px solid rgba(0,229,255,0.5);background:linear-gradient(145deg,rgba(0,229,255,0.18),rgba(0,229,255,0.05));
          color:#00e5ff;font-size:11px;font-weight:900;letter-spacing:2px;cursor:pointer;">CLAIM &amp; LAUNCH</div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('comebackClaimBtn').onclick=()=>{
      try{
        const cur=parseInt(localStorage.getItem('exomniaTotalCoins')||'0');
        localStorage.setItem('exomniaTotalCoins', cur+bonus);
        localStorage.setItem(KEY_LAST_BONUS, String(Date.now()));
      }catch(e){}
      const topCoin=document.getElementById('lbyCoinDisplay');
      if(topCoin) topCoin.textContent=localStorage.getItem('exomniaTotalCoins')||'0';
      if(window.showToast) showToast('✔ +'+bonus+' COINS CLAIMED');
      modal.remove();
    };
  }

  function init(){
    // Slight delay so it doesn't fight with the lobby's own load-in animations.
    setTimeout(checkAndShow, 900);
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    window.addEventListener('load', ()=>setTimeout(init,150));
  }

  return { checkAndShow };

})();
