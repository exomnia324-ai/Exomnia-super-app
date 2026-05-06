'use strict';
// cache math functions for hot paths
const _sin=Math.sin,_cos=Math.cos,_sqrt=Math.sqrt,_abs=Math.abs,_min=Math.min,_max=Math.max,_atan2=Math.atan2,_PI=Math.PI,_rnd=Math.random,_floor=Math.floor;
const CV=document.getElementById('cv');
const CX=CV.getContext('2d',{alpha:false,desynchronized:true});
const MM=document.getElementById('mmcv');
const MX=MM.getContext('2d',{alpha:false});
const $id=id=>document.getElementById(id);
const hpEl=$id('hpV'),shEl=$id('shV'),scEl=$id('scV'),coEl=$id('coV');
const waveEl=$id('waveN'),comboBig=$id('comboBig');
const comboDiv=$id('combo'),shFill=$id('shieldFill'),xpFill=$id('xpFill');
const lvlBadge=$id('lvlBadge'),bossHUD=$id('bossHUD'),bossFill=$id('bossFill'),bossLbl=$id('bossLbl');
const lvlUp=$id('lvlUp'),pauseMenu=$id('pauseMenu'),endScreen=$id('endScreen'),toast=$id('toast');
const spBtn=$id('specialBtn'),spCD=$id('spCD'),startSc=$id('startScreen');
const alertFlash=$id('alertFlash'),puPanel=$id('puPanel');

/* ── CROSS-BROWSER RESIZE ──
   Priority: visualViewport (Chrome mobile) → innerWidth/Height
   Avoids the Chrome dynamic toolbar shrink bug */
function resize(){
  // visualViewport is most accurate on Chrome/Safari mobile
  // It excludes the dynamic address bar height
  if(window.visualViewport){
    CV.width  = Math.round(window.visualViewport.width);
    CV.height = Math.round(window.visualViewport.height);
  } else {
    // Fallback: document.documentElement for Firefox/Samsung/UC
    CV.width  = document.documentElement.clientWidth  || window.innerWidth;
    CV.height = document.documentElement.clientHeight || window.innerHeight;
  }
}
// Listen on both resize events for full coverage
window.addEventListener('resize', resize);
if(window.visualViewport){
  window.visualViewport.addEventListener('resize', resize);
  window.visualViewport.addEventListener('scroll', resize);
}
resize();

/* ── BUILD BOSS HP SEGMENTS ── */
(function(){
  const seg=$id('bossSegments');
  for(let i=0;i<8;i++){const d=document.createElement('div');d.className='bseg';seg.appendChild(d);}
})();

/* ═══ WEAPONS ═══ */
// type: 'bullet'=standard, 'missile'=homing, 'railgun'=piercing, 'shotgun'=spread, 'emp'=aoe, 'nuke'=mega
const WEAPONS=[
  {name:'PULSE',    color:'#00e5ff',scolor:'rgba(0,229,255,',w:5, h:18,spd:18,dmg:22, spread:1, icon:'🔵',type:'bullet',  cost:0,   owned:true,  desc:'Standard pulse cannon'},
  {name:'PLASMA',   color:'#ff3366',scolor:'rgba(255,51,102,',w:8, h:8, spd:13,dmg:35, spread:3, icon:'🔴',type:'bullet',  cost:40,  owned:true, desc:'Heavy plasma rounds'},
  {name:'LASER',    color:'#00ff88',scolor:'rgba(0,255,136,',w:3, h:28,spd:24,dmg:18, spread:0, icon:'💚',type:'bullet',  cost:35,  owned:true, desc:'Precision laser beam'},
  {name:'MISSILE',  color:'#ff8800',scolor:'rgba(255,136,0,', w:6, h:14,spd:10,dmg:80, spread:0, icon:'🚀',type:'missile', cost:50,  owned:false, desc:'Homing missile — tracks enemies'},
  {name:'RAILGUN',  color:'#aa44ff',scolor:'rgba(170,68,255,',w:4, h:35,spd:30,dmg:120,spread:0, icon:'⚡',type:'railgun', cost:80,  owned:false, desc:'Pierces through all enemies'},
  {name:'GATLING',  color:'#ffdd00',scolor:'rgba(255,221,0,', w:4, h:12,spd:22,dmg:14, spread:5, icon:'🔥',type:'bullet',  cost:60,  owned:false, desc:'High-speed rotary cannon'},
  {name:'SHOTGUN',  color:'#ff6644',scolor:'rgba(255,102,68,',w:6, h:10,spd:14,dmg:28, spread:8, icon:'💢',type:'shotgun', cost:70,  owned:false, desc:'8-pellet wide spread burst'},
  {name:'EMP',      color:'#00ddff',scolor:'rgba(0,221,255,', w:12,h:12,spd:9, dmg:55, spread:0, icon:'☢️',type:'emp',     cost:100, owned:false, desc:'Area pulse — stuns enemies'},
  {name:'NUKE',     color:'#ff2200',scolor:'rgba(255,34,0,',  w:16,h:16,spd:7, dmg:300,spread:0, icon:'☠️',type:'nuke',    cost:150, owned:false, desc:'Massive warhead — slow reload'},
  {name:'TWIN',     color:'#00ffcc',scolor:'rgba(0,255,204,',w:5, h:18,spd:20,dmg:28, spread:0, icon:'🔷',type:'twin',    cost:90,  owned:false, desc:'Dual side-by-side cannons'},
  {name:'VORTEX',   color:'#cc00ff',scolor:'rgba(204,0,255,',w:10,h:10,spd:8, dmg:90, spread:0, icon:'🌀',type:'vortex',  cost:120, owned:false, desc:'Spinning vortex — pulls enemies in'},
  {name:'FLARE',    color:'#ff9900',scolor:'rgba(255,153,0,',w:7, h:7, spd:11,dmg:45, spread:6, icon:'🔆',type:'flare',   cost:75,  owned:false, desc:'Scatter flares — bounces off walls'},
  {name:'FREEZE',   color:'#aaddff',scolor:'rgba(170,221,255,',w:8,h:8,spd:12,dmg:30, spread:0, icon:'❄️',type:'freeze',  cost:85,  owned:false, desc:'Cryo blast — slows all enemies'},
  {name:'CHAIN',    color:'#ffff00',scolor:'rgba(255,255,0,', w:6, h:6, spd:15,dmg:50, spread:0, icon:'⚡',type:'chain',   cost:110, owned:false, desc:'Lightning — chains between enemies'},
  {name:'BLACKHOLE',color:'#6600cc',scolor:'rgba(102,0,204,',w:14,h:14,spd:5, dmg:180,spread:0, icon:'🕳️',type:'blackhole',cost:200,owned:false, desc:'Singularity — sucks & destroys all'},
];
