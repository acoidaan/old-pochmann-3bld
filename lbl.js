// The beginner's method (capa a capa) on top of cubemodel.js and cfop.js: which of its seven steps a cube is
// at and, from any state, exactly what to do next, as a beginner would: the daisy and the white cross, the
// white corners with R U R' U', the second layer with its two algorithms, and the last layer with one
// algorithm per step, repeated. Yellow on top and white on the bottom all the way through. Pure functions,
// no page elements: exposes window.Lbl.
(() => {
  'use strict';
  const M = window.CubeModel;
  const C = window.Cfop;
  const { apply, solved, faceOfSticker, invertAlg, parseAlg, norm, COLOR_NAME, STICKERS, PIECE_OF } = M;

  // ================= The method =================
  const ALG = {
    corner: "R U R' U'",
    right: "U R U' R' U' F' U F",
    left: "U' L' U L U F U' F'",
    ycross: "F R U R' U' F'",
    yface: "R U R' U R U2 R'",
    ycorners: "R' F R' B2 R F' R' B2 R2",
    yedges: "R U' R U R U R U' R' U' R2",
  };
  const STEPS = [
    { id: 'cross', n: 1, name: 'La cruz blanca', short: 'Cruz' },
    { id: 'corners', n: 2, name: 'Las esquinas blancas', short: 'Esquinas' },
    { id: 'middle', n: 3, name: 'La segunda capa', short: '2.ª capa' },
    { id: 'ycross', n: 4, name: 'La cruz amarilla', short: 'Cruz amar.' },
    { id: 'yface', n: 5, name: 'La cara amarilla', short: 'Cara amar.' },
    { id: 'ycorners', n: 6, name: 'Las esquinas amarillas', short: 'Esq. amar.' },
    { id: 'yedges', n: 7, name: 'Las aristas amarillas', short: 'Aristas' },
  ];
  const VIEWS = ['', 'y', "y'", 'y2'];
  const AUF = ['', 'U', "U'", 'U2'];

  // ================= Reading a cube (white on the bottom) =================
  const centreOf = (i) => Math.floor(i / 9) * 9 + 4;
  const face = (g, i) => faceOfSticker(g[i]);
  const ok = (g, i) => face(g, i) === face(g, centreOf(i));
  const done = (g, piece) => piece.every((i) => ok(g, i));
  const colour = (g, i) => COLOR_NAME[face(g, i)];
  const CROSS = C.CROSS;                         // the four bottom edges
  const SLOTS = C.SLOTS;                         // [bottom corner, middle edge] by slot
  const TOP_EDGE = [1, 3, 5, 7];                 // back, left, right, front, on the top face
  const SIDE_OF_TOP_EDGE = { 1: 46, 3: 37, 5: 10, 7: 19 };
  const allOk = (g) => g.every((_, i) => ok(g, i));
  const isYellow = (g, i) => face(g, i) === face(g, 4);
  const isWhite = (g, i) => face(g, i) === face(g, 31);
  const canon = (st) => apply(st, C.DOWN.U);     // white down, green in front, as held for the whole method
  // The top layer's side stickers, left to right as seen from above.
  const SIDE = { back: [47, 46, 45], left: [36, 37, 38], right: [11, 10, 9], front: [18, 19, 20] };
  const TOP_CORNERS = [[0, 36, 47], [2, 11, 45], [6, 38, 18], [8, 20, 9]];   // UBL, UBR, UFL, UFR
  const cornersPlaced = (g) => AUF.some((u) => { const h = u ? apply(g, u) : g; return TOP_CORNERS.every((p) => done(h, p)); });

  function readG(g) {
    const cross = CROSS.filter((p) => done(g, p)).length;
    const petals = TOP_EDGE.filter((i) => isWhite(g, i)).length;
    const corners = SLOTS.map(([c]) => done(g, c));
    const middle = SLOTS.map(([, e]) => done(g, e));
    const nc = corners.filter(Boolean).length;
    const nm = middle.filter(Boolean).length;
    const yEdges = TOP_EDGE.filter((i) => isYellow(g, i)).length;
    const yAll = [0, 1, 2, 3, 4, 5, 6, 7, 8].every((i) => isYellow(g, i));
    let stage = 7;
    if (cross < 4) stage = 0;
    else if (nc < 4) stage = 1;
    else if (nm < 4) stage = 2;
    else if (yEdges < 4) stage = 3;
    else if (!yAll) stage = 4;
    else if (!cornersPlaced(g)) stage = 5;
    else if (!allOk(g)) stage = 6;
    return { g, stage, step: STEPS[stage] || null, cross, petals, corners, middle, nc, nm, yEdges };
  }
  const read = (st) => readG(canon(st));

  // ================= Helpers for the plans =================
  const times = (alg, n) => Array.from({ length: n }, () => alg).join(' ');
  const held = (g, view) => (view ? apply(g, view) : g);
  // Colours of the centres as held after a whole-cube turn.
  const sides = (g, view) => {
    const h = held(g, view);
    return { up: colour(h, 4), front: colour(h, 22), right: colour(h, 13), left: colour(h, 40), back: colour(h, 49), down: colour(h, 31) };
  };
  const seq = (...parts) => parts.filter(Boolean).join(' ').trim();
  const pieceColours = (g, piece) => piece.map((i) => colour(g, i));
  // A plan: what to do and the exact turns (the first one may be a whole-cube turn y, which the cube does not
  // feel). `hand`: the turns after it, as the person does them.
  function plan(g, o) {
    const moves = parseAlg(seq(o.view, o.pre, o.alg)).map((m) => m.text);
    const hand = parseAlg(seq(o.pre, o.alg)).map((m) => m.text);
    return { reps: 1, ...o, moves, hand, sides: sides(g, o.view), from: g };
  }

  // ---- Step 1: the daisy, then the white cross
  // Where a sticker at each position goes with each face turn.
  const TURNS = ['U', 'D', 'R', 'L', 'F', 'B'].flatMap((f) => [f, `${f}'`, `${f}2`]);
  const TO = TURNS.map((m) => {
    const s = apply(solved(), m);
    const to = new Int8Array(54);
    s.forEach((id, j) => { to[id] = j; });
    return to;
  });
  const PETAL = new Set(TOP_EDGE);
  const AXIS = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2, '': -1 };
  // The fewest turns that put one more white edge next to the yellow centre, white up, keeping the petals
  // already there (anywhere around it) and, if it can, the white edges already in the cross.
  function daisyMoves(g) {
    const white = [];
    for (let i = 0; i < 54; i++) if (STICKERS[i] && PIECE_OF[i].length === 2 && isWhite(g, i)) white.push(i);
    const petals = white.filter((p) => PETAL.has(p));
    const solidCross = white.filter((p) => !PETAL.has(p) && CROSS.some((piece) => piece.includes(p) && done(g, piece)));
    const target = petals.length + 1;
    const tryKeep = (keepCross, maxDepth) => {
      const path = [];
      const pos = Int8Array.from(white);
      const isPetalSet = petals.map((p) => white.indexOf(p));
      const crossIdx = keepCross ? solidCross.map((p) => white.indexOf(p)) : [];
      const crossAt = crossIdx.map((k) => white[k]);
      const goal = (p) => {
        for (const k of isPetalSet) if (!PETAL.has(p[k])) return false;
        for (let j = 0; j < crossIdx.length; j++) if (p[crossIdx[j]] !== crossAt[j]) return false;
        let n = 0;
        for (let k = 0; k < p.length; k++) if (PETAL.has(p[k])) n++;
        return n >= target;
      };
      const dfs = (p, depth, last) => {
        if (goal(p)) return true;
        if (!depth) return false;
        for (let mi = 0; mi < TURNS.length; mi++) {
          const f = TURNS[mi][0];
          // No face twice in a row, and opposite faces in one order only.
          if (f === last || (AXIS[f] === AXIS[last] && f < last)) continue;
          const to = TO[mi];
          const q = Int8Array.from(p, (x) => to[x]);
          path.push(TURNS[mi]);
          if (dfs(q, depth - 1, f)) return true;
          path.pop();
        }
        return false;
      };
      for (let d = 1; d <= maxDepth; d++) if (dfs(pos, d, '')) return path.slice();
      return null;
    };
    return tryKeep(true, 4) || tryKeep(false, 6) || [];
  }
  function crossPlan(r) {
    const g = r.g;
    // All the white edges up (or already in the cross): bring each one down, under its centre.
    if (r.petals && r.petals + r.cross === 4) {
      let best = null;
      for (const p of TOP_EDGE) {
        if (!isWhite(g, p)) continue;
        for (const u of AUF) {
          const h = u ? apply(g, u) : g;
          // After the turn, that petal's side sticker has to match the centre below it.
          const q = h.indexOf(g[p]);
          if (!PETAL.has(q)) continue;
          const s = SIDE_OF_TOP_EDGE[q];
          if (!ok(h, s)) continue;
          const view = { 19: '', 10: 'y', 37: "y'", 46: 'y2' }[s];
          const cost = u === '' ? 0 : u === 'U2' ? 2 : 1;
          if (!best || cost < best.cost) best = { cost, u, view, colour: colour(h, s) };
        }
      }
      if (best) {
        return plan(g, { stage: 0, kind: 'down', pre: best.u, view: best.view, alg: 'F2', colour: best.colour, petals: r.petals, cross: r.cross });
      }
    }
    const moves = daisyMoves(g);
    const after = apply(g, moves.join(' '));
    // The edge that became a petal: say which one by its other colour.
    const nowPetal = TOP_EDGE.find((t) => isWhite(after, t) && !TOP_EDGE.some((s) => isWhite(g, s) && g[s] === after[t]));
    const other = nowPetal != null ? colour(after, SIDE_OF_TOP_EDGE[nowPetal]) : null;
    return plan(g, { stage: 0, kind: 'daisy', pre: '', view: '', alg: moves.join(' '), colour: other, petals: r.petals, cross: r.cross });
  }

  // ---- Step 2: the white corners, with R U R' U'
  const cornerDone = (g) => SLOTS.map(([c]) => done(g, c));
  const crossOk = (g) => CROSS.every((p) => done(g, p));
  const FRONT_RIGHT_TOP = [8, 20, 9];   // UFR: top, front, right stickers
  const FRONT_RIGHT_DOWN = [29, 26, 15];   // DFR: down, front, right
  // How many R U R' U' a corner above its slot needs, by where its white sticker looks.
  const REPS = { right: 1, up: 3, front: 5 };
  function cornerPlan(r) {
    const g = r.g;
    const have = cornerDone(g);
    const keeps = (after, view) => {
      const back = view ? apply(after, invertAlg(view)) : after;
      const now = cornerDone(back);
      return crossOk(back) && !have.some((x, i) => x && !now[i]);
    };
    let best = null;
    for (const view of VIEWS) {
      const h0 = held(g, view);
      const front = face(h0, 22);
      const right = face(h0, 13);
      for (const pre of AUF) {
        const h = pre ? apply(h0, pre) : h0;
        const cost = (pre ? (pre === 'U2' ? 2 : 1) : 0) + (view ? 0.5 : 0);
        // A white corner at the top front right, right above its slot (its other colours are the front's and
        // the right's): 1, 3 or 5 times, by where its white looks.
        const top = FRONT_RIGHT_TOP.map((i) => face(h, i));
        const white = face(h, 31);
        if (top.includes(white) && top.includes(front) && top.includes(right)) {
          const looks = isWhite(h, 8) ? 'up' : isWhite(h, 20) ? 'front' : 'right';
          const n = REPS[looks];
          const after = apply(h, times(ALG.corner, n));
          if (done(after, FRONT_RIGHT_DOWN) && keeps(after, view) && (!best || cost < best.cost || (cost === best.cost && n < best.n))) {
            best = { cost, view, pre, n, kind: 'corner', looks, piece: pieceColours(h, FRONT_RIGHT_TOP) };
          }
        }
        // Already in its slot but turned: twice or four times.
        const down = FRONT_RIGHT_DOWN.map((i) => face(h, i));
        if (!pre && down.includes(white) && down.includes(front) && down.includes(right) && !done(h, FRONT_RIGHT_DOWN)) {
          for (const n of [2, 4]) {
            const after = apply(h, times(ALG.corner, n));
            if (done(after, FRONT_RIGHT_DOWN) && keeps(after, view)) {
              const c = cost + 0.1;
              if (!best || c < best.cost) best = { cost: c, view, pre, n, kind: 'corner-twist', piece: pieceColours(h, FRONT_RIGHT_DOWN) };
              break;
            }
          }
        }
      }
    }
    if (best) {
      return plan(g, { stage: 1, kind: best.kind, looks: best.looks, view: best.view, pre: best.pre, alg: times(ALG.corner, best.n), reps: best.n, base: ALG.corner, piece: best.piece, corners: r.nc });
    }
    // Only white corners stuck below in the wrong place: take one out to the top.
    const slot = SLOTS.findIndex(([c]) => !done(g, c) && c.some((i) => isWhite(g, i)));
    const view = C.slotToFront(slot >= 0 ? slot : SLOTS.findIndex(([c]) => !done(g, c))) || '';
    const h = held(g, view);
    return plan(g, { stage: 1, kind: 'corner-out', view, pre: '', alg: ALG.corner, reps: 1, base: ALG.corner, piece: pieceColours(h, FRONT_RIGHT_DOWN), corners: r.nc });
  }

  // ---- Step 3: the second layer, with the right and left algorithms
  const firstLayerOk = (g) => crossOk(g) && cornerDone(g).every(Boolean);
  const middleDone = (g) => SLOTS.map(([, e]) => done(g, e));
  function middlePlan(r) {
    const g = r.g;
    const have = middleDone(g);
    let best = null;
    for (const view of VIEWS) {
      const h0 = held(g, view);
      for (const pre of AUF) {
        const h = pre ? apply(h0, pre) : h0;
        // The edge at the top front: no yellow, its front colour on the front centre (the T).
        if (isYellow(h, 7) || isYellow(h, 19) || !ok(h, 19)) continue;
        const goes = colour(h, 7) === colour(h, 13) ? 'right' : colour(h, 7) === colour(h, 40) ? 'left' : null;
        if (!goes) continue;
        const after = apply(h, ALG[goes]);
        const back = view ? apply(after, invertAlg(view)) : after;
        const now = middleDone(back);
        if (!firstLayerOk(back) || have.some((x, i) => x && !now[i]) || now.filter(Boolean).length <= have.filter(Boolean).length) continue;
        const cost = (pre ? (pre === 'U2' ? 2 : 1) : 0) + (view ? 0.5 : 0);
        if (!best || cost < best.cost) best = { cost, view, pre, goes, piece: [colour(h, 19), colour(h, 7)] };
      }
    }
    if (best) {
      return plan(g, { stage: 2, kind: 'middle', view: best.view, pre: best.pre, alg: ALG[best.goes], goes: best.goes, piece: best.piece, middle: r.nm });
    }
    // No edge for the middle at the top: one is in the wrong slot or flipped. Take it out with the right one.
    const slot = SLOTS.findIndex(([, e]) => !done(g, e));
    const view = C.slotToFront(slot) || '';
    const h = held(g, view);
    return plan(g, { stage: 2, kind: 'middle-out', view, pre: '', alg: ALG.right, goes: 'right', piece: [colour(h, 23), colour(h, 12)], middle: r.nm });
  }

  // ---- Steps 4 to 7: the last layer, one algorithm each, held the right way round
  const ycrossShape = (g) => {
    const on = TOP_EDGE.map((i) => isYellow(g, i));   // back, left, right, front
    const n = on.filter(Boolean).length;
    if (n === 4) return 'cross';
    if (n === 0) return 'dot';
    if (n === 2 && ((on[0] && on[3]) || (on[1] && on[2]))) return 'line';
    return 'l';
  };
  const yCorners = (g) => [0, 2, 6, 8].filter((i) => isYellow(g, i)).length;
  const lights = (g) => Object.keys(SIDE).filter((s) => face(g, SIDE[s][0]) === face(g, SIDE[s][2]));
  const bars = (g) => Object.keys(SIDE).filter((s) => SIDE[s].every((i) => face(g, i) === face(g, SIDE[s][0])));
  // The side to hold in front so that the rule holds; the current one if any will do.
  const viewWhere = (g, test) => VIEWS.find((v) => test(held(g, v)));
  function llPlan(r) {
    const g = r.g;
    if (r.stage === 3) {
      const shape = ycrossShape(g);
      const view = shape === 'dot' ? '' : viewWhere(g, (h) => (shape === 'l' ? isYellow(h, 1) && isYellow(h, 3) : isYellow(h, 3) && isYellow(h, 5)));
      return plan(g, { stage: 3, kind: 'ycross', shape, view, pre: '', alg: ALG.ycross });
    }
    if (r.stage === 4) {
      const n = yCorners(g);
      const view = viewWhere(g, (h) => (n === 1 ? isYellow(h, 6) : n === 0 ? isYellow(h, 38) : isYellow(h, 18)));
      return plan(g, { stage: 4, kind: 'yface', count: n, view, pre: '', alg: ALG.yface });
    }
    if (r.stage === 5) {
      const has = lights(g).length > 0;
      const view = has ? viewWhere(g, (h) => lights(h).includes('back')) : '';
      return plan(g, { stage: 5, kind: 'ycorners', lights: has, view, pre: '', alg: ALG.ycorners });
    }
    // Step 7: a whole side done at the back, or only the top to turn.
    const b = bars(g);
    if (b.length === 4) {
      const u = AUF.find((x) => x && allOk(apply(g, x)));
      return plan(g, { stage: 6, kind: 'auf', view: '', pre: u, alg: '' });
    }
    const view = b.length ? viewWhere(g, (h) => bars(h).includes('back')) : '';
    return plan(g, { stage: 6, kind: 'yedges', bar: b.length > 0, view, pre: '', alg: ALG.yedges });
  }
  // At the end of the corners step the top can need a turn to line up with the centres: the edges step does
  // not mind, and the last turn of all puts it right.

  // ================= What to do next, from any state =================
  function nextG(g) {
    const r = readG(g);
    if (r.stage === 7) return { stage: 7, kind: 'solved', moves: [], hand: [], read: r };
    const p = r.stage === 0 ? crossPlan(r) : r.stage === 1 ? cornerPlan(r) : r.stage === 2 ? middlePlan(r) : llPlan(r);
    p.read = r;
    return p;
  }
  const next = (st) => nextG(canon(st));
  // The cube's state (centres home) after a plan.
  const after = (st, p) => norm(apply(canon(st), p.moves.join(' ')));

  // The whole solve, plan by plan, from a state in the cube's frame (or a scramble from solved).
  function solve(st0, limit = 120) {
    let st = typeof st0 === 'string' ? apply(solved(), st0) : st0;
    const out = [];
    for (let k = 0; k < limit; k++) {
      const p = next(st);
      if (p.kind === 'solved') return { plans: out, solved: true, state: st };
      out.push(p);
      st = after(st, p);
    }
    return { plans: out, solved: false, state: st };
  }
  // A state at the start of a step, as it comes in a real solve: a random cube solved with the method up to
  // there. `scramble`: a random scramble from solved (the generator's, or random turns).
  function stateAt(stage, scramble) {
    let st = apply(solved(), scramble);
    for (let k = 0; k < 200; k++) {
      const p = next(st);
      if (p.stage >= stage || p.kind === 'solved') break;
      st = after(st, p);
    }
    return readG(canon(st)).stage === stage ? st : null;
  }

  window.Lbl = {
    STEPS, ALG, VIEWS, AUF, SIDE,
    read, readG, next, nextG, after, solve, stateAt, canon, ycrossShape, yCorners, lights, bars,
    colour, isYellow, isWhite, daisyMoves,
  };
})();
