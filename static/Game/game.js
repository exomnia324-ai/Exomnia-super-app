'use strict';
const CV=document.getElementById('cv');
const CX=CV.getContext('2d');
const MM=document.getElementById('mmcv');
const MX=MM.getContext('2d');
const $id=id=>document.getElementById(id);
const hpEl=$id('hpV'),shEl=$id('shV'),scEl=$id('scV'),coEl=$id('coV');
const waveEl=$id('waveN'),comboBig=$id('comboBig');
const comboDiv=$id('combo'),shFill=$id('shieldFill'),xpFill=$id('xpFill');
const lvlBadge=$id('lvlBadge'),bossHUD=$id('bossHUD'),bossFill=$id('bossFill'),bossLbl=$id('bossLbl');
const lvlUp=$id('lvlUp'),pauseMenu=$id('pauseMenu'),endScreen=$id('endScreen'),toast=$id('toast');
const spBtn=$id('specialBtn'),spCD=$id('spCD'),startSc=$id('startScreen');
const alertFlash=$id('alertFlash'),puPanel=$id('puPanel');

function resize(){CV.width=window.innerWidth;CV.height=window.innerHeight;}
window.addEventListener('resize',resize);resize();

/* ── BUILD BOSS HP SEGMENTS ── */
(function(){
  const seg=$id('bossSegments');
  for(let i=0;i<8;i++){const d=document.createElement('div');d.className='bseg';seg.appendChild(d);}
})();

/* ═══ WEAPONS ═══ */
const WEAPONS=[
  {name:'PULSE',color:'#00e5ff',scolor:'rgba(0,229,255,',w:5,h:18,spd:14,dmg:22,spread:1,icon:'🔵'},
  {name:'PLASMA',color:'#ff3366',scolor:'rgba(255,51,102,',w:8,h:8,spd:10,dmg:35,spread:3,icon:'🔴'},
  {name:'LASER',color:'#00ff88',scolor:'rgba(0,255,136,',w:3,h:28,spd:20,dmg:18,spread:0,icon:'💚'},
];

