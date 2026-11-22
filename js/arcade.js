/* Saltfarmer Arcade: menu + Data Janitor (Last Hit Trainer and Bubu Adventure have their own pages).
   Loaded on demand by easter.js (arrow code, 5 logo clicks, or the 404 page).
   No dependencies, no network, scores stay in this browser (localStorage). */
(function () {
  'use strict';
  if (window.SaltArcade) return;

  var doc = document;
  var W = 640, H = 400; // logical canvas size; scaled to fit the screen
  var C = {
    navy: '#042A61', deep: '#0B1F45', blue: '#0857C3', sky: '#307FE2', mentari: '#71C5E8',
    ice: '#D6EFFB', amber: '#C37408', gold: '#E8A271', red: '#C32A08', green: '#08C316',
    teal: '#08C3AD', white: '#ffffff', muted: '#93A4C3'
  };

  /* ---------- storage ---------- */
  function getBest(key) { try { return +localStorage.getItem('bw-arcade-' + key) || 0; } catch (e) { return 0; } }
  function setBest(key, v) { try { localStorage.setItem('bw-arcade-' + key, String(v)); } catch (e) {} }

  /* ---------- styles (injected only when the arcade opens) ---------- */
  var css = '' +
    '.arc-overlay{position:fixed;inset:0;z-index:1000;background:rgba(4,12,30,.82);display:flex;align-items:center;justify-content:center;padding:16px;font-family:Inter,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}' +
    '.arc-box{width:100%;max-width:700px;max-height:100%;overflow:auto;background:' + C.deep + ';color:#fff;border:1px solid rgba(113,197,232,.35);border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.5);padding:18px}' +
    '.arc-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}' +
    '.arc-title{font-weight:700;font-size:1.1rem;letter-spacing:.02em;margin:0}' +
    '.arc-title span{color:' + C.mentari + '}' +
    '.arc-x{background:none;border:1px solid rgba(255,255,255,.25);color:#fff;border-radius:10px;width:36px;height:36px;font-size:18px;cursor:pointer}' +
    '.arc-x:hover,.arc-btn:hover,.arc-card:hover{border-color:' + C.mentari + '}' +
    '.arc-menu{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}' +
    '.arc-card{text-align:left;cursor:pointer;color:#fff;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.16);border-radius:14px;padding:16px;font:inherit}' +
    '.arc-card b{display:block;font-size:1rem;margin-bottom:4px}' +
    '.arc-card small{display:block;color:' + C.muted + ';line-height:1.45}' +
    '.arc-card em{display:block;font-style:normal;color:' + C.gold + ';font-size:.8rem;margin-top:8px;font-weight:600}' +
    '.arc-stage{position:relative}' +
    '.arc-canvas{display:block;width:100%;height:auto;border-radius:12px;background:' + C.navy + ';touch-action:none;cursor:crosshair}' +
    '.arc-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;margin-top:10px;font-size:.85rem;color:' + C.muted + '}' +
    '.arc-btn{cursor:pointer;color:#fff;background:' + C.blue + ';border:1px solid ' + C.blue + ';border-radius:999px;padding:7px 14px;font:600 .85rem Inter,system-ui,sans-serif}' +
    '.arc-btn.ghost{background:transparent;border-color:rgba(255,255,255,.25)}' +
    '.arc-help{font-size:.82rem;color:' + C.muted + ';margin:10px 0 0;line-height:1.5}' +
    '.arc-help kbd{background:rgba(255,255,255,.1);border-radius:4px;padding:0 5px;font:inherit;color:#fff}' +
    '@media (max-width:640px){.arc-menu{grid-template-columns:1fr}.arc-box{padding:14px}}';

  function injectCss() {
    if (doc.getElementById('arc-css')) return;
    var s = doc.createElement('style'); s.id = 'arc-css'; s.textContent = css; doc.head.appendChild(s);
  }

  /* ---------- shell: overlay, menu, canvas ---------- */
  var overlay, box, current, lastFocus;

  function el(tag, cls, html) { var e = doc.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }

  function open() {
    injectCss();
    if (overlay) { overlay.style.display = 'flex'; showMenu(); return; }
    lastFocus = doc.activeElement;
    overlay = el('div', 'arc-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Saltfarmer Arcade');
    box = el('div', 'arc-box');
    overlay.appendChild(box);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    doc.addEventListener('keydown', onKey, true);
    doc.body.appendChild(overlay);
    showMenu();
  }

  function close() {
    stopGame();
    if (overlay) { overlay.remove(); overlay = null; }
    doc.removeEventListener('keydown', onKey, true);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); if (current) showMenu(); else close(); return; }
    if (current && current.key) current.key(e);
  }

  function header(title, back) {
    var h = el('div', 'arc-head');
    var t = el('h2', 'arc-title', title);
    var right = el('div');
    if (back) {
      var b = el('button', 'arc-btn ghost', '&larr; Games'); b.type = 'button';
      b.style.marginRight = '8px';
      b.addEventListener('click', showMenu);
      right.appendChild(b);
    }
    var x = el('button', 'arc-x', '&times;'); x.type = 'button'; x.setAttribute('aria-label', 'Close arcade');
    x.addEventListener('click', close);
    right.appendChild(x);
    h.appendChild(t); h.appendChild(right);
    return h;
  }

  function showMenu() {
    stopGame();
    box.innerHTML = '';
    box.appendChild(header('🕹️ Saltfarmer <span>Arcade</span>', false));
    var p = el('p', 'arc-help', 'You found the secret arcade. Pick a game. Scores are saved in this browser only.');
    p.style.margin = '0 0 12px';
    box.appendChild(p);
    var menu = el('div', 'arc-menu');
    [
      { id: 'lasthit', name: '⚔️ Last Hit Trainer', desc: 'A Dota-style mid lane. Pick Radiant or Dire, last hit and deny with right-click, pull creep aggro, and out-farm the enemy mid.', href: '/lasthit/', bestKey: 'bw-arcade-lasthit' },
      { id: 'janitor', name: '🧹 Data Janitor', desc: 'Rows rain down from the database. Catch the dirty ones (NaN, null, -999, outliers). Let clean data pass.', start: Janitor },
      { id: 'bubu', name: '🐼 Bubu Adventure', desc: 'A 3-level platformer. Throw stones, kick, and jump on the Dudu monsters, then face the boss.', href: '/bubu/' }
    ].forEach(function (g) {
      var best = g.bestKey ? getBest(g.id) : g.href ? (function () { try { var b = JSON.parse(localStorage.getItem('bubu-best') || 'null'); return b && b.score ? b.score : 0; } catch (e) { return 0; } })() : getBest(g.id);
      var c = el('button', 'arc-card', '<b>' + g.name + '</b><small>' + g.desc + '</small><em>' + (g.href ? 'Opens its own page · best ' + best : 'Best: ' + best) + '</em>');
      c.type = 'button';
      c.addEventListener('click', function () { if (g.href) location.href = g.href; else startGame(g); });
      menu.appendChild(c);
    });
    box.appendChild(menu);
    var first = menu.querySelector('button'); if (first) first.focus();
  }

  function startGame(g) {
    stopGame();
    box.innerHTML = '';
    box.appendChild(header(g.name, true));
    var stage = el('div', 'arc-stage');
    var canvas = el('canvas', 'arc-canvas');
    canvas.width = W; canvas.height = H;
    stage.appendChild(canvas);
    box.appendChild(stage);
    var bar = el('div', 'arc-bar');
    var info = el('span');
    var again = el('button', 'arc-btn', 'Restart'); again.type = 'button';
    bar.appendChild(info); bar.appendChild(again);
    box.appendChild(bar);
    var help = el('p', 'arc-help');
    box.appendChild(help);
    current = g.start(canvas, info, help, g.id);
    again.addEventListener('click', function () { current.restart(); canvas.focus(); });
    canvas.tabIndex = 0;
    canvas.focus();
  }

  function stopGame() { if (current) { current.stop(); current = null; } }

  /* ---------- shared engine helpers ---------- */
  function setupCanvas(canvas) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr; canvas.height = H * dpr;
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }
  function toLocal(canvas, e) {
    var r = canvas.getBoundingClientRect();
    var p = e.touches && e.touches[0] ? e.touches[0] : e;
    return { x: (p.clientX - r.left) * W / r.width, y: (p.clientY - r.top) * H / r.height };
  }
  function loop(step) {
    var raf, last = 0, running = true;
    function frame(t) {
      if (!running) return;
      var dt = last ? Math.min((t - last) / 1000, 0.05) : 0;
      last = t;
      if (!doc.hidden) step(dt);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return function () { running = false; cancelAnimationFrame(raf); };
  }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function text(ctx, s, x, y, size, color, align, weight) {
    ctx.font = (weight || 600) + ' ' + size + 'px Inter, system-ui, sans-serif';
    ctx.fillStyle = color; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  /* =====================================================================
     GAME 2: DATA JANITOR
     Values fall from the database. Move the bin to catch dirty data
     (NaN, null, -999, outliers...). Clean values should pass through.
     Missed dirty value = lose a life. Caught clean value = lose points.
     ===================================================================== */
  function Janitor(canvas, info, help, id) {
    var ctx = setupCanvas(canvas);
    var DIRTY = ['NaN', 'null', 'None', '-999', '""', 'N/A', '#REF!', '99999999', '1900-01-01', 'undefined', '???', 'age: -3'];
    var CLEAN = ['Jakarta', '42', '3.14', '2026-11-19', 'BBRI', 'Bali', '0.87', 'Utrecht', '1998', 'pandas', 'True', 'Dota 2', '128', 'Depok'];
    var bin, items, floats, score, lives, combo, spawnT, speed, state, best, stopLoop, keys = {};

    help.innerHTML = 'Move the bin with your mouse, finger, or <kbd>&larr;</kbd> <kbd>&rarr;</kbd>. Catch <b>dirty</b> values (NaN, null, -999, outliers...). ' +
      'Let <b>clean</b> values pass. A dirty value that slips through costs a life ❤️. <kbd>Esc</kbd> = back.';

    function reset() {
      bin = { x: W / 2, w: 110 };
      items = []; floats = []; score = 0; lives = 3; combo = 0; spawnT = 0.6; speed = 70; state = 'ready';
      best = getBest(id);
      updateInfo();
    }
    function updateInfo() { info.textContent = 'Score ' + score + ' · Lives ' + '❤️'.repeat(Math.max(lives, 0)) + ' · Best ' + best; }
    function float(x, y, s, color) { floats.push({ x: x, y: y, s: s, c: color, t: 1 }); }

    function onPointer(e) {
      e.preventDefault();
      var p = toLocal(canvas, e);
      if (e.type === 'pointerdown') {
        if (state === 'over') { reset(); return; }
        if (state === 'ready') state = 'play';
      }
      bin.x = Math.max(bin.w / 2, Math.min(W - bin.w / 2, p.x));
    }
    canvas.addEventListener('pointerdown', onPointer);
    canvas.addEventListener('pointermove', onPointer);

    function spawn() {
      var dirty = Math.random() < 0.45;
      var label = dirty ? pick(DIRTY) : pick(CLEAN);
      ctx.font = '600 15px Inter, system-ui, sans-serif';
      var w = Math.max(64, ctx.measureText(label).width + 26);
      items.push({ x: rand(w / 2 + 10, W - w / 2 - 10), y: -20, w: w, label: label, dirty: dirty, v: speed * rand(0.85, 1.2) });
    }

    function step(dt) {
      if (state === 'play') {
        if (keys.ArrowLeft) bin.x -= 380 * dt;
        if (keys.ArrowRight) bin.x += 380 * dt;
        bin.x = Math.max(bin.w / 2, Math.min(W - bin.w / 2, bin.x));
        speed += dt * 2.2; // gets harder
        spawnT -= dt;
        if (spawnT <= 0) { spawn(); spawnT = Math.max(0.42, 1.15 - speed / 400); }
        var binTop = H - 46;
        items.forEach(function (it) {
          it.y += it.v * dt;
          if (!it.done && it.y + 14 >= binTop && it.y - 14 <= binTop + 10 && Math.abs(it.x - bin.x) < (bin.w + it.w) / 2 - 8) {
            it.done = true;
            if (it.dirty) { combo++; var pts = 10 + Math.min(combo - 1, 10) * 2; score += pts; float(it.x, binTop - 20, '+' + pts + ' cleaned', C.green); }
            else { combo = 0; score = Math.max(0, score - 15); float(it.x, binTop - 20, '-15 that was clean!', C.gold); }
            updateInfo();
          }
          if (!it.done && it.y > H + 10) {
            it.done = true;
            if (it.dirty) { lives--; combo = 0; float(it.x, H - 70, it.label + ' leaked!', C.red); updateInfo(); }
            else { score += 1; }
          }
        });
        items = items.filter(function (it) { return !it.done; });
        if (lives <= 0) {
          state = 'over';
          if (score > best) { best = score; setBest(id, best); }
          updateInfo();
        }
      }
      floats.forEach(function (f) { f.t -= dt * 1.1; f.y -= dt * 28; });
      floats = floats.filter(function (f) { return f.t > 0; });
      draw();
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#0B2A57'); g.addColorStop(1, '#06162F');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      // faint table grid
      ctx.strokeStyle = 'rgba(113,197,232,.07)'; ctx.lineWidth = 1;
      for (var y = 40; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      for (var x = 0; x < W; x += 128) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      text(ctx, 'Score ' + score, 20, 22, 15, '#fff', 'left');
      text(ctx, combo > 1 ? 'Combo x' + combo : '', W / 2, 22, 14, C.gold);
      text(ctx, '❤️'.repeat(Math.max(lives, 0)), W - 20, 22, 15, '#fff', 'right');
      // values
      items.forEach(function (it) {
        ctx.fillStyle = 'rgba(214,239,251,.95)'; rr(ctx, it.x - it.w / 2, it.y - 14, it.w, 28, 8); ctx.fill();
        text(ctx, it.label, it.x, it.y + 1, 15, C.navy, 'center', 700);
      });
      // bin
      var bx = bin.x - bin.w / 2, by = H - 46;
      ctx.fillStyle = C.blue; rr(ctx, bx, by, bin.w, 34, 8); ctx.fill();
      ctx.strokeStyle = C.mentari; ctx.lineWidth = 2; ctx.stroke();
      text(ctx, '🧹 df.dropna()', bin.x, by + 17, 12, '#fff', 'center', 700);
      floats.forEach(function (f) { ctx.globalAlpha = Math.max(f.t, 0); text(ctx, f.s, f.x, f.y, 13, f.c); ctx.globalAlpha = 1; });
      if (state === 'ready') banner('Data Janitor', 'Click, tap or press an arrow key to start.');
      if (state === 'over') banner('Dataset corrupted! Score ' + score, 'Best ' + best + ' · click or press Enter to clean again');
    }
    function banner(a, b) {
      ctx.fillStyle = 'rgba(4,20,48,.85)'; rr(ctx, 70, 150, W - 140, 90, 16); ctx.fill();
      text(ctx, a, W / 2, 182, 22, '#fff', 'center', 700);
      text(ctx, b, W / 2, 214, 13, C.ice, 'center', 500);
    }

    function keyHandler(e) {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (state === 'ready') state = 'play';
        keys[e.key] = e.type === 'keydown';
      }
      if (e.type === 'keydown' && e.key === 'Enter' && state === 'over') { e.preventDefault(); reset(); }
    }
    function keyUp(e) { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') keys[e.key] = false; }
    doc.addEventListener('keyup', keyUp, true);

    reset();
    stopLoop = loop(step);
    return {
      restart: reset,
      key: keyHandler,
      stop: function () {
        stopLoop();
        canvas.removeEventListener('pointerdown', onPointer);
        canvas.removeEventListener('pointermove', onPointer);
        doc.removeEventListener('keyup', keyUp, true);
      }
    };
  }

  window.SaltArcade = { open: open, close: close };
})();
