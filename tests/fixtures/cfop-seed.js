// A made-up but realistic CFOP history for the stats tests: 90 solves over 45 days getting faster (about
// 62 s → 41 s), the later ones with the smart cube (splits and analysis), training attempts and crosses.
// On purpose: Ub is slow to recognise, Pi is slow to do, Diagonal gets lost, Z is mixed up when
// recognising, and H (PLL) was never practised. Deterministic (seeded), so the tests can count.
const CASES = {
  oll1: [['l', 0.5], ['i', 0.25], ['dot', 0.125]],
  oll2: [['sune', 4], ['antisune', 4], ['pi', 4], ['u', 4], ['t', 4], ['l2', 4], ['h', 2]],
  pll1: [['head', 4], ['diag', 1]],
  pll2: [['ua', 4], ['ub', 4], ['z', 2], ['ph', 1]],
};
const MOVES = { l: 6, i: 6, dot: 12, sune: 7, antisune: 7, pi: 9, u: 9, t: 8, l2: 8, h: 11, head: 14, diag: 17, ua: 11, ub: 11, z: 12, ph: 10 };
// How slow each case is for this made-up cuber: [recognise ms, ms per turn].
const SLOW = { ub: [2600, 330], pi: [1100, 620], diag: [1300, 400], z: [1500, 380] };

function seed(now = Date.UTC(2026, 9, 20, 18, 0, 0)) {
  let x = 12345;
  const rnd = () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; };
  const pick = (list) => {
    const total = list.reduce((a, [, w]) => a + w, 0);
    let r = rnd() * total;
    for (const [id, w] of list) { r -= w; if (r <= 0) return id; }
    return list[list.length - 1][0];
  };
  const DAY = 86400000;
  const times = [];
  for (let k = 0; k < 90; k++) {
    const day = 44 - Math.floor(k / 2);           // two solves a day, the last two today
    const at = now - day * DAY - (k % 2 ? 0 : 3600000) - 20 * 60000;
    const progress = k / 89;
    const t = Math.round(62000 - progress * 21000 + (rnd() - 0.5) * 6000);
    const r = { t, at, pen: 0, scr: "R U R' U'" };
    if (k === 30) r.pen = 'dnf';
    if (k === 50) r.pen = 2;
    if (k >= 40) {
      // Splits: cross, F2L, then each last-layer step with its case.
      const cross = Math.round(t * 0.11); const f2l = Math.round(t * 0.5);
      const ll = t - cross - f2l;
      const steps = ['oll1', 'oll2', 'pll1', 'pll2'];
      const ids = steps.map((s) => pick(CASES[s]));
      const raw = ids.map((id) => {
        const [rec, per] = SLOW[id] || [800, 330];
        return rec + MOVES[id] * per;
      });
      const scale = ll / raw.reduce((a, b) => a + b, 0);
      const s = [[cross, 6, null, null, 0], [f2l, 30, null, null, 0]];
      ids.forEach((id, j) => {
        const [rec] = SLOW[id] || [800, 330];
        const time = Math.round(raw[j] * scale);
        s.push([time, MOVES[id], Math.min(time - 200, Math.round(rec * scale)), id, 0]);
      });
      r.sp = { f: 'U', s };
      r.an = {
        c: [6, 5],
        p: [['0', 9, 7, 0, 7, 400, 0, 0, 3000], ['1', 8, 6, 2, 5, 1600, 1, 1200, 3000], ['2', 7, 7, 2, 7, 300, 0, 0, 2500], ['3', 8, 8, 3, 8, 300, 0, 0, 2500]],
        l: ids.map((id) => [MOVES[id] + (id === 'z' ? 4 : 0), MOVES[id], 0, 0]),
        z: 1200, m: 6 + 32 + ids.reduce((a, id) => a + MOVES[id] + (id === 'z' ? 4 : 0), 0), i: 5 + 28 + ids.reduce((a, id) => a + MOVES[id], 0),
      };
    }
    times.push(r);
  }
  // Training in the last 10 days.
  const trlog = [];
  const train = {};
  const add = (e) => {
    trlog.push(e);
    const t = train[e.id] || (train[e.id] = {});
    if (e.m === 'c' && e.ok) { t.n = (t.n || 0) + 1; t.sum = (t.sum || 0) + e.t; t.rsum = (t.rsum || 0) + e.r; t.best = Math.min(t.best == null ? Infinity : t.best, e.t); }
    if (e.m === 'c' && e.x) t.fail = (t.fail || 0) + 1;
    if (e.m === 'q') { t.qn = (t.qn || 0) + 1; t.qok = (t.qok || 0) + e.ok; t.qsum = (t.qsum || 0) + e.t; }
    if (e.m === 'h' && !e.x) { t.mn = (t.mn || 0) + 1; t.mok = (t.mok || 0) + e.ok; }
  };
  for (let d = 9; d >= 0; d--) {
    const base = now - d * DAY - 2 * 3600000;
    let k = 0;
    ['ua', 'sune', 'head', 'diag', 'z', 'ub', 't'].forEach((id) => {
      const at = base + (k++) * 60000;
      if (id === 'diag' && d % 3 === 0) add({ at, id, m: 'c', ok: 0, x: 1 });
      else {
        const [rec, per] = SLOW[id] || [700, 300];
        add({ at, id, m: 'c', ok: 1, t: rec + MOVES[id] * per, r: rec });
      }
      add({ at: at + 20000, id, m: 'q', ok: id === 'z' && d % 2 === 0 ? 0 : 1, t: id === 'ub' ? 2400 : 900 });
    });
  }
  const crossTr = [];
  for (let k = 0; k < 12; k++) crossTr.push({ at: now - (11 - k) * DAY - 5 * 3600000, opt: 6, n: 8 - Math.floor(k / 5), t: 4200 - k * 150 });
  const learn = { l: 'known', i: 'known', dot: 'known', sune: 'known', antisune: 'known', ua: 'known', ub: 'learning', z: 'learning', pi: 'learning' };
  return { times, trlog, train, crossTr, learn, now };
}

module.exports = { seed };
