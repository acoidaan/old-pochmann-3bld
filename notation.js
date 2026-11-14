// The move notation, the same in every section: what each letter does, on a cube in 3D that turns it (drag
// it to see it from behind or from below), and a player that turns a whole algorithm, one move at a time.
// Draws with CubeModel; exposes window.CubeNotation. A page mounts it where it wants (mount), or marks a
// <details data-notation="yellow|white"> with a [data-notation-body] inside, and it mounts on opening.
(() => {
  'use strict';
  const M = window.CubeModel;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ================= What each letter does =================
  const GROUPS = [
    { id: 'faces', title: 'Las caras', keys: ['R', 'L', 'U', 'D', 'F', 'B'] },
    { id: 'wide', title: 'Dos capas', keys: ['r', 'l', 'u', 'd', 'f', 'b'] },
    { id: 'slice', title: 'La capa del medio', keys: ['M', 'E', 'S'] },
    { id: 'rot', title: 'Todo el cubo', keys: ['x', 'y', 'z'] },
  ];
  const CW = 'como las agujas del reloj';
  const CCW = 'al revés que las agujas del reloj';
  // Its name, what turns, which way with the letter alone and with ', and (the middle layers and the whole
  // cube) the face it turns like. For x, y and z: where the faces go, alone, with ' and with 2.
  const WHAT = {
    R: ['Derecha (Right)', 'la capa de la derecha', 'hacia arriba', 'hacia abajo'],
    L: ['Izquierda (Left)', 'la capa de la izquierda', 'hacia abajo', 'hacia arriba'],
    U: ['Arriba (Up)', 'la capa de arriba', 'hacia la izquierda', 'hacia la derecha'],
    D: ['Abajo (Down)', 'la capa de abajo', 'hacia la derecha', 'hacia la izquierda'],
    F: ['Delante (Front)', 'la capa de delante', CW, CCW],
    B: ['Detrás (Back)', 'la capa de detrás', `${CCW} vista desde delante`, `${CW} vista desde delante`],
    r: ['Dos capas a la derecha (r o Rw)', 'la de la derecha y la del medio', 'hacia arriba', 'hacia abajo'],
    l: ['Dos capas a la izquierda (l o Lw)', 'la de la izquierda y la del medio', 'hacia abajo', 'hacia arriba'],
    u: ['Dos capas arriba (u o Uw)', 'la de arriba y la del medio', 'hacia la izquierda', 'hacia la derecha'],
    d: ['Dos capas abajo (d o Dw)', 'la de abajo y la del medio', 'hacia la derecha', 'hacia la izquierda'],
    f: ['Dos capas delante (f o Fw)', 'la de delante y la del medio', CW, CCW],
    b: ['Dos capas detrás (b o Bw)', 'la de detrás y la del medio', `${CCW} vista desde delante`, `${CW} vista desde delante`],
    M: ['Medio (Middle)', 'la capa del medio entre R y L', 'hacia abajo', 'hacia arriba', 'L'],
    E: ['Ecuador (Equator)', 'la capa del medio entre U y D', 'hacia la derecha', 'hacia la izquierda', 'D'],
    S: ['De pie (Standing)', 'la capa del medio entre F y B', CW, CCW, 'F'],
    x: ['x', 'la cara de delante pasa arriba', 'la cara de arriba pasa delante', 'arriba y abajo se cambian, y delante y detrás también', 'R'],
    y: ['y', 'la cara de la derecha pasa delante', 'la cara de la izquierda pasa delante', 'delante y detrás se cambian, y la derecha y la izquierda también', 'U'],
    z: ['z', 'la cara de arriba pasa a la derecha', 'la cara de la derecha pasa arriba', 'arriba y abajo se cambian, y la derecha y la izquierda también', 'F'],
  };
  const SHORT = {
    R: 'derecha', L: 'izquierda', U: 'arriba', D: 'abajo', F: 'delante', B: 'detrás',
    r: 'dos capas a la derecha', l: 'dos capas a la izquierda', u: 'dos capas arriba', d: 'dos capas abajo', f: 'dos capas delante', b: 'dos capas detrás',
    M: 'la capa del medio, como L', E: 'la capa del medio, como D', S: 'la capa del medio, como F',
    x: 'todo el cubo, como R', y: 'todo el cubo, como U', z: 'todo el cubo, como F',
  };
  const ROT = new Set(['x', 'y', 'z']);
  const modOf = (m) => (m.turns === 2 ? '2' : m.turns === 3 ? "'" : '');
  // What a move does, in words: «Derecha (Right): la capa de la derecha, un cuarto de vuelta hacia arriba.»
  function says(m) {
    const w = WHAT[m.base];
    const mod = modOf(m);
    if (ROT.has(m.base)) return `Todo el cubo en la mano, como ${w[4]}${mod}: ${m.turns === 2 ? w[3] : m.turns === 1 ? w[1] : w[2]}. Ninguna capa gira por su cuenta.`;
    const like = w[4] ? ` (como ${w[4]}${mod})` : '';
    if (m.turns === 2) return `${w[0]}: ${w[1]}, media vuelta${like}; da igual hacia qué lado.`;
    return `${w[0]}${m.turns === 3 ? ', al revés' : ''}: ${w[1]}, un cuarto de vuelta ${m.turns === 1 ? w[2] : w[3]}${like}.`;
  }
  const keyLabel = (k, mod) => `${k}${mod}: ${SHORT[k]}${mod === "'" ? ', al revés' : mod === '2' ? ', media vuelta' : ''}`;

  // An algorithm as written by hand: with spaces or without, (brackets) to group, X Y Z and W for x y z and w,
  // any apostrophe → { moves: [{ text, m }] } or { error } in words.
  const TOKEN = /([RLUDFBMESrludfbxyz])(w?)([2'’`´]*)/g;
  function read(str) {
    const src = String(str || '').replace(/[XYZ]/g, (c) => c.toLowerCase()).replace(/W/g, 'w');
    const left = src.replace(TOKEN, ' ').replace(/[\s()[\]{},.;]+/g, '');
    if (left) return { error: `No entiendo «${left.slice(0, 8)}». Vale R L U D F B (en minúscula o con w, dos capas), M E S y x y z, con ' o 2.` };
    const moves = [...src.matchAll(TOKEN)].map(([, l, w, s]) => {
      const t = s.replace(/[’`´]/g, "'");
      const text = l + w + (t.includes('2') ? '2' : (t.match(/'/g) || []).length % 2 ? "'" : '');
      return { text, m: M.parseAlg(text)[0] };
    });
    if (!moves.length) return { error: "Escribe algún giro, por ejemplo R U R' U'." };
    if (moves.length > 80) return { error: 'Como mucho, 80 giros.' };
    return { moves };
  }

  // ================= The cube in 3D =================
  // 26 little cubes (the core never shows), each face a sticker (its colour from the state) or bare plastic,
  // drawn back to front for a camera that goes round it. While a layer turns, the cube is drawn as the three
  // slabs across the axis of the turn, the far one first, and the little cubes in each from far to near;
  // bare plastic only where the turn opens the cube. Orthographic, like the other pictures of the app.
  const S = 30;
  const STK = 0.4;
  const CAM0 = { yaw: 0.56, pitch: 0.5 };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const unit = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return v.map((x) => x / l); };
  const LIGHT = unit([0.3, 1, 0.55]);
  const KEY = (p, n) => `${p.join(',')}|${n.join(',')}`;
  const AT = new Map(M.STICKERS.map((s, i) => [KEY(s.pos, s.nrm), i]));
  const NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const CUBIES = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) if (x || y || z) CUBIES.push([x, y, z]);
  const FACES = CUBIES.map((p) => NORMALS.map((n) => {
    const k = n.findIndex((v) => v !== 0);
    const [u, v] = [0, 1, 2].filter((i) => i !== k);
    const quad = (h) => [[h, h], [h, -h], [-h, -h], [-h, h]].map(([a, b]) => p.map((c, i) => c + n[i] * 0.5 + (i === u ? a : 0) + (i === v ? b : 0)));
    const at = AT.get(KEY(p, n));
    return { n, k, at, body: quad(0.5), sticker: at === undefined ? null : quad(STK) };
  }));
  // v turned about axis a (0 x, 1 y, 2 z) by ang radians, right-handed, as CubeModel's quarter turns go.
  function spin(v, a, ang) {
    const c = Math.cos(ang); const s = Math.sin(ang);
    const [x, y, z] = v;
    if (a === 0) return [x, y * c - z * s, y * s + z * c];
    if (a === 1) return [x * c + z * s, y, z * c - x * s];
    return [x * c - y * s, x * s + y * c, z];
  }
  function draw(st, cam, turn) {
    const cp = Math.cos(cam.pitch);
    const c = [cp * Math.sin(cam.yaw), Math.sin(cam.pitch), cp * Math.cos(cam.yaw)];
    const X = unit([c[2], 0, -c[0]]);
    const Y = [c[1] * X[2] - c[2] * X[1], c[2] * X[0] - c[0] * X[2], c[0] * X[1] - c[1] * X[0]];
    const pts = (q) => q.map((v) => `${(dot(v, X) * S).toFixed(1)},${(-dot(v, Y) * S).toFixed(1)}`).join(' ');
    const moving = (p) => !!turn && turn.layers.includes(p[turn.a]);
    const place = (v, p) => (moving(p) ? spin(v, turn.a, turn.ang) : v);
    const all = CUBIES.map((p, i) => i);
    const slabs = turn ? [-1, 0, 1].sort((k1, k2) => (k1 - k2) * c[turn.a]).map((k) => all.filter((i) => CUBIES[i][turn.a] === k)) : [all];
    let out = '';
    for (const slab of slabs) {
      const order = slab.map((i) => [i, dot(place(CUBIES[i], CUBIES[i]), c)]).sort((a, b) => a[1] - b[1]);
      for (const [i] of order) {
        const p = CUBIES[i];
        for (const f of FACES[i]) {
          const n = place(f.n, p);
          if (dot(n, c) <= 1e-6) continue;
          if (!f.sticker) {
            if (!turn || f.k !== turn.a) continue;
            const next = p[turn.a] + f.n[turn.a];
            if (next < -1 || next > 1 || moving(p) === turn.layers.includes(next)) continue;
          }
          out += `<polygon points="${pts(f.body.map((v) => place(v, p)))}" fill="var(--plastic)" stroke="var(--plastic)" stroke-width="1" stroke-linejoin="round"/>`;
          if (!f.sticker) continue;
          const col = `var(--st-${M.faceOfSticker(st[f.at])})`;
          const q = pts(f.sticker.map((v) => place(v, p)));
          out += `<polygon class="nt-st" points="${q}" fill="${col}" stroke="${col}" stroke-width="2.4" stroke-linejoin="round"/>`;
          const shade = Math.min(0.45, 0.3 * (1 - dot(n, LIGHT)));
          if (shade > 0.02) out += `<g opacity="${shade.toFixed(2)}"><polygon points="${q}" fill="#000" stroke="#000" stroke-width="2.4" stroke-linejoin="round"/></g>`;
        }
      }
    }
    return out;
  }
  // The cube on screen: its state, the camera, and one turn at a time, animated. A turn in progress can be
  // finished at once (its state after it) or dropped (the state as it was).
  function makeCube(root, svg, base, settle) {
    let st = base;
    const cam = { ...CAM0 };
    let anim = null;
    let raf = 0;
    const paint = () => { svg.innerHTML = draw(st, cam, anim); };
    function end(done) {
      const a = anim;
      if (!a) return;
      cancelAnimationFrame(raf);
      anim = null;
      if (done) st = M.apply(st, a.m.text);
      delete root.dataset.busy;
      paint();
      settle(st);
      a.resolve(done);
    }
    function frame(t) {
      const a = anim;
      if (!a) return;
      const k = Math.min(1, (t - a.t0) / a.ms);
      if (k >= 1) { end(true); return; }
      a.ang = a.to * (k < 0.5 ? 2 * k * k : 1 - ((2 - 2 * k) ** 2) / 2);
      paint();
      raf = requestAnimationFrame(frame);
    }
    return {
      cam,
      paint,
      get busy() { return !!anim; },
      set(state) { end(false); st = state; paint(); settle(st); },
      finish() { end(true); },
      turn(m, ms) {
        end(true);
        const [a, layers, q] = M.TURNS[m.base];
        return new Promise((resolve) => {
          // A prime is a quarter the other way, not three.
          anim = { m, a, layers, ang: 0, to: (m.turns === 3 ? -q : q * m.turns) * (Math.PI / 2), t0: performance.now(), ms, resolve };
          root.dataset.busy = '1';
          raf = requestAnimationFrame(frame);
        });
      },
    };
  }

  // ================= The section =================
  // Some to try: CFOP's (with x, M and y in them) and, in 3BLD, Old Pochmann's three and two setups (l, d).
  const EXAMPLES = {
    yellow: [
      ["R U R' U'", "R U R' U'"],
      ['Sune', "R U R' U R U2 R'"],
      ['T-perm', "R U R' U' R' F R2 U' R' U' R U R' F'"],
      ['Aa-perm, con x', "x L2 D2 L' U' L D2 L' U L'"],
      ['H-perm, con M', 'M2 U M2 U2 M2 U M2'],
      ['V-perm, con y', "R' U R' U' y R' F' R2 U' R' U R' F R F"],
    ],
    white: [
      ["R U R' U'", "R U R' U'"],
      ['T-perm', "R U R' U' R' F R2 U' R' U' R U R' F'"],
      ['Y-perm modificada', "R U' R' U' R U R' F' R U R' U' R' F R"],
      ['R-perm', "R U R' F' R U2 R' U2 R' F R U R U2 R' U'"],
      ['Setup de la A, con l', "l2 D' l2"],
      ['Setup de la E, con d', "L d' L"],
    ],
  };
  const SPEED = { key: [440, 640], alg: [380, 560], gap: 140 };
  const msFor = (m, kind) => SPEED[kind][m.turns === 2 ? 1 : 0];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  function html(id, white) {
    const held = white ? 'Con el blanco arriba y el verde delante, como al mezclar.' : 'Con el amarillo arriba y el verde delante, como en los casos.';
    const row = (g) => `<div class="nt-row nt-${g.id}" role="group" aria-labelledby="${id}-${g.id}"><span class="nt-row-t" id="${id}-${g.id}">${g.title}</span><div class="nt-keys">${g.keys.map((k) => `<button type="button" class="nt-key" data-nt-key="${k}" aria-label="${esc(keyLabel(k, ''))}">${k}</button>`).join('')}</div></div>`;
    return `<div class="nt">
      <div class="nt-play">
        <figure class="nt-stage">
          <svg class="nt-cube" viewBox="-82 -82 164 164" role="img" aria-label="El cubo"></svg>
          <figcaption class="nt-now" aria-live="polite">Toca una letra y mira cómo gira.</figcaption>
        </figure>
        <div class="nt-pad">
          <div class="seg small nt-mod" role="group" aria-label="Cómo gira">
            <button type="button" data-nt-mod="" aria-pressed="true">Normal</button><button type="button" data-nt-mod="'" aria-pressed="false">Al revés (')</button><button type="button" data-nt-mod="2" aria-pressed="false">Media vuelta (2)</button>
          </div>
          <div class="nt-rows">${GROUPS.map(row).join('')}</div>
          <div class="nt-view"><button type="button" class="btn" data-nt-again disabled>Otra vez</button><button type="button" class="btn" data-nt-cam disabled>Vista inicial</button></div>
          <p class="hint nt-held">${held} Arrastra el cubo para verlo por detrás o por debajo.</p>
          <form class="nt-alg" novalidate>
            <h3><label for="${id}-alg">Un algoritmo, giro a giro</label></h3>
            <div class="nt-alg-row">
              <input class="text-input" id="${id}-alg" type="text" value="R U R' U'" maxlength="240" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" aria-describedby="${id}-err">
              <button class="btn primary" type="submit">Ver</button>
              <button class="btn" type="button" data-nt-step>Paso a paso</button>
            </div>
            <div class="nt-ex" role="group" aria-label="Algunos para probar">${EXAMPLES[white ? 'white' : 'yellow'].map(([name, alg]) => `<button type="button" class="btn" data-nt-ex="${esc(alg)}">${esc(name)}</button>`).join('')}</div>
            <p class="notice nt-err" id="${id}-err" role="alert" hidden></p>
            <ol class="nt-chips" aria-label="Sus giros" hidden></ol>
          </form>
        </div>
      </div>
      <div class="nt-text">
        <h3>Cómo se lee</h3>
        <ul>
          <li><b>Cada letra es una cara, por dónde está y no por su color:</b> R (Right) es la de la derecha, L (Left) la de la izquierda, U (Up) la de arriba, D (Down) la de abajo, F (Front) la de delante y B (Back) la de detrás.</li>
          <li><b>La letra sola</b> es un cuarto de vuelta como las agujas del reloj, <b>mirando esa cara de frente</b>. Por eso R sube por delante y L baja, aunque las dos giren «como las agujas del reloj».</li>
          <li><b>Con '</b> (R', «R prima») es al revés, y <b>con 2</b> (R2), media vuelta: da igual hacia qué lado.</li>
          <li><b>En minúscula o con w</b> (r o Rw): esa cara y la capa del medio que tiene al lado, a la vez.</li>
          <li><b>M, E y S</b> son solo la capa del medio: M gira como L, E como D y S como F.</li>
          <li><b>x, y, z</b> giran el cubo entero en la mano, sin mover ninguna capa: x como R, y como U y z como F. Desde ahí, cada cara se llama por dónde ha quedado.</li>
          <li><b>Un algoritmo se lee de izquierda a derecha.</b> Los paréntesis no cambian nada: solo agrupan los giros para recordarlos mejor.</li>
        </ul>
      </div>
    </div>`;
  }

  let made = 0;
  const mounted = new WeakSet();
  function mount(el, opts = {}) {
    if (!el || mounted.has(el)) return;
    mounted.add(el);
    const id = `nt${++made}`;
    const white = opts.up === 'white';
    const base = white ? M.solved() : M.apply(M.solved(), 'z2');
    el.innerHTML = html(id, white);
    const root = el.querySelector('.nt');
    const q = (s) => root.querySelector(s);
    const svg = q('.nt-cube');
    const now = q('.nt-now');
    const again = q('[data-nt-again]');
    const camBtn = q('[data-nt-cam]');
    const input = q('.nt-alg input');
    const chips = q('.nt-chips');
    const err = q('.nt-err');
    const held = white ? 'el blanco arriba y el verde delante' : 'el amarillo arriba y el verde delante';
    let mod = '';
    let last = null;        // what «Otra vez» repeats: { key } or { alg }
    let seq = null;         // the algorithm on the cube: { moves, at (moves done), auto, src, busy }
    let shown = '';
    const cube = makeCube(root, svg, base, (st) => {
      root.dataset.facelets = M.toFacelets(st);
      svg.setAttribute('aria-label', `El cubo, con ${held}${shown ? `, después de ${shown}` : ''}`);
    });

    function renderKeys() {
      root.querySelectorAll('[data-nt-mod]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.ntMod === mod)));
      root.querySelectorAll('[data-nt-key]').forEach((b) => {
        b.textContent = b.dataset.ntKey + mod;
        b.setAttribute('aria-label', keyLabel(b.dataset.ntKey, mod));
      });
    }
    const lightKey = (k) => root.querySelectorAll('[data-nt-key]').forEach((b) => b.toggleAttribute('data-on', b.dataset.ntKey === k));
    function markChips(cur, done) {
      chips.querySelectorAll('.nt-chip').forEach((b, i) => {
        if (i === cur) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
        b.classList.toggle('done', i < done);
      });
    }
    // One letter, from the cube as it is held.
    function showKey(text) {
      seq = null;
      markChips(-1, -1);
      last = { key: text };
      again.disabled = false;
      const m = M.parseAlg(text)[0];
      lightKey(text.charAt(0));
      now.innerHTML = `<b>${esc(text)}</b> ${esc(says(m))}`;
      shown = text;
      cube.set(base);
      cube.turn(m, msFor(m, 'key'));
    }
    // An algorithm: all of it (auto) or a move a press; its moves as chips, the one turning marked.
    function begin(src, auto) {
      const r = read(src);
      err.hidden = !r.error;
      err.textContent = r.error || '';
      if (r.error) return null;
      last = { alg: src };
      again.disabled = false;
      lightKey('');
      chips.innerHTML = r.moves.map((mv, i) => `<li><button type="button" class="nt-chip" data-nt-at="${i}" aria-label="Giro ${i + 1}: ${esc(mv.text)}">${esc(mv.text)}</button></li>`).join('');
      chips.hidden = false;
      seq = { moves: r.moves, at: 0, auto, src, busy: null };
      shown = '';
      cube.set(base);
      return seq;
    }
    function tell(s, i) {
      const mv = s.moves[i];
      now.innerHTML = `<b>${esc(mv.text)}</b> Giro ${i + 1} de ${s.moves.length}. ${esc(says(mv.m))}`;
      shown = s.moves.slice(0, i + 1).map((x) => x.text).join(' ');
    }
    function playOne(s) {
      const i = s.at;
      markChips(i, i);
      tell(s, i);
      s.busy = cube.turn(s.moves[i].m, msFor(s.moves[i].m, s.auto ? 'alg' : 'key')).then((ok) => {
        s.busy = null;
        if (ok && seq === s) s.at = i + 1;
        return ok;
      });
      return s.busy;
    }
    function finished(s) {
      markChips(-1, s.moves.length);
      now.innerHTML = `<b>${s.moves.length} ${s.moves.length === 1 ? 'giro' : 'giros'}</b> Ya está. Toca uno para volver a él o «Paso a paso» para verlo despacio.`;
    }
    async function playAlg(src) {
      const s = begin(src, true);
      if (!s) return;
      while (seq === s && s.auto && s.at < s.moves.length) {
        if (!(await playOne(s)) || seq !== s) return;
        if (s.at < s.moves.length) await wait(SPEED.gap);
      }
      if (seq === s && s.at >= s.moves.length) finished(s);
    }
    async function stepAlg() {
      let s = seq;
      if (!s || s.src !== input.value || s.at >= s.moves.length) {
        s = begin(input.value, false);
        if (!s) return;
      } else {
        s.auto = false;
        if (s.busy) { cube.finish(); await s.busy; }
        if (seq !== s) return;
        if (s.at >= s.moves.length) { finished(s); return; }
      }
      await playOne(s);
      if (seq === s && s.at >= s.moves.length) finished(s);
    }
    function jump(i) {
      const s = seq;
      if (!s) return;
      s.auto = false;
      s.at = i + 1;
      markChips(i, i);
      tell(s, i);
      cube.set(M.apply(base, s.moves.slice(0, i + 1).map((mv) => mv.m.text).join(' ')));
    }

    q('.nt-pad').addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.ntMod !== undefined) { mod = b.dataset.ntMod; renderKeys(); return; }
      if (b.dataset.ntKey) showKey(b.dataset.ntKey + mod);
    });
    again.addEventListener('click', () => { if (last && last.key) showKey(last.key); else if (last) playAlg(last.alg); });
    camBtn.addEventListener('click', () => { Object.assign(cube.cam, CAM0); cube.paint(); camBtn.disabled = true; });
    q('.nt-alg').addEventListener('submit', (ev) => { ev.preventDefault(); playAlg(input.value); });
    q('[data-nt-step]').addEventListener('click', () => stepAlg());
    q('.nt-ex').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-nt-ex]');
      if (!b) return;
      input.value = b.dataset.ntEx;
      playAlg(input.value);
    });
    chips.addEventListener('click', (ev) => { const b = ev.target.closest('[data-nt-at]'); if (b) jump(Number(b.dataset.ntAt)); });

    // Drag to go round it. The touch is the cube's: no scroll, long-press menu or magnifier from it.
    let drag = null;
    svg.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, yaw: cube.cam.yaw, pitch: cube.cam.pitch };
      if (svg.setPointerCapture) svg.setPointerCapture(ev.pointerId);
      svg.classList.add('drag');
    });
    svg.addEventListener('pointermove', (ev) => {
      if (!drag || ev.pointerId !== drag.id) return;
      cube.cam.yaw = drag.yaw - (ev.clientX - drag.x) * 0.011;
      cube.cam.pitch = Math.max(-1.3, Math.min(1.3, drag.pitch + (ev.clientY - drag.y) * 0.011));
      camBtn.disabled = false;
      if (!cube.busy) cube.paint();
    });
    const drop = () => { drag = null; svg.classList.remove('drag'); };
    svg.addEventListener('pointerup', drop);
    svg.addEventListener('pointercancel', drop);
    svg.addEventListener('touchstart', (ev) => { if (ev.cancelable) ev.preventDefault(); }, { passive: false });
    svg.addEventListener('contextmenu', (ev) => ev.preventDefault());

    cube.set(base);
  }

  // For the tests: does turning the little cubes by the angle of each move leave every sticker where
  // CubeModel says (so the end of a turn on screen is the state after it, with no jump)?
  function check() {
    const bad = [];
    for (const b of Object.keys(M.TURNS)) {
      for (const turns of [1, 2, 3]) {
        const [a, layers, q] = M.TURNS[b];
        const to = (turns === 3 ? -q : q * turns) * (Math.PI / 2);
        const text = b + (turns === 2 ? '2' : turns === 3 ? "'" : '');
        const after = M.apply(M.solved(), text);
        const r = (v) => spin(v, a, to).map((x) => Math.round(x));
        M.STICKERS.forEach((s, i) => {
          const j = layers.includes(s.pos[a]) ? AT.get(KEY(r(s.pos), r(s.nrm))) : i;
          if (after[j] !== i) bad.push(`${text}:${i}`);
        });
      }
    }
    return bad;
  }

  // <details data-notation="white|yellow">: mounted the first time it opens.
  document.addEventListener('toggle', (ev) => {
    const d = ev.target;
    if (d instanceof HTMLDetailsElement && d.open && d.dataset.notation !== undefined) mount(d.querySelector('[data-notation-body]'), { up: d.dataset.notation });
  }, true);

  window.CubeNotation = { mount, read, says, _check: check };
})();
