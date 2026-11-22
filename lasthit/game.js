/* Last Hit Trainer: a small Dota 2 mid lane.
   Numbers follow Dota 2 (simplified):
   - waves every 30 s; mid lane: 4 melee + 1 ranged per wave before 15:00
   - melee creep 550 HP, 2 armor, 19-23 dmg, BAT 1.0, range 100, speed 325
   - ranged creep 300 HP, 0 armor, 21-26 dmg, BAT 1.0, range 500, projectile 900
   - level-1 hero: ~52-58 dmg, range 500, attack point 0.4 s, ~1.4 s per attack
   - deny: allied creep below 50% HP
   - tier-1 tower: 1800 HP, 12 armor, 100-120 dmg, range 700; hits heroes that attack allied heroes nearby
   - uphill miss: ranged attacks from the river to higher ground miss 25% of the time
   - creep aggro: attacking an enemy hero pulls enemy creeps within 500 for 2.3 s, 3 s cooldown
   Hits to kill a melee creep: ~30 melee-creep hits, ~27 ranged-creep hits, ~12 hero hits. */
(function () {
  'use strict';

  var cv = document.getElementById('game'), ctx = cv.getContext('2d');
  var VW = 960, VH = 540, RES = 2, S = 0.42;        // logical canvas, render scale, px per Dota unit
  ctx.setTransform(RES, 0, 0, RES, 0, 0);
  var TOUCH = window.matchMedia && matchMedia('(pointer: coarse)').matches;

  /* ---------- world geometry: diagonal mid lane, Radiant bottom-left -> Dire top-right ---------- */
  var D = norm(820, -440), N = { x: -D.y, y: D.x };   // lane direction, lane normal
  function norm(x, y) { var l = Math.hypot(x, y); return { x: x / l, y: y / l }; }
  function P(u, v) { return { x: D.x * u + N.x * v, y: D.y * u + N.y * v }; }
  function laneU(o) { return o.x * D.x + o.y * D.y; }
  function laneV(o) { return o.x * N.x + o.y * N.y; }
  function sx(x) { return VW / 2 + x * S; }
  function sy(y) { return VH / 2 + y * S; }
  function wx(px) { return (px - VW / 2) / S; }
  function wy(py) { return (py - VH / 2) / S; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function armorMul(a) { return 1 - (0.06 * a) / (1 + 0.06 * Math.abs(a)); }

  var GAME_LEN = 180, WAVE_EVERY = 30, SPAWN_U = 1400, TOWER_U = 930, RIVER = 120;
  var AGGRO_RANGE = 500, AGGRO_TIME = 2.3, AGGRO_CD = 3;
  var GOLD = { melee: 38, ranged: 52, tower: 100 };
  function inRiver(o) { return Math.abs(laneU(o)) < RIVER; }
  var TEAM = [{ name: 'Radiant', ally: '#6cc04a', body: '#5aa83f', dark: '#2f5f22' },
              { name: 'Dire', ally: '#6cc04a', body: '#b8473a', dark: '#5e1d16' }];

  /* ---------- sound (Web Audio, tiny synth) ---------- */
  var ac = null, muted = false;
  try { muted = localStorage.getItem('lh-mute') === '1'; } catch (e) {}
  var soundBtn = document.getElementById('btn-sound');
  function paintSound() { soundBtn.innerHTML = muted ? '&#x1F507;' : '&#x1F50A;'; soundBtn.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on'); }
  paintSound();
  function audio() { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (ac && ac.state === 'suspended') ac.resume(); loadClips(); }
  function tone(f, d, type, vol, slide) {
    if (!ac || muted) return;
    var t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + d);
    g.gain.setValueAtTime(vol || 0.06, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + d + 0.02);
  }
  var sfx = {
    swing: function () { tone(320, 0.05, 'triangle', 0.03); },
    hit: function () { tone(180, 0.06, 'square', 0.035, 120); },
    gold: function () { tone(1320, 0.08, 'square', 0.05); setTimeout(function () { tone(1760, 0.12, 'square', 0.05); }, 70); },
    deny: function () { tone(520, 0.09, 'sawtooth', 0.05, 260); },
    aggro: function () { tone(140, 0.25, 'sawtooth', 0.05, 420); },
    wave: function () { tone(392, 0.12, 'triangle', 0.05); setTimeout(function () { tone(523, 0.16, 'triangle', 0.05); }, 110); },
    no: function () { tone(110, 0.12, 'square', 0.04); },
    die: function () { tone(300, 0.5, 'sawtooth', 0.06, 60); }
  };
  // Optional real creep sounds: drop files in lasthit/sounds/ (see the list below).
  // Missing files are simply skipped, so the game still works with the synth sounds only.
  var CLIPS = {
    'melee-attack': ['melee-attack-1', 'melee-attack-2', 'melee-attack-3'],
    'ranged-attack': ['ranged-attack-1', 'ranged-attack-2'],
    'ranged-impact': ['ranged-impact-1', 'ranged-impact-2'],
    'creep-death': ['creep-death-1', 'creep-death-2', 'creep-death-3']
  };
  var buf = {}, loading = false, lastClip = 0;
  function loadClips() {
    if (loading || !ac) return; loading = true;
    Object.keys(CLIPS).forEach(function (k) {
      buf[k] = [];
      CLIPS[k].forEach(function (name) {
        fetch('sounds/' + name + '.mp3').then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); })
          .then(function (a) { return new Promise(function (ok, no) { ac.decodeAudioData(a, ok, no); }); })
          .then(function (b) { buf[k].push(b); }).catch(function () {});
      });
    });
  }
  // play a creep clip; throttled so a big fight does not turn into noise
  function clip(k, vol) {
    if (!ac || muted || !buf[k] || !buf[k].length) return false;
    var now = ac.currentTime; if (now - lastClip < 0.06) return true; lastClip = now;
    var src = ac.createBufferSource(), g = ac.createGain(), list = buf[k];
    src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = rand(0.94, 1.06); g.gain.value = vol || 0.35;
    src.connect(g); g.connect(ac.destination); src.start();
    return true;
  }
  soundBtn.addEventListener('click', function () { muted = !muted; try { localStorage.setItem('lh-mute', muted ? '1' : '0'); } catch (e) {} paintSound(); soundBtn.blur(); });

  /* ---------- state ---------- */
  var units = null, shots = [], floats = [], me, foe, my, time, nextWave, state = 'menu', side = 0, aMode = false, hover = null, mouse = { x: -99, y: -99 };
  var stats, banner = null;

  var heroType = 'ranged';
  try { heroType = localStorage.getItem('lh-hero') === 'melee' ? 'melee' : 'ranged'; } catch (e) {}
  // ranged: the original hero. melee: more damage and health, but must walk up to the creep.
  var HERO = {
    ranged: { hp: 620, armor: 3, dmg: [52, 58], range: 500, ap: 0.4, bat: 1.42, proj: 1200 },
    melee: { hp: 760, armor: 4, dmg: [61, 67], range: 150, ap: 0.4, bat: 1.45, proj: 0 }
  };
  function heroSpec(team, isPlayer) {
    var dir = team === 0 ? 1 : -1, p = P(-dir * 640, isPlayer ? 40 : -40), H = HERO[heroType];
    return {
      kind: 'hero', team: team, player: isPlayer, type: heroType, x: p.x, y: p.y, r: 30, hp: H.hp, max: H.hp, armor: H.armor, regen: 2,
      dmg: H.dmg, range: H.range, ap: H.ap, bat: H.bat, proj: H.proj, speed: 300,
      cd: 0, wind: -1, order: null, aggroCd: 0, dead: 0, lh: 0, dn: 0, gold: 0, facing: 0
    };
  }
  function tower(team) {
    var dir = team === 0 ? 1 : -1, p = P(-dir * TOWER_U, 0);
    return {
      kind: 'tower', team: team, x: p.x, y: p.y, r: 52, hp: 1800, max: 1800, armor: 12,
      dmg: [100, 120], range: 700, ap: 0.6, bat: 1, proj: 750, speed: 0,
      cd: 0, wind: -1, target: null, aggroT: 0, fixed: true
    };
  }
  function creep(team, kind, u, v) {
    var p = P(u, v), m = kind === 'melee';
    return {
      kind: kind, team: team, x: p.x, y: p.y, r: m ? 22 : 18, hp: m ? 550 : 300, max: m ? 550 : 300, armor: m ? 2 : 0,
      dmg: m ? [19, 23] : [21, 26], range: m ? 100 : 500, ap: m ? 0.467 : 0.5, bat: 1, proj: m ? 0 : 900, speed: 325,
      cd: rand(0, 0.25), wind: -1, target: null, aggroT: 0, laneV: v
    };
  }
  function spawnWave() {
    for (var t = 0; t < 2; t++) {
      var dir = t === 0 ? 1 : -1, u0 = -dir * SPAWN_U;
      [-90, -30, 30, 90].forEach(function (v, i) { units.push(creep(t, 'melee', u0 - dir * (i % 2) * 40, v)); });
      units.push(creep(t, 'ranged', u0 - dir * 150, 0));
    }
    sfx.wave();
  }

  function newGame(s) {
    side = s; my = side;
    units = []; shots = []; floats = []; time = 0; nextWave = 0; aMode = false; hover = null;
    me = heroSpec(side, true); foe = heroSpec(1 - side, false);
    foe.ai = { think: 0, react: 0, plan: null, harass: rand(6, 10) };
    units.push(tower(0), tower(1), me, foe);
    stats = { enemyCreepsDied: 0 };
    banner = { text: 'You are ' + TEAM[side].name + ' \u00b7 ' + (heroType === 'melee' ? 'Melee' : 'Ranged') + ' hero', t: 2 };
    state = 'play';
    document.getElementById('start').hidden = true;
    document.getElementById('end').hidden = true;
    cv.focus();
  }

  /* ---------- combat ---------- */
  function alive(u) { return u && units.indexOf(u) >= 0 && u.hp > 0 && !u.dead; }
  function canAttack(att, tgt) {
    if (!alive(tgt) || tgt === att) return false;
    if (tgt.team !== att.team) return true;
    if (tgt.kind === 'tower') return tgt.hp < tgt.max * 0.1;  // towers: deny below 10%
    return tgt.kind !== 'hero' && tgt.hp < tgt.max * 0.5;     // creeps: deny below 50%
  }
  function damage(src, tgt, raw) {
    if (!alive(tgt)) return;
    var d = raw * armorMul(tgt.armor);
    tgt.hp -= d;
    if (tgt.hp > 0) return;
    tgt.hp = 0;
    if (tgt.kind === 'hero') {
      tgt.dead = 8; tgt.wind = -1; tgt.order = null; sfx.die();
      if (src && src.kind === 'hero') { src.gold += 150; if (src.player) float(tgt, '+150 kill', '#ffd34d'); }
      return;
    }
    units.splice(units.indexOf(tgt), 1);
    if (tgt.kind === 'tower') { banner = { text: (tgt.team === my ? 'Your' : 'Enemy') + ' tower has fallen', t: 2.5 }; sfx.die(); }
    else { clip('creep-death', 0.45); if (tgt.team !== my) stats.enemyCreepsDied++; }
    if (src && src.kind === 'hero') {
      if (src.team !== tgt.team) {
        src.lh++; src.gold += GOLD[tgt.kind];
        if (src.player) { float(tgt, '+' + GOLD[tgt.kind], '#ffd34d'); sfx.gold(); }
      } else {
        src.dn++;
        if (src.player) { float(tgt, '!', '#ffffff', 26); sfx.deny(); }
        else float(tgt, '!', '#ff8a7a', 22);
      }
    }
  }
  function attackRoll(u) { return rand(u.dmg[0], u.dmg[1]); }
  // Tower aggro: a hero that attacks an enemy hero inside a tower's range becomes that tower's target.
  function towerAggro(att) {
    units.forEach(function (t) {
      if (t.kind === 'tower' && t.team !== att.team && alive(t) && dist(t, att) <= t.range + t.r + att.r) { t.target = att; t.aggroT = 2; }
    });
  }
  function missed(src, tgt) {
    var who = src === me ? '#ff6b5a' : tgt === me ? '#ffffff' : 'rgba(255,255,255,.75)';
    float(tgt, src === me ? 'MISS' : tgt === me ? 'EVADE' : 'miss', who, src === me || tgt === me ? 14 : 11);
  }
  function release(u, tgt) {
    if (!alive(tgt)) return;
    if (u.kind === 'hero' && tgt.kind === 'hero') towerAggro(u);
    if (u.proj) {
      // uphill miss: a ranged attack launched from the river at a target on higher ground misses 25% of the time
      shots.push({ x: u.x, y: u.y, src: u, tgt: tgt, sp: u.proj, dmg: attackRoll(u), hero: u.kind === 'hero', tower: u.kind === 'tower', team: u.team,
                   uphill: u.kind !== 'tower' && inRiver(u) && !inRiver(tgt) });
      if (u.kind === 'ranged') clip('ranged-attack', 0.25);
    } else if (alive(tgt) && dist(u, tgt) <= u.range + u.r + tgt.r + 30) {
      if (!clip('melee-attack', 0.3) && tgt === me) sfx.hit();
      damage(u, tgt, attackRoll(u));
    }
  }

  // Aggro: when `hero` attacks an enemy hero, enemy creeps within 500 of `hero` switch to it for 2.3 s.
  function aggro(hero) {
    if (hero.aggroCd > 0) return false;
    hero.aggroCd = AGGRO_CD;
    var n = 0;
    units.forEach(function (c) {
      if (c.kind === 'hero' || c.kind === 'tower' || c.team === hero.team) return;
      if (dist(c, hero) <= AGGRO_RANGE) { c.target = hero; c.aggroT = AGGRO_TIME; c.wind = -1; n++; }
    });
    if (hero.player) { sfx.aggro(); float(hero, n ? 'aggro x' + n : 'no creeps near', n ? '#ff9f43' : '#cccccc', 14); }
    return true;
  }

  function acquire(c) {
    var best = [], bd = 1e9, reach = c.kind === 'tower' ? c.range + c.r : 520;
    function scan(kind) {
      units.forEach(function (o) {
        if (o.team === c.team || !alive(o) || o.kind !== kind) return;
        var d = dist(c, o) - (c.kind === 'tower' ? o.r : 0); if (d > reach) return;
        best.push({ o: o, d: d }); if (d < bd) bd = d;
      });
    }
    // priority: creeps, then towers, then heroes (heroes only when nothing else is around)
    scan('melee'); scan('ranged');
    if (!best.length && c.kind !== 'tower') scan('tower');
    if (!best.length) scan('hero');
    if (!best.length) return null;
    if (c.kind === 'tower') { best.sort(function (a, b) { return a.d - b.d; }); return best[0].o; }
    var near = best.filter(function (b) { return b.d <= bd + 90; });   // a bit of randomness among the closest
    return near[Math.floor(Math.random() * near.length)].o;
  }

  function moveToward(u, tx, ty, dt) {
    var dx = tx - u.x, dy = ty - u.y, l = Math.hypot(dx, dy);
    if (l < 1) return true;
    var s = Math.min(l, u.speed * dt), mx = dx / l, my = dy / l;
    // walk around towers instead of pushing into them: steer sideways when one is in the way
    units.forEach(function (f) {
      if (!f.fixed || f === u || f.hp <= 0) return;
      var fx = f.x - u.x, fy = f.y - u.y, fd = Math.hypot(fx, fy), clear = f.r + u.r + 12;
      if (fd > clear + 120 || fx * mx + fy * my <= 0) return;           // far away, or behind us
      if (f === (u.target || (u.order && u.order.tgt))) return;          // we are going to hit it
      var cross = mx * fy - my * fx, perp = Math.abs(cross);
      if (perp >= clear) return;                                          // path already passes beside it
      var side = cross > 0 ? -1 : 1, w = (clear - perp) / clear + 0.3;    // turn away, harder when closer
      var px = -my, py = mx;                                              // perpendicular to the walk direction
      mx += px * side * w * 1.4; my += py * side * w * 1.4;
      var n = Math.hypot(mx, my) || 1; mx /= n; my /= n;
    });
    u.x += mx * s; u.y += my * s; u.facing = Math.atan2(my, mx);
    return l <= s;
  }

  function stepTower(t, dt) {
    if (t.aggroT > 0) t.aggroT -= dt;
    var reach = t.range + t.r;
    if (t.target && (!alive(t.target) || dist(t, t.target) - t.target.r > reach)) { t.target = null; t.wind = -1; }
    if (!t.target) t.target = acquire(t);
    t.cd -= dt;
    if (t.wind >= 0) { t.wind -= dt; if (t.wind < 0) release(t, t.target); return; }
    if (t.target && t.cd <= 0) { t.wind = t.ap; t.cd = t.bat; }
  }

  function stepCreep(c, dt) {
    if (c.aggroT > 0) { c.aggroT -= dt; if (c.aggroT <= 0) { c.target = null; } }   // aggro ends: re-pick
    if (c.target && !alive(c.target)) c.target = null;
    if (c.target && c.aggroT <= 0 && dist(c, c.target) > 700) c.target = null;
    // not aggroed but hitting a hero: switch back to a creep (or tower) as soon as one is close
    if (c.target && c.target.kind === 'hero' && c.aggroT <= 0 && c.wind < 0) {
      c.reT = (c.reT || 0) - dt;
      if (c.reT <= 0) { c.reT = 0.4; var alt = acquire(c); if (alt && alt.kind !== 'hero') c.target = alt; }
    }
    if (!c.target) { c.target = acquire(c); if (c.target) c.cd = Math.max(c.cd, rand(0, 0.3)); }
    c.cd -= dt;
    if (c.wind >= 0) {
      c.wind -= dt;
      if (c.wind < 0) release(c, c.target);
      return;
    }
    if (c.target) {
      var reach = c.range + c.r + c.target.r;
      if (dist(c, c.target) > reach) moveToward(c, c.target.x, c.target.y, dt);
      else if (c.cd <= 0) { c.wind = c.ap; c.cd = c.bat; }
    } else {
      var dir = c.team === 0 ? 1 : -1, u = laneU(c) + dir * 200, p = P(u, c.laneV);
      moveToward(c, p.x, p.y, dt);
    }
  }

  function stepHero(h, dt) {
    if (h.dead) {
      h.dead -= dt;
      if (h.dead <= 0) { var s = heroSpec(h.team, h.player); h.dead = 0; h.hp = h.max; h.x = s.x; h.y = s.y; h.cd = 0; }
      return;
    }
    h.hp = Math.min(h.max, h.hp + h.regen * dt);
    h.cd -= dt; h.aggroCd = Math.max(0, h.aggroCd - dt);
    var o = h.order;
    if (o && o.type === 'attack' && !canAttack(h, o.tgt)) { h.order = o = null; h.wind = -1; }
    if (h.wind >= 0) {
      h.wind -= dt;
      if (h.wind < 0 && o && o.type === 'attack') { release(h, o.tgt); if (o.once) h.order = null; }
      return;
    }
    if (!o) return;
    if (o.type === 'move') { if (moveToward(h, o.x, o.y, dt)) h.order = null; return; }
    var t = o.tgt, reach = h.range + h.r + t.r;
    if (dist(h, t) > reach) moveToward(h, t.x, t.y, dt);
    else {
      h.facing = Math.atan2(t.y - h.y, t.x - h.x);
      if (h.cd <= 0) { h.wind = h.ap; h.cd = h.bat; if (h.player) sfx.swing(); }
    }
  }

  /* ---------- enemy mid (bot) ---------- */
  function stepBot(b, dt) {
    if (b.dead) return;
    var ai = b.ai; ai.think -= dt; ai.harass -= dt;
    if (b.wind >= 0 || (b.order && b.order.type === 'attack' && !b.order.harass)) return;   // committed to a last hit
    if (ai.plan) { ai.react -= dt; if (ai.react <= 0) { if (canAttack(b, ai.plan)) b.order = { type: 'attack', tgt: ai.plan, once: true }; ai.plan = null; } return; }
    if (ai.think > 0) return;
    ai.think = 0.1;
    var mul = 1, pick = null, best = 1e9;
    units.forEach(function (c) {
      if (c.kind === 'hero' || c.kind === 'tower' || !canAttack(b, c)) return;
      var d = dist(b, c), travel = Math.max(0, d - b.range - b.r - c.r) / b.speed + b.ap + (b.proj ? Math.min(d, b.range) / b.proj : 0);
      var attackers = units.filter(function (o) { return o.target === c; }).length;
      var predicted = c.hp - attackers * 19 * travel;                     // rough damage taken before our hit lands
      var hit = b.dmg[0] * armorMul(c.armor) * rand(0.9, 1.2);            // the bot misjudges a little
      var deny = c.team === b.team;
      if (predicted <= hit && (!deny || Math.random() < 0.7) && d < 900 && predicted < best) { best = predicted; pick = c; }
    });
    if (pick) { ai.plan = pick; ai.react = rand(0.12, 0.4); return; }
    if (ai.harass <= 0 && alive(me) && !me.dead && dist(b, me) < 620) {       // poke the player now and then
      ai.harass = rand(7, 12); b.order = { type: 'attack', tgt: me, once: true, harass: true }; aggro(b); return;
    }
    // stand behind its own creeps
    var dir = b.team === 0 ? 1 : -1, front = -dir * 400;
    units.forEach(function (c) { if (c.team === b.team && c.kind !== 'hero') { var u = laneU(c); if (dir > 0 ? u > front : u < front) front = u; } });
    var stand = front - dir * 380, limit = dir * (TOWER_U - 800);          // stay out of the enemy tower's range
    stand = dir > 0 ? Math.min(stand, limit) : Math.max(stand, limit);
    var p = P(stand, -60 * dir);
    if (dist(b, p) > 40) b.order = { type: 'move', x: p.x, y: p.y };
  }

  /* ---------- player input ---------- */
  function unitAt(px, py, slack) {
    var best = null, bd = 1e9;
    units.forEach(function (u) {
      if (!alive(u) || u === me) return;
      var d = Math.hypot(sx(u.x) - px, sy(u.y) - py), r = u.r * S + (slack || 6);
      if (d <= r && d < bd) { bd = d; best = u; }
    });
    return best;
  }
  function commandAttack(t) {
    if (me.dead) return;
    if (!canAttack(me, t)) {
      sfx.no(); float(t, t.team === me.team ? (t.kind === 'hero' ? "can't" : t.kind === 'tower' ? 'not below 10%' : 'not below 50%') : "can't", '#cccccc', 13); return;
    }
    if (me.order && me.order.tgt !== t) me.wind = -1;
    me.order = { type: 'attack', tgt: t };
    if (t.kind === 'hero') aggro(me);
  }
  function commandMove(px, py) {
    if (me.dead) return;
    me.wind = -1; me.order = { type: 'move', x: wx(px), y: wy(py) };
    floats.push({ x: wx(px), y: wy(py), s: '', ring: true, t: 0.5 });
  }
  function stop() { me.wind = -1; me.order = null; }

  // canvas buttons (bottom bar)
  var BTN = { aggro: { x: VW - 196, y: VH - 58, w: 88, h: 44 }, stop: { x: VW - 100, y: VH - 58, w: 88, h: 44 } };
  function inBtn(b, x, y) { return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }

  function toLocal(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * VW, y: (e.clientY - r.top) / r.height * VH }; }
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  cv.addEventListener('pointerdown', function (e) {
    audio();
    if (state !== 'play') return;
    e.preventDefault(); cv.focus();
    var p = toLocal(e), touch = e.pointerType === 'touch';
    if (inBtn(BTN.aggro, p.x, p.y)) { aggro(me); return; }
    if (inBtn(BTN.stop, p.x, p.y)) { stop(); return; }
    var t = unitAt(p.x, p.y, touch ? 18 : 6);
    if (e.button === 2 || touch || aMode) {          // right-click, tap, or A + left-click
      aMode = false; cv.classList.remove('amode');
      if (t) commandAttack(t); else commandMove(p.x, p.y);
    } else if (t) {
      float(t, 'right-click or A + click', '#cfe8ff', 12);
    }
  });
  cv.addEventListener('pointermove', function (e) { var p = toLocal(e); mouse = p; hover = state === 'play' ? unitAt(p.x, p.y, 6) : null; });
  cv.addEventListener('pointerleave', function () { hover = null; mouse = { x: -99, y: -99 }; });

  window.addEventListener('keydown', function (e) {
    if (e.code === 'KeyF' && !e.repeat) { toggleFull(); return; }
    if (e.code === 'KeyM') { soundBtn.click(); return; }
    if (state !== 'play') return;
    if (e.code === 'KeyA') { aMode = true; cv.classList.add('amode'); }
    else if (e.code === 'KeyS') stop();
    else if (e.code === 'KeyQ') aggro(me);
    else if (e.code === 'Escape') { aMode = false; cv.classList.remove('amode'); }
    else return;
    e.preventDefault();
  });

  /* ---------- menus ---------- */
  var typeBtns = document.querySelectorAll('.htype');
  function paintType() { typeBtns.forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-type') === heroType); }); }
  typeBtns.forEach(function (b) {
    b.addEventListener('click', function () { heroType = b.getAttribute('data-type'); try { localStorage.setItem('lh-hero', heroType); } catch (e) {} paintType(); });
  });
  paintType();
  document.querySelectorAll('.side').forEach(function (b) {
    b.addEventListener('click', function () {
      audio();
      var s = b.getAttribute('data-side');
      newGame(s === 'r' ? (Math.random() < 0.5 ? 0 : 1) : +s);
    });
  });
  document.getElementById('again').addEventListener('click', function () { newGame(side); });
  document.getElementById('change').addEventListener('click', function () {
    document.getElementById('end').hidden = true; document.getElementById('start').hidden = false; state = 'menu';
  });

  function endGame() {
    state = 'end';
    var pct = stats.enemyCreepsDied ? Math.round(me.lh / stats.enemyCreepsDied * 100) : 0;
    document.getElementById('r-lh').textContent = me.lh;
    document.getElementById('r-dn').textContent = me.dn;
    document.getElementById('r-pct').textContent = pct + '%';
    document.getElementById('r-gold').textContent = me.gold;
    var win = me.lh + me.dn > foe.lh + foe.dn, tie = me.lh + me.dn === foe.lh + foe.dn;
    document.getElementById('end-title').textContent = win ? 'You won the lane!' : tie ? 'Even lane' : 'Lane lost';
    document.getElementById('r-vs').textContent = 'Enemy mid (' + TEAM[foe.team].name + '): ' + foe.lh + ' / ' + foe.dn + '. ' +
      stats.enemyCreepsDied + ' enemy creeps died, you took ' + me.lh + '.';
    var score = me.lh + me.dn;
    try { if (score > (+localStorage.getItem('bw-arcade-lasthit') || 0)) localStorage.setItem('bw-arcade-lasthit', String(score)); } catch (e) {}
    document.getElementById('end').hidden = false;
  }

  /* ---------- update ---------- */
  function float(u, s, c, size) { floats.push({ x: u.x, y: u.y - 30, s: s, c: c, size: size || 16, t: 1 }); }

  function update(dt) {
    if (state !== 'play') return;
    time += dt;
    if (time >= nextWave && nextWave < GAME_LEN) { spawnWave(); nextWave += WAVE_EVERY; }
    if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }
    stepBot(foe, dt);
    units.slice().forEach(function (u) { if (u.kind === 'hero') stepHero(u, dt); else if (u.kind === 'tower') stepTower(u, dt); else stepCreep(u, dt); });
    // keep units from stacking on top of each other
    for (var i = 0; i < units.length; i++) for (var j = i + 1; j < units.length; j++) {
      var a = units[i], b = units[j]; if (a.dead || b.dead) continue;
      var dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, m = (a.r + b.r) * 0.85;
      if (d < m) {
        var k = (m - d) / d, ka = a.fixed ? 0 : b.fixed ? k : k / 2, kb = b.fixed ? 0 : a.fixed ? k : k / 2;
        a.x -= dx * ka; a.y -= dy * ka; b.x += dx * kb; b.y += dy * kb;
      }
    }
    shots.forEach(function (s) {
      if (!alive(s.tgt)) { s.done = true; return; }
      var dx = s.tgt.x - s.x, dy = s.tgt.y - s.y, d = Math.hypot(dx, dy), st = s.sp * dt;
      if (d <= st + 8) {
        s.done = true;
        if (s.uphill && Math.random() < 0.25) { missed(s.src, s.tgt); return; }
        if (s.src.kind === 'ranged') clip('ranged-impact', 0.25);
        damage(s.src, s.tgt, s.dmg); if (s.src === me && s.tgt.hp > 0) sfx.hit();
      }
      else { s.x += dx / d * st; s.y += dy / d * st; }
    });
    shots = shots.filter(function (s) { return !s.done; });
    floats.forEach(function (f) { f.t -= dt * (f.ring ? 2 : 0.9); if (!f.ring) f.y -= dt * 40; });
    floats = floats.filter(function (f) { return f.t > 0; });
    if (time >= GAME_LEN) endGame();
  }

  /* ---------- drawing ---------- */
  var bg = document.createElement('canvas');
  function buildBg() {
    bg.width = VW * RES; bg.height = VH * RES;
    var g = bg.getContext('2d'); g.setTransform(RES, 0, 0, RES, 0, 0);
    // Radiant half (bottom-left) and Dire half (top-right)
    var grd = g.createLinearGradient(0, VH, VW, 0);
    grd.addColorStop(0, '#3f6a2c'); grd.addColorStop(0.47, '#4d6b33'); grd.addColorStop(0.53, '#4f4a33'); grd.addColorStop(1, '#3b2b25');
    g.fillStyle = grd; g.fillRect(0, 0, VW, VH);
    // lane path
    g.save(); g.translate(VW / 2, VH / 2); g.rotate(Math.atan2(D.y, D.x));
    var lw = 170 * S; g.fillStyle = 'rgba(196,170,120,.55)'; g.fillRect(-700, -lw, 1400, lw * 2);
    g.strokeStyle = 'rgba(80,60,35,.35)'; g.lineWidth = 2; g.strokeRect(-700, -lw, 1400, lw * 2);
    g.restore();
    // river, across the lane at the middle
    g.save(); g.translate(VW / 2, VH / 2); g.rotate(Math.atan2(N.y, N.x));
    var rw = RIVER * S; g.fillStyle = 'rgba(47,111,143,.92)'; g.fillRect(-700, -rw, 1400, rw * 2);
    g.fillStyle = 'rgba(160,220,255,.18)'; for (var i = -700; i < 700; i += 36) g.fillRect(i, -rw * 0.6 + (i % 3) * rw * 0.4, 18, 2);
    g.restore();
    // trees off the lane
    var seed = 7; function r() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    for (var k = 0; k < 220; k++) {
      var u = (r() - 0.5) * 3200, v = (r() < 0.5 ? -1 : 1) * (240 + r() * 650), p = P(u, v), x = sx(p.x), y = sy(p.y);
      if (x < -20 || x > VW + 20 || y < -20 || y > VH + 20) continue;
      if (Math.abs(laneU(p)) < RIVER + 30) continue;               // keep the river clear
      var dire = laneU(p) > 0, rad = 7 + r() * 8;
      g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(x + 3, y + 5, rad, rad * 0.6, 0, 0, 7); g.fill();
      g.fillStyle = dire ? '#4a3a2c' : '#2f5a25'; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
      g.fillStyle = dire ? '#6b4b36' : '#47803a'; g.beginPath(); g.arc(x - rad * 0.3, y - rad * 0.3, rad * 0.55, 0, 7); g.fill();
    }
    g.font = '700 12px Inter, system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,.35)';
    g.fillText('RADIANT', 18, VH - 74); g.textAlign = 'right'; g.fillText('DIRE', VW - 18, 70);
  }
  buildBg();

  function bar(x, y, w, h, frac, col) {
    ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = col; ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
  }
  function txt(s, x, y, size, col, align, weight) {
    ctx.font = (weight || 700) + ' ' + size + 'px Inter, system-ui, sans-serif';
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(s, x, y);
    ctx.fillStyle = col || '#fff'; ctx.fillText(s, x, y);
  }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  function drawUnit(u) {
    var x = sx(u.x), y = sy(u.y), r = u.r * S, col = TEAM[u.team].body;
    if (u.dead) return;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x + 2, y + r * 0.6, r, r * 0.5, 0, 0, 7); ctx.fill();
    if (u.kind === 'tower') {
      ctx.strokeStyle = u.team === my ? 'rgba(108,192,74,.22)' : 'rgba(217,71,60,.3)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, (u.range + u.r) * S, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#6f737c'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      ctx.fillStyle = '#9aa0ab'; ctx.beginPath(); ctx.arc(x, y, r * 0.7, 0, 7); ctx.fill();
      ctx.fillStyle = u.team === 0 ? '#7fd65a' : '#e0604f'; ctx.beginPath(); ctx.arc(x, y, r * 0.38, 0, 7); ctx.fill();
      if (u.wind >= 0) { ctx.strokeStyle = '#ffe08a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r * 0.38 + 3, 0, 7); ctx.stroke(); }
      if (u.target) { ctx.strokeStyle = 'rgba(255,224,138,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(sx(u.target.x), sy(u.target.y)); ctx.stroke(); }
      bar(x - 26, y - r - 10, 52, 5, u.hp / u.max, u.team === my ? '#6cc04a' : '#d9473c');
    } else if (u.kind === 'hero') {
      if (u.player && (aMode || hover)) { ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, (u.range + u.r) * S, 0, 7); ctx.stroke(); }
      ctx.fillStyle = TEAM[u.team].dark; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, 7); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      ctx.strokeStyle = u.player ? '#ffffff' : '#ffb3a8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 3, 0, 7); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + Math.cos(u.facing) * r * 0.6, y + Math.sin(u.facing) * r * 0.6, 3, 0, 7); ctx.fill();
      if (u.wind >= 0) { ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r + 7, -Math.PI / 2, -Math.PI / 2 + (1 - u.wind / u.ap) * Math.PI * 2); ctx.stroke(); }
      bar(x - 24, y - r - 14, 48, 5, u.hp / u.max, u.team === my ? '#6cc04a' : '#d9473c');
      txt(u.player ? 'You' : 'Enemy mid', x, y + r + 12, 10, u.player ? '#fff' : '#ffc9c0');
    } else {
      ctx.fillStyle = TEAM[u.team].dark; ctx.beginPath(); ctx.arc(x, y, r + 2, 0, 7); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      if (u.kind === 'ranged') { ctx.fillStyle = '#e8f4ff'; ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 5); ctx.lineTo(x - 5, y); ctx.fill(); }
      else { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(x - 4, y - 1.5, 8, 3); }
      var w = u.kind === 'melee' ? 28 : 24;
      bar(x - w / 2, y - r - 9, w, 4, u.hp / u.max, u.team === my ? '#6cc04a' : '#d9473c');
    }
    if (u === hover) {
      ctx.strokeStyle = canAttack(me, u) ? (u.team === my ? '#ffffff' : '#ffd34d') : 'rgba(255,255,255,.35)';
      ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 6, 0, 7); ctx.stroke();
    }
    if (me.order && me.order.tgt === u) { ctx.strokeStyle = '#ff6b5a'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r + 9, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
  }

  function drawHud() {
    // top bar
    ctx.fillStyle = 'rgba(4,18,40,.72)'; rr(VW / 2 - 170, 8, 340, 40, 10); ctx.fill();
    var left = Math.max(0, GAME_LEN - time), m = Math.floor(left / 60), s = Math.floor(left % 60);
    txt(m + ':' + (s < 10 ? '0' : '') + s, VW / 2, 28, 18, '#fff');
    txt('LH ' + me.lh + ' / DN ' + me.dn, VW / 2 - 100, 28, 14, '#ffd34d');
    txt(me.gold + ' g', VW / 2 + 110, 28, 14, '#ffd34d');
    txt('Enemy mid  ' + foe.lh + ' / ' + foe.dn, VW - 16, 22, 12, '#ffc9c0', 'right');
    var nw = Math.max(0, Math.ceil(nextWave - time));
    if (nextWave < GAME_LEN) txt('Next wave ' + nw + 's', VW - 16, 40, 11, 'rgba(255,255,255,.75)', 'right', 400);
    txt(TEAM[my].name + ' \u00b7 ' + (me.type === 'melee' ? 'Melee' : 'Ranged'), 16, 22, 13, my === 0 ? '#8fdc6a' : '#ff8a7a', 'left');
    // bottom: hero HP + buttons
    ctx.fillStyle = 'rgba(4,18,40,.72)'; rr(12, VH - 58, 250, 44, 10); ctx.fill();
    bar(24, VH - 44, 226, 10, me.hp / me.max, '#6cc04a');
    txt(me.dead ? 'Respawn in ' + Math.ceil(me.dead) + 's' : Math.ceil(me.hp) + ' / ' + me.max, 137, VH - 24, 11, '#fff', 'center', 400);
    var cdf = me.aggroCd / AGGRO_CD;
    [['aggro', 'Aggro (Q)'], ['stop', 'Stop (S)']].forEach(function (b) {
      var B = BTN[b[0]];
      ctx.fillStyle = b[0] === 'aggro' ? '#C37408' : '#0857C3'; rr(B.x, B.y, B.w, B.h, 10); ctx.fill();
      if (b[0] === 'aggro' && cdf > 0) { ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(B.x, B.y, B.w * cdf, B.h, 10); ctx.fill(); }
      txt(b[0] === 'aggro' && cdf > 0 ? me.aggroCd.toFixed(1) + 's' : b[1], B.x + B.w / 2, B.y + B.h / 2, 12, '#fff');
    });
    if (aMode) txt('ATTACK: left-click a target', VW / 2, VH - 30, 13, '#ff6b5a');
    if (banner) { ctx.globalAlpha = Math.min(1, banner.t); txt(banner.text, VW / 2, 90, 24, '#fff'); ctx.globalAlpha = 1; }
  }

  function draw() {
    ctx.drawImage(bg, 0, 0, VW, VH);
    floats.forEach(function (f) { if (f.ring) { ctx.strokeStyle = 'rgba(120,255,140,' + f.t + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx(f.x), sy(f.y), 4 + (1 - f.t) * 16, 0, 7); ctx.stroke(); } });
    if (!units) return;
    units.slice().sort(function (a, b) { return a.y - b.y; }).forEach(drawUnit);
    shots.forEach(function (s) {
      ctx.fillStyle = s.tower ? '#ffe08a' : s.hero ? (s.team === my ? '#9fe0ff' : '#ff9f8a') : (s.team === 0 ? '#c8f0a0' : '#ffb07a');
      ctx.beginPath(); ctx.arc(sx(s.x), sy(s.y), s.tower ? 6 : s.hero ? 4 : 3, 0, 7); ctx.fill();
    });
    floats.forEach(function (f) { if (!f.ring) { ctx.globalAlpha = clamp(f.t * 1.5, 0, 1); txt(f.s, sx(f.x), sy(f.y), f.size, f.c); ctx.globalAlpha = 1; } });
    drawHud();
  }

  /* ---------- full screen (real, or maximised fallback e.g. iPhone) ---------- */
  var fullBtn = document.getElementById('btn-full'), root = document.documentElement;
  function realFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function syncFull() {
    var on = realFull() || root.classList.contains('is-max');
    root.classList.toggle('is-full', on);
    fullBtn.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
    fullBtn.querySelector('.ico').textContent = on ? '✕' : '⛶';
    fullBtn.querySelector('.lbl').textContent = on ? 'Exit' : 'Full screen';
  }
  function toggleFull() {
    if (realFull()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    if (root.classList.contains('is-max')) { root.classList.remove('is-max'); syncFull(); return; }
    var req = root.requestFullscreen || root.webkitRequestFullscreen;
    var maximise = function () { root.classList.add('is-max'); syncFull(); window.scrollTo(0, 1); };
    if (!req) return maximise();
    Promise.resolve(req.call(root)).then(function () {
      if (TOUCH && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {});
    }).catch(maximise);
  }
  document.addEventListener('fullscreenchange', syncFull);
  document.addEventListener('webkitfullscreenchange', syncFull);
  fullBtn.addEventListener('click', function () { fullBtn.blur(); toggleFull(); });

  /* ---------- loop ---------- */
  var last = performance.now();
  function frame(t) {
    var dt = Math.min(0.05, (t - last) / 1000); last = t;
    update(dt); draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
