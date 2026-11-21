// The sections of the app, the same menu in every page (in the header): A ciegas (3BLD), CFOP and
// Principiante. CFOP is one section with two levels for the last layer, 2 looks (/fridrich) and complete
// (/cfop): its link goes to the one used last, and in CFOP the level is a switch next to the menu. This only
// opens and closes the menu, marks where you are and remembers the level; the links are plain links, so with
// the smart cube connected smartcube.js still opens the other section over this one.
(() => {
  'use strict';
  const KEY = 'cfop:level:v1';
  const html = document.documentElement;
  const here = html.dataset.section;
  const full = html.dataset.cfop === 'full';
  let level = 'fridrich';
  try {
    if (here === 'cfop') localStorage.setItem(KEY, full ? 'cfop' : 'fridrich');
    level = localStorage.getItem(KEY) === 'cfop' ? 'cfop' : 'fridrich';
  } catch (e) { /* storage unavailable: 2 looks */ }

  document.querySelectorAll('.sx').forEach((nav) => {
    const btn = nav.querySelector('.sx-btn');
    const menu = nav.querySelector('.sx-menu');
    nav.querySelectorAll('a[data-sx]').forEach((a) => {
      if (a.dataset.sx === 'cfop') a.setAttribute('href', level);
      if (a.dataset.sx === here) a.setAttribute('aria-current', 'page');
    });
    const show = (on) => {
      menu.hidden = !on;
      btn.setAttribute('aria-expanded', String(on));
      // Kept on screen: from the button's left, or moved in when that would go past the right edge.
      menu.style.left = '';
      if (on) {
        const r = menu.getBoundingClientRect();
        const over = r.right - (document.documentElement.clientWidth - 12);
        if (over > 0) menu.style.left = `${-over}px`;
      }
    };
    btn.addEventListener('click', () => show(menu.hidden));
    document.addEventListener('click', (ev) => { if (!menu.hidden && !nav.contains(ev.target)) show(false); });
    nav.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !menu.hidden) { show(false); btn.focus(); } });
  });
  document.querySelectorAll('.sx-level a').forEach((a) => {
    if ((a.dataset.lv === 'full') === full) a.setAttribute('aria-current', 'page');
  });
})();
