// «Fridrich reducido»: CFOP with 2-look OLL and PLL and J Perm's algorithms. Timer with inspection, the smart
// cube (scramble follower, starts with the first turn and stops when solved, splits per step, the case and
// its algorithm live), the cases to learn, a trainer, stats and history.
(() => {
  'use strict';
  const M = window.CubeModel;
  const C = window.Cfop;
  if (!M || !C || !document.body.classList.contains('fr')) return;
  const { apply, parseAlg, invertAlg, solved, isSolved, faceOfSticker, toFacelets, norm, FACE_ORDER, COLOR_NAME } = M;
  const $ = (id) => document.getElementById(id);
  const esc = (txt) => String(txt).replace(/[&<>'"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
  const key = (st) => st.join(',');
  const now = () => performance.now();
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  const emit = (name, detail) => document.dispatchEvent(new CustomEvent(`fr:${name}`, { detail }));

  // ================= Storage (this browser only) =================
  const K = {
    times: 'cfop:times:v1', set: 'cfop:settings:v1', learn: 'cfop:learn:v1', train: 'cfop:train:v1',
    view: 'cfop:view:v1', scr: 'cfop:scramble:v1', pick: 'cfop:pick:v1', theme: 'op3bld:theme:v1',
  };
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* this visit only */ } };
  const settings = { inspect: false, help: true, sound: true, cross: 'U', timed: true, trMode: 'cube', ...load(K.set, {}) };
  if (!(settings.cross in C.DOWN)) settings.cross = 'U';
  const saveSettings = () => save(K.set, settings);
  let times = load(K.times, []);
  if (!Array.isArray(times)) times = [];
  const learn = load(K.learn, {});
  const train = load(K.train, {});

  // ================= Times =================
  const value = (r) => (r.pen === 'dnf' ? Infinity : r.t + (r.pen === 2 ? 2000 : 0));
  function fmt(ms) {
    if (ms == null) return '—';
    if (ms === Infinity) return 'DNF';
    const s = Math.max(0, ms) / 1000;
    if (s < 60) return s.toFixed(2);
    const m = Math.floor(s / 60);
    return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
  }
  const fmtRes = (r) => (r.pen === 'dnf' ? 'DNF' : `${fmt(value(r))}${r.pen === 2 ? '+' : ''}`);
  const f1 = (ms) => (ms == null ? '—' : (ms / 1000).toFixed(ms < 10000 ? 2 : 1));
  // WCA-style averages: drop the best and the worst (5 % each side from 50 up); two DNFs make it DNF.
  function avgOf(list, n) {
    if (list.length < n) return null;
    const xs = list.slice(-n).map(value).sort((a, b) => a - b);
    const trim = n < 50 ? 1 : Math.ceil(n * 0.05);
    const mid = xs.slice(trim, n - trim);
    if (mid.some((x) => x === Infinity)) return Infinity;
    return mid.reduce((a, b) => a + b, 0) / mid.length;
  }

  // ================= Views =================
  const VIEWS = ['crono', 'casos', 'entrenar', 'ajustes'];
  const viewHooks = {};
  let view = 'crono';
  function showView(name) {
    if (!VIEWS.includes(name)) name = 'crono';
    const changed = name !== view;
    view = name;
    document.querySelectorAll('.view').forEach((el) => { el.hidden = el.dataset.view !== name; });
    // Nothing keeps the focus inside a view that is now hidden (Space would go to it).
    const f = document.activeElement;
    if (f && f !== document.body && f.closest('.view') && f.closest('.view').hidden) f.blur();
    document.querySelectorAll('[data-go]').forEach((b) => {
      if (b.dataset.go === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    save(K.view, name);
    try { history.replaceState(null, '', `${location.pathname}${location.search}#${name}`); } catch (e) { /* sandboxed */ }
    if (changed) { try { window.scrollTo(0, 0); } catch (e) { /* no layout */ } }
    (viewHooks[name] || []).forEach((fn) => fn());
  }
  const onView = (name, fn) => { (viewHooks[name] = viewHooks[name] || []).push(fn); };
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.go)));
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (VIEWS.includes(h) && h !== view) showView(h); });

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.h);
    toast.h = setTimeout(() => { t.hidden = true; }, 2400);
  }

  // ================= Following a known sequence of turns =================
  // The cube's state after each turn (and part way through half turns and slices, whichever face the cube
  // reports first); the cube is where its state matches. States are compared in the cube's own frame.
  function partialKeys(before, after) {
    const path = window.SmartCube ? window.SmartCube.facePath(before, after) : null;
    if (!path || !path.length) return [];
    const per = {};
    path.forEach((q) => { const f = q[0]; per[f] = (per[f] || 0) + (q.length > 1 ? 3 : 1); });
    const faces = Object.keys(per);
    const options = faces.map((f) => {
      const t = per[f] % 4;
      return t === 2 ? ['', f, `${f}'`, `${f}2`] : ['', t === 1 ? f : `${f}'`];
    });
    const out = [];
    const walk = (i, acc) => {
      if (i === faces.length) {
        const full = acc.every((m, k) => m === options[k][options[k].length - 1]);
        const none = acc.every((m) => !m);
        if (!full && !none) out.push(key(apply(before, acc.filter(Boolean).join(' '))));
        return;
      }
      for (const m of options[i]) walk(i + 1, [...acc, m]);
    };
    walk(0, []);
    return out;
  }
  function makeFollow(start, moves) {
    const at = new Map();
    const half = new Map();
    const add = (map, k, i) => { if (!map.has(k)) map.set(k, []); map.get(k).push(i); };
    let s = start;
    add(at, key(norm(s)), 0);
    moves.forEach((m, i) => {
      const before = norm(s);
      s = apply(s, m);
      const after = norm(s);
      partialKeys(before, after).forEach((k) => add(half, k, i));
      add(at, key(after), i + 1);
    });
    return { moves, n: moves.length, at, half, pos: 0, halfway: false, off: [], lost: false };
  }
  function simplify(list) {
    const out = [];
    for (const t of list) {
      const m = parseAlg(t)[0];
      const last = out[out.length - 1];
      if (last && last.base === m.base) {
        last.turns = (last.turns + m.turns) % 4;
        if (!last.turns) out.pop();
      } else out.push({ base: m.base, turns: m.turns });
    }
    return out;
  }
  const moveText = (m) => m.base + (m.turns === 2 ? '2' : m.turns === 3 ? "'" : '');
  function locate(F, st) {
    const k = key(st);
    const pick = (list) => list.reduce((b, x) => {
      const db = Math.abs(b - F.pos); const dx = Math.abs(x - F.pos);
      return dx < db || (dx === db && x > b) ? x : b;
    });
    if (F.at.has(k)) { F.pos = pick(F.at.get(k)); F.halfway = false; F.off = []; F.lost = false; return true; }
    if (F.half.has(k)) { F.pos = pick(F.half.get(k)); F.halfway = true; F.off = []; F.lost = false; return true; }
    return false;
  }
  function followMove(F, st, mv) {
    if (locate(F, st) || F.lost) return;
    F.off = simplify([...F.off.map(moveText), mv]);
    if (F.off.length > 6) F.lost = true;
  }
  const done = (F) => F && !F.lost && !F.off.length && !F.halfway && F.pos >= F.n;
  // Face names as the cube is held: `map` takes the core's face to the hand's (e.g. white down: U → D).
  const faceMapFor = (rot) => {
    const s = rot ? apply(solved(), rot) : solved();
    const map = {};
    FACE_ORDER.forEach((f) => { map[f] = FACE_ORDER[Math.floor(s.indexOf(FACE_ORDER.indexOf(f) * 9 + 4) / 9)]; });
    return map;
  };
  const undoText = (F, map) => F.off.slice().reverse()
    .map((m) => moveText({ base: map ? map[m.base] : m.base, turns: (4 - m.turns) % 4 })).join(' ');
  const inHand = (alg, map) => parseAlg(alg).map((m) => moveText({ base: map[m.base] || m.base, turns: m.turns })).join(' ');

  // ================= Drawings: the top layer from above, as J Perm draws it =================
  const STICKER = { U: 'var(--st-U)', R: 'var(--st-R)', F: 'var(--st-F)', D: 'var(--st-D)', L: 'var(--st-L)', B: 'var(--st-B)' };
  // Top face cells (row 0 at the back) and the side stickers of the top layer, left to right as seen from above.
  const SIDES = { back: [47, 46, 45], left: [36, 37, 38], right: [11, 10, 9], front: [18, 19, 20] };
  const CELL_POS = (() => {
    // Position (x, z) on the top face of each top-layer piece, for the arrows.
    const out = {};
    for (let i = 0; i < 9; i++) out[i] = [i % 3, Math.floor(i / 3)];
    return out;
  })();
  function topView(g, opts) {
    const o = opts || {};
    const top = faceOfSticker(g[4]);
    const fill = (i) => {
      const f = faceOfSticker(g[i]);
      if (o.mode === 'oll') return f === top ? STICKER[top] : 'var(--fr-blank)';
      return STICKER[f];
    };
    const S = 26; const gap = 3; const side = 9; const pad = 4;
    const off = pad + side + gap;
    const size = off * 2 + S * 3 + gap * 2;
    let out = `<svg class="fr-top" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(o.label || 'Capa de arriba vista desde arriba')}">`;
    out += `<rect x="${pad + side - 1}" y="${pad + side - 1}" width="${S * 3 + gap * 4 + 2}" height="${S * 3 + gap * 4 + 2}" rx="5" fill="var(--plastic)"/>`;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      out += `<rect x="${off + c * (S + gap)}" y="${off + r * (S + gap)}" width="${S}" height="${S}" rx="3.5" fill="${fill(r * 3 + c)}"/>`;
    }
    const strip = (ids, x0, y0, horiz) => ids.forEach((id, k) => {
      const x = horiz ? off + k * (S + gap) : x0;
      const y = horiz ? y0 : off + k * (S + gap);
      out += `<rect x="${x}" y="${y}" width="${horiz ? S : side}" height="${horiz ? side : S}" rx="2.5" fill="${fill(id)}"/>`;
    });
    strip(SIDES.back, 0, pad, true);
    strip(SIDES.front, 0, size - pad - side, true);
    strip(SIDES.left, pad, 0, false);
    strip(SIDES.right, size - pad - side, 0, false);
    if (o.arrows) out += arrows(g, off, S, gap);
    return `${out}</svg>`;
  }
  // PLL arrows: from where each top piece is to where it belongs (two-headed for swaps).
  function arrows(g, off, S, gap) {
    const centreColour = (i) => faceOfSticker(g[Math.floor(i / 9) * 9 + 4]);
    // Each top-layer piece by its top-face cell, with its side stickers.
    const pieceAt = {};
    M.CUBIES.forEach((p) => {
      const u = p.find((i) => i < 9);
      if (u != null) pieceAt[u] = p;
    });
    const homeOf = (cell) => {
      const p = pieceAt[cell];
      const colours = p.filter((i) => i >= 9).map((i) => faceOfSticker(g[i])).sort().join('');
      return Object.keys(pieceAt).map(Number).find((c) => pieceAt[c].length === p.length
        && pieceAt[c].filter((i) => i >= 9).map(centreColour).sort().join('') === colours);
    };
    const moves = [];
    Object.keys(pieceAt).map(Number).filter((c) => c !== 4).forEach((c) => {
      const h = homeOf(c);
      if (h != null && h !== c) moves.push([c, h]);
    });
    const ctr = (c) => [off + CELL_POS[c][0] * (S + gap) + S / 2, off + CELL_POS[c][1] * (S + gap) + S / 2];
    let out = '';
    const seen = new Set();
    moves.forEach(([a, b]) => {
      if (seen.has(`${b}>${a}`)) return;
      const swap = moves.some(([x, y]) => x === b && y === a);
      seen.add(`${a}>${b}`);
      const [x1, y1] = ctr(a); const [x2, y2] = ctr(b);
      const len = Math.hypot(x2 - x1, y2 - y1); const ux = (x2 - x1) / len; const uy = (y2 - y1) / len;
      const sx = x1 + ux * 6; const sy = y1 + uy * 6; const ex = x2 - ux * 6; const ey = y2 - uy * 6;
      const head = (x, y, dx, dy) => `<path d="M${x} ${y} l${(-dx * 7 - dy * 4).toFixed(1)} ${(-dy * 7 + dx * 4).toFixed(1)} M${x} ${y} l${(-dx * 7 + dy * 4).toFixed(1)} ${(-dy * 7 - dx * 4).toFixed(1)}"/>`;
      out += `<g class="fr-arrow"><path d="M${sx.toFixed(1)} ${sy.toFixed(1)} L${ex.toFixed(1)} ${ey.toFixed(1)}"/>${head(ex.toFixed(1), ey.toFixed(1), ux, uy)}${swap ? head(sx.toFixed(1), sy.toFixed(1), -ux, -uy) : ''}</g>`;
    });
    return out;
  }
  const modeOf = (step) => (step && step.startsWith('oll') ? 'oll' : 'pll');
  const casePicture = (c, auf, label) => topView(C.caseState(c, auf), { mode: modeOf(c.step), arrows: c.step.startsWith('pll'), label: label || `${c.name}: ${c.look}` });
  const algHtml = (alg) => `<span class="fr-alg">${parseAlg(alg).map((m) => `<span>${esc(m.text)}</span>`).join(' ')}</span>`;
  const STEP_NAME = Object.fromEntries(C.STEPS.map((s) => [s.id, s.name]));

  // ================= Scramble =================
  let scramble = load(K.scr, '');
  let scrState = null;
  let follow = null;
  let crossOpen = false;
  let scrSeq = 0;
  function setScramble(scr) {
    scrSeq++;
    scramble = scr;
    save(K.scr, scr);
    try { scrState = apply(solved(), scr); } catch (e) { scrState = null; }
    follow = scrState ? makeFollow(solved(), parseAlg(scr).map((m) => m.text)) : null;
    if (cube && cube.on) locate(follow, cube.state) || markLost();
    crossOpen = false;
    renderScramble();
    renderCross();
    emit('scramble', scr);
  }
  function markLost() { if (follow) { follow.lost = !isSolved(cube.state); follow.off = []; follow.pos = 0; } }
  let scrBusy = false;
  async function newScramble() {
    if (scrBusy) return;
    scrBusy = true;
    const btn = $('newScr');
    btn.disabled = true;
    btn.textContent = M.scramblerReady() ? 'Generando…' : 'Preparando…';
    const mine = scrSeq;
    let scr;
    try { scr = M.simplifyAlg(await M.withTimeout(M.requestScramble('full'), 30000)); } catch (e) { scr = M.randomMoveScramble(); }
    btn.disabled = false;
    btn.textContent = 'Nuevo scramble';
    scrBusy = false;
    // Not if another scramble came meanwhile, nor in the middle of a solve.
    if (mine === scrSeq && timer.phase !== 'run') setScramble(scr);
  }
  function renderScramble() {
    const moves = scramble ? parseAlg(scramble).map((m) => m.text) : [];
    $('scrCount').textContent = moves.length ? `· ${moves.length} movimientos` : '';
    const F = follow;
    const on = cube && cube.on && F && !F.lost && timer.phase !== 'run';
    $('scr').innerHTML = moves.map((m, i) => {
      let cls = 'sm';
      if (on) {
        if (i < F.pos) cls += ' done';
        else if (i === F.pos) cls += F.halfway ? ' next half' : ' next';
      }
      return `<span class="${cls}">${esc(m)}</span>`;
    }).join(' ') || '<span class="muted">Generando…</span>';
    const hint = $('scrHint');
    let text = '';
    let tone = '';
    if (cube && cube.on && F && timer.phase !== 'run') {
      if (F.lost) {
        text = isSolved(cube.state)
          ? 'Mezcla el cubo con este scramble (blanco arriba, verde delante).'
          : 'Tu cubo no está en este scramble. Resuélvelo (o pulsa «Está resuelto» si ya lo está) y mézclalo con él, o úsalo tal como está.';
        tone = isSolved(cube.state) ? '' : 'bad';
      } else if (F.off.length) { text = `Ese giro no toca. Deshaz: <b>${undoText(F)}</b>`; tone = 'bad'; } else if (done(F)) {
        text = !settings.timed ? 'Mezclado. Resuelve a tu ritmo: abajo te digo cada paso.' : timer.phase === 'inspect' ? 'Inspección: el crono empieza con tu primer giro.' : 'Mezclado: el crono empieza con tu primer giro.';
        tone = 'ok';
      } else text = `Giro ${F.pos + 1} de ${F.n}: <b>${esc(F.moves[F.pos])}</b>${F.halfway ? ' (falta la otra mitad)' : ''}`;
    }
    hint.hidden = !text;
    hint.className = `fr-hint ${tone}`;
    hint.innerHTML = text + (F && F.lost && cube && cube.on && !isSolved(cube.state) ? ' <button class="btn" type="button" id="useMine">Usar mi cubo como scramble</button>' : '');
    const use = $('useMine');
    if (use) use.addEventListener('click', useMine);
  }
  async function useMine() {
    const b = $('useMine');
    if (b) { b.disabled = true; b.textContent = 'Calculando…'; }
    try {
      const scr = await M.withTimeout(M.solveState(toFacelets(cube.state)), 20000);
      setScramble(scr);
    } catch (e) { toast('No he podido leer el cubo como scramble'); renderScramble(); }
  }
  function renderCross() {
    const box = $('cross');
    const btn = $('crossShow');
    btn.setAttribute('aria-expanded', String(crossOpen));
    btn.textContent = crossOpen ? 'Ocultar la cruz' : 'Ver la cruz más corta';
    box.hidden = !crossOpen || !scrState;
    if (box.hidden) return;
    const x = C.bestCross(scrState, settings.cross);
    box.innerHTML = `<span class="field-title">La ${esc(x.name)} más corta · ${x.length} ${x.length === 1 ? 'giro' : 'giros'}</span>`
      + `<span class="fr-cross-moves">${x.rotation ? `<span class="muted">${esc(x.rotation)}</span> ` : ''}${x.moves ? algHtml(x.moves) : '<i>ya está hecha</i>'}</span>`
      + `<span class="hint">${x.rotation ? `Desde como lo mezclas (blanco arriba, verde delante), gíralo entero con <b>${esc(x.rotation)}</b>: ${esc(x.colour)} abajo. ` : ''}Hay otras de la misma longitud; esta es una.</span>`;
  }
  $('newScr').addEventListener('click', () => { if (timer.phase !== 'run') newScramble(); });
  $('crossShow').addEventListener('click', () => { crossOpen = !crossOpen; renderCross(); });

  // ================= Timer =================
  // idle → (hold) → ready → [inspect →(hold)→ ready] → run → done. With the cube: armed once it is scrambled,
  // the first turn starts it and solving it stops it.
  const HOLD_MS = 300;
  const timer = { phase: 'idle', t0: 0, t: 0, insp0: 0, hold: 0, held: false, inspHold: false, raf: 0, pen: 0, line: null, startState: null, last: null };
  function setPhase(p) {
    timer.phase = p;
    renderClock();
    emit('timer', timerState());
  }
  function timerState() {
    const off = Date.now() - now();
    return {
      phase: timer.phase === 'hold' || timer.phase === 'ready' ? 'idle' : timer.phase === 'ihold' || timer.phase === 'iready' ? 'inspect' : timer.phase,
      t0: timer.t0 ? Math.round(timer.t0 + off) : 0,
      insp0: timer.insp0 ? Math.round(timer.insp0 + off) : 0,
      t: timer.t,
      scramble,
    };
  }
  function inspectLeft() { return 15000 - (now() - timer.insp0); }
  function penaltyNow() {
    if (!timer.insp0) return 0;
    const used = now() - timer.insp0;
    return used > 17000 ? 'dnf' : used > 15000 ? 2 : 0;
  }
  function tick() {
    cancelAnimationFrame(timer.raf);
    const step = () => {
      if (timer.phase === 'run') $('clockTime').textContent = fmt(now() - timer.t0);
      else if (timer.phase === 'inspect' || timer.phase === 'ihold' || timer.phase === 'iready') {
        const left = inspectLeft();
        $('clockTime').textContent = left > 0 ? String(Math.ceil(left / 1000)) : left > -2000 ? '+2' : 'DNF';
      } else return;
      timer.raf = requestAnimationFrame(step);
    };
    timer.raf = requestAnimationFrame(step);
  }
  function startInspection() {
    timer.insp0 = now();
    setPhase('inspect');
    tick();
  }
  function startRun(at, startState) {
    timer.t0 = at || now();
    timer.scr = scramble;
    timer.pen = penaltyNow();
    timer.line = cube && cube.on ? [{ t: 0, st: startState || cube.state }] : null;
    timer.startState = startState || (cube && cube.state);
    track = null;
    setPhase('run');
    tick();
    renderLive();
  }
  function stopRun(at) {
    if (timer.phase !== 'run') return;
    const end = at || now();
    timer.t = Math.round(end - timer.t0);
    cancelAnimationFrame(timer.raf);
    const r = { at: Date.now(), t: timer.t, pen: timer.pen || 0, scr: timer.scr || scramble };
    if (timer.line && timer.line.length > 1) {
      const sp = C.splits(timer.line, settings.cross);
      if (sp && sp.steps[0].done) {
        r.sp = { f: sp.face, s: sp.steps.map((s) => (s.done ? [Math.round(s.time), s.moves, s.recog == null ? null : Math.round(s.recog), s.case || null, s.skip ? 1 : 0] : null)) };
      }
    }
    timer.insp0 = 0;
    times.push(r);
    if (times.length > 2000) times = times.slice(-2000);
    save(K.times, times);
    timer.last = r;
    // The next turn is scrambling again, not a new solve.
    if (follow && cube && cube.on && !locate(follow, cube.state)) markLost();
    if (follow && follow.pos >= follow.n) { follow.pos = 0; follow.lost = true; }
    $('clockTime').textContent = fmtRes(r);
    setPhase('done');
    if (cube && cube.on && isSolved(cube.state) && settings.sound) window.SmartCube.chime();
    renderSplits(r);
    renderStats();
    emit('result', r);
    newScramble();
  }
  function cancel() {
    cancelAnimationFrame(timer.raf);
    timer.insp0 = 0;
    timer.line = null;
    $('clockTime').textContent = fmt(0);
    setPhase('idle');
    renderScramble();
    emit('timer', { ...timerState(), cancelled: true });
  }
  function renderClock() {
    const p = timer.phase;
    const el = $('clock');
    el.dataset.phase = p === 'hold' || p === 'ihold' ? 'hold' : p === 'ready' || p === 'iready' ? 'ready' : p;
    const armed = cube && cube.on && settings.timed && done(follow) && (p === 'idle' || p === 'inspect');
    const label = {
      idle: armed ? 'Listo · empieza al girar' : 'Listo', hold: 'Mantén…', ready: 'Suelta para empezar', inspect: 'Inspección',
      ihold: 'Mantén…', iready: 'Suelta para empezar', run: 'En marcha', done: timer.last && timer.last.pen === 'dnf' ? 'DNF' : 'Tiempo',
    }[p] || '';
    $('clockPhase').textContent = label;
    let sub = '';
    if (p === 'idle' || p === 'done') {
      sub = cube && cube.on && settings.timed
        ? (armed ? 'Gira y empieza · o mantén Espacio y suelta' : 'Mezcla el cubo con el scramble · o mantén Espacio y suelta')
        : `Mantén pulsado y suelta para empezar${settings.inspect ? ' la inspección' : ''}`;
      if (p === 'done' && timer.last) sub = `${timer.last.pen === 2 ? '+2 por pasarte de 15 s · ' : ''}${sub}`;
    } else if (p === 'inspect') sub = cube && cube.on ? 'Empieza con tu primer giro (o mantén Espacio y suelta)' : 'Mantén y suelta para empezar';
    else if (p === 'run') sub = cube && cube.on ? 'Se para solo al resolverlo · o pulsa para parar' : 'Pulsa para parar';
    $('clockSplit').textContent = sub;
    if (p === 'idle' && !timer.last) $('clockTime').textContent = fmt(0);
    $('clock').hidden = !settings.timed;
  }
  // Space is the timer's even on a focused button or checkbox; not while writing.
  const typing = (el) => el && ((el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes(el.type)) || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  function press() {
    const p = timer.phase;
    if (p === 'run') { stopRun(); return true; }
    if (p === 'idle' || p === 'done') { timer.hold = setTimeout(() => { if (timer.phase === 'hold') setPhase('ready'); }, HOLD_MS); setPhase('hold'); return true; }
    if (p === 'inspect') { timer.hold = setTimeout(() => { if (timer.phase === 'ihold') setPhase('iready'); }, HOLD_MS); setPhase('ihold'); return true; }
    return false;
  }
  function release() {
    clearTimeout(timer.hold);
    const p = timer.phase;
    if (p === 'ready') { window.SmartCube && window.SmartCube.unlockAudio(); if (settings.inspect) startInspection(); else startRun(); } else if (p === 'iready') startRun();
    else if (p === 'hold') setPhase(timer.last ? 'done' : 'idle');
    else if (p === 'ihold') setPhase('inspect');
  }
  document.addEventListener('keydown', (ev) => {
    if (view !== 'crono' || !settings.timed || typing(ev.target)) return;
    if (ev.key === 'Escape') { if (['inspect', 'ihold', 'iready', 'run', 'hold', 'ready'].includes(timer.phase)) { ev.preventDefault(); cancel(); } return; }
    if (timer.phase === 'run' && !ev.repeat && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { ev.preventDefault(); stopRun(); return; }
    if (ev.key !== ' ') return;
    ev.preventDefault();
    if (ev.repeat) return;
    press();
  });
  document.addEventListener('keyup', (ev) => {
    if (ev.key !== ' ' || view !== 'crono' || !settings.timed || typing(ev.target)) return;
    ev.preventDefault();
    release();
  });
  const clockEl = $('clock');
  clockEl.addEventListener('pointerdown', (ev) => { if (ev.button === 0 && press()) { ev.preventDefault(); clockEl.setPointerCapture && clockEl.setPointerCapture(ev.pointerId); } });
  clockEl.addEventListener('pointerup', () => release());
  clockEl.addEventListener('pointercancel', () => { if (timer.phase === 'hold' || timer.phase === 'ready') cancel(); });
  clockEl.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') ev.preventDefault(); });
  clockEl.addEventListener('click', (ev) => ev.preventDefault());

  // ================= The smart cube =================
  let cube = null;
  let prevState = null;
  let track = null;   // the last-layer case being done: its turns, to show how far along
  cube = window.SmartCube ? window.SmartCube.start({
    info: 'Conecta un GAN: sigue el scramble, empieza y para solo, saca tus tiempos por fase y te dice el caso y el algoritmo.',
    onStatus: () => { renderAll(); },
    onState: (st) => {
      prevState = st;
      if (follow && !locate(follow, st)) markLost();
      track = null;
      if (timer.phase === 'run' && timer.line) timer.line.push({ t: now() - timer.t0, st });
      trSync();
      renderAll();
    },
    onMove: (mv, st, t) => {
      const before = prevState;
      prevState = st;
      if (timer.phase === 'run') {
        if (timer.line) timer.line.push({ t: t - timer.t0, st });
        if (isSolved(st)) stopRun(t);
      } else if (settings.timed && view === 'crono' && done(follow) && (timer.phase === 'idle' || timer.phase === 'inspect' || timer.phase === 'done') && !trActive()) {
        // The first turn after scrambling starts the clock.
        startRun(t, before);
        timer.line.push({ t: 0, st });
      } else if (follow && !trActive()) {
        if (timer.phase === 'done') setPhase('idle');
        const was = done(follow);
        followMove(follow, st, mv);
        if (!was && done(follow) && settings.timed && settings.inspect && timer.phase === 'idle') startInspection();
      }
      if (trActive()) trMove(mv, st, t);
      renderScramble();
      renderLive();
      renderClock();
      emit('cube', null);
    },
  }) : null;
  // The virtual cube's own buttons.
  const simBox = $('cubeSimBox');
  function renderSim() { simBox.hidden = !(cube && cube.on && cube.kind === 'sim'); }
  simBox.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const v = $('cubeSimMoves').value.trim();
    if (!v || !cube.link) return;
    try { parseAlg(v); } catch (e) { toast('No entiendo esos movimientos'); return; }
    cube.link.turn(v);
    $('cubeSimMoves').value = '';
  });
  $('cubeSimScr').addEventListener('click', () => { if (cube.link && scramble) cube.link.play([scramble], 30); });
  // Solves it the CFOP way from where it is, for trying the splits: the shortest cross and, if the first two
  // layers are then done (it has no F2L solver), J Perm's algorithms, as held with the cross colour down.
  $('cubeSimSolve').addEventListener('click', () => {
    if (!cube.link) return;
    const plan = simSolution(cube.state);
    if (plan) cube.link.play(plan, 10);
  });
  function simSolution(st) {
    const face = settings.cross;
    const rot = C.DOWN[face];
    const out = rot ? [rot] : [];
    let g = rot ? apply(st, rot) : st;
    const x = C.bestCross(st, face);
    if (x.moves) { out.push(x.moves); g = apply(g, x.moves); }
    if (C.stageOf(g).stage < 2) {
      toast('El cubo virtual solo sabe hacer la cruz y la última capa: las parejas, gíralas tú');
      return out.length > (rot ? 1 : 0) ? [...out, rot ? invertAlg(rot) : ''].filter(Boolean) : null;
    }
    for (let guard = 0; guard < 6; guard++) {
      const s = C.stageOf(g).stage;
      if (s === 6) break;
      const r = C.recognize(g, s);
      if (!r) break;
      const alg = [r.view, r.pre, r.case ? r.case.alg : '', r.post].filter(Boolean).join(' ');
      out.push(alg);
      g = apply(g, alg);
    }
    return out;
  }

  // ================= Live help =================
  const SLOT_NAMES = (g) => C.SLOTS.map(([c]) => c.filter((i) => Math.floor(i / 9) !== 3).map((i) => COLOR_NAME[faceOfSticker(g[Math.floor(i / 9) * 9 + 4])]).join('-'));
  function liveVisible() {
    if (!cube || !cube.on) return false;
    if (view !== 'crono') return false;
    if (!settings.timed) return true;
    if (timer.phase === 'run') return settings.help;
    return true;
  }
  let liveCross = false;
  // Part way through the case being done: where along its turns (the first two layers come apart in the
  // middle of most algorithms, so the stage alone would say F2L).
  function onTrack(st) {
    if (!track) return false;
    const k = key(st);
    const i = track.keys.indexOf(k);
    if (i >= 0 && i < track.keys.length - 1) { track.pos = i; return true; }
    const h = track.half.indexOf(k);
    if (h >= 0) { track.pos = track.halfAt[h]; return true; }
    return false;
  }
  // Recognise the case of a last-layer step and keep its turns, as the cube will report them.
  function startTrack(read) {
    const rec = C.recognize(read.g, read.stage);
    if (!rec) { track = null; return null; }
    const seq = [rec.pre, rec.case ? rec.case.alg : '', rec.post].filter(Boolean).join(' ');
    const moves = parseAlg(seq).map((m) => m.text);
    let s = rec.view ? apply(read.g, rec.view) : read.g;   // held with that side in front
    const keys = [key(norm(s))];
    const half = [];
    const halfAt = [];
    moves.forEach((m, j) => {
      const before = norm(s);
      s = apply(s, m);
      const after = norm(s);
      partialKeys(before, after).forEach((x) => { half.push(x); halfAt.push(j); });
      keys.push(key(after));
    });
    track = { stage: read.stage, face: read.face, rec, moves, keys, half, halfAt, pos: 0 };
    return track;
  }
  // What the live help shows: the step (the case's, while doing it) and the case.
  function liveInfo(st) {
    const read = C.readCube(st, settings.cross);
    if (isSolved(st)) { track = null; return { read, stage: 6, track: null }; }
    if (onTrack(st)) return { read, stage: track.stage, track };
    track = null;
    if (read.stage >= 2 && read.stage < 6) startTrack(read);
    return { read, stage: read.stage, track };
  }
  function renderLive() {
    const box = $('live');
    box.hidden = !liveVisible();
    if (box.hidden) return;
    const st = cube.state;
    const scrambled = !follow || done(follow) || !settings.timed || timer.phase === 'run';
    const info = liveInfo(st);
    const read = info.read;
    const stage = info.stage;
    // The steps, with the times reached in this solve.
    const reached = timer.phase === 'run' && timer.line ? liveSplits() : null;
    const solvedNow = stage === 6;
    $('liveSteps').innerHTML = C.STEPS.map((s, i) => {
      let cls = solvedNow || stage > i ? 'done' : stage === i ? 'cur' : '';
      if (!scrambled && !solvedNow) cls = '';
      const extra = s.id === 'f2l' && stage === 1 && scrambled
        ? ` <span class="fr-dots">${read.pairs.map((p) => `<i class="${p ? 'on' : ''}"></i>`).join('')}</span>` : '';
      const t = reached && reached[i] != null ? `<span class="fr-st">${f1(reached[i])}</span>` : '';
      return `<li class="${cls}"><span>${s.name}</span>${extra}${t}</li>`;
    }).join('');
    const nowBox = $('liveNow');
    let html = '';
    if (solvedNow) {
      html = timer.phase === 'done' || !settings.timed
        ? '<p class="fr-big ok">¡Resuelto!</p>'
        : '<p class="fr-note">Cubo resuelto. Mézclalo con el scramble de arriba.</p>';
    } else if (!scrambled) {
      html = '<p class="fr-note">Cuando acabes de mezclar, aquí verás cada paso: la cruz, las parejas y el caso de la última capa con su algoritmo.</p>';
    } else if (info.track) {
      html = caseHtml(info.track);
    } else if (stage === 0) {
      html = `<p class="fr-note"><b>${esc(read.crossName[0].toUpperCase() + read.crossName.slice(1))}:</b> ${read.cross} de 4 aristas.</p>`;
      if (liveCross) {
        const x = C.bestCross(st, read.face);
        html += `<p class="fr-note">Lo más corto desde aquí, con el ${esc(read.colour)} abajo: ${x.moves ? algHtml(x.moves) : '<i>nada</i>'} <span class="muted">(${x.length})</span></p>`;
      } else html += '<button class="btn" type="button" id="liveCrossBtn">¿Cómo la acabo?</button>';
    } else if (stage === 1) {
      const names = SLOT_NAMES(read.g);
      html = `<p class="fr-note"><b>F2L:</b> ${read.n} de 4 parejas.</p><ul class="fr-slots">${read.pairs.map((p, i) => `<li class="${p ? 'on' : ''}">${p ? '✓ ' : ''}${esc(names[i])}</li>`).join('')}</ul>`
        + '<p class="hint">Junta cada esquina blanca con su arista arriba y métela en su hueco a la vez.</p>';
    } else html = '<p class="fr-note">No reconozco este caso.</p>';
    if (nowBox.dataset.h !== html) {
      nowBox.dataset.h = html;
      nowBox.innerHTML = html;
      const b = $('liveCrossBtn');
      if (b) b.addEventListener('click', () => { liveCross = true; nowBox.dataset.h = ''; renderLive(); });
    }
  }
  // The case, how to hold it, its turns (done, next) and how far along.
  function caseHtml(t) {
    const r = t.rec;
    const step = C.STEPS[t.stage];
    if (!r.case) {
      return `<p class="fr-note"><b>${step.name}:</b> solo falta girar la capa de arriba: <span class="fr-alg-big">${algHtml(r.post)}</span></p>`;
    }
    const c = r.case;
    const nPre = r.pre ? 1 : 0;
    const algLen = parseAlg(c.alg).length;
    const pos = t.pos;
    const chips = t.moves.map((m, j) => {
      const part = j < nPre ? 'pre' : j >= nPre + algLen ? 'post' : '';
      const cls = `${j < pos ? 'done' : j === pos ? 'next' : ''} ${part}`.trim();
      return `<span class="sm ${cls}">${esc(m)}</span>`;
    }).join(' ');
    const top = r.top ? r.top[0].toUpperCase() + r.top.slice(1) : 'Amarillo';
    const extra = [r.pre ? `antes <b>${esc(r.pre)}</b>` : '', r.post ? `al final <b>${esc(r.post)}</b>` : ''].filter(Boolean).join(', ');
    return `<div class="fr-case">
      <div class="fr-case-pic">${topView(r.g, { mode: modeOf(c.step), arrows: c.step.startsWith('pll'), label: `Tu ${step.name}: ${c.name}` })}</div>
      <div class="fr-case-text">
        <span class="field-title">${esc(step.name)} · ${esc(step.long)}</span>
        <b class="fr-case-name">${esc(c.name)}${c.es !== c.name ? ` <span class="muted">· ${esc(c.es)}</span>` : ''}</b>
        <p class="fr-hold">${esc(top)} arriba y el <b>${esc(r.front)}</b> delante${extra ? `; ${extra}` : ''}.</p>
        <p class="fr-moves">${chips}</p>
        <p class="hint">${pos ? `${Math.min(pos, t.moves.length)} de ${t.moves.length}` : esc(c.look)}</p>
      </div>
    </div>`;
  }
  // Time at which each step was reached in the solve under way (worked out again only after a new turn).
  let splitsMemo = { line: null, n: -1, out: null };
  function liveSplits() {
    if (splitsMemo.line === timer.line && splitsMemo.n === timer.line.length) return splitsMemo.out;
    const sp = C.splits(timer.line, settings.cross);
    const out = sp ? sp.steps.map((s) => (s.done ? s.end : null)) : null;
    splitsMemo = { line: timer.line, n: timer.line.length, out };
    return out;
  }

  // ================= After a solve: the splits =================
  function renderSplits(r) {
    const box = $('splits');
    if (!r || !r.sp) { box.hidden = true; return; }
    box.hidden = false;
    const s = r.sp.s;
    const total = s.reduce((a, x) => a + (x ? x[0] : 0), 0) || 1;
    const groups = [['Cruz', [0]], ['F2L', [1]], ['OLL', [2, 3]], ['PLL', [4, 5]]];
    const bar = groups.map(([name, idx]) => {
      const t = idx.reduce((a, i) => a + (s[i] ? s[i][0] : 0), 0);
      return `<span class="fr-seg fr-seg-${name.toLowerCase()}" style="flex-grow:${Math.max(1, t)}" title="${name} ${f1(t)} s"><b>${name}</b> ${f1(t)}</span>`;
    }).join('');
    const rows = C.STEPS.map((st, i) => {
      const x = s[i];
      if (!x) return `<tr><th scope="row">${st.name}</th><td colspan="4" class="muted">sin acabar</td></tr>`;
      const [t, moves, recog, caseId, skip] = x;
      const tps = t > 0 ? (moves / (t / 1000)).toFixed(1) : '—';
      const c = caseId ? C.caseById(caseId) : null;
      const what = skip ? '<span class="muted">salto</span>' : c ? esc(c.name) : '';
      const rx = recog != null && !skip ? `<span class="muted">${f1(recog)} + ${f1(t - recog)}</span>` : '';
      return `<tr><th scope="row">${st.name}</th><td>${f1(t)}</td><td>${moves}<span class="muted"> · ${tps} TPS</span></td><td>${what}</td><td>${rx}</td></tr>`;
    }).join('');
    box.innerHTML = `<div class="fr-splits-head"><span class="field-title">Tu solve por fases · ${esc(C.crossName(r.sp.f))}</span><b>${fmtRes(r)}</b></div>
      <div class="fr-bar">${bar}</div>
      <div class="fr-table"><table><thead><tr><th scope="col">Paso</th><th scope="col">Tiempo</th><th scope="col">Giros</th><th scope="col">Caso</th><th scope="col">Reconocer + hacer</th></tr></thead><tbody>${rows}</tbody></table></div>`
      + (total ? '' : '');
  }

  // ================= Stats and history =================
  let histShown = 25;
  function renderStats() {
    const ok = times.filter((r) => r.pen !== 'dnf');
    const best = ok.length ? Math.min(...ok.map(value)) : null;
    const mean = ok.length ? ok.reduce((a, r) => a + value(r), 0) / ok.length : null;
    const cells = [
      ['Solves', String(times.length)],
      ['Mejor', fmt(best)],
      ['ao5', fmt(avgOf(times, 5))],
      ['ao12', fmt(avgOf(times, 12))],
      ['ao100', fmt(avgOf(times, 100))],
      ['Media', fmt(mean)],
    ];
    $('stats').innerHTML = times.length ? cells.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('') : '';
    renderPhases();
    renderHistory();
  }
  // Average of each step over the last 12 solves timed with the cube.
  function renderPhases() {
    const withSp = times.filter((r) => r.sp && r.pen !== 'dnf' && r.sp.s.every(Boolean)).slice(-12);
    const box = $('phases');
    box.hidden = withSp.length < 1;
    if (box.hidden) return;
    $('phasesN').textContent = `· media de ${withSp.length} ${withSp.length === 1 ? 'solve' : 'solves'} con el cubo`;
    const avg = (i, j) => withSp.reduce((a, r) => a + (j == null ? r.sp.s[i][j == null ? 0 : j] : 0) + 0, 0) / withSp.length;
    const recogAvg = (idx) => withSp.reduce((a, r) => a + idx.reduce((b, i) => b + (r.sp.s[i][2] || 0), 0), 0) / withSp.length;
    const groups = [['Cruz', [0]], ['F2L', [1]], ['OLL', [2, 3]], ['PLL', [4, 5]]];
    const vals = groups.map(([name, idx]) => [name, idx.reduce((a, i) => a + avg(i), 0), idx.length > 1 ? recogAvg(idx) : null]);
    const total = vals.reduce((a, v) => a + v[1], 0) || 1;
    $('phaseBar').innerHTML = vals.map(([name, t]) => `<span class="fr-seg fr-seg-${name.toLowerCase()}" style="flex-grow:${Math.max(1, t)}"><b>${name}</b> ${f1(t)}</span>`).join('');
    $('phaseLegend').innerHTML = vals.map(([name, t, rec]) => `<span><b>${name}</b> ${f1(t)} s · ${Math.round((t / total) * 100)} %${rec != null ? ` <span class="muted">(${f1(rec)} s reconociendo)</span>` : ''}</span>`).join('');
  }
  function renderHistory() {
    const box = $('history');
    if (!times.length) { box.innerHTML = '<p class="empty-note">Aún no hay tiempos. Mantén pulsado el reloj (o Espacio) y suelta para empezar.</p>'; $('histMore').hidden = true; return; }
    const list = times.map((r, i) => ({ r, i })).reverse().slice(0, histShown);
    const step = (r, idx) => (r.sp && idx.every((i) => r.sp.s[i]) ? f1(idx.reduce((a, i) => a + r.sp.s[i][0], 0)) : '—');
    const cases = (r) => (r.sp ? [2, 3, 4, 5].map((i) => { const x = r.sp.s[i]; if (!x) return null; if (x[4]) return 'salto'; const c = x[3] && C.caseById(x[3]); return c ? c.name.replace('PLL (', '').replace(')', '') : null; }).filter(Boolean).join(' · ') : '');
    box.innerHTML = `<table><thead><tr><th scope="col">#</th><th scope="col">Tiempo</th><th scope="col">ao5</th><th scope="col">Cruz</th><th scope="col">F2L</th><th scope="col">OLL</th><th scope="col">PLL</th><th scope="col">Casos</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead><tbody>${
      list.map(({ r, i }) => {
        const a5 = avgOf(times.slice(0, i + 1), 5);
        return `<tr><td class="muted">${i + 1}</td><td><b>${fmtRes(r)}</b></td><td class="muted">${a5 == null ? '' : fmt(a5)}</td>`
          + `<td>${step(r, [0])}</td><td>${step(r, [1])}</td><td>${step(r, [2, 3])}</td><td>${step(r, [4, 5])}</td><td class="fr-cases">${esc(cases(r))}</td>`
          + `<td class="fr-acts"><button class="x" type="button" data-pen="2" data-i="${i}" aria-label="Poner o quitar +2 al solve ${i + 1}" aria-pressed="${r.pen === 2}">+2</button>`
          + `<button class="x" type="button" data-pen="dnf" data-i="${i}" aria-label="Marcar o desmarcar DNF el solve ${i + 1}" aria-pressed="${r.pen === 'dnf'}">DNF</button>`
          + `<button class="x" type="button" data-del="${i}" aria-label="Borrar el solve ${i + 1}">×</button></td></tr>`;
      }).join('')}</tbody></table>`;
    $('histMore').hidden = times.length <= histShown;
  }
  $('history').addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.del != null) {
      const i = Number(b.dataset.del);
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '¿Borrar?'; b.classList.add('armed'); setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; b.textContent = '×'; b.classList.remove('armed'); } }, 3000); return; }
      if (times[i] === timer.last) timer.last = null;
      times.splice(i, 1);
    } else if (b.dataset.pen) {
      const r = times[Number(b.dataset.i)];
      const p = b.dataset.pen === '2' ? 2 : 'dnf';
      r.pen = r.pen === p ? 0 : p;
    } else return;
    save(K.times, times);
    renderStats();
    emit('result', null);
  });
  $('histMore').addEventListener('click', () => { histShown += 50; renderHistory(); });

  // ================= A case by hand =================
  // From a solved cube held with the cross colour down and green in front: the turns that leave it in the
  // case (J Perm's algorithm backwards, or a mix that does not give the case away), what it then looks like,
  // and how to solve it so that it ends solved: the side in front, the top turn before, the algorithm and
  // the top turn after.
  async function makeTry(c, hidden) {
    const rot = C.DOWN[settings.cross];
    const ref = rot ? apply(solved(), rot) : solved();
    const inv = invertAlg(c.alg);
    if (!hidden) {
      const g = apply(ref, inv);
      return { c, hidden: false, setup: inv, g, front: C.colour(g, 22), top: C.colour(g, 4), pre: '', post: '' };
    }
    const v = rnd(C.VIEWS);
    const a1 = rnd(C.AUF);
    const a2 = rnd(C.AUF);
    const held = v ? apply(ref, v) : ref;   // the side that will be in front when solving it
    const target = norm(apply(held, [a1, inv, a2].filter(Boolean).join(' ')));
    const s = await M.withTimeout(M.solveState(toFacelets(target)), 25000);
    if (key(apply(solved(), s)) !== key(target)) throw new Error('la mezcla no llega al caso');
    return {
      c, hidden: true, setup: inHand(s, faceMapFor(rot)), g: C.canon(target, settings.cross),
      front: C.colour(held, 22), top: C.colour(held, 4), pre: a2 ? invertAlg(a2) : '', post: a1 ? invertAlg(a1) : '',
    };
  }
  const cap = (x) => x[0].toUpperCase() + x.slice(1);
  const setupChips = (alg) => parseAlg(alg).map((m) => `<span class="sm">${esc(m.text)}</span>`).join(' ');
  const tryHow = (t) => `${esc(cap(t.top))} arriba y el <b>${esc(t.front)}</b> delante: ${t.pre ? `<b class="fr-auf">${esc(t.pre)}</b> · ` : ''}${algHtml(t.c.alg)}${t.post ? ` · <b class="fr-auf">${esc(t.post)}</b>` : ''}`;
  const holdText = () => `${esc(COLOR_NAME[settings.cross])} abajo y verde delante`;
  function tryHtml(t) {
    const step = C.STEPS.find((s) => s.id === t.c.step);
    return `<ol class="fr-try-steps">
      <li><span>Con el cubo resuelto, ${holdText()}, haz:</span><p class="fr-setup">${setupChips(t.setup)}</p></li>
      <li><span>Te queda <b>${esc(t.c.name)}</b> (${esc(step.name)}):</span><div class="fr-try-pic">${topView(t.g, { mode: modeOf(t.c.step), arrows: t.c.step.startsWith('pll'), label: `Así queda: ${t.c.name}` })}</div></li>
      <li><span>Resuélvelo: ${tryHow(t)}</span></li>
    </ol>
    <div class="actions"><button class="btn" type="button" data-try-mode="hidden">${t.hidden ? 'Otra mezcla' : 'Una mezcla que no lo delate'}</button>${t.hidden ? '<button class="btn" type="button" data-try-mode="short">La mezcla corta</button>' : ''}</div>
    <p class="hint">${t.hidden ? 'Una mezcla cualquiera que acaba en este caso, visto desde otro lado: así practicas reconocerlo.' : 'La mezcla corta es el algoritmo al revés: fácil de hacer, pero se nota qué caso es.'} Al resolverlo, el cubo queda resuelto otra vez.</p>`;
  }
  async function showTry(card, c, hidden) {
    const box = card.querySelector('.fr-try');
    box.hidden = false;
    if (hidden) box.innerHTML = '<p class="fr-note">Preparando una mezcla…</p>';
    let t;
    try { t = await makeTry(c, hidden); } catch (e) { t = await makeTry(c, false); toast('No he podido generar la mezcla: te pongo la corta'); }
    box.innerHTML = tryHtml(t);
    card.querySelector('[data-try]').setAttribute('aria-expanded', 'true');
  }

  // ================= Casos =================
  const STATUS = [['new', 'Nuevo'], ['learning', 'Aprendiendo'], ['known', 'Me lo sé']];
  const statusOf = (id) => learn[id] || 'new';
  function trainLine(id) {
    const t = train[id];
    if (!t) return '';
    const bits = [];
    if (t.n) bits.push(`con el cubo: media ${f1(t.sum / t.n)} s${t.rsum != null ? ` (${f1(t.rsum / t.n)} reconociendo)` : ''} · mejor ${f1(t.best)} s · ${t.n} ${t.n === 1 ? 'vez' : 'veces'}`);
    if (t.qn) bits.push(`reconociendo: ${Math.round((t.qok / t.qn) * 100)} % · ${f1(t.qsum / t.qn)} s`);
    if (t.mn) bits.push(`con tu cubo: ${Math.round((t.mok / t.mn) * 100)} % acertados (${t.mn})`);
    return bits.join(' · ');
  }
  function renderCases() {
    const groups = C.LL.map((step) => {
      const s = C.STEPS.find((x) => x.id === step);
      const cases = C.CASES.filter((c) => c.step === step);
      return `<section class="panel" aria-labelledby="h-${step}">
        <div class="panel-head"><h2 id="h-${step}">${s.name} · ${s.long} <span class="muted">(${cases.length})</span></h2></div>
        <div class="fr-cards">${cases.map((c) => `<article class="fr-card" data-case="${c.id}">
          <div class="fr-card-pic">${casePicture(c)}</div>
          <div class="fr-card-body">
            <h3>${esc(c.name)}${c.es !== c.name ? ` <span class="muted">· ${esc(c.es)}</span>` : ''}</h3>
            <p class="fr-card-alg">${algHtml(c.alg)}</p>
            <p class="fr-card-look">${esc(c.look)}</p>
          </div>
          <div class="fr-card-foot">
            <div class="seg small" role="group" aria-label="${esc(c.name)}: cómo lo llevas">${STATUS.map(([v, l]) => `<button type="button" data-learn="${v}" aria-pressed="${statusOf(c.id) === v}">${l}</button>`).join('')}</div>
            <button class="btn" type="button" data-try aria-expanded="false">Pruébalo</button>
            <button class="btn" type="button" data-train="${c.id}">Entrenar</button>
            <p class="hint fr-card-stats">${esc(trainLine(c.id))}</p>
          </div>
          <div class="fr-try" hidden></div>
        </article>`).join('')}</div>
      </section>`;
    }).join('');
    $('caseGroups').innerHTML = groups;
  }
  $('caseGroups').addEventListener('click', (ev) => {
    const card = ev.target.closest('[data-case]');
    if (!card) return;
    const id = card.dataset.case;
    const l = ev.target.closest('[data-learn]');
    if (l) {
      learn[id] = l.dataset.learn;
      if (learn[id] === 'new') delete learn[id];
      save(K.learn, learn);
      card.querySelectorAll('[data-learn]').forEach((b) => b.setAttribute('aria-pressed', String(b === l)));
      renderPick();
      return;
    }
    const tryBtn = ev.target.closest('[data-try]');
    if (tryBtn) {
      const box = card.querySelector('.fr-try');
      if (!box.hidden) { box.hidden = true; tryBtn.setAttribute('aria-expanded', 'false'); return; }
      showTry(card, C.caseById(id), false);
      return;
    }
    const mode = ev.target.closest('[data-try-mode]');
    if (mode) { showTry(card, C.caseById(id), mode.dataset.tryMode === 'hidden'); return; }
    if (ev.target.closest('[data-train]')) {
      pick = [id];
      save(K.pick, pick);
      renderPick();
      tr.c = null;
      showView('entrenar');
    }
  });

  // ================= Entrenar =================
  let pick = load(K.pick, C.CASES.map((c) => c.id));
  if (!Array.isArray(pick) || !pick.length) pick = C.CASES.map((c) => c.id);
  function renderPick() {
    $('trPick').innerHTML = C.LL.map((step) => {
      const s = C.STEPS.find((x) => x.id === step);
      return `<div class="fr-pick-row"><span class="field-title">${s.name}</span>${C.CASES.filter((c) => c.step === step).map((c) => `<button type="button" class="fr-chip${statusOf(c.id) === 'learning' ? ' learning' : ''}" data-pickc="${c.id}" aria-pressed="${pick.includes(c.id)}">${esc(c.name.replace('PLL (', '').replace(')', ''))}</button>`).join('')}</div>`;
    }).join('');
  }
  $('trPick').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-pickc]');
    if (!b) return;
    const id = b.dataset.pickc;
    pick = pick.includes(id) ? pick.filter((x) => x !== id) : [...pick, id];
    if (!pick.length) pick = [id];
    save(K.pick, pick);
    renderPick();
    if (tr.c && !pick.includes(tr.c.id)) trNext();
  });
  document.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
    const p = b.dataset.pick;
    let ids = C.CASES.filter((c) => p === 'all' || (p === 'oll' && c.step.startsWith('oll')) || (p === 'pll' && c.step.startsWith('pll')) || (p === 'learning' && statusOf(c.id) === 'learning')).map((c) => c.id);
    if (!ids.length) { toast('Marca en «Casos» los que estás aprendiendo'); return; }
    pick = ids;
    save(K.pick, pick);
    renderPick();
    trNext();
  }));
  // Cases come up more often the fewer times and the slower they have gone.
  function nextCase(avoid) {
    const pool = C.CASES.filter((c) => pick.includes(c.id));
    const w = pool.map((c) => {
      const t = train[c.id] || {};
      const m = settings.trMode;
      const n = m === 'cube' ? t.n || 0 : m === 'hand' ? t.mn || 0 : t.qn || 0;
      const slow = m === 'cube' ? (t.n ? t.sum / t.n / 1000 : 4)
        : m === 'hand' ? (t.mn ? 1 + (1 - t.mok / t.mn) * 4 : 3)
          : (t.qn ? (t.qsum / t.qn) / 1000 + (1 - t.qok / t.qn) * 3 : 3);
      return (c.id === avoid && pool.length > 1 ? 0.15 : 1) * (1 + 3 / (1 + n)) * (0.5 + slow);
    });
    let x = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }
  const tr = { c: null, target: null, setup: '', follow: null, map: null, ready: 0, first: 0, goal: 0, busy: false, result: null, qStart: 0, qAuf: '', qView: '', answered: false, err: '', hand: null };
  const trActive = () => view === 'entrenar' && settings.trMode === 'cube' && cube && cube.on && !!tr.c;
  function renderTrMode() {
    const m = settings.trMode;
    $('trModeCube').setAttribute('aria-pressed', String(m === 'cube'));
    $('trModeHand').setAttribute('aria-pressed', String(m === 'hand'));
    $('trModeLook').setAttribute('aria-pressed', String(m === 'look'));
  }
  function setTrMode(m) {
    settings.trMode = m;
    saveSettings();
    renderTrMode();
    trNext();
  }
  if (!['cube', 'hand', 'look'].includes(settings.trMode)) settings.trMode = 'cube';
  renderTrMode();
  $('trModeCube').addEventListener('click', () => setTrMode('cube'));
  $('trModeHand').addEventListener('click', () => setTrMode('hand'));
  $('trModeLook').addEventListener('click', () => setTrMode('look'));
  // A state with the first two layers solved (cross colour down) whose last layer shows this case, from a
  // random side and with the rest of the last layer random as it would be.
  function caseTarget(c) {
    const face = settings.cross;
    const extra = {
      oll1: () => `${rnd(['', ...C.CASES.filter((x) => x.step === 'oll2').map((x) => invertAlg(x.alg))])} ${rnd(C.AUF)} ${rnd(['', ...C.CASES.filter((x) => x.step.startsWith('pll')).map((x) => invertAlg(x.alg))])}`,
      oll2: () => `${rnd(['', ...C.CASES.filter((x) => x.step.startsWith('pll')).map((x) => invertAlg(x.alg))])} ${rnd(C.AUF)}`,
      pll1: () => `${rnd(['', ...C.CASES.filter((x) => x.step === 'pll2').map((x) => invertAlg(x.alg))])} ${rnd(C.AUF)}`,
      pll2: () => '',
    }[c.step]();
    const seq = `${rnd(C.VIEWS)} ${extra} ${rnd(C.AUF)} ${invertAlg(c.alg)} ${rnd(C.AUF)}`.replace(/\s+/g, ' ').trim();
    return norm(apply(apply(solved(), C.DOWN[face]), seq));
  }
  async function trNext() {
    tr.result = null;
    tr.err = '';
    tr.answered = false;
    if (!pick.length) return;
    tr.c = nextCase(tr.c && tr.c.id);
    if (settings.trMode === 'look') {
      tr.qAuf = rnd(C.AUF);
      tr.qView = rnd(C.VIEWS);
      tr.qStart = now();
      renderTrain();
      return;
    }
    if (settings.trMode === 'hand') {
      const c = tr.c;
      tr.hand = null;
      renderTrain();
      let t;
      try { t = await makeTry(c, true); } catch (e) { t = await makeTry(c, false); }
      if (tr.c !== c || settings.trMode !== 'hand') return;
      tr.hand = t;
      renderTrain();
      return;
    }
    tr.target = null;
    tr.follow = null;
    renderTrain();
    if (!cube || !cube.on) return;
    await trPrepare();
  }
  // The turns that take the cube from where it is to the case, held with the cross colour down.
  async function trPrepare() {
    const c = tr.c;
    const from = cube.state;
    tr.follow = null;
    tr.ready = 0;
    tr.err = '';
    const target = caseTarget(c);
    tr.busy = true;
    renderTrain();
    let moves = null;
    try {
      // State to solve: from^-1 ∘ target, so that its scramble takes `from` to `target`.
      const inv = new Array(54);
      from.forEach((id, i) => { inv[id] = i; });
      const x = target.map((id) => inv[id]);
      const s = await M.withTimeout(M.solveState(toFacelets(x)), 25000);
      moves = s ? parseAlg(s).map((m) => m.text) : [];
      if (key(apply(from, moves.join(' '))) !== key(target)) moves = null;
    } catch (e) { moves = null; }
    tr.busy = false;
    if (tr.c !== c) return;
    if (!moves) { tr.err = 'No he podido preparar el caso: el generador de scrambles no ha cargado. Comprueba la conexión y vuelve a intentarlo.'; renderTrain(); return; }
    tr.target = target;
    tr.setup = moves.join(' ');
    tr.map = faceMapFor(C.DOWN[settings.cross]);
    tr.follow = makeFollow(from, moves);
    locate(tr.follow, cube.state);
    tr.ready = done(tr.follow) ? now() : 0;
    tr.first = 0;
    renderTrain();
  }
  // After a case: another one, prepared from wherever the cube is.
  function trAdvance() {
    if (!tr.result) return;
    tr.result = null;
    tr.c = nextCase(tr.c && tr.c.id);
    trPrepare();
  }
  function trMove(mv, st, t) {
    if (!tr.c || tr.result) {
      if (tr.result && !tr.busy) trAdvance();
      return;
    }
    if (!tr.follow) return;
    if (!tr.ready) {
      followMove(tr.follow, st, mv);
      if (done(tr.follow)) tr.ready = t;
      renderTrain();
      return;
    }
    if (!tr.first) tr.first = t;
    const read = C.readCube(st, settings.cross);
    const goal = C.LL.indexOf(tr.c.step) + 3;
    if (read.stage >= goal) {
      const total = t - tr.ready;
      const recog = tr.first - tr.ready;
      const rec = train[tr.c.id] || {};
      rec.n = (rec.n || 0) + 1;
      rec.sum = (rec.sum || 0) + total;
      rec.best = rec.best == null ? total : Math.min(rec.best, total);
      rec.rsum = (rec.rsum || 0) + recog;
      rec.last = total;
      train[tr.c.id] = rec;
      save(K.train, train);
      tr.result = { total, recog, exec: total - recog };
      if (settings.sound) window.SmartCube.chime(true);
      renderTrain();
      setTimeout(() => { if (trActive()) trAdvance(); }, 1400);
      return;
    }
    renderTrain();
  }
  function trSync() { if (trActive() && !tr.follow && !tr.busy) trPrepare(); else if (trActive() && tr.follow && !tr.ready) { locate(tr.follow, cube.state); renderTrain(); } }
  function renderTrain() {
    const box = $('trBox');
    const c = tr.c;
    if (!c) { box.innerHTML = '<p class="empty-note">Elige qué casos quieres entrenar.</p>'; return; }
    const step = C.STEPS.find((s) => s.id === c.step);
    if (settings.trMode === 'look') {
      const g = C.caseState(c, tr.qAuf);
      const shown = tr.qView ? apply(g, tr.qView) : g;
      const options = C.CASES.filter((x) => x.step === c.step);
      box.innerHTML = `<div class="fr-quiz">
        <div class="fr-quiz-pic">${topView(shown, { mode: modeOf(c.step), arrows: false, label: `Un caso de ${step.name}: ¿cuál es?` })}</div>
        <div class="fr-quiz-body">
          <span class="field-title">${step.name} · ¿qué caso es?</span>
          <div class="fr-options">${options.map((x, i) => `<button class="btn" type="button" data-answer="${x.id}"><kbd>${i + 1}</kbd> ${esc(x.name)}</button>`).join('')}</div>
          <p class="fr-feedback" id="trFeedback" aria-live="polite"></p>
          <p class="hint">${esc(trainLine(c.id))}</p>
        </div>
      </div>`;
      return;
    }
    if (settings.trMode === 'hand') {
      const t = tr.hand;
      const options = C.CASES.filter((x) => x.step === c.step);
      box.dataset.h = '';
      box.innerHTML = !t ? '<p class="fr-note">Preparando una mezcla…</p>' : `<div class="fr-train-head">
        <span class="field-title">${step.name} · ${esc(step.long)}</span>
        <p class="fr-note"><b>1.</b> Con el cubo resuelto, ${holdText()}, mezcla:</p>
        <p class="fr-setup">${setupChips(t.setup)}</p>
        <p class="fr-note"><b>2.</b> ¿Qué caso te ha quedado?</p>
        <div class="fr-options">${options.map((x, i) => `<button class="btn" type="button" data-answer="${x.id}"><kbd>${i + 1}</kbd> ${esc(x.name)}</button>`).join('')}</div>
        <div class="fr-feedback" id="trFeedback" aria-live="polite"></div>
      </div><p class="hint">${esc(trainLine(c.id))}</p>`;
      return;
    }
    if (!cube || !cube.on) {
      box.innerHTML = `<div class="fr-train-off"><p>Para entrenar con tu cubo inteligente, conéctalo en el <a href="#crono">cronómetro</a>. La app te dice cómo dejarlo en un caso, lo resuelves y te mide cuánto tardas en reconocerlo y en hacerlo.</p>
        <p class="hint">Con un cubo cualquiera, prueba «Cubo normal»: te digo cómo mezclarlo, adivinas el caso y te digo cómo resolverlo. Sin cubo, «Reconocer».</p>
        <div class="fr-train-card">${casePicture(c)}<div><b>${esc(c.name)}</b>${algHtml(c.alg)}</div></div></div>`;
      return;
    }
    const F = tr.follow;
    let html = `<div class="fr-train-head"><span class="field-title">${step.name} · ${esc(step.long)}</span>`;
    if (tr.err) html += `<p class="hint bad">${esc(tr.err)}</p><button class="btn" type="button" id="trRetry">Reintentar</button>`;
    else if (tr.busy || !F) html += '<p class="fr-note">Preparando el caso…</p>';
    else if (!tr.ready) {
      const moves = parseAlg(tr.setup).map((m) => m.text);
      html += `<p class="fr-note">Déjalo en el caso: ${esc(COLOR_NAME[settings.cross])} abajo y verde delante.</p>
        <p class="fr-setup">${moves.map((m, i) => `<span class="sm${!F.lost && i < F.pos ? ' done' : !F.lost && i === F.pos ? (F.halfway ? ' next half' : ' next') : ''}">${esc(inHand(m, tr.map))}</span>`).join(' ')}</p>`;
      if (F.lost) html += '<p class="hint bad">Te has perdido. <button class="btn" type="button" id="trRetry">Empezar desde como está</button></p>';
      else if (F.off.length) html += `<p class="hint bad">Ese giro no toca. Deshaz: <b>${esc(undoText(F, tr.map))}</b></p>`;
    } else if (tr.result) {
      html += `<p class="fr-big ok">✓ ${esc(c.name)} en ${f1(tr.result.total)} s</p><p class="hint">Reconocer ${f1(tr.result.recog)} s · hacer ${f1(tr.result.exec)} s. Ahora otro…</p>`;
    } else {
      const read = C.readCube(cube.state, settings.cross);
      const want = C.LL.indexOf(c.step) + 2;
      html += tr.first
        ? `<p class="fr-note">Resuélvelo… ${read.stage < want ? '<span class="bad">se ha deshecho el paso anterior</span>' : ''}</p>`
        : '<p class="fr-big">¡Ya! ¿Qué caso es? Resuélvelo.</p>';
      html += `<details class="fr-peek"><summary>Ver el algoritmo</summary>${casePicture(c)}<p><b>${esc(c.name)}</b> ${algHtml(c.alg)}</p><p class="hint">${esc(c.look)}</p></details>`;
    }
    html += `</div><p class="hint">${esc(trainLine(c.id))}</p>`;
    if (box.dataset.h !== html) {
      box.dataset.h = html;
      const open = box.querySelector('details[open]');
      box.innerHTML = html;
      if (open && box.querySelector('details')) box.querySelector('details').open = true;
      const retry = $('trRetry');
      if (retry) retry.addEventListener('click', () => trPrepare());
    }
  }
  $('trBox').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-answer]');
    if (b) answer(b.dataset.answer);
  });
  function answer(id) {
    if (settings.trMode === 'hand') { answerHand(id); return; }
    if (settings.trMode !== 'look' || !tr.c || tr.answered) return;
    tr.answered = true;
    const ms = now() - tr.qStart;
    const c = tr.c;
    const ok = id === c.id;
    const rec = train[c.id] || {};
    rec.qn = (rec.qn || 0) + 1;
    rec.qok = (rec.qok || 0) + (ok ? 1 : 0);
    rec.qsum = (rec.qsum || 0) + ms;
    train[c.id] = rec;
    save(K.train, train);
    document.querySelectorAll('[data-answer]').forEach((x) => {
      x.disabled = true;
      if (x.dataset.answer === c.id) x.classList.add('right');
      else if (x.dataset.answer === id) x.classList.add('wrong');
    });
    const fb = $('trFeedback');
    fb.className = `fr-feedback ${ok ? 'ok' : 'ko'}`;
    fb.innerHTML = `${ok ? '✓' : '✗ Era'} <b>${esc(c.name)}</b> · ${f1(ms)} s<br>${algHtml(c.alg)}<br><span class="hint">${esc(c.look)}</span>`
      + (ok ? '' : ' <button class="btn" type="button" id="trNextQ">Siguiente</button>');
    if (ok) setTimeout(() => { if (tr.answered && settings.trMode === 'look' && view === 'entrenar') trNext(); }, 1100);
    else $('trNextQ').addEventListener('click', () => trNext());
  }
  // «Cubo normal»: after guessing, what it was and how to solve it (the cube ends solved for the next one).
  function answerHand(id) {
    const t = tr.hand;
    if (!t || tr.answered) return;
    tr.answered = true;
    const c = t.c;
    const ok = id === c.id;
    const rec = train[c.id] || {};
    rec.mn = (rec.mn || 0) + 1;
    rec.mok = (rec.mok || 0) + (ok ? 1 : 0);
    train[c.id] = rec;
    save(K.train, train);
    document.querySelectorAll('[data-answer]').forEach((x) => {
      x.disabled = true;
      if (x.dataset.answer === c.id) x.classList.add('right');
      else if (x.dataset.answer === id) x.classList.add('wrong');
    });
    const fb = $('trFeedback');
    fb.className = `fr-feedback ${ok ? 'ok' : 'ko'}`;
    fb.innerHTML = `<p class="fr-big ${ok ? 'ok' : ''}">${ok ? '✓' : '✗ Era'} ${esc(c.name)}</p>
      <div class="fr-train-card">${topView(t.g, { mode: modeOf(c.step), arrows: c.step.startsWith('pll'), label: `Así queda: ${c.name}` })}<div><span class="hint">${esc(c.look)}</span></div></div>
      <p class="fr-note"><b>3.</b> Resuélvelo: ${tryHow(t)}</p>
      <div class="actions"><button class="btn primary" type="button" id="trNextQ">Siguiente</button></div>`;
    $('trNextQ').addEventListener('click', () => trNext());
  }
  document.addEventListener('keydown', (ev) => {
    if (view !== 'entrenar' || (settings.trMode !== 'look' && settings.trMode !== 'hand') || typing(ev.target)) return;
    const n = Number(ev.key);
    if (n >= 1 && n <= 7) {
      const b = document.querySelectorAll('[data-answer]')[n - 1];
      if (b) { ev.preventDefault(); answer(b.dataset.answer); }
    } else if ((ev.key === 'Enter' || ev.key === ' ') && tr.answered && !ev.repeat) { ev.preventDefault(); trNext(); }
  });
  onView('entrenar', () => { if (!tr.c || (settings.trMode === 'cube' && cube && cube.on && !tr.follow && !tr.busy)) trNext(); else renderTrain(); });

  // ================= Settings =================
  function renderSettings() {
    $('setInspect').checked = settings.inspect;
    $('setHelp').checked = settings.help;
    $('setSound').checked = settings.sound;
    $('setCross').value = settings.cross;
    const th = load(K.theme, 'auto') || 'auto';
    document.querySelectorAll('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === th)));
  }
  $('setInspect').addEventListener('change', (e) => { settings.inspect = e.target.checked; saveSettings(); renderClock(); });
  $('setHelp').addEventListener('change', (e) => { settings.help = e.target.checked; saveSettings(); });
  $('setSound').addEventListener('change', (e) => { settings.sound = e.target.checked; saveSettings(); if (settings.sound) window.SmartCube.unlockAudio(); });
  $('setCross').addEventListener('change', (e) => { settings.cross = e.target.value; saveSettings(); renderCross(); track = null; tr.c = null; });
  document.querySelectorAll('[data-theme-set]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.themeSet;
    try { if (v === 'auto') localStorage.removeItem(K.theme); else localStorage.setItem(K.theme, v); } catch (e) { /* this visit */ }
    if (v === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', v);
    renderSettings();
  }));
  $('exportData').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ times, learn, train, settings }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fridrich-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('clearTimes').addEventListener('click', (ev) => {
    const b = ev.currentTarget;
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = `¿Borrar ${times.length} tiempos? Pulsa otra vez`; setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Borrar tiempos'; }, 4000); return; }
    b.dataset.armed = '';
    b.textContent = 'Borrar tiempos';
    times = [];
    save(K.times, times);
    renderStats();
    renderSplits(null);
    toast('Tiempos borrados');
    emit('result', null);
  });

  // ================= Timed or free practice =================
  const modeBox = document.createElement('div');
  modeBox.className = 'seg small fr-mode';
  modeBox.setAttribute('role', 'group');
  modeBox.setAttribute('aria-label', 'Con o sin cronómetro');
  modeBox.innerHTML = '<button type="button" data-timed="1">Cronometrar</button><button type="button" data-timed="0">Practicar sin crono</button>';
  $('hTimer').after(modeBox);
  function renderMode() {
    modeBox.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.timed === '1') === settings.timed)));
  }
  modeBox.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-timed]');
    if (!b) return;
    if (timer.phase === 'run') cancel();
    settings.timed = b.dataset.timed === '1';
    saveSettings();
    renderAll();
  });

  // ================= Drawing everything =================
  function renderAll() {
    renderMode();
    renderClock();
    renderScramble();
    renderLive();
    renderSim();
    if (view === 'entrenar') renderTrain();
  }
  onView('crono', renderAll);
  onView('casos', renderCases);
  onView('ajustes', renderSettings);

  // ================= For the stream overlay =================
  window.Fridrich = {
    timerState,
    times: () => times,
    avgOf,
    scramble: () => scramble,
    onView,
    currentView: () => view,
    showView,
    cube: () => cube,
    live() {
      if (!cube || !cube.on) return null;
      const info = liveInfo(cube.state);
      const read = info.read;
      const rec = info.track ? info.track.rec : null;
      return {
        facelets: toFacelets(cube.state),
        stage: info.stage, pairs: read.n, cross: read.cross, colour: read.colour,
        splits: timer.phase === 'run' && timer.line ? liveSplits() : null,
        case: rec && rec.case ? { id: rec.case.id, name: rec.case.name, alg: rec.case.alg, step: rec.case.step, front: rec.front, pre: rec.pre, post: rec.post } : null,
        scr: follow ? { pos: follow.pos, n: follow.n, half: follow.halfway, undo: follow.off.length ? undoText(follow) : '', lost: follow.lost } : null,
      };
    },
    last: () => timer.last,
    // For tests.
    _: { simSolution, caseTarget, tr, settings, follow: () => follow, makeFollow, partialKeys, setScramble, makeTry },
  };

  // ================= Start =================
  const first = location.hash.slice(1);
  showView(VIEWS.includes(first) ? first : load(K.view, 'crono'));
  renderMode();
  renderStats();
  renderPick();
  const lastWithSp = times.length ? times[times.length - 1] : null;
  if (lastWithSp && lastWithSp.sp) renderSplits(lastWithSp);
  if (scramble) setScramble(scramble); else { renderScramble(); newScramble(); }
  setTimeout(() => { if (typeof Worker !== 'undefined') M.startScrambler().catch(() => {}); }, 400);
  if ('serviceWorker' in navigator && document.querySelector('link[rel=manifest]')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
