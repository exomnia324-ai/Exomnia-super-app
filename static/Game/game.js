'use strict';
// cache math functions for hot paths
const _sin=Math.sin,_cos=Math.cos,_sqrt=Math.sqrt,_abs=Math.abs,_min=Math.min,_max=Math.max,_atan2=Math.atan2,_PI=Math.PI,_rnd=Math.random,_floor=Math.floor;
const CV=document.getElementById('cv');
const CX=CV.getContext('2d',{alpha:false,desynchronized:true});
const MM=document.getElementById('mmcv');
const MX=MM.getContext('2d',{alpha:false});
const $id=id=>document.getElementById(id);

// Generates and persists a unique default callsign per browser/user (e.g. "PILOT 4821")
// so that players who never rename don't collide under one shared "PILOT" identity on the server.
function getOrCreateDefaultCallsign(){
  try{
    const existing=localStorage.getItem('exomniaCallsign');
    if(existing && existing.trim()) return existing.trim();
    const rand=Math.floor(1000+Math.random()*9000);
    const def='PILOT '+rand;
    localStorage.setItem('exomniaCallsign',def);
    return def;
  }catch(e){
    return 'PILOT '+Math.floor(1000+Math.random()*9000);
  }
}
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
  {name:'LASER',    color:'#00ff88',scolor:'rgba(0,255,136,',w:3, h:28,spd:24,dmg:18, spread:0, icon:'💚',type:'bullet',  cost:35,  owned:false, desc:'Precision laser beam'},
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
// Per-weapon fire rate overrides (ms)
const WEAPON_RATES={PULSE:150,PLASMA:280,LASER:90,MISSILE:600,RAILGUN:900,GATLING:60,SHOTGUN:700,EMP:1200,NUKE:3000,TWIN:130,VORTEX:800,FLARE:500,FREEZE:900,CHAIN:600,BLACKHOLE:4000};

/* ═══ WEAPON UPGRADES (coin-based, permanent — mirrors ship upgrade system) ═══ */
const WPN_UPGRADE_MAX=5;
function getWpnUpgrades(){
  try{
    const o=JSON.parse(localStorage.getItem('exomniaWpnUpgrades')||'{}');
    return (o&&typeof o==='object')?o:{};
  }catch(e){return {};}
}
function getWpnUpgradeLevel(name){
  const u=getWpnUpgrades();
  return u[name]||0;
}
function setWpnUpgradeLevel(name,lvl){
  const u=getWpnUpgrades();
  u[name]=lvl;
  try{localStorage.setItem('exomniaWpnUpgrades',JSON.stringify(u));}catch(e){}
}
function getWpnUpgradeCost(name){
  const w=WEAPONS.find(x=>x.name===name);
  if(!w)return Infinity;
  const lvl=getWpnUpgradeLevel(name);
  if(lvl>=WPN_UPGRADE_MAX)return null;
  return Math.round((100+w.cost*0.6)*(lvl+1));
}
// +8% damage and +4% fire-rate speed per level, capped at max level
function getEffectiveWeaponDmg(name,baseDmg){
  const lvl=getWpnUpgradeLevel(name);
  return baseDmg*(1+lvl*0.08);
}
function getEffectiveWeaponRateMult(name){
  const lvl=getWpnUpgradeLevel(name);
  return 1-lvl*0.04; // multiplies fire-delay, so lower = faster
}
function upgradeWeapon(name){
  const w=WEAPONS.find(x=>x.name===name);
  if(!w||!w.owned){showToast('BUY THIS WEAPON FIRST!');return;}
  const cost=getWpnUpgradeCost(name);
  if(cost===null){showToast('WEAPON ALREADY AT MAX LEVEL!');return;}
  const coins=getLbyCoins();
  if(coins<cost){showToast('◈ NOT ENOUGH COINS!');return;}
  setLbyCoins(coins-cost);
  setWpnUpgradeLevel(name,getWpnUpgradeLevel(name)+1);
  const topCoin=document.getElementById('lbyCoinDisplay');
  if(topCoin) topCoin.textContent=getLbyCoins();
  showToast('WEAPON UPGRADED: '+name+' → LV.'+getWpnUpgradeLevel(name));
}

/* ═══ WINGMAN DRONE (coin-purchased, fully passive ally) ═══ */
const WINGMAN_COST=500;
const WINGMAN_FIRE_MS=650;
const WINGMAN_DMG_MULT=0.4; // fires at 40% of the player's equipped weapon damage
function getWingmanOwned(){
  try{return localStorage.getItem('exomniaWingmanOwned')==='1';}catch(e){return false;}
}
function buyWingman(){
  if(getWingmanOwned()){showToast('WINGMAN DRONE ALREADY OWNED');return;}
  const coins=getLbyCoins();
  if(coins<WINGMAN_COST){showToast('◈ NOT ENOUGH COINS!');return;}
  setLbyCoins(coins-WINGMAN_COST);
  try{localStorage.setItem('exomniaWingmanOwned','1');}catch(e){}
  const topCoin=document.getElementById('lbyCoinDisplay');
  if(topCoin) topCoin.textContent=getLbyCoins();
  showToast('✔ WINGMAN DRONE ACQUIRED!');
}

/* ═══ GAME STATE ═══ */
let G={};
function initG(){
  G={
    alive:false,paused:false,over:false,
    px:CV.width/2,py:CV.height-185,pdx:0,pdy:0,pvx:0,pvy:0,pspd:5,
    pw:40,ph:50,
    lives:3,invT:0,
    shield:100,shMax:100,shRegen:8,shRegenDelay:0,
    wIdx:0,fireRate:150,lastFire:0,
    score:0,coins:0,kills:0,maxCombo:0,
    xp:0,xpNeed:100,level:1,
    sk:{damage:0,fireRate:0,speed:0,critical:0,shield:0},
    wave:1,wSpawned:0,wMax:10,
    bossOn:false,bossKilled:false,
    bossHp:0,bossMaxHp:0,bossX:0,bossY:110,bossDir:1,bossT:0,bossPhase:1,bossKit:0,
    coopMode:false,coopIsHost:false,coopEnemyIdSeq:0,coopSquadKills:0,coopSquadScore:0,
    wingmanOn:getWingmanOwned(),wingmanX:CV.width/2-52,wingmanY:CV.height-185+14,wingmanLastFire:0,
    bossName:'DESTROYER',
    combo:0,comboT:0,
    spReady:true,spCD:0,spMax:9000,
    shakeAmt:0,shakeDecay:0,
    thrusterT:0,
    bullets:[],eBullets:[],enemies:[],particles:[],drops:[],railBeams:[],empBlasts:[],
    stars1:[],stars2:[],stars3:[],nebulae:[],
    activePU:{},
    _shipAtkMult:0,
    joyOn:false,joyX:0,joyY:0,
    firing:false,
    dt:0,lastT:0,frame:0,
  };
}
initG();

/* ── BIOMES / MAPS ── */
// Each biome swaps the background palette, nebula colors, star tint and adds its own
// signature hazard (asteroid field density, debris drift, etc). Wave # picks the biome.
const BIOMES=[
  {name:'DEEP SPACE',      bgIn:'#00050f',bgMid:'#000308',bgOut:'#000104',
   nc:['rgba(0,35,110','rgba(55,0,120','rgba(0,75,85','rgba(95,20,0'],
   starTint:['#ffffff','#cce8ff','#ffd8b0'],asteroidDensity:.5,asteroidCol:'#6b6459',fogCol:null},
  {name:'ASTEROID FIELD',  bgIn:'#0f0906',bgMid:'#080503',bgOut:'#040201',
   nc:['rgba(110,60,0','rgba(90,40,10','rgba(70,50,20','rgba(120,70,0'],
   starTint:['#ffe8cc','#ffd8b0','#ffffff'],asteroidDensity:1.6,asteroidCol:'#8a7a5f',fogCol:null},
  {name:'NEBULA STORM',    bgIn:'#140020',bgMid:'#0a0014','bgOut':'#05000a',
   nc:['rgba(150,0,180','rgba(90,0,160','rgba(180,0,120','rgba(60,0,140'],
   starTint:['#e8ccff','#ff99ee','#ffffff'],asteroidDensity:.3,asteroidCol:'#7a5a8a',fogCol:'rgba(150,0,200,0.05)'},
  {name:'CRIMSON WASTES',  bgIn:'#170303',bgMid:'#0c0101',bgOut:'#050000',
   nc:['rgba(160,10,10','rgba(120,20,0','rgba(100,0,30','rgba(180,40,0'],
   starTint:['#ffcccc','#ff9999','#ffffff'],asteroidDensity:.9,asteroidCol:'#8a4030',fogCol:'rgba(180,20,10,0.04)'},
  {name:'ICE EXPANSE',     bgIn:'#02121a',bgMid:'#010a0f',bgOut:'#000507',
   nc:['rgba(0,90,150','rgba(0,140,180','rgba(20,60,120','rgba(0,170,200'],
   starTint:['#cceeff','#ffffff','#aaddff'],asteroidDensity:1.1,asteroidCol:'#7fa8b8',fogCol:'rgba(0,150,220,0.05)'},
  {name:'DERELICT RUINS',  bgIn:'#0a0a0a',bgMid:'#050505',bgOut:'#020202',
   nc:['rgba(60,80,60','rgba(40,60,40','rgba(80,90,60','rgba(50,70,50'],
   starTint:['#ccffcc','#ffffff','#aaffaa'],asteroidDensity:.7,asteroidCol:'#4a4a4a',fogCol:'rgba(60,90,60,0.04)'},
];
function getBiome(){return BIOMES[Math.floor((G.wave-1)/3)%BIOMES.length];}

/* ── BACKGROUND ── */
function initBG(){
  G.stars1=[];G.stars2=[];G.stars3=[];
  const bm=getBiome();
  const starCols=bm.starTint.concat(['#ffffff']);
  for(let i=0;i<110;i++)G.stars1.push({x:rnd(0,CV.width),y:rnd(0,CV.height),r:.25+Math.random()*.45,a:.15+Math.random()*.35,twinkleSpd:rnd(.4,1.5),twinkleOff:rnd(0,6.28),col:starCols[_floor(_rnd()*starCols.length)]});
  for(let i=0;i<65;i++)G.stars2.push({x:rnd(0,CV.width),y:rnd(0,CV.height),r:.55+Math.random()*.75,a:.3+Math.random()*.4,twinkleSpd:rnd(.3,1.2),twinkleOff:rnd(0,6.28),col:starCols[_floor(_rnd()*starCols.length)]});
  for(let i=0;i<30;i++)G.stars3.push({x:rnd(0,CV.width),y:rnd(0,CV.height),r:.9+Math.random()*1.3,a:.5+Math.random()*.4,twinkleSpd:rnd(.2,1.0),twinkleOff:rnd(0,6.28),col:starCols[_floor(_rnd()*starCols.length)],flare:Math.random()<.3});
  G.nebulae=[];
  const nc=bm.nc;
  for(let i=0;i<9;i++)G.nebulae.push({x:rnd(-80,CV.width+80),y:rnd(-80,CV.height+80),r:rnd(100,240),c:nc[i%nc.length],spd:.018+Math.random()*.035,drift:(Math.random()-.5)*.007,alpha:.06+Math.random()*.07,pulse:rnd(0,6.28),pulseSpd:rnd(.003,.01)});
  // Shooting stars pool
  G.shootingStars=[];G._ssTimer=rnd(3000,7000);
  // Asteroids / obstacles pool — density and tint driven by the current biome
  G.asteroids=[];G._astTimer=rnd(800,1800);
  G._curBiomeName=bm.name;
}
// Called whenever the wave advances — if the biome changed, refresh the palette + announce it
function refreshBiomeIfChanged(){
  const bm=getBiome();
  if(G._curBiomeName!==bm.name){
    initBG();
    toast_('◈ ENTERING '+bm.name);
  }
}

/* ── ASTEROIDS / OBSTACLES ── */
// Drifting rocks that scroll down like enemies but don't shoot — they just block the
// way. Small ones can be shot through eventually (a few hits), big ones deal heavy
// contact damage and need real firepower or a dodge.
function spawnAsteroid(){
  const bm=getBiome();
  const big=Math.random()<.28;
  const r=big?rnd(30,48):rnd(12,24);
  const hp=big?Math.round(r*4):Math.round(r*1.6);
  G.asteroids.push({
    x:rnd(r,CV.width-r),y:-r-20,r,hp,maxHp:hp,
    dy:big?rnd(.5,1.1):rnd(.9,1.9),
    dx:rnd(-.4,.4),
    rot:rnd(0,6.28),rotSpd:rnd(-.02,.02)*(big?.4:1),
    col:bm.asteroidCol,big,
    seed:Math.random()*99
  });
}
function updateAsteroids(f,dt){
  if(!G.asteroids)G.asteroids=[];
  if(!G.alive||G.paused||G.over)return;
  const bm=getBiome();
  G._astTimer-=dt;
  const maxOnScreen=bm.asteroidDensity>=1.5?7:bm.asteroidDensity>=1?5:3;
  if(G._astTimer<=0&&G.asteroids.length<maxOnScreen){
    G._astTimer=rnd(1400,3200)/Math.max(.4,bm.asteroidDensity);
    spawnAsteroid();
  }
  for(let i=G.asteroids.length-1;i>=0;i--){
    const a=G.asteroids[i];
    a.y+=a.dy*f;a.x+=a.dx*f;a.rot+=a.rotSpd*f;
    if(a.x<a.r||a.x>CV.width-a.r)a.dx*=-1;
    if(a.y>CV.height+a.r+30||a.hp<=0){
      if(a.hp<=0){burst(a.x,a.y,a.big?'#c8a878':'#a89868',a.big?16:8);SFX.enemy_explode&&SFX.enemy_explode();}
      G.asteroids.splice(i,1);continue;
    }
    // contact damage vs player
    if(G.invT<=0&&hitCircle(G.px,G.py,G.pw*.4,a.x,a.y,a.r*.85)){
      hitPlayer(a.big?38:20);
      a.hp-=a.big?40:999; // small ones shatter on contact, big ones just get dinged
      burst(a.x,a.y,'#ffaa55',10);
      shake(a.big?14:6,1);
    }
  }
}
function drawAsteroid(a){
  CX.save();CX.translate(a.x,a.y);CX.rotate(a.rot);
  const pts=7;
  CX.beginPath();
  for(let i=0;i<pts;i++){
    const ang=(i/pts)*Math.PI*2;
    const rr=a.r*(.78+.22*Math.sin(a.seed+i*2.1));
    const px=Math.cos(ang)*rr,py=Math.sin(ang)*rr;
    if(i===0)CX.moveTo(px,py);else CX.lineTo(px,py);
  }
  CX.closePath();
  CX.fillStyle=a.col;CX.fill();
  CX.strokeStyle='rgba(0,0,0,0.4)';CX.lineWidth=2;CX.stroke();
  // simple crater shading
  CX.fillStyle='rgba(0,0,0,0.15)';
  CX.beginPath();CX.arc(-a.r*.25,-a.r*.2,a.r*.28,0,Math.PI*2);CX.fill();
  CX.restore();
  // hp bar for big asteroids that have taken damage
  if(a.big&&a.hp<a.maxHp){
    const w=a.r*1.6;
    CX.fillStyle='rgba(0,0,0,0.5)';CX.fillRect(a.x-w/2,a.y-a.r-10,w,4);
    CX.fillStyle='#ffaa44';CX.fillRect(a.x-w/2,a.y-a.r-10,w*Math.max(0,a.hp/a.maxHp),4);
  }
}

/* ═══ MAIN LOOP ═══ */
let _miniT=0,_accumT=0;
const FIXED_STEP=16;
function loop(ts){
  requestAnimationFrame(loop);
  // Don't render game while lobby is visible
  const lobbyEl=$id('lobbyScreen');
  if(lobbyEl&&!lobbyEl.classList.contains('gone')){G.lastT=ts;return;}
  if(!G.alive||G.paused||G.over){G.lastT=ts;return;}
  const raw=Math.min(ts-G.lastT,50);
  G.lastT=ts;
  G._t=ts/1000;
  _accumT+=raw;
  // fixed-step updates — prevents spiral of death
  let steps=0;
  while(_accumT>=FIXED_STEP&&steps<3){
    G.dt=FIXED_STEP;
    update();
    _accumT-=FIXED_STEP;
    steps++;
  }
  draw();
  if(ts-_miniT>100){_miniT=ts;drawMinimap();}
}

/* ═══ UPDATE ═══ */
function update(){
  const dt=G.dt,f=dt/16;
  G.frame++;

  for(const s of G.stars1){s.y+=.12*f;if(s.y>CV.height){s.y=0;s.x=rnd(0,CV.width);}}
  for(const s of G.stars2){s.y+=.32*f;if(s.y>CV.height){s.y=0;s.x=rnd(0,CV.width);}}
  for(const s of G.stars3){s.y+=.72*f;if(s.y>CV.height){s.y=0;s.x=rnd(0,CV.width);}}
  for(const n of G.nebulae){n.y+=n.spd*f;n.x+=n.drift*f;n.pulse+=n.pulseSpd*f;if(n.y>CV.height+300)n.y=-300;if(n.x>CV.width+300)n.x=-300;else if(n.x<-300)n.x=CV.width+300;}
  updateAsteroids(f,dt);
  // Shooting stars
  if(G.shootingStars){
    G._ssTimer-=G.dt;
    if(G._ssTimer<=0){G._ssTimer=rnd(3500,9000);G.shootingStars.push({x:rnd(0,CV.width*.7),y:rnd(0,CV.height*.25),vx:rnd(5,10),vy:rnd(2,5),life:600,ml:600,trail:[]});}
    for(let i=G.shootingStars.length-1;i>=0;i--){const ss=G.shootingStars[i];ss.trail.push({x:ss.x,y:ss.y});if(ss.trail.length>16)ss.trail.shift();ss.x+=ss.vx*f;ss.y+=ss.vy*f;ss.life-=G.dt;if(ss.life<=0)G.shootingStars.splice(i,1);}
  }

  G.shakeAmt=Math.max(0,G.shakeAmt-G.shakeDecay*f);
  const spd=G.pspd*(1+G.sk.speed*.15);
  // --- smooth velocity-based movement ---
  const sens=CFG.sensitivity/5;           // 0.2 – 2.0
  const frictionBase=0.78+CFG.inertia*0.014; // 0.792 (snappy) – 0.92 (floaty)
  const accel=0.18*f*sens;
  const friction=Math.min(frictionBase,0.94);
  let ax=0,ay=0;
  if(G.joyOn){ax=G.joyX;ay=G.joyY;}
  if(K['ArrowLeft']||K['KeyA'])ax=-1;
  if(K['ArrowRight']||K['KeyD'])ax=1;
  if(K['ArrowUp']||K['KeyW'])ay=-1;
  if(K['ArrowDown']||K['KeyS'])ay=1;
  // normalize diagonal
  const al=Math.sqrt(ax*ax+ay*ay);
  if(al>1){ax/=al;ay/=al;}
  G.pvx=(G.pvx+ax*spd*accel)*friction;
  G.pvy=(G.pvy+ay*spd*accel)*friction;
  G.px+=G.pvx*f;
  G.py+=G.pvy*f;
  G.px=clamp(G.px,G.pw/2,CV.width-G.pw/2);
  G.py=clamp(G.py,G.ph/2,CV.height-136-G.ph/2);

  G.shRegenDelay=Math.max(0,G.shRegenDelay-dt);
  if(G.shRegenDelay<=0&&G.shield<G.shMax){
    const prev=G.shield;
    G.shield=Math.min(G.shMax,G.shield+G.shRegen*(1+G.sk.shield*.15)*f*.1);
    if(Math.floor(G.shield)!==Math.floor(prev))updateShieldUI();
  }
  if(G.invT>0)G.invT-=dt;
  G.thrusterT+=dt;
  if(G.firing)doFire();
  if(G.wingmanOn){
    // Trails slightly behind/left of the player with soft-follow easing
    const tx=G.px-52,ty=G.py+14;
    G.wingmanX+=(tx-G.wingmanX)*.12*f;
    G.wingmanY+=(ty-G.wingmanY)*.12*f;
    const now=performance.now();
    if(now-G.wingmanLastFire>WINGMAN_FIRE_MS && G.enemies.length+((G.bossOn)?1:0)>0){
      G.wingmanLastFire=now;
      const w=WEAPONS[G.wIdx];
      const dmg=getEffectiveWeaponDmg(w.name,w.dmg)*WINGMAN_DMG_MULT*(1+G.sk.damage*.25);
      G.bullets.push({x:G.wingmanX,y:G.wingmanY-10,dx:0,dy:-16,dmg,crit:false,w:4,h:14,color:'#00ff8c',sc:'rgba(0,255,140,',wIdx:G.wIdx,type:'bullet',wingman:true});
      SFX.weaponSound&&SFX.weaponSound('PULSE');
    }
  }

  // update bullets in-place (avoid GC pressure from filter)
  const cw=CV.width,ch=CV.height;
  for(let i=G.bullets.length-1;i>=0;i--){
    const b=G.bullets[i];
    // missile homing
    if(b.type==='missile'&&b.tgt&&G.enemies.includes(b.tgt)){
      const dx=b.tgt.x-b.x,dy=b.tgt.y-b.y,d=Math.sqrt(dx*dx+dy*dy)||1;
      b.dx+=(dx/d*WEAPONS[b.wIdx].spd-b.dx)*.12;
      b.dy+=(dy/d*WEAPONS[b.wIdx].spd-b.dy)*.12;
    } else if(b.type==='missile'){b.tgt=null;}
    // smoke trail for missiles
    if(b.type==='missile'&&G.particles.length<300){
      G.particles.push({x:b.x,y:b.y,vx:rnd(-.5,.5),vy:rnd(.2,1),r:rnd(2,5),c:'#ff8844',life:220,ml:220});
    }
    b.y+=b.dy*f;b.x+=b.dx*f;
    // flare bounces off walls
    if(b.type==='flare'){
      if(b.x<0||b.x>cw){b.dx*=-1;b.x=clamp(b.x,0,cw);if(b.bounces!==undefined){b.bounces--;if(b.bounces<0){G.bullets.splice(i,1);continue;}}}
      if(b.y<0){b.dy*=-1;b.y=0;if(b.bounces!==undefined){b.bounces--;if(b.bounces<0){G.bullets.splice(i,1);continue;}}}
    }
    if(b.y<-30||b.y>ch+30||b.x<-20||b.x>cw+20)G.bullets.splice(i,1);
  }
  // railgun beams
  if(G.railBeams){for(let i=G.railBeams.length-1;i>=0;i--){G.railBeams[i].life-=dt;if(G.railBeams[i].life<=0)G.railBeams.splice(i,1);}}
  // emp/nuke blasts
  if(G.empBlasts){for(let i=G.empBlasts.length-1;i>=0;i--){const eb=G.empBlasts[i];eb.r=Math.min(eb.maxR,eb.r+eb.maxR/(eb.life/16)*f);eb.life-=dt;if(eb.life<=0)G.empBlasts.splice(i,1);}}
  for(let i=G.eBullets.length-1;i>=0;i--){
    const b=G.eBullets[i];
    if(b.homing){
      const ddx=G.px-b.x,ddy=G.py-b.y,dd=Math.hypot(ddx,ddy)||1;
      b.dx+=(ddx/dd*6.5-b.dx)*.035;b.dy+=(ddy/dd*6.5-b.dy)*.035;
    }
    b.y+=b.dy*f;b.x+=b.dx*f;if(b.y>ch+30||b.x<-20||b.x>cw+20||b.y<-20)G.eBullets.splice(i,1);
  }

  for(const e of G.enemies){
    e.t+=dt;
    if(!G.coopMode||G.coopIsHost){
      // Movement/AI position is host-authoritative — synced to teammates via snapshot.
      const slowFactor=G.activePU.timeslow?0.3:1; // TIME SLOW power-up
      if(e.type==='kamikaze'){
        // home in on player, accelerating dive
        const ddx=G.px-e.x,ddy=G.py-e.y,dd=Math.hypot(ddx,ddy)||1;
        e.dx+=(ddx/dd*3.4-e.dx)*.05;e.dy+=(ddy/dd*3.4-e.dy)*.05;
      }
      if(e.type==='turret'){
        // Drifts down until it reaches its anchor line, then plants itself and just fires
        if(!e.anchored){
          if(e.y>=e.anchorY){e.anchored=true;e.dy=0;e.dx=0;}
        } else {e.dx=0;e.dy=0;}
      }
      if(e.type!=='turret'||!e.anchored){
        e.y+=e.dy*f*slowFactor;e.x+=e.dx*f*slowFactor;
      }
      if(e.sway)e.x=e.bx+Math.sin(e.t*.002)*65;
      if(e.type!=='turret'&&(e.x<e.w/2||e.x>CV.width-e.w/2))e.dx*=-1;
      if(e.y>CV.height+60)e.hp=0;
    }
    // Shooting runs locally on EVERY client (host and teammates alike) so enemies
    // feel alive and actually fire at whoever is nearby on that player's own screen.
    // eFire() only ever targets this client's own G.px/G.py and its own G.eBullets,
    // so it's safe to run independently without any network sync.
    if(e.type!=='kamikaze'&&e.type!=='mine'){
      e.shotT+=dt;
      // Sniper fires less often but from far away; turret is fast + heavy once anchored
      const sr=e.type==='turret'?(e.anchored?1300:999999):e.type==='sniper'?3000:e.elite?1100:e.type==='tank'||e.type==='shielded'?2000:e.type==='fast'?1800:2400;
      if(e.shotT>sr){e.shotT=0;eFire(e);}
    }
    if(G.frame%9===0&&G.particles.length<250){G.particles.push({x:e.x+rnd(-6,6),y:e.y-e.h*.4,vx:rnd(-.5,.5),vy:rnd(-1,-.3),r:rnd(1.5,3),c:e.elite?'#ff44aa':e.type==='sniper'?'#ff0000':e.type==='kamikaze'?'#ff8800':'#ff4400',life:220,ml:220});}
  }
  for(let i=G.enemies.length-1;i>=0;i--){if(G.enemies[i].hp<=0)G.enemies.splice(i,1);}
  if(G.bossOn&&(!G.coopMode||G.coopIsHost))updateBoss();

  for(let i=G.drops.length-1;i>=0;i--){
    const d=G.drops[i];d.y+=1.4*f;d.t+=dt;
    if(d.y>CV.height+30){G.drops.splice(i,1);continue;}
    if(hitCircle(G.px,G.py,22,d.x,d.y,14)){pickDrop(d);G.drops.splice(i,1);}
  }

  // particles in-place update
  for(let i=G.particles.length-1;i>=0;i--){
    const p=G.particles[i];p.x+=p.vx*f;p.y+=p.vy*f;p.vx*=.96;p.vy*=.96;p.life-=dt;
    if(p.life<=0)G.particles.splice(i,1);
  }

  bulletInterception();
  bulletHit();

  if(G.invT<=0){
    for(let i=G.eBullets.length-1;i>=0;i--){
      const b=G.eBullets[i];
      if(hitCircle(G.px,G.py,G.pw*.45,b.x,b.y,6)){G.eBullets.splice(i,1);hitPlayer(b.dmg||18);}
    }
  }
  if(G.invT<=0){
    for(let ci=0;ci<G.enemies.length;ci++){
      const e=G.enemies[ci];
      if(rectOverlap(G.px,G.py,G.pw*.7,G.ph*.7,e.x,e.y,e.w*.65,e.h*.65)){
        if(e.type==='mine'){
          // route through killEnemy so the blast-radius logic fires properly
          e.hp=0;killEnemy(e,ci);
        } else {
          const dmg=e.type==='kamikaze'?45:30;
          e.hp=0;burst(e.x,e.y,'#ff3355',e.type==='kamikaze'?18:12);hitPlayer(dmg);addScore(15,e.x,e.y);
        }
        break;
      }
    }
  }
  if(G.combo>0){G.comboT-=dt;if(G.comboT<=0){G.combo=0;comboDiv.classList.remove('show');}}
  if(!G.spReady){
    G.spCD=Math.max(0,G.spCD-dt);
    if(G.frame%2===0){const deg=(1-G.spCD/G.spMax)*360;spCD.style.setProperty('--p',deg+'deg');}
    if(G.spCD<=0){G.spReady=true;spBtn.style.opacity='1';}
  }
  if((!G.coopMode||G.coopIsHost)&&!G.bossOn&&!G.bossKilled&&G.enemies.length===0&&G.wSpawned>=G.wMax){
    if(G.wave%3===0)spawnBoss();else advWave();
  }
  if((!G.coopMode||G.coopIsHost)&&!G.bossOn&&G.enemies.length<4&&G.wSpawned<G.wMax)spawnEnemy();
  for(const k in G.activePU){G.activePU[k]-=dt;if(G.activePU[k]<=0)delete G.activePU[k];}
  if(G.frame%3===0){updateWeaponHUD();updatePUPanel();}
}

