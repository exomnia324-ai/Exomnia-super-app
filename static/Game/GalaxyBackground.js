/*
 * Mounts the readable galaxy atmosphere above the canvas but below the HUD.
 * GalaxyBackground.js must be included by templates/index.html.
 */
(function(){
  'use strict';
  function mountGalaxyOverlay(){
    var gc=document.getElementById('gc');
    if(!gc||gc.querySelector('.realistic-galaxy-overlay'))return;
    var link=document.createElement('link');
    link.rel='stylesheet';
    link.href='/static/Game/GalaxyBackground.css?v=readable';
    document.head.appendChild(link);
    var overlay=document.createElement('div');
    overlay.className='realistic-galaxy-overlay';
    overlay.setAttribute('aria-hidden','true');
    gc.appendChild(overlay);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mountGalaxyOverlay);
  else mountGalaxyOverlay();
})();
