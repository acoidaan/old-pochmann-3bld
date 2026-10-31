// The 41 basic F2L cases on top of cfop.js: one pair to put in its slot, front right, with the cross done and
// the other three pairs in. Numbered as on SpeedCubeDB (speedcubedb.com/a/3x3/F2L), in its six groups. The
// first algorithm of each case is J Perm's (his «Best F2L Algorithms», front right column); then come his
// other ones and the community's favourite on SpeedCubeDB. Which case each empty slot shows (from whichever
// side, with the top turned), its picture and how it looks in words. Pure functions, no page elements:
// exposes window.CfopF2l.
(() => {
  'use strict';
  const M = window.CubeModel;
  const C = window.Cfop;
  const { apply, solved, invertAlg, faceOfSticker, STICKERS, CUBIES, ROTATIONS } = M;

  const GROUPS = [
    { id: 'free', name: 'Directas', long: 'Las dos piezas arriba, listas para meterlas' },
    { id: 'joined', name: 'Unidas', long: 'Las dos arriba, ya juntas' },
    { id: 'apart', name: 'Separadas', long: 'Las dos arriba, separadas' },
    { id: 'corner', name: 'Esquina en su hueco', long: 'La esquina en su hueco y la arista arriba' },
    { id: 'edge', name: 'Arista en su hueco', long: 'La arista en su hueco y la esquina arriba' },
    { id: 'both', name: 'Las dos en su hueco', long: 'Las dos en su hueco, pero mal' },
  ];
  // [number, group, J Perm's algorithm, others]
  const ROWS = [
    [1, 'free', "U R U' R'", ["R' F R F'", "y' r' U' R U M'", "y U F' L F L2 U L"]],
    [2, 'free', "y U' L' U L", ["F R' F' R", "y' U' R' U R", "U' F' U F"]],
    [3, 'free', "y L' U' L", ["F' U' F", "y' R' U' R", "S U R U' R' S'"]],
    [4, 'free', "R U R'", ["y' f R f'", "y F U F'", "y2 L U L'"]],
    [5, 'apart', "U' R U R' U2 R U' R'", ["y U l' U L U' L' U' l", "F2 L' U' L U F2", "U' R U R' U' R U2 R'"]],
    [6, 'apart', "y U L' U' L U2 L' U L", ["U' r U' R' U R U r'", "y' U R' U' R U2 R' U R", "d R' U' R U2 R' U R"]],
    [7, 'apart', "U' R U2 R' U2 R U' R'", ["y l U2 L2 U' L2 U' l'", "U' R U2 R' U' R U2 R'", "M' U' M U2 r U' r'"]],
    [8, 'apart', "y U L' U2 L U2 L' U L", ["r' U2 R2 U R2 U r", "d R' U2 R U R' U2 R", "y' U R' U2 R U2 R' U R"]],
    [9, 'apart', "y U L' U' L U' L' U' L", ["y U2 L' U L U L' U' L", "U' R U' R' U F' U' F", "F R U R' U' F' R U' R'"]],
    [10, 'apart', "U' R U R' U R U R'", ["U2 R U' R' U' R U R'", "d R' U R d' R U R'", "y' U R' U R U' f R f'"]],
    [11, 'joined', "y L U2 L2 U' L2 U' L'", ["y L' U L U' L' U L U2 L' U L", "U' R U2 R' U y L' U' L", "U' R U2 R' U F' U' F"]],
    [12, 'joined', "R' U2 R2 U R2 U R", ["R U' R' U R U' R' U2 R U' R'", "y U L' U2 L U' y' R U R'", "U F' U2 F U' R U R'"]],
    [13, 'joined', "y U L' U L U' L' U' L", ["y' U R' U R U' R' U' R", "M' U' R U R' U2 R U' r'", "R U' R' U R' F R F' R U' R'"]],
    [14, 'joined', "U' R U' R' U R U R'", ["R U2 R' U2 R U R' U2 R U' R'", "U' R2 D R' U R D' R2", "U2 R2 U R' U R U2 R2"]],
    [15, 'joined', "M U L F' L' U' M'", ["y L' U L y' U2 R U R'", "y' R2 F R F' R U2 R' U R", "y2 f' L f U2 L U L'"]],
    [16, 'joined', "y M U' R' F R U M'", ["R U' R' y U2 L' U' L", "y2 L2 F' L' F L' U2 L U' L'", "y' f R' f' U2 R' U' R"]],
    [17, 'joined', "R U2 R' U' R U R'", ["y2 L U2 L' U' L U L'", "R U R' U' R U2 R' U2 R U R'", "y L F' L' F L' U L U' L' U L"]],
    [18, 'joined', "y L' U2 L U L' U' L", ["y' R' U2 R U R' U' R", "F' U2 F U F' U' F", "R' F R F' R U' R' U R U' R'"]],
    [19, 'apart', "U R U2 R' U R U' R'", ["U R U2 R2 F R F'", "d f R2 f' U f R' f'", "R U' R' U R U' R' U R U R'"]],
    [20, 'apart', "y U' L' U2 L U' L' U L", ["y' U' R' U2 R U' R' U R", "U' R U' R2 F R F' R U' R'", "U' F' U2 F U' F' U F"]],
    [21, 'apart', "U2 R U R' U R U' R'", ["y F R U2 R' F'", "R U' R' U2 R U R'", "R B U2 B' R'"]],
    [22, 'apart', "y U2 L' U' L U' L' U L", ["F' L' U2 L F", "r U' r' U2 r U r'", "y' U2 R' U' R U' R' U R"]],
    [23, 'joined', "U R U' R' U' R U' R' U R U' R'", ["U F R' F' R U R U R'", "y U L' U' L2 F' L' F L' U L", "y F' U' L' U L F L' U L"]],
    [24, 'joined', "y U' L' U L U L' U L U' L' U L", ["y U' F' L F L' U' L' U' L", "U' R U R2 F R F' R U' R'", "F U R U' R' F' R U' R'"]],
    [25, 'corner', "U' R' F R F' R U R'", ["R' F' R U R U' R' F", "U' F' R U R' U' R' F R", "y U' L' U L F' L F L'"]],
    [26, 'corner', "y U L F' L' F L' U' L", ["y L F L' U' L' U L F'", "y U F L' U' L U L F' L'", "U R U' R' F R' F' R"]],
    [27, 'corner', "R U' R' U R U' R'", ["F' U' F U2 R U' R'", "y' f R' f' U f R' f'", "y' f R' f' r' U' R U M'"]],
    [28, 'corner', "y L' U L U' L' U L", ["R U R' U' F R' F' R", "F' U F U' F' U F", "y' R' U R U' R' U R"]],
    [29, 'corner', "y L' U' L U L' U' L", ["M' U R U' R' U R U' r'", "R' F R F' R' F R F'", "R' F R F' U R U' R'"]],
    [30, 'corner', "R U R' U' R U R'", ["y M' U' L' U L U' L' U l", "y L F' L' F L F' L' F", "U' R U2 R' U2 R U R'"]],
    [31, 'edge', "U' R' F R F' R U' R'", ["R U' R' F' U2 F", "y' R' U R' F R F' R", "y' U' R' U2 R f R f'"]],
    [32, 'edge', "U R U' R' U R U' R' U R U' R'", ["R U R' U' R U R' U' R U R'", 'R2 U R2 U R2 U2 R2', "U' F R' F' R U' R U R'"]],
    [33, 'edge', "y U' L' U' L U2 L' U' L", ["y U L' U2 L U' L' U' L", "U' R U' R' U2 R U' R'", "y R' D R U' R' D' R"]],
    [34, 'edge', "U R U R' U2 R U R'", ["U' R U2 R' U R U R'", "y U L' U L U2 L' U L", "U R' D' R U' R' D R"]],
    [35, 'edge', "y U' F U F' U L' U' L", ["U2 R U R' F R' F' R", "U M' U R U' r' R U' R'", "y2 U2 L U L' y' U' L' U L"]],
    [36, 'edge', "U F' U' F U' R U R'", ["y U2 L' U' L F' L F L'", "y U' M' U' L' U l L' U L", "y' U2 R' U' R y U R U' R'"]],
    [37, 'both', "R2 U2 F R2 F' U2 R' U R'", ["y L2 U2 F' L2 F U2 L U' L", "y' f R' f' U R' U2 R U R' U2 R", "y2 f' L f U' L U2 L' U' L U2 L'"]],
    [38, 'both', "R U' R' U' R U R' U2 R U' R'", ["R U R' U' R U2 R' U' R U R'", "R2 U2 R' U' R U' R' U2 R'", "R U' R' U' R U R' U' R U2 R'"]],
    [39, 'both', "R U' R' U R U2 R' U R U' R'", ["R U2 R U R' U R U2 R2", "R U R' U2 R U' R' U R U R'", "R U2 R' U R U' R' U R U R'"]],
    [40, 'both', "y L' U L F R U2 R' F'", ["F' L' U2 L F R U R'", "y' R2 F' U' F U R U' R", "y2 L U' L U F U' F' L2"]],
    [41, 'both', "R U' R' F' L' U2 L F", ["y F R U2 R' F' L' U' L", "y2 L2 F U F' U' L' U L'", "y' R' U R' U' F' U F R2"]],
  ];
  const ORDER = GROUPS.map((g) => g.id);
  const CASES = ROWS.map(([n, group, alg, alts]) => ({ id: `f2l${n}`, step: 'f2l', n, group, name: `F2L ${n}`, es: `F2L ${n}`, alg, alts }))
    .sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group) || a.n - b.n);
  const groupOf = (c) => GROUPS.find((g) => g.id === c.group);

  // An algorithm as a permutation (the solved cube is the identity), worked out once: much faster than turn
  // by turn when every case is tried on every slot.
  const perms = new Map();
  const run = (g, alg) => {
    if (!alg) return g;
    if (!perms.has(alg)) perms.set(alg, apply(solved(), alg));
    const p = perms.get(alg);
    return p.map((i) => g[i]);
  };
  // Some algorithms turn the whole cube on the way (y …): the turn that brings it back, so the slot ends up
  // front right again.
  const centresHome = (g) => [4, 13, 22, 31, 40, 49].every((i) => g[i] === i);
  CASES.forEach((c) => {
    const after = run(solved(), c.alg);
    c.back = ['', ...ROTATIONS].find((r) => centresHome(run(after, r))) || '';
  });

  // For each empty slot of g (the cube with the cross colour down and the cross done), the case it shows: the
  // whole-cube turn that brings that slot to the front right, the turn of the top before the algorithm, and
  // the case. A slot whose pieces are in other slots is not one of these 41: it is left out.
  function recognize(g) {
    const st = C.stageOf(g);
    if (st.cross < 4 || st.n === 4) return [];
    const out = [];
    st.pairs.forEach((done, slot) => {
      if (done) return;
      const view = C.slotToFront(slot);
      const gv = run(g, view);
      for (const auf of C.AUF) {
        const ga = run(gv, auf);
        const c = CASES.find((x) => {
          const s = C.stageOf(run(run(ga, x.alg), x.back));
          return s.cross === 4 && s.pairs[0] && s.n === st.n + 1;
        });
        if (c) { out.push({ slot, view, auf, case: c, g: ga }); return; }
      }
    });
    return out;
  }

  // A case as J Perm draws it: the cross colour down, the algorithm undone from solved, the slot front right.
  // An algorithm that turns the whole cube is undone from the cube turned the other way first, so that every
  // case shows the same colours in front. `auf` turns the top after.
  const pictures = new Map();
  function caseState(c, auf) {
    if (!pictures.has(c.id)) pictures.set(c.id, apply(apply(solved(), C.DOWN.U), `${invertAlg(c.back)} ${invertAlg(c.alg)}`.trim()));
    return run(pictures.get(c.id), auf);
  }

  // How it looks, in words: where the corner and the edge of the front right pair are and which way the cross
  // colour of the corner faces (with both on top, J Perm tells them apart by that, and then by whether the
  // corner and the edge show the same colour on top).
  const face = (g, i) => faceOfSticker(g[i]);
  const UP = (n) => n[1] === 1;
  function describe(g) {
    const D = face(g, 31); const F = face(g, 22); const R = face(g, 13);
    const find = (cols) => CUBIES.find((p) => p.length === cols.length && cols.every((x) => p.some((i) => face(g, i) === x)));
    const corner = find([D, F, R]);
    const edge = find([F, R]);
    const cross = corner.find((i) => face(g, i) === D);
    const cTop = STICKERS[cross].pos[1] === 1;
    const eTop = STICKERS[edge[0]].pos[1] === 1;
    const crossDir = UP(STICKERS[cross].nrm) ? 'hacia arriba' : STICKERS[cross].nrm[1] === -1 ? 'abajo' : 'a un lado';
    const where = (i) => { const n = STICKERS[i].nrm; return n[2] === 1 ? 'delante' : n[0] === 1 ? 'a la derecha' : 'a un lado'; };
    const edgeOk = !eTop && face(g, edge.find((i) => STICKERS[i].nrm[2] === 1)) === F;
    if (cTop && eTop) {
      if (crossDir === 'hacia arriba') return 'Las dos arriba; el color de la cruz de la esquina mira hacia arriba.';
      const cUp = face(g, corner.find((i) => UP(STICKERS[i].nrm)));
      const eUp = face(g, edge.find((i) => UP(STICKERS[i].nrm)));
      return `Las dos arriba; el color de la cruz de la esquina mira a un lado, y arriba la esquina y la arista tienen ${cUp === eUp ? 'el mismo color' : 'colores distintos'}.`;
    }
    if (!cTop && eTop) {
      return `La esquina en su hueco, ${crossDir === 'abajo' ? 'bien' : `girada (el color de la cruz mira ${where(cross)})`}, y la arista arriba.`;
    }
    if (cTop && !eTop) return `La arista en su hueco, ${edgeOk ? 'bien' : 'al revés'}, y la esquina arriba con el color de la cruz ${crossDir}.`;
    return `Las dos en su hueco: la esquina ${crossDir === 'abajo' ? 'bien' : `girada (el color de la cruz mira ${where(cross)})`} y la arista ${edgeOk ? 'bien' : 'al revés'}.`;
  }
  CASES.forEach((c) => { c.look = describe(caseState(c)); });

  const caseById = (id) => CASES.find((c) => c.id === id);
  // Whatever looks a case up by its id (the sync keeps only known cases, the trainer, the history) knows these
  // too; the lists of OLL and PLL cases stay as they were.
  const own = C.caseById;
  C.caseById = (id) => own(id) || caseById(id);

  window.CfopF2l = { GROUPS, CASES, groupOf, recognize, caseState, describe, caseById };
})();
