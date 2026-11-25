// The WCA plan (Roadmap WCA 2027) without the page: the six events with their phase, method and goals; the
// times, rounds and learning of the four event pages (2×2, 4×4, Pyraminx, Square-1); the plan's own data (the
// competition, the week's sessions, the checklist of the last weeks); how each event is going (reading what
// CFOP and 3BLD keep too); and what travels between devices (one document for all of it). It reads and writes
// localStorage, never the page. Exposes window.EvData.
(() => {
  'use strict';
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* this visit only */ } };
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  const DAY = 86400000;
  const NEW = ['222', '444', 'pyram', 'sq1'];
  const K = {
    times: (ev) => `ev:${ev}:times:v1`, known: 'ev:known:v1', train: 'ev:train:v1', solo: 'ev:solo:v1', deleted: 'ev:deleted:v1',
    settings: 'ev:settings:v1', plan: 'plan:v1', sync: 'op3bld:sync:v1', synced: 'ev:synced:v1', theme: 'op3bld:theme:v1',
  };
  const PRACTICE = { cfop: 'cfop', bld: 'op3bld', 222: 'ev222', 444: 'ev444', pyram: 'evpyram', sq1: 'evsq1' };

  // ================= The roadmap =================
  const EVENTS = [
    {
      id: '333', name: '3×3', sx: 'cfop', href: 'fridrich', phase: 'Base · ahora', start: null,
      method: 'CFOP: F2L fluido, cruz planificada, PLL completo; OLL progresivo',
      goals: [{ kind: 'ao12', target: 35000, text: 'Ao12 sub-35 s' }, { kind: 'avg', target: 30000, text: 'Media sub-30 s' }],
    },
    {
      id: '222', name: '2×2', sx: '222', href: '2x2', phase: '1 · dic 2026', start: '2026-12-01',
      method: 'Ortega: cara, OLL y PBL; después CLL si te interesa',
      goals: [{ kind: 'solo', text: 'Resolver sin ayuda' }, { kind: 'avg', target: 10000, text: 'Media sub-10 s' }],
    },
    {
      id: '444', name: '4×4', sx: '444', href: '4x4', phase: '2 · ene 2027', start: '2027-01-01',
      method: 'Reducción: centros, aristas, paridades; después Yau',
      goals: [{ kind: 'solo', text: 'Resolver con paridades' }, { kind: 'avg', target: 150000, text: 'Media sub-2:30' }],
    },
    {
      id: 'pyram', name: 'Pyraminx', sx: 'pyram', href: 'pyraminx', phase: '3 · feb 2027', start: '2027-02-01',
      method: 'Método principiante; después L4E',
      goals: [{ kind: 'solo', text: 'Resolver sin ayuda' }, { kind: 'avg', target: 20000, text: 'Media sub-20 s' }],
    },
    {
      id: '333bf', name: '3×3 BLD', sx: 'bld', href: './', phase: 'Paralelo', start: null,
      method: 'Old Pochmann fiable; después M2 para aristas',
      goals: [{ kind: 'bldok', target: 3, text: '3 solves correctos' }, { kind: 'bldcons', text: 'Mejorar consistencia y tiempo' }],
    },
    {
      id: 'sq1', name: 'Square-1', sx: 'sq1', href: 'square-1', phase: '4 · mar/abr 2027', start: '2027-03-01',
      method: 'Forma de cubo, capas y permutación; método Vandenbergh',
      goals: [{ kind: 'solo', text: 'Resolver sin ayuda' }, { kind: 'avg', target: 60000, text: 'Media sub-60 s' }],
    },
  ];
  // How many steps each new event's method has (its page's «Aprender»).
  const STEPS = { 222: 3, 444: 4, pyram: 4, sq1: 6 };
  EVENTS.forEach((e) => { if (STEPS[e.id]) e.steps = STEPS[e.id]; });
  const eventOf = (id) => EVENTS.find((e) => e.id === id);
  // Where it all started: the roadmap's own numbers (November 2026).
  const START = {
    label: 'noviembre 2026', ao12: 39060, best: 26650, n: 276, parts: [7060, 25130, 7830, 3750],
    algs: { oll: [23, 57], pll: [7, 21], f2l: [6, 41] }, f2lShare: 0.57,
  };

  // ================= Times =================
  const value = (r) => (r.pen === 'dnf' ? Infinity : r.t + (r.pen === 2 ? 2000 : 0));
  const finite = (x) => x != null && Number.isFinite(x);
  function fmt(ms) {
    if (ms == null) return '—';
    if (ms === Infinity) return 'DNF';
    const s = Math.max(0, ms) / 1000;
    if (s < 60) return s.toFixed(2);
    const m = Math.floor(s / 60);
    return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
  }
  const fmtRes = (r) => (r.pen === 'dnf' ? 'DNF' : `${fmt(value(r))}${r.pen === 2 ? '+' : ''}`);
  // A time in words for goals: «35 s», «2:30».
  const short = (ms) => (ms == null ? '—' : ms === Infinity ? 'DNF' : ms < 60000 ? `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1).replace('.', ',')} s` : fmt(ms));
  // WCA averages: the best and the worst out (5 % each side from 50 up); more DNFs than that make it DNF.
  function avgOf(list, n) {
    if (list.length < n) return null;
    const xs = list.slice(-n).map(value).sort((a, b) => a - b);
    const trim = n < 50 ? 1 : Math.ceil(n * 0.05);
    const mid = xs.slice(trim, n - trim);
    if (mid.some((x) => x === Infinity)) return Infinity;
    return mid.reduce((a, b) => a + b, 0) / mid.length;
  }
  function bestAvg(list, n) {
    let best = null;
    for (let i = n; i <= list.length; i++) { const a = avgOf(list.slice(0, i), n); if (finite(a) && (best == null || a < best)) best = a; }
    return best;
  }
  function summary(list) {
    const ok = list.filter((r) => r.pen !== 'dnf');
    return {
      n: list.length, ok: ok.length, best: ok.length ? Math.min(...ok.map(value)) : null,
      ao5: avgOf(list, 5), ao12: avgOf(list, 12), bestAo5: bestAvg(list, 5), bestAo12: bestAvg(list, 12),
      mean: ok.length ? ok.map(value).reduce((a, b) => a + b, 0) / ok.length : null,
    };
  }
  // A round of 5 is the times with the same `rd` (when it began), in order: its average is the WCA one.
  function rounds(list) {
    const by = new Map();
    list.forEach((r) => { if (r.rd) { if (!by.has(r.rd)) by.set(r.rd, []); by.get(r.rd).push(r); } });
    return [...by.entries()].map(([id, rs]) => {
      const ts = rs.sort((a, b) => (a.ri || 0) - (b.ri || 0) || a.at - b.at).slice(0, 5);
      const done = ts.length === 5;
      const ok = ts.filter((r) => r.pen !== 'dnf').map(value);
      return { id, at: ts[ts.length - 1].at, times: ts, done, avg: done ? avgOf(ts, 5) : null, best: ok.length ? Math.min(...ok) : null };
    }).sort((a, b) => a.id - b.id);
  }

  // ================= Each event page's data =================
  const times = (ev) => load(K.times(ev), []).filter((r) => r && typeof r.at === 'number' && typeof r.t === 'number');
  const setTimes = (ev, list) => save(K.times(ev), list.slice(-3000));
  // Marks with when they changed: positive is on, negative off (kept so the newest wins between devices).
  const known = (ev) => obj(obj(load(K.known, {}))[ev]);
  const isKnown = (ev, id) => (known(ev)[id] || 0) > 0;
  function setKnown(ev, id, on) {
    const all = obj(load(K.known, {}));
    all[ev] = { ...obj(all[ev]), [id]: on ? Date.now() : -Date.now() };
    save(K.known, all);
  }
  const solo = (ev) => (obj(load(K.solo, {}))[ev] || 0) > 0;
  function setSolo(ev, on) {
    const all = obj(load(K.solo, {}));
    all[ev] = on ? Date.now() : -Date.now();
    save(K.solo, all);
  }
  // The case trainer: per case, times seen, right, the streak of right ones and when it was last seen.
  const train = (ev) => obj(obj(load(K.train, {}))[ev]);
  function trainAnswer(ev, id, ok) {
    const all = obj(load(K.train, {}));
    const mine = obj(all[ev]);
    const t = { n: 0, ok: 0, streak: 0, ...obj(mine[id]) };
    t.n++;
    if (ok) { t.ok++; t.streak++; } else t.streak = 0;
    t.at = Date.now();
    mine[id] = t;
    all[ev] = mine;
    save(K.train, all);
    return t;
  }
  const SETTINGS = { inspect: true, voice: true, sound: true, help: false };
  const settings = () => ({ ...SETTINGS, ...obj(load(K.settings, {})) });
  const setSettings = (patch) => save(K.settings, { ...settings(), ...patch });

  // ================= The plan's own data =================
  const plan = () => {
    const p = obj(load(K.plan, {}));
    return { comp: obj(p.comp), prep: obj(p.prep), ticks: obj(p.ticks) };
  };
  function setComp(c) {
    const p = plan();
    p.comp = { date: c.date || '', name: (c.name || '').slice(0, 80), url: (c.url || '').slice(0, 300), at: Date.now() };
    save(K.plan, p);
  }
  function setPrep(id, on) {
    const p = plan();
    p.prep[id] = on ? Date.now() : -Date.now();
    save(K.plan, p);
  }
  // Sessions you mark yourself in a week (on top of what the app saw): week → { slot: n, at }.
  function setTick(week, slot, n) {
    const p = plan();
    p.ticks[week] = { ...obj(p.ticks[week]), [slot]: Math.max(0, Math.min(7, n)), at: Date.now() };
    save(K.plan, p);
  }

  // ================= The other sections =================
  const cfopTimes = () => load('cfop:times:v1', []).filter((r) => r && typeof r.t === 'number' && !r.m);
  const bldTimes = () => load('op3bld:times:v1', []).filter((r) => r && typeof r.at === 'number');
  // A 3BLD attempt of the whole cube (not «solo memo» nor a scramble of only edges or only corners), if the cube
  // model is here to tell; else every timed one counts.
  function bldFull(t) {
    if (t.m === 'memo') return false;
    const M = window.CubeModel;
    if (!M || !t.scr) return true;
    try {
      const st = M.apply(M.solved(), t.scr);
      const edgesOk = st.every((v, i) => M.PIECE_OF[i].length !== 2 || v === i);
      const cornersOk = st.every((v, i) => M.PIECE_OF[i].length !== 3 || v === i);
      return !edgesOk && !cornersOk;
    } catch (e) { return true; }
  }
  const bldValue = (t) => (t.ok ? t.memo + (t.exec || 0) : Infinity);
  // The four parts of a CFOP solve (cross, F2L, OLL, PLL), from the smart cube's steps or timed by hand.
  function partsOf(r) {
    if (!r || r.m || r.pen === 'dnf') return null;
    if (r.sp) return Array.isArray(r.sp.s) && r.sp.s.length === 6 && r.sp.s.every(Boolean) ? [[0], [1], [2, 3], [4, 5]].map((idx) => idx.reduce((a, i) => a + r.sp.s[i][0], 0)) : null;
    return Array.isArray(r.ph) && r.ph.length === 4 && r.ph.every(Number.isFinite) ? r.ph : null;
  }
  // The last 12 solves with their parts: each part's mean and its share of the solve.
  function cfopParts(list = cfopTimes()) {
    const withParts = list.map(partsOf).filter(Boolean).slice(-12);
    if (!withParts.length) return null;
    const means = [0, 1, 2, 3].map((g) => withParts.reduce((a, p) => a + p[g], 0) / withParts.length);
    const total = means.reduce((a, b) => a + b, 0) || 1;
    return { n: withParts.length, means, shares: means.map((m) => m / total) };
  }
  // What you have marked in CFOP's «Casos»: «Me lo sé» and «Aprendiendo», for the full OLL and PLL and the F2L.
  function cfopAlgs() {
    const learn = obj(load('cfop:learn:v1', {}));
    const count = (re) => {
      const ids = Object.keys(learn).filter((id) => re.test(id));
      return { known: ids.filter((id) => learn[id] === 'known').length, learning: ids.filter((id) => learn[id] === 'learning').length };
    };
    return { oll: { ...count(/^oll-\d+$/), of: 57 }, pll: { ...count(/^pll-/), of: 21 }, f2l: { ...count(/^f2l\d+$/), of: 41 } };
  }
  function bldLearn() {
    const lessons = Object.keys(obj(obj(load('op3bld:learn:v1', {})).done)).length;
    const m2 = Object.values(obj(obj(load('op3bld:m2:v1', {})).k)).filter((v) => v >= 3).length;
    return { lessons, ofLessons: 9, m2, ofM2: 22, em: (() => { try { return localStorage.getItem('op3bld:em:v1') === 'm2' ? 'm2' : 'op'; } catch (e) { return 'op'; } })() };
  }
  // Practice time per day (all devices added), from what practice.js keeps in each section.
  function practiceDays(prefix) {
    const out = {};
    Object.values(obj(load(`${prefix}:practice:v1`, {}))).forEach((byDay) => Object.entries(obj(byDay)).forEach(([k, ms]) => {
      if (Number.isFinite(ms) && ms > 0) out[k] = (out[k] || 0) + ms;
    }));
    return out;
  }
  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  function mondayOf(t) { const d = new Date(dayStart(t)); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return d.getTime(); }
  // The ISO week: «2026-W48».
  function weekKey(t) {
    const d = new Date(dayStart(t));
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const y = d.getFullYear();
    const jan4 = new Date(y, 0, 4);
    const w = 1 + Math.round(((d - jan4) / DAY - 3 + ((jan4.getDay() + 6) % 7)) / 7);
    return `${y}-W${String(w).padStart(2, '0')}`;
  }

  // ================= How each event is going =================
  function eventTimes(id) {
    if (id === '333') return cfopTimes();
    if (NEW.includes(id)) return times(id);
    return [];
  }
  function hasSoloSolve(id) { return times(id).some((r) => r.pen !== 'dnf' && !r.help); }
  function goalState(ev, g) {
    const out = { text: g.text, kind: g.kind, target: g.target, done: false, now: null, best: null, progress: 0, note: '' };
    if (g.kind === 'ao12' || g.kind === 'avg') {
      const s = summary(eventTimes(ev.id));
      out.now = g.kind === 'ao12' ? s.ao12 : s.ao5;
      out.best = g.kind === 'ao12' ? s.bestAo12 : s.bestAo5;
      out.done = finite(out.best) && out.best < g.target;
      const ref = finite(out.best) ? out.best : null;
      out.progress = ref ? Math.max(0, Math.min(1, g.target / ref)) : 0;
      const n = g.kind === 'ao12' ? 12 : 5;
      out.note = out.done ? `Conseguido: ${g.kind === 'ao12' ? 'Ao12' : 'media de 5'} de ${short(out.best)}.`
        : ref ? `Tu mejor ${g.kind === 'ao12' ? 'Ao12' : 'media de 5'}: ${short(ref)}${finite(out.now) && out.now !== ref ? ` · ahora ${short(out.now)}` : ''}.`
          : `Hacen falta ${n} tiempos para la primera ${g.kind === 'ao12' ? 'Ao12' : 'media'}.`;
    } else if (g.kind === 'solo') {
      const marked = solo(ev.id);
      const timed = hasSoloSolve(ev.id);
      out.done = marked || timed;
      out.progress = out.done ? 1 : (Object.values(known(ev.id)).some((v) => v > 0) || times(ev.id).length ? 0.4 : 0);
      out.note = out.done ? (marked ? 'Marcado: lo resuelves sin mirar.' : 'Ya tienes un tiempo sin ayuda.') : 'Cuando te salga sin mirar el tutorial, márcalo en Aprender o cronométrate sin «Con ayuda».';
    } else if (g.kind === 'bldok') {
      const ok = bldTimes().filter((t) => t.ok && bldFull(t)).length;
      out.now = ok;
      out.done = ok >= g.target;
      out.progress = Math.min(1, ok / g.target);
      out.note = `${ok} ${ok === 1 ? 'resuelto entero' : 'resueltos enteros'} a ciegas.`;
    } else if (g.kind === 'bldcons') {
      const full = bldTimes().filter(bldFull);
      const last = full.slice(-10);
      const ok = last.filter((t) => t.ok).length;
      const okAll = full.filter((t) => t.ok).map(bldValue);
      out.now = last.length ? ok / last.length : null;
      out.best = okAll.length ? Math.min(...okAll) : null;
      out.progress = out.now || 0;
      out.note = last.length ? `Aciertos en tus últimos ${last.length}: ${Math.round((ok / last.length) * 100)} %${out.best != null ? ` · mejor ${short(out.best)}` : ''}.` : 'Sin intentos enteros todavía.';
    }
    return out;
  }
  const goalsOf = (id) => { const ev = eventOf(id); return ev ? ev.goals.map((g) => goalState(ev, g)) : []; };
  // Where the event is: done (both goals), first goal reached, under way, its time has come, or not yet.
  function status(id, now = Date.now()) {
    const ev = eventOf(id);
    const gs = goalsOf(id);
    const started = id === '333' || id === '333bf' || times(id).length > 0 || Object.values(known(id)).some((v) => v > 0);
    const startAt = ev.start ? new Date(`${ev.start}T00:00:00`).getTime() : null;
    let state;
    if (gs[0].done && gs[1].done) state = 'done';
    else if (gs[0].done) state = 'first';
    else if (started) state = 'going';
    else if (!startAt || startAt <= now) state = 'now';
    else state = 'later';
    return { ev, goals: gs, started, state, startAt };
  }
  const STATE_TEXT = { done: 'Metas cumplidas', first: 'Primer hito ✓', going: 'En marcha', now: 'Toca ya', later: 'Más adelante' };
  // The event you are bringing in now: the first new one whose first goal is still to come.
  function current(now = Date.now()) {
    for (const id of NEW) { const s = status(id, now); if (!s.goals[0].done) return s; }
    return null;
  }

  // ================= The week =================
  const ROUTINE = [
    { id: '333', need: 3, text: '3×3: cruz, F2L y repaso de PLL/OLL', href: 'fridrich' },
    { id: 'new', need: 1, text: 'La modalidad nueva', href: null },
    { id: 'bld', need: 1, text: 'BLD', href: './#crono' },
    { id: 'crono', need: 1, text: 'Solves cronometrados y revisión', href: 'fridrich#crono' },
  ];
  const SESSION_MS = 10 * 60000;
  function week(now = Date.now()) {
    const from = mondayOf(now);
    const days = Array.from({ length: 7 }, (_, i) => dayKey(from + i * DAY + 3600000));
    const prac = { cfop: practiceDays(PRACTICE.cfop), bld: practiceDays(PRACTICE.bld), new: {} };
    NEW.forEach((ev) => Object.entries(practiceDays(PRACTICE[ev])).forEach(([k, ms]) => { prac.new[k] = (prac.new[k] || 0) + ms; }));
    const inWeek = (t) => t >= from && t < from + 7 * DAY;
    const perDay = (list) => { const m = {}; list.forEach((r) => { if (inWeek(r.at)) { const k = dayKey(r.at); m[k] = (m[k] || 0) + 1; } }); return m; };
    const cfopN = perDay(cfopTimes());
    const bldN = perDay(bldTimes());
    const newN = {};
    NEW.forEach((ev) => Object.entries(perDay(times(ev))).forEach(([k, n]) => { newN[k] = (newN[k] || 0) + n; }));
    const roundDays = new Set();
    NEW.forEach((ev) => rounds(times(ev)).forEach((r) => { if (r.done && inWeek(r.at)) roundDays.add(dayKey(r.at)); }));
    const count = (fn) => days.filter(fn).length;
    const auto = {
      333: count((k) => (prac.cfop[k] || 0) >= SESSION_MS || (cfopN[k] || 0) >= 10),
      new: count((k) => (prac.new[k] || 0) >= SESSION_MS || (newN[k] || 0) >= 5),
      bld: count((k) => (prac.bld[k] || 0) >= SESSION_MS || (bldN[k] || 0) >= 1),
      crono: count((k) => roundDays.has(k) || (cfopN[k] || 0) >= 25),
    };
    const wk = weekKey(now);
    const manual = obj(plan().ticks[wk]);
    const slots = ROUTINE.map((s) => {
      const extra = Number(manual[s.id]) || 0;
      return { ...s, auto: auto[s.id], extra, done: Math.min(s.need, auto[s.id] + extra) };
    });
    const ms = days.map((k) => (prac.cfop[k] || 0) + (prac.bld[k] || 0) + (prac.new[k] || 0));
    return { week: wk, from, days, slots, perDay: ms, total: ms.reduce((a, b) => a + b, 0) };
  }

  // ================= The last four weeks before competing =================
  const PREP = [
    { id: 'limits', text: 'Consulta los eventos y los límites de tiempo de tu competición' },
    { id: 'rounds', text: 'Simula rondas de cinco intentos en 3×3, 2×2, 4×4, Pyraminx y Square-1' },
    { id: 'inspect', text: 'Practica con la inspección reglamentaria (15 s)' },
    { id: 'bld', text: 'En BLD, la memorización cuenta dentro del tiempo: cronométrate entero' },
    { id: 'safe', text: 'Prioriza ejecuciones seguras: un buen tiempo sin DNF vale más' },
    { id: 'rules', text: 'Familiarízate con el procedimiento oficial' },
  ];
  // 3×3 «rounds» in CFOP: 5 solves in a row, each less than 3 minutes after the one before.
  function cfopRounds(since) {
    const list = cfopTimes().filter((r) => r.at >= since);
    let n = 0;
    let run = 1;
    for (let i = 1; i < list.length; i++) {
      if (list[i].at - list[i - 1].at < 180000) run++; else run = 1;
      if (run === 5) { n++; run = 0; }
    }
    return n;
  }
  function prep(now = Date.now()) {
    const p = plan();
    const compAt = p.comp.date ? new Date(`${p.comp.date}T09:00:00`).getTime() : null;
    const daysLeft = compAt ? Math.ceil((dayStart(compAt) - dayStart(now)) / DAY) : null;
    const since = now - 28 * DAY;
    const roundsBy = { 333: cfopRounds(since) };
    NEW.forEach((ev) => { roundsBy[ev] = rounds(times(ev)).filter((r) => r.done && r.at >= since).length; });
    const inspectOn = !!obj(load('cfop:settings:v1', {})).inspect || settings().inspect;
    const bldRecent = bldTimes().filter((t) => t.at >= since && bldFull(t)).length;
    const auto = { rounds: ['333', ...NEW].every((ev) => roundsBy[ev] > 0), inspect: inspectOn, bld: bldRecent > 0 };
    const items = PREP.map((it) => {
      const marked = (p.prep[it.id] || 0) > 0;
      return { ...it, auto: !!auto[it.id], marked, done: marked || !!auto[it.id] };
    });
    return { comp: p.comp, compAt, daysLeft, inWindow: daysLeft != null && daysLeft >= 0 && daysLeft <= 28, items, roundsBy, bldRecent };
  }

  // ================= What travels =================
  // The server keeps up to 500 kB per document: the newest 600 times of each event (4×4 and Square-1 scrambles
  // are long) travel; older ones stay where they are.
  const SYNC_TIMES = 600;
  function syncData() {
    const t = {};
    NEW.forEach((ev) => { t[ev] = times(ev).slice(-SYNC_TIMES); });
    const practice = {};
    NEW.forEach((ev) => {
      const key = PRACTICE[ev];
      practice[key] = window.Practice && document.documentElement.dataset.practice === key ? window.Practice.data() : obj(load(`${key}:practice:v1`, {}));
    });
    return { v: 1, times: t, deleted: load(K.deleted, []).slice(-3000), known: obj(load(K.known, {})), solo: obj(load(K.solo, {})), train: obj(load(K.train, {})), plan: plan(), practice };
  }
  // Newest mark wins (by when it changed); times by when they were done, an edit (`ed`) by the newest.
  const newer = (a, b) => Math.abs(b || 0) > Math.abs(a || 0);
  function mergeIn(remote) {
    if (!remote || typeof remote !== 'object') return false;
    let changed = false;
    const dead = new Set([...load(K.deleted, []), ...(Array.isArray(remote.deleted) ? remote.deleted : [])].filter((x) => typeof x === 'string'));
    save(K.deleted, [...dead].slice(-3000));
    NEW.forEach((ev) => {
      const mine = times(ev);
      const byAt = new Map(mine.map((r) => [r.at, r]));
      const incoming = Array.isArray(obj(remote.times)[ev]) ? remote.times[ev] : [];
      incoming.forEach((r) => {
        if (!r || typeof r.at !== 'number' || typeof r.t !== 'number') return;
        const have = byAt.get(r.at);
        if (!have) { byAt.set(r.at, r); changed = true; } else if ((r.ed || 0) > (have.ed || 0)) {
          have.pen = r.pen; have.ed = r.ed;
          if (r.no) have.no = r.no; else delete have.no;
          changed = true;
        }
      });
      const merged = [...byAt.values()].filter((r) => !dead.has(`${ev}:${r.at}`)).sort((a, b) => a.at - b.at);
      if (merged.length !== mine.length) changed = true;
      setTimes(ev, merged);
    });
    const marks = (key, depth) => {
      const mine = obj(load(key, {}));
      const theirs = obj(remote[key === K.known ? 'known' : 'solo']);
      if (depth === 2) {
        Object.entries(theirs).forEach(([ev, m]) => {
          if (!NEW.includes(ev)) return;
          const cur = obj(mine[ev]);
          Object.entries(obj(m)).forEach(([id, at]) => { if (Number.isFinite(at) && newer(cur[id], at)) { cur[id] = at; changed = true; } });
          mine[ev] = cur;
        });
      } else {
        Object.entries(theirs).forEach(([ev, at]) => { if (NEW.includes(ev) && Number.isFinite(at) && newer(mine[ev], at)) { mine[ev] = at; changed = true; } });
      }
      save(key, mine);
    };
    marks(K.known, 2);
    marks(K.solo, 1);
    const tr = obj(load(K.train, {}));
    Object.entries(obj(remote.train)).forEach(([ev, cases]) => {
      if (!NEW.includes(ev)) return;
      const cur = obj(tr[ev]);
      Object.entries(obj(cases)).forEach(([id, x]) => { if (x && Number.isFinite(x.n) && x.n > ((cur[id] || {}).n || 0)) { cur[id] = x; changed = true; } });
      tr[ev] = cur;
    });
    save(K.train, tr);
    const rp = obj(remote.plan);
    const p = plan();
    if (rp.comp && (rp.comp.at || 0) > (p.comp.at || 0)) { p.comp = obj(rp.comp); changed = true; }
    Object.entries(obj(rp.prep)).forEach(([id, at]) => { if (Number.isFinite(at) && newer(p.prep[id], at)) { p.prep[id] = at; changed = true; } });
    Object.entries(obj(rp.ticks)).forEach(([wk, t]) => { if (/^\d{4}-W\d{2}$/.test(wk) && t && (t.at || 0) > ((p.ticks[wk] || {}).at || 0)) { p.ticks[wk] = t; changed = true; } });
    save(K.plan, p);
    Object.entries(obj(remote.practice)).forEach(([key, byDev]) => {
      if (!Object.values(PRACTICE).includes(key) || !/^ev/.test(key)) return;
      if (window.Practice && document.documentElement.dataset.practice === key) { if (window.Practice.merge(byDev)) changed = true; return; }
      const mine = obj(load(`${key}:practice:v1`, {}));
      Object.entries(obj(byDev)).forEach(([dev, days]) => {
        const cur = obj(mine[dev]);
        Object.entries(obj(days)).forEach(([k, ms]) => { if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(ms) && ms > (cur[k] || 0)) { cur[k] = ms; changed = true; } });
        mine[dev] = cur;
      });
      save(`${key}:practice:v1`, mine);
    });
    return changed;
  }
  const changed = () => document.dispatchEvent(new CustomEvent('ev:changed'));

  window.EvData = {
    K, NEW, EVENTS, START, PRACTICE, eventOf, load, save,
    value, fmt, fmtRes, short, avgOf, bestAvg, summary, rounds,
    times, setTimes, known, isKnown, setKnown, solo, setSolo, train, trainAnswer, settings, setSettings,
    plan, setComp, setPrep, setTick,
    cfopTimes, cfopParts, cfopAlgs, bldTimes, bldFull, bldValue, bldLearn, practiceDays, dayKey, dayStart, mondayOf, weekKey,
    goalsOf, status, STATE_TEXT, current, ROUTINE, week, PREP, prep, syncData, mergeIn, changed,
  };
})();
