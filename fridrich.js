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
    crossTr: 'cfop:crosstr:v1', deleted: 'cfop:deleted:v1', learnAt: 'cfop:learn-at:v1', sync: 'op3bld:sync:v1', synced: 'cfop:synced:v1',
    trlog: 'cfop:trlog:v1', player: 'cfop:player:v1', ligas: 'cfop:ligas:v1', ligaPub: 'cfop:liga-pub:v1', ligaSeen: 'cfop:liga-seen:v1',
    name: 'op3bld:name:v1', session: 'cfop:session:v1', sessions: 'cfop:sessions:v1',
  };
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* this visit only */ } };
  const settings = { inspect: false, help: true, sound: true, vibrate: true, cross: 'U', timed: true, trMode: 'cube', chart: 50, pace: 'avg', celebrate: true, ...load(K.set, {}) };
  if (!(settings.cross in C.DOWN)) settings.cross = 'U';
  const saveSettings = () => save(K.set, settings);
  let times = load(K.times, []);
  if (!Array.isArray(times)) times = [];
  const learn = load(K.learn, {});
  const learnAt = load(K.learnAt, {});
  const train = load(K.train, {});
  // Every training attempt, for the stats and the recommended set: { at, id, m: 'c' smart cube | 'q' recognise
  // | 'h' normal cube, ok: 1|0, t: ms, r: ms recognising, x: 1 «me he perdido» }.
  let trlog = load(K.trlog, []);
  if (!Array.isArray(trlog)) trlog = [];
  const sess = { n: 0, ok: 0, lost: 0, sum: 0, timed: 0, at: Date.now() };
  function logTr(e) {
    const entry = { at: Date.now(), ...e };
    if (trlog.length && trlog[trlog.length - 1].at >= entry.at) entry.at = trlog[trlog.length - 1].at + 1;
    trlog.push(entry);
    if (trlog.length > 5000) trlog = trlog.slice(-5000);
    save(K.trlog, trlog);
    if (e.x) sess.lost++;
    else { sess.n++; if (e.ok) sess.ok++; }
    if (e.t != null && e.ok) { sess.sum += e.t; sess.timed++; }
    changed();
    sessionAttempt(entry);
    emit('train', null);
    clearTimeout(logTr.h);
    logTr.h = setTimeout(() => { if (view === 'entrenar') renderTrStats(); }, 600);
  }
  // Something that is synced between devices changed: sent a few seconds later.
  const changed = () => emit('changed', null);

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
  const VIEWS = ['crono', 'casos', 'entrenar', 'progreso', 'ranking', 'ajustes'];
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
    // Learning (Casos, Entrenar) looks different from the timer; a training session takes over Entrenar.
    document.body.dataset.mode = name === 'entrenar' || name === 'casos' ? 'learn' : 'time';
    if (typeof renderMode2 === 'function') renderMode2();
    emit('view', name);
    try { history.replaceState(null, '', `${location.pathname}${location.search}#${name}`); } catch (e) { /* sandboxed */ }
    if (changed) { try { window.scrollTo(0, 0); } catch (e) { /* no layout */ } }
    (viewHooks[name] || []).forEach((fn) => fn());
  }
  const onView = (name, fn) => { (viewHooks[name] = viewHooks[name] || []).push(fn); };
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.go)));
  window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    const inv = h.match(/^liga[=/]([a-z0-9]{8})$/i);
    if (inv) { openInvite(inv[1].toLowerCase()); return; }
    if (VIEWS.includes(h) && h !== view) showView(h);
  });

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
    renderDuel();
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
    document.body.dataset.timer = p === 'run' || p === 'inspect' || p === 'ihold' || p === 'iready' ? 'run' : 'idle';
    if (typeof holdScreen === 'function') holdScreen(focus.on || p === 'run' || p === 'inspect');
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
      if (timer.phase === 'run') { $('clockTime').textContent = fmt(now() - timer.t0); paceTick(now() - timer.t0); }
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
    resetProg();
    pace.ref = paceRef();
    pace.at = null;
    hideRecord();
    if (duel && duel.result) { duel = null; renderDuel(); }
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
        r.rc = reconstruction(timer.line, sp);
        // How good each step was: worked out just after (the pair searches take a moment).
        const line = timer.line;
        setTimeout(() => {
          try { r.an = packAnalysis(C.analyze(line, sp)); } catch (e) { r.an = null; }
          if (!r.an) return;
          save(K.times, times);
          if (timer.last === r) renderSplits(r);
          renderPhases();
          renderHistory();
          changed();
        }, 40);
      }
    }
    timer.insp0 = 0;
    const prevBests = bestsOf(times);
    times.push(r);
    if (times.length > 2000) times = times.slice(-2000);
    // The turns of each solve are kept for the last 500.
    for (let i = 0; i < times.length - 500; i++) { delete times[i].rc; delete times[i].an; }
    save(K.times, times);
    changed();
    timer.last = r;
    // The next turn is scrambling again, not a new solve.
    if (follow && cube && cube.on && !locate(follow, cube.state)) markLost();
    if (follow && follow.pos >= follow.n) { follow.pos = 0; follow.lost = true; }
    $('clockTime').textContent = fmtRes(r);
    pace.at = r.at;
    setPhase('done');
    const recs = recordsAfter(prevBests, r);
    if (recs.length) celebrate(recs);
    else if (cube && cube.on && isSolved(cube.state)) {
      if (settings.sound) window.SmartCube.chime();
      buzz([80, 60, 180]);
    }
    renderSplits(r);
    renderStats();
    emit('result', r);
    duelResult(r);
    if (recs.length) ligaPublish().then((done) => announceRank(done, recs)); else ligaPublishSoon();
    newScramble();
  }
  function cancel() {
    hideRecord();
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
    renderPace();
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
      moveCount++;
      const before = prevState;
      prevState = st;
      if (timer.phase === 'run') {
        if (timer.line) timer.line.push({ t: t - timer.t0, st, m: mv });
        if (isSolved(st)) stopRun(t);
      } else if (settings.timed && view === 'crono' && done(follow) && (timer.phase === 'idle' || timer.phase === 'inspect' || timer.phase === 'done') && !trActive() && !ctActive()) {
        // The first turn after scrambling starts the clock.
        startRun(t, before);
        timer.line.push({ t: 0, st, m: mv });
      } else if (follow && !trActive() && !ctActive()) {
        if (timer.phase === 'done') setPhase('idle');
        const was = done(follow);
        followMove(follow, st, mv);
        if (!was && done(follow) && settings.timed && settings.inspect && timer.phase === 'idle') startInspection();
      }
      if (trActive()) trMove(mv, st, t);
      if (ctActive()) ctMove(mv, st, t);
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
  // Part way through the case being done: where along its turns. The first two layers (and the cross) come
  // apart in the middle of most algorithms, so the stage alone would say F2L or even cross. Every way of
  // doing the case is followed: from any side, with the top turned before or not.
  function onTrack(st) {
    if (!track) return false;
    const k = key(st);
    for (let p = 0; p < track.paths.length; p++) {
      const path = track.paths[p];
      const i = path.keys.indexOf(k);
      const h = i >= 0 && i < path.keys.length - 1 ? -1 : path.half.indexOf(k);
      if ((i >= 0 && i < path.keys.length - 1) || h >= 0) {
        // Keep to the way already being done while it still matches.
        if (p !== track.cur && track.pos > 0 && track.paths[track.cur].keys.includes(k)) continue;
        track.cur = p;
        track.pos = i >= 0 && h < 0 ? i : path.halfAt[h];
        track.rec = path.rec;
        track.moves = path.moves;
        return true;
      }
    }
    return false;
  }
  function pathFor(g, rec) {
    const seq = [rec.pre, rec.case ? rec.case.alg : '', rec.post].filter(Boolean).join(' ');
    const moves = parseAlg(seq).map((m) => m.text);
    let s = rec.view ? apply(g, rec.view) : g;   // held with that side in front
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
    return { rec, moves, keys, half, halfAt };
  }
  // Recognise the case of a last-layer step and keep the turns of every way to do it.
  function startTrack(read) {
    const all = C.recognizeAll(read.g, read.stage);
    if (!all.length) { track = null; return null; }
    const paths = all.map((rec) => pathFor(read.g, rec));
    track = { stage: read.stage, face: read.face, paths, cur: 0, pos: 0, rec: paths[0].rec, moves: paths[0].moves };
    return track;
  }
  // How far the cube has got in this solve. Inserting a pair or doing an algorithm undoes the cross or the
  // F2L for a moment: the help stays on the step reached (and its case) until the cube is back, unless it
  // stays below for too long (then it really went back).
  let moveCount = 0;
  let prog = { face: null, max: -1, since: null, last: null, pairs: null };
  const resetProg = () => { prog = { face: null, max: -1, since: null, last: null, pairs: null }; };
  const HOLD_MOVES = 40;
  function liveInfo(st) {
    const pref = settings.cross;
    let read = C.readCube(st, pref);
    if (isSolved(st)) { track = null; resetProg(); return { read, stage: 6, track: null }; }
    if (onTrack(st)) {
      if (prog.face !== track.face) resetProg();
      prog.face = track.face;
      prog.max = Math.max(prog.max, track.stage);
      prog.since = null;
      prog.last = track;
      return { read, stage: track.stage, track };
    }
    track = null;
    // In the middle of an algorithm another colour can read as far on by chance: stay with the cross colour
    // while the other one is not further on than what the solve had reached.
    if (prog.face === pref && read.face !== pref && read.stage <= prog.max) read = C.readFace(st, pref);
    if (read.face !== prog.face) resetProg();
    prog.face = read.face;
    if (read.stage >= 2 && read.stage < 6) { startTrack(read); prog.last = track; }
    if (read.stage === 1) prog.pairs = read.pairs;
    // Only the cross colour is held: one turn away from solved, the opposite colour reads as «PLL» too.
    if (read.stage >= prog.max || read.face !== pref) {
      prog.max = read.stage;
      prog.since = null;
      return { read, stage: read.stage, track };
    }
    if (prog.since == null) prog.since = moveCount;
    if (moveCount - prog.since > HOLD_MOVES) {
      resetProg();
      prog.max = read.stage;
      if (read.stage === 1) prog.pairs = read.pairs;
      return { read, stage: read.stage, track };
    }
    return { read, stage: prog.max, track: null, held: true };
  }
  function renderLive() {
    const box = $('live');
    box.hidden = !liveVisible();
    if (box.hidden) return;
    const st = cube.state;
    const scrambled = !follow || done(follow) || !settings.timed || timer.phase === 'run';
    if (!scrambled) { resetProg(); track = null; }
    const info = liveInfo(st);
    const read = info.read;
    const stage = info.stage;
    // The steps, with the times reached in this solve.
    const reached = timer.phase === 'run' && timer.line ? liveSplits() : null;
    const solvedNow = stage === 6;
    $('liveSteps').innerHTML = C.STEPS.map((s, i) => {
      let cls = solvedNow || stage > i ? 'done' : stage === i ? 'cur' : '';
      if (!scrambled && !solvedNow) cls = '';
      const pairs = info.held ? prog.pairs : read.pairs;
      const extra = s.id === 'f2l' && stage === 1 && scrambled && pairs
        ? ` <span class="fr-dots">${pairs.map((p) => `<i class="${p ? 'on' : ''}"></i>`).join('')}</span>` : '';
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
    } else if (info.held && stage >= 2 && prog.last) {
      html = caseHtml(prog.last, 'Sigues con el algoritmo: a mitad se deshace un momento lo de abajo, es normal.');
    } else if (info.held && stage === 1) {
      const pairs = prog.pairs || [false, false, false, false];
      html = `<p class="fr-note"><b>F2L:</b> ${pairs.filter(Boolean).length} de 4 parejas · metiendo una…</p>`
        + '<p class="hint">Al meter una pareja se deshace un momento la cruz o otra pareja: es normal.</p>';
    } else if (stage === 0) {
      html = `<p class="fr-note"><b>${esc(read.crossName[0].toUpperCase() + read.crossName.slice(1))}:</b> ${read.cross} de 4 aristas.</p>`;
      if (liveCross) {
        const x = C.bestCross(st, read.face);
        html += `<p class="fr-note">Lo más corto desde aquí, con el ${esc(read.colour)} abajo: ${x.moves ? algHtml(x.moves) : '<i>nada</i>'} <span class="muted">(${x.length})</span></p>`;
      } else html += '<button class="btn" type="button" id="liveCrossBtn">¿Cómo la acabo?</button>';
    } else if (stage === 1) {
      const names = SLOT_NAMES(read.g);
      html = `<p class="fr-note"><b>F2L:</b> ${read.n} de 4 parejas.</p><ul class="fr-slots">${read.pairs.map((p, i) => `<li class="${p ? 'on' : ''}">${p ? '✓ ' : ''}${esc(names[i])}</li>`).join('')}</ul>`
        + pairHtml(read, st, names);
    } else html = '<p class="fr-note">No reconozco este caso.</p>';
    if (nowBox.dataset.h !== html) {
      nowBox.dataset.h = html;
      nowBox.innerHTML = html;
      const b = $('liveCrossBtn');
      if (b) b.addEventListener('click', () => { liveCross = true; nowBox.dataset.h = ''; renderLive(); });
    }
  }
  // The next pair: for each empty slot, the fewest turns that put it in keeping what is done. Worked out a
  // moment after the cube stops moving (a few milliseconds; up to a few tenths in hard positions).
  let pairHint = { key: null, sols: null };
  let pairTimer = 0;
  function pairHtml(read, st, names) {
    const k = key(st);
    if (pairHint.key !== k) {
      clearTimeout(pairTimer);
      pairTimer = setTimeout(() => {
        if (!cube || !cube.on || key(cube.state) !== k) return;
        pairHint = { key: k, sols: C.pairSolutions(read.g, 600000) };
        $('liveNow').dataset.h = '';
        renderLive();
      }, 220);
      return '<p class="hint">Buscando la pareja más corta…</p>';
    }
    const sols = pairHint.sols || [];
    if (!sols.length) return '<p class="hint">Junta cada esquina blanca con su arista arriba y métela en su hueco a la vez.</p>';
    const line = (x, best) => {
      const v = C.slotToFront(x.slot);
      const moves = v ? inHand(x.moves, faceMapFor(v)) : x.moves;
      return `<li class="${best ? 'best' : ''}"><span class="fr-pair-name">${esc(names[x.slot])}</span>`
        + `<span class="fr-pair-moves">${v ? `<span class="muted">${esc(v)}</span> ` : ''}${algHtml(moves)}</span>`
        + `<span class="muted">${x.length} ${x.length === 1 ? 'giro' : 'giros'}</span></li>`;
    };
    return `<p class="fr-note"><b>La pareja más corta:</b> ponla delante a la derecha${C.slotToFront(sols[0].slot) ? ` (gira el cubo con <b>${esc(C.slotToFront(sols[0].slot))}</b>)` : ''} y mete:</p>`
      + `<ul class="fr-pairs">${sols.map((x, i) => line(x, i === 0)).join('')}</ul>`
      + '<p class="hint">Cada línea es la forma más corta de meter esa pareja sin romper lo que ya tienes, con su hueco delante a la derecha. Hay otras igual de cortas.</p>';
  }
  // The case, how to hold it, its turns (done, next) and how far along.
  function caseHtml(t, note) {
    const r = t.rec;
    const step = C.STEPS[t.stage];
    if (!r.case) {
      return `<p class="fr-note"><b>${step.name}:</b> solo falta girar la capa de arriba: <span class="fr-alg-big">${algHtml(r.post)}</span></p>`;
    }
    const c = r.case;
    const nPre = r.pre ? 1 : 0;
    const algLen = parseAlg(c.alg).length;
    const pos = note ? -1 : t.pos;
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
        <p class="hint">${note ? esc(note) : pos ? `${Math.min(pos, t.moves.length)} de ${t.moves.length}` : esc(c.look)}</p>
      </div>
    </div>`;
  }
  // Time at which each step was reached in the solve under way (worked out again only after a new turn).
  let splitsMemo = { line: null, n: -1, out: null };
  function liveSplits() {
    if (splitsMemo.line === timer.line && splitsMemo.n === timer.line.length) return splitsMemo.out;
    const sp = C.splits(timer.line, settings.cross);
    const out = sp ? sp.steps.map((s) => (s.done ? s.end : null)) : null;
    if (out) out.skip = sp.steps.map((s) => !!(s.done && s.skip));
    splitsMemo = { line: timer.line, n: timer.line.length, out };
    return out;
  }

  // ================= Pace: this solve against your average =================
  // As in speedrunning: at the end of each part (cross, F2L, OLL, PLL), how far ahead or behind you are of your
  // reference at that same point (your mean of the last 12 smart-cube solves, or your best solve); gold when the
  // part itself is the quickest you have ever done it. While a part goes on, once you pass the reference's time
  // for its end, the gap counts up live.
  const PACE_GROUPS = [['Cruz', [0]], ['F2L', [1]], ['OLL', [2, 3]], ['PLL', [4, 5]]];
  const PACE_END = [0, 1, 3, 5];
  const fullSp = (r) => !!(r && r.sp && r.pen !== 'dnf' && Array.isArray(r.sp.s) && r.sp.s.length === 6 && r.sp.s.every(Boolean));
  const segOf = (r, g) => PACE_GROUPS[g][1].reduce((a, i) => a + r.sp.s[i][0], 0);
  const skipIn = (r, g) => PACE_GROUPS[g][1].some((i) => r.sp.s[i][4]);
  const pace = { ref: null, at: null, live: '' };
  // The reference, from the solves before index `upto`.
  function paceRef(upto = times.length) {
    if (settings.pace === 'off') return null;
    const before = times.slice(0, upto).filter(fullSp);
    let seg;
    let label;
    if (settings.pace === 'pb') {
      if (!before.length) return null;
      const pb = before.reduce((b, r) => (!b || value(r) < value(b) ? r : b), null);
      seg = [0, 1, 2, 3].map((g) => segOf(pb, g));
      label = `tu mejor solve (${fmt(value(pb))})`;
    } else {
      const last = before.slice(-12);
      if (last.length < 3) return null;
      seg = [0, 1, 2, 3].map((g) => last.reduce((a, r) => a + segOf(r, g), 0) / last.length);
      label = `tu media de ${last.length}`;
    }
    const cum = [];
    seg.reduce((a, x, g) => { cum[g] = a + x; return cum[g]; }, 0);
    // Gold: quicker than every earlier time for that part (skips left out: a skip is luck, not a record).
    const best = [0, 1, 2, 3].map((g) => {
      const xs = before.filter((r) => !skipIn(r, g)).map((r) => segOf(r, g));
      return xs.length >= 3 ? Math.min(...xs) : null;
    });
    return { seg, cum, best, label };
  }
  const signed = (ms) => (Math.abs(ms) < 50 ? '±0.0' : `${ms < 0 ? '−' : '+'}${(Math.abs(ms) / 1000).toFixed(1)}`);
  // Each part of a solve against a reference: [{ t: part, d: gap at its end, gold }]; null for parts not done.
  function paceRows(ends, skips, ref) {
    return [0, 1, 2, 3].map((g) => {
      const end = ends[PACE_END[g]];
      if (end == null) return null;
      const startT = g ? ends[PACE_END[g - 1]] : 0;
      const seg = end - (startT || 0);
      const skipped = skips ? PACE_GROUPS[g][1].some((i) => skips[i]) : false;
      return { t: seg, d: end - ref.cum[g], gold: !skipped && ref.best[g] != null && seg < ref.best[g] };
    });
  }
  function paceFor(r) {
    if (!fullSp(r)) return null;
    const i = times.indexOf(r);
    const ref = paceRef(i < 0 ? times.length : i);
    if (!ref) return null;
    const ends = [];
    r.sp.s.reduce((a, x, k) => { ends[k] = a + x[0]; return ends[k]; }, 0);
    const rows = paceRows(ends, r.sp.s.map((x) => !!x[4]), ref);
    return { rows, total: ends[5] - ref.cum[3], label: ref.label };
  }
  const chip = (g, row, cls, d) => `<span class="pc ${cls}" data-g="${g}"><span class="pc-n">${PACE_GROUPS[g][0]}</span><b>${row ? f1(row.t) : '…'}</b><span class="pc-d">${d}</span></span>`;
  function renderPace() {
    const box = $('pace');
    if (!box) return;
    let html = '';
    if (settings.pace !== 'off' && cube && cube.on && settings.timed) {
      if (timer.phase === 'run' && pace.ref && timer.line) {
        const reach = liveSplits();
        if (reach) {
          const rows = paceRows(reach, reach.skip, pace.ref);
          const cur = rows.findIndex((x) => !x);
          html = rows.map((row, g) => (row ? chip(g, row, row.gold ? 'gold' : row.d < 0 ? 'ahead' : 'behind', `${signed(row.d)}${row.gold ? ' ★' : ''}`)
            : chip(g, null, g === cur ? 'cur' : 'todo', ''))).join('');
          const lastDone = cur < 0 ? 3 : cur - 1;
          if (lastDone >= 0 && cur >= 0) html += `<span class="pc-proj">Vas para ${fmt(reach[PACE_END[lastDone]] + pace.ref.cum[3] - pace.ref.cum[lastDone])}</span>`;
        }
      } else if (timer.phase === 'done' && timer.last && timer.last.at === pace.at) {
        const pf = paceFor(timer.last);
        if (pf) {
          html = pf.rows.map((row, g) => chip(g, row, row.gold ? 'gold' : row.d < 0 ? 'ahead' : 'behind', `${signed(row.d)}${row.gold ? ' ★' : ''}`)).join('')
            + `<span class="pc-proj">${signed(pf.total)} s contra ${esc(pf.label)}</span>`;
        }
      }
    }
    if (box.dataset.h !== html) { box.dataset.h = html; box.innerHTML = html; pace.live = ''; }
  }
  // Every frame while running: the part under way, once past the reference's time for its end.
  function paceTick(el) {
    if (!pace.ref || settings.pace === 'off') return;
    const c = document.querySelector('#pace .pc.cur');
    if (!c) return;
    const g = Number(c.dataset.g);
    const over = el - pace.ref.cum[g];
    const txt = over > 0 ? signed(over) : '';
    if (txt === pace.live) return;
    pace.live = txt;
    c.classList.toggle('late', over > 0);
    c.querySelector('.pc-d').textContent = txt;
  }

  // ================= Records =================
  function bestsOf(list) {
    let single = Infinity; let ao5 = Infinity; let ao12 = Infinity;
    list.forEach((r, i) => {
      single = Math.min(single, value(r));
      if (i >= 4) ao5 = Math.min(ao5, avgOf(list.slice(i - 4, i + 1), 5));
      if (i >= 11) ao12 = Math.min(ao12, avgOf(list.slice(i - 11, i + 1), 12));
    });
    return { single, ao5, ao12 };
  }
  // What a solve just beat: only records that existed before (a first ao5 is not a record yet).
  function recordsAfter(prev, r) {
    const out = [];
    const cur = { single: value(r), ao5: avgOf(times, 5), ao12: avgOf(times, 12) };
    ['single', 'ao5', 'ao12'].forEach((k) => {
      const v = cur[k];
      if (v != null && Number.isFinite(v) && Number.isFinite(prev[k]) && v < prev[k]) out.push({ k, v, prev: prev[k] });
    });
    return out;
  }
  let recMemo = { key: '', out: null };
  // The records a solve set when it was done (for the overlay).
  function recordsOf(r) {
    const i = times.indexOf(r);
    if (i < 1) return [];
    const k = `${times.length}|${r.at}|${r.pen}|${times[i - 1].at}`;
    if (recMemo.key === k) return recMemo.out;
    const list = times.slice(0, i + 1);
    const prev = bestsOf(times.slice(0, i));
    const cur = { single: value(r), ao5: avgOf(list, 5), ao12: avgOf(list, 12) };
    const out = ['single', 'ao5', 'ao12'].filter((x) => cur[x] != null && Number.isFinite(cur[x]) && Number.isFinite(prev[x]) && cur[x] < prev[x]).map((x) => ({ k: x, v: cur[x], prev: prev[x] }));
    recMemo = { key: k, out };
    return out;
  }
  const REC_NAME = { single: 'Single', ao5: 'ao5', ao12: 'ao12' };
  let recHide = 0;
  function celebrate(recs) {
    const text = recs.map((x) => `${REC_NAME[x.k]} ${fmt(x.v)}`).join(' · ');
    const b = $('pbBanner');
    b.innerHTML = `<b>¡Nuevo récord!</b> <span>${esc(text)}</span><small>antes ${esc(recs.map((x) => `${REC_NAME[x.k]} ${fmt(x.prev)}`).join(' · '))}</small>`;
    b.hidden = false;
    b.classList.remove('pop');
    void b.offsetWidth;
    b.classList.add('pop');
    clearTimeout(recHide);
    recHide = setTimeout(hideRecord, 9000);
    toast(`¡Nuevo récord! ${text}`);
    if (settings.celebrate) {
      if (settings.sound) window.SmartCube.chime('pb');
      confetti();
    } else if (settings.sound) window.SmartCube.chime();
    buzz([60, 50, 60, 50, 220]);
    emit('record', recs);
  }
  function hideRecord() { const b = $('pbBanner'); if (b) b.hidden = true; }
  const STICKERS = ['#FFFFFF', '#F0CF0C', '#D7263D', '#EE7A1A', '#2563D6', '#1E9E4B'];
  function confetti() {
    try { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) { /* no media queries */ }
    const box = document.createElement('div');
    box.className = 'fr-confetti';
    box.setAttribute('aria-hidden', 'true');
    let html = '';
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * 100;
      const d = 1.6 + Math.random() * 1.6;
      const delay = Math.random() * 0.35;
      const rot = Math.round(Math.random() * 720 - 360);
      const drift = Math.round(Math.random() * 160 - 80);
      html += `<i style="left:${x.toFixed(1)}%;background:${STICKERS[i % 6]};animation-duration:${d.toFixed(2)}s;animation-delay:${delay.toFixed(2)}s;--r:${rot}deg;--x:${drift}px"></i>`;
    }
    box.innerHTML = html;
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 3800);
  }

  // ================= Reconstruction =================
  // The turns of each step, as held with the cross colour down and green in front (the cube cannot tell how
  // you turn it in your hands: a «y» shows up as the other faces). The two quarter turns the cube sends for a
  // half turn become one; a turn and its undo are kept, they are part of what happened.
  function halves(list) {
    const out = [];
    list.forEach((mv) => {
      const m = parseAlg(mv)[0];
      const last = out[out.length - 1];
      if (last && last.base === m.base && last.turns === m.turns && m.turns !== 2 && !last.merged) { last.turns = 2; last.merged = true; } else out.push({ base: m.base, turns: m.turns });
    });
    return out.map(moveText);
  }
  function reconstruction(line, sp) {
    const map = faceMapFor(C.DOWN[sp.face]);
    return sp.steps.map((st) => (st.done ? halves(line.slice(st.from + 1, st.to + 1).map((e) => e.m).filter(Boolean))
      .map((m) => inHand(m, map)).join(' ') : null));
  }
  function reconText(r) {
    const rot = C.DOWN[r.sp.f];
    const lines = [];
    if (rot) lines.push(`${rot} // inspección`);
    C.STEPS.forEach((st, i) => { if (r.rc[i] != null) lines.push(`${r.rc[i] || '—'} // ${st.name}`); });
    return lines.join('\n');
  }
  function reconHtml(r) {
    if (!r || !r.rc) return '';
    const rot = C.DOWN[r.sp.f];
    const rows = C.STEPS.map((st, i) => {
      const x = r.sp.s[i];
      if (!x || r.rc[i] == null) return '';
      return `<li><b>${st.name}</b> <span class="muted">${f1(x[0])} s · ${r.rc[i] ? r.rc[i].split(' ').length : 0} giros</span><span class="fr-recon-moves">${r.rc[i] ? algHtml(r.rc[i]) : '<i>nada</i>'}</span></li>`;
    }).join('');
    return `<ol class="fr-recon">${rot ? `<li><b>Inspección</b> <span class="muted">${esc(C.crossName(r.sp.f))} abajo</span><span class="fr-recon-moves">${algHtml(rot)}</span></li>` : ''}${rows}</ol>`
      + `<div class="actions"><button class="btn" type="button" data-copy-rc="${times.indexOf(r)}">Copiar reconstrucción</button></div>`;
  }
  document.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-copy-rc]');
    if (!b) return;
    const r = times[Number(b.dataset.copyRc)];
    if (!r || !r.rc) return;
    try { await navigator.clipboard.writeText(reconText(r)); toast('Reconstrucción copiada'); } catch (e) { toast('No he podido copiarla'); }
  });

  // ================= How good the solve was =================
  // Kept small in the solve: c [mine, shortest]; p per pair [slots, mine, shortest, best slot, its length,
  // time to start, pauses, paused ms, time]; l per last-layer step [mine, shortest, pauses, paused ms], 0 if
  // skipped; z ms paused; m all turns; i the ideal.
  function packAnalysis(a) {
    if (!a) return null;
    return {
      c: [a.cross.mine, a.cross.opt],
      p: a.pairs.map((x) => [x.slots.join(''), x.mine, x.opt, x.best ? x.best.slot : -1, x.best ? x.best.length : null, Math.round(x.look), x.pauses, Math.round(x.pauseMs), Math.round(x.time)]),
      l: a.ll.map((x) => (x === null ? null : x.skip ? 0 : [x.mine, x.opt, x.pauses, Math.round(x.pauseMs)])),
      z: Math.round(a.pause), m: a.mine, i: a.ideal,
    };
  }
  const slotNames = (face) => SLOT_NAMES(C.canon(solved(), face));
  const extra = (mine, opt) => (opt == null ? '' : mine - opt > 0 ? ` <b class="fr-extra">+${mine - opt}</b>` : ' <span class="fr-perfect" aria-label="lo más corto">✓</span>');
  const anRow = (name, mine, opt, note) => `<tr><th scope="row">${name}</th><td class="fr-an-n">${mine}${extra(mine, opt)}</td><td class="fr-an-n">${opt == null ? '—' : opt}</td><td class="fr-an-note">${note}</td></tr>`;
  function analysisHtml(r) {
    const a = r.an;
    if (!a || !r.sp) return '';
    const names = slotNames(r.sp.f);
    const eff = a.m ? Math.round((a.i / a.m) * 100) : 100;
    const rows = [];
    rows.push(anRow('Cruz', a.c[0], a.c[1], a.c[0] > a.c[1] ? `Se podía en ${a.c[1]}.` : 'La más corta.'));
    a.p.forEach((x, k) => {
      const [slots, mine, opt, bestSlot, bestLen, look, pauses, pauseMs] = x;
      const who = slots.split('').map((i) => names[Number(i)]).join(' + ') || 'pareja';
      const notes = [];
      if (slots.length > 1) notes.push('dos a la vez');
      if (opt != null && mine > opt) notes.push(`se podía en ${opt}`);
      if (bestSlot >= 0 && !slots.includes(String(bestSlot)) && bestLen != null && opt != null && bestLen < opt) notes.push(`la pareja más fácil era ${names[bestSlot]} (${bestLen})`);
      if (look >= 1500) notes.push(`tardaste ${f1(look)} s en empezarla`);
      if (pauses) notes.push(`${pauses} ${pauses === 1 ? 'pausa' : 'pausas'} a mitad (${f1(pauseMs)} s)`);
      const note = notes.length ? notes.join(' · ') : 'La más corta';
      rows.push(anRow(`Pareja ${k + 1} <span class="muted">${esc(who)}</span>`, mine, opt, esc(note.charAt(0).toUpperCase() + note.slice(1)) + '.'));
    });
    a.l.forEach((x, k) => {
      const st = C.STEPS[k + 2];
      const sp = r.sp.s[k + 2];
      const c = sp && sp[3] ? C.caseById(sp[3]) : null;
      if (x === null) return;
      if (x === 0) { rows.push(`<tr><th scope="row">${st.name}</th><td class="fr-an-n muted" colspan="2">salto</td><td class="fr-an-note">Te lo saltaste: suerte.</td></tr>`); return; }
      const [mine, opt, pauses, pauseMs] = x;
      const notes = [];
      if (mine > opt) notes.push(mine - opt <= 2 ? 'giros de U de más' : 'otro algoritmo o giros de más');
      if (sp && sp[2] != null && sp[2] >= 1500) notes.push(`reconocerlo: ${f1(sp[2])} s`);
      if (pauses) notes.push(`${pauses} ${pauses === 1 ? 'pausa' : 'pausas'} a mitad (${f1(pauseMs)} s)`);
      const note = notes.length ? notes.join(' · ') : 'perfecto';
      rows.push(anRow(`${st.name}${c ? ` <span class="muted">${esc(c.name)}</span>` : ''}`, mine, opt, esc(note.charAt(0).toUpperCase() + note.slice(1)) + '.'));
    });
    // What to work on: the biggest losses first.
    const tips = [];
    const pairExtra = a.p.reduce((s2, x) => s2 + (x[2] == null ? 0 : Math.max(0, x[1] - x[2])), 0);
    const llExtra = a.l.reduce((s2, x) => s2 + (x ? Math.max(0, x[0] - x[1]) : 0), 0);
    const f2lPause = a.p.reduce((s2, x) => s2 + x[7] + (x[5] >= 1000 ? x[5] : 0), 0);
    const missed = a.p.filter((x) => x[3] >= 0 && !x[0].includes(String(x[3])) && x[4] != null && x[2] != null && x[4] + 2 <= x[2]).length;
    if (f2lPause >= 2000) tips.push(`En el F2L estuviste parado ${f1(f2lPause)} s en total (antes de empezar cada pareja y a mitad de ellas): gira algo más despacio pero sin pararte, y busca la siguiente pareja mientras metes la anterior.`);
    if (pairExtra >= 6) tips.push(`El F2L se llevó ${pairExtra} giros de más. Con el cubo conectado, «Practicar sin crono» te enseña la forma más corta de cada pareja.`);
    if (missed >= 2) tips.push(`En ${missed} parejas había otra mucho más corta: antes de cada pareja, mira las cuatro y empieza por la más fácil.`);
    if (a.c[0] - a.c[1] >= 2) tips.push(`La cruz se podía en ${a.c[1]} y usaste ${a.c[0]}: practícala en «Entrenar la cruz».`);
    const slowRec = r.sp.s.slice(2).map((x, k) => (x && x[2] >= 1500 ? [C.STEPS[k + 2].name, x[2]] : null)).filter(Boolean);
    if (slowRec.length) tips.push(`Tardaste en reconocer ${slowRec.map(([n, t]) => `${n} (${f1(t)} s)`).join(', ')}: entrénalo en «Entrenar» → «Reconocer».`);
    if (llExtra >= 4) tips.push(`La última capa se llevó ${llExtra} giros de más: mira desde qué lado empiezas cada algoritmo (la ayuda en directo te lo dice).`);
    return `<div class="fr-an">
      <p class="fr-an-sum"><b class="fr-eff ${eff >= 90 ? 'ok' : eff >= 75 ? 'mid' : 'low'}">${eff} %</b> <span>de eficiencia: <b>${a.m}</b> giros; con lo más corto de cada paso (y tus mismas parejas) serían <b>${a.i}</b>.${a.z >= 1000 ? ` Pausas de más de 1 s a mitad de un paso: <b>${f1(a.z)} s</b>.` : ''}</span></p>
      <table class="fr-an-table"><thead><tr><th scope="col">Paso</th><th scope="col">Tus giros</th><th scope="col">Lo más corto</th><th scope="col">Nota</th></tr></thead><tbody>${rows.join('')}</tbody></table>
      ${tips.length ? `<p class="fr-an-h">Qué mejorar</p><ul class="fr-tips">${tips.slice(0, 3).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
        : `<p class="fr-note">${a.m <= a.i ? 'Nada que mejorar en giros: ahora, más rápido.' : `Solo ${a.m - a.i} ${a.m - a.i === 1 ? 'giro' : 'giros'} de más: muy bien. Lo que queda es ir más rápido.`}</p>`}
      <p class="hint">Giros contados como los nota el cubo: un giro de cara, también los dobles; las capas del medio cuentan dos. «Lo más corto»: la cruz más corta, cada pareja por el camino más corto sin romper lo hecho, y los algoritmos de J Perm desde el mejor lado.</p>
    </div>`;
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
    const pf = settings.pace !== 'off' ? paceFor(r) : null;
    const paceLine = pf ? `<p class="fr-pace-line"><span class="muted">Contra ${esc(pf.label)}:</span> ${pf.rows.map((row, g) => `<span class="pc ${row.gold ? 'gold' : row.d < 0 ? 'ahead' : 'behind'}"><span class="pc-n">${PACE_GROUPS[g][0]}</span> <span class="pc-d">${signed(row.d)}${row.gold ? ` ★ tu mejor ${g ? PACE_GROUPS[g][0] : 'cruz'}` : ''}</span></span>`).join(' · ')} → <b class="pc ${pf.total < 0 ? 'ahead' : 'behind'}"><span class="pc-d">${signed(pf.total)} s</span></b></p>` : '';
    box.innerHTML = `<div class="fr-splits-head"><span class="field-title">Tu solve por fases · ${esc(C.crossName(r.sp.f))}</span><b>${fmtRes(r)}</b></div>
      <div class="fr-bar">${bar}</div>${paceLine}
      <div class="fr-table" tabindex="0" role="region" aria-label="Tiempos de cada paso"><table><thead><tr><th scope="col">Paso</th><th scope="col">Tiempo</th><th scope="col">Giros</th><th scope="col">Caso</th><th scope="col">Reconocer + hacer</th></tr></thead><tbody>${rows}</tbody></table></div>`
      + (r.an ? `<details class="fr-an-box" open><summary>Análisis: cómo de óptimo fue cada paso</summary>${analysisHtml(r)}</details>` : r.rc ? '<p class="hint">Analizando el solve…</p>' : '')
      + (r.rc ? `<details class="fr-recon-box"><summary>Reconstrucción: tus giros paso a paso</summary>${reconHtml(r)}</details>` : '')
      + (total ? '' : '');
  }

  // ================= Stats and history =================
  let histShown = 25;
  const openRc = new Set();
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
    renderChart();
    renderHistory();
    renderFocus();
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
    const effs = withSp.filter((r) => r.an && r.an.m).map((r) => r.an.i / r.an.m);
    $('phaseLegend').innerHTML = vals.map(([name, t, rec]) => `<span><b>${name}</b> ${f1(t)} s · ${Math.round((t / total) * 100)} %${rec != null ? ` <span class="muted">(${f1(rec)} s reconociendo)</span>` : ''}</span>`).join('')
      + (effs.length ? `<span><b>Eficiencia media</b> ${Math.round((effs.reduce((a, x) => a + x, 0) / effs.length) * 100)} % <span class="muted">(${effs.length} ${effs.length === 1 ? 'solve' : 'solves'})</span></span>` : '');
  }
  function renderHistory() {
    const box = $('history');
    if (!times.length) { box.innerHTML = '<p class="empty-note">Aún no hay tiempos. Mantén pulsado el reloj (o Espacio) y suelta para empezar.</p>'; $('histMore').hidden = true; return; }
    // A «PB» tag on each solve that beat every earlier single.
    const isPb = [];
    let best = Infinity;
    times.forEach((r, i) => { const v = value(r); isPb[i] = i > 0 && Number.isFinite(v) && v < best && Number.isFinite(best); best = Math.min(best, v); });
    const list = times.map((r, i) => ({ r, i })).reverse().slice(0, histShown);
    const step = (r, idx) => (r.sp && idx.every((i) => r.sp.s[i]) ? f1(idx.reduce((a, i) => a + r.sp.s[i][0], 0)) : '—');
    const cases = (r) => (r.sp ? [2, 3, 4, 5].map((i) => { const x = r.sp.s[i]; if (!x) return null; if (x[4]) return 'salto'; const c = x[3] && C.caseById(x[3]); return c ? c.name.replace('PLL (', '').replace(')', '') : null; }).filter(Boolean).join(' · ') : '');
    box.innerHTML = `<table><thead><tr><th scope="col">#</th><th scope="col">Tiempo</th><th scope="col">ao5</th><th scope="col">Cruz</th><th scope="col">F2L</th><th scope="col">OLL</th><th scope="col">PLL</th><th scope="col">Casos</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead><tbody>${
      list.map(({ r, i }) => {
        const a5 = avgOf(times.slice(0, i + 1), 5);
        return `<tr><td class="muted">${i + 1}</td><td><b>${fmtRes(r)}</b>${isPb[i] ? ' <span class="fr-pbtag" title="Mejor single hasta entonces">PB</span>' : ''}</td><td class="muted">${a5 == null ? '' : fmt(a5)}</td>`
          + `<td>${step(r, [0])}</td><td>${step(r, [1])}</td><td>${step(r, [2, 3])}</td><td>${step(r, [4, 5])}</td><td class="fr-cases">${esc(cases(r))}</td>`
          + `<td class="fr-acts"><button class="x" type="button" data-pen="2" data-i="${i}" aria-label="Poner o quitar +2 al solve ${i + 1}" aria-pressed="${r.pen === 2}">+2</button>`
          + `<button class="x" type="button" data-pen="dnf" data-i="${i}" aria-label="Marcar o desmarcar DNF el solve ${i + 1}" aria-pressed="${r.pen === 'dnf'}">DNF</button>`
          + `<button class="x" type="button" data-del="${i}" aria-label="Borrar el solve ${i + 1}">×</button>`
          + (r.rc ? `<button class="x" type="button" data-rc="${r.at}" aria-expanded="${openRc.has(r.at)}" aria-label="Ver el análisis y los giros del solve ${i + 1}">ver</button>` : '')
          + '</td></tr>'
          + (r.rc && openRc.has(r.at) ? `<tr class="fr-recon-row"><td colspan="9">${analysisHtml(r)}${reconHtml(r)}</td></tr>` : '');
      }).join('')}</tbody></table>`;
    $('histMore').hidden = times.length <= histShown;
  }
  $('history').addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.rc != null) {
      const at = Number(b.dataset.rc);
      if (openRc.has(at)) openRc.delete(at); else openRc.add(at);
      renderHistory();
      return;
    }
    if (b.dataset.del != null) {
      const i = Number(b.dataset.del);
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '¿Borrar?'; b.classList.add('armed'); setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; b.textContent = '×'; b.classList.remove('armed'); } }, 3000); return; }
      if (times[i] === timer.last) timer.last = null;
      const gone = load(K.deleted, []);
      gone.push(times[i].at);
      save(K.deleted, gone.slice(-3000));
      times.splice(i, 1);
    } else if (b.dataset.pen) {
      const r = times[Number(b.dataset.i)];
      const p = b.dataset.pen === '2' ? 2 : 'dnf';
      r.pen = r.pen === p ? 0 : p;
      r.ed = Date.now();
    } else if (b.dataset.copyRc != null) return;
    else return;
    save(K.times, times);
    renderStats();
    emit('result', null);
    changed();
    ligaPublishSoon();
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
    if (t.fail || t.mfail) bits.push(`te perdiste ${(t.fail || 0) + (t.mfail || 0)} ${(t.fail || 0) + (t.mfail || 0) === 1 ? 'vez' : 'veces'}`);
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
      learnAt[id] = Date.now();
      save(K.learn, learn);
      save(K.learnAt, learnAt);
      changed();
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
      renderSetNote();
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
    renderSetNote();
    if (tr.c && !pick.includes(tr.c.id)) trNext();
  });
  document.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
    const p = b.dataset.pick;
    let ids = C.CASES.filter((c) => p === 'all' || (p === 'oll' && c.step.startsWith('oll')) || (p === 'pll' && c.step.startsWith('pll')) || (p === 'learning' && statusOf(c.id) === 'learning')).map((c) => c.id);
    if (!ids.length) { toast('Marca en «Casos» los que estás aprendiendo'); return; }
    pick = ids;
    save(K.pick, pick);
    renderPick();
    renderSetNote();
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
  const trActive = () => view === 'entrenar' && settings.trMode === 'cube' && cube && cube.on && !!tr.c && !ctActive();
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
    if (session) { session.mode = m; saveSession(); renderSession(); }
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
    tr.seq = (tr.seq || 0) + 1;
    tr.result = null;
    tr.err = '';
    tr.answered = false;
    if (!pick.length) return;
    tr.c = nextCase(tr.c && tr.c.id);
    markCurrent();
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
    // Another case, or another way of training, came meanwhile.
    if (tr.c !== c || settings.trMode !== 'cube') return;
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
    tr.seq = (tr.seq || 0) + 1;
    tr.result = null;
    tr.c = nextCase(tr.c && tr.c.id);
    markCurrent();
    trPrepare();
  }
  // «Me he perdido»: this case counts as failed (if it was already showing) and another one comes, prepared
  // from wherever the cube is.
  function trLost() {
    if (!tr.c) return;
    const c = tr.c;
    if (settings.trMode === 'cube' && tr.ready && !tr.result) {
      const rec = train[c.id] || {};
      rec.fail = (rec.fail || 0) + 1;
      train[c.id] = rec;
      save(K.train, train);
      logTr({ id: c.id, m: 'c', ok: 0, x: 1 });
      toast(`${c.name}: apuntado como fallo`);
    }
    tr.result = null;
    tr.c = nextCase(c.id);
    markCurrent();
    if (settings.trMode === 'cube' && cube && cube.on) trPrepare(); else trNext();
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
      logTr({ id: tr.c.id, m: 'c', ok: 1, t: Math.round(total), r: Math.round(recog) });
      tr.result = { total, recog, exec: total - recog };
      if (settings.sound) window.SmartCube.chime(true);
      buzz([60]);
      renderTrain();
      const seq = tr.seq;
      setTimeout(() => { if (tr.seq === seq && trActive()) trAdvance(); }, 1400);
      return;
    }
    renderTrain();
  }
  function trSync() { if (trActive() && !tr.follow && !tr.busy) trPrepare(); else if (trActive() && tr.follow && !tr.ready) { locate(tr.follow, cube.state); renderTrain(); } }
  // The case on screen in «Reconocer», from the side and top turn it is shown with.
  function quizPicture() {
    const c = tr.c;
    const g = C.caseState(c, tr.qAuf);
    const shown = tr.qView ? apply(g, tr.qView) : g;
    return topView(shown, { mode: modeOf(c.step), arrows: false, label: `Un caso de ${STEP_NAME[c.step]}: ¿cuál es?` });
  }
  let lastAns = null;   // the last answer, for the overlay
  function renderTrain() {
    emit('train', null);
    const box = $('trBox');
    const c = tr.c;
    if (!c) { box.innerHTML = '<p class="empty-note">Elige qué casos quieres entrenar.</p>'; return; }
    const step = C.STEPS.find((s) => s.id === c.step);
    if (settings.trMode === 'look') {
      const options = C.CASES.filter((x) => x.step === c.step);
      box.innerHTML = `<div class="fr-quiz">
        <div class="fr-quiz-pic">${quizPicture()}</div>
        <div class="fr-quiz-body">
          <span class="field-title">${step.name} · ¿qué caso es?</span>
          <div class="fr-options">${options.map((x, i) => `<button class="btn" type="button" data-answer="${x.id}"><kbd>${i + 1}</kbd> ${esc(x.name)}</button>`).join('')}</div>
          <p class="fr-feedback" id="trFeedback" aria-live="polite"></p>
          <p class="hint">${esc(trainLine(c.id))}</p>
          ${sessHtml()}
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
      </div><p class="hint">${esc(trainLine(c.id))}</p>${sessHtml()}`;
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
      html += '<div class="actions"><button class="btn" type="button" data-tr-lost>Otro caso</button></div>';
    } else if (tr.result) {
      html += `<p class="fr-big ok">✓ ${esc(c.name)} en ${f1(tr.result.total)} s</p><p class="hint">Reconocer ${f1(tr.result.recog)} s · hacer ${f1(tr.result.exec)} s. Ahora otro…</p>`;
    } else {
      const read = C.readCube(cube.state, settings.cross);
      const want = C.LL.indexOf(c.step) + 2;
      html += tr.first
        ? `<p class="fr-note">Resuélvelo… ${read.stage < want ? '<span class="bad">se ha deshecho el paso anterior</span>' : ''}</p>`
        : '<p class="fr-big">¡Ya! ¿Qué caso es? Resuélvelo.</p>';
      html += `<details class="fr-peek"><summary>Ver el algoritmo</summary>${casePicture(c)}<p><b>${esc(c.name)}</b> ${algHtml(c.alg)}</p><p class="hint">${esc(c.look)}</p></details>`;
      html += '<div class="actions fr-lost"><button class="btn" type="button" data-tr-lost>Me he perdido · otro caso</button><span class="hint">Cuenta como fallo y te preparo otro desde como esté el cubo.</span></div>';
    }
    html += `</div><p class="hint">${esc(trainLine(c.id))}</p>`;
    html += sessHtml();
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
    if (b) { answer(b.dataset.answer); return; }
    if (ev.target.closest('[data-tr-lost]')) trLost();
  });
  // This session: since the page was opened.
  function sessHtml() {
    if (session || (!sess.n && !sess.lost)) return '';
    const bits = [`${sess.n} ${sess.n === 1 ? 'caso' : 'casos'}`];
    if (sess.n) bits.push(`${Math.round((sess.ok / sess.n) * 100)} % bien`);
    if (sess.lost) bits.push(`${sess.lost} ${sess.lost === 1 ? 'vez' : 'veces'} perdido`);
    if (sess.timed) bits.push(`media ${f1(sess.sum / sess.timed)} s`);
    return `<p class="fr-sess"><b>Esta sesión</b> ${bits.join(' · ')}</p>`;
  }
  function answer(id) {
    if (settings.trMode === 'hand') { answerHand(id); return; }
    if (settings.trMode !== 'look' || !tr.c || tr.answered) return;
    tr.answered = true;
    const ms = now() - tr.qStart;
    const c = tr.c;
    const ok = id === c.id;
    lastAns = { ok: ok ? 1 : 0, t: Math.round(ms), name: c.name, guess: (C.caseById(id) || {}).name || '' };
    const rec = train[c.id] || {};
    rec.qn = (rec.qn || 0) + 1;
    rec.qok = (rec.qok || 0) + (ok ? 1 : 0);
    rec.qsum = (rec.qsum || 0) + ms;
    train[c.id] = rec;
    save(K.train, train);
    logTr({ id: c.id, m: 'q', ok: ok ? 1 : 0, t: Math.round(ms) });
    document.querySelectorAll('[data-answer]').forEach((x) => {
      x.disabled = true;
      if (x.dataset.answer === c.id) x.classList.add('right');
      else if (x.dataset.answer === id) x.classList.add('wrong');
    });
    const fb = $('trFeedback');
    fb.className = `fr-feedback ${ok ? 'ok' : 'ko'}`;
    fb.innerHTML = `${ok ? '✓' : '✗ Era'} <b>${esc(c.name)}</b> · ${f1(ms)} s<br>${algHtml(c.alg)}<br><span class="hint">${esc(c.look)}</span>`
      + (ok ? '' : ' <button class="btn" type="button" id="trNextQ">Siguiente</button>');
    // On to the next one by itself (unless you went on already: a later answer must not be cut short).
    const seq = tr.seq;
    if (ok) setTimeout(() => { if (tr.seq === seq && tr.answered && settings.trMode === 'look' && view === 'entrenar') trNext(); }, 1100);
    else $('trNextQ').addEventListener('click', () => trNext());
  }
  // «Cubo normal»: after guessing, what it was and how to solve it (the cube ends solved for the next one).
  function answerHand(id) {
    const t = tr.hand;
    if (!t || tr.answered) return;
    tr.answered = true;
    const c = t.c;
    const ok = id === c.id;
    lastAns = { ok: ok ? 1 : 0, t: null, name: c.name, guess: (C.caseById(id) || {}).name || '' };
    const rec = train[c.id] || {};
    rec.mn = (rec.mn || 0) + 1;
    rec.mok = (rec.mok || 0) + (ok ? 1 : 0);
    train[c.id] = rec;
    save(K.train, train);
    logTr({ id: c.id, m: 'h', ok: ok ? 1 : 0 });
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
      <div class="actions"><button class="btn primary" type="button" id="trNextQ">Siguiente</button><button class="btn" type="button" id="trHandLost">Me he perdido</button></div>
      <p class="hint">«Me he perdido» lo apunta como fallo: resuelve el cubo como sea y sigue con otro.</p>`;
    $('trNextQ').addEventListener('click', () => trNext());
    $('trHandLost').addEventListener('click', () => {
      const rec2 = train[c.id] || {};
      rec2.mfail = (rec2.mfail || 0) + 1;
      train[c.id] = rec2;
      save(K.train, train);
      logTr({ id: c.id, m: 'h', ok: 0, x: 1 });
      toast(`${c.name}: apuntado como fallo`);
      trNext();
    });
  }
  document.addEventListener('keydown', (ev) => {
    if (view !== 'entrenar' || (settings.trMode !== 'look' && settings.trMode !== 'hand') || typing(ev.target)) return;
    const n = Number(ev.key);
    if (n >= 1 && n <= 7) {
      const b = document.querySelectorAll('[data-answer]')[n - 1];
      if (b) { ev.preventDefault(); answer(b.dataset.answer); }
    } else if ((ev.key === 'Enter' || ev.key === ' ') && tr.answered && !ev.repeat) { ev.preventDefault(); trNext(); }
  });
  onView('entrenar', () => { renderPlan(); renderTrStats(); renderSetNote(); applySession(); if (!tr.c || (settings.trMode === 'cube' && cube && cube.on && !tr.follow && !tr.busy)) trNext(); else renderTrain(); });

  // ================= How it is going: a chart =================
  // Every solve (dots, DNFs left out), with the ao5 and the ao12 at each one. One axis, thin lines, the last
  // values labelled at the end; hovering shows that solve.
  const CHART = { w: 640, h: 220, l: 40, r: 78, t: 12, b: 26 };
  function renderChart() {
    const box = $('chartBox');
    box.hidden = times.length < 3;
    document.querySelectorAll('[data-chart]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.chart) === settings.chart)));
    if (box.hidden) return;
    // Drawn at the size it is shown, so text and dots keep their size.
    CHART.w = Math.max(300, Math.round($('chart').clientWidth || 640));
    CHART.h = CHART.w < 520 ? 190 : 220;
    const from = settings.chart ? Math.max(0, times.length - settings.chart) : 0;
    const pts = [];
    for (let i = from; i < times.length; i++) {
      const upTo = times.slice(0, i + 1);
      const a5 = avgOf(upTo, 5);
      const a12 = avgOf(upTo, 12);
      pts.push({ i, v: value(times[i]), a5: a5 === Infinity ? null : a5, a12: a12 === Infinity ? null : a12 });
    }
    const vals = pts.flatMap((p) => [p.v, p.a5, p.a12]).filter((x) => x != null && x !== Infinity);
    if (!vals.length) { box.hidden = true; return; }
    let lo = Math.min(...vals); let hi = Math.max(...vals);
    if (hi - lo < 1000) { hi += 500; lo -= 500; }
    const pad = (hi - lo) * 0.08; lo = Math.max(0, lo - pad); hi += pad;
    const W = CHART.w - CHART.l - CHART.r; const H = CHART.h - CHART.t - CHART.b;
    const x = (k) => CHART.l + (pts.length < 2 ? W / 2 : (k / (pts.length - 1)) * W);
    const y = (v) => CHART.t + H - ((v - lo) / (hi - lo)) * H;
    // Ticks: round seconds.
    const span = (hi - lo) / 1000;
    const stepS = [0.5, 1, 2, 5, 10, 20, 30, 60].find((st) => span / st <= 5) || 120;
    let grid = '';
    for (let v = Math.ceil(lo / 1000 / stepS) * stepS; v * 1000 <= hi; v += stepS) {
      grid += `<line class="fr-grid" x1="${CHART.l}" x2="${CHART.l + W}" y1="${y(v * 1000).toFixed(1)}" y2="${y(v * 1000).toFixed(1)}"/><text class="fr-tick" x="${CHART.l - 8}" y="${(y(v * 1000) + 4).toFixed(1)}" text-anchor="end">${v % 1 ? v.toFixed(1) : v}</text>`;
    }
    const line = (field, cls) => {
      let d = ''; let pen = false;
      pts.forEach((p, k) => {
        if (p[field] == null) { pen = false; return; }
        d += `${pen ? 'L' : 'M'}${x(k).toFixed(1)} ${y(p[field]).toFixed(1)} `;
        pen = true;
      });
      return d ? `<path class="${cls}" d="${d.trim()}"/>` : '';
    };
    const dots = pts.map((p, k) => (p.v === Infinity ? '' : `<circle class="fr-dot" cx="${x(k).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="2.6"/>`)).join('');
    const lastOf = (field) => { for (let k = pts.length - 1; k >= 0; k--) if (pts[k][field] != null) return { k, v: pts[k][field] }; return null; };
    const endLabel = (field, cls, name) => {
      const e = lastOf(field);
      return e ? `<text class="fr-end ${cls}" x="${CHART.l + W + 6}" y="${(y(e.v) + 4).toFixed(1)}">${name} ${fmt(e.v)}</text>` : '';
    };
    const l5 = lastOf('a5'); const l12 = lastOf('a12');
    // Keep the two end labels apart.
    let labels = endLabel('a5', 'a5', 'ao5') + endLabel('a12', 'a12', 'ao12');
    if (l5 && l12 && Math.abs(y(l5.v) - y(l12.v)) < 14) {
      const up = y(l5.v) < y(l12.v) ? 'a5' : 'a12';
      labels = `<text class="fr-end ${up}" x="${CHART.l + W + 6}" y="${(Math.min(y(l5.v), y(l12.v)) - 3).toFixed(1)}">${up === 'a5' ? `ao5 ${fmt(l5.v)}` : `ao12 ${fmt(l12.v)}`}</text>`
        + `<text class="fr-end ${up === 'a5' ? 'a12' : 'a5'}" x="${CHART.l + W + 6}" y="${(Math.max(y(l5.v), y(l12.v)) + 11).toFixed(1)}">${up === 'a5' ? `ao12 ${fmt(l12.v)}` : `ao5 ${fmt(l5.v)}`}</text>`;
    }
    $('chart').innerHTML = `<svg viewBox="0 0 ${CHART.w} ${CHART.h}" role="img" aria-label="Tus tiempos de los últimos ${pts.length} solves, con la ao5 y la ao12">
      ${grid}<text class="fr-tick" x="${CHART.l}" y="${CHART.h - 6}">#${from + 1}</text><text class="fr-tick" x="${CHART.l + W}" y="${CHART.h - 6}" text-anchor="end">#${times.length}</text>
      ${dots}${line('a12', 'fr-l a12')}${line('a5', 'fr-l a5')}${labels}
      <line class="fr-cross-hair" id="chartHair" x1="0" x2="0" y1="${CHART.t}" y2="${CHART.t + H}" visibility="hidden"/>
      <rect class="fr-hit" x="${CHART.l}" y="${CHART.t}" width="${W}" height="${H}"/></svg><div class="fr-tip" id="chartTip" hidden></div>`;
    $('chartLegend').innerHTML = '<span><i class="fr-key dot"></i>Cada solve</span><span><i class="fr-key a5"></i>ao5</span><span><i class="fr-key a12"></i>ao12</span>';
    const svg = $('chart').querySelector('svg');
    const hit = svg.querySelector('.fr-hit');
    const move = (ev) => {
      const rect = svg.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * CHART.w;
      const k = Math.max(0, Math.min(pts.length - 1, Math.round(((px - CHART.l) / W) * (pts.length - 1))));
      const p = pts[k];
      const hair = $('chartHair');
      hair.setAttribute('x1', x(k)); hair.setAttribute('x2', x(k)); hair.setAttribute('visibility', 'visible');
      const tip = $('chartTip');
      tip.hidden = false;
      tip.innerHTML = `<b>#${p.i + 1}</b> ${fmtRes(times[p.i])}${p.a5 != null ? `<br>ao5 ${fmt(p.a5)}` : ''}${p.a12 != null ? `<br>ao12 ${fmt(p.a12)}` : ''}`;
      const left = (x(k) / CHART.w) * rect.width;
      tip.style.left = `${Math.min(rect.width - 120, Math.max(0, left + 10))}px`;
    };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => { $('chartHair').setAttribute('visibility', 'hidden'); $('chartTip').hidden = true; });
  }
  document.querySelectorAll('[data-chart]').forEach((b) => b.addEventListener('click', () => {
    settings.chart = Number(b.dataset.chart);
    saveSettings();
    renderChart();
  }));
  let chartW = 0;
  window.addEventListener('resize', () => {
    clearTimeout(chartW);
    chartW = setTimeout(() => { if (view === 'crono' && !$('chartBox').hidden) renderChart(); }, 150);
  });
  onView('crono', () => setTimeout(renderChart, 0));

  // ================= What to train today =================
  // From your solves (splits and analysis) and your training: where the time goes, and a set of cases that
  // would win most, with why. Entrenar the set: those cases, in the way that fits.
  const S = window.CfopStats;
  const DAY_MS = 86400000;
  const fdate = (ts) => new Date(ts).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  const secs = (ms, d = 1) => (ms == null || !Number.isFinite(ms) ? '—' : `${(ms / 1000).toFixed(d)} s`);
  const shortName = (c) => c.name.replace('PLL (', '').replace(')', '');
  // A change: arrow and words as well as colour. Times: down is better.
  function deltaHtml(cur, before, opts = {}) {
    if (cur == null || before == null || !Number.isFinite(cur) || !Number.isFinite(before)) return '';
    const d = cur - before;
    const eps = opts.eps != null ? opts.eps : 50;
    if (Math.abs(d) < eps) return '<span class="fr-delta same">igual</span>';
    const better = opts.higherBetter ? d > 0 : d < 0;
    const txt = opts.fmt ? opts.fmt(Math.abs(d)) : `${(Math.abs(d) / 1000).toFixed(1)} s`;
    return `<span class="fr-delta ${better ? 'good' : 'bad'}">${d < 0 ? '▼' : '▲'} ${txt} ${better ? 'mejor' : 'peor'}</span>`;
  }
  const MODE_NAME = { cube: 'Cubo inteligente', hand: 'Cubo normal', look: 'Reconocer' };
  const smartOn = () => !!(cube && cube.on);
  const modeFor = (m) => (m === 'look' ? 'look' : m === 'learn' ? 'hand' : smartOn() ? 'cube' : 'hand');
  let plan = null;
  const recommendation = () => S.recommend({ times, train, trlog, learn, crossTr: load(K.crossTr, []) });
  function goButton(go) {
    if (go === 'slow' || go === 'help') return '<button class="btn" type="button" data-plan-go="slow">Practicar sin crono</button>';
    if (go === 'cross') return '<button class="btn" type="button" data-plan-go="cross">Entrenar la cruz</button>';
    if (go === 'set-look') return '<button class="btn" type="button" data-set-go="look">El set, en «Reconocer»</button>';
    if (go === 'set-cube') return `<button class="btn" type="button" data-set-go="${smartOn() ? 'cube' : 'hand'}">El set, con el cubo</button>`;
    return '';
  }
  function setWhy(m) {
    if (m === 'look') return 'Te lo recomiendo en «Reconocer»: lo que más te cuesta de estos es verlos.';
    if (m === 'learn') return 'Casi todos están sin practicar: con «Cubo normal» te digo cómo dejarlos y cómo resolverlos.';
    return smartOn() ? 'Con el cubo inteligente te mido reconocer y hacer cada uno.' : 'Con tu cubo te digo cómo dejarlo en cada caso y lo resuelves. Si conectas el inteligente, además te mide los tiempos.';
  }
  function renderPlan() {
    const box = $('planBox');
    if (!box) return;
    plan = recommendation();
    const parts = plan.parts.slice(0, 4);
    const max = Math.max(1, ...parts.map((p) => p.ms));
    let html = '';
    if (parts.length) {
      const shown = new Set();
      const once = (go) => { const k = go === 'help' ? 'slow' : go; if (shown.has(k)) return ''; shown.add(k); return goButton(go); };
      html += `<details class="fr-gain" id="gainBox"${settings.gainOpen === false ? '' : ' open'}><summary><span class="field-title">Dónde puedes ganar tiempo <span class="muted">· tus últimos ${plan.solves} solves con el cubo</span></span></summary>
        <ol class="fr-gain-list">${parts.map((p) => `<li data-gain="${p.id}">
          <div class="fr-gain-top"><b>${esc(p.name)}</b><span class="fr-gain-s">~${secs(p.ms)} por solve</span></div>
          <span class="fr-gain-bar" aria-hidden="true"><i style="width:${Math.max(4, Math.round((p.ms / max) * 100))}%"></i></span>
          <p class="hint">${esc(p.how)}</p>
          ${once(p.go)}
        </li>`).join('')}</ol>
        <p class="hint">Cuentas aproximadas: cada parte contra tu propio nivel bueno (tus casos más rápidos, tu ritmo al girar).</p></details>`;
    } else {
      html += `<p class="fr-note">${plan.solves ? 'En tus últimos solves con el cubo no veo nada que te cueste mucho: sigue así.' : 'Haz unos solves con el cubo inteligente en el cronómetro y te diré en qué paso se te va el tiempo.'} El set de abajo sale de ${times.some((r) => r.sp) ? 'tus solves y ' : ''}lo que entrenas${trlog.length || times.some((r) => r.sp) ? '' : ' (aún nada: empiezo por los casos que más salen)'}.</p>`;
    }
    const rec = modeFor(plan.setMode);
    html += `<div class="fr-setbox"><h3 class="field-title">Set recomendado <span class="muted">· ${plan.set.length} casos, el que más te cuesta primero</span></h3>
      <div class="fr-set">${plan.set.map((x) => `<article class="fr-set-card" data-set-case="${x.id}">
        <div class="fr-set-pic">${casePicture(x.c)}</div>
        <div class="fr-set-body"><h4>${esc(x.c.name)} <span class="muted">${STEP_NAME[x.c.step]}</span></h4>
          <p class="fr-set-alg">${algHtml(x.c.alg)}</p>
          <ul class="fr-why">${x.why.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>
        </div></article>`).join('')}</div>
      <div class="actions fr-set-go">
        <button class="btn primary" type="button" data-set-go="${rec}">Empezar sesión · ${MODE_NAME[rec]}</button>
        ${['cube', 'hand', 'look'].filter((m) => m !== rec).map((m) => `<button class="btn" type="button" data-set-go="${m}">${MODE_NAME[m]}</button>`).join('')}
      </div>
      <p class="hint">${setWhy(plan.setMode)} En la sesión llevo la cuenta de cada caso y, cuando dominas uno, entra el siguiente que más te cuesta.</p></div>`;
    box.innerHTML = html;
    const g = $('gainBox');
    if (g) g.addEventListener('toggle', () => { settings.gainOpen = g.open; saveSettings(); });
  }
  function startSet(mode) {
    startSession(mode);
  }
  function startSetOnly(mode) {
    if (!plan) plan = recommendation();
    settings.trSet = plan.set.map((x) => x.id);
    pick = [...settings.trSet];
    save(K.pick, pick);
    renderPick();
    tr.c = null;
    setTrMode(mode);   // saves the settings and brings the first case
    renderSetNote();
    try { $('trPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* no layout */ }
  }
  function renderSetNote() {
    const el = $('trSetNote');
    if (!el) return;
    const set = Array.isArray(settings.trSet) ? settings.trSet : null;
    const on = !session && !!(set && set.length === pick.length && set.every((id) => pick.includes(id)));
    el.hidden = !on;
    if (!on) { if (set) { settings.trSet = null; saveSettings(); } return; }
    el.innerHTML = `<span><b>Set recomendado:</b> ${set.map((id) => esc(shortName(C.caseById(id)))).join(' · ')}</span><button class="btn" type="button" id="setLeave">Dejar el set</button>`;
    $('setLeave').addEventListener('click', () => {
      settings.trSet = null;
      saveSettings();
      pick = C.CASES.map((c) => c.id);
      save(K.pick, pick);
      renderPick();
      renderSetNote();
      trNext();
    });
  }
  $('planBox').addEventListener('click', (ev) => {
    const set = ev.target.closest('[data-set-go]');
    if (set) { startSet(set.dataset.setGo); return; }
    const go = ev.target.closest('[data-plan-go]');
    if (!go) return;
    if (go.dataset.planGo === 'slow') {
      if (timer.phase === 'run') return;
      settings.timed = false;
      saveSettings();
      showView('crono');
      toast('Practicar sin crono: con la ayuda en directo, sin prisa');
    } else if (go.dataset.planGo === 'cross') {
      try { $('ctPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* no layout */ }
      const b = $('ctGo');
      if (b) b.focus({ preventScroll: true });
    }
  });

  // ================= Training sessions =================
  // «Empezar sesión»: the recommended set, tracked case by case. A case is mastered after a few right in a row
  // (with the smart cube, each under its target: your own good level for it; recognising, right and quick);
  // then it leaves the set and the next case that costs you most comes in. Every dozen attempts the set is
  // weighed again, in case another case now costs clearly more. Ends with a summary, kept in «Tus sesiones».
  const NEED = { cube: 3, hand: 3, look: 4 };
  const MODE_SHORT = { cube: 'con el cubo inteligente', hand: 'con tu cubo', look: 'reconociendo' };
  let session = load(K.session, null);
  let planEvery = 0;
  const saveSession = () => save(K.session, session);
  function lookTarget() {
    const qs = trlog.filter((e) => e.m === 'q' && e.ok && e.t).map((e) => e.t).slice(-60);
    const med = qs.length >= 5 ? S.quantile(qs, 0.5) : 1500;
    return Math.round(Math.min(2500, Math.max(1000, med)) / 100) * 100;
  }
  function targetFor(id) {
    const c = C.caseById(id);
    const t = (session.refRec + (C.algHtm(c.alg) * 1000) / session.refTps) * 1.15;
    return Math.max(1500, Math.round(t / 100) * 100);
  }
  function initPer(id, stats) {
    const st = stats[id] || {};
    session.per[id] = {
      n: 0, ok: 0, lost: 0, sum: 0, timed: 0, qn: 0, qsum: 0, best: null, last: [], mastered: null,
      before: { cube: st.cubeAvg != null ? st.cubeAvg : null, qacc: st.quizAcc != null ? st.quizAcc : null, qtime: st.quizTime != null ? st.quizTime : null },
      target: targetFor(id),
    };
  }
  const caseNow = () => S.caseStats(times, train, trlog, learn);
  function startSession(mode) {
    if (!plan) plan = recommendation();
    if (session) { setTrMode(mode); return; }
    const ids = plan.set.map((x) => x.id);
    const now2 = Date.now();
    session = {
      at: now2, mode, set: ids, done: [], swaps: [], per: {}, n: 0, ok: 0, lost: 0, active: 0, lastAt: now2, since: 0,
      prevPick: pick.slice(), refRec: plan.refRec, refTps: plan.refTps, look: lookTarget(),
    };
    const stats = caseNow();
    ids.forEach((id) => initPer(id, stats));
    settings.trSet = null;
    pick = ids.slice();
    save(K.pick, pick);
    renderPick();
    tr.c = null;
    saveSession();
    applySession();
    setTrMode(mode);
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { /* no layout */ }
  }
  // Each attempt (from the training log).
  const qualifies = (x, p) => !x.x && !!x.ok && (x.m === 'c' ? x.t != null && x.t <= p.target : x.m === 'q' ? x.t != null && x.t <= session.look : true);
  function streakOf(p) {
    let k = 0;
    for (let i = p.last.length - 1; i >= 0 && qualifies(p.last[i], p); i--) k++;
    return k;
  }
  function sessionAttempt(e) {
    if (!session) {
      // Outside a session, the suggestion above the trainer keeps up by itself.
      planEvery++;
      if (planEvery % 10 === 0 && view === 'entrenar') renderPlan();
      return;
    }
    const now2 = Date.now();
    session.active += Math.min(now2 - session.lastAt, 120000);
    session.lastAt = now2;
    if (!session.per[e.id]) initPer(e.id, caseNow());
    const p = session.per[e.id];
    if (e.x) { p.lost++; session.lost++; } else { p.n++; session.n++; if (e.ok) { p.ok++; session.ok++; } }
    if (e.m === 'c' && e.ok && e.t != null) { p.sum += e.t; p.timed++; p.best = p.best == null ? e.t : Math.min(p.best, e.t); }
    if (e.m === 'q') { p.qn++; if (e.t != null) p.qsum += e.t; }
    p.last.push({ m: e.m, ok: e.ok ? 1 : 0, t: e.t != null ? e.t : null, x: e.x ? 1 : 0 });
    if (p.last.length > 8) p.last = p.last.slice(-8);
    let won = null;
    if (!p.mastered && session.set.includes(e.id) && streakOf(p) >= NEED[{ c: 'cube', h: 'hand', q: 'look' }[e.m]]) won = e.id;
    session.since++;
    saveSession();
    if (won) masterCase(won);
    else if (session.since >= 12) reweigh();
    renderSession();
  }
  // The next case that costs you most, of the ones not in the set nor mastered today.
  function candidate() {
    const out = recommendation().scored.filter((x) => !session.set.includes(x.id) && !session.done.includes(x.id));
    return out.find((x) => x.ms >= 15) || out[0] || null;
  }
  function swapIn(outId, inId, why) {
    const i = session.set.indexOf(outId);
    if (inId) {
      session.set.splice(i, 1, inId);
      if (!session.per[inId]) initPer(inId, caseNow());
    } else if (session.set.length > 1) session.set.splice(i, 1);
    session.swaps.push({ out: outId, in: inId, why, at: Date.now() });
    pick = session.set.slice();
    save(K.pick, pick);
    renderPick();
  }
  function masterCase(id) {
    const p = session.per[id];
    p.mastered = Date.now();
    session.done.push(id);
    const next = candidate();
    if (next || session.set.length > 1) swapIn(id, next && next.id, 'dominado');
    session.since = 0;
    saveSession();
    const c = C.caseById(id);
    toast(next ? `✓ ${c.name}, dominado · entra ${next.c.name}` : `✓ ${c.name}, dominado`);
    if (settings.sound) window.SmartCube.chime(true);
    buzz([40, 40, 120]);
    lastWon = id;
  }
  let lastWon = null;
  function reweigh() {
    session.since = 0;
    const rc = recommendation();
    const cost = (id) => (rc.scored.find((x) => x.id === id) || { ms: 0 }).ms;
    const out = rc.scored.find((x) => !session.set.includes(x.id) && !session.done.includes(x.id));
    const ins = session.set.filter((id) => (!tr.c || id !== tr.c.id) && session.per[id] && session.per[id].n >= 3).sort((a, b) => cost(a) - cost(b));
    if (out && ins.length && out.ms > Math.max(30, 1.5 * cost(ins[0]))) {
      swapIn(ins[0], out.id, 'cuesta menos que otro');
      toast(`Cambio en el set: entra ${out.c.name}, que ahora te cuesta más que ${C.caseById(ins[0]).name}`);
    }
    saveSession();
  }
  function markCurrent() {
    if (!session) return;
    document.querySelectorAll('#sessSet .fr-sc').forEach((el) => {
      const cur = !!(tr.c && el.dataset.sc === tr.c.id);
      el.classList.toggle('cur', cur);
      const tag = el.querySelector('.fr-sc-now');
      if (tag) tag.hidden = !cur;
    });
    renderSession();
  }
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  function clockText() {
    if (!session) return '0:00';
    const ms = session.active + Math.min(Date.now() - session.lastAt, 120000);
    const m = Math.floor(ms / 60000);
    return `${m}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
  }
  function caseCard(id) {
    const c = C.caseById(id);
    const p = session.per[id];
    const need = NEED[session.mode];
    const k = Math.min(need, streakOf(p));
    const pips = Array.from({ length: need }, (_, i) => `<i class="${i < k ? 'on' : ''}"></i>`).join('');
    let line;
    if (session.mode === 'look') {
      const acc = p.qn ? pct(p.last.filter((x) => x.m === 'q' && x.ok).length, p.last.filter((x) => x.m === 'q').length) : null;
      line = p.qn ? `<b>${acc} %</b> bien · <b>${secs(p.qsum / p.qn, 2)}</b> de media` : 'aún sin hacer';
      if (p.before.qtime != null) line += ` <span>(antes ${Math.round((p.before.qacc || 0) * 100)} % · ${secs(p.before.qtime, 2)})</span>`;
    } else if (session.mode === 'cube') {
      line = p.timed ? `media <b>${secs(p.sum / p.timed, 2)}</b>${p.before.cube != null ? ` ${deltaHtml(p.sum / p.timed, p.before.cube)}` : ''} · mejor ${secs(p.best, 2)}` : 'aún sin hacer';
      line += ` · objetivo <b>${secs(p.target)}</b>`;
    } else {
      line = p.n || p.lost ? `<b>${p.ok}</b> de ${p.n} bien${p.lost ? ` · perdido ${p.lost}` : ''}` : 'aún sin hacer';
    }
    const last = p.last.map((x) => (x.x ? '<span class="ko">perdido</span>' : x.ok ? `<span class="ok">✓${x.t != null && x.m !== 'h' ? ` ${f1(x.t)}` : ''}</span>` : '<span class="ko">✗</span>')).join('');
    const cur = !!(tr.c && tr.c.id === id);
    return `<article class="fr-sc${cur ? ' cur' : ''}${lastWon === id ? ' won' : ''}" data-sc="${id}">
      <div class="fr-sc-pic">${casePicture(c)}</div>
      <div class="fr-sc-body">
        <div class="fr-sc-top"><b>${esc(c.name)}</b><span class="muted">${STEP_NAME[c.step]}</span><span class="fr-pips" role="img" aria-label="${k} de ${need} seguidos para dominarlo">${pips}</span><span class="fr-sc-now"${cur ? '' : ' hidden'}>Ahora</span></div>
        <p class="fr-sc-line">${line}</p>
        ${last ? `<p class="fr-sc-last" aria-label="Últimos intentos">${last}</p>` : ''}
      </div>
    </article>`;
  }
  function renderSession() {
    if (!session) return;
    const need = NEED[session.mode];
    $('sessClock').textContent = clockText();
    $('sessNums').innerHTML = `<b>${session.n}</b> ${session.n === 1 ? 'caso' : 'casos'} · <b>${pct(session.ok, session.n)} %</b> bien${session.lost ? ` · ${session.lost} perdido${session.lost === 1 ? '' : 's'}` : ''} · <b>${session.done.length}</b> ${session.done.length === 1 ? 'dominado' : 'dominados'}`;
    $('sessRule').textContent = session.mode === 'cube' ? `Dominas un caso con ${need} seguidos por debajo de su objetivo (tu buen nivel para ese caso).`
      : session.mode === 'look' ? `Dominas un caso con ${need} seguidos bien y en menos de ${secs(session.look)}.`
        : `Dominas un caso con ${need} seguidos bien, sin perderte.`;
    // On a phone the set is below the trainer: a line with each case and its progress, in the bar.
    $('sessMini').innerHTML = session.set.map((id) => {
      const k = Math.min(need, streakOf(session.per[id]));
      return `<span class="${tr.c && tr.c.id === id ? 'cur' : ''}">${esc(shortName(C.caseById(id)))} ${'●'.repeat(k)}${'○'.repeat(need - k)}</span>`;
    }).join('');
    const done = session.done.map((id) => C.caseById(id));
    const swaps = session.swaps.filter((x) => x.why !== 'dominado');
    $('sessSet').innerHTML = session.set.map(caseCard).join('')
      + (done.length ? `<div class="fr-sc-done"><span class="field-title">Dominados en esta sesión</span><ul>${done.map((c) => `<li>✓ <b>${esc(c.name)}</b> <span class="muted">${STEP_NAME[c.step]}</span></li>`).join('')}</ul></div>` : '')
      + (swaps.length ? `<p class="fr-sc-swaps">${swaps.map((x) => `Entró ${esc(C.caseById(x.in).name)} por ${esc(C.caseById(x.out).name)}: te costaba más.`).join(' ')}</p>` : '');
    lastWon = null;
  }
  let sessTick = 0;
  function applySession() {
    const on = !!session;
    document.body.classList.toggle('training', on && view === 'entrenar');
    $('sessBar').hidden = !on;
    $('sessPanel').hidden = !on;
    clearInterval(sessTick);
    if (on) {
      renderSession();
      sessTick = setInterval(() => { if (session && document.visibilityState === 'visible') { $('sessClock').textContent = clockText(); renderMode2(); } }, 1000);
    }
    renderMode2();
    renderSetNote();
  }
  // The tag in the header: which mode you are in, or a session waiting for you.
  function renderMode2() {
    const el = $('modePill');
    if (!el) return;
    const away = session && view !== 'entrenar';
    el.classList.toggle('live', !!away);
    el.textContent = away ? `Sesión en curso · ${clockText()}` : document.body.dataset.mode === 'learn' ? 'Modo aprendizaje' : 'Modo cronómetro';
    el.setAttribute('role', away ? 'button' : 'status');
    el.tabIndex = away ? 0 : -1;
    document.body.classList.toggle('training', !!session && view === 'entrenar');
  }
  $('modePill').addEventListener('click', () => { if (session && view !== 'entrenar') showView('entrenar'); });
  $('modePill').addEventListener('keydown', (ev) => { if ((ev.key === 'Enter' || ev.key === ' ') && session && view !== 'entrenar') { ev.preventDefault(); showView('entrenar'); } });
  function endSession() {
    if (!session) return;
    const s2 = session;
    session = null;
    save(K.session, null);
    const stats = caseNow();
    const rows = Object.entries(s2.per).filter(([, p]) => p.n || p.lost).map(([id, p]) => {
      const c = C.caseById(id);
      const nowCube = p.timed ? p.sum / p.timed : null;
      const nowQ = p.qn ? p.qsum / p.qn : null;
      return { id, name: c.name, n: p.n, ok: p.ok, lost: p.lost, mastered: !!p.mastered, cube: nowCube, cubeBefore: p.before.cube, q: nowQ, qBefore: p.before.qtime };
    });
    const summary = {
      at: s2.at, end: Date.now(), active: s2.active, mode: s2.mode, n: s2.n, ok: s2.ok, lost: s2.lost,
      done: s2.done, cases: rows.map((r) => [r.id, r.n, r.ok, r.lost, r.cube != null ? Math.round(r.cube) : null, r.q != null ? Math.round(r.q) : null]),
    };
    if (s2.n || s2.lost) {
      const list = load(K.sessions, []);
      list.push(summary);
      save(K.sessions, list.slice(-200));
      changed();
    }
    pick = Array.isArray(s2.prevPick) && s2.prevPick.length ? s2.prevPick : C.CASES.map((c) => c.id);
    save(K.pick, pick);
    renderPick();
    applySession();
    void stats;
    if (!s2.n && !s2.lost) { toast('Sesión cerrada sin casos'); if (view === 'entrenar') { renderPlan(); trNext(); } return; }
    const mins = Math.max(1, Math.round(s2.active / 60000));
    $('sessSum').innerHTML = `<div class="stats">
        <div class="stat"><span>Tiempo</span><b>${mins} min</b><small>entrenando</small></div>
        <div class="stat"><span>Casos</span><b>${s2.n}</b><small>${pct(s2.ok, s2.n)} % bien</small></div>
        <div class="stat"><span>Dominados</span><b>${s2.done.length}</b><small>${s2.lost ? `${s2.lost} veces perdido` : 'sin perderte'}</small></div>
      </div>
      ${s2.done.length ? `<p class="fr-note">Has dominado <b>${s2.done.map((id) => esc(C.caseById(id).name)).join(', ')}</b>.</p>` : '<p class="fr-note">Hoy no has dominado ninguno, pero cada intento cuenta para el siguiente set.</p>'}
      <table><thead><tr><th scope="col">Caso</th><th scope="col">Hechos</th><th scope="col">Hoy</th><th scope="col">Antes</th></tr></thead><tbody>
      ${rows.map((r) => {
        const today = r.cube != null ? `${secs(r.cube, 2)} ${deltaHtml(r.cube, r.cubeBefore)}` : r.q != null ? `${secs(r.q, 2)} reconociendo ${deltaHtml(r.q, r.qBefore)}` : `${r.ok}/${r.n} bien`;
        const before = r.cube != null ? secs(r.cubeBefore, 2) : r.q != null ? secs(r.qBefore, 2) : '—';
        return `<tr><th scope="row">${r.mastered ? '✓ ' : ''}${esc(r.name)}</th><td>${r.n}${r.lost ? ` <span class="muted">· ${r.lost} perdido</span>` : ''}</td><td>${today}</td><td class="muted">${before}</td></tr>`;
      }).join('')}</tbody></table>
      <p class="hint">Guardada en «Tus casos, en números». El set recomendado ya cuenta con lo de hoy.</p>`;
    $('sessSheet').hidden = false;
    $('sessClose').focus();
    if (view === 'entrenar') { renderPlan(); renderTrStats(); trNext(); }
  }
  $('sessEnd').addEventListener('click', endSession);
  $('sessClose').addEventListener('click', () => { $('sessSheet').hidden = true; });
  $('sessSheet').addEventListener('click', (ev) => { if (ev.target.id === 'sessSheet') $('sessSheet').hidden = true; });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('sessSheet').hidden) $('sessSheet').hidden = true; });
  // Past sessions, under «Tus casos, en números».
  function sessionsHtml() {
    const list = load(K.sessions, []).slice(-8).reverse();
    if (!list.length) return '';
    return `<div class="fr-sess-list"><h3 class="field-title">Tus sesiones</h3><div class="rk-table"><table><thead><tr><th scope="col">Cuándo</th><th scope="col">Tiempo</th><th scope="col">Casos</th><th scope="col">Bien</th><th scope="col">Dominados</th></tr></thead><tbody>${
      list.map((x) => `<tr><td>${ago(x.end || x.at)}</td><td>${Math.max(1, Math.round((x.active || 0) / 60000))} min</td><td>${x.n}</td><td>${pct(x.ok, x.n)} %</td><td>${(x.done || []).map((id) => esc(shortName(C.caseById(id)))).join(', ') || '—'}</td></tr>`).join('')
    }</tbody></table></div></div>`;
  }
  // A session left open: it goes on after a reload; one from hours ago is closed and kept.
  if (session && (!session.per || !Array.isArray(session.set) || Date.now() - (session.lastAt || 0) > 6 * 3600000)) {
    const old = session;
    session = null;
    save(K.session, null);
    if (old && old.n) { const list = load(K.sessions, []); list.push({ at: old.at, end: old.lastAt, active: old.active, mode: old.mode, n: old.n, ok: old.ok, lost: old.lost, done: old.done || [], cases: [] }); save(K.sessions, list.slice(-200)); }
  }

  // ================= Your cases, in numbers =================
  let caseSort = 'cost';
  function renderTrStats() {
    const box = $('trStats');
    if (!box) return;
    const p = plan || recommendation();
    const tot = S.training(train, trlog);
    const tile = (k, v, sub) => `<div class="stat"><span>${k}</span><b>${v}</b><small>${sub}</small></div>`;
    const tiles = [
      tile('Esta semana', tot.week ? `${tot.week}` : '0', tot.week ? `casos en ${tot.days} ${tot.days === 1 ? 'día' : 'días'}` : 'sin entrenar'),
      tile('Reconocer', tot.quiz ? `${Math.round((tot.quizOk / tot.quiz) * 100)} %` : '—', tot.quiz ? `bien de ${tot.quiz} · ${secs(tot.quizMs / tot.quiz)}` : 'sin hacer'),
      tile('Con el cubo', tot.cube ? secs(tot.cubeMs / tot.cube, 2) : '—', tot.cube ? `de media en ${tot.cube} · ${secs(tot.cubeRec / tot.cube)} reconociendo` : 'sin hacer'),
      tile('Cubo normal', tot.hand ? `${Math.round((tot.handOk / tot.hand) * 100)} %` : '—', tot.hand ? `acertado de ${tot.hand}` : 'sin hacer'),
      tile('Te perdiste', String(tot.lost), tot.lost === 1 ? 'vez' : 'veces'),
    ];
    const rows = (caseSort === 'step' ? C.CASES.map((c) => p.scored.find((x) => x.id === c.id)) : p.scored).map((x) => {
      const st = x.stats;
      const status = st.status === 'known' ? '<span class="fr-badge known">Me lo sé</span>' : st.status === 'learning' ? '<span class="fr-badge learning">Aprendiendo</span>' : '';
      const inSolves = st.seen ? `${st.seen} · ${secs(st.solveRec)} + ${secs(st.solveExec)}` : '—';
      const trained = [];
      if (st.cubeN) trained.push(`${st.cubeN} con el cubo · ${secs(st.cubeAvg, 2)}${st.best != null ? ` (mejor ${secs(st.best, 2)})` : ''}`);
      if (st.quizN) trained.push(`reconocer ${Math.round((st.quizAcc || 0) * 100)} % · ${secs(st.quizTime)}`);
      if (st.handN) trained.push(`${st.handN} con tu cubo · ${Math.round((st.handAcc || 0) * 100)} %`);
      if (st.lost) trained.push(`<span class="bad">perdido ${st.lost}</span>`);
      const cost = x.ms >= 5 ? `<span class="fr-cost"><i style="width:${Math.min(100, Math.round((x.ms / Math.max(1, p.scored[0].ms)) * 100))}%"></i></span>${(x.ms / 1000).toFixed(2)} s` : '<span class="muted">—</span>';
      return `<tr><th scope="row"><span class="fr-case-n">${esc(x.c.name)}</span> <span class="muted">${STEP_NAME[x.c.step]}</span> ${status}</th>
        <td>${inSolves}</td><td>${trained.length ? trained.join('<br>') : '<span class="muted">aún nada</span>'}</td><td class="fr-cost-c">${cost}</td></tr>`;
    }).join('');
    box.innerHTML = `<div class="stats fr-tr-tiles">${tiles.join('')}</div>
      <table class="fr-an-table fr-case-table"><thead><tr><th scope="col">Caso</th><th scope="col">En tus solves <span class="muted">veces · reconocer + hacer</span></th><th scope="col">Entrenando</th><th scope="col">Te cuesta <span class="muted">por solve</span></th></tr></thead><tbody>${rows}</tbody></table>
      <p class="hint">«Te cuesta»: lo que pierdes de media en cada solve por ese caso, contando lo que tardas en reconocerlo y hacerlo (comparado con tus casos más rápidos), lo que fallas y te pierdes, y lo a menudo que sale.</p>${sessionsHtml()}`;
  }
  document.querySelectorAll('[data-case-sort]').forEach((b) => b.addEventListener('click', () => {
    caseSort = b.dataset.caseSort;
    document.querySelectorAll('[data-case-sort]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderTrStats();
  }));

  // ================= Progreso =================
  let dayRange = 90;
  const KIND = { single: 'Single', ao5: 'ao5', ao12: 'ao12' };
  function spark(values, label) {
    const v = values.filter((x) => x != null && Number.isFinite(x)).slice(-80);
    if (v.length < 3) return '';
    const sm = v.map((_, i) => { const w = v.slice(Math.max(0, i - 4), i + 1); return w.reduce((a, b) => a + b, 0) / w.length; });
    const W = 200; const H = 40;
    let lo = Math.min(...sm); let hi = Math.max(...sm);
    if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
    const x = (i) => 2 + (i / (sm.length - 1)) * (W - 6);
    const y = (val) => 4 + (1 - (val - lo) / (hi - lo)) * (H - 8);
    const d = sm.map((val, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(val).toFixed(1)}`).join(' ');
    return `<svg class="fr-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}"><path d="${d}"/><circle cx="${x(sm.length - 1).toFixed(1)}" cy="${y(sm[sm.length - 1]).toFixed(1)}" r="2.6"/></svg>`;
  }
  function renderProgress() {
    if (!$('progSummary')) return;
    const crossTr = load(K.crossTr, []);
    const sm = S.summary(times);
    const act = S.activity(times, trlog, crossTr);
    const empty = !times.length && !trlog.length && !crossTr.length;
    ['progDaysPanel', 'progActPanel', 'progStepsPanel', 'progEffPanel', 'progCrossPanel', 'progCasesPanel'].forEach((id) => { $(id).hidden = empty; });
    if (empty) {
      $('progSummary').innerHTML = '<p class="empty-note">Aún no hay nada que contar. Haz unos solves en el cronómetro (mejor con el cubo inteligente: así veo cada paso) o entrena unos casos, y aquí verás cómo vas.</p>';
      return;
    }
    // ---- Summary
    const lead = [];
    if (times.length) {
      lead.push(`Llevas <b>${times.length}</b> ${times.length === 1 ? 'solve' : 'solves'} desde el ${fdate(sm.first)}${act.days > 1 ? `, en ${act.days} días distintos` : ''}.`);
      if (sm.ao12 != null && Number.isFinite(sm.ao12)) lead.push(`Tu media de 12 es <b>${fmt(sm.ao12)}</b>${sm.prevAo12 != null && Number.isFinite(sm.prevAo12) ? `: ${deltaHtml(sm.ao12, sm.prevAo12)} que las 12 de antes` : ''}.`);
      else if (sm.ao5 != null && Number.isFinite(sm.ao5)) lead.push(`Tu media de 5 es <b>${fmt(sm.ao5)}</b>.`);
      if (sm.then && Number.isFinite(sm.then.v) && Number.isFinite(sm.ao12)) lead.push(`${sm.then.month ? 'Hace un mes' : 'Al empezar'} tu media de 12 era ${fmt(sm.then.v)}: ${deltaHtml(sm.ao12, sm.then.v)}.`);
      if (sm.week.n) lead.push(`Esta semana: <b>${sm.week.n}</b> solves${sm.week.mean != null ? `, media ${fmt(sm.week.mean)}` : ''}${sm.prevWeek.mean != null && sm.week.mean != null ? ` (${deltaHtml(sm.week.mean, sm.prevWeek.mean)} que la anterior)` : ''}.`);
      else lead.push('Esta semana aún no has hecho solves.');
    } else lead.push('Aún no hay solves: de momento, lo que has entrenado.');
    const tile = (k, v, sub) => `<div class="stat"><span>${k}</span><b>${v}</b><small>${sub || '&nbsp;'}</small></div>`;
    const tiles = times.length ? [
      tile('Mejor single', sm.best ? fmt(sm.best.v) : '—', sm.best ? `${fdate(sm.best.at)} · #${sm.best.i + 1}` : ''),
      tile('Mejor ao5', sm.bestAo5 ? fmt(sm.bestAo5.v) : '—', sm.bestAo5 ? fdate(sm.bestAo5.at) : 'faltan solves'),
      tile('Mejor ao12', sm.bestAo12 ? fmt(sm.bestAo12.v) : '—', sm.bestAo12 ? fdate(sm.bestAo12.at) : 'faltan solves'),
      tile('ao12 ahora', fmt(sm.ao12), sm.ao100 != null ? `ao100 ${fmt(sm.ao100)}` : sm.ao50 != null ? `ao50 ${fmt(sm.ao50)}` : ''),
      tile('Racha', `${act.streak} ${act.streak === 1 ? 'día' : 'días'}`, `la mejor, ${act.bestStreak}`),
    ] : [tile('Racha', `${act.streak} ${act.streak === 1 ? 'día' : 'días'}`, `la mejor, ${act.bestStreak}`)];
    $('progSummary').innerHTML = `<p class="fr-prog-lead">${lead.join(' ')}</p><div class="stats fr-prog-tiles">${tiles.join('')}</div>`;

    // ---- Day by day, and the milestones
    renderDayChart();
    const ms = S.milestones(times);
    $('progMilestones').innerHTML = times.length ? `<div class="fr-miles">
      ${ms.next.length ? `<div><h3 class="field-title">A por</h3><ul>${ms.next.map((x) => `<li><b>${KIND[x.kind]} por debajo de ${x.sub} s</b> <span class="muted">· te faltan ${secs(x.gap)}</span></li>`).join('')}</ul></div>` : ''}
      ${ms.done.length ? `<div><h3 class="field-title">Logros</h3><ul>${ms.done.slice(0, 5).map((x) => `<li><b>${KIND[x.kind]} por debajo de ${x.sub} s</b> <span class="muted">· ${fdate(x.at)} (${fmt(x.v)})</span></li>`).join('')}</ul></div>` : ''}
    </div>` : '';

    // ---- Practice: a calendar
    const lvl = (n) => (!n ? 0 : n <= 3 ? 1 : n <= 8 ? 2 : n <= 15 ? 3 : 4);
    const weeks = Math.ceil(act.cells.length / 7);
    let months = '';
    let lastM = -1;
    for (let w = 0; w < weeks; w++) {
      const c = act.cells[w * 7];
      const m = new Date(c.ts).getMonth();
      months += `<span style="grid-column:${w + 1}">${m !== lastM ? new Date(c.ts).toLocaleDateString('es-ES', { month: 'short' }) : ''}</span>`;
      lastM = m;
    }
    const cellTitle = (c) => `${fdate(c.ts)}: ${c.n ? [c.solves && `${c.solves} ${c.solves === 1 ? 'solve' : 'solves'}`, c.train && `${c.train} ${c.train === 1 ? 'caso' : 'casos'}`, c.cross && `${c.cross} ${c.cross === 1 ? 'cruz' : 'cruces'}`].filter(Boolean).join(', ') : 'nada'}`;
    $('progActivity').innerHTML = `<div class="fr-hm-wrap">
        <div class="fr-hm-days" aria-hidden="true"><span>L</span><span></span><span>X</span><span></span><span>V</span><span></span><span>D</span></div>
        <div class="fr-hm-main">
          <div class="fr-hm-months" aria-hidden="true" style="grid-template-columns:repeat(${weeks}, var(--hm))">${months}</div>
          <div class="fr-hm" role="img" aria-label="Has practicado ${act.active30} de los últimos 30 días; racha de ${act.streak} ${act.streak === 1 ? 'día' : 'días'}" style="grid-template-columns:repeat(${weeks}, var(--hm))">${act.cells.map((c) => `<i class="h${lvl(c.n)}" title="${esc(cellTitle(c))}"></i>`).join('')}</div>
        </div>
      </div>
      <p class="fr-hm-key" aria-hidden="true">Menos <i class="h0"></i><i class="h1"></i><i class="h2"></i><i class="h3"></i><i class="h4"></i> Más <span class="muted">· solves, casos entrenados y cruces de cada día</span></p>
      <div class="stats fr-prog-tiles">
        ${tile('Racha', `${act.streak} ${act.streak === 1 ? 'día' : 'días'}`, act.streak ? 'seguidos, hasta hoy' : 'practica hoy y empieza una')}
        ${tile('Mejor racha', `${act.bestStreak} ${act.bestStreak === 1 ? 'día' : 'días'}`, '')}
        ${tile('Últimos 30 días', `${act.active30} ${act.active30 === 1 ? 'día' : 'días'}`, 'practicando')}
        ${tile('Tiempo girando', act.ms >= 3600000 ? `${(act.ms / 3600000).toFixed(1)} h` : `${Math.round(act.ms / 60000)} min`, 'solves y casos cronometrados')}
      </div>`;

    // ---- Steps
    const st = S.steps(times);
    $('progSteps').innerHTML = !st.n ? '<p class="fr-note">Con el cubo inteligente verás aquí cuánto tardas en cada paso y cómo cambia con el tiempo.</p>'
      : `<p class="hint">Últimos ${st.recent} solves con el cubo${st.groups[0].before != null ? ', comparados con los anteriores' : ''}.</p>
        <div class="fr-step-cards">${st.groups.map((g) => `<div class="fr-step-card">
          <span class="field-title">${g.name}</span>
          <b class="fr-step-v">${secs(g.now, 2)}</b>
          ${deltaHtml(g.now, g.before) || '<span class="fr-delta same">&nbsp;</span>'}
          <span class="muted">${Math.round(g.share * 100)} % del solve · ${Math.round(g.moves)} giros${g.rec != null ? ` · ${secs(g.rec)} reconociendo` : ''}</span>
          ${spark(g.series.map((x) => x.v), `${g.name}: ${g.series.length} solves, media móvil de 5`)}
        </div>`).join('')}</div>
        <p class="fr-note">Giros por segundo: <b>${st.tps.toFixed(2)}</b>${st.tpsBefore != null ? ` ${deltaHtml(st.tps, st.tpsBefore, { higherBetter: true, eps: 0.05, fmt: (d) => d.toFixed(2) })}` : ''}</p>`;

    // ---- Efficiency
    const ef = S.efficiency(times);
    if (!ef.n) $('progEff').innerHTML = '<p class="fr-note">Cada solve con el cubo se analiza: cuántos giros hiciste en cada paso contra lo más corto. Aquí verás la media y si mejora.</p>';
    else {
      const a = ef.now; const b = ef.before;
      const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)} %`);
      const num = (x, d = 1) => (x == null ? '—' : x.toFixed(d));
      const row = (name, cur, before, show, opts) => `<tr><th scope="row">${name}</th><td class="fr-an-n">${show(cur)}</td><td class="fr-an-n">${b ? show(before) : '—'}</td><td class="fr-an-note">${b ? deltaHtml(cur, before, opts) : ''}</td></tr>`;
      const giros = { eps: 0.25, fmt: (d) => `${d.toFixed(1)} giros` };
      const pctO = { eps: 0.02, higherBetter: true, fmt: (d) => `${Math.round(d * 100)} %` };
      $('progEff').innerHTML = `<table class="fr-an-table"><thead><tr><th scope="col">Últimos ${Math.min(12, ef.n)} solves</th><th scope="col">Ahora</th><th scope="col">Antes</th><th scope="col">Cambio</th></tr></thead><tbody>
        ${row('Eficiencia', a.eff, b && b.eff, pct, pctO)}
        ${row('Giros por solve', a.moves, b && b.moves, (x) => (x == null ? '—' : `${Math.round(x)}`), giros)}
        ${row('Cruz: giros de más', a.crossExtra, b && b.crossExtra, num, giros)}
        ${row('Parejas: giros de más (cada una)', a.perPair, b && b.perPair, num, giros)}
        ${row('Parejas por el camino más corto', a.pairsOptimal, b && b.pairsOptimal, pct, pctO)}
        ${row('Empezaste por la pareja más fácil', a.easiest, b && b.easiest, pct, pctO)}
        ${row('Parado en el F2L', a.f2lStop, b && b.f2lStop, (x) => secs(x), {})}
        ${row('OLL y PLL: giros de más', a.llExtra, b && b.llExtra, num, giros)}
      </tbody></table>
      ${spark(ef.list.map((x) => x.eff * 100), `Eficiencia de tus ${ef.n} solves analizados, media móvil de 5`) ? `<div class="fr-eff-spark"><span class="field-title">Eficiencia, solve a solve</span>${spark(ef.list.map((x) => x.eff * 100), `Eficiencia de tus ${ef.n} solves analizados, media móvil de 5`)}</div>` : ''}
      <p class="hint">«Antes»: los 12 solves analizados anteriores${b ? '' : ' (aún no hay tantos)'}.</p>`;
    }

    // ---- The cross
    const ctl = crossTr;
    const lastC = ctl.slice(-10); const firstC = ctl.length >= 15 ? ctl.slice(0, 10) : [];
    const avgX = (xs) => (xs.length ? xs.reduce((s2, x) => s2 + (x.n - x.opt), 0) / xs.length : null);
    const cg = st.n ? st.groups[0] : null;
    $('progCross').innerHTML = (ctl.length ? `<div class="stats fr-prog-tiles">
        ${tile('Entrenadas', String(ctl.length), 'en «Entrenar la cruz»')}
        ${tile('Giros de más', avgX(lastC).toFixed(1), `de media en las últimas ${lastC.length}${firstC.length ? ` · al principio ${avgX(firstC).toFixed(1)}` : ''}`)}
        ${tile('Perfectas', `${Math.round((lastC.filter((x) => x.n <= x.opt).length / lastC.length) * 100)} %`, 'la más corta, de las últimas')}
        ${tile('Tiempo', secs(lastC.reduce((s2, x) => s2 + (x.t || 0), 0) / lastC.length, 2), 'de media')}
      </div>` : '<p class="fr-note">Aún no has usado «Entrenar la cruz»: planéala entera en la inspección y te digo cuántos giros te sobran.</p>')
      + (cg ? `<p class="fr-note">En tus solves con el cubo, la cruz te lleva <b>${secs(cg.now, 2)}</b> y ${Math.round(cg.moves)} giros${ef.n ? `, ${ef.now.crossExtra.toFixed(1)} más que la más corta` : ''}.</p>` : '')
      + '<div class="actions"><button class="btn" type="button" data-prog-go="cross">Entrenar la cruz</button></div>';

    // ---- Cases
    const p = recommendation();
    const top = p.scored.filter((x) => x.ms >= 15 && x.stats.practiced).slice(0, 3);
    const known = C.CASES.filter((c) => learn[c.id] === 'known').length;
    const learning = C.CASES.filter((c) => learn[c.id] === 'learning').length;
    const skips = { oll1: 0, oll2: 0, pll1: 0, pll2: 0 };
    times.forEach((r) => { if (r.sp) [2, 3, 4, 5].forEach((k) => { const x = r.sp.s[k]; if (x && x[4]) skips[C.LL[k - 2]]++; }); });
    const skipTxt = C.LL.filter((id) => skips[id]).map((id) => `${STEP_NAME[id]} ×${skips[id]}`).join(' · ');
    $('progCases').innerHTML = `<p class="fr-note">Te sabes <b>${known}</b> de 16${learning ? ` y estás aprendiendo ${learning}` : ''}.${skipTxt ? ` Saltos que te han tocado: ${skipTxt}.` : ''}</p>
      ${top.length ? `<h3 class="field-title">Lo que más te cuesta</h3><ol class="fr-top-cases">${top.map((x) => `<li><b>${esc(x.c.name)}</b> <span class="muted">${STEP_NAME[x.c.step]} · ${(x.ms / 1000).toFixed(2)} s por solve</span><br><span class="hint">${esc(x.why[0] || '')}</span></li>`).join('')}</ol>` : ''}
      <div class="actions"><button class="btn primary" type="button" data-prog-go="plan">Ver el set recomendado</button></div>`;
  }
  $('progCross').addEventListener('click', (ev) => { if (ev.target.closest('[data-prog-go="cross"]')) { showView('entrenar'); try { $('ctPanel').scrollIntoView({ block: 'start' }); } catch (e) { /* no layout */ } } });
  $('progCases').addEventListener('click', (ev) => { if (ev.target.closest('[data-prog-go="plan"]')) showView('entrenar'); });

  // Each day with solves: its mean and its best. One axis (seconds), hovering shows that day.
  const DCH = { w: 640, h: 220, l: 40, r: 16, t: 12, b: 26 };
  function renderDayChart() {
    const box = $('dayChart');
    document.querySelectorAll('[data-days]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.days) === dayRange)));
    const all = S.daily(times).filter((d) => d.mean != null);
    const from = dayRange ? S.dayStart(Date.now()) - (dayRange - 1) * DAY_MS : -Infinity;
    const days = all.filter((d) => d.ts >= from);
    if (days.length < 2) {
      box.innerHTML = `<p class="fr-note">${all.length < 2 ? 'Cuando tengas solves de dos días o más, aquí verás tu media y tu mejor tiempo de cada día.' : 'En estos días hay menos de dos con solves: prueba con «Todo».'}</p>`;
      $('dayLegend').innerHTML = '';
      return;
    }
    DCH.w = Math.max(300, Math.round(box.clientWidth || 640));
    DCH.h = DCH.w < 520 ? 190 : 220;
    const W = DCH.w - DCH.l - DCH.r; const H = DCH.h - DCH.t - DCH.b;
    const t0 = days[0].ts; const span = Math.max(1, days[days.length - 1].ts - t0);
    const x = (ts) => DCH.l + ((ts - t0) / span) * W;
    const vals = days.flatMap((d) => [d.mean, d.best]);
    let lo = Math.min(...vals); let hi = Math.max(...vals);
    if (hi - lo < 1000) { hi += 500; lo -= 500; }
    const pad = (hi - lo) * 0.08; lo = Math.max(0, lo - pad); hi += pad;
    const y = (v) => DCH.t + H - ((v - lo) / (hi - lo)) * H;
    const stepS = [0.5, 1, 2, 5, 10, 20, 30, 60].find((st2) => (hi - lo) / 1000 / st2 <= 5) || 120;
    let grid = '';
    for (let v = Math.ceil(lo / 1000 / stepS) * stepS; v * 1000 <= hi; v += stepS) {
      grid += `<line class="fr-grid" x1="${DCH.l}" x2="${DCH.l + W}" y1="${y(v * 1000).toFixed(1)}" y2="${y(v * 1000).toFixed(1)}"/><text class="fr-tick" x="${DCH.l - 8}" y="${(y(v * 1000) + 4).toFixed(1)}" text-anchor="end">${v % 1 ? v.toFixed(1) : v}</text>`;
    }
    const d = days.map((p, k) => `${k ? 'L' : 'M'}${x(p.ts).toFixed(1)} ${y(p.mean).toFixed(1)}`).join(' ');
    box.innerHTML = `<svg viewBox="0 0 ${DCH.w} ${DCH.h}" role="img" aria-label="Tu media y tu mejor tiempo de cada día, ${days.length} días: de ${fmt(days[0].mean)} a ${fmt(days[days.length - 1].mean)} de media">
      ${grid}<text class="fr-tick" x="${DCH.l}" y="${DCH.h - 6}">${fdate(days[0].ts)}</text><text class="fr-tick" x="${DCH.l + W}" y="${DCH.h - 6}" text-anchor="end">${fdate(days[days.length - 1].ts)}</text>
      <path class="fr-l a5" d="${d}"/>
      ${days.map((p) => `<circle class="fr-dmean" cx="${x(p.ts).toFixed(1)}" cy="${y(p.mean).toFixed(1)}" r="3"/><circle class="fr-dbest" cx="${x(p.ts).toFixed(1)}" cy="${y(p.best).toFixed(1)}" r="3"/>`).join('')}
      <line class="fr-cross-hair" id="dayHair" x1="0" x2="0" y1="${DCH.t}" y2="${DCH.t + H}" visibility="hidden"/>
      <rect class="fr-hit" x="${DCH.l - 6}" y="${DCH.t}" width="${W + 12}" height="${H}"/></svg><div class="fr-tip" id="dayTip" hidden></div>`;
    $('dayLegend').innerHTML = '<span><i class="fr-key a5"></i>Media del día</span><span><i class="fr-key best"></i>Mejor del día</span>';
    const svg = box.querySelector('svg');
    const hit = svg.querySelector('.fr-hit');
    const move = (ev) => {
      const rect = svg.getBoundingClientRect();
      const px = ((ev.clientX - rect.left) / rect.width) * DCH.w;
      let k = 0;
      days.forEach((p, i) => { if (Math.abs(x(p.ts) - px) < Math.abs(x(days[k].ts) - px)) k = i; });
      const p = days[k];
      const hair = $('dayHair');
      hair.setAttribute('x1', x(p.ts)); hair.setAttribute('x2', x(p.ts)); hair.setAttribute('visibility', 'visible');
      const tip = $('dayTip');
      tip.hidden = false;
      tip.innerHTML = `<b>${fdate(p.ts)}</b> · ${p.n} ${p.n === 1 ? 'solve' : 'solves'}<br>media ${fmt(p.mean)}<br>mejor ${fmt(p.best)}`;
      const left = (x(p.ts) / DCH.w) * rect.width;
      tip.style.left = `${Math.min(rect.width - 130, Math.max(0, left + 10))}px`;
    };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', () => { $('dayHair').setAttribute('visibility', 'hidden'); $('dayTip').hidden = true; });
  }
  document.querySelectorAll('[data-days]').forEach((b) => b.addEventListener('click', () => { dayRange = Number(b.dataset.days); renderDayChart(); }));
  let dayW = 0;
  window.addEventListener('resize', () => {
    clearTimeout(dayW);
    dayW = setTimeout(() => { if (view === 'progreso') renderDayChart(); }, 150);
  });
  onView('progreso', () => setTimeout(renderProgress, 0));

  // ================= Ranking with friends =================
  // A league: friends with a code. Each one's best single, ao5 and ao12 — total time only, as in a competition
  // — published by itself whenever yours change (a record, a +2, a deleted solve). With the smart cube a record
  // also carries its steps; without it, its scramble, to try it yourself.
  const LIGA_CAT = [['single', 'Single'], ['ao5', 'Media de 5'], ['ao12', 'Media de 12']];
  const CAT_TEXT = { single: 'single', ao5: 'media de 5', ao12: 'media de 12' };
  const lg = { data: {}, err: '', busy: false, cat: 'single', open: null, invite: null, fresh: new Set(), timer: 0 };
  const cleanName = (x) => String(x == null ? '' : x).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40);
  const ABC = 'abcdefghijkmnpqrstuvwxyz23456789';
  function player() {
    let p = load(K.player, null);
    if (!p || !/^[a-z0-9]{12,32}$/.test(p.id || '') || !/^[a-f0-9]{32,64}$/.test(p.token || '')) {
      const a = new Uint8Array(32);
      crypto.getRandomValues(a);
      p = { id: [...a.slice(0, 16)].map((b) => ABC[b % 32]).join(''), token: [...a.slice(16)].map((b) => b.toString(16).padStart(2, '0')).join(''), at: Date.now() };
      save(K.player, p);
      changed();
    }
    return p;
  }
  const myName = () => cleanName(load(K.name, '')).slice(0, 24);
  const playerBody = () => { const p = player(); return { id: p.id, token: p.token, name: myName() }; };
  function ligas() { const l = load(K.ligas, []); return Array.isArray(l) ? l.filter((x) => x && /^[a-z0-9]{8}$/.test(x.code)) : []; }
  const curCode = () => { const l = ligas(); return (l.find((x) => x.code === settings.liga) || l[0] || {}).code || null; };

  // ---- Your bests, with what the others can look at
  function bestWindow(n) {
    let best = Infinity;
    let end = -1;
    for (let i = n - 1; i < times.length; i++) {
      const a = avgOf(times.slice(i - n + 1, i + 1), n);
      if (a < best) { best = a; end = i; }
    }
    return end < 0 || !Number.isFinite(best) ? null : { v: best, end };
  }
  function solveOut(r, full) {
    const o = { t: r.t, pen: r.pen || 0, at: r.at, scr: r.scr || '' };
    if (r.sp) o.sp = r.sp;
    if (full && r.rc) o.rc = r.rc;
    if (full && r.an && r.an.m) o.an = { m: r.an.m, i: r.an.i };
    return o;
  }
  function myBests() {
    let si = -1;
    times.forEach((r, i) => { if (Number.isFinite(value(r)) && (si < 0 || value(r) < value(times[si]))) si = i; });
    const avg = (n) => { const w = bestWindow(n); return w ? { v: Math.round(w.v), at: times[w.end].at, solves: times.slice(w.end - n + 1, w.end + 1).map((r) => solveOut(r, false)) } : null; };
    return { single: si >= 0 ? solveOut(times[si], true) : null, ao5: avg(5), ao12: avg(12) };
  }
  const catVal = (m, cat) => {
    const b = m.best && m.best[cat];
    if (!b) return Infinity;
    return cat === 'single' ? b.t + (b.pen === 2 ? 2000 : 0) : b.v;
  };
  const standings = (league, cat) => league.members.map((m) => ({ m, v: catVal(m, cat) })).sort((a, b) => a.v - b.v || a.m.joined - b.m.joined);
  function rankOf(league, cat) {
    const st = standings(league, cat);
    const i = st.findIndex((x) => x.m.id === player().id);
    return i >= 0 && Number.isFinite(st[i].v) ? i + 1 : null;
  }

  // ---- Publishing yours (only when they changed since the last time)
  let pubT = 0;
  const pubSig = (best) => JSON.stringify([myName(), best.single && [best.single.t, best.single.pen, best.single.at], best.ao5 && [best.ao5.v, best.ao5.at], best.ao12 && [best.ao12.v, best.ao12.at]]);
  function ligaPublishSoon(ms = 1200) { if (!ligas().length) return; clearTimeout(pubT); pubT = setTimeout(() => ligaPublish(), ms); }
  async function ligaPublish(force) {
    const list = ligas();
    if (!list.length) return [];
    const best = myBests();
    const sig = pubSig(best);
    const pub = load(K.ligaPub, {});
    const out = [];
    for (const l of list) {
      if (!force && pub[l.code] === sig) continue;
      try {
        const league = await api(`api/liga?code=${l.code}`, { action: 'post', player: playerBody(), best, n: times.length });
        pub[l.code] = sig;
        save(K.ligaPub, pub);
        lg.data[l.code] = { league, at: Date.now() };
        out.push(league);
      } catch (e) { /* offline: tried again with the next change or visit */ }
    }
    if (out.length && view === 'ranking') renderRanking();
    return out;
  }
  // After a record: where it leaves you in each league.
  function announceRank(leagues, recs) {
    const parts = [];
    leagues.forEach((league) => {
      const cat = recs.map((x) => x.k).find((k) => rankOf(league, k)) || 'single';
      const pos = rankOf(league, cat);
      if (pos && league.members.length > 1) parts.push(`«${league.name}»: ${pos}.º de ${league.members.length} en ${CAT_TEXT[cat]}`);
    });
    if (parts.length) setTimeout(() => toast(`Ranking ${parts.join(' · ')}`), 2600);
  }

  // ---- Reading a league, and what changed since you last looked
  async function loadLeague(code, quiet) {
    if (!code) return;
    if (!quiet) { lg.busy = true; renderRanking(); }
    try {
      const league = await api(`api/liga?code=${code}`);
      lg.data[code] = { league, at: Date.now() };
      lg.err = '';
      const list = ligas();
      const it = list.find((x) => x.code === code);
      if (it && it.name !== league.name) { it.name = league.name; save(K.ligas, list); }
      newsOf(code, league);
    } catch (e) { lg.err = e.message; }
    lg.busy = false;
    if (view === 'ranking' && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#rankBox input'))) renderRanking();
  }
  function newsOf(code, league) {
    const seen = load(K.ligaSeen, {});
    const was = seen[code];
    const me = player().id;
    const news = [];
    league.members.forEach((m) => {
      if (m.id === me) return;
      if (was && (was[m.id] == null || m.updated > was[m.id])) { lg.fresh.add(`${code}|${m.id}`); if (was[m.id] != null) news.push(m.name); else news.push(`${m.name} (nuevo)`); }
    });
    seen[code] = Object.fromEntries(league.members.map((m) => [m.id, m.updated]));
    save(K.ligaSeen, seen);
    if (news.length && was) toast(`Ranking: novedades de ${news.join(', ')}`);
  }

  // ---- Drawing it
  function ago(at) {
    const s2 = Math.max(0, (Date.now() - at) / 1000);
    if (s2 < 60) return 'ahora';
    if (s2 < 3600) return `hace ${Math.round(s2 / 60)} min`;
    if (s2 < 86400) return `hace ${Math.round(s2 / 3600)} h`;
    const d = Math.round(s2 / 86400);
    return d === 1 ? 'ayer' : d < 30 ? `hace ${d} días` : fdate(at);
  }
  const hasSteps = (b, cat) => (cat === 'single' ? !!(b && b.sp) : !!(b && b.solves && b.solves.some((x) => x.sp)));
  function stepsHtml(x) {
    const s2 = x.sp.s;
    const groups = PACE_GROUPS.map(([name, idx]) => [name, idx.every((i) => s2[i]) ? idx.reduce((a, i) => a + s2[i][0], 0) : null]);
    const bar = `<div class="fr-bar">${groups.map(([name, t]) => `<span class="fr-seg fr-seg-${name.toLowerCase()}" style="flex-grow:${Math.max(1, t || 1)}"><b>${name}</b> ${f1(t)}</span>`).join('')}</div>`;
    const rows = C.STEPS.map((st, i) => {
      const y = s2[i];
      if (!y) return '';
      const c = y[3] ? C.caseById(y[3]) : null;
      return `<tr><th scope="row">${st.name}</th><td>${f1(y[0])}</td><td>${y[1]} giros</td><td>${y[4] ? '<span class="muted">salto</span>' : c ? esc(c.name) : ''}</td><td class="muted">${y[2] != null && !y[4] ? `${f1(y[2])} + ${f1(y[0] - y[2])}` : ''}</td></tr>`;
    }).join('');
    const eff = x.an ? `<p class="fr-note">Eficiencia <b>${Math.round((x.an.i / x.an.m) * 100)} %</b>: ${x.an.m} giros (lo más corto, ${x.an.i}).</p>` : '';
    const rc = x.rc ? `<details class="fr-recon-box"><summary>Sus giros, paso a paso</summary><ol class="fr-recon">${C.DOWN[x.sp.f] ? `<li><b>Inspección</b><span class="fr-recon-moves">${algHtml(C.DOWN[x.sp.f])}</span></li>` : ''}${C.STEPS.map((st, i) => (x.rc[i] == null ? '' : `<li><b>${st.name}</b><span class="fr-recon-moves">${x.rc[i] ? algHtml(x.rc[i]) : '<i>nada</i>'}</span></li>`)).join('')}</ol></details>` : '';
    return `${bar}<div class="fr-table" tabindex="0" role="region" aria-label="Sus tiempos de cada paso"><table><tbody>${rows}</tbody></table></div>${eff}${rc}`;
  }
  const tryBtn = (x, who, what) => (x.scr ? `<button class="btn" type="button" data-rk-try="${esc(x.scr)}" data-rk-who="${esc(who)}" data-rk-t="${value(x)}" data-rk-what="${esc(what)}">Probar este scramble</button><button class="btn" type="button" data-rk-copy="${esc(x.scr)}">Copiar</button>` : '');
  function detailHtml(m, cat) {
    const b = m.best[cat];
    if (cat === 'single') {
      return `<div class="rk-detail">
        <p class="rk-scr"><span class="field-title">Scramble</span> <span class="fr-alg">${b.scr ? esc(b.scr) : '<i>sin scramble</i>'}</span></p>
        <div class="actions">${tryBtn(b, m.name, 'single')}</div>
        ${b.sp ? stepsHtml(b) : '<p class="hint">Sin cubo inteligente: solo el tiempo total. Haz su scramble y a ver si le ganas.</p>'}
      </div>`;
    }
    const vals = b.solves.map(value);
    const lo = vals.indexOf(Math.min(...vals));
    const hi = vals.lastIndexOf(Math.max(...vals));
    return `<div class="rk-detail"><ol class="rk-avg">${b.solves.map((x, i) => {
      const trimmed = i === lo || i === hi;
      const t = x.pen === 'dnf' ? 'DNF' : `${fmt(value(x))}${x.pen === 2 ? '+' : ''}`;
      const steps = x.sp ? `<span class="muted">${PACE_GROUPS.map(([name, idx]) => (idx.every((k) => x.sp.s[k]) ? `${name} ${f1(idx.reduce((a, k) => a + x.sp.s[k][0], 0))}` : '')).filter(Boolean).join(' · ')}</span>` : '';
      return `<li><b>${trimmed ? `(${t})` : t}</b> ${steps}<span class="fr-alg rk-scr-s">${esc(x.scr || '')}</span>${x.scr ? `<button class="x" type="button" data-rk-try="${esc(x.scr)}" data-rk-who="${esc(m.name)}" data-rk-t="${value(x)}" data-rk-what="solve ${i + 1} de su ${esc(CAT_TEXT[cat])}">Probar</button>` : ''}</li>`;
    }).join('')}</ol><p class="hint">Entre paréntesis, el mejor y el peor: no cuentan para la media, como en las competiciones.</p></div>`;
  }
  function inviteLink(code) { return `${location.origin}${location.pathname}#liga=${code}`; }
  function startHtml() {
    return `<div class="rk-start">
      <p>Compite con tus amigos solo por el tiempo total, como en una competición: el mejor single, la mejor media de 5 y la de 12 de cada uno. Se actualiza solo cada vez que alguien hace un récord. No hace falta cubo inteligente, basta con el cronómetro de esta página; si alguien lo usa, verás también cada paso de sus récords.</p>
      <div class="field rk-name"><label for="rkName">Tu nombre</label><input id="rkName" class="text-input" maxlength="24" autocomplete="nickname" value="${esc(myName())}"></div>
      <div class="rk-forms">
        <form class="rk-form" id="rkCreate"><label class="field-title" for="rkLeague">Crea una liga</label><input id="rkLeague" class="text-input" maxlength="40" placeholder="Los del piso"><button class="btn primary" type="submit">Crear liga</button></form>
        <form class="rk-form" id="rkJoin"><label class="field-title" for="rkCode">O únete a la de un amigo</label><input id="rkCode" class="text-input" placeholder="Código o enlace" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn" type="submit">Unirme</button></form>
      </div>
    </div>`;
  }
  function inviteHtml() {
    const d = lg.data[lg.invite];
    const league = d && d.league;
    return `<div class="rk-invite">
      <p>${league ? `Te han invitado a la liga <b>«${esc(league.name)}»</b> de ${esc(league.by)} (${league.members.length} ${league.members.length === 1 ? 'persona' : 'personas'}).` : lg.err ? esc(lg.err) : 'Buscando la liga…'}</p>
      ${league ? `<form class="rk-form" id="rkAccept">${myName() ? `<span>Entrarás como <b>${esc(myName())}</b>.</span>` : '<label class="field-title" for="rkName">Tu nombre</label><input id="rkName" class="text-input" maxlength="24" autocomplete="nickname">'}<button class="btn primary" type="submit">Unirme</button><button class="btn" type="button" data-rk="noinvite">Ahora no</button></form>` : ''}
    </div>`;
  }
  function leagueHtml() {
    const list = ligas();
    const code = curCode();
    const d = lg.data[code];
    const league = d && d.league;
    const me = player().id;
    let html = `<div class="rk-head">
      ${list.length > 1 ? `<select id="rkPick" class="text-input" aria-label="Liga">${list.map((x) => `<option value="${x.code}"${x.code === code ? ' selected' : ''}>${esc(x.name || x.code)}</option>`).join('')}</select>` : `<h3 class="rk-title">${esc((league && league.name) || (list[0] && list[0].name) || '')}</h3>`}
      <div class="actions">
        <button class="btn primary" type="button" data-rk="invite">Invitar amigos</button>
        <button class="btn" type="button" data-rk="refresh">Actualizar</button>
      </div>
    </div>`;
    if (!league) return `${html}<p class="fr-note">${lg.busy ? 'Cargando el ranking…' : lg.err ? `No he podido cargarlo: ${esc(lg.err)}. <button class="btn" type="button" data-rk="refresh">Reintentar</button>` : 'Cargando el ranking…'}</p>`;
    html += `<div class="seg small rk-cats" role="group" aria-label="Qué ranking">${LIGA_CAT.map(([k, n]) => `<button type="button" data-rk-cat="${k}" aria-pressed="${lg.cat === k}">${n}</button>`).join('')}</div>`;
    const st = standings(league, lg.cat);
    const rows = st.map(({ m, v }, i) => {
      const mine = m.id === me;
      const b = m.best[lg.cat];
      const key = `${m.id}|${lg.cat}`;
      const fresh = lg.fresh.has(`${code}|${m.id}`);
      const ok = Number.isFinite(v);
      const pos = ok ? i + 1 : '';
      const row = `<tr class="${mine ? 'me' : ''}${fresh ? ' fresh' : ''}">
        <td class="rk-pos"><span class="rk-medal${ok && pos <= 3 ? ` m${pos}` : ''}">${pos || '—'}</span></td>
        <th scope="row">${esc(m.name)}${mine ? ' <span class="muted">(tú)</span>' : ''}${fresh ? ' <span class="rk-new">nuevo</span>' : ''}</th>
        <td class="rk-t">${ok ? `<b>${fmt(v)}</b>${hasSteps(b, lg.cat) ? ' <span class="rk-badge" title="Hecho con cubo inteligente: puedes ver cada paso">con pasos</span>' : ''}` : '<span class="muted">sin tiempo</span>'}</td>
        <td class="muted rk-when">${ok ? ago(b.at) : ''}</td>
        <td>${ok ? `<button class="x" type="button" data-rk-open="${key}" aria-expanded="${lg.open === key}" aria-label="Ver el ${CAT_TEXT[lg.cat]} de ${esc(m.name)}">ver</button>` : ''}</td>
      </tr>`;
      return row + (ok && lg.open === key ? `<tr class="rk-open"><td colspan="5">${detailHtml(m, lg.cat)}</td></tr>` : '');
    }).join('');
    html += `<div class="rk-table"><table><thead><tr><th scope="col">#</th><th scope="col">Nombre</th><th scope="col">${LIGA_CAT.find((x) => x[0] === lg.cat)[1]}</th><th scope="col">Cuándo</th><th scope="col"><span class="sr-only">Detalles</span></th></tr></thead><tbody>${rows}</tbody></table></div>`;
    html += `<p class="hint rk-foot">Actualizado ${ago(d.at)} · tus récords se publican solos · código <b>${code}</b></p>
      <details class="rk-more"><summary>Más</summary>
        <form class="rk-form" id="rkRename"><label class="field-title" for="rkName">Apareces como</label><input id="rkName" class="text-input" maxlength="24" value="${esc(myName())}"><button class="btn" type="submit">Cambiar</button></form>
        <form class="rk-form" id="rkJoin"><label class="field-title" for="rkCode">Otra liga</label><input id="rkCode" class="text-input" placeholder="Código o enlace" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn" type="submit">Unirme</button></form>
        <form class="rk-form" id="rkCreate"><label class="field-title" for="rkLeague">Crear otra</label><input id="rkLeague" class="text-input" maxlength="40" placeholder="Nombre de la liga"><button class="btn" type="submit">Crear</button></form>
        <div class="actions"><button class="btn" type="button" data-rk="leave">Salir de esta liga</button></div>
      </details>`;
    return html;
  }
  function renderRanking() {
    const box = $('rankBox');
    if (!box) return;
    const list = ligas();
    let html = '';
    const inviting = lg.invite && !list.some((x) => x.code === lg.invite);
    if (inviting) html += inviteHtml();
    if (list.length) html += leagueHtml();
    else if (!inviting) html += startHtml();
    if (lg.err && !list.length && !lg.invite) html += `<p class="hint bad">${esc(lg.err)}</p>`;
    const open = box.querySelector('details.rk-more[open]');
    box.innerHTML = html;
    if (open && box.querySelector('details.rk-more')) box.querySelector('details.rk-more').open = true;
    // What you are looking at is no longer new.
    if (list.length && lg.data[curCode()]) setTimeout(() => { if (view === 'ranking') lg.fresh.forEach((k) => { if (k.startsWith(`${curCode()}|`)) lg.fresh.delete(k); }); }, 8000);
  }

  // ---- Joining, creating, leaving
  function addLeague(league) {
    const list = ligas().filter((x) => x.code !== league.code);
    list.push({ code: league.code, name: league.name, at: Date.now() });
    save(K.ligas, list);
    settings.liga = league.code;
    saveSettings();
    const pub = load(K.ligaPub, {});
    pub[league.code] = pubSig(myBests());
    save(K.ligaPub, pub);
    lg.data[league.code] = { league, at: Date.now() };
    newsOf(league.code, league);
    changed();
  }
  function takeName() {
    const el = $('rkName');
    const n = el ? cleanName(el.value).slice(0, 24) : myName();
    if (el && n) save(K.name, n);
    return n;
  }
  async function act(fn) {
    if (lg.busy) return;
    lg.busy = true;
    lg.err = '';
    try { await fn(); } catch (e) { lg.err = e.message; toast(e.message); }
    lg.busy = false;
    renderRanking();
  }
  function openInvite(code) {
    lg.invite = code;
    if (ligas().some((x) => x.code === code)) { lg.invite = null; settings.liga = code; saveSettings(); }
    showView('ranking');
    if (lg.invite) loadLeague(code, true);
  }
  $('rankBox').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = ev.target;
    if (f.id === 'rkCreate') {
      const name = takeName();
      const lname = cleanName($('rkLeague').value);
      if (!name) { toast('Escribe tu nombre'); return; }
      if (!lname) { toast('Ponle nombre a la liga'); return; }
      act(async () => { addLeague(await api('api/liga', { action: 'create', name: lname, player: playerBody(), best: myBests() })); toast('Liga creada: invita a tus amigos'); });
    } else if (f.id === 'rkJoin' || f.id === 'rkAccept') {
      const name = takeName();
      const m = f.id === 'rkAccept' ? [null, lg.invite] : String($('rkCode').value).trim().toLowerCase().match(/([a-z0-9]{8})\s*$/);
      if (!name) { toast('Escribe tu nombre'); return; }
      if (!m) { toast('Ese código no es válido: son 8 letras y números'); return; }
      act(async () => { addLeague(await api(`api/liga?code=${m[1]}`, { action: 'join', player: playerBody(), best: myBests(), n: times.length })); lg.invite = null; toast('¡Dentro!'); });
    } else if (f.id === 'rkRename') {
      const name = takeName();
      if (!name) return;
      act(async () => { await ligaPublish(true); toast(`Ahora apareces como ${name}`); });
    }
  });
  $('rankBox').addEventListener('change', (ev) => {
    if (ev.target.id === 'rkPick') { settings.liga = ev.target.value; saveSettings(); lg.open = null; renderRanking(); loadLeague(curCode(), true); }
  });
  $('rankBox').addEventListener('click', async (ev) => {
    const cat = ev.target.closest('[data-rk-cat]');
    if (cat) { lg.cat = cat.dataset.rkCat; lg.open = null; renderRanking(); return; }
    const op = ev.target.closest('[data-rk-open]');
    if (op) { lg.open = lg.open === op.dataset.rkOpen ? null : op.dataset.rkOpen; renderRanking(); return; }
    const tryIt = ev.target.closest('[data-rk-try]');
    if (tryIt) {
      if (timer.phase === 'run') return;
      setScramble(tryIt.dataset.rkTry);
      duel = { scr: tryIt.dataset.rkTry, who: tryIt.dataset.rkWho, t: Number(tryIt.dataset.rkT), what: tryIt.dataset.rkWhat, result: '' };
      showView('crono');
      renderDuel();
      return;
    }
    const cp = ev.target.closest('[data-rk-copy]');
    if (cp) { try { await navigator.clipboard.writeText(cp.dataset.rkCopy); toast('Scramble copiado'); } catch (e) { toast('No he podido copiarlo'); } return; }
    const b = ev.target.closest('[data-rk]');
    if (!b) return;
    const what = b.dataset.rk;
    const code = curCode();
    if (what === 'refresh') loadLeague(code);
    else if (what === 'noinvite') { lg.invite = null; renderRanking(); }
    else if (what === 'invite') {
      const league = lg.data[code] && lg.data[code].league;
      const url = inviteLink(code);
      const text = `Únete a mi liga de cubo «${league ? league.name : ''}»: solo cuenta el tiempo, como en una competición.`;
      try {
        if (navigator.share) await navigator.share({ title: 'Ranking de cubo', text, url });
        else { await navigator.clipboard.writeText(`${text} ${url}`); toast('Enlace de invitación copiado'); }
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        try { await navigator.clipboard.writeText(url); toast('Enlace de invitación copiado'); } catch (e2) { toast(url); }
      }
    } else if (what === 'leave') {
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '¿Seguro? Pulsa otra vez'; b.classList.add('armed'); return; }
      act(async () => {
        await api(`api/liga?code=${code}`, { action: 'leave', player: playerBody() }).catch((e) => { if (!/no existe/.test(e.message)) throw e; });
        save(K.ligas, ligas().filter((x) => x.code !== code));
        delete lg.data[code];
        settings.liga = null;
        saveSettings();
        changed();
        toast('Has salido de la liga');
      });
    }
  });
  // While you look at it: again every 30 s, and when you come back to the page.
  function pollRanking() {
    clearInterval(lg.timer);
    lg.timer = setInterval(() => { if (view === 'ranking' && document.visibilityState === 'visible') loadLeague(curCode(), true); }, 30000);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && view === 'ranking') loadLeague(curCode(), true); });
  onView('ranking', () => {
    renderRanking();
    const code = curCode();
    if (code) { ligaPublish(); loadLeague(code, !!lg.data[code]); }
    pollRanking();
  });

  // ---- Their scramble, in your timer
  let duel = null;
  function renderDuel() {
    const el = $('duel');
    if (!el) return;
    const show = duel && (duel.result || duel.scr === scramble);
    el.hidden = !show;
    if (!show) return;
    el.innerHTML = duel.result
      ? `<span>${esc(duel.result)}</span><button class="x" type="button" id="duelOff" aria-label="Cerrar">×</button>`
      : `<span>El scramble del ${esc(duel.what)} de <b>${esc(duel.who)}</b> (${fmt(duel.t)}): ¿le ganas?</span><button class="x" type="button" id="duelOff" aria-label="Dejar el reto">×</button>`;
    $('duelOff').addEventListener('click', () => { duel = null; renderDuel(); });
  }
  function duelResult(r) {
    if (!duel || duel.result || r.scr !== duel.scr) return;
    const v = value(r);
    const d = v - duel.t;
    duel.result = !Number.isFinite(v) ? `DNF contra el ${fmt(duel.t)} de ${duel.who}.`
      : d < 0 ? `¡Le has ganado a ${duel.who} por ${(-d / 1000).toFixed(2)} s! (${fmt(v)} contra ${fmt(duel.t)})`
        : d === 0 ? `Empate con ${duel.who}: ${fmt(v)}.` : `${duel.who} te gana por ${(d / 1000).toFixed(2)} s (${fmt(v)} contra ${fmt(duel.t)}).`;
    toast(duel.result);
    renderDuel();
  }

  // ================= Competition mode =================
  // Only the clock, full screen, and the whole screen is the button (like a stackmat), the screen kept on.
  // Enter with the button or F; leave with Salir, Esc or the phone's back gesture.
  const focus = { on: false };
  const screenLock = { lock: null, want: false, asking: false };
  function holdScreen(on) {
    screenLock.want = on;
    if (!on) { const l = screenLock.lock; screenLock.lock = null; try { if (l) l.release(); } catch (e) { /* released */ } return; }
    if (screenLock.lock || screenLock.asking || !navigator.wakeLock || document.visibilityState !== 'visible') return;
    screenLock.asking = true;
    try {
      navigator.wakeLock.request('screen').then((l) => {
        screenLock.asking = false;
        if (!screenLock.want) { l.release().catch(() => {}); return; }
        screenLock.lock = l;
        l.addEventListener('release', () => { if (screenLock.lock === l) screenLock.lock = null; });
      }).catch(() => { screenLock.asking = false; });
    } catch (e) { screenLock.asking = false; }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && screenLock.want) holdScreen(true); });
  function renderFocus() {
    if (!focus.on) return;
    $('focusScr').innerHTML = $('scr').innerHTML;
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const today = times.filter((t) => t.at >= from.getTime());
    const ok = today.filter((t) => t.pen !== 'dnf');
    const parts = [];
    if (today.length) {
      parts.push(`Hoy <b>${today.length}</b>`);
      if (ok.length) parts.push(`mejor <b>${fmt(Math.min(...ok.map(value)))}</b>`);
      const a5 = avgOf(today, 5);
      if (a5 != null) parts.push(`ao5 <b>${fmt(a5)}</b>`);
    }
    if (timer.last) parts.push(`último <b>${fmtRes(timer.last)}</b>`);
    $('focusStats').innerHTML = parts.join(' · ');
    $('focusNew').disabled = $('newScr').disabled;
    // With the cube and the help on: the step and the case, in one line.
    let live = '';
    if (cube && cube.on && (settings.help || timer.phase !== 'run')) {
      const info = liveInfo(cube.state);
      const t = info.track || (info.held && info.stage >= 2 ? prog.last : null);
      if (t && t.rec && t.rec.case) live = `<p class="live-letters">${esc(C.STEPS[t.stage].name)} · ${esc(t.rec.case.name)}</p><p class="live-moves">${esc([t.rec.pre, t.rec.case.alg, t.rec.post].filter(Boolean).join(' '))}</p>`;
      else if (timer.phase === 'run' && info.stage < 6) live = `<p class="live-letters">${esc(C.STEPS[info.stage].name)}${info.stage === 1 ? ` · ${(info.held ? (prog.pairs || []) : info.read.pairs).filter(Boolean).length}/4` : ''}</p>`;
    }
    const fl = $('focusLive');
    if (fl.dataset.h !== live) { fl.dataset.h = live; fl.innerHTML = live; }
  }
  function setFocus(on, fromHistory) {
    if (focus.on === on) return;
    focus.on = on;
    document.body.classList.toggle('focus', on);
    holdScreen(on || timer.phase === 'run');
    if (on) {
      if (view !== 'crono') showView('crono');
      renderFocus();
      try {
        const el = document.documentElement;
        if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
      } catch (e) { /* the overlay alone is enough */ }
      try { history.pushState({ frFocus: true }, ''); } catch (e) { /* sandboxed */ }
    } else {
      try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch (e) { /* already out */ }
      if (!fromHistory) { try { if (history.state && history.state.frFocus) history.back(); } catch (e) { /* sandboxed */ } }
    }
  }
  window.addEventListener('popstate', () => { if (focus.on) setFocus(false, true); });
  $('focusOpen').addEventListener('click', () => setFocus(true));
  $('focusExit').addEventListener('click', () => setFocus(false));
  $('focusNew').addEventListener('click', () => { if (timer.phase !== 'run') newScramble(); });
  ['fr:scramble', 'fr:timer', 'fr:cube', 'fr:result'].forEach((e) => document.addEventListener(e, () => setTimeout(renderFocus, 0)));
  document.addEventListener('keydown', (ev) => {
    if (typing(ev.target) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if ((ev.key === 'f' || ev.key === 'F') && view === 'crono' && timer.phase !== 'run' && !ev.repeat) { ev.preventDefault(); setFocus(!focus.on); return; }
    if (ev.key === 'Escape' && focus.on && !['inspect', 'ihold', 'iready', 'run', 'hold', 'ready'].includes(timer.phase)) { ev.preventDefault(); setFocus(false); }
  });

  // ================= Vibration =================
  // Desktop Chrome has vibrate() too, but nothing to shake: only on touch screens.
  const canVibrate = typeof navigator.vibrate === 'function' && !!window.matchMedia && matchMedia('(pointer: coarse)').matches;
  const vibes = [];   // what vibrated, for tests
  function buzz(pattern) {
    if (!settings.vibrate || !canVibrate) return;
    try { navigator.vibrate(pattern); vibes.push(pattern); } catch (e) { /* no vibration */ }
  }

  // ================= Install and new versions =================
  let installEvt = null;
  const installBtns = [...document.querySelectorAll('.install')];
  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
    installEvt = ev;
    installBtns.forEach((b) => { b.hidden = false; });
  });
  installBtns.forEach((b) => b.addEventListener('click', async () => {
    if (!installEvt) return;
    installEvt.prompt();
    try { await installEvt.userChoice; } catch (e) { /* dismissed */ }
    installEvt = null;
    installBtns.forEach((x) => { x.hidden = true; });
  }));
  // A new version replaces the service worker and its cache: a page whose build no longer has a cache is
  // out of date. Offer a reload, never in the middle of a solve.
  function offerUpdate() {
    const show = () => { $('updateBar').hidden = false; };
    if (timer.phase !== 'run' && timer.phase !== 'inspect') { show(); return; }
    const wait = () => { if (timer.phase !== 'run' && timer.phase !== 'inspect') { document.removeEventListener('fr:timer', wait); show(); } };
    document.addEventListener('fr:timer', wait);
  }
  function watchUpdates(reg) {
    const meta = document.querySelector('meta[name=op3-build]');
    const mine = meta && /^[0-9a-f]{10}$/.test(meta.content) ? `op3bld-${meta.content}` : null;
    if (!mine || !window.caches) return;
    let offered = false;
    const compare = () => {
      if (offered) return;
      caches.keys().then((keys) => {
        const live = keys.filter((k) => k.startsWith('op3bld-'));
        if (live.length && !live.includes(mine)) { offered = true; offerUpdate(); }
      }).catch(() => {});
    };
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      const sw = navigator.serviceWorker.controller;
      if (!sw || sw.state === 'activated') { compare(); return; }
      sw.addEventListener('statechange', () => { if (sw.state === 'activated') compare(); });
    });
    let last = Date.now();
    const poll = () => { last = Date.now(); reg.update().catch(() => {}); };
    setInterval(poll, 30 * 60e3);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - last > 5 * 60e3) poll(); });
  }
  $('updateGo').addEventListener('click', () => location.reload());
  $('updateLater').addEventListener('click', () => { $('updateBar').hidden = true; });

  // ================= Sync between devices =================
  // The same code as in the 3BLD page (op3bld:sync:v1): set it up in either and both use it. Fridrich keeps
  // its own copy on the server, under another key, merged solve by solve.
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const prettyCode = (c) => normCode(c).replace(/(.{4})(?=.)/g, '$1-');
  const randomCode = (n) => {
    const a = new Uint8Array(n);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a); else a.forEach((_, i) => { a[i] = Math.floor(Math.random() * 256); });
    return [...a].map((b) => ALPHA[b % 32]).join('');
  };
  async function sha(text) {
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  async function api(path, body) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tm = setTimeout(() => ctrl && ctrl.abort(), 15000);
    try {
      const r = await fetch(path, {
        method: body ? 'POST' : 'GET', headers: body ? { 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: ctrl ? ctrl.signal : undefined,
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `error ${r.status}`);
      return j;
    } catch (e) { throw new Error(e.name === 'AbortError' ? 'el servidor no responde' : e.message); } finally { clearTimeout(tm); }
  }
  let pingP = null;
  const backend = () => { if (!pingP) pingP = api('api/ping').then((j) => !!(j.ok && j.store), () => false); return pingP; };
  const syncState = () => load(K.sync, null);
  function syncData() {
    const keep = times.length - 200;   // the turns and the analysis of the last 200 solves travel; older ones stay here
    return {
      v: 1,
      times: times.map((r, i) => (i < keep && (r.rc || r.an) ? (({ rc, an, ...x }) => x)(r) : r)),
      deleted: load(K.deleted, []), learn, learnAt, train, crossTr: load(K.crossTr, []).slice(-300), trlog: trlog.slice(-3000),
      player: load(K.player, null), ligas: ligas(), sessions: load(K.sessions, []).slice(-100),
    };
  }
  function mergeIn(remote) {
    if (!remote || typeof remote !== 'object') return false;
    let changedHere = false;
    const dead = new Set([...load(K.deleted, []), ...(Array.isArray(remote.deleted) ? remote.deleted : [])]);
    save(K.deleted, [...dead].slice(-3000));
    const byAt = new Map(times.map((r) => [r.at, r]));
    (Array.isArray(remote.times) ? remote.times : []).forEach((r) => {
      if (!r || typeof r.at !== 'number' || typeof r.t !== 'number') return;
      const mine = byAt.get(r.at);
      if (!mine) { byAt.set(r.at, r); changedHere = true; } else if ((r.ed || 0) > (mine.ed || 0)) { mine.pen = r.pen; mine.ed = r.ed; changedHere = true; }
      if (mine && !mine.rc && r.rc) { mine.rc = r.rc; changedHere = true; }
      if (mine && !mine.an && r.an) { mine.an = r.an; changedHere = true; }
    });
    const merged = [...byAt.values()].filter((r) => !dead.has(r.at)).sort((a, b) => a.at - b.at).slice(-2000);
    if (merged.length !== times.length) changedHere = true;
    times = merged;
    save(K.times, times);
    const rl = remote.learn && typeof remote.learn === 'object' ? remote.learn : {};
    const ra = remote.learnAt && typeof remote.learnAt === 'object' ? remote.learnAt : {};
    Object.keys({ ...rl, ...ra }).forEach((id) => {
      if (!C.caseById(id)) return;
      if ((ra[id] || 0) > (learnAt[id] || 0)) {
        if (rl[id]) learn[id] = rl[id]; else delete learn[id];
        learnAt[id] = ra[id];
        changedHere = true;
      }
    });
    save(K.learn, learn);
    save(K.learnAt, learnAt);
    const total = (x) => (x ? (x.n || 0) + (x.qn || 0) + (x.mn || 0) : 0);
    Object.entries(remote.train && typeof remote.train === 'object' ? remote.train : {}).forEach(([id, x]) => {
      if (C.caseById(id) && total(x) > total(train[id])) { train[id] = x; changedHere = true; }
    });
    save(K.train, train);
    const ct = load(K.crossTr, []);
    const seen = new Set(ct.map((x) => x.at));
    (Array.isArray(remote.crossTr) ? remote.crossTr : []).forEach((x) => { if (x && typeof x.at === 'number' && !seen.has(x.at)) { ct.push(x); changedHere = true; } });
    save(K.crossTr, ct.sort((a, b) => a.at - b.at).slice(-1000));
    const tk = (x) => `${x.at}|${x.id}|${x.m}|${x.x ? 1 : 0}`;
    const have = new Set(trlog.map(tk));
    (Array.isArray(remote.trlog) ? remote.trlog : []).forEach((x) => {
      if (x && typeof x.at === 'number' && C.caseById(x.id) && ['c', 'q', 'h'].includes(x.m) && !have.has(tk(x))) { trlog.push(x); have.add(tk(x)); changedHere = true; }
    });
    trlog.sort((a, b) => a.at - b.at);
    if (trlog.length > 5000) trlog = trlog.slice(-5000);
    save(K.trlog, trlog);
    if (Array.isArray(remote.sessions)) {
      const mineS = load(K.sessions, []);
      const seenS = new Set(mineS.map((x) => x.at));
      remote.sessions.forEach((x) => { if (x && typeof x.at === 'number' && Number.isFinite(x.n) && !seenS.has(x.at)) { mineS.push(x); seenS.add(x.at); changedHere = true; } });
      save(K.sessions, mineS.sort((a, b) => a.at - b.at).slice(-200));
    }
    // The ranking: the same player on every device (the oldest one wins), and every league.
    const rp = remote.player;
    if (rp && /^[a-z0-9]{12,32}$/.test(rp.id || '') && /^[a-f0-9]{32,64}$/.test(rp.token || '')) {
      const lp = load(K.player, null);
      if (!lp || (lp.id !== rp.id && (rp.at || 0) < (lp.at || Infinity))) { save(K.player, { id: rp.id, token: rp.token, at: rp.at || 0 }); save(K.ligaPub, {}); changedHere = true; }
    }
    if (Array.isArray(remote.ligas)) {
      const mineL = ligas();
      remote.ligas.forEach((x) => { if (x && /^[a-z0-9]{8}$/.test(x.code) && !mineL.some((y) => y.code === x.code)) { mineL.push({ code: x.code, name: cleanName(x.name), at: x.at || Date.now() }); changedHere = true; } });
      save(K.ligas, mineL);
    }
    return changedHere;
  }
  let syncing = null;
  async function syncNow(manual) {
    const st = syncState();
    if (!st || !st.code) return;
    if (syncing) return syncing;
    syncing = (async () => {
      setSyncStatus('Sincronizando…');
      try {
        if (!(window.crypto && crypto.subtle)) throw new Error('este navegador no lo permite');
        if (!(await backend())) throw new Error('no hay conexión con el servidor');
        const k = await sha(`cfop:${normCode(st.code)}`);
        const remote = await api(`api/sync?k=${k}`);
        const changedHere = mergeIn(remote.data);
        await api(`api/sync?k=${k}`, { data: syncData() });
        save(K.synced, Date.now());
        setSyncStatus(`Sincronizado ${changedHere ? 'y actualizado con tus otros dispositivos' : 'correctamente'}.`);
        if (changedHere) {
          renderStats();
          if (view === 'casos') renderCases();
          renderPick();
          if (view === 'progreso') renderProgress();
          if (view === 'entrenar') { renderPlan(); renderTrStats(); }
          if (manual) toast('Datos actualizados');
        }
      } catch (e) { setSyncStatus(`No se ha podido sincronizar: ${e.message}.`, true); }
    })();
    try { await syncing; } finally { syncing = null; }
  }
  let pushTimer = 0;
  document.addEventListener('fr:changed', () => {
    if (!syncState()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => syncNow(false), 5000);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && syncState() && Date.now() - load(K.synced, 0) > 60000) syncNow(false);
  });
  function setSyncStatus(text, bad) {
    const el = $('syncStatus');
    if (!el) return;
    el.textContent = text;
    el.className = `hint${bad ? ' bad' : ''}`;
  }
  function renderSync() {
    const box = $('syncBox');
    const st = syncState();
    if (!st) {
      box.innerHTML = '<p>Guarda en la nube tus tiempos, lo que estás aprendiendo y lo que has entrenado, y úsalos en el móvil y en el ordenador. Si ya la tienes activada en la página de 3BLD, aquí se activa sola con el mismo código.</p>'
        + '<div class="actions"><button class="btn primary" type="button" id="syncOn">Activar sincronización</button></div>'
        + '<div class="field"><label for="syncCode">¿Ya la activaste en otro dispositivo? Escribe su código</label>'
        + '<div class="inrow"><input id="syncCode" class="text-input" type="text" spellcheck="false" autocomplete="off" autocapitalize="characters" placeholder="XXXX-XXXX-XXXX-XXXX">'
        + '<button class="btn" type="button" id="syncJoin">Usar este código</button></div></div>'
        + '<p class="hint" id="syncStatus"></p>';
      $('syncOn').addEventListener('click', () => activate(randomCode(16)));
      $('syncJoin').addEventListener('click', () => {
        const code = normCode($('syncCode').value);
        if (code.length !== 16 || [...code].some((c) => !ALPHA.includes(c))) { setSyncStatus('Ese código no es válido: son 16 letras y números.', true); return; }
        activate(code);
      });
      return;
    }
    const last = load(K.synced, 0);
    box.innerHTML = '<p>Tu código de sincronización (el mismo que en la página de 3BLD):</p>'
      + `<p class="code-box">${esc(prettyCode(st.code))}</p>`
      + '<p class="hint">Escríbelo en «Ajustes» en tu otro dispositivo. Quien tenga este código puede ver y cambiar tus datos, así que no lo compartas.</p>'
      + '<div class="actions"><button class="btn primary" type="button" id="syncNow">Sincronizar ahora</button><button class="btn" type="button" id="syncCopy">Copiar código</button></div>'
      + `<p class="hint" id="syncStatus">${last ? `Última sincronización: ${new Date(last).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.` : ''}</p>`;
    $('syncNow').addEventListener('click', () => syncNow(true));
    $('syncCopy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(prettyCode(st.code)); toast('Código copiado'); } catch (e) { toast('Cópialo a mano'); }
    });
  }
  async function activate(code) {
    if (!(window.crypto && crypto.subtle)) { setSyncStatus('Este navegador no permite activar la sincronización.', true); return; }
    if (!(await backend())) { setSyncStatus('No hay conexión con el servidor.', true); return; }
    // The 3BLD page reads the same entry, with the key it uses.
    save(K.sync, { code: normCode(code), key: await sha(`op3bld:${normCode(code)}`), last: 0 });
    renderSync();
    await syncNow(true);
  }
  onView('ajustes', renderSync);

  // ================= Entrenar la cruz =================
  // A scramble, 15 s to plan the whole cross, then do it in one go. With the smart cube the app counts the
  // turns and the time and compares with the shortest; without it, it shows the shortest at the end.
  const ct = { phase: 'idle', scr: '', state: null, best: null, follow: null, insp0: 0, t0: 0, moves: [], result: null, raf: 0 };
  const ctActive = () => view === 'entrenar' && ct.phase !== 'idle' && ct.phase !== 'done' && cube && cube.on;
  async function ctNew() {
    ct.phase = 'loading';
    ct.result = null;
    renderCt();
    let scr;
    try { scr = M.simplifyAlg(await M.withTimeout(M.requestScramble('full'), 30000)); } catch (e) { scr = M.randomMoveScramble(); }
    ct.scr = scr;
    ct.state = apply(solved(), scr);
    ct.best = C.bestCross(ct.state, settings.cross);
    ct.moves = [];
    ct.phase = 'scramble';
    if (cube && cube.on) {
      ct.follow = makeFollow(solved(), parseAlg(scr).map((m) => m.text));
      if (!locate(ct.follow, cube.state)) { ct.follow.lost = !isSolved(cube.state); ct.follow.pos = 0; }
    } else ct.follow = null;
    renderCt();
  }
  function ctPlan() {
    ct.phase = 'plan';
    ct.insp0 = now();
    ctTick();
    renderCt();
  }
  function ctTick() {
    cancelAnimationFrame(ct.raf);
    const step = () => {
      const el = $('ctClock');
      if (!el) return;
      if (ct.phase === 'plan') {
        const left = 15000 - (now() - ct.insp0);
        el.textContent = left > 0 ? String(Math.ceil(left / 1000)) : left > -2000 ? '+2' : 'DNF';
      } else if (ct.phase === 'do') el.textContent = fmt(now() - ct.t0);
      else return;
      ct.raf = requestAnimationFrame(step);
    };
    ct.raf = requestAnimationFrame(step);
  }
  function ctMove(mv, st, t) {
    if (ct.phase === 'scramble' && ct.follow) {
      followMove(ct.follow, st, mv);
      if (done(ct.follow)) ctPlan();
      renderCt();
      return;
    }
    if (ct.phase === 'plan') { ct.phase = 'do'; ct.t0 = t; ct.moves = []; ctTick(); }
    if (ct.phase !== 'do') return;
    ct.moves.push(mv);
    if (C.readFace(st, settings.cross).cross === 4) ctFinish(t);
    else renderCt();
  }
  function ctFinish(t) {
    cancelAnimationFrame(ct.raf);
    const used = ct.moves.length ? halves(ct.moves) : null;
    const map = faceMapFor(C.DOWN[settings.cross]);
    ct.result = {
      at: Date.now(), opt: ct.best.length, t: t ? Math.round(t - ct.t0) : null,
      n: used ? used.length : null, mine: used ? used.map((m) => inHand(m, map)).join(' ') : null,
      over: ct.insp0 && (ct.t0 || now()) - ct.insp0 > 15000,
    };
    if (used) {
      const list = load(K.crossTr, []);
      list.push({ at: ct.result.at, opt: ct.result.opt, n: ct.result.n, t: ct.result.t });
      save(K.crossTr, list.slice(-1000));
      changed();
      if (settings.sound) window.SmartCube.chime(true);
      buzz([60]);
    }
    ct.phase = 'done';
    renderCt();
  }
  function ctStats() {
    const list = load(K.crossTr, []).slice(-20);
    if (!list.length) return '';
    const extra = list.reduce((a, x) => a + (x.n - x.opt), 0) / list.length;
    const tAvg = list.reduce((a, x) => a + (x.t || 0), 0) / list.length;
    return `Últimas ${list.length}: de media ${extra.toFixed(1)} giros más que la más corta, en ${f1(tAvg)} s.`;
  }
  function renderCt() {
    const box = $('crossTr');
    if (!box) return;
    const name = C.crossName(settings.cross);
    let html = '';
    if (ct.phase === 'idle') {
      html = '<div class="actions"><button class="btn primary" type="button" id="ctGo">Empezar</button></div>';
    } else if (ct.phase === 'loading') html = '<p class="fr-note">Generando un scramble…</p>';
    else {
      const F = ct.follow;
      const moves = parseAlg(ct.scr).map((m) => m.text);
      html += `<p class="fr-scr fr-ct-scr">${moves.map((m, i) => `<span class="sm${F && !F.lost && ct.phase === 'scramble' ? (i < F.pos ? ' done' : i === F.pos ? (F.halfway ? ' next half' : ' next') : '') : ''}">${esc(m)}</span>`).join(' ')}</p>`;
      if (ct.phase === 'scramble') {
        if (F) {
          html += F.lost ? '<p class="hint bad">Tu cubo no está resuelto: resuélvelo (o «Está resuelto» en el cronómetro) y mézclalo con esto.</p>'
            : F.off.length ? `<p class="hint bad">Ese giro no toca. Deshaz: <b>${esc(undoText(F))}</b></p>`
              : '<p class="hint">Mézclalo (blanco arriba, verde delante). Al acabar empiezan los 15 s.</p>';
        } else html += '<p class="hint">Mezcla tu cubo con esto (blanco arriba, verde delante) y pulsa «Ya está» para empezar los 15 s.</p><div class="actions"><button class="btn primary" type="button" id="ctPlan">Ya está</button></div>';
      } else if (ct.phase === 'plan' || ct.phase === 'do') {
        html += `<div class="fr-ct-clock"><span class="field-title">${ct.phase === 'plan' ? `Planea la ${esc(name)} entera` : 'Haciéndola…'}</span><b id="ctClock">${ct.phase === 'plan' ? '15' : '0.00'}</b></div>`;
        html += cube && cube.on
          ? `<p class="hint">${ct.phase === 'plan' ? `Pon el ${esc(COLOR_NAME[settings.cross])} abajo y hazla de una vez: empiezo a contar con tu primer giro.` : `${ct.moves.length} giros…`}</p>`
          : '<div class="actions"><button class="btn primary" type="button" id="ctDone">La he hecho</button></div>';
      } else if (ct.phase === 'done') {
        const r = ct.result || {};
        const b = ct.best;
        if (r.n != null) {
          const extra = r.n - r.opt;
          html += `<p class="fr-big ${extra <= 0 ? 'ok' : ''}">${extra <= 0 ? '¡La más corta!' : `${r.n} giros: ${extra} más que la más corta`}</p>`
            + `<p class="fr-note">Tu cruz, en ${f1(r.t)} s${r.over ? ' (pasaste de los 15 s planeando)' : ''}: ${algHtml(r.mine)}</p>`;
        }
        html += `<p class="fr-note">La más corta (${b.length} ${b.length === 1 ? 'giro' : 'giros'}): ${b.rotation ? `<span class="muted">${esc(b.rotation)}</span> ` : ''}${b.moves ? algHtml(b.moves) : '<i>ya estaba hecha</i>'}</p>`
          + '<div class="actions"><button class="btn primary" type="button" id="ctGo">Otra</button></div>';
      }
    }
    const stats = ctStats();
    html += stats ? `<p class="hint">${esc(stats)}</p>` : '';
    box.innerHTML = html;
    const go = $('ctGo'); if (go) go.addEventListener('click', ctNew);
    const pl = $('ctPlan'); if (pl) pl.addEventListener('click', ctPlan);
    const dn = $('ctDone'); if (dn) dn.addEventListener('click', () => ctFinish(null));
    if (ct.phase === 'plan' || ct.phase === 'do') ctTick();
  }
  onView('entrenar', renderCt);

  // ================= Settings =================
  function renderSettings() {
    $('setInspect').checked = settings.inspect;
    $('setHelp').checked = settings.help;
    $('setSound').checked = settings.sound;
    $('setVibrate').checked = settings.vibrate;
    $('setVibrateRow').hidden = !canVibrate;
    $('setCelebrate').checked = settings.celebrate !== false;
    $('setPace').value = ['avg', 'pb', 'off'].includes(settings.pace) ? settings.pace : 'avg';
    $('setCross').value = settings.cross;
    const th = load(K.theme, 'auto') || 'auto';
    document.querySelectorAll('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === th)));
  }
  $('setInspect').addEventListener('change', (e) => { settings.inspect = e.target.checked; saveSettings(); renderClock(); });
  $('setHelp').addEventListener('change', (e) => { settings.help = e.target.checked; saveSettings(); });
  $('setVibrate').addEventListener('change', (e) => { settings.vibrate = e.target.checked; saveSettings(); });
  $('setCelebrate').addEventListener('change', (e) => { settings.celebrate = e.target.checked; saveSettings(); });
  $('setPace').addEventListener('change', (e) => { settings.pace = e.target.value; saveSettings(); renderPace(); if (timer.last && timer.last.sp) renderSplits(timer.last); });
  $('setSound').addEventListener('change', (e) => { settings.sound = e.target.checked; saveSettings(); if (settings.sound) window.SmartCube.unlockAudio(); });
  $('setCross').addEventListener('change', (e) => { settings.cross = e.target.value; saveSettings(); renderCross(); track = null; tr.c = null; });
  document.querySelectorAll('[data-theme-set]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.themeSet;
    try { if (v === 'auto') localStorage.removeItem(K.theme); else localStorage.setItem(K.theme, v); } catch (e) { /* this visit */ }
    if (v === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', v);
    renderSettings();
  }));
  $('exportData').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ times, learn, train, settings, crossTr: load(K.crossTr, []) }, null, 1)], { type: 'application/json' });
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
    const gone = load(K.deleted, []);
    times.forEach((r) => gone.push(r.at));
    save(K.deleted, gone.slice(-3000));
    times = [];
    save(K.times, times);
    renderStats();
    renderSplits(null);
    toast('Tiempos borrados');
    changed();
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
  // What you are learning right now, so the overlay switches by itself to a learning layout: the case (only
  // once it is no longer a guess), how it went, and the session with each case of the set.
  function learnState() {
    if (view !== 'entrenar' && view !== 'casos') return null;
    const off = Date.now() - now();
    const tot = S.training(train, trlog);
    const out = {
      view, tmode: settings.trMode, step: null, phase: 'idle', setup: null, t0: 0, res: null, pic: null, cname: null, session: null,
      week: { reps: tot.week, days: tot.days, quiz: tot.quiz ? Math.round((tot.quizOk / tot.quiz) * 100) : null, cube: tot.cube ? Math.round(tot.cubeMs / tot.cube) : null },
    };
    if (view === 'entrenar' && !ctActive()) {
      const m = settings.trMode;
      const c = m === 'hand' ? tr.hand && tr.hand.c : tr.c;
      if (c) {
        out.step = STEP_NAME[c.step];
        if (m === 'look') {
          out.pic = quizPicture();
          if (tr.answered && lastAns) { out.phase = 'answered'; out.res = lastAns; out.cname = c.name; } else { out.phase = 'question'; out.t0 = Math.round(tr.qStart + off); }
        } else if (m === 'hand') {
          if (tr.answered && lastAns) { out.phase = 'answered'; out.res = lastAns; out.cname = c.name; out.pic = topView(tr.hand.g, { mode: modeOf(c.step), arrows: c.step.startsWith('pll'), label: c.name }); } else out.phase = 'question';
        } else if (cube && cube.on) {
          if (tr.result) { out.phase = 'result'; out.cname = c.name; out.res = { ok: 1, t: Math.round(tr.result.total), r: Math.round(tr.result.recog), name: c.name }; out.pic = casePicture(c); }
          else if (tr.ready) { out.phase = 'solving'; out.t0 = Math.round(tr.ready + off); }
          else if (tr.follow) {
            const F = tr.follow;
            out.phase = 'setup';
            out.setup = { moves: parseAlg(tr.setup).map((x) => inHand(x.text, tr.map)), pos: F.pos, half: F.halfway, lost: F.lost };
          }
        }
      }
    }
    if (session) {
      const need = NEED[session.mode];
      out.session = {
        active: session.active, lastAt: session.lastAt, n: session.n, ok: session.ok, lost: session.lost, mode: session.mode, need,
        done: session.done.map((id) => C.caseById(id).name),
        set: session.set.map((id) => ({ name: shortName(C.caseById(id)), k: Math.min(need, streakOf(session.per[id])), cur: !!(tr.c && tr.c.id === id) })),
      };
    }
    return out;
  }
  window.Fridrich = {
    learnState,
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
      const t = info.track || (info.held && info.stage >= 2 ? prog.last : null);
      const rec = t ? t.rec : null;
      return {
        facelets: toFacelets(cube.state),
        stage: info.stage, pairs: read.n, cross: read.cross, colour: read.colour,
        splits: timer.phase === 'run' && timer.line ? liveSplits() : null,
        skips: timer.phase === 'run' && timer.line && liveSplits() ? liveSplits().skip : null,
        case: rec && rec.case ? { id: rec.case.id, name: rec.case.name, alg: rec.case.alg, step: rec.case.step, front: rec.front, pre: rec.pre, post: rec.post } : null,
        scr: follow ? { pos: follow.pos, n: follow.n, half: follow.halfway, undo: follow.off.length ? undoText(follow) : '', lost: follow.lost } : null,
      };
    },
    last: () => timer.last,
    // The reference of the solve under way, and how a finished solve went against its own reference.
    pace: () => (timer.phase === 'run' && pace.ref ? { cum: pace.ref.cum, best: pace.ref.best, label: pace.ref.label } : null),
    paceFor: (r) => { const pf = settings.pace !== 'off' ? paceFor(r) : null; return pf ? { d: pf.rows.map((x) => Math.round(x.d)), gold: pf.rows.map((x) => x.gold), total: Math.round(pf.total), label: pf.label } : null; },
    recordsOf,
    // For tests.
    _: { simSolution, caseTarget, tr, settings, celebrate, paceRef, bestsOf, paceTick, myBests, ligaPublish, player, loadLeague, lg, session: () => session, endSession, startSession, follow: () => follow, makeFollow, partialKeys, setScramble, makeTry, ct, vibes, syncNow, mergeIn, offerUpdate, focus: () => focus.on },
  };

  // ================= Start =================
  const first = location.hash.slice(1);
  const invite = first.match(/^liga[=/]([a-z0-9]{8})$/i);
  if (invite) openInvite(invite[1].toLowerCase());
  else showView(VIEWS.includes(first) ? first : load(K.view, 'crono'));
  renderMode();
  renderStats();
  renderPick();
  const lastWithSp = times.length ? times[times.length - 1] : null;
  if (lastWithSp && lastWithSp.sp) renderSplits(lastWithSp);
  if (scramble) setScramble(scramble); else { renderScramble(); newScramble(); }
  // Sync set up on the 3BLD page (or another tab): bring this page up to date.
  if (syncState()) setTimeout(() => syncNow(false), 1500);
  if (ligas().length) setTimeout(() => ligaPublish(), 2500);
  setTimeout(() => { if (typeof Worker !== 'undefined') M.startScrambler().catch(() => {}); }, 400);
  if ('serviceWorker' in navigator && document.querySelector('link[rel=manifest]')) {
    navigator.serviceWorker.register('sw.js').then(watchUpdates).catch(() => {});
  }
})();
