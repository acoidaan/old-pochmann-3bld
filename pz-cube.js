// NxN cubes for the event pages (2×2 and 4×4): stickers and WCA notation (face, wide Rw, inner slice r or 2R,
// rotations), a random-state 2×2 scrambler (IDA* over the corners, as the WCA does it), random-move 4×4
// scrambles, and drawings: the net, the top with its sides, and the cube in 3D. Pure functions: it touches no
// page. Exposes window.PzCube (module.exports in Node).
(function (root) {
  'use strict';

  // ================= Stickers =================
  // Faces U R F D L B, n×n stickers each, read as in the usual net (U above F, then L F R B, then D).
  // Coordinates: x L→R, y D→U, z B→F; a cubie's centre is at odd numbers from -(n-1) to n-1.
  const FACES = {
    U: { n: [0, 1, 0], r: [1, 0, 0], d: [0, 0, 1] },
    R: { n: [1, 0, 0], r: [0, 0, -1], d: [0, -1, 0] },
    F: { n: [0, 0, 1], r: [1, 0, 0], d: [0, -1, 0] },
    D: { n: [0, -1, 0], r: [1, 0, 0], d: [0, 0, -1] },
    L: { n: [-1, 0, 0], r: [0, 0, 1], d: [0, -1, 0] },
    B: { n: [0, 0, -1], r: [-1, 0, 0], d: [0, -1, 0] },
  };
  const ORDER = ['U', 'R', 'F', 'D', 'L', 'B'];
  const COLOR_NAME = { U: 'blanco', R: 'rojo', F: 'verde', D: 'amarillo', L: 'naranja', B: 'azul' };

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
  // A letter: its axis, its side (0: the whole cube) and the quarter turns (right-hand rule) of one clockwise turn.
  const BASE = { R: [0, 1, -1], L: [0, -1, 1], U: [1, 1, -1], D: [1, -1, 1], F: [2, 1, -1], B: [2, -1, 1], x: [0, 0, -1], y: [1, 0, -1], z: [2, 0, -1] };

  const models = {};
  function make(n) {
    if (models[n]) return models[n];
    const N = n * n;
    const stickers = [];
    ORDER.forEach((f) => {
      const { n: nv, r, d } = FACES[f];
      for (let row = 0; row < n; row++) {
        for (let col = 0; col < n; col++) {
          const pos = [0, 1, 2].map((k) => nv[k] * (n - 1) + r[k] * (2 * col - (n - 1)) + d[k] * (2 * row - (n - 1)));
          stickers.push({ face: f, row, col, pos, nrm: nv.slice() });
        }
      }
    });
    const keyOf = (p, q) => `${p.join(',')}|${q.join(',')}`;
    const index = new Map(stickers.map((s, i) => [keyOf(s.pos, s.nrm), i]));
    const perms = new Map();
    // The permutation of one move: depth 1 is the outer layer, 2 the next one in, and so on.
    function permOf(letter, depths, turns) {
      const k = `${letter}${depths.join('')}:${turns}`;
      if (perms.has(k)) return perms.get(k);
      const [a, side, q] = BASE[letter];
      const coords = side === 0 ? null : depths.map((dp) => side * (n - 1 - 2 * (dp - 1)));
      const perm = stickers.map((s, i) => (coords === null || coords.includes(s.pos[a])
        ? index.get(keyOf(rot(s.pos, a, q * turns), rot(s.nrm, a, q * turns)))
        : i));
      perms.set(k, perm);
      return perm;
    }
    // WCA and SiGN notation: R R' R2, Rw (two layers), 3Rw (three), r or 2R (only the second layer), x y z.
    function parse(str) {
      return String(str || '').replace(/[’`´]/g, "'").trim().split(/\s+/).filter(Boolean).map((t) => {
        const m = t.match(/^(\d)?([RLUDFBrludfbxyz])(w)?(2|')?(2|')?$/);
        if (!m) throw new Error(`Movimiento no válido: ${t}`);
        const [, num, ch, w, s1, s2] = m;
        let letter = ch;
        let depths = [1];
        if ('xyz'.includes(ch)) {
          if (num || w) throw new Error(`Movimiento no válido: ${t}`);
          depths = [];
        } else if (ch === ch.toLowerCase()) {
          if (w || num) throw new Error(`Movimiento no válido: ${t}`);
          letter = ch.toUpperCase();
          depths = [2];
        } else if (w) {
          const k = num ? Number(num) : 2;
          depths = Array.from({ length: k }, (_, i) => i + 1);
        } else if (num) depths = [Number(num)];
        // On a 2×2 only the outer layers; on bigger ones, up to all but one layer.
        if (depths.length && (n <= 2 ? depths.some((dp) => dp !== 1) : depths.some((dp) => dp < 1 || dp > n - 1))) {
          throw new Error(`Movimiento no válido en ${n}×${n}: ${t}`);
        }
        let turns = 1;
        const mods = [s1, s2].filter(Boolean);
        if (mods.includes('2')) turns = 2;
        else if (mods.includes("'")) turns = 3;
        return { text: t, letter, depths, turns };
      });
    }
    const solved = () => Array.from({ length: 6 * N }, (_, i) => i);
    function applyOne(state, m) {
      const perm = permOf(m.letter, m.depths, m.turns);
      const out = new Array(state.length);
      for (let i = 0; i < state.length; i++) out[perm[i]] = state[i];
      return out;
    }
    const apply = (state, alg) => parse(alg).reduce(applyOne, state);
    // The wings of the edge between faces a and b (n > 3): pairs [sticker on a, sticker on b] of each cubie,
    // along the edge.
    function wings(a, b) {
      const on = (f) => stickers.map((s, i) => i).filter((i) => stickers[i].face === f);
      const byPos = new Map(on(b).map((i) => [stickers[i].pos.join(','), i]));
      return on(a).filter((i) => byPos.has(stickers[i].pos.join(',')) && stickers[i].pos.filter((v) => Math.abs(v) === n - 1).length === 2)
        .map((i) => [i, byPos.get(stickers[i].pos.join(','))]).sort((x, y) => stickers[x[0]].pos.join() < stickers[y[0]].pos.join() ? -1 : 1);
    }
    // An edge turned over in place (its wings swap ends and flip: the 4×4's OLL parity) or two edges swapped as
    // a U2 would swap them (its PLL parity), straight on the stickers.
    function flipEdge(state, a, b) {
      const w = wings(a, b);
      const out = state.slice();
      w.forEach(([pa, pb], k) => { const [qa, qb] = w[w.length - 1 - k]; out[pa] = state[qb]; out[pb] = state[qa]; });
      return out;
    }
    function swapEdges(state, [a1, b1], [a2, b2]) {
      const w1 = wings(a1, b1);
      const w2 = wings(a2, b2);
      const out = state.slice();
      w1.forEach(([pa, pb], k) => { const [qa, qb] = w2[w2.length - 1 - k]; out[pa] = state[qa]; out[pb] = state[qb]; out[qa] = state[pa]; out[qb] = state[pb]; });
      return out;
    }
    const colorOf = (id) => ORDER[Math.floor(id / N)];
    const faceColors = (state, f) => state.slice(ORDER.indexOf(f) * N, ORDER.indexOf(f) * N + N).map(colorOf);
    // Solved: every face one colour, however the cube is held.
    const isSolved = (state) => ORDER.every((f) => new Set(faceColors(state, f)).size === 1);
    return { n, N, stickers, parse, solved, apply, colorOf, faceColors, isSolved, permOf, wings, flipEdge, swapEdges };
  }

  // A sequence turned back to front.
  function invert(alg) {
    return String(alg || '').trim().split(/\s+/).filter(Boolean).reverse().map((t) => {
      const c = t.replace(/[’`´]/g, "'");
      if (/2'?$/.test(c)) return c.replace(/'$/, '');
      return c.endsWith("'") ? c.slice(0, -1) : `${c}'`;
    }).join(' ');
  }

  // ================= 2×2: random-state scrambles =================
  // The corners as pieces (the 2×2 model's stickers grouped by cubie), the WCA way: a random state, solved
  // with IDA* in R, U and F (the back-down-left corner never moves), and the scramble is that solution undone.
  const two = (() => {
    const M = make(2);
    const byCubie = new Map();
    M.stickers.forEach((s, i) => {
      const k = s.pos.map((v) => Math.sign(v)).join(',');
      if (!byCubie.has(k)) byCubie.set(k, []);
      byCubie.get(k).push(i);
    });
    const det = (a, b, c) => a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    // Each slot: its 3 stickers, the up or down one first, then clockwise as seen from outside.
    const slots = [...byCubie.entries()].map(([k, ids]) => {
      const ud = ids.find((i) => M.stickers[i].face === 'U' || M.stickers[i].face === 'D');
      const rest = ids.filter((i) => i !== ud);
      const [a, b] = rest;
      const ord = det(M.stickers[ud].nrm, M.stickers[a].nrm, M.stickers[b].nrm) < 0 ? [ud, a, b] : [ud, b, a];
      return { key: k, ids: ord };
    });
    const FIXED = slots.findIndex((s) => s.key === '-1,-1,-1');
    const slotOfPos = new Map();
    slots.forEach((s, si) => s.ids.forEach((p, k) => slotOfPos.set(p, [si, k])));
    // A sticker state as pieces: for each slot, which piece is there and how it is twisted.
    function piecesOf(state) {
      const cp = [];
      const co = [];
      slots.forEach((s, si) => {
        const [piece] = slotOfPos.get(state[s.ids[0]]);
        cp[si] = piece;
        // Where the piece's up/down sticker is, among this slot's three.
        const udId = slots[piece].ids[0];
        co[si] = s.ids.findIndex((p) => state[p] === udId);
      });
      return { cp, co };
    }
    function stateOf(cp, co) {
      const st = new Array(24);
      slots.forEach((s, si) => {
        const piece = slots[cp[si]];
        for (let k = 0; k < 3; k++) st[s.ids[(k + co[si]) % 3]] = piece.ids[k];
      });
      return st;
    }
    const MOVES = ['R', "R'", 'R2', 'U', "U'", 'U2', 'F', "F'", 'F2'];
    const moveTab = MOVES.map((mv) => {
      const perm = M.permOf(mv[0], [1], mv[1] === '2' ? 2 : mv[1] === "'" ? 3 : 1);
      // Slot s goes to slot t, with its up/down sticker landing at position k of t.
      return slots.map((s) => slotOfPos.get(perm[s.ids[0]]));
    });
    const MOVABLE = slots.map((_, i) => i).filter((i) => i !== FIXED);
    const FACT = [1, 1, 2, 6, 24, 120, 720, 5040];
    function permIndex(cp) {
      const arr = MOVABLE.map((s) => MOVABLE.indexOf(cp[s]));
      let idx = 0;
      for (let i = 0; i < 7; i++) {
        let smaller = 0;
        for (let j = i + 1; j < 7; j++) if (arr[j] < arr[i]) smaller++;
        idx += smaller * FACT[6 - i];
      }
      return idx;
    }
    function permFrom(idx) {
      const left = [0, 1, 2, 3, 4, 5, 6];
      const arr = [];
      for (let i = 0; i < 7; i++) {
        const f = FACT[6 - i];
        const k = Math.floor(idx / f);
        idx %= f;
        arr.push(left.splice(k, 1)[0]);
      }
      const cp = slots.map((_, i) => i);
      MOVABLE.forEach((s, i) => { cp[s] = MOVABLE[arr[i]]; });
      return cp;
    }
    const oriIndex = (co) => MOVABLE.slice(0, 6).reduce((a, s) => a * 3 + co[s], 0);
    function oriFrom(idx) {
      const co = slots.map(() => 0);
      let sum = 0;
      for (let i = 5; i >= 0; i--) { co[MOVABLE[i]] = idx % 3; sum += co[MOVABLE[i]]; idx = Math.floor(idx / 3); }
      co[MOVABLE[6]] = (3 - (sum % 3)) % 3;
      return co;
    }
    function applyTab(cp, co, t) {
      const ncp = cp.slice();
      const nco = co.slice();
      slots.forEach((_, s) => {
        const [to, k] = moveTab[t][s];
        ncp[to] = cp[s];
        nco[to] = (co[s] + k) % 3;
      });
      return [ncp, nco];
    }
    let tables = null;
    function build() {
      if (tables) return tables;
      const solvedCo = slots.map(() => 0);
      const solvedCp = slots.map((_, i) => i);
      const pMove = new Int16Array(5040 * 9);
      const oMove = new Int16Array(729 * 9);
      for (let i = 0; i < 5040; i++) {
        const cp = permFrom(i);
        for (let t = 0; t < 9; t++) pMove[i * 9 + t] = permIndex(applyTab(cp, solvedCo, t)[0]);
      }
      for (let i = 0; i < 729; i++) {
        const co = oriFrom(i);
        for (let t = 0; t < 9; t++) oMove[i * 9 + t] = oriIndex(applyTab(solvedCp, co, t)[1]);
      }
      const bfs = (size, mv, start) => {
        const d = new Int8Array(size).fill(-1);
        d[start] = 0;
        let frontier = [start];
        for (let depth = 0; frontier.length; depth++) {
          const next = [];
          for (const x of frontier) for (let t = 0; t < 9; t++) { const y = mv[x * 9 + t]; if (d[y] < 0) { d[y] = depth + 1; next.push(y); } }
          frontier = next;
        }
        return d;
      };
      tables = { pMove, oMove, pDist: bfs(5040, pMove, permIndex(solvedCp)), oDist: bfs(729, oMove, oriIndex(solvedCo)) };
      return tables;
    }
    // The shortest solution (IDA*) of a position given by its corner indices.
    function solve(p, o, maxDepth = 11) {
      const T = build();
      const path = [];
      const face = (t) => Math.floor(t / 3);
      const dfs = (p1, o1, depth, last) => {
        const h = Math.max(T.pDist[p1], T.oDist[o1]);
        if (h === 0) return true;
        if (h > depth) return false;
        for (let t = 0; t < 9; t++) {
          if (face(t) === last) continue;
          path.push(t);
          if (dfs(T.pMove[p1 * 9 + t], T.oMove[o1 * 9 + t], depth - 1, face(t))) return true;
          path.pop();
        }
        return false;
      };
      for (let depth = 0; depth <= maxDepth; depth++) {
        path.length = 0;
        if (dfs(p, o, depth, -1)) return path.map((t) => MOVES[t]);
      }
      return null;
    }
    // A uniformly random position at least `min` turns away (the WCA asks for 4), and its scramble.
    function scramble(rand = Math.random, min = 4) {
      for (;;) {
        const p = Math.floor(rand() * 5040);
        const o = Math.floor(rand() * 729);
        const sol = solve(p, o);
        if (sol && sol.length >= min) return invert(sol.join(' '));
      }
    }
    // The position of a sticker state, for checks (and its optimal length).
    function distance(state) {
      const { cp, co } = piecesOf(state);
      if (cp[FIXED] !== FIXED || co[FIXED] !== 0) return null;   // turned as a whole: not in R, U, F
      const sol = solve(permIndex(cp), oriIndex(co), 14);
      return sol ? sol.length : null;
    }
    // The shortest R, U, F solution of a sticker state (its back-down-left corner in place), or null.
    function solveState(state, maxDepth = 14) {
      const { cp, co } = piecesOf(state);
      if (cp[FIXED] !== FIXED || co[FIXED] !== 0) return null;
      return solve(permIndex(cp), oriIndex(co), maxDepth);
    }
    return { scramble, solve, solveState, distance, piecesOf, stateOf, slots, FIXED, MOVES };
  })();

  // ================= 4×4: random-move scrambles =================
  // 40 turns as the WCA writes them for 4×4 (R U F L D B, Rw Uw Fw), never the same layer twice in a row and
  // never something that undoes itself on one axis.
  function randomMoves(len, rand = Math.random, set = ['R', 'L', 'U', 'D', 'F', 'B', 'Rw', 'Uw', 'Fw']) {
    const AXIS = { R: 0, L: 0, U: 1, D: 1, F: 2, B: 2 };
    const out = [];
    let axis = -1;
    let used = new Set();
    while (out.length < len) {
      const m = set[Math.floor(rand() * set.length)];
      const a = AXIS[m[0]];
      if (a === axis && used.has(m)) continue;
      if (a !== axis) { axis = a; used = new Set(); }
      used.add(m);
      out.push(m + ['', "'", '2'][Math.floor(rand() * 3)]);
    }
    return out.join(' ');
  }

  // ================= Drawings =================
  // A sticker left out of a picture (opts.keep says no) is grey, as in the CFOP pictures.
  const fillOf = (f) => (f === '-' ? 'var(--fr-blank, #5B6271)' : `var(--st-${f})`);
  // The colour a picture shows at a sticker slot: its own, or grey when opts.keep(slot, colour) says no.
  const shown = (M, st, opts, i) => { const c = M.colorOf(st[i]); return opts.keep && !opts.keep(i, c) ? '-' : c; };
  // The whole net: U on top, then L F R B, then D.
  function net(n, state, opts = {}) {
    const M = make(n);
    const st = state || M.solved();
    const s = opts.cell || (n <= 2 ? 18 : 10);
    const g = Math.max(1, Math.round(s / 9));
    const faceW = n * s + (n - 1) * g;
    const gap = Math.round(s / 2);
    const at = { U: [1, 0], L: [0, 1], F: [1, 1], R: [2, 1], B: [3, 1], D: [1, 2] };
    const W = 4 * faceW + 3 * gap;
    const H = 3 * faceW + 2 * gap;
    let body = '';
    ORDER.forEach((f, fi) => {
      const [cx, cy] = at[f];
      const ox = cx * (faceW + gap);
      const oy = cy * (faceW + gap);
      for (let k = 0; k < M.N; k++) {
        const row = Math.floor(k / n);
        const col = k % n;
        const c = shown(M, st, opts, fi * M.N + k);
        body += `<rect x="${ox + col * (s + g)}" y="${oy + row * (s + g)}" width="${s}" height="${s}" rx="${Math.max(1, s / 6).toFixed(1)}" fill="${fillOf(c)}"/>`;
      }
    });
    const label = opts.label ? ` role="img" aria-label="${opts.label}"` : ' aria-hidden="true"';
    return `<svg class="pz-net pz-n${n}" viewBox="-1 -1 ${W + 2} ${H + 2}" width="${opts.width || W}"${label}>${body}</svg>`;
  }
  // The top face and the stickers of its sides around it (as the OLL and PLL pictures).
  function top(n, state, opts = {}) {
    const M = make(n);
    const st = state || M.solved();
    const s = opts.cell || 22;
    const g = 3;
    const side = Math.round(s * 0.36);
    const span = n * s + (n - 1) * g;
    const o = side + g;
    const W = span + 2 * o;
    let body = '';
    const color = (f, row, col) => shown(M, st, opts, ORDER.indexOf(f) * M.N + row * n + col);
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        body += `<rect x="${o + col * (s + g)}" y="${o + row * (s + g)}" width="${s}" height="${s}" rx="3" fill="${fillOf(color('U', row, col))}"/>`;
      }
    }
    for (let k = 0; k < n; k++) {
      // Back row of B (its top row, read from the back: right to left from the front).
      body += `<rect x="${o + (n - 1 - k) * (s + g)}" y="0" width="${s}" height="${side}" rx="2" fill="${fillOf(color('B', 0, k))}"/>`;
      body += `<rect x="${o + k * (s + g)}" y="${o + span + g}" width="${s}" height="${side}" rx="2" fill="${fillOf(color('F', 0, k))}"/>`;
      body += `<rect x="0" y="${o + k * (s + g)}" width="${side}" height="${s}" rx="2" fill="${fillOf(color('L', 0, k))}"/>`;
      body += `<rect x="${o + span + g}" y="${o + (n - 1 - k) * (s + g)}" width="${side}" height="${s}" rx="2" fill="${fillOf(color('R', 0, k))}"/>`;
    }
    const label = opts.label ? ` role="img" aria-label="${opts.label}"` : ' aria-hidden="true"';
    return `<svg class="pz-top" viewBox="-1 -1 ${W + 2} ${W + 2}" width="${opts.width || W}"${label}>${body}</svg>`;
  }
  // The cube in 3D, from above, in front and to the right: U, F and R.
  function iso(n, state, opts = {}) {
    const M = make(n);
    const st = state || M.solved();
    const s = opts.cell || (n <= 2 ? 26 : 15);
    const cx = Math.cos(Math.PI / 6) * s;
    const sy = Math.sin(Math.PI / 6) * s;
    const W = 2 * n * cx;
    const H = 2 * n * s;
    // Corners of the three faces, from the top corner of the picture.
    const pt = (x, y) => `${x.toFixed(1)},${y.toFixed(1)}`;
    const ox = n * cx;
    let body = '';
    const poly = (p, f) => { body += `<polygon points="${p.join(' ')}" fill="${fillOf(f)}" stroke="var(--plastic)" stroke-width="${(s / 9).toFixed(1)}" stroke-linejoin="round"/>`; };
    const color = (f, row, col) => shown(M, st, opts, ORDER.indexOf(f) * M.N + row * n + col);
    for (let row = 0; row < n; row++) {
      for (let col = 0; col < n; col++) {
        // U: col goes right-down, row goes left-down (towards the front).
        const ux = ox + (col - row) * cx;
        const uy = (col + row) * sy;
        poly([pt(ux, uy), pt(ux + cx, uy + sy), pt(ux, uy + 2 * sy), pt(ux - cx, uy + sy)], color('U', row, col));
        // F: below the front-left edge of U.
        const fx = col * cx;
        const fy = n * sy + col * sy + row * s;
        poly([pt(fx, fy), pt(fx + cx, fy + sy), pt(fx + cx, fy + sy + s), pt(fx, fy + s)], color('F', row, col));
        // R: below the front-right edge of U.
        const rx = ox + col * cx;
        const ry = 2 * n * sy - col * sy + row * s;
        poly([pt(rx, ry), pt(rx + cx, ry - sy), pt(rx + cx, ry - sy + s), pt(rx, ry + s)], color('R', row, col));
      }
    }
    const label = opts.label ? ` role="img" aria-label="${opts.label}"` : ' aria-hidden="true"';
    return `<svg class="pz-iso" viewBox="-2 -2 ${(W + 4).toFixed(1)} ${(H + 4).toFixed(1)}" width="${opts.width || Math.round(W)}"${label}>${body}</svg>`;
  }

  const api = { make, invert, two, randomMoves, net, top, iso, ORDER, COLOR_NAME };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PzCube = api;
})(typeof window !== 'undefined' ? window : globalThis);
