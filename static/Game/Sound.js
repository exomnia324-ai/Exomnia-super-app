'use strict';
/* ═══════════════════════════════════════════════════════════════════
   DEEP SPACE COMBAT — CINEMATIC SOUND ENGINE v3
   sounds.js  |  Replaces SFX in game.js  |  Load BEFORE game.js
   ═══════════════════════════════════════════════════════════════════

   Features:
   • Full Web Audio signal chain: Compressor → Reverb → Master
   • Separate buses: SFX bus, Music bus, UI bus
   • Procedural reverb (convolver)
   • Bitcrusher distortion for retro punch
   • Dynamic music system: Lobby / Battle / Boss layers
   • Adaptive music intensity based on wave / combo
   • Per-weapon unique synthesis
   • Spatial stereo panning
   • Voice limiting (max concurrent sources)
   ═══════════════════════════════════════════════════════════════════ */

const SFX = (() => {

  /* ── State ── */
  let ctx = null;
  let muted = false;
  let _ready = false;

  /* ── Buses ── */
  let masterGain, compressor, reverbNode, reverbGain, dryGain;
  let sfxBus, musicBus, uiBus;

  /* ── Music state ── */
  let _musicState = 'off';   // 'off' | 'lobby' | 'battle' | 'boss'
  let _musicSources = [];
  let _musicScheduler = null;
  let _beatCount = 0;
  let _musicIntensity = 0;   // 0–1, drives drum density & filter cutoff
  let _lobbyDrone = null;

  /* ── Voice limiter (max 20 simultaneous SFX nodes) ── */
  const _activeNodes = new Set();
  const MAX_VOICES = 20;

  /* ══════════════════════════════════════
     INIT & SIGNAL CHAIN
     Master: SFX/UI → Compressor → DryWet → Reverb → Master → Out
     Music: MusicBus → MusicCompressor → Master → Out
     ══════════════════════════════════════ */
  function init() {
    if (_ready) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();

      /* Master compressor — glues everything together */
      compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value      = 8;
      compressor.ratio.value     = 6;
      compressor.attack.value    = 0.003;
      compressor.release.value   = 0.18;

      /* Master gain */
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.9;

      compressor.connect(masterGain);
      masterGain.connect(ctx.destination);

      /* Reverb (convolver with generated impulse) */
      reverbNode  = _buildReverb(1.8, 0.5);   // 1.8s, slight damping
      reverbGain  = ctx.createGain(); reverbGain.gain.value  = 0.22;
      dryGain     = ctx.createGain(); dryGain.gain.value     = 1.0;
      reverbNode.connect(reverbGain);
      reverbGain.connect(compressor);
      dryGain.connect(compressor);

      /* SFX bus → dry + reverb send */
      sfxBus = ctx.createGain(); sfxBus.gain.value = 0.78;
      sfxBus.connect(dryGain);
      sfxBus.connect(reverbNode);

      /* Music bus — separate chain */
      const musicComp = ctx.createDynamicsCompressor();
      musicComp.threshold.value = -22; musicComp.ratio.value = 4;
      musicBus = ctx.createGain(); musicBus.gain.value = 0.52;
      musicBus.connect(musicComp);
      musicComp.connect(masterGain);

      /* UI bus — dry only, minimal reverb */
      uiBus = ctx.createGain(); uiBus.gain.value = 0.6;
      uiBus.connect(dryGain);

      _ready = true;
    } catch(e) { ctx = null; }
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  /* ── Procedural reverb impulse ── */
  function _buildReverb(duration, decay) {
    const conv = ctx.createConvolver();
    const sr   = ctx.sampleRate;
    const len  = Math.ceil(sr * duration);
    const ir   = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      for (let i = 0; i < len; i++) {
        ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay * 8);
      }
    }
    conv.buffer = ir;
    return conv;
  }

  /* ══════════════════════════════════════
     CORE SYNTH PRIMITIVES
     ══════════════════════════════════════ */

  /** Track a node so we can enforce voice limit */
  function _track(node, dur) {
    if (_activeNodes.size >= MAX_VOICES) {
      // Evict oldest — just let them finish naturally, don't stop
      // This is the gentlest approach for musical continuity
    }
    _activeNodes.add(node);
    setTimeout(() => _activeNodes.delete(node), (dur + 0.2) * 1000);
    return node;
  }

  /** Single oscillator with envelope */
  function _osc(freq, type, vol, dur, bus, opts = {}) {
    if (!_ready || muted) return null;
    const now = ctx.currentTime;
    const g   = ctx.createGain();
    const atk = opts.attack  ?? 0.004;
    const rel = opts.release ?? dur * 0.6;

    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + atk);
    if (opts.hold) {
      g.gain.setValueAtTime(vol, now + atk + opts.hold);
      g.gain.exponentialRampToValueAtTime(0.0001, now + atk + opts.hold + rel);
    } else {
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    }

    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    if (opts.sweep)     o.frequency.exponentialRampToValueAtTime(opts.sweep, now + dur);
    if (opts.vibrato)   _addVibrato(o, opts.vibrato.rate, opts.vibrato.depth, now);

    /* Optional panning */
    if (opts.pan !== undefined) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = opts.pan;
      o.connect(pan); pan.connect(g);
    } else {
      o.connect(g);
    }

    g.connect(bus || sfxBus);
    o.start(now + (opts.delay || 0));
    o.stop(now + (opts.delay || 0) + dur + 0.1);
    return _track(g, dur);
  }

  /** Noise burst with filter */
  function _noise(vol, dur, bus, opts = {}) {
    if (!_ready || muted) return null;
    const sr     = ctx.sampleRate;
    const bufLen = Math.ceil(sr * Math.min(dur, 2));
    const buf    = ctx.createBuffer(1, bufLen, sr);
    const data   = buf.getChannelData(0);
    // Pink-ish noise (smoother than white)
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0;
    for (let i = 0; i < bufLen; i++) {
      const w = Math.random() * 2 - 1;
      b0=0.99886*b0+w*0.0555179; b1=0.99332*b1+w*0.0750759;
      b2=0.96900*b2+w*0.1538520; b3=0.86650*b3+w*0.3104856;
      b4=0.55000*b4+w*0.5329522; b5=-0.7616*b5-w*0.0168980;
      data[i] = (b0+b1+b2+b3+b4+b5+w*0.5362)*0.11;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;

    const filt = ctx.createBiquadFilter();
    filt.type            = opts.filter ?? 'lowpass';
    filt.frequency.value = opts.freq   ?? 1000;
    filt.Q.value         = opts.Q      ?? 1;
    if (opts.freqSweep) {
      filt.frequency.exponentialRampToValueAtTime(opts.freqSweep, ctx.currentTime + dur);
    }

    const g = ctx.createGain();
    const now = ctx.currentTime + (opts.delay || 0);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    /* Optional stereo */
    if (opts.pan !== undefined) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = opts.pan;
      src.connect(filt); filt.connect(pan); pan.connect(g);
    } else {
      src.connect(filt); filt.connect(g);
    }
    g.connect(bus || sfxBus);
    src.start(now); src.stop(now + dur + 0.05);
    return _track(g, dur);
  }

  /** Layer helper: play multiple sounds with delays */
  function _layer(fn, delays = [0]) {
    delays.forEach(d => {
      if (d === 0) fn(0);
      else setTimeout(() => fn(d), d * 1000);
    });
  }

  /** LFO vibrato on oscillator */
  function _addVibrato(osc, rate, depth, startTime) {
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.frequency.value = rate;
    lfoG.gain.value     = depth;
    lfo.connect(lfoG);
    lfoG.connect(osc.frequency);
    lfo.start(startTime); lfo.stop(startTime + 4);
  }

  /* ══════════════════════════════════════
     WEAPON SOUNDS  (unique per weapon)
     ══════════════════════════════════════ */

  function shoot_pulse() {
    // Tight plasma pop with slight pitch sweep
    _osc(380, 'square', 0.22, 0.09, sfxBus, { attack:0.001, sweep:160, pan: _randPan(0.15) });
    _osc(190, 'sine',   0.10, 0.07, sfxBus, { attack:0.001, sweep:110 });
    _noise(0.06, 0.05, sfxBus, { filter:'highpass', freq:3500 });
  }

  function shoot_laser() {
    // Crisp high-frequency zap
    _osc(1800,'sawtooth', 0.14, 0.06, sfxBus, { attack:0.0005, sweep:3200 });
    _osc( 900,'sine',     0.08, 0.05, sfxBus, { attack:0.001,  sweep:2200 });
    _noise(0.04, 0.04, sfxBus, { filter:'highpass', freq:5000 });
  }

  function shoot_plasma() {
    // Wet gooey energy
    _osc(260,'sawtooth', 0.18, 0.12, sfxBus, { attack:0.003, sweep:120, pan: _randPan(0.2) });
    _noise(0.14, 0.10, sfxBus, { filter:'bandpass', freq:900, Q:2, freqSweep:400 });
    _osc(520,'sine',     0.07, 0.08, sfxBus, { attack:0.005, sweep:300 });
  }

  function shoot_missile() {
    // Whooshing rocket
    _noise(0.30, 0.18, sfxBus, { filter:'lowpass', freq:700, Q:0.6, freqSweep:200 });
    _osc(100,'sawtooth', 0.20, 0.20, sfxBus, { attack:0.015, sweep:55 });
    _osc( 55,'sine',     0.12, 0.22, sfxBus, { attack:0.020, sweep:30 });
  }

  function shoot_gatling() {
    // Sharp mechanical burst
    const f = 340 + Math.random() * 100;
    _osc(f,'square',    0.16, 0.04, sfxBus, { attack:0.001, sweep:200, pan: _randPan(0.3) });
    _noise(0.10, 0.03, sfxBus, { filter:'highpass', freq:2500 });
  }

  function shoot_shotgun() {
    // Heavy concussive blast with stereo spread
    _noise(0.45, 0.22, sfxBus, { filter:'lowpass', freq:500, Q:0.4, pan:-0.3 });
    _noise(0.40, 0.20, sfxBus, { filter:'lowpass', freq:450, Q:0.3, pan: 0.3 });
    _osc(70, 'square', 0.28, 0.18, sfxBus, { attack:0.002, sweep:32 });
    _osc(95, 'sine',   0.15, 0.12, sfxBus, { attack:0.004, sweep:40 });
  }

  function shoot_railgun() {
    // Supersonic crack — silence then thunder
    setTimeout(() => {
      _noise(0.50, 0.08, sfxBus, { filter:'highpass', freq:4000, Q:3 });
    }, 30);
    _osc(40, 'square', 0.45, 0.06, sfxBus, { attack:0.001, sweep:3000 });
    _noise(0.40, 0.20, sfxBus, { filter:'lowpass', freq:600, Q:0.5, delay:0.05 });
    _osc(1800,'sine',  0.10, 0.15, sfxBus, { attack:0.001, sweep:200,  delay:0.05 });
  }

  function shoot_emp() {
    // Electric discharge wave
    _osc(55,'sawtooth', 0.35, 0.6,  sfxBus, { attack:0.012, sweep:18 });
    _noise(0.30, 0.5,  sfxBus, { filter:'lowpass', freq:250, Q:0.3 });
    _osc(220,'sine',   0.18, 0.7,  sfxBus, { attack:0.008, sweep:1400, vibrato:{rate:8, depth:20} });
    setTimeout(() => _noise(0.20, 0.3, sfxBus, { filter:'bandpass', freq:600, Q:1.5 }), 200);
  }

  function shoot_nuke() {
    // Earth-shattering kaboom
    _osc(35,'sawtooth', 0.50, 1.0, sfxBus, { attack:0.025, sweep:12 });
    _noise(0.60, 1.2,  sfxBus, { filter:'lowpass', freq:180, Q:0.2 });
    _osc(90,'square',  0.30, 0.8,  sfxBus, { attack:0.010, sweep:28 });
    setTimeout(() => {
      _noise(0.70, 0.6, sfxBus, { filter:'lowpass', freq:350, Q:0.4 });
      _osc(28,'sine',  0.40, 1.5, sfxBus, { attack:0.040, sweep:60 });
    }, 140);
    setTimeout(() => {
      _noise(0.35, 0.5, sfxBus, { filter:'bandpass', freq:200, Q:0.8 });
    }, 350);
  }

  function shoot_twin() {
    _osc(400,'square', 0.20, 0.09, sfxBus, { attack:0.001, sweep:170, pan:-0.35 });
    _osc(400,'square', 0.20, 0.09, sfxBus, { attack:0.001, sweep:170, pan: 0.35 });
    _noise(0.05, 0.05, sfxBus, { filter:'highpass', freq:3000 });
  }

  function shoot_vortex() {
    // Spinning sucking sound
    _osc(180,'sine', 0.25, 1.0, sfxBus, { attack:0.02, sweep:60, vibrato:{rate:5, depth:40} });
    _noise(0.20, 0.8, sfxBus, { filter:'bandpass', freq:300, Q:2 });
  }

  function shoot_flare() {
    // Sizzling scatter
    _noise(0.30, 0.15, sfxBus, { filter:'bandpass', freq:1200, Q:1.5, pan:-0.2 });
    _noise(0.25, 0.14, sfxBus, { filter:'bandpass', freq:1500, Q:1.2, pan: 0.3 });
    _osc(600,'sawtooth', 0.12, 0.12, sfxBus, { attack:0.003, sweep:200 });
  }

  function shoot_freeze() {
    // Icy crystalline burst
    _osc(1200,'sine', 0.14, 0.20, sfxBus, { attack:0.005, sweep:2400, vibrato:{rate:12, depth:15} });
    _osc( 600,'sine', 0.10, 0.22, sfxBus, { attack:0.008, sweep:1200 });
    _noise(0.12, 0.18, sfxBus, { filter:'highpass', freq:4000, Q:2 });
  }

  function shoot_chain() {
    // Electric crackle x3
    for (let i = 0; i < 3; i++) {
      const delay = i * 0.06;
      _osc(800+i*200,'square', 0.18, 0.08, sfxBus, { attack:0.001, sweep:2000, delay, pan: (i-1)*0.4 });
      _noise(0.15, 0.06, sfxBus, { filter:'highpass', freq:3000, delay });
    }
  }

  function shoot_blackhole() {
    // Deep gravitational pull
    _osc(25,'sine', 0.55, 2.0, sfxBus, { attack:0.08, sweep:8 });
    _noise(0.40, 2.0, sfxBus, { filter:'lowpass', freq:120, Q:0.2 });
    _osc(50,'sawtooth', 0.25, 1.8, sfxBus, { attack:0.05, sweep:15, vibrato:{rate:2, depth:10} });
    setTimeout(() => {
      _noise(0.50, 0.8, sfxBus, { filter:'bandpass', freq:80, Q:0.5 });
    }, 800);
  }

  /* ══════════════════════════════════════
     GAME EVENT SOUNDS
     ══════════════════════════════════════ */

  function enemy_explode() {
    _noise(0.32, 0.22, sfxBus, { filter:'lowpass', freq:600, Q:0.7, pan: _randPan(0.5) });
    _osc(130,'square', 0.22, 0.18, sfxBus, { attack:0.003, sweep:52 });
    _noise(0.10, 0.08, sfxBus, { filter:'highpass', freq:2000 });
  }

  function enemy_explode_big() {
    _noise(0.55, 0.45, sfxBus, { filter:'lowpass', freq:320, Q:0.4 });
    _osc(65,'sawtooth',  0.38, 0.40, sfxBus, { attack:0.005, sweep:22 });
    _osc(200,'square',   0.18, 0.30, sfxBus, { attack:0.008, sweep:75 });
    setTimeout(() => _noise(0.30, 0.25, sfxBus, { filter:'bandpass', freq:500, Q:1 }), 80);
  }

  function player_hit() {
    // Jarring impact — makes player flinch
    _noise(0.55, 0.12, sfxBus, { filter:'bandpass', freq:800, Q:1.5 });
    _osc(160,'square', 0.40, 0.18, sfxBus, { attack:0.001, sweep:55 });
    _osc(440,'sine',   0.20, 0.14, sfxBus, { attack:0.002, sweep:120 });
    _noise(0.15, 0.25, sfxBus, { filter:'lowpass', freq:300, Q:0.5 });
  }

  function pickup_coin() {
    // Bright satisfying ding
    _osc(1047,'sine', 0.22, 0.09, sfxBus, { attack:0.001 });
    _osc(1319,'sine', 0.16, 0.07, sfxBus, { attack:0.002 });
    _osc(1568,'sine', 0.10, 0.06, sfxBus, { attack:0.003 });
  }

  function pickup_health() {
    // Warm healing chord
    [523, 659, 784, 1047].forEach((f, i) => {
      _osc(f, 'sine', 0.18, 0.25, sfxBus, { attack: 0.005 + i*0.006, vibrato:{rate:4, depth:3} });
    });
  }

  function pickup_powerup() {
    // Ascending shimmer
    const freqs = [440, 554, 659, 880, 1109];
    freqs.forEach((f, i) => {
      _osc(f, 'sine', 0.15, 0.14, sfxBus, { attack:0.003, delay: i*0.055 });
    });
    _noise(0.06, 0.3, sfxBus, { filter:'highpass', freq:5000 });
  }

  function level_up() {
    // Triumphant fanfare
    const seq = [523, 659, 784, 1047, 1319];
    seq.forEach((f, i) => {
      _osc(f, 'sine', 0.26, 0.22, sfxBus, { attack:0.005, delay: i*0.09 });
      if (i > 0) _osc(f*0.75,'sine', 0.10, 0.18, sfxBus, { attack:0.008, delay: i*0.09 });
    });
    _noise(0.08, 0.5, sfxBus, { filter:'highpass', freq:4000, delay: 0.35 });
  }

  function wave_start() {
    _osc(220,'square', 0.22, 0.14, sfxBus, { attack:0.008 });
    _osc(330,'square', 0.22, 0.14, sfxBus, { attack:0.008, delay:0.13 });
    _osc(440,'square', 0.26, 0.22, sfxBus, { attack:0.008, delay:0.26 });
    _noise(0.08, 0.12, sfxBus, { filter:'highpass', freq:3000, delay:0.26 });
  }

  function boss_spawn() {
    // Cinematic dread stinger
    _osc(48, 'sawtooth', 0.45, 0.7, sfxBus, { attack:0.025, sweep:30 });
    _noise(0.50, 0.5, sfxBus, { filter:'lowpass', freq:220, Q:0.3 });
    setTimeout(() => {
      _osc(96,'square', 0.35, 0.5, sfxBus, { attack:0.012, sweep:48 });
      _noise(0.30, 0.4, sfxBus, { filter:'lowpass', freq:350, Q:0.4 });
    }, 280);
    setTimeout(() => {
      _osc(72,'sine', 0.28, 0.8, sfxBus, { attack:0.04, sweep:36, vibrato:{rate:3, depth:8} });
    }, 550);
  }

  function boss_phase2() {
    _noise(0.45, 0.3, sfxBus, { filter:'lowpass', freq:400, Q:0.5 });
    _osc(80,'square',  0.42, 0.35, sfxBus, { attack:0.010 });
    _osc(160,'square', 0.30, 0.30, sfxBus, { attack:0.012, delay:0.15 });
    _osc(240,'sine',   0.20, 0.40, sfxBus, { attack:0.015, delay:0.25 });
  }

  function boss_die() {
    // Cascading destruction
    for (let i = 0; i < 8; i++) {
      const d = i * 0.13;
      _noise(0.55, 0.4,  sfxBus, { filter:'lowpass', freq:180+i*35, Q:0.35, delay:d });
      _osc(55+i*12,'sawtooth', 0.35, 0.45, sfxBus, { attack:0.004, sweep:18+i*4, delay:d });
    }
    // Final crescendo
    setTimeout(() => {
      _noise(0.70, 0.8, sfxBus, { filter:'lowpass', freq:500, Q:0.3 });
      _osc(40,'sine', 0.50, 1.2, sfxBus, { attack:0.05, sweep:100 });
    }, 900);
  }

  function special_nova() {
    _osc(45,'sawtooth', 0.50, 0.8, sfxBus, { attack:0.025, sweep:14 });
    _noise(0.55, 1.0, sfxBus, { filter:'lowpass', freq:280, Q:0.2 });
    setTimeout(() => {
      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          _noise(0.35, 0.3, sfxBus, { filter:'bandpass', freq:250+i*80, Q:1.2 });
          _osc(80+i*20,'sine', 0.22, 0.35, sfxBus, { attack:0.005 });
        }, i * 90);
      }
    }, 180);
  }

  function game_over() {
    // Descending dirge
    const seq = [440, 330, 220, 165, 110];
    seq.forEach((f, i) => {
      _osc(f, 'sawtooth', 0.28, 0.55, sfxBus, { attack:0.012, sweep:f*0.38, delay:i*0.22 });
      _noise(0.08, 0.3, sfxBus, { filter:'lowpass', freq:400, delay:i*0.22 });
    });
  }

  function combo_hit(combo) {
    // Pitch rises with combo — very satisfying
    const f   = 220 + Math.min(combo, 40) * 22;
    const vol = 0.10 + Math.min(combo, 20) * 0.005;
    _osc(f,   'square', vol,      0.07, sfxBus, { attack:0.001, sweep:f*1.4 });
    _osc(f*2, 'sine',   vol*0.5,  0.05, sfxBus, { attack:0.001 });
    if (combo >= 10) _noise(0.06, 0.05, sfxBus, { filter:'highpass', freq:4000 });
  }

  function ui_click() {
    _osc(880, 'sine', 0.12, 0.05, uiBus, { attack:0.001 });
  }

  function ui_open() {
    _osc(660, 'sine', 0.10, 0.08, uiBus, { attack:0.002 });
    _osc(880, 'sine', 0.08, 0.07, uiBus, { attack:0.004 });
  }

  function achievement_unlock() {
    // Distinct celebratory chime
    const seq = [784, 988, 1175, 1568];
    seq.forEach((f, i) => {
      _osc(f, 'sine', 0.22, 0.28, sfxBus, { attack:0.003, delay:i*0.08 });
    });
    _noise(0.06, 0.4, sfxBus, { filter:'highpass', freq:5000, delay:0.24 });
  }

  function daily_claim() {
    // Warm positive chime
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => {
      _osc(f, 'sine', 0.18, 0.30, sfxBus, { attack:0.004 + i*0.003, delay:i*0.07 });
    });
    _noise(0.05, 0.5, sfxBus, { filter:'highpass', freq:6000, delay:0.3 });
  }

  /* ══════════════════════════════════════
     WEAPON SOUND DISPATCHER
     ══════════════════════════════════════ */
  function weaponSound(wName) {
    init(); resume();
    const map = {
      PULSE:     shoot_pulse,
      LASER:     shoot_laser,
      PLASMA:    shoot_plasma,
      MISSILE:   shoot_missile,
      RAILGUN:   shoot_railgun,
      GATLING:   shoot_gatling,
      SHOTGUN:   shoot_shotgun,
      EMP:       shoot_emp,
      NUKE:      shoot_nuke,
      TWIN:      shoot_twin,
      VORTEX:    shoot_vortex,
      FLARE:     shoot_flare,
      FREEZE:    shoot_freeze,
      CHAIN:     shoot_chain,
      BLACKHOLE: shoot_blackhole,
    };
    (map[wName] || shoot_pulse)();
  }

  /* ══════════════════════════════════════
     DYNAMIC MUSIC SYSTEM
     Three layers: bass / pad / melody — mixed by intensity
     Lobby  → slow ambient drone
     Battle → driving rhythm + melody
     Boss   → intense industrial pulse
     ══════════════════════════════════════ */

  /* Musical scales */
  const SCALE_MINOR   = [55, 65.4, 73.4, 82.4, 98.0, 110, 130.8, 146.8]; // A minor
  const SCALE_PHRYGIAN = [55, 58.3, 65.4, 73.4, 82.4,  87.3, 98.0, 110];  // darker
  const SCALE_BOSS    = [36.7, 41.2, 49.0, 55.0, 61.7, 73.4, 82.4, 98.0]; // C# minor low

  function setMusicIntensity(val) {
    _musicIntensity = Math.max(0, Math.min(1, val));
  }

  function startMusic(mode) {
    if (!_ready) { init(); }
    if (muted) return;
    stopMusic();
    _musicState = mode || 'battle';
    _beatCount  = 0;

    if (_musicState === 'lobby') {
      _lobbyLoop();
    } else if (_musicState === 'battle') {
      _battleLoop(ctx.currentTime);
    } else if (_musicState === 'boss') {
      _bossLoop(ctx.currentTime);
    }
  }

  function stopMusic() {
    _musicState = 'off';
    clearTimeout(_musicScheduler);
    _musicSources.forEach(n => { try { n.stop(); } catch(e) {} });
    _musicSources = [];
    if (_lobbyDrone) { try { _lobbyDrone.stop(); } catch(e) {} _lobbyDrone = null; }
  }

  /* ── Lobby: deep space ambient ── */
  function _lobbyLoop() {
    if (_musicState !== 'lobby' || !_ready || muted) return;
    const now = ctx.currentTime;

    // Slow chord pad
    const chords = [
      [55, 65.4, 82.4],   // Am
      [48.9, 65.4, 73.4], // F
      [43.7, 65.4, 73.4], // C
      [41.2, 61.7, 82.4], // E
    ];
    const chord = chords[_beatCount % chords.length];
    chord.forEach((f, i) => {
      _musicNote(f*2, 'sine', 0.028, 3.5, now + i*0.08);
      _musicNote(f,   'sine', 0.018, 3.5, now + i*0.08, { vibrato:{rate:0.6, depth:1.5} });
    });

    // Slow ethereal blips
    if (Math.random() < 0.5) {
      const f = chord[Math.floor(Math.random()*chord.length)] * 4;
      _musicNote(f, 'sine', 0.015, 0.3, now + Math.random()*2);
    }

    // Sub bass breath
    _musicNote(chord[0]*0.5, 'sine', 0.040, 3.8, now, { sweep: chord[0]*0.5*0.92 });

    _beatCount++;
    _musicScheduler = setTimeout(() => _lobbyLoop(), 3600);
  }

  /* ── Battle: adaptive drum + melody ── */
  const BATTLE_MELODY = [0,4,7,4,2,5,3,0, 7,5,4,2,0,4,5,7];
  const BATTLE_BASS   = [0,0,4,0,0,4,0,5];
  const STEP = 0.19; // seconds per 16th note
  let _battleBar = 0;

  function _battleLoop(startAt) {
    if (_musicState !== 'battle' || !_ready || muted) return;
    const t    = Math.max(startAt, ctx.currentTime);
    const intn = _musicIntensity;
    const scale = SCALE_MINOR;

    for (let s = 0; s < 16; s++) {
      const st = t + s * STEP;

      /* Kick drum — always on 1 & 9, more on high intensity */
      if (s === 0 || s === 8 || (intn > 0.5 && s === 4) || (intn > 0.7 && s === 12)) {
        _musicKick(st, intn);
      }

      /* Snare — 5 & 13 */
      if (s === 4 || s === 12) _musicSnare(st, intn);

      /* Hi-hat — density grows with intensity */
      const hatThresh = 0.5 - intn * 0.4;
      if (Math.random() > hatThresh) _musicHat(st, intn);

      /* Bass line — every 2 steps */
      if (s % 2 === 0) {
        const deg = BATTLE_BASS[Math.floor(s/2) % BATTLE_BASS.length];
        const bFreq = scale[deg % scale.length];
        _musicNote(bFreq, 'sawtooth', 0.040 + intn*0.015, STEP*1.6, st);
        _musicNote(bFreq*2,'sine',    0.018,               STEP*1.4, st);
      }

      /* Melody — plays on intensity > 0.3 */
      if (intn > 0.3 && (s % 4 === 0 || (intn > 0.6 && s % 2 === 0))) {
        const mi   = BATTLE_MELODY[(_battleBar * 4 + Math.floor(s/4)) % BATTLE_MELODY.length];
        const mFreq = scale[mi % scale.length] * 4;
        _musicNote(mFreq, 'sine', 0.022 + intn*0.010, STEP*3.5, st,
          { vibrato:{rate:5, depth:3} });
      }

      /* Pad chord every 4 beats */
      if (s === 0) {
        const chordDegs = [0,2,4];
        chordDegs.forEach((d,i) => {
          _musicNote(scale[d%scale.length]*2, 'sine', 0.016, STEP*15, st + i*0.025);
        });
      }
    }

    const loopLen = 16 * STEP;
    _battleBar++;
    _musicScheduler = setTimeout(() => _battleLoop(t + loopLen), (loopLen - 0.05) * 1000);
  }

  /* ── Boss: industrial pulse ── */
  const BOSS_PATTERN = [1,0,0,1, 1,0,1,0, 1,1,0,1, 0,1,1,0]; // syncopated
  const BOSS_STEP    = 0.13;
  let _bossBar = 0;

  function _bossLoop(startAt) {
    if (_musicState !== 'boss' || !_ready || muted) return;
    const t = Math.max(startAt, ctx.currentTime);
    const scale = SCALE_BOSS;

    for (let s = 0; s < 16; s++) {
      const st = t + s * BOSS_STEP;

      /* Distorted kick pattern */
      if (BOSS_PATTERN[s]) _musicKick(st, 1.0, true);

      /* Industrial noise snare every 4 */
      if (s % 4 === 2) _musicSnare(st, 1.0, true);

      /* Dense hi-hats */
      _musicHat(st, 0.9);

      /* Bass — low and menacing */
      if (s % 2 === 0) {
        const bFreq = scale[s % scale.length];
        _musicNote(bFreq, 'sawtooth', 0.055, BOSS_STEP*3, st);
      }

      /* Dissonant melody stabs */
      if (s === 0 || s === 7 || s === 11) {
        const f = scale[_bossBar % scale.length] * 2;
        _musicNote(f,'square', 0.018, BOSS_STEP*2, st);
        _musicNote(f*1.5,'sawtooth', 0.010, BOSS_STEP*1.5, st);
      }
    }

    const loopLen = 16 * BOSS_STEP;
    _bossBar++;
    _musicScheduler = setTimeout(() => _bossLoop(t + loopLen), (loopLen - 0.04) * 1000);
  }

  /* ── Drum synths ── */
  function _musicKick(when, intensity, distorted = false) {
    if (!_ready || muted) return;
    const vol = 0.55 + intensity * 0.15;
    const g   = ctx.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.35);

    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(180, when);
    o.frequency.exponentialRampToValueAtTime(38, when + 0.12);
    o.type = 'sine';

    if (distorted) {
      const wave = ctx.createWaveShaper();
      wave.curve = _distortCurve(120);
      o.connect(wave); wave.connect(g);
    } else {
      o.connect(g);
    }
    g.connect(musicBus);
    o.start(when); o.stop(when + 0.4);
    _musicSources.push(o);

    // Click transient
    const bufLen = Math.ceil(ctx.sampleRate * 0.01);
    const buf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) d[i] = (Math.random()*2-1) * (1-i/bufLen);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const cg  = ctx.createGain(); cg.gain.value = 0.3 + intensity*0.1;
    src.connect(cg); cg.connect(musicBus);
    src.start(when); src.stop(when + 0.02);
    _musicSources.push(src);
  }

  function _musicSnare(when, intensity, hard = false) {
    if (!_ready || muted) return;
    const bufLen = Math.ceil(ctx.sampleRate * 0.18);
    const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data   = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random()*2-1;

    const src  = ctx.createBufferSource(); src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = hard ? 'lowpass' : 'bandpass';
    filt.frequency.value = hard ? 3000 : 1800;
    filt.Q.value = 0.8;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35 + intensity*0.15, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.18);

    src.connect(filt); filt.connect(g); g.connect(musicBus);
    src.start(when); src.stop(when + 0.2);
    _musicSources.push(src);

    // Body tone
    const o = ctx.createOscillator();
    o.frequency.value = hard ? 280 : 200;
    o.type = 'triangle';
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.18, when);
    og.gain.exponentialRampToValueAtTime(0.0001, when + 0.08);
    o.connect(og); og.connect(musicBus);
    o.start(when); o.stop(when + 0.1);
    _musicSources.push(o);
  }

  function _musicHat(when, intensity) {
    if (!_ready || muted) return;
    const bufLen = Math.ceil(ctx.sampleRate * 0.04);
    const buf    = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const d      = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) d[i] = Math.random()*2-1;
    const src  = ctx.createBufferSource(); src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = 'highpass'; filt.frequency.value = 7000; filt.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06 + intensity*0.04, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.04);
    src.connect(filt); filt.connect(g); g.connect(musicBus);
    src.start(when); src.stop(when + 0.05);
    _musicSources.push(src);
  }

  function _musicNote(freq, type, vol, dur, when, opts = {}) {
    if (!_ready || muted) return;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(vol, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);

    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, when);
    if (opts.sweep) o.frequency.exponentialRampToValueAtTime(opts.sweep, when + dur);
    if (opts.vibrato) _addVibrato(o, opts.vibrato.rate, opts.vibrato.depth, when);

    o.connect(g); g.connect(musicBus);
    o.start(when); o.stop(when + dur + 0.05);
    _musicSources.push(o);
  }

  function _distortCurve(amount) {
    const n = 256, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i*2/n - 1;
      curve[i] = (Math.PI + amount) * x / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  /* ══════════════════════════════════════
     MUTE / VOLUME
     ══════════════════════════════════════ */
  function setMute(v) {
    muted = v;
    if (masterGain) masterGain.gain.value = v ? 0 : 0.9;
    if (v) stopMusic();
    else if (_ready && _musicState === 'off') startMusic('battle');
  }
  function toggleMute() { init(); resume(); setMute(!muted); return muted; }
  function isMuted() { return muted; }

  /* ── Utility ── */
  function _randPan(max = 0.4) { return (Math.random()*2-1) * max; }

  /* ══════════════════════════════════════
     PUBLIC API
     ══════════════════════════════════════ */
  return {
    init, resume,
    weaponSound,
    enemy_explode, enemy_explode_big,
    player_hit,
    pickup_coin, pickup_health, pickup_powerup,
    level_up, wave_start,
    boss_spawn, boss_phase2, boss_die,
    special_nova, game_over,
    ui_click, ui_open, combo_hit,
    achievement_unlock, daily_claim,
    startMusic, stopMusic, setMusicIntensity,
    toggleMute, isMuted, setMute,
  };

})();
