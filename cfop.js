// «Fridrich reducido» (CFOP with 2-look OLL and PLL) on top of cubemodel.js: J Perm's algorithms, which step a
// cube is at and which case it shows (whatever colour the cross is), the shortest cross, and the splits of a
// timed solve. Pure functions, no page elements: exposes window.Cfop.
(() => {
  'use strict';
  const M = window.CubeModel;
  const { apply, solved, faceOfSticker, STICKERS, CUBIES, COLOR_NAME, ROTATIONS } = M;

  // ================= The algorithms =================
  // Exactly as on jperm.net/algs/2lookoll and jperm.net/algs/2lookpll, in his order. Yellow on top (the top
  // layer is the last one), white cross on the bottom.
  const CASES = [
    { id: 'dot', step: 'oll1', name: 'Dot Shape', es: 'Punto', alg: "F R U R' U' F' f R U R' U' f'",
      look: 'Solo el centro amarillo arriba: ninguna arista.' },
    { id: 'i', step: 'oll1', name: 'I-Shape', es: 'Línea', alg: "F R U R' U' F'",
      look: 'Una línea de tres: ponla horizontal, de izquierda a derecha.' },
    { id: 'l', step: 'oll1', name: 'L-Shape', es: 'L pequeña', alg: "f R U R' U' f'",
      look: 'Una L con el centro: ponla con sus aristas a la derecha y delante.' },
    { id: 'antisune', step: 'oll2', name: 'Antisune', es: 'Antisune', alg: "R U2 R' U' R U' R'",
      look: 'Una sola esquina amarilla arriba: ponla detrás a la derecha. La de delante a la izquierda te mira.' },
    { id: 'h', step: 'oll2', name: 'H', es: 'H', alg: "R U R' U R U' R' U R U2 R'",
      look: 'Ninguna esquina arriba: dos amarillos miran a la izquierda y dos a la derecha.' },
    { id: 'l2', step: 'oll2', name: 'L', es: 'Pajarita', alg: "F R' F' r U R U' r'",
      look: 'Dos esquinas arriba en diagonal, detrás a la izquierda y delante a la derecha. La de delante a la izquierda te mira.' },
    { id: 'pi', step: 'oll2', name: 'Pi', es: 'Pi', alg: "R U2 R2 U' R2 U' R2 U2 R",
      look: 'Ninguna esquina arriba: dos amarillos miran a la izquierda; a la derecha, uno hacia delante y otro hacia atrás.' },
    { id: 'sune', step: 'oll2', name: 'Sune', es: 'Sune', alg: "R U R' U R U2 R'",
      look: 'Una sola esquina amarilla arriba: ponla delante a la izquierda. La de delante a la derecha te mira.' },
    { id: 't', step: 'oll2', name: 'T', es: 'Camaleón', alg: "r U R' U' r' F R F'",
      look: 'Dos esquinas arriba, las de la derecha. A la izquierda, una mira hacia delante y otra hacia atrás.' },
    { id: 'u', step: 'oll2', name: 'U', es: 'Faros', alg: "R2 D R' U2 R D' R' U2 R'",
      look: 'Dos esquinas arriba, las de detrás. Las dos de delante te miran (los faros).' },
    { id: 'diag', step: 'pll1', name: 'Diagonal', es: 'Diagonal', alg: "F R U' R' U' R U R' F' R U R' U' R' F R F'",
      look: 'Ningún lado tiene sus dos esquinas del mismo color. Da igual cómo lo sujetes.' },
    { id: 'head', step: 'pll1', name: 'Headlights', es: 'Faros', alg: "R U R' U' R' F R2 U' R' U' R U R' F'",
      look: 'Un lado tiene sus dos esquinas del mismo color (los faros): ponlo a la izquierda.' },
    { id: 'ph', step: 'pll2', name: 'PLL (H)', es: 'H', alg: 'M2 U M2 U2 M2 U M2',
      look: 'Cada arista está enfrente de su sitio: en cada lado, la del medio es del color del lado opuesto. Da igual cómo lo sujetes.' },
    { id: 'ua', step: 'pll2', name: 'PLL (Ua)', es: 'Ua', alg: "R U' R U R U R U' R' U' R2",
      look: 'Un lado entero hecho: ponlo detrás. La arista de delante va a la derecha (giran al revés que el reloj).' },
    { id: 'ub', step: 'pll2', name: 'PLL (Ub)', es: 'Ub', alg: "R2 U R U R' U' R' U' R' U R'",
      look: 'Un lado entero hecho: ponlo detrás. La arista de delante va a la izquierda (giran como el reloj).' },
    { id: 'z', step: 'pll2', name: 'PLL (Z)', es: 'Z', alg: "M' U M2 U M2 U M' U2 M2",
      look: 'Ningún lado hecho, pero las esquinas bien: cada arista se cambia con una vecina (delante con izquierda, detrás con derecha). Acaba con U\'.' },
  ];
  const STEPS = [
    { id: 'cross', name: 'Cruz', long: 'La cruz' },
    { id: 'f2l', name: 'F2L', long: 'Las dos primeras capas' },
    { id: 'oll1', name: 'OLL 1', long: 'Orientar las aristas' },
    { id: 'oll2', name: 'OLL 2', long: 'Orientar las esquinas' },
    { id: 'pll1', name: 'PLL 1', long: 'Permutar las esquinas' },
    { id: 'pll2', name: 'PLL 2', long: 'Permutar las aristas' },
  ];
  const LL = ['oll1', 'oll2', 'pll1', 'pll2'];

  // ================= Geometry, with the cross on the bottom =================
  const centreOf = (i) => Math.floor(i / 9) * 9 + 4;
  const ok = (g, i) => faceOfSticker(g[i]) === faceOfSticker(g[centreOf(i)]);
  const done = (g, piece) => piece.every((i) => ok(g, i));
  const at = (piece) => STICKERS[piece[0]].pos;
  const EDGES = CUBIES.filter((p) => p.length === 2);
  const CORNERS = CUBIES.filter((p) => p.length === 3);
  const CROSS = EDGES.filter((p) => at(p)[1] === -1);
  // The four slots: the bottom corner and the middle edge above it.
  const SLOTS = CORNERS.filter((p) => at(p)[1] === -1).map((c) => {
    const [x, , z] = at(c);
    return [c, EDGES.find((e) => at(e)[0] === x && at(e)[1] === 0 && at(e)[2] === z)];
  });
  const TOP = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const TOP_EDGES = [1, 3, 5, 7];
  const LL_CORNERS = CORNERS.filter((p) => at(p)[1] === 1);
  const AUF = ['', 'U', "U'", 'U2'];
  const VIEWS = ['', 'y', "y'", 'y2'];
  const allOk = (g) => g.every((_, i) => ok(g, i));
  const cornersPlaced = (g) => AUF.some((u) => { const h = u ? apply(g, u) : g; return LL_CORNERS.every((p) => done(h, p)); });

  // Which whole-cube rotation puts each colour at the bottom. White keeps green in front (z2), as you hold
  // it after a WCA scramble; yellow needs none.
  const DOWN = {};
  for (const r of ['z2', ...ROTATIONS]) {
    const s = apply(solved(), r);
    const f = faceOfSticker(s[31]);
    if (!(f in DOWN)) DOWN[f] = r;
  }
  DOWN.D = '';
  const canon = (st, face) => (DOWN[face] ? apply(st, DOWN[face]) : st);
  const colour = (g, i) => COLOR_NAME[faceOfSticker(g[i])];
  const FEM = { blanco: 'blanca', rojo: 'roja', amarillo: 'amarilla' };
  const crossName = (face) => `cruz ${FEM[COLOR_NAME[face]] || COLOR_NAME[face]}`;

  // Where a cube is in the solve, with that colour on the bottom: 0 cross, 1 F2L, 2–5 the four last-layer
  // steps, 6 solved.
  function stageOf(g) {
    const cross = CROSS.filter((p) => done(g, p)).length;
    const pairs = SLOTS.map(([c, e]) => done(g, c) && done(g, e));
    const n = pairs.filter(Boolean).length;
    const base = { cross, pairs, n };
    if (cross < 4) return { stage: 0, ...base };
    if (n < 4) return { stage: 1, ...base };
    if (!TOP_EDGES.every((i) => ok(g, i))) return { stage: 2, ...base };
    if (!TOP.every((i) => ok(g, i))) return { stage: 3, ...base };
    if (!cornersPlaced(g)) return { stage: 4, ...base };
    if (!allOk(g)) return { stage: 5, ...base };
    return { stage: 6, ...base };
  }
  // Where the cube is with that colour on the bottom.
  function readFace(st, face) {
    const g = canon(st, face);
    const s = { face, g, ...stageOf(g) };
    s.step = s.stage < 6 ? STEPS[s.stage] : null;
    s.colour = COLOR_NAME[face];
    s.crossName = crossName(face);
    return s;
  }
  // The colour the solve is being done on: the one furthest on, then the preferred one (white by default).
  function readCube(st, pref) {
    const want = pref && DOWN[pref] != null ? pref : 'U';
    let best = null;
    for (const f of [want, ...Object.keys(DOWN).filter((x) => x !== want)]) {
      const g = canon(st, f);
      const s = stageOf(g);
      if (!best || s.stage > best.stage || (s.stage === best.stage && s.stage === 1 && s.n > best.n)) best = { face: f, g, ...s };
    }
    if (best.stage === 0 && best.face !== want) { const g = canon(st, want); best = { face: want, g, ...stageOf(g) }; }
    best.step = best.stage < 6 ? STEPS[best.stage] || STEPS[5] : null;
    best.colour = COLOR_NAME[best.face];
    best.crossName = `cruz ${FEM[best.colour] || best.colour}`;
    return best;
  }

  // ================= Recognition =================
  const GOAL = {
    oll1: (h) => TOP_EDGES.every((i) => ok(h, i)),
    oll2: (h) => TOP.every((i) => ok(h, i)),
    pll1: cornersPlaced,
  };
  // Every way to do a last-layer step with J Perm's algorithms: which side to hold in front, the turn of the
  // top before it, the algorithm and the turn after it (PLL 2), the preferred first (no turn before). People
  // do an algorithm from whichever side they like, so the live help follows all of them.
  // `only`: that case alone (to say how to solve a case that is known).
  function recognizeAll(g, stage, only) {
    const step = LL[stage - 2];
    if (!step) return [];
    const out = [];
    if (step === 'pll2' && !only) {
      const auf = AUF.find((u) => u && allOk(apply(g, u)));
      if (auf) return [{ step, auf, front: colour(g, 22), top: colour(g, 4), view: '', pre: '', post: auf, g }];
    }
    const cases = only ? [only] : CASES.filter((c) => c.step === step);
    for (const pre of AUF) {
      for (const view of VIEWS) {
        const gv = view ? apply(g, view) : g;
        const gp = pre ? apply(gv, pre) : gv;
        for (const c of cases) {
          const h = apply(gp, c.alg);
          if (step === 'pll2') {
            const post = AUF.find((u) => allOk(u ? apply(h, u) : h));
            if (post != null) out.push({ step, case: c, view, pre, post, front: colour(gv, 22), top: colour(gv, 4), g: gp });
          } else if (GOAL[step](h)) out.push({ step, case: c, view, pre, post: '', front: colour(gv, 22), top: colour(gv, 4), g: gp });
        }
      }
    }
    return out;
  }
  // The case a last-layer step shows, and the preferred way to do it.
  const recognize = (g, stage, only) => recognizeAll(g, stage, only)[0] || null;
  // A case as J Perm draws it (white on the bottom): undo the algorithm from solved. A PLL algorithm can end
  // with the top turned (his Z ends a U away), so its picture is the top turn and side in front that leave the
  // most pieces in place and still take the algorithm straight away, as on his page. `auf` turns the top after.
  const misplaced = (g) => STICKERS.reduce((n, s, i) => n + (s.pos[1] === 1 && !ok(g, i) ? 1 : 0), 0);
  const pictures = new Map();
  function caseState(c, auf) {
    if (!pictures.has(c.id)) {
      const raw = apply(apply(solved(), DOWN.U), M.invertAlg(c.alg));
      let g = raw;
      if (c.step.startsWith('pll')) {
        let best = Infinity;
        for (const u of AUF) {
          for (const v of VIEWS) {
            const t = `${u} ${v}`.trim();
            const h = t ? apply(raw, t) : raw;
            const r = recognize(h, LL.indexOf(c.step) + 2);
            const n = misplaced(h);
            if (r && r.case && r.case.id === c.id && !r.view && !r.pre && n < best) { best = n; g = h; }
          }
        }
      }
      pictures.set(c.id, g);
    }
    const g = pictures.get(c.id);
    return auf ? apply(g, auf) : g;
  }

  // ================= The shortest cross =================
  // Breadth-first over the four cross edges (where each one's bottom sticker is: 24 × 22 × 20 × 18 states),
  // built the first time it is asked for (~0.2 s), then the solution walks down the distances.
  const FACE_TURNS = ['U', 'D', 'R', 'L', 'F', 'B'].flatMap((f) => [f, `${f}'`, `${f}2`]);
  const EDGE_POS = EDGES.flat();   // the 24 edge sticker positions
  const SLOT = new Map(EDGE_POS.map((p, k) => [p, k]));
  const CROSS_STICKERS = [28, 30, 32, 34];   // the bottom face's edges
  let table = null;
  let moveTo = null;
  const enc = (a, b, c, d) => ((a * 24 + b) * 24 + c) * 24 + d;
  function buildCross() {
    if (table) return;
    // Where a sticker at each edge position goes with each turn.
    moveTo = FACE_TURNS.map((m) => {
      const s = apply(solved(), m);
      const to = new Int8Array(24);
      s.forEach((id, j) => { if (SLOT.has(id)) to[SLOT.get(id)] = SLOT.get(j); });
      return to;
    });
    table = new Int8Array(24 ** 4).fill(-1);
    const start = CROSS_STICKERS.map((p) => SLOT.get(p));
    let frontier = [enc(...start)];
    table[frontier[0]] = 0;
    for (let d = 0; frontier.length; d++) {
      const next = [];
      for (const code of frontier) {
        const a = Math.floor(code / 13824); const b = Math.floor(code / 576) % 24; const c = Math.floor(code / 24) % 24; const e = code % 24;
        for (const to of moveTo) {
          const n = enc(to[a], to[b], to[c], to[e]);
          if (table[n] < 0) { table[n] = d + 1; next.push(n); }
        }
      }
      frontier = next;
    }
  }
  // The fewest face turns that solve the cross of `face` (white by default), as you hold the cube with that
  // colour on the bottom; `rotation` is how to get there from the scramble's orientation.
  function bestCross(st, face) {
    const f = face || 'U';
    buildCross();
    const g = canon(st, f);
    const ref = canon(solved(), f);
    let pos = CROSS_STICKERS.map((t) => SLOT.get(g.indexOf(ref[t])));
    const moves = [];
    for (let d = table[enc(...pos)]; d > 0; d--) {
      for (let k = 0; k < moveTo.length; k++) {
        const to = moveTo[k];
        const n = pos.map((p) => to[p]);
        if (table[enc(...n)] === d - 1) { moves.push(FACE_TURNS[k]); pos = n; break; }
      }
    }
    return { face: f, colour: COLOR_NAME[f], name: crossName(f), rotation: DOWN[f], moves: moves.join(' '), length: moves.length };
  }

  // ================= The next F2L pair =================
  // For each empty slot, the fewest turns (no D) that put its corner and edge in, keeping the cross and the
  // pairs already in. IDA* on the pieces that matter, guided by exact distances: for the cross (its four
  // edges) and for each pair (its corner and its edge), each worked out once by breadth-first search.
  const F2L_TURNS = ['U', 'R', 'F', 'L', 'B'].flatMap((f) => [f, `${f}'`, `${f}2`]);
  const AXIS = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };
  let f2l = null;
  function buildF2l() {
    if (f2l) return f2l;
    const to = F2L_TURNS.map((m) => {
      const s = apply(solved(), m);
      const t = new Int8Array(54);
      s.forEach((id, j) => { t[id] = j; });
      return t;
    });
    const EP = EDGES.flat();
    const CP = CORNERS.flat();
    const eIx = new Int16Array(54).fill(-1);
    const cIx = new Int16Array(54).fill(-1);
    EP.forEach((p, k) => { eIx[p] = k; });
    CP.forEach((p, k) => { cIx[p] = k; });
    // A pair is the corner's bottom sticker and one sticker of the edge.
    const slots = SLOTS.map(([c, e]) => ({ c: c.find((i) => Math.floor(i / 9) === 3), e: e[0], corner: c, edge: e }));
    const pairDist = slots.map((sl) => {
      const d = new Int8Array(24 * 24).fill(-1);
      let fr = [cIx[sl.c] * 24 + eIx[sl.e]];
      d[fr[0]] = 0;
      for (let k = 0; fr.length; k++) {
        const nx = [];
        for (const code of fr) {
          const cp = CP[Math.floor(code / 24)]; const ep = EP[code % 24];
          for (const t of to) {
            const n = cIx[t[cp]] * 24 + eIx[t[ep]];
            if (d[n] < 0) { d[n] = k + 1; nx.push(n); }
          }
        }
        fr = nx;
      }
      return d;
    });
    const cross = new Int8Array(24 ** 4).fill(-1);
    const cs = CROSS_STICKERS.map((p) => eIx[p]);
    const enc4 = (a, b, c, e) => ((a * 24 + b) * 24 + c) * 24 + e;
    let fr = [enc4(...cs)];
    cross[fr[0]] = 0;
    for (let k = 0; fr.length; k++) {
      const nx = [];
      for (const code of fr) {
        const a = EP[Math.floor(code / 13824)]; const b = EP[Math.floor(code / 576) % 24]; const c = EP[Math.floor(code / 24) % 24]; const e = EP[code % 24];
        for (const t of to) {
          const n = enc4(eIx[t[a]], eIx[t[b]], eIx[t[c]], eIx[t[e]]);
          if (cross[n] < 0) { cross[n] = k + 1; nx.push(n); }
        }
      }
      fr = nx;
    }
    f2l = { to, EP, CP, eIx, cIx, slots, pairDist, cross, enc4 };
    return f2l;
  }
  // g: the cube with the cross colour down (canonical); `limit`: nodes to try before giving up.
  function pairSolutions(g, limit) {
    const T = buildF2l();
    const ref = apply(solved(), DOWN.U);   // positions only: any frame with the cross down will do
    const refAt = (pos) => ref[pos];
    // Where each tracked sticker is now: g is the state, so find where the sticker that belongs there went.
    const where = (pos) => g.indexOf(refAt(pos));
    const st = stageOf(g);
    if (st.stage === 0) return [];
    const crossPos = CROSS_STICKERS.map(where);
    const done = T.slots.map((sl, i) => st.pairs[i]);
    const out = [];
    T.slots.forEach((sl, si) => {
      if (done[si]) return;
      const keep = T.slots.map((x, i) => i).filter((i) => done[i]);
      // Tracked: 4 cross stickers, the target pair, then the pairs to keep.
      const pos0 = [...crossPos, where(sl.c), where(sl.e), ...keep.flatMap((i) => [where(T.slots[i].c), where(T.slots[i].e)])];
      const n = pos0.length;
      const h = (p) => {
        let x = T.cross[T.enc4(T.eIx[p[0]], T.eIx[p[1]], T.eIx[p[2]], T.eIx[p[3]])];
        const y = T.pairDist[si][T.cIx[p[4]] * 24 + T.eIx[p[5]]];
        if (y > x) x = y;
        for (let k = 0; k < keep.length; k++) {
          const z = T.pairDist[keep[k]][T.cIx[p[6 + 2 * k]] * 24 + T.eIx[p[7 + 2 * k]]];
          if (z > x) x = z;
        }
        return x;
      };
      const path = [];
      const stack = [Int8Array.from(pos0)];
      let nodes = 0;
      let found = null;
      const dfs = (depth, bound, last) => {
        const p = stack[depth];
        const hv = h(p);
        if (hv === 0) { found = path.slice(); return true; }
        if (depth + hv > bound || ++nodes > limit) return false;
        if (!stack[depth + 1]) stack[depth + 1] = new Int8Array(n);
        const q = stack[depth + 1];
        for (let mi = 0; mi < F2L_TURNS.length; mi++) {
          const f = F2L_TURNS[mi][0];
          if (last && (f === last || (AXIS[f] === AXIS[last] && f < last))) continue;
          const t = T.to[mi];
          for (let k = 0; k < n; k++) q[k] = t[p[k]];
          path.push(F2L_TURNS[mi]);
          if (dfs(depth + 1, bound, f)) return true;
          path.pop();
        }
        return false;
      };
      for (let bound = h(stack[0]); bound <= 14 && !found && nodes <= limit; bound++) dfs(0, bound, '');
      if (found) out.push({ slot: si, moves: found.join(' '), length: found.length });
    });
    return out.sort((a, b) => a.length - b.length);
  }

  // ================= Splits of a timed solve =================
  // `line` is [{ t, st }]: the state when the clock started (t = 0) and after every turn. Each step ends the
  // first time the cube gets there (later steps need the earlier ones in place, so it only goes forward).
  function splits(line, pref) {
    if (!line || !line.length) return null;
    const faces = Object.keys(DOWN);
    let face = null;
    let bestAt = Infinity;
    for (const f of faces) {
      const k = line.findIndex((e) => stageOf(canon(e.st, f)).stage >= 2);
      if (k >= 0 && (k < bestAt || (k === bestAt && f === (pref || 'U')))) { bestAt = k; face = f; }
    }
    if (!face) {
      for (const f of faces) {
        const k = line.findIndex((e) => stageOf(canon(e.st, f)).stage >= 1);
        if (k >= 0 && (k < bestAt || (k === bestAt && f === (pref || 'U')))) { bestAt = k; face = f; }
      }
    }
    face = face || pref || 'U';
    const info = line.map((e) => stageOf(canon(e.st, face)));
    const reach = [0];
    for (let s = 1; s <= 6; s++) {
      const k = info.findIndex((x) => x.stage >= s);
      reach.push(k);
    }
    const pairsAt = [1, 2, 3, 4].map((n) => {
      const k = info.findIndex((x) => x.stage >= 2 || (x.stage === 1 && x.n >= n));
      return k < 0 ? null : line[k].t;
    });
    const steps = STEPS.map((s, i) => {
      const from = i === 0 ? 0 : reach[i];
      const to = reach[i + 1];
      if (from < 0 || from == null || to < 0) return { id: s.id, name: s.name, done: false };
      const out = { id: s.id, name: s.name, done: true, from, to, start: line[from].t, end: line[to].t, time: line[to].t - line[from].t, moves: to - from };
      if (i >= 2) {
        out.skip = to === from;
        if (!out.skip) {
          const r = recognize(canon(line[from].st, face), i);
          out.case = r && r.case ? r.case.id : null;
          out.recog = line[from + 1].t - line[from].t;
          out.exec = out.time - out.recog;
        }
      }
      return out;
    });
    return { face, colour: COLOR_NAME[face], steps, pairsAt, solved: reach[6] >= 0 };
  }

  // ================= How good a solve was =================
  // Turns counted as the cube feels them (face turns; a half turn is one, a slice is two faces): two quarter
  // turns of a face the same way are one, even with the opposite face turning in between.
  const AX = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };
  function htm(moves) {
    let n = 0;
    let group = null;   // { axis, faces: { R: [+1, +1, -1] } }
    const close = () => {
      if (!group) return;
      Object.values(group.faces).forEach((dirs) => {
        for (let i = 0; i < dirs.length; i++) {
          if (i + 1 < dirs.length && dirs[i] === dirs[i + 1]) i++;
          n++;
        }
      });
      group = null;
    };
    moves.forEach((mv) => {
      const m = M.parseAlg(mv)[0];
      if (!(m.base in AX)) return;
      if (!group || group.axis !== AX[m.base]) { close(); group = { axis: AX[m.base], faces: {} }; }
      const list = group.faces[m.base] || (group.faces[m.base] = []);
      if (m.turns === 2) list.push(1, 1); else list.push(m.turns === 1 ? 1 : -1);
    });
    close();
    return n;
  }
  // The same count for an algorithm as written: wide turns are one face, slices two, rotations none.
  const WEIGHT = { R: 1, L: 1, U: 1, D: 1, F: 1, B: 1, r: 1, l: 1, u: 1, d: 1, f: 1, b: 1, M: 2, E: 2, S: 2, x: 0, y: 0, z: 0 };
  const algHtm = (alg) => M.parseAlg(alg).reduce((a, m) => a + WEIGHT[m.base], 0);
  const PAUSE = 1000;   // a gap this long between two turns is a pause
  // line: [{ t, st, m }] as for splits(), and the splits it gave.
  function analyze(line, sp) {
    if (!sp || !sp.steps[0].done) return null;
    const face = sp.face;
    const at = (k) => canon(line[k].st, face);
    const turns = (from, to) => line.slice(from + 1, to + 1).map((e) => e.m).filter(Boolean);
    const gaps = (from, to) => {
      const out = [];
      for (let k = from + 2; k <= to; k++) { const g = line[k].t - line[k - 1].t; if (g >= PAUSE) out.push(g); }
      return out;
    };
    const out = { cross: null, pairs: [], ll: [], pause: 0 };
    const cr = sp.steps[0];
    out.cross = { mine: htm(turns(cr.from, cr.to)), opt: bestCross(line[0].st, face).length };
    // F2L, pair by pair: each one ends the first time one more pair is in.
    const f = sp.steps[1];
    if (f.done) {
      let k0 = f.from;
      let have = stageOf(at(k0)).pairs;
      for (let k = f.from + 1; k <= f.to; k++) {
        const now = stageOf(at(k));
        const n = now.stage >= 2 ? 4 : now.stage === 1 ? now.n : -1;
        if (n > have.filter(Boolean).length) {
          const startG = at(k0);
          const sols = pairSolutions(startG, 600000);
          const got = now.pairs.map((p, i) => (p && !have[i] ? i : -1)).filter((i) => i >= 0);
          const opt = got.reduce((a, i) => { const x = sols.find((y) => y.slot === i); return a + (x ? x.length : 0); }, 0);
          const g = gaps(k0, k);
          out.pairs.push({
            slots: got, mine: htm(turns(k0, k)), opt: got.length ? opt : null,
            best: sols[0] ? { slot: sols[0].slot, length: sols[0].length } : null,
            look: line[k0 + 1] ? line[k0 + 1].t - line[k0].t : 0, pauses: g.length, pauseMs: g.reduce((a, x) => a + x, 0),
            time: line[k].t - line[k0].t,
          });
          out.pause += g.reduce((a, x) => a + x, 0);
          have = now.pairs.slice();
          k0 = k;
        }
      }
    }
    // The last layer: against J Perm's algorithm the shortest way (turns before and after included).
    for (let i = 2; i < 6; i++) {
      const st = sp.steps[i];
      if (!st.done || st.skip) { out.ll.push(st.done ? { skip: true } : null); continue; }
      const all = recognizeAll(at(st.from), i);
      const opt = all.length ? Math.min(...all.map((r) => algHtm([r.pre, r.case ? r.case.alg : '', r.post].filter(Boolean).join(' ')))) : null;
      const g = gaps(st.from, st.to);
      out.pause += g.reduce((a, x) => a + x, 0);
      out.ll.push({ mine: htm(turns(st.from, st.to)), opt, pauses: g.length, pauseMs: g.reduce((a, x) => a + x, 0) });
    }
    const mine = out.cross.mine + out.pairs.reduce((a, x) => a + x.mine, 0) + out.ll.reduce((a, x) => a + (x && !x.skip ? x.mine : 0), 0);
    const ideal = out.cross.opt + out.pairs.reduce((a, x) => a + (x.opt == null ? x.mine : x.opt), 0) + out.ll.reduce((a, x) => a + (x && !x.skip ? x.opt : 0), 0);
    out.mine = mine;
    out.ideal = ideal;
    return out;
  }

  // The whole-cube turn (y, y', y2 or none) that brings a slot to the front right, as J Perm inserts.
  function slotToFront(si) {
    const sl = SLOTS[si][0];
    const c = sl.find((i) => Math.floor(i / 9) === 3);
    return VIEWS.find((v) => {
      const s = v ? apply(solved(), v) : solved();
      const p = STICKERS[s.indexOf(c)].pos;
      return p[0] === 1 && p[2] === 1;
    });
  }

  window.Cfop = {
    CASES, STEPS, LL, DOWN, VIEWS, AUF, SLOTS, CROSS,
    stageOf, readCube, readFace, recognize, recognizeAll, pairSolutions, slotToFront, analyze, htm, algHtm, caseState, bestCross, splits, canon, colour, crossName,
    caseById: (id) => CASES.find((c) => c.id === id),
  };
})();
