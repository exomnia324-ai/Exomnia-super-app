'use strict';
/* ═══════════════════════════════════════════════════════════════
   DEEP SPACE COMBAT — CO-OP MULTIPLAYER (PHASE A: ROOMS)
   Multiplayer.js  |  Standalone module, loaded after game.js

   PHASE A SCOPE (this file):
     - Connect to the Socket.IO server
     - Create a room (get a shareable 5-letter code) or join one
     - Show a live waiting-room screen with connected players
     - Host can "Start Mission" once ≥2 players are in

   NOT in this phase (comes in Phase B once this is confirmed working):
     - Actually syncing enemies/bullets/kills during a run
     - Rendering teammates' ships mid-mission
   Starting the mission right now simply launches each player into
   their own normal single-player run — the room/lobby plumbing is
   the part being tested first.
   ═══════════════════════════════════════════════════════════════ */

const MP = (function () {

  let socket = null;
  let myState = { code:null, hostSid:null, mySid:null, players:{}, isHost:false };
  let remotePlayers = {};       // sid -> {name, ship, fx, fy, hp, alive, lastSeen}
  let snapshotInterval = null;  // host: broadcasts authoritative enemy/wave/boss state
  let posInterval = null;       // all clients: broadcast own ship position
  let inMission = false;

  // Coordinates cross the network as 0–1 fractions of each device's own canvas,
  // since phones/tablets/desktops render at different pixel sizes.
  function cvW(){ try{ return CV.width||390; }catch(e){ return 390; } }
  function cvH(){ try{ return CV.height||700; }catch(e){ return 700; } }
  function toFracX(x){ return x/cvW(); }
  function toFracY(y){ return y/cvH(); }
  function fromFracX(fx){ return fx*cvW(); }
  function fromFracY(fy){ return fy*cvH(); }

  function connect(){
    if(socket) return socket;
    if(typeof io === 'undefined'){
      console.warn('[MP] Socket.IO client not loaded');
      return null;
    }
    socket = io({ transports:['websocket','polling'] });

    socket.on('connect', ()=>{
      const wasReconnect = !!myState.mySid && myState.mySid !== socket.id;
      myState.mySid = socket.id;
      if(wasReconnect && myState.code){
        // We dropped and reconnected mid-session — rejoin the same room under the new sid.
        console.log('[MP] reconnected, rejoining room', myState.code);
        showToast && showToast('🔄 RECONNECTING TO ROOM...');
        socket.emit('join_room_req', { code:myState.code, name:currentPlayerName(), ship:currentShipIdx() });
      }
    });

    socket.on('disconnect', ()=>{
      console.warn('[MP] socket disconnected');
      if(myState.code) showToast && showToast('⚠ CONNECTION LOST — RECONNECTING...');
    });

    socket.on('room_created', (d)=>{
      myState = { code:d.code, hostSid:d.hostSid, mySid:d.you, players:{}, isHost:true };
      const nm = currentPlayerName();
      myState.players[d.you] = { name:nm, ship:currentShipIdx(), x:0,y:0,hp:100,alive:true };
      renderWaitingRoom();
    });

    socket.on('room_joined', (d)=>{
      myState = { code:d.code, hostSid:d.hostSid, mySid:d.you, players:d.players||{}, isHost:(d.hostSid===d.you) };
      if(d.missionStarted && !inMission){
        // The mission was already underway when we (re)connected — jump straight in
        // instead of showing a stale waiting room.
        console.log('[MP] rejoined a room whose mission already started — launching');
        showToast && showToast('🚀 REJOINING MISSION IN PROGRESS...');
        beginLocalMission(false);
      } else if(!inMission){
        renderWaitingRoom();
      }
    });

    socket.on('join_error', (d)=>{
      showToast && showToast('✖ '+(d.reason||'COULD NOT JOIN'));
    });

    socket.on('player_joined', (d)=>{
      myState.players[d.sid] = { name:d.name, ship:d.ship, x:0,y:0,hp:100,alive:true };
      if(!inMission) renderWaitingRoom();
      showToast && showToast(d.name+' JOINED THE SQUAD');
    });

    socket.on('player_left', (d)=>{
      const leftName = (myState.players[d.sid]&&myState.players[d.sid].name) || (remotePlayers[d.sid]&&remotePlayers[d.sid].name) || 'A pilot';
      delete myState.players[d.sid];
      delete remotePlayers[d.sid];
      if(!inMission) renderWaitingRoom();
      else { showToast && showToast(leftName+' LEFT THE SQUAD'); renderSquadHUD(); }
    });

    socket.on('host_changed', (d)=>{
      const wasHost = myState.isHost;
      myState.hostSid = d.hostSid;
      myState.isHost = (d.hostSid === myState.mySid);
      if(!inMission) renderWaitingRoom();

      if(inMission && myState.isHost && !wasHost){
        // We were just promoted to host mid-mission — take over the authoritative
        // simulation using whatever enemy state we already had mirrored locally.
        console.log('[MP] promoted to host mid-mission, taking over simulation');
        try{
          G.coopIsHost = true;
          if(typeof reseedEnemyIdCounter==='function') reseedEnemyIdCounter();
        }catch(e){}
        showToast && showToast('👑 HOST DISCONNECTED — YOU ARE NOW HOST');
        if(!snapshotInterval) snapshotInterval = setInterval(broadcastSnapshot, 150);
      }
    });

    // ── PHASE B: in-mission sync ──
    socket.on('game_event', (d)=>{
      if(!d) return;
      console.log('[MP] game_event received:', d.type);
      if(d.type==='mission_start'){
        showToast && showToast('🚀 MISSION STARTING...');
        beginLocalMission(false); // we are not the host
      } else if(d.type==='state'){
        applyHostState(d);
      }
    });

    socket.on('combat_update', (d)=>{
      // only meaningful for the host — it owns enemy/boss truth
      if(!myState.isHost || !d) return;
      if(d.kind==='enemy' && typeof MP_applyRemoteEnemyHit==='function'){
        MP_applyRemoteEnemyHit(d.enemyId, d.dmg, !!d.crit);
      } else if(d.kind==='boss' && typeof MP_applyRemoteBossHit==='function'){
        MP_applyRemoteBossHit(d.dmg, !!d.crit);
      }
    });

    socket.on('player_update', (d)=>{
      if(!d || !d.sid) return;
      const p = myState.players[d.sid];
      if(p){
        p.x=d.x; p.y=d.y; p.hp=d.hp; p.alive=d.alive;
      }
      const isNew = !remotePlayers[d.sid];
      const wasAlive = remotePlayers[d.sid] ? remotePlayers[d.sid].alive!==false : true;
      remotePlayers[d.sid] = remotePlayers[d.sid] || { name:(p&&p.name)||'PILOT', ship:(p&&p.ship)||0 };
      remotePlayers[d.sid].fx = d.x; remotePlayers[d.sid].fy = d.y;
      remotePlayers[d.sid].hp = d.hp; remotePlayers[d.sid].alive = d.alive;
      remotePlayers[d.sid].lastSeen = Date.now();
      if(isNew || (wasAlive && d.alive===false)){
        if(wasAlive && d.alive===false && showToast) showToast('💀 '+(remotePlayers[d.sid].name||'A teammate')+' WENT DOWN');
        renderSquadHUD();
      }
    });

    return socket;
  }

  function currentPlayerName(){
    try{
      const el = document.getElementById('callsignInput');
      return (el && el.value && el.value.trim()) || (typeof getOrCreateDefaultCallsign==='function' ? getOrCreateDefaultCallsign() : 'PILOT');
    }catch(e){ return 'PILOT'; }
  }
  function currentShipIdx(){
    try{ return (typeof selectedShip!=='undefined') ? selectedShip : 0; }catch(e){ return 0; }
  }

  function createRoom(){
    connect();
    if(!socket) return;
    socket.emit('create_room', { name:currentPlayerName(), ship:currentShipIdx() });
  }

  function joinRoom(code){
    connect();
    if(!socket) return;
    socket.emit('join_room_req', { code:(code||'').trim().toUpperCase(), name:currentPlayerName(), ship:currentShipIdx() });
  }

  function leaveRoom(){
    if(socket) socket.emit('leave_room_req');
    myState = { code:null, hostSid:null, mySid:null, players:{}, isHost:false };
    endMission();
    closeWaitingRoom();
  }

  function startMission(){
    // Host tells everyone else to launch too, then launches itself.
    if(socket) socket.emit('host_event', { type:'mission_start' });
    closeWaitingRoom();
    beginLocalMission(true);
  }

  function broadcastSnapshot(){
    if(!socket || !inMission) return;
    try{
      const enemies = (G.enemies||[]).map(e=>({
        id:e.id, x:toFracX(e.x), y:toFracY(e.y), w:e.w, h:e.h,
        hp:e.hp, maxHp:e.maxHp, type:e.type, elite:!!e.elite,
      }));
      socket.emit('host_event', {
        type:'state',
        wave:G.wave, wMax:G.wMax, wSpawned:G.wSpawned,
        bossOn:G.bossOn, bossName:G.bossName, bossHp:G.bossHp, bossMaxHp:G.bossMaxHp,
        bossPhase:G.bossPhase, bossX:toFracX(G.bossX), bossY:toFracY(G.bossY),
        squadKills:G.coopSquadKills||0, squadScore:G.coopSquadScore||0,
        enemies,
      });
    }catch(e){}
  }

  // Assigns a fresh, collision-safe enemy-id counter when a client is promoted to
  // host mid-mission, based on the highest id it already knows about.
  function reseedEnemyIdCounter(){
    try{
      let maxN = 0;
      for(const e of (G.enemies||[])){
        const m = /^e(\d+)$/.exec(e.id||'');
        if(m) maxN = Math.max(maxN, parseInt(m[1],10));
      }
      G.coopEnemyIdSeq = maxN+1;
    }catch(e){}
  }

  function beginLocalMission(isHost){
    inMission = true;
    remotePlayers = {};
    closeWaitingRoom();
    closeEntryModal();
    try{
      if(typeof launchFromLobby==='function') launchFromLobby();
      else if(typeof startGame==='function') startGame();
      else { console.error('[MP] no launch function found (launchFromLobby/startGame)'); showToast && showToast('✖ COULD NOT START — LAUNCH FN MISSING'); }
    }catch(err){
      console.error('[MP] launch failed:', err);
      showToast && showToast('✖ LAUNCH ERROR — CHECK CONSOLE');
    }

    // Stamp coop flags onto the freshly-created G object (launchFromLobby just rebuilt it).
    try{
      G.coopMode = true;
      G.coopIsHost = !!isHost;
    }catch(e){}

    stopIntervals();
    // All clients: broadcast their own ship position a few times a second.
    posInterval = setInterval(()=>{
      if(!socket || !inMission) return;
      try{
        socket.emit('player_state', {
          x: toFracX(G.px), y: toFracY(G.py),
          hp: G.lives!==undefined ? G.lives : 100,
          alive: !(G.over),
        });
      }catch(e){}
    }, 120);

    if(isHost){
      snapshotInterval = setInterval(broadcastSnapshot, 150);
    }
    renderSquadHUD();
  }

  function applyHostState(d){
    if(!inMission) return;
    try{
      if(typeof MP_syncEnemies==='function' && d.enemies){
        MP_syncEnemies(d.enemies.map(e=>({...e, x:fromFracX(e.x), y:fromFracY(e.y)})));
      }
      if(typeof MP_syncWaveBossState==='function'){
        MP_syncWaveBossState({
          wave:d.wave, wMax:d.wMax, wSpawned:d.wSpawned,
          bossOn:d.bossOn, bossName:d.bossName, bossHp:d.bossHp, bossMaxHp:d.bossMaxHp,
          bossPhase:d.bossPhase, bossX:fromFracX(d.bossX), bossY:fromFracY(d.bossY),
          squadKills:d.squadKills, squadScore:d.squadScore,
        });
      }
      renderSquadHUD();
    }catch(e){}
  }

  function reportEnemyHit(enemyId, dmg, crit){
    if(!socket) return;
    socket.emit('combat_event', { kind:'enemy', enemyId, dmg, crit });
  }
  function reportBossHit(dmg, crit){
    if(!socket) return;
    socket.emit('combat_event', { kind:'boss', dmg, crit });
  }

  function drawRemotePlayers(ctx){
    const now = Date.now();
    for(const sid in remotePlayers){
      const p = remotePlayers[sid];
      if(!p) continue;
      const stale = now - (p.lastSeen||0) > 4000; // probably disconnected
      if(p.alive===false || stale) continue;
      const x = fromFracX(p.fx!==undefined?p.fx:0.5);
      const y = fromFracY(p.fy!==undefined?p.fy:0.5);
      ctx.save();
      ctx.shadowColor = '#00ff8c'; ctx.shadowBlur = 10;
      ctx.fillStyle = '#0a1a14';
      ctx.beginPath();
      ctx.moveTo(x, y-16); ctx.lineTo(x+11, y+12); ctx.lineTo(x, y+6); ctx.lineTo(x-11, y+12);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#00ff8c'; ctx.lineWidth = 1.4; ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(0,255,140,0.9)';
      ctx.font = "8px 'Courier New', monospace";
      ctx.textAlign = 'center';
      ctx.fillText(p.name||'PILOT', x, y-24);
      // small health bar under the name
      const hpFrac = Math.max(0, Math.min(1, (p.hp!==undefined?p.hp:3)/3));
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(x-14, y-20, 28, 3);
      ctx.fillStyle = hpFrac>0.5?'#00ff8c':hpFrac>0.2?'#ffcc00':'#ff3355';
      ctx.fillRect(x-14, y-20, 28*hpFrac, 3);
      ctx.restore();
    }
  }

  /* ══ Squad HUD (kills/score + teammate roster, shown top-right during a mission) ══ */
  function renderSquadHUD(){
    if(!inMission) { closeSquadHUD(); return; }
    let el = document.getElementById('mpSquadHUD');
    if(!el){
      el = document.createElement('div');
      el.id = 'mpSquadHUD';
      el.style.cssText = `
        position:fixed;top:8px;right:8px;z-index:120;
        background:rgba(0,10,28,0.75);border:1px solid rgba(0,229,255,0.3);
        border-radius:8px;padding:8px 10px;font-family:'Courier New',monospace;
        color:#00e5ff;font-size:8px;letter-spacing:1px;min-width:120px;
        pointer-events:none;backdrop-filter:blur(2px);
      `;
      document.body.appendChild(el);
    }
    const teammates = Object.values(remotePlayers).filter(p=>Date.now()-(p.lastSeen||0)<4000);
    const rows = teammates.map(p=>`
      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:2px;color:${p.alive===false?'rgba(255,90,90,0.7)':'rgba(255,255,255,0.75)'};">
        <span>${p.alive===false?'💀':'🚀'} ${(p.name||'PILOT').slice(0,10)}</span>
      </div>
    `).join('');
    el.innerHTML = `
      <div style="color:#ffd700;font-weight:900;">SQUAD ◈${(typeof G!=='undefined'?G.coopSquadScore:0)||0}</div>
      <div style="color:rgba(255,255,255,0.5);font-size:7px;">${(typeof G!=='undefined'?G.coopSquadKills:0)||0} kills together</div>
      ${rows}
    `;
  }
  function closeSquadHUD(){
    const el = document.getElementById('mpSquadHUD');
    if(el) el.remove();
  }

  function stopIntervals(){
    if(snapshotInterval){ clearInterval(snapshotInterval); snapshotInterval=null; }
    if(posInterval){ clearInterval(posInterval); posInterval=null; }
  }

  function endMission(){
    inMission = false;
    stopIntervals();
    closeSquadHUD();
  }

  /* ══ UI: entry modal (create / join) ══ */
  function openEntryModal(){
    closeEntryModal();
    const modal=document.createElement('div');
    modal.id='mpEntryModal';
    modal.style.cssText=`
      position:fixed;inset:0;z-index:510;background:rgba(0,2,14,0.94);
      display:flex;align-items:center;justify-content:center;padding:20px;
      font-family:'Courier New',monospace;animation:mpFadeIn .25s ease;
    `;
    modal.innerHTML=`
      <style>@keyframes mpFadeIn{from{opacity:0}to{opacity:1}}</style>
      <div style="width:min(320px,100%);background:rgba(0,10,28,0.98);border:1px solid rgba(0,229,255,0.35);
        border-radius:12px;padding:22px;">
        <div style="text-align:center;margin-bottom:16px;">
          <div style="font-size:9px;letter-spacing:5px;color:rgba(0,229,255,0.55);margin-bottom:4px;">SQUAD UP</div>
          <div style="font-size:18px;font-weight:900;letter-spacing:3px;color:#00e5ff;text-shadow:0 0 20px #00e5ff;">🛰 CO-OP MODE</div>
          <div style="font-size:8px;letter-spacing:1px;color:rgba(255,255,255,0.45);margin-top:6px;">2–4 players · beta</div>
        </div>
        <div id="mpCreateBtn" style="padding:12px;border-radius:8px;margin-bottom:10px;text-align:center;
          border:1px solid rgba(0,229,255,0.5);background:linear-gradient(145deg,rgba(0,229,255,0.16),rgba(0,229,255,0.04));
          color:#00e5ff;font-size:11px;font-weight:900;letter-spacing:2px;cursor:pointer;">+ CREATE ROOM</div>
        <div style="text-align:center;font-size:8px;letter-spacing:2px;color:rgba(255,255,255,0.35);margin:12px 0;">— OR —</div>
        <input id="mpCodeInput" maxlength="6" placeholder="ENTER ROOM CODE" style="
          width:100%;box-sizing:border-box;padding:11px;border-radius:8px;margin-bottom:10px;
          background:rgba(0,20,40,0.6);border:1px solid rgba(0,229,255,0.3);color:#fff;
          font-family:'Courier New',monospace;font-size:13px;letter-spacing:4px;text-align:center;text-transform:uppercase;">
        <div id="mpJoinBtn" style="padding:12px;border-radius:8px;text-align:center;
          border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.8);
          font-size:11px;font-weight:900;letter-spacing:2px;cursor:pointer;margin-bottom:10px;">JOIN ROOM</div>
        <div id="mpCloseBtn" style="text-align:center;padding:8px;font-size:9px;letter-spacing:1px;color:rgba(255,255,255,0.4);cursor:pointer;">CANCEL</div>
      </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', e=>{ if(e.target===modal) closeEntryModal(); });
    document.getElementById('mpCreateBtn').onclick=()=>{ createRoom(); closeEntryModal(); };
    document.getElementById('mpJoinBtn').onclick=()=>{
      const v=document.getElementById('mpCodeInput').value;
      if(!v||!v.trim()){ showToast && showToast('ENTER A ROOM CODE'); return; }
      joinRoom(v); closeEntryModal();
    };
    document.getElementById('mpCloseBtn').onclick=closeEntryModal;
  }
  function closeEntryModal(){
    const m=document.getElementById('mpEntryModal');
    if(m) m.remove();
  }

  /* ══ UI: waiting room ══ */
  function renderWaitingRoom(){
    closeWaitingRoom();
    const panel=document.createElement('div');
    panel.id='mpWaitPanel';
    panel.style.cssText=`
      position:fixed;inset:0;z-index:510;background:rgba(0,2,14,0.96);
      display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;
      font-family:'Courier New',monospace;animation:mpFadeIn .3s ease;
    `;
    const players=Object.entries(myState.players);
    const rows=players.map(([sid,p])=>`
      <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:7px;
        background:rgba(0,229,255,0.06);border:1px solid rgba(0,229,255,0.18);margin-bottom:6px;">
        <div style="font-size:16px;">${sid===myState.hostSid?'👑':'🚀'}</div>
        <div style="flex:1;font-size:10px;letter-spacing:1px;color:#fff;">${p.name}${sid===myState.mySid?' (YOU)':''}</div>
        <div style="font-size:8px;letter-spacing:1px;color:rgba(0,229,255,0.5);">${sid===myState.hostSid?'HOST':'READY'}</div>
      </div>
    `).join('');

    const canStart = myState.isHost && players.length>=2;

    panel.innerHTML=`
      <div style="width:min(340px,100%);background:rgba(0,10,28,0.98);border:1px solid rgba(0,229,255,0.35);
        border-radius:14px;padding:24px;">
        <div style="text-align:center;margin-bottom:14px;">
          <div style="font-size:8px;letter-spacing:4px;color:rgba(0,229,255,0.5);margin-bottom:4px;">ROOM CODE — SHARE WITH YOUR SQUAD</div>
          <div style="font-size:28px;font-weight:900;letter-spacing:8px;color:#00e5ff;text-shadow:0 0 20px #00e5ff;">${myState.code}</div>
        </div>
        <div style="margin-bottom:14px;">${rows}</div>
        <div style="font-size:8px;letter-spacing:1px;color:rgba(255,255,255,0.4);text-align:center;margin-bottom:16px;">
          ${players.length}/4 PILOTS &nbsp;·&nbsp; ${myState.isHost ? (players.length<2?'waiting for at least 1 more player…':'you can start when ready') : 'waiting for host to start…'}
        </div>
        ${myState.isHost ? `
          <div id="mpStartBtn" style="padding:12px;border-radius:8px;text-align:center;margin-bottom:10px;
            border:1px solid ${canStart?'rgba(0,255,140,0.5)':'rgba(255,255,255,0.15)'};
            background:${canStart?'linear-gradient(145deg,rgba(0,255,140,0.18),rgba(0,255,140,0.05))':'rgba(255,255,255,0.03)'};
            color:${canStart?'#00ff8c':'rgba(255,255,255,0.3)'};
            font-size:11px;font-weight:900;letter-spacing:2px;cursor:${canStart?'pointer':'default'};">🚀 START MISSION</div>
        ` : ''}
        <div id="mpLeaveBtn" style="text-align:center;padding:8px;font-size:9px;letter-spacing:1px;color:rgba(255,90,90,0.7);cursor:pointer;">LEAVE ROOM</div>
      </div>
    `;
    document.body.appendChild(panel);
    if(myState.isHost){
      const startBtn=document.getElementById('mpStartBtn');
      if(startBtn && canStart) startBtn.onclick=startMission;
    }
    document.getElementById('mpLeaveBtn').onclick=leaveRoom;
  }
  function closeWaitingRoom(){
    const p=document.getElementById('mpWaitPanel');
    if(p) p.remove();
  }

  /* ══ Inject lobby button ══ */
  function injectLobbyBtn(){
    const tryInject=()=>{
      const btnRow=document.getElementById('lbyBtnRow');
      if(!btnRow){ setTimeout(tryInject,400); return; }
      if(document.getElementById('lbyMpBtn')) return;
      const btn=document.createElement('div');
      btn.id='lbyMpBtn';
      btn.className='lby-action-btn';
      btn.style.cssText=`
        flex:none;width:52px;padding:10px 0;border-radius:7px;
        font-size:20px;cursor:pointer;position:relative;
        border:1px solid rgba(0,229,255,0.35);
        background:linear-gradient(145deg,rgba(0,229,255,0.07),rgba(0,229,255,0.02));
        display:flex;align-items:center;justify-content:center;
        touch-action:manipulation;
      `;
      btn.innerHTML='🛰';
      btn.title='Co-op Mode';
      btn.onclick=()=>openEntryModal();
      btnRow.appendChild(btn);
    };
    tryInject();
  }

  function init(){
    injectLobbyBtn();
    const _origGameOver = window.gameOver;
    if(typeof _origGameOver === 'function'){
      window.gameOver = async function(){
        const r = await _origGameOver.apply(this, arguments);
        if(inMission) endMission();
        return r;
      };
    }
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    window.addEventListener('load', ()=>setTimeout(init,150));
  }

  return { openEntryModal, createRoom, joinRoom, leaveRoom, reportEnemyHit, reportBossHit, drawRemotePlayers };

})();
