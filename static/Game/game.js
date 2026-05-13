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
    bossHp:0,bossMaxHp:0,bossX:0,bossY:110,bossDir:1,bossT:0,bossPhase:1,
    bossName:'DESTROYER',
    combo:0,comboT:0,
    spReady:true,spCD:0,spMax:9000,
    shakeAmt:0,shakeDecay:0,
    thrusterT:0,
    bullets:[],eBullets:[],enemies:[],particles:[],drops:[],railBeams:[],empBlasts:[],
    stars1:[],stars2:[],stars3:[],nebulae:[],
    activePU:{},
    joyOn:false,joyX:0,joyY:0,
    firing:false,
    dt:0,lastT:0,frame:0,
  };
}
initG();

/* ── BACKGROUND ── */
function initBG(){
  G.stars1=[];G.stars2=[];G.stars3=[];
  const starCols=['#ffffff','#ffffff','#ffffff','#cce8ff','#ffd8b0','#ffcccc','#ddeeff'];
  for(let i=0;i<110;i++)G.stars1.push({x:rnd(0,CV.width),y:rnd(0,CV.height),r:.25+Math.random()*.45,a:.15+Math.random()*.35,twinkleSpd:rnd(.4,1.5),twinkleOff:rnd(0,6.28),col:starCols[_floor(_rnd()*starCols.length)]});
  for(let i=0;i<65;i++)G.stars2.push({x:rnd(0,CV.width),y:rnd(0,CV.height),r:.55+Math.random()*.75,a:.3+Math.random()*.4,twinkleSpd:rnd(.3,1.2),twinkleOff:rnd(0,6.28),col:starCols[_floor(_rnd()*starCols.length)]});
  for(let i=0;i<30;i++)G.stars3.push({x:rnd(0,CV.width),y:rnd(0,CV.height),r:.9+Math.random()*1.3,a:.5+Math.random()*.4,twinkleSpd:rnd(.2,1.0),twinkleOff:rnd(0,6.28),col:starCols[_floor(_rnd()*starCols.length)],flare:Math.random()<.3});
  G.nebulae=[];
  const nc=['rgba(0,35,110','rgba(55,0,120','rgba(0,75,85','rgba(95,20,0','rgba(0,55,100','rgba(45,0,95','rgba(0,90,55','rgba(70,25,0'];
  for(let i=0;i<9;i++)G.nebulae.push({x:rnd(-80,CV.width+80),y:rnd(-80,CV.height+80),r:rnd(100,240),c:nc[i%nc.length],spd:.018+Math.random()*.035,drift:(Math.random()-.5)*.007,alpha:.06+Math.random()*.07,pulse:rnd(0,6.28),pulseSpd:rnd(.003,.01)});
  // Shooting stars pool
  G.shootingStars=[];G._ssTimer=rnd(3000,7000);
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
  for(let i=G.eBullets.length-1;i>=0;i--){const b=G.eBullets[i];b.y+=b.dy*f;b.x+=b.dx*f;if(b.y>ch+30||b.x<-20||b.x>cw+20||b.y<-20)G.eBullets.splice(i,1);}

  for(const e of G.enemies){
    e.t+=dt;
    const slowFactor=G.activePU.timeslow?0.3:1; // TIME SLOW power-up
    e.y+=e.dy*f*slowFactor;e.x+=e.dx*f*slowFactor;
    if(e.sway)e.x=e.bx+Math.sin(e.t*.002)*65;
    if(e.x<e.w/2||e.x>CV.width-e.w/2)e.dx*=-1;
    if(e.y>CV.height+60)e.hp=0;
    e.shotT+=dt;
    // Sniper fires less often but from far away
    const sr=e.type==='sniper'?3000:e.elite?1100:e.type==='tank'?2000:e.type==='fast'?1800:2400;
    if(e.shotT>sr){e.shotT=0;eFire(e);}
    if(G.frame%9===0&&G.particles.length<250){G.particles.push({x:e.x+rnd(-6,6),y:e.y-e.h*.4,vx:rnd(-.5,.5),vy:rnd(-1,-.3),r:rnd(1.5,3),c:e.elite?'#ff44aa':e.type==='sniper'?'#ff0000':'#ff4400',life:220,ml:220});}
  }
  for(let i=G.enemies.length-1;i>=0;i--){if(G.enemies[i].hp<=0)G.enemies.splice(i,1);}
  if(G.bossOn)updateBoss();

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
    for(const e of G.enemies){
      if(rectOverlap(G.px,G.py,G.pw*.7,G.ph*.7,e.x,e.y,e.w*.65,e.h*.65)){
        e.hp=0;burst(e.x,e.y,'#ff3355',12);hitPlayer(30);addScore(15,e.x,e.y);break;
      }
    }
  }
  if(G.combo>0){G.comboT-=dt;if(G.comboT<=0){G.combo=0;comboDiv.classList.remove('show');}}
  if(!G.spReady){
    G.spCD=Math.max(0,G.spCD-dt);
    if(G.frame%2===0){const deg=(1-G.spCD/G.spMax)*360;spCD.style.setProperty('--p',deg+'deg');}
    if(G.spCD<=0){G.spReady=true;spBtn.style.opacity='1';}
  }
  if(!G.bossOn&&!G.bossKilled&&G.enemies.length===0&&G.wSpawned>=G.wMax){
    if(G.wave%3===0)spawnBoss();else advWave();
  }
  if(!G.bossOn&&G.enemies.length<4&&G.wSpawned<G.wMax)spawnEnemy();
  for(const k in G.activePU){G.activePU[k]-=dt;if(G.activePU[k]<=0)delete G.activePU[k];}
  if(G.frame%3===0){updateWeaponHUD();updatePUPanel();}
}

