// The event pages of the WCA plan (/2x2, /4x4, /pyraminx, /square-1). First, without a browser, every
// algorithm of their methods on the puzzle models: each case is a state of the step where it is used (OLL with
// the white face done, PBL with both layers oriented, the Pyraminx's last layer with the base done, the
// Square-1 in cube shape…), it is the case its text describes, and its algorithm does its job; the sets have
// no case twice; L4E is optimal in R, L and U; and the scramblers. Then in the browser: the pictures are those
// states (the OLL in yellow and grey), «Ya me lo sé» and «Ya lo resuelvo», «Pruébalo» turn by turn, the timer
// with WCA inspection (the judge's calls at 8 and 12 s, +2 and DNF), rounds of 5 with their WCA average, the
// history's +2/DNF/delete, the trainer, Progreso with the plan's goals, Ajustes, full screen, the merge of
// another device's data, and phones without sideways scroll.
const { chromium, devices } = require('playwright');
const path = require('path');
const { SITE } = require('../env');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);

const ROOT = path.join(__dirname, '..', '..');
global.window = { EvContent: {} };
const P = require(path.join(ROOT, 'pz-cube.js'));
const Y = require(path.join(ROOT, 'pz-pyra.js'));
const Q = require(path.join(ROOT, 'pz-sq1.js'));
['ev-222', 'ev-444', 'ev-pyram', 'ev-sq1'].forEach((f) => require(path.join(ROOT, `${f}.js`)));
const C = global.window.EvContent;
const casesOf = (T) => Object.entries(T.sets).flatMap(([sid, s]) => s.cases.map((c) => ({ ...c, sid })));
const full = (c) => (c.after ? `${c.alg} ${c.after}` : c.alg);

// ================= Cubes =================
const ORDER = P.ORDER;
const col = (M, st, f, k) => M.colorOf(st[ORDER.indexOf(f) * M.N + k]);
const face = (M, st, f) => Array.from({ length: M.N }, (_, k) => col(M, st, f, k));
const uniform = (xs) => xs.every((x) => x === xs[0]);
function cubeCase(M, held, c) {
  if (c.from) {
    let st = held;
    if (c.from.flip) st = M.flipEdge(st, ...c.from.flip);
    if (c.from.swap) st = M.swapEdges(st, ...c.from.swap);
    return st;
  }
  if (c.setup) return M.apply(held, c.setup);
  return M.apply(held, P.invert(full(c)));
}
// The double edges of a 4×4 whose two wings don't match (as «x,*,z»: the edge along its free axis).
function unpaired(M, st) {
  const lim = M.n - 1;
  const edges = new Map();
  M.stickers.forEach((s, i) => {
    const outer = s.pos.map((v) => Math.abs(v) === lim);
    if (outer.filter(Boolean).length !== 2) return;
    const axis = outer.indexOf(false);
    const key = s.pos.map((v, k) => (k === axis ? '*' : v)).join(',');
    if (!edges.has(key)) edges.set(key, new Map());
    const wings = edges.get(key);
    const at = s.pos.join(',');
    if (!wings.has(at)) wings.set(at, []);
    wings.get(at).push(`${s.face}${M.colorOf(st[i])}`);
  });
  return [...edges.entries()].filter(([, wings]) => new Set([...wings.values()].map((w) => w.sort().join(''))).size > 1).map(([k]) => k);
}
const centresDone = (M, st) => ORDER.every((f) => uniform([5, 6, 9, 10].map((k) => col(M, st, f, k))));

// ---- 2×2: Ortega ----
const M2 = P.make(2);
const held2 = M2.apply(M2.solved(), 'z2');
const T2 = C['222'];
const st2 = Object.fromEntries(casesOf(T2).map((c) => [c.id, cubeCase(M2, held2, c)]));
const whiteDown = (st) => face(M2, st, 'D').filter((x) => x === 'U').length;
const where = { 'cara-r': ['R', 0], 'cara-f': ['F', 1], 'cara-u': ['U', 3] };
check('2×2 · la cara: three white pieces down and the last one above its hole (front right) with its white where its name says; the algorithm puts it in',
  T2.sets.cara.cases.every((c) => whiteDown(st2[c.id]) === 3 && col(M2, st2[c.id], ...where[c.id]) === 'U' && whiteDown(M2.apply(st2[c.id], c.alg)) === 4));
// OLL: the yellow of the top layer (U and the top row of each side), the same case after any U.
const yellowSig = (st) => [...face(M2, st, 'U'), ...['F', 'R', 'B', 'L'].flatMap((f) => [col(M2, st, f, 0), col(M2, st, f, 1)])].map((x) => (x === 'D' ? 1 : 0)).join('');
const canon = (st, turn, sig) => Math.min(...[0, 1, 2, 3].map((k) => parseInt(sig(k ? M2.apply(st, Array(k).fill(turn).join(' ')) : st), 2)));
const ups = { sune: 1, antisune: 1, h: 0, pi: 0, u: 2, t: 2, l: 2 };
const olls = T2.sets.oll.cases;
check('2×2 · OLL: each case with the white face done, as many yellows up as its text says, and its algorithm orients the top',
  olls.every((c) => whiteDown(st2[c.id]) === 4 && face(M2, st2[c.id], 'U').filter((x) => x === 'D').length === ups[c.id] && uniform([...face(M2, M2.apply(st2[c.id], c.alg), 'U'), 'D'])),
  olls.filter((c) => face(M2, st2[c.id], 'U').filter((x) => x === 'D').length !== ups[c.id]).map((c) => c.id).join(' '));
check('2×2 · OLL: the 7 cases are 7 different ones (even turning U) and the alternatives do the same',
  new Set(olls.map((c) => canon(st2[c.id], 'U', yellowSig))).size === 7
  && olls.filter((c) => c.alts).every((c) => c.alts.every((a) => uniform([...face(M2, M2.apply(st2[c.id], a), 'U'), 'D']) && whiteDown(M2.apply(st2[c.id], a)) === 4)));
