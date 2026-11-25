// The Pyraminx for its event page: 36 stickers built from the tetrahedron itself (each turn is a real 120°
// rotation), WCA notation (U L R B for the layers, u l r b for the tips, clockwise looking at that corner),
// random-state scrambles (IDA* over edges and centres, at least 6 turns away, tips added at the end, as the
// WCA does it) and the net as SVG. Pure functions: it touches no page. Exposes window.PzPyra (module.exports in
// Node).
(function (root) {
  'use strict';

  // ================= Geometry =================
  // Corners: U on top, L front-left, R front-right and B at the back, all at the bottom but U.
  const s23 = Math.sqrt(2 / 3);
  const s2 = Math.sqrt(2);
  const V = { U: [0, 1, 0], L: [-s23, -1 / 3, s2 / 3], R: [s23, -1 / 3, s2 / 3], B: [0, -1 / 3, -2 * s2 / 3] };
  // Faces as the WCA colours them, held with green in front and yellow below; each with its corners in the
  // order of its triangle in the net (F upright in the middle, L and R at its sides, D below).
  const H = Math.sqrt(3);
  const FACES = [
    { id: 'F', color: 'F', v: ['U', 'L', 'R'], p: [[0, 0], [-1, H], [1, H]] },
    { id: 'L', color: 'R', v: ['U', 'B', 'L'], p: [[0, 0], [-2, 0], [-1, H]] },
    { id: 'R', color: 'B', v: ['U', 'R', 'B'], p: [[0, 0], [1, H], [2, 0]] },
    { id: 'D', color: 'D', v: ['L', 'R', 'B'], p: [[-1, H], [1, H], [0, 2 * H]] },
  ];
  const COLOR_NAME = { F: 'verde', L: 'rojo', R: 'azul', D: 'amarillo' };
  // Each face in 9 triangles: 6 upright (3 tips, 3 edges) and 3 upside down (the centres), by their lattice
  // corners (a, b, c), a + b + c = 3, a counting towards the face's first corner.
  const TRI = [];
  [[2, 0, 0], [0, 2, 0], [0, 0, 2], [1, 1, 0], [1, 0, 1], [0, 1, 1]].forEach(([a, b, c]) => TRI.push({ up: true, pts: [[a + 1, b, c], [a, b + 1, c], [a, b, c + 1]] }));
  [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach(([a, b, c]) => TRI.push({ up: false, pts: [[a, b + 1, c + 1], [a + 1, b, c + 1], [a + 1, b + 1, c]] }));
  const add = (x, y) => x.map((v, i) => v + y[i]);
  const mul = (x, k) => x.map((v) => v * k);
  const dot = (x, y) => x.reduce((a, v, i) => a + v * y[i], 0);
  const cross = (x, y) => [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];

  const STICKERS = [];
  FACES.forEach((f, fi) => {
    TRI.forEach((t, ti) => {
      const bary = t.pts.reduce((acc, p) => add(acc, p), [0, 0, 0]).map((v) => v / 9);   // centroid weights (sum 1)
      const pos = f.v.reduce((acc, vn, k) => add(acc, mul(V[vn], bary[k])), [0, 0, 0]);
      const w = { U: 0, L: 0, R: 0, B: 0 };
      f.v.forEach((vn, k) => { w[vn] = bary[k]; });
      const flat = t.pts.map((p) => f.p.reduce((acc, q, k) => add(acc, mul(q, p[k] / 3)), [0, 0]));
      STICKERS.push({ face: fi, tri: ti, pos, w, flat });
    });
  });
  const nearest = (p) => {
    let best = -1;
    let d = Infinity;
    STICKERS.forEach((s, i) => { const e = Math.hypot(...s.pos.map((v, k) => v - p[k])); if (e < d) { d = e; best = i; } });
    return best;
  };
  function rotate(p, axis, ang) {
    const k = mul(axis, 1 / Math.hypot(...axis));
    const c = Math.cos(ang);
    const sn = Math.sin(ang);
    return add(add(mul(p, c), mul(cross(k, p), sn)), mul(k, dot(k, p) * (1 - c)));
  }
  // One clockwise turn, looking at the corner from outside: the layer (tip, centre and three edges) or just
  // the tip.
  const PERMS = {};
  ['U', 'L', 'R', 'B'].forEach((vn) => {
    [['', 4 / 9], ['tip', 7 / 9]].forEach(([kind, cut]) => {
      PERMS[kind ? vn.toLowerCase() : vn] = STICKERS.map((s, i) => (s.w[vn] >= cut - 1e-9 ? nearest(rotate(s.pos, V[vn], -2 * Math.PI / 3)) : i));
    });
  });

  // ================= Notation =================
  function parse(str) {
    return String(str || '').replace(/[’`´]/g, "'").trim().split(/\s+/).filter(Boolean).map((t) => {
      const m = t.match(/^([ULRBulrb])('|2)?$/);
      if (!m) throw new Error(`Movimiento no válido: ${t}`);
      return { text: t, base: m[1], turns: m[2] === "'" ? 2 : m[2] === '2' ? 2 : 1 };
    });
  }
  const solved = () => STICKERS.map((_, i) => i);
  function applyOne(st, m) {
    const perm = PERMS[m.base];
    let s = st;
    for (let k = 0; k < m.turns; k++) {
      const out = new Array(s.length);
      for (let i = 0; i < s.length; i++) out[perm[i]] = s[i];
      s = out;
    }
    return s;
  }
  const apply = (st, alg) => parse(alg).reduce(applyOne, st);
  const colorOf = (id) => FACES[STICKERS[id].face].color;
  const isSolved = (st) => FACES.every((_, fi) => new Set(st.slice(fi * 9, fi * 9 + 9).map(colorOf)).size === 1);
  function invert(alg) {
    return parse(alg).reverse().map((m) => (m.text.endsWith("'") ? m.base : `${m.base}'`)).join(' ');
  }

  // ================= Pieces =================
  // Tips (weight 7/9 on their corner), centres (5/9) and edges (4/9 on each of two corners).
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  const CENTRES = ['U', 'L', 'R', 'B'].map((vn) => {
    const ids = STICKERS.map((s, i) => i).filter((i) => near(STICKERS[i].w[vn], 5 / 9));
    // Clockwise seen from outside the corner: order by angle around its axis.
    const ax = V[vn];
    const e1 = cross(ax, [0.3, 0.5, 0.7]);
    const e2 = cross(ax, e1);
    const ang = (i) => Math.atan2(dot(STICKERS[i].pos, e2), dot(STICKERS[i].pos, e1));
    return { v: vn, ids: ids.sort((a, b) => ang(a) - ang(b)) };
  });
  const EDGES = [];
  ['U', 'L', 'R', 'B'].forEach((a, ai, all) => all.slice(ai + 1).forEach((b) => {
    const ids = STICKERS.map((s, i) => i).filter((i) => near(STICKERS[i].w[a], 4 / 9) && near(STICKERS[i].w[b], 4 / 9));
    EDGES.push({ v: [a, b], ids: ids.sort((x, y) => STICKERS[x].face - STICKERS[y].face) });
  }));
  const edgeOfPos = new Map();
  EDGES.forEach((e, ei) => e.ids.forEach((p, k) => edgeOfPos.set(p, [ei, k])));
  const centreOfPos = new Map();
  CENTRES.forEach((c, ci) => c.ids.forEach((p, k) => centreOfPos.set(p, [ci, k])));

  // ================= Random-state scrambles =================
  const MOVES = ['U', "U'", 'L', "L'", 'R', "R'", 'B', "B'"];
  const moveEdges = MOVES.map((mv) => {
    const perm = applyOne(solved(), parse(mv)[0]);
    const to = [];
    // perm[i] = the sticker now at i; where did the sticker that was at p go? Invert it.
    const where = [];
    perm.forEach((id, pos) => { where[id] = pos; });
    EDGES.forEach((e, ei) => { const [t, k] = edgeOfPos.get(where[e.ids[0]]); to[ei] = [t, k]; });
    return to;
  });
  const moveCentres = MOVES.map((mv) => {
    const perm = applyOne(solved(), parse(mv)[0]);
    const where = [];
    perm.forEach((id, pos) => { where[id] = pos; });
    return CENTRES.map((c) => { const [, k] = centreOfPos.get(where[c.ids[0]]); return k; });
  });
  const FACT = [1, 1, 2, 6, 24, 120, 720];
  function permIndex(p) {
    let idx = 0;
    for (let i = 0; i < 6; i++) {
      let smaller = 0;
      for (let j = i + 1; j < 6; j++) if (p[j] < p[i]) smaller++;
      idx += smaller * FACT[5 - i];
    }
    return idx;
  }
  function permFrom(idx) {
    const left = [0, 1, 2, 3, 4, 5];
    const out = [];
    for (let i = 0; i < 6; i++) { const f = FACT[5 - i]; out.push(left.splice(Math.floor(idx / f), 1)[0]); idx %= f; }
    return out;
  }
  // Edges: slot → [piece, flip]; centres: their twists. Coordinates: edges as perm × 64 + flips, centres base 3.
  const eIndex = (ep, eo) => permIndex(ep) * 64 + eo.reduce((a, v, i) => a | (v << i), 0);
  const cIndex = (co) => co.reduce((a, v) => a * 3 + v, 0);
  function eMove(idx, t) {
    const ep = permFrom(Math.floor(idx / 64));
    const bits = idx % 64;
    const eo = ep.map((_, i) => (bits >> i) & 1);
    const np = [];
    const no = [];
    for (let s = 0; s < 6; s++) { const [to, k] = moveEdges[t][s]; np[to] = ep[s]; no[to] = eo[s] ^ k; }
    return eIndex(np, no);
  }
  function cMove(idx, t) {
    const co = [];
    for (let i = 3; i >= 0; i--) { co[i] = idx % 3; idx = Math.floor(idx / 3); }
    return cIndex(co.map((v, i) => (v + moveCentres[t][i]) % 3));
  }
  let T = null;
  function tables() {
    if (T) return T;
    const bfs = (size, start, mv) => {
      const d = new Int8Array(size).fill(-1);
      d[start] = 0;
      let fr = [start];
      for (let depth = 0; fr.length; depth++) {
        const nx = [];
        for (const x of fr) for (let t = 0; t < 8; t++) { const y = mv(x, t); if (d[y] < 0) { d[y] = depth + 1; nx.push(y); } }
        fr = nx;
      }
      return d;
    };
    T = { e: bfs(720 * 64, eIndex([0, 1, 2, 3, 4, 5], [0, 0, 0, 0, 0, 0]), eMove), c: bfs(81, 0, cMove) };
    return T;
  }
  // The shortest solution of a position given by its coordinates; `only` keeps to some layers (say R, L and U).
  function solveIdx(e, c, maxDepth = 12, only = null) {
    const tb = tables();
    const path = [];
    const allowed = MOVES.map((m) => !only || only.includes(m[0]));
    const dfs = (e1, c1, depth, last) => {
      const h = Math.max(tb.e[e1], tb.c[c1]);
      if (h === 0) return true;
      if (h > depth) return false;
      for (let t = 0; t < 8; t++) {
        if ((t >> 1) === last || !allowed[t]) continue;
        path.push(t);
        if (dfs(eMove(e1, t), cMove(c1, t), depth - 1, t >> 1)) return true;
        path.pop();
      }
      return false;
    };
    for (let depth = 0; depth <= maxDepth; depth++) { path.length = 0; if (dfs(e, c, depth, -1)) return path.map((t) => MOVES[t]); }
    return null;
  }
  // A sticker state as pieces (tips left out).
  function piecesOf(st) {
    const ep = [];
    const eo = [];
    EDGES.forEach((e, ei) => {
      const [piece, k] = edgeOfPos.get(st[e.ids[0]]);
      ep[ei] = piece;
      eo[ei] = k;
    });
    const co = CENTRES.map((c) => { const [, k] = centreOfPos.get(st[c.ids[0]]); return (3 - k) % 3; });
    return { ep, eo, co };
  }
  // The shortest way to solve a sticker state (tips aside), in U L R B (or only some of them).
  function solve(st, maxDepth = 12, only = null) {
    const { ep, eo, co } = piecesOf(st);
    return solveIdx(eIndex(ep, eo), cIndex(co), maxDepth, only);
  }
  // Back from pieces to stickers (tips solved): each slot's piece, which of its stickers is first, each twist.
  function stateOf(ep, eo, co) {
    const st = solved();
    EDGES.forEach((slot, s) => {
      const piece = EDGES[ep[s]];
      st[slot.ids[0]] = piece.ids[eo[s]];
      st[slot.ids[1]] = piece.ids[1 - eo[s]];
    });
    CENTRES.forEach((c, i) => { for (let k = 0; k < 3; k++) st[c.ids[(k + co[i]) % 3]] = c.ids[k]; });
    return st;
  }
  function scramble(rand = Math.random, min = 6) {
    for (;;) {
      const ep = permFrom(Math.floor(rand() * 720));
      // Only even permutations happen: swap two if needed.
      let inv = 0;
      for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) if (ep[j] < ep[i]) inv++;
      if (inv % 2) [ep[0], ep[1]] = [ep[1], ep[0]];
      const eo = [0, 0, 0, 0, 0].map(() => (rand() < 0.5 ? 1 : 0));
      eo.push(eo.reduce((a, b) => a ^ b, 0));
      const co = [0, 0, 0, 0].map(() => Math.floor(rand() * 3));
      const sol = solveIdx(eIndex(ep, eo), cIndex(co));
      if (!sol || sol.length < min) continue;
      const tips = ['u', 'l', 'r', 'b'].map((t) => { const k = Math.floor(rand() * 3); return k === 0 ? '' : k === 1 ? t : `${t}'`; }).filter(Boolean);
      return [invert(sol.join(' ')), ...tips].filter(Boolean).join(' ');
    }
  }

  // ================= Drawing =================
  // The net: F upright in the middle, L and R at its sides, D below.
  function net(st, opts = {}) {
    const s = st || solved();
    const k = opts.scale || 40;
    const gap = 0.07;
    let body = '';
    FACES.forEach((f, fi) => {
      // Faces a little apart, each pushed away from the middle of the net.
      const c = f.p.reduce((a, q) => add(a, mul(q, 1 / 3)), [0, 0]);
      const mid = [0, (2 * H) / 3];
      const push = fi === 0 ? [0, 0] : mul(add(c, mul(mid, -1)), gap);
      TRI.forEach((t, ti) => {
        const i = fi * 9 + ti;
        const pts = STICKERS[i].flat;
        const cen = pts.reduce((a, q) => add(a, mul(q, 1 / 3)), [0, 0]);
        const shrink = pts.map((q) => add(cen, mul(add(q, mul(cen, -1)), 0.86)));
        body += `<polygon points="${shrink.map((q) => `${((q[0] + push[0] + 2.1) * k).toFixed(1)},${((q[1] + push[1] + 0.1) * k).toFixed(1)}`).join(' ')}" fill="var(--st-${colorOf(s[i])})" stroke-linejoin="round"/>`;
      });
    });
    const W = 4.2 * k;
    const Ht = (2 * H + 0.3) * k;
    const label = opts.label ? ` role="img" aria-label="${opts.label}"` : ' aria-hidden="true"';
    return `<svg class="pz-pyra" viewBox="0 0 ${W.toFixed(0)} ${Ht.toFixed(0)}" width="${opts.width || Math.round(W)}"${label}>${body}</svg>`;
  }

  const api = { parse, solved, apply, invert, isSolved, colorOf, solve, scramble, piecesOf, stateOf, net, STICKERS, FACES, EDGES, CENTRES, COLOR_NAME, MOVES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PzPyra = api;
})(typeof window !== 'undefined' ? window : globalThis);
