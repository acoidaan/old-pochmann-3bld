// An event page of the WCA plan (2×2, 4×4, Pyraminx, Square-1; <html data-event>): «Aprender» (the method step
// by step, its cases drawn from the puzzle model and «Pruébalo» to follow each algorithm turn by turn),
// «Cronómetro» (WCA scrambles, 15 s inspection with the judge's calls and its penalties, rounds of 5 with
// their average), «Entrenar» (the cases one by one until you know them), «Progreso» (the plan's goals for this
// event, the times, the rounds) and «Ajustes». The puzzle comes from pz-*.js, the method from ev-*.js, the data
// from evdata.js. Exposes window.EvPage (for the tests).
(() => {
  'use strict';
  const D = window.EvData;
  const EV = document.documentElement.dataset.event;
  const T = window.EvContent && window.EvContent[EV];
  if (!D || !T) return;
  const $ = (id) => document.getElementById(id);
  const esc = (txt) => String(txt).replace(/[&<>'"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
  const now = () => performance.now();
  const INFO = D.eventOf(EV);
  const K = { view: `ev:${EV}:view:v1`, scr: `ev:${EV}:scramble:v1`, round: `ev:${EV}:round:v1`, mode: `ev:${EV}:mode:v1`, trSet: `ev:${EV}:trset:v1` };

  // ================= The puzzle =================
  const PZ = (() => {
    if (T.puzzle === 'cube2' || T.puzzle === 'cube4') {
      const n = T.puzzle === 'cube2' ? 2 : 4;
      const P = window.PzCube;
      const M = P.make(n);
      const held = () => (T.hold ? M.apply(M.solved(), T.hold) : M.solved());
      // What a case picture leaves in grey (its set's or its own «mask»), so only what you look for stands out:
      // a colour letter shows only that colour (the yellow of an OLL), «centres» only the centres and
      // «nocorners» everything but the corners.
      const outer = (i) => M.stickers[i].pos.filter((v) => Math.abs(v) === n - 1).length; // 3 corner, 2 edge, 1 centre
      const keepOf = (mask) => {
        if (!mask) return null;
        if (mask === 'centres') return (i) => outer(i) === 1;
        if (mask === 'nocorners') return (i) => outer(i) !== 3;
        return (i, c) => c === mask;
      };
      const drawOf = (kind) => (kind === 'top' ? P.top : kind === 'iso' ? P.iso : P.net);
      return {
        model: M, held, apply: M.apply, invert: P.invert, isSolved: M.isSolved, cube: n,
        tokens: (alg) => String(alg).trim().split(/\s+/).filter(Boolean),
        scramble: () => (n === 2 ? P.two.scramble() : P.randomMoves(40)),
        draw: (st, kind, o = {}) => drawOf(kind)(n, st, { ...o, keep: keepOf(o.mask) }),
        stepPic: 'iso',
        scrPic: (st, o) => P.net(n, st, o),
        from: (f) => { let st = held(); if (f.flip) st = M.flipEdge(st, ...f.flip); if (f.swap) st = M.swapEdges(st, ...f.swap); return st; },
        solvedNow: (st) => M.isSolved(st),
      };
    }
    if (T.puzzle === 'pyra') {
      const P = window.PzPyra;
      return {
        model: P, held: P.solved, apply: P.apply, invert: P.invert, isSolved: P.isSolved,
        tokens: (alg) => String(alg).trim().split(/\s+/).filter(Boolean),
        scramble: () => P.scramble(), draw: (st, kind, o) => P.net(st, o), stepPic: 'net', scrPic: (st, o) => P.net(st, o), solvedNow: P.isSolved,
      };
    }
    const Q = window.PzSq1;
    return {
      model: Q, held: Q.solved, apply: Q.apply, invert: Q.invert, isSolved: Q.isSolved,
      tokens: (alg) => Q.parse(alg).map((m) => (m === '/' ? '/' : `(${m.x},${m.y})`)),
      scramble: () => Q.scramble(), draw: (st, kind, o) => Q.draw(st, o), stepPic: 'sq1', scrPic: (st, o) => Q.draw(st, o),
      solvedNow: (st) => !!Q.solvedUpTo(st), shapeNow: (st) => Q.cubeShape(st) || (Q.isSquare(st.top) && Q.isSquare(st.bot)),
    };
  })();
  const setOf = (id) => T.sets[id];
  const allCases = () => Object.entries(T.sets).flatMap(([sid, s]) => s.cases.map((c) => ({ c, sid, s })));
  const caseById = (id) => allCases().find((x) => x.c.id === id);
  // The case a sequence solves: given by hand (a setup, or an edge flipped or swapped on the stickers) or its
  // algorithm undone from the solved puzzle as held.
  function caseState(c) {
    if (c.from && PZ.from) return PZ.from(c.from);
    if (c.setup) return PZ.apply(PZ.held(), c.setup);
    return PZ.apply(PZ.held(), PZ.invert(c.after ? `${c.alg} ${c.after}` : c.alg));
  }
  const algHtml = (alg) => `<span class="fr-alg">${PZ.tokens(alg).map((m) => `<span>${esc(m)}</span>`).join(' ')}</span>`;

  // ================= Views =================
  const VIEWS = ['aprender', 'crono', 'entrenar', 'progreso', 'ajustes'];
  const hooks = {};
  let view = null;
  function showView(name) {
    if (!VIEWS.includes(name)) name = 'aprender';
    const was = view;
    view = name;
    document.querySelectorAll('.view').forEach((el) => { el.hidden = el.dataset.view !== name; });
    const f = document.activeElement;
    if (f && f !== document.body && f.closest('.view') && f.closest('.view').hidden) f.blur();
    document.querySelectorAll('[data-go]').forEach((b) => { if (b.dataset.go === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    D.save(K.view, name);
    if (navigator.onLine) { try { history.replaceState(null, '', `${location.pathname}${location.search}#${name}`); } catch (e) { /* sandboxed */ } }
    if (was !== name) { try { window.scrollTo(0, 0); } catch (e) { /* no layout */ } }
    (hooks[name] || []).forEach((fn) => fn());
  }
  const onView = (name, fn) => { (hooks[name] = hooks[name] || []).push(fn); };
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.go)));
  window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    if (VIEWS.includes(h) && h !== view) showView(h);
    else if (/^paso-/.test(h)) { showView('aprender'); const el = $(h); if (el) el.scrollIntoView(); }
  });
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.h);
    toast.h = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ================= Sound and the judge's voice =================
  let audio = null;
  function unlock() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audio) audio = new AC();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
    } catch (e) { audio = null; }
  }
  function tone(notes, vol = 0.25) {
    if (!audio || !D.settings().sound) return;
    try {
      const t0 = audio.currentTime + 0.02;
      notes.forEach(([f, d]) => {
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + d);
        g.gain.exponentialRampToValueAtTime(vol, t0 + d + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.35);
        o.connect(g).connect(audio.destination);
        o.start(t0 + d);
        o.stop(t0 + d + 0.4);
      });
    } catch (e) { /* no sound */ }
  }
  const chime = (pb) => tone(pb ? [[1047, 0], [1319, 0.09], [1568, 0.18], [2093, 0.3]] : [[1047, 0], [1319, 0.1], [1568, 0.2]]);
  const clips = new Map();
  const clipUrl = (k) => { const tpl = $('voiceClips'); const a = tpl && tpl.content.querySelector(`[data-k="${k}"]`); return a ? a.getAttribute('src') : null; };
  function loadClip(url) {
    if (!audio || !url) return Promise.resolve(null);
    if (!clips.has(url)) {
      clips.set(url, fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('no está'))))
        .then((b) => new Promise((ok, ko) => audio.decodeAudioData(b, ok, ko))).catch(() => { clips.delete(url); return null; }));
    }
    return clips.get(url);
  }
  const voiceLog = [];
  function speak(text) {
    const S = window.speechSynthesis;
    if (!S || typeof window.SpeechSynthesisUtterance !== 'function') return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-ES';
      S.speak(u);
    } catch (e) { /* no voice */ }
  }
  // The judge at 8 and at 12 seconds: the recorded call, or the browser's voice if it cannot play.
  function call(k) {
    voiceLog.push(k);
    if (!D.settings().voice) return;
    const url = clipUrl(k);
    loadClip(url).then((buf) => {
      if (!buf) { speak(k === 'eight' ? 'Ocho segundos' : 'Doce segundos'); return; }
      const src = audio.createBufferSource();
      src.buffer = buf;
      src.connect(audio.destination);
      src.start();
    }).catch(() => {});
  }

  // ================= Aprender =================
  const knownSteps = () => T.steps.filter((s) => D.isKnown(EV, s.id)).length;
  // Nets of a cube and the Square-1 are wide: their cards put the picture above the text, bigger.
  const wideOf = (s) => s.pic === 'sq1' || (s.pic === 'net' && !!PZ.cube);
  function caseCard(c, s) {
    return `<article class="ev-case${wideOf(s) ? ' ev-case-wide' : ''}" data-case="${esc(c.id)}">
      <div class="ev-case-pic">${PZ.draw(caseState(c), s.pic, { label: `${c.name}: el caso`, mask: c.mask || s.mask })}</div>
      <div class="ev-case-text">
        <h3>${esc(c.name)}</h3>
        ${c.how ? `<p class="ev-case-how">${esc(c.how)}</p>` : ''}
        <p class="ev-case-alg">${algHtml(c.alg)}${c.after ? ` <span class="muted">y luego ${esc(c.after)}</span>` : ''}</p>
        ${c.alts ? `<p class="hint">También: ${c.alts.map((a) => algHtml(a)).join(' · ')}</p>` : ''}
        <button class="btn ev-try-btn" type="button" data-try="${esc(c.id)}">Pruébalo</button>
      </div>
    </article>`;
  }
  function casesHtml(sid) {
    const s = setOf(sid);
    if (!s) return '';
    // Grouped (L4E): one list per group, each with its title.
    const groups = [...new Set(s.cases.map((c) => c.group || ''))];
    if (groups.length > 1) {
      return groups.map((g) => `<h3 class="ev-group">${esc(g)} <span class="muted">(${s.cases.filter((c) => (c.group || '') === g).length})</span></h3><div class="ev-cases">${s.cases.filter((c) => (c.group || '') === g).map((c) => caseCard(c, s)).join('')}</div>`).join('');
    }
    return `<div class="ev-cases">${s.cases.map((c) => caseCard(c, s)).join('')}</div>`;
  }
  function renderPath() {
    const k = knownSteps();
    $('knownCount').textContent = `${k} de ${T.steps.length} pasos`;
    $('path').innerHTML = T.steps.map((s, i) => {
      const known = D.isKnown(EV, s.id);
      const next = !known && T.steps.slice(0, i).every((x) => D.isKnown(EV, x.id));
      return `<li class="${known ? 'known' : next ? 'next' : ''}"><a href="#paso-${s.id}"><span class="pr-n">${known ? '✓' : i + 1}</span><span>${esc(s.short)}</span></a></li>`;
    }).join('');
    $('soloCheck').checked = D.solo(EV);
    document.querySelectorAll('[data-known]').forEach((b) => {
      const on = D.isKnown(EV, b.dataset.known);
      b.setAttribute('aria-pressed', String(on));
      b.textContent = on ? '✓ Me lo sé' : 'Ya me lo sé';
    });
  }
  function renderLearn() {
    $('evIntro').innerHTML = T.lead;
    $('soloText').textContent = T.solo;
    $('holdNote').textContent = T.holdNote || '';
    $('notationBody').innerHTML = T.notation;
    $('steps').innerHTML = T.steps.map((s, i) => `<section class="panel ev-step" id="paso-${s.id}" aria-labelledby="h-${s.id}">
        <div class="panel-head"><h2 id="h-${s.id}">${i + 1}. ${esc(s.name)}</h2><button class="btn ev-known" type="button" data-known="${s.id}" aria-pressed="false">Ya me lo sé</button></div>
        <div class="ev-step-body">${s.html}</div>
        ${s.set ? casesHtml(s.set) : ''}
        ${s.tip ? `<p class="ev-tip"><b>Consejo:</b> ${s.tip}</p>` : ''}
      </section>`).join('');
    const nx = T.next;
    $('nextBox').innerHTML = nx ? `<div class="panel-head"><h2 id="hNext">${esc(nx.title)}</h2></div>${nx.html}`
      + (nx.set ? `<details class="ev-next-cases"><summary>Ver los ${setOf(nx.set).cases.length} casos</summary>${casesHtml(nx.set)}</details>` : '')
      + (nx.link ? `<p><a href="${esc(nx.link.href)}" target="_blank" rel="noopener">${esc(nx.link.text)}</a></p>` : '') : '';
    $('nextBox').hidden = !nx;
    renderPath();
  }
  document.addEventListener('click', (ev) => {
    const k = ev.target.closest('[data-known]');
    if (k) {
      const on = !D.isKnown(EV, k.dataset.known);
      D.setKnown(EV, k.dataset.known, on);
      renderPath();
      D.changed();
      if (on) toast(knownSteps() === T.steps.length ? '¡El método entero! Márcalo arriba cuando te salga sin mirar' : 'Paso aprendido');
      return;
    }
    const t = ev.target.closest('[data-try]');
    if (t) openTry(t.dataset.try, t);
  });
  $('soloCheck').addEventListener('change', (e) => {
    D.setSolo(EV, e.target.checked);
    D.changed();
    if (e.target.checked) toast('Primer hito del plan conseguido');
    renderPhase();
  });

  // ---- «Pruébalo»: the case, then turn by turn
  const tryS = { c: null, s: null, toks: [], k: 0, start: null, back: null };
  function openTry(id, from) {
    const x = caseById(id);
    if (!x) return;
    tryS.c = x.c;
    tryS.s = x.s;
    tryS.start = caseState(x.c);
    tryS.toks = PZ.tokens(x.c.after ? `${x.c.alg} ${x.c.after}` : x.c.alg);
    tryS.k = 0;
    tryS.back = from || null;
    $('tryTitle').textContent = x.c.name;
    $('trySheet').hidden = false;
    renderTry();
    $('tryNext').focus();
  }
  function closeTry() {
    $('trySheet').hidden = true;
    if (tryS.back && tryS.back.isConnected) tryS.back.focus();
  }
  function renderTry() {
    const n = tryS.toks.length;
    const st = tryS.k ? PZ.apply(tryS.start, tryS.toks.slice(0, tryS.k).join(' ')) : tryS.start;
    $('tryPic').innerHTML = PZ.draw(st, PZ.stepPic === 'iso' && tryS.s.pic !== 'iso' ? 'iso' : tryS.s.pic, { label: tryS.k ? `Después de ${tryS.k} de ${n} giros` : 'El caso, antes de empezar' });
    $('tryAlg').innerHTML = tryS.toks.map((m, i) => `<span class="ev-mv${i < tryS.k ? ' done' : ''}${i === tryS.k ? ' next' : ''}">${esc(m)}</span>`).join(' ');
    let msg;
    if (!tryS.k) msg = 'El caso, antes de empezar. Pulsa «Siguiente» para ver cada giro.';
    else if (tryS.k < n) msg = `Hecho ${esc(tryS.toks[tryS.k - 1])} (${tryS.k} de ${n}). Ahora: <b>${esc(tryS.toks[tryS.k])}</b>`;
    else if (tryS.c.shape && PZ.shapeNow) msg = PZ.shapeNow(st) ? '¡Forma de cubo! Las dos capas son cuadradas.' : 'Fin del algoritmo.';
    else msg = PZ.solvedNow(st) ? '¡Resuelto!' : 'Fin del algoritmo: el paso está hecho (lo demás se arregla en los pasos siguientes).';
    $('tryNow').innerHTML = msg;
    const had = document.activeElement;
    $('tryPrev').disabled = tryS.k === 0;
    $('tryNext').disabled = tryS.k >= n;
    // At either end the button you were on goes off: keep the focus in the sheet, on the other one.
    if (had && had.disabled) (had === $('tryNext') ? $('tryPrev') : $('tryNext')).focus();
  }
  $('tryNext').addEventListener('click', () => { if (tryS.k < tryS.toks.length) { tryS.k++; renderTry(); } });
  $('tryPrev').addEventListener('click', () => { if (tryS.k > 0) { tryS.k--; renderTry(); } });
  $('tryReset').addEventListener('click', () => { tryS.k = 0; renderTry(); });
  $('tryClose').addEventListener('click', closeTry);
  $('trySheet').addEventListener('click', (ev) => { if (ev.target === $('trySheet')) closeTry(); });
  // On the whole document while it is open: the focus can end up on the page (a button that just got disabled).
  document.addEventListener('keydown', (ev) => {
    if ($('trySheet').hidden) return;
    if (ev.key === 'Escape') { ev.preventDefault(); closeTry(); }
    if (ev.key === 'ArrowRight') { ev.preventDefault(); $('tryNext').click(); }
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); $('tryPrev').click(); }
  });

  // ================= Cronómetro =================
  let times = D.times(EV);
  let scramble = D.load(K.scr, '');
  let mode = D.load(K.mode, 'free') === 'round' ? 'round' : 'free';
  let round = D.load(K.round, null);   // { rd, n } while a round of 5 is going
  const timer = { phase: 'idle', t0: 0, i0: 0, raf: 0, hold: 0, pen: 0, said: {}, last: null };
  const HOLD_MS = 300;
  function newScramble() {
    try { scramble = PZ.scramble(); } catch (e) { scramble = ''; }
    D.save(K.scr, scramble);
    renderScramble();
  }
  function renderScramble() {
    $('scr').textContent = scramble || 'Generando la mezcla…';
    let pic = '';
    try { if (scramble) pic = PZ.scrPic(PZ.apply(PZ.model.solved ? PZ.model.solved() : PZ.held(), scramble), { label: 'Cómo queda el puzle tras la mezcla' }); } catch (e) { pic = ''; }
    $('scrPic').innerHTML = pic;
  }
  $('newScr').addEventListener('click', () => { if (!['run', 'inspect', 'ihold', 'iready'].includes(timer.phase)) newScramble(); });
  const inspectOn = () => D.settings().inspect;
  const typing = (el) => el && ((el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes(el.type)) || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  function setPhase(p) {
    timer.phase = p;
    document.body.dataset.timer = ['run', 'inspect', 'ihold', 'iready'].includes(p) ? 'run' : 'idle';
    renderClock();
    document.dispatchEvent(new CustomEvent('ev:timer', { detail: p }));
  }
  function tick() {
    cancelAnimationFrame(timer.raf);
    const step = () => {
      if (timer.phase === 'run') $('clockTime').textContent = D.fmt(now() - timer.t0);
      else if (['inspect', 'ihold', 'iready'].includes(timer.phase)) {
        const e = now() - timer.i0;
        if (e >= 8000 && !timer.said.eight) { timer.said.eight = 1; call('eight'); }
        if (e >= 12000 && !timer.said.twelve) { timer.said.twelve = 1; call('twelve'); }
        $('clockTime').textContent = e < 15000 ? String(Math.ceil((15000 - e) / 1000)) : e < 17000 ? '+2' : 'DNF';
      } else return;
      timer.raf = requestAnimationFrame(step);
    };
    timer.raf = requestAnimationFrame(step);
  }
  function startInspection() {
    timer.i0 = now();
    timer.said = {};
    setPhase('inspect');
    tick();
  }
  function startRun() {
    timer.pen = 0;
    if (timer.i0) {
      const e = now() - timer.i0;
      timer.pen = e > 17000 ? 'dnf' : e > 15000 ? 2 : 0;
    }
    timer.t0 = now();
    timer.scr = scramble;
    setPhase('run');
    tick();
  }
  function stopRun() {
    if (timer.phase !== 'run') return;
    cancelAnimationFrame(timer.raf);
    const t = Math.round(now() - timer.t0);
    const r = { at: Date.now(), t, pen: timer.pen, scr: timer.scr || scramble };
    if (timer.i0) r.ins = 1;
    if (D.settings().help) r.help = 1;
    // In a round: the place in it is how many it has (so a deleted solve leaves room); after the fifth, a new one.
    if (mode === 'round') {
      const cur = round ? D.rounds(times).find((x) => x.id === round.rd) : null;
      if (cur && !cur.done) { r.rd = cur.id; r.ri = cur.times.length; } else { round = { rd: r.at }; r.rd = r.at; r.ri = 0; D.save(K.round, round); }
    }
    const before = times.filter((x) => x.pen !== 'dnf');
    const prevBest = before.length ? Math.min(...before.map(D.value)) : null;
    times.push(r);
    D.setTimes(EV, times);
    D.changed();
    timer.last = r;
    timer.i0 = 0;
    $('clockTime').textContent = D.fmtRes(r);
    setPhase('done');
    const pb = prevBest != null && D.value(r) < prevBest;
    chime(pb || !before.length);
    if (!before.length && r.pen !== 'dnf') toast(`¡Tu primer ${INFO.name}!`);
    else if (pb) toast(`¡Récord! ${D.fmt(D.value(r))}`);
    if (r.rd && r.ri === 4) {
      const rs = D.rounds(times).find((x) => x.id === r.rd);
      if (rs && rs.done) toast(`Ronda terminada: media ${D.fmt(rs.avg)}`);
    }
    renderStats();
    renderRound();
    renderPhase();
    newScramble();
  }
  function cancel() {
    cancelAnimationFrame(timer.raf);
    clearTimeout(timer.hold);
    timer.i0 = 0;
    $('clockTime').textContent = timer.last ? D.fmtRes(timer.last) : D.fmt(0);
    setPhase(timer.last ? 'done' : 'idle');
  }
  function renderClock() {
    const p = timer.phase;
    $('clock').dataset.phase = ['inspect', 'ihold'].includes(p) ? 'inspect' : p === 'iready' ? 'ready' : p;
    const phaseText = {
      idle: 'Listo', done: 'Tiempo', hold: 'Mantén…', ready: 'Suelta para empezar', run: 'En marcha',
      inspect: 'Inspección', ihold: 'Mantén…', iready: 'Suelta para empezar',
    };
    $('clockPhase').textContent = `${phaseText[p] || ''}${D.settings().help ? ' · con ayuda' : ''}`;
    let sub = '';
    if (p === 'idle' || p === 'done') sub = inspectOn() ? 'Pulsa (o Espacio) para empezar la inspección' : 'Mantén pulsado (o Espacio) y suelta para empezar';
    else if (p === 'inspect') sub = 'Mantén pulsado y suelta para empezar a resolver';
    else if (p === 'run') sub = 'Pulsa para parar';
    $('clockSplit').textContent = sub;
    if (p === 'idle' && !timer.last) $('clockTime').textContent = D.fmt(0);
  }
  function press() {
    const p = timer.phase;
    if (p === 'run') { stopRun(); return true; }
    if (p === 'idle' || p === 'done') {
      unlock();
      if (inspectOn()) { startInspection(); timer.armed = false; return true; }
      timer.hold = setTimeout(() => { if (timer.phase === 'hold') setPhase('ready'); }, HOLD_MS);
      setPhase('hold');
      return true;
    }
    if (p === 'inspect') {
      timer.hold = setTimeout(() => { if (timer.phase === 'ihold') setPhase('iready'); }, HOLD_MS);
      setPhase('ihold');
      return true;
    }
    return false;
  }
  function release() {
    clearTimeout(timer.hold);
    const p = timer.phase;
    if (p === 'ready' || p === 'iready') startRun();
    else if (p === 'hold') setPhase(timer.last ? 'done' : 'idle');
    else if (p === 'ihold') setPhase('inspect');
  }
  document.addEventListener('keydown', (ev) => {
    if (view !== 'crono' || typing(ev.target) || !$('trySheet').hidden) return;
    if (ev.key === 'Escape') {
      if (['run', 'hold', 'ready', 'inspect', 'ihold', 'iready'].includes(timer.phase)) { ev.preventDefault(); cancel(); } else if (document.body.classList.contains('ev-focus')) setFocus(false);
      return;
    }
    if (timer.phase === 'run' && !ev.repeat && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { ev.preventDefault(); stopRun(); return; }
    if ((ev.key === 'f' || ev.key === 'F') && !ev.ctrlKey && !ev.metaKey && !ev.altKey && ['idle', 'done'].includes(timer.phase)) { ev.preventDefault(); setFocus(!document.body.classList.contains('ev-focus')); return; }
    if (ev.key !== ' ') return;
    ev.preventDefault();
    if (ev.repeat) return;
    press();
  });
  document.addEventListener('keyup', (ev) => {
    if (ev.key !== ' ' || view !== 'crono' || typing(ev.target)) return;
    ev.preventDefault();
    release();
  });
  const clockEl = $('clock');
  clockEl.addEventListener('pointerdown', (ev) => { if (ev.button === 0 && press()) { ev.preventDefault(); if (clockEl.setPointerCapture) clockEl.setPointerCapture(ev.pointerId); } });
  clockEl.addEventListener('pointerup', () => release());
  clockEl.addEventListener('pointercancel', () => { if (['hold', 'ready'].includes(timer.phase)) cancel(); else if (['ihold', 'iready'].includes(timer.phase)) setPhase('inspect'); });
  // A finger held still is a long press to the phone, which would cancel the touch: the clock keeps it.
  const keepTouch = (ev) => { if (ev.cancelable) ev.preventDefault(); };
  clockEl.addEventListener('touchstart', keepTouch, { passive: false });
  clockEl.addEventListener('contextmenu', keepTouch);
  clockEl.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') ev.preventDefault(); });
  clockEl.addEventListener('click', (ev) => ev.preventDefault());

  // ---- Full screen: only the scramble and the clock
  // With «Mirando el tutorial» on, full screen keeps the method's algorithms in sight (the long sets, as the
  // 35 L4E, stay in Aprender); the solve is saved as with help.
  function renderCheat() {
    const box = $('cheat');
    box.hidden = !(document.body.classList.contains('ev-focus') && D.settings().help);
    if (box.hidden || box.dataset.done) return;
    box.dataset.done = '1';
    const ids = [...new Set(T.steps.map((st) => st.set).filter(Boolean))].filter((id) => setOf(id) && setOf(id).cases.length <= 12);
    box.innerHTML = ids.map((id) => `<div class="ev-cheat-set"><h3>${esc(setOf(id).name)}</h3><ul>${setOf(id).cases.map((c) => `<li><b>${esc(c.name)}</b> ${algHtml(c.alg)}${c.after ? ` <span class="muted">y ${esc(c.after)}</span>` : ''}</li>`).join('')}</ul></div>`).join('');
  }
  function setFocus(on) {
    document.body.classList.toggle('ev-focus', on);
    renderCheat();
    $('focusOpen').setAttribute('aria-pressed', String(on));
    if (on) { try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); } catch (e) { /* not allowed */ } } else if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }
  $('focusOpen').addEventListener('click', () => setFocus(!document.body.classList.contains('ev-focus')));
  $('focusClose').addEventListener('click', () => setFocus(false));
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.body.classList.contains('ev-focus')) setFocus(false); });

  // ---- Free or a round of 5
  function renderMode() {
    $('modeFree').setAttribute('aria-pressed', String(mode === 'free'));
    $('modeRound').setAttribute('aria-pressed', String(mode === 'round'));
    renderRound();
  }
  $('modeFree').addEventListener('click', () => { mode = 'free'; D.save(K.mode, mode); renderMode(); });
  $('modeRound').addEventListener('click', () => { mode = 'round'; D.save(K.mode, mode); renderMode(); });
  function renderRound() {
    const box = $('round');
    box.hidden = mode !== 'round';
    if (box.hidden) return;
    const cur = round ? D.rounds(times).find((r) => r.id === round.rd) : null;
    const going = cur && !cur.done ? cur : null;
    const shown = going || (cur && cur.done ? cur : null);
    // Once done, its best and its worst in brackets, as on WCA results: they do not count.
    const out = shown && shown.done ? D.trimmed(shown.times) : new Set();
    const slots = [0, 1, 2, 3, 4].map((i) => {
      const r = shown ? shown.times[i] : null;
      return `<li class="${r ? `done${out.has(i) ? ' drop' : ''}` : (going && i === going.times.length) || (!going && !shown && i === 0) ? 'cur' : ''}"><span class="muted">${i + 1}</span><b>${r ? (out.has(i) ? `(${D.fmtRes(r)})` : D.fmtRes(r)) : '—'}</b></li>`;
    }).join('');
    let foot;
    if (shown && shown.done) foot = `<p class="ev-round-avg">Media de la ronda: <b>${D.fmt(shown.avg)}</b> · mejor ${D.fmt(shown.best)}</p><p class="hint">Como en la WCA: fuera el mejor y el peor (entre paréntesis), y la media de los otros tres. El siguiente tiempo empieza otra ronda.</p>`;
    else foot = `<p class="hint">Cinco intentos seguidos, como en una ronda de competición${inspectOn() ? ', con inspección' : ''}. Al quinto, la media.</p>`;
    box.innerHTML = `<div class="ev-round-head"><span class="field-title">Ronda de 5</span>${going ? `<button class="btn" type="button" id="roundNew">Empezar otra</button>` : ''}</div><ol class="ev-round-slots">${slots}</ol>${foot}`;
    const nb = $('roundNew');
    if (nb) nb.addEventListener('click', () => { round = null; D.save(K.round, null); renderRound(); });
  }
  $('optInspect').addEventListener('change', (e) => { D.setSettings({ inspect: e.target.checked }); renderClock(); renderRound(); renderSettings(); });
  $('optHelp').addEventListener('change', (e) => { D.setSettings({ help: e.target.checked }); renderCheat(); renderClock(); });

  // ---- Numbers and the list
  let histShown = 20;
  function statCells(list) {
    const s = D.summary(list);
    const rs = D.rounds(list).filter((r) => r.done && Number.isFinite(r.avg));
    const bestRound = rs.length ? Math.min(...rs.map((r) => r.avg)) : null;
    return [['Resueltos', String(s.n)], ['Mejor', D.fmt(s.best)], ['Media de 5', D.fmt(s.ao5)], ['Media de 12', D.fmt(s.ao12)], ['Mejor media de 5', D.fmt(s.bestAo5)]]
      .concat(bestRound != null ? [['Mejor ronda', D.fmt(bestRound)]] : [])
      .map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('');
  }
  function renderStats() {
    $('stats').innerHTML = times.length ? statCells(times) : '';
    renderHistory();
  }
  function renderHistory() {
    const box = $('history');
    if (!times.length) { box.innerHTML = `<p class="empty-note">Aún no hay tiempos. Mezcla tu ${esc(INFO.name)} con la mezcla de arriba y ponte el reloj.</p>`; $('histMore').hidden = true; return; }
    const rnum = new Map(D.rounds(times).map((r, i) => [r.id, i + 1]));
    const list = times.map((r, i) => ({ r, i })).reverse().slice(0, histShown);
    box.innerHTML = `<table><thead><tr><th scope="col">#</th><th scope="col">Tiempo</th><th scope="col">Cuándo</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead><tbody>${
      list.map(({ r, i }) => `<tr><td class="muted">${i + 1}</td><td><b>${D.fmtRes(r)}</b>${r.rd ? ` <span class="muted">· ronda ${rnum.get(r.rd)}</span>` : ''}${r.help ? ' <span class="muted">· con ayuda</span>' : ''}</td>`
        + `<td class="muted">${new Date(r.at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>`
        + `<td class="fr-acts"><button class="x" type="button" data-pen="2" data-i="${i}" aria-label="Poner o quitar +2 al ${i + 1}" aria-pressed="${r.pen === 2}">+2</button>`
        + `<button class="x" type="button" data-pen="dnf" data-i="${i}" aria-label="Marcar o desmarcar DNF el ${i + 1}" aria-pressed="${r.pen === 'dnf'}">DNF</button>`
        + `<button class="x" type="button" data-del="${i}" aria-label="Borrar el ${i + 1}">×</button></td></tr>`).join('')}</tbody></table>`;
    $('histMore').hidden = times.length <= histShown;
  }
  $('history').addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.del != null) {
      const i = Number(b.dataset.del);
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '¿Borrar?'; b.classList.add('armed'); setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; b.textContent = '×'; b.classList.remove('armed'); } }, 3000); return; }
      if (times[i] === timer.last) timer.last = null;
      const gone = D.load(D.K.deleted, []);
      gone.push(`${EV}:${times[i].at}`);
      D.save(D.K.deleted, gone.slice(-3000));
      times.splice(i, 1);
    } else if (b.dataset.pen) {
      const r = times[Number(b.dataset.i)];
      const p = b.dataset.pen === '2' ? 2 : 'dnf';
      r.pen = r.pen === p ? 0 : p;
      r.ed = Date.now();
    } else return;
    D.setTimes(EV, times);
    renderStats();
    renderRound();
    D.changed();
  });
  $('histMore').addEventListener('click', () => { histShown += 50; renderHistory(); });
  onView('crono', () => { renderScramble(); renderClock(); renderMode(); renderStats(); $('optInspect').checked = inspectOn(); $('optHelp').checked = D.settings().help; });

  // ================= Entrenar =================
  const trSets = (T.train || []).filter((id) => setOf(id));
  let trSet = trSets.includes(D.load(K.trSet, '')) ? D.load(K.trSet, '') : trSets[0];
  const tr = { id: null, shown: false, last: null };
  const DONE = 3;
  function pickCase() {
    const s = setOf(trSet);
    const stats = D.train(EV);
    const pool = s.cases.filter((c) => c.id !== tr.last || s.cases.length === 1);
    const w = pool.map((c) => { const k = (stats[c.id] || {}).streak || 0; return k >= DONE ? 1 : 4 - k; });
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i].id; }
    return pool[pool.length - 1].id;
  }
  function nextCase() {
    tr.id = pickCase();
    tr.last = tr.id;
    tr.shown = false;
    renderTrain();
  }
  function renderTrainSets() {
    $('trSets').innerHTML = trSets.map((id) => `<button type="button" data-trset="${id}" aria-pressed="${id === trSet}">${esc(setOf(id).name)}</button>`).join('');
  }
  $('trSets').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-trset]');
    if (!b || b.dataset.trset === trSet) return;
    trSet = b.dataset.trset;
    D.save(K.trSet, trSet);
    renderTrainSets();
    nextCase();
  });
  function renderTrain() {
    if (!trSets.length) { $('trBox').innerHTML = '<p class="empty-note">Este método no tiene casos que entrenar.</p>'; return; }
    if (!tr.id || !setOf(trSet).cases.some((c) => c.id === tr.id)) { tr.id = pickCase(); tr.last = tr.id; tr.shown = false; }
    const s = setOf(trSet);
    const c = s.cases.find((x) => x.id === tr.id);
    const st = (D.train(EV)[c.id] || {});
    $('trBox').innerHTML = `<div class="ev-train-card">
        <div class="ev-train-pic${wideOf(s) ? ' ev-wide' : ''}">${PZ.draw(caseState(c), s.pic, { label: 'El caso que toca', mask: c.mask || s.mask })}</div>
        <div class="ev-train-text">
          ${tr.shown ? `<h3>${esc(c.name)}</h3>${c.how ? `<p class="ev-case-how">${esc(c.how)}</p>` : ''}<p class="ev-case-alg fr-alg-big">${algHtml(c.alg)}${c.after ? ` <span class="muted">y luego ${esc(c.after)}</span>` : ''}</p>
            <p class="hint">¿Te ha salido sin mirar?</p>
            <div class="actions"><button class="btn primary" type="button" id="trOk">Me ha salido</button><button class="btn" type="button" id="trKo">He fallado</button><button class="btn" type="button" data-try="${esc(c.id)}">Pruébalo</button></div>`
          : `<p class="fr-note">¿Qué caso es? Ponlo en tu puzle como en el dibujo y hazlo.</p>
            <p class="hint">Seguidas bien: ${st.streak || 0} de ${DONE}${(st.streak || 0) >= DONE ? ' · ya te lo sabes' : ''}.</p>
            <div class="actions"><button class="btn primary" type="button" id="trShow">Ver la solución</button><button class="btn" type="button" id="trSkip">Otro</button></div>`}
        </div>
      </div>`;
    const bind = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };
    bind('trShow', () => { tr.shown = true; renderTrain(); const ok = $('trOk'); if (ok) ok.focus(); });
    bind('trSkip', () => nextCase());
    bind('trOk', () => answer(true));
    bind('trKo', () => answer(false));
    renderTrainStats();
  }
  function answer(ok) {
    const t = D.trainAnswer(EV, tr.id, ok);
    D.changed();
    if (ok && t.streak === DONE) toast('¡Caso dominado!');
    nextCase();
    const sb = $('trShow');
    if (sb) sb.focus();
  }
  function renderTrainStats() {
    const s = setOf(trSet);
    const stats = D.train(EV);
    const done = s.cases.filter((c) => ((stats[c.id] || {}).streak || 0) >= DONE).length;
    $('trStats').innerHTML = `<p class="hint">Dominados (${DONE} seguidas bien): <b>${done} de ${s.cases.length}</b>. Los que fallas salen más.</p><ul class="ev-chips">${
      s.cases.map((c) => { const k = Math.min(DONE, (stats[c.id] || {}).streak || 0); return `<li class="${k >= DONE ? 'done' : ''}"><span>${esc(c.name)}</span><span class="fr-dots" role="img" aria-label="${k} de ${DONE} seguidas bien">${[0, 1, 2].map((i) => `<i class="${i < k ? 'on' : ''}"></i>`).join('')}</span></li>`; }).join('')}</ul>`;
  }
  onView('entrenar', () => { renderTrainSets(); renderTrain(); });

  // ================= Progreso =================
  function goalsHtml() {
    return D.goalsOf(EV).map((g, i) => `<li class="${g.done ? 'done' : ''}">
        <div class="ev-goal-head"><span class="field-title">${i ? 'Siguiente hito' : 'Primer hito'}</span><b>${esc(g.text)}</b>${g.done ? '<span class="ev-ok">✓ Conseguido</span>' : ''}</div>
        <div class="ev-bar" role="progressbar" aria-label="${esc(g.text)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(g.progress * 100)}"><i style="width:${Math.round(g.progress * 100)}%"></i></div>
        <p class="hint">${esc(g.note)}</p>
      </li>`).join('');
  }
  function chartSvg(list) {
    const pts = list.filter((r) => r.pen !== 'dnf').slice(-100);
    if (pts.length < 2) return '<p class="empty-note">Con dos tiempos o más, aquí verás cómo van.</p>';
    const W = 600;
    const H = 180;
    const vs = pts.map(D.value);
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    const span = hi - lo || 1;
    const x = (i) => 10 + (i / (pts.length - 1)) * (W - 20);
    const y = (v) => 10 + (1 - (v - lo) / span) * (H - 20);
    const line = vs.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const a5 = [];
    for (let i = 4; i < pts.length; i++) { const a = D.avgOf(pts.slice(0, i + 1), 5); if (Number.isFinite(a)) a5.push(`${x(i).toFixed(1)},${y(a).toFixed(1)}`); }
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tus últimos ${pts.length} tiempos, de ${D.fmt(lo)} a ${D.fmt(hi)}"><polyline points="${line}" fill="none" stroke="var(--muted)" stroke-width="1.5" opacity=".7"/>${a5.length > 1 ? `<polyline points="${a5.join(' ')}" fill="none" stroke="var(--fr-a5)" stroke-width="2.5"/>` : ''}</svg>`
      + `<p class="fr-chart-legend"><span><i class="ev-key" style="background:var(--muted)"></i>Cada tiempo</span><span><i class="ev-key" style="background:var(--fr-a5)"></i>Media de 5</span><span>Mejor ${D.fmt(lo)} · peor ${D.fmt(hi)}</span></p>`;
  }
  function renderProgress() {
    $('goals').innerHTML = goalsHtml();
    $('progStats').innerHTML = times.length ? statCells(times) : '';
    $('chart').innerHTML = chartSvg(times);
    const rs = D.rounds(times).filter((r) => r.done).reverse();
    $('rounds').innerHTML = rs.length ? `<div class="fr-table" tabindex="0" role="region" aria-label="Tus rondas de 5"><table><thead><tr><th scope="col">Cuándo</th><th scope="col">Media</th><th scope="col">Tiempos</th></tr></thead><tbody>${
      rs.slice(0, 30).map((r) => `<tr><td class="muted">${new Date(r.at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</td><td><b>${D.fmt(r.avg)}</b></td><td class="muted">${D.fmtAvg5(r.times)}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="empty-note">Aún no has hecho ninguna ronda de 5. En el cronómetro, elige «Ronda de 5»: es como se compite.</p>';
    const stats = D.train(EV);
    const sets = (T.train || []).filter((id) => setOf(id)).map((id) => { const s = setOf(id); const n = s.cases.filter((c) => ((stats[c.id] || {}).streak || 0) >= DONE).length; return `${esc(s.name)}: ${n} de ${s.cases.length}`; });
    const prac = D.practiceDays(D.PRACTICE[EV]);
    const total = Object.values(prac).reduce((a, b) => a + b, 0);
    const wk = D.mondayOf(Date.now());
    const week = Object.entries(prac).filter(([k]) => new Date(`${k}T12:00:00`).getTime() >= wk).reduce((a, [, v]) => a + v, 0);
    const hm = (ms) => (ms >= 3600000 ? `${Math.floor(ms / 3600000)} h ${Math.round((ms % 3600000) / 60000)} min` : `${Math.round(ms / 60000)} min`);
    $('learnSum').innerHTML = `<ul class="ev-learn-list"><li>Pasos del método: <b>${knownSteps()} de ${T.steps.length}</b>${D.solo(EV) ? ' · ya lo resuelves sin mirar' : ''}</li>${sets.length ? `<li>Casos dominados: ${sets.join(' · ')}</li>` : ''}<li>Tiempo practicando aquí: <b>${hm(week)}</b> esta semana · ${hm(total)} en total</li></ul>`;
  }
  onView('progreso', renderProgress);

  // ================= The plan in the header =================
  function renderPhase() {
    const s = D.status(EV);
    const g = s.goals.find((x) => !x.done);
    $('evPhase').innerHTML = `<span class="ev-phase-n">${esc(INFO.phase)}</span><span>${g ? `Meta: ${esc(g.text)}` : 'Metas cumplidas'}</span>`;
  }

  // ================= Ajustes =================
  function renderSettings() {
    const s = D.settings();
    $('setInspect').checked = s.inspect;
    $('setVoice').checked = s.voice;
    $('setSound').checked = s.sound;
    const th = (() => { try { return localStorage.getItem(D.K.theme) || 'auto'; } catch (e) { return 'auto'; } })();
    document.querySelectorAll('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === th)));
  }
  $('setInspect').addEventListener('change', (e) => { D.setSettings({ inspect: e.target.checked }); $('optInspect').checked = e.target.checked; renderClock(); });
  $('setVoice').addEventListener('change', (e) => { D.setSettings({ voice: e.target.checked }); });
  $('setSound').addEventListener('change', (e) => { D.setSettings({ sound: e.target.checked }); if (e.target.checked) unlock(); });
  $('voiceTry').addEventListener('click', () => { unlock(); call('eight'); setTimeout(() => call('twelve'), 1300); });
  document.querySelectorAll('[data-theme-set]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.themeSet;
    try { if (v === 'auto') localStorage.removeItem(D.K.theme); else localStorage.setItem(D.K.theme, v); } catch (e) { /* this visit */ }
    if (v === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', v);
    renderSettings();
  }));
  $('exportData').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ event: EV, times, known: D.known(EV), train: D.train(EV), solo: D.solo(EV) }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${INFO.href}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('clearTimes').addEventListener('click', (ev) => {
    const b = ev.currentTarget;
    if (!times.length) { toast('No hay tiempos que borrar'); return; }
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = `¿Borrar ${times.length} tiempos? Pulsa otra vez`; setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Borrar tiempos'; }, 4000); return; }
    b.dataset.armed = '';
    b.textContent = 'Borrar tiempos';
    const gone = D.load(D.K.deleted, []);
    times.forEach((r) => gone.push(`${EV}:${r.at}`));
    D.save(D.K.deleted, gone.slice(-3000));
    times = [];
    D.setTimes(EV, times);
    round = null;
    D.save(K.round, null);
    timer.last = null;
    renderStats();
    toast('Tiempos borrados');
    D.changed();
  });

  // ================= Sync, install and new versions =================
  const sync = window.EvSync({
    $, toast,
    onChanged: () => {
      times = D.times(EV);
      renderStats();
      renderPath();
      renderPhase();
      if (view === 'progreso') renderProgress();
      if (view === 'entrenar') renderTrain();
    },
  });
  onView('ajustes', () => { renderSettings(); sync.renderSync(); });
  let installEvt = null;
  const installBtns = [...document.querySelectorAll('.install')];
  window.addEventListener('beforeinstallprompt', (ev) => { ev.preventDefault(); installEvt = ev; installBtns.forEach((b) => { b.hidden = false; }); });
  installBtns.forEach((b) => b.addEventListener('click', async () => {
    if (!installEvt) return;
    installEvt.prompt();
    try { await installEvt.userChoice; } catch (e) { /* dismissed */ }
    installEvt = null;
    installBtns.forEach((x) => { x.hidden = true; });
  }));
  function offerUpdate() {
    const show = () => { $('updateBar').hidden = false; };
    if (!['run', 'inspect', 'ihold', 'iready'].includes(timer.phase)) { show(); return; }
    const wait = () => { if (!['run', 'inspect', 'ihold', 'iready'].includes(timer.phase)) { document.removeEventListener('ev:timer', wait); show(); } };
    document.addEventListener('ev:timer', wait);
  }
  function watchUpdates(reg) {
    const meta = document.querySelector('meta[name=op3-build]');
    const mine = meta && /^[0-9a-f]{10}$/.test(meta.content) ? `op3bld-${meta.content}` : null;
    if (!mine || !window.caches) return;
    let offered = false;
    const compare = () => {
      if (offered) return;
      caches.keys().then((keys) => {
        const lives = keys.filter((k) => k.startsWith('op3bld-'));
        if (lives.length && !lives.includes(mine)) { offered = true; offerUpdate(); }
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

  window.EvPage = {
    EV, T, PZ, D, showView, caseState, openTry, newScramble, voiceLog,
    state: () => ({ phase: timer.phase, times, scramble, mode, round, view, train: tr.id }),
    setInspectStart: (ms) => { timer.i0 = now() - ms; },
  };

  // ================= Start =================
  renderLearn();
  renderPhase();
  renderMode();
  renderStats();
  renderClock();
  const first = location.hash.slice(1);
  if (/^paso-/.test(first)) { showView('aprender'); setTimeout(() => { const el = $(first); if (el) el.scrollIntoView(); }, 50); } else showView(VIEWS.includes(first) ? first : D.load(K.view, 'aprender'));
  if (scramble) renderScramble(); else setTimeout(newScramble, 30);
  if ('serviceWorker' in navigator && document.querySelector('link[rel=manifest]')) navigator.serviceWorker.register('sw.js').then(watchUpdates).catch(() => {});
})();