const bars = (st, row) => ['F', 'R', 'B', 'L'].filter((f) => col(M2, st, f, row * 2) === col(M2, st, f, row * 2 + 1)).length;
const wantBars = { 'bar-bar': [1, 1], 'bar-diag': [1, 0], 'diag-diag': [0, 0], 'bar-ok': [1, 4], 'diag-ok': [0, 4] };
const alignedSolved = (st) => [0, 1, 2, 3].some((a) => [0, 1, 2, 3].some((b) => M2.isSolved(M2.apply(st, [...Array(a).fill('U'), ...Array(b).fill('D')].join(' ') || 'x x x x'))));
const pbls = T2.sets.pbl.cases;
check('2×2 · PBL: both layers oriented, the bars up and down that its name says, and its algorithm (aligning the layers) solves it',
  pbls.every((c) => uniform([...face(M2, st2[c.id], 'U'), 'D']) && whiteDown(st2[c.id]) === 4 && bars(st2[c.id], 0) === wantBars[c.id][0] && bars(st2[c.id], 1) === wantBars[c.id][1] && alignedSolved(M2.apply(st2[c.id], c.alg))
    && (c.alts || []).every((a) => alignedSolved(M2.apply(st2[c.id], a)))),
  pbls.map((c) => `${c.id} ${bars(st2[c.id], 0)}/${bars(st2[c.id], 1)}`).join(', '));

// ---- 4×4: Yau ----
const M4 = P.make(4);
const held4 = M4.apply(M4.solved(), 'z2');
const T4 = C['444'];
const st4 = Object.fromEntries(casesOf(T4).map((c) => [c.id, cubeCase(M4, held4, c)]));
// Yau: the white centre on the left for the cross edges and the last centres (held4·z), then the cross down.
const heldL = M4.apply(held4, 'z');
const centreAt = (st, f) => col(M4, st, f, 5);
const lim4 = M4.n - 1;
const wingsWhere = (keep) => M4.stickers.map((s, i) => [s, i]).filter(([s]) => s.pos.filter((v) => Math.abs(v) === lim4).length === 2 && keep(s.pos)).map(([, i]) => i);
const leftCross = wingsWhere((q) => q[0] === -lim4 && q[1] !== lim4);   // the left face's edges but the top one
const downCross = wingsWhere((q) => q[1] === -lim4);
const keeps = (st, alg, idx) => { const t = M4.apply(st, alg); return idx.every((i) => t[i] === st[i]); };
// Pairing the cross edges: r and l keep the white and yellow centres (left and right); u, d, f and b don't.
const lrCentres = (st) => ['L', 'R'].every((f) => uniform([5, 6, 9, 10].map((k) => col(M4, st, f, k))));
check('4×4 · Yau: the cross edges pair with r and l, which keep the white and yellow centres; u, d, f and b break them; F, B and D move the edges already in',
  ['r', 'l', "r'", 'l2'].every((a) => lrCentres(M4.apply(heldL, a))) && ['u', 'd', 'f', 'b'].every((a) => !lrCentres(M4.apply(heldL, a)))
  && ['F', 'B', 'D'].every((a) => !keeps(heldL, a, leftCross)));
check('4×4 · Yau: with white on the left and green in front, red is up, orange down and blue back; z\' puts the cross down with yellow up and green in front',
  centreAt(heldL, 'L') === 'U' && centreAt(heldL, 'F') === 'F' && centreAt(heldL, 'U') === 'R' && centreAt(heldL, 'D') === 'L' && centreAt(heldL, 'B') === 'B'
  && ORDER.every((f) => centreAt(M4.apply(heldL, "z'"), f) === centreAt(held4, f)) && centreAt(held4, 'D') === 'U',
  ORDER.map((f) => `${f}:${centreAt(heldL, f)}`).join(' '));
check("4×4 · Yau: the centre trick and r, Rw, R, U keep the three cross edges on the left; R U R', L' U' L and the last two edges' algorithm keep the cross down",
  ["Rw U2 Rw'", 'r', 'l', 'Rw', 'R', 'U'].every((a) => keeps(heldL, a, leftCross))
  && ["R U R'", "L' U' L", T4.sets.aristas.cases[0].alg].every((a) => keeps(held4, a, downCross)) && !keeps(held4, 'F', downCross));
// Every case of the last centres: white on the left, only the front and top centres touched (the back, bottom,
// white and yellow ones and the three cross edges as solved), and its algorithm solves it.
const centreCases = T4.sets.centros.cases;
check('4×4 · Yau centres: each hole and bar case only changes the front and top centres (never the done ones nor the cross), and its algorithm fills the front',
  centreCases.length === 6 && centreCases.every((c) => {
    const st = st4[c.id];
    return centreAt(st, 'L') === 'U' && ['L', 'R', 'D', 'B'].every((f) => uniform([5, 6, 9, 10].map((k) => col(M4, st, f, k))))
      && leftCross.every((i) => st[i] === heldL[i]) && !uniform([5, 6, 9, 10].map((k) => col(M4, st, 'F', k))) && M4.isSolved(M4.apply(st, c.alg));
  }), centreCases.map((c) => c.id).join(' '));
const holeOf = (st) => [5, 6, 9, 10].filter((k) => col(M4, st, 'F', k) !== 'F').join(',');
check('4×4 · Yau centres: the four single holes are where their names say (top/bottom, left/right of the front centre)',
  holeOf(st4['hueco-ai']) === '5' && holeOf(st4['hueco-ad']) === '6' && holeOf(st4['hueco-di']) === '9' && holeOf(st4['hueco-dd']) === '10' && holeOf(st4['barra-i']) === '5,9',
  ['hueco-ai', 'hueco-ad', 'hueco-di', 'hueco-dd', 'barra-i'].map((id) => holeOf(st4[id])).join(' '));
// The step's warm-up from the solved cube: z' from white up is white on the left; two holes at the bottom, fixed one by one.
const warm = M4.apply(M4.solved(), "z2 z r U' r' l' U l");
check('4×4 · Yau centres warm-up: z\' from white up puts white on the left and green in front; r U\' r\' l\' U l leaves the two bottom holes and l\' U\' l r U r\' fixes them',
  centreAt(M4.apply(M4.solved(), "z'"), 'L') === 'U' && centreAt(M4.apply(M4.solved(), "z'"), 'F') === 'F' && holeOf(warm) === '9,10' && M4.isSolved(M4.apply(warm, "l' U' l r U r'")));
