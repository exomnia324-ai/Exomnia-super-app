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

  function connect(){
    if(socket) return socket;
    if(typeof io === 'undefined'){
      console.warn('[MP] Socket.IO client not loaded');
      return null;
    }
    socket = io({ transports:['websocket','polling'] });

    socket.on('connect', ()=>{ myState.mySid = socket.id; });

    socket.on('room_created', (d)=>{
      myState = { code:d.code, hostSid:d.hostSid, mySid:d.you, players:{}, isHost:true };
      const nm = currentPlayerName();
      myState.players[d.you] = { name:nm, ship:currentShipIdx(), x:0,y:0,hp:100,alive:true };
      renderWaitingRoom();
    });

    socket.on('room_joined', (d)=>{
      myState = { code:d.code, hostSid:d.hostSid, mySid:d.you, players:d.players||{}, isHost:(d.hostSid===d.you) };
      renderWaitingRoom();
    });

    socket.on('join_error', (d)=>{
      showToast && showToast('✖ '+(d.reason||'COULD NOT JOIN'));
    });

    socket.on('player_joined', (d)=>{
      myState.players[d.sid] = { name:d.name, ship:d.ship, x:0,y:0,hp:100,alive:true };
      renderWaitingRoom();
      showToast && showToast(d.name+' JOINED THE SQUAD');
    });

    socket.on('player_left', (d)=>{
      delete myState.players[d.sid];
      renderWaitingRoom();
    });

    socket.on('host_changed', (d)=>{
      myState.hostSid = d.hostSid;
      myState.isHost = (d.hostSid === myState.mySid);
      renderWaitingRoom();
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
    closeWaitingRoom();
  }

  function startMission(){
    // Phase A: just launches the normal single-player game for everyone in the room.
    // Phase B will wire real enemy/combat sync into this same hook.
    closeWaitingRoom();
    if(typeof launchFromLobby==='function') launchFromLobby();
    else if(typeof startGame==='function') startGame();
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
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    window.addEventListener('load', ()=>setTimeout(init,150));
  }

  return { openEntryModal, createRoom, joinRoom, leaveRoom };

})();
