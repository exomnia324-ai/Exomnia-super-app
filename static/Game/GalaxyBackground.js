/*
 * Injects the realistic galaxy atmosphere without changing the game's
 * procedural canvas renderer. The overlay stays behind the HUD and uses
 * screen blending so ships, bullets, enemies, and particles remain visible.
 */
(function(){
  'use strict';
  function mountGalaxyOverlay(){
    var gc=document.getElementById('gc');
    if(!gc||gc.querySelector('.realistic-galaxy-overlay'))return;
    var link=document.createElement('link');
    link.rel='stylesheet';
    link.href='/static/Game/GalaxyBackground.css';
    document.head.appendChild(link);
    var overlay=document.createElement('div');
    overlay.className='realistic-galaxy-overlay';
    overlay.setAttribute('aria-hidden','true');
    gc.insertBefore(overlay,gc.firstChild);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountGalaxyOverlay);
  else mountGalaxyOverlay();
})();