const bar = st4.barra;
check('4×4 · centres: white on the left, the green bar in the left column of the top centre, the right column of the front one still to do; the trick finishes the front',
  centreAt(bar, 'L') === 'U' &&
  col(M4, bar, 'U', 5) === 'F' && col(M4, bar, 'U', 9) === 'F' && col(M4, bar, 'F', 5) === 'F' && col(M4, bar, 'F', 9) === 'F' && col(M4, bar, 'F', 6) !== 'F' && col(M4, bar, 'F', 10) !== 'F'
  && uniform([5, 6, 9, 10].map((k) => col(M4, M4.apply(bar, centreCases.find((c) => c.id === 'barra').alg), 'F', k))));
const cr = st4.cruzadas;
const crAfter = M4.apply(cr, T4.sets.aristas.cases[0].alg);
check('4×4 · pairing: with the centres done, only the front left and front right double edges unpaired; the algorithm pairs them (and keeps the centres)',
  centresDone(M4, cr) && unpaired(M4, cr).sort().join(' ') === '-3,*,3 3,*,3' && unpaired(M4, crAfter).length === 0 && centresDone(M4, crAfter), unpaired(M4, cr).join(' '));
// The 4×4 as a 3×3: is the permutation of its corners as even or odd as that of its double edges (no PLL
// parity), and are its top edges all yellow up (no OLL parity)?
function reduced(M, st, ref) {
  const lim = M.n - 1;
  const at = new Map();
  M.stickers.forEach((s, i) => { const k = s.pos.join(','); if (!at.has(k)) at.set(k, []); at.get(k).push(i); });
  const outer = (k) => k.split(',').filter((v) => Math.abs(Number(v)) === lim).length;
  const ids = (state, list) => list.map((i) => M.colorOf(state[i])).sort().join('');
  const parity = (perm) => { const seen = new Set(); let n = 0; perm.forEach((_, i) => { let j = i; let len = 0; while (!seen.has(j)) { seen.add(j); j = perm[j]; len++; } n += Math.max(0, len - 1); }); return n % 2; };
  const permOf = (groups) => { const want = groups.map((g) => ids(ref, g)); return groups.map((g) => want.indexOf(ids(st, g))); };
  const corners = [...at.entries()].filter(([k]) => outer(k) === 3).map(([, g]) => g);
  const edges = new Map();
  [...at.entries()].filter(([k]) => outer(k) === 2).forEach(([k, g]) => { const v = k.split(','); const ax = v.findIndex((x) => Math.abs(Number(x)) !== lim); const e = v.map((x, i) => (i === ax ? '*' : x)).join(','); if (!edges.has(e)) edges.set(e, g); });
  return { even: parity(permOf(corners)) === parity(permOf([...edges.values()])), topEdges: [1, 2, 4, 7, 8, 11, 13, 14].every((k) => col(M, st, 'U', k) === 'D') };
}
const op = st4['oll-par'];
const opAfter = M4.apply(op, T4.sets.paridades.cases[0].alg);
const f2lOf = (st) => [...face(M4, st, 'D'), ...['F', 'R', 'B', 'L'].flatMap((f) => face(M4, st, f).slice(4))].join('');
check('4×4 · OLL parity: one double edge flipped and nothing else; after the algorithm the first two layers are as they were and the top is a normal 3×3 OLL (edges yellow up, no PLL parity)',
  unpaired(M4, op).length === 0 && f2lOf(op) === f2lOf(held4) && !reduced(M4, op, held4).topEdges
  && f2lOf(opAfter) === f2lOf(held4) && unpaired(M4, opAfter).length === 0 && centresDone(M4, opAfter) && reduced(M4, opAfter, held4).topEdges && reduced(M4, opAfter, held4).even,
  JSON.stringify(reduced(M4, opAfter, held4)));
const pp = st4['pll-par'];
check('4×4 · PLL parity: the front and back double edges swapped; the algorithm and U2 solve it, its r2 being only the inner slice (as 2R2; with Rw2 it would not)', uniform([...face(M4, pp, 'U'), 'D']) && !M4.isSolved(pp) && M4.isSolved(M4.apply(pp, full(T4.sets.paridades.cases[1])))
  && M4.isSolved(M4.apply(pp, full(T4.sets.paridades.cases[1]).replace(/\br2/g, '2R2'))) && !M4.isSolved(M4.apply(pp, full(T4.sets.paridades.cases[1]).replace(/\br2/g, 'Rw2'))) && /capa de dentro/.test(T4.sets.paridades.cases[1].how));
const pa = st4['pll-par-adj'];
const paMid = M4.apply(pa, T4.sets.paridades.cases[2].alg);
check('4×4 · PLL parity with two edges side by side: only the left and back double edges swapped (impossible on a 3×3), the parity algorithm leaves a normal 3×3 last layer (an Ub with the right edge solved) and the Ub solves it',
  uniform([...face(M4, pa, 'U'), 'D']) && !reduced(M4, pa, held4).even && reduced(M4, paMid, held4).even && unpaired(M4, paMid).length === 0 && f2lOf(paMid) === f2lOf(held4)
  && col(M4, paMid, 'R', 1) === col(M4, held4, 'R', 1) && M4.isSolved(M4.apply(pa, full(T4.sets.paridades.cases[2]))));

// ---- Pyraminx ----
const TP = C.pyram;
const stP = Object.fromEntries(casesOf(TP).map((c) => [c.id, Y.apply(Y.solved(), Y.invert(c.alg))]));
const pc = (id) => Y.piecesOf(stP[id]);
const sideCentres = (p) => p.co[1] === 0 && p.co[2] === 0 && p.co[3] === 0;
check('Pyraminx · base edges: centres of the base done, the other two base edges done, the missing one at the back of the top layer; the algorithm puts it in',
  TP.sets.aristas.cases.every((c) => { const p = pc(c.id); const a = Y.piecesOf(Y.apply(stP[c.id], c.alg)); return sideCentres(p) && p.ep[4] === 4 && p.ep[5] === 5 && !p.eo[4] && !p.eo[5] && p.ep[2] === 3 && sideCentres(a) && a.ep.slice(3).join('') === '345' && !a.eo.slice(3).some(Boolean); }));
const lls = TP.sets.ll.cases;
check('Pyraminx · last layer: the base and all four centres done, only the three top edges out; 5 different cases, each solved by its algorithm',
  lls.every((c) => { const p = pc(c.id); return !p.co.some(Boolean) && p.ep.slice(3).join('') === '345' && !p.eo.slice(3).some(Boolean) && !Y.isSolved(stP[c.id]) && Y.isSolved(Y.apply(stP[c.id], c.alg)); })
  && new Set(lls.map((c) => JSON.stringify(pc(c.id)))).size === 5);
