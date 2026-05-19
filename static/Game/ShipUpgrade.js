/* ═══════════════════════════════════════════════════════
   SHIP UPGRADE SYSTEM  ·  Deep Space Combat
   ─────────────────────────────────────────────────────
   • Lobby ship card-এ ⬆ UPGRADE button দেখায়
   • Tap করলে fullscreen modal খোলে
   • 3 stat: ATK · SPD · DEF, প্রতিটায় 5 level
   • Cost: next_level × 120 coins
   • Upgrades localStorage-এ save হয়
   ═══════════════════════════════════════════════════════ */
'use strict';

const SUP_MAX  = 5;
const SUP_BASE = 120;
const SUP_CATS = [
  { key:'atk', label:'ATK', icon:'⚔', color:'#ff5566', glow:'rgba(255,85,102,0.35)',  desc:'Weapon damage +6% per level' },
  { key:'spd', label:'SPD', icon:'⚡', color:'#00e5ff', glow:'rgba(0,229,255,0.35)',   desc:'Move speed +4% per level'    },
  { key:'def', label:'DEF', icon:'🛡', color:'#44ddaa', glow:'rgba(68,221,170,0.35)', desc:'Shield capacity +12 per lv'  },
];

function supGet(idx) {
  try { const a=JSON.parse(localStorage.getItem('dsc_shipUpg')||'{}');const d=a[idx]||{};return{atk:d.atk||0,spd:d.spd||0,def:d.def||0}; }
  catch(e){return{atk:0,spd:0,def:0};}
}
function supSave(idx,data){
  try{const a=JSON.parse(localStorage.getItem('dsc_shipUpg')||'{}');a[idx]=data;localStorage.setItem('dsc_shipUpg',JSON.stringify(a));}catch(e){}
}
function supCost(lv){ return (lv+1)*SUP_BASE; }

/* ── Apply bonuses to live game state ── */
function applyUpgradeBonuses(shipIdx){
  if(typeof G==='undefined')return;
  const up=supGet(shipIdx);
  const s=PILOT_SHIPS[shipIdx]||PILOT_SHIPS[0];
  G._upgradeAtk=up.atk;
  G.pspd=5*(1+(s.spd-60)/200)*(1+up.spd*0.04);
  G.shMax=(100+(s.def-60)*0.5)+up.def*12;
  G.shield=Math.min(G.shield||100,G.shMax);
}
function getUpgradeAtkMult(){
  if(typeof G==='undefined'||!G._upgradeAtk)return 1;
  return 1+G._upgradeAtk*0.06;
}

/* ── Upgrade button on ship card ── */
function refreshUpgradeBtn(shipIdx){
  const btn=document.getElementById('shipUpgradeBtn');
  if(!btn)return;
  const up=supGet(shipIdx);
  const coins=getLbyCoins();
  let minCost=Infinity,allMax=true;
  SUP_CATS.forEach(cat=>{
    const lv=up[cat.key]||0;
    if(lv<SUP_MAX){allMax=false;const c=supCost(lv);if(c<minCost)minCost=c;}
  });
  if(allMax){
    btn.innerHTML='★ FULLY UPGRADED';
    btn.className='sup-card-btn maxed';
  } else {
    const afford=coins>=minCost;
    btn.innerHTML=`⬆ UPGRADE &nbsp;<span class="sup-btn-cost">◈${minCost}</span>`;
    btn.className='sup-card-btn'+(afford?' afford':' broke');
  }
  btn.onclick=openShipUpgradeModal;
}

/* ── Modal open/close ── */
function openShipUpgradeModal(){
  const m=document.getElementById('shipUpgradeModal');
  if(!m)return;
  _supRender();
  m.classList.add('sup-open');
}
function closeShipUpgradeModal(){
  const m=document.getElementById('shipUpgradeModal');
  if(m)m.classList.remove('sup-open');
}

function _supRender(){
  const idx=(typeof selectedShip!=='undefined')?selectedShip:0;
  const s=PILOT_SHIPS[idx];
  const up=supGet(idx);
  const coins=getLbyCoins();

  const el=id=>document.getElementById(id);
  const set=(id,v)=>{const e=el(id);if(e)e.textContent=v;};
  set('supCoins','◈ '+coins);
  set('supShipName',s.name);
  set('supShipBadge',s.badge+' · TIER '+s.tier);
  set('supTitle','⬆ UPGRADE: '+s.name);

  const cv=el('supShipCanvas');
  if(cv&&typeof drawSingleShip==='function')drawSingleShip(cv,s,44,52);

  const cats=el('supCats');
  if(!cats)return;
  cats.innerHTML='';

  SUP_CATS.forEach(cat=>{
    const lv=up[cat.key]||0;
    const maxed=lv>=SUP_MAX;
    const cost=maxed?0:supCost(lv);
    const afford=!maxed&&coins>=cost;

    let pips='';
    for(let i=0;i<SUP_MAX;i++){
      pips+=`<div class="sup-pip${i<lv?' on':''}" ${i<lv?`style="background:${cat.color};box-shadow:0 0 5px ${cat.glow}"`:''}></div>`;
    }

    let bc,bt;
    if(maxed){bc='sup-upg-btn maxed';bt='★ MAX';}
    else if(afford){bc='sup-upg-btn buy';bt=`◈ ${cost}`;}
    else{bc='sup-upg-btn broke';bt=`◈ ${cost}`;}

    const row=document.createElement('div');
    row.className='sup-row';
    row.innerHTML=`
      <div class="sup-row-icon" style="color:${cat.color};text-shadow:0 0 10px ${cat.glow}">${cat.icon}</div>
      <div class="sup-row-body">
        <div class="sup-row-top">
          <span class="sup-row-label" style="color:${cat.color}">${cat.label}</span>
          <span class="sup-row-lv">LV ${lv}/${SUP_MAX}</span>
        </div>
        <div class="sup-row-desc">${cat.desc}</div>
        <div class="sup-pips">${pips}</div>
      </div>
      <div class="${bc}" data-cat="${cat.key}">${bt}</div>`;

    if(!maxed){
      row.querySelector('.sup-upg-btn').addEventListener('click',e=>{
        e.stopPropagation();_supBuy(idx,cat.key);
      });
    }
    cats.appendChild(row);
  });
}

function _supBuy(shipIdx,catKey){
  const up=supGet(shipIdx);
  const lv=up[catKey]||0;
  if(lv>=SUP_MAX)return;
  const cost=supCost(lv);
  const coins=getLbyCoins();
  if(coins<cost){if(typeof showToast==='function')showToast('◈ NOT ENOUGH COINS!');return;}
  setLbyCoins(coins-cost);
  up[catKey]=lv+1;
  supSave(shipIdx,up);
  const cat=SUP_CATS.find(c=>c.key===catKey);
  if(typeof showToast==='function')showToast(`⬆ ${cat.label} UPGRADED — LV${up[catKey]}`);
  _supRender();
  refreshUpgradeBtn(shipIdx);
  if(typeof updateLbyShipCard==='function')updateLbyShipCard(shipIdx);
}

window.openShipUpgradeModal=openShipUpgradeModal;
window.closeShipUpgradeModal=closeShipUpgradeModal;
window.refreshUpgradeBtn=refreshUpgradeBtn;
window.applyUpgradeBonuses=applyUpgradeBonuses;
window.getUpgradeAtkMult=getUpgradeAtkMult;