/* ── FIRE ── */
function doFire(){
  const now=performance.now();
  const w=WEAPONS[G.wIdx];
  const baseRate=WEAPON_RATES[w.name]||150;
  const rate=baseRate*(1-G.sk.fireRate*.12)*(G.activePU.rapid?.5:1);
  if(now-G.lastFire<rate)return;
  G.lastFire=now;
  const crit=Math.random()<(.1+G.sk.critical*.1);
  const dmg=(w.dmg*(1+G.sk.damage*.25))*(crit?2.5:1)*(G.activePU.powerfull?2:1);

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
  const count=G.bossPhase===3?7:G.bossPhase===2?5:3;
  for(let i=0;i<count;i++){
    const a=((i-(count-1)/2)*18)*Math.PI/180;
    G.eBullets.push({x:G.bossX,y:G.bossY+60,dx:(dx/d*Math.cos(a)-dy/d*Math.sin(a))*sp,dy:(dx/d*Math.sin(a)+dy/d*Math.cos(a))*sp,dmg:G.bossPhase===3?30:20});
  }
  // Phase 3 adds a spiral ring shot every other fire
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
        G.bullets.splice(i,1);hit=true;
        if(e.hp<=0)killEnemy(e,j);break;
      }
    }
    if(hit)continue;
    if(G.bossOn&&rectOverlap(b.x,b.y,b.w,b.h,G.bossX,G.bossY,100,80)){
      G.bossHp-=b.dmg;spark(b.x,b.y,b.crit?'#ffcc00':'#ff6644');G.bullets.splice(i,1);
    }
  }
}

function killEnemy(e,j){
  G.enemies.splice(j,1);G.kills++;
  burst(e.x,e.y,e.elite?'#ff44aa':'#ff3355',e.type==='tank'?20:11);
  if(e.type==='tank'||e.elite) SFX.enemy_explode_big(); else SFX.enemy_explode();
  addScore(e.elite?100:e.type==='tank'?60:e.type==='fast'?35:25,e.x,e.y);
  addXP(e.elite?35:e.type==='tank'?22:16);
  addCombo();shake(e.type==='tank'?5:3,.6);
  if(Math.random()<.85)spawnDrop(e.x,e.y);
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

  if(r<.10&&w>=4){type='sniper';hp=60+w*12;spd=.5;ew=26;eh=36;} // NEW: sniper
  else if(r<.20&&w>=2){type='tank';hp=130+w*35;spd=.7;ew=46;eh=46;}
  else if(r<.38){type='fast';hp=45+w*10;spd=2.5;ew=28;eh=28;sway=true;}
  else{type='normal';hp=65+w*20;spd=1.3;ew=34;eh=34;}
  if(w>=3&&Math.random()<.22){elite=true;hp=Math.round(hp*2);}
  const bx=rnd(50,CV.width-50);
  G.enemies.push({x:bx,bx,y:-60,dx:(Math.random()-.5)*1.8,dy:spd,w:ew,h:eh,hp,maxHp:hp,type,sway,elite,shotT:rnd(400,2200),t:0});
  G.wSpawned++;
}

function spawnFormation(){
  // V-shape formation of 3 fast enemies
  const cx=rnd(80,CV.width-80);
  const positions=[{ox:0,oy:0},{ox:-45,oy:30},{ox:45,oy:30}];
  const w=G.wave;
  for(const p of positions){
    const hp=40+w*8;
    G.enemies.push({x:cx+p.ox,bx:cx+p.ox,y:-60+p.oy,dx:(Math.random()-.5)*1.2,dy:2.0,w:28,h:28,hp,maxHp:hp,type:'fast',sway:false,elite:false,shotT:rnd(600,2000),t:0,formation:true});
  }
  G.wSpawned+=3;
}

