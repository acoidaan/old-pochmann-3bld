// Following a known sequence of turns on the smart cube (a scramble, a setup): the cube's state after each
// turn, and part way through half turns, slices and two turns on opposite faces, whichever the cube reports
// first. The cube is where its state matches; states are compared in the cube's own frame (centres fixed).
// Exposes window.CubeFollow; it touches no page element.
//
//   const F = makeFollow(start, ['R', "U'", …]);   followMove(F, state, move);   done(F)
(() => {
  'use strict';
  const M = window.CubeModel;
  if (!M) return;
  const { apply, parseAlg, norm } = M;
  const key = (st) => st.join(',');

  // Face turns (one or two quarter turns each) that take the core from a to b.
  const FACE_MOVES = ['U', 'R', 'F', 'D', 'L', 'B'].flatMap((f) => [f, `${f}2`, `${f}'`]);
  const quarters = (m) => (m.endsWith('2') ? [m[0], m[0]] : [m]);
  function facePath(a, b) {
    const kb = key(b);
    if (key(a) === kb) return [];
    for (const m of FACE_MOVES) if (key(apply(a, m)) === kb) return quarters(m);
    for (const m1 of FACE_MOVES) {
      const s = apply(a, m1);
      for (const m2 of FACE_MOVES) if (key(apply(s, m2)) === kb) return [...quarters(m1), ...quarters(m2)];
    }
    return null;
  }

  // The states part way from one to the other (neither of the two), as keys.
  function partialKeys(before, after) {
    const path = facePath(before, after);
    if (!path || !path.length) return [];
    const per = {};
    path.forEach((q) => { const f = q[0]; per[f] = (per[f] || 0) + (q.length > 1 ? 3 : 1); });
    const faces = Object.keys(per);
    const options = faces.map((f) => {
      const t = per[f] % 4;
      return t === 2 ? ['', f, `${f}'`, `${f}2`] : ['', t === 1 ? f : `${f}'`];
    });
    const out = [];
    const walk = (i, acc) => {
      if (i === faces.length) {
        const full = acc.every((m, k) => m === options[k][options[k].length - 1]);
        const none = acc.every((m) => !m);
        if (!full && !none) out.push(key(apply(before, acc.filter(Boolean).join(' '))));
        return;
      }
      for (const m of options[i]) walk(i + 1, [...acc, m]);
    };
    walk(0, []);
    return out;
  }
  // Two turns on opposite faces (R L', U D2): they can come in either order, or at once.
  const AXIS = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };
  const opposite = (a, b) => !!a && !!b && a[0] !== b[0] && AXIS[a[0]] != null && AXIS[a[0]] === AXIS[b[0]];

  function makeFollow(start, moves) {
    const at = new Map();
    const half = new Map();
    const add = (map, k, i) => { if (!map.has(k)) map.set(k, []); map.get(k).push(i); };
    let s = start;
    add(at, key(norm(s)), 0);
    let prev = null;
    moves.forEach((m, i) => {
      const before = norm(s);
      s = apply(s, m);
      const after = norm(s);
      partialKeys(before, after).forEach((k) => add(half, k, i));
      if (prev && opposite(moves[i - 1], m)) partialKeys(prev, after).forEach((k) => add(half, k, i - 1));
      add(at, key(after), i + 1);
      prev = before;
    });
    return { moves, n: moves.length, at, half, pos: 0, halfway: false, off: [], lost: false };
  }
  // Turns in a row on the same face, added up: R R → R2, R R' → nothing.
  function simplify(list) {
    const out = [];
    for (const t of list) {
      const m = parseAlg(t)[0];
      const last = out[out.length - 1];
      if (last && last.base === m.base) {
        last.turns = (last.turns + m.turns) % 4;
        if (!last.turns) out.pop();
      } else out.push({ base: m.base, turns: m.turns });
    }
    return out;
  }
  const moveText = (m) => m.base + (m.turns === 2 ? '2' : m.turns === 3 ? "'" : '');
  // Where the cube is in the sequence; among several places, the nearest to where it was.
  function locate(F, st) {
    if (!F) return false;
    const k = key(st);
    const pick = (list) => list.reduce((b, x) => {
      const db = Math.abs(b - F.pos); const dx = Math.abs(x - F.pos);
      return dx < db || (dx === db && x > b) ? x : b;
    });
    if (F.at.has(k)) { F.pos = pick(F.at.get(k)); F.halfway = false; F.off = []; F.lost = false; return true; }
    if (F.half.has(k)) { F.pos = pick(F.half.get(k)); F.halfway = true; F.off = []; F.lost = false; return true; }
    return false;
  }
  // Off the sequence: the turns to undo; past six, lost.
  function followMove(F, st, mv) {
    if (!F || locate(F, st) || F.lost) return;
    F.off = simplify([...F.off.map(moveText), mv]);
    if (F.off.length > 6) F.lost = true;
  }
  const done = (F) => !!F && !F.lost && !F.off.length && !F.halfway && F.pos >= F.n;
  // The turns that undo the ones off the sequence; `map` names the faces as the cube is held.
  const undoText = (F, map) => F.off.slice().reverse()
    .map((m) => moveText({ base: map ? map[m.base] : m.base, turns: (4 - m.turns) % 4 })).join(' ');

  window.CubeFollow = { facePath, partialKeys, opposite, makeFollow, simplify, moveText, locate, followMove, done, undoText };
})();
