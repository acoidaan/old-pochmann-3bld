// A floating «Conectar cubo» button on every view, so the smart cube can be connected without going to the
// timer. It presses the page's own #cubeConnect and mirrors the cube bar's state (#cubeDot data-s). Hidden
// while the cube bar itself is on screen and in competition mode.
(() => {
  'use strict';
  const bar = document.getElementById('cubeBar');
  const dot = document.getElementById('cubeDot');
  const btn = document.getElementById('cubeConnect');
  if (!bar || !dot || !btn) return;
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'cube-fab';
  fab.hidden = true;
  fab.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 7l10 10-5 5V2l5 5L7 17"/></svg><span></span>';
  document.body.appendChild(fab);
  let barOnScreen = false;
  const render = () => {
    const s = dot.dataset.s || 'off';
    fab.dataset.s = s;
    fab.querySelector('span').textContent = s === 'on' ? 'Cubo conectado' : s === 'off' ? 'Conectar cubo' : 'Conectando…';
    fab.disabled = s !== 'off';
    // Connected: only a short while, as a confirmation; not connected: always (except next to the bar).
    fab.hidden = barOnScreen || document.body.classList.contains('focus') || s === 'on';
    // Above a tab bar fixed at the bottom (phones).
    let lift = 0;
    document.querySelectorAll('nav').forEach((n) => {
      const cs = getComputedStyle(n);
      if (cs.position === 'fixed' && cs.display !== 'none') { const r = n.getBoundingClientRect(); if (r.bottom >= innerHeight - 2) lift = Math.max(lift, r.height); }
    });
    fab.style.bottom = lift ? `${Math.round(lift) + 12}px` : '';
    tip.style.bottom = `${(lift ? Math.round(lift) + 12 : 16) + 60}px`;
  };
  addEventListener('resize', render);
  fab.addEventListener('click', () => { if ((dot.dataset.s || 'off') === 'off') btn.click(); });
  // The cube bar's messages (Bluetooth off, no cube found…) would be out of sight: shown next to the button.
  const msg = document.getElementById('cubeMsg');
  const tip = document.createElement('div');
  tip.className = 'cube-fab-tip';
  tip.hidden = true;
  tip.setAttribute('role', 'status');
  document.body.appendChild(tip);
  let tipTimer = 0;
  if (msg) {
    new MutationObserver(() => {
      const t = msg.innerText.trim();
      tip.hidden = !t || barOnScreen;
      tip.textContent = t;
      clearTimeout(tipTimer);
      if (t) tipTimer = setTimeout(() => { tip.hidden = true; }, 9000);
    }).observe(msg, { childList: true, subtree: true, characterData: true });
  }
  tip.addEventListener('click', () => { tip.hidden = true; });
  new MutationObserver(render).observe(dot, { attributes: true, attributeFilter: ['data-s'] });
  new MutationObserver(render).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => { barOnScreen = es.some((e) => e.isIntersecting); render(); }).observe(bar);
  }
  render();
})();