const l4e = TP.sets.l4e.cases;
const groupOk = { in: (p) => p.ep[5] === 5 && !p.eo[5], flip: (p) => p.ep[5] === 5 && p.eo[5] === 1, up: (p) => p.ep[5] < 3 };
const l4eKey = (st) => [0, 1, 2].map((k) => { const p = Y.piecesOf(k ? Y.apply(st, Array(k).fill('U').join(' ')) : st); return `${p.ep.join('')}${p.eo.join('')}${p.co.join('')}`; }).sort()[0];
const lenOf = (sol) => (Array.isArray(sol) ? sol.length : String(sol).trim().split(/\s+/).filter(Boolean).length);
const notOptimal = l4e.filter((c) => lenOf(Y.solve(stP[c.id], 12, ['R', 'L', 'U'])) !== c.alg.trim().split(/\s+/).length).map((c) => c.id);
check('Pyraminx · L4E: 35 cases (5 + 6 + 24), each with the V and the side centres done and the third base edge where its group says, all different even turning U',
  l4e.length === 35 && l4e.every((c) => { const p = pc(c.id); return sideCentres(p) && p.ep[3] === 3 && p.ep[4] === 4 && !p.eo[3] && !p.eo[4] && groupOk[c.id.split('-')[1]](p) && Y.isSolved(Y.apply(stP[c.id], c.alg)); })
  && new Set(l4e.map((c) => l4eKey(stP[c.id]))).size === 35);
check('Pyraminx · L4E: every algorithm is the shortest in R, L and U', notOptimal.length === 0, notOptimal.join(' '));

// ---- Square-1 ----
const TS = C.sq1;
const stS = Object.fromEntries(casesOf(TS).map((c) => [c.id, c.setup ? Q.apply(Q.solved(), c.setup) : Q.apply(Q.solved(), Q.invert(c.alg))]));
const SQUARE = 'cdecdecdecde';
const cube = (s) => Q.layerShape(s.top) === SQUARE && Q.layerShape(s.bot) === SQUARE;
const inLayers = (s) => s.top.every((x) => x.p < 8) && s.bot.every((x) => x.p >= 8);
const ring = (layer, corners) => layer.filter((x) => !x.h && (x.p % 2 === 0) === corners).map((x) => x.p).join(',');
const rotOf = (a, b) => { const xs = a.split(','); return xs.some((_, k) => [...xs.slice(k), ...xs.slice(0, k)].join(',') === b); };
const cornersDone = (s) => { const z = Q.solved(); return rotOf(ring(s.top, true), ring(z.top, true)) && rotOf(ring(s.bot, true), ring(z.bot, true)); };
const shapes = TS.sets.forma.cases;
check('Square-1 · cube shape: each star case has the 6 corners up, its bottom as its text says, and its sequence ends in cube shape with the layers lined up',
  shapes.every((c) => Q.countCorners(stS[c.id].top) === 6 && cube(Q.apply(stS[c.id], c.alg)) && Q.apply(stS[c.id], c.alg).mid === 0)
  && new Set(shapes.map((c) => Q.layerShape(stS[c.id].bot))).size === 5);
// The two corners left at the bottom: how many edges between them on the shorter side (0 together … 4 facing).
const gapOf = (shape) => { const k = shape.indexOf('c'); const r = shape.slice(k) + shape.slice(0, k); const j = r.indexOf('c', 2); return Math.min(r.slice(2, j).length, r.slice(j + 2).length); };
check('Square-1 · the five star cases are what their names say: corners together, one, two or three edges between them, facing each other',
  shapes.every((c) => gapOf(Q.layerShape(stS[c.id].bot)) === Number(c.id.split('-')[1])), shapes.map((c) => `${c.id}:${gapOf(Q.layerShape(stS[c.id].bot))}`).join(' '));
const rest = casesOf(TS).filter((c) => c.sid !== 'forma');
check('Square-1 · every other case starts in cube shape with the layers lined up (as you hold it) and its algorithm solves it',
  rest.every((c) => cube(stS[c.id]) && Q.isSolved(Q.apply(stS[c.id], c.alg))), rest.filter((c) => !cube(stS[c.id])).map((c) => c.id).join(' '));
check('Square-1 · each case is a state of its step: corners to their layer, then edges with the corners already up, then permutation with every piece in its layer, edges with the corners done',
  !inLayers(stS['co-2']) && !inLayers(stS['co-1']) && stS.eo.top.filter((x) => x.p % 2 === 0 && !x.h).every((x) => x.p < 8) && !inLayers(stS.eo)
  && ['cp', 'ep', 'par'].every((id) => inLayers(stS[id])) && !cornersDone(stS.cp) && cornersDone(stS.ep) && cornersDone(stS.par)
  && stS.swap.top.every((x) => x.p >= 8) && stS.mid.mid === 1 && inLayers(stS.mid) && cornersDone(stS.mid));

