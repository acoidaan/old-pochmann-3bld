// «Fridrich reducido»: the numbers. Pure functions over what the page keeps (solves with their splits and
// analysis, every training attempt, the crosses), for the «Progreso» view and the recommended set in
// «Entrenar». Nothing here touches the page. Exposes window.CfopStats.
(() => {
  'use strict';
  const C = window.Cfop;
  if (!C) return;

  // How often each case comes up in a real solve with 2-look OLL and PLL (what is left: a skip).
  const PROB = {
    l: 1 / 2, i: 1 / 4, dot: 1 / 8,                                                            // OLL 1 · skip 1/8
    sune: 4 / 27, antisune: 4 / 27, pi: 4 / 27, u: 4 / 27, t: 4 / 27, l2: 4 / 27, h: 2 / 27,  // OLL 2 · skip 1/27
    head: 2 / 3, diag: 1 / 6,                                                                  // PLL 1 · skip 1/6
    ua: 1 / 3, ub: 1 / 3, z: 1 / 6, ph: 1 / 12,                                                // PLL 2 · skip 1/12
  };
  const DAY = 86400000;
  const SUBS = [120, 90, 75, 60, 50, 45, 40, 35, 30, 27, 25, 22, 20, 18, 16, 15, 14, 13, 12, 11, 10];

  const value = (r) => (r.pen === 'dnf' ? Infinity : r.t + (r.pen === 2 ? 2000 : 0));
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  const mean = (xs) => (xs.length ? sum(xs) / xs.length : null);
  function quantile(xs, q) {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const p = (s.length - 1) * q;
    const lo = Math.floor(p);
    return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (p - lo);
  }
  // WCA-style: drop the best and the worst (5 % each side from 50 up); two DNFs make it DNF.
  function avgOf(list, n) {
    if (list.length < n) return null;
    const xs = list.slice(-n).map(value).sort((a, b) => a - b);
    const trim = n < 50 ? 1 : Math.ceil(n * 0.05);
    const mid = xs.slice(trim, n - trim);
    if (mid.some((x) => x === Infinity)) return Infinity;
    return mean(mid);
  }
  const finite = (x) => x != null && x !== Infinity;
  const dayStart = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const addDays = (ts, n) => { const d = new Date(ts); d.setDate(d.getDate() + n); return dayStart(d.getTime()); };
  function dayKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  // A smart-cube solve with every step timed.
  const full = (r) => r.sp && r.pen !== 'dnf' && Array.isArray(r.sp.s) && r.sp.s.length === 6 && r.sp.s.every(Boolean);
  // Training attempts that are attempts (a «me he perdido» after answering with a normal cube is its own line).
  const isRep = (e) => !(e.m === 'h' && e.x);

  // ================= The whole picture =================
  function summary(times, now = Date.now()) {
    const out = { n: times.length, dnf: 0, best: null, bestAo5: null, bestAo12: null, ao5: null, ao12: null, ao50: null, ao100: null, mean: null, prevAo12: null, week: null, prevWeek: null, then: null, first: times.length ? times[0].at : null };
    if (!times.length) return out;
    const ok = [];
    times.forEach((r, i) => {
      const v = value(r);
      if (v === Infinity) out.dnf++;
      else {
        ok.push(v);
        if (!out.best || v < out.best.v) out.best = { v, i, at: r.at };
      }
      if (i >= 4) { const a = avgOf(times.slice(0, i + 1), 5); if (finite(a) && (!out.bestAo5 || a < out.bestAo5.v)) out.bestAo5 = { v: a, i, at: r.at }; }
      if (i >= 11) { const a = avgOf(times.slice(0, i + 1), 12); if (finite(a) && (!out.bestAo12 || a < out.bestAo12.v)) out.bestAo12 = { v: a, i, at: r.at }; }
    });
    out.mean = mean(ok);
    out.ao5 = avgOf(times, 5);
    out.ao12 = avgOf(times, 12);
    out.ao50 = avgOf(times, 50);
    out.ao100 = avgOf(times, 100);
    // The ao12 of the twelve before the last twelve: is it going down?
    out.prevAo12 = times.length >= 24 ? avgOf(times.slice(0, -12), 12) : null;
    const span = (from, to) => {
      const rs = times.filter((r) => r.at >= from && r.at < to);
      const vs = rs.map(value).filter(finite);
      return { n: rs.length, mean: mean(vs), best: vs.length ? Math.min(...vs) : null };
    };
    const today = dayStart(now);
    out.week = span(addDays(today, -6), now + 1);
    out.prevWeek = span(addDays(today, -13), addDays(today, -6));
    // Where it was a month ago (the ao12 at the last solve before then), or at the start.
    let k = -1;
    for (let i = times.length - 1; i >= 0; i--) if (times[i].at < now - 30 * DAY) { k = i; break; }
    if (k >= 11) out.then = { v: avgOf(times.slice(0, k + 1), 12), at: times[k].at, month: true };
    else if (times.length >= 24) out.then = { v: avgOf(times.slice(0, 12), 12), at: times[11].at, month: false };
    return out;
  }

  // Each day with solves: how many, the mean (DNFs out) and the best.
  function daily(times) {
    const map = new Map();
    times.forEach((r) => {
      const k = dayKey(r.at);
      if (!map.has(k)) map.set(k, { key: k, ts: dayStart(r.at), n: 0, vs: [] });
      const d = map.get(k);
      d.n++;
      const v = value(r);
      if (finite(v)) d.vs.push(v);
    });
    return [...map.values()].sort((a, b) => a.ts - b.ts).map((d) => ({ key: d.key, ts: d.ts, n: d.n, mean: mean(d.vs), best: d.vs.length ? Math.min(...d.vs) : null }));
  }

  // Practice per day (solves, training, crosses) for a calendar of `weeks` weeks ending today, Monday first;
  // the streak of days in a row (today or yesterday counts) and the best one.
  function activity(times, trlog, crossTr, now = Date.now(), weeks = 18) {
    const per = new Map();
    const bump = (at, field, ms) => {
      const k = dayKey(at);
      if (!per.has(k)) per.set(k, { solves: 0, train: 0, cross: 0, ms: 0 });
      const d = per.get(k);
      d[field]++;
      d.ms += ms || 0;
    };
    times.forEach((r) => bump(r.at, 'solves', r.pen === 'dnf' ? r.t : value(r)));
    (trlog || []).filter(isRep).forEach((e) => bump(e.at, 'train', e.t || 0));
    (crossTr || []).forEach((x) => bump(x.at, 'cross', x.t || 0));
    const today = dayStart(now);
    const dow = (new Date(today).getDay() + 6) % 7;   // Monday 0
    const start = addDays(today, -dow - (weeks - 1) * 7);
    const cells = [];
    for (let t = start; t <= today; t = addDays(t, 1)) {
      const d = per.get(dayKey(t)) || { solves: 0, train: 0, cross: 0, ms: 0 };
      cells.push({ key: dayKey(t), ts: t, ...d, n: d.solves + d.train + d.cross });
    }
    const active = new Set([...per.keys()]);
    let streak = 0;
    let t = active.has(dayKey(today)) ? today : addDays(today, -1);
    while (active.has(dayKey(t))) { streak++; t = addDays(t, -1); }
    // The best streak: walk the active days in order.
    const days = [...per.keys()].sort();
    let best = 0; let run = 0; let prev = null;
    days.forEach((k) => {
      const ts = dayStart(new Date(`${k}T12:00:00`).getTime());
      run = prev != null && addDays(prev, 1) === ts ? run + 1 : 1;
      best = Math.max(best, run);
      prev = ts;
    });
    const last30 = cells.filter((c) => c.ts > addDays(today, -30) && c.n).length;
    const ms = sum([...per.values()].map((d) => d.ms));
    return { cells, streak, bestStreak: best, active30: last30, days: per.size, ms };
  }

  // The first time under each round number, for singles, ao5 and ao12; and the next one to go for.
  function milestones(times) {
    const done = [];
    const next = [];
    const kinds = [['single', 1], ['ao5', 5], ['ao12', 12]];
    kinds.forEach(([kind, n]) => {
      let best = Infinity;
      const reached = new Set();
      times.forEach((r, i) => {
        const v = n === 1 ? value(r) : i >= n - 1 ? avgOf(times.slice(0, i + 1), n) : null;
        if (!finite(v)) return;
        best = Math.min(best, v);
        SUBS.forEach((s) => {
          if (v < s * 1000 && !reached.has(s)) { reached.add(s); done.push({ kind, sub: s, i, at: r.at, v }); }
        });
      });
      if (best === Infinity) return;
      const target = SUBS.find((s) => s * 1000 < best);
      if (target) next.push({ kind, sub: target, gap: best - target * 1000, best });
    });
    // Only the tightest per kind and day matters: keep the best mark reached each time.
    const tight = done.filter((x) => !done.some((y) => y.kind === x.kind && y.i === x.i && y.sub < x.sub));
    return { done: tight.sort((a, b) => b.at - a.at || a.sub - b.sub), next };
  }

  // ================= Steps =================
  const GROUPS = [['cross', 'Cruz', [0]], ['f2l', 'F2L', [1]], ['oll', 'OLL', [2, 3]], ['pll', 'PLL', [4, 5]]];
  function stepSeries(times) {
    return times.map((r, i) => ({ r, i })).filter(({ r }) => full(r)).map(({ r, i }) => {
      const s = r.sp.s;
      const o = { i, at: r.at, t: value(r), moves: sum(s.map((x) => x[1] || 0)) };
      GROUPS.forEach(([id, , idx]) => {
        o[id] = sum(idx.map((k) => s[k][0]));
        o[`${id}Rec`] = sum(idx.map((k) => s[k][2] || 0));
        o[`${id}Moves`] = sum(idx.map((k) => s[k][1] || 0));
      });
      o.tps = o.moves / (o.t / 1000);
      return o;
    });
  }
  // Each step now (last 12 smart-cube solves) against before (the 12 before those).
  function steps(times) {
    const ser = stepSeries(times);
    const recent = ser.slice(-12);
    const before = ser.length >= 24 ? ser.slice(-24, -12) : ser.length >= 16 ? ser.slice(0, ser.length - 12) : [];
    const total = mean(recent.map((x) => x.t)) || 1;
    const groups = GROUPS.map(([id, name]) => ({
      id, name,
      now: mean(recent.map((x) => x[id])),
      before: before.length ? mean(before.map((x) => x[id])) : null,
      rec: id === 'oll' || id === 'pll' ? mean(recent.map((x) => x[`${id}Rec`])) : null,
      moves: mean(recent.map((x) => x[`${id}Moves`])),
      share: mean(recent.map((x) => x[id])) / total,
      series: ser.map((x) => ({ i: x.i, v: x[id] })),
    }));
    return { n: ser.length, recent: recent.length, groups, tps: mean(recent.map((x) => x.tps)), tpsBefore: before.length ? mean(before.map((x) => x.tps)) : null, series: ser };
  }

  // ================= How good the solves were (from each solve's analysis) =================
  function effOf(r) {
    const a = r.an;
    const pairs = a.p.filter((x) => x[2] != null);
    const llDone = a.l.filter((x) => Array.isArray(x));
    return {
      i: null, at: r.at,
      eff: a.m ? a.i / a.m : 1,
      moves: a.m, ideal: a.i,
      crossExtra: Math.max(0, a.c[0] - a.c[1]),
      pairExtra: sum(pairs.map((x) => Math.max(0, x[1] - x[2]))),
      pairs: pairs.length,
      pairsOptimal: pairs.filter((x) => x[1] <= x[2]).length,
      easiest: a.p.filter((x) => x[3] >= 0 && x[4] != null && x[2] != null && (x[0].includes(String(x[3])) || x[4] >= x[2])).length,
      f2lStop: sum(a.p.map((x) => (x[7] || 0) + ((x[5] || 0) >= 1000 ? x[5] : 0))),
      llExtra: sum(llDone.map((x) => Math.max(0, x[0] - x[1]))),
      pause: a.z || 0,
    };
  }
  function efficiency(times) {
    const list = times.map((r, i) => ({ r, i })).filter(({ r }) => r.an && r.an.m && r.pen !== 'dnf' && full(r)).map(({ r, i }) => ({ ...effOf(r), i }));
    const recent = list.slice(-12);
    const before = list.length >= 24 ? list.slice(-24, -12) : [];
    const avg = (xs, f) => (xs.length ? mean(xs.map(f)) : null);
    const pack = (xs) => (xs.length ? {
      eff: avg(xs, (x) => x.eff), moves: avg(xs, (x) => x.moves), ideal: avg(xs, (x) => x.ideal),
      crossExtra: avg(xs, (x) => x.crossExtra), pairExtra: avg(xs, (x) => x.pairExtra),
      perPair: sum(xs.map((x) => x.pairExtra)) / Math.max(1, sum(xs.map((x) => x.pairs))),
      pairsOptimal: sum(xs.map((x) => x.pairsOptimal)) / Math.max(1, sum(xs.map((x) => x.pairs))),
      easiest: sum(xs.map((x) => x.easiest)) / Math.max(1, sum(xs.map((x) => x.pairs))),
      f2lStop: avg(xs, (x) => x.f2lStop), llExtra: avg(xs, (x) => x.llExtra),
    } : null);
    return { n: list.length, list, now: pack(recent), before: pack(before) };
  }

  // ================= Each case =================
  const STEP_INDEX = { oll1: 2, oll2: 3, pll1: 4, pll2: 5 };
  function caseStats(times, train, trlog, learn, now = Date.now()) {
    const solves = times.filter(full).slice(-200);
    const log = trlog || [];
    const out = {};
    C.CASES.forEach((c) => {
      const k = STEP_INDEX[c.step];
      const seen = [];
      solves.forEach((r) => {
        const s = r.sp.s[k];
        if (!s || s[4] || s[3] !== c.id) return;
        const an = r.an && Array.isArray(r.an.l[k - 2]) ? r.an.l[k - 2] : null;
        seen.push({ at: r.at, t: s[0], r: s[2], moves: s[1], extra: an ? Math.max(0, an[0] - an[1]) : null });
      });
      const mine = log.filter((e) => e.id === c.id);
      const cube = mine.filter((e) => e.m === 'c' && e.ok && e.t != null && !e.a);   // not with the algorithm in view
      const quiz = mine.filter((e) => e.m === 'q');
      const hand = mine.filter((e) => e.m === 'h' && !e.x);
      const t = (train && train[c.id]) || {};
      const lost = (t.fail || 0) + (t.mfail || 0);
      const recentSeen = seen.slice(-15);
      const recentCube = cube.slice(-15);
      // Recognising and doing it: in real solves when there are some, else in training.
      const fromSolves = recentSeen.length >= 2;
      const rec = fromSolves ? mean(recentSeen.map((x) => x.r || 0))
        : recentCube.length ? mean(recentCube.map((x) => x.r || 0)) : t.n ? t.rsum / t.n : null;
      const exec = fromSolves ? mean(recentSeen.map((x) => x.t - (x.r || 0)))
        : recentCube.length ? mean(recentCube.map((x) => x.t - (x.r || 0))) : t.n ? (t.sum - (t.rsum || 0)) / t.n : null;
      const lastQuiz = quiz.slice(-12);
      const quizN = t.qn || quiz.length;
      const quizAcc = lastQuiz.length >= 3 ? mean(lastQuiz.map((e) => (e.ok ? 1 : 0))) : quizN ? (t.qok || 0) / quizN : null;
      const quizTime = lastQuiz.length ? mean(lastQuiz.map((e) => e.t || 0)) : quizN && t.qsum ? t.qsum / quizN : null;
      const handN = t.mn || hand.length;
      const handAcc = handN ? (t.mok || 0) / handN : null;
      const attempts = (t.n || 0) + handN + (t.fail || 0);
      const extras = recentSeen.map((x) => x.extra).filter((x) => x != null);
      const lastAt = Math.max(0, ...seen.map((x) => x.at), ...mine.map((e) => e.at));
      // Trend in training with the smart cube: the last five against the five before.
      const trend = cube.length >= 10 ? mean(cube.slice(-5).map((e) => e.t)) - mean(cube.slice(-10, -5).map((e) => e.t)) : null;
      out[c.id] = {
        id: c.id, step: c.step, prob: PROB[c.id], moves: C.algHtm(c.alg), status: (learn && learn[c.id]) || 'new',
        seen: seen.length, seenRecent: recentSeen.length, rec, exec, fromSolves,
        solveRec: recentSeen.length ? mean(recentSeen.map((x) => x.r || 0)) : null,
        solveExec: recentSeen.length ? mean(recentSeen.map((x) => x.t - (x.r || 0))) : null,
        cubeAvg: t.n ? t.sum / t.n : null,
        tps: exec ? C.algHtm(c.alg) / (exec / 1000) : null,
        reps: (t.n || 0) + (t.an || 0) + quizN + handN, cubeN: t.n || 0, best: t.best != null ? t.best : null,
        quizN, quizAcc, quizTime, handN, handAcc, lost, lostRate: attempts ? lost / attempts : 0,
        extra: extras.length ? mean(extras) : null,
        lastAt: lastAt || null, days: lastAt ? Math.floor((now - lastAt) / DAY) : null, trend,
        practiced: !!(seen.length || quizN || handN || t.n || t.an || lost),
      };
    });
    return out;
  }

  // ================= What to work on =================
  // Where the time goes, in seconds per solve, from the last smart-cube solves (with their analysis); and the
  // set of cases that would win most, with why. Seconds are estimates: each part against your own good level
  // (your quicker cases, your pace) — not against a world record.
  function recommend({ times, train, trlog, learn, crossTr, now = Date.now(), size = 5 }) {
    const cs = caseStats(times, train, trlog, learn, now);
    const all = Object.values(cs);
    const withTime = all.filter((x) => x.rec != null && x.exec != null && x.exec > 0);
    const refRec = Math.max(300, quantile(withTime.map((x) => x.rec), 0.25) || 900);
    const refTps = Math.min(9, quantile(withTime.map((x) => x.tps), 0.75) || 3);
    const msPerMoveLL = 1000 / refTps;

    // ---- Each case: what it costs per solve, and why.
    const scored = all.map((x) => {
      const c = C.caseById(x.id);
      const parts = [];
      let mode = 'cube';
      if (!x.practiced) {
        const known = x.status === 'known';
        parts.push({ ms: x.prob * (known ? 250 : 2500), why: known ? 'Te lo sabes, pero aún no lo he visto: un repaso' : 'Aún no lo has practicado', kind: 'learn' });
        mode = known ? 'cube' : 'learn';
      } else {
        if (x.rec != null) {
          const ms = Math.max(0, x.rec - refRec) * x.prob;
          if (ms > 0) parts.push({ ms, why: `Tardas ${(x.rec / 1000).toFixed(1)} s en reconocerlo (en tus casos rápidos, ${(refRec / 1000).toFixed(1)} s)`, kind: 'look' });
        }
        if (x.exec != null && x.exec > 0) {
          const ideal = x.moves * msPerMoveLL;
          const ms = Math.max(0, x.exec - ideal) * x.prob;
          if (ms > 0) parts.push({ ms, why: `Lo haces en ${(x.exec / 1000).toFixed(1)} s (${x.tps.toFixed(1)} giros/s; en tus mejores, ${refTps.toFixed(1)})`, kind: 'exec' });
        }
        if (x.quizAcc != null && x.quizAcc < 1 && x.quizN >= 3) {
          parts.push({ ms: x.prob * (1 - x.quizAcc) * 1500, why: `Al reconocerlo fallas ${Math.round((1 - x.quizAcc) * 100)} %`, kind: 'look' });
        }
        if (x.handAcc != null && x.handAcc < 1 && x.handN >= 3) {
          parts.push({ ms: x.prob * (1 - x.handAcc) * 1500, why: `Con tu cubo aciertas ${Math.round(x.handAcc * 100)} % al reconocerlo`, kind: 'look' });
        }
        if (x.lost) parts.push({ ms: x.prob * x.lostRate * 4000, why: `Te perdiste ${x.lost} ${x.lost === 1 ? 'vez' : 'veces'} al hacerlo`, kind: 'exec' });
        if (x.extra != null && x.extra >= 2) parts.push({ ms: x.prob * x.extra * msPerMoveLL, why: `En tus solves, ${x.extra.toFixed(1)} giros de más de media`, kind: 'exec' });
        if (x.status === 'learning') parts.push({ ms: x.prob * 150, why: 'Lo estás aprendiendo', kind: 'learn' });
        if (x.days != null && x.days >= 10 && x.status !== 'new') parts.push({ ms: x.prob * 120, why: `Hace ${x.days} días que no lo haces`, kind: 'review' });
        const look = sum(parts.filter((p) => p.kind === 'look').map((p) => p.ms));
        const exec = sum(parts.filter((p) => p.kind === 'exec').map((p) => p.ms));
        mode = look > exec ? 'look' : 'cube';
      }
      const ms = sum(parts.map((p) => p.ms));
      const why = [...parts].sort((a, b) => b.ms - a.ms).map((p) => p.why);
      if (x.prob >= 0.3) why.push(`Sale mucho: en ${Math.round(x.prob * 100)} de cada 100 solves`);
      return { id: x.id, c, ms, why: why.slice(0, 3), mode, stats: x };
    }).sort((a, b) => b.ms - a.ms);
    const set = scored.filter((x) => x.ms >= 15).slice(0, size);
    // Nothing worth much: a review of the ones least done, the commonest first.
    if (set.length < 3) {
      scored.filter((x) => !set.includes(x)).sort((a, b) => (a.stats.reps + a.stats.seen) - (b.stats.reps + b.stats.seen) || b.stats.prob - a.stats.prob)
        .slice(0, 3 - set.length).forEach((x) => set.push({ ...x, why: x.why.length ? x.why : ['Un repaso: es de los que menos has hecho'] }));
    }
    const modes = set.map((x) => x.mode);
    const setMode = modes.filter((m) => m === 'learn').length > set.length / 2 ? 'learn' : modes.filter((m) => m === 'look').length > set.length / 2 ? 'look' : 'cube';

    // ---- The steps: seconds per solve you could win.
    const ser = stepSeries(times).slice(-15);
    const effs = efficiency(times).list.slice(-15);
    const parts = [];
    if (ser.length) {
      // Your F2L pace while turning: its time without the stops, per turn.
      const stopAt = new Map(effs.map((x) => [x.i, x.f2lStop]));
      const f2lPace = mean(ser.map((x) => (x.f2lMoves ? Math.max(x.f2l * 0.3, x.f2l - (stopAt.get(x.i) || 0)) / x.f2lMoves : null)).filter((x) => x));
      if (effs.length) {
        const stop = mean(effs.map((x) => x.f2lStop));
        if (stop >= 300) parts.push({ id: 'f2lStop', ms: stop, name: 'Pararte en el F2L', how: 'Busca la siguiente pareja mientras metes la anterior. Unos solves lentos pero sin parar en «Practicar sin crono».', go: 'slow' });
        const extra = mean(effs.map((x) => x.pairExtra));
        if (extra >= 1 && f2lPace) parts.push({ id: 'f2lExtra', ms: extra * f2lPace, name: 'Giros de más en las parejas', how: `${extra.toFixed(1)} giros de más por solve. Con la ayuda en directo, mira la forma más corta de cada pareja y cuál es la más fácil.`, go: 'slow' });
        const cross = mean(effs.map((x) => x.crossExtra));
        const crossPace = mean(ser.map((x) => (x.crossMoves ? x.cross / x.crossMoves : null)).filter((x) => x));
        if (cross >= 0.5 && crossPace) parts.push({ id: 'cross', ms: cross * crossPace, name: 'Cruz más larga de la cuenta', how: `${cross.toFixed(1)} giros de más de media. Planéala entera en la inspección: «Entrenar la cruz».`, go: 'cross' });
        const ll = mean(effs.map((x) => x.llExtra));
        if (ll >= 1.5) parts.push({ id: 'llExtra', ms: ll * msPerMoveLL, name: 'Giros de U de más en OLL y PLL', how: 'Mira desde qué lado empezar cada algoritmo para no girar arriba de más: la ayuda en directo te lo dice.', go: 'help' });
      }
      const recLoss = mean(ser.map((x) => [2, 3, 4, 5].map((k) => {
        const r = times[x.i].sp.s[k];
        return r && !r[4] ? Math.max(0, (r[2] || 0) - refRec) : 0;
      }).reduce((a, b) => a + b, 0)));
      if (recLoss >= 300) parts.push({ id: 'look', ms: recLoss, name: 'Reconocer OLL y PLL', how: 'Entrena el set de abajo en «Reconocer»: verlo desde cualquier lado y saber cuál es al momento.', go: 'set-look' });
      const execLoss = sum(scored.filter((x) => x.stats.fromSolves && x.stats.exec).map((x) => Math.max(0, x.stats.exec - x.stats.moves * msPerMoveLL) * x.stats.prob));
      if (execLoss >= 300) parts.push({ id: 'exec', ms: execLoss, name: 'Algoritmos lentos', how: 'Repite los del set con el cubo hasta que salgan de seguido, sin pensar.', go: 'set-cube' });
    }
    // Crosses in the trainer, when there are no solves to look at.
    const ct = (crossTr || []).slice(-20);
    const ctExtra = ct.length >= 5 ? mean(ct.map((x) => x.n - x.opt)) : null;
    parts.sort((a, b) => b.ms - a.ms);
    return { set, setMode, parts, cases: cs, scored, refRec, refTps, solves: ser.length, ctExtra };
  }

  // Training per mode, overall and the last 7 days.
  function training(train, trlog, now = Date.now()) {
    const tot = { cube: 0, cubeMs: 0, cubeRec: 0, quiz: 0, quizOk: 0, quizMs: 0, hand: 0, handOk: 0, lost: 0 };
    Object.values(train || {}).forEach((t) => {
      tot.cube += t.n || 0; tot.cubeMs += t.sum || 0; tot.cubeRec += t.rsum || 0;
      tot.quiz += t.qn || 0; tot.quizOk += t.qok || 0; tot.quizMs += t.qsum || 0;
      tot.hand += t.mn || 0; tot.handOk += t.mok || 0; tot.lost += (t.fail || 0) + (t.mfail || 0);
    });
    const week = (trlog || []).filter((e) => e.at > now - 7 * DAY);
    return {
      ...tot,
      week: week.filter(isRep).length,
      weekOk: week.filter((e) => isRep(e) && e.ok).length,
      weekLost: week.filter((e) => e.x).length,
      days: new Set(week.map((e) => dayKey(e.at))).size,
    };
  }

  window.CfopStats = { PROB, SUBS, value, avgOf, mean, quantile, dayKey, dayStart, summary, daily, activity, milestones, stepSeries, steps, efficiency, caseStats, recommend, training, GROUPS };
})();