/* ═══ GAME STATE ═══ */
let G={};
function initG(){
  G={
    alive:false,paused:false,over:false,
    px:CV.width/2,py:CV.height-185,pdx:0,pdy:0,pvx:0,pvy:0,pspd:5,
    pw:40,ph:50,
    lives:3,invT:0,
    shield:100,shMax:100,shRegen:8,shRegenDelay:0,
    wIdx:0,fireRate:180,lastFire:0,
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
    bullets:[],eBullets:[],enemies:[],particles:[],drops:[],
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
  for(let i=0;i<90;i++)G.stars1.push({x:rnd(0,CV.width),y:rnd(0,CV.height),r:.3+Math.random()*.5,a:.25+Math.random()*.5,twinkleSpd:rnd(1,3),twinkleOff:rnd(0,6.28)});
  for(let i=0;i<55;i++)G.stars2.push({x:rnd(0,CV.width),y:rnd(0,CV.height),r:.7+Math.random()*.8,a:.4+Math.random()*.4,twinkleSpd:rnd(.5,2),twinkleOff:rnd(0,6.28)});
  for(let i=0;i<28;i++)G.stars3.push({x:rnd(0,CV.width),y:rnd(0,CV.height),r:1.1+Math.random()*1.2,a:.5+Math.random()*.4,twinkleSpd:rnd(.3,1.5),twinkleOff:rnd(0,6.28)});
  G.nebulae=[];
  const nc=['rgba(0,35,90','rgba(50,0,110','rgba(0,70,70','rgba(90,20,0'];
  for(let i=0;i<6;i++)G.nebulae.push({x:rnd(0,CV.width),y:rnd(0,CV.height),r:rnd(90,200),c:nc[i%nc.length],spd:.03+Math.random()*.06});
}

/* ═══ MAIN LOOP ═══ */
let _miniT=0;
function loop(ts){
  requestAnimationFrame(loop);
  if(!G.alive||G.paused||G.over)return;
  G.dt=Math.min(ts-G.lastT,50);G.lastT=ts;G.frame++;
  G._t=ts/1000;
  update();draw();
  if(ts-_miniT>60){_miniT=ts;drawMinimap();}
}

/* ═══ UPDATE ═══ */
function update(){
  const dt=G.dt,f=dt/16;

  for(const s of G.stars1){s.y+=.18*f;if(s.y>CV.height){s.y=0;s.x=rnd(0,CV.width);}}
  for(const s of G.stars2){s.y+=.45*f;if(s.y>CV.height){s.y=0;s.x=rnd(0,CV.width);}}
  for(const s of G.stars3){s.y+=1.0*f;if(s.y>CV.height){s.y=0;s.x=rnd(0,CV.width);}}
  for(const n of G.nebulae){n.y+=n.spd*f;if(n.y>CV.height+300)n.y=-300;}

  G.shakeAmt=Math.max(0,G.shakeAmt-G.shakeDecay*f);
  const spd=G.pspd*(1+G.sk.speed*.15);
  // --- smooth velocity-based movement ---
  const accel=0.18*f;   // how fast ship accelerates
  const friction=0.82;  // inertia (lower = more slippery)
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
  for(let i=G.bullets.length-1;i>=0;i--){const b=G.bullets[i];b.y+=b.dy*f;b.x+=b.dx*f;if(b.y<-30||b.y>ch+30||b.x<-20||b.x>cw+20)G.bullets.splice(i,1);}
  for(let i=G.eBullets.length-1;i>=0;i--){const b=G.eBullets[i];b.y+=b.dy*f;b.x+=b.dx*f;if(b.y>ch+30||b.x<-20||b.x>cw+20||b.y<-20)G.eBullets.splice(i,1);}

  for(const e of G.enemies){
    e.t+=dt;e.y+=e.dy*f;e.x+=e.dx*f;
    if(e.sway)e.x=e.bx+Math.sin(e.t*.002)*65;
    if(e.x<e.w/2||e.x>CV.width-e.w/2)e.dx*=-1;
    if(e.y>CV.height+60)e.hp=0;
    e.shotT+=dt;
    const sr=e.elite?1100:e.type==='tank'?2000:e.type==='fast'?1800:2400;
    if(e.shotT>sr){e.shotT=0;eFire(e);}
    if(G.frame%6===0&&G.particles.length<300){G.particles.push({x:e.x+rnd(-6,6),y:e.y-e.h*.4,vx:rnd(-.5,.5),vy:rnd(-1,-.3),r:rnd(1.5,3.5),c:e.elite?'#ff44aa':'#ff4400',life:250,ml:250});}
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
  const rate=G.fireRate*(1-G.sk.fireRate*.12)*(G.activePU.rapid?.5:1);
  if(now-G.lastFire<rate)return;
  G.lastFire=now;
  const w=WEAPONS[G.wIdx];
  const crit=Math.random()<(.1+G.sk.critical*.1);
  const dmg=(w.dmg*(1+G.sk.damage*.25))*(crit?2.5:1)*(G.activePU.powerfull?2:1);
  const shots=G.activePU.triple?3:1;
  const angles=shots===3?[-14,0,14]:[0];
  for(const a of angles){
    const rad=a*Math.PI/180;
    G.bullets.push({x:G.px,y:G.py-G.ph*.47,dx:Math.sin(rad)*w.spd,dy:-Math.cos(rad)*w.spd,dmg,crit,w:w.w,h:w.h,color:w.color,sc:w.scolor,wIdx:G.wIdx});
  }
  if(G.particles.length<300){for(let i=0;i<2;i++){G.particles.push({x:G.px,y:G.py-G.ph*.47,vx:rnd(-.8,.8),vy:rnd(-2.5,-.5),r:rnd(1,3),c:w.color,life:130,ml:130});}}
}

/* ── ENEMY FIRE ── */
function eFire(e){
  const dx=G.px-e.x,dy=G.py-e.y,d=Math.sqrt(dx*dx+dy*dy)||1;
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
  G.bossX+=G.bossDir*1.8*f;
  if(G.bossX>CV.width-100||G.bossX<100)G.bossDir*=-1;
  const targetY=G.bossPhase===2?130:110;
  G.bossY+=(targetY-G.bossY)*.02*f;
  const fireRate=G.bossHp<G.bossMaxHp*.4?350:G.bossHp<G.bossMaxHp*.6?550:800;
  if(G.bossT%fireRate<20)bossShoot();
  if(G.bossHp<G.bossMaxHp*.5&&G.bossPhase===1){
    G.bossPhase=2;
    $id('bossPhaseLabel').textContent='PHASE II — ENRAGED';
    toast_('⚠ PHASE 2 ACTIVATED — FULL ASSAULT!');
    shake(15,1.2);
  }
  bossFill.style.width=Math.max(0,G.bossHp/G.bossMaxHp*100)+'%';
  if(G.bossHp<=0)killBoss();
  if(G.frame%5===0&&G.particles.length<300)burst(G.bossX+rnd(-30,30),G.bossY+50,'#ff2244',3);
}

function bossShoot(){
  const dx=G.px-G.bossX,dy=G.py-G.bossY;
  const d=Math.sqrt(dx*dx+dy*dy)||1;
  const sp=5.5,count=G.bossPhase===2?5:3;
  for(let i=0;i<count;i++){
    const a=((i-(count-1)/2)*18)*Math.PI/180;
    G.eBullets.push({x:G.bossX,y:G.bossY+60,dx:(dx/d*Math.cos(a)-dy/d*Math.sin(a))*sp,dy:(dx/d*Math.sin(a)+dy/d*Math.cos(a))*sp,dmg:20});
  }
}

function killBoss(){
  bigBurst(G.bossX,G.bossY);
  G.bossOn=false;G.bossKilled=true;bossHUD.classList.remove('on');
  addScore(800*G.wave,G.bossX,G.bossY);addXP(100);
  spawnDrop(G.bossX,G.bossY,'health');
  for(let i=0;i<6;i++)spawnDrop(G.bossX+rnd(-50,50),G.bossY+rnd(-30,30),'coin');
  shake(18,1.2);toast_('🏆 BOSS DESTROYED — WAVE CLEAR!');
  setTimeout(advWave,2000);
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
  addScore(e.elite?100:e.type==='tank'?60:e.type==='fast'?35:25,e.x,e.y);
  addXP(e.elite?35:e.type==='tank'?22:16);
  addCombo();shake(e.type==='tank'?5:3,.6);
  if(Math.random()<.45)spawnDrop(e.x,e.y);
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
    shake(12,1.0);burst(G.px,G.py,'#00e5ff',16);G.invT=2500;
    alertFlash.classList.add('on');setTimeout(()=>alertFlash.classList.remove('on'),180);
    if(G.lives<=0)gameOver();
  } else {
    shake(6,.6);burst(G.px,G.py,'#4488ff',8);
  }
}

/* ── SCORE / XP / COMBO ── */
function addScore(pts,x,y){
  const mult=1+Math.floor(G.combo/5)*.5;
  const total=Math.round(pts*mult);
  G.score+=total;scEl.textContent=G.score;bumpChip('scV');
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
  if(r<.15&&w>=2){type='tank';hp=130+w*35;spd=.7;ew=46;eh=46;}
  else if(r<.35){type='fast';hp=45+w*10;spd=2.5;ew=28;eh=28;sway=true;}
  else{type='normal';hp=65+w*20;spd=1.3;ew=34;eh=34;}
  if(w>=3&&Math.random()<.22){elite=true;hp=Math.round(hp*2);}
  const bx=rnd(50,CV.width-50);
  G.enemies.push({x:bx,bx,y:-60,dx:(Math.random()-.5)*1.8,dy:spd,w:ew,h:eh,hp,maxHp:hp,type,sway,elite,shotT:rnd(400,2200),t:0});
  G.wSpawned++;
}

function spawnBoss(){
  const names=['DESTROYER','NEMESIS','VOIDLORD','ANNIHILATOR','OBLIVION'];
  G.bossName=names[Math.min(Math.floor(G.wave/3)-1,names.length-1)]||'DESTROYER';
  G.bossHp=1000+G.wave*300;G.bossMaxHp=G.bossHp;
  G.bossX=CV.width/2;G.bossY=110;G.bossDir=1;G.bossT=0;G.bossPhase=1;
  G.bossOn=true;
  bossLbl.textContent='◆ '+G.bossName+' ◆';
  $id('bossPhaseLabel').textContent='PHASE I';
  bossHUD.classList.add('on');shake(20,1.5);
  toast_('☠ WARNING: '+G.bossName+' INCOMING!');
}

function advWave(){
  G.wave++;G.wSpawned=0;G.wMax=10+G.wave*3;G.bossKilled=false;
  waveEl.textContent=G.wave;toast_('◈ WAVE '+G.wave+' — COMMENCE!');
}

/* ── DROPS ── */
function spawnDrop(x,y,forced){
  const r=Math.random();
  const type=forced||(r<.5?'coin':r<.72?'health':r<.86?'triple':'rapid');
  G.drops.push({x,y,type,t:0});
}
function pickDrop(d){
  if(d.type==='coin'){G.coins++;coEl.textContent=G.coins;addScore(10);floatText(d.x,d.y,'◈ COIN','#00ff88');}
  else if(d.type==='health'){G.lives=Math.min(6,G.lives+1);hpEl.textContent=G.lives;floatText(d.x,d.y,'+ HP','#ff4488');}
  else if(d.type==='triple'){G.activePU.triple=7000;floatText(d.x,d.y,'✦ TRIPLE','#00e5ff');}
  else if(d.type==='rapid'){G.activePU.rapid=6000;floatText(d.x,d.y,'⚡ RAPID','#ffcc00');}
  else if(d.type==='shield'){G.activePU.shield=5000;floatText(d.x,d.y,'◉ INVULN','#44aaff');}
  else if(d.type==='powerfull'){G.activePU.powerfull=6000;floatText(d.x,d.y,'▲ POWER','#ff6600');}
  burst(d.x,d.y,'#00ff88',8);
}

/* ── SPECIAL ── */
function doSpecial(){
  if(!G.spReady||!G.alive||G.paused||G.over)return;
  G.spReady=false;G.spCD=G.spMax;spBtn.style.opacity='.3';
  bigBurst(CV.width/2,CV.height/2);shake(25,1.8);
  for(const e of G.enemies){burst(e.x,e.y,'#aa00ff',10);addScore(40,e.x,e.y);addXP(10);}
  G.enemies=[];G.wSpawned=G.wMax;
  if(G.bossOn)G.bossHp-=500;
  G.eBullets=[];toast_('✨ NOVA STRIKE — SECTOR CLEARED!');
}

function cycleWeapon(){
  G.wIdx=(G.wIdx+1)%WEAPONS.length;
  toast_('⟳ WEAPON: '+WEAPONS[G.wIdx].name);updateWeaponHUD();
}

function showLvlUp(){
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

function gameOver(){
  G.over=true;G.alive=false;
  $id('endTitle').textContent='GAME OVER';$id('endTitle').className='lose';
  $id('eWave').textContent=G.wave;$id('eScore').textContent=G.score;
  $id('eKills').textContent=G.kills;$id('eCombo').textContent=G.maxCombo;
  endScreen.classList.add('on');
}

/* ═══ DRAW ═══ */
function draw(){
  const sw=G.shakeAmt>0;
  if(sw){CX.save();CX.translate(rnd(-G.shakeAmt,G.shakeAmt),rnd(-G.shakeAmt*.5,G.shakeAmt*.5));}
  CX.clearRect(-50,-50,CV.width+100,CV.height+100);
  CX.fillStyle='#00020a';CX.fillRect(-50,-50,CV.width+100,CV.height+100);

  // nebulae - draw every 2 frames (slow moving, won't notice)
  if(G.frame%2===0){for(const n of G.nebulae){
    const g=CX.createRadialGradient(n.x,n.y,10,n.x,n.y,n.r);
    g.addColorStop(0,n.c+',0.12)');g.addColorStop(1,'transparent');
    CX.fillStyle=g;CX.beginPath();CX.arc(n.x,n.y,n.r,0,Math.PI*2);CX.fill();
  }}

  // stars with twinkle
  const t=G._t||0;
  drawStars(G.stars1,'#aaddff',.6,t);
  drawStars(G.stars2,'#cceeff',.8,t);
  drawStars(G.stars3,'#ffffff',1,t);

  for(const d of G.drops)drawDrop(d);
  for(const e of G.enemies)drawEnemy(e);
  if(G.bossOn)drawBoss();
  for(const b of G.bullets)drawBullet(b);
  for(const b of G.eBullets)drawEBullet(b);
  drawPlayer();

  // draw particles
  if(G.particles.length){
    let lastC='';
    for(const p of G.particles){
      const a=p.life/p.ml;
      if(p.c!==lastC){CX.fillStyle=p.c;lastC=p.c;}
      CX.globalAlpha=a;
      if(p.r<2){CX.fillRect(p.x-p.r,p.y-p.r,p.r*2,p.r*2);}
      else{CX.beginPath();CX.arc(p.x,p.y,p.r,0,Math.PI*2);CX.fill();}
    }
    CX.globalAlpha=1;
  }
  if(sw)CX.restore();
  drawFloatTexts(G.dt/16);
}

function drawStars(arr,col,maxA,t){
  for(const s of arr){
    // only compute twinkle for brighter stars, dim ones use fixed alpha
    const twinkle=s.r>0.8?(.75+Math.sin(t*s.twinkleSpd+s.twinkleOff)*.25):0.8;
    CX.globalAlpha=s.a*maxA*twinkle;
    CX.fillStyle=(s.r>1.5&&s.twinkleOff%1>.5)?'#ffeedd':col;
    CX.fillRect(s.x-s.r,s.y-s.r,s.r*2,s.r*2);
  }
  CX.globalAlpha=1;
}

function drawPlayer(){
  const x=G.px,y=G.py,w=G.pw,h=G.ph;
  const blink=G.invT>0&&Math.sin(G._t*25)>0;
  if(blink)return;

  // engine glow halo
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

  // main hull
  glow('#00e5ff',14);
  CX.fillStyle='#061e3c';
  CX.beginPath();
  CX.moveTo(x,y-h*.52);
  CX.bezierCurveTo(x+w*.36,y-h*.1,x+w*.36,y+h*.1,x+w*.22,y+h*.4);
  CX.lineTo(x-w*.22,y+h*.4);
  CX.bezierCurveTo(x-w*.36,y+h*.1,x-w*.36,y-h*.1,x,y-h*.52);
  CX.fill();

  // hull highlight
  CX.fillStyle='rgba(0,229,255,0.06)';
  CX.beginPath();
  CX.moveTo(x,y-h*.52);
  CX.bezierCurveTo(x+w*.18,y-h*.3,x+w*.18,y,x+w*.05,y+h*.2);
  CX.lineTo(x,y-h*.52);CX.fill();

  // spine line
  CX.strokeStyle='rgba(0,229,255,0.5)';CX.lineWidth=1.2;
  CX.beginPath();CX.moveTo(x,y-h*.52);CX.lineTo(x,y+h*.35);CX.stroke();

  // wings
  const wc='#0a2e5a';
  CX.fillStyle=wc;CX.beginPath();
  CX.moveTo(x+w*.2,y);CX.lineTo(x+w*.65,y+h*.44);CX.lineTo(x+w*.4,y+h*.44);CX.lineTo(x+w*.16,y+h*.18);CX.closePath();CX.fill();
  CX.beginPath();
  CX.moveTo(x-w*.2,y);CX.lineTo(x-w*.65,y+h*.44);CX.lineTo(x-w*.4,y+h*.44);CX.lineTo(x-w*.16,y+h*.18);CX.closePath();CX.fill();

  // wing surface highlight
  CX.fillStyle='rgba(0,229,255,0.04)';
  CX.beginPath();CX.moveTo(x+w*.2,y);CX.lineTo(x+w*.65,y+h*.44);CX.lineTo(x+w*.42,y+h*.44);CX.closePath();CX.fill();

  // wing edge glow
  CX.strokeStyle='rgba(0,229,255,0.35)';CX.lineWidth=1;
  CX.beginPath();CX.moveTo(x+w*.2,y);CX.lineTo(x+w*.6,y+h*.42);CX.stroke();
  CX.beginPath();CX.moveTo(x-w*.2,y);CX.lineTo(x-w*.6,y+h*.42);CX.stroke();

  // cockpit glow
  const cg=CX.createRadialGradient(x,y-h*.18,1,x,y-h*.18,w*.16);
  cg.addColorStop(0,'rgba(0,229,255,0.97)');
  cg.addColorStop(.55,'rgba(0,130,220,0.55)');
  cg.addColorStop(1,'rgba(0,80,200,0.08)');
  CX.fillStyle=cg;CX.beginPath();CX.ellipse(x,y-h*.18,w*.12,h*.2,0,0,Math.PI*2);CX.fill();
  // cockpit glint
  CX.fillStyle='rgba(255,255,255,0.4)';
  CX.beginPath();CX.ellipse(x-w*.04,y-h*.23,w*.04,h*.05,-.4,0,Math.PI*2);CX.fill();

  // weapon stripe
  const wc2=WEAPONS[G.wIdx].color;
  CX.strokeStyle=wc2;CX.lineWidth=1.5;CX.globalAlpha=.55;
  CX.beginPath();CX.moveTo(x+w*.14,y-h*.05);CX.lineTo(x+w*.34,y+h*.35);CX.stroke();
  CX.beginPath();CX.moveTo(x-w*.14,y-h*.05);CX.lineTo(x-w*.34,y+h*.35);CX.stroke();
  CX.globalAlpha=1;

  // gun barrels
  CX.fillStyle='rgba(0,229,255,0.15)';
  CX.fillRect(x+w*.12-1,y-h*.5,2,8);
  CX.fillRect(x-w*.12-1,y-h*.5,2,8);

  // engine flames
  const ft=G._t*1000||0;
  drawFlame(x,y+h*.42,ft,0);
  if(G.activePU.triple){drawFlame(x+w*.22,y+h*.38,ft,200);drawFlame(x-w*.22,y+h*.38,ft,400);}
  noGlow();
}

function drawFlame(x,y,t,off){
  const fl=16+Math.sin((t+off)*.016)*8+Math.sin((t+off)*.031)*4;
  const wColor=WEAPONS[G.wIdx].color;
  const fg=CX.createLinearGradient(x,y,x,y+fl+10);
  fg.addColorStop(0,'rgba(200,235,255,0.98)');
  fg.addColorStop(.2,'rgba(100,200,255,0.85)');
  fg.addColorStop(.6,'rgba(0,100,255,0.5)');
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
  const col=e.elite?'#ff44aa':(e.type==='tank'?'#ff6600':e.type==='fast'?'#00ffcc':'#ff2244');
  const hp=e.hp/e.maxHp;
  CX.globalAlpha=.45+hp*.55;
  glow(col,14);
  CX.fillStyle=e.elite?'#300018':(e.type==='tank'?'#280e00':'#160005');

  if(e.type==='tank'){
    // body
    CX.beginPath();CX.roundRect(x-e.w/2,y-e.h/2,e.w,e.h,4);CX.fill();
    // inner panel
    CX.fillStyle='rgba(255,255,255,0.03)';
    CX.beginPath();CX.roundRect(x-e.w*.3,y-e.h*.35,e.w*.6,e.h*.7,3);CX.fill();
    // turret
    CX.fillStyle=e.elite?'#550030':'#401200';
    CX.beginPath();CX.ellipse(x,y,e.w*.32,e.h*.32,0,0,Math.PI*2);CX.fill();
    CX.strokeStyle=col;CX.lineWidth=1.5;
    CX.beginPath();CX.moveTo(x,y);CX.lineTo(x,y+e.h*.6);CX.stroke();
  } else if(e.type==='fast'){
    CX.beginPath();
    CX.moveTo(x,y+e.h*.5);CX.lineTo(x+e.w*.42,y-e.h*.18);
    CX.lineTo(x+e.w*.16,y-e.h*.5);CX.lineTo(x-e.w*.16,y-e.h*.5);
    CX.lineTo(x-e.w*.42,y-e.h*.18);CX.closePath();CX.fill();
  } else {
    CX.beginPath();
    CX.moveTo(x,y+e.h*.5);CX.lineTo(x+e.w*.44,y-e.h*.08);
    CX.lineTo(x+e.w*.24,y-e.h*.5);CX.lineTo(x-e.w*.24,y-e.h*.5);
    CX.lineTo(x-e.w*.44,y-e.h*.08);CX.closePath();CX.fill();
  }

  // outline
  CX.strokeStyle=col;CX.lineWidth=1;CX.globalAlpha=.65;
  if(e.type==='tank'){CX.beginPath();CX.roundRect(x-e.w/2,y-e.h/2,e.w,e.h,4);CX.stroke();}
  else{CX.beginPath();CX.moveTo(x,y+e.h*.5);CX.lineTo(x+e.w*.44,y-e.h*.08);CX.lineTo(x+e.w*.24,y-e.h*.5);CX.lineTo(x-e.w*.24,y-e.h*.5);CX.lineTo(x-e.w*.44,y-e.h*.08);CX.closePath();CX.stroke();}

  // core dot
  CX.globalAlpha=.85;glow(col,10);
  CX.fillStyle=col;CX.beginPath();CX.arc(x,y,3.5,0,Math.PI*2);CX.fill();
  noGlow();

  // hp bar
  CX.globalAlpha=1;
  const bw=e.w*.9,bx=x-bw/2,by=y-e.h/2-10;
  CX.fillStyle='rgba(0,0,0,0.4)';CX.fillRect(bx,by,bw,3);
  CX.fillStyle=hp>.5?col:'#ff2244';CX.fillRect(bx,by,bw*hp,3);
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
  if(b.wIdx===1){
    // plasma: simple filled circle + bright core (no gradient per-bullet)
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
  const c=DROP_COLORS[d.type]||'#fff';
  const pulse=.25+Math.sin(d.t*.004)*.1;
  glow(c,14);
  CX.globalAlpha=pulse;
  CX.strokeStyle=c;CX.lineWidth=1.5;
  CX.beginPath();CX.arc(d.x,d.y+bob,16,0,Math.PI*2);CX.stroke();
  CX.globalAlpha=1;CX.fillStyle=c;
  CX.font='bold 13px monospace';
  CX.textAlign='center';CX.textBaseline='middle';
  CX.fillText(DROP_ICONS[d.type]||'?',d.x,d.y+bob);
  noGlow();
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
  if(G.particles.length>350)return;
  for(let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2,sp=rnd(1.5,5.5);
    G.particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,r:rnd(1.5,5),c,life:rnd(300,700),ml:700});
  }
}
function bigBurst(x,y){
  const cols=['#aa00ff','#ff00aa','#0088ff','#ff6600','#ffcc00','#00e5ff','#ff2244'];
  const cap=G.particles.length>200?40:100;
  for(let i=0;i<cap;i++){
    const a=Math.random()*Math.PI*2,sp=rnd(2,14);
    const c=cols[Math.floor(Math.random()*cols.length)];
    G.particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,r:rnd(2,8),c,life:rnd(500,1400),ml:1400});
  }
}
function spark(x,y,c){
  if(G.particles.length>300)return;
  for(let i=0;i<6;i++){
    const a=Math.random()*Math.PI*2;
    G.particles.push({x,y,vx:Math.cos(a)*4,vy:Math.sin(a)*4,r:rnd(1.5,3),c,life:190,ml:190});
  }
}
function shake(amt,decay){G.shakeAmt=Math.max(G.shakeAmt,amt);G.shakeDecay=decay;}

