
(() => {
  'use strict';

  // ================= Cube model (facelets) =================
  // Faces U R F D L B, 9 stickers each, read as in a standard net.
  // Coordinates: x L(-1)→R(+1), y D(-1)→U(+1), z B(-1)→F(+1).
  const FACES = {
    U: { n: [0, 1, 0], r: [1, 0, 0], d: [0, 0, 1] },
    R: { n: [1, 0, 0], r: [0, 0, -1], d: [0, -1, 0] },
    F: { n: [0, 0, 1], r: [1, 0, 0], d: [0, -1, 0] },
    D: { n: [0, -1, 0], r: [1, 0, 0], d: [0, 0, -1] },
    L: { n: [-1, 0, 0], r: [0, 0, 1], d: [0, -1, 0] },
    B: { n: [0, 0, -1], r: [-1, 0, 0], d: [0, -1, 0] },
  };
  const FACE_ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];
  const STICKERS = [];
  for (const f of FACE_ORDER) {
    const { n, r, d } = FACES[f];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        STICKERS.push({ pos: [0, 1, 2].map((k) => n[k] + (col - 1) * r[k] + (row - 1) * d[k]), nrm: n.slice() });
      }
    }
  }
  const keyOf = (p, n) => p.join(',') + '|' + n.join(',');
  const INDEX = new Map(STICKERS.map((s, i) => [keyOf(s.pos, s.nrm), i]));

  function rot(v, a, q) {
    let [x, y, z] = v;
    const t = ((q % 4) + 4) % 4;
    for (let i = 0; i < t; i++) {
      if (a === 0) [y, z] = [-z, y];
      else if (a === 1) [z, x] = [-x, z];
      else [x, y] = [-y, x];
    }
    return [x, y, z];
  }
  // axis, layers, quarter turns (right-hand) of one clockwise turn
  const BASE = {
    R: [0, [1], -1], L: [0, [-1], 1], M: [0, [0], 1],
    U: [1, [1], -1], D: [1, [-1], 1], E: [1, [0], 1],
    F: [2, [1], -1], B: [2, [-1], 1], S: [2, [0], -1],
    r: [0, [1, 0], -1], l: [0, [-1, 0], 1],
    u: [1, [1, 0], -1], d: [1, [-1, 0], 1],
    f: [2, [1, 0], -1], b: [2, [-1, 0], 1],
    x: [0, [-1, 0, 1], -1], y: [1, [-1, 0, 1], -1], z: [2, [-1, 0, 1], -1],
  };
  const PERMS = {};
  function permFor(base, turns) {
    const k = base + turns;
    if (PERMS[k]) return PERMS[k];
    const [a, layers, q] = BASE[base];
    const perm = STICKERS.map((s, i) => (layers.includes(s.pos[a])
      ? INDEX.get(keyOf(rot(s.pos, a, q * turns), rot(s.nrm, a, q * turns)))
      : i));
    PERMS[k] = perm;
    return perm;
  }
  function parseAlg(str) {
    return (str || '').trim().split(/\s+/).filter(Boolean).map((t) => {
      const m = t.replace(/[’`´]/g, "'").match(/^([RLUDFBMESrludfbxyz])(w?)(2|')?('?)$/);
      if (!m) throw new Error('Movimiento no válido: ' + t);
      const base = m[2] ? m[1].toLowerCase() : m[1];
      let turns = m[3] === '2' ? 2 : 1;
      if (m[3] === "'" || m[4] === "'") turns = turns === 2 ? 2 : 3;
      return { base, turns, text: base + (turns === 2 ? '2' : turns === 3 ? "'" : '') };
    });
  }
  function invertAlg(str) {
    return parseAlg(str).reverse()
      .map((m) => m.base + (m.turns === 2 ? '2' : m.turns === 1 ? "'" : ''))
      .join(' ');
  }
  const solved = () => Array.from({ length: 54 }, (_, i) => i);
  function applyMove(state, m) {
    const perm = permFor(m.base, m.turns);
    const out = new Array(54);
    for (let i = 0; i < 54; i++) out[perm[i]] = state[i];
    return out;
  }
  const apply = (state, alg) => parseAlg(alg).reduce(applyMove, state);

  // Speffz lettering: faces U L F R B D; corners TL TR BR BL; edges top right bottom left.
  const SPEFFZ_FACES = ['U', 'L', 'F', 'R', 'B', 'D'];
  const EDGE_LETTER = {}; const CORNER_LETTER = {}; const EDGE_POS = {}; const CORNER_POS = {};
  SPEFFZ_FACES.forEach((f, fi) => {
    const base = FACE_ORDER.indexOf(f) * 9;
    [1, 5, 7, 3].forEach((slot, k) => {
      const L = String.fromCharCode(65 + fi * 4 + k);
      EDGE_LETTER[base + slot] = L; EDGE_POS[L] = base + slot;
    });
    [0, 2, 8, 6].forEach((slot, k) => {
      const L = String.fromCharCode(65 + fi * 4 + k);
      CORNER_LETTER[base + slot] = L; CORNER_POS[L] = base + slot;
    });
  });
  const faceOfSticker = (i) => FACE_ORDER[Math.floor(i / 9)];
  function pieceName(i) {
    const p = STICKERS[i].pos; const out = [];
    if (p[1] === 1) out.push('U'); if (p[1] === -1) out.push('D');
    if (p[2] === 1) out.push('F'); if (p[2] === -1) out.push('B');
    if (p[0] === 1) out.push('R'); if (p[0] === -1) out.push('L');
    return out.join('');
  }
  const COLOR_NAME = { U: 'blanco', R: 'rojo', F: 'verde', D: 'amarillo', L: 'naranja', B: 'azul' };

  // ================= The user's method =================
  const ALGS = {
    T: { name: 'T-perm', moves: "R U R' U' R' F R2 U' R' U' R U R' F'" },
    P: { name: 'R-perm', moves: "R U R' F' R U2 R' U2 R' F R U R U2 R' U'" },
    Y: { name: 'Y-perm modificada', moves: "R U' R' U' R U R' F' R U R' U' R' F R" },
  };
  const EDGE_SETUP = {
    A: "l2 D' l2", C: 'l2 D l2', D: '', E: "L d' L", F: "d' L", G: "L' d' L", H: "d L'",
    I: "l D' L2", J: 'd2 L', K: 'l D L2', L: "L'", N: 'd L', O: "D' l D L2", P: "d' L'",
    Q: "l' D L2", R: 'L', S: "l' D' L2", T: "d2 L'", U: "D' L2", V: 'D2 L2', W: 'D L2', X: 'L2',
  };
  const CORNER_SETUP = {
    B: 'R2', C: 'F2 D', D: 'F2', F: "F' D", G: "F'", H: "D' R", I: "F R'", J: "R'", K: "F' R'",
    L: "F2 R'", M: 'F', N: "R' F", O: 'R2 F', P: 'R F', Q: "R D'", S: "D F'", T: 'R', U: 'D',
    V: '', W: "D'", X: 'D2',
  };
  const MODES = {
    edge: {
      noun: 'Arista', nounPl: 'aristas', table: EDGE_SETUP, letterOf: EDGE_LETTER, posOf: EDGE_POS,
      buffer: ['B', 'M'], read: 'B', swap: 'D', alg: 'T',
    },
    corner: {
      noun: 'Esquina', nounPl: 'esquinas', table: CORNER_SETUP, letterOf: CORNER_LETTER, posOf: CORNER_POS,
      buffer: ['A', 'E', 'R'], read: 'E', swap: 'V', alg: 'Y',
    },
  };
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWX'.split('');
  const DEFAULTS = {
    scr: "U' L2 D' U R2 B' D' U' L2 B2 R' U' B' F' L U2 F R2 U'",
    memoE: 'KD IE XO WJ HL QN X',
    memoC: 'OU SC VN QI F',
  };

  // ================= Persistence (per viewer, optional) =================
  const STORE_KEY = 'op3bld:v1';
  function load() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; } }
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        mode: ui.mode, letter: ui.letter, base: ui.base, scr: $('scr').value, memoE: $('memoE').value, memoC: $('memoC').value,
        scrKind: $('scrKind').value,
        railCollapsed: $('rail').classList.contains('collapsed'),
      }));
    } catch (e) { /* storage unavailable: nothing to keep */ }
  }

  // ================= UI =================
  const $ = (id) => document.getElementById(id);
  const saved = load();
  const ui = {
    mode: saved.mode === 'corner' ? 'corner' : 'edge',
    letter: /^[A-X]$/.test(saved.letter || '') ? saved.letter : 'K',
    view: 'letter',           // 'letter' | 'parity'
    base: saved.base === 'solved' ? 'solved' : 'scramble',   // cube the viewer draws on
    track: { bufId: 0, tgtId: 0 },
    step: 0,
    steps: [],
    states: [],
    memoIdx: -1,
    tokens: [],
    errToken: -1,             // walk-strip index of the first wrong memo letter
  };

  function movesHtml(str) {
    return parseAlg(str).map((m) => `<span>${m.text}</span>`).join('');
  }
  document.querySelectorAll('[data-alg]').forEach((el) => { el.innerHTML = movesHtml(ALGS[el.dataset.alg].moves); });

  // ---- Net ----
  const NET_PLACE = { U: [1, 2], L: [2, 1], F: [2, 2], R: [2, 3], B: [2, 4], D: [3, 2] };
  // Fills a .net element with the six faces and returns its 54 cells in sticker order.
  function buildNet(net) {
    const cells = [];
    for (const f of ['U', 'L', 'F', 'R', 'B', 'D']) {
      const face = document.createElement('div');
      face.className = 'face';
      face.style.gridRow = NET_PLACE[f][0];
      face.style.gridColumn = NET_PLACE[f][1];
      const base = FACE_ORDER.indexOf(f) * 9;
      for (let k = 0; k < 9; k++) {
        const c = document.createElement('div');
        c.className = 'cell';
        face.appendChild(c);
        cells[base + k] = c;
      }
      net.appendChild(face);
    }
    return cells;
  }
  const cells = buildNet($('net'));

  function paintNet(state, opts) {
    paintCells(cells, MODES[ui.mode], state, opts);
  }
  function paintCells(cells, mode, state, opts) {
    for (let pos = 0; pos < 54; pos++) {
      const id = state[pos];
      const f = faceOfSticker(id);
      const c = cells[pos];
      c.style.backgroundColor = `var(--st-${f})`;
      c.classList.toggle('dark-text', f === 'U' || f === 'D');
      c.classList.toggle('light-text', !(f === 'U' || f === 'D'));
      c.classList.toggle('swap', opts.swapPos === pos);
      let html = '';
      if (opts.targetId === id) html = `<span class="badge tgt">${opts.targetLabel}</span>`;
      else if (opts.bufferId === id) html = `<span class="badge buf">${opts.bufferLabel}</span>`;
      else if (opts.showLabels) {
        const lab = mode.letterOf[pos];
        if (lab) html = `<span class="lab">${lab}</span>`;
      }
      c.innerHTML = html;
    }
  }

  // ---- Steps for a letter / parity ----
  function buildLetterSteps(letter) {
    const mode = MODES[ui.mode];
    const setup = mode.table[letter] || '';
    const steps = [{ kind: 'start', text: 'Inicio', alg: '' }];
    parseAlg(setup).forEach((m) => steps.push({ kind: 'setup', text: m.text, alg: m.text }));
    steps.push({ kind: 'alg', text: ALGS[mode.alg].name, alg: ALGS[mode.alg].moves });
    parseAlg(setup ? invertAlg(setup) : '').forEach((m) => steps.push({ kind: 'undo', text: m.text, alg: m.text }));
    return steps;
  }
  function buildParitySteps() {
    return [{ kind: 'start', text: 'Inicio', alg: '' }, { kind: 'alg', text: ALGS.P.name, alg: ALGS.P.moves }];
  }
  const conjugate = (set, alg) => (set ? `${set} ${alg} ${invertAlg(set)}` : alg);
  function tokenAlg(t) {
    if (t.kind === 'parity') return ALGS.P.moves;
    if (t.kind === 'edge') return conjugate(EDGE_SETUP[t.L], ALGS.T.moves);
    return conjugate(CORNER_SETUP[t.L], ALGS.Y.moves);
  }
  function scrambleState() {
    try { return apply(solved(), $('scr').value); } catch (e) { return null; }
  }
  // Real cube after the scramble and the first `count` memo targets.
  function stateBefore(count) {
    let s = scrambleState();
    if (!s) return null;
    for (let i = 0; i < count && i < ui.tokens.length; i++) {
      const t = ui.tokens[i];
      if (!tokenBad(t)) s = apply(s, tokenAlg(t));
    }
    return s;
  }
  function baseState() {
    if (ui.base !== 'scramble') return solved();
    const s = stateBefore(ui.memoIdx >= 0 ? ui.memoIdx : 0);
    if (!s) {
      $('notice').textContent = 'No entiendo el scramble, así que muestro el cubo resuelto.';
      return solved();
    }
    return s;
  }
  const isSolved = (st) => st.every((v, i) => v === i);

  function computeStates(steps, base) {
    const out = [base];
    for (let i = 1; i < steps.length; i++) out.push(apply(out[i - 1], steps[i].alg));
    return out;
  }
  function defaultStep(steps) {
    // Rest on the moment the target sits in the swap position (end of setup).
    let last = 0;
    steps.forEach((s, i) => { if (s.kind === 'setup') last = i; });
    return last;
  }

  function selectLetter(letter, fromMemo, stepOpt) {
    const mode = MODES[ui.mode];
    if (mode.buffer.includes(letter)) {
      $('notice').textContent = `${letter} es parte del buffer de ${mode.nounPl}: no se usa como objetivo.`;
      return;
    }
    $('notice').textContent = '';
    if (!fromMemo) { ui.memoIdx = -1; renderTokens(); }
    ui.view = 'letter';
    ui.letter = letter;
    ui.steps = buildLetterSteps(letter);
    const base = baseState();
    ui.states = computeStates(ui.steps, base);
    ui.track = { bufId: base[mode.posOf[mode.read]], tgtId: base[mode.posOf[letter]] };
    if (stepOpt === 'last') ui.step = ui.steps.length - 1;
    else if (stepOpt === 0 || ui.base === 'scramble') ui.step = 0;
    else ui.step = defaultStep(ui.steps);
    renderAll();
    save();
  }
  function showParity(stepOpt) {
    $('notice').textContent = '';
    ui.view = 'parity';
    ui.steps = buildParitySteps();
    ui.states = computeStates(ui.steps, baseState());
    ui.step = stepOpt === 'last' ? ui.steps.length - 1 : 0;
    renderAll();
  }
  function refreshViewer() {
    if (ui.view === 'parity') showParity();
    else if (ui.memoIdx >= 0) goToken(ui.memoIdx);
    else selectLetter(ui.letter, true);
  }
  function setBase(base) {
    ui.base = base;
    $('baseScr').setAttribute('aria-pressed', String(base === 'scramble'));
    $('baseSolved').setAttribute('aria-pressed', String(base === 'solved'));
    refreshViewer();
    save();
  }
  function setMode(mode, keepLetter) {
    if (!MODES[mode]) return;
    ui.mode = mode;
    $('modeEdge').setAttribute('aria-pressed', String(mode === 'edge'));
    $('modeCorner').setAttribute('aria-pressed', String(mode === 'corner'));
    let letter = keepLetter || ui.letter;
    if (MODES[mode].buffer.includes(letter)) letter = MODES[mode].swap;
    renderBoard();
    selectLetter(letter, Boolean(keepLetter));
  }

  // ---- Rendering ----
  function renderWho() {
    const mode = MODES[ui.mode];
    const big = $('big');
    if (ui.view === 'parity') {
      big.classList.add('par');
      $('bigLetter').textContent = 'PAR';
      $('bigSw').style.background = 'var(--accent)';
      const n = ui.tokens.filter((t) => t.kind === 'edge').length;
      $('whoTitle').textContent = 'Paridad: R-perm';
      $('whoDesc').innerHTML = `Has hecho <b>${n}</b> T-perms (número impar). Cada T-perm cruza también las esquinas UFR ↔ UBR, así que ahora están cambiadas. La R-perm las devuelve a su sitio y a cambio cruza las aristas UL ↔ UB; las Y-perm de las esquinas (también impares) las vuelven a dejar bien.`;
      return;
    }
    big.classList.remove('par');
    const L = ui.letter;
    const pos = mode.posOf[L];
    const face = faceOfSticker(pos);
    const piece = pieceName(pos);
    const setup = mode.table[L];
    $('bigLetter').textContent = L;
    $('bigSw').style.background = `var(--st-${face})`;
    $('whoTitle').textContent = `${mode.noun} ${piece} · pegatina en la cara ${face} (${COLOR_NAME[face]})`;
    const alg = ALGS[mode.alg].name;
    const readDesc = ui.mode === 'edge'
      ? 'la pegatina que lees en <b>B</b> (cara blanca de UR)'
      : 'la pegatina que lees en <b>E</b> (cara naranja de UBL)';
    if (!setup) {
      $('whoDesc').innerHTML = `${L} ya está en la posición de intercambio: no hace falta setup. Haz directamente la ${alg} y ${readDesc} irá a ${L}.`;
    } else {
      $('whoDesc').innerHTML = `El setup <b>${setup}</b> lleva ${L} a la posición <b>${mode.swap}</b> sin tocar el buffer. La ${alg} intercambia ${mode.read} ↔ ${mode.swap}, así que ${readDesc} entra en ${mode.swap}. Al deshacer el setup (<b>${invertAlg(setup)}</b>) acaba justo en ${L}.`;
    }
  }

  function renderSeq() {
    const groups = [
      { kind: 'setup', label: 'Setup' },
      { kind: 'alg', label: 'Algoritmo' },
      { kind: 'undo', label: 'Deshacer setup' },
    ];
    if (ui.view === 'parity') groups.splice(0, 3, { kind: 'alg', label: 'Algoritmo' });
    const wrap = $('seq');
    wrap.innerHTML = '';
    const startG = document.createElement('div');
    startG.className = 'seq-group';
    startG.innerHTML = '<span class="seq-label">Antes</span>';
    const startChips = document.createElement('div'); startChips.className = 'chips';
    startChips.appendChild(chipFor(0));
    startG.appendChild(startChips);
    wrap.appendChild(startG);
    for (const g of groups) {
      const el = document.createElement('div');
      el.className = 'seq-group';
      el.innerHTML = `<span class="seq-label">${g.label}</span>`;
      const chips = document.createElement('div'); chips.className = 'chips';
      let any = false;
      ui.steps.forEach((s, i) => { if (s.kind === g.kind) { chips.appendChild(chipFor(i)); any = true; } });
      if (!any && g.kind === 'undo') continue;
      if (!any) {
        const e = document.createElement('span');
        e.className = 'chip empty';
        e.textContent = 'sin setup';
        chips.appendChild(e);
      }
      el.appendChild(chips);
      wrap.appendChild(el);
    }
  }
  function chipFor(i) {
    const s = ui.steps[i];
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (s.kind === 'alg' ? ' alg-chip' : '') + (i < ui.step ? ' done' : '');
    b.textContent = s.text;
    if (i === ui.step) b.setAttribute('aria-current', 'step');
    b.addEventListener('click', () => { ui.step = i; renderStage(); renderSeq(); });
    return b;
  }

  function captionFor() {
    const mode = MODES[ui.mode];
    const s = ui.steps[ui.step];
    const nSetup = ui.steps.filter((x) => x.kind === 'setup').length;
    const nUndo = ui.steps.filter((x) => x.kind === 'undo').length;
    const idxIn = (kind) => ui.steps.slice(0, ui.step + 1).filter((x) => x.kind === kind).length;
    if (ui.view === 'parity') {
      if (ui.base === 'scramble') {
        return s.kind === 'start'
          ? 'Aristas terminadas. Fíjate en que UFR y UBR están cruzadas por las T-perms.'
          : 'Tras la R-perm, UFR y UBR vuelven a su sitio; UL y UB quedan cruzadas hasta acabar las esquinas.';
      }
      return s.kind === 'start'
        ? 'Cubo de referencia, antes de la paridad.'
        : 'Tras la R-perm: aristas UL ↔ UB y esquinas UFR ↔ UBR intercambiadas.';
    }
    const L = ui.letter;
    const piece = pieceName(mode.posOf[L]);
    const alg = ALGS[mode.alg].name;
    if (ui.base === 'scramble') {
      const readL = mode.letterOf[ui.track.bufId];
      const nextL = mode.letterOf[ui.track.tgtId];
      const last = ui.step === ui.steps.length - 1;
      const done = last && isSolved(ui.states[ui.step]) ? ' <b>¡Cubo resuelto!</b>' : '';
      const landed = readL === L ? `${L} ya está en su sitio.` : `${readL} queda aparcada en ${L}.`;
      if (s.kind === 'start') {
        let msg = `En el buffer (${mode.read}) lees <b>${readL}</b>.`;
        if (ui.memoIdx >= 0) {
          if (readL === L) msg += ' Coincide con tu memo.';
          else if (mode.buffer.includes(readL)) msg += ` El buffer tiene su propia pieza: cambio de ciclo, disparas a <b>${L}</b>.`;
          else msg += ` Tu memo dice <b>${L}</b>: revisa esta letra.`;
        }
        return msg;
      }
      if (s.kind === 'setup') {
        const k = idxIn('setup');
        return k === nSetup
          ? `Setup ${k}/${nSetup} · <b>${s.text}</b> → el hueco ${L} ya está en ${mode.swap}. Ahora la ${alg}.`
          : `Setup ${k}/${nSetup} · <b>${s.text}</b>`;
      }
      if (s.kind === 'alg') {
        return nUndo
          ? `${alg}: ${readL} entra en ${mode.swap} y lo que había en ${L} (${nextL}) pasa al buffer.`
          : `${alg}: ${landed} En el buffer queda ${nextL}.${done}`;
      }
      const k = idxIn('undo');
      return k === nUndo
        ? `Deshacer ${k}/${nUndo} · <b>${s.text}</b> → ${landed} En el buffer queda ${nextL}.${done}`
        : `Deshacer ${k}/${nUndo} · <b>${s.text}</b>`;
    }
    if (s.kind === 'start') return `Antes del setup: ${L} está en ${piece}. El buffer muestra <b>${mode.read}</b>.`;
    if (s.kind === 'setup') {
      const k = idxIn('setup');
      return k === nSetup
        ? `Setup ${k}/${nSetup} · <b>${s.text}</b> → ${L} ya está en ${mode.swap}. Ahora la ${ALGS[mode.alg].name}.`
        : `Setup ${k}/${nSetup} · <b>${s.text}</b>`;
    }
    if (s.kind === 'alg') {
      return nUndo
        ? `${ALGS[mode.alg].name}: la pegatina del buffer (${mode.read}) entra en ${mode.swap} y ${L} se va al buffer.`
        : `${ALGS[mode.alg].name}: la pegatina del buffer (${mode.read}) ya está en ${L}. Hecho.`;
    }
    const k = idxIn('undo');
    return k === nUndo
      ? `Deshacer ${k}/${nUndo} · <b>${s.text}</b> → la pegatina del buffer ha acabado en ${L}. Siguiente letra.`
      : `Deshacer ${k}/${nUndo} · <b>${s.text}</b>`;
  }

  function renderStage() {
    const mode = MODES[ui.mode];
    const state = ui.states[ui.step];
    if (ui.view === 'parity') {
      paintNet(state, { showLabels: false });
      $('legend').innerHTML = '';
    } else {
      const tgtL = mode.letterOf[ui.track.tgtId];
      const bufL = mode.letterOf[ui.track.bufId];
      paintNet(state, {
        targetId: ui.track.tgtId, targetLabel: tgtL,
        bufferId: ui.track.bufId, bufferLabel: bufL,
        swapPos: mode.posOf[mode.swap], showLabels: true,
      });
      $('legend').innerHTML = ui.base === 'scramble'
        ? `<span><i class="lg-dot buf"></i>lo que lees en el buffer (${bufL}) → va a ${ui.letter}</span>` +
          `<span><i class="lg-dot tgt"></i>lo que hay en ${ui.letter} (${tgtL}) → va al buffer</span>` +
          `<span><i class="lg-swap"></i>posición de intercambio (${mode.swap})</span>`
        : `<span><i class="lg-dot tgt"></i>tu letra (${ui.letter})</span>` +
          `<span><i class="lg-dot buf"></i>pegatina del buffer (${mode.read})</span>` +
          `<span><i class="lg-swap"></i>posición de intercambio (${mode.swap})</span>`;
    }
    $('caption').innerHTML = captionFor();
    const inMemo = ui.memoIdx >= 0;
    $('prevStep').disabled = ui.step === 0 && !(inMemo && ui.memoIdx > 0);
    $('nextStep').disabled = ui.step === ui.steps.length - 1 && !(inMemo && ui.memoIdx < ui.tokens.length - 1);
  }
  function stepForward() {
    if (ui.step < ui.steps.length - 1) { ui.step++; renderStage(); renderSeq(); }
    else if (ui.memoIdx >= 0 && ui.memoIdx < ui.tokens.length - 1) goToken(ui.memoIdx + 1, 0);
  }
  function stepBack() {
    if (ui.step > 0) { ui.step--; renderStage(); renderSeq(); }
    else if (ui.memoIdx > 0) goToken(ui.memoIdx - 1, 'last');
  }

  function renderRail() {
    const active = ui.view === 'parity' ? 'P' : MODES[ui.mode].alg;
    ['T', 'P', 'Y'].forEach((k) => $('alg' + k).classList.toggle('on', k === active));
  }

  function renderBoard() {
    const mode = MODES[ui.mode];
    const board = $('board');
    board.innerHTML = '';
    SPEFFZ_FACES.forEach((f, fi) => {
      const lab = document.createElement('div');
      lab.className = 'row-lab';
      lab.innerHTML = `<i style="background: var(--st-${f})"></i>${f}`;
      board.appendChild(lab);
      for (let k = 0; k < 4; k++) {
        const L = LETTERS[fi * 4 + k];
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'key';
        b.dataset.letter = L;
        const isBuf = mode.buffer.includes(L);
        const setup = mode.table[L];
        const sub = isBuf ? 'buffer' : (setup || 'sin setup');
        b.innerHTML = `<span class="k-l">${L}</span><span class="k-s">${sub}</span>`;
        b.disabled = isBuf;
        b.title = isBuf ? `${L}: buffer` : `${L} · ${pieceName(mode.posOf[L])} · ${sub}`;
        b.addEventListener('click', () => { selectLetter(L); showView('practicar'); });
        board.appendChild(b);
      }
    });
    markBoard();
  }
  function markBoard() {
    document.querySelectorAll('#board .key').forEach((b) => {
      b.classList.toggle('cur', ui.view === 'letter' && b.dataset.letter === ui.letter);
    });
  }

  function renderAll() {
    renderWho();
    renderSeq();
    renderStage();
    renderRail();
    markBoard();
  }

  // ---- Memo walker ----
  function lettersOf(str) {
    return (str || '').toUpperCase().replace(/[^A-Z]/g, '').split('');
  }
  function buildTokens() {
    const e = lettersOf($('memoE').value);
    const c = lettersOf($('memoC').value);
    const toks = e.map((L) => ({ kind: 'edge', L }));
    if (e.length % 2 === 1) toks.push({ kind: 'parity' });
    c.forEach((L) => toks.push({ kind: 'corner', L }));
    ui.tokens = toks;
    ui.errToken = -1;
  }
  function tokenBad(t) {
    if (t.kind === 'parity') return false;
    const mode = MODES[t.kind];
    return !(t.L in mode.posOf) || mode.buffer.includes(t.L);
  }
  function renderTokens() {
    const wrap = $('walkToks');
    wrap.innerHTML = '';
    const n = ui.tokens.length;
    if (!n) {
      wrap.innerHTML = '<p class="walk-empty">Escribe tu memo en «Tu memo» para recorrerlo aquí.</p>';
    }
    let pairEl = null;
    let lastKind = null;
    const counters = { edge: 0, corner: 0 };
    ui.tokens.forEach((t, i) => {
      if (t.kind !== lastKind && t.kind !== 'parity') {
        const lab = document.createElement('span');
        lab.className = 'walk-lab';
        lab.textContent = t.kind === 'edge' ? 'Aristas' : 'Esquinas';
        wrap.appendChild(lab);
      }
      lastKind = t.kind;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tok' + (t.kind === 'parity' ? ' parity' : '') + (tokenBad(t) || i === ui.errToken ? ' bad' : '')
        + (ui.memoIdx >= 0 && i < ui.memoIdx ? ' past' : '');
      b.textContent = t.kind === 'parity' ? 'R-perm' : t.L;
      if (i === ui.memoIdx) b.setAttribute('aria-current', 'true');
      if (tokenBad(t)) b.title = `${t.L} no es un objetivo válido de ${MODES[t.kind].nounPl}`;
      else if (i === ui.errToken) b.title = 'Aquí está el primer error del memo';
      b.addEventListener('click', () => goToken(i));
      if (t.kind === 'parity') { wrap.appendChild(b); return; }
      if (counters[t.kind] % 2 === 0) {
        pairEl = document.createElement('span');
        pairEl.className = 'pair';
        wrap.appendChild(pairEl);
      }
      pairEl.appendChild(b);
      counters[t.kind]++;
    });
    const pos = $('walkPos');
    if (!n) pos.textContent = '';
    else if (ui.memoIdx < 0) pos.textContent = `${n} objetivos · pulsa Siguiente para empezar`;
    else {
      const t = ui.tokens[ui.memoIdx];
      const what = t.kind === 'parity' ? 'paridad' : MODES[t.kind].nounPl;
      pos.innerHTML = `Objetivo <b>${ui.memoIdx + 1}</b> de ${n} · ${what}`;
    }
    $('memoPrev').disabled = ui.memoIdx <= 0;
    $('memoNext').disabled = ui.memoIdx >= n - 1;
  }
  function goToken(i, stepOpt) {
    if (i < 0 || i >= ui.tokens.length) return;
    ui.memoIdx = i;
    const t = ui.tokens[i];
    renderTokens();
    if (t.kind === 'parity') { showParity(stepOpt); return; }
    if (tokenBad(t)) {
      $('notice').textContent = `${t.L} no es un objetivo válido de ${MODES[t.kind].nounPl}.`;
      return;
    }
    if (ui.mode !== t.kind) {
      ui.mode = t.kind;
      $('modeEdge').setAttribute('aria-pressed', String(t.kind === 'edge'));
      $('modeCorner').setAttribute('aria-pressed', String(t.kind === 'corner'));
      renderBoard();
    }
    selectLetter(t.L, true, stepOpt);
  }

  // ---- Random-state scrambles ----
  // Like WCA / csTimer: pick a uniformly random legal cube and solve it with
  // Kociemba's two-phase algorithm (cubejs, run in a worker); the scramble is
  // the inverse of that solution.
  const CUBEJS = 'https://cdn.jsdelivr.net/npm/cubejs@1.3.2/lib/';
  let scrWorker = null;
  let scrReady = null;
  let scrIsReady = false;
  const scrQueue = [];
  // Runs inside the worker (serialised with toString), so it may only use Cube and self.
  function scramblerMain() {
    Cube.initSolver();
    const shuffle = (a) => {
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      return a;
    };
    const odd = (p) => { let x = 0; for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) x ^= 1; return x; };
    const evenPerm = (n) => { let p; do { p = shuffle([...Array(n).keys()]); } while (odd(p)); return p; };
    const twist = (n, m) => { const o = []; let sum = 0; for (let i = 0; i < n - 1; i++) { const v = Math.floor(Math.random() * m); o.push(v); sum += v; } o.push((m - (sum % m)) % m); return o; };
    const make = (kind) => {
      if (kind !== 'edges' && kind !== 'corners') return Cube.scramble();
      for (;;) {
        const c = new Cube();
        if (kind === 'edges') { c.ep = evenPerm(12); c.eo = twist(12, 2); } else { c.cp = evenPerm(8); c.co = twist(8, 3); }
        if (!c.isSolved()) return Cube.inverse(c.solve());
      }
    };
    self.postMessage({ ready: true });
    self.onmessage = (ev) => self.postMessage({ scramble: make(ev.data) });
  }
  // Same-origin copies (installed app, works offline) first; the CDN otherwise.
  async function scramblerLibrary() {
    try {
      const parts = await Promise.all(['cube.js', 'solve.js'].map(async (f) => {
        const r = await fetch('cubejs/' + f);
        const text = r.ok ? await r.text() : '';
        if (!r.ok || !/javascript/.test(r.headers.get('content-type') || '') || text.indexOf('Cube') < 0) throw new Error('no local copy');
        return text;
      }));
      return parts.join(String.fromCharCode(10) + ';' + String.fromCharCode(10));
    } catch (err) {
      return `importScripts('${CUBEJS}cube.js', '${CUBEJS}solve.js');`;
    }
  }
  function startScrambler() {
    if (scrReady) return scrReady;
    scrReady = scramblerLibrary().then((lib) => new Promise((resolve, reject) => {
      const src = lib + String.fromCharCode(10) + '(' + scramblerMain.toString() + ')();';
      scrWorker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      scrWorker.onmessage = (ev) => {
        if (ev.data && ev.data.ready) { scrIsReady = true; resolve(); return; }
        const cb = scrQueue.shift();
        if (cb) cb(ev.data.scramble);
      };
      scrWorker.onerror = (err) => { if (err.preventDefault) err.preventDefault(); reject(err); };
    }));
    scrReady.catch(() => {});
    return scrReady;
  }
  const withTimeout = (pr, ms) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  function requestScramble(kind) {
    return startScrambler().then(() => new Promise((res) => { scrQueue.push(res); scrWorker.postMessage(kind); }));
  }
  // Fallback when the solver cannot load: 25 random moves, no repeated face and
  // no U D U-style triples on the same axis.
  function randomMoveScramble(n = 25) {
    const axis = { U: 0, D: 0, L: 1, R: 1, F: 2, B: 2 };
    const out = [];
    let last = '';
    let before = '';
    while (out.length < n) {
      const f = 'UDLRFB'[Math.floor(Math.random() * 6)];
      if (f === last || (axis[f] === axis[last] && f === before)) continue;
      out.push(f + ['', "'", '2'][Math.floor(Math.random() * 3)]);
      before = last; last = f;
    }
    return out.join(' ');
  }
  function fitScramble() {
    const el = $('scr');
    el.style.height = 'auto';
    if (el.scrollHeight) el.style.height = `${el.scrollHeight + 2}px`;
    let n = 0;
    try { n = parseAlg(el.value).length; } catch (err) { n = -1; }
    $('scrCount').textContent = n > 0 ? `· ${n} movimientos` : n < 0 ? '· hay un movimiento no válido' : '';
    emit('scramble', el.value.trim());
  }
  async function newScramble() {
    const btn = $('newScr');
    const out = $('result');
    const kind = $('scrKind').value;
    btn.disabled = true;
    btn.textContent = scrIsReady ? 'Generando…' : 'Preparando…';
    let scr;
    let note = '';
    try {
      scr = await withTimeout(requestScramble(kind), 30000);
    } catch (err) {
      scr = randomMoveScramble();
      note = kind === 'full'
        ? 'No he podido cargar el generador de estado aleatorio, así que este scramble son 25 movimientos al azar.'
        : 'No he podido cargar el generador, así que este scramble es completo y de 25 movimientos al azar.';
    }
    btn.disabled = false;
    btn.textContent = 'Nuevo scramble';
    $('scr').value = scr;
    fitScramble();
    $('memoE').value = '';
    $('memoC').value = '';
    if (!note && kind !== 'full') {
      ui.mode = kind === 'edges' ? 'edge' : 'corner';
      $('modeEdge').setAttribute('aria-pressed', String(ui.mode === 'edge'));
      $('modeCorner').setAttribute('aria-pressed', String(ui.mode === 'corner'));
      renderBoard();
      if (MODES[ui.mode].buffer.includes(ui.letter)) ui.letter = MODES[ui.mode].swap;
    }
    buildTokens(); ui.memoIdx = -1; renderTokens(); refreshViewer(); save();
    const what = note || {
      full: 'Scramble nuevo de estado aleatorio.',
      edges: 'Scramble nuevo solo de aristas: las esquinas ya están resueltas.',
      corners: 'Scramble nuevo solo de esquinas: las aristas ya están resueltas.',
    }[kind];
    out.className = 'result' + (note ? ' ko' : '');
    out.innerHTML = `<p>${what} Haz tu memo, escríbelo y pulsa «Comprobar memo».</p>`;
  }

  // ---- Memo generator ----
  // Pieces as groups of sticker positions (same cubie).
  const PIECE_OF = (() => {
    const byCubie = new Map();
    STICKERS.forEach((st, i) => {
      const k = st.pos.join(',');
      if (!byCubie.has(k)) byCubie.set(k, []);
      byCubie.get(k).push(i);
    });
    const out = [];
    for (const ids of byCubie.values()) for (const i of ids) out[i] = ids;
    return out;
  })();
  const setupLen = (table, L) => parseAlg(table[L] || '').length;

  // Follows the buffer exactly as in a real solve. At every cycle break it tries
  // every unsolved sticker and keeps the one whose whole cycle needs the fewest
  // setup moves. The number of targets is fixed by the cube.
  function generateFor(kind, start) {
    const mode = MODES[kind];
    const readPos = mode.posOf[mode.read];
    const bufPositions = mode.buffer.map((b) => mode.posOf[b]);
    const isBuf = (id) => bufPositions.includes(id);
    const alg = ALGS[mode.alg].moves;
    const shoot = (st, L) => apply(st, conjugate(mode.table[L], alg));
    const cost = (L) => setupLen(mode.table, L);
    const positions = Object.keys(mode.letterOf).map(Number);
    let st = start;
    const letters = [];
    for (let guard = 0; guard < 40; guard++) {
      const id = st[readPos];
      if (!isBuf(id)) {
        const L = mode.letterOf[id];
        letters.push(L);
        st = shoot(st, L);
        continue;
      }
      const open = positions.filter((pos) => !isBuf(pos) && !PIECE_OF[pos].every((q) => st[q] === q));
      if (!open.length) break;
      let best = null;
      for (const pos of open) {
        const first = mode.letterOf[pos];
        const cyc = [first];
        let c = cost(first);
        let t = shoot(st, first);
        for (let g = 0; g < 30 && !isBuf(t[readPos]); g++) {
          const L = mode.letterOf[t[readPos]];
          cyc.push(L); c += cost(L); t = shoot(t, L);
        }
        const key = cyc.join('');
        const c0 = cost(first);   // ties: prefer a cheap break target (D / V first), then alphabetical
        if (!best || c < best.c || (c === best.c && (c0 < best.c0 || (c0 === best.c0 && key < best.key)))) {
          best = { c, c0, key, cyc, t };
        }
      }
      letters.push(...best.cyc);
      st = best.t;
    }
    return { letters, state: st };
  }
  const pairs = (letters) => letters.join('').replace(/(..)/g, '$1 ').trim();
  let previousMemo = null;

  function optimalMemo() {
    const s0 = scrambleState();
    if (!s0) return null;
    const edges = generateFor('edge', s0);
    let mid = edges.state;
    if (edges.letters.length % 2) mid = apply(mid, ALGS.P.moves);
    const corners = generateFor('corner', mid);
    return { edges, corners };
  }
  // Moves a memo makes you do: setups (there and back) plus one algorithm per letter.
  function memoCost(kind, letters) {
    const mode = MODES[kind];
    const algLen = parseAlg(ALGS[mode.alg].moves).length;
    const setup = letters.reduce((a, L) => a + setupLen(mode.table, L), 0);
    return { n: letters.length, setup, total: letters.length * algLen + 2 * setup };
  }
  const ratio = (best, mine) => (mine <= best ? 100 : Math.min(99, Math.round((100 * best) / mine)));
  // Same number of letters: compare setups (the only part that can change).
  // Extra letters: compare every move you would execute.
  const pctOf = (opt, mine) => (opt.n === mine.n ? ratio(opt.setup, mine.setup) : ratio(opt.total, mine.total));

  function scoreHtml(e, c, opt) {
    const oe = memoCost('edge', opt.edges.letters);
    const oc = memoCost('corner', opt.corners.letters);
    const me = memoCost('edge', e);
    const mc = memoCost('corner', c);
    const sameCount = oe.n === me.n && oc.n === mc.n;
    const total = sameCount
      ? ratio(oe.setup + oc.setup, me.setup + mc.setup)
      : ratio(oe.total + oc.total, me.total + mc.total);
    let html = `<p><span class="score">${total} % óptimo</span></p>`
      + `<p>Aristas ${pctOf(oe, me)} % · esquinas ${pctOf(oc, mc)} %. `;
    if (sameCount) {
      html += `Tus setups suman <b>${me.setup + mc.setup}</b> movimientos; los del memo óptimo, <b>${oe.setup + oc.setup}</b>.`;
    } else {
      const extra = me.n + mc.n - oe.n - oc.n;
      html += `Te sobran <b>${extra}</b> letras: con todo lo que ejecutas son <b>${me.total + mc.total}</b> movimientos frente a <b>${oe.total + oc.total}</b>.`;
    }
    html += '</p>';
    if (total < 100) {
      html += `<p>Memo óptimo: <code>${pairs(opt.edges.letters)}</code> · <code>${pairs(opt.corners.letters)}</code></p>`;
    } else {
      html += '<p>No hay un memo con menos movimientos para este scramble.</p>';
    }
    return { html, total };
  }

  function generateMemo() {
    const out = $('result');
    out.className = 'result';
    const opt = optimalMemo();
    if (!opt) {
      out.classList.add('ko');
      out.textContent = 'No entiendo el scramble: revisa los movimientos antes de generar el memo.';
      return;
    }
    const { edges, corners } = opt;
    previousMemo = { e: $('memoE').value, c: $('memoC').value };
    $('memoE').value = pairs(edges.letters);
    $('memoC').value = pairs(corners.letters);
    buildTokens(); ui.memoIdx = -1; renderTokens(); refreshViewer(); save();
    const ok = checkMemo(true);
    const moves = edges.letters.reduce((a, L) => a + setupLen(EDGE_SETUP, L), 0)
      + corners.letters.reduce((a, L) => a + setupLen(CORNER_SETUP, L), 0);
    out.className = 'result ' + (ok ? 'ok' : 'ko');
    out.innerHTML = ok
      ? `<p><span class="score">100 % óptimo</span></p><p>Memo generado y comprobado: con él el cubo queda resuelto. ${edges.letters.length} aristas${edges.letters.length % 2 ? ' + paridad' : ''} y ${corners.letters.length} esquinas, ${moves} movimientos de setup en total.</p>`
      : 'El memo generado no resuelve el cubo. Revisa que el scramble esté bien copiado.';
    if (previousMemo.e || previousMemo.c) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn'; b.textContent = 'Volver a mi memo';
      b.addEventListener('click', () => {
        $('memoE').value = previousMemo.e; $('memoC').value = previousMemo.c;
        buildTokens(); ui.memoIdx = -1; renderTokens(); refreshViewer(); save();
        out.textContent = ''; out.className = 'result';
      });
      out.appendChild(b);
    }
  }

  // Follows a memo exactly as a real solve does and stops at the first letter that
  // cannot be right: a letter that is not what the buffer holds, a cycle break to a
  // piece that is already solved, letters left over, or letters missing.
  function traceKind(kind, start, letters) {
    const mode = MODES[kind];
    const readPos = mode.posOf[mode.read];
    const bufPos = mode.buffer.map((b) => mode.posOf[b]);
    const isBuf = (id) => bufPos.includes(id);
    const positions = Object.keys(mode.letterOf).map(Number);
    const openLeft = (st) => positions.some((p) => !isBuf(p) && st[p] !== p);
    const alg = ALGS[mode.alg].moves;
    let st = start;
    for (let i = 0; i < letters.length; i++) {
      const L = letters[i];
      const id = st[readPos];
      if (!(L in mode.posOf) || mode.buffer.includes(L)) return { kind, i, got: L, why: 'invalid', state: st };
      if (!isBuf(id)) {
        const want = mode.letterOf[id];
        if (L !== want) return { kind, i, got: L, want, why: 'mismatch', state: st };
      } else {
        if (!openLeft(st)) return { kind, i, got: L, why: 'extra', state: st };
        if (PIECE_OF[mode.posOf[L]].every((q) => st[q] === q)) return { kind, i, got: L, why: 'solved', state: st };
      }
      st = apply(st, conjugate(mode.table[L], alg));
    }
    const id = st[readPos];
    if (!isBuf(id)) return { kind, i: letters.length, want: mode.letterOf[id], why: 'missing', state: st };
    if (openLeft(st)) return { kind, i: letters.length, why: 'missingBreak', state: st };
    return { kind, ok: true, state: st };
  }
  function traceMemo(start, e, c) {
    const te = traceKind('edge', start, e);
    if (!te.ok) return te;
    const mid = e.length % 2 ? apply(te.state, ALGS.P.moves) : te.state;
    const tc = traceKind('corner', mid, c);
    return tc.ok ? null : tc;
  }
  function errorText(err) {
    const mode = MODES[err.kind];
    const nth = `${err.i + 1}.ª`;
    const group = err.kind === 'edge' ? 'las aristas' : 'las esquinas';
    switch (err.why) {
      case 'invalid':
        return `La ${nth} letra de ${group} (<b>${err.got}</b>) no puede ser un objetivo.`;
      case 'mismatch':
        return `Primer error en la ${nth} letra de ${group}: tu memo dice <b>${err.got}</b>, pero en ese momento en el buffer (${mode.read}) está la <b>${err.want}</b>.`;
      case 'solved':
        return `Primer error en la ${nth} letra de ${group}: ahí toca cambio de ciclo (el buffer tiene su propia pieza), pero <b>${err.got}</b> ya está resuelta. Dispara a una ${mode.noun.toLowerCase()} sin resolver.`;
      case 'extra':
        return `Te sobran letras en ${group}: a partir de la ${nth} (<b>${err.got}</b>) ya están todas resueltas.`;
      case 'missing':
        return `Faltan letras en ${group}: después de la última, en el buffer está la <b>${err.want}</b>.`;
      default:
        return `Faltan letras en ${group}: el buffer ya tiene su propia pieza, pero quedan ${mode.nounPl} sin resolver. Te falta un cambio de ciclo.`;
    }
  }
  // Walk-strip index for an error (edges first, then the parity token, then corners).
  function errTokenIndex(err) {
    const e = ui.tokens.filter((t) => t.kind === 'edge').length;
    const c = ui.tokens.filter((t) => t.kind === 'corner').length;
    const offset = err.kind === 'edge' ? 0 : e + (e % 2);
    const count = err.kind === 'edge' ? e : c;
    if (!count) return -1;
    return offset + Math.min(err.i, count - 1);
  }
  function firstError() {
    const s = scrambleState();
    if (!s) return null;
    return traceMemo(s, lettersOf($('memoE').value), lettersOf($('memoC').value));
  }

  function checkMemo(silent) {
    const out = $('result');
    out.className = 'result';
    const e = lettersOf($('memoE').value);
    const c = lettersOf($('memoC').value);
    const badE = e.filter((L) => !(L in EDGE_POS) || MODES.edge.buffer.includes(L));
    const badC = c.filter((L) => !(L in CORNER_POS) || MODES.corner.buffer.includes(L));
    if (badE.length || badC.length) {
      if (silent === true) return false;
      out.classList.add('ko');
      out.textContent = `Hay letras que no pueden ser objetivo: ${[...badE.map((L) => L + ' (arista)'), ...badC.map((L) => L + ' (esquina)')].join(', ')}.`;
      return false;
    }
    let s;
    try { s = apply(solved(), $('scr').value); } catch (err) {
      if (silent === true) return false;
      out.classList.add('ko');
      out.textContent = `No entiendo el scramble. ${err.message}.`;
      return false;
    }
    for (const L of e) s = apply(s, conjugate(EDGE_SETUP[L], ALGS.T.moves));
    if (e.length % 2) s = apply(s, ALGS.P.moves);
    for (const L of c) s = apply(s, conjugate(CORNER_SETUP[L], ALGS.Y.moves));
    const wrongE = new Set(); const wrongC = new Set(); let centers = false;
    for (let i = 0; i < 54; i++) {
      if (s[i] === i) continue;
      if (EDGE_LETTER[i]) wrongE.add(pieceName(i));
      else if (CORNER_LETTER[i]) wrongC.add(pieceName(i));
      else centers = true;
    }
    const parityNote = e.length % 2
      ? `${e.length} aristas (impar) → paridad entre aristas y esquinas.`
      : `${e.length} aristas (par) → sin paridad.`;
    const good = !wrongE.size && !wrongC.size && !centers;
    if (silent === true) return good;
    if (good) {
      out.classList.add('ok');
      const opt = optimalMemo();
      const score = opt ? scoreHtml(e, c, opt) : null;
      out.innerHTML = (score ? score.html : '') + `<p>Con este memo el cubo queda resuelto. ${parityNote}</p>`;
      if (score && score.total < 100) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'btn'; b.textContent = 'Usar el óptimo';
        b.addEventListener('click', generateMemo);
        out.lastElementChild.appendChild(b);
      }
    } else {
      out.classList.add('ko');
      const parts = [];
      if (wrongE.size) parts.push(`aristas ${[...wrongE].join(', ')}`);
      if (wrongC.size) parts.push(`esquinas ${[...wrongC].join(', ')}`);
      if (centers) parts.push('centros');
      const err = firstError();
      ui.errToken = err ? errTokenIndex(err) : -1;
      renderTokens();
      out.innerHTML = (err ? `<p>${errorText(err)}</p>` : '')
        + `<p class=sub>No queda resuelto: fallan ${parts.join(' y ')}. ${parityNote}</p>`;
      if (ui.errToken >= 0) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'btn'; b.textContent = 'Ver esa letra en el cubo';
        const at = ui.errToken;
        b.addEventListener('click', () => {
          goToken(at, 0);
          const head = $('hLookup');
          if (head.scrollIntoView) head.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        out.firstElementChild.appendChild(b);
      }
    }
    if (good) { ui.errToken = -1; renderTokens(); }
    return good;
  }


  // ================= BLD timer =================
  const TIMES_KEY = 'op3bld:times:v1';
  const timer = { phase: 'idle', t0: 0, t1: 0, t2: 0, raf: 0, scramble: '', quietUntil: 0 };
  let times = (() => { try { return JSON.parse(localStorage.getItem(TIMES_KEY)) || []; } catch (e) { return []; } })();
  const saveTimes = () => { try { localStorage.setItem(TIMES_KEY, JSON.stringify(times.slice(-500))); } catch (e) { /* not kept */ } };
  const esc = (txt) => String(txt).replace(/[&<>'"]/g, (ch) => '&#' + ch.charCodeAt(0) + ';');
  function fmt(ms) {
    if (ms == null || !isFinite(ms)) return '—';
    const cs = Math.floor(ms / 10);
    const m = Math.floor(cs / 6000);
    const sec = Math.floor((cs % 6000) / 100);
    return `${m}:${String(sec).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
  }
  function paintClock(now) {
    $('clock').dataset.phase = timer.phase;
    $('clockPhase').textContent = { idle: 'Listo', memo: 'Memorizando', exec: 'Ejecutando', done: 'Terminado' }[timer.phase];
    let total = 0;
    let memo = null;
    let exec = null;
    if (timer.phase === 'memo') total = now - timer.t0;
    if (timer.phase === 'exec') { total = now - timer.t0; memo = timer.t1 - timer.t0; }
    if (timer.phase === 'done') { total = timer.t2 - timer.t0; memo = timer.t1 - timer.t0; exec = timer.t2 - timer.t1; }
    $('clockTime').textContent = fmt(total);
    $('clockSplit').textContent = `Memo ${fmt(memo)} · Ejecución ${fmt(exec)}`;
  }
  function tick() {
    paintClock(performance.now());
    if (timer.phase === 'memo' || timer.phase === 'exec') timer.raf = requestAnimationFrame(tick);
  }
  // Live timer state for the stream overlay. Times are epoch-based so another
  // window (or OBS) can keep its own clock running between messages.
  function timerState() {
    const now = performance.now();
    const wall = Date.now();
    const epoch = (t) => Math.round(wall - (now - t));
    const s = { phase: timer.phase, scramble: timer.scramble };
    if (timer.phase !== 'idle') s.t0 = epoch(timer.t0);
    if (timer.phase === 'exec' || timer.phase === 'done') s.t1 = epoch(timer.t1);
    if (timer.phase === 'done') s.t2 = epoch(timer.t2);
    return s;
  }
  const emitTimer = (extra) => {
    document.body.dataset.timer = timer.phase;
    emit('timer', { ...timerState(), ...extra });
  };
  const SHARE_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  // An attempt lasts minutes, longer than most phones stay awake: keep the screen on until it is saved.
  const screenLock = { want: false, lock: null, asking: false };
  function holdScreen(on) {
    screenLock.want = on;
    if (!on) {
      const l = screenLock.lock;
      screenLock.lock = null;
      try { if (l) l.release(); } catch (e) { /* already released */ }
      return;
    }
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
  // The browser drops the lock when the page is hidden; take it again on return.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && screenLock.want) holdScreen(true);
  });
  function timerPress() {
    const now = performance.now();
    if (timer.phase === 'idle') {
      // Just stopped by the smart cube: the blindfolded tap meant to stop it must not start a new attempt.
      if (now < timer.quietUntil) return;
      timer.phase = 'memo'; timer.t0 = now; timer.scramble = $('scr').value.trim();
      $('verdict').hidden = true;
      $('afterResult').hidden = true;
      holdScreen(true);
      tick();
    } else if (timer.phase === 'memo') {
      timer.phase = 'exec'; timer.t1 = now;
    } else if (timer.phase === 'exec') {
      timer.phase = 'done'; timer.t2 = now;
      cancelAnimationFrame(timer.raf);
      paintClock(now);
      $('verdict').hidden = false;
      $('markOk').focus();
    }
    emitTimer();
  }
  function timerCancel() {
    cancelAnimationFrame(timer.raf);
    timer.phase = 'idle';
    holdScreen(focus.on);
    $('verdict').hidden = true;
    paintClock(0);
    $('clockPhase').textContent = 'Intento cancelado';
    emitTimer({ cancelled: true });
  }
  function markResult(ok) {
    if (timer.phase !== 'done') return;
    const entry = { at: Date.now(), memo: Math.round(timer.t1 - timer.t0), exec: Math.round(timer.t2 - timer.t1), ok, scr: timer.scramble };
    // Keep the memo with the attempt when it fits the scramble that was timed.
    if ($('scr').value.trim() === timer.scramble && checkMemo(true)) {
      entry.mem = `${pairs(lettersOf($('memoE').value))} · ${pairs(lettersOf($('memoC').value))}`;
    }
    if (OP3.timerTag) entry.reto = OP3.timerTag;
    if (OP3.resultExtra) Object.assign(entry, OP3.resultExtra(ok));
    times.push(entry);
    saveTimes();
    timer.phase = 'idle';
    holdScreen(focus.on);
    $('verdict').hidden = true;
    $('clock').dataset.phase = 'idle';
    $('clockPhase').textContent = ok ? 'Guardado como resuelto' : 'Guardado como DNF';
    $('afterResult').hidden = false;
    lastEntry = entry;
    renderTimes();
    emit('result', entry);
    emit('changed', { what: 'times' });
    emitTimer();
  }
  let lastEntry = null;
  const emit = (name, detail) => document.dispatchEvent(new CustomEvent('op3:' + name, { detail }));
  const DELETED_KEY = 'op3bld:deleted:v1';
  function tombstone(ats) {
    let dead = [];
    try { dead = JSON.parse(localStorage.getItem(DELETED_KEY)) || []; } catch (e) { /* none yet */ }
    const merged = [...new Set([...dead, ...ats])].slice(-2000);
    try { localStorage.setItem(DELETED_KEY, JSON.stringify(merged)); } catch (e) { /* not kept */ }
  }
  // History: newest first, a page at a time, optionally only solves or only DNFs.
  const HIST_PAGE = 10;
  const hist = { filter: 'all', limit: HIST_PAGE };
  function renderTimes() {
    const n = times.length;
    const okList = times.filter((t) => t.ok);
    const total = (t) => t.memo + t.exec;
    const last5 = okList.slice(-5);
    const mean = (arr, f) => (arr.length ? arr.reduce((a, t) => a + f(t), 0) / arr.length : null);
    $('stats').innerHTML = n ? [
      ['Intentos', String(n)],
      ['Resueltos', `${okList.length} (${Math.round((100 * okList.length) / n)} %)`],
      ['Mejor', fmt(okList.length ? Math.min(...okList.map(total)) : null)],
      ['Media últimos 5', fmt(mean(last5, total))],
      ['Memo media', fmt(mean(last5, (t) => t.memo))],
      ['Ejecución media', fmt(mean(last5, (t) => t.exec))],
    ].map(([k, v]) => `<div class='stat'><span>${k}</span><b>${v}</b></div>`).join('') : '';
    $('clearTimes').hidden = !n;
    if (!n) {
      $('histBar').hidden = true;
      $('histMore').hidden = true;
      $('history').innerHTML = '<p class=empty-note>Aún no hay intentos. Genera un scramble, desordena tu cubo y toca el reloj para empezar el memo.</p>';
      return;
    }
    const keep = { all: () => true, ok: (t) => t.ok, dnf: (t) => !t.ok }[hist.filter];
    const picked = times.map((t, idx) => ({ t, idx })).filter(({ t }) => keep(t)).reverse();
    const rows = picked.slice(0, hist.limit);
    $('histBar').hidden = false;
    document.querySelectorAll('[data-hf]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.hf === hist.filter)));
    $('histCount').textContent = picked.length > rows.length ? `${rows.length} de ${picked.length}` : `${picked.length} ${picked.length === 1 ? 'intento' : 'intentos'}`;
    const more = $('histMore');
    more.hidden = picked.length <= rows.length;
    more.textContent = `Ver más (quedan ${picked.length - rows.length})`;
    if (!rows.length) {
      $('history').innerHTML = `<p class=empty-note>${hist.filter === 'ok' ? 'Todavía no hay intentos resueltos.' : 'No hay ningún DNF.'}</p>`;
      return;
    }
    $('history').innerHTML = '<table><thead><tr><th>#</th><th>Total</th><th>Memo</th><th>Ejecución</th><th>Resultado</th><th>Scramble</th><th><span class=sr-only>Acciones</span></th></tr></thead><tbody>'
      + rows.map(({ t, idx }) => `<tr><td>${idx + 1}</td><td>${fmt(total(t))}</td><td>${fmt(t.memo)}</td><td>${fmt(t.exec)}</td>`
        + `<td><span class='pill ${t.ok ? 'ok' : 'dnf'}'>${t.ok ? 'Resuelto' : 'DNF'}</span></td>`
        + `<td class=scr title='${esc(t.scr)}'>${esc(t.scr)}</td>`
        + `<td class=row-acts><button type=button class=x data-share='${idx}' aria-label='Compartir intento ${idx + 1}' title='Compartir como imagen'>${SHARE_ICON}</button>`
        + `<button type=button class=x data-del='${idx}' aria-label='Borrar intento ${idx + 1}' title='Borrar'>×</button></td></tr>`).join('')
      + '</tbody></table>';
  }

  // ================= Competition mode =================
  // Only the clock, full screen, and the whole screen is the button (like a stackmat). The screen stays on
  // while it is open. Enter with the button or F; leave with Salir, Esc or the phone's back gesture.
  const focus = { on: false };
  document.body.dataset.timer = 'idle';
  function renderFocus() {
    // A connected smart cube shows the scramble move by move instead.
    const live = OP3.scrHtml && OP3.scrHtml();
    if (live) $('focusScr').innerHTML = live;
    else $('focusScr').textContent = $('scr').value.trim() || 'Sin scramble: pulsa «Nuevo scramble».';
    let reto = '';
    if (OP3.timerTag) {
      try {
        const r = (JSON.parse(localStorage.getItem('op3bld:retos:v1')) || []).find((x) => x.id === OP3.timerTag);
        if (r) reto = `Reto de ${r.by}`;
      } catch (e) { /* no list */ }
    }
    $('focusReto').textContent = reto;
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const today = times.filter((t) => t.at >= from.getTime());
    const solved = today.filter((t) => t.ok);
    const last = times[times.length - 1];
    const parts = [];
    if (today.length) {
      parts.push(`Hoy <b>${solved.length}</b> de <b>${today.length}</b>`);
      if (solved.length) parts.push(`mejor <b>${fmt(Math.min(...solved.map((t) => t.memo + t.exec)))}</b>`);
    }
    if (last) parts.push(`último <b>${last.ok ? fmt(last.memo + last.exec) : 'DNF'}</b>`);
    $('focusStats').innerHTML = parts.join(' · ');
    const gen = $('newScr');
    $('focusNew').disabled = gen.disabled;
    $('focusNew').textContent = gen.disabled ? gen.textContent : 'Nuevo scramble';
  }
  function setFocus(on, fromHistory) {
    if (focus.on === on) return;
    focus.on = on;
    document.body.classList.toggle('focus', on);
    holdScreen(on || timer.phase !== 'idle');
    if (on) {
      if (currentView !== 'crono') showView('crono');
      renderFocus();
      try {
        const el = document.documentElement;
        if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
      } catch (e) { /* the overlay alone is enough */ }
      // So the back gesture on Android leaves this mode instead of the app.
      try { history.pushState({ op3focus: true }, ''); } catch (e) { /* sandboxed */ }
    } else {
      try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {}); } catch (e) { /* already out */ }
      if (!fromHistory) { try { if (history.state && history.state.op3focus) history.back(); } catch (e) { /* sandboxed */ } }
    }
  }
  window.addEventListener('popstate', () => { if (focus.on) setFocus(false, true); });
  ['op3:scramble', 'op3:result', 'op3:changed'].forEach((ev) => document.addEventListener(ev, () => { if (focus.on) renderFocus(); }));
  $('focusOpen').addEventListener('click', () => setFocus(true));
  $('focusExit').addEventListener('click', () => setFocus(false));
  $('focusNew').addEventListener('click', () => {
    $('newScr').click();
    renderFocus();
  });

  // ================= Setup trainer =================
  const TRAIN_KEY = 'op3bld:trainer:v1';
  const trainer = { kind: 'edge', letter: null, prev: null, phase: 'ask', t0: 0, session: { n: 0, ok: 0, time: 0 } };
  let trainData = (() => { try { return JSON.parse(localStorage.getItem(TRAIN_KEY)) || {}; } catch (e) { return {}; } })();
  const saveTrain = () => { try { localStorage.setItem(TRAIN_KEY, JSON.stringify(trainData)); } catch (e) { /* not kept */ } };
  const trainLetters = (kind) => LETTERS.filter((L) => !MODES[kind].buffer.includes(L));
  function statOf(kind, L) {
    trainData[kind] = trainData[kind] || {};
    if (!trainData[kind][L]) trainData[kind][L] = { seen: 0, right: 0, streak: 0, w: 3 };
    return trainData[kind][L];
  }
  // Weighted draw: misses raise a letter's weight, hits lower it.
  function pickLetter(kind) {
    const pool = trainLetters(kind).filter((L) => L !== trainer.prev);
    const weights = pool.map((L) => statOf(kind, L).w);
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r <= 0) return pool[i]; }
    return pool[pool.length - 1];
  }
  function nextCard(focus) {
    const kind = trainer.kind;
    const mode = MODES[kind];
    const L = pickLetter(kind);
    trainer.prev = L; trainer.letter = L; trainer.phase = 'ask'; trainer.t0 = performance.now();
    const pos = mode.posOf[L];
    const face = faceOfSticker(pos);
    $('trLetter').textContent = L;
    $('trSw').style.background = `var(--st-${face})`;
    $('trTitle').textContent = `${mode.noun} ${pieceName(pos)} · cara ${face} (${COLOR_NAME[face]})`;
    $('trDesc').innerHTML = `Escribe el setup que lleva ${L} a <b>${mode.swap}</b> y pulsa Intro.`;
    const inp = $('trInput');
    inp.value = ''; inp.readOnly = false;
    $('trSubmit').textContent = 'Comprobar';
    $('trSkip').hidden = false;
    $('trFeedback').textContent = '';
    $('trFeedback').className = 'tr-feedback';
    showSpoiler(false);
    if (focus) inp.focus();
  }
  // Spoiler: the solved cube with every letter, the asked one, the buffer and the swap spot, right here.
  let trCells = null;
  function showSpoiler(open) {
    const box = $('trCube');
    const btn = $('trSpoil');
    box.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    $('trSpoilText').textContent = open ? 'Ocultar el cubo' : 'Spoiler: ver el cubo';
    if (!open || !trainer.letter) return;
    const kind = trainer.kind;
    const mode = MODES[kind];
    const L = trainer.letter;
    if (!trCells) trCells = buildNet($('trNet'));
    paintCells(trCells, mode, solved(), {
      targetId: mode.posOf[L], targetLabel: L,
      bufferId: mode.posOf[mode.read], bufferLabel: mode.read,
      swapPos: mode.posOf[mode.swap], showLabels: true,
    });
    $('trLegend').innerHTML = `<span><i class="lg-dot tgt"></i>tu letra (${L})</span>`
      + `<span><i class="lg-dot buf"></i>pegatina del buffer (${mode.read})</span>`
      + `<span><i class="lg-swap"></i>posición de intercambio (${mode.swap})</span>`;
  }
  // A typed setup is right when setup + algorithm + undo does exactly what the table's does.
  function judgeSetup(kind, L, typed) {
    const mode = MODES[kind];
    const alg = ALGS[mode.alg].moves;
    let norm;
    try { norm = parseAlg(typed).map((m) => m.text).join(' '); } catch (e) { return { ok: false, msg: `${e.message}.` }; }
    const want = apply(solved(), conjugate(mode.table[L], alg));
    const got = apply(solved(), conjugate(norm, alg));
    if (want.every((v, i) => v === got[i])) return { ok: true, norm };
    const st = apply(solved(), norm);
    if (mode.buffer.some((b) => st[mode.posOf[b]] !== mode.posOf[b])) return { ok: false, msg: 'Ese setup mueve el buffer.' };
    const landed = st.indexOf(mode.posOf[L]);
    if (landed !== mode.posOf[mode.swap]) {
      return { ok: false, msg: `Con ese setup, ${L} acaba en ${mode.letterOf[landed] || pieceName(landed)}, no en ${mode.swap}.` };
    }
    const side = kind === 'edge'
      ? 'las esquinas UFR y UBR, que la T-perm también intercambia'
      : 'las aristas UL y UB, que la Y-perm también intercambia';
    return { ok: false, msg: `Lleva ${L} a ${mode.swap}, pero mueve ${side}.` };
  }
  function answerCard(giveUp) {
    if (trainer.phase !== 'ask') { nextCard(true); return; }
    const kind = trainer.kind;
    const L = trainer.letter;
    const mode = MODES[kind];
    const typed = $('trInput').value.trim();
    const secs = (performance.now() - trainer.t0) / 1000;
    const right = mode.table[L] || '';
    let res;
    if (giveUp || (!typed && right)) res = { ok: false, msg: 'Sin respuesta.' };
    else if (!typed) res = { ok: true, norm: '' };
    else res = judgeSetup(kind, L, typed);
    const st = statOf(kind, L);
    st.seen++;
    if (res.ok) {
      st.right++; st.streak++; st.w = Math.max(1, st.w / 2);
      if (secs > 6) st.w = Math.max(st.w, 1.5);
    } else {
      st.streak = 0; st.w = Math.min(16, st.w * 2 + 1);
    }
    saveTrain();
    emit('changed', { what: 'train' });
    trainer.session.n++;
    if (res.ok) { trainer.session.ok++; trainer.session.time += secs; }
    const ans = right ? `<code>${right}</code>` : 'sin setup';
    const fb = $('trFeedback');
    fb.className = 'tr-feedback ' + (res.ok ? 'ok' : 'ko');
    fb.innerHTML = res.ok
      ? `Correcto en ${secs.toFixed(1).replace('.', ',')} s.${res.norm !== right ? ` Tu tabla usa ${ans}.` : ''}`
      : `${res.msg} La de tu tabla: ${ans}.`;
    trainer.phase = 'answered';
    $('trInput').readOnly = true;
    $('trSubmit').textContent = 'Siguiente';
    $('trSkip').hidden = true;
    $('trSubmit').focus();
    renderTrainStats();
  }
  function renderTrainStats() {
    const kind = trainer.kind;
    const ses = trainer.session;
    $('trStats').textContent = ses.n
      ? `Esta sesión: ${ses.n} intentos · ${ses.ok} aciertos (${Math.round((100 * ses.ok) / ses.n)} %)`
        + (ses.ok ? ` · media ${(ses.time / ses.ok).toFixed(1).replace('.', ',')} s por acierto` : '')
      : 'Escribe el setup como lo harías con el cubo; vale cualquier setup correcto, no solo el de tu tabla.';
    const data = trainData[kind] || {};
    $('trMastery').innerHTML = trainLetters(kind).map((L) => {
      const st = data[L];
      const cls = !st || !st.seen ? '' : st.streak >= 3 ? 'good' : st.w >= 2 ? 'weak' : 'seen';
      const tip = !st || !st.seen ? 'sin practicar' : `${st.right} de ${st.seen} aciertos, racha ${st.streak}`;
      return `<span class='m-cell ${cls}' title='${L}: ${tip}'>${L}</span>`;
    }).join('');
  }
  function setTrainKind(kind) {
    trainer.kind = kind;
    trainer.prev = null;
    trainer.session = { n: 0, ok: 0, time: 0 };
    $('trEdge').setAttribute('aria-pressed', String(kind === 'edge'));
    $('trCorner').setAttribute('aria-pressed', String(kind === 'corner'));
    nextCard(false);
    renderTrainStats();
  }
  function showInViewer(kind, L) {
    ui.mode = kind;
    $('modeEdge').setAttribute('aria-pressed', String(kind === 'edge'));
    $('modeCorner').setAttribute('aria-pressed', String(kind === 'corner'));
    ui.base = 'solved';
    $('baseScr').setAttribute('aria-pressed', 'false');
    $('baseSolved').setAttribute('aria-pressed', 'true');
    renderBoard();
    selectLetter(L);
    showView('practicar');
  }

  // ================= Guided execution =================
  const guide = { steps: [], i: 0, lock: null };
  function buildGuideSteps(split) {
    const steps = [];
    const n = ui.tokens.length;
    ui.tokens.forEach((t, idx) => {
      if (tokenBad(t)) return;
      const ctx = t.kind === 'parity'
        ? `Paridad · objetivo ${idx + 1} de ${n}`
        : `${MODES[t.kind].noun} <b>${t.L}</b> · objetivo ${idx + 1} de ${n}`;
      const pushAlg = (key) => {
        const a = ALGS[key];
        if (split) parseAlg(a.moves).forEach((m, k, arr) => steps.push({ move: m.text, kind: `${a.name} ${k + 1}/${arr.length}`, ctx, token: idx }));
        else steps.push({ move: a.name, seq: a.moves, kind: 'Algoritmo', ctx, token: idx, isAlg: true });
      };
      if (t.kind === 'parity') { pushAlg('P'); return; }
      const mode = MODES[t.kind];
      const setup = mode.table[t.L] || '';
      const sm = parseAlg(setup);
      sm.forEach((m, k) => steps.push({ move: m.text, kind: `Setup ${k + 1}/${sm.length}`, ctx, token: idx }));
      pushAlg(mode.alg);
      const um = parseAlg(setup ? invertAlg(setup) : '');
      um.forEach((m, k) => steps.push({ move: m.text, kind: `Deshacer setup ${k + 1}/${um.length}`, ctx, token: idx }));
    });
    steps.push({ end: true, token: -1 });
    return steps;
  }
  function openGuide() {
    if (!ui.tokens.some((t) => !tokenBad(t))) {
      $('notice').textContent = 'Escribe tu memo en «Tu memo» para usar la ejecución guiada.';
      return;
    }
    guide.steps = buildGuideSteps($('guideSplit').checked);
    const from = ui.memoIdx >= 0 ? guide.steps.findIndex((st) => st.token === ui.memoIdx) : 0;
    guide.i = Math.max(0, from);
    $('guide').hidden = false;
    document.body.style.overflow = 'hidden';
    renderGuide();
    $('guideStage').focus();
    try {
      if (navigator.wakeLock) navigator.wakeLock.request('screen').then((l) => { guide.lock = l; }).catch(() => {});
    } catch (e) { /* the screen may sleep */ }
  }
  function closeGuide() {
    $('guide').hidden = true;
    document.body.style.overflow = '';
    try { if (guide.lock) guide.lock.release(); } catch (e) { /* already released */ }
    guide.lock = null;
    if (ui.memoIdx >= 0) goToken(ui.memoIdx);
    $('guideOpen').focus();
  }
  // One bar segment per memo target, grouped into edges, parity and corners.
  function buildGuideBar() {
    const bar = $('guideBar');
    bar.innerHTML = '';
    const LABEL = { edge: 'Aristas', parity: 'Paridad', corner: 'Esquinas' };
    let grp = null;
    let row = null;
    let seg = null;
    guide.steps.forEach((st, i) => {
      if (st.end) return;
      const t = ui.tokens[st.token];
      if (!grp || grp.dataset.kind !== t.kind) {
        grp = document.createElement('div');
        grp.className = 'gb-group';
        grp.dataset.kind = t.kind;
        grp.style.flexGrow = '0';
        const lab = document.createElement('span');
        lab.className = 'gb-lab';
        lab.textContent = LABEL[t.kind];
        row = document.createElement('div');
        row.className = 'gb-segs';
        grp.append(lab, row);
        bar.appendChild(grp);
        seg = null;
      }
      if (!seg || Number(seg.dataset.token) !== st.token) {
        const name = t.kind === 'parity' ? 'Paridad (R-perm)' : `${MODES[t.kind].noun} ${t.L}`;
        seg = document.createElement('button');
        seg.type = 'button';
        seg.className = 'gb-seg';
        seg.dataset.token = String(st.token);
        seg.dataset.from = String(i);
        seg.title = name;
        seg.setAttribute('aria-label', `Ir a: ${name}`);
        seg.innerHTML = `<span class=gb-track><i></i></span><span class=gb-letter>${t.kind === 'parity' ? 'R' : t.L}</span>`;
        seg.style.flexGrow = '0';
        const from = i;
        seg.addEventListener('click', () => { guide.i = from; renderGuide(); });
        row.appendChild(seg);
      }
      seg.dataset.to = String(i + 1);
      seg.style.flexGrow = String(Number(seg.style.flexGrow) + 1);
      grp.style.flexGrow = String(Number(grp.style.flexGrow) + 1);
    });
    guide.barFor = guide.steps;
  }
  function renderGuideBar() {
    if (guide.barFor !== guide.steps) buildGuideBar();
    document.querySelectorAll('#guideBar .gb-group').forEach((g) => {
      let cur = false;
      g.querySelectorAll('.gb-seg').forEach((s) => {
        const from = Number(s.dataset.from);
        const to = Number(s.dataset.to);
        const fill = Math.min(1, Math.max(0, (guide.i - from) / (to - from)));
        s.querySelector('i').style.width = `${100 * fill}%`;
        s.classList.toggle('done', guide.i >= to);
        const isCur = guide.i >= from && guide.i < to;
        s.classList.toggle('cur', isCur);
        if (isCur) s.setAttribute('aria-current', 'step'); else s.removeAttribute('aria-current');
        cur = cur || isCur;
      });
      g.classList.toggle('cur', cur);
    });
  }
  function renderGuide() {
    const st = guide.steps[guide.i];
    const total = guide.steps.length - 1;
    renderGuideBar();
    $('guideProg').textContent = st.end ? 'Terminado' : `Paso ${guide.i + 1} de ${total}`;
    const mv = $('guideMove');
    if (st.end) {
      const done = stateBefore(ui.tokens.length);
      $('guideCtx').textContent = '';
      mv.textContent = '¡Hecho!';
      mv.className = 'guide-move is-alg';
      const err = done && isSolved(done) ? null : firstError();
      $('guideSeq').textContent = done && isSolved(done)
        ? 'Con este memo el cubo queda resuelto.'
        : `Ojo: con este memo el cubo no queda resuelto. ${err ? errorText(err).replace(/<[^>]+>/g, '') : 'Revísalo con «Comprobar memo».'}`;
      $('guideKind').textContent = '';
    } else {
      $('guideCtx').innerHTML = st.ctx;
      mv.textContent = st.move;
      mv.className = 'guide-move' + (st.isAlg ? ' is-alg' : '');
      $('guideSeq').textContent = st.isAlg ? st.seq : '';
      $('guideKind').textContent = st.kind;
    }
    $('guideSeq').hidden = !$('guideSeq').textContent;
    $('guideNext').innerHTML = guide.steps.slice(guide.i + 1, guide.i + 7).filter((x) => !x.end).map((x) => `<span>${x.move}</span>`).join('');
    $('guidePrev').disabled = guide.i === 0;
    $('guideNextBtn').disabled = !!st.end;
    if (st.token >= 0 && st.token !== ui.memoIdx) { ui.memoIdx = st.token; renderTokens(); }
  }
  function guideStep(d) {
    const i = Math.min(guide.steps.length - 1, Math.max(0, guide.i + d));
    if (i === guide.i) return;
    guide.i = i;
    renderGuide();
  }

  // ---- Wiring ----
  $('modeEdge').addEventListener('click', () => setMode('edge'));
  $('modeCorner').addEventListener('click', () => setMode('corner'));
  $('prevStep').addEventListener('click', stepBack);
  $('nextStep').addEventListener('click', stepForward);
  $('baseScr').addEventListener('click', () => setBase('scramble'));
  $('baseSolved').addEventListener('click', () => setBase('solved'));
  $('check').addEventListener('click', () => checkMemo());
  $('generate').addEventListener('click', generateMemo);
  $('newScr').addEventListener('click', newScramble);
  $('scrKind').addEventListener('change', save);
  $('clock').addEventListener('click', timerPress);
  $('markOk').addEventListener('click', () => markResult(true));
  $('markDnf').addEventListener('click', () => markResult(false));
  $('history').addEventListener('click', (ev) => {
    const sh = ev.target.closest('[data-share]');
    if (sh) { emit('share', times[Number(sh.dataset.share)]); return; }
    const b = ev.target.closest('[data-del]');
    if (!b) return;
    const [gone] = times.splice(Number(b.dataset.del), 1);
    if (gone) tombstone([gone.at]);
    saveTimes(); renderTimes();
    emit('changed', { what: 'times' });
  });
  $('shareLast').addEventListener('click', () => { if (lastEntry) emit('share', lastEntry); });
  document.querySelectorAll('[data-hf]').forEach((b) => b.addEventListener('click', () => {
    hist.filter = b.dataset.hf;
    hist.limit = HIST_PAGE;
    renderTimes();
  }));
  $('histMore').addEventListener('click', () => { hist.limit += 2 * HIST_PAGE; renderTimes(); });
  let clearArmed = 0;
  $('clearTimes').addEventListener('click', () => {
    const b = $('clearTimes');
    if (Date.now() - clearArmed > 3000) {
      clearArmed = Date.now();
      b.textContent = 'Pulsa otra vez para borrarlo todo';
      setTimeout(() => { b.textContent = 'Borrar historial'; }, 3000);
      return;
    }
    tombstone(times.map((t) => t.at));
    times = []; saveTimes(); renderTimes();
    emit('changed', { what: 'times' });
    b.textContent = 'Borrar historial';
  });
  $('trForm').addEventListener('submit', (ev) => { ev.preventDefault(); answerCard(false); });
  $('trSkip').addEventListener('click', () => answerCard(true));
  $('trEdge').addEventListener('click', () => setTrainKind('edge'));
  $('trCorner').addEventListener('click', () => setTrainKind('corner'));
  $('trSee').addEventListener('click', () => { if (trainer.letter) showInViewer(trainer.kind, trainer.letter); });
  $('trSpoil').addEventListener('click', () => showSpoiler($('trCube').hidden));
  // «?» opens and closes the spoiler, also while typing a setup (no setup uses it).
  const spoilerKey = (ev) => {
    if (ev.key !== '?' || ev.ctrlKey || ev.metaKey || ev.altKey) return false;
    ev.preventDefault();
    showSpoiler($('trCube').hidden);
    return true;
  };
  $('trInput').addEventListener('keydown', spoilerKey);
  let resetArmed = 0;
  $('trReset').addEventListener('click', () => {
    const b = $('trReset');
    if (Date.now() - resetArmed > 3000) {
      resetArmed = Date.now();
      b.textContent = 'Pulsa otra vez para reiniciar';
      setTimeout(() => { b.textContent = 'Reiniciar estadísticas'; }, 3000);
      return;
    }
    delete trainData[trainer.kind];
    saveTrain();
    emit('changed', { what: 'train' });
    setTrainKind(trainer.kind);
    b.textContent = 'Reiniciar estadísticas';
  });
  $('guideOpen').addEventListener('click', openGuide);
  $('guideClose').addEventListener('click', closeGuide);
  $('guideStage').addEventListener('click', () => guideStep(1));
  $('guideNextBtn').addEventListener('click', () => guideStep(1));
  $('guidePrev').addEventListener('click', () => guideStep(-1));
  $('guideSplit').addEventListener('change', () => {
    const token = guide.steps[guide.i] ? guide.steps[guide.i].token : -1;
    guide.steps = buildGuideSteps($('guideSplit').checked);
    const at = guide.steps.findIndex((st) => st.token === token);
    guide.i = at >= 0 ? at : 0;
    renderGuide();
  });
  // Installable app (only where a manifest is served, i.e. the Vercel build).
  let installEvt = null;
  const installBtns = document.querySelectorAll('.install');
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
  // New version: the new service worker takes over by itself and drops the old cache, so a page whose
  // build no longer has a cache is out of date. Offer a reload, but never in the middle of an attempt.
  function offerUpdate() {
    const show = () => { $('updateBar').hidden = false; };
    if (timer.phase === 'idle') { show(); return; }
    const wait = () => {
      if (timer.phase !== 'idle') return;
      document.removeEventListener('op3:timer', wait);
      show();
    };
    document.addEventListener('op3:timer', wait);
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
    // The controller changes before the new worker has cleared the old cache: compare once it is active.
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      const sw = navigator.serviceWorker.controller;
      if (!sw || sw.state === 'activated') { compare(); return; }
      sw.addEventListener('statechange', () => { if (sw.state === 'activated') compare(); });
    });
    // An installed app can stay open for days: look for a new version now and then.
    let last = Date.now();
    const poll = () => { last = Date.now(); reg.update().catch(() => {}); };
    setInterval(poll, 30 * 60e3);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - last > 5 * 60e3) poll();
    });
  }
  // Theme: follows the system unless chosen in Ajustes (per device). The <head> applies it before painting.
  const THEME_KEY = 'op3bld:theme:v1';
  const themeMetas = [...document.querySelectorAll('meta[name=theme-color]')].map((m) => [m, m.content]);
  function applyTheme(t) {
    const root = document.documentElement;
    if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t);
    else root.removeAttribute('data-theme');
    themeMetas.forEach(([m, original]) => { m.content = t === 'light' ? '#ECEFF3' : t === 'dark' ? '#0F1319' : original; });
    document.querySelectorAll('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === (t || 'auto'))));
  }
  applyTheme((() => { try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; } })());
  document.querySelectorAll('[data-theme-set]').forEach((b) => b.addEventListener('click', () => {
    const t = b.dataset.themeSet === 'auto' ? null : b.dataset.themeSet;
    try { if (t) localStorage.setItem(THEME_KEY, t); else localStorage.removeItem(THEME_KEY); } catch (e) { /* this visit only */ }
    applyTheme(t);
  }));
  $('updateGo').addEventListener('click', () => location.reload());
  $('updateLater').addEventListener('click', () => { $('updateBar').hidden = true; });
  if ('serviceWorker' in navigator && document.querySelector('link[rel=manifest]')) {
    navigator.serviceWorker.register('sw.js').then(watchUpdates).catch(() => {});
  }
  setTimeout(() => { if (typeof Worker !== 'undefined') startScrambler(); }, 1500);
  $('memoPrev').addEventListener('click', () => goToken(ui.memoIdx - 1));
  $('memoNext').addEventListener('click', () => goToken(ui.memoIdx + 1));
  $('scr').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') ev.preventDefault(); });
  $('scr').addEventListener('input', () => {
    const el = $('scr');
    if (/[\r\n]/.test(el.value)) el.value = el.value.replace(/\s*[\r\n]+\s*/g, ' ');
    fitScramble();
  });
  window.addEventListener('resize', fitScramble);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitScramble);
  ['memoE', 'memoC', 'scr'].forEach((id) => $(id).addEventListener('input', () => {
    buildTokens(); ui.memoIdx = -1; renderTokens(); $('result').textContent = ''; $('result').className = 'result';
    if (ui.view === 'parity') selectLetter(ui.letter); else refreshViewer();
    save();
  }));
  $('railToggle').addEventListener('click', () => {
    const rail = $('rail');
    const collapsed = rail.classList.toggle('collapsed');
    $('railToggle').textContent = collapsed ? 'Mostrar' : 'Ocultar';
    $('railToggle').setAttribute('aria-expanded', String(!collapsed));
    save();
  });
  document.addEventListener('keydown', (ev) => {
    if (!$('guide').hidden) {
      const gk = ev.key;
      if (ev.target && ev.target.tagName === 'INPUT') return;
      if (gk === ' ' || gk === 'ArrowRight' || gk === 'Enter') {
        if (gk === 'Enter' && ev.target && ev.target.tagName === 'BUTTON') return;
        ev.preventDefault();
        if (document.activeElement && document.activeElement.tagName === 'BUTTON') $('guideStage').focus();
        guideStep(1);
      } else if (gk === 'ArrowLeft' || gk === 'Backspace') { ev.preventDefault(); guideStep(-1); }
      else if (gk === 'Escape') { ev.preventDefault(); closeGuide(); }
      return;
    }
    const t = ev.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (document.querySelector('.sheet:not([hidden])')) return;
    const k = ev.key;
    if (currentView === 'crono') {
      if (k === ' ') {
        ev.preventDefault();
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        timerPress();
      } else if (k === 'Escape' && (timer.phase === 'memo' || timer.phase === 'exec')) timerCancel();
      else if (k === 'Escape' && focus.on && timer.phase === 'idle') { ev.preventDefault(); setFocus(false); } else if ((k === 'f' || k === 'F') && timer.phase === 'idle') {
        ev.preventDefault();
        setFocus(!focus.on);
      }
      return;
    }
    if (currentView !== 'practicar' && currentView !== 'tabla') {
      const h = OP3.onKey[currentView];
      if (h) h(ev);
      return;
    }
    if (k === '1') { setMode('edge'); return; }
    if (k === '2') { setMode('corner'); return; }
    if (currentView === 'practicar' && k === ' ') { ev.preventDefault(); stepForward(); return; }
    if (currentView !== 'practicar' && k.startsWith('Arrow')) return;
    if (k === 'ArrowRight') { ev.preventDefault(); stepForward(); return; }
    if (k === 'ArrowLeft') { ev.preventDefault(); stepBack(); return; }
    if (k === 'ArrowDown') { ev.preventDefault(); goToken(ui.memoIdx + 1); return; }
    if (k === 'ArrowUp') { ev.preventDefault(); goToken(ui.memoIdx - 1); return; }
    if (/^[a-xA-X]$/.test(k)) {
      selectLetter(k.toUpperCase());
      if (currentView === 'tabla') showView('practicar');
    }
  });

  // ================= Menus =================
  const VIEWS = ['practicar', 'crono', 'entrenar', 'aprender', 'retos', 'tabla', 'ajustes'];
  const VIEW_KEY = 'op3bld:view:v1';
  const viewHooks = {};
  let currentView = 'practicar';
  function showView(name, opts) {
    const o = opts || {};
    if (!VIEWS.includes(name)) name = 'practicar';
    if (name !== 'crono' && focus.on) setFocus(false);
    const changed = name !== currentView;
    currentView = name;
    document.querySelectorAll('.view').forEach((el) => { el.hidden = el.dataset.view !== name; });
    document.querySelectorAll('[data-go]').forEach((b) => {
      if (b.dataset.go === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    try { localStorage.setItem(VIEW_KEY, name); } catch (e) { /* not kept */ }
    try { history.replaceState(null, '', `${location.pathname}${location.search}#${name}`); } catch (e) { /* sandboxed */ }
    if (changed && !o.keepScroll) { try { window.scrollTo(0, 0); } catch (e) { /* no layout */ } }
    if (name === 'practicar') fitScramble();
    (viewHooks[name] || []).forEach((fn) => fn());
  }
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.go)));
  window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    if (VIEWS.includes(h) && h !== currentView) showView(h, { keepScroll: true });
  });
  // Puts a scramble and memo into «Practicar» (used by lessons and challenges).
  function loadPractice(scr, memoE, memoC) {
    $('scr').value = scr;
    $('memoE').value = memoE || '';
    $('memoC').value = memoC || '';
    if (ui.base !== 'scramble') setBase('scramble');
    buildTokens(); ui.memoIdx = -1; renderTokens(); refreshViewer(); save();
    $('result').textContent = ''; $('result').className = 'result';
    fitScramble();
  }

  window.OP3 = {
    STICKERS, FACE_ORDER, MODES, ALGS, LETTERS, PIECE_OF, NET_PLACE, COLOR_NAME, SPEFFZ_FACES,
    parseAlg, invertAlg, apply, solved, conjugate, isSolved, pieceName, faceOfSticker,
    judgeSetup, traceKind, traceMemo, errorText, generateFor, pairs, lettersOf, fmt, esc, tokenAlg, optimalMemo,
    buildNet, paintCells,
    requestScramble, withTimeout, randomMoveScramble,
    showView, currentView: () => currentView,
    onView: (name, fn) => { (viewHooks[name] = viewHooks[name] || []).push(fn); },
    onKey: { entrenar: spoilerKey },
    loadPractice, openGuide, timerTag: null,
    showTimer: () => showView('crono'),
    timerState, trainLetters,
    // For the smart cube: drive the clock as Space would, and redraw competition mode.
    clock: {
      phase: () => timer.phase, press: timerPress, mark: markResult, cancel: timerCancel,
      quiet: (ms) => { timer.quietUntil = performance.now() + ms; },
    },
    refreshFocus: () => { if (focus.on) renderFocus(); },
    resultExtra: null, scrHtml: null,
    scramble: () => $('scr').value.trim(),
    data: {
      times: () => times,
      setTimes: (arr) => { times = arr; saveTimes(); renderTimes(); },
      train: () => trainData,
      setTrain: (obj) => { trainData = obj; saveTrain(); renderTrainStats(); },
    },
  };

  // ---- Start ----
  $('scr').value = saved.scr ?? DEFAULTS.scr;
  fitScramble();
  $('memoE').value = saved.memoE ?? DEFAULTS.memoE;
  $('memoC').value = saved.memoC ?? DEFAULTS.memoC;
  if (['full', 'edges', 'corners'].includes(saved.scrKind)) $('scrKind').value = saved.scrKind;
  renderTimes();
  setTrainKind('edge');
  if (saved.railCollapsed && window.matchMedia('(max-width: 860px)').matches) {
    $('rail').classList.add('collapsed');
    $('railToggle').textContent = 'Mostrar';
    $('railToggle').setAttribute('aria-expanded', 'false');
  }
  buildTokens();
  $('baseScr').setAttribute('aria-pressed', String(ui.base === 'scramble'));
  $('baseSolved').setAttribute('aria-pressed', String(ui.base === 'solved'));
  $('modeEdge').setAttribute('aria-pressed', String(ui.mode === 'edge'));
  $('modeCorner').setAttribute('aria-pressed', String(ui.mode === 'corner'));
  renderBoard();
  if (!/^[A-X]$/.test(saved.letter || '')) {
    ui.memoIdx = 0;
    renderTokens();
    selectLetter(ui.tokens[0] && ui.tokens[0].kind === ui.mode ? ui.tokens[0].L : 'K', true);
  } else {
    renderTokens();
    selectLetter(MODES[ui.mode].buffer.includes(ui.letter) ? MODES[ui.mode].swap : ui.letter);
  }
  const startView = (() => {
    const h = location.hash.slice(1);
    if (VIEWS.includes(h)) return h;
    try { return localStorage.getItem(VIEW_KEY) || 'practicar'; } catch (e) { return 'practicar'; }
  })();
  currentView = '';
  showView(startView, { keepScroll: true });
})();