/* ── FIRE ── */
function doFire(){
  const now=performance.now();
  const w=WEAPONS[G.wIdx];
  const baseRate=WEAPON_RATES[w.name]||150;
  const rate=baseRate*getEffectiveWeaponRateMult(w.name)*(1-G.sk.fireRate*.12)*(G.activePU.rapid?.5:1);
  if(now-G.lastFire<rate)return;
  G.lastFire=now;
  const crit=Math.random()<(.1+G.sk.critical*.1);
  const dmg=(getEffectiveWeaponDmg(w.name,w.dmg)*(1+G.sk.damage*.25)*(1+(G._shipAtkMult||0)))*(crit?2.5:1)*(G.activePU.powerfull?2:1);

  SFX.weaponSound(w.name);
  if(w.type==='missile'){
    // find closest enemy to home in on
    let tgt=null,td=9999;
    for(const e of G.enemies){const d=Math.hypot(e.x-G.px,e.y-G.py);if(d<td){td=d;tgt=e;}}
    G.bullets.push({x:G.px,y:G.py-G.ph*.5,dx:0,dy:-w.spd,dmg,crit,w:w.w,h:w.h,color:w.color,sc:w.scolor,wIdx:G.wIdx,type:'missile',tgt,smoke:[]});
    shake(2,.3);
  } else if(w.type==='railgun'){
    // single piercing beam — use special G.railBeams list
    if(!G.railBeams)G.railBeams=[];
    G.railBeams.push({x:G.px,y:0,h:G.py,life:180,color:w.color});
    // instantly damage all enemies in column
    let hit=false;
    for(let j=G.enemies.length-1;j>=0;j--){
      const e=G.enemies[j];
      if(Math.abs(e.x-G.px)<18){e.hp-=dmg;spark(e.x,e.y,w.color);if(e.hp<=0){killEnemy(e,j);hit=true;}}
    }
    if(G.bossOn&&Math.abs(G.bossX-G.px)<50){G.bossHp-=dmg;spark(G.bossX,G.bossY,w.color);}
    shake(4,.5);
  } else if(w.type==='shotgun'){
    const pellets=8;
    for(let i=0;i<pellets;i++){
      const a=(i/(pellets-1)-0.5)*50*Math.PI/180;
      G.bullets.push({x:G.px,y:G.py-G.ph*.47,dx:Math.sin(a)*w.spd,dy:-Math.cos(a)*w.spd,dmg:dmg*.55,crit,w:w.w,h:w.h,color:w.color,sc:w.scolor,wIdx:G.wIdx,type:'bullet'});
    }
    shake(5,.6);
  } else if(w.type==='emp'){
    // AOE explosion — damage all on screen
    if(!G.empBlasts)G.empBlasts=[];
    G.empBlasts.push({x:G.px,y:G.py,r:0,maxR:180,life:400,color:w.color});
    for(let j=G.enemies.length-1;j>=0;j--){
      const e=G.enemies[j];
      const d=Math.hypot(e.x-G.px,e.y-G.py);
      if(d<200){e.hp-=dmg*(1-d/200);if(e.stun!==undefined)e.stun=1800;if(e.hp<=0)killEnemy(e,j);}
    }
    if(G.bossOn)G.bossHp-=dmg*.5;
    burst(G.px,G.py,w.color,20);shake(8,.8);
  } else if(w.type==='nuke'){
    if(!G.empBlasts)G.empBlasts=[];
    G.empBlasts.push({x:G.px,y:G.py-100,r:0,maxR:CV.width*.9,life:700,color:'#ff4400'});
    G.empBlasts.push({x:G.px,y:G.py-100,r:0,maxR:CV.width*.7,life:600,color:'#ff8800'});
    G.empBlasts.push({x:G.px,y:G.py-100,r:0,maxR:CV.width*.45,life:500,color:'#ffcc00'});
    for(let j=G.enemies.length-1;j>=0;j--){
      const e=G.enemies[j];e.hp-=dmg;if(e.hp<=0)killEnemy(e,j);
    }
    if(G.bossOn)G.bossHp-=dmg*.7;
    bigBurst(G.px,G.py-100);shake(20,2.0);toast_('☠️ NUKE DETONATED!');
  } else if(w.type==='twin'){
    for(const ox of [-10,10]){
      G.bullets.push({x:G.px+ox,y:G.py-G.ph*.47,dx:0,dy:-w.spd,dmg,crit,w:w.w,h:w.h,color:w.color,sc:w.scolor,wIdx:G.wIdx,type:'bullet'});
    }
  } else if(w.type==='vortex'){
    if(!G.empBlasts)G.empBlasts=[];
    G.empBlasts.push({x:G.px,y:G.py-80,r:0,maxR:130,life:600,color:w.color});
    for(let j=G.enemies.length-1;j>=0;j--){
      const e=G.enemies[j];const d=Math.hypot(e.x-G.px,e.y-G.py);
      if(d<160){e.x+=(G.px-e.x)*.18;e.y+=((G.py-80)-e.y)*.18;e.hp-=dmg*(1-d/160);if(e.hp<=0)killEnemy(e,j);}
    }
    burst(G.px,G.py-80,w.color,14);shake(3,.4);
  } else if(w.type==='flare'){
    for(let i=0;i<5;i++){
      const a=(i/4-0.5)*60*Math.PI/180;
      G.bullets.push({x:G.px,y:G.py-G.ph*.47,dx:Math.sin(a)*w.spd,dy:-Math.cos(a)*w.spd,dmg,crit,w:w.w,h:w.h,color:w.color,sc:w.scolor,wIdx:G.wIdx,type:'flare',bounces:3});
    }
  } else if(w.type==='freeze'){
    if(!G.empBlasts)G.empBlasts=[];
    G.empBlasts.push({x:G.px,y:G.py,r:0,maxR:200,life:500,color:w.color});
    for(let j=G.enemies.length-1;j>=0;j--){
      const e=G.enemies[j];const d=Math.hypot(e.x-G.px,e.y-G.py);
      if(d<220){e.hp-=dmg*(1-d/220);e.dy=Math.max(e.dy*.3,.3);e.dx*=.3;if(!e.frozenT)e.frozenT=2500;spark(e.x,e.y,w.color);if(e.hp<=0)killEnemy(e,j);}
    }
    burst(G.px,G.py,w.color,16);shake(4,.5);
  } else if(w.type==='chain'){
    const maxChain=6;let remaining=[...G.enemies];let cx=G.px,cy=G.py;
    if(!G.railBeams)G.railBeams=[];
    let px2=G.px,py2=G.py;
    for(let c=0;c<maxChain&&remaining.length>0;c++){
      let closest=null,cd=9999,ci=-1;
      for(let j=0;j<remaining.length;j++){const d=Math.hypot(remaining[j].x-cx,remaining[j].y-cy);if(d<cd){cd=d;closest=remaining[j];ci=j;}}
      if(!closest||cd>250)break;
      closest.hp-=dmg*(1-c*.12);spark(closest.x,closest.y,w.color);
      G.railBeams.push({x:px2,y:py2,x2:closest.x,y2:closest.y,life:200,color:w.color,chain:true});
      px2=closest.x;py2=closest.y;cx=closest.x;cy=closest.y;
      const gi=G.enemies.indexOf(closest);if(closest.hp<=0&&gi>=0)killEnemy(closest,gi);
      remaining.splice(ci,1);
    }
    shake(3,.3);
  } else if(w.type==='blackhole'){
    if(!G.empBlasts)G.empBlasts=[];
    G.empBlasts.push({x:G.px,y:G.py-120,r:0,maxR:CV.width,life:900,color:'#6600cc'});
    G.empBlasts.push({x:G.px,y:G.py-120,r:0,maxR:CV.width*.6,life:750,color:'#aa00ff'});
    for(let j=G.enemies.length-1;j>=0;j--){
      const e=G.enemies[j];e.x+=(G.px-e.x)*.35;e.y+=((G.py-120)-e.y)*.35;e.hp-=dmg;if(e.hp<=0)killEnemy(e,j);
    }
    if(G.bossOn)G.bossHp-=dmg*.8;
    bigBurst(G.px,G.py-120);shake(25,2.5);toast_('🕳️ SINGULARITY!');
  } else {
    // standard bullet (PULSE/PLASMA/LASER/GATLING)
    const shots=G.activePU.triple?3:w.name==='GATLING'?3:1;
    const baseAngles=shots===3?[-14,0,14]:[0];
    for(const a of baseAngles){
      const rad=a*Math.PI/180+rnd(-.025,.025)*w.spread;
      G.bullets.push({x:G.px,y:G.py-G.ph*.47,dx:Math.sin(rad)*w.spd,dy:-Math.cos(rad)*w.spd,dmg,crit,w:w.w,h:w.h,color:w.color,sc:w.scolor,wIdx:G.wIdx,type:'bullet'});
    }
  }
  if(G.particles.length<300){for(let i=0;i<2;i++){G.particles.push({x:G.px,y:G.py-G.ph*.47,vx:rnd(-.8,.8),vy:rnd(-2.5,-.5),r:rnd(1,3),c:w.color,life:130,ml:130});}}
}

/* ── ENEMY FIRE ── */
function eFire(e){
  const dx=G.px-e.x,dy=G.py-e.y,d=Math.sqrt(dx*dx+dy*dy)||1;

  if(e.type==='sniper'){
    // Sniper: single fast precise bullet with laser sight warning
    const sp=8.5;
    G.eBullets.push({x:e.x,y:e.y+e.h*.4,dx:(dx/d)*sp,dy:(dy/d)*sp,dmg:35,sniper:true});
    // Particle trail for sniper charge-up effect
    if(G.particles.length<300){
      for(let i=0;i<6;i++) G.particles.push({x:e.x+rnd(-5,5),y:e.y+rnd(-5,5),vx:rnd(-1,1),vy:rnd(-1,1),r:rnd(1,3),c:'#ff0044',life:180,ml:180});
    }
    return;
  }
  if(e.type==='turret'){
    // Stationary once anchored — fires a wide fixed spread every cycle, doesn't need to aim
    const sp=4.2,count=5;
    for(let i=0;i<count;i++){
      const a=(i-Math.floor(count/2))*14*Math.PI/180;
      G.eBullets.push({x:e.x,y:e.y+e.h*.4,dx:(dx/d*Math.cos(a)-dy/d*Math.sin(a))*sp,dy:(dx/d*Math.sin(a)+dy/d*Math.cos(a))*sp,dmg:16});
    }
    return;
  }

  const sp=e.elite?5.5:e.type==='fast'?4.5:3.5;
  const count=e.elite?3:1;
  for(let i=0;i<count;i++){
    const a=(i-Math.floor(count/2))*18*Math.PI/180;
    G.eBullets.push({x:e.x,y:e.y+e.h*.4,dx:(dx/d*Math.cos(a)-dy/d*Math.sin(a))*sp,dy:(dx/d*Math.sin(a)+dy/d*Math.cos(a))*sp,dmg:e.elite?22:14});
  }
}

/* ── BOSS ── */
function updateBoss(){
  G.bossT+=G.dt;const f=G.dt/16;
  const slowFactor=G.activePU.timeslow?0.4:1;
  G.bossX+=G.bossDir*1.8*f*slowFactor;
  if(G.bossX>CV.width-100||G.bossX<100)G.bossDir*=-1;
  const targetY=G.bossPhase===3?90:G.bossPhase===2?130:110;
  G.bossY+=(targetY-G.bossY)*.02*f;
  const fireRate=G.bossPhase===3?220:G.bossHp<G.bossMaxHp*.4?350:G.bossHp<G.bossMaxHp*.6?550:800;
  if(G.bossT%fireRate<20)bossShoot();

  // Phase 2 at 50% HP
  if(G.bossHp<G.bossMaxHp*.5&&G.bossPhase===1){
    G.bossPhase=2;
    SFX.boss_phase2();
    $id('bossPhaseLabel').textContent='PHASE II — ENRAGED';
    toast_('⚠ PHASE 2 ACTIVATED — FULL ASSAULT!');
    shake(15,1.2);
  }
  // Phase 3 at 20% HP — CRITICAL
  if(G.bossHp<G.bossMaxHp*.2&&G.bossPhase===2){
    G.bossPhase=3;
    SFX.boss_phase2();
    $id('bossPhaseLabel').textContent='⚠ PHASE III — CRITICAL BREACH ⚠';
    toast_('☠ PHASE 3 — CRITICAL BREACH!');
    shake(25,2.0);
    // Spawn 3 mini enemies as last resort
    for(let i=0;i<3;i++){
      G.enemies.push({x:G.bossX+rnd(-80,80),bx:G.bossX,y:G.bossY+80,dx:rnd(-2,2),dy:2.5,w:24,h:24,hp:40,maxHp:40,type:'fast',sway:false,elite:true,shotT:500,t:0});
    }
  }
  bossFill.style.width=Math.max(0,G.bossHp/G.bossMaxHp*100)+'%';
  if(G.bossHp<=0)killBoss();
  if(G.frame%8===0&&G.particles.length<250)burst(G.bossX+rnd(-30,30),G.bossY+50,'#ff2244',2);
}

function bossShoot(){
  const dx=G.px-G.bossX,dy=G.py-G.bossY;
  const d=Math.sqrt(dx*dx+dy*dy)||1;
  const sp=G.bossPhase===3?7:5.5;
  const kit=G.bossKit||0;

  if(kit===1){
    // SWEEPING BEAM — a rotating fan of bullets sweeps left-right across the arena
    const sweepA=_sin(G.bossT*.0022)*55*Math.PI/180;
    const count=G.bossPhase===3?5:G.bossPhase===2?4:3;
    for(let i=0;i<count;i++){
      const a=sweepA+(i-(count-1)/2)*10*Math.PI/180;
      G.eBullets.push({x:G.bossX,y:G.bossY+60,dx:_sin(a)*sp,dy:_cos(a)*sp,dmg:G.bossPhase===3?26:18});
    }
  } else if(kit===2){
    // HOMING SALVO — fewer bullets, but they track the player
    const count=G.bossPhase===3?4:G.bossPhase===2?3:2;
    for(let i=0;i<count;i++){
      const a=((i-(count-1)/2)*26)*Math.PI/180;
      G.eBullets.push({x:G.bossX,y:G.bossY+60,dx:(dx/d*Math.cos(a)-dy/d*Math.sin(a))*sp*.7,dy:(dx/d*Math.sin(a)+dy/d*Math.cos(a))*sp*.7,dmg:G.bossPhase===3?24:16,homing:true});
    }
  } else {
    // SPREAD BARRAGE — original wide fan aimed at the player
    const count=G.bossPhase===3?7:G.bossPhase===2?5:3;
    for(let i=0;i<count;i++){
      const a=((i-(count-1)/2)*18)*Math.PI/180;
      G.eBullets.push({x:G.bossX,y:G.bossY+60,dx:(dx/d*Math.cos(a)-dy/d*Math.sin(a))*sp,dy:(dx/d*Math.sin(a)+dy/d*Math.cos(a))*sp,dmg:G.bossPhase===3?30:20});
    }
  }
  // Phase 3 adds a spiral ring shot every other fire, regardless of kit
  if(G.bossPhase===3&&G.bossT%500<30){
    for(let i=0;i<8;i++){
      const a=(i/8)*Math.PI*2;
      G.eBullets.push({x:G.bossX,y:G.bossY+30,dx:Math.cos(a)*4,dy:Math.sin(a)*4,dmg:15});
    }
  }
}

function killBoss(){
  bigBurst(G.bossX,G.bossY);
  SFX.boss_die();
  G.bossOn=false;G.bossKilled=true;bossHUD.classList.remove('on');
  // Track boss kills for achievements
  try{const bk=parseInt(localStorage.getItem('exomniaBossKills')||'0');localStorage.setItem('exomniaBossKills',bk+1);}catch(e){}
  addScore(800*G.wave,G.bossX,G.bossY);addXP(100);
  spawnDrop(G.bossX,G.bossY,'health');
  for(let i=0;i<6;i++)spawnDrop(G.bossX+rnd(-50,50),G.bossY+rnd(-30,30),'coin');
  shake(18,1.2);toast_('🏆 BOSS DESTROYED — WAVE CLEAR!');
  setTimeout(advWave,2000);
}

/* ── BULLET vs BULLET INTERCEPTION ── */
function bulletInterception(){
  for(let i=G.bullets.length-1;i>=0;i--){
    const b=G.bullets[i];
    for(let j=G.eBullets.length-1;j>=0;j--){
      const eb=G.eBullets[j];
      const dx=b.x-eb.x, dy=b.y-eb.y;
      if(dx*dx+dy*dy<12*12){
        // small spark at collision point
        spark((b.x+eb.x)/2,(b.y+eb.y)/2,'#ffffff');
        G.bullets.splice(i,1);
        G.eBullets.splice(j,1);
        break;
      }
    }
  }
}

/* ── COLLISIONS ── */
function bulletHit(){
  for(let i=G.bullets.length-1;i>=0;i--){
    const b=G.bullets[i];let hit=false;
    for(let j=G.enemies.length-1;j>=0;j--){
      const e=G.enemies[j];
      if(rectOverlap(b.x,b.y,b.w,b.h,e.x,e.y,e.w,e.h)){
        e.hp-=b.dmg;spark(b.x,b.y,b.crit?'#ffcc00':b.color);
        if(b.crit)floatText(b.x,b.y,'CRIT!','#ffcc00');
        if(G.coopMode&&!G.coopIsHost&&e.id&&typeof MP!=='undefined'&&MP.reportEnemyHit)MP.reportEnemyHit(e.id,b.dmg,!!b.crit);
        G.bullets.splice(i,1);hit=true;
        if(e.hp<=0)killEnemy(e,j);break;
      }
    }
    if(hit)continue;
    if(G.asteroids){
      let ahit=false;
      for(let k=G.asteroids.length-1;k>=0;k--){
        const a=G.asteroids[k];
        if(hitCircle(b.x,b.y,3,a.x,a.y,a.r)){
          a.hp-=b.dmg;spark(b.x,b.y,'#ffaa55');G.bullets.splice(i,1);ahit=true;
          if(a.hp<=0)addScore(a.big?20:8,a.x,a.y);
          break;
        }
      }
      if(ahit)continue;
    }
    if(G.bossOn&&rectOverlap(b.x,b.y,b.w,b.h,G.bossX,G.bossY,100,80)){
      G.bossHp-=b.dmg;spark(b.x,b.y,b.crit?'#ffcc00':'#ff6644');G.bullets.splice(i,1);
      if(G.coopMode&&!G.coopIsHost&&typeof MP!=='undefined'&&MP.reportBossHit)MP.reportBossHit(b.dmg,!!b.crit);
    }
  }
}

function killEnemy(e,j){
  G.enemies.splice(j,1);G.kills++;
  burst(e.x,e.y,e.elite?'#ff44aa':e.type==='shielded'?'#44aaff':e.type==='mine'?'#ffaa22':'#ff3355',e.type==='tank'||e.type==='shielded'?20:e.type==='mine'?22:11);
  if(e.type==='tank'||e.type==='shielded'||e.elite||e.type==='mine'){SFX.enemy_explode_big();} else {SFX.enemy_explode();}
  const pts=e.elite?100:e.type==='shielded'?70:e.type==='tank'?60:e.type==='turret'?55:e.type==='kamikaze'?40:e.type==='mine'?30:e.type==='fast'?35:25;
  addScore(pts,e.x,e.y);
  addXP(e.elite?35:e.type==='shielded'?26:e.type==='tank'?22:e.type==='turret'?24:e.type==='kamikaze'?18:e.type==='mine'?15:16);
  addCombo();shake(e.type==='tank'||e.type==='shielded'?5:e.type==='mine'?9:3,.6);
  if(e.type==='mine'){
    // Blast radius — chip damage/kill nearby enemies and hurt the player if caught in range
    const R=90;
    for(let k=G.enemies.length-1;k>=0;k--){
      const o=G.enemies[k];if(o===e)continue;
      if(Math.hypot(o.x-e.x,o.y-e.y)<R){o.hp-=60;if(o.hp<=0)killEnemy(o,k);}
    }
    if(G.invT<=0&&Math.hypot(G.px-e.x,G.py-e.y)<R)hitPlayer(28);
  }
  if(Math.random()<.85)spawnDrop(e.x,e.y);
  // Host is the single source of truth for every confirmed kill (its own bullets,
  // or a teammate's hit applied via MP_applyRemoteEnemyHit) — track squad totals here
  // so nothing gets double-counted across clients.
  if(G.coopMode&&G.coopIsHost){G.coopSquadKills=(G.coopSquadKills||0)+1;G.coopSquadScore=(G.coopSquadScore||0)+pts;}
}

/* ═══ CO-OP: apply host's authoritative enemy list (non-host clients only) ═══ */
function MP_syncEnemies(list){
  if(!G.coopMode||G.coopIsHost||!list)return;
  const seen=new Set();
  for(const inc of list){
    seen.add(inc.id);
    let e=G.enemies.find(x=>x.id===inc.id);
    if(!e){
      // newly-seen enemy: create a local mirror with full shape drawEnemy() expects
      G.enemies.push({id:inc.id,x:inc.x,y:inc.y,bx:inc.x,dx:0,dy:0,w:inc.w,h:inc.h,hp:inc.hp,maxHp:inc.maxHp,type:inc.type,elite:inc.elite,sway:false,shotT:0,t:0});
    } else {
      e.x=inc.x;e.y=inc.y;e.hp=inc.hp;
    }
  }
  // anything no longer in the host's list has died — remove locally with a small burst
  for(let i=G.enemies.length-1;i>=0;i--){
    const e=G.enemies[i];
    if(!seen.has(e.id)){
      burst(e.x,e.y,e.elite?'#ff44aa':e.type==='shielded'?'#44aaff':'#ff3355',8);
      G.enemies.splice(i,1);
    }
  }
}

/* ═══ CO-OP: apply wave/boss state broadcast from host (non-host clients only) ═══ */
function MP_syncWaveBossState(state){
  if(!G.coopMode||G.coopIsHost||!state)return;
  if(state.wave!==G.wave)waveEl.textContent=state.wave;
  G.wave=state.wave;G.wMax=state.wMax;G.wSpawned=state.wSpawned;
  G.coopSquadKills=state.squadKills||0;G.coopSquadScore=state.squadScore||0;
  if(state.bossOn&&!G.bossOn){
    bossLbl.textContent='◆ '+state.bossName+' ◆';
    bossHUD.classList.add('on');
  } else if(!state.bossOn&&G.bossOn){
    bossHUD.classList.remove('on');
  }
  G.bossOn=state.bossOn;G.bossName=state.bossName;G.bossHp=state.bossHp;G.bossMaxHp=state.bossMaxHp;
  G.bossPhase=state.bossPhase;G.bossX=state.bossX;G.bossY=state.bossY;
  if(state.bossOn){
    $id('bossPhaseLabel').textContent='PHASE '+(state.bossPhase===3?'III':state.bossPhase===2?'II':'I');
    if(bossFill)bossFill.style.width=Math.max(0,(state.bossHp/state.bossMaxHp)*100)+'%';
  }
}

/* ═══ CO-OP: apply hit reports from teammates (host is authoritative) ═══ */
function MP_applyRemoteEnemyHit(enemyId,dmg,crit){
  if(!G.coopMode||!G.coopIsHost)return;
  const j=G.enemies.findIndex(e=>e.id===enemyId);
  if(j<0)return;
  const e=G.enemies[j];
  e.hp-=dmg;spark(e.x,e.y,crit?'#ffcc00':'#ff3355');
  if(e.hp<=0)killEnemy(e,j);
}
function MP_applyRemoteBossHit(dmg,crit){
  if(!G.coopMode||!G.coopIsHost||!G.bossOn)return;
  G.bossHp-=dmg;spark(G.bossX,G.bossY,crit?'#ffcc00':'#ff6644');
}

function hitPlayer(dmg){
  let d=dmg;
  if(G.activePU.shield){d=0;}
  else if(G.shield>0){
    const absorbed=Math.min(G.shield,d);G.shield-=absorbed;d-=absorbed;
    G.shRegenDelay=3500;updateShieldUI();
  }
  if(d>0){
    G.lives--;hpEl.textContent=G.lives;bumpChip('hpV');
    SFX.player_hit();
    shake(12,1.0);burst(G.px,G.py,'#00e5ff',16);G.invT=2500;
    alertFlash.classList.add('on');setTimeout(()=>alertFlash.classList.remove('on'),180);
    if(G.lives<=0)gameOver();
  } else {
    shake(6,.6);burst(G.px,G.py,'#4488ff',8);
  }
}

/* ── SCORE / XP / COMBO ── */
function fmtNum(n){
  if(n>=1000000)return(n/1000000).toFixed(1)+'M';
  if(n>=10000)return(n/1000).toFixed(1)+'K';
  return n;
}
function addScore(pts,x,y){
  const mult=1+Math.floor(G.combo/5)*.5;
  const total=Math.round(pts*mult);
  G.score+=total;scEl.textContent=fmtNum(G.score);bumpChip('scV');
  if(x!=null)floatText(x,y,'+'+total,'#ffcc00');
}
function addXP(amt){
  G.xp+=amt;
  if(G.xp>=G.xpNeed){G.xp-=G.xpNeed;G.xpNeed=Math.round(G.xpNeed*1.35);G.level++;showLvlUp();}
  xpFill.style.width=Math.min(100,(G.xp/G.xpNeed)*100)+'%';
  lvlBadge.textContent='LVL '+G.level;
}
function addCombo(){
  G.combo++;G.comboT=3200;
  if(G.combo>G.maxCombo)G.maxCombo=G.combo;
  comboBig.textContent='x'+G.combo;
  const mult=1+Math.floor(G.combo/5)*.5;
  $id('comboMult').textContent=mult>1?'×'+mult+' MULTIPLIER':'';
  comboBig.style.animation='none';
  requestAnimationFrame(()=>comboBig.style.animation='');
  comboDiv.classList.add('show');
  if(G.combo===5)toast_('🔥 COMBO x5!');
  if(G.combo===10)toast_('⚡ COMBO x10 — STREAK!');
  if(G.combo===20)toast_('💥 x20 GODLIKE!!');
}

/* ── SPAWN ── */
function spawnEnemy(){
  if(G.wSpawned>=G.wMax||G.over)return;
  const r=Math.random(),w=G.wave;
  let type,hp,spd,ew,eh,sway=false,elite=false;

  // Formation spawn every 5th enemy in wave
  if(G.wSpawned>0&&G.wSpawned%5===0&&w>=2){
    spawnFormation(); return;
  }

  if(r<.08&&w>=3){type='turret';hp=90+w*18;spd=.35;ew=38;eh=38;}          // NEW: drifts down slowly then anchors, doesn't dodge, heavy fire
  else if(r<.15&&w>=4){type='mine';hp=25+w*6;spd=.9;ew=24;eh=24;}          // NEW: floats, doesn't shoot, detonates in a radius on contact/death
  else if(r<.24&&w>=2){type='kamikaze';hp=35+w*8;spd=1.8;ew=26;eh=30;}     // homes in, explodes on contact
  else if(r<.34&&w>=3){type='shielded';hp=160+w*30;spd=.6;ew=42;eh=42;}    // tanky, blue shield visual
  else if(r<.44&&w>=4){type='sniper';hp=60+w*12;spd=.5;ew=26;eh=36;}
  else if(r<.56&&w>=2){type='tank';hp=130+w*35;spd=.7;ew=46;eh=46;}
  else if(r<.74){type='fast';hp=45+w*10;spd=2.5;ew=28;eh=28;sway=true;}
  else{type='normal';hp=65+w*20;spd=1.3;ew=34;eh=34;}
  if(w>=3&&Math.random()<.22){elite=true;hp=Math.round(hp*2);}
  const bx=rnd(50,CV.width-50);
  const enemyObj={id:'e'+(G.coopEnemyIdSeq++),x:bx,bx,y:-60,dx:type==='turret'?0:(Math.random()-.5)*1.8,dy:spd,w:ew,h:eh,hp,maxHp:hp,type,sway,elite,shotT:rnd(400,2200),t:0};
  if(type==='turret'){enemyObj.anchorY=rnd(90,180);enemyObj.anchored=false;}
  G.enemies.push(enemyObj);
  G.wSpawned++;
}

function spawnFormation(){
  // V-shape formation of 3 fast enemies
  const cx=rnd(80,CV.width-80);
  const positions=[{ox:0,oy:0},{ox:-45,oy:30},{ox:45,oy:30}];
  const w=G.wave;
  for(const p of positions){
    const hp=40+w*8;
    G.enemies.push({id:'e'+(G.coopEnemyIdSeq++),x:cx+p.ox,bx:cx+p.ox,y:-60+p.oy,dx:(Math.random()-.5)*1.2,dy:2.0,w:28,h:28,hp,maxHp:hp,type:'fast',sway:false,elite:false,shotT:rnd(600,2000),t:0,formation:true});
  }
  G.wSpawned+=3;
}

function spawnBoss(){
  const names=['DESTROYER','NEMESIS','VOIDLORD','ANNIHILATOR','OBLIVION','REAPER','APOCALYPSE'];
  const kitNames=['SPREAD BARRAGE','SWEEPING BEAM','HOMING SALVO'];
  G.bossName=names[Math.min(Math.floor(G.wave/3)-1,names.length-1)]||'DESTROYER';
  G.bossKit=Math.max(0,Math.floor(G.wave/3)-1)%3;
  G.bossHp=1000+G.wave*300;G.bossMaxHp=G.bossHp;
  G.bossX=CV.width/2;G.bossY=110;G.bossDir=1;G.bossT=0;G.bossPhase=1;
  G.bossOn=true;
  SFX.boss_spawn();
  bossLbl.textContent='◆ '+G.bossName+' ◆';
  $id('bossPhaseLabel').textContent='PHASE I';
  bossHUD.classList.add('on');shake(20,1.5);
  toast_('☠ WARNING: '+G.bossName+' INCOMING — '+kitNames[G.bossKit]+'!');
}

