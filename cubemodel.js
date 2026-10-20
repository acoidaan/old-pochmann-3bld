// The cube model shared by every page: 54 stickers, face, slice and wide turns, rotations, and the
// random-state scramble generator (Kociemba's two-phase solver from cubejs, in a Web Worker).
// Exposes window.CubeModel; it touches no page element.
(() => {
  'use strict';

  // ================= Stickers and turns =================
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
  const isSolved = (st) => st.every((v, i) => v === i);
  const faceOfSticker = (i) => FACE_ORDER[Math.floor(i / 9)];
  function pieceName(i) {
    const p = STICKERS[i].pos; const out = [];
    if (p[1] === 1) out.push('U'); if (p[1] === -1) out.push('D');
    if (p[2] === 1) out.push('F'); if (p[2] === -1) out.push('B');
    if (p[0] === 1) out.push('R'); if (p[0] === -1) out.push('L');
    return out.join('');
  }
  const COLOR_NAME = { U: 'blanco', R: 'rojo', F: 'verde', D: 'amarillo', L: 'naranja', B: 'azul' };
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

  // ================= Random-state scrambles =================
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
    self.onmessage = (ev) => {
      const d = ev.data;
      // A state read from a smart cube: the scramble is the inverse of its solution.
      if (d && d.facelets) {
        let s = null;
        try { s = Cube.inverse(Cube.fromString(d.facelets).solve()); } catch (e) { s = null; }
        self.postMessage({ scramble: s });
        return;
      }
      self.postMessage({ scramble: make(d) });
    };
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
  // The solver pads short solutions with turns that cancel (L2 L2, U2 D2 … D2 U2): take them out.
  function simplifyAlg(str) {
    const AXIS = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };
    const out = [];
    for (const m of parseAlg(str)) {
      let k = out.length - 1;
      while (k >= 0 && AXIS[out[k].base] === AXIS[m.base] && out[k].base !== m.base) k--;
      if (k >= 0 && out[k].base === m.base && AXIS[out[k].base] === AXIS[m.base]) {
        out[k].turns = (out[k].turns + m.turns) % 4;
        if (!out[k].turns) out.splice(k, 1);
      } else out.push({ base: m.base, turns: m.turns });
    }
    return out.map((m) => m.base + (m.turns === 2 ? '2' : m.turns === 3 ? "'" : '')).join(' ');
  }
  function solveState(facelets) {
    return startScrambler()
      .then(() => new Promise((res) => { scrQueue.push(res); scrWorker.postMessage({ facelets }); }))
      .then((s) => (s == null ? Promise.reject(new Error('no se puede resolver ese estado')) : simplifyAlg(s)));
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

  // ================= The smart cube's frame =================
  // The cube only feels its six faces turning around a fixed core: a wide turn (l, d) arrives as the opposite
  // face turn and a slice (M) as two face turns. States are compared in that frame, with the centres home.
  const CENTERS = [4, 13, 22, 31, 40, 49];
  const ROTATIONS = ['', 'x', 'x2', "x'", 'z', "z'"].flatMap((a) => ['', 'y', 'y2', "y'"].map((b) => `${a} ${b}`.trim()));
  const centred = (st) => CENTERS.every((c) => st[c] === c);
  function norm(st) {
    if (centred(st)) return st;
    for (const r of ROTATIONS) {
      const s = apply(st, r);
      if (centred(s)) return s;
    }
    return st;
  }
  // Pieces as groups of sticker positions, and each home piece by its colours.
  const CUBIES = [];
  const HOME = new Map();
  for (let p = 0; p < 54; p++) {
    const g = PIECE_OF[p];
    if (g.length < 2 || CUBIES.includes(g)) continue;
    CUBIES.push(g);
    HOME.set(g.map(faceOfSticker).sort().join(''), g);
  }
  // The cube sends 54 colours (URFDLB, Kociemba order, the same as ours); the app tracks sticker ids.
  function fromFacelets(f) {
    if (typeof f !== 'string' || f.length !== 54) return null;
    const st = new Array(54);
    for (const c of CENTERS) {
      if (f[c] !== faceOfSticker(c)) return null;
      st[c] = c;
    }
    const used = new Set();
    for (const g of CUBIES) {
      const home = HOME.get(g.map((p) => f[p]).sort().join(''));
      if (!home || used.has(home)) return null;
      used.add(home);
      for (const p of g) st[p] = home.find((id) => faceOfSticker(id) === f[p]);
    }
    return st;
  }
  const toFacelets = (st) => st.map(faceOfSticker).join('');

  window.CubeModel = {
    FACES, FACE_ORDER, STICKERS, PIECE_OF, COLOR_NAME,
    parseAlg, invertAlg, solved, apply, isSolved, faceOfSticker, pieceName,
    startScrambler, requestScramble, solveState, simplifyAlg, withTimeout, randomMoveScramble,
    scramblerReady: () => scrIsReady,
    CENTERS, ROTATIONS, CUBIES, norm, fromFacelets, toFacelets,
  };
})();