/* ── HELPERS ── */
function glow(c,s){CX.shadowBlur=s;CX.shadowColor=c;}
function noGlow(){CX.shadowBlur=0;CX.shadowColor='transparent';}
function rnd(a,b){return a+Math.random()*(b-a);}
function clamp(v,mn,mx){return Math.max(mn,Math.min(mx,v));}
function rectOverlap(ax,ay,aw,ah,bx,by,bw,bh){return Math.abs(ax-bx)<(aw+bw)*.5&&Math.abs(ay-by)<(ah+bh)*.5;}
function hitCircle(ax,ay,ar,bx,by,br){const dx=ax-bx,dy=ay-by;return dx*dx+dy*dy<(ar+br)*(ar+br);}
// Canvas-based float texts (no DOM overhead)
const floatTexts=[];
function floatText(x,y,txt,col){
  floatTexts.push({x,y,txt,col,life:900,ml:900,vy:-0.06});
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
  for(let i=0;i<3;i++){
    const s=$id('w'+i);
    const icon=s.querySelector(':not(.wbar):not(.wnum)');
    s.classList.toggle('active',i===G.wIdx);
    const bar=s.querySelector('.wbar');
    if(bar&&i===G.wIdx&&G.activePU.rapid)bar.style.transform='scaleX('+(1-G.spCD/G.spMax)+')';
  }
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
  // dead zone: below JOY_DEAD px → no input
  if(dist<JOY_DEAD){G.joyX=0;G.joyY=0;}
  else{
    // remap: dist goes from JOY_DEAD to JOY_MAX → 0 to 1 (smooth ramp)
    const norm=Math.min((dist-JOY_DEAD)/(JOY_MAX-JOY_DEAD),1);
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
  waveEl.textContent='1';hpEl.textContent='3';scEl.textContent='0';coEl.textContent='0';
  shEl.textContent='100';shFill.style.width='100%';xpFill.style.width='0%';
  lvlBadge.textContent='LVL 1';updateSkillDots();puPanel.innerHTML='';
  G.px=CV.width/2;G.py=CV.height-185;G.pvx=0;G.pvy=0;
  G.alive=true;G.paused=false;G.lastT=performance.now();
}
function toStart(){
  pauseMenu.classList.remove('on');endScreen.classList.remove('on');lvlUp.classList.remove('on');
  initG();startSc.classList.remove('gone');
}
function startGame(){startSc.classList.add('gone');restartGame();}

window.togglePause=togglePause;window.restartGame=restartGame;window.toStart=toStart;
window.startGame=startGame;window.doSpecial=doSpecial;window.cycleWeapon=cycleWeapon;window.upgrade=upgrade;

/* ═══ BOOT ═══ */
window.addEventListener('load',()=>{
  initBG();updateSkillDots();
  setTimeout(()=>{
    $id('loading').classList.add('out');
    setTimeout(()=>$id('loading').style.display='none',700);
  },1900);
  requestAnimationFrame(loop);
});