function advWave(){
  // Perfect wave = wave completed without losing any HP (shield still at max)
  if(G.shield>=G.shMax&&G.lives>=3){
    try{const pw=parseInt(localStorage.getItem('exomniaPerfectWaves')||'0');localStorage.setItem('exomniaPerfectWaves',pw+1);}catch(e){}
  }
  G.wave++;G.wSpawned=0;G.wMax=10+G.wave*3;G.bossKilled=false;
  SFX.wave_start();
  waveEl.textContent=G.wave;toast_('◈ WAVE '+G.wave+' — COMMENCE!');
  refreshBiomeIfChanged();
}

/* ── DROPS ── */
function spawnDrop(x,y,forced){
  const r=Math.random();
  const type=forced||(r<.60?'coin':r<.72?'health':r<.80?'triple':r<.88?'rapid':r<.94?'timeslow':'powerfull');
  G.drops.push({x,y,type,t:0});
}
function pickDrop(d){
  if(d.type==='coin'){
    const streak=G._coinStreak||0;
    const bonus=Math.min(streak,5);
    const amt=Math.floor(Math.random()*2)+2+bonus;
    G._coinStreak=(streak||0)+1;
    G.coins+=amt;coEl.textContent=fmtNum(G.coins);addScore(10*amt);
    floatText(d.x,d.y,streak>=3?'◈ +'+amt+' STREAK!':'◈ +'+amt+' COINS','#00ff88');
    SFX.pickup_coin();
  }
  else if(d.type==='health'){G.lives=Math.min(6,G.lives+1);hpEl.textContent=G.lives;floatText(d.x,d.y,'+ HP','#ff4488');SFX.pickup_health();}
  else if(d.type==='triple'){G.activePU.triple=7000;floatText(d.x,d.y,'✦ TRIPLE','#00e5ff');SFX.pickup_powerup();}
  else if(d.type==='rapid'){G.activePU.rapid=6000;floatText(d.x,d.y,'⚡ RAPID','#ffcc00');SFX.pickup_powerup();}
  else if(d.type==='shield'){G.activePU.shield=5000;floatText(d.x,d.y,'◉ INVULN','#44aaff');SFX.pickup_powerup();}
  else if(d.type==='powerfull'){G.activePU.powerfull=6000;floatText(d.x,d.y,'▲ POWER','#ff6600');SFX.pickup_powerup();}
  else if(d.type==='timeslow'){G.activePU.timeslow=5000;floatText(d.x,d.y,'⏱ TIME SLOW','#cc44ff');SFX.pickup_powerup();toast_('⏱ TIME DILATION ACTIVE!');}
  burst(d.x,d.y,'#00ff88',8);
}

/* ── SPECIAL ── */
function doSpecial(){
  if(!G.spReady||!G.alive||G.paused||G.over)return;
  G.spReady=false;G.spCD=G.spMax;spBtn.style.opacity='.3';
  SFX.special_nova();
  bigBurst(CV.width/2,CV.height/2);shake(25,1.8);
  for(const e of G.enemies){burst(e.x,e.y,'#aa00ff',10);addScore(40,e.x,e.y);addXP(10);}
  G.enemies=[];G.wSpawned=G.wMax;
  if(G.bossOn)G.bossHp-=500;
  G.eBullets=[];toast_('✨ NOVA STRIKE — SECTOR CLEARED!');
}

function cycleWeapon(){
  const indices=getShipWeaponIndices();
  if(indices.length===0)return;
  const cur=indices.indexOf(G.wIdx);
  G.wIdx=indices[(cur+1)%indices.length];
  toast_('⟳ WEAPON: '+WEAPONS[G.wIdx].name);updateWeaponHUD();
}

function showLvlUp(){
  SFX.level_up();
  // update card level badges
  const lvls={damage:'dmgLvl',fireRate:'rateLvl',speed:'spdLvl',critical:'critLvl',shield:'shdLvl'};
  for(const[k,id]of Object.entries(lvls))$id(id).textContent='LVL '+G.sk[k];
  lvlUp.classList.add('on');G.paused=true;
}
function upgrade(type){
  G.sk[type]++;lvlUp.classList.remove('on');G.paused=false;
  updateSkillDots();toast_('▲ '+type.toUpperCase()+' UPGRADED!');
  if(type==='shield'){G.shMax+=20;G.shield=Math.min(G.shield+20,G.shMax);}
}

async function gameOver(){
  G.over=true;G.alive=false;
  SFX.game_over();
  $id('endTitle').textContent='GAME OVER';$id('endTitle').className='lose';
  $id('eWave').textContent=G.wave;$id('eScore').textContent=G.score;
  $id('eKills').textContent=G.kills;$id('eCombo').textContent=G.maxCombo;
  endScreen.classList.add('on');
  // ── Save stats to localStorage ──
  try{
    const prevBest=parseInt(localStorage.getItem('exomniaBestScore')||'0');
    const prevWave=parseInt(localStorage.getItem('exomniaBestWave')||'0');
    const prevKills=parseInt(localStorage.getItem('exomniaTotalKills')||'0');
    const prevGames=parseInt(localStorage.getItem('exomniaGames')||'0');
    const prevCoins=parseInt(localStorage.getItem('exomniaTotalCoins')||'0');
    if(G.score>prevBest)localStorage.setItem('exomniaBestScore',G.score);
    if(G.wave>prevWave)localStorage.setItem('exomniaBestWave',G.wave);
    localStorage.setItem('exomniaTotalKills',prevKills+G.kills);
    localStorage.setItem('exomniaGames',prevGames+1);
    localStorage.setItem('exomniaTotalCoins',prevCoins+G.coins);

    // ── "Near miss" / new-best motivational message ──
    const nmEl=$id('eNearMissMsg');
    if(nmEl){
      nmEl.style.display='none';
      if(prevBest>0){
        if(G.score>prevBest){
          nmEl.textContent='🎉 NEW PERSONAL BEST! Previous record: '+prevBest;
          nmEl.style.cssText+='display:block;color:#00ff8c;border:1px solid rgba(0,255,140,0.4);background:rgba(0,255,140,0.06);';
        } else {
          const gap=prevBest-G.score;
          if(gap>0 && gap<=Math.max(300,Math.round(prevBest*0.08))){
            nmEl.textContent='😤 SO CLOSE! Only '+gap+' points from your best of '+prevBest+' — try again!';
            nmEl.style.cssText+='display:block;color:#ffcc00;border:1px solid rgba(255,204,0,0.4);background:rgba(255,204,0,0.06);';
          }
        }
      }
    }
  }catch(e){}
  // ── Save to server and wait ──
  await API.saveRun();
}

function showEndLeaderboard(){
  // Show leaderboard overlay (reuses API.showLeaderboard)
  if(typeof API !== 'undefined') API.showLeaderboard();
}

/* ═══ DRAW ═══ */
function draw(){
  const sw=G.shakeAmt>0;
  if(sw){CX.save();CX.translate(rnd(-G.shakeAmt,G.shakeAmt),rnd(-G.shakeAmt*.5,G.shakeAmt*.5));}
  CX.clearRect(0,0,CV.width,CV.height);
  // Biome gradient base — swaps palette as the player advances through waves
  const _bm=getBiome();
  const _bg=CX.createRadialGradient(CV.width*.45,CV.height*.35,0,CV.width*.45,CV.height*.35,Math.max(CV.width,CV.height)*.9);
  _bg.addColorStop(0,_bm.bgIn);_bg.addColorStop(.5,_bm.bgMid);_bg.addColorStop(1,_bm.bgOut);
  CX.fillStyle=_bg;CX.fillRect(0,0,CV.width,CV.height);
  if(_bm.fogCol){CX.fillStyle=_bm.fogCol;CX.fillRect(0,0,CV.width,CV.height);}

  // nebulae - pulsing color clouds
  if(G.frame%2===0){for(const n of G.nebulae){
    const pulse=.85+Math.sin(n.pulse)*.15;
    const g=CX.createRadialGradient(n.x,n.y,8,n.x,n.y,n.r*pulse);
    g.addColorStop(0,n.c+','+(n.alpha*1.8)+')');g.addColorStop(.5,n.c+','+n.alpha+')');g.addColorStop(1,'transparent');
    CX.fillStyle=g;CX.beginPath();CX.arc(n.x,n.y,n.r*pulse,0,Math.PI*2);CX.fill();
  }}

  // Shooting stars
  if(G.shootingStars){for(const ss of G.shootingStars){
    const a=ss.life/ss.ml;
    for(let i=1;i<ss.trail.length;i++){
      CX.globalAlpha=(i/ss.trail.length)*a*.6;CX.strokeStyle='#ffffff';CX.lineWidth=1.2*(i/ss.trail.length);
      CX.beginPath();CX.moveTo(ss.trail[i-1].x,ss.trail[i-1].y);CX.lineTo(ss.trail[i].x,ss.trail[i].y);CX.stroke();
    }
    CX.globalAlpha=a;CX.shadowBlur=8;CX.shadowColor='#aaddff';CX.fillStyle='#fff';
    CX.beginPath();CX.arc(ss.x,ss.y,1.5,0,Math.PI*2);CX.fill();
    CX.shadowBlur=0;CX.globalAlpha=1;
  }}

  // stars with twinkle
  const t=G._t||0;
  drawStars(G.stars1,.55,t);
  drawStars(G.stars2,.8,t);
  drawStars(G.stars3,1.0,t);

  for(const d of G.drops)drawDrop(d);
  if(G.asteroids){for(const a of G.asteroids)drawAsteroid(a);}
  // railgun beams
  if(G.railBeams){for(const rb of G.railBeams){
    const a=rb.life/200;
    glow(rb.color,20);
    CX.globalAlpha=Math.max(0,a);
    CX.strokeStyle=rb.color;
    if(rb.chain){
      // chain lightning — jagged line between two points
      CX.lineWidth=3;
      CX.beginPath();CX.moveTo(rb.x,rb.y);
      const steps=6;
      for(let s=1;s<steps;s++){
        const t=s/steps;
        const jx=rb.x+(rb.x2-rb.x)*t+rnd(-12,12);
        const jy=rb.y+(rb.y2-rb.y)*t+rnd(-12,12);
        CX.lineTo(jx,jy);
      }
      CX.lineTo(rb.x2,rb.y2);CX.stroke();
      CX.strokeStyle='#ffffff';CX.lineWidth=1;
      CX.beginPath();CX.moveTo(rb.x,rb.y);CX.lineTo(rb.x2,rb.y2);CX.stroke();
    } else {
      CX.lineWidth=4;
      CX.beginPath();CX.moveTo(rb.x,0);CX.lineTo(rb.x,rb.h);CX.stroke();
      CX.strokeStyle='#ffffff';CX.lineWidth=1.5;
      CX.beginPath();CX.moveTo(rb.x,0);CX.lineTo(rb.x,rb.h);CX.stroke();
    }
    CX.globalAlpha=1;noGlow();
  }}
  // emp/nuke blasts
  if(G.empBlasts){for(const eb of G.empBlasts){
    const a=(eb.life/(eb.life+1))*.6;
    glow(eb.color,22);
    CX.globalAlpha=Math.max(0,a*(eb.life/400));
    CX.strokeStyle=eb.color;CX.lineWidth=3;
    CX.beginPath();CX.arc(eb.x,eb.y,eb.r,0,Math.PI*2);CX.stroke();
    CX.globalAlpha=Math.max(0,a*(eb.life/400)*.25);
    CX.fillStyle=eb.color;
    CX.beginPath();CX.arc(eb.x,eb.y,eb.r,0,Math.PI*2);CX.fill();
    CX.globalAlpha=1;noGlow();
  }}
  for(const e of G.enemies)drawEnemy(e);
  if(G.bossOn)drawBoss();
  for(const b of G.bullets)drawBullet(b);
  for(const b of G.eBullets)drawEBullet(b);
  drawPlayer();
  if(G.wingmanOn)drawWingman();
  if(G.coopMode&&typeof MP!=='undefined'&&MP.drawRemotePlayers)MP.drawRemotePlayers(CX);

  // draw particles - batched by color
  if(G.particles.length){
    CX.shadowBlur=0;
    // sort once per few frames to batch colors
    if(G.frame%4===0)G.particles.sort((a,b)=>a.c<b.c?-1:1);
    let lastC='';
    for(const p of G.particles){
      const a=p.life/p.ml;
      if(a<0.02)continue;
      if(p.c!==lastC){CX.fillStyle=p.c;lastC=p.c;}
      CX.globalAlpha=a;
      CX.fillRect(p.x-p.r,p.y-p.r,p.r*2,p.r*2);
    }
    CX.globalAlpha=1;
  }
  if(sw)CX.restore();
  drawFloatTexts(G.dt/16);
}

function drawStars(arr,maxA,t){
  for(const s of arr){
    const twinkle=s.r>0.8?(.72+Math.sin(t*s.twinkleSpd+s.twinkleOff)*.28):.8;
    CX.globalAlpha=s.a*maxA*twinkle;
    CX.fillStyle=s.col||'#ffffff';
    CX.fillRect(s.x-s.r,s.y-s.r,s.r*2,s.r*2);
    // lens flare on big bright stars
    if(s.flare&&s.r>1&&twinkle>.9){
      const fl=s.r*4*twinkle;
      CX.globalAlpha=s.a*maxA*twinkle*.25;
      CX.fillRect(s.x-fl,s.y-s.r*.3,fl*2,s.r*.6);
      CX.fillRect(s.x-s.r*.3,s.y-fl,s.r*.6,fl*2);
    }
  }
  CX.globalAlpha=1;
}

function drawWingman(){
  const x=G.wingmanX,y=G.wingmanY,t=G._t||0;
  const col='#00ff8c';
  glow(col,10);
  // small diamond-body drone with a single thruster
  CX.fillStyle='#0a1a14';
  CX.beginPath();
  CX.moveTo(x,y-11);CX.lineTo(x+8,y);CX.lineTo(x,y+9);CX.lineTo(x-8,y);CX.closePath();
  CX.fill();
  CX.strokeStyle=col;CX.lineWidth=1.2;CX.stroke();
  // cockpit glow
  const cg=CX.createRadialGradient(x,y-2,1,x,y-2,5);
  cg.addColorStop(0,'rgba(150,255,220,0.95)');cg.addColorStop(1,'rgba(0,255,140,0)');
  CX.fillStyle=cg;CX.beginPath();CX.arc(x,y-2,5,0,Math.PI*2);CX.fill();
  // thruster flicker
  const tl=6+Math.sin(t*20)*2;
  const tg=CX.createLinearGradient(x,y+9,x,y+9+tl);
  tg.addColorStop(0,'rgba(0,255,140,0.9)');tg.addColorStop(1,'rgba(0,255,140,0)');
  CX.fillStyle=tg;
  CX.beginPath();CX.moveTo(x-3,y+9);CX.lineTo(x,y+9+tl);CX.lineTo(x+3,y+9);CX.closePath();CX.fill();
  noGlow();
}

function drawPlayer(){
  const x=G.px,y=G.py,w=G.pw,h=G.ph;
  const blink=G.invT>0&&Math.sin(G._t*25)>0;
  if(blink)return;

  // Get selected ship data
  const shipIdx=G._shipIdx||0;
  const ship=PILOT_SHIPS[shipIdx]||PILOT_SHIPS[0];
  const col=ship.color;
  const acc=ship.accent;

  // engine glow halo (color matches ship)
  const eg=CX.createRadialGradient(x,y+h*.5,1,x,y+h*.5,h*.65);
  eg.addColorStop(0,'rgba(0,140,255,0.45)');eg.addColorStop(.6,'rgba(0,40,120,0.15)');eg.addColorStop(1,'rgba(0,0,0,0)');
  CX.fillStyle=eg;CX.beginPath();CX.ellipse(x,y+h*.5,w*.45,h*.55,0,0,Math.PI*2);CX.fill();

  // shield aura
  if(G.activePU.shield){
    const tms=Date.now();
    CX.globalAlpha=.25+Math.sin(tms*.005)*.12;
    CX.strokeStyle='#44aaff';CX.lineWidth=2.5;
    glow('#44aaff',22);
    CX.beginPath();CX.arc(x,y,w*.85,0,Math.PI*2);CX.stroke();
    CX.globalAlpha=.1+Math.sin(tms*.008)*.05;
    CX.beginPath();CX.arc(x,y,w*.95,0,Math.PI*2);CX.stroke();
    CX.globalAlpha=1;noGlow();
  }

  // hull shadow
  CX.fillStyle='rgba(0,0,0,0.4)';
  CX.beginPath();CX.ellipse(x+4,y+6,w*.38,h*.28,0,0,Math.PI*2);CX.fill();

  glow(col,14);

  if(ship.type==='wraith'){
    // WRAITH — slim interceptor, narrow hull, swept wings
    CX.fillStyle='#1a0030';
    CX.beginPath();CX.moveTo(x,y-h*.52);CX.bezierCurveTo(x+w*.28,y-h*.1,x+w*.28,y+h*.15,x+w*.14,y+h*.45);CX.lineTo(x-w*.14,y+h*.45);CX.bezierCurveTo(x-w*.28,y+h*.15,x-w*.28,y-h*.1,x,y-h*.52);CX.fill();
    CX.fillStyle='#250045';
    CX.beginPath();CX.moveTo(x+w*.12,y+h*.1);CX.lineTo(x+w*.7,y+h*.5);CX.lineTo(x+w*.4,y+h*.48);CX.lineTo(x+w*.1,y+h*.22);CX.closePath();CX.fill();
    CX.beginPath();CX.moveTo(x-w*.12,y+h*.1);CX.lineTo(x-w*.7,y+h*.5);CX.lineTo(x-w*.4,y+h*.48);CX.lineTo(x-w*.1,y+h*.22);CX.closePath();CX.fill();
    CX.strokeStyle=col+'88';CX.lineWidth=1;
    CX.beginPath();CX.moveTo(x+w*.12,y+h*.1);CX.lineTo(x+w*.7,y+h*.5);CX.stroke();
    CX.beginPath();CX.moveTo(x-w*.12,y+h*.1);CX.lineTo(x-w*.7,y+h*.5);CX.stroke();
    // cockpit
    const cg=CX.createRadialGradient(x,y-h*.2,1,x,y-h*.2,w*.14);
    cg.addColorStop(0,col);cg.addColorStop(1,'rgba(200,0,255,0)');
    CX.fillStyle=cg;CX.beginPath();CX.ellipse(x,y-h*.2,w*.1,h*.1,0,0,Math.PI*2);CX.fill();
    // spine
    CX.strokeStyle=col+'88';CX.lineWidth=1;
    CX.beginPath();CX.moveTo(x,y-h*.52);CX.lineTo(x,y+h*.4);CX.stroke();

  } else if(ship.type==='titan'){
    // TITAN — wide boxy gunship
    CX.fillStyle='#1a0a00';
    CX.beginPath();CX.moveTo(x,y-h*.42);CX.bezierCurveTo(x+w*.42,y-h*.08,x+w*.44,y+h*.12,x+w*.3,y+h*.42);CX.lineTo(x-w*.3,y+h*.42);CX.bezierCurveTo(x-w*.44,y+h*.12,x-w*.42,y-h*.08,x,y-h*.42);CX.fill();
    CX.fillStyle='#2a1000';
    CX.beginPath();CX.moveTo(x+w*.28,y+h*.05);CX.lineTo(x+w*.85,y+h*.4);CX.lineTo(x+w*.5,y+h*.42);CX.lineTo(x+w*.22,y+h*.2);CX.closePath();CX.fill();
    CX.beginPath();CX.moveTo(x-w*.28,y+h*.05);CX.lineTo(x-w*.85,y+h*.4);CX.lineTo(x-w*.5,y+h*.42);CX.lineTo(x-w*.22,y+h*.2);CX.closePath();CX.fill();
    // gun pods
    CX.fillStyle=col+'aa';CX.fillRect(x+w*.18-2,y+h*.2,4,h*.22);CX.fillRect(x-w*.18-2,y+h*.2,4,h*.22);
    CX.strokeStyle=col+'66';CX.lineWidth=1;
    CX.beginPath();CX.moveTo(x+w*.28,y+h*.05);CX.lineTo(x+w*.85,y+h*.4);CX.stroke();
    CX.beginPath();CX.moveTo(x-w*.28,y+h*.05);CX.lineTo(x-w*.85,y+h*.4);CX.stroke();
    // cockpit
    const cg=CX.createRadialGradient(x,y-h*.1,2,x,y-h*.1,w*.18);
    cg.addColorStop(0,col);cg.addColorStop(1,'rgba(255,136,0,0)');
    CX.fillStyle=cg;CX.beginPath();CX.ellipse(x,y-h*.1,w*.14,h*.12,0,0,Math.PI*2);CX.fill();

  } else if(ship.type==='phantom'){
    // PHANTOM — ultra-slim stealth
    CX.fillStyle='#001a10';
    CX.beginPath();CX.moveTo(x,y-h*.58);CX.bezierCurveTo(x+w*.22,y-h*.08,x+w*.2,y+h*.15,x+w*.1,y+h*.44);CX.lineTo(x-w*.1,y+h*.44);CX.bezierCurveTo(x-w*.2,y+h*.15,x-w*.22,y-h*.08,x,y-h*.58);CX.fill();
    CX.fillStyle='#003020';
    CX.beginPath();CX.moveTo(x+w*.08,y+h*.08);CX.lineTo(x+w*.75,y+h*.46);CX.lineTo(x+w*.38,y+h*.45);CX.lineTo(x+w*.06,y+h*.22);CX.closePath();CX.fill();
    CX.beginPath();CX.moveTo(x-w*.08,y+h*.08);CX.lineTo(x-w*.75,y+h*.46);CX.lineTo(x-w*.38,y+h*.45);CX.lineTo(x-w*.06,y+h*.22);CX.closePath();CX.fill();
    CX.strokeStyle=col+'55';CX.lineWidth=0.8;
    CX.beginPath();CX.moveTo(x+w*.08,y+h*.08);CX.lineTo(x+w*.75,y+h*.46);CX.stroke();
    CX.beginPath();CX.moveTo(x-w*.08,y+h*.08);CX.lineTo(x-w*.75,y+h*.46);CX.stroke();
    // spine
    CX.strokeStyle=col+'66';CX.lineWidth=1;
    CX.beginPath();CX.moveTo(x,y-h*.58);CX.lineTo(x,y+h*.4);CX.stroke();
    // cockpit
    const cg=CX.createRadialGradient(x,y-h*.22,1,x,y-h*.22,w*.13);
    cg.addColorStop(0,col);cg.addColorStop(1,'rgba(0,255,140,0)');
    CX.fillStyle=cg;CX.beginPath();CX.ellipse(x,y-h*.22,w*.09,h*.09,0,0,Math.PI*2);CX.fill();

  } else if(ship.type==='nova'){
    // NOVA — heavy destroyer with multiple gun barrels
    CX.fillStyle='#200010';
    CX.beginPath();CX.moveTo(x,y-h*.48);CX.bezierCurveTo(x+w*.46,y-h*.06,x+w*.48,y+h*.14,x+w*.32,y+h*.44);CX.lineTo(x-w*.32,y+h*.44);CX.bezierCurveTo(x-w*.48,y+h*.14,x-w*.46,y-h*.06,x,y-h*.48);CX.fill();
    CX.fillStyle='#380020';
    CX.beginPath();CX.moveTo(x+w*.3,y+h*.04);CX.lineTo(x+w*.9,y+h*.42);CX.lineTo(x+w*.52,y+h*.44);CX.lineTo(x+w*.24,y+h*.18);CX.closePath();CX.fill();
    CX.beginPath();CX.moveTo(x-w*.3,y+h*.04);CX.lineTo(x-w*.9,y+h*.42);CX.lineTo(x-w*.52,y+h*.44);CX.lineTo(x-w*.24,y+h*.18);CX.closePath();CX.fill();
    // multi-gun barrels
    CX.fillStyle=col+'cc';
    CX.fillRect(x+w*.22-2,y+h*.15,3,h*.26);CX.fillRect(x-w*.22-2,y+h*.15,3,h*.26);
    CX.fillRect(x+w*.36-2,y+h*.22,3,h*.2);CX.fillRect(x-w*.36-2,y+h*.22,3,h*.2);
    CX.strokeStyle=col+'66';CX.lineWidth=1;
    CX.beginPath();CX.moveTo(x+w*.3,y+h*.04);CX.lineTo(x+w*.9,y+h*.42);CX.stroke();
    CX.beginPath();CX.moveTo(x-w*.3,y+h*.04);CX.lineTo(x-w*.9,y+h*.42);CX.stroke();
    // cockpit
    const cg=CX.createRadialGradient(x,y-h*.12,2,x,y-h*.12,w*.2);
    cg.addColorStop(0,col);cg.addColorStop(1,'rgba(255,0,80,0)');
    CX.fillStyle=cg;CX.beginPath();CX.ellipse(x,y-h*.12,w*.16,h*.14,0,0,Math.PI*2);CX.fill();

  } else {
    // VIPER (default) — balanced fighter
    CX.fillStyle='#061e3c';
    CX.beginPath();
    CX.moveTo(x,y-h*.52);
    CX.bezierCurveTo(x+w*.36,y-h*.1,x+w*.36,y+h*.1,x+w*.22,y+h*.4);
    CX.lineTo(x-w*.22,y+h*.4);
    CX.bezierCurveTo(x-w*.36,y+h*.1,x-w*.36,y-h*.1,x,y-h*.52);
    CX.fill();
    // hull highlight
    CX.fillStyle='rgba(0,229,255,0.06)';
    CX.beginPath();CX.moveTo(x,y-h*.52);CX.bezierCurveTo(x+w*.18,y-h*.3,x+w*.18,y,x+w*.05,y+h*.2);CX.lineTo(x,y-h*.52);CX.fill();
    // spine
    CX.strokeStyle='rgba(0,229,255,0.5)';CX.lineWidth=1.2;
    CX.beginPath();CX.moveTo(x,y-h*.52);CX.lineTo(x,y+h*.35);CX.stroke();
    // wings
    CX.fillStyle='#0a2e5a';
    CX.beginPath();CX.moveTo(x+w*.2,y);CX.lineTo(x+w*.65,y+h*.44);CX.lineTo(x+w*.4,y+h*.44);CX.lineTo(x+w*.16,y+h*.18);CX.closePath();CX.fill();
    CX.beginPath();CX.moveTo(x-w*.2,y);CX.lineTo(x-w*.65,y+h*.44);CX.lineTo(x-w*.4,y+h*.44);CX.lineTo(x-w*.16,y+h*.18);CX.closePath();CX.fill();
    CX.fillStyle='rgba(0,229,255,0.04)';
    CX.beginPath();CX.moveTo(x+w*.2,y);CX.lineTo(x+w*.65,y+h*.44);CX.lineTo(x+w*.42,y+h*.44);CX.closePath();CX.fill();
    CX.strokeStyle='rgba(0,229,255,0.35)';CX.lineWidth=1;
    CX.beginPath();CX.moveTo(x+w*.2,y);CX.lineTo(x+w*.6,y+h*.42);CX.stroke();
    CX.beginPath();CX.moveTo(x-w*.2,y);CX.lineTo(x-w*.6,y+h*.42);CX.stroke();
    // cockpit
    const cg=CX.createRadialGradient(x,y-h*.18,1,x,y-h*.18,w*.16);
    cg.addColorStop(0,'rgba(0,229,255,0.97)');cg.addColorStop(.55,'rgba(0,130,220,0.55)');cg.addColorStop(1,'rgba(0,80,200,0.08)');
    CX.fillStyle=cg;CX.beginPath();CX.ellipse(x,y-h*.18,w*.12,h*.2,0,0,Math.PI*2);CX.fill();
    CX.fillStyle='rgba(255,255,255,0.4)';
    CX.beginPath();CX.ellipse(x-w*.04,y-h*.23,w*.04,h*.05,-.4,0,Math.PI*2);CX.fill();
  }

  // weapon stripe (all ships)
  const wc2=WEAPONS[G.wIdx].color;
  CX.strokeStyle=wc2;CX.lineWidth=1.5;CX.globalAlpha=.55;
  CX.beginPath();CX.moveTo(x+w*.14,y-h*.05);CX.lineTo(x+w*.34,y+h*.35);CX.stroke();
  CX.beginPath();CX.moveTo(x-w*.14,y-h*.05);CX.lineTo(x-w*.34,y+h*.35);CX.stroke();
  CX.globalAlpha=1;

  // gun barrels (all ships)
  CX.fillStyle='rgba(0,229,255,0.15)';
  CX.fillRect(x+w*.12-1,y-h*.5,2,8);
  CX.fillRect(x-w*.12-1,y-h*.5,2,8);

  // engine flames
  const ft=G._t*1000||0;
  drawFlame(x,y+h*.42,ft,0,col);
  if(G.activePU.triple){drawFlame(x+w*.22,y+h*.38,ft,200,col);drawFlame(x-w*.22,y+h*.38,ft,400,col);}
  noGlow();
}

