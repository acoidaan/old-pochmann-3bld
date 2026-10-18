// Old Pochmann 3BLD · «Aprender»: nine interactive lessons built on the cube model in core.js.
(() => {
  'use strict';
  const OP = window.OP3;
  const root = document.getElementById('learn');
  if (!OP || !root) return;
  const { MODES, ALGS, LETTERS, PIECE_OF, apply, solved, parseAlg, invertAlg, conjugate, pieceName, faceOfSticker, COLOR_NAME } = OP;

  // ---------------- Progress ----------------
  const KEY = 'op3bld:learn:v1';
  function loadProgress() {
    try {
      const p = JSON.parse(localStorage.getItem(KEY)) || {};
      return { done: p.done || {}, lesson: p.lesson || 0, step: p.step || 0 };
    } catch (e) { return { done: {}, lesson: 0, step: 0 }; }
  }
  let progress = loadProgress();
  function saveProgress(changedDone) {
    try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch (e) { /* not kept */ }
    if (changedDone) document.dispatchEvent(new CustomEvent('op3:changed', { detail: { what: 'learn' } }));
  }

  // ---------------- Helpers ----------------
  const posOf = (kind, L) => MODES[kind].posOf[L];
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const targets = (kind) => LETTERS.filter((L) => !MODES[kind].buffer.includes(L));
  const shot = (kind, L) => conjugate(MODES[kind].table[L], ALGS[MODES[kind].alg].moves);
  function execAlg(edges, corners) {
    const parts = edges.map((L) => shot('edge', L));
    if (edges.length % 2) parts.push(ALGS.P.moves);
    corners.forEach((L) => parts.push(shot('corner', L)));
    return parts.join(' ');
  }
  // A cube whose memo is exactly these letters: undo their execution from solved.
  const scrambledBy = (edges, corners) => apply(solved(), invertAlg(execAlg(edges, corners)));
  const changedSet = (st) => new Set(st.map((v, i) => (v !== i ? i : -1)).filter((i) => i >= 0));
  const unsolvedOf = (st, kind) => {
    const m = MODES[kind];
    const buf = m.buffer.map((b) => m.posOf[b]);
    return new Set(Object.keys(m.letterOf).map(Number).filter((p) => !buf.includes(p) && !PIECE_OF[p].every((q) => st[q] === q)));
  };
  const piecesSet = (st, kind) => {
    const out = new Set();
    unsolvedOf(st, kind).forEach((p) => PIECE_OF[p].forEach((q) => out.add(q)));
    return out;
  };
  const setupLen = (kind, L) => parseAlg(MODES[kind].table[L] || '').length;
  const pairsOf = (arr) => arr.join('').replace(/(..)/g, '$1 ').trim();
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  const faceText = (pos) => { const f = faceOfSticker(pos); return `cara ${f} (${COLOR_NAME[f]})`; };

  // ---------------- Cube net used by the lessons ----------------
  function createNet() {
    const net = el('div', 'net');
    net.setAttribute('aria-label', 'Cubo desplegado');
    const cells = [];
    for (const f of ['U', 'L', 'F', 'R', 'B', 'D']) {
      const face = el('div', 'face');
      face.style.gridRow = OP.NET_PLACE[f][0];
      face.style.gridColumn = OP.NET_PLACE[f][1];
      const base = OP.FACE_ORDER.indexOf(f) * 9;
      for (let k = 0; k < 9; k++) {
        const c = el('div', 'cell');
        c.dataset.pos = String(base + k);
        face.appendChild(c);
        cells[base + k] = c;
      }
      net.appendChild(face);
    }
    const api = { el: net, onTap: null };
    net.addEventListener('click', (ev) => {
      const c = ev.target.closest('.cell');
      if (c && api.onTap && net.classList.contains('tap')) api.onTap(Number(c.dataset.pos));
    });
    // opts: labels ('edge' | 'corner'), centers, marks (Map pos → {label, cls}), hl (Set), swap (pos), tap
    api.paint = (state, o = {}) => {
      net.classList.toggle('tap', !!o.tap);
      const mode = o.labels ? MODES[o.labels] : null;
      for (let pos = 0; pos < 54; pos++) {
        const f = faceOfSticker(state[pos]);
        const c = cells[pos];
        c.style.backgroundColor = `var(--st-${f})`;
        c.classList.toggle('dark-text', f === 'U' || f === 'D');
        c.classList.toggle('light-text', !(f === 'U' || f === 'D'));
        c.classList.toggle('hl', !!(o.hl && o.hl.has(pos)));
        c.classList.toggle('swap', o.swap === pos);
        const mk = o.marks && o.marks.get(pos);
        let html = '';
        if (mk) html = `<span class='badge ${mk.cls}'>${mk.label}</span>`;
        else if (mode && mode.letterOf[pos]) html = `<span class=lab>${mode.letterOf[pos]}</span>`;
        else if (o.centers && pos % 9 === 4) html = `<span class='lab center'>${OP.FACE_ORDER[Math.floor(pos / 9)]}</span>`;
        c.innerHTML = html;
      }
    };
    api.flash = (pos, ok) => {
      const c = cells[pos];
      c.classList.remove('flash-ok', 'flash-bad');
      void c.offsetWidth;
      c.classList.add(ok ? 'flash-ok' : 'flash-bad');
    };
    return api;
  }
  const marks = (list) => new Map(list.map((m) => [m.pos, m]));
  const trackMarks = (state, list) => new Map(list.map((m) => [state.indexOf(m.sticker), m]));

  // ---------------- Positions and example cubes ----------------
  const E = (L) => posOf('edge', L);
  const C = (L) => posOf('corner', L);
  const BUF_E = [{ pos: E('B'), label: 'B', cls: 'buf' }, { pos: E('M'), label: 'M', cls: 'buf' }];
  const BUF_C = [{ pos: C('A'), label: 'A', cls: 'buf' }, { pos: C('E'), label: 'E', cls: 'buf' }, { pos: C('R'), label: 'R', cls: 'buf' }];
  const S_MEMO1 = scrambledBy(['K', 'I', 'E', 'X'], []);
  const S_MEMO2 = scrambledBy(['W', 'J', 'H', 'L', 'Q', 'N'], []);
  const S_CYCLE = scrambledBy(['X', 'I', 'E', 'X'], []);
  const S_FLIP = scrambledBy(['C', 'I', 'U', 'K'], []);
  const S_PARITY = scrambledBy(['K', 'I', 'E'], ['O']);
  const S_CORNERS = scrambledBy([], ['O', 'U', 'S', 'C']);
  const S_TWIST = scrambledBy([], ['C', 'J', 'W', 'O']);
  const FINAL_SCR = "F2 D' B2 L2 U R2 U' F2 U' B2 R2 D2 R U' F2 U R' D2";
  const S_FINAL = apply(solved(), FINAL_SCR);

  // Steps of one letter: setup moves, algorithm, undo moves.
  function letterDemo(kind, L) {
    const mode = MODES[kind];
    const setup = parseAlg(mode.table[L] || '');
    const undo = parseAlg(mode.table[L] ? invertAlg(mode.table[L]) : '');
    const alg = ALGS[mode.alg];
    const steps = [{ alg: '', label: 'Inicio', text: `Inicio: la ${L} está en ${pieceName(posOf(kind, L))}, ${faceText(posOf(kind, L))}.` }];
    setup.forEach((m, i) => steps.push({
      alg: m.text, label: m.text,
      text: `Setup ${i + 1}/${setup.length}: <b>${m.text}</b>` + (i === setup.length - 1 ? ` → la ${L} ya está en ${mode.swap}.` : ''),
    }));
    steps.push({ alg: alg.moves, label: alg.name, text: `${alg.name}: la pegatina del buffer (${mode.read}) entra en ${mode.swap} y la ${L} pasa al buffer.` });
    undo.forEach((m, i) => steps.push({
      alg: m.text, label: m.text,
      text: `Deshacer ${i + 1}/${undo.length}: <b>${m.text}</b>` + (i === undo.length - 1 ? ` → la pegatina del buffer ha acabado en ${L}. ¡Listo!` : ''),
    }));
    return steps;
  }
  function parityDemo() {
    const steps = [{ alg: '', label: 'Inicio', text: 'Este cubo tiene 3 letras de aristas (K I E) y 1 de esquinas (O). Las pegatinas marcadas son las que están fuera de su sitio.' }];
    ['K', 'I', 'E'].forEach((L, i) => steps.push({
      alg: shot('edge', L), label: L,
      text: i < 2 ? `Arista ${L}: setup, T-perm y deshacer.`
        : 'Aristas terminadas… pero como has hecho 3 T-perms (impar), las esquinas UFR y UBR se han quedado cambiadas.',
    }));
    steps.push({ alg: ALGS.P.moves, label: 'R-perm', text: 'R-perm: UFR y UBR vuelven a su sitio. A cambio, las aristas UL y UB quedan cambiadas.' });
    steps.push({ alg: shot('corner', 'O'), label: 'O', text: 'Esquina O: la Y-perm también cambia UL y UB, así que las devuelve a su sitio. ¡Cubo resuelto!' });
    return steps;
  }
  function parityQuestion() {
    const n = 5 + Math.floor(Math.random() * 8);
    const pool = shuffle(targets('edge').slice());
    const letters = Array.from({ length: n }, (_, i) => pool[i % pool.length]);
    const odd = n % 2 === 1;
    return {
      q: `Memo de aristas: <code>${pairsOf(letters)}</code>. ¿Hay paridad?`,
      options: ['Sí, hago la R-perm', 'No'],
      answer: odd ? 0 : 1,
      explain: odd ? `Son ${n} letras: número impar, así que sí.` : `Son ${n} letras: número par, así que no.`,
    };
  }

  // ---------------- Lessons ----------------
  const T = ALGS.T;
  const LESSONS = [
    {
      id: 'orientacion', title: 'Orientación y letras', steps: [
        { html: '<p>Sujeta siempre el cubo igual: <b>blanco arriba y verde delante</b>. Así, el rojo queda a la derecha, el naranja a la izquierda, el azul detrás y el amarillo abajo.</p>', cube: { state: solved(), centers: true } },
        { html: '<p>En la app ves el cubo <b>desplegado</b>, como una caja de cartón abierta: arriba (U) encima de delante (F); a los lados, izquierda (L) y derecha (R); detrás (B) a la derecha del todo, y abajo (D) debajo de F.</p><p>Cada cara se ve como si la miraras de frente.</p>', cube: { state: solved(), centers: true } },
        { html: '<p>Cada pegatina de <b>arista</b> tiene una letra de la A a la X. En cada cara empiezas arriba y sigues en el sentido de las agujas del reloj: arriba, derecha, abajo, izquierda.</p><p>Las caras van en este orden: U (A–D), L (E–H), F (I–L), R (M–P), B (Q–T) y D (U–X).</p>', cube: { state: solved(), labels: 'edge' } },
        { html: '<p>Las <b>esquinas</b> usan las mismas 24 letras: en cada cara empiezas por la esquina de arriba a la izquierda y sigues también en sentido horario.</p>', cube: { state: solved(), labels: 'corner' } },
        { html: '<p>Ahora tú. El cubo no tiene letras: encuentra cada pegatina.</p>', task: { type: 'tap', kind: 'edge', rounds: 5 } },
        { html: '<p>Y lo mismo con las esquinas.</p>', task: { type: 'tap', kind: 'corner', rounds: 4 } },
      ],
    },
    {
      id: 'buffer', title: 'Buffer y T-perm', steps: [
        { html: '<p>En Old Pochmann resuelves las aristas <b>de una en una</b>, siempre desde la misma posición: el <b>buffer</b>. El tuyo es la arista <b>UR</b>: su pegatina blanca es la <b>B</b> y la roja, la <b>M</b>.</p>', cube: { state: solved(), marks: marks(BUF_E) } },
        { html: '<p>La pieza del buffer se manda a su sitio intercambiándola con la posición <b>D</b>, la pegatina blanca de UL. Eso lo hace la <b>T-perm</b>: cambia lo que hay en B por lo que hay en D.</p>', cube: { state: solved(), marks: marks([{ pos: E('B'), label: 'B', cls: 'buf' }, { pos: E('D'), label: 'D', cls: 'tgt' }]), swap: E('D') } },
        {
          html: '<p>Pulsa los pasos para ver qué hace la T-perm en un cubo resuelto. Las pegatinas que cambian quedan marcadas.</p>',
          demo: {
            base: solved(), hlChanged: true, steps: [
              { alg: '', label: 'Resuelto', text: 'Cubo resuelto.' },
              { alg: T.moves, label: 'T-perm', text: 'Tras la T-perm, las aristas UR y UL se han intercambiado… y también las esquinas UFR y UBR. Ese cambio de esquinas es el origen de la paridad (lección 7).' },
            ],
          },
        },
        { html: '<p>Comprueba que lo has visto.</p>', task: { type: 'pieces', state: apply(solved(), T.moves), pieces: [E('B'), E('D'), C('C'), C('B')], prompt: 'Toca las <b>4 piezas</b> que ha movido la T-perm.' } },
        { html: '<p>La idea clave del método:</p>', task: { type: 'choice', q: 'En el buffer está la pegatina K. ¿A dónde tiene que ir?', options: ['A la posición K', 'A la posición D', 'Se queda en el buffer'], answer: 0, explain: 'Cada letra es un destino: la K va a la posición K. Para llevarla hasta allí usarás un setup y la T-perm.' } },
      ],
    },
    {
      id: 'setups', title: 'Setups', steps: [
        { html: '<p>La T-perm solo sabe intercambiar B con D. Para mandar la pieza del buffer a otra letra haces tres cosas:</p><ol><li><b>Setup</b>: llevas esa letra a la posición D.</li><li><b>T-perm</b>.</li><li><b>Deshaces el setup</b>: los mismos movimientos, al revés y en orden inverso.</li></ol>', cube: { state: solved(), labels: 'edge', marks: marks([{ pos: E('B'), label: 'B', cls: 'buf' }]), swap: E('D') } },
        { html: () => `<p>Mira el ejemplo con la <b>K</b>, cuyo setup en tu tabla es <b>${MODES.edge.table.K}</b>. Avanza paso a paso y sigue la pegatina K (rosa) y la del buffer (negra).</p>`, demo: { base: solved(), track: [{ sticker: E('K'), label: 'K', cls: 'tgt' }, { sticker: E('B'), label: 'B', cls: 'buf' }], steps: letterDemo('edge', 'K'), swap: E('D') } },
        { html: '<p>Un setup vale si cumple tres reglas:</p><ul><li>Deja la letra justo en <b>D</b>.</li><li><b>No mueve el buffer</b> (UR).</li><li>No mueve las esquinas <b>UFR y UBR</b>, que la T-perm también cambia.</li></ul><p>La <b>D</b> no necesita setup: ya está en la posición de intercambio, así que haces directamente la T-perm.</p>' },
        { html: '<p>Escribe el setup de cada letra. Vale cualquier setup correcto, no solo el de tu tabla.</p>', task: { type: 'setup', kind: 'edge', count: 4 } },
      ],
    },
    {
      id: 'memo', title: 'Hacer el memo', steps: [
        { html: '<p>Para memorizar <b>no mueves el cubo</b>: sigues el camino de las piezas con la vista.</p><ol><li>Mira la pegatina que hay en el buffer (B). Por sus colores sabes de qué letra es: esa es tu <b>primera letra</b>.</li><li>Mira qué pegatina hay en la posición de esa letra: es la <b>siguiente</b>.</li><li>Sigue así hasta que vuelva a aparecer la pieza del buffer.</li></ol>', cube: { state: S_MEMO1, marks: marks(BUF_E) } },
        { html: '<p>Tu turno. Toca en orden las posiciones de tu memo, o escribe las letras con el teclado. La última que nombres queda marcada en rosa, para que sepas dónde mirar después.</p>', task: { type: 'trace', kind: 'edge', state: S_MEMO1 } },
        { html: '<p>Uno un poco más largo.</p>', task: { type: 'trace', kind: 'edge', state: S_MEMO2 } },
        { html: '<p>El memo se recuerda <b>de dos en dos</b> (KI EX…). Más adelante convertirás cada pareja en una palabra o una imagen, que se recuerda mucho mejor que dos letras sueltas.</p>' },
      ],
    },
    {
      id: 'ciclos', title: 'Cambio de ciclo', steps: [
        { html: '<p>A veces el buffer tiene <b>su propia pieza</b> (blanco y rojo en UR) y todavía quedan aristas sin resolver. Puede pasar al principio, como aquí, o a mitad del memo.</p><p>Eso no es una letra: tienes que <b>romper el ciclo</b> disparando a cualquier arista sin resolver. Las marcadas son las que faltan.</p>', cube: { state: S_CYCLE, marks: marks(BUF_E), hl: piecesSet(S_CYCLE, 'edge') } },
        { html: '<p>¿A qué podrías disparar?</p>', task: { type: 'cycle', kind: 'edge', state: S_CYCLE } },
        { html: '<p>Al romper el ciclo, la pieza del buffer se queda aparcada en la letra que elegiste. El ciclo termina cuando vuelve al buffer la pieza de esa posición. Por eso <b>la última letra del ciclo es de la misma pieza con la que lo abriste</b>: la misma letra o su otra pegatina.</p>' },
        { html: '<p>Haz el memo completo de este cubo, con su cambio de ciclo.</p>', task: { type: 'trace', kind: 'edge', state: S_CYCLE } },
      ],
    },
    {
      id: 'volteadas', title: 'Aristas volteadas', steps: [
        { html: '<p>Una arista puede estar <b>en su sitio pero volteada</b>. Aunque parezca casi resuelta, hay que arreglarla.</p><p>Se hace con <b>dos letras: sus dos pegatinas</b>. Por ejemplo, <b>C I</b> para UF. Ojo: eso voltea también el buffer. Por eso las aristas volteadas van de dos en dos: con la segunda, el buffer vuelve a quedar bien.</p>', cube: { state: S_FLIP, marks: marks(BUF_E), hl: piecesSet(S_FLIP, 'edge') } },
        { html: '<p>Haz el memo de este cubo: tiene dos aristas volteadas.</p>', task: { type: 'trace', kind: 'edge', state: S_FLIP } },
        { html: '<p>Si en un cubo ves <b>una sola</b> arista volteada, la otra es el propio buffer. Sus dos letras (por ejemplo, C I) arreglan las dos a la vez.</p>' },
      ],
    },
    {
      id: 'paridad', title: 'Paridad', steps: [
        { html: '<p>Cada T-perm cambia también las esquinas UFR y UBR. Con un número <b>par</b> de T-perms ese cambio se deshace solo; con un número <b>impar</b>, al terminar las aristas esas dos esquinas quedan cambiadas.</p>', demo: { base: S_PARITY, hlChanged: true, steps: parityDemo() } },
        { html: '<p>La solución es la <b>R-perm</b>, justo al acabar las aristas y antes de las esquinas. Devuelve UFR y UBR a su sitio y a cambio cambia las aristas UL y UB. Las Y-perm de las esquinas (que también serán impares) las vuelven a dejar bien.</p><p>La app añade la R-perm sola cuando tu memo de aristas es impar.</p>' },
        { html: '<p>Tres preguntas rápidas.</p>', task: { type: 'choice', rounds: 3, make: parityQuestion } },
        { html: '', task: { type: 'choice', q: '¿Cuándo haces la R-perm?', options: ['Antes de empezar las aristas', 'Justo después de las aristas, antes de las esquinas', 'Al final de todo'], answer: 1, explain: 'Justo entre aristas y esquinas: arregla UFR y UBR antes de que las Y-perm las necesiten en su sitio.' } },
        { html: '', task: { type: 'choice', q: 'Tu memo de aristas tiene 11 letras. ¿Cómo será el de esquinas?', options: ['Un número par de letras', 'Un número impar de letras', 'Depende del scramble'], answer: 1, explain: 'En un cubo bien mezclado la paridad de aristas y esquinas siempre coincide: si las aristas son impares, las esquinas también.' } },
      ],
    },
    {
      id: 'esquinas', title: 'Esquinas', steps: [
        { html: '<p>Las esquinas funcionan igual. Tu buffer es <b>UBL</b>, con tres pegatinas: <b>A</b> (blanca), <b>E</b> (naranja) y <b>R</b> (azul). Con tu tabla, la que lees es la <b>E</b>.</p>', cube: { state: solved(), marks: marks(BUF_C) } },
        {
          html: '<p>La posición de intercambio es la <b>V</b> (DFR, pegatina amarilla) y el algoritmo es la <b>Y-perm modificada</b>: cambia E ↔ V y, de paso, las aristas UL y UB.</p>',
          demo: {
            base: solved(), hlChanged: true, swap: C('V'), steps: [
              { alg: '', label: 'Resuelto', text: 'Cubo resuelto.' },
              { alg: ALGS.Y.moves, label: 'Y-perm', text: 'Tras la Y-perm: las esquinas UBL y DFR se han intercambiado, y también las aristas UL y UB.' },
            ],
          },
        },
        { html: () => `<p>Ejemplo con la <b>O</b>, cuyo setup es <b>${MODES.corner.table.O}</b>. Sigue la pegatina O y la del buffer (E).</p>`, demo: { base: solved(), track: [{ sticker: C('O'), label: 'O', cls: 'tgt' }, { sticker: C('E'), label: 'E', cls: 'buf' }], steps: letterDemo('corner', 'O'), swap: C('V') } },
        { html: '<p>Escribe el setup de cada esquina. Las reglas son las mismas: deja la letra en V, no toca el buffer y no mueve las aristas UL y UB.</p>', task: { type: 'setup', kind: 'corner', count: 4 } },
        { html: '<p>Haz el memo de las esquinas de este cubo. Recuerda: lees la pegatina que hay en la posición <b>E</b>.</p>', task: { type: 'trace', kind: 'corner', state: S_CORNERS } },
        { html: '<p>Una esquina también puede estar <b>girada en su sitio</b>. Se arregla igual que una arista volteada: rompes el ciclo con una de sus pegatinas y terminas con otra de la misma esquina. Las giradas también van en grupo: aquí hay dos.</p>', cube: { state: S_TWIST, marks: marks(BUF_C), hl: piecesSet(S_TWIST, 'corner') } },
        { html: '<p>Haz el memo de este cubo.</p>', task: { type: 'trace', kind: 'corner', state: S_TWIST } },
      ],
    },
    {
      id: 'completa', title: 'Tu primera resolución', steps: [
        { html: `<p>Ahora, todo junto con un cubo fácil. Mezcla tu cubo con este scramble (blanco arriba, verde delante):</p><p class=scr-box>${FINAL_SCR}</p><p>Debería quedar como el dibujo.</p>`, cube: { state: S_FINAL } },
        { html: '<p>Haz el memo completo: primero las aristas y luego las esquinas. Puedes mirar el dibujo o tu cubo.</p>', cube: { state: S_FINAL }, task: { type: 'memo', state: S_FINAL } },
        { html: '<p>¡Memo correcto! Ahora resuélvelo con la <b>ejecución guiada</b>: carga este scramble y tu memo en «Practicar» y sigue los pasos con el cubo en la mano. Cuando lo consigas, prueba con un scramble de verdad y el cronómetro.</p>', action: { label: 'Abrir la ejecución guiada', run: () => {
          const m = runtime.finalMemo || { e: 'XR LD', c: 'UM' };
          OP.loadPractice(FINAL_SCR, m.e, m.c);
          OP.showView('practicar');
          OP.openGuide();
        } } },
      ],
    },
  ];

  // ---------------- Engine ----------------
  const runtime = { lesson: Math.min(progress.lesson, LESSONS.length - 1), step: 0, taskDone: false, keyHandler: null, finalMemo: null };
  runtime.step = Math.min(progress.step, LESSONS[runtime.lesson].steps.length - 1);

  function renderList() {
    const list = el('nav', 'lesson-list');
    list.setAttribute('aria-label', 'Lecciones');
    LESSONS.forEach((les, i) => {
      const b = el('button', 'lesson-item' + (progress.done[les.id] ? ' done' : ''), `<span class=num>${progress.done[les.id] ? '✓' : i + 1}</span><span class=t>${les.title}</span>`);
      b.type = 'button';
      b.title = `${i + 1}. ${les.title}`;
      if (i === runtime.lesson) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', () => go(i, 0));
      list.appendChild(b);
    });
    return list;
  }
  function go(lesson, step) {
    runtime.lesson = lesson;
    runtime.step = step;
    progress.lesson = lesson;
    progress.step = step;
    saveProgress(false);
    render();
    const head = root.querySelector('.lesson-head');
    if (head && head.scrollIntoView && window.innerWidth <= 860) head.scrollIntoView({ block: 'start' });
  }
  function finishLesson() {
    const les = LESSONS[runtime.lesson];
    const fresh = !progress.done[les.id];
    progress.done[les.id] = true;
    saveProgress(fresh);
    if (runtime.lesson < LESSONS.length - 1) go(runtime.lesson + 1, 0);
    else render(true);
  }

  function render(allDone) {
    runtime.keyHandler = null;
    root.innerHTML = '';
    const doneCount = LESSONS.filter((l) => progress.done[l.id]).length;
    const prog = document.getElementById('learnProgress');
    if (prog) prog.textContent = `${doneCount} de ${LESSONS.length} lecciones completadas`;
    root.appendChild(renderList());
    const les = LESSONS[runtime.lesson];
    const step = les.steps[runtime.step];
    const art = el('article', 'lesson');
    const head = el('div', 'lesson-head');
    head.appendChild(el('h3', null, `${runtime.lesson + 1}. ${les.title}`));
    const dots = el('div', 'lesson-steps');
    dots.setAttribute('role', 'img');
    dots.setAttribute('aria-label', `Paso ${runtime.step + 1} de ${les.steps.length}`);
    les.steps.forEach((_, i) => dots.appendChild(el('i', i < runtime.step ? 'past' : i === runtime.step ? 'on' : '')));
    head.appendChild(dots);
    art.appendChild(head);
    if (allDone) {
      art.appendChild(el('div', 'lesson-text', '<p><b>¡Has terminado el tutorial!</b> Ya conoces todo el método. Lo siguiente es practicar: genera scrambles en «Practicar», mide tus tiempos en «Cronómetro» y repasa los setups en «Entrenar».</p>'));
      root.appendChild(art);
      return;
    }
    const html = typeof step.html === 'function' ? step.html() : step.html;
    if (html) art.appendChild(el('div', 'lesson-text', html));

    let net = null;
    const needsNet = step.cube || step.demo || (step.task && ['tap', 'pieces', 'trace', 'cycle', 'setup'].includes(step.task.type));
    if (needsNet) {
      const stage = el('div', 'tut-stage');
      net = createNet();
      stage.appendChild(net.el);
      art.appendChild(stage);
      if (step.cube) {
        const c = step.cube;
        net.paint(c.state, { labels: c.labels, centers: c.centers, marks: c.marks, hl: c.hl, swap: c.swap });
      }
      if (step.demo) mountDemo(step.demo, net, stage);
    }
    runtime.taskDone = !step.task;
    const nav = el('div', 'lesson-nav');
    const prev = el('button', 'btn', '← Anterior');
    prev.type = 'button';
    prev.disabled = runtime.lesson === 0 && runtime.step === 0;
    prev.addEventListener('click', () => {
      if (runtime.step > 0) go(runtime.lesson, runtime.step - 1);
      else if (runtime.lesson > 0) go(runtime.lesson - 1, LESSONS[runtime.lesson - 1].steps.length - 1);
    });
    const last = runtime.step === les.steps.length - 1;
    const next = el('button', 'btn primary', last ? (runtime.lesson === LESSONS.length - 1 ? 'Terminar el tutorial ✓' : 'Terminar lección ✓') : 'Siguiente →');
    next.type = 'button';
    next.addEventListener('click', () => {
      if (!runtime.taskDone) return;
      if (last) finishLesson(); else go(runtime.lesson, runtime.step + 1);
    });
    const skip = el('button', 'linkish', 'Saltar ejercicio');
    skip.type = 'button';
    skip.addEventListener('click', () => { runtime.taskDone = true; next.disabled = false; skip.hidden = true; next.focus(); });
    const setDone = () => { runtime.taskDone = true; next.disabled = false; skip.hidden = true; };
    if (step.task) {
      const box = el('div', 'task');
      box.appendChild(el('div', 'task-head', 'Ejercicio'));
      art.appendChild(box);
      mountTask(step.task, box, net, setDone);
    }
    if (step.action) {
      const a = el('button', 'btn primary', step.action.label);
      a.type = 'button';
      a.addEventListener('click', step.action.run);
      art.appendChild(el('div', 'actions')).appendChild(a);
    }
    next.disabled = !runtime.taskDone;
    skip.hidden = runtime.taskDone;
    const right = el('div', 'lesson-nav-right');
    right.append(skip, next);
    nav.append(prev, right);
    art.appendChild(nav);
    root.appendChild(art);
  }

  // ---------------- Demo: step through moves ----------------
  function mountDemo(demo, net, stage) {
    const states = [demo.base];
    for (let i = 1; i < demo.steps.length; i++) states.push(apply(states[i - 1], demo.steps[i].alg));
    let at = 0;
    const chips = el('div', 'demo-chips');
    const cap = el('p', 'caption');
    const ctrl = el('div', 'stepnav');
    const back = el('button', 'btn', '← Atrás');
    const fwd = el('button', 'btn', 'Avanzar →');
    back.type = 'button'; fwd.type = 'button';
    ctrl.append(back, fwd);
    stage.append(cap, ctrl, chips);
    const draw = () => {
      const st = states[at];
      net.paint(st, {
        marks: demo.track ? trackMarks(st, demo.track) : undefined,
        hl: demo.hlChanged ? changedSet(st) : undefined,
        swap: demo.swap,
      });
      cap.innerHTML = demo.steps[at].text;
      back.disabled = at === 0;
      fwd.disabled = at === states.length - 1;
      chips.querySelectorAll('.chip').forEach((c, i) => {
        c.classList.toggle('done', i < at);
        if (i === at) c.setAttribute('aria-current', 'step'); else c.removeAttribute('aria-current');
      });
    };
    demo.steps.forEach((s, i) => {
      const c = el('button', 'chip' + (s.alg && s.alg.split(' ').length > 3 ? ' alg-chip' : ''), s.label);
      c.type = 'button';
      c.addEventListener('click', () => { at = i; draw(); });
      chips.appendChild(c);
    });
    back.addEventListener('click', () => { if (at > 0) { at--; draw(); } });
    fwd.addEventListener('click', () => { if (at < states.length - 1) { at++; draw(); } });
    runtime.keyHandler = (ev) => {
      if (ev.key === 'ArrowRight' && at < states.length - 1) { ev.preventDefault(); at++; draw(); return true; }
      if (ev.key === 'ArrowLeft' && at > 0) { ev.preventDefault(); at--; draw(); return true; }
      return false;
    };
    draw();
  }

  // ---------------- Exercises ----------------
  function mountTask(task, box, net, done) {
    const prompt = el('p', 'task-prompt');
    const fb = el('p', 'task-fb');
    fb.setAttribute('aria-live', 'polite');
    box.append(prompt, fb);
    const say = (html, cls) => { fb.innerHTML = html; fb.className = 'task-fb' + (cls ? ' ' + cls : ''); };
    ({ tap: taskTap, pieces: taskPieces, choice: taskChoice, setup: taskSetup, trace: taskTrace, cycle: taskCycle, memo: taskMemo }[task.type])(task, { box, net, prompt, say, done });
  }

  function taskTap(task, t) {
    const mode = MODES[task.kind];
    const noun = mode.noun.toLowerCase();
    const pool = shuffle(LETTERS.slice()).slice(0, task.rounds);
    let k = 0;
    const ask = () => {
      t.prompt.innerHTML = `Toca la ${noun} <b>${pool[k]}</b> <span class=muted>(${k + 1} de ${pool.length})</span>`;
      t.net.paint(solved(), { tap: true });
    };
    t.net.onTap = (pos) => {
      if (k >= pool.length) return;
      const want = mode.posOf[pool[k]];
      if (pos === want) {
        t.net.flash(pos, true);
        k++;
        if (k === pool.length) {
          t.prompt.innerHTML = `Has encontrado las ${pool.length}.`;
          t.say('¡Perfecto!', 'ok');
          t.net.paint(solved(), { labels: task.kind });
          t.done();
        } else { t.say('¡Bien!', 'ok'); ask(); }
        return;
      }
      t.net.flash(pos, false);
      const got = mode.letterOf[pos];
      const what = got ? `Esa es la ${got}.`
        : pos % 9 === 4 ? 'Eso es un centro.'
          : task.kind === 'edge' ? 'Eso es una esquina: busca una arista.' : 'Eso es una arista: busca una esquina.';
      t.say(`${what} Pista: la ${pool[k]} está en la ${faceText(want)}.`, 'ko');
    };
    ask();
  }

  function taskPieces(task, t) {
    const key = (pos) => Math.min(...PIECE_OF[pos]);
    const wanted = new Set(task.pieces.map(key));
    const found = new Set();
    const hl = new Set();
    t.prompt.innerHTML = task.prompt;
    const draw = () => t.net.paint(task.state, { tap: found.size < wanted.size, hl });
    t.net.onTap = (pos) => {
      if (pos % 9 === 4) { t.say('Los centros nunca se mueven.', 'ko'); t.net.flash(pos, false); return; }
      const k = key(pos);
      if (!wanted.has(k)) { t.say(`${pieceName(pos)} no se ha movido.`, 'ko'); t.net.flash(pos, false); return; }
      if (found.has(k)) { t.say(`${pieceName(pos)} ya la tienes.`, ''); return; }
      found.add(k);
      PIECE_OF[pos].forEach((q) => hl.add(q));
      draw();
      if (found.size === wanted.size) { t.say('¡Eso es! Dos aristas (UR y UL) y dos esquinas (UFR y UBR).', 'ok'); t.done(); }
      else t.say(`${pieceName(pos)}: sí. Te faltan ${wanted.size - found.size}.`, 'ok');
    };
    draw();
  }

  function taskChoice(task, t) {
    const rounds = task.rounds || 1;
    let right = 0;
    const opts = el('div', 'choices');
    t.box.insertBefore(opts, t.box.lastChild);
    const ask = () => {
      const q = task.make ? task.make() : task;
      t.prompt.innerHTML = q.q + (rounds > 1 ? ` <span class=muted>(${right + 1} de ${rounds})</span>` : '');
      opts.innerHTML = '';
      q.options.forEach((o, i) => {
        const b = el('button', 'btn', o);
        b.type = 'button';
        b.addEventListener('click', () => {
          if (i === q.answer) {
            right++;
            t.say(`Correcto. ${q.explain}`, 'ok');
            if (right >= rounds) { opts.querySelectorAll('button').forEach((x) => { x.disabled = true; }); t.done(); } else ask();
          } else {
            t.say(`No. ${q.explain}`, 'ko');
            if (task.make) ask();
          }
        });
        opts.appendChild(b);
      });
    };
    ask();
  }

  function taskSetup(task, t) {
    const mode = MODES[task.kind];
    const letters = shuffle(targets(task.kind).filter((L) => mode.table[L])).slice(0, task.count);
    let k = 0;
    const form = el('form', 'inrow');
    form.setAttribute('autocomplete', 'off');
    const inp = el('input');
    inp.type = 'text'; inp.spellcheck = false; inp.placeholder = task.kind === 'edge' ? 'p. ej. l D’ L2' : 'p. ej. F R’';
    inp.setAttribute('aria-label', 'Setup');
    const okb = el('button', 'btn primary', 'Comprobar');
    okb.type = 'submit';
    form.append(inp, okb);
    t.box.insertBefore(form, t.box.lastChild);
    let answered = false;
    const ask = () => {
      const L = letters[k];
      answered = false;
      okb.textContent = 'Comprobar';
      inp.value = ''; inp.readOnly = false;
      t.prompt.innerHTML = `Setup de la <b>${L}</b> (${pieceName(mode.posOf[L])}) <span class=muted>(${k + 1} de ${letters.length})</span>`;
      t.net.paint(solved(), {
        labels: task.kind,
        marks: marks([{ pos: mode.posOf[L], label: L, cls: 'tgt' }, { pos: mode.posOf[mode.read], label: mode.read, cls: 'buf' }]),
        swap: mode.posOf[mode.swap],
      });
    };
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      if (answered) {
        k++;
        if (k < letters.length) { ask(); t.say('', ''); inp.focus(); }
        return;
      }
      const L = letters[k];
      const typed = inp.value.trim();
      if (!typed) { t.say('Escribe un setup.', 'ko'); return; }
      const res = OP.judgeSetup(task.kind, L, typed);
      if (!res.ok) { t.say(`${res.msg} Inténtalo otra vez. <button type=button class=linkish data-reveal>Ver la de mi tabla</button>`, 'ko'); return; }
      answered = true;
      inp.readOnly = true;
      const table = mode.table[L];
      t.say(`¡Correcto!${res.norm !== table ? ` Tu tabla usa <code>${table}</code>.` : ''}`, 'ok');
      if (k === letters.length - 1) { okb.disabled = true; t.prompt.innerHTML = 'Has hecho las cuatro.'; t.done(); } else okb.textContent = 'Siguiente';
      okb.focus();
    });
    t.box.addEventListener('click', (ev) => {
      if (!ev.target.closest('[data-reveal]')) return;
      const L = letters[k];
      inp.value = mode.table[L];
      t.say(`En tu tabla: <code>${mode.table[L]}</code>. Pulsa Comprobar para seguir.`, '');
    });
    ask();
  }

  // Trace a memo by tapping positions (or typing letters). Any valid cycle break is accepted.
  function taskTrace(task, t) {
    const mode = MODES[task.kind];
    const noun = mode.noun.toLowerCase();
    const letters = [];
    let showLabels = false;
    let finished = false;
    const strip = el('div', 'trace-memo');
    const tools = el('div', 'task-tools');
    const lab = el('label', 'guide-opt', '<input type=checkbox> Ver letras en el cubo');
    const help = el('button', 'btn', 'Ayuda');
    const undo = el('button', 'btn', 'Borrar última');
    help.type = 'button'; undo.type = 'button';
    tools.append(undo, help, lab);
    t.box.insertBefore(strip, t.box.lastChild);
    t.box.insertBefore(tools, t.box.lastChild);
    lab.querySelector('input').addEventListener('change', (ev) => { showLabels = ev.target.checked; draw(); });
    const status = () => OP.traceKind(task.kind, task.state, letters);
    const draw = () => {
      const list = [{ pos: mode.posOf[mode.read], label: mode.read, cls: 'buf' }];
      if (letters.length) list.push({ pos: mode.posOf[letters[letters.length - 1]], label: letters[letters.length - 1], cls: 'tgt' });
      t.net.paint(task.state, { tap: !finished, labels: showLabels ? task.kind : null, marks: marks(list) });
      strip.innerHTML = letters.length
        ? pairsOf(letters).split(' ').map((p) => `<span class=pair>${p.split('').map((x) => `<span class='tok past'>${x}</span>`).join('')}</span>`).join('')
        : `<span class=muted>Tu memo aparecerá aquí.</span>`;
      undo.disabled = !letters.length || finished;
      help.disabled = finished;
      const st = status();
      if (finished) return;
      if (st.why === 'missingBreak') t.prompt.innerHTML = `<b>Cambio de ciclo:</b> el buffer tiene su propia pieza. Dispara a cualquier ${noun} sin resolver.`;
      else if (!letters.length) t.prompt.innerHTML = `Mira la pegatina que hay en el buffer (<b>${mode.read}</b>). ¿De qué letra es? Tócala en su sitio.`;
      else t.prompt.innerHTML = `Siguiente: mira la pegatina que hay en la posición <b>${letters[letters.length - 1]}</b> (marcada en rosa).`;
    };
    const add = (L) => {
      if (finished) return;
      const res = OP.traceKind(task.kind, task.state, [...letters, L]);
      if (!res.ok && res.i === letters.length && ['mismatch', 'solved', 'invalid', 'extra'].includes(res.why)) {
        if (mode.posOf[L] != null) t.net.flash(mode.posOf[L], false);
        if (res.why === 'invalid') t.say(`${L} es parte del buffer: no puede ser una letra del memo.`, 'ko');
        else if (res.why === 'solved') t.say(`${pieceName(mode.posOf[L])} ya está resuelta: elige una ${noun} sin resolver.`, 'ko');
        else t.say(`No es la ${L}. ${letters.length ? `Fíjate en los colores de la pegatina que hay en la posición ${letters[letters.length - 1]}.` : `Fíjate en los colores de la pegatina del buffer (${mode.read}).`}`, 'ko');
        return;
      }
      letters.push(L);
      t.net.flash(mode.posOf[L], true);
      if (res.ok) {
        finished = true;
        t.prompt.innerHTML = `Memo completo: <b>${pairsOf(letters)}</b>`;
        t.say(`¡Correcto! ${letters.length} letras${task.kind === 'edge' ? (letters.length % 2 ? ': número impar, habría paridad.' : ': número par, sin paridad.') : '.'}`, 'ok');
        draw();
        t.done();
        return;
      }
      t.say(res.why === 'missingBreak' ? 'Bien. Ahora el buffer tiene su propia pieza…' : 'Bien.', 'ok');
      draw();
    };
    t.net.onTap = (pos) => {
      const L = mode.letterOf[pos];
      if (!L) { t.net.flash(pos, false); t.say(pos % 9 === 4 ? 'Eso es un centro.' : `Eso no es una ${noun}.`, 'ko'); return; }
      add(L);
    };
    runtime.keyHandler = (ev) => {
      if (/^[a-xA-X]$/.test(ev.key)) { add(ev.key.toUpperCase()); return true; }
      if (ev.key === 'Backspace' && letters.length && !finished) { ev.preventDefault(); letters.pop(); t.say('', ''); draw(); return true; }
      return false;
    };
    undo.addEventListener('click', () => { letters.pop(); t.say('', ''); draw(); });
    help.addEventListener('click', () => {
      const st = status();
      if (st.why === 'missing') t.say(`La siguiente es la <b>${st.want}</b>.`, '');
      else if (st.why === 'missingBreak') {
        const open = [...unsolvedOf(st.state, task.kind)].map((p) => mode.letterOf[p]);
        const best = open.sort((a, b) => setupLen(task.kind, a) - setupLen(task.kind, b) || a.localeCompare(b))[0];
        t.say(`Puedes disparar a cualquiera de estas: ${open.join(', ')}. La más cómoda según tu tabla es la <b>${best}</b>.`, '');
      }
    });
    draw();
  }

  function taskCycle(task, t) {
    const mode = MODES[task.kind];
    const open = unsolvedOf(task.state, task.kind);
    t.prompt.innerHTML = `Toca una pegatina de cualquier ${mode.noun.toLowerCase()} a la que podrías disparar.`;
    let finished = false;
    t.net.paint(task.state, { tap: true, marks: marks(BUF_E) });
    t.net.onTap = (pos) => {
      if (finished) return;
      const L = mode.letterOf[pos];
      if (!L) { t.net.flash(pos, false); t.say('Eso no es una arista.', 'ko'); return; }
      if (mode.buffer.includes(L)) { t.net.flash(pos, false); t.say('Ese es el propio buffer.', 'ko'); return; }
      if (!open.has(pos)) { t.net.flash(pos, false); t.say(`${pieceName(pos)} ya está resuelta.`, 'ko'); return; }
      finished = true;
      t.net.flash(pos, true);
      const letters = [...open].map((p) => mode.letterOf[p]).sort((a, b) => setupLen(task.kind, a) - setupLen(task.kind, b) || a.localeCompare(b));
      const best = letters[0];
      const setup = mode.table[best];
      t.net.paint(task.state, { marks: marks(BUF_E), hl: piecesSet(task.state, task.kind) });
      t.say(`¡Bien! La ${L} vale. Sirve cualquier pegatina de las aristas sin resolver (${letters.join(', ')}). La más cómoda según tu tabla es la <b>${best}</b>${setup ? ` (setup ${setup})` : ' (no necesita setup)'}.`, 'ok');
      t.done();
    };
  }

  function taskMemo(task, t) {
    t.prompt.innerHTML = 'Escribe tu memo y pulsa Comprobar.';
    const wrap = el('div', 'fields');
    wrap.innerHTML = '<div class=field><label for=tutE>Memo de aristas</label><input id=tutE type=text spellcheck=false autocomplete=off></div>'
      + '<div class=field><label for=tutC>Memo de esquinas</label><input id=tutC type=text spellcheck=false autocomplete=off></div>';
    const okb = el('button', 'btn primary', 'Comprobar memo');
    okb.type = 'button';
    t.box.insertBefore(wrap, t.box.lastChild);
    t.box.insertBefore(el('div', 'actions'), t.box.lastChild).appendChild(okb);
    okb.addEventListener('click', () => {
      const e = OP.lettersOf(document.getElementById('tutE').value);
      const c = OP.lettersOf(document.getElementById('tutC').value);
      if (!e.length && !c.length) { t.say('Escribe primero el memo.', 'ko'); return; }
      const err = OP.traceMemo(task.state, e, c);
      if (err) { t.say(OP.errorText(err), 'ko'); return; }
      runtime.finalMemo = { e: pairsOf(e), c: pairsOf(c) };
      t.say(`¡Correcto! Aristas <b>${pairsOf(e)}</b>${e.length % 2 ? ' (impar: con paridad)' : ''} · esquinas <b>${pairsOf(c)}</b>.`, 'ok');
      t.done();
    });
  }

  // ---------------- Wiring ----------------
  OP.onKey.aprender = (ev) => {
    if (runtime.keyHandler && runtime.keyHandler(ev)) return;
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
      const b = root.querySelector(ev.key === 'ArrowRight' ? '.lesson-nav .btn.primary' : '.lesson-nav > .btn');
      if (b && !b.disabled) { ev.preventDefault(); b.click(); }
    }
  };
  OP.learn = {
    get: () => ({ done: { ...progress.done } }),
    merge: (remote) => {
      if (!remote || !remote.done) return false;
      let changed = false;
      Object.keys(remote.done).forEach((id) => { if (remote.done[id] && !progress.done[id]) { progress.done[id] = true; changed = true; } });
      if (changed) { saveProgress(false); if (OP.currentView() === 'aprender') render(); }
      return changed;
    },
    lessons: LESSONS.map((l) => ({ id: l.id, title: l.title })),
  };
  let rendered = false;
  const show = () => { if (!rendered) { rendered = true; render(); } };
  OP.onView('aprender', show);
  if (OP.currentView() === 'aprender') show();
})();
