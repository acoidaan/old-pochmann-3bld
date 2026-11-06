// Full CFOP on top of cfop.js: the 57 OLL and the 21 PLL, each done in one look (the step after 2-look OLL and
// PLL). Numbered and named as everyone does (OLL 1–57, PLL Aa…Z), with J Perm's algorithms (jperm.net/algs/oll
// and jperm.net/algs/pll), in groups by what the top looks like. Which case a last layer shows, its picture
// and how it looks in words. Pure functions, no page elements: exposes window.CfopFull.
(() => {
  'use strict';
  const M = window.CubeModel;
  const C = window.Cfop;
  const { apply, solved, invertAlg, faceOfSticker, ROTATIONS } = M;

  const OLL_GROUPS = [
    { id: 'cross', name: 'Con la cruz', long: 'Las aristas ya orientadas: solo faltan las esquinas' },
    { id: 'corners', name: 'Esquinas hechas', long: 'Las cuatro esquinas orientadas, faltan dos aristas' },
    { id: 't', name: 'T', long: 'Una T amarilla' },
    { id: 'p', name: 'P', long: 'Una P amarilla' },
    { id: 'c', name: 'C', long: 'Una C amarilla' },
    { id: 'w', name: 'W', long: 'Una escalera (W)' },
    { id: 'square', name: 'Cuadrado', long: 'Un bloque de 2×2' },
    { id: 'slight', name: 'Rayo pequeño', long: 'Un rayo pequeño' },
    { id: 'fish', name: 'Pez', long: 'Un pez' },
    { id: 'knight', name: 'Caballo', long: 'Un salto de caballo' },
    { id: 'blight', name: 'Rayo grande', long: 'Un rayo grande' },
    { id: 'awkward', name: 'Raros', long: 'Una línea de dos en un lado' },
    { id: 'l', name: 'L', long: 'Una L pequeña con el centro' },
    { id: 'line', name: 'Línea', long: 'Una línea de tres por el centro' },
    { id: 'dot', name: 'Punto', long: 'Ninguna arista orientada' },
  ];
  // [number, group, algorithm]
  const OLL_ROWS = [
    [1, 'dot', "R U2 R2 F R F' U2 R' F R F'"],
    [2, 'dot', "r U r' U2 r U2 R' U2 R U' r'"],
    [3, 'dot', "r' R2 U R' U r U2 r' U M'"],
    [4, 'dot', "M U' r U2 r' U' R U' R' M'"],
    [5, 'square', "l' U2 L U L' U l"],
    [6, 'square', "r U2 R' U' R U' r'"],
    [7, 'slight', "r U R' U R U2 r'"],
    [8, 'slight', "l' U' L U' L' U2 l"],
    [9, 'fish', "R U R' U' R' F R2 U R' U' F'"],
    [10, 'fish', "R U R' U R' F R F' R U2 R'"],
    [11, 'slight', "r U R' U R' F R F' R U2 r'"],
    [12, 'slight', "M' R' U' R U' R' U2 R U' R r'"],
    [13, 'knight', "F U R U' R2 F' R U R U' R'"],
    [14, 'knight', "R' F R U R' F' R F U' F'"],
    [15, 'knight', "l' U' l L' U' L U l' U l"],
    [16, 'knight', "r U r' R U R' U' r U' r'"],
    [17, 'dot', "F R' F' R2 r' U R U' R' U' M'"],
    [18, 'dot', "r U R' U R U2 r2 U' R U' R' U2 r"],
    [19, 'dot', "r' R U R U R' U' M' R' F R F'"],
    [20, 'dot', "r U R' U' M2 U R U' R' U' M'"],
    [21, 'cross', "R U2 R' U' R U R' U' R U' R'"],
    [22, 'cross', "R U2 R2 U' R2 U' R2 U2 R"],
    [23, 'cross', "R2 D' R U2 R' D R U2 R"],
    [24, 'cross', "r U R' U' r' F R F'"],
    [25, 'cross', "F' r U R' U' r' F R"],
    [26, 'cross', "R U2 R' U' R U' R'"],
    [27, 'cross', "R U R' U R U2 R'"],
    [28, 'corners', "r U R' U' r' R U R U' R'"],
    [29, 'awkward', "R U R' U' R U' R' F' U' F R U R'"],
    [30, 'awkward', "F R' F R2 U' R' U' R U R' F2"],
    [31, 'p', "R' U' F U R U' R' F' R"],
    [32, 'p', "L U F' U' L' U L F L'"],
    [33, 't', "R U R' U' R' F R F'"],
    [34, 'c', "R U R2 U' R' F R U R U' F'"],
    [35, 'fish', "R U2 R2 F R F' R U2 R'"],
    [36, 'w', "L' U' L U' L' U L U L F' L' F"],
    [37, 'fish', "F R' F' R U R U' R'"],
    [38, 'w', "R U R' U R U' R' U' R' F R F'"],
    [39, 'blight', "L F' L' U' L U F U' L'"],
    [40, 'blight', "R' F R U R' U' F' U R"],
    [41, 'awkward', "R U R' U R U2 R' F R U R' U' F'"],
    [42, 'awkward', "R' U' R U' R' U2 R F R U R' U' F'"],
    [43, 'p', "F' U' L' U L F"],
    [44, 'p', "F U R U' R' F'"],
    [45, 't', "F R U R' U' F'"],
    [46, 'c', "R' U' R' F R F' U R"],
    [47, 'l', "R' U' R' F R F' R' F R F' U R"],
    [48, 'l', "F R U R' U' R U R' U' F'"],
    [49, 'l', "r U' r2 U r2 U r2 U' r"],
    [50, 'l', "r' U r2 U' r2 U' r2 U r'"],
    [51, 'line', "F U R U' R' U R U' R' F'"],
    [52, 'line', "R U R' U R U' B U' B' R'"],
    [53, 'l', "l' U2 L U L' U' L U L' U l"],
    [54, 'l', "r U2 R' U' R U R' U' R U' r'"],
    [55, 'line', "R' F R U R U' R2 F' R2 U' R' U R U R'"],
    [56, 'line', "r' U' r U' R' U R U' R' U R r' U r"],
    [57, 'corners', "R U R' U' M' U R U' r'"],
  ];
  const PLL_GROUPS = [
    { id: 'edges', name: 'Solo aristas', long: 'Las esquinas ya están en su sitio' },
    { id: 'corners', name: 'Solo esquinas', long: 'Las aristas ya están en su sitio' },
    { id: 'adj', name: 'Esquinas vecinas', long: 'Se cambian dos esquinas de un mismo lado (hay faros)' },
    { id: 'g', name: 'G', long: 'Las G: un bloque de 1×2 y faros' },
    { id: 'diag', name: 'Esquinas en diagonal', long: 'Se cambian dos esquinas en diagonal (no hay faros)' },
  ];
  // [name, group, algorithm]
  const PLL_ROWS = [
    ['Ua', 'edges', "R U' R U R U R U' R' U' R2"],
    ['Ub', 'edges', "R2 U R U R' U' R' U' R' U R'"],
    ['H', 'edges', 'M2 U M2 U2 M2 U M2'],
    ['Z', 'edges', "M' U M2 U M2 U M' U2 M2"],
    ['Aa', 'corners', "x L2 D2 L' U' L D2 L' U L'"],
    ['Ab', 'corners', "x' L2 D2 L U L' D2 L U' L"],
    ['E', 'corners', "x' L' U L D' L' U' L D L' U' L D' L' U L D"],
    ['T', 'adj', "R U R' U' R' F R2 U' R' U' R U R' F'"],
    ['F', 'adj', "R' U' F' R U R' U' R' F R2 U' R' U' R U R' U R"],
    ['Ja', 'adj', "x R2 F R F' R U2 r' U r U2"],
    ['Jb', 'adj', "R U R' F' R U R' U' R' F R2 U' R'"],
    ['Ra', 'adj', "R U' R' U' R U R D R' U' R D' R' U2 R'"],
    ['Rb', 'adj', "R2 F R U R U' R' F' R U2 R' U2 R"],
    ['Ga', 'g', "R2 U R' U R' U' R U' R2 U' D R' U R D'"],
    ['Gb', 'g', "R' U' R U D' R2 U R' U R U' R U' R2 D"],
    ['Gc', 'g', "R2 U' R U' R U R' U R2 U D' R U' R' D"],
    ['Gd', 'g', "R U R' U' D R2 U' R U' R' U R' U R2 D'"],
    ['Y', 'diag', "F R U' R' U' R U R' F' R U R' U' R' F R F'"],
    ['V', 'diag', "R' U R' U' y R' F' R2 U' R' U R' F R F"],
    ['Na', 'diag', "R U R' U R U R' F' R U R' U' R' F R2 U' R' U2 R U' R'"],
    ['Nb', 'diag', "R' U R U' R' F' U' F R U R' F R' F' R U' R"],
  ];

  // An algorithm as a permutation (the solved cube is the identity), worked out once.
  const perms = new Map();
  const run = (g, alg) => {
    if (!alg) return g;
    if (!perms.has(alg)) perms.set(alg, apply(solved(), alg));
    const p = perms.get(alg);
    return p.map((i) => g[i]);
  };
  // Some algorithms turn the whole cube (x, y): the turn that brings it back, so the top is on top again.
  const centresHome = (g) => [4, 13, 22, 31, 40, 49].every((i) => g[i] === i);
  const backOf = (alg) => { const after = run(solved(), alg); return ['', ...ROTATIONS].find((r) => centresHome(run(after, r))) || ''; };

  const OLL = OLL_ROWS.map(([n, group, alg]) => ({ id: `oll-${n}`, step: 'foll', n, group, name: `OLL ${n}`, es: `OLL ${n}`, alg }));
  const PLL = PLL_ROWS.map(([n, group, alg]) => ({ id: `pll-${n}`, step: 'fpll', n, group, name: `PLL (${n})`, es: `${n}-perm`, alg }));
  const order = (groups) => (a, b) => groups.findIndex((g) => g.id === a.group) - groups.findIndex((g) => g.id === b.group) || (typeof a.n === 'number' ? a.n - b.n : 0);
  OLL.sort(order(OLL_GROUPS));
  PLL.sort(order(PLL_GROUPS));
  const CASES = [...OLL, ...PLL];
  CASES.forEach((c) => { c.back = backOf(c.alg); });
  const groupOf = (c) => (c.step === 'foll' ? OLL_GROUPS : PLL_GROUPS).find((g) => g.id === c.group);
  const STEPS = [
    { id: 'foll', name: 'OLL', long: 'Orientar la última capa de una vez' },
    { id: 'fpll', name: 'PLL', long: 'Permutar la última capa de una vez' },
  ];

  // Done with this step (the cross colour down): the top oriented, or the whole cube solved.
  const ok = (g, i) => faceOfSticker(g[i]) === faceOfSticker(g[Math.floor(i / 9) * 9 + 4]);
  const oriented = (g) => [0, 1, 2, 3, 4, 5, 6, 7, 8].every((i) => ok(g, i));
  const allOk = (g) => g.every((_, i) => ok(g, i));
  const solves = (c, g) => {
    const h = run(run(g, c.alg), c.back);
    return c.step === 'foll' ? oriented(h) : C.AUF.find((u) => allOk(run(h, u)));
  };
  // The case the last layer of g shows (the cross colour down, the first two layers done), with the turn of
  // the top before the algorithm (and after it, for a PLL).
  function recognize(g, step) {
    const cases = step === 'foll' ? OLL : PLL;
    for (const pre of C.AUF) {
      const gp = run(g, pre);
      for (const c of cases) {
        const post = solves(c, gp);
        if (post != null && post !== false) return { case: c, pre, post: c.step === 'fpll' ? post : '', g: gp };
      }
    }
    return null;
  }

  // A case as J Perm draws it: the cross colour down, the algorithm undone from solved. A PLL is drawn with the
  // top turn that leaves the most pieces in place and still takes the algorithm straight away.
  const misplaced = (g) => [0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 18, 19, 20, 36, 37, 38, 45, 46, 47].filter((i) => !ok(g, i)).length;
  const pictures = new Map();
  function caseState(c, auf) {
    if (!pictures.has(c.id)) {
      const raw = apply(apply(solved(), C.DOWN.U), `${invertAlg(c.back)} ${invertAlg(c.alg)}`.trim());
      let g = raw;
      if (c.step === 'fpll') {
        let best = Infinity;
        for (const u of C.AUF) {
          const h = run(raw, u);
          const r = recognize(h, 'fpll');
          const n = misplaced(h);
          if (r && r.case.id === c.id && !r.pre && n < best) { best = n; g = h; }
        }
      }
      pictures.set(c.id, g);
    }
    const g = pictures.get(c.id);
    return auf ? run(g, auf) : g;
  }

  // How it looks, in words.
  function describe(c) {
    const g = caseState(c);
    const gr = groupOf(c);
    if (c.step === 'foll') {
      const e = [1, 3, 5, 7].filter((i) => ok(g, i)).length;
      const k = [0, 2, 6, 8].filter((i) => ok(g, i)).length;
      const word = (n, one, many) => (n === 0 ? `ninguna ${one}` : `${n} ${n === 1 ? one : many}`);
      return `${gr.long}. Arriba: ${word(e, 'arista', 'aristas')} y ${word(k, 'esquina', 'esquinas')} amarillas.`;
    }
    return `${gr.long}.`;
  }
  CASES.forEach((c) => { c.look = describe(c); });

  const caseById = (id) => CASES.find((c) => c.id === id);
  // Whatever looks a case up by its id (the sync, the trainer, the history) knows these too.
  const own = C.caseById;
  C.caseById = (id) => own(id) || caseById(id);

  window.CfopFull = { OLL_GROUPS, PLL_GROUPS, OLL, PLL, CASES, STEPS, groupOf, recognize, caseState, caseById };
})();