function drawFlame(x,y,t,off,shipCol){
  const fl=16+Math.sin((t+off)*.016)*8+Math.sin((t+off)*.031)*4;
  const wColor=WEAPONS[G.wIdx].color;
  const fg=CX.createLinearGradient(x,y,x,y+fl+10);
  fg.addColorStop(0,'rgba(200,235,255,0.98)');
  fg.addColorStop(.2,shipCol?shipCol+'dd':'rgba(100,200,255,0.85)');
  fg.addColorStop(.6,shipCol?shipCol+'88':'rgba(0,100,255,0.5)');
  fg.addColorStop(1,'rgba(0,30,120,0)');
  CX.fillStyle=fg;
  CX.beginPath();
  CX.moveTo(x-7,y);CX.quadraticCurveTo(x+rnd(-2,2),y+fl*.55,x,y+fl);CX.quadraticCurveTo(x+rnd(-2,2),y+fl*.55,x+7,y);CX.closePath();
  CX.fill();
  // inner core
  const fg2=CX.createLinearGradient(x,y,x,y+fl*.6);
  fg2.addColorStop(0,'rgba(255,255,255,0.9)');fg2.addColorStop(1,'transparent');
  CX.fillStyle=fg2;
  CX.beginPath();CX.moveTo(x-3,y);CX.quadraticCurveTo(x,y+fl*.4,x,y+fl*.55);CX.quadraticCurveTo(x,y+fl*.4,x+3,y);CX.closePath();
  CX.fill();
}

function drawEnemy(e){
  const x=e.x,y=e.y;
  if(y<-e.h-20||y>CV.height+e.h+20)return;
  const hp=e.hp/e.maxHp;
  const t=G._t||0;
  CX.globalAlpha=.5+hp*.5;

  if(e.type==='tank'||e.type==='shielded'){
    drawEnemyTank(x,y,e,hp,t);
  } else if(e.type==='fast'||e.type==='kamikaze'){
    drawEnemyFast(x,y,e,hp,t);
  } else if(e.type==='turret'){
    drawEnemyTurret(x,y,e,hp,t);
  } else if(e.type==='mine'){
    drawEnemyMine(x,y,e,hp,t);
  } else {
    drawEnemyNormal(x,y,e,hp,t);
  }

  // hp bar
  CX.globalAlpha=1;
  const bw=e.w*.9,bx=x-bw/2,by=y-e.h/2-8;
  CX.fillStyle='rgba(0,0,0,0.5)';CX.fillRect(bx,by,bw,3);
  const hcol=hp>.6?(e.elite?'#ff44aa':'#ff6600'):hp>.3?'#ffaa00':'#ff2244';
  CX.fillStyle=hcol;CX.fillRect(bx,by,bw*hp,3);
}

/* ── TURRET: stationary emplacement, drifts down then plants and fires a wide spread ── */
function drawEnemyTurret(x,y,e,hp,t){
  const w=e.w,h=e.h;
  const col=e.anchored?'#ff6622':'#886644';
  glow(col,e.anchored?14:6);
  // base platform
  CX.fillStyle='#2a2420';
  CX.beginPath();CX.ellipse(x,y+h*.25,w*.48,h*.3,0,0,Math.PI*2);CX.fill();
  CX.strokeStyle=col+'aa';CX.lineWidth=1.5;CX.stroke();
  // turret dome
  CX.fillStyle='#3a3128';
  CX.beginPath();CX.arc(x,y,w*.32,Math.PI,0);CX.fill();
  CX.strokeStyle=col;CX.lineWidth=1.5;CX.stroke();
  // barrel — rotates slowly to track player when anchored
  const barrelAng=e.anchored?Math.atan2(G.py-y,G.px-x):Math.PI/2;
  CX.save();CX.translate(x,y-h*.05);CX.rotate(barrelAng-Math.PI/2);
  CX.fillStyle=col;CX.fillRect(-3,0,6,h*.4);
  CX.restore();
  // core light — pulses faster once armed
  const pulse=e.anchored?(.6+Math.sin(t*8)*.4):.3;
  CX.globalAlpha=pulse;CX.fillStyle=col;
  CX.beginPath();CX.arc(x,y-h*.05,4,0,Math.PI*2);CX.fill();
  CX.globalAlpha=.5+hp*.5;
  noGlow();
}

/* ── MINE: slow drifting orb, doesn't shoot, detonates in a blast radius ── */
function drawEnemyMine(x,y,e,hp,t){
  const r=e.w*.42;
  const pulse=.7+Math.sin(t*6+e.t*.01)*.3;
  glow('#ffaa22',10*pulse);
  CX.fillStyle='#3a2a10';
  CX.beginPath();CX.arc(x,y,r,0,Math.PI*2);CX.fill();
  CX.strokeStyle='#ffaa22';CX.lineWidth=2;CX.stroke();
  // spikes
  CX.strokeStyle='#ffaa22';CX.lineWidth=2;
  for(let i=0;i<8;i++){
    const ang=(i/8)*Math.PI*2+t*.5;
    CX.beginPath();CX.moveTo(x+Math.cos(ang)*r,y+Math.sin(ang)*r);CX.lineTo(x+Math.cos(ang)*r*1.5,y+Math.sin(ang)*r*1.5);CX.stroke();
  }
  // blinking core
  CX.globalAlpha=pulse;CX.fillStyle='#ffcc44';
  CX.beginPath();CX.arc(x,y,r*.35,0,Math.PI*2);CX.fill();
  CX.globalAlpha=.5+hp*.5;
  noGlow();
}

/* ── TANK ENEMY: Heavy armored cruiser ── */
function drawEnemyTank(x,y,e,hp,t){
  const w=e.w,h=e.h;
  const shd=e.type==='shielded';
  const col=e.elite?'#ff44aa':shd?'#3aa0ff':'#ff6600';
  const dark=e.elite?'#1a0010':shd?'#001428':'#1a0800';
  const mid=e.elite?'#3a0022':shd?'#002850':'#2e1200';

  glow(col,e.elite?18:12);

  // === ROTATING SHIELD RING (shielded type only) ===
  if(shd){
    for(const dir of [1,-1]){
      CX.save();CX.translate(x,y);CX.rotate(t*.9*dir);
      CX.strokeStyle=dir>0?'rgba(80,180,255,0.9)':'rgba(140,220,255,0.5)';
      CX.lineWidth=dir>0?2.2:1.3;
      CX.beginPath();
      for(let i=0;i<6;i++){
        const a=(i/6)*Math.PI*2,r=w*(dir>0?.82:.95);
        CX[i===0?'moveTo':'lineTo'](_cos(a)*r,_sin(a)*r);
      }
      CX.closePath();CX.stroke();
      if(dir>0){
        CX.fillStyle='rgba(120,200,255,0.9)';
        for(let i=0;i<6;i++){
          const a=(i/6)*Math.PI*2,r=w*.82;
          CX.beginPath();CX.arc(_cos(a)*r,_sin(a)*r,2.4,0,Math.PI*2);CX.fill();
        }
      }
      CX.restore();
    }
  }

  // === ENGINE GLOW (top — engines face up/back) ===
  const eg=CX.createRadialGradient(x,y-h*.55,1,x,y-h*.55,w*.5);
  eg.addColorStop(0,e.elite?'rgba(255,60,160,0.5)':'rgba(255,100,0,0.5)');
  eg.addColorStop(1,'rgba(0,0,0,0)');
  CX.fillStyle=eg;CX.globalAlpha=.4;
  CX.beginPath();CX.ellipse(x,y-h*.55,w*.5,h*.35,0,0,Math.PI*2);CX.fill();
  CX.globalAlpha=.5+hp*.5;

  // === MAIN HULL — wide boxy warship, nose points DOWN ===
  CX.fillStyle=dark;
  CX.beginPath();
  CX.moveTo(x,y+h*.52);                    // nose tip (bottom)
  CX.bezierCurveTo(x+w*.22,y+h*.42,x+w*.48,y+h*.18,x+w*.48,y-h*.1);
  CX.lineTo(x+w*.42,y-h*.48);             // rear corner R
  CX.lineTo(x-w*.42,y-h*.48);             // rear corner L
  CX.lineTo(x-w*.48,y-h*.1);
  CX.bezierCurveTo(x-w*.48,y+h*.18,x-w*.22,y+h*.42,x,y+h*.52);
  CX.fill();

  // === ARMOUR PLATES ===
  CX.fillStyle=mid;
  CX.beginPath();
  CX.moveTo(x-w*.48,y+h*.05);CX.lineTo(x-w*.3,y+h*.3);
  CX.lineTo(x-w*.1,y+h*.28);CX.lineTo(x-w*.12,y-h*.1);
  CX.lineTo(x-w*.42,y-h*.12);CX.closePath();CX.fill();
  CX.beginPath();
  CX.moveTo(x+w*.48,y+h*.05);CX.lineTo(x+w*.3,y+h*.3);
  CX.lineTo(x+w*.1,y+h*.28);CX.lineTo(x+w*.12,y-h*.1);
  CX.lineTo(x+w*.42,y-h*.12);CX.closePath();CX.fill();

  // === SIDE WINGS ===
  CX.fillStyle=dark;
  CX.beginPath();CX.moveTo(x+w*.44,y-h*.05);CX.lineTo(x+w*.78,y-h*.38);
  CX.lineTo(x+w*.62,y-h*.48);CX.lineTo(x+w*.4,y-h*.3);CX.closePath();CX.fill();
  CX.beginPath();CX.moveTo(x-w*.44,y-h*.05);CX.lineTo(x-w*.78,y-h*.38);
  CX.lineTo(x-w*.62,y-h*.48);CX.lineTo(x-w*.4,y-h*.3);CX.closePath();CX.fill();
  CX.strokeStyle=col+'88';CX.lineWidth=1;
  CX.beginPath();CX.moveTo(x+w*.44,y-h*.05);CX.lineTo(x+w*.78,y-h*.38);CX.stroke();
  CX.beginPath();CX.moveTo(x-w*.44,y-h*.05);CX.lineTo(x-w*.78,y-h*.38);CX.stroke();

  // === TURRET (center) ===
  CX.save();CX.translate(x,y+h*.05);CX.rotate(_sin(t*1.2)*.3);
  CX.fillStyle=mid;
  CX.beginPath();CX.ellipse(0,0,w*.28,w*.2,0,0,Math.PI*2);CX.fill();
  CX.strokeStyle=col;CX.lineWidth=1.2;
  CX.beginPath();CX.ellipse(0,0,w*.28,w*.2,0,0,Math.PI*2);CX.stroke();
  CX.fillStyle=col+'aa';
  CX.fillRect(-w*.03,-w*.18-h*.3,w*.06,h*.3);
  CX.fillRect(-w*.14,-w*.14-h*.22,w*.05,h*.22);
  CX.fillRect(w*.09,-w*.14-h*.22,w*.05,h*.22);
  CX.restore();

  // === COCKPIT (near nose, bottom) ===
  const cg=CX.createRadialGradient(x,y+h*.3,1,x,y+h*.3,w*.14);
  cg.addColorStop(0,e.elite?'rgba(255,100,200,0.95)':shd?'rgba(120,190,255,0.95)':'rgba(255,140,60,0.95)');
  cg.addColorStop(.5,e.elite?'rgba(180,30,100,0.5)':shd?'rgba(20,90,180,0.5)':'rgba(180,80,0,0.5)');
  cg.addColorStop(1,'rgba(0,0,0,0)');
  CX.fillStyle=cg;
  CX.beginPath();CX.ellipse(x,y+h*.3,w*.12,h*.14,0,0,Math.PI*2);CX.fill();

  // === EXHAUST FLAMES (top — engines at back) ===
  const ft=t*1000;
  _drawEFlame(x-w*.22,y-h*.5,ft,0,col,true);
  _drawEFlame(x,y-h*.52,ft,150,col,true);
  _drawEFlame(x+w*.22,y-h*.5,ft,300,col,true);

  // === HULL OUTLINE ===
  CX.strokeStyle=col;CX.lineWidth=1.2;CX.globalAlpha=.5;
  CX.beginPath();
  CX.moveTo(x,y+h*.52);
  CX.bezierCurveTo(x+w*.22,y+h*.42,x+w*.48,y+h*.18,x+w*.48,y-h*.1);
  CX.lineTo(x+w*.42,y-h*.48);CX.lineTo(x-w*.42,y-h*.48);
  CX.lineTo(x-w*.48,y-h*.1);
  CX.bezierCurveTo(x-w*.48,y+h*.18,x-w*.22,y+h*.42,x,y+h*.52);
  CX.closePath();CX.stroke();
  CX.globalAlpha=1;
  noGlow();
}

/* ── FAST ENEMY: Sleek interceptor fighter ── */
function drawEnemyFast(x,y,e,hp,t){
  const w=e.w,h=e.h;
  const kmz=e.type==='kamikaze';
  const col=e.elite?'#ff44aa':kmz?'#ff5500':'#00ffcc';
  const dark=e.elite?'#0d0018':kmz?'#220800':'#001a16';
  const mid=e.elite?'#2a0035':kmz?'#4a1400':'#003a30';

  // === WARNING PULSE RING (kamikaze only — telegraphs the dive) ===
  if(kmz){
    const pr=w*(1.3+_sin(t*5)*.4);
    const flash=_sin(t*8)>0.3;
    CX.strokeStyle=flash?'rgba(255,220,80,0.9)':'rgba(255,80,0,0.55)';
    CX.lineWidth=2.2;
    CX.beginPath();CX.arc(x,y,pr,0,Math.PI*2);CX.stroke();
    CX.strokeStyle='rgba(255,60,0,0.35)';CX.lineWidth=1.2;
    CX.beginPath();CX.arc(x,y,pr*1.4,0,Math.PI*2);CX.stroke();
  }

  glow(col,e.elite?16:10);

  // === ENGINE GLOW (top) ===
  const eg=CX.createRadialGradient(x,y-h*.5,1,x,y-h*.5,w*.4);
  eg.addColorStop(0,e.elite?'rgba(200,60,255,0.55)':'rgba(0,255,200,0.45)');
  eg.addColorStop(1,'rgba(0,0,0,0)');
  CX.fillStyle=eg;CX.globalAlpha=.35;
  CX.beginPath();CX.ellipse(x,y-h*.5,w*.4,h*.3,0,0,Math.PI*2);CX.fill();
  CX.globalAlpha=.5+hp*.5;

  // === MAIN HULL — narrow dart, nose points DOWN ===
  CX.fillStyle=dark;
  CX.beginPath();
  CX.moveTo(x,y+h*.58);                   // sharp nose (bottom)
  CX.bezierCurveTo(x+w*.18,y+h*.2,x+w*.22,y-h*.1,x+w*.14,y-h*.52);
  CX.lineTo(x-w*.14,y-h*.52);
  CX.bezierCurveTo(x-w*.22,y-h*.1,x-w*.18,y+h*.2,x,y+h*.58);
  CX.fill();

  // === SWEPT WINGS (sweep back/up) ===
  CX.fillStyle=mid;
  CX.beginPath();
  CX.moveTo(x+w*.14,y-h*.05);
  CX.lineTo(x+w*.7,y-h*.5);
  CX.lineTo(x+w*.52,y-h*.52);
  CX.lineTo(x+w*.1,y-h*.25);
  CX.closePath();CX.fill();
  CX.beginPath();
  CX.moveTo(x-w*.14,y-h*.05);
  CX.lineTo(x-w*.7,y-h*.5);
  CX.lineTo(x-w*.52,y-h*.52);
  CX.lineTo(x-w*.1,y-h*.25);
  CX.closePath();CX.fill();

  CX.strokeStyle=col;CX.lineWidth=1;CX.globalAlpha=.6;
  CX.beginPath();CX.moveTo(x+w*.14,y-h*.05);CX.lineTo(x+w*.7,y-h*.5);CX.stroke();
  CX.beginPath();CX.moveTo(x-w*.14,y-h*.05);CX.lineTo(x-w*.7,y-h*.5);CX.stroke();
  CX.globalAlpha=.5+hp*.5;

  // === CANARDS (small forward fins near nose) ===
  CX.fillStyle=mid;
  CX.beginPath();CX.moveTo(x+w*.1,y+h*.22);CX.lineTo(x+w*.42,y+h*.05);CX.lineTo(x+w*.3,y+h*.02);CX.lineTo(x+w*.08,y+h*.14);CX.closePath();CX.fill();
  CX.beginPath();CX.moveTo(x-w*.1,y+h*.22);CX.lineTo(x-w*.42,y+h*.05);CX.lineTo(x-w*.3,y+h*.02);CX.lineTo(x-w*.08,y+h*.14);CX.closePath();CX.fill();

  // === COCKPIT (near nose, bottom) ===
  const cg=CX.createRadialGradient(x,y+h*.25,1,x,y+h*.25,w*.1);
  cg.addColorStop(0,e.elite?'rgba(220,80,255,0.98)':'rgba(0,255,200,0.98)');
  cg.addColorStop(.5,e.elite?'rgba(120,0,200,0.5)':'rgba(0,140,100,0.4)');
  cg.addColorStop(1,'rgba(0,0,0,0)');
  CX.fillStyle=cg;
  CX.beginPath();CX.ellipse(x,y+h*.25,w*.08,h*.18,0,0,Math.PI*2);CX.fill();

  // === SPINE LINE ===
  CX.strokeStyle=col+'66';CX.lineWidth=1;
  CX.beginPath();CX.moveTo(x,y+h*.55);CX.lineTo(x,y-h*.5);CX.stroke();

  // === ENGINE FLAME (top) ===
  _drawEFlame(x,y-h*.52,t*1000,0,col,true);

  // hull outline
  CX.strokeStyle=col;CX.lineWidth=1;CX.globalAlpha=.45;
  CX.beginPath();
  CX.moveTo(x,y+h*.58);
  CX.bezierCurveTo(x+w*.18,y+h*.2,x+w*.22,y-h*.1,x+w*.14,y-h*.52);
  CX.lineTo(x-w*.14,y-h*.52);
  CX.bezierCurveTo(x-w*.22,y-h*.1,x-w*.18,y+h*.2,x,y+h*.58);
  CX.closePath();CX.stroke();
  CX.globalAlpha=1;
  noGlow();
}

/* ── NORMAL ENEMY: Standard assault fighter ── */
function drawEnemyNormal(x,y,e,hp,t){
  const w=e.w,h=e.h;
  const col=e.elite?'#ff44aa':'#ff2244';
  const dark=e.elite?'#1a0010':'#1a0008';
  const mid=e.elite?'#380020':'#300010';

  glow(col,e.elite?16:11);

  // engine glow (top)
  const eg=CX.createRadialGradient(x,y-h*.45,1,x,y-h*.45,w*.42);
  eg.addColorStop(0,e.elite?'rgba(255,60,160,0.4)':'rgba(255,30,60,0.4)');
  eg.addColorStop(1,'rgba(0,0,0,0)');
  CX.fillStyle=eg;CX.globalAlpha=.35;
  CX.beginPath();CX.ellipse(x,y-h*.45,w*.42,h*.3,0,0,Math.PI*2);CX.fill();
  CX.globalAlpha=.5+hp*.5;

  // === MAIN HULL — nose points DOWN ===
  CX.fillStyle=dark;
  CX.beginPath();
  CX.moveTo(x,y+h*.55);                   // nose tip (bottom)
  CX.bezierCurveTo(x+w*.2,y+h*.3,x+w*.32,y,x+w*.28,y-h*.45);
  CX.lineTo(x-w*.28,y-h*.45);
  CX.bezierCurveTo(x-w*.32,y,x-w*.2,y+h*.3,x,y+h*.55);
  CX.fill();

  // === SIDE PANELS ===
  CX.fillStyle=mid;
  CX.beginPath();
  CX.moveTo(x+w*.14,y+h*.2);CX.lineTo(x+w*.3,y+h*.05);
  CX.lineTo(x+w*.28,y-h*.2);CX.lineTo(x+w*.08,y-h*.18);
  CX.closePath();CX.fill();
  CX.beginPath();
  CX.moveTo(x-w*.14,y+h*.2);CX.lineTo(x-w*.3,y+h*.05);
  CX.lineTo(x-w*.28,y-h*.2);CX.lineTo(x-w*.08,y-h*.18);
  CX.closePath();CX.fill();

  // === DELTA WINGS (sweep toward back/top) ===
  CX.fillStyle=mid;
  CX.beginPath();
  CX.moveTo(x+w*.26,y-h*.05);
  CX.lineTo(x+w*.62,y-h*.44);
  CX.lineTo(x+w*.44,y-h*.46);
  CX.lineTo(x+w*.2,y-h*.28);
  CX.closePath();CX.fill();
  CX.beginPath();
  CX.moveTo(x-w*.26,y-h*.05);
  CX.lineTo(x-w*.62,y-h*.44);
  CX.lineTo(x-w*.44,y-h*.46);
  CX.lineTo(x-w*.2,y-h*.28);
  CX.closePath();CX.fill();

  // wing tip blink lights
  CX.fillStyle=col;CX.globalAlpha=.7+_sin(t*4)*.3;
  CX.beginPath();CX.arc(x+w*.6,y-h*.43,2,0,_PI*2);CX.fill();
  CX.beginPath();CX.arc(x-w*.6,y-h*.43,2,0,_PI*2);CX.fill();
  CX.globalAlpha=.5+hp*.5;

  // === COCKPIT (near nose) ===
  const cg=CX.createRadialGradient(x,y+h*.28,1,x,y+h*.28,w*.11);
  cg.addColorStop(0,e.elite?'rgba(255,100,200,0.98)':'rgba(255,60,80,0.98)');
  cg.addColorStop(.5,e.elite?'rgba(180,0,100,0.5)':'rgba(180,0,30,0.5)');
  cg.addColorStop(1,'rgba(0,0,0,0)');
  CX.fillStyle=cg;
  CX.beginPath();CX.ellipse(x,y+h*.28,w*.09,h*.17,0,0,Math.PI*2);CX.fill();
  CX.fillStyle='rgba(255,255,255,0.35)';
  CX.beginPath();CX.ellipse(x-w*.03,y+h*.33,w*.03,h*.04,-.3,0,_PI*2);CX.fill();

  // === GUN PODS (point down toward player) ===
  CX.fillStyle=dark;
  CX.fillRect(x+w*.18-1.5,y+h*.32,3,h*.2);
  CX.fillRect(x-w*.18-1.5,y+h*.32,3,h*.2);
  CX.fillStyle=col+'99';
  CX.fillRect(x+w*.18-.8,y+h*.44,1.6,h*.08);
  CX.fillRect(x-w*.18-.8,y+h*.44,1.6,h*.08);

  // === DUAL ENGINE FLAMES (top) ===
  _drawEFlame(x-w*.1,y-h*.46,t*1000,0,col,true);
  _drawEFlame(x+w*.1,y-h*.46,t*1000,200,col,true);

  // hull outline
  CX.strokeStyle=col;CX.lineWidth=1;CX.globalAlpha=.45;
  CX.beginPath();
  CX.moveTo(x,y+h*.55);
  CX.bezierCurveTo(x+w*.2,y+h*.3,x+w*.32,y,x+w*.28,y-h*.45);
  CX.lineTo(x-w*.28,y-h*.45);
  CX.bezierCurveTo(x-w*.32,y,x-w*.2,y+h*.3,x,y+h*.55);
  CX.closePath();CX.stroke();
  CX.globalAlpha=1;
  noGlow();
}

/* ── ENEMY EXHAUST FLAME ── */
function _drawEFlame(x,y,t,off,col,upward=false){
  const fl=8+_sin((t+off)*.018)*4+_sin((t+off)*.033)*2;
  const r=col==='#00ffcc'?'0,255,200':col==='#ff6600'?'255,100,0':col==='#ff44aa'?'255,60,160':'255,30,60';
  const y2=upward?y-fl-6:y+fl+6;
  const ymid=upward?y-fl*.5:y+fl*.5;
  const yend=upward?y-fl:y+fl;
  const fg=CX.createLinearGradient(x,y,x,y2);
  fg.addColorStop(0,`rgba(255,240,200,0.95)`);
  fg.addColorStop(.25,`rgba(${r},0.8)`);
  fg.addColorStop(.7,`rgba(${r},0.35)`);
  fg.addColorStop(1,'rgba(0,0,0,0)');
  CX.fillStyle=fg;CX.globalAlpha=.9;
  CX.beginPath();
  CX.moveTo(x-4,y);
  CX.quadraticCurveTo(x+rnd(-1.5,1.5),ymid,x,yend);
  CX.quadraticCurveTo(x+rnd(-1.5,1.5),ymid,x+4,y);
  CX.closePath();CX.fill();
  CX.globalAlpha=1;
}

function drawBoss(){
  const x=G.bossX,y=G.bossY,t=G._t*1000||0;
  const pulse=Math.sin(t*.003)*5;
  const hp=G.bossHp/G.bossMaxHp;
  const ph2=G.bossPhase===2;

  // outer aura
  CX.globalAlpha=.07+Math.sin(t*.002)*.03;
  const aura=CX.createRadialGradient(x,y,30,x,y,140);
  aura.addColorStop(0,ph2?'rgba(255,100,0,.8)':'rgba(255,30,60,.8)');
  aura.addColorStop(1,'transparent');
  CX.fillStyle=aura;CX.beginPath();CX.arc(x,y,140,0,Math.PI*2);CX.fill();
  CX.globalAlpha=1;

  glow('#ff2244',ph2?45:32);
  // main body — nose points DOWN (toward the player), tail/wings up
  CX.fillStyle=ph2?'#200008':'#1a0008';
  CX.beginPath();
  CX.moveTo(x,y+65+pulse);
  CX.bezierCurveTo(x+58,y+28,x+62,y-12,x+46,y-56);
  CX.lineTo(x-46,y-56);
  CX.bezierCurveTo(x-62,y-12,x-58,y+28,x,y+65+pulse);
  CX.fill();

  // body highlight
  CX.fillStyle='rgba(255,255,255,0.04)';
  CX.beginPath();CX.moveTo(x,y+65+pulse);CX.bezierCurveTo(x+25,y+40,x+30,y+10,x+5,y-20);CX.lineTo(x,y+65+pulse);CX.fill();

  // wings
  CX.fillStyle=ph2?'#300014':'#280010';
  CX.beginPath();CX.moveTo(x+42,y-12);CX.lineTo(x+108,y-62);CX.lineTo(x+62,y-60);CX.closePath();CX.fill();
  CX.beginPath();CX.moveTo(x-42,y-12);CX.lineTo(x-108,y-62);CX.lineTo(x-62,y-60);CX.closePath();CX.fill();

  // wing highlights
  CX.fillStyle='rgba(255,34,68,0.08)';
  CX.beginPath();CX.moveTo(x+42,y-12);CX.lineTo(x+108,y-62);CX.lineTo(x+75,y-36);CX.closePath();CX.fill();

  // outline
  CX.strokeStyle=ph2?'#ff4400':'#ff2244';CX.lineWidth=2;
  CX.beginPath();CX.moveTo(x,y+65+pulse);CX.bezierCurveTo(x+58,y+28,x+62,y-12,x+46,y-56);CX.lineTo(x-46,y-56);CX.bezierCurveTo(x-62,y-12,x-58,y+28,x,y+65+pulse);CX.closePath();CX.stroke();

  // core reactor
  const cr=CX.createRadialGradient(x,y,4,x,y,40);
  cr.addColorStop(0,ph2?'rgba(255,120,0,1)':'rgba(255,50,80,1)');
  cr.addColorStop(.4,ph2?'rgba(255,60,0,.6)':'rgba(255,20,50,.6)');
  cr.addColorStop(1,'rgba(200,0,30,0)');
  CX.fillStyle=cr;CX.beginPath();CX.arc(x,y,40,0,Math.PI*2);CX.fill();

  // reactor inner pulse
  CX.globalAlpha=.4+Math.sin(t*.008)*.2;
  CX.fillStyle='rgba(255,255,255,0.6)';
  CX.beginPath();CX.arc(x,y,8+Math.sin(t*.006)*3,0,Math.PI*2);CX.fill();
  CX.globalAlpha=1;

  // rotating rings
  CX.save();CX.translate(x,y);CX.rotate(t*.001);
  CX.strokeStyle=ph2?'rgba(255,100,0,.5)':'rgba(255,34,68,.45)';CX.lineWidth=1.5;
  CX.beginPath();CX.arc(0,0,52,0,Math.PI*2);CX.stroke();CX.restore();
  CX.save();CX.translate(x,y);CX.rotate(-t*.0015);
  CX.strokeStyle=ph2?'rgba(255,80,0,.3)':'rgba(255,34,68,.28)';CX.lineWidth=1;
  CX.beginPath();CX.arc(0,0,70,0,Math.PI*2);CX.stroke();CX.restore();
  CX.save();CX.translate(x,y);CX.rotate(t*.0008);
  CX.strokeStyle='rgba(255,34,68,.12)';CX.lineWidth=1;
  CX.setLineDash([4,8]);
  CX.beginPath();CX.arc(0,0,88,0,Math.PI*2);CX.stroke();
  CX.setLineDash([]);CX.restore();

  // hp arc segments (skip every other frame)
  if(G.frame%2===0){const segs=12;
  for(let i=0;i<segs;i++){
    const a=(i/segs)*Math.PI*2-Math.PI/2;
    const na=((i+1)/segs)*Math.PI*2-Math.PI/2;
    const filled=i/segs<hp;
    CX.strokeStyle=filled?(ph2?'#ff6600':'#ff2244'):'rgba(255,34,68,.12)';
    CX.lineWidth=5;CX.beginPath();CX.arc(x,y,82,a+.04,na-.04);CX.stroke();
  }}
  noGlow();
}

