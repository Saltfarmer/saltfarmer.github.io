/* Bubu Adventure: a small 3-level platformer for saltfarmer.github.io
   Bubu throws stones, kicks, and jumps on Dudu monsters. Level 3 has a boss.
   No dependencies. Character art comes from the sprite strips in ./sprites/.
   Scores stay in this browser (localStorage). */
(function () {
  'use strict';

  /* ================= constants ================= */
  var VW = 640, VH = 360, T = 30;
  var GRAV = 1500, MAX_FALL = 720;
  var RUN = 175, ACC = 1400, AIR_ACC = 900, FRICTION = 1600;
  var JUMP_V = 560, STOMP_BOUNCE = 420;
  var COYOTE = 0.1, JUMP_BUFFER = 0.12;
  var MAX_HP = 5;
  var DMG = { stone: 1, kick: 2, stomp: 3 };

  var SPR = {"idle":{"w":49,"h":57,"n":8,"ms":90,"ax":0.555,"face":1},"walk":{"w":43,"h":59,"n":16,"ms":45,"ax":0.5,"face":1},"jump":{"w":42,"h":58,"n":1,"ms":100,"ax":0.493,"face":1},"throw":{"w":45,"h":59,"n":11,"ms":32,"ax":0.508,"face":1},"kick":{"w":63,"h":69,"n":10,"ms":42,"ax":0.635,"face":1},"hurt":{"w":47,"h":54,"n":16,"ms":60,"ax":0.52,"face":1},"sad":{"w":118,"h":140,"n":19,"ms":140,"ax":0.526,"face":1},"ride":{"w":115,"h":125,"n":16,"ms":55,"ax":0.497,"face":1},"dudu":{"w":42,"h":59,"n":6,"ms":110,"ax":0.491,"face":1},"duduFire":{"w":58,"h":52,"n":1,"ms":300,"ax":0.378,"face":1},"boss":{"w":117,"h":135,"n":6,"ms":180,"ax":0.535,"face":1},"title":{"w":97,"h":112,"n":8,"ms":90,"ax":0.555,"face":1},"slap":{"w":121,"h":150,"n":2,"ms":300,"ax":0.5,"face":1}};
  var LEVELS = [{"name":"Sunny Meadow","theme":0,"map":["                                                                                                    ","                                                                                                    ","                                                                                                    ","                                                                                                    ","                                                                                                    ","                                                                                                    ","                                              H                                                     ","                  =====                     =====                     =====                         ","                                                                                    ####            ","   P 1       2        3   D        4    D         C  D            D            D    ####        G   ","##############################  ##########################   #######################################","##############################  ##########################   #######################################"],"fire":false},{"name":"Cloud Hills","theme":1,"map":["                                                                                                                                  ","                                                                                                                                  ","                                                                                                                                  ","                                                                                                                                  ","                                                                                            F H                                   ","                                                                                        =========                                 ","                                                                                                                                  ","                                                          H           ####                          =====                         ","                               F    ==                   ===          ####          ===                         ####              ","  P        F          F   #########          F     F          C   F   ####   F                      F       F   ####    F     G   ","###############   #################    #################     ####################   ##############################################","###############   #################    #################     ####################   ##############################################"],"fire":true},{"name":"Ice-cream Castle","theme":2,"map":["                                                                        ##","                                                                        ##","                                                                        ##","                                                                        ##","                                                                        ##","                                                                        ##","                                H                                       ##","                              =====                                     ##","                   ===                ###                               ##","  P         F              F        F ###   C                   B       ##","###################   ####################### ############################","###################   ####################### ############################"],"fire":true,"arena":[47,71]}];
  var HINTS = {
    '1': ['← →  walk', 'Space / ↑  jump'],
    '2': ['J or Z', 'throw a stone'],
    '3': ['K or X', 'kick!'],
    '4': ['Jump on Dudu', 'for big damage']
  };
  if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
    HINTS = {
      '1': ['Drag left: walk', 'Tap screen: jump'],
      '2': ['Throw button', 'throw a stone'],
      '3': ['Kick button', 'kick!'],
      '4': ['Jump on Dudu', 'for big damage']
    };
  }
  var THEMES = [
    { sky: ['#BFE6FA', '#EEF9FF'], hill1: '#B9E4B0', hill2: '#9ED49A', dirt: '#E9B98B', grass: '#8FD37F' },
    { sky: ['#CFE3FF', '#F4F8FF'], hill1: '#D7E4F7', hill2: '#BCD2F0', dirt: '#E6C3A0', grass: '#9EDB93' },
    { sky: ['#F6D9E8', '#FFF1E2'], hill1: '#E8CDEB', hill2: '#D7B3DE', dirt: '#E7B9A0', grass: '#F3C6D8' }
  ];
  var OUTLINE = '#5A3A2E';

  /* ================= setup ================= */
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var RES = 2; // internal resolution multiplier for crisp sprites
  canvas.width = VW * RES; canvas.height = VH * RES;
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  ctx.imageSmoothingQuality = 'high';

  var IMG = {}, loaded = 0, total = Object.keys(SPR).length;
  Object.keys(SPR).forEach(function (k) {
    var im = new Image();
    im.onload = function () { loaded++; };
    im.onerror = function () { loaded++; };
    im.src = 'sprites/' + k + '.webp';
    IMG[k] = im;
  });

  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }

  /* ================= sound ================= */
  // Effects are synthesised with Web Audio (no files). Bubu's voice clips are
  // optional files: sounds/atata.mp3, sounds/tatalala.mp3 and the ending song sounds/dudidamdam.mp3.
  var Sfx = (function () {
    var ac = null, master = null, voices = {}, lastVoice = 0;
    var muted = store('bubu-mute') === true;
    function init() {
      if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain(); master.gain.value = muted ? 0 : 0.55; master.connect(ac.destination);
      loadVoice('atata', 'sounds/atata.mp3');
      loadVoice('tatalala', 'sounds/tatalala.mp3');
      loadVoice('dudidamdam', 'sounds/dudidamdam.mp3');
    }
    function loadVoice(k, url) {
      fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(function (b) { return new Promise(function (res, rej) { ac.decodeAudioData(b, res, rej); }); })
        .then(function (buf) { voices[k] = buf; })
        .catch(function () { /* clip not added yet: play without it */ });
    }
    function tone(f1, dur, type, vol, f2, delay) {
      if (!ac) return;
      var t = ac.currentTime + (delay || 0);
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(f1, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    }
    var noiseBuf = null;
    function noise(dur, vol, freq, ftype, delay) {
      if (!ac) return;
      if (!noiseBuf) {
        noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
        var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      var t = ac.currentTime + (delay || 0);
      var src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      src.buffer = noiseBuf; f.type = ftype || 'lowpass'; f.frequency.value = freq || 1200;
      g.gain.setValueAtTime(vol || 0.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + dur + 0.02);
    }
    function voice(k, vol, minGap) {
      if (!ac || !voices[k]) return false;
      var now = ac.currentTime;
      if (now - lastVoice < (minGap || 0)) return false;
      lastVoice = now;
      var src = ac.createBufferSource(), g = ac.createGain();
      src.buffer = voices[k]; g.gain.value = vol || 0.9;
      src.connect(g); g.connect(master); src.start();
      return true;
    }
    // Ending song: loops under the credits, fades out when the win screen closes.
    var song = null;
    function songStart(k, vol) {
      if (!ac || !voices[k] || song) return false;
      var src = ac.createBufferSource(), g = ac.createGain();
      src.buffer = voices[k]; src.loop = true; g.gain.value = vol || 0.8;
      src.connect(g); g.connect(master); src.start();
      song = { src: src, g: g };
      return true;
    }
    function songStop(fade) {
      if (!song || !ac) return;
      var s = song, t = ac.currentTime, f = fade == null ? 0.8 : fade; song = null;
      s.g.gain.setValueAtTime(s.g.gain.value, t);
      s.g.gain.linearRampToValueAtTime(0.0001, t + f);
      try { s.src.stop(t + f + 0.05); } catch (e) {}
    }
    function notes(list, type, vol, step) {
      list.forEach(function (f, i) { tone(f, step * 1.6, type || 'triangle', vol || 0.14, null, i * step); });
    }
    var play = {
      jump: function () { tone(380, 0.13, 'square', 0.08, 760); },
      mount: function () { tone(330, 0.12, 'triangle', 0.16, 660); tone(660, 0.14, 'triangle', 0.14, 990, 0.1); voice('atata', 0.9, 1); },
      crash: function () { tone(140, 0.4, 'sawtooth', 0.22, 45); noise(0.35, 0.3, 700, 'lowpass'); },
      slap: function () { noise(0.07, 0.38, 1900, 'highpass'); tone(330, 0.05, 'triangle', 0.12, 150); },
      sing: function () { if (!voice('tatalala', 0.85, 1.5)) notes([784, 880, 784, 659, 784, 988], 'sine', 0.09, 0.13); },
      step: function () { var f = 150 + Math.random() * 50; tone(f, 0.06, 'sine', 0.07, f * 0.6); noise(0.05, 0.03, 1800, 'lowpass'); },
      throw: function () { noise(0.1, 0.12, 2600, 'highpass'); tone(620, 0.08, 'triangle', 0.06, 300); },
      kick: function () { noise(0.16, 0.22, 1400, 'bandpass'); tone(220, 0.16, 'sine', 0.3, 70); voice('atata', 0.9, 2.5); },
      hit: function () { tone(900, 0.06, 'square', 0.07); noise(0.05, 0.08, 3000, 'highpass'); },
      stomp: function () { tone(260, 0.18, 'triangle', 0.22, 900); },
      defeat: function () { tone(660, 0.08, 'square', 0.08); tone(990, 0.12, 'square', 0.08, null, 0.08); },
      hurt: function () { tone(520, 0.32, 'sawtooth', 0.12, 170); },
      pickup: function () { notes([660, 880, 1320], 'triangle', 0.12, 0.06); },
      checkpoint: function () { notes([523, 784], 'triangle', 0.12, 0.1); },
      fire: function () { noise(0.4, 0.1, 900, 'lowpass'); },
      slam: function () { tone(110, 0.45, 'sine', 0.5, 38); noise(0.3, 0.25, 400, 'lowpass'); },
      scoop: function () { tone(760, 0.1, 'sine', 0.08, 420); },
      boss: function () { tone(110, 0.7, 'sawtooth', 0.09); tone(165, 0.7, 'sawtooth', 0.07); },
      clear: function () { notes([523, 659, 784, 1047], 'triangle', 0.14, 0.11); setTimeout(function () { voice('tatalala', 0.9); }, 450); },
      win: function () {
        notes([523, 659, 784, 1047, 784, 1047], 'triangle', 0.15, 0.12);
        setTimeout(function () { if (state === 'win' && !songStart('dudidamdam', 0.8)) voice('tatalala', 0.9); }, 900);
      },
      over: function () { notes([392, 330, 262, 196], 'triangle', 0.13, 0.18); },
      start: function () { if (!voice('tatalala', 0.9)) notes([523, 784], 'triangle', 0.12, 0.09); },
      pause: function () { tone(440, 0.08, 'sine', 0.08); }
    };
    function toggle() {
      muted = !muted; store('bubu-mute', muted);
      if (master) master.gain.value = muted ? 0 : 0.55;
      return muted;
    }
    return { init: init, play: function (k) { if (ac && !muted && play[k]) play[k](); }, toggle: toggle, muted: function () { return muted; }, songStop: songStop };
  })();
  window.addEventListener('keydown', Sfx.init);
  window.addEventListener('pointerdown', Sfx.init);

  /* ================= input ================= */
  var held = {}, pressed = {};
  var KEYS = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
    KeyJ: 'throw', KeyZ: 'throw', KeyK: 'kick', KeyX: 'kick',
    KeyP: 'pause', Escape: 'pause', Enter: 'start', KeyM: 'mute'
  };
  window.addEventListener('keydown', function (e) {
    var a = KEYS[e.code];
    if (!a) return;
    e.preventDefault();
    if (!held[a]) pressed[a] = true;
    held[a] = true;
  });
  window.addEventListener('keyup', function (e) {
    var a = KEYS[e.code];
    if (a) { held[a] = false; e.preventDefault(); }
  });
  window.addEventListener('blur', function () { held = {}; });
  function press(a) { if (!held[a]) pressed[a] = true; held[a] = true; }
  function release(a) { held[a] = false; }
  function took(a) { var p = pressed[a]; pressed[a] = false; return p; }

  // Touch: action buttons
  document.querySelectorAll('[data-act]').forEach(function (b) {
    var a = b.getAttribute('data-act');
    b.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); b.setPointerCapture(e.pointerId); Sfx.init(); press(a); b.classList.add('on'); });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) {
      b.addEventListener(ev, function () { release(a); b.classList.remove('on'); });
    });
  });
  canvas.addEventListener('pointerdown', function () {
    if (state === 'title' || state === 'over' || state === 'win' || state === 'clear') pressed.start = true;
  });

  // Touch: floating analog stick (bottom-left) + tap anywhere else to jump
  var stickAxis = 0;
  (function () {
    var layer = document.getElementById('touch-layer'), stick = document.getElementById('stick'), knob = document.getElementById('stick-knob');
    if (!layer || !stick) return;
    var sid = null, ox = 0, oy = 0, jumpers = {}, nJump = 0;
    function radius() { return stick.offsetWidth / 2 || 62; }
    function inStickZone(x, y) {
      var w = innerWidth, h = innerHeight;
      if (x > w * 0.42) return false;
      if (h > w) { var r = canvas.getBoundingClientRect(); return y > r.bottom + 4; } // upright: area under the game
      return y > h * 0.3;                                                              // sideways: lower-left of screen
    }
    function setKnob(dx, dy) {
      var R = radius(), d = Math.hypot(dx, dy);
      if (d > R) { // the base follows the thumb when it drags past the edge
        var k = (d - R) / d; ox += dx * k; oy += dy * k; dx -= dx * k; dy -= dy * k;
        stick.style.left = ox + 'px'; stick.style.top = oy + 'px';
      }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      var n = dx / R, a = Math.abs(n), DEAD = 0.18, FULL = 0.85;  // analog: small push = slow walk
      stickAxis = a < DEAD ? 0 : Math.sign(n) * Math.min(1, (a - DEAD) / (FULL - DEAD));
    }
    function endStick() {
      sid = null; stickAxis = 0; stick.classList.remove('on');
      stick.style.left = stick.style.top = ''; knob.style.transform = '';
    }
    layer.addEventListener('pointerdown', function (e) {
      e.preventDefault(); Sfx.init();
      if (state !== 'play' || paused) { if (!paused) pressed.start = true; return; }
      layer.setPointerCapture(e.pointerId);
      if (sid === null && inStickZone(e.clientX, e.clientY)) {
        sid = e.pointerId; ox = e.clientX; oy = e.clientY;
        stick.style.left = ox + 'px'; stick.style.top = oy + 'px'; stick.classList.add('on'); setKnob(0, 0);
      } else if (!jumpers[e.pointerId]) {
        jumpers[e.pointerId] = 1; nJump++; press('jump');
      }
    });
    layer.addEventListener('pointermove', function (e) { if (e.pointerId === sid) setKnob(e.clientX - ox, e.clientY - oy); });
    function up(e) {
      if (e.pointerId === sid) endStick();
      if (jumpers[e.pointerId]) { delete jumpers[e.pointerId]; if (--nJump <= 0) { nJump = 0; release('jump'); } }
    }
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) { layer.addEventListener(ev, up); });
    window.addEventListener('blur', function () { endStick(); jumpers = {}; nJump = 0; release('jump'); });
  })();

  var TOUCH = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  var toastEl = document.getElementById('toast');
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toast.t); toast.t = setTimeout(function () { toastEl.classList.remove('show'); }, 1200);
  }
  var muteBtn = document.getElementById('btn-sound');
  function updateMuteButton() { if (muteBtn) { muteBtn.textContent = Sfx.muted() ? '\ud83d\udd07' : '\ud83d\udd0a'; muteBtn.setAttribute('aria-label', Sfx.muted() ? 'Turn sound on' : 'Turn sound off'); } }
  if (muteBtn) {
    updateMuteButton();
    muteBtn.addEventListener('click', function () { Sfx.init(); Sfx.toggle(); updateMuteButton(); muteBtn.blur(); });
  }
  var fullBtn = document.getElementById('btn-full');
  var root = document.documentElement;
  function realFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function syncFull() {
    var on = realFull() || root.classList.contains('is-max');
    root.classList.toggle('is-full', on);
    if (fullBtn) {
      fullBtn.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
      fullBtn.querySelector('.ico').textContent = on ? '✕' : '⛶';
      fullBtn.querySelector('.lbl').textContent = on ? 'Exit' : 'Full screen';
    }
  }
  function toggleFull() {
    if (realFull()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    if (root.classList.contains('is-max')) { root.classList.remove('is-max'); syncFull(); return; }
    var req = root.requestFullscreen || root.webkitRequestFullscreen;
    var maximise = function () { root.classList.add('is-max'); syncFull(); window.scrollTo(0, 1); };
    if (!req) return maximise(); // e.g. iPhone Safari: fill the browser window instead
    Promise.resolve(req.call(root)).then(function () {
      if (TOUCH && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {});
    }).catch(maximise);
  }
  document.addEventListener('fullscreenchange', syncFull);
  document.addEventListener('webkitfullscreenchange', syncFull);
  if (fullBtn) fullBtn.addEventListener('click', function () { fullBtn.blur(); toggleFull(); });
  window.addEventListener('keydown', function (e) { if (e.code === 'KeyF' && !e.repeat) toggleFull(); });

  /* ================= helpers ================= */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function rand(a, b) { return a + Math.random() * (b - a); }

  function drawSprite(name, frame, cx, bottom, face, alpha, scale) {
    var s = SPR[name], im = IMG[name];
    if (!s || !im || !im.complete || !im.naturalWidth) return;
    scale = scale || 1;
    var n = s.n, fi = ((frame % n) + n) % n;
    var sw = im.naturalWidth / n, sh = im.naturalHeight;
    var w = s.w * scale, h = s.h * scale;
    ctx.save();
    if (alpha != null) ctx.globalAlpha = alpha;
    ctx.translate(Math.round(cx), Math.round(bottom));
    if (face < 0) ctx.scale(-1, 1);
    ctx.drawImage(im, fi * sw, 0, sw, sh, -w * s.ax, -h, w, h);
    ctx.restore();
  }
  function frameAt(name, t, loop) {
    var s = SPR[name], f = Math.floor(t * 1000 / s.ms);
    return loop === false ? Math.min(f, s.n - 1) : f;
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function text(s, x, y, size, color, align, weight, stroke) {
    ctx.font = (weight || 700) + ' ' + size + 'px Inter, system-ui, sans-serif';
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    if (stroke) { ctx.lineWidth = 4; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
    ctx.fillStyle = color; ctx.fillText(s, x, y);
  }
  function heart(x, y, s, fill) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(0, 4);
    ctx.bezierCurveTo(-8, -2, -6, -9, 0, -5);
    ctx.bezierCurveTo(6, -9, 8, -2, 0, 4);
    ctx.fillStyle = fill; ctx.fill();
    ctx.lineWidth = 1.4; ctx.strokeStyle = OUTLINE; ctx.stroke();
    ctx.restore();
  }

  /* ================= level ================= */
  var L, grid, cols, worldW, tilesCanvas, ents, level = 0;
  var player, enemies, boss, shots, foes, fx, pickups, signs, checkpoint, goal, arena, arenaOn;
  var camX = 0, shake = 0, score = 0, kills = 0, levelTime = 0, runTime = 0;
  var state = 'loading', stateT = 0, paused = false;

  function solidAt(px, py) {
    var c = Math.floor(px / T), r = Math.floor(py / T);
    if (c < 0 || c >= cols) return 1;
    if (r < 0 || r >= 12) return 0;
    return grid[r * cols + c];
  }

  function loadLevel(i, keepHp) {
    level = i; L = LEVELS[i];
    var m = L.map; cols = m[0].length; worldW = cols * T;
    grid = new Uint8Array(cols * 12);
    enemies = []; shots = []; foes = []; fx = []; pickups = []; signs = [];
    boss = null; goal = null; arenaOn = false;
    arena = L.arena ? { l: L.arena[0] * T, r: L.arena[1] * T } : null;
    var start = { x: 60, y: 9 * T };
    for (var r = 0; r < 12; r++) {
      for (var c = 0; c < cols; c++) {
        var ch = m[r][c], x = c * T, foot = (r + 1) * T;
        if (ch === '#') grid[r * cols + c] = 1;
        else if (ch === '=') grid[r * cols + c] = 2;
        else if (ch === 'P') start = { x: x + 3, y: foot };
        else if (ch === 'D' || ch === 'F') enemies.push(makeDudu(x, foot, ch === 'F' && L.fire));
        else if (ch === 'H') pickups.push({ x: x + 5, y: foot - 22, w: 20, h: 20, t: rand(0, 6) });
        else if (ch === 'C') checkpoint = { x: x, y: foot, hit: false, start: false };
        else if (ch === 'G') goal = { x: x, y: foot - 60, w: 30, h: 60 };
        else if (ch === 'B') boss = makeBoss(x, foot);
        else if (HINTS[ch]) signs.push({ x: x, y: foot, lines: HINTS[ch] });
      }
    }
    // checkpoint object for respawning
    if (L.arena) arenaPlatforms();
    checkpoint = checkpoint ? { x: checkpoint.x, y: checkpoint.y, active: false } : null;
    var hp = keepHp && player ? player.hp : MAX_HP;
    player = makePlayer(start.x, start.y, hp);
    player.spawn = { x: start.x, y: start.y };
    camX = clamp(player.x - VW * 0.35, 0, worldW - VW);
    levelTime = 0;
    buildTiles();
  }

  /* Boss arena: a fresh random set of one-way platforms every attempt.
     Low ones (2 tiles up) are reachable from the ground; high ones (4 tiles up)
     sit just above the boss's head, so you can drop onto him. */
  function arenaPlatforms() {
    var a = L.arena[0] + 2, b = L.arena[1] - 2, zones = 3, zw = Math.floor((b - a) / zones);
    var highZones = [0, 1, 2].sort(function () { return Math.random() - 0.5; }).slice(0, 2);
    for (var z = 0; z < zones; z++) {
      var lowX = a + z * zw + Math.floor(rand(0, zw - 3));
      for (var i = 0; i < 3; i++) grid[8 * cols + lowX + i] = 2;
      if (highZones.indexOf(z) >= 0) {
        var hx = clamp(lowX + (Math.random() < 0.5 ? -2 : 2), a, b - 3);
        for (var j = 0; j < 3; j++) grid[6 * cols + hx + j] = 2;
      }
    }
  }

  function makePlayer(x, foot, hp) {
    return {
      x: x, y: foot - 46, w: 24, h: 46, vx: 0, vy: 0, face: 1, ground: false,
      hp: hp, inv: 0, hurtT: 0, kickT: 0, kickCd: 0, kickId: 0, throwT: 0, throwCd: 0,
      coyote: 0, buffer: 0, animT: 0, dead: false
    };
  }
  function makeDudu(x, foot, fire) {
    return {
      x: x, y: foot - 44, w: 30, h: 44, vx: 0, dir: -1, speed: rand(38, 52), hp: 4, max: 4,
      fire: fire, fireCd: rand(1.5, 3), fireT: 0, flash: 0, hitBy: -1, animT: rand(0, 1), vy: 0, ground: false
    };
  }
  function makeBoss(x, foot) {
    return {
      x: x - 30, y: foot - 116, w: 84, h: 116, vx: 0, vy: 0, face: -1, hp: 26, max: 26,
      state: 'sleep', t: 0, step: 0, flash: 0, inv: 0, hitBy: -1, ground: true, animT: 0, dead: false
    };
  }

  /* Pre-render the tiles of a level once */
  function buildTiles() {
    var th = THEMES[L.theme];
    tilesCanvas = document.createElement('canvas');
    tilesCanvas.width = worldW * RES; tilesCanvas.height = VH * RES;
    var g = tilesCanvas.getContext('2d');
    g.setTransform(RES, 0, 0, RES, 0, 0);
    function at(c, r) { return (c < 0 || c >= cols || r < 0 || r >= 12) ? (r >= 12 ? 1 : 0) : grid[r * cols + c]; }
    for (var r = 0; r < 12; r++) {
      for (var c = 0; c < cols; c++) {
        var t = grid[r * cols + c], x = c * T, y = r * T;
        if (t === 1) {
          g.fillStyle = th.dirt; g.fillRect(x, y, T, T);
          // speckles
          g.fillStyle = 'rgba(90,58,46,.12)';
          g.fillRect(x + ((c * 7 + r * 3) % 20) + 4, y + ((c * 5 + r * 11) % 18) + 6, 4, 3);
          g.strokeStyle = OUTLINE; g.lineWidth = 2;
          g.beginPath();
          if (at(c - 1, r) !== 1) { g.moveTo(x + 1, y); g.lineTo(x + 1, y + T); }
          if (at(c + 1, r) !== 1) { g.moveTo(x + T - 1, y); g.lineTo(x + T - 1, y + T); }
          g.stroke();
          if (at(c, r - 1) !== 1) { // grass top
            g.fillStyle = th.grass; g.fillRect(x, y, T, 9);
            g.beginPath();
            for (var k = 0; k <= T; k += 6) g.arc(x + k + 3, y + 9, 3, 0, Math.PI);
            g.fill();
            g.strokeStyle = OUTLINE; g.lineWidth = 2;
            g.beginPath(); g.moveTo(x, y + 1); g.lineTo(x + T, y + 1); g.stroke();
          }
        } else if (t === 2) {
          g.fillStyle = '#F6CF8E';
          g.fillRect(x, y + 2, T, 11);
          g.strokeStyle = OUTLINE; g.lineWidth = 2;
          g.strokeRect(x + 1, y + 2, T - 2, 11);
          g.fillStyle = 'rgba(90,58,46,.25)'; g.fillRect(x + 8, y + 6, 2, 4); g.fillRect(x + 20, y + 6, 2, 4);
        }
      }
    }
  }

  /* ================= physics ================= */
  function moveBody(b, dt, oneWay) {
    // horizontal
    b.x += b.vx * dt;
    var top = b.y + 2, bot = b.y + b.h - 2;
    if (b.vx > 0) {
      var rx = b.x + b.w;
      if (solidAt(rx, top) === 1 || solidAt(rx, bot) === 1 || solidAt(rx, b.y + b.h / 2) === 1) { b.x = Math.floor(rx / T) * T - b.w - 0.01; b.vx = 0; b.hitWall = 1; }
    } else if (b.vx < 0) {
      if (solidAt(b.x, top) === 1 || solidAt(b.x, bot) === 1 || solidAt(b.x, b.y + b.h / 2) === 1) { b.x = (Math.floor(b.x / T) + 1) * T + 0.01; b.vx = 0; b.hitWall = -1; }
    }
    // vertical
    var prevBottom = b.y + b.h;
    b.vy = Math.min(b.vy + GRAV * dt, MAX_FALL);
    b.y += b.vy * dt;
    b.ground = false;
    var l = b.x + 2, r = b.x + b.w - 2;
    if (b.vy > 0) {
      var by = b.y + b.h;
      var tl = solidAt(l, by), tr = solidAt(r, by);
      var rowTop = Math.floor(by / T) * T;
      var land = (tl === 1 || tr === 1) || (oneWay !== false && (tl === 2 || tr === 2) && prevBottom <= rowTop + 1);
      if (land) { b.y = rowTop - b.h; b.vy = 0; b.ground = true; }
    } else if (b.vy < 0) {
      if (solidAt(l, b.y) === 1 || solidAt(r, b.y) === 1) { b.y = (Math.floor(b.y / T) + 1) * T; b.vy = 0; }
    }
  }

  /* ================= player ================= */
  function hurtPlayer(dmg, fromX) {
    var p = player;
    if (p.inv > 0 || p.dead || p.safeT > 0) return;
    p.calm = 0; p.nextSing = 5;
    if (p.ride) { dismount('Dudu ran away!'); p.inv = 1.0; p.vy = -300; shake = 0.2; Sfx.play('hurt'); return; }
    p.hp -= dmg; p.inv = 1.3; p.hurtT = 0.45; Sfx.play('hurt');
    p.vx = (p.x + p.w / 2 < fromX ? -1 : 1) * 220; p.vy = -260;
    p.kickT = 0; p.throwT = 0;
    shake = 0.25;
    burst(p.x + p.w / 2, p.y + 20, '#ffffff', 8);
    if (p.hp <= 0) { p.hp = 0; p.dead = true; setState('over'); }
  }

  /* ---------- Riding Dudu ----------
     Jump, kick in the air, and land on a Dudu: Bubu rides him. Riding is faster,
     you can still throw stones, and the first monster you touch gets crashed. */
  var RIDE_W = 38, RIDE_H = 58, RIDE_TIME = 12;
  function mount(e) {
    var p = player, foot = p.y + p.h;
    e.dead = true; score += 50;
    p.ride = { t: 0 };
    p.kickT = 0; p.throwT = 0;
    p.x += (p.w - RIDE_W) / 2; p.w = RIDE_W; p.h = RIDE_H; p.y = foot - RIDE_H - 1;
    p.vy = -180; p.safeT = 0.3;
    Sfx.play('mount'); shake = 0.15;
    floatText(p.x + p.w / 2, p.y - 10, 'Riding Dudu! Crash into a monster', '#C37408');
    puff(p.x + p.w / 2, foot);
  }
  function dismount(msg) {
    var p = player, foot = p.y + p.h;
    if (!p.ride) return;
    p.ride = null;
    p.x += (p.w - 24) / 2; p.w = 24; p.h = 46; p.y = foot - 46;
    puff(p.x + p.w / 2, foot - 20);
    if (msg) floatText(p.x + p.w / 2, p.y - 10, msg, '#7A5444');
  }
  function crash(target) {
    var p = player;
    var dmg = target === boss ? 6 : 5;
    if (target === boss && (boss.inv > 0 || boss.state === 'sleep' || boss.state === 'intro')) dmg = 0;
    if (dmg) damage(target, dmg, 'crash', p.x + p.w / 2);
    Sfx.play('crash'); shake = 0.35;
    kills++; score += 100;
    burst(p.x + p.w / 2, p.y + p.h / 2, '#FFE08A', 16);
    dismount('CRASH!');
    p.vy = -420; p.vx = -p.face * 140; p.safeT = 0.45; p.inv = Math.max(p.inv, 0.45);
  }

  function respawn() {
    var p = player, at = checkpoint && checkpoint.active ? checkpoint : p.spawn;
    p.x = at.x + 3; p.y = at.y - p.h; p.vx = 0; p.vy = 0; p.inv = 1.2;
    camX = clamp(p.x - VW * 0.35, 0, worldW - VW);
  }

  function updatePlayer(dt) {
    var p = player;
    p.animT += dt;
    p.inv = Math.max(0, p.inv - dt);
    p.hurtT = Math.max(0, p.hurtT - dt);
    p.kickCd = Math.max(0, p.kickCd - dt);
    p.throwCd = Math.max(0, p.throwCd - dt);
    if (p.kickT > 0) p.kickT += dt;
    if (p.kickT > 0.46) p.kickT = 0;
    if (p.throwT > 0) p.throwT += dt;
    if (p.throwT > 0.36) p.throwT = 0;

    var dir = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    if (dir === 0 && stickAxis) dir = stickAxis; // analog stick: speed follows how far it is pushed
    if (p.hurtT > 0) dir = 0;
    p.safeT = Math.max(0, (p.safeT || 0) - dt);
    p.calm = (p.calm || 0) + dt; if (!p.nextSing) p.nextSing = 5;
    p.singT = Math.max(0, (p.singT || 0) - dt);
    if (p.calm >= p.nextSing) { Sfx.play('sing'); p.singT = 2.4; p.nextSing = p.calm + 15; }
    if (p.ride) { p.ride.t += dt; if (p.ride.t > RIDE_TIME) dismount('Dudu got tired'); }
    var target = dir * RUN * (p.ride ? 1.75 : (p.kickT > 0 ? 0.55 : 1));
    var acc = p.ground ? ACC : AIR_ACC;
    if (dir !== 0) {
      p.vx += clamp(target - p.vx, -acc * dt, acc * dt);
      if (p.kickT === 0 && p.throwT === 0) p.face = dir > 0 ? 1 : -1;
    } else if (p.ground && p.hurtT === 0) {
      p.vx -= clamp(p.vx, -FRICTION * dt, FRICTION * dt);
    }

    // jump (coyote time + buffer + variable height)
    p.coyote = p.ground ? COYOTE : Math.max(0, p.coyote - dt);
    if (took('jump')) p.buffer = JUMP_BUFFER; else p.buffer = Math.max(0, p.buffer - dt);
    if (p.buffer > 0 && p.coyote > 0 && p.hurtT === 0) {
      p.vy = -JUMP_V; p.coyote = 0; p.buffer = 0; p.ground = false; Sfx.play('jump');
      dust(p.x + p.w / 2, p.y + p.h);
    }
    if (!held.jump && p.vy < -220) p.vy = -220;

    // attacks
    if (took('throw') && p.throwCd === 0 && p.hurtT === 0) {
      p.throwT = 0.0001; p.throwCd = 0.38; Sfx.play('throw');
      shots.push({ kind: 'stone', x: p.x + p.w / 2 + p.face * 14, y: p.y + (p.ride ? 12 : 16), w: 9, h: 9, vx: p.face * 360 + p.vx * 0.3, vy: -170, life: 1.6, rot: 0 });
    }
    if (took('kick') && p.kickCd === 0 && p.hurtT === 0 && !p.ride) {
      p.kickT = 0.0001; p.kickCd = 0.55; p.kickId++; Sfx.play('kick');
      if (!p.ground && p.vy > 0) p.vy *= 0.4; // a little hang time for air kicks
    }

    p.prevBottom = p.y + p.h;
    var wasGround = p.ground;
    moveBody(p, dt);
    if (p.ground && Math.abs(p.vx) > 60 && p.kickT === 0 && p.hurtT === 0) {
      p.stepT = (p.stepT || 0) - dt;
      if (p.stepT <= 0) { Sfx.play('step'); p.stepT = 0.27; }
    } else p.stepT = 0.08; // first step comes quickly after you start moving
    if (!wasGround && p.ground) dust(p.x + p.w / 2, p.y + p.h);

    // arena walls
    if (arenaOn) p.x = clamp(p.x, arena.l + 2, arena.r - p.w - 2);
    p.x = clamp(p.x, 0, worldW - p.w);

    // fell into a pit
    if (p.y > VH + 60) {
      if (p.ride) dismount();
      p.calm = 0; p.nextSing = 5;
      p.hp -= 1; shake = 0.2; Sfx.play('hurt');
      if (p.hp <= 0) { p.hp = 0; p.dead = true; setState('over'); return; }
      respawn();
    }

    // pickups
    pickups.forEach(function (h) {
      if (!h.got && overlap(p, h)) {
        h.got = true;
        if (p.hp < MAX_HP) p.hp++; else score += 50;
        Sfx.play('pickup');
        floatText(h.x + 10, h.y, p.hp < MAX_HP ? '+50' : '♥', '#E8584A');
        burst(h.x + 10, h.y + 10, '#F6A5B5', 10);
      }
    });
    // checkpoint
    if (checkpoint && !checkpoint.active && p.x > checkpoint.x) {
      checkpoint.active = true; Sfx.play('checkpoint'); floatText(checkpoint.x + 10, checkpoint.y - 70, 'Checkpoint!', '#0857C3');
    }
    // goal
    if (goal && overlap(p, goal)) { score += 500 + Math.max(0, Math.round(120 - levelTime) * 5); setState('clear'); }
    // boss arena trigger
    if (arena && !arenaOn && p.x > arena.l + 40) {
      arenaOn = true;
      if (boss && boss.state === 'sleep') { boss.state = 'intro'; boss.t = 0; Sfx.play('boss'); }
    }
  }

  function kickBox() {
    var p = player;
    if (!(p.kickT > 0.05 && p.kickT < 0.4)) return null;
    return { x: p.face > 0 ? p.x + p.w - 6 : p.x - 34 + 6, y: p.y + 6, w: 34, h: 40 };
  }

  /* ================= enemies ================= */
  function damage(e, amount, kind, fromX) {
    if (e.dead) return;
    if (e === boss && (boss.inv > 0 || boss.state === 'intro' || boss.state === 'sleep')) return;
    e.hp -= amount; e.flash = 0.15;
    Sfx.play(kind === 'stomp' ? 'stomp' : 'hit');
    floatText(e.x + e.w / 2, e.y - 6, '-' + amount, kind === 'stomp' ? '#C37408' : '#0857C3');
    burst(e.x + e.w / 2, e.y + e.h / 2, '#FFE08A', 6 + amount * 2);
    if (e === boss) { boss.inv = 0.25; shake = Math.max(shake, 0.12); }
    else e.x += (e.x + e.w / 2 < fromX ? -1 : 1) * (kind === 'kick' ? 14 : 6);
    if (e.hp <= 0) {
      e.dead = true; kills++;
      if (e === boss) { score += 3000; boss.state = 'dying'; boss.t = 0; }
      else { score += 100; Sfx.play('defeat'); floatText(e.x + e.w / 2, e.y - 20, '+100', '#0857C3'); puff(e.x + e.w / 2, e.y + e.h / 2); }
    }
  }

  function updateEnemies(dt) {
    var p = player, kb = kickBox();
    enemies.forEach(function (e) {
      if (e.dead) return;
      e.animT += dt; e.flash = Math.max(0, e.flash - dt);
      var onScreen = e.x > camX - 60 && e.x < camX + VW + 60;
      if (!onScreen) return;
      // patrol; turn at walls and ledges
      e.vx = e.dir * e.speed;
      if (e.fireT > 0) e.vx = 0;
      var aheadX = e.dir > 0 ? e.x + e.w + 2 : e.x - 2;
      if (e.ground && solidAt(aheadX, e.y + e.h + 4) === 0) e.dir *= -1;
      e.hitWall = 0;
      moveBody(e, dt);
      if (e.hitWall) e.dir = -e.hitWall;
      if (e.y > VH + 60) { e.dead = true; return; }
      // fire breath when Bubu is in front and close
      if (e.fire) {
        e.fireCd -= dt;
        if (e.fireT > 0) {
          e.fireT -= dt;
        } else if (e.fireCd <= 0) {
          var dx = (p.x + p.w / 2) - (e.x + e.w / 2);
          if (Math.abs(dx) < 190 && Math.abs(p.y - e.y) < 40) {
            e.dir = dx > 0 ? 1 : -1;
            e.fireT = 0.55; e.fireCd = rand(2.2, 3.4); Sfx.play('fire');
            foes.push({ kind: 'flame', x: e.x + e.w / 2 + e.dir * 18, y: e.y + 16, w: 16, h: 12, vx: e.dir * 170, vy: 0, life: 1.0, t: 0 });
          } else e.fireCd = 0.4;
        }
      }
      // player interactions
      if (!p.dead && !e.dead && overlap(p, e)) {
        var fromAbove = p.vy >= 0 && (p.prevBottom <= e.y + 14 || (p.y + p.h) - e.y < 18);
        if (p.ride) { crash(e); }
        else if (fromAbove && p.kickT > 0 && !p.ground) { mount(e); }
        else if (fromAbove) {
          damage(e, DMG.stomp, 'stomp', p.x + p.w / 2);
          p.vy = -(held.jump ? STOMP_BOUNCE + 100 : STOMP_BOUNCE);
          p.y = e.y - p.h - 1; p.safeT = 0.15;
        } else if ((p.y + p.h) < e.y + e.h * 0.35) {
          p.y = e.y - p.h - 1; p.vy = Math.min(p.vy, -200); // on his head: no damage
        } else hurtPlayer(1, e.x + e.w / 2);
      }
      if (kb && e.hitBy !== p.kickId && overlap(kb, e)) { e.hitBy = p.kickId; damage(e, DMG.kick, 'kick', p.x + p.w / 2); }
    });
  }

  /* ================= boss ================= */
  function updateBoss(dt) {
    var b = boss, p = player;
    if (!b) return;
    b.animT += dt; b.t += dt;
    b.flash = Math.max(0, b.flash - dt);
    b.inv = Math.max(0, b.inv - dt);
    var rage = b.hp <= b.max / 2;
    var cx = b.x + b.w / 2, pcx = p.x + p.w / 2;
    if (b.state === 'sleep') return;
    if (b.state === 'dying') {
      b.vy = Math.min(b.vy + GRAV * 0.4 * dt, 300); b.y += b.vy * dt * 0.3;
      if (Math.random() < 0.4) burst(b.x + rand(0, b.w), b.y + rand(0, b.h), '#FFE08A', 3);
      if (b.t > 2.2) { boss = null; setState('win'); }
      return;
    }
    if (b.state !== 'jump') b.face = pcx < cx ? -1 : 1;

    if (b.state === 'intro') {
      if (b.t > 1.6) next('walk');
    } else if (b.state === 'walk') {
      b.vx = b.face * (rage ? 95 : 65);
      if (b.t > (rage ? 1.2 : 1.7)) next(b.step % 2 === 0 ? 'jump' : 'windup');
    } else if (b.state === 'jump') {
      if (!b.jumped) { b.jumped = true; b.vy = -600; b.vx = clamp((pcx - cx) * 1.1, -260, 260); b.ground = false; }
      if (b.ground && b.t > 0.2) {
        shake = 0.35; Sfx.play('slam');
        foes.push({ kind: 'wave', x: cx - 10, y: b.y + b.h - 18, w: 20, h: 18, vx: -230, vy: 0, life: 2.4, t: 0 });
        foes.push({ kind: 'wave', x: cx - 10, y: b.y + b.h - 18, w: 20, h: 18, vx: 230, vy: 0, life: 2.4, t: 0 });
        dust(cx - 30, b.y + b.h); dust(cx + 30, b.y + b.h);
        next(rage && b.step % 3 === 0 ? 'jump' : 'walk');
      }
    } else if (b.state === 'windup') {
      b.vx = 0;
      if (b.t > 0.6) {
        var n = rage ? 5 : 3;
        for (var i = 0; i < n; i++) {
          var flight = 0.9 + i * 0.12;
          var tx = pcx + (i - (n - 1) / 2) * 46;
          var sx = b.x + (b.face > 0 ? b.w - 10 : 10), sy = b.y + 8;
          var g = GRAV * 0.55, ty = p.y + 30;
          foes.push({ kind: 'scoop', x: sx, y: sy, w: 16, h: 16, vx: (tx - sx) / flight, vy: (ty - sy - 0.5 * g * flight * flight) / flight, grav: true, life: 3, t: 0, col: ['#FFF4E0', '#F8B7C8', '#C9E9F6'][i % 3] });
        }
        Sfx.play('scoop');
        next('rest');
      }
    } else if (b.state === 'rest') {
      b.vx *= 0.9;
      if (rage && b.t < 0.05 && !enemies.some(function (e) { return !e.dead && e.minion; })) {
        var side = pcx < (arena.l + arena.r) / 2 ? arena.r - 60 : arena.l + 30;
        var m = makeDudu(side, 10 * T, false); m.minion = true; m.dir = side > pcx ? -1 : 1; m.hp = 2; m.max = 2;
        enemies.push(m); puff(side + 15, 10 * T - 20);
        floatText(side + 15, 10 * T - 70, 'Ride him into the boss!', '#C37408');
      }
      if (b.t > (rage ? 0.5 : 0.9)) next('walk');
    }
    if (b.state !== 'jump' && b.state !== 'windup' && b.state !== 'intro') {
      // keep walking speed
    }
    b.hitWall = 0;
    if (b.state !== 'windup') {
      moveBody(b, dt, false);
    }
    if (arena) b.x = clamp(b.x, arena.l, arena.r - b.w);

    // player interactions
    if (!p.dead && b.state !== 'intro' && b.state !== 'dying' && overlap(p, b)) {
      var fromAbove = p.vy >= 0 && p.prevBottom <= b.y + 18;
      if (p.ride) { crash(b); }
      else if (fromAbove) {
        damage(b, DMG.stomp, 'stomp', pcx);
        p.vy = -(STOMP_BOUNCE + 140); p.y = b.y - p.h - 1;
        p.vx = (pcx < cx ? -1 : 1) * 160; p.safeT = 0.3;
      } else if ((p.y + p.h) < b.y + b.h * 0.35) {
        // Bubu is on top of his head (e.g. the boss jumped up into him): bounce, no damage
        p.y = b.y - p.h - 1; p.vy = Math.min(p.vy, -320); p.vx = (pcx < cx ? -1 : 1) * 140; p.safeT = 0.3;
      } else hurtPlayer(1, cx);
    }
    var kb = kickBox();
    if (kb && b.hitBy !== p.kickId && overlap(kb, b)) { b.hitBy = p.kickId; damage(b, DMG.kick, 'kick', pcx); }

    function next(s) { b.state = s; b.t = 0; b.step++; b.jumped = false; }
  }

  /* ================= projectiles & effects ================= */
  function updateShots(dt) {
    shots.forEach(function (s) {
      s.life -= dt; s.vy += 900 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += dt * 14;
      if (solidAt(s.x + s.w / 2, s.y + s.h / 2) === 1 || s.y > VH + 20) { s.life = 0; burst(s.x, s.y, '#B9B4AE', 4); }
      enemies.forEach(function (e) { if (s.life > 0 && !e.dead && overlap(s, e)) { s.life = 0; damage(e, DMG.stone, 'stone', s.x); } });
      if (boss && s.life > 0 && !boss.dead && boss.state !== 'sleep' && overlap(s, boss)) { s.life = 0; damage(boss, DMG.stone, 'stone', s.x); }
    });
    shots = shots.filter(function (s) { return s.life > 0; });

    var p = player;
    foes.forEach(function (f) {
      f.life -= dt; f.t += dt;
      if (f.grav) f.vy += GRAV * 0.55 * dt;
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.kind === 'scoop' && (solidAt(f.x + 8, f.y + 14) === 1 || f.y > VH)) { f.life = 0; burst(f.x + 8, f.y + 12, f.col, 8); }
      if (f.kind === 'wave' && (f.x < (arena ? arena.l : 0) || f.x > (arena ? arena.r : worldW))) f.life = 0;
      if (f.kind === 'flame' && solidAt(f.x + 8, f.y + 6) === 1) f.life = 0;
      if (f.life > 0 && !p.dead && overlap(p, f)) {
        if (f.kind !== 'wave' || p.ground) { hurtPlayer(1, f.x); if (f.kind !== 'wave') f.life = 0; }
      }
    });
    foes = foes.filter(function (f) { return f.life > 0; });

    fx.forEach(function (f) {
      f.life -= dt; f.x += (f.vx || 0) * dt; f.y += (f.vy || 0) * dt;
      if (f.g) f.vy += f.g * dt;
    });
    fx = fx.filter(function (f) { return f.life > 0; });
  }
  function burst(x, y, col, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = rand(60, 180);
      fx.push({ kind: 'dot', x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, g: 500, life: rand(0.3, 0.6), max: 0.6, r: rand(2, 4), col: col });
    }
  }
  function puff(x, y) {
    for (var i = 0; i < 10; i++) {
      var a = Math.random() * Math.PI * 2, s = rand(20, 70);
      fx.push({ kind: 'puff', x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: rand(0.4, 0.7), max: 0.7, r: rand(6, 11) });
    }
  }
  function dust(x, y) {
    for (var i = 0; i < 4; i++) fx.push({ kind: 'puff', x: x + rand(-10, 10), y: y - 3, vx: rand(-40, 40), vy: rand(-30, -5), life: 0.35, max: 0.35, r: rand(3, 5) });
  }
  function floatText(x, y, s, col) { fx.push({ kind: 'text', x: x, y: y, vy: -40, life: 0.9, max: 0.9, s: s, col: col }); }

  /* ================= game states ================= */
  function setState(s) {
    if (state === 'win' && s !== 'win') Sfx.songStop();
    state = s; stateT = 0;
    if (s === 'clear') Sfx.play('clear');
    if (s === 'win') Sfx.play('win');
    if (s === 'over') Sfx.play('over');
    if (s === 'over') {
      var best = store('bubu-best') || {};
      if (score > (best.score || 0)) store('bubu-best', { score: score });
    }
    if (s === 'win') {
      var b2 = store('bubu-best') || {};
      var rec = { score: Math.max(score, b2.score || 0), time: b2.time && b2.time < runTime ? b2.time : runTime };
      store('bubu-best', rec);
    }
  }
  function startGame() {
    score = 0; kills = 0; runTime = 0; Sfx.play('start');
    var m = location.hash.match(/level=(\d)/); // testing shortcut: /bubu/#level=3
    loadLevel(m ? clamp(+m[1] - 1, 0, LEVELS.length - 1) : 0);
    setState('intro');
  }

  function update(dt) {
    stateT += dt;
    if (took('mute')) { Sfx.init(); toast(Sfx.toggle() ? 'Sound off' : 'Sound on'); updateMuteButton(); }
    if (state === 'loading') { if (loaded >= total) setState('title'); return; }
    if (state === 'title') { if (took('start') || took('jump')) startGame(); return; }
    if (state === 'intro') { if (stateT > 1.6 || took('start')) setState('play'); updateCamera(dt); return; }
    if (state === 'clear') {
      if (stateT > 1.2 && (took('start') || stateT > 3)) { loadLevel(level + 1, true); setState('intro'); }
      return;
    }
    if (state === 'over') {
      if (stateT > 1 && took('start')) { loadLevel(level); score = Math.max(0, score - 300); setState('intro'); }
      return;
    }
    if (state === 'win') {
      if (took('start') && stateT > 2) { if (stateT < CREDITS_END) stateT = CREDITS_END; else setState('title'); }
      return;
    }

    // play
    if (took('pause')) { paused = !paused; Sfx.play('pause'); }
    if (paused) return;
    levelTime += dt; runTime += dt;
    updatePlayer(dt);
    if (state !== 'play') return;
    updateEnemies(dt);
    updateBoss(dt);
    updateShots(dt);
    updateCamera(dt);
    shake = Math.max(0, shake - dt);
  }

  function updateCamera(dt) {
    var target = player.x + player.w / 2 - VW * 0.4;
    if (arenaOn) target = clamp(target, arena.l - 10, arena.r - VW + 10);
    camX += (target - camX) * Math.min(1, dt * 6);
    camX = clamp(camX, 0, worldW - VW);
  }

  /* ================= drawing ================= */
  function drawBackground() {
    var th = THEMES[L ? L.theme : 0];
    var g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    // sun
    ctx.fillStyle = 'rgba(255,236,170,.9)'; ctx.beginPath(); ctx.arc(540 - camX * 0.02, 64, 26, 0, Math.PI * 2); ctx.fill();
    // clouds (parallax)
    for (var i = 0; i < 8; i++) {
      var cx = ((i * 260 + 80) - camX * 0.15) % (VW + 300); if (cx < -150) cx += VW + 300;
      var cy = 40 + (i * 37) % 90;
      cloud(cx - 100, cy, 0.8 + (i % 3) * 0.25);
    }
    // hills (two layers)
    hills(th.hill1, 0.25, 250, 40, 0.012);
    hills(th.hill2, 0.45, 280, 32, 0.018);
  }
  function cloud(x, y, s) {
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.beginPath();
    ctx.arc(x, y, 16 * s, 0, Math.PI * 2); ctx.arc(x + 18 * s, y - 8 * s, 20 * s, 0, Math.PI * 2);
    ctx.arc(x + 40 * s, y, 16 * s, 0, Math.PI * 2); ctx.rect(x, y, 40 * s, 16 * s);
    ctx.fill();
  }
  function hills(col, par, base, amp, freq) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, VH);
    for (var x = 0; x <= VW; x += 10) {
      var wx = x + camX * par;
      ctx.lineTo(x, base - Math.abs(Math.sin(wx * freq)) * amp - Math.sin(wx * freq * 0.37) * amp * 0.4);
    }
    ctx.lineTo(VW, VH); ctx.closePath(); ctx.fill();
  }

  function drawWorld() {
    var sx = shake > 0 ? rand(-3, 3) : 0, sy = shake > 0 ? rand(-2, 2) : 0;
    ctx.save();
    ctx.translate(-Math.round(camX) + sx, sy);
    // tiles
    ctx.drawImage(tilesCanvas, Math.round(camX) * RES, 0, VW * RES, VH * RES, Math.round(camX), 0, VW, VH);

    // signs
    signs.forEach(function (s) {
      if (s.x < camX - 120 || s.x > camX + VW + 40) return;
      ctx.fillStyle = '#C98F5B'; ctx.fillRect(s.x + 13, s.y - 40, 5, 40);
      rr(s.x - 36, s.y - 66, 102, 34, 6); ctx.fillStyle = '#F6CF8E'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUTLINE; ctx.stroke();
      text(s.lines[0], s.x + 15, s.y - 56, 10, OUTLINE);
      text(s.lines[1], s.x + 15, s.y - 42, 9, '#7A5444', 'center', 600);
    });
    // checkpoint
    if (checkpoint) {
      var c = checkpoint;
      ctx.fillStyle = OUTLINE; ctx.fillRect(c.x + 12, c.y - 64, 3, 64);
      ctx.fillStyle = c.active ? '#71C5E8' : '#D6D6D6';
      ctx.beginPath(); ctx.moveTo(c.x + 15, c.y - 64); ctx.lineTo(c.x + 40, c.y - 56); ctx.lineTo(c.x + 15, c.y - 48); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
    }
    // goal: a little house with a heart
    if (goal) {
      var gx = goal.x - 20, gy = goal.y + goal.h;
      rr(gx, gy - 46, 70, 46, 4); ctx.fillStyle = '#FFF4E0'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUTLINE; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(gx - 8, gy - 44); ctx.lineTo(gx + 35, gy - 78); ctx.lineTo(gx + 78, gy - 44); ctx.closePath();
      ctx.fillStyle = '#F39BB0'; ctx.fill(); ctx.stroke();
      rr(gx + 25, gy - 28, 20, 28, 3); ctx.fillStyle = '#C98F5B'; ctx.fill(); ctx.stroke();
      heart(gx + 35, gy - 54, 1.3 + Math.sin(stateT * 4) * 0.1, '#E8584A');
    }
    // pickups
    pickups.forEach(function (h) {
      if (h.got) return;
      h.t += 0.016;
      heart(h.x + 10, h.y + 10 + Math.sin(h.t * 3) * 3, 1.5, '#F07F92');
    });
    // enemies
    enemies.forEach(function (e) {
      if (e.dead || e.x < camX - 80 || e.x > camX + VW + 80) return;
      var name = e.fireT > 0 ? 'duduFire' : 'dudu';
      var a = e.flash > 0 ? 0.55 : 1;
      drawSprite(name, frameAt(name, e.animT), e.x + e.w / 2, e.y + e.h + 4, e.dir, a);
      if (e.hp < e.max) {
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(e.x, e.y - 14, e.w, 4);
        ctx.fillStyle = '#E8584A'; ctx.fillRect(e.x, e.y - 14, e.w * e.hp / e.max, 4);
      }
    });
    // boss
    if (boss) {
      var b = boss;
      var ba = b.flash > 0 ? 0.5 : (b.state === 'dying' ? Math.max(0, 1 - b.t / 2.2) : 1);
      var squash = b.state === 'windup' ? 1 + Math.sin(b.t * 30) * 0.03 : 1;
      drawSprite('boss', frameAt('boss', b.animT), b.x + b.w / 2, b.y + b.h + 4, b.face, ba, squash);
      if (b.state === 'sleep') text('Zz', b.x + b.w - 6, b.y - 8 + Math.sin(stateT * 3) * 3, 14, '#7A5444');
    }
    // player
    var p = player;
    if (!(p.inv > 0 && Math.floor(p.inv * 14) % 2 === 0 && p.hurtT === 0)) {
      var nm, fr;
      if (p.hurtT > 0 || p.dead) { nm = 'hurt'; fr = frameAt('hurt', p.animT); }
      else if (p.kickT > 0) { nm = 'kick'; fr = frameAt('kick', p.kickT, false); }
      else if (p.throwT > 0) { nm = 'throw'; fr = frameAt('throw', p.throwT, false); }
      else if (!p.ground) { nm = 'jump'; fr = 0; }
      else if (Math.abs(p.vx) > 20) { nm = 'walk'; fr = frameAt('walk', p.animT); }
      else { nm = 'idle'; fr = frameAt('idle', p.animT); }
      // the riding sprite faces left in the source GIF, so flip it: Dudu's head leads
      if (p.ride) drawSprite('ride', frameAt('ride', p.animT * 1.6), p.x + p.w / 2, p.y + p.h + 3, -p.face, null, 0.56);
      else drawSprite(nm, fr, p.x + p.w / 2, p.y + p.h + (nm === 'kick' ? 6 : 3), p.face);
    }
    if (p.singT > 0) {
      for (var n = 0; n < 3; n++) {
        var k = (2.4 - p.singT) * 1.2 + n * 0.45; if (k < 0 || k > 1.6) continue;
        ctx.globalAlpha = Math.max(0, 1 - k / 1.6);
        text(n % 2 ? '\u266b' : '\u266a', p.x + p.w / 2 + Math.sin(k * 5 + n) * 10 + (n - 1) * 10, p.y - 8 - k * 26, 15, ['#F07F92', '#307FE2', '#E8A271'][n], 'center', 900, '#ffffff');
        ctx.globalAlpha = 1;
      }
    }
    // stones
    shots.forEach(function (s) {
      ctx.save(); ctx.translate(s.x + 4, s.y + 4); ctx.rotate(s.rot);
      ctx.fillStyle = '#B9B4AE'; ctx.beginPath(); ctx.ellipse(0, 0, 5.5, 4.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = OUTLINE; ctx.stroke();
      ctx.restore();
    });
    // enemy projectiles
    foes.forEach(function (f) {
      if (f.kind === 'flame') {
        var fl = Math.sin(f.t * 30) * 2;
        ctx.fillStyle = '#FFB347'; ctx.beginPath(); ctx.ellipse(f.x + 8, f.y + 6, 9 + fl, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#FFE08A'; ctx.beginPath(); ctx.ellipse(f.x + 8, f.y + 6, 5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      } else if (f.kind === 'scoop') {
        ctx.fillStyle = f.col; ctx.beginPath(); ctx.arc(f.x + 8, f.y + 8, 8, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 1.8; ctx.strokeStyle = OUTLINE; ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(f.x + 5, f.y + 5, 2.2, 0, Math.PI * 2); ctx.fill();
      } else if (f.kind === 'wave') {
        ctx.fillStyle = 'rgba(113,197,232,.85)';
        ctx.beginPath(); ctx.moveTo(f.x - 6, f.y + 18);
        ctx.quadraticCurveTo(f.x + 10, f.y - 6 - Math.sin(f.t * 20) * 3, f.x + 26, f.y + 18); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#307FE2'; ctx.lineWidth = 1.5; ctx.stroke();
      }
    });
    // effects
    fx.forEach(function (f) {
      var a = Math.max(0, f.life / f.max);
      ctx.globalAlpha = a;
      if (f.kind === 'dot') { ctx.fillStyle = f.col; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill(); }
      else if (f.kind === 'puff') { ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1.4 - a * 0.4), 0, Math.PI * 2); ctx.fill(); }
      else if (f.kind === 'text') text(f.s, f.x, f.y, 13, f.col, 'center', 800, '#ffffff');
      ctx.globalAlpha = 1;
    });
    ctx.restore();
  }

  function drawHud() {
    for (var i = 0; i < MAX_HP; i++) heart(22 + i * 22, 22, 1.6, i < player.hp ? '#F07F92' : 'rgba(255,255,255,.7)');
    text('Level ' + (level + 1) + ' · ' + L.name, VW / 2, 20, 13, OUTLINE, 'center', 800, 'rgba(255,255,255,.85)');
    text('Score ' + score, VW - 16, 20, 13, OUTLINE, 'right', 800, 'rgba(255,255,255,.85)');
    if (boss && boss.state !== 'sleep' && boss.state !== 'dying') {
      rr(VW / 2 - 140, 38, 280, 12, 6); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fill(); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.5; ctx.stroke();
      rr(VW / 2 - 138, 40, 276 * Math.max(0, boss.hp) / boss.max, 8, 4); ctx.fillStyle = '#C37408'; ctx.fill();
      text('Ice-cream Dudu', VW / 2, 60, 10, OUTLINE, 'center', 800, 'rgba(255,255,255,.85)');
    }
    if (player.ride) {
      var left = 1 - player.ride.t / RIDE_TIME;
      text('Riding Dudu', 22, 46, 11, '#C37408', 'left', 800, 'rgba(255,255,255,.85)');
      rr(90, 41, 80, 9, 4); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fill();
      rr(91, 42, 78 * left, 7, 3); ctx.fillStyle = '#C37408'; ctx.fill();
    }
    if (paused) panel('Paused', TOUCH ? 'Tap \u275a\u275a to continue' : 'Press P or Esc to continue');
  }

  function panel(a, b, y) {
    y = y || VH / 2;
    rr(VW / 2 - 170, y - 38, 340, 76, 14); ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = OUTLINE; ctx.stroke();
    text(a, VW / 2, y - 12, 22, OUTLINE, 'center', 800);
    text(b, VW / 2, y + 16, 12, '#7A5444', 'center', 600);
  }

  function drawTitle() {
    drawBackground();
    ctx.fillStyle = THEMES[0].grass; ctx.fillRect(0, VH - 60, VW, 60);
    ctx.fillStyle = THEMES[0].dirt; ctx.fillRect(0, VH - 48, VW, 48);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, VH - 60); ctx.lineTo(VW, VH - 60); ctx.stroke();
    drawSprite('title', frameAt('title', stateT), 170, VH - 56, 1);
    drawSprite('dudu', frameAt('dudu', stateT), 470, VH - 56, -1, 1, 1.4);
    text('Bubu Adventure', VW / 2, 70, 38, '#ffffff', 'center', 900, OUTLINE);
    text('Throw stones, kick, and jump on the Dudu monsters!', VW / 2, 108, 13, OUTLINE, 'center', 700, 'rgba(255,255,255,.9)');
    var blink = Math.floor(stateT * 2) % 2 === 0;
    if (blink) text(TOUCH ? 'Tap to start' : 'Press Enter or tap to start', VW / 2, 150, 16, '#0857C3', 'center', 800, '#ffffff');
    var lines = TOUCH ? ['Left thumb: drag to move (push further = faster)', 'Tap anywhere to jump \u00b7 Throw \u00b7 Kick'] : ['\u2190 \u2192 / A D  move', 'Space / \u2191  jump', 'J / Z  throw  \u00b7  K / X  kick', 'P  pause  \u00b7  M  sound  \u00b7  F  full screen'];
    lines.forEach(function (l, i) { text(l, VW / 2, 190 + i * 17, 11, OUTLINE, 'center', 600, 'rgba(255,255,255,.85)'); });
    var best = store('bubu-best');
    if (best && best.score) text('Best score ' + best.score + (best.time ? ' · best clear ' + fmtTime(best.time) : ''), VW / 2, 268, 11, '#7A5444', 'center', 700, 'rgba(255,255,255,.85)');
  }

  function fmtTime(t) { var m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + (s < 10 ? '0' : '') + s; }

  function drawOver() {
    ctx.fillStyle = 'rgba(4,42,97,.55)'; ctx.fillRect(0, 0, VW, VH);
    rr(VW / 2 - 190, 30, 380, 300, 18); ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OUTLINE; ctx.stroke();
    drawSprite('sad', frameAt('sad', stateT), VW / 2, 216, 1);
    text('Bubu needs a hug…', VW / 2, 244, 22, OUTLINE, 'center', 800);
    text('Score ' + score, VW / 2, 270, 13, '#7A5444', 'center', 700);
    if (stateT > 1) text(TOUCH ? 'Tap to try this level again' : 'Press Enter or tap to try this level again', VW / 2, 300, 12, '#0857C3', 'center', 800);
  }
  var CREDITS_END = 26;
  var CREDITS = [
    ['Bubu Adventure', 26],
    ['', 10],
    ['Game, code & levels', 12], ['Saltfarmer (Gama Candra)', 16],
    ['', 8],
    ['Starring', 12], ['Bubu & Dudu (Yier & Bubu)', 16],
    ['Characters and animations by their original creator', 11],
    ['', 8],
    ['Voices', 12], ['"atata" and "tata lala"', 16],
    ['', 8],
    ['Ending song', 12], ['"dudidamdam"', 16],
    ['', 8],
    ['Made with', 12], ['HTML canvas, Web Audio and a lot of ice cream', 14],
    ['', 8],
    ['Played by', 12], ['You ♥', 18],
    ['', 14],
    ['Thanks for playing!', 24]
  ];
  var winHearts = [];
  function drawWin() {
    drawBackground();
    ctx.fillStyle = THEMES[2].grass; ctx.fillRect(0, VH - 60, VW, 60);
    ctx.fillStyle = THEMES[2].dirt; ctx.fillRect(0, VH - 48, VW, 48);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, VH - 60); ctx.lineTo(VW, VH - 60); ctx.stroke();

    // Ending: Bubu slaps Dudu's bottom in a rhythm (three slaps, a short pause)
    var SX = VW - 150, SB = VH - 50, cycle = 2.2, beats = [0, 0.32, 0.64];
    var ct = stateT % cycle, down = false;
    beats.forEach(function (b) { if (ct >= b && ct < b + 0.14) down = true; });
    var slapCount = Math.floor(stateT / cycle) * beats.length + beats.filter(function (b) { return ct >= b; }).length;
    if (slapCount !== drawWin.lastSlap) {
      drawWin.lastSlap = slapCount;
      Sfx.play('slap');
      for (var k = 0; k < 2; k++) winHearts.push({ x: SX + rand(-10, 40), y: SB - 60, t: 0, star: Math.random() < 0.5 });
    }
    winHearts.forEach(function (h) { h.t += 1 / 60; h.y -= 0.6; h.x += Math.sin(h.t * 5) * 0.5; });
    winHearts = winHearts.filter(function (h) { return h.t < 1.8; });
    drawSprite('slap', down ? 0 : 1, SX, SB, 1);
    if (down) { // little impact lines
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2;
      [[-1, -1], [0, -1.3], [1, -1]].forEach(function (d) {
        ctx.beginPath(); ctx.moveTo(SX + 12 + d[0] * 10, SB - 58 + d[1] * 10); ctx.lineTo(SX + 12 + d[0] * 20, SB - 58 + d[1] * 20); ctx.stroke();
      });
    }
    winHearts.forEach(function (h) {
      ctx.globalAlpha = Math.max(0, 1 - h.t / 1.8);
      if (h.star) text('\u2726', h.x, h.y, 14, '#E8A271', 'center', 900); else heart(h.x, h.y, 1.1, '#F07F92');
      ctx.globalAlpha = 1;
    });
    var CX = VW * 0.38;

    if (stateT < 5) {
      var a = Math.min(1, stateT * 2, (5 - stateT) * 2);
      ctx.globalAlpha = a;
      text('You did it!', CX, 76, 38, '#ffffff', 'center', 900, OUTLINE);
      text('Dudu got his punishment. Peace is restored!', CX, 114, 15, OUTLINE, 'center', 700, 'rgba(255,255,255,.9)');
      text('Score ' + score + '  ·  Time ' + fmtTime(runTime) + '  ·  Dudus calmed ' + kills, CX, 146, 13, '#7A5444', 'center', 700, 'rgba(255,255,255,.9)');
      ctx.globalAlpha = 1;
    } else if (stateT < CREDITS_END) {
      // credits roll upwards
      var y = VH - 80 - (stateT - 5) * 22;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 30, VW, VH - 110); ctx.clip();
      CREDITS.forEach(function (c) {
        var size = c[1];
        if (c[0]) {
          var big = size >= 16;
          text(c[0], CX, y, size, big ? '#ffffff' : '#7A5444', 'center', big ? 900 : 700, big ? OUTLINE : 'rgba(255,255,255,.9)');
        }
        y += size + 12;
      });
      ctx.restore();
    } else {
      text('Thanks for playing!', CX, 90, 30, '#ffffff', 'center', 900, OUTLINE);
      text('Score ' + score + '  ·  Time ' + fmtTime(runTime), CX, 126, 13, '#7A5444', 'center', 700, 'rgba(255,255,255,.9)');
      if (Math.floor(stateT * 2) % 2 === 0) text(TOUCH ? 'Tap to play again' : 'Press Enter or tap to play again', CX, 160, 14, '#0857C3', 'center', 800, '#ffffff');
    }
    if (stateT > 2 && stateT < CREDITS_END) text(TOUCH ? 'tap to skip' : 'Enter to skip', VW - 12, VH - 70, 10, '#7A5444', 'right', 700, 'rgba(255,255,255,.8)');
  }

  function draw() {
    ctx.clearRect(0, 0, VW, VH);
    if (state === 'loading') {
      ctx.fillStyle = '#BFE6FA'; ctx.fillRect(0, 0, VW, VH);
      text('Loading… ' + Math.round(loaded / total * 100) + '%', VW / 2, VH / 2, 18, OUTLINE);
      return;
    }
    if (state === 'title') return drawTitle();
    if (state === 'win') return drawWin();
    drawBackground();
    drawWorld();
    drawHud();
    if (state === 'intro') panel('Level ' + (level + 1), L.name + (L.arena ? ' · the boss awaits!' : ''));
    if (state === 'clear') panel('Level clear!', 'Score ' + score + ' · on to level ' + (level + 2) + '…');
    if (state === 'over') drawOver();
    if (boss && boss.state === 'intro') panel('Ice-cream Dudu appears!', 'Climb the platforms and drop on his head (3 dmg)!');
  }

  /* ================= loop ================= */
  var last = 0;
  function frame(t) {
    var dt = last ? Math.min((t - last) / 1000, 1 / 30) : 0;
    last = t;
    if (!document.hidden) { update(dt); draw(); }
    pressed.left = pressed.right = false;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
