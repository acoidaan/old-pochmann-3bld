// 3BLD · «Aprender → M2»: the M2 method for the edges (the corners stay with Old Pochmann), to learn it from
// the page: what it is, every letter with its algorithm turning on a cube in 3D (notation.js), the four
// special letters, parity, the memo from the new buffer, and two drills (the letters, and a whole edge memo
// checked by solving the cube with it). Same Speffz letters as the rest of the page (core.js, window.OP3).
(() => {
  'use strict';
  const OP = window.OP3;
  const N = window.CubeNotation;
  const root = document.getElementById('m2');
  if (!OP || !N || !root) return;
  // Which method «Aprender» shows: Old Pochmann's lessons or M2 (kept per device).
  const COURSE = 'op3bld:course:v1';
  function course(c) {
    document.querySelectorAll('[data-course]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.course === c)));
    document.getElementById('m2Panel').hidden = c !== 'm2';
    document.getElementById('learnPanel').hidden = c === 'm2';
    try { localStorage.setItem(COURSE, c); } catch (e) { /* not kept */ }
  }
  document.querySelectorAll('[data-course]').forEach((b) => b.addEventListener('click', () => course(b.dataset.course)));
  try { if (localStorage.getItem(COURSE) === 'm2') course('m2'); } catch (e) { /* Old Pochmann */ }
  const { MODES, LETTERS, PIECE_OF, apply, solved, parseAlg, isSolved, pieceName, faceOfSticker, esc } = OP;
  const M = window.CubeModel;

  // ================= The method =================
  // Buffer DF (U, and K on its other side); the M2 swaps DF with UB (A). For each letter: a setup that takes it
  // to UB without touching the middle layer, M2, and the setup undone. C, W, I and S are on the middle layer
  // itself: they have their own, and as the second letter of a pair (an odd number of M2 done, the layer
  // upside down) C and W swap algorithms, and so do I and S. Every one checked in tests/e2e/bld-m2.js by
  // solving random cubes with it.
  const ALG = {
    A: 'M2', B: "R U R' U' M2 U R U' R'", C: "U2 M' U2 M'", D: "L' U' L U M2 U' L' U L",
    E: "B L' B' M2 B L B'", F: "B L2 B' M2 B L2 B'", G: "B L B' M2 B L' B'", H: "L' B L B' M2 B L' B' L",
    I: "D M' U R2 U' M U R2 U' D' M2", J: "U R U' M2 U R' U'", L: "U' L' U M2 U' L U",
    M: "B' R B M2 B' R' B", N: "R' B' R B M2 B' R' B R", O: "B' R' B M2 B' R B", P: "B' R2 B M2 B' R2 B",
    Q: "B' R B U R2 U' M2 U R2 U' B' R' B", R: "U' L U M2 U' L' U", S: "M2 D U R2 U' M' U R2 U' M D'",
    T: "U R' U' M2 U R U'", V: "U R2 U' M2 U R2 U'", W: 'M U2 M U2', X: "U' L2 U M2 U' L2 U",
  };
  const SPECIAL = { C: 'W', W: 'C', I: 'S', S: 'I' };
  const PARITY = "D' L2 D M2 D' L2 D";
  const BUFFER = ['U', 'K'];
  const TARGETS = LETTERS.filter((L) => !BUFFER.includes(L));
  const EDGE = MODES.edge.posOf;
  const algFor = (L, second) => ALG[second && SPECIAL[L] ? SPECIAL[L] : L];
  // The parts of a letter's algorithm: setup, M2, setup undone (none for A and the special ones).
  function partsOf(L) {
    const t = ALG[L].split(' ');
    const i = t.indexOf('M2');
    if (L === 'A' || SPECIAL[L] || i <= 0) return null;
    return { setup: t.slice(0, i).join(' '), undo: t.slice(i + 1).join(' ') };
  }
  // All the edges of a memo, as you would do them: special ones swapped as second of a pair, parity if odd.
  function execEdges(letters) {
    const out = letters.map((L, i) => algFor(L, i % 2 === 1));
    if (letters.length % 2) out.push(PARITY);
    return out.join(' ');
  }

  // ================= Tracing a memo =================
  // Follows the buffer: what is in it says the next letter; when its own piece comes back, a cycle break to
  // the first unsolved piece in letter order (any other break is just as good: the check solves the cube).
  function trace(st, kind, buffer) {
    const m = MODES[kind];
    const bufPiece = new Set(buffer.flatMap((b) => PIECE_OF[m.posOf[b]]));
    const all = LETTERS.map((L) => m.posOf[L]).filter((p) => p != null && !bufPiece.has(p));
    const done = new Set();
    const out = [];
    let s = st[m.posOf[buffer[0]]];
    let open = null;
    for (let g = 0; g < 80; g++) {
      if (bufPiece.has(s)) {
        const next = all.find((p) => !done.has(p) && !PIECE_OF[p].every((q) => st[q] === q));
        if (next == null) return out;
        out.push(m.letterOf[next]);
        PIECE_OF[next].forEach((q) => done.add(q));
        open = next;
        s = st[next];
        continue;
      }
      out.push(m.letterOf[s]);
      if (open != null && PIECE_OF[open].includes(s)) { open = null; s = [...bufPiece][0]; continue; }
      PIECE_OF[s].forEach((q) => done.add(q));
      s = st[s];
    }
    return out;
  }
  const cornersOf = (st) => trace(st, 'corner', ['E', 'A', 'R']);
  const execCorners = (letters) => letters.map((L) => OP.conjugate(MODES.corner.table[L], OP.ALGS.Y.moves)).join(' ');
  // Does this edge memo solve the cube (with your corners as Old Pochmann does them)? Edges first, then parity,
  // then the corners.
  const solves = (st, edges) => isSolved(apply(st, [execEdges(edges), execCorners(cornersOf(st))].filter(Boolean).join(' ')));

  // ================= Progress =================
  const KEY = 'op3bld:m2:v1';
  const NEED = 3;
  let prog = { k: {} };
  try { prog = { k: {}, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { /* none yet */ }
  const saveProg = () => {
    try { localStorage.setItem(KEY, JSON.stringify(prog)); } catch (e) { /* not kept */ }
    renderProgress();
  };
  const known = (L) => (prog.k[L] || 0) >= NEED;
  function renderProgress() {
    const n = TARGETS.filter(known).length;
    const el = document.getElementById('m2Progress');
    if (el) el.textContent = n === TARGETS.length ? '¡Te sabes las 22!' : `Te sabes ${n} de ${TARGETS.length} letras`;
    root.querySelectorAll('[data-m2-letter]').forEach((b) => b.classList.toggle('known', known(b.dataset.m2Letter)));
  }

  // ================= Words =================
  const FACE = { U: 'arriba', D: 'abajo', F: 'delante', B: 'detrás', R: 'la derecha', L: 'la izquierda' };
  const where = (L) => `la arista ${pieceName(EDGE[L])}, su pegatina de ${FACE[faceOfSticker(EDGE[L])]}`;
  const movesHtml = (alg, cls) => parseAlg(alg).map((m) => `<span class="m2-mv${cls ? ` ${cls}` : ''}">${esc(m.text)}</span>`).join('');
  function algHtml(L, second) {
    const use = second && SPECIAL[L] ? SPECIAL[L] : L;
    const p = partsOf(use);
    if (!p) return movesHtml(ALG[use], use === 'A' ? 'm2-m' : '');
    return `${movesHtml(p.setup, 'm2-s')}${movesHtml('M2', 'm2-m')}${movesHtml(p.undo, 'm2-u')}`;
  }
  function aboutLetter(L, second) {
    if (L === 'A') return 'A es la propia UB: sin setup, solo M2, que cambia DF y UB.';
    if (SPECIAL[L]) {
      return `${L} está en la capa del medio, que M2 mueve: tiene su propio algoritmo. ${second
        ? `Como segunda letra de una pareja (con la capa del medio dada la vuelta), se hace el de ${SPECIAL[L]}.`
        : `Como segunda letra de una pareja, se hace el de ${SPECIAL[L]}.`}`;
    }
    const p = partsOf(L);
    return `El setup <b>${esc(p.setup)}</b> lleva ${L} a UB (la A) sin tocar la capa del medio; M2 la cambia por el buffer, y <b>${esc(p.undo)}</b> lo deshace.`;
  }

  // ================= The page =================
  root.innerHTML = `
      <div class="m2-intro m2-sec">
      <h3>Qué es M2</h3>
      <p>Otra forma de hacer las <b>aristas</b> a ciegas, más rápida que la T-perm de Old Pochmann: casi todas las letras son un setup corto, <b>M2</b> y deshacer el setup. Las <b>esquinas siguen igual</b>, con Old Pochmann, y las letras son las mismas (Speffz).</p>
      <ul>
        <li><b>Buffer: DF</b>, la arista de abajo delante (letras <b>U</b> y <b>K</b>). Es la que lees al empezar la memo.</li>
        <li><b>M2</b> cambia DF por <b>UB</b> (la <b>A</b>). Así que para cada letra: llévala a UB sin tocar la capa del medio, M2, y deshaz el setup.</li>
        <li>Las letras de la capa del medio, <b>C, W, I y S</b>, son especiales (más abajo).</li>
        <li>Se hace con el <b>blanco arriba y el verde delante</b>, sin girar el cubo.</li>
      </ul>
      <p class="hint">Toca una letra y mírala en el cubo (lo puedes arrastrar). En los algoritmos, el setup va en un color, M2 en otro y lo que lo deshace en el tercero.</p>
    </div>
    <div class="m2-top">
      <figure class="m2-stage">
        <div class="m2-cube" id="m2Cube"></div>
        <figcaption class="m2-now" id="m2Now" aria-live="polite"></figcaption>
        <p class="m2-algline" id="m2Line"></p>
        <div class="m2-acts"><button class="btn" type="button" id="m2Again" disabled>Otra vez</button></div>
      </figure>
      <section class="m2-sec m2-side" aria-labelledby="m2hLetters">
        <h3 id="m2hLetters">Las letras</h3>
        <div class="m2-letters">${LETTERS.map((L) => (BUFFER.includes(L)
          ? `<span class="m2-letter buf" title="${L}: el buffer">${L}<small>buffer</small></span>`
          : `<button type="button" class="m2-letter${SPECIAL[L] ? ' sp' : ''}" data-m2-letter="${L}" aria-label="${L}: ${esc(where(L))}">${L}<small>${pieceName(EDGE[L])}</small></button>`)).join('')}</div>
        <div class="m2-detail" id="m2Detail" hidden></div>
      </section>
    </div>
    <section class="m2-sec" aria-labelledby="m2hSp">
      <h3 id="m2hSp">Las cuatro especiales: C, W, I y S</h3>
      <p>Son las aristas de la capa del medio, la que mueve M2: no se pueden llevar a UB como las demás. Además, cada M2 le da la vuelta a esa capa, así que <b>depende de si son la primera o la segunda letra de una pareja</b>: como segunda, C y W se cambian el algoritmo, y también I y S.</p>
      <table class="m2-table">
        <thead><tr><th scope="col">Letra</th><th scope="col">Primera de la pareja</th><th scope="col">Segunda de la pareja</th></tr></thead>
        <tbody>${['C', 'W', 'I', 'S'].map((L) => `<tr><th scope="row">${L} <small>${pieceName(EDGE[L])}</small></th><td><button type="button" class="m2-play" data-m2-letter="${L}" data-m2-second="0">${movesHtml(ALG[L])}</button></td><td><button type="button" class="m2-play" data-m2-letter="${L}" data-m2-second="1">${movesHtml(ALG[SPECIAL[L]])}</button></td></tr>`).join('')}</tbody>
      </table>
      <p class="hint">Un truco para no liarte: cuenta las letras de aristas de dos en dos, como las memorizas. Si la especial es la segunda de su pareja, haz la de su compañera.</p>
    </section>
    <section class="m2-sec" aria-labelledby="m2hPar">
      <h3 id="m2hPar">Paridad</h3>
      <p>Si tienes un número <b>impar</b> de letras de aristas, al acabarlas haz <button type="button" class="m2-play" data-m2-alg="${esc(PARITY)}">${movesHtml(PARITY)}</button> y luego las esquinas con Old Pochmann, como siempre. Con M2 no hace falta la R-perm: este algoritmo arregla la capa del medio y deja las dos aristas que la Y-perm de las esquinas vuelve a cambiar.</p>
      <p class="hint">El orden importa: primero las aristas (M2), luego la paridad si toca y al final las esquinas.</p>
    </section>
    <section class="m2-sec" aria-labelledby="m2hMemo">
      <h3 id="m2hMemo">La memo de aristas</h3>
      <p>Igual que en Old Pochmann, pero <b>empezando por DF</b>: mira qué pegatina hay en DF (la de abajo), esa es tu primera letra; sigue a donde va su pieza, y así. Cuando vuelva la pieza del buffer (U o K), rompe el ciclo con cualquier arista que no esté resuelta. Las esquinas, como siempre.</p>
    </section>
    <section class="m2-sec" aria-labelledby="m2hDrill">
      <h3 id="m2hDrill">Practica las letras</h3>
      <div class="m2-drill" id="m2Drill"></div>
    </section>
    <section class="m2-sec" aria-labelledby="m2hMemoTry">
      <h3 id="m2hMemoTry">Practica una memo</h3>
      <div class="m2-memo" id="m2Memo"></div>
    </section>`;
  renderProgress();

  // ---------- The cube ----------
  const cube = N.player(document.getElementById('m2Cube'), { up: 'white', label: 'El cubo, con el blanco arriba y el verde delante' });
  const now = document.getElementById('m2Now');
  const line = document.getElementById('m2Line');
  const again = document.getElementById('m2Again');
  let last = null;
  now.textContent = 'Toca una letra para verla.';
  const stage = root.querySelector('.m2-stage');
  // On a phone the algorithms' rail is stuck to the top: the cube sticks just under it (and not at all if the
  // rail, open, takes too much of the screen).
  const rail = document.getElementById('rail');
  function underRail() {
    const stuck = rail && getComputedStyle(rail).position === 'sticky' && window.innerWidth < 700;
    const h = stuck ? rail.getBoundingClientRect().height : 0;
    root.style.setProperty('--m2-top', `${Math.round(h)}px`);
    root.classList.toggle('m2-nostick', h > window.innerHeight * 0.4);
  }
  if (rail && window.ResizeObserver) new ResizeObserver(underRail).observe(rail);
  window.addEventListener('resize', underRail);
  underRail();
  function show(alg, title, from, stay) {
    last = { alg, title, from };
    const r = stage.getBoundingClientRect();
    if (!stay && (r.bottom < 0 || r.top > window.innerHeight)) stage.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    again.disabled = false;
    now.innerHTML = title;
    line.innerHTML = movesHtml(alg);
    const marks = line.querySelectorAll('.m2-mv');
    cube.play(alg, { from, onMove: (i) => marks.forEach((m, k) => (k === i ? m.setAttribute('aria-current', 'step') : m.removeAttribute('aria-current'))) });
  }
  again.addEventListener('click', () => { if (last) show(last.alg, last.title, last.from); });
  const showLetter = (L, second, stay) => show(algFor(L, second), `<b>${L}</b> ${esc(where(L))}${SPECIAL[L] ? (second ? ' · como segunda de la pareja' : ' · como primera de la pareja') : ''}`, null, stay);

  root.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-m2-letter], [data-m2-alg]');
    if (!b || b.closest('#m2Drill') || b.closest('#m2Memo')) return;
    if (b.dataset.m2Alg) { show(b.dataset.m2Alg, '<b>Paridad</b> después de las aristas, antes de las esquinas'); return; }
    const L = b.dataset.m2Letter;
    const second = b.dataset.m2Second === '1';
    showLetter(L, second);
    if (b.classList.contains('m2-letter')) {
      root.querySelectorAll('.m2-letter[aria-pressed]').forEach((x) => x.removeAttribute('aria-pressed'));
      b.setAttribute('aria-pressed', 'true');
      const d = document.getElementById('m2Detail');
      d.hidden = false;
      d.innerHTML = `<p class="m2-big"><b>${L}</b> · ${esc(where(L))}</p><p class="m2-alg">${algHtml(L, false)}</p>${SPECIAL[L] ? `<p class="m2-alg"><span class="hint">Como segunda de la pareja:</span> ${algHtml(L, true)}</p>` : ''}<p class="hint">${aboutLetter(L, false)}</p>`;
    }
  });

  // ---------- Drill: the letters ----------
  const drill = { L: null, second: false, open: false };
  function nextLetter() {
    const pool = TARGETS.filter((L) => !known(L));
    const from = pool.length ? pool : TARGETS;
    let L;
    do { L = from[Math.floor(Math.random() * from.length)]; } while (from.length > 1 && L === drill.L);
    drill.L = L;
    drill.second = !!SPECIAL[L] && Math.random() < 0.5;
    drill.open = false;
    renderDrill();
  }
  function renderDrill() {
    const box = document.getElementById('m2Drill');
    const L = drill.L;
    const streak = prog.k[L] || 0;
    box.innerHTML = `<p class="m2-q"><span class="m2-qletter">${L}</span><span>${esc(where(L))}${SPECIAL[L] ? `<br><b>${drill.second ? 'Segunda' : 'Primera'} letra de la pareja</b>` : ''}</span></p>
      ${drill.open
        ? `<p class="m2-alg">${algHtml(L, drill.second)}</p><div class="actions"><button class="btn primary" type="button" data-m2-drill="ok">Me lo sabía</button><button class="btn" type="button" data-m2-drill="no">No me lo sabía</button></div>`
        : '<p class="hint">Piensa (o haz) su algoritmo y míralo.</p><div class="actions"><button class="btn primary" type="button" data-m2-drill="show">Ver el algoritmo</button><button class="btn" type="button" data-m2-drill="skip">Otra letra</button></div>'}
      <p class="hint">${known(L) ? 'Esta ya te la sabes.' : `Seguidas bien: ${streak} de ${NEED} para dártela por sabida.`} Salen más las que aún no te sabes.</p>`;
  }
  document.getElementById('m2Drill').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-m2-drill]');
    if (!b) return;
    const what = b.dataset.m2Drill;
    if (what === 'show') {
      drill.open = true;
      renderDrill();
      showLetter(drill.L, drill.second, true);
      return;
    }
    if (what === 'ok' || what === 'no') {
      prog.k[drill.L] = what === 'ok' ? (prog.k[drill.L] || 0) + 1 : 0;
      saveProg();
    }
    nextLetter();
  });
  nextLetter();

  // ---------- Drill: a whole memo ----------
  const memo = { scr: '', st: null, tries: 0 };
  function newMemo() {
    memo.scr = M.randomMoveScramble(20);
    memo.st = apply(solved(), memo.scr);
    memo.tries = 0;
    renderMemo('');
  }
  function renderMemo(msg, good) {
    const box = document.getElementById('m2Memo');
    box.innerHTML = `<p>Mezcla tu cubo con el blanco arriba y el verde delante (o míralo en el cubo de arriba, con «Ver la mezcla») y escribe la memo de <b>aristas</b> para M2:</p>
      <p class="m2-scr" id="m2Scr">${esc(memo.scr)}</p>
      <form class="m2-memo-form" id="m2MemoForm">
        <label class="sr-only" for="m2MemoIn">Tu memo de aristas</label>
        <input class="text-input" id="m2MemoIn" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Por ejemplo: AB CD E">
        <button class="btn primary" type="submit">Comprobar</button>
      </form>
      <div class="actions"><button class="btn" type="button" data-m2-memo="see">Ver la mezcla</button><button class="btn" type="button" data-m2-memo="answer">Ver una memo buena</button><button class="btn" type="button" data-m2-memo="new">Otra mezcla</button></div>
      <p class="${good ? 'm2-good' : 'notice'}" id="m2MemoMsg" role="status">${msg}</p>`;
  }
  const answer = () => trace(memo.st, 'edge', BUFFER);
  const pairs = (letters) => letters.join('').replace(/(..)/g, '$1 ').trim();
  document.getElementById('m2Memo').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const typed = document.getElementById('m2MemoIn').value.toUpperCase().replace(/[^A-X]/g, '').split('');
    memo.tries++;
    const bad = typed.find((L) => BUFFER.includes(L));
    if (bad) { renderMemo(`${bad} es el buffer: no se usa como letra.`); return; }
    if (typed.length && solves(memo.st, typed)) {
      renderMemo(`✓ Bien: ${pairs(typed)} (${typed.length} ${typed.length === 1 ? 'letra' : 'letras'}${typed.length % 2 ? ', con paridad' : ''}). Con esa memo, las aristas quedan resueltas.`, true);
      return;
    }
    renderMemo(`No resuelve las aristas${memo.tries > 1 ? `. Una buena empieza por ${answer()[0]}` : ''}. Revisa la primera letra: la pegatina que hay en DF.`);
  });
  document.getElementById('m2Memo').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-m2-memo]');
    if (!b) return;
    if (b.dataset.m2Memo === 'new') newMemo();
    else if (b.dataset.m2Memo === 'see') {
      cube.set(memo.st);
      stage.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      now.innerHTML = '<b>La mezcla</b> arrástralo para ver todas las caras';
      line.textContent = memo.scr;
    } else {
      const a = answer();
      renderMemo(`Una memo buena: <b>${pairs(a)}</b>${a.length % 2 ? ' (impar: con paridad)' : ''}. Si rompes ciclos por otra arista, la tuya puede ser distinta y valer igual.`);
    }
  });
  newMemo();

  window.BldM2 = { ALG, SPECIAL, PARITY, TARGETS, execEdges, trace, solves };
})();