function drawBullet(b){
  glow(b.color,b.crit?18:10);
  if(b.type==='missile'){
    // draw missile body
    const ang=Math.atan2(b.dy,b.dx);
    CX.save();CX.translate(b.x,b.y);CX.rotate(ang+Math.PI/2);
    CX.fillStyle='#cc6600';
    CX.beginPath();CX.moveTo(0,-10);CX.lineTo(4,6);CX.lineTo(-4,6);CX.closePath();CX.fill();
    CX.fillStyle='#ff8800';CX.beginPath();CX.ellipse(0,-8,2.5,4,0,0,Math.PI*2);CX.fill();
    // fins
    CX.fillStyle='#884400';
    CX.beginPath();CX.moveTo(-4,4);CX.lineTo(-9,10);CX.lineTo(-4,8);CX.closePath();CX.fill();
    CX.beginPath();CX.moveTo(4,4);CX.lineTo(9,10);CX.lineTo(4,8);CX.closePath();CX.fill();
    // exhaust
    CX.fillStyle='rgba(255,180,0,0.8)';CX.beginPath();CX.ellipse(0,8,3,5,0,0,Math.PI*2);CX.fill();
    CX.restore();
  } else if(b.wIdx===1||b.wIdx===6){
    // plasma/shotgun: filled circle
    CX.fillStyle=b.color;CX.globalAlpha=0.7;
    CX.beginPath();CX.arc(b.x,b.y,b.w,0,Math.PI*2);CX.fill();
    CX.fillStyle='rgba(255,255,255,0.9)';CX.globalAlpha=1;
    CX.beginPath();CX.arc(b.x,b.y,b.w*.4,0,Math.PI*2);CX.fill();
  } else {
    CX.fillStyle=b.crit?'#ffcc00':b.color;
    const angle=Math.atan2(b.dy,b.dx);
    CX.save();CX.translate(b.x,b.y);CX.rotate(angle+Math.PI/2);
    CX.beginPath();CX.roundRect(-b.w/2,-b.h/2,b.w,b.h,b.w/2);CX.fill();
    CX.restore();CX.globalAlpha=1;
  }
  noGlow();
}

function drawEBullet(b){
  glow('#ff2244',12);
  CX.fillStyle='#ff3355';
  CX.beginPath();CX.arc(b.x,b.y,5,0,Math.PI*2);CX.fill();
  CX.fillStyle='rgba(255,255,255,0.8)';
  CX.beginPath();CX.arc(b.x,b.y,2,0,Math.PI*2);CX.fill();
  noGlow();
}

const DROP_COLORS={coin:'#ffcc00',health:'#ff4488',triple:'#00e5ff',rapid:'#ffcc00',shield:'#44aaff',powerfull:'#ff6600'};
const DROP_ICONS={coin:'◈',health:'♥',triple:'✦',rapid:'⚡',shield:'◉',powerfull:'▲'};
function drawDrop(d){
  const bob=Math.sin(d.t*.004)*3;
  const x=d.x, y=d.y+bob;
  const c=DROP_COLORS[d.type]||'#fff';
  const pulse=.35+Math.sin(d.t*.004)*.15;
  // outer glow ring
  glow(c,16);
  CX.globalAlpha=pulse;
  CX.strokeStyle=c;CX.lineWidth=1.5;
  CX.beginPath();CX.arc(x,y,16,0,Math.PI*2);CX.stroke();
  // filled background circle so icon is always visible
  CX.globalAlpha=0.18;
  CX.fillStyle=c;
  CX.beginPath();CX.arc(x,y,14,0,Math.PI*2);CX.fill();
  // icon
  CX.globalAlpha=1;
  CX.fillStyle=c;
  CX.font='bold 14px monospace';
  CX.textAlign='center';CX.textBaseline='middle';
  CX.fillText(DROP_ICONS[d.type]||'?',x,y);
  noGlow();
  CX.globalAlpha=1;
}

/* ── MINIMAP ── */
function drawMinimap(){
  MX.clearRect(0,0,75,75);
  MX.fillStyle='rgba(0,6,18,0.75)';MX.fillRect(0,0,75,75);
  const sx=75/CV.width,sy=75/CV.height;
  // grid lines
  MX.strokeStyle='rgba(0,229,255,0.06)';MX.lineWidth=.5;
  for(let i=1;i<4;i++){
    MX.beginPath();MX.moveTo(i*18.75,0);MX.lineTo(i*18.75,75);MX.stroke();
    MX.beginPath();MX.moveTo(0,i*18.75);MX.lineTo(75,i*18.75);MX.stroke();
  }
  // enemies
  for(const e of G.enemies){
    MX.fillStyle=e.elite?'#ff44aa':e.type==='shielded'?'#3aa0ff':e.type==='tank'?'#ff6600':e.type==='kamikaze'?'#ff5500':'#ff3355';
    MX.fillRect(e.x*sx-2,e.y*sy-2,4,4);
  }
  if(G.bossOn){
    MX.fillStyle='#ff0000';MX.fillRect(G.bossX*sx-6,G.bossY*sy-4,12,8);
    MX.strokeStyle='#ff2244';MX.lineWidth=1;MX.strokeRect(G.bossX*sx-6,G.bossY*sy-4,12,8);
  }
  for(const d of G.drops){MX.fillStyle='#ffcc00';MX.fillRect(d.x*sx-1.5,d.y*sy-1.5,3,3);}
  // player
  MX.fillStyle='#00e5ff';MX.shadowBlur=8;MX.shadowColor='#00e5ff';
  MX.beginPath();MX.arc(G.px*sx,G.py*sy,3,0,Math.PI*2);MX.fill();
  MX.shadowBlur=0;
}

/* ── PARTICLES ── */
function burst(x,y,c,n=12){
  if(!CFG.particles||G.particles.length>300)return;
  for(let i=0;i<n;i++){
    const a=_rnd()*_PI*2,sp=rnd(1.5,5.5);
    G.particles.push({x,y,vx:_cos(a)*sp,vy:_sin(a)*sp,r:rnd(1.5,5),c,life:rnd(300,700),ml:700});
  }
}
function bigBurst(x,y){
  if(!CFG.particles){return;}
  const cols=['#aa00ff','#ff00aa','#0088ff','#ff6600','#ffcc00','#00e5ff','#ff2244'];
  const cap=G.particles.length>200?40:100;
  for(let i=0;i<cap;i++){
    const a=_rnd()*_PI*2,sp=rnd(2,14);
    const c=cols[_floor(_rnd()*cols.length)];
    G.particles.push({x,y,vx:_cos(a)*sp,vy:_sin(a)*sp,r:rnd(2,8),c,life:rnd(500,1400),ml:1400});
  }
}
function spark(x,y,c){
  if(!CFG.particles||G.particles.length>280)return;
  for(let i=0;i<5;i++){
    const a=_rnd()*_PI*2;
    G.particles.push({x,y,vx:_cos(a)*4,vy:_sin(a)*4,r:rnd(1.5,3),c,life:180,ml:180});
  }
}
function shake(amt,decay){
  const s=amt*(CFG.screenShake/5);
  G.shakeAmt=Math.max(G.shakeAmt,s);G.shakeDecay=decay;
}

/* ── HELPERS ── */
function glow(c,s){if(!CFG.glow){return;}CX.shadowBlur=s*0.5;CX.shadowColor=c;}
function noGlow(){CX.shadowBlur=0;}
function rnd(a,b){return a+_rnd()*(b-a);}
function clamp(v,mn,mx){return _max(mn,_min(mx,v));}
function rectOverlap(ax,ay,aw,ah,bx,by,bw,bh){return _abs(ax-bx)<(aw+bw)*.5&&_abs(ay-by)<(ah+bh)*.5;}
function hitCircle(ax,ay,ar,bx,by,br){const dx=ax-bx,dy=ay-by;return dx*dx+dy*dy<(ar+br)*(ar+br);}
// Canvas-based float texts (no DOM overhead)
const floatTexts=[];
function floatText(x,y,txt,col){
  floatTexts.push({x,y,txt,col,life:900,ml:900,vy:-0.55});
}
function drawFloatTexts(f){
  if(!floatTexts.length)return;
  CX.font='bold 12px Courier New,monospace';
  CX.textAlign='center';CX.textBaseline='middle';
  for(let i=floatTexts.length-1;i>=0;i--){
    const ft=floatTexts[i];
    ft.y+=ft.vy*f;ft.life-=G.dt;
    if(ft.life<=0){floatTexts.splice(i,1);continue;}
    CX.globalAlpha=ft.life/ft.ml;
    CX.fillStyle=ft.col;
    CX.shadowBlur=8;CX.shadowColor=ft.col;
    CX.fillText(ft.txt,ft.x,ft.y);
  }
  CX.globalAlpha=1;CX.shadowBlur=0;CX.textAlign='left';CX.textBaseline='alphabetic';
}

/* ── TOAST ── */
let toastTmr=null;
function toast_(msg){
  toast.textContent=msg;toast.classList.add('show');
  clearTimeout(toastTmr);toastTmr=setTimeout(()=>toast.classList.remove('show'),2800);
}
function showToast(msg){toast_(msg);}

/* ── UI UPDATES ── */
function updateShieldUI(){
  shFill.style.width=Math.max(0,G.shield/G.shMax*100)+'%';
  shEl.textContent=Math.round(G.shield);
}
function updateSkillDots(){
  const map={damage:'dDots',speed:'sDots',fireRate:'rDots',critical:'cDots',shield:'shDots'};
  for(const[k,id]of Object.entries(map)){
    const el=$id(id);el.innerHTML='';
    for(let i=0;i<5;i++){const d=document.createElement('div');d.className='sd'+(i<G.sk[k]?' on':'');el.appendChild(d);}
  }
}
function updateWeaponHUD(){
  const hudEl=$id('weaponHUD');
  hudEl.innerHTML='';
  const shipWpnIndices=getShipWeaponIndices();
  shipWpnIndices.forEach((wIdx,slotNum)=>{
    const w=WEAPONS[wIdx];
    if(!w)return;
    const isActive=wIdx===G.wIdx;
    const slot=document.createElement('div');
    slot.className='wslot'+(isActive?' active':'');
    slot.id='ws'+wIdx;
    slot.innerHTML=`<span class="wnum">${slotNum+1}</span>${w.icon}<span class="wname">${w.name}</span><div class="wbar"></div>`;
    slot.addEventListener('touchstart',(ev)=>{
      ev.stopPropagation();
      if(G.wIdx===wIdx)return;
      G.wIdx=wIdx;SFX.ui_click();updateWeaponHUD();toast_('⚔ '+w.name);
    },{passive:true});
    slot.addEventListener('click',(ev)=>{
      ev.stopPropagation();
      if(G.wIdx===wIdx)return;
      G.wIdx=wIdx;SFX.ui_click();updateWeaponHUD();toast_('⚔ '+w.name);
    });
    hudEl.appendChild(slot);
  });
}
function bumpChip(id){
  const el=$id(id);
  const chip=el.closest('.chip');
  if(!chip)return;
  chip.classList.remove('bump');
  requestAnimationFrame(()=>chip.classList.add('bump'));
}
function updatePUPanel(){
  const labels={triple:'✦ TRIPLE SHOT',rapid:'⚡ RAPID FIRE',shield:'◉ INVINCIBLE',powerfull:'▲ POWER UP'};
  puPanel.innerHTML='';
  for(const k in G.activePU){
    if(G.activePU[k]>0){
      const tag=document.createElement('div');
      tag.className='puTag';
      const secs=Math.ceil(G.activePU[k]/1000);
      tag.textContent=(labels[k]||k.toUpperCase())+' '+secs+'s';
      puPanel.appendChild(tag);
    }
  }
}

/* ═══ CONTROLS — full-screen zones ═══
   Left half of the screen (#moveZone): press+drag anywhere → a floating
   joystick appears right under the finger and steers the ship.
   Right half of the screen (#fireZone): any tap/hold → fires.
   Uses Pointer Events so mouse (desktop) and touch (mobile) both work
   through the same code path. */
const moveZone=$id('moveZone'),fireZone=$id('fireZone');
const floatStick=$id('floatStick'),floatDot=$id('floatDot');
const JOY_MAX=48; // px radius the floating stick can travel before clamping

let moveCX=0,moveCY=0,movePID=-1;

function showFloatStick(x,y){
  moveCX=x;moveCY=y;
  floatStick.style.left=x+'px';floatStick.style.top=y+'px';
  floatStick.classList.add('on');
  floatDot.style.transform='translate(-50%,-50%)';
}
function hideFloatStick(){
  floatStick.classList.remove('on');
  floatDot.style.transform='translate(-50%,-50%)';
}
function moveStk(cx,cy){
  const dx=cx-moveCX,dy=cy-moveCY;
  const dist=Math.sqrt(dx*dx+dy*dy);
  const r=Math.min(dist,JOY_MAX);
  const a=Math.atan2(dy,dx);
  const sx=Math.cos(a)*r, sy=Math.sin(a)*r;
  floatDot.style.transform=`translate(calc(-50% + ${sx}px),calc(-50% + ${sy}px))`;
  // dead zone: below CFG.deadZone px → no input
  if(dist<CFG.deadZone){G.joyX=0;G.joyY=0;}
  else{
    // remap: dist goes from deadZone to JOY_MAX → 0 to 1 (smooth ramp)
    const norm=Math.min((dist-CFG.deadZone)/(JOY_MAX-CFG.deadZone),1);
    G.joyX=(dx/dist)*norm;
    G.joyY=(dy/dist)*norm;
  }
}
moveZone.addEventListener('pointerdown',e=>{
  if(movePID!==-1)return; // one active drag at a time
  movePID=e.pointerId;
  try{moveZone.setPointerCapture(movePID);}catch(err){}
  showFloatStick(e.clientX,e.clientY);
  G.joyOn=true;
  moveStk(e.clientX,e.clientY);
});
moveZone.addEventListener('pointermove',e=>{
  if(e.pointerId!==movePID)return;
  moveStk(e.clientX,e.clientY);
});
function endMove(e){
  if(e.pointerId!==movePID)return;
  movePID=-1;G.joyOn=false;G.joyX=0;G.joyY=0;
  hideFloatStick();
}
moveZone.addEventListener('pointerup',endMove);
moveZone.addEventListener('pointercancel',endMove);
moveZone.addEventListener('pointerleave',e=>{if(e.pointerId===movePID)endMove(e);});

const firePIDs=new Set();
function spawnFireRipple(x,y){
  const r=document.createElement('div');
  r.className='fireRipple';
  r.style.left=x+'px';r.style.top=y+'px';
  fireZone.appendChild(r);
  setTimeout(()=>r.remove(),460);
}
fireZone.addEventListener('pointerdown',e=>{
  firePIDs.add(e.pointerId);
  try{fireZone.setPointerCapture(e.pointerId);}catch(err){}
  G.firing=true;
  spawnFireRipple(e.clientX,e.clientY);
});
function endFire(e){
  firePIDs.delete(e.pointerId);
  if(firePIDs.size===0)G.firing=false;
}
fireZone.addEventListener('pointerup',endFire);
fireZone.addEventListener('pointercancel',endFire);
fireZone.addEventListener('pointerleave',e=>{if(firePIDs.has(e.pointerId))endFire(e);});

const K={};
document.addEventListener('keydown',e=>{
  K[e.code]=true;
  if(e.code==='Space'){e.preventDefault();G.firing=true;}
  if(e.code==='Escape')togglePause();
  if(e.code==='KeyE')doSpecial();
  if(e.code==='KeyQ')cycleWeapon();
});
document.addEventListener('keyup',e=>{K[e.code]=false;if(e.code==='Space')G.firing=false;});

/* ═══ MENUS ═══ */
function togglePause(){
  if(G.over||!G.alive||lvlUp.classList.contains('on'))return;
  G.paused=!G.paused;pauseMenu.classList.toggle('on',G.paused);
  $id('pauseBtn').textContent=G.paused?'▶':'⏸';
}
function restartGame(){
  pauseMenu.classList.remove('on');endScreen.classList.remove('on');lvlUp.classList.remove('on');
  bossHUD.classList.remove('on');$id('pauseBtn').textContent='⏸';
  initG();initBG();
  // Re-apply selected ship & mode bonuses after initG resets G
  applyShipBonuses(selectedShip);
  applyModeBonuses(selectedMode);
  // Set starting weapon — first owned weapon of current ship's loadout
  const shipIndices=getShipWeaponIndices();
  if(shipIndices.length>0){G.wIdx=shipIndices[0];}
  else{const pulseIdx=WEAPONS.findIndex(w=>w.owned);G.wIdx=pulseIdx>=0?pulseIdx:0;}
  waveEl.textContent='1';hpEl.textContent='3';scEl.textContent='0';coEl.textContent='0';
  shEl.textContent='100';shFill.style.width='100%';xpFill.style.width='0%';
  lvlBadge.textContent='LVL 1';updateSkillDots();updateWeaponHUD();puPanel.innerHTML='';
  G.px=CV.width/2;G.py=CV.height-185;G.pvx=0;G.pvy=0;
  G.alive=true;G.paused=false;G.lastT=performance.now();_accumT=0;
}
function toStart(){
  pauseMenu.classList.remove('on');endScreen.classList.remove('on');lvlUp.classList.remove('on');
  bossHUD.classList.remove('on');
  SFX.stopMusic();
  initG();
  // Hide game UI elements
  $id('ui').style.visibility='hidden';
  $id('minimap').style.visibility='hidden';
  $id('ctrl').style.visibility='hidden';
  CV.style.visibility='hidden';
  startSc.classList.add('gone');
  const lobbyEl=$id('lobbyScreen');
  lobbyEl.classList.remove('gone');
  requestAnimationFrame(()=>lobbyEl.classList.add('visible'));
  refreshLobbyStats();
}
function startGame(){startSc.classList.add('gone');restartGame();}

// ═══ LOBBY SYSTEM ═══
let selectedShip=0;
let selectedMode='normal';

// All ships data (index 0-2 = default owned, 3-4 = purchasable)
const PILOT_SHIPS=[
  {color:'#00e5ff',accent:'#0077ff',w:40,h:50,type:'viper',  name:'VIPER',  badge:'BALANCED',   atk:60,spd:60,def:60, price:0,    tier:1, weapons:['PULSE','LASER','TWIN','GATLING','MISSILE']},
  {color:'#cc44ff',accent:'#7700cc',w:32,h:56,type:'wraith', name:'WRAITH', badge:'INTERCEPTOR', atk:45,spd:88,def:42, price:300,  tier:1, weapons:['PULSE','LASER','PLASMA','CHAIN','FLARE']},
  {color:'#ff8800',accent:'#cc4400',w:52,h:44,type:'titan',  name:'TITAN',  badge:'GUNSHIP',     atk:85,spd:38,def:80, price:500,  tier:2, weapons:['GATLING','SHOTGUN','MISSILE','RAILGUN','EMP']},
  {color:'#00ff8c',accent:'#00aa55',w:44,h:52,type:'phantom',name:'PHANTOM',badge:'STEALTH',     atk:70,spd:75,def:50, price:500,  tier:3, weapons:['LASER','TWIN','CHAIN','VORTEX','FREEZE']},
  {color:'#ff2255',accent:'#aa0033',w:48,h:48,type:'nova',   name:'NOVA',   badge:'DESTROYER',   atk:95,spd:55,def:70, price:1200, tier:4, weapons:['RAILGUN','EMP','VORTEX','NUKE','BLACKHOLE']},
];

// Weapon tier — ship must be >= this tier to equip
const WEAPON_TIER={
  PULSE:1, PLASMA:1, LASER:1, TWIN:1,
  GATLING:2, SHOTGUN:2, FLARE:2, MISSILE:2,
  FREEZE:2, RAILGUN:3, EMP:3, CHAIN:3, VORTEX:3,
  NUKE:4, BLACKHOLE:4,
};

function getShipTier(){
  const s=PILOT_SHIPS[selectedShip]||PILOT_SHIPS[0];
  return s.tier||1;
}
function canUseWeapon(wName){
  return (WEAPON_TIER[wName]||1)<=getShipTier();
}
// Returns weapon indices available for current ship
function getShipWeaponIndices(){
  const ship=PILOT_SHIPS[selectedShip]||PILOT_SHIPS[0];
  return (ship.weapons||['PULSE']).map(name=>WEAPONS.findIndex(w=>w.name===name)).filter(i=>i>=0&&WEAPONS[i].owned);
}

function saveOwnedWeapons(){
  try{
    const owned=WEAPONS.filter(w=>w.owned).map(w=>w.name);
    localStorage.setItem('exomniaOwnedWeapons',JSON.stringify(owned));
  }catch(e){}
}
function loadOwnedWeapons(){
  try{
    const owned=JSON.parse(localStorage.getItem('exomniaOwnedWeapons')||'null');
    if(!Array.isArray(owned))return;
    WEAPONS.forEach(w=>{ if(owned.includes(w.name)) w.owned=true; });
  }catch(e){}
}
function getOwnedShips(){
  try{
    const o=JSON.parse(localStorage.getItem('exomniaOwnedShips')||'[0]');
    return o;
  }catch(e){return [0,1,2];}
}

/* ═══ SHIP UPGRADES (coin-based stat leveling) ═══ */
const SHIP_UPGRADE_MAX=5;      // max upgrade level per ship
const SHIP_UPGRADE_STAT_STEP=6; // stat points gained per level (capped at 99)
function getShipUpgrades(){
  try{
    const o=JSON.parse(localStorage.getItem('exomniaShipUpgrades')||'{}');
    return (o&&typeof o==='object')?o:{};
  }catch(e){return {};}
}
function getShipUpgradeLevel(idx){
  const u=getShipUpgrades();
  return u[idx]||0;
}
function setShipUpgradeLevel(idx,lvl){
  const u=getShipUpgrades();
  u[idx]=lvl;
  try{localStorage.setItem('exomniaShipUpgrades',JSON.stringify(u));}catch(e){}
}
function getShipUpgradeCost(idx){
  const s=PILOT_SHIPS[idx];
  if(!s)return Infinity;
  const lvl=getShipUpgradeLevel(idx);
  if(lvl>=SHIP_UPGRADE_MAX)return null; // maxed out
  return Math.round((120+s.price*0.25)*(lvl+1));
}
// Returns {atk,spd,def} for a ship including upgrade bonuses, capped at 99
function getEffectiveShipStats(idx){
  const s=PILOT_SHIPS[idx]||PILOT_SHIPS[0];
  const lvl=getShipUpgradeLevel(idx);
  const bump=lvl*SHIP_UPGRADE_STAT_STEP;
  return {
    atk:Math.min(99,s.atk+bump),
    spd:Math.min(99,s.spd+bump),
    def:Math.min(99,s.def+bump),
    lvl
  };
}
function upgradeShip(idx){
  const owned=getOwnedShips();
  if(!owned.includes(idx)){showToast('BUY THIS SHIP FIRST!');return;}
  const cost=getShipUpgradeCost(idx);
  if(cost===null){showToast('SHIP ALREADY AT MAX LEVEL!');return;}
  const coins=getLbyCoins();
  if(coins<cost){showToast('◈ NOT ENOUGH COINS!');return;}
  setLbyCoins(coins-cost);
  setShipUpgradeLevel(idx,getShipUpgradeLevel(idx)+1);
  showToast('SHIP UPGRADED: '+PILOT_SHIPS[idx].name+' → LV.'+getShipUpgradeLevel(idx));
  updateLbyShipCard(selectedShip);
  if(idx===selectedShip)applyShipBonuses(selectedShip);
  openLbyPanel('shop'); // refresh shop view
}
function buyShip(idx){
  const ship=PILOT_SHIPS[idx];
  const coins=getLbyCoins();
  if(coins<ship.price){showToast('NOT ENOUGH COINS!');return;}
  const owned=getOwnedShips();
  if(owned.includes(idx))return;
  owned.push(idx);
  try{localStorage.setItem('exomniaOwnedShips',JSON.stringify(owned));}catch(e){}
  setLbyCoins(coins-ship.price);
  showToast('SHIP UNLOCKED: '+ship.name);
  openLbyPanel('shop');// refresh
}
function getLbyCoins(){
  try{return parseInt(localStorage.getItem('exomniaTotalCoins')||'0');}catch(e){return 0;}
}
function setLbyCoins(v){
  try{localStorage.setItem('exomniaTotalCoins',v);}catch(e){}
  const el=$id('lbyCoinDisplay');
  if(el)el.textContent='◈ '+v;
}

function selectShip(idx){
  const owned=getOwnedShips();
  if(!owned.includes(idx)){showToast('BUY THIS SHIP FIRST!');return;}
  selectedShip=idx;
  try{localStorage.setItem('exomniaShip',idx);}catch(e){}
  updateLbyShipCard(idx);
  // Update hangar selection if open
  document.querySelectorAll('.hgr-card').forEach(c=>{
    c.classList.toggle('hgr-selected',parseInt(c.dataset.ship)===idx);
  });
}

function updateLbyShipCard(idx){
  const s=PILOT_SHIPS[idx];
  const eff=getEffectiveShipStats(idx);
  $id('lbyShipName').textContent=s.name+(eff.lvl>0?' ◈LV'+eff.lvl:'');
  $id('lbyShipType').textContent=s.badge;
  $id('shipBarAtk').style.width=eff.atk+'%';
  $id('shipBarSpd').style.width=eff.spd+'%';
  $id('shipBarDef').style.width=eff.def+'%';
  drawSingleShip($id('lbyShipCanvas'),s,60,70);
}

