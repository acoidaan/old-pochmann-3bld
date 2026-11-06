// The screen kept on while the app is open, on any view and on the three pages (op3bld:awake:v1, on unless
// you turn it off in «Ajustes»). Its own lock, apart from the ones the pages take during an attempt; the
// browser drops it when the page is hidden, so it is taken again on return. A checkbox #awakeSet, where the
// page has one, turns it on and off.
(() => {
  'use strict';
  const KEY = 'op3bld:awake:v1';
  const on = () => { try { return localStorage.getItem(KEY) !== '0'; } catch (e) { return true; } };
  let lock = null;
  let asking = false;
  function take() {
    if (!on() || lock || asking || !navigator.wakeLock || document.visibilityState !== 'visible') return;
    asking = true;
    try {
      navigator.wakeLock.request('screen').then((l) => {
        asking = false;
        if (!on()) { l.release().catch(() => {}); return; }
        lock = l;
        l.addEventListener('release', () => { if (lock === l) lock = null; });
      }).catch(() => { asking = false; });
    } catch (e) { asking = false; }
  }
  function drop() {
    const l = lock;
    lock = null;
    try { if (l) l.release(); } catch (e) { /* already released */ }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') take(); });
  // Some browsers only grant it after a touch or a key.
  ['pointerdown', 'keydown'].forEach((t) => document.addEventListener(t, take, { passive: true }));
  window.addEventListener('storage', (e) => { if (e.key === KEY) { if (on()) take(); else drop(); sync(); } });
  const box = document.getElementById('awakeSet');
  function sync() { if (box) box.checked = on(); }
  if (box) {
    sync();
    box.addEventListener('change', () => {
      try { localStorage.setItem(KEY, box.checked ? '1' : '0'); } catch (e) { /* this visit */ }
      if (box.checked) take(); else drop();
    });
  }
  take();
  window.KeepAwake = { on, held: () => !!lock };
})();