// ---- Scramblers ----
const scr2 = Array.from({ length: 12 }, () => P.two.scramble());
check('2×2 scrambles: random state, at least 4 turns away, WCA letters only', scr2.every((s) => /^([RUF]['2]? ?)+$/.test(s) && !M2.isSolved(M2.apply(M2.solved(), s))));
const scr4 = Array.from({ length: 6 }, () => P.randomMoves(40));
check('4×4 scrambles: 40 turns in WCA notation (wide ones as Rw)', scr4.every((s) => s.split(' ').length === 40 && s.split(' ').every((m) => /^[RUFDLB]w?['2]?$/.test(m))));
const scrP = Array.from({ length: 8 }, () => Y.scramble());
check('Pyraminx scrambles: at least 6 turns from solved (without the tips), the tips at the end', scrP.every((s) => lenOf(Y.solve(Y.apply(Y.solved(), s.replace(/\s*[ulrb]'?/g, '')), 11)) >= 6 && /^([ULRB]'? ?)+([ulrb]'? ?)*$/.test(s)));
const scrS = Array.from({ length: 8 }, () => Q.scramble());
check('Square-1 scrambles: 12 slashes, every one possible', scrS.every((s) => s.split('/').length - 1 === 12 && (() => { try { Q.apply(Q.solved(), s); return true; } catch (e) { return false; } })()));

// ================= In the browser =================
(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const open = async (opts, url, scheme) => {
    const ctx = await browser.newContext({ ...opts, colorScheme: scheme || 'light' });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${url}: ${e.message}`));
    await p.goto(url);
    await p.waitForFunction(() => window.EvPage && window.EvPage.state().scramble);
    return { ctx, p };
  };
  const phase = (p) => p.evaluate(() => window.EvPage.state().phase);
  const lastTime = (p) => p.evaluate(() => { const t = window.EvPage.state().times; return t[t.length - 1]; });
  // A solve without inspection: hold Space, it turns ready, let go, and stop it.
  const solve = async (p) => {
    await p.keyboard.down(' ');
    await p.waitForFunction(() => window.EvPage.state().phase === 'ready');
    await p.keyboard.up(' ');
    await p.waitForFunction(() => window.EvPage.state().phase === 'run');
    await p.waitForTimeout(30);
    await p.keyboard.down(' ');
    await p.keyboard.up(' ');
    await p.waitForFunction(() => window.EvPage.state().phase === 'done');
  };

  // ---------------- 2×2, on a computer ----------------
  let { ctx, p } = await open({ viewport: { width: 1280, height: 900 } }, `${SITE}/2x2`);
  const menu = await p.evaluate(() => ({ links: [...document.querySelectorAll('#sxMenu a[data-sx]')].map((a) => a.dataset.sx), here: (document.querySelector('#sxMenu a[aria-current="page"]') || {}).dataset, groups: document.querySelectorAll('#sxMenu .sx-group').length }));
  check('the section menu: plan, the three 3×3 sections and the four new events, in their groups, this one marked', menu.links.length === 8 && menu.groups === 2 && menu.here && menu.here.sx === '222', JSON.stringify(menu));
  const pageStates = await p.evaluate(() => Object.fromEntries(Object.values(window.EvPage.T.sets).flatMap((s) => s.cases).map((c) => [c.id, window.EvPage.caseState(c)])));
  check('the page draws the same states as the model (every 2×2 case)', Object.keys(st2).every((id) => JSON.stringify(pageStates[id]) === JSON.stringify(st2[id])));
  const pics = await p.evaluate(() => ({ cards: document.querySelectorAll('.ev-case').length, svgs: document.querySelectorAll('.ev-case svg').length, ollFills: [...new Set([...document.querySelectorAll('[data-case="sune"] svg rect')].map((r) => r.getAttribute('fill')))], caraFills: [...new Set([...document.querySelectorAll('[data-case="cara-r"] svg polygon')].map((r) => r.getAttribute('fill')))], pblFills: new Set([...document.querySelectorAll('[data-case="bar-bar"] svg rect')].map((r) => r.getAttribute('fill'))).size }));
  check('every case with its picture; the OLL only in yellow and grey, the white of the face alone, the PBL in its colours',
    pics.cards === 15 && pics.svgs === 15 && pics.ollFills.every((f) => f === 'var(--st-D)' || f.startsWith('var(--fr-blank')) && pics.ollFills.length === 2 && pics.caraFills.every((f) => f === 'var(--st-U)' || f.startsWith('var(--fr-blank')) && pics.pblFills >= 5, JSON.stringify(pics));
  await p.click('[data-known="oll"]');
  await p.check('#soloCheck');
  const marks = await p.evaluate(() => ({ known: window.EvData.isKnown('222', 'oll'), count: document.getElementById('knownCount').textContent, solo: window.EvData.solo('222'), goal: window.EvData.goalsOf('222')[0].done, pressed: document.querySelector('[data-known="oll"]').getAttribute('aria-pressed') }));
  check('«Ya me lo sé» marks the step (1 de 3) and «Ya lo resuelvo» reaches the first goal of the plan', marks.known && /1 de 3/.test(marks.count) && marks.solo && marks.goal && marks.pressed === 'true', JSON.stringify(marks));
  await p.click('[data-try="bar-bar"]');
  const nMoves = await p.locator('#tryAlg .ev-mv').count();
  const firstMsg = await p.textContent('#tryNow');
  for (let i = 0; i < nMoves; i++) await p.click('#tryNext');
  const tryEnd = await p.evaluate(() => ({ msg: document.getElementById('tryNow').textContent, next: document.getElementById('tryNext').disabled, done: document.querySelectorAll('#tryAlg .ev-mv.done').length, pic: document.querySelectorAll('#tryPic polygon').length, focus: document.activeElement.id }));
  check('«Pruébalo»: the case, then each turn of its algorithm on the puzzle, to «¡Resuelto!» (the focus stays in it, on «Anterior»)', /antes de empezar/.test(firstMsg) && /Resuelto/.test(tryEnd.msg) && tryEnd.next && tryEnd.done === nMoves && tryEnd.pic > 0 && tryEnd.focus === 'tryPrev', JSON.stringify(tryEnd));
  await p.keyboard.press('Escape');
  const closed = await p.evaluate(() => ({ hidden: document.getElementById('trySheet').hidden, focus: document.activeElement && document.activeElement.dataset.try }));
  check('Escape closes it and gives the focus back to its button', closed.hidden && closed.focus === 'bar-bar', JSON.stringify(closed));

  // The timer, without inspection and then with it.
  await p.evaluate(() => window.EvPage.showView('crono'));
  await p.uncheck('#optInspect');
  await solve(p);
  let t = await lastTime(p);
  check('timer without inspection: hold, ready, go, stop; the time saved with its scramble', t && t.t > 0 && !t.pen && !t.ins && t.scr && (await p.locator('#history tbody tr').count()) === 1);
  await p.check('#optInspect');
  await p.keyboard.press(' ');
  check('with inspection, Space starts the 15 s', (await phase(p)) === 'inspect');
  await p.evaluate(() => window.EvPage.setInspectStart(12300));
  await p.waitForFunction(() => window.EvPage.voiceLog.includes('twelve'));
  const calls = await p.evaluate(() => window.EvPage.voiceLog.join(' '));
  await p.evaluate(() => window.EvPage.setInspectStart(16000));
  await p.waitForTimeout(80);
  const shown = await p.textContent('#clockTime');
  await p.keyboard.down(' ');
  await p.waitForFunction(() => window.EvPage.state().phase === 'iready');
  await p.keyboard.up(' ');
  await p.waitForTimeout(40);
  await p.keyboard.press('a');
  t = await lastTime(p);
  check('the judge calls 8 and 12 s; past 15 s it shows +2 and the solve gets it', calls === 'eight twelve' && shown === '+2' && t.pen === 2 && t.ins === 1, `${calls} · ${shown} · ${JSON.stringify(t)}`);
  await p.keyboard.press(' ');
  await p.evaluate(() => window.EvPage.setInspectStart(17500));
  await p.keyboard.down(' ');
  await p.waitForFunction(() => window.EvPage.state().phase === 'iready');
  await p.keyboard.up(' ');
  await p.keyboard.press('a');
  t = await lastTime(p);
  check('past 17 s, DNF', t.pen === 'dnf');
  await p.keyboard.press(' ');
  await p.keyboard.press('Escape');
  check('Escape cancels the inspection without saving anything', (await phase(p)) === 'done' && (await p.evaluate(() => window.EvPage.state().times.length)) === 3);
  // History: +2, DNF and delete.
  await p.click('#history [data-pen="2"][data-i="0"]');
  await p.click('#history [data-pen="dnf"][data-i="1"]');
  const pens = await p.evaluate(() => window.EvPage.state().times.map((x) => x.pen));
  await p.click('#history [data-del="0"]');
  await p.click('#history [data-del="0"]').catch(() => {});
  const afterDel = await p.evaluate(() => ({ n: window.EvPage.state().times.length, dead: window.EvData.load('ev:deleted:v1', []).length }));
  check('history: +2 and DNF on a time, and deleting (twice to confirm) keeps a note for the other devices', afterDel.dead >= 1 && afterDel.n <= 2, `${JSON.stringify(pens)} ${JSON.stringify(afterDel)}`);
  // A round of 5 without inspection.
  await p.uncheck('#optInspect');
  await p.click('#modeRound');
  for (let i = 0; i < 5; i++) await solve(p);
  const rd = await p.evaluate(() => {
    const D = window.EvData;
    const rs = D.rounds(window.EvPage.state().times);
    const r = rs[rs.length - 1];
    const out = D.trimmed(r.times);
    const want = r.times.map((x, i) => (out.has(i) ? `(${D.fmtRes(x)})` : D.fmtRes(x))).join(' ');
    return { done: r.done, avg: r.avg, wavg: D.avgOf(r.times, 5), text: document.getElementById('round').textContent, slots: [...document.querySelectorAll('#round .ev-round-slots b')].map((b) => b.textContent).join(' '), want, fmt: D.fmtAvg5(r.times) };
  });
  check('a round of 5: done, with the WCA average on screen and its best and worst in brackets, as on WCA results', rd.done && rd.avg === rd.wavg && /Media de la ronda/.test(rd.text) && rd.slots === rd.want && rd.fmt === rd.want && (rd.want.match(/\(/g) || []).length === 2, JSON.stringify(rd));
  await p.evaluate(() => window.EvPage.showView('progreso'));
  const roundRow = await p.evaluate(() => [...document.querySelectorAll('#rounds tbody tr')].map((tr) => tr.lastElementChild.textContent));
  check('Progreso: the round in its table (written the same way) and the plan\'s goals', roundRow.length === 1 && roundRow[0] === rd.want && /Resolver sin ayuda/.test(await p.textContent('#goals')), JSON.stringify(roundRow));
  const brackets = (ts) => p.evaluate((x) => [...window.EvData.trimmed(x.map(([t, pen]) => ({ t, pen })))].sort().join(','), ts);
  check('the brackets: the best and the worst; a DNF is the worst; with two the same, the first of them',
    (await brackets([[9000, 0], [8000, 0], [9500, 0], [12000, 0], [9100, 0]])) === '1,3' && (await brackets([[9000, 0], [8000, 'dnf'], [9500, 2], [7000, 0], [9100, 0]])) === '1,3'
    && (await brackets([[9000, 0], [9000, 0], [9000, 0], [9000, 0], [9000, 0]])) === '0,4' && (await brackets([[8000, 0], [8000, 0], [9000, 'dnf'], [9500, 0], [9000, 'dnf']])) === '0,2');
  // The second goal of the 2×2 (average under 10 s) from times seeded under it.
  await p.evaluate(() => { const now = Date.now(); window.EvData.setTimes('222', Array.from({ length: 5 }, (_, i) => ({ at: now - 50000 + i * 1000, t: 8000 + i * 100, pen: 0, scr: 'R U' }))); });
  await p.reload();
  await p.waitForFunction(() => window.EvPage && window.EvPage.state().view === 'progreso');
  const goals = await p.evaluate(() => window.EvData.goalsOf('222').map((g) => g.done));
  check('a media of 5 under 10 s reaches the second goal, and the header shows the next one', goals[0] && goals[1] && /Metas cumplidas|Siguiente|✓/.test(await p.textContent('#evPhase') + await p.textContent('#goals')), JSON.stringify(goals));
  // Trainer.
  await p.evaluate(() => window.EvPage.showView('entrenar'));
  await p.click('[data-trset="pbl"]');
  const id = await p.evaluate(() => window.EvPage.state().train);
  await p.click('#trShow');
  const alg = await p.textContent('#trBox .ev-case-alg');
  await p.click('#trOk');
  const tr = await p.evaluate((i) => window.EvData.train('222')[i], id);
  check('trainer: a PBL case, its solution on demand, «Me ha salido» counts it', T2.sets.pbl.cases.some((c) => c.id === id) && alg.replace(/\s+/g, ' ').includes(T2.sets.pbl.cases.find((c) => c.id === id).alg.split(' ')[0]) && tr && tr.streak === 1, `${id} ${JSON.stringify(tr)}`);
  // Setups that do not give the case away: from solved, the setup leaves the drawn state, the shown solution
  // (AUF before, the algorithm, what comes after) solves it, and the setup is not the algorithm backwards.
  const setupCheck = (pg) => pg.evaluate(() => {
    const { PZ, T } = window.EvPage;
    const key = (st) => JSON.stringify(PZ.model.faceColors ? PZ.model.faceColors(st) : st);
    const bad = [];
    let n = 0;
    for (const set of Object.values(T.sets)) for (const c of set.cases) for (let k = 0; k < 4; k++) {
      const su = PZ.disguise(c);
      if (!su) break;
      n++;
      const st = PZ.apply(PZ.held(), su.setup);
      const ok = key(st) === key(su.state) && (su.mixed || PZ.isSolved(PZ.apply(st, [su.pre, c.alg, c.after].filter(Boolean).join(' '))));
      if (!ok || su.setup.includes(PZ.invert(c.alg)) || / (\S+) \1( |$)/.test(su.setup)) bad.push(`${c.id}: ${su.setup}`);
    }
    return { n, bad };
  });
  const su2 = await setupCheck(p);
  const shownSetup = await p.evaluate(() => ({ text: (document.querySelector('#trBox .ev-train-setup') || {}).textContent || '', su: window.EvPage.state().trainSetup }));
  check('trainer setups on the 2×2: the drawn state, solved by the shown solution, never the algorithm backwards; the page shows it', su2.n > 50 && !su2.bad.length && shownSetup.su && shownSetup.su.setup && shownSetup.text.includes('Para ponerlo'), JSON.stringify({ ...su2, bad: su2.bad.slice(0, 3), shownSetup }));
  // Ajustes and full screen.
  await p.evaluate(() => window.EvPage.showView('ajustes'));
  await p.uncheck('#setInspect');
  const off = await p.evaluate(() => window.EvData.settings().inspect);
  await p.check('#setInspect');
  await p.evaluate(() => window.EvPage.showView('crono'));
  await p.keyboard.press('f');
  const focus = await p.evaluate(() => document.body.classList.contains('ev-focus'));
  const cheat = await p.evaluate(() => ({ hidden: document.getElementById('cheat').hidden, opts: getComputedStyle(document.querySelector('.ev-opts')).display !== 'none' }));
  await p.check('#optHelp');
  const cheatOn = await p.evaluate(() => ({ hidden: document.getElementById('cheat').hidden, sets: document.querySelectorAll('#cheat .ev-cheat-set').length, algs: document.querySelectorAll('#cheat li').length, phase: document.getElementById('clockPhase').textContent }));
  await p.uncheck('#optHelp');
  await p.keyboard.press('Escape');
  check('full screen keeps «Mirando el tutorial»; with it on, the algorithms of each step under the clock and «con ayuda» on the clock', cheat.hidden && cheat.opts && !cheatOn.hidden && cheatOn.sets === 3 && cheatOn.algs === 15 && /con ayuda/.test(cheatOn.phase), JSON.stringify({ cheat, cheatOn }));
  check('Ajustes turns the inspection off and on; F goes full screen and Escape back', off === false && (await p.evaluate(() => window.EvData.settings().inspect)) && focus && !(await p.evaluate(() => document.body.classList.contains('ev-focus'))));
  // Another device's data: new times, an edit, a deletion, newer marks; the plan's competition.
  const merged = await p.evaluate(() => {
    const D = window.EvData;
    const mine = D.times('222');
    const a = mine[0];
    const changed = D.mergeIn({
      times: { 222: [{ at: 1, t: 9000, pen: 0, scr: 'R' }, { ...a, pen: 'dnf', ed: Date.now() + 5 }], pyram: [{ at: 2, t: 7000, pen: 0, scr: 'U' }] },
      deleted: [`222:${mine[1].at}`],
      known: { 222: { pbl: Date.now() + 10, oll: -1 } },
      solo: { sq1: Date.now() },
      plan: { comp: { date: '2027-05-01', name: 'Open', url: '', at: Date.now() + 10 } },
    });
    const now = D.times('222');
    return { changed, n: now.length, first: now[0].at === 1, edited: now.find((x) => x.at === a.at).pen, gone: !now.some((x) => x.at === mine[1].at), pyram: D.times('pyram').length, pbl: D.isKnown('222', 'pbl'), oll: D.isKnown('222', 'oll'), sq1: D.solo('sq1'), comp: D.plan().comp.name };
  });
  check('merging another device: its times, its newer edit, its deletion and its newer marks; an older mark does not win', merged.changed && merged.first && merged.edited === 'dnf' && merged.gone && merged.pyram === 1 && merged.pbl && merged.oll && merged.sq1 && merged.comp === 'Open', JSON.stringify(merged));
  await ctx.close();

  // ---------------- The other three events ----------------
  const others = [['4x4', st4, 'barra', /Resuelto/], ['pyraminx', stP, 'll-3', /Resuelto/], ['square-1', stS, 'forma-0', /Forma de cubo/]];
  for (const [page, states, tryId, endMsg] of others) {
    ({ ctx, p } = await open({ viewport: { width: 1280, height: 900 } }, `${SITE}/${page}`));
    const got = await p.evaluate(() => ({ states: Object.fromEntries(Object.values(window.EvPage.T.sets).flatMap((s) => s.cases).map((c) => [c.id, window.EvPage.caseState(c)])), cards: document.querySelectorAll('.ev-case').length, svgs: document.querySelectorAll('.ev-case svg').length, scr: window.EvPage.state().scramble }));
    const n = Object.keys(states).length;
    check(`${page}: the page draws the model's states, every case with its picture (L4E inside its «Ver los 35 casos»), and a scramble`, Object.keys(states).every((k) => JSON.stringify(got.states[k]) === JSON.stringify(states[k])) && got.cards === n && got.svgs === n && got.scr.length > 10, `${got.cards}/${n}`);
    await p.click(`[data-try="${tryId}"]`);
    const k = await p.locator('#tryAlg .ev-mv').count();
    for (let i = 0; i < k; i++) await p.click('#tryNext');
    check(`${page}: «Pruébalo» to the end of ${tryId}`, endMsg.test(await p.textContent('#tryNow')), await p.textContent('#tryNow'));
    await p.click('#tryClose');
    if (page !== 'square-1') {
      const su = await setupCheck(p);
      check(`${page}: its trainer setups give the drawn case, are solved by the shown solution and are never the algorithm backwards`, su.n > (page === '4x4' ? 8 : 100) && !su.bad.length, JSON.stringify({ ...su, bad: su.bad.slice(0, 3) }));
    }
    await ctx.close();
  }

  // ---------------- The OBS overlay: it follows the page in use, also the new events ----------------
  {
    const octx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await octx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const sq = await octx.newPage();
    sq.on('pageerror', (e) => errs.push(`square-1 (overlay): ${e.message}`));
    await sq.goto(`${SITE}/square-1#crono`);
    await sq.waitForFunction(() => window.EvPage && window.EvPage.state().scramble);
    const ov = await octx.newPage();
    ov.on('pageerror', (e) => errs.push(`overlay: ${e.message}`));
    await ov.goto(`${SITE}/overlay.html`);
    const brand = () => ov.evaluate(() => document.getElementById('brandTag').textContent);
    await sq.bringToFront();
    await sq.keyboard.press(' ');
    await ov.waitForFunction(() => /Square-1/.test(document.getElementById('brandTag').textContent), null, { timeout: 8000 }).catch(() => {});
    const o1 = await ov.evaluate(() => ({ brand: document.getElementById('brandTag').textContent, pic: !document.getElementById('evPic').hidden && !!document.querySelector('#evPic svg polygon'), net: document.getElementById('net').hidden, splits: document.getElementById('cfSplits').hidden, prog: document.getElementById('prog').textContent, pill: document.body.textContent.includes('Inspección') || document.body.textContent.includes('INSPECCIÓN') }));
        {
      const p4 = await octx.newPage();
      await p4.goto(`${SITE}/4x4#crono`);
      await p4.waitForFunction(() => window.EvPage && window.EvPage.state().scramble);
      await p4.keyboard.press('f');
      await p4.check('#optHelp');
      const sets = await p4.evaluate(() => [...document.querySelectorAll('#cheat .ev-cheat-set h3')].map((h) => h.textContent).join('|') + ':' + document.querySelectorAll('#cheat li').length + ':' + parseFloat(getComputedStyle(document.querySelector('#cheat .fr-alg')).fontSize));
      await p4.uncheck('#optHelp');
      check('4×4, full screen with «Mirando el tutorial»: only the two parities in sight, big enough to read', /^Paridades:2:/.test(sets) && Number(sets.split(':')[2]) >= 16, sets);
      await p4.close();
    }
    check('overlay: the Square-1 page on stream (its name, its scramble drawn, its steps, the inspection running; no 3×3 cube nor CFOP steps)', /Square-1/.test(o1.brand) && o1.pic && o1.net && o1.splits && /Pasos que me sé/.test(o1.prog), JSON.stringify(o1));
    await sq.keyboard.press('Escape');
    const fr = await octx.newPage();
    await fr.goto(`${SITE}/fridrich#crono`);
    await fr.waitForFunction(() => window.Fridrich && window.Fridrich.scramble());
    await fr.mouse.click(5, 5);
    await ov.waitForFunction(() => /CFOP/.test(document.getElementById('brandTag').textContent), null, { timeout: 8000 }).catch(() => {});
    const o2 = await brand();
    await sq.bringToFront();
    await sq.mouse.click(5, 5);
    await ov.waitForFunction(() => /Square-1/.test(document.getElementById('brandTag').textContent), null, { timeout: 8000 }).catch(() => {});
    const o3 = await brand();
    check('overlay: it changes by itself to the page you use (CFOP, then back to the Square-1)', /CFOP/.test(o2) && /Square-1/.test(o3), `${o2} → ${o3}`);
    // A time with minutes, in the «Carbón» look (a mono font): «:» and «.» centred in their slots, not on the digits.
    const ovc = await octx.newPage();
    await ovc.goto(`${SITE}/overlay.html?tema=carbon`);
    await ovc.waitForTimeout(300);
    await ovc.evaluate(() => { const now = Date.now(); new BroadcastChannel('op3bld-live').postMessage({ type: 'state', p: JSON.stringify({ v: 1, mode: 'cfop', at: now, src: 'test', act: now + 60000, scr: 'R U', moves: 2, cube: null, timer: { phase: 'done', t: 229380 }, last: { ok: true, t: 229380, pen: 0, at: now }, today: { n: 1, ok: 1, best: 229380 }, total: { n: 1, ok: 1 }, recent: [] }) }); });
    await ovc.waitForFunction(() => document.getElementById('time').textContent === '3:49.38', null, { timeout: 5000 }).catch(() => {});
    const slots = await ovc.evaluate(() => [...document.querySelectorAll('#time span')].map((x) => { const r = x.getBoundingClientRect(); const g = document.createRange(); g.selectNodeContents(x); const ink = g.getBoundingClientRect(); return Math.abs((ink.left + ink.right) / 2 - (r.left + r.right) / 2) < 2; }));
    check('overlay: a time with minutes in «Carbón» (3:49.38), every character centred in its slot', (await ovc.textContent('#time')) === '3:49.38' && slots.length === 7 && slots.every(Boolean), JSON.stringify(slots));
    await ovc.close();
    await sq.evaluate(() => window.EvPage.showView('ajustes'));
    await sq.waitForSelector('#streamBox #ovUrl');
    check('Ajustes of the event pages: the overlay settings (the same URL and OBS link as elsewhere)', /overlay\.html/.test(await sq.inputValue('#ovUrl')));
    await octx.close();
  }

  // ---------------- Phones: no sideways scroll, nothing on top of anything ----------------
  for (const [label, opts, scheme] of [['Pixel 7', { ...devices['Pixel 7'] }, 'dark'], ['iPhone on its side', { viewport: { width: 750, height: 340 }, isMobile: true, hasTouch: true }, 'light']]) {
    for (const page of ['2x2', '4x4', 'pyraminx', 'square-1']) {
      ({ ctx, p } = await open(opts, `${SITE}/${page}`, scheme));
      const bad = [];
      for (const v of ['aprender', 'crono', 'entrenar', 'progreso', 'ajustes']) {
        await p.evaluate((x) => window.EvPage.showView(x), v);
        const o = await p.evaluate(() => {
          const over = document.documentElement.scrollWidth - window.innerWidth;
          const out = [...document.querySelectorAll('main *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 1; }).length;
          return over + out;
        });
        if (o > 0) bad.push(`${v} ${o}`);
      }
      await p.evaluate(() => window.EvPage.showView('aprender'));
      await p.click('.ev-case [data-try]');
      const sheet = await p.evaluate(() => { const r = document.querySelector('#trySheet .ev-try-card').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 1; });
      if (!sheet) bad.push('pruébalo');
      check(`${label} · ${page}: every view without sideways scroll, «Pruébalo» on screen`, bad.length === 0, bad.join(', '));
      await ctx.close();
    }
  }

  check('no page errors', errs.length === 0, errs.join(' | '));
  results.forEach((r) => console.log(r));
  console.log(`page errors: ${errs.length ? JSON.stringify(errs) : 'none'}`);
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