function openLbyPanel(type){
  const panel=$id('lbyPanel');
  const title=$id('lbyPanelTitle');
  const body=$id('lbyPanelBody');
  panel.classList.add('open');
  if(type==='hangar'){
    title.textContent='HANGAR';
    body.innerHTML='';
    const grid=document.createElement('div');
    grid.id='hangarGrid';
    const owned=getOwnedShips();
    owned.forEach(idx=>{
      const s=PILOT_SHIPS[idx];
      const card=document.createElement('div');
      card.className='hgr-card'+(idx===selectedShip?' hgr-selected':'');
      card.dataset.ship=idx;
      card.onclick=()=>{selectShip(idx);closeLbyPanel();};
      // Build all children via createElement — never use innerHTML+= as it destroys canvas
      const slot=document.createElement('div');
      slot.className='lby-card-title';
      slot.textContent='SLOT '+(owned.indexOf(idx)+1);
      card.appendChild(slot);
      const cv=document.createElement('canvas');
      cv.className='hgr-canvas';cv.width=54;cv.height=64;
      card.appendChild(cv);
      const nm=document.createElement('div');
      const upLvl=getShipUpgradeLevel(idx);
      nm.className='hgr-name';nm.textContent=s.name+(upLvl>0?' ◈'+upLvl:'');
      card.appendChild(nm);
      const tp=document.createElement('div');
      tp.className='hgr-type';tp.textContent=s.badge;
      card.appendChild(tp);
      grid.appendChild(card);
      // Draw after append so canvas is live in DOM
      setTimeout(()=>drawSingleShip(cv,s,54,64),0);
    });
    body.appendChild(grid);
  } else {
    title.textContent='◈ SHOP';
    body.innerHTML='';

    // Tab bar
    const tabBar=document.createElement('div');
    tabBar.style.cssText='display:flex;gap:8px;margin-bottom:14px;width:100%;max-width:500px;';
    const tabShip=document.createElement('div');
    tabShip.textContent='🚀 SHIP SHOP';
    tabShip.style.cssText='flex:1;padding:9px 0;border-radius:5px;font-family:Courier New,monospace;font-weight:900;font-size:11px;letter-spacing:3px;text-align:center;cursor:pointer;transition:all .18s;border:1px solid rgba(0,229,255,0.5);color:#00e5ff;background:rgba(0,229,255,0.12);box-shadow:0 0 10px rgba(0,229,255,0.2);';
    const tabWpn=document.createElement('div');
    tabWpn.textContent='⚔ WEAPONS';
    tabWpn.style.cssText='flex:1;padding:9px 0;border-radius:5px;font-family:Courier New,monospace;font-weight:900;font-size:11px;letter-spacing:3px;text-align:center;cursor:pointer;transition:all .18s;border:1px solid rgba(0,229,255,0.2);color:rgba(0,229,255,0.45);background:rgba(0,229,255,0.03);';
    tabBar.appendChild(tabShip);
    tabBar.appendChild(tabWpn);
    body.appendChild(tabBar);

    // Coin display
    const coinRow=document.createElement('div');
    coinRow.style.cssText='font-family:Courier New,monospace;font-size:13px;letter-spacing:3px;color:#00ff8c;background:rgba(0,255,140,0.06);border:1px solid rgba(0,255,140,0.2);padding:5px 18px;border-radius:4px;margin-bottom:14px;';
    coinRow.id='lbyShopCoinRow';
    coinRow.textContent='◈ COINS: '+getLbyCoins();
    body.appendChild(coinRow);

    // Content container
    const content=document.createElement('div');
    content.id='lbyShopContent';
    content.style.cssText='width:100%;max-width:500px;';
    body.appendChild(content);

    function renderShipTab(){
      tabShip.style.cssText='flex:1;padding:9px 0;border-radius:5px;font-family:Courier New,monospace;font-weight:900;font-size:11px;letter-spacing:3px;text-align:center;cursor:pointer;transition:all .18s;border:1px solid rgba(0,229,255,0.5);color:#00e5ff;background:rgba(0,229,255,0.12);box-shadow:0 0 10px rgba(0,229,255,0.2);';
      tabWpn.style.cssText='flex:1;padding:9px 0;border-radius:5px;font-family:Courier New,monospace;font-weight:900;font-size:11px;letter-spacing:3px;text-align:center;cursor:pointer;transition:all .18s;border:1px solid rgba(0,229,255,0.2);color:rgba(0,229,255,0.45);background:rgba(0,229,255,0.03);';
      content.innerHTML='';
      const grid=document.createElement('div');
      grid.id='shopGrid';
      const owned=getOwnedShips();
      const coins=getLbyCoins();
      PILOT_SHIPS.forEach((s,idx)=>{
        const isOwned=owned.includes(idx);
        const eff=getEffectiveShipStats(idx);
        const item=document.createElement('div');
        item.className='shop-item'+(isOwned?' owned':'');
        const cv=document.createElement('canvas');
        cv.className='shop-item-canvas';cv.width=50;cv.height=60;
        const canAfford=coins>=s.price;
        let btnHTML;
        if(!isOwned){
          btnHTML=`<div class="shop-buy-btn buy" onclick="buyShip(${idx})" style="${canAfford?'':'opacity:.4;cursor:default'}"><span class="shop-price">◈${s.price}</span><span class="shop-price-lbl">BUY</span></div>`;
        } else {
          const upCost=getShipUpgradeCost(idx);
          if(upCost===null){
            btnHTML=`<div class="shop-buy-btn owned-badge"><span class="shop-price">★ LV${eff.lvl}</span><span class="shop-price-lbl">MAX</span></div>`;
          } else {
            const canUp=coins>=upCost;
            btnHTML=`<div class="shop-buy-btn upgrade" onclick="upgradeShip(${idx})" style="${canUp?'':'opacity:.4;cursor:default'}"><span class="shop-price">◈${upCost}</span><span class="shop-price-lbl">UPGRADE LV${eff.lvl}→${eff.lvl+1}</span></div>`;
          }
        }
        item.innerHTML=`
          <div class="shop-item-info">
            <div class="shop-item-name">${s.name}${eff.lvl>0?' <span style="color:#00ff8c;font-size:9px;">◈LV'+eff.lvl+'</span>':''}</div>
            <div class="shop-item-type">${s.badge}</div>
            <div class="shop-item-bars">
              <div class="shop-bar-r"><span class="shop-bar-l">ATK</span><div class="shop-bar-t"><div class="shop-bar-f atk" style="width:${eff.atk}%"></div></div></div>
              <div class="shop-bar-r"><span class="shop-bar-l">SPD</span><div class="shop-bar-t"><div class="shop-bar-f spd" style="width:${eff.spd}%"></div></div></div>
              <div class="shop-bar-r"><span class="shop-bar-l">DEF</span><div class="shop-bar-t"><div class="shop-bar-f def" style="width:${eff.def}%"></div></div></div>
            </div>
          </div>${btnHTML}`;
        item.insertBefore(cv,item.firstChild);
        grid.appendChild(item);
        setTimeout(()=>drawSingleShip(cv,s,50,60),0);
      });

      // ── Wingman Drone card (passive ally, one-time purchase) ──
      const wmOwned=getWingmanOwned();
      const wmItem=document.createElement('div');
      wmItem.className='shop-item'+(wmOwned?' owned':'');
      const wmCanvas=document.createElement('canvas');
      wmCanvas.className='shop-item-canvas';wmCanvas.width=50;wmCanvas.height=60;
      const wmBtn=wmOwned
        ?`<div class="shop-buy-btn owned-badge"><span class="shop-price">✔</span><span class="shop-price-lbl">OWNED</span></div>`
        :`<div class="shop-buy-btn buy" onclick="buyWingman();openLbyPanel('shop')" style="${coins>=WINGMAN_COST?'':'opacity:.4;cursor:default'}"><span class="shop-price">◈${WINGMAN_COST}</span><span class="shop-price-lbl">BUY</span></div>`;
      wmItem.innerHTML=`
        <div class="shop-item-info">
          <div class="shop-item-name">WINGMAN DRONE</div>
          <div class="shop-item-type">PASSIVE ALLY</div>
          <div class="shop-item-bars">
            <div style="font-size:8px;letter-spacing:1px;color:rgba(0,229,255,0.55);line-height:1.5;padding:4px 0;">Auto-fires alongside your ship in every mission. One-time purchase.</div>
          </div>
        </div>${wmBtn}`;
      const wmCx=wmCanvas.getContext('2d');
      wmCx.fillStyle='#0a1a14';wmCx.beginPath();
      wmCx.moveTo(25,10);wmCx.lineTo(40,30);wmCx.lineTo(25,50);wmCx.lineTo(10,30);wmCx.closePath();wmCx.fill();
      wmCx.strokeStyle='#00ff8c';wmCx.lineWidth=1.5;wmCx.stroke();
      wmItem.insertBefore(wmCanvas,wmItem.firstChild);
      grid.appendChild(wmItem);

      content.appendChild(grid);
    }

    function renderWpnTab(){
      tabWpn.style.cssText='flex:1;padding:9px 0;border-radius:5px;font-family:Courier New,monospace;font-weight:900;font-size:11px;letter-spacing:3px;text-align:center;cursor:pointer;transition:all .18s;border:1px solid rgba(255,204,0,0.5);color:#ffcc00;background:rgba(255,204,0,0.1);box-shadow:0 0 10px rgba(255,204,0,0.2);';
      tabShip.style.cssText='flex:1;padding:9px 0;border-radius:5px;font-family:Courier New,monospace;font-weight:900;font-size:11px;letter-spacing:3px;text-align:center;cursor:pointer;transition:all .18s;border:1px solid rgba(0,229,255,0.2);color:rgba(0,229,255,0.45);background:rgba(0,229,255,0.03);';
      content.innerHTML='';
      const coins=getLbyCoins();
      const shipTier=PILOT_SHIPS[selectedShip]?PILOT_SHIPS[selectedShip].tier:1;
      const tierColors=['','#00e5ff','#ff8800','#aa44ff','#ff2255'];

      const tierBanner=document.createElement('div');
      const shipName=PILOT_SHIPS[selectedShip]?PILOT_SHIPS[selectedShip].name:'VIPER';
      const shipWpns=PILOT_SHIPS[selectedShip]?PILOT_SHIPS[selectedShip].weapons:[];
      tierBanner.style.cssText=`font-family:Courier New,monospace;font-size:10px;letter-spacing:2px;color:${tierColors[shipTier]};background:rgba(0,0,0,0.4);border:1px solid ${tierColors[shipTier]}44;border-radius:4px;padding:6px 12px;margin-bottom:10px;text-align:center;`;
      tierBanner.textContent=`${shipName} LOADOUT: ${shipWpns.join(' · ')}`;
      content.appendChild(tierBanner);

      const wGrid=document.createElement('div');
      wGrid.className='shopGrid';
      wGrid.style.cssText='display:grid;grid-template-columns:repeat(auto-fill,minmax(min(150px,42vw),1fr));gap:10px;width:100%;';

      function renderLbyWpnGrid(){
        wGrid.innerHTML='';
        const lbyCoins=getLbyCoins();
        WEAPONS.forEach((w,idx)=>{
          if(!shipWpns.includes(w.name)) return; // only show this ship's weapons
          const isOwned=w.owned;
          const canAfford=lbyCoins>=w.cost;
          const card=document.createElement('div');
          let cls='shopCard';
          if(isOwned) cls+=' owned';
          if(!isOwned&&!canAfford) cls+=' cant-afford';
          card.className=cls;
          const wLvl=getWpnUpgradeLevel(w.name);
          const effDmg=Math.round(getEffectiveWeaponDmg(w.name,w.dmg));
          let badge;
          if(isOwned){
            const upCost=getWpnUpgradeCost(w.name);
            if(upCost===null){
              badge=`<div class="shopPrice owned-lbl">★ MAX LV${wLvl}</div>`;
            } else {
              const canUp=lbyCoins>=upCost;
              badge=`<div class="shopPrice wpn-upgrade-btn" data-wpn="${w.name}" style="cursor:pointer;color:#00ff8c;border:1px solid rgba(0,255,140,0.4);${canUp?'':'opacity:.45;'}">◈${upCost} UPGRADE LV${wLvl}→${wLvl+1}</div>`;
            }
          } else {
            badge=`<div class="shopPrice">◈ ${w.cost} COINS</div>`;
          }
          card.innerHTML=`<div class="shopIcon">${w.icon}</div>
            <div class="shopName">${w.name}${wLvl>0?' <span style="color:#00ff8c;font-size:9px;">◈LV'+wLvl+'</span>':''}</div>
            <div class="shopDesc">${w.desc}</div>
            <div class="shopStats">
              <div class="shopStat dmg">DMG ${effDmg}</div>
              <div class="shopStat spd">SPD ${w.spd}</div>
            </div>${badge}`;
          if(!isOwned){
            card.onclick=()=>{
              const coins=getLbyCoins();
              if(coins<w.cost){showToast('◈ NOT ENOUGH COINS!');return;}
              setLbyCoins(coins-w.cost);
              w.owned=true;
              saveOwnedWeapons();
              const topCoin=document.getElementById('lbyCoinDisplay');
              if(topCoin) topCoin.textContent=getLbyCoins();
              showToast('✔ PURCHASED: '+w.name);
              renderLbyWpnGrid();
            };
          } else {
            const upBtn=card.querySelector('.wpn-upgrade-btn');
            if(upBtn){
              upBtn.onclick=(ev)=>{ev.stopPropagation();upgradeWeapon(w.name);renderLbyWpnGrid();};
            } else {
              card.onclick=()=>showToast('★ '+w.name+' AT MAX LEVEL');
            }
          }
          wGrid.appendChild(card);
        });
      }
      renderLbyWpnGrid();
      content.appendChild(wGrid);
    }

    tabShip.onclick=renderShipTab;
    tabWpn.onclick=renderWpnTab;
    renderShipTab(); // default tab
  }
}
function closeLbyPanel(){
  $id('lbyPanel').classList.remove('open');
}

const PILOT_EMOJIS=['🧑‍🚀','👨‍✈️','👩‍✈️','🤖','👾','🦾','🧬','⚡','🦅','🐉','🔥','💎','🌟','🎯','⚔️','🛸'];
let _emojiIdx=0;

function openEmojiPicker(){
  const modal=$id('emojiPickerModal');
  const grid=$id('emojiGrid');
  grid.innerHTML='';
  PILOT_EMOJIS.forEach((em,i)=>{
    const btn=document.createElement('div');
    btn.textContent=em;
    btn.style.cssText='font-size:28px;text-align:center;padding:10px;border-radius:8px;cursor:pointer;border:2px solid '+(i===_emojiIdx?'rgba(0,229,255,0.7)':'rgba(0,229,255,0.1)')+';background:'+(i===_emojiIdx?'rgba(0,229,255,0.12)':'rgba(0,0,0,0.3)')+';transition:all .15s;';
    btn.onclick=()=>{
      _emojiIdx=i;
      $id('pilotEmoji').textContent=em;
      try{localStorage.setItem('exomniaEmoji',i);}catch(e){}
      closeEmojiPicker();
    };
    grid.appendChild(btn);
  });
  modal.style.display='flex';
}
function closeEmojiPicker(){
  $id('emojiPickerModal').style.display='none';
}

function openNameEdit(){
  const coins=getLbyCoins();
  const modal=$id('nameEditModal');
  $id('nameEditInput').value=$id('callsignInput').value||'';
  $id('nameEditCoinsLeft').textContent='YOUR COINS: ◈ '+coins;
  modal.style.display='flex';
  setTimeout(()=>$id('nameEditInput').focus(),100);
}
function closeNameEdit(){
  $id('nameEditModal').style.display='none';
}
function confirmNameEdit(){
  const coins=getLbyCoins();
  if(coins<100){showToast('◈ NOT ENOUGH COINS! NEED 100');return;}
  const newName=($id('nameEditInput').value||'').trim().toUpperCase();
  if(!newName){showToast('⚠ ENTER A CALLSIGN!');return;}
  setLbyCoins(coins-100);
  $id('callsignInput').value=newName;
  try{localStorage.setItem('exomniaCallsign',newName);}catch(e){}
  const topCoin=$id('lbyCoinDisplay');
  if(topCoin) topCoin.textContent=getLbyCoins();
  closeNameEdit();
  showToast('✔ CALLSIGN UPDATED: '+newName);
}

function selectMode(m){
  selectedMode=m;
  document.querySelectorAll('.mode-btn').forEach(b=>b.classList.remove('selected'));
  document.querySelector('[data-mode="'+m+'"]').classList.add('selected');
}

function launchFromLobby(){
  const cs=($id('callsignInput').value||'').trim()||getOrCreateDefaultCallsign();
  try{localStorage.setItem('exomniaCallsign',cs);}catch(e){}
  $id('lobbyScreen').classList.remove('visible');
  $id('lobbyScreen').classList.add('gone');
  startSc.classList.add('gone');
  CV.style.visibility='visible';
  $id('ui').style.visibility='visible';
  $id('minimap').style.visibility='visible';
  // Reposition & resize minimap to match stats panel width
  setTimeout(()=>{
    const skillPanel=$id('skillPanel');
    const minimap=$id('minimap');
    if(skillPanel&&minimap){
      const sr=skillPanel.getBoundingClientRect();
      minimap.style.top=(sr.bottom+6)+'px';
      minimap.style.width=sr.width+'px';
      minimap.style.height=sr.width+'px';
    }
  },50);
  $id('ctrl').style.visibility='visible';
  SFX.init();SFX.resume();
  restartGame();
  // Apply bonuses AFTER restartGame/initG so they are not wiped
  applyShipBonuses(selectedShip);
  applyModeBonuses(selectedMode);
  SFX.startMusic();
}

function applyShipBonuses(idx){
  G._shipIdx=idx;
  G._selectedMode=selectedMode;
  // Apply ship's actual dimensions so hitbox matches visuals
  const s=PILOT_SHIPS[idx]||PILOT_SHIPS[0];
  G.pw=s.w;
  G.ph=s.h;
  // Use effective stats (base + coin-bought upgrade levels)
  const eff=getEffectiveShipStats(idx);
  // Apply stat bonuses
  G.pspd=5*(1+(eff.spd-60)/200);   // speed scaled around base 60
  G.shMax=100+(eff.def-60)*0.5;    // defense adds shield capacity
  G.shield=Math.min(G.shield||100,G.shMax);
  G._shipAtkMult=(eff.atk-60)/200; // attack scaled around base 60, applied to weapon damage
}
function applyModeBonuses(mode){
  G._selectedMode=mode;
}

function refreshLobbyStats(){
  try{
    const cs=getOrCreateDefaultCallsign();
    $id('callsignInput').value=cs;
    const ei=parseInt(localStorage.getItem('exomniaEmoji')||'0');
    _emojiIdx=ei;
    $id('pilotEmoji').textContent=PILOT_EMOJIS[ei]||'🧑‍🚀';
    const bs=parseInt(localStorage.getItem('exomniaBestScore')||'0');
    const bw=parseInt(localStorage.getItem('exomniaBestWave')||'0');
    const tk=parseInt(localStorage.getItem('exomniaTotalKills')||'0');
    const gm=parseInt(localStorage.getItem('exomniaGames')||'0');
    $id('pBestScore').textContent=bs>9999?(bs/1000).toFixed(1)+'K':bs;
    $id('pBestWave').textContent=bw;
    $id('pTotalKills').textContent=tk>9999?(tk/1000).toFixed(1)+'K':tk;
    const pgEl=$id('pilotGames');if(pgEl)pgEl.textContent=gm+' MISSIONS';
    const ranks=['◆ RECRUIT','◆ CADET','◆◆ PILOT','◆◆ ACE','◆◆◆ COMMANDER','◆◆◆ ADMIRAL','★ LEGEND'];
    const ri=Math.min(Math.floor(bw/2),ranks.length-1);
    $id('pilotRank').textContent=ranks[ri];
    const si=parseInt(localStorage.getItem('exomniaShip')||'0');
    const owned=getOwnedShips();
    selectedShip=owned.includes(si)?si:0;
    updateLbyShipCard(selectedShip);
    // Coin display
    setLbyCoins(getLbyCoins());
    // ── Sync stats from server ──
    if (typeof API !== 'undefined') API.syncLobbyStats();
  }catch(e){}
}

function drawSingleShip(cv,s,W,H){
  if(!cv)return;
  const cx=cv.getContext('2d');
  cv.width=W;cv.height=H;
  cx.clearRect(0,0,W,H);
  const x=W/2,y=H*0.52;
  const col=s.color,acc=s.accent;
  const pw=s.w*(W/54),ph=s.h*(H/62);
  cx.shadowBlur=14;cx.shadowColor=col;
  if(s.type==='viper'){
    cx.fillStyle='#061e3c';cx.beginPath();cx.moveTo(x,y-ph*.52);cx.bezierCurveTo(x+pw*.36,y-ph*.1,x+pw*.36,y+ph*.1,x+pw*.22,y+ph*.4);cx.lineTo(x-pw*.22,y+ph*.4);cx.bezierCurveTo(x-pw*.36,y+ph*.1,x-pw*.36,y-ph*.1,x,y-ph*.52);cx.fill();
    cx.fillStyle='#0a2e5a';cx.beginPath();cx.moveTo(x+pw*.2,y);cx.lineTo(x+pw*.65,y+ph*.44);cx.lineTo(x+pw*.4,y+ph*.44);cx.lineTo(x+pw*.16,y+ph*.18);cx.closePath();cx.fill();
    cx.beginPath();cx.moveTo(x-pw*.2,y);cx.lineTo(x-pw*.65,y+ph*.44);cx.lineTo(x-pw*.4,y+ph*.44);cx.lineTo(x-pw*.16,y+ph*.18);cx.closePath();cx.fill();
    const cg=cx.createRadialGradient(x,y-ph*.18,1,x,y-ph*.18,pw*.16);cg.addColorStop(0,'rgba(0,229,255,0.97)');cg.addColorStop(1,'rgba(0,100,200,0)');cx.fillStyle=cg;cx.beginPath();cx.ellipse(x,y-ph*.18,pw*.12,ph*.1,0,0,Math.PI*2);cx.fill();
    const eg=cx.createRadialGradient(x,y+ph*.45,2,x,y+ph*.45,12);eg.addColorStop(0,'rgba(0,120,255,0.9)');eg.addColorStop(1,'rgba(0,40,120,0)');cx.fillStyle=eg;cx.beginPath();cx.ellipse(x,y+ph*.45,6,9,0,0,Math.PI*2);cx.fill();
  } else if(s.type==='wraith'){
    cx.fillStyle='#1a0030';cx.beginPath();cx.moveTo(x,y-ph*.55);cx.bezierCurveTo(x+pw*.28,y-ph*.1,x+pw*.28,y+ph*.15,x+pw*.14,y+ph*.45);cx.lineTo(x-pw*.14,y+ph*.45);cx.bezierCurveTo(x-pw*.28,y+ph*.15,x-pw*.28,y-ph*.1,x,y-ph*.55);cx.fill();
    cx.fillStyle='#250045';cx.beginPath();cx.moveTo(x+pw*.12,y+ph*.1);cx.lineTo(x+pw*.7,y+ph*.5);cx.lineTo(x+pw*.4,y+ph*.48);cx.lineTo(x+pw*.1,y+ph*.22);cx.closePath();cx.fill();
    cx.beginPath();cx.moveTo(x-pw*.12,y+ph*.1);cx.lineTo(x-pw*.7,y+ph*.5);cx.lineTo(x-pw*.4,y+ph*.48);cx.lineTo(x-pw*.1,y+ph*.22);cx.closePath();cx.fill();
    const cg2=cx.createRadialGradient(x,y-ph*.2,1,x,y-ph*.2,pw*.14);cg2.addColorStop(0,col);cg2.addColorStop(1,'rgba(200,0,255,0)');cx.fillStyle=cg2;cx.beginPath();cx.ellipse(x,y-ph*.2,pw*.1,ph*.09,0,0,Math.PI*2);cx.fill();
    const eg2=cx.createRadialGradient(x,y+ph*.48,2,x,y+ph*.48,10);eg2.addColorStop(0,'rgba(200,0,255,0.9)');eg2.addColorStop(1,'rgba(100,0,160,0)');cx.fillStyle=eg2;cx.beginPath();cx.ellipse(x,y+ph*.48,5,8,0,0,Math.PI*2);cx.fill();
  } else if(s.type==='titan'){
    cx.fillStyle='#1a0a00';cx.beginPath();cx.moveTo(x,y-ph*.42);cx.bezierCurveTo(x+pw*.42,y-ph*.08,x+pw*.44,y+ph*.12,x+pw*.3,y+ph*.42);cx.lineTo(x-pw*.3,y+ph*.42);cx.bezierCurveTo(x-pw*.44,y+ph*.12,x-pw*.42,y-ph*.08,x,y-ph*.42);cx.fill();
    cx.fillStyle='#2a1000';cx.beginPath();cx.moveTo(x+pw*.28,y+ph*.05);cx.lineTo(x+pw*.85,y+ph*.4);cx.lineTo(x+pw*.5,y+ph*.42);cx.lineTo(x+pw*.22,y+ph*.2);cx.closePath();cx.fill();
    cx.beginPath();cx.moveTo(x-pw*.28,y+ph*.05);cx.lineTo(x-pw*.85,y+ph*.4);cx.lineTo(x-pw*.5,y+ph*.42);cx.lineTo(x-pw*.22,y+ph*.2);cx.closePath();cx.fill();
    cx.fillStyle=col+'aa';cx.fillRect(x+pw*.18-2,y+ph*.2,4,ph*.22);cx.fillRect(x-pw*.18-2,y+ph*.2,4,ph*.22);
    const cg3=cx.createRadialGradient(x,y-ph*.1,2,x,y-ph*.1,pw*.18);cg3.addColorStop(0,col);cg3.addColorStop(1,'rgba(255,136,0,0)');cx.fillStyle=cg3;cx.beginPath();cx.ellipse(x,y-ph*.1,pw*.14,ph*.12,0,0,Math.PI*2);cx.fill();
    const eg3=cx.createRadialGradient(x,y+ph*.44,3,x,y+ph*.44,14);eg3.addColorStop(0,'rgba(255,120,0,0.9)');eg3.addColorStop(1,'rgba(200,60,0,0)');cx.fillStyle=eg3;cx.beginPath();cx.ellipse(x,y+ph*.44,8,10,0,0,Math.PI*2);cx.fill();
  } else if(s.type==='phantom'){
    // slim stealth
    cx.fillStyle='#001a10';cx.beginPath();cx.moveTo(x,y-ph*.58);cx.bezierCurveTo(x+pw*.22,y-ph*.08,x+pw*.2,y+ph*.15,x+pw*.1,y+ph*.44);cx.lineTo(x-pw*.1,y+ph*.44);cx.bezierCurveTo(x-pw*.2,y+ph*.15,x-pw*.22,y-ph*.08,x,y-ph*.58);cx.fill();
    cx.fillStyle='#003020';cx.beginPath();cx.moveTo(x+pw*.08,y+ph*.08);cx.lineTo(x+pw*.75,y+ph*.46);cx.lineTo(x+pw*.38,y+ph*.45);cx.lineTo(x+pw*.06,y+ph*.22);cx.closePath();cx.fill();
    cx.beginPath();cx.moveTo(x-pw*.08,y+ph*.08);cx.lineTo(x-pw*.75,y+ph*.46);cx.lineTo(x-pw*.38,y+ph*.45);cx.lineTo(x-pw*.06,y+ph*.22);cx.closePath();cx.fill();
    const cgp=cx.createRadialGradient(x,y-ph*.22,1,x,y-ph*.22,pw*.13);cgp.addColorStop(0,col);cgp.addColorStop(1,'rgba(0,255,140,0)');cx.fillStyle=cgp;cx.beginPath();cx.ellipse(x,y-ph*.22,pw*.09,ph*.08,0,0,Math.PI*2);cx.fill();
    const egp=cx.createRadialGradient(x,y+ph*.46,2,x,y+ph*.46,10);egp.addColorStop(0,'rgba(0,255,140,0.9)');egp.addColorStop(1,'rgba(0,120,80,0)');cx.fillStyle=egp;cx.beginPath();cx.ellipse(x,y+ph*.46,5,8,0,0,Math.PI*2);cx.fill();
  } else {
    // NOVA - destroyer
    cx.fillStyle='#200010';cx.beginPath();cx.moveTo(x,y-ph*.48);cx.bezierCurveTo(x+pw*.46,y-ph*.06,x+pw*.48,y+ph*.14,x+pw*.32,y+ph*.44);cx.lineTo(x-pw*.32,y+ph*.44);cx.bezierCurveTo(x-pw*.48,y+ph*.14,x-pw*.46,y-ph*.06,x,y-ph*.48);cx.fill();
    cx.fillStyle='#380020';cx.beginPath();cx.moveTo(x+pw*.3,y+ph*.04);cx.lineTo(x+pw*.9,y+ph*.42);cx.lineTo(x+pw*.52,y+ph*.44);cx.lineTo(x+pw*.24,y+ph*.18);cx.closePath();cx.fill();
    cx.beginPath();cx.moveTo(x-pw*.3,y+ph*.04);cx.lineTo(x-pw*.9,y+ph*.42);cx.lineTo(x-pw*.52,y+ph*.44);cx.lineTo(x-pw*.24,y+ph*.18);cx.closePath();cx.fill();
    cx.fillStyle=col+'cc';cx.fillRect(x+pw*.22-2,y+ph*.15,3,ph*.26);cx.fillRect(x-pw*.22-2,y+ph*.15,3,ph*.26);cx.fillRect(x+pw*.36-2,y+ph*.22,3,ph*.2);cx.fillRect(x-pw*.36-2,y+ph*.22,3,ph*.2);
    const cgn=cx.createRadialGradient(x,y-ph*.12,2,x,y-ph*.12,pw*.2);cgn.addColorStop(0,col);cgn.addColorStop(1,'rgba(255,0,80,0)');cx.fillStyle=cgn;cx.beginPath();cx.ellipse(x,y-ph*.12,pw*.16,ph*.14,0,0,Math.PI*2);cx.fill();
    const egn=cx.createRadialGradient(x,y+ph*.46,3,x,y+ph*.46,14);egn.addColorStop(0,'rgba(255,50,80,0.9)');egn.addColorStop(1,'rgba(180,0,40,0)');cx.fillStyle=egn;cx.beginPath();cx.ellipse(x,y+ph*.46,9,11,0,0,Math.PI*2);cx.fill();
  }
  cx.shadowBlur=0;
}

function drawShipPreviews(){
  // Legacy - now using drawSingleShip
  updateLbyShipCard(selectedShip);
}

// Stats saving on game end — called separately after the real gameOver
function _saveRunStats(){
  try{
    const bs=parseInt(localStorage.getItem('exomniaBestScore')||'0');
    const bw=parseInt(localStorage.getItem('exomniaBestWave')||'0');
    const tk=parseInt(localStorage.getItem('exomniaTotalKills')||'0');
    const gm=parseInt(localStorage.getItem('exomniaGames')||'0');
    const bc=parseInt(localStorage.getItem('exomniaBestCombo')||'0');
    if(G.score>bs)localStorage.setItem('exomniaBestScore',G.score);
    if(G.wave>bw)localStorage.setItem('exomniaBestWave',G.wave);
    if((G.maxCombo||0)>bc)localStorage.setItem('exomniaBestCombo',G.maxCombo||0);
    localStorage.setItem('exomniaTotalKills',tk+(G.kills||0));
    localStorage.setItem('exomniaGames',gm+1);
    // Save coins earned in game
    const prevCoins=getLbyCoins();
    const earned=G.coins||0;
    setLbyCoins(prevCoins+earned);
  }catch(e){}
}

// Patch gameOver: wrap with stats save (no recursion — we keep a ref before redefining)
(function(){
  const _orig=gameOver;
  gameOver=function(){
    _orig();
    _saveRunStats();
  };
})();

/* ═══ SETTINGS SYSTEM ═══ */
const DEFAULTS={
  speed:5, sensitivity:5, inertia:5, deadZone:6,
  fireRate:5, screenShake:5,
  particles:true, glow:true,
};
let CFG=Object.assign({},DEFAULTS);

// Load from localStorage if available
(function(){
  try{const s=localStorage.getItem('exomniaCFG');if(s)CFG=Object.assign({},DEFAULTS,JSON.parse(s));}catch(e){}
})();

function cfgToGameValues(){
  // speed: 2-10 → pspd 2-12
  G.pspd=CFG.speed*1.2;
  // fire rate: 1-10 → ms 240 (slow) to 80 (fast)
  G.fireRate=Math.round(240-(CFG.fireRate-1)*(160/9));
}