function spawnBoss(){
  const names=['DESTROYER','NEMESIS','VOIDLORD','ANNIHILATOR','OBLIVION','REAPER','APOCALYPSE'];
  G.bossName=names[Math.min(Math.floor(G.wave/3)-1,names.length-1)]||'DESTROYER';
  G.bossHp=1000+G.wave*300;G.bossMaxHp=G.bossHp;
  G.bossX=CV.width/2;G.bossY=110;G.bossDir=1;G.bossT=0;G.bossPhase=1;
  G.bossOn=true;
  SFX.boss_spawn();
  bossLbl.textContent='◆ '+G.bossName+' ◆';
  $id('bossPhaseLabel').textContent='PHASE I';
  bossHUD.classList.add('on');shake(20,1.5);
  toast_('☠ WARNING: '+G.bossName+' INCOMING!');
}

function advWave(){
  G.wave++;G.wSpawned=0;G.wMax=10+G.wave*3;G.bossKilled=false;
  SFX.wave_start();
  waveEl.textContent=G.wave;toast_('◈ WAVE '+G.wave+' — COMMENCE!');
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
  // Deep space gradient base
  const _bg=CX.createRadialGradient(CV.width*.45,CV.height*.35,0,CV.width*.45,CV.height*.35,Math.max(CV.width,CV.height)*.9);
  _bg.addColorStop(0,'#00050f');_bg.addColorStop(.5,'#000308');_bg.addColorStop(1,'#000104');
  CX.fillStyle=_bg;CX.fillRect(0,0,CV.width,CV.height);

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

  if(e.type==='tank'){
    drawEnemyTank(x,y,e,hp,t);
  } else if(e.type==='fast'){
    drawEnemyFast(x,y,e,hp,t);
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

/* ── TANK ENEMY: Heavy armored cruiser ── */
function drawEnemyTank(x,y,e,hp,t){
  const w=e.w,h=e.h;
  const col=e.elite?'#ff44aa':'#ff6600';
  const dark=e.elite?'#1a0010':'#1a0800';
  const mid=e.elite?'#3a0022':'#2e1200';

  glow(col,e.elite?18:12);

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
  cg.addColorStop(0,e.elite?'rgba(255,100,200,0.95)':'rgba(255,140,60,0.95)');
  cg.addColorStop(.5,e.elite?'rgba(180,30,100,0.5)':'rgba(180,80,0,0.5)');
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
  const col=e.elite?'#ff44aa':'#00ffcc';
  const dark=e.elite?'#0d0018':'#001a16';
  const mid=e.elite?'#2a0035':'#003a30';

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
  // main body
  CX.fillStyle=ph2?'#200008':'#1a0008';
  CX.beginPath();
  CX.moveTo(x,y-65+pulse);
  CX.bezierCurveTo(x+58,y-28,x+62,y+12,x+46,y+56);
  CX.lineTo(x-46,y+56);
  CX.bezierCurveTo(x-62,y+12,x-58,y-28,x,y-65+pulse);
  CX.fill();

  // body highlight
  CX.fillStyle='rgba(255,255,255,0.04)';
  CX.beginPath();CX.moveTo(x,y-65+pulse);CX.bezierCurveTo(x+25,y-40,x+30,y-10,x+5,y+20);CX.lineTo(x,y-65+pulse);CX.fill();

  // wings
  CX.fillStyle=ph2?'#300014':'#280010';
  CX.beginPath();CX.moveTo(x+42,y+12);CX.lineTo(x+108,y+62);CX.lineTo(x+62,y+60);CX.closePath();CX.fill();
  CX.beginPath();CX.moveTo(x-42,y+12);CX.lineTo(x-108,y+62);CX.lineTo(x-62,y+60);CX.closePath();CX.fill();

  // wing highlights
  CX.fillStyle='rgba(255,34,68,0.08)';
  CX.beginPath();CX.moveTo(x+42,y+12);CX.lineTo(x+108,y+62);CX.lineTo(x+75,y+36);CX.closePath();CX.fill();

  // outline
  CX.strokeStyle=ph2?'#ff4400':'#ff2244';CX.lineWidth=2;
  CX.beginPath();CX.moveTo(x,y-65+pulse);CX.bezierCurveTo(x+58,y-28,x+62,y+12,x+46,y+56);CX.lineTo(x-46,y+56);CX.bezierCurveTo(x-62,y+12,x-58,y-28,x,y-65+pulse);CX.closePath();CX.stroke();

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
    MX.fillStyle=e.elite?'#ff44aa':e.type==='tank'?'#ff6600':'#ff3355';
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

/* ═══ CONTROLS ═══ */
const jBase=$id('joyBase'),stk=$id('stick');
let jCX=0,jCY=0,jID=-1,_stkX=0,_stkY=0;
const JOY_MAX=36,JOY_DEAD=6; // dead zone = 6px
function jCenter(){const r=jBase.getBoundingClientRect();jCX=r.left+r.width/2;jCY=r.top+r.height/2;}
// recalc on resize too
window.addEventListener('resize',()=>{if(jID!==-1)jCenter();});
jBase.addEventListener('touchstart',e=>{
  e.preventDefault();jCenter();
  const t=e.changedTouches[0];jID=t.identifier;
  moveStk(t.clientX,t.clientY);G.joyOn=true;
  stk.style.boxShadow='0 0 0 1.5px #0a1820,0 0 0 3px #1a3045,0 0 0 4px #0a1520,0 4px 16px rgba(0,0,0,0.95),0 2px 6px rgba(0,0,0,0.8),inset 0 2px 3px rgba(255,255,255,0.12),inset 0 -2px 4px rgba(0,0,0,0.7),0 0 28px rgba(0,220,255,0.55),0 0 50px rgba(0,180,255,0.25)';
},{passive:false});
document.addEventListener('touchmove',e=>{
  for(const t of e.changedTouches){
    if(t.identifier===jID){e.preventDefault();moveStk(t.clientX,t.clientY);}
  }
},{passive:false});
document.addEventListener('touchend',e=>{
  for(const t of e.changedTouches){
    if(t.identifier===jID){
      jID=-1;G.joyOn=false;G.joyX=G.joyY=0;
      stk.style.transition='transform 0.15s cubic-bezier(0.25,0.46,0.45,0.94)';
      stk.style.transform='translate(-50%,-50%)';
      stk.style.boxShadow='0 0 0 1.5px #0a1820,0 0 0 3px #1a3045,0 0 0 4px #0a1520,0 4px 16px rgba(0,0,0,0.95),0 2px 6px rgba(0,0,0,0.8),inset 0 2px 3px rgba(255,255,255,0.12),inset 0 -2px 4px rgba(0,0,0,0.7),0 0 18px rgba(0,180,255,0.15)';
      setTimeout(()=>stk.style.transition='',160);
    }
  }
});
document.addEventListener('touchcancel',e=>{
  for(const t of e.changedTouches){
    if(t.identifier===jID){jID=-1;G.joyOn=false;G.joyX=G.joyY=0;stk.style.transform='translate(-50%,-50%)';}
  }
});
function moveStk(cx,cy){
  const dx=cx-jCX,dy=cy-jCY;
  const dist=Math.sqrt(dx*dx+dy*dy);
  const r=Math.min(dist,JOY_MAX);
  const a=Math.atan2(dy,dx);
  const sx=Math.cos(a)*r, sy=Math.sin(a)*r;
  // only update DOM if moved more than 0.5px (avoid layout thrash)
  if(Math.abs(sx-_stkX)>0.5||Math.abs(sy-_stkY)>0.5){
    _stkX=sx;_stkY=sy;
    stk.style.transform=`translate(calc(-50% + ${sx}px),calc(-50% + ${sy}px))`;
  }
  // dead zone: below CFG.deadZone px → no input
  if(dist<CFG.deadZone){G.joyX=0;G.joyY=0;}
  else{
    // remap: dist goes from deadZone to JOY_MAX → 0 to 1 (smooth ramp)
    const norm=Math.min((dist-CFG.deadZone)/(JOY_MAX-CFG.deadZone),1);
    G.joyX=(dx/dist)*norm;
    G.joyY=(dy/dist)*norm;
  }
}

const fBtn=$id('fireBtn');
fBtn.addEventListener('touchstart',e=>{e.preventDefault();G.firing=true;},{passive:false});
fBtn.addEventListener('touchend',e=>{e.preventDefault();G.firing=false;});
fBtn.addEventListener('mousedown',()=>G.firing=true);
fBtn.addEventListener('mouseup',()=>G.firing=false);

const K={};
document.addEventListener('keydown',e=>{
  K[e.code]=true;
  if(e.code==='Space'){e.preventDefault();G.firing=true;}
  if(e.code==='Escape')togglePause();
  if(e.code==='KeyE')doSpecial();
  if(e.code==='KeyQ')cycleWeapon();
});
document.addEventListener('keyup',e=>{K[e.code]=false;if(e.code==='Space')G.firing=false;});

let mDown=false;
CV.addEventListener('mousemove',e=>{if(!mDown||!G.alive||G.paused)return;G.px=e.clientX;G.py=clamp(e.clientY,G.ph/2,CV.height-140);});
CV.addEventListener('mousedown',()=>{mDown=true;G.firing=true;});
CV.addEventListener('mouseup',()=>{mDown=false;G.firing=false;});

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
  $id('lbyShipName').textContent=s.name;
  $id('lbyShipType').textContent=s.badge;
  $id('shipBarAtk').style.width=s.atk+'%';
  $id('shipBarSpd').style.width=s.spd+'%';
  $id('shipBarDef').style.width=s.def+'%';
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
      nm.className='hgr-name';nm.textContent=s.name;
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
        const item=document.createElement('div');
        item.className='shop-item'+(isOwned?' owned':'');
        const cv=document.createElement('canvas');
        cv.className='shop-item-canvas';cv.width=50;cv.height=60;
        const canAfford=coins>=s.price;
        const btnHTML=isOwned
          ?`<div class="shop-buy-btn owned-badge"><span class="shop-price">✔</span><span class="shop-price-lbl">OWNED</span></div>`
          :`<div class="shop-buy-btn buy" onclick="buyShip(${idx})" style="${canAfford?'':'opacity:.4;cursor:default'}"><span class="shop-price">◈${s.price}</span><span class="shop-price-lbl">BUY</span></div>`;
        item.innerHTML=`
          <div class="shop-item-info">
            <div class="shop-item-name">${s.name}</div>
            <div class="shop-item-type">${s.badge}</div>
            <div class="shop-item-bars">
              <div class="shop-bar-r"><span class="shop-bar-l">ATK</span><div class="shop-bar-t"><div class="shop-bar-f atk" style="width:${s.atk}%"></div></div></div>
              <div class="shop-bar-r"><span class="shop-bar-l">SPD</span><div class="shop-bar-t"><div class="shop-bar-f spd" style="width:${s.spd}%"></div></div></div>
              <div class="shop-bar-r"><span class="shop-bar-l">DEF</span><div class="shop-bar-t"><div class="shop-bar-f def" style="width:${s.def}%"></div></div></div>
            </div>
          </div>${btnHTML}`;
        item.insertBefore(cv,item.firstChild);
        grid.appendChild(item);
        setTimeout(()=>drawSingleShip(cv,s,50,60),0);
      });
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
          let badge;
          if(isOwned){
            badge=`<div class="shopPrice owned-lbl">✔ OWNED</div><div class="shopEquip" style="color:rgba(0,229,255,0.4)">AVAILABLE IN GAME</div>`;
          } else {
            badge=`<div class="shopPrice">◈ ${w.cost} COINS</div>`;
          }
          card.innerHTML=`<div class="shopIcon">${w.icon}</div>
            <div class="shopName">${w.name}</div>
            <div class="shopDesc">${w.desc}</div>
            <div class="shopStats">
              <div class="shopStat dmg">DMG ${w.dmg}</div>
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
            card.onclick=()=>showToast('✔ '+w.name+' ALREADY OWNED');
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
  const cs=($id('callsignInput').value||'').trim()||'PILOT';
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
  // Apply stat bonuses
  G.pspd=5*(1+(s.spd-60)/200);   // speed scaled around base 60
  G.shMax=100+(s.def-60)*0.5;    // defense adds shield capacity
  G.shield=Math.min(G.shield||100,G.shMax);
}
function applyModeBonuses(mode){
  G._selectedMode=mode;
}

function refreshLobbyStats(){
  try{
    const cs=localStorage.getItem('exomniaCallsign')||'';
    if(cs)$id('callsignInput').value=cs;
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
    if(G.score>bs)localStorage.setItem('exomniaBestScore',G.score);
    if(G.wave>bw)localStorage.setItem('exomniaBestWave',G.wave);
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
    card.innerHTML=`
      <div class="shopIcon">${w.icon}</div>
      <div class="shopName">${w.name}</div>
      <div class="shopDesc">${w.desc}</div>
      <div class="shopStats">
        <div class="shopStat dmg">DMG ${w.dmg}</div>
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
    return (($id('callsignInput') && $id('callsignInput').value) || '').trim().toUpperCase() || 'PILOT';
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
    if (!cs || cs === 'PILOT') return;
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
  return { saveRun, saveScore, loadPlayer, loadLeaderboard, loadStats, showLeaderboard, checkServer, syncLobbyStats };
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
