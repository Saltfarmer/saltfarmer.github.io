/* Easter eggs for the gate: opens the secret arcade (js/arcade.js) when a visitor
   - presses Up Up Down Down Left Right Left Right
   - clicks the logo 5 times quickly (a single click still follows the link)
   - clicks any element with data-arcade (used on 404.html) */
(function () {
  'use strict';
  var doc = document;
  var me = doc.currentScript || doc.querySelector('script[src*="easter.js"]');
  var arcadeSrc = me ? me.src.replace(/easter\.js(\?.*)?$/, 'arcade.js') : 'js/arcade.js';

  function toast(msg) {
    var t = doc.querySelector('.egg-toast');
    if (!t) {
      t = doc.createElement('div');
      t.className = 'egg-toast';
      t.setAttribute('role', 'status');
      t.style.cssText = 'position:fixed;left:50%;bottom:72px;transform:translateX(-50%);z-index:1001;' +
        'background:#0857C3;color:#fff;font:600 14px Inter,system-ui,sans-serif;padding:8px 14px;border-radius:999px;' +
        'box-shadow:0 8px 24px rgba(0,0,0,.35);opacity:0;transition:opacity .2s ease;pointer-events:none';
      doc.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.style.opacity = '0'; }, 1400);
  }

  function openArcade() {
    if (window.SaltArcade) return window.SaltArcade.open();
    var s = doc.createElement('script');
    s.src = arcadeSrc;
    s.onload = function () { if (window.SaltArcade) window.SaltArcade.open(); };
    s.onerror = function () { toast('Arcade failed to load'); };
    doc.head.appendChild(s);
  }
  window.openSaltArcade = openArcade;

  // 1. Arrow code
  var code = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight'];
  var pos = 0;
  doc.addEventListener('keydown', function (e) {
    if (doc.querySelector('.arc-overlay')) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    pos = e.key === code[pos] ? pos + 1 : (e.key === code[0] ? 1 : 0);
    if (pos === code.length) { pos = 0; toast('🕹️ Arcade unlocked!'); openArcade(); }
  });

  // 2. Logo x5
  var logo = doc.querySelector('.brand');
  if (logo) {
    var clicks = 0, timer = null;
    logo.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      clicks++;
      clearTimeout(timer);
      if (clicks >= 5) { clicks = 0; toast('🕹️ Arcade unlocked!'); openArcade(); return; }
      if (clicks >= 2) toast((5 - clicks) + ' more…');
      timer = setTimeout(function () {
        if (clicks === 1) {
          if (logo.target === '_blank') window.open(logo.href, '_blank', 'noopener'); else location.href = logo.href;
        }
        clicks = 0;
      }, 350);
    });
  }

  // 3. Buttons
  doc.querySelectorAll('[data-arcade]').forEach(function (b) {
    b.addEventListener('click', function (e) { e.preventDefault(); openArcade(); });
  });
})();
