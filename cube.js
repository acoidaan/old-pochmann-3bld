// Smart cube on the 3BLD page (the connection is smartcube.js's). Follows the scramble move by move, ends the
// memo on the first turn, stops the clock when the cube is solved and, after a DNF, works out where the solve
// went wrong. A virtual cube (?cubo=virtual) behaves the same way, for trying it without one.
(() => {
  'use strict';
  const O = window.OP3;
  if (!O || !document.getElementById('cubeBar') || !window.SmartCube || !window.CubeFollow) return;
  const $ = (id) => document.getElementById(id);
  const { apply, parseAlg, invertAlg, solved, isSolved, faceOfSticker, MODES, ALGS, esc } = O;

  const CHECK_MS = 700;   // after a manual stop, wait this long for the last turn to arrive
  const QUIET_MS = 3000;  // after the cube stops the clock, presses are ignored this long
  const key = (st) => st.join(',');

  // ================= Cube frame (cubemodel.js, follow.js) =================
  const { norm, fromFacelets, toFacelets, CUBIES } = window.CubeModel;
  const CF = window.CubeFollow;
  const { facePath, partialKeys, opposite, simplify, moveText } = CF;
  const FACE_MOVES = ['U', 'R', 'F', 'D', 'L', 'B'].flatMap((f) => [f, `${f}2`, `${f}'`]);

  // ================= Connection (smartcube.js) =================
  // The bar, the MAC address, the virtual cube and the turns are smartcube.js's, as on the other pages.
  const sc = window.SmartCube.start({
    info: 'Conecta un GAN por Bluetooth: sigue el scramble, para el crono solo y te dice dónde fallaste.',
    onStatus: (s) => {
      if (s !== 'on' && attempt) { attempt = null; setAsk(null); }
      render();
    },
    onMove: (mv, st) => onMove(mv, st),
    onState: (st) => onState(st),
    // Stopped by hand: the reading asked for then says whether it is solved.
    onFacelets: (st) => { if (attempt && attempt.checking) finishCheck(isSolved(st)); },
  });
  const cube = {
    get state() { return sc.state; },
    get status() { return sc.status; },
    get link() { return sc.link; },
    get kind() { return sc.kind; },
  };
  const { say, request } = sc;
  // The state changed, not by a turn: the first reading, «Está resuelto», or a turn the cube had lost.
  function onState(st) {
    handMoves = isSolved(st) ? [] : null;
    if (attempt && attempt.running) {
      // Before the first turn this is just the real starting state; later, the cube had lost track.
      if (!attempt.moves.length) { attempt.start = st; attempt.states = [st]; liveStart(attempt, st); } else { attempt.gap = true; attempt.states.push(st); }
    }
    if (!locate()) { follow.lost = true; follow.off = []; }
    render();
  }

  // ================= The scramble, move by move =================
  // Every turn since the cube was last solved (null when unknown), for «Leer el cubo».
  let handMoves = null;
  let follow = { ...CF.makeFollow(solved(), []), scr: null, lost: true };
  function setScramble(scr) {
    if (scr === follow.scr) return;
    let mv = [];
    try { mv = parseAlg(scr).map((m) => m.text); } catch (e) { mv = []; }
    follow = { ...CF.makeFollow(solved(), mv), scr, lost: true };
    locate();
  }
  const locate = () => !!cube.state && CF.locate(follow, cube.state);
  const followMove = (mv) => { if (cube.state) CF.followMove(follow, cube.state, mv); };
  const undoText = () => CF.undoText(follow);
  function followView() {
    const n = follow.moves.length;
    if (!cube.state || !n) return null;
    const chips = follow.moves.map((m, k) => {
      let cls = 'sm';
      if (!follow.lost) {
        if (k < follow.pos) cls += ' done';
        else if (k === follow.pos && !follow.off.length) cls += follow.halfway ? ' next half' : ' next';
      }
      return `<span class="${cls}">${esc(m)}</span>`;
    }).join(' ');
    let hint;
    let tone = '';
    if (follow.lost) {
      hint = follow.off.length > 6
        ? 'Te has perdido. Resuelve el cubo para volver a empezar el scramble.'
        : 'El cubo no está resuelto: resuélvelo para mezclarlo con este scramble. Si ya lo está, pulsa «Está resuelto».';
      tone = 'bad';
    } else if (follow.off.length) {
      hint = `Ese giro no toca. Deshaz: <b>${undoText()}</b>`;
      tone = 'bad';
    } else if (follow.pos >= n) {
      hint = '✓ Cubo mezclado. Ya puedes empezar el memo.';
      tone = 'ok';
    } else if (follow.halfway) {
      hint = `Te falta la otra mitad del <b>${esc(follow.moves[follow.pos])}</b>.`;
    } else {
      hint = `${follow.pos ? 'Siguiente' : 'Primer giro'}: <b>${esc(follow.moves[follow.pos])}</b>`;
    }
    return { chips, hint, tone };
  }
  O.scrHtml = () => {
    if (cube.status !== 'on') return null;
    const v = followView();
    return v ? `<span class="cube-chips">${v.chips}</span><span class="cube-hint ${v.tone}">${v.hint}</span>` : null;
  };

  // ================= Attempts =================
  let attempt = null;
  let last = null;   // the last finished attempt, for the report
  function onMove(mv, st) {
    if (isSolved(st)) handMoves = [];
    else if (handMoves) handMoves.push(mv);
    const ph = O.clock.phase();
    if (attempt && attempt.running && (ph === 'memo' || ph === 'exec')) {
      if (ph === 'memo') O.clock.press();   // the first turn ends the memo
      record(mv);
      if (isSolved(cube.state)) {
        attempt.auto = true;
        attempt.running = false;
        celebrate();
        O.clock.press();
        O.clock.mark(true);
        // Blindfolded, you will still hit the timer to stop it: that press must not start a new attempt.
        O.clock.quiet(QUIET_MS);
      }
    } else if (attempt && attempt.checking) {
      // Stopped by hand a moment before the last turn arrived.
      record(mv);
      if (isSolved(cube.state)) finishCheck(true);
    } else if (ph === 'idle') {
      followMove(mv);
    }
    // The trainer and the guided execution follow the cube whatever the clock is doing
    // (a timed solve following the guide, for instance).
    if (trActive()) trMove(mv);
    if (guideActive()) guideMove(mv);
    if (practiceActive()) practiceMove(mv);
    render();
  }
  function record(mv) {
    attempt.moves.push(mv);
    attempt.states.push(cube.state);
    liveMove(attempt, mv, cube.state);
  }
  document.addEventListener('op3:timer', (ev) => {
    const d = ev.detail || {};
    if (d.phase === 'memo') unlockAudio();
    if (d.phase === 'memo' && !attempt && cube.status === 'on' && cube.state) {
      const scrState = (() => { try { return norm(apply(solved(), d.scramble || '')); } catch (e) { return null; } })();
      attempt = { running: true, scramble: d.scramble || '', scrState, start: cube.state, states: [cube.state], moves: [], gap: false };
      liveStart(attempt, cube.state);
      $('cubeReport').innerHTML = '';
      $('cubeReport').className = 'result cube-report';
      request('REQUEST_FACELETS');   // make sure the starting state is the real one
    } else if (d.phase === 'idle' && d.cancelled) {
      attempt = null;
      setAsk(null);
    }
    // The scramble follower slept during the attempt: find where the cube is now.
    if (d.phase === 'idle' && cube.state && !locate()) { follow.lost = true; follow.off = []; } else if (d.phase === 'done' && attempt && attempt.running) {
      attempt.running = false;
      if (attempt.moves.length && cube.status === 'on') startCheck();
    }
    render();
  });
  function startCheck() {
    attempt.checking = true;
    setAsk('Comprobando el cubo…');
    request('REQUEST_FACELETS');
    clearTimeout(attempt.timer);
    attempt.timer = setTimeout(() => finishCheck(cube.state && isSolved(cube.state)), CHECK_MS);
  }
  function finishCheck(ok) {
    if (!attempt || !attempt.checking) return;
    clearTimeout(attempt.timer);
    attempt.checking = false;
    if (O.clock.phase() !== 'done') return;   // already marked by hand
    if (ok) { attempt.auto = true; celebrate(); O.clock.mark(true); return; }
    setAsk('El cubo no está resuelto. ¿Es DNF?');
    try { $('markDnf').focus(); } catch (e) { /* hidden */ }
    attempt.cubeSaysDnf = true;
    showReport(attempt, null);
  }
  // ================= Sound and vibration when the cube confirms it is solved =================
  const FX_KEY = 'op3bld:cube-fx:v1';
  const fx = (() => {
    try { return { sound: true, vibrate: true, ...JSON.parse(localStorage.getItem(FX_KEY)) }; } catch (e) { return { sound: true, vibrate: true }; }
  })();
  // Desktop Chrome has vibrate() too, but nothing to shake: only offer it on touch screens.
  const canVibrate = typeof navigator.vibrate === 'function' && !!window.matchMedia && matchMedia('(pointer: coarse)').matches;
  // The sound is smartcube.js's (synthesised, works offline); here, only whether it plays.
  function unlockAudio() { if (fx.sound) window.SmartCube.unlockAudio(); }
  function chime() { if (fx.sound) window.SmartCube.chime(); }
  function buzz() {
    if (!fx.vibrate || !canVibrate) return;
    try { navigator.vibrate([80, 60, 180]); fxLog.push('vibrate'); } catch (e) { /* no vibration */ }
  }
  const fxLog = sc.fxLog;   // what was played, for tests
  // Once per solve, even if the clock and the guide both see it.
  let cheeredAt = -1e9;
  function celebrate() {
    const now = performance.now();
    if (now - cheeredAt < 1500) return;
    cheeredAt = now;
    chime();
    buzz();
  }
  function renderFx() {
    $('fxSound').setAttribute('aria-pressed', String(fx.sound));
    $('fxVibrate').setAttribute('aria-pressed', String(fx.vibrate));
    $('fxVibrate').hidden = !canVibrate;
    $('fxNote').textContent = canVibrate
      ? 'Suenan tres notas y el móvil vibra en cuanto el cubo queda resuelto.'
      : 'Suenan tres notas en cuanto el cubo queda resuelto. Este navegador no puede vibrar (en iPhone ninguno puede); y en iPhone, con el modo silencio puesto, tampoco suena.';
  }
  const saveFx = () => { try { localStorage.setItem(FX_KEY, JSON.stringify(fx)); } catch (e) { /* this visit only */ } };
  $('fxSound').addEventListener('click', () => { fx.sound = !fx.sound; saveFx(); renderFx(); });
  $('fxVibrate').addEventListener('click', () => { fx.vibrate = !fx.vibrate; saveFx(); renderFx(); });
  $('fxTry').addEventListener('click', () => { unlockAudio(); celebrate(); });
  renderFx();

  function setAsk(text) { $('verdictAsk').textContent = text || '¿Lo has resuelto?'; }
  O.resultExtra = () => (attempt && attempt.moves.length ? { cube: { moves: attempt.moves.length } } : {});
  document.addEventListener('op3:result', (ev) => {
    setAsk(null);
    if (!attempt) return;
    last = attempt;
    attempt = null;
    last.ok = !!(ev.detail && ev.detail.ok);
    last.exec = ev.detail ? ev.detail.exec : 0;
    last.at = ev.detail ? ev.detail.at : Date.now();
    const r = showReport(last, last.ok);
    // A DNF whose failing letter is clear: that letter comes up more in «Entrenar».
    if (!last.ok && r && r.fail && !last.fed) {
      last.fed = r.fail;
      O.trainer.flag(r.fail.kind, r.fail.L);
      showReport(last, last.ok);
    }
    if (last.auto && last.ok) $('clockPhase').textContent = 'Resuelto · lo ha comprobado el cubo';
  });

  // ================= Where it went wrong =================
  const CANDS = [
    ...O.trainLetters('edge').map((L) => ({ kind: 'edge', L })),
    { kind: 'parity' },
    ...O.trainLetters('corner').map((L) => ({ kind: 'corner', L })),
  ];
  const same = (a, b) => !!a && !!b && a.kind === b.kind && a.L === b.L;
  const nounOf = (t) => (t.kind === 'edge' ? 'aristas' : 'esquinas');
  // The memo typed in «Practicar», when it belongs to this scramble: it solves it, or it was typed after the
  // scramble was set (a memo left over from another scramble would only confuse).
  let memoAt = 0;
  let scrAt = 0;
  let scrSeen = O.scramble();
  ['memoE', 'memoC'].forEach((id) => $(id).addEventListener('input', () => { memoAt = performance.now(); }));
  document.addEventListener('op3:scramble', (ev) => {
    if (ev.detail !== scrSeen) { scrSeen = ev.detail; scrAt = performance.now(); }
  });
  function typedMemo(a) {
    if (O.scramble() !== a.scramble) return null;
    const e = O.lettersOf($('memoE').value);
    const c = O.lettersOf($('memoC').value);
    if (!e.length && !c.length) return null;
    const bad = (kind, L) => !(L in MODES[kind].posOf) || MODES[kind].buffer.includes(L);
    if (e.some((L) => bad('edge', L)) || c.some((L) => bad('corner', L))) return null;
    if (!(memoAt > scrAt) && !(a.scrState && !O.traceMemo(a.scrState, e, c))) return null;
    const toks = e.map((L) => ({ kind: 'edge', L }));
    if (e.length % 2) toks.push({ kind: 'parity' });
    c.forEach((L) => toks.push({ kind: 'corner', L }));
    return { e, c, toks, text: `${O.pairs(e)} · ${O.pairs(c)}` };
  }
  // Rebuilds the letters done from the states the cube went through: after each letter (setup, algorithm,
  // undo) the cube must be exactly where shooting that letter leaves it.
  function retrace(a) {
    const at = new Map();
    a.states.forEach((s, i) => { const k = key(s); if (!at.has(k)) at.set(k, []); at.get(k).push(i); });
    const after = (st, j) => { const l = at.get(key(st)); if (!l) return -1; for (const i of l) if (i > j) return i; return -1; };
    const done = [];
    let j = 0;
    let cur = a.states[0];
    for (let guard = 0; guard < 80; guard++) {
      let best = null;
      for (const t of CANDS) {
        const s = apply(cur, O.tokenAlg(t));
        const i = after(s, j);
        if (i >= 0 && (!best || i < best.i)) best = { t, i, s };
      }
      if (!best) break;
      done.push({ ...best.t, at: best.i, before: cur, from: j });
      j = best.i;
      cur = best.s;
    }
    return { done, cur, j, after };
  }
  // How far into one letter the solve got: setup, algorithm, undoing the setup.
  function stageOf(t, cur, j, after) {
    const parity = t.kind === 'parity';
    const mode = parity ? null : MODES[t.kind];
    const setup = parity ? '' : mode.table[t.L] || '';
    const algKey = parity ? 'P' : mode.alg;
    const set = apply(cur, setup);
    const k1 = setup ? after(norm(set), j) : j;
    const k2 = k1 >= 0 ? after(norm(apply(set, ALGS[algKey].moves)), k1) : -1;
    return { setup, undo: setup ? invertAlg(setup) : '', alg: ALGS[algKey].name, stage: k1 < 0 ? 'setup' : k2 < 0 ? 'alg' : 'undo' };
  }
  function nth(toks, i) {
    const t = toks[i];
    if (t.kind === 'parity') return 'la paridad';
    const n = toks.slice(0, i + 1).filter((x) => x.kind === t.kind).length;
    return `la ${n}.ª letra de ${nounOf(t)} (<b>${t.L}</b>)`;
  }
  function stageText(where, s, t) {
    if (t.kind === 'parity') return `Fallo en la paridad: el ${s.alg} no salió bien.`;
    const code = (x) => `<code>${esc(x)}</code>`;
    if (s.stage === 'setup') return `Fallo en ${where}: el setup ${code(s.setup)} no dejó el cubo como debía.`;
    if (s.stage === 'alg') {
      return s.setup
        ? `Fallo en ${where}: el setup ${code(s.setup)} estaba bien, pero el ${s.alg} no salió bien.`
        : `Fallo en ${where}: el ${s.alg} no salió bien.`;
    }
    return `Fallo en ${where}: el setup y el ${s.alg} estaban bien, pero al deshacer el setup (${code(s.undo)}) algo falló.`;
  }
  // ---- Live, during the attempt: the turns and each letter as soon as it is complete ----
  const CAND_ALGS = CANDS.map((t) => ({ t, alg: O.tokenAlg(t) }));
  function liveCands(st) {
    const m = new Map();
    for (const { t, alg } of CAND_ALGS) {
      const k = key(apply(st, alg));
      if (!m.has(k)) m.set(k, t);
    }
    return m;
  }
  function liveStart(a, st) { a.live = { done: [], cands: liveCands(st) }; }
  function liveMove(a, mv, st) {
    const L = a.live;
    if (!L) return;
    const t = L.cands.get(key(st));
    if (t) {
      L.done.push(t);
      L.cands = liveCands(st);
    }
  }
  function lettersLine(done) {
    const e = done.filter((t) => t.kind === 'edge').map((t) => t.L);
    const c = done.filter((t) => t.kind === 'corner').map((t) => t.L);
    const parts = [];
    if (e.length) parts.push(O.pairs(e));
    if (done.some((t) => t.kind === 'parity')) parts.push('paridad');
    if (c.length) parts.push(O.pairs(c));
    return parts.join(' · ');
  }
  const LIVE_MOVES = 14;
  function liveHtml(a) {
    if (!a || !a.live || !a.moves.length) return '';
    // Quarter turns of the same face read better together (R R → R2).
    const shown = simplify(a.moves.slice(-3 * LIVE_MOVES)).map(moveText).slice(-LIVE_MOVES);
    const moves = shown.map((m, i) => (i === shown.length - 1 ? `<b class="new">${m}</b>` : `<span>${m}</span>`)).join(' ');
    const letters = lettersLine(a.live.done);
    return `<p class="live-letters">${letters || '&nbsp;'}</p>`
      + `<p class="live-moves"><span class="live-n">${a.moves.length} giros</span>${moves}</p>`;
  }
  function doneText(done) {
    const e = done.filter((t) => t.kind === 'edge').map((t) => t.L);
    const c = done.filter((t) => t.kind === 'corner').map((t) => t.L);
    const parts = [];
    if (e.length) parts.push(`aristas <b>${O.pairs(e)}</b>`);
    if (done.some((t) => t.kind === 'parity')) parts.push('paridad');
    if (c.length) parts.push(`esquinas <b>${O.pairs(c)}</b>`);
    return parts.join(' · ');
  }
  function wrongPieces(st) {
    const e = []; const c = [];
    for (const g of CUBIES) {
      if (g.every((p) => st[p] === p)) continue;
      (g.length === 2 ? e : c).push(O.pieceName(g[0]));
    }
    const list = (arr, one, many) => (arr.length ? `${arr.length} ${arr.length === 1 ? one : many} (${arr.join(', ')})` : '');
    return [list(e, 'arista', 'aristas'), list(c, 'esquina', 'esquinas')].filter(Boolean).join(' y ');
  }
  function analyze(a) {
    const end = a.states[a.states.length - 1];
    const ok = isSolved(end);
    const r = retrace(a);
    const memo = typedMemo(a);
    const lines = [];
    let main = '';
    let fail = null;   // the letter that went wrong in the execution, when it is clear
    if (ok) {
      main = 'Resuelto, y lo ha comprobado el cubo.';
    } else if (memo) {
      const toks = memo.toks;
      let i = 0;
      while (i < r.done.length && i < toks.length && same(r.done[i], toks[i])) i++;
      if (i < r.done.length && i < toks.length) {
        const did = r.done[i];
        main = `Fallo en ${nth(toks, i)}: tu memo dice <b>${toks[i].L || 'paridad'}</b>, pero hiciste la <b>${did.L || 'paridad'}</b> (la ejecutaste bien, pero no tocaba).`;
      } else if (i >= toks.length) {
        const err = O.traceMemo(a.start, memo.e, memo.c);
        main = `Ejecutaste bien todo tu memo, pero el memo no resolvía el cubo.${err ? ` ${O.errorText(err)}` : ''}`;
      } else {
        // Every letter before this one went as the memo says: the cube is where the last one left it.
        const t = toks[i];
        const s = stageOf(t, r.cur, r.j, r.after);
        main = stageText(nth(toks, i), s, t);
        if (t.kind !== 'parity') fail = { kind: t.kind, L: t.L };
      }
      lines.push(`Comparado con tu memo de «Practicar»: <b>${esc(memo.text)}</b>.`);
    } else {
      // No memo: the cube itself says what came next, when the buffer holds another piece.
      const cur = r.cur;
      let next = null;
      let cycleBreak = null;   // the buffer held its own piece: any letter could have come next
      for (const kind of ['edge', 'corner']) {
        const mode = MODES[kind];
        const id = cur[mode.posOf[mode.read]];
        const pending = CUBIES.some((g) => g.length === (kind === 'edge' ? 2 : 3) && !g.every((p) => cur[p] === p));
        if (!pending) continue;
        if (!mode.buffer.some((b) => mode.posOf[b] === id)) next = { kind, L: mode.letterOf[id] };
        else cycleBreak = kind;
        break;
      }
      const n = r.done.length;
      if (!n) main = 'El fallo está ya en la primera letra.';
      else main = `${n === 1 ? 'La primera letra salió bien' : `Las ${n} primeras letras salieron bien`}; el fallo vino después.`;
      if (next) {
        const toks = [...r.done, next];
        const s = stageOf(next, cur, r.j, r.after);
        main += ` ${stageText(nth(toks, toks.length - 1), s, next)}`;
        fail = { kind: next.kind, L: next.L };
      } else if (cycleBreak) {
        main += ` Ahí tocaba un cambio de ciclo de ${cycleBreak === 'edge' ? 'aristas' : 'esquinas'}, así que el cubo no puede saber a qué letra ibas.`;
      }
      lines.push('Si escribes en «Practicar» el memo que hiciste y vuelves aquí, te digo también si el error estaba en el memo o en la ejecución.');
    }
    if (r.done.length) lines.unshift(`Lo que hiciste: ${doneText(r.done)}.`);
    if (!ok) {
      const w = wrongPieces(end);
      if (w) lines.push(`Al parar quedaban mal ${w}.`);
    }
    if (a.scrState && key(a.start) !== key(a.scrState)) lines.push('Ojo: al empezar, el cubo no tenía el scramble de la app.');
    if (a.gap) lines.push('El cubo perdió algún giro por el camino, así que el análisis puede no ser exacto.');
    return { ok, main, lines, fail };
  }
  function showReport(a, savedOk) {
    const box = $('cubeReport');
    const r = analyze(a);
    const moves = a.moves.length;
    const secs = (a.exec || 0) / 1000;
    const pace = moves && secs > 0 ? ` · ${(moves / secs).toLocaleString('es-ES', { maximumFractionDigits: 1 })} por segundo` : '';
    const head = r.ok ? r.main : `<b>DNF.</b> ${r.main}`;
    if (r.ok) a.why = '';
    else { const d = document.createElement('div'); d.innerHTML = r.main; a.why = d.textContent; }   // plain text for the stream overlay
    box.className = `result cube-report ${r.ok ? 'ok' : 'ko'}`;
    box.innerHTML = `<p>${head}</p>`
      + `<p class=sub>${moves} giros en la ejecución${savedOk == null ? '' : pace}.</p>`
      + r.lines.map((l) => `<p class=sub>${l}</p>`).join('')
      + (savedOk === true && !r.ok ? '<p class=sub>Lo has guardado como resuelto, pero el cubo dice que no lo estaba.</p>' : '')
      + (a.fed ? `<p class=sub>La <b>${a.fed.L}</b> (${a.fed.kind === 'edge' ? 'arista' : 'esquina'}) te saldrá más a menudo en «Entrenar».</p>` : '');
    return r;
  }
  // Typed the memo afterwards: look again when coming back.
  O.onView('crono', () => { if (last && !last.ok && !attempt) showReport(last, last.ok); });

  // ================= Following a known sequence of turns =================
  // From a starting state: the states after each turn of a sequence (and part way through half turns, slices,
  // wide turns and two turns on opposite faces, as follow.js). The setup trainer and the guided execution
  // follow the cube along one of these.
  function makePath(start, algs) {
    const at = new Map();
    const half = new Map();
    const add = (m, k, p) => { if (!m.has(k)) m.set(k, []); m.get(k).push(p); };
    let s = start;
    let p = 0;
    add(at, key(norm(s)), 0);
    const segEnd = [];
    const moves = [];
    const spat = [s];   // as held in the hands, wide turns included
    let prev = null;   // the state before the turn before, in the core's frame
    algs.forEach((alg) => {
      for (const m of parseAlg(alg)) {
        const before = norm(s);
        s = apply(s, m.text);
        const after = norm(s);
        partialKeys(before, after).forEach((k) => add(half, k, p));
        if (prev && opposite(moves[p - 1], m.text)) partialKeys(prev, after).forEach((k) => add(half, k, p - 1));
        p++;
        moves.push(m.text);
        spat.push(s);
        add(at, key(after), p);
        prev = before;
      }
      segEnd.push(p);
    });
    return { at, half, segEnd, moves, spat, total: p, end: key(norm(s)), pos: 0, halfway: false, off: [], lost: false };
  }
  // Where the cube is on the path. A path can pass the same state twice (a turn and its inverse back to
  // back, like the end of one letter and the start of the next): take the furthest of the spots near
  // where it was, as both mean the same cube. A path with «near» set keeps to the closest spot instead
  // (ties still go forward), so the screen doesn't run ahead into the next letter mid-undo.
  function pathLocate(P, st) {
    const k = key(st);
    const pick = (list) => {
      const d = Math.min(...list.map((x) => Math.abs(x - P.pos)));
      return Math.max(...list.filter((x) => Math.abs(x - P.pos) <= d + (P.near ? 0 : 2)));
    };
    if (P.at.has(k)) { P.pos = pick(P.at.get(k)); P.halfway = false; }
    else if (P.half.has(k)) { P.pos = pick(P.half.get(k)); P.halfway = true; }
    else return false;
    P.off = [];
    P.lost = false;
    return true;
  }
  function pathMove(P, mv, st) {
    if (pathLocate(P, st) || P.lost) return;
    P.off = simplify([...P.off.map(moveText), mv]);
    if (P.off.length > 8) P.lost = true;
  }
  // The turns to undo, named as the cube is held at that point: after a wide turn (l, d) the cube sits
  // rotated in the hands, so the face the core calls F may be the one on the bottom.
  function undoFor(P) {
    const sp = P.spat[Math.min(P.pos, P.spat.length - 1)];
    const here = norm(sp);
    return P.off.slice().reverse().map((m) => {
      const core = moveText({ base: m.base, turns: (4 - m.turns) % 4 });
      const want = key(apply(here, core));
      return FACE_MOVES.find((x) => key(norm(apply(sp, x))) === want) || core;
    }).join(' ');
  }
  const segOf = (P, pos) => { for (let i = 0; i < P.segEnd.length; i++) if (pos < P.segEnd[i]) return i; return P.segEnd.length; };
  const f1 = (x) => x.toFixed(1).replace('.', ',');

  // ================= Setup trainer on the cube =================
  // A letter is asked; you do setup, algorithm and undo on the real cube, from wherever it is. It is right
  // when the cube ends exactly where that letter leaves it; doing another letter cleanly is caught too.
  const TR_KEY = 'op3bld:train-cube:v1';
  let trUseCube = (() => { try { return localStorage.getItem(TR_KEY) !== 'type'; } catch (e) { return true; } })();
  const tr = { path: null, letter: null, kind: null, t0: 0, first: 0, clean: true, others: null, setup: '', algName: '', descSaved: null, descSet: null, descFor: null };
  const trActive = () => cube.status === 'on' && !!cube.state && trUseCube && O.currentView() === 'entrenar';
  function trStart() {
    const s = O.trainer.state();
    tr.path = null;
    if (!cube.state || !s.letter) return;
    const mode = MODES[s.kind];
    const setup = mode.table[s.letter] || '';
    tr.kind = s.kind; tr.letter = s.letter; tr.t0 = s.t0; tr.first = 0; tr.clean = true;
    tr.setup = setup; tr.algName = ALGS[mode.alg].name;
    tr.path = makePath(cube.state, setup ? [setup, ALGS[mode.alg].moves, invertAlg(setup)] : [ALGS[mode.alg].moves]);
    tr.others = new Map();
    O.trainLetters(s.kind).forEach((L) => { if (L !== s.letter) tr.others.set(key(apply(cube.state, O.tokenAlg({ kind: s.kind, L }))), L); });
  }
  function trMove(mv) {
    const P = tr.path;
    if (!P) return;
    if (!tr.first) tr.first = performance.now();
    pathMove(P, mv, cube.state);
    if (P.off.length || P.lost) tr.clean = false;
    const k = key(cube.state);
    if (k === P.end) trFinish(true);
    else if (tr.others.has(k)) trFinish(false, tr.others.get(k));
  }
  function trFinish(ok, other) {
    const now = performance.now();
    const secs = (now - tr.t0) / 1000;
    const think = tr.first ? (tr.first - tr.t0) / 1000 : secs;
    const exec = tr.first ? (now - tr.first) / 1000 : 0;
    const L = tr.letter;
    let html;
    if (ok && tr.clean) html = `✓ ${L} en ${f1(secs)} s (pensar ${f1(think)} · ejecutar ${f1(exec)}).`;
    else if (ok) html = `${L}: acabada, pero corrigiendo por el camino (${f1(secs)} s). Te saldrá más a menudo.`;
    else html = `✗ Has hecho la ${other}, no la ${L}. La ${L} es <code>${esc(tr.setup || 'sin setup')}</code>.`;
    if (O.trainer.state().phase === 'ask') O.trainer.cubeAnswer({ ok, clean: tr.clean }, secs, html);
    O.trainer.next(true);   // the next letter, from wherever the cube is now
  }
  function renderTrain() {
    const connected = cube.status === 'on' && !!cube.state;
    $('trHow').hidden = !connected;
    $('trHowType').setAttribute('aria-pressed', String(!trUseCube));
    $('trHowCube').setAttribute('aria-pressed', String(trUseCube));
    const on = trActive();
    const form = $('trForm');
    form.classList.toggle('cube', on);
    form.classList.toggle('ask', on && O.trainer.state().phase === 'ask');
    const line = $('trCubeLine');
    line.hidden = !on;
    // The card's text says how to answer: swap it while answering on the cube, put it back after.
    O.trainer.hint(on ? 'Haz cada letra en el cubo tal como esté, no hace falta que esté resuelto. Si te equivocas, deshaz o empieza la letra desde ahí.' : null);
    const desc = $('trDesc');
    if (!on) {
      if (tr.descSet != null && desc.innerHTML === tr.descSet) desc.innerHTML = tr.descSaved;
      tr.descSet = null;
      return;
    }
    if (tr.letter) {
      const want = `Hazla en el cubo: el setup que lleva ${tr.letter} a <b>${MODES[tr.kind].swap}</b>, la ${tr.algName} y deshacer el setup.`;
      if (desc.innerHTML !== tr.descSet || tr.descFor !== want) {
        if (desc.innerHTML !== tr.descSet) tr.descSaved = desc.innerHTML;
        desc.innerHTML = want;
        tr.descSet = desc.innerHTML;
        tr.descFor = want;
      }
    }
    const P = tr.path;
    if (!P) { line.innerHTML = ''; return; }
    const segs = tr.setup ? ['Setup', tr.algName, 'Deshacer'] : [tr.algName];
    const cur = segOf(P, P.pos);
    const chips = segs.map((name, i) => {
      const from = i ? P.segEnd[i - 1] : 0;
      const n = P.segEnd[i] - from;
      const cls = i < cur ? 'done' : i === cur && P.pos > from ? 'cur' : '';
      const count = i === cur && P.pos > from ? ` ${P.pos - from}/${n}` : '';
      return `<span class="tr-step ${cls}">${i < cur ? '✓ ' : ''}${name}${count}</span>`;
    }).join('');
    let hint = '';
    let tone = '';
    if (P.lost) { hint = 'Te has perdido. Empieza la letra desde como está el cubo ahora.'; tone = 'bad'; }
    else if (P.off.length) { hint = `Ese giro no toca. Deshaz: <b>${undoFor(P)}</b>`; tone = 'bad'; }
    else if (!P.pos) hint = 'Cuando quieras: el tiempo cuenta desde que sale la letra.';
    line.innerHTML = `<div class="tr-steps">${chips}</div>`
      + (hint ? `<p class="cube-hint ${tone}">${hint}</p>` : '')
      + (P.off.length || P.lost ? '<button class="btn" type="button" data-tr-restart>Empezar la letra desde aquí</button>' : '');
  }
  $('trCubeLine').addEventListener('click', (ev) => { if (ev.target.closest('[data-tr-restart]')) { tr.clean = false; const keep = tr.t0; trStart(); tr.t0 = keep; tr.clean = false; renderTrain(); } });
  function trSync() {
    if (trActive()) {
      const s = O.trainer.state();
      if (!tr.path || tr.letter !== s.letter || tr.t0 !== s.t0) trStart();
    } else tr.path = null;
    renderTrain();
  }
  document.addEventListener('op3:train', trSync);
  O.onView('entrenar', trSync);
  const setHow = (useCube) => {
    trUseCube = useCube;
    try { localStorage.setItem(TR_KEY, useCube ? 'cube' : 'type'); } catch (e) { /* this visit only */ }
    tr.path = null;
    trSync();
  };
  $('trHowType').addEventListener('click', () => setHow(false));
  $('trHowCube').addEventListener('click', () => setHow(true));

  // ================= Guided execution on the cube =================
  // With «Ejecución guiada» open, the steps move on by themselves as you turn the real cube, from the
  // scramble to solved; a wrong turn is caught at once.
  const gd = { path: null, cheered: false };
  const guideActive = () => cube.status === 'on' && !!cube.state && O.guideApi.open();
  function guideStart() {
    gd.path = null;
    gd.cheered = false;
    const start = O.guideApi.start();
    if (!guideActive() || !start) { renderGuideCube(); return; }
    const steps = O.guideApi.steps().filter((s) => !s.end);
    gd.path = makePath(start, steps.map((s) => (s.isAlg ? s.seq : s.move)));
    // Start the search from the step on screen, then go wherever the cube really is.
    const i = O.guideApi.index();
    gd.path.pos = i ? gd.path.segEnd[i - 1] || 0 : 0;
    // A solved cube is the end of the path too, but on opening it means «not scrambled yet».
    const fresh = isSolved(cube.state) && !isSolved(norm(start));
    if (fresh || !pathLocate(gd.path, cube.state)) gd.path.lost = true;
    guideShow();
  }
  function guideMove(mv) {
    if (!gd.path) return;
    pathMove(gd.path, mv, cube.state);
    guideShow();
  }
  function guideShow() {
    const P = gd.path;
    if (P && !P.lost && !P.off.length) {
      const step = segOf(P, P.pos);
      if (step !== O.guideApi.index()) O.guideApi.go(step);
      if (P.pos >= P.total && isSolved(cube.state) && !gd.cheered) { gd.cheered = true; celebrate(); }
    }
    renderGuideCube();
  }
  function renderGuideCube() {
    const el = $('guideCube');
    const P = gd.path;
    el.hidden = !guideActive();
    if (el.hidden) return;
    let html = '';
    let tone = '';
    if (!P || P.lost) {
      const v = followView();
      if (v && !follow.lost && follow.pos < follow.moves.length) {
        html = follow.off.length
          ? `Primero mezcla el cubo. Ese giro no toca, deshaz: <b>${undoText()}</b>`
          : `Primero mezcla el cubo con el scramble: giro ${follow.pos + 1} de ${follow.moves.length}, <b>${follow.moves[follow.pos]}</b>${follow.halfway ? ' (falta la otra mitad)' : ''}`;
        tone = follow.off.length ? 'bad' : '';
      } else {
        html = 'Tu cubo no está en ningún punto de esta resolución. Resuélvelo y mézclalo con el scramble de «Practicar».';
        tone = 'bad';
      }
    } else if (P.off.length) {
      html = `Ese giro no toca. Deshaz: <b>${undoFor(P)}</b>`;
      tone = 'bad';
    } else if (P.pos >= P.total) {
      html = isSolved(cube.state) ? '✓ Resuelto, y lo ha comprobado el cubo' : 'Has hecho todo el memo, pero el cubo no queda resuelto: el memo tiene algún error.';
      tone = isSolved(cube.state) ? 'ok' : 'bad';
    } else {
      // Inside a whole algorithm: how far, and the turns already done dimmed.
      const step = segOf(P, P.pos);
      const from = step ? P.segEnd[step - 1] : 0;
      const s = O.guideApi.steps()[step];
      if (s && s.isAlg) {
        const mv = parseAlg(s.seq);
        const done = P.pos - from;
        $('guideSeq').innerHTML = mv.map((m, k) => `<span class="sm${k < done ? ' done' : k === done ? ' next' : ''}">${m.text}</span>`).join(' ');
        html = `Siguiendo tu cubo · ${s.move}: ${done} de ${mv.length}`;
      } else html = 'Siguiendo tu cubo: haz el giro y pasa solo al siguiente';
    }
    el.className = `guide-cube ${tone}`;
    if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; }
  }
  document.addEventListener('op3:guide', (ev) => { if (ev.detail && ev.detail.open) guideStart(); else { gd.path = null; renderGuideCube(); } });

  // ================= «Practicar» following the cube =================
  // With the memo written in «Practicar», the letter and the step on screen follow the real cube: turn it
  // and the memo strip, the step chips and the drawing go along, with no clock involved.
  const pr = { path: null, segs: [], key: '', cheered: false };
  const practiceActive = () => cube.status === 'on' && !!cube.state && O.currentView() === 'practicar' && !O.guideApi.open();
  function practiceStart() {
    pr.path = null;
    pr.segs = [];
    pr.cheered = false;
    const toks = O.practice.tokens();
    const start = O.guideApi.start();
    if (!start || !toks.some((t) => !t.bad)) return;
    const algs = [];
    toks.forEach((t, i) => {
      if (t.bad) return;
      if (t.kind === 'parity') { algs.push(ALGS.P.moves); pr.segs.push({ i, step: 1, alg: ALGS.P }); return; }
      const mode = MODES[t.kind];
      const setup = parseAlg(mode.table[t.L] || '').map((m) => m.text);
      setup.forEach((m, k) => { algs.push(m); pr.segs.push({ i, step: k + 1 }); });
      algs.push(ALGS[mode.alg].moves);
      pr.segs.push({ i, step: setup.length + 1, alg: ALGS[mode.alg] });
      const undo = setup.length ? parseAlg(invertAlg(setup.join(' '))).map((m) => m.text) : [];
      undo.forEach((m, k) => { algs.push(m); pr.segs.push({ i, step: setup.length + 2 + k }); });
    });
    pr.path = makePath(start, algs);
    pr.path.near = true;
    // Like the guide: a solved cube means «not scrambled yet», not «already finished».
    const fresh = isSolved(cube.state) && !isSolved(norm(start));
    if (fresh || !pathLocate(pr.path, cube.state)) pr.path.lost = true;
    practiceShow();
  }
  // Where the strip and the steps should be for the spot the cube is at.
  function practiceSpot() {
    const P = pr.path;
    const s = segOf(P, P.pos);
    if (s >= pr.segs.length) { const last = pr.segs[pr.segs.length - 1]; return { i: last.i, step: last.step }; }
    const seg = pr.segs[s];
    const from = s ? P.segEnd[s - 1] : 0;
    return { i: seg.i, step: seg.step - 1, seg, done: P.pos - from, of: P.segEnd[s] - from };
  }
  function practiceMove(mv) {
    const P = pr.path;
    if (!P) return;
    // Solved and scrambling again: that's a new go, not a wrong turn.
    const wasDone = !P.lost && !P.off.length && P.pos >= P.total && isSolved(norm(P.spat[P.total]));
    pathMove(P, mv, cube.state);
    if (wasDone && P.off.length) { P.off = []; P.lost = true; pr.cheered = false; }
    practiceShow();
  }
  function practiceShow() {
    const P = pr.path;
    if (P && !P.lost && !P.off.length) {
      const spot = practiceSpot();
      const now = O.practice.at();
      if (now.i !== spot.i || now.step !== spot.step) O.practice.show(spot.i, spot.step);
      if (P.pos >= P.total && isSolved(cube.state) && !pr.cheered) { pr.cheered = true; celebrate(); }
    }
    renderPracticeCube();
  }
  function renderPracticeCube() {
    const el = $('practiceCube');
    const P = pr.path;
    el.hidden = !practiceActive() || !P;
    if (el.hidden) return;
    let html;
    let tone = '';
    if (P.lost) {
      if (!follow.lost && follow.pos < follow.moves.length) {
        html = follow.off.length
          ? `Primero mezcla el cubo. Ese giro no toca, deshaz: <b>${undoText()}</b>`
          : `Primero mezcla el cubo con el scramble: giro ${follow.pos + 1} de ${follow.moves.length}, <b>${follow.moves[follow.pos]}</b>`;
        tone = follow.off.length ? 'bad' : '';
      } else {
        html = 'Tu cubo no está en ningún punto de esta resolución: resuélvelo y mézclalo con el scramble de arriba.';
        tone = 'bad';
      }
    } else if (P.off.length) {
      html = `Ese giro no toca. Deshaz: <b>${undoFor(P)}</b>`;
      tone = 'bad';
    } else if (P.pos >= P.total) {
      html = isSolved(cube.state) ? '✓ Resuelto, y lo ha comprobado el cubo' : 'Has hecho todo el memo, pero el cubo no queda resuelto: el memo tiene algún error.';
      tone = isSolved(cube.state) ? 'ok' : 'bad';
    } else {
      const spot = practiceSpot();
      html = spot.seg && spot.seg.alg && spot.done
        ? `Siguiendo tu cubo · ${spot.seg.alg.name}: ${spot.done} de ${spot.of}`
        : 'Siguiendo tu cubo: haz el giro y pasa solo al siguiente';
    }
    el.className = `guide-cube practice-cube ${tone}`;
    if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; }
  }
  // Rebuilt when the scramble or the memo change, or on coming back to «Practicar».
  function practiceSync() {
    if (!practiceActive()) { pr.path = null; renderPracticeCube(); return; }
    const k = `${O.scramble()}|${O.practice.tokens().map((t) => t.L || 'P').join('')}`;
    if (!pr.path || pr.key !== k) { pr.key = k; practiceStart(); } else renderPracticeCube();
  }
  O.onView('practicar', () => { pr.key = ''; practiceSync(); });
  document.addEventListener('op3:memo', () => setTimeout(practiceSync, 0));
  // Closing the guide puts the strip back on its token: find the cube's spot again once it has.
  document.addEventListener('op3:guide', () => setTimeout(() => { pr.key = ''; practiceSync(); }, 0));

  // ================= For the stream overlay =================
  // The live cube, how far the scramble is, and the turns and letters of the attempt (or the last one).
  function overlayState() {
    const a = attempt || last;
    const on = cube.status === 'on' && !!cube.state;
    if (!on && !(a && a.live)) return null;
    const out = {};
    if (on) {
      out.name = cube.hw || cube.name;
      out.bat = cube.battery;
      out.net = ['U', 'L', 'F', 'R', 'B', 'D'].map((f) => {
        const base = 9 * O.FACE_ORDER.indexOf(f);
        return cube.state.slice(base, base + 9).map(faceOfSticker).join('');
      }).join('');
      out.scr = follow.moves.length
        ? { n: follow.moves.length, done: follow.pos, half: follow.halfway, undo: follow.off.length ? undoText() : '', lost: follow.lost }
        : null;
    }
    if (a && a.live && a.moves.length) {
      out.live = {
        cur: a === attempt, at: a.at || null, n: a.moves.length, letters: lettersLine(a.live.done),
        moves: simplify(a.moves.slice(-30)).map(moveText).slice(-10),
        checked: !!a.auto, why: a.why || '',
      };
    }
    return out;
  }

  // ================= Drawing =================
  const netCells = O.buildNet($('cubeNet'));
  function render() {
    const on = cube.status === 'on' && !!cube.state;
    const ph = O.clock.phase();
    $('cubeFollow').hidden = !on;
    $('cubeSimBox').hidden = !(on && cube.kind === 'sim');
    if (on) {
      O.paintCells(netCells, MODES.edge, cube.state, {});
      setScramble(O.scramble());
      const v = followView();
      const scr = $('cubeScr');
      if (ph !== 'idle') scr.innerHTML = liveHtml(attempt) || '<span class="cube-hint">Memorizando: el primer giro empieza la ejecución.</span>';
      else scr.innerHTML = v ? `<span class="cube-chips">${v.chips}</span><span class="cube-hint ${v.tone}">${v.hint}</span>` : '<span class="cube-hint">No hay scramble: pulsa «Nuevo scramble».</span>';
    }
    $('readCube').hidden = !on;
    $('cubeUseState').hidden = !(on && ph === 'idle' && follow.lost && !isSolved(cube.state));
    trSync();
    practiceSync();
    if (O.guideApi.open()) { if (on && !gd.path) guideStart(); else renderGuideCube(); }
    // Competition mode: the turns and letters at the bottom, kept after the attempt until the next one.
    $('focusMoves').innerHTML = liveHtml(attempt || last);
    O.refreshFocus();
    document.dispatchEvent(new CustomEvent('op3:cube'));
  }
  document.addEventListener('op3:scramble', () => { if (cube.status === 'on') render(); });

  // ================= Virtual cube =================
  // The memo for the virtual cube as it is now (the same method as the app's optimal memo).
  function simMemo(st) {
    const edges = O.generateFor('edge', st);
    const mid = edges.letters.length % 2 ? apply(edges.state, ALGS.P.moves) : edges.state;
    const corners = O.generateFor('corner', mid);
    const toks = edges.letters.map((L) => ({ kind: 'edge', L }));
    if (edges.letters.length % 2) toks.push({ kind: 'parity' });
    corners.letters.forEach((L) => toks.push({ kind: 'corner', L }));
    return toks;
  }
  // One letter done wrong: the algorithm loses its last move (setup and undo are fine).
  function flawed(t) {
    const parity = t.kind === 'parity';
    const setup = parity ? '' : MODES[t.kind].table[t.L] || '';
    const alg = parseAlg(ALGS[parity ? 'P' : MODES[t.kind].alg].moves).map((m) => m.text);
    alg.pop();
    return [setup, alg.join(' '), setup ? invertAlg(setup) : ''].filter(Boolean).join(' ');
  }
  // The solution as a list of algorithms, optionally with one letter done wrong.
  function simSolution(st, mistakeAt) {
    const toks = simMemo(st);
    const algs = toks.map((t) => O.tokenAlg(t));
    if (mistakeAt != null && toks.length) {
      const k = Math.max(0, Math.min(toks.length - 1, mistakeAt));
      algs[k] = flawed(toks[k]);
    }
    return { toks, algs };
  }
  async function simSolve(mistakeAt, tps) {
    const link = cube.link;
    if (!link || cube.kind !== 'sim') return null;
    const sol = simSolution(link.state(), mistakeAt);
    if (O.clock.phase() === 'idle') {
      O.clock.press();
      await new Promise((r) => setTimeout(r, 600));
    }
    await link.play(sol.algs, tps || 15);
    return sol;
  }
  $('cubeSimBox').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const input = $('cubeSimMoves');
    try {
      parseAlg(input.value);
      if (cube.link && cube.kind === 'sim') cube.link.turn(input.value);
      input.value = '';
    } catch (e) {
      say(esc(e.message), 'ko');
    }
  });
  $('cubeSimScr').addEventListener('click', () => {
    if (!cube.link || cube.kind !== 'sim') return;
    const scr = O.scramble();
    if (scr) cube.link.play([scr], 12);
  });
  $('cubeSimSolve').addEventListener('click', () => simSolve(null));
  $('cubeSimFail').addEventListener('click', () => {
    if (!cube.link || cube.kind !== 'sim') return;
    const n = simMemo(cube.link.state()).length;
    simSolve(n > 2 ? 1 + Math.floor(Math.random() * (n - 2)) : 0);
  });

  // ================= Reading the cube =================
  // Scrambled by hand however you like: the app works out a scramble for that state (the inverse of a
  // solution) and makes it the current one, so the memo, the checks and the timer all use it.
  function freshFacelets(ms) {
    return new Promise((resolve) => {
      const sub = cube.link && cube.link.events$.subscribe((ev) => { if (ev && ev.type === 'FACELETS') { done(); } });
      const t = setTimeout(() => done(), ms);
      function done() { clearTimeout(t); try { if (sub) sub.unsubscribe(); } catch (e) { /* closed */ } setTimeout(resolve, 0); }
      request('REQUEST_FACELETS');
    });
  }
  async function readCube(btn, tell) {
    if (!cube.state) return;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Leyendo…';
    try {
      await freshFacelets(600);
      if (!cube.state) throw new Error('desconectado');
      if (isSolved(cube.state)) { tell('El cubo está resuelto: mézclalo como quieras y vuelve a pulsar.', 'ko'); return; }
      // Your own turns since it was solved, if the app saw them all; otherwise a solver's scramble.
      let scr = handMoves ? O.simplifyAlg(handMoves.join(' ')) : '';
      const ok = scr && parseAlg(scr).length <= 30 && key(norm(apply(solved(), scr))) === key(cube.state);
      if (!ok) scr = await O.withTimeout(O.solveState(toFacelets(cube.state)), 30000);
      O.loadPractice(scr, '', '');
      tell(`Scramble leído de tu cubo (${parseAlg(scr).length} movimientos). Haz tu memo y compruébalo, o pulsa «Generar memo recomendado» para verlo.`, 'ok');
    } catch (e) {
      tell('No he podido sacar el scramble ahora mismo (el generador no ha cargado). Vuelve a probar en unos segundos.', 'ko');
    } finally {
      btn.disabled = false;
      btn.textContent = label;
      render();
    }
  }
  const tellPractice = (msg, tone) => { const out = $('result'); out.className = `result ${tone || ''}`; out.innerHTML = `<p>${msg}</p>`; };
  $('readCube').addEventListener('click', () => readCube($('readCube'), tellPractice));
  $('cubeUseState').addEventListener('click', () => readCube($('cubeUseState'), (msg, tone) => say(tone === 'ok' ? 'Listo: el scramble de la app es ahora el de tu cubo.' : msg, tone)));

  // ================= Buttons =================
  $('cubeNewScr').addEventListener('click', () => $('newScr').click());

  O.cube = {
    overlay: overlayState,
    attach: sc.attach, detach: sc.detach, connectGan: sc.connect, simLink: sc.virtualLink, simSolve, simSolution, simMemo, flawed, fromFacelets, toFacelets, norm, facePath,
    get state() { return cube.state; },
    get status() { return cube.status; },
    get link() { return cube.link; },
    get last() { return last; },
    get guidePath() { return gd.path; },
    fxLog,
    analyze,
  };
})();