function openSettings(){
  pauseMenu.classList.remove('on');
  const panel=$id('settingsPanel');
  panel.classList.add('on');
  // sync sliders to current CFG
  syncSlider('spdSlider','spdFill','spdVal',CFG.speed,2,10);
  syncSlider('sensSlider','sensFill','sensVal',CFG.sensitivity,1,10);
  syncSlider('inertiaSlider','inertiaFill','inertiaVal',CFG.inertia,1,10);
  syncSlider('deadSlider','deadFill','deadVal',CFG.deadZone,2,20);
  syncSlider('fireRateSlider','fireRateFill','fireRateVal',CFG.fireRate,1,10);
  syncSlider('shakeSlider','shakeFill','shakeVal',CFG.screenShake,0,10);
  syncToggle('particleToggle',CFG.particles);
  syncToggle('glowToggle',CFG.glow);
  // wire up live preview on sliders
  wireSlider('spdSlider','spdFill','spdVal',2,10,v=>{CFG.speed=v;});
  wireSlider('sensSlider','sensFill','sensVal',1,10,v=>{CFG.sensitivity=v;});
  wireSlider('inertiaSlider','inertiaFill','inertiaVal',1,10,v=>{CFG.inertia=v;});
  wireSlider('deadSlider','deadFill','deadVal',2,20,v=>{CFG.deadZone=v;});
  wireSlider('fireRateSlider','fireRateFill','fireRateVal',1,10,v=>{CFG.fireRate=v;});
  wireSlider('shakeSlider','shakeFill','shakeVal',0,10,v=>{CFG.screenShake=v;});
}
function closeSettings(){
  $id('settingsPanel').classList.remove('on');
  pauseMenu.classList.add('on');
}
function saveSettings(){
  applySettings();
  try{localStorage.setItem('exomniaCFG',JSON.stringify(CFG));}catch(e){}
  $id('settingsPanel').classList.remove('on');
  G.paused=false;
  pauseMenu.classList.remove('on');
  toast_('✔ SETTINGS APPLIED');
}
function resetSettings(){
  CFG=Object.assign({},DEFAULTS);
  openSettings();
  applySettings();
  toast_('↺ SETTINGS RESET');
}
function applySettings(){
  cfgToGameValues();
}
function syncSlider(sliderId,fillId,valId,val,mn,mx){
  const s=$id(sliderId);if(!s)return;
  s.value=val;
  $id(valId).textContent=parseFloat(val).toFixed(val%1?1:0);
  $id(fillId).style.width=((val-mn)/(mx-mn)*100)+'%';
}
function wireSlider(sliderId,fillId,valId,mn,mx,cb){
  const s=$id(sliderId);if(!s)return;
  // remove old listener by cloning
  const ns=s.cloneNode(true);s.parentNode.replaceChild(ns,s);
  ns.addEventListener('input',()=>{
    const v=parseFloat(ns.value);
    $id(valId).textContent=v.toFixed(v%1?1:0);
    $id(fillId).style.width=((v-mn)/(mx-mn)*100)+'%';
    cb(v);
    applySettings();
  });
}
function toggleSetting(key){
  CFG[key]=!CFG[key];
  syncToggle(key+'Toggle',CFG[key]);
  applySettings();
}
function syncToggle(id,val){
  const el=$id(id);if(!el)return;
  el.classList.toggle('off',!val);
  el.querySelector('span').textContent=val?'ON':'OFF';
}

/* ═══ WEAPON SHOP ═══ */
function openShop(){
  pauseMenu.classList.remove('on');
  $id('shopPanel').classList.add('on');
  renderShop();
}
function closeShop(){
  $id('shopPanel').classList.remove('on');
  pauseMenu.classList.add('on');
}
function renderShop(){
  $id('shopCoinDisplay').textContent=G.coins;
  const grid=$id('shopGrid');
  grid.innerHTML='';
  WEAPONS.forEach((w,i)=>{
    const card=document.createElement('div');
    const isOwned=w.owned;
    const isActive=G.wIdx===i;
    const canAfford=G.coins>=w.cost;
    card.className='shopCard'+(isOwned?' owned':'')+(isActive?' active-wep':'')+((!isOwned&&!canAfford)?' cant-afford':'');

    // damage/speed/rate labels
    const rateLabel=w.name==='GATLING'?'FAST':w.name==='NUKE'?'SLOW':w.name==='EMP'||w.name==='RAILGUN'?'MED':'NORM';
    const effDmg=Math.round(getEffectiveWeaponDmg(w.name,w.dmg));
    const wLvl=getWpnUpgradeLevel(w.name);
    card.innerHTML=`
      <div class="shopIcon">${w.icon}</div>
      <div class="shopName">${w.name}${wLvl>0?' <span style="color:#00ff8c;font-size:9px;">◈LV'+wLvl+'</span>':''}</div>
      <div class="shopDesc">${w.desc}</div>
      <div class="shopStats">
        <div class="shopStat dmg">DMG ${effDmg}</div>
        <div class="shopStat spd">SPD ${w.spd}</div>
        <div class="shopStat rte">RTE ${rateLabel}</div>
      </div>
      ${isOwned
        ? `<div class="shopPrice owned-lbl">✔ OWNED</div>${isActive?'<div class="shopEquip">[ EQUIPPED ]</div>':'<div class="shopEquip" style="color:rgba(0,229,255,0.4)">tap to equip</div>'}`
        : `<div class="shopPrice">◈ ${w.cost} COINS</div>`
      }
    `;
    card.addEventListener('click',()=>shopAction(i));
    grid.appendChild(card);
  });
}
function shopAction(idx){
  const w=WEAPONS[idx];
  if(w.owned){
    // equip it
    G.wIdx=idx;
    toast_('⚔ EQUIPPED: '+w.name);
    renderShop();
    updateWeaponHUD();
  } else {
    if(G.coins<w.cost){toast_('◈ NOT ENOUGH COINS!');return;}
    G.coins-=w.cost;
    coEl.textContent=fmtNum(G.coins);
    w.owned=true;
    saveOwnedWeapons();
    G.wIdx=idx;
    toast_('✔ PURCHASED & EQUIPPED: '+w.name);
    renderShop();
    updateWeaponHUD();
  }
}

// Apply on boot
applySettings();

/* ═══ SOUND SYSTEM (Web Audio API — no external files) ═══ */
const SFX = (function(){
  let ctx = null;
  let masterGain = null;
  let musicNodes = null;
  let musicPlaying = false;
  let muted = false;

  function init(){
    if(ctx) return;
    try{
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.55;
      masterGain.connect(ctx.destination);
    }catch(e){ ctx=null; }
  }

  function resume(){
    if(ctx && ctx.state==='suspended') ctx.resume();
  }

  // ── core tone helper ──
  function tone(freq, type, vol, dur, opts={}){
    if(!ctx||muted) return;
    const g = ctx.createGain();
    g.connect(masterGain);
    const now = ctx.currentTime;
    const attack = opts.attack||0.005;
    const decay  = opts.decay ||0.05;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now+attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now+dur);

    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    if(opts.sweep) o.frequency.exponentialRampToValueAtTime(opts.sweep, now+dur);
    o.connect(g);
    o.start(now);
    o.stop(now+dur+0.05);
  }

  // ── noise burst helper ──
  function noise(vol, dur, opts={}){
    if(!ctx||muted) return;
    const bufLen = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for(let i=0;i<bufLen;i++) data[i]=(Math.random()*2-1);
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filter = ctx.createBiquadFilter();
    filter.type = opts.filter || 'bandpass';
    filter.frequency.value = opts.freq || 800;
    filter.Q.value = opts.Q || 1.5;

    const g = ctx.createGain();
    g.connect(masterGain);
    const now = ctx.currentTime;
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now+dur);

    src.connect(filter);
    filter.connect(g);
    src.start(now);
    src.stop(now+dur+0.05);
  }

  // ═══ SOUND EFFECTS ═══
  function shoot_pulse(){
    tone(420,'square',.18,.08,{sweep:200,attack:.002,decay:.03});
    tone(210,'sawtooth',.08,.06,{sweep:120});
  }
  function shoot_laser(){
    tone(800,'sawtooth',.12,.07,{sweep:1400,attack:.001});
    tone(1600,'sine',.06,.05,{sweep:2800});
  }
  function shoot_plasma(){
    tone(300,'sawtooth',.15,.09,{sweep:150});
    noise(.1,.06,{filter:'highpass',freq:1200});
  }
  function shoot_missile(){
    noise(.22,.12,{filter:'lowpass',freq:600,Q:0.8});
    tone(120,'sawtooth',.15,.15,{sweep:60,attack:.01});
  }
  function shoot_gatling(){
    tone(380+Math.random()*80,'square',.12,.05,{sweep:200,attack:.001});
  }
  function shoot_shotgun(){
    noise(.35,.18,{filter:'lowpass',freq:400,Q:0.5});
    tone(80,'square',.2,.12,{sweep:40,attack:.003});
  }
  function shoot_emp(){
    tone(60,'sawtooth',.3,.4,{sweep:20,attack:.01});
    noise(.25,.35,{filter:'lowpass',freq:300,Q:0.3});
    tone(200,'sine',.15,.5,{sweep:800});
  }
  function shoot_railgun(){
    tone(50,'square',.35,.05,{sweep:2000,attack:.001});
    noise(.3,.12,{filter:'highpass',freq:3000,Q:2});
    tone(1200,'sine',.12,.18,{sweep:300});
  }
  function shoot_nuke(){
    tone(40,'sawtooth',.4,.8,{sweep:15,attack:.02});
    noise(.5,.9,{filter:'lowpass',freq:200,Q:0.2});
    tone(100,'square',.25,.6,{sweep:30});
    setTimeout(()=>{
      noise(.6,.5,{filter:'lowpass',freq:500,Q:0.4});
      tone(30,'sine',.3,1.2,{sweep:80,attack:.05});
    },120);
  }

  function enemy_explode(){
    noise(.28,.2,{filter:'lowpass',freq:500,Q:0.6});
    tone(120,'square',.18,.15,{sweep:50,attack:.003});
  }
  function enemy_explode_big(){
    noise(.45,.4,{filter:'lowpass',freq:300,Q:0.4});
    tone(60,'sawtooth',.3,.35,{sweep:25,attack:.005});
    tone(200,'square',.15,.25,{sweep:80});
  }
  function player_hit(){
    noise(.4,.22,{filter:'bandpass',freq:700,Q:1.2});
    tone(150,'square',.3,.2,{sweep:60,attack:.002});
    tone(400,'sine',.15,.15,{sweep:100});
  }
  function pickup_coin(){
    tone(880,'sine',.18,.07,{attack:.002});
    tone(1320,'sine',.12,.05,{attack:.003});
  }
  function pickup_health(){
    tone(660,'sine',.2,.1,{attack:.005});
    tone(880,'sine',.18,.12,{attack:.01});
    tone(1100,'sine',.12,.15,{attack:.015});
  }
  function pickup_powerup(){
    tone(440,'sine',.15,.05,{attack:.002});
    tone(660,'sine',.15,.07,{attack:.01});
    tone(880,'sine',.12,.1,{attack:.02});
  }
  function level_up(){
    const notes=[523,659,784,1047];
    notes.forEach((f,i)=>{
      setTimeout(()=>tone(f,'sine',.22,.18,{attack:.005}),i*80);
    });
  }
  function wave_start(){
    tone(220,'square',.2,.12,{attack:.01});
    setTimeout(()=>tone(330,'square',.2,.12,{attack:.01}),130);
    setTimeout(()=>tone(440,'square',.25,.2,{attack:.01}),260);
  }
  function boss_spawn(){
    tone(55,'sawtooth',.35,.5,{sweep:35,attack:.02});
    setTimeout(()=>noise(.4,.4,{filter:'lowpass',freq:250,Q:0.3}),100);
    setTimeout(()=>{
      tone(110,'square',.3,.4,{sweep:55,attack:.01});
    },300);
  }
  function boss_phase2(){
    tone(80,'square',.4,.3,{attack:.01});
    noise(.35,.25,{filter:'lowpass',freq:350});
    setTimeout(()=>tone(160,'square',.35,.3,{attack:.01}),150);
  }
  function boss_die(){
    for(let i=0;i<6;i++){
      setTimeout(()=>{
        noise(.5,.35,{filter:'lowpass',freq:200+i*50,Q:0.3});
        tone(60+i*15,'sawtooth',.3,.4,{sweep:20,attack:.003});
      },i*120);
    }
  }
  function special_nova(){
    tone(50,'sawtooth',.4,.6,{sweep:15,attack:.02});
    noise(.45,.8,{filter:'lowpass',freq:250,Q:0.2});
    setTimeout(()=>{
      for(let i=0;i<4;i++) setTimeout(()=>noise(.3,.25,{filter:'bandpass',freq:300+i*100}),i*80);
    },200);
  }
  function game_over(){
    const notes=[440,330,220,110];
    notes.forEach((f,i)=>{
      setTimeout(()=>tone(f,'sawtooth',.25,.4,{attack:.01,sweep:f*.4}),i*200);
    });
  }
  function ui_click(){
    tone(660,'sine',.1,.04,{attack:.001});
  }
  function combo_hit(combo){
    const f=220+Math.min(combo,30)*18;
    tone(f,'square',.12,.06,{attack:.001,sweep:f*1.3});
  }

  // ═══ BACKGROUND MUSIC ═══
  function startMusic(){
    if(!ctx||musicPlaying||muted) return;
    musicPlaying=true;
    _scheduleMusic(ctx.currentTime);
  }
  function stopMusic(){
    musicPlaying=false;
    if(musicNodes){
      try{musicNodes.forEach(n=>n.stop&&n.stop());}catch(e){}
      musicNodes=null;
    }
  }

  // Simple arpeggiated ambient sci-fi loop
  const SCALE=[55,65.4,73.4,82.4,98,110,130.8,146.8];
  let _musicSeq=0;
  let _musicTimer=null;
  function _scheduleMusic(startAt){
    if(!musicPlaying||!ctx||muted) return;
    const now=ctx.currentTime;
    const t=Math.max(startAt,now);

    // Bass drone
    _playMusicNote(SCALE[0],t,'sawtooth',.06,1.4);
    _playMusicNote(SCALE[0]*2,t,'sine',.04,1.4);

    // Arpeggiated melody notes
    const pattern=[0,2,4,7,4,2,5,3];
    const step=0.22;
    pattern.forEach((deg,i)=>{
      const freq=SCALE[deg%SCALE.length]*2;
      _playMusicNote(freq,t+i*step,'sine',.03,.15);
    });

    // Hi-hat rhythm (noise clicks)
    for(let i=0;i<8;i++){
      if(i%2===0) _playMusicNoise(t+i*step*.5,.03,.04,{filter:'highpass',freq:6000});
    }

    // Kick (low thump every bar)
    _playMusicNote(55,t,'sine',.1,.08,{sweep:30});
    _playMusicNote(55,t+step*4,'sine',.08,.07,{sweep:30});

    const loopLen=pattern.length*step+0.05;
    _musicTimer=setTimeout(()=>_scheduleMusic(t+loopLen), loopLen*1000-80);
  }
  function _playMusicNote(freq,when,type,vol,dur,opts={}){
    if(!ctx||muted) return;
    const g=ctx.createGain();
    g.connect(masterGain);
    g.gain.setValueAtTime(0,when);
    g.gain.linearRampToValueAtTime(vol,when+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001,when+dur);
    const o=ctx.createOscillator();
    o.type=type;o.frequency.setValueAtTime(freq,when);
    if(opts.sweep) o.frequency.exponentialRampToValueAtTime(opts.sweep,when+dur);
    o.connect(g);o.start(when);o.stop(when+dur+0.05);
  }
  function _playMusicNoise(when,vol,dur,opts={}){
    if(!ctx||muted) return;
    const bufLen=Math.ceil(ctx.sampleRate*dur);
    const buf=ctx.createBuffer(1,bufLen,ctx.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<bufLen;i++) d[i]=Math.random()*2-1;
    const src=ctx.createBufferSource();src.buffer=buf;
    const f=ctx.createBiquadFilter();
    f.type=opts.filter||'highpass';f.frequency.value=opts.freq||5000;
    const g=ctx.createGain();g.connect(masterGain);
    g.gain.setValueAtTime(vol,when);g.gain.exponentialRampToValueAtTime(0.0001,when+dur);
    src.connect(f);f.connect(g);src.start(when);src.stop(when+dur+0.05);
  }

  function setMute(v){
    muted=v;
    if(masterGain) masterGain.gain.value=v?0:0.55;
    if(v) stopMusic();
    else if(ctx&&!musicPlaying) startMusic();
  }
  function toggleMute(){
    init();resume();
    setMute(!muted);
    return muted;
  }
  function isMuted(){ return muted; }

  // Weapon sound dispatcher
  function weaponSound(wName){
    init();resume();
    const map={PULSE:shoot_pulse,LASER:shoot_laser,PLASMA:shoot_plasma,MISSILE:shoot_missile,GATLING:shoot_gatling,SHOTGUN:shoot_shotgun,EMP:shoot_emp,RAILGUN:shoot_railgun,NUKE:shoot_nuke,TWIN:shoot_pulse,VORTEX:shoot_emp,FLARE:shoot_shotgun,FREEZE:shoot_emp,CHAIN:shoot_railgun,BLACKHOLE:shoot_nuke};
    (map[wName]||shoot_pulse)();
  }

  return {
    init,resume,
    weaponSound,
    enemy_explode,enemy_explode_big,
    player_hit,
    pickup_coin,pickup_health,pickup_powerup,
    level_up,wave_start,
    boss_spawn,boss_phase2,boss_die,
    special_nova,game_over,
    ui_click,combo_hit,
    startMusic,stopMusic,
    toggleMute,isMuted,
  };
})();

window.openSettings=openSettings;window.closeSettings=closeSettings;
window.saveSettings=saveSettings;window.resetSettings=resetSettings;
window.toggleSetting=toggleSetting;
window.openShop=openShop;window.closeShop=closeShop;

window.startGame=startGame;window.doSpecial=doSpecial;window.cycleWeapon=cycleWeapon;window.upgrade=upgrade;
window.showEndLeaderboard=showEndLeaderboard;

/* ═══════════════════════════════════════════════
   API MODULE — Server + Database Integration
   Server চালু না থাকলে silently fail করবে
   ════════════════════════════════════════════════ */
const API = (() => {
  const BASE = ''; // same-origin — Flask serves both HTML and API

  // ── Callsign helper ──
  function getCallsign() {
    return (($id('callsignInput') && $id('callsignInput').value) || '').trim().toUpperCase() || getOrCreateDefaultCallsign();
  }
  function getShipName() {
    const s = PILOT_SHIPS[typeof selectedShip !== 'undefined' ? selectedShip : 0];
    return s ? s.name : 'VIPER';
  }
  function getAvatarEmoji() {
    const avatars = ['🚀','👾','🛸','⚡','🔥','💀','🌀','🎯'];
    try {
      const stored = localStorage.getItem('dsc_avatar');
      if (stored) return stored;
    } catch(e){}
    return avatars[0];
  }

  // ── Generic fetch wrapper — never throws ──
  async function apiFetch(path, opts = {}) {
    try {
      const res = await fetch(BASE + path, {
        headers: { 'Content-Type': 'application/json' },
        ...opts
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      // Server offline — silent fail
      return null;
    }
  }

  // ── Save run after game over ──
  async function saveRun() {
    const callsign = getCallsign();
    const body = {
      callsign,
      avatar:  getAvatarEmoji(),
      score:   G.score  || 0,
      wave:    G.wave   || 1,
      kills:   G.kills  || 0,
      combo:   G.maxCombo || 0,
      coins:   G.coins  || 0,
      ship:    getShipName(),
    };
    const data = await apiFetch('/api/run', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    if (!data) return;
    if (data.new_best) {
      setTimeout(() => toast_('🏆 NEW PERSONAL BEST SAVED!'), 600);
    }
    // Refresh lobby stats after save
    if (typeof refreshLobbyStats === 'function') setTimeout(refreshLobbyStats, 800);
  }

  // ── Save score (simple endpoint) ──
  function saveScore(score) {
    fetch('/save_score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        player: "player1",
        score: score
      })
    });
  }

  // ── Load player profile ──
  async function loadPlayer(callsign) {
    if (!callsign) callsign = getCallsign();
    return await apiFetch('/api/player/' + encodeURIComponent(callsign));
  }

  // ── Load leaderboard ──
  async function loadLeaderboard(limit = 10) {
    return await apiFetch('/api/leaderboard?limit=' + limit);
  }

  // ── Global stats ──
  async function loadStats() {
    return await apiFetch('/api/stats');
  }

  // ── Show leaderboard overlay inside lobby ──
  async function showLeaderboard() {
    let el = $id('lbyLeaderboard');
    if (!el) {
      el = document.createElement('div');
      el.id = 'lbyLeaderboard';
      el.style.cssText = `
        position:fixed;inset:0;z-index:200;
        background:rgba(0,2,14,0.97);
        display:flex;flex-direction:column;align-items:center;
        overflow-y:auto;padding:20px 12px 40px;
        font-family:'Courier New',monospace;
      `;
      el.innerHTML = `
        <div style="font-size:clamp(14px,4vw,22px);letter-spacing:6px;color:#00e5ff;
          text-shadow:0 0 20px #00e5ff;margin-bottom:4px;font-weight:900;">🏆 LEADERBOARD</div>
        <div style="font-size:8px;letter-spacing:3px;color:rgba(0,229,255,0.35);margin-bottom:18px;">GLOBAL TOP PILOTS</div>
        <div id="lbyLbRows" style="width:100%;max-width:440px;display:flex;flex-direction:column;gap:6px;">
          <div style="color:rgba(0,229,255,0.4);font-size:10px;letter-spacing:2px;text-align:center;">LOADING...</div>
        </div>
        <div onclick="document.getElementById('lbyLeaderboard').remove()"
          style="margin-top:24px;padding:12px 36px;border:1px solid rgba(0,229,255,0.3);
          border-radius:5px;color:#00e5ff;letter-spacing:4px;font-size:11px;
          cursor:pointer;font-weight:700;">✕ CLOSE</div>
      `;
      document.body.appendChild(el);
    } else {
      el.style.display = 'flex';
    }

    const data = await loadLeaderboard(20);
    const container = $id('lbyLbRows');
    if (!container) return;

    if (!data || !data.board || data.board.length === 0) {
      container.innerHTML = `<div style="color:rgba(255,100,100,0.7);font-size:10px;letter-spacing:2px;text-align:center;">
        NO SCORES YET — BE THE FIRST!</div>`;
      return;
    }

    const myCS = getCallsign();
    const rankColors = ['#ffd700','#c0c0c0','#cd7f32'];

    container.innerHTML = data.board.map((p, i) => {
      const isMe = p.callsign === myCS;
      const rc = rankColors[i] || 'rgba(0,229,255,0.6)';
      return `<div style="
        display:flex;align-items:center;gap:10px;
        background:${isMe ? 'rgba(0,229,255,0.08)' : 'rgba(0,5,18,0.7)'};
        border:1px solid ${isMe ? 'rgba(0,229,255,0.4)' : 'rgba(0,229,255,0.1)'};
        border-radius:5px;padding:8px 12px;
      ">
        <div style="color:${rc};font-weight:900;font-size:13px;width:28px;text-align:center;">#${p.rank}</div>
        <div style="font-size:18px;">${p.avatar || '🚀'}</div>
        <div style="flex:1;min-width:0;">
          <div style="color:${isMe ? '#00e5ff' : '#fff'};font-weight:900;font-size:12px;
            letter-spacing:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${p.callsign}${isMe ? ' ◀ YOU' : ''}
          </div>
          <div style="color:rgba(0,229,255,0.4);font-size:8px;letter-spacing:1px;margin-top:1px;">
            WAVE ${p.best_wave} · ${p.total_kills} KILLS · ${p.games_played} GAMES
          </div>
        </div>
        <div style="color:#ffdd00;font-weight:900;font-size:13px;letter-spacing:1px;white-space:nowrap;">
          ${Number(p.best_score).toLocaleString()}
        </div>
      </div>`;
    }).join('');
  }

  // ══════════════════════════════════════════════
  // ── DAILY REWARD SYSTEM v2 ──
  // Rewards: coins + weapons + titles + XP boosts + shield upgrades
  // ══════════════════════════════════════════════

  // 7-day reward table — each entry has multiple reward components
  const DAILY_REWARD_TABLE = [
    { // Day 1
      label: 'STARTER PACK',
      color: '#00e5ff',
      icon: '🎁',
      rewards: [
        { type: 'coins',  amount: 50,  label: '◈ 50 COINS' },
        { type: 'xpBoost', amount: 1, label: '⚡ XP BOOST ×1.5 (1 run)' },
      ]
    },
    { // Day 2
      label: 'SUPPLY DROP',
      color: '#00ff88',
      icon: '📦',
      rewards: [
        { type: 'coins',  amount: 80,  label: '◈ 80 COINS' },
        { type: 'shield', amount: 20,  label: '🛡 +20 MAX SHIELD (temp)' },
      ]
    },
    { // Day 3
      label: 'WEAPON CACHE',
      color: '#ff8800',
      icon: '⚔️',
      rewards: [
        { type: 'coins',   amount: 100, label: '◈ 100 COINS' },
        { type: 'weapon',  name: 'LASER', label: '💚 FREE WEAPON: LASER' },
      ]
    },
    { // Day 4
      label: 'COMMANDER KIT',
      color: '#aa44ff',
      icon: '🔮',
      rewards: [
        { type: 'coins',  amount: 125, label: '◈ 125 COINS' },
        { type: 'title',  value: '◆ COMMANDER', label: '🏅 TITLE: COMMANDER' },
        { type: 'xpBoost', amount: 2, label: '⚡ XP BOOST ×2 (1 run)' },
      ]
    },
    { // Day 5
      label: 'ARMS DEPOT',
      color: '#ff3366',
      icon: '🚀',
      rewards: [
        { type: 'coins',  amount: 175, label: '◈ 175 COINS' },
        { type: 'weapon', name: 'MISSILE', label: '🚀 FREE WEAPON: MISSILE' },
        { type: 'shield', amount: 30,  label: '🛡 +30 MAX SHIELD (temp)' },
      ]
    },
    { // Day 6
      label: 'ELITE BUNDLE',
      color: '#ffdd00',
      icon: '⭐',
      rewards: [
        { type: 'coins',  amount: 250, label: '◈ 250 COINS' },
        { type: 'weapon', name: 'RAILGUN', label: '⚡ FREE WEAPON: RAILGUN' },
        { type: 'title',  value: '★ ELITE PILOT', label: '🏅 TITLE: ELITE PILOT' },
      ]
    },
    { // Day 7 — MEGA reward
      label: '🔥 LEGENDARY REWARD',
      color: '#ff2200',
      icon: '👑',
      rewards: [
        { type: 'coins',   amount: 400, label: '◈ 400 COINS' },
        { type: 'weapon',  name: 'EMP',  label: '☢️ FREE WEAPON: EMP' },
        { type: 'title',   value: '👑 LEGEND', label: '🏅 TITLE: LEGEND' },
        { type: 'xpBoost', amount: 3,   label: '⚡ XP BOOST ×3 (1 run)' },
      ]
    },
  ];

  function getDailyRewardInfo() {
    try {
      const lastClaim = parseInt(localStorage.getItem('exomniaDailyLast') || '0');
      const streak    = parseInt(localStorage.getItem('exomniaDailyStreak') || '0');
      const lastDate  = new Date(lastClaim);
      const now       = new Date();
      const claimed   = lastDate.toDateString() === now.toDateString();
      const dayDiff   = lastClaim ? Math.floor((now - lastDate) / 86400000) : 99;
      const activeStreak = claimed ? streak : (dayDiff <= 1 ? streak : 0);
      const dayIdx    = Math.min(activeStreak % 7, 6);
      return { claimed, streak: activeStreak, dayIdx, entry: DAILY_REWARD_TABLE[dayIdx] };
    } catch(e) {
      return { claimed: false, streak: 0, dayIdx: 0, entry: DAILY_REWARD_TABLE[0] };
    }
  }

  function applyDailyRewards(entry) {
    entry.rewards.forEach(r => {
      if (r.type === 'coins') {
        setLbyCoins(getLbyCoins() + r.amount);
        const el = $id('lbyCoinDisplay');
        if (el) el.textContent = getLbyCoins();
      }
      if (r.type === 'weapon') {
        const w = WEAPONS.find(x => x.name === r.name);
        if (w && !w.owned) { w.owned = true; saveOwnedWeapons(); }
      }
      if (r.type === 'title') {
        try { localStorage.setItem('exomniaTitle', r.value); } catch(e) {}
        const rankEl = $id('pilotRank');
        if (rankEl) rankEl.textContent = r.value;
      }
      if (r.type === 'xpBoost') {
        try { localStorage.setItem('exomniaXpBoost', r.amount.toString()); } catch(e) {}
      }
      if (r.type === 'shield') {
        try { localStorage.setItem('exomniaBonusShield', r.amount.toString()); } catch(e) {}
      }
    });
  }

  function claimDailyReward() {
    const info = getDailyRewardInfo();
    if (info.claimed) { toast_('◈ ALREADY CLAIMED TODAY! COME BACK TOMORROW.'); return; }
    const newStreak = info.streak + 1;
    try {
      localStorage.setItem('exomniaDailyLast', Date.now().toString());
      localStorage.setItem('exomniaDailyStreak', newStreak.toString());
    } catch(e) {}
    applyDailyRewards(info.entry);
    showDailyRewardModal(info.entry, newStreak);
    // Update button state
    const btn = $id('lbyDailyBtn');
    if (btn) setDailyBtnClaimed(btn);
  }

  function showDailyRewardModal(entry, streakDay) {
    // Remove existing
    const old = $id('dailyRewardModal');
    if (old) old.remove();

    const isLegendary = (streakDay % 7 === 0);
    const streakStars = Array.from({length: 7}, (_, i) => {
      const filled = i < (streakDay % 7 === 0 ? 7 : streakDay % 7);
      return `<div style="
        width:28px;height:28px;border-radius:50%;
        border:1px solid ${filled ? entry.color : 'rgba(255,255,255,0.15)'};
        background:${filled ? entry.color + '33' : 'rgba(0,0,0,0.3)'};
        display:flex;align-items:center;justify-content:center;
        font-size:12px;color:${filled ? entry.color : 'rgba(255,255,255,0.2)'};
        box-shadow:${filled ? '0 0 10px ' + entry.color + '55' : 'none'};
        transition:.3s;
      ">${filled ? '◆' : '◇'}</div>`;
    }).join('');

    const rewardRows = entry.rewards.map(r => `
      <div style="
        display:flex;align-items:center;gap:10px;
        background:rgba(0,0,0,0.3);
        border:1px solid ${entry.color}33;
        border-radius:6px;padding:10px 14px;
        animation: rewardSlideIn 0.4s ease forwards;
      ">
        <div style="font-size:20px;">${r.label.split(' ')[0]}</div>
        <div style="
          font-family:'Courier New',monospace;font-size:11px;font-weight:900;
          letter-spacing:2px;color:${entry.color};
        ">${r.label.replace(/^[^\s]+\s/, '')}</div>
      </div>
    `).join('');

    const modal = document.createElement('div');
    modal.id = 'dailyRewardModal';
    modal.style.cssText = `
      position:fixed;inset:0;z-index:500;
      background:rgba(0,2,14,0.96);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      backdrop-filter:blur(10px);
      animation:drModalIn 0.35s cubic-bezier(0.34,1.56,0.64,1);
    `;
    modal.innerHTML = `
      <style>
        @keyframes drModalIn { from{opacity:0;transform:scale(0.85)} to{opacity:1;transform:scale(1)} }
        @keyframes rewardSlideIn { from{opacity:0;transform:translateX(-18px)} to{opacity:1;transform:translateX(0)} }
        @keyframes drShine { 0%,100%{opacity:0.6} 50%{opacity:1} }
        @keyframes drFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        #drBigIcon { animation: drFloat 2s ease-in-out infinite; display:inline-block; }
      </style>
      <div style="
        background:linear-gradient(160deg,rgba(0,12,34,0.99),rgba(0,5,20,0.99));
        border:1px solid ${entry.color}55;
        border-radius:16px;
        padding:28px 22px 22px;
        width:min(340px,90vw);
        display:flex;flex-direction:column;align-items:center;gap:16px;
        box-shadow:0 0 40px ${entry.color}22, inset 0 1px 0 rgba(255,255,255,0.06);
      ">
        <!-- Header -->
        <div style="font-family:'Courier New',monospace;font-size:9px;letter-spacing:5px;
          color:${entry.color};opacity:0.6;">DAY ${streakDay} REWARD</div>
        <div id="drBigIcon" style="font-size:52px;line-height:1;">${entry.icon}</div>
        <div style="font-family:'Courier New',monospace;font-weight:900;
          font-size:clamp(13px,4vw,18px);letter-spacing:4px;color:${entry.color};
          text-shadow:0 0 20px ${entry.color};text-align:center;">
          ${entry.label}
        </div>

        <!-- Streak bar -->
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:center;">
          ${streakStars}
        </div>
        <div style="font-family:'Courier New',monospace;font-size:8px;letter-spacing:3px;
          color:rgba(255,255,255,0.3);">
          ${streakDay % 7 === 0 ? '🔥 STREAK COMPLETE — RESETS TOMORROW' : streakDay + ' DAY STREAK'}
        </div>

        <!-- Rewards -->
        <div style="width:100%;display:flex;flex-direction:column;gap:8px;margin-top:4px;">
          ${rewardRows}
        </div>

        <!-- Claim button -->
        <div onclick="document.getElementById('dailyRewardModal').remove()"
          style="
            margin-top:6px;width:100%;padding:14px 0;
            border:1px solid ${entry.color}88;
            border-radius:8px;
            background:linear-gradient(135deg,${entry.color}18,${entry.color}08);
            font-family:'Courier New',monospace;font-weight:900;
            font-size:13px;letter-spacing:5px;color:${entry.color};
            text-align:center;cursor:pointer;
            box-shadow:0 0 20px ${entry.color}22;
            transition:all 0.2s;
          "
          onmouseover="this.style.background='${entry.color}28'"
          onmouseout="this.style.background='linear-gradient(135deg,${entry.color}18,${entry.color}08)'"
        >✔ CLAIM REWARDS</div>
      </div>
    `;
    document.body.appendChild(modal);
    // Close on backdrop tap
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  }

  function showDailyRewardPreview() {
    const info = getDailyRewardInfo();
    showDailyRewardModal(info.entry, info.streak + (info.claimed ? 0 : 1));
  }

  function setDailyBtnClaimed(btn) {
    btn.style.cssText += `
      opacity:1;cursor:not-allowed;
      border-color:rgba(0,229,255,0.25);
      background:rgba(0,5,18,0.6);
      overflow:hidden;position:relative;
    `;
    btn.innerHTML = `
      <div style="
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        gap:1px;width:100%;height:100%;
        font-family:'Courier New',monospace;
      ">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="rgba(0,229,255,0.35)" stroke-width="1.5"/>
          <path d="M7 12.5l3.5 3.5 6.5-7" stroke="#00e5ff" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round"
            style="filter:drop-shadow(0 0 4px #00e5ff)"/>
        </svg>
        <span style="
          font-size:6px;letter-spacing:1.5px;color:rgba(0,229,255,0.55);
          font-weight:900;line-height:1;
        ">DONE</span>
        <span style="
          font-size:5px;letter-spacing:0.8px;color:rgba(0,229,255,0.3);
          line-height:1;
        ">TOMORROW</span>
      </div>
    `;
    btn.onclick = () => toast_('◈ COME BACK TOMORROW FOR YOUR NEXT REWARD!');
  }

  function injectDailyRewardButton() {
    const tryInject = () => {
      const btnRow = $id('lbyBtnRow');
      if (!btnRow) { setTimeout(tryInject, 400); return; }
      if ($id('lbyDailyBtn')) return;
      const info = getDailyRewardInfo();
      const btn = document.createElement('div');
      btn.id = 'lbyDailyBtn';
      btn.className = 'lby-action-btn';
      btn.style.cssText = `
        flex:none;width:52px;padding:10px 0;border-radius:7px;
        font-size:20px;cursor:pointer;
        border:1px solid rgba(255,200,0,0.45);
        background:linear-gradient(145deg,rgba(255,200,0,0.10),rgba(255,200,0,0.03));
        display:flex;align-items:center;justify-content:center;
        touch-action:manipulation;
        transition:opacity 0.3s;
        ${info.claimed ? 'opacity:0.4;cursor:not-allowed;' : ''}
      `;
      btn.innerHTML = info.claimed ? '' : '🎁';
      if (info.claimed) setDailyBtnClaimed(btn);
      btn.title = info.claimed ? 'Come back tomorrow!' : 'DAILY REWARD — tap to claim!';
      btn.onclick = info.claimed
        ? () => toast_('◈ ALREADY CLAIMED TODAY! COME BACK TOMORROW.')
        : () => claimDailyReward();
      // Insert before leaderboard button or append
      const lbBtn = $id('lbyLbBtn');
      if (lbBtn) btnRow.insertBefore(btn, lbBtn);
      else btnRow.appendChild(btn);
    };
    tryInject();
  }

  // ── Inject leaderboard button into lobby ──
  function injectLobbyButton() {
    // Wait for lobby DOM
    const tryInject = () => {
      const btnRow = $id('lbyBtnRow');
      if (!btnRow) { setTimeout(tryInject, 400); return; }
      if ($id('lbyLbBtn')) return; // already injected

      const btn = document.createElement('div');
      btn.id = 'lbyLbBtn';
      btn.className = 'lby-action-btn';
      btn.style.cssText = `
        flex:none;width:52px;padding:10px 0;border-radius:7px;
        font-size:20px;cursor:pointer;
        border:1px solid rgba(255,204,0,0.35);
        background:linear-gradient(145deg,rgba(255,204,0,0.07),rgba(255,204,0,0.02));
        display:flex;align-items:center;justify-content:center;
        touch-action:manipulation;
      `;
      btn.innerHTML = '🏆';
      btn.title = 'Leaderboard';
      btn.onclick = () => showLeaderboard();
      btnRow.appendChild(btn);
    };
    tryInject();
  }

  // ── Ping server & show connection status ──
  async function checkServer() {
    // Always inject daily reward button (works offline too)
    injectDailyRewardButton();
    const data = await apiFetch('/api/ping');
    if (data && data.ok) {
      console.log('%c[DSC Server] Online ✓', 'color:#00e5ff;font-weight:bold');
      injectLobbyButton();
    } else {
      console.warn('[DSC Server] Offline — scores will not be saved');
    }
  }

  // ── Refresh lobby stats from server ──
  async function syncLobbyStats() {
    const cs = getCallsign();
    if (!cs) return;
    const data = await loadPlayer(cs);
    if (!data || !data.player) return;
    const p = data.player;

    // Update lobby stat display elements if they exist
    const map = {
      'lbyStatGames': p.games_played,
      'lbyStatBest':  Number(p.best_score).toLocaleString(),
      'lbyStatKills': p.total_kills,
      'lbyRankBadge': p.rank ? '#' + p.rank + ' GLOBAL' : null,
    };
    for (const [id, val] of Object.entries(map)) {
      const el = $id(id);
      if (el && val !== null) el.textContent = val;
    }
  }

  // Public API
  return { saveRun, saveScore, loadPlayer, loadLeaderboard, loadStats, showLeaderboard, checkServer, syncLobbyStats, claimDailyReward, getDailyRewardInfo, injectDailyRewardButton, showDailyRewardPreview };
})();

