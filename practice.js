// Real practice time on the Fridrich page, besides the timed one: the time from one action to the next (a turn
// of the smart cube, a key, a tap) while they come less than 2 minutes apart, so scrambling, inspecting and
// thinking count and a break does not. Added up by day and kept per device, so that devices merge without
// counting anything twice. Exposes window.Practice; it touches no page element.
//
//   Practice.bump()   Practice.days() → { 'YYYY-MM-DD': ms }   Practice.data() / Practice.merge(remote)
(() => {
  'use strict';
  const KEY = 'cfop:practice:v1';   // { [device]: { 'YYYY-MM-DD': ms } }
  const DEV_KEY = 'cfop:device:v1';
  const GAP = 120000;
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* this visit only */ } };
  const clean = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});

  let dev = load(DEV_KEY, null);
  if (typeof dev !== 'string' || !dev) { dev = Math.random().toString(36).slice(2, 10); save(DEV_KEY, dev); }
  let data = clean(load(KEY, {}));
  let last = 0;
  let dirty = false;
  const dayKey = (t) => {
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  function bump() {
    const t = Date.now();
    if (last && t > last && t - last < GAP) {
      const mine = clean(data[dev]);
      const k = dayKey(t);
      mine[k] = (mine[k] || 0) + (t - last);
      data[dev] = mine;
      dirty = true;
    }
    last = t;
  }
  // Another tab of this device may have saved meanwhile: keep the larger count of each day.
  function flush() {
    if (!dirty) return;
    dirty = false;
    const kept = clean(load(KEY, {}));
    const mine = clean(data[dev]);
    const theirs = clean(kept[dev]);
    Object.keys(theirs).forEach((k) => { if ((theirs[k] || 0) > (mine[k] || 0)) mine[k] = theirs[k]; });
    kept[dev] = mine;
    data = kept;
    save(KEY, data);
  }
  function days() {
    const out = {};
    Object.values(data).forEach((byDay) => Object.entries(clean(byDay)).forEach(([k, ms]) => {
      if (Number.isFinite(ms) && ms > 0) out[k] = (out[k] || 0) + ms;
    }));
    return out;
  }
  // From another device, through the sync: each device's own days, the larger count of each.
  function merge(remote) {
    let changed = false;
    Object.entries(clean(remote)).forEach(([d, byDay]) => {
      const mine = clean(data[d]);
      Object.entries(clean(byDay)).forEach(([k, ms]) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(ms) && ms > (mine[k] || 0)) { mine[k] = ms; changed = true; }
      });
      data[d] = mine;
    });
    if (changed) { dirty = true; flush(); }
    return changed;
  }

  ['keydown', 'pointerdown'].forEach((t) => document.addEventListener(t, bump, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => { if (document.hidden) { flush(); last = 0; } });
  window.addEventListener('pagehide', flush);
  setInterval(flush, 15000);

  window.Practice = { bump, days, data: () => { flush(); return data; }, merge, GAP };
})();