/* ═══ BOOT ═══ */
window.addEventListener('load',()=>{
  loadOwnedWeapons();
  initBG();updateSkillDots();updateWeaponHUD();
  // ── Connect to server ──
  API.checkServer();

  /* ── JS Safe-area fallback for browsers that ignore env() in CSS ──
     Reads the ctrl bar's actual rendered height, then repositions
     floating elements (xpWrap, minimap, puPanel, bossHUD) above it.
     This covers: Samsung Internet, UC Browser, old Firefox, Opera Mini */
  function fixBottomElements(){
    const ctrl = $id('ctrl');
    const ctrlH = ctrl ? ctrl.getBoundingClientRect().height : 148;
    const aboveCtrl = Math.ceil(ctrlH) + 4; // 4px gap

    const xpWrap   = $id('xpWrap');
    const minimap  = $id('minimap');
    const puPan    = $id('puPanel');
    const bHUD     = $id('bossHUD');

    if(xpWrap)   xpWrap.style.bottom  = aboveCtrl + 'px';
    if(puPan)    puPan.style.bottom   = aboveCtrl + 'px';
    if(bHUD)     bHUD.style.bottom    = (aboveCtrl + 10) + 'px';

    // Position minimap just below skillPanel
    const skillPanel = $id('skillPanel');
    if(minimap && skillPanel){
      const sr = skillPanel.getBoundingClientRect();
      minimap.style.top = (sr.bottom + 6) + 'px';
      minimap.style.width = sr.width + 'px';
      minimap.style.height = sr.width + 'px';
      minimap.style.bottom = '';
    }
  }

  // Run on load, resize, and orientation change
  fixBottomElements();
  window.addEventListener('resize', fixBottomElements);
  window.addEventListener('orientationchange', ()=>setTimeout(fixBottomElements, 300));
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize', fixBottomElements);
  }

  setTimeout(()=>{
    $id('loading').classList.add('out');
    setTimeout(()=>{
      $id('loading').style.display='none';
      // Show lobby after loading — add 'visible' to fade it in smoothly
      startSc.classList.add('gone');
      const lobbyEl=$id('lobbyScreen');
      if(lobbyEl){lobbyEl.classList.remove('gone');requestAnimationFrame(()=>lobbyEl.classList.add('visible'));}
      // Remove black cover now that lobby is visible
      const cover=$id('blackCover');
      if(cover) cover.style.display='none';
      refreshLobbyStats();
    },1000);
  },2800);

  // Animated percentage counter
  const pctEl=$id('loadPct');
  const statMsgs=['INITIALIZING SYSTEMS...','LOADING ASSETS...','CALIBRATING WEAPONS...','CHARTING SECTORS...','ENGAGING DRIVES...','READY'];
  let pct=0,msgI=0;
  const pctTimer=setInterval(()=>{
    pct=Math.min(100,pct+(Math.random()<.4?Math.floor(Math.random()*8)+1:Math.floor(Math.random()*3)));
    if(pctEl)pctEl.textContent=pct+'%';
    const mi=Math.floor(pct/20);
    if(mi!==msgI&&mi<statMsgs.length){msgI=mi;const s=$id('lsub');if(s)s.textContent=statMsgs[mi];}
    if(pct>=100){clearInterval(pctTimer);const s=$id('lsub');if(s)s.textContent='READY';}
  },55);
  requestAnimationFrame(loop);
});

/* ==================================================================
   VARIETY PACK v2 (hardened)
   Adds: per-biome hazards, bonus side-objectives per wave,
   pre-launch run modifiers, and a refreshed lobby (daily sector
   banner + top-3 pilots preview).
   The whole block is wrapped in try/catch and only patches
   functions that actually exist, so it can never break the base
   game even if something inside it fails.
   ================================================================== */
try{(function(){

  function safe(fn){ try{ fn(); }catch(e){ console.error('[VarietyPack]', e); } }

  /* ---------- 1. BIOME HAZARDS ---------- */
  var BIOME_HAZARDS={
    'DEEP SPACE':     {label:'METEOR SHOWER'},
    'ASTEROID FIELD': {label:'DEBRIS SURGE'},
    'NEBULA STORM':   {label:'SENSOR STATIC'},
    'CRIMSON WASTES': {label:'SOLAR FLARE'},
    'ICE EXPANSE':    {label:'CRYO DRIFT'},
    'DERELICT RUINS': {label:'EMP SURGE'}
  };

  function hzInit(){
    if(typeof G==='undefined'||!G)return;
    G._hz={nextT:rnd(7000,11000),active:false,activeUntil:0,biome:null,flareX:0,flareW:0,flareWarn:0};
  }
  safe(hzInit);

  function tickBiomeHazard(dt){
    if(!G.alive||G.paused||G.over)return;
    if(!G._hz)hzInit();
    if(!G._hz)return;
    var bm=getBiome();
    if(G._hz.biome!==bm.name){G._hz.biome=bm.name;G._hz.nextT=rnd(6000,10000);G._hz.active=false;}
    var hz=BIOME_HAZARDS[bm.name];
    if(!hz)return;
    if(!G._hz.active){
      G._hz.nextT-=dt;
      if(G._hz.nextT<=0){
        G._hz.active=true;
        G._hz.activeUntil=2600;
        toast_(hz.label+'!');
        if(bm.name==='DEEP SPACE'){ G._astTimer=0; }
        else if(bm.name==='ASTEROID FIELD'){ G._astTimer=0; G._hz.activeUntil=3600; }
        else if(bm.name==='NEBULA STORM'){ CV.style.filter='blur(1.2px) brightness(.72)'; }
        else if(bm.name==='CRIMSON WASTES'){ G._hz.flareX=rnd(60,CV.width-60); G._hz.flareW=90; G._hz.flareWarn=1200; }
        else if(bm.name==='ICE EXPANSE'){ G.pvx=(G.pvx||0)+rnd(-1.4,1.4); G.pvy=(G.pvy||0)+rnd(-.6,.6); }
        else if(bm.name==='DERELICT RUINS'){ G.spCD=Math.max(G.spCD||0,1800); }
      }
    } else {
      G._hz.activeUntil-=dt;
      if(bm.name==='CRIMSON WASTES'){
        if(G._hz.flareWarn>0){ G._hz.flareWarn-=dt; }
        else if(G.invT<=0 && Math.abs(G.px-G._hz.flareX)<G._hz.flareW/2){ hitPlayer(4); }
      }
      if(G._hz.activeUntil<=0){
        G._hz.active=false;
        G._hz.nextT=rnd(9000,15000);
        if(bm.name==='NEBULA STORM'){ CV.style.filter=''; }
      }
    }
  }

  function drawBiomeHazardOverlay(){
    if(!G.alive||G.over)return;
    if(!G._hz||!G._hz.active)return;
    var bm=getBiome();
    if(bm.name==='CRIMSON WASTES'){
      var warn=G._hz.flareWarn>0;
      CX.save();
      CX.globalAlpha=warn?0.25+0.15*Math.sin(G.frame*0.3):0.35;
      var grad=CX.createLinearGradient(G._hz.flareX-G._hz.flareW/2,0,G._hz.flareX+G._hz.flareW/2,0);
      grad.addColorStop(0,'rgba(255,60,0,0)');
      grad.addColorStop(.5,warn?'rgba(255,140,0,0.55)':'rgba(255,40,0,0.7)');
      grad.addColorStop(1,'rgba(255,60,0,0)');
      CX.fillStyle=grad;
      CX.fillRect(G._hz.flareX-G._hz.flareW/2,0,G._hz.flareW,CV.height);
      CX.restore();
    }
  }

  /* ---------- 2. BONUS SIDE-OBJECTIVES ---------- */
  var OBJ_TYPES=[
    {type:'NOHIT', label:'FLAWLESS WAVE', desc:'Clear without taking damage', reward:120},
    {type:'SPEED', label:'RAPID CLEAR',  desc:'Clear this wave in under 22s', reward:100},
    {type:'ACE',   label:'ACE STREAK',   desc:'Reach an 8+ combo this wave',  reward:90}
  ];

  function maybeAssignObjective(){
    if(G.wave%3===0||G.wave<=1){G._obj=null;updateObjHUD();return;}
    if(Math.random()<0.65){
      var def=OBJ_TYPES[Math.floor(Math.random()*OBJ_TYPES.length)];
      G._obj={type:def.type,label:def.label,desc:def.desc,reward:def.reward,
        startShield:G.shield,startLives:G.lives,t0:performance.now(),comboSeen:0,done:false,failed:false};
      toast_('SIDE OBJECTIVE: '+def.label);
    } else {
      G._obj=null;
    }
    updateObjHUD();
  }

  function tickObjective(){
    if(!G._obj||G._obj.done||G._obj.failed)return;
    var o=G._obj;
    if(o.type==='NOHIT'&&(G.shield<o.startShield-0.5||G.lives<o.startLives)){o.failed=true;updateObjHUD();}
    if(o.type==='ACE'&&G.combo>o.comboSeen)o.comboSeen=G.combo;
  }

  function completeObjectiveOnWaveClear(){
    var o=G._obj;
    if(!o||o.done||o.failed)return;
    var ok=false;
    if(o.type==='NOHIT')ok=(G.shield>=o.startShield-0.5&&G.lives>=o.startLives);
    else if(o.type==='SPEED')ok=(performance.now()-o.t0)<22000;
    else if(o.type==='ACE')ok=o.comboSeen>=8;
    if(ok){
      o.done=true;
      G.coins+=o.reward;coEl.textContent=fmtNum(G.coins);
      addScore(o.reward*4);
      toast_(o.label+' COMPLETE +'+o.reward+' COINS');
    } else {
      o.failed=true;
    }
    updateObjHUD();
  }

  function updateObjHUD(){
    var el=$id('objHUD');
    if(!el){
      el=document.createElement('div');
      el.id='objHUD';
      el.style.cssText='position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:40;'
        +'font-family:"Courier New",monospace;font-size:10px;letter-spacing:2px;padding:5px 12px;'
        +'border-radius:5px;background:rgba(0,10,20,0.55);border:1px solid rgba(0,229,255,0.35);'
        +'color:#00e5ff;pointer-events:none;white-space:nowrap;transition:opacity .2s;opacity:0;';
      document.body.appendChild(el);
    }
    var o=G._obj;
    if(!o||!G.alive||G.over){el.style.opacity='0';return;}
    el.style.opacity='1';
    el.textContent=o.label+(o.failed?' - FAILED':o.done?' - DONE':' - '+o.desc);
    el.style.color=o.failed?'#ff5566':o.done?'#00ff8c':'#00e5ff';
  }

  /* ---------- 3. RUN MODIFIERS ---------- */
  var RUN_MODIFIERS=[
    {id:'none',    name:'STANDARD',     desc:'No modifier - the classic run'},
    {id:'glass',   name:'GLASS CANNON', desc:'+30% damage, shield capacity -30%'},
    {id:'rush',    name:'ADRENALINE',   desc:'+25% move speed, enemies +15% speed'},
    {id:'greedy',  name:'GOLD RUSH',    desc:'+50% coin drops, enemy HP +20%'},
    {id:'ironman', name:'IRON WILL',    desc:'Only 1 life, but +40% score'}
  ];
  var selectedModifier='none';

  function applyRunModifier(id){
    if(id==='glass'){
      G._shipAtkMult=(G._shipAtkMult||0)+0.3;
      G.shMax=Math.round(G.shMax*0.7); G.shield=Math.min(G.shield,G.shMax);
      if(typeof updateShieldUI==='function')updateShieldUI();
    } else if(id==='rush'){
      G.pspd*=1.25; G._enemySpdMult=1.15;
    } else if(id==='greedy'){
      G._coinMult=1.5; G._enemyHpMult=1.2;
    } else if(id==='ironman'){
      G.lives=1; hpEl.textContent='1'; G._scoreMult=1.4;
    }
  }

  function buildModifierUI(){
    if($id('lbyModRow'))return;
    var modeRow=$id('lbyModeRow');
    if(!modeRow||!modeRow.parentNode)return;
    var wrap=document.createElement('div');
    wrap.id='lbyModRow';
    wrap.style.cssText='display:flex;gap:6px;overflow-x:auto;padding:8px 4px;margin:4px 0;';
    RUN_MODIFIERS.forEach(function(m,i){
      var chip=document.createElement('div');
      chip.className='lby-mod-chip';
      chip.dataset.mod=m.id;
      chip.title=m.desc;
      chip.style.cssText='flex:0 0 auto;padding:7px 10px;border-radius:6px;'
        +'border:1px solid '+(i===0?'#00e5ff':'rgba(0,229,255,0.25)')+';'
        +'background:'+(i===0?'rgba(0,229,255,0.18)':'rgba(0,229,255,0.05)')+';'
        +'color:'+(i===0?'#00e5ff':'rgba(0,229,255,0.7)')+';font-family:"Courier New",monospace;'
        +'font-size:10px;letter-spacing:1px;cursor:pointer;text-align:center;white-space:nowrap;';
      chip.textContent=m.name;
      chip.onclick=function(){
        selectedModifier=m.id;
        var chips=document.querySelectorAll('.lby-mod-chip');
        for(var j=0;j<chips.length;j++){
          chips[j].style.borderColor='rgba(0,229,255,0.25)';chips[j].style.background='rgba(0,229,255,0.05)';chips[j].style.color='rgba(0,229,255,0.7)';
        }
        chip.style.borderColor='#00e5ff';chip.style.background='rgba(0,229,255,0.18)';chip.style.color='#00e5ff';
        if(typeof showToast==='function')showToast(m.name+': '+m.desc);
      };
      wrap.appendChild(chip);
    });
    modeRow.parentNode.insertBefore(wrap,modeRow.nextSibling);
  }

  /* ---------- 4. LOBBY REFRESH ---------- */
  function buildLobbyBanner(){
    if($id('lbySectorBanner'))return;
    var topBar=$id('lbyTopBar');
    if(!topBar||!topBar.parentNode)return;
    var dayIdx=Math.floor(Date.now()/86400000)%BIOMES.length;
    var todayBiome=BIOMES[dayIdx];
    var banner=document.createElement('div');
    banner.id='lbySectorBanner';
    banner.style.cssText='margin:6px 4px 0;padding:7px 10px;border-radius:6px;'
      +'background:linear-gradient(90deg,rgba(0,229,255,0.1),transparent);'
      +'border:1px solid rgba(0,229,255,0.25);font-family:"Courier New",monospace;'
      +'font-size:10px;letter-spacing:2px;color:#00e5ff;display:flex;justify-content:space-between;align-items:center;';
    var left=document.createElement('span'); left.textContent='TODAY\'S SECTOR';
    var right=document.createElement('span'); right.style.color='#ffcc00'; right.textContent=todayBiome.name;
    banner.appendChild(left); banner.appendChild(right);
    topBar.parentNode.insertBefore(banner,topBar.nextSibling);
  }

  function buildTopPilotsPreview(){
    if(typeof API==='undefined'||!API.loadLeaderboard)return;
    var el=$id('lbyTop3');
    if(!el){
      el=document.createElement('div');
      el.id='lbyTop3';
      el.style.cssText='margin:4px 4px 0;padding:6px 10px;border-radius:6px;'
        +'background:rgba(0,10,20,0.4);border:1px solid rgba(0,229,255,0.15);'
        +'font-family:"Courier New",monospace;font-size:9px;letter-spacing:1px;color:rgba(0,229,255,0.6);'
        +'overflow-x:auto;white-space:nowrap;';
      var banner=$id('lbySectorBanner');
      if(banner&&banner.parentNode)banner.parentNode.insertBefore(el,banner.nextSibling);
      else{var topBar=$id('lbyTopBar');if(topBar&&topBar.parentNode)topBar.parentNode.insertBefore(el,topBar.nextSibling);}
    }
    el.textContent='LOADING TOP PILOTS...';
    API.loadLeaderboard(3).then(function(res){
      var board=res&&res.board;
      if(!board||!board.length){el.textContent='BE THE FIRST ON THE LEADERBOARD';return;}
      el.textContent=board.map(function(r,i){return '#'+(i+1)+' '+r.callsign+' - '+fmtNum(r.best_score);}).join('   |   ');
    }).catch(function(){el.textContent='LEADERBOARD UNAVAILABLE';});
  }

  /* ---------- WIRE EVERYTHING IN ---------- */
  if(typeof update==='function'){
    var _origUpdate=update;
    update=function(){
      _origUpdate();
      if(G.alive&&!G.paused&&!G.over){
        safe(function(){tickBiomeHazard(G.dt);});
        safe(tickObjective);
      }
    };
  }

  if(typeof draw==='function'){
    var _origDraw=draw;
    draw=function(){
      _origDraw();
      safe(drawBiomeHazardOverlay);
    };
  }

  if(typeof advWave==='function'){
    var _origAdvWave=advWave;
    advWave=function(){
      safe(completeObjectiveOnWaveClear);
      _origAdvWave();
      safe(maybeAssignObjective);
    };
  }

  if(typeof spawnEnemy==='function'){
    var _origSpawnEnemy=spawnEnemy;
    spawnEnemy=function(){
      var before=G.enemies.length;
      _origSpawnEnemy();
      if(G.enemies.length>before){
        var e=G.enemies[G.enemies.length-1];
        if(G._enemyHpMult&&G._enemyHpMult!==1){e.hp=Math.round(e.hp*G._enemyHpMult);e.maxHp=Math.round(e.maxHp*G._enemyHpMult);}
        if(G._enemySpdMult&&G._enemySpdMult!==1){e.dy*=G._enemySpdMult;}
      }
    };
  }

  if(typeof spawnFormation==='function'){
    var _origSpawnFormation=spawnFormation;
    spawnFormation=function(){
      var before=G.enemies.length;
      _origSpawnFormation();
      if(G._enemyHpMult&&G._enemyHpMult!==1||G._enemySpdMult&&G._enemySpdMult!==1){
        for(var i=before;i<G.enemies.length;i++){
          var e=G.enemies[i];
          if(G._enemyHpMult&&G._enemyHpMult!==1){e.hp=Math.round(e.hp*G._enemyHpMult);e.maxHp=Math.round(e.maxHp*G._enemyHpMult);}
          if(G._enemySpdMult&&G._enemySpdMult!==1){e.dy*=G._enemySpdMult;}
        }
      }
    };
  }

  if(typeof pickDrop==='function'){
    var _origPickDrop=pickDrop;
    pickDrop=function(d){
      var before=G.coins;
      _origPickDrop(d);
      if(d.type==='coin'&&G._coinMult&&G._coinMult!==1){
        var gained=G.coins-before;
        var extra=Math.round(gained*(G._coinMult-1));
        if(extra>0){G.coins+=extra;coEl.textContent=fmtNum(G.coins);}
      }
    };
  }

  if(typeof addScore==='function'){
    var _origAddScore=addScore;
    addScore=function(pts,x,y){
      var p=(G._scoreMult&&G._scoreMult!==1)?pts*G._scoreMult:pts;
      _origAddScore(p,x,y);
    };
  }

  if(typeof restartGame==='function'){
    var _origRestartGame=restartGame;
    restartGame=function(){
      _origRestartGame();
      safe(hzInit);
      G._obj=null;G._coinMult=1;G._enemyHpMult=1;G._enemySpdMult=1;G._scoreMult=1;
      if(CV)CV.style.filter='';
      safe(updateObjHUD);
    };
  }

  if(typeof launchFromLobby==='function'){
    var _origLaunchFromLobby=launchFromLobby;
    launchFromLobby=function(){
      _origLaunchFromLobby();
      safe(function(){applyRunModifier(selectedModifier);});
    };
  }

  window.addEventListener('load',function(){
    setTimeout(function(){
      safe(buildModifierUI);
      safe(buildLobbyBanner);
      safe(buildTopPilotsPreview);
    },3500);
  });

})();}catch(e){ console.error('[VarietyPack] failed to initialize:', e); }
