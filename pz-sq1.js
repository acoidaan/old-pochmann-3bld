// The Square-1 for its event page. Each layer is 12 slots of 30°, counted clockwise as seen from above from
// the back end of the slice line; a corner takes two slots and an edge one. The middle layer only matters as
// flipped or not (its right half turns with every /). WCA notation: (x, y) turns the top x and the bottom y
// slots, each clockwise looking at that face, and / turns the right half 180°. Random-move scrambles in that
// notation, what each sequence does to the pieces, and the two layers as SVG. Pure functions: it touches no
// page. Exposes window.PzSq1 (module.exports in Node).
(function (root) {
  'use strict';

  // ================= Pieces =================
  // Solved, held with white on top and green in front: slots 0-1 the back-right corner, 2 the right edge, 3-4
  // front-right, 5 the front edge, 6-7 front-left, 8 left, 9-10 back-left, 11 the back edge; the same below.
  // A corner's sides in the order of its two slots (clockwise from above).
  const PIECES = [];
  const LAYOUT = [['c', ['B', 'R']], ['e', ['R']], ['c', ['R', 'F']], ['e', ['F']], ['c', ['F', 'L']], ['e', ['L']], ['c', ['L', 'B']], ['e', ['B']]];
  const NAMES = { BR: 'detrás a la derecha', R: 'derecha', RF: 'delante a la derecha', F: 'delante', FL: 'delante a la izquierda', L: 'izquierda', LB: 'detrás a la izquierda', B: 'detrás' };
  function layerOf(face) {
    const slots = [];
    LAYOUT.forEach(([kind, sides]) => {
      const p = PIECES.length;
      PIECES.push({ kind, face, sides, name: sides.join('') });
      if (kind === 'c') { slots.push({ p, h: 0 }, { p, h: 1 }); } else slots.push({ p, h: 0 });
    });
    return slots;
  }
  const TOP0 = layerOf('U');
  const BOT0 = layerOf('D');
  const solved = () => ({ top: TOP0.slice(), bot: BOT0.slice(), mid: 0 });
  const clone = (s) => ({ top: s.top.slice(), bot: s.bot.slice(), mid: s.mid });

  // ================= Notation =================
  // "(1,0) / (-1,2) /", "1,0/-1,2/" and "/ (3,3) /" all read; each turn is { x, y } or '/'.
  function parse(str) {
    const txt = String(str || '').replace(/[−–]/g, '-').replace(/\s+/g, '');
    if (!txt) return [];
    if (!/^[-\d,()/]*$/.test(txt)) throw new Error(`Notación no válida: ${str}`);
    const out = [];
    const parts = txt.split('/');
    parts.forEach((part, i) => {
      if (part) {
        const m = part.match(/^\(?(-?\d+),(-?\d+)\)?$/);
        if (!m) throw new Error(`Giro no válido: ${part}`);
        const x = Number(m[1]);
        const y = Number(m[2]);
        if (Math.abs(x) > 6 || Math.abs(y) > 6) throw new Error(`Giro no válido: ${part}`);
        if (x || y) out.push({ x, y });
      }
      if (i < parts.length - 1) out.push('/');
    });
    return out;
  }
  // Can the slice go through: no corner across slots 11|0 or 5|6, on either layer.
  const cutOk = (layer) => layer[11].p !== layer[0].p && layer[5].p !== layer[6].p;
  const sliceable = (s) => cutOk(s.top) && cutOk(s.bot);
  const mod = (k) => ((k % 12) + 12) % 12;
  function turn(s, x, y) {
    const o = clone(s);
    for (let k = 0; k < 12; k++) {
      o.top[mod(k + x)] = s.top[k];
      // The bottom turns clockwise looking at it from below: anticlockwise in these slots, counted from above.
      o.bot[mod(k - y)] = s.bot[k];
    }
    return o;
  }
  function slash(s) {
    if (!sliceable(s)) throw new Error('Ahí no se puede hacer /: una esquina está en medio del corte.');
    const o = clone(s);
    for (let k = 0; k < 6; k++) { o.top[5 - k] = s.bot[k]; o.bot[5 - k] = s.top[k]; }
    o.mid = 1 - s.mid;
    return o;
  }
  function apply(s, alg) {
    return parse(alg).reduce((st, m) => (m === '/' ? slash(st) : turn(st, m.x, m.y)), s);
  }
  // A sequence backwards: (x, y) → (-x, -y) and / stays.
  function invert(alg) {
    return write(parse(alg).reverse().map((m) => (m === '/' ? m : { x: -m.x, y: -m.y })));
  }
  function write(moves) {
    let out = '';
    moves.forEach((m) => {
      if (m === '/') out += out && !out.endsWith(' ') ? ' / ' : '/ ';
      else out += `(${m.x},${m.y})`;
    });
    return out.trim().replace(/\s+/g, ' ');
  }
  const sameLayer = (a, b) => a.every((x, i) => x.p === b[i].p && x.h === b[i].h);
  const isSolved = (s) => s.mid === 0 && sameLayer(s.top, TOP0) && sameLayer(s.bot, BOT0);
  // Solved up to turning a whole layer into place (the last adjustment).
  function solvedUpTo(s) {
    if (s.mid) return false;
    for (let x = 0; x < 12; x++) {
      if (!sameLayer(turn(s, x, 0).top, TOP0)) continue;
      for (let y = 0; y < 12; y++) if (sameLayer(turn(s, 0, y).bot, BOT0)) return { x, y };
    }
    return false;
  }

  // ================= Shapes =================
  // A layer's shape from slot 0: c a corner's first slot (clockwise from above), d its second, e an edge.
  function layerShape(layer) {
    return layer.map((x, k) => {
      if (PIECES[x.p].kind === 'e') return 'e';
      return layer[mod(k + 1)].p === x.p && layer[mod(k - 1)].p !== x.p ? 'c' : 'd';
    }).join('');
  }
  // A square: corner, corner, edge… all the way round, however the layer is turned.
  const isSquare = (layer) => { const sh = layerShape(layer); return [0, 1, 2].some((r) => /^(cde){4}$/.test(sh.slice(r) + sh.slice(0, r))); };
  const cubeShape = (s) => s.mid === 0 && isSquare(s.top) && isSquare(s.bot);
  const countCorners = (layer) => new Set(layer.filter((x) => PIECES[x.p].kind === 'c').map((x) => x.p)).size;

  // ================= Random-move scrambles =================
  // Each step: turn both layers by a random amount (not both zero) so that the slice can go through, then /.
  function scramble(rand = Math.random, slashes = 12) {
    let s = solved();
    const out = [];
    for (let i = 0; i < slashes; i++) {
      const opts = [];
      for (let x = -5; x <= 6; x++) {
        for (let y = -5; y <= 6; y++) {
          if (!x && !y && i) continue;
          if (sliceable(turn(s, x, y))) opts.push([x, y]);
        }
      }
      const [x, y] = opts[Math.floor(rand() * opts.length)];
      s = slash(turn(s, x, y));
      out.push({ x, y }, '/');
    }
    return write(out.filter((m) => m === '/' || m.x || m.y));
  }

  // ================= Drawing =================
  // Each layer seen from its own face, as on the WCA scorecard pictures: the top from above (front at the
  // bottom of the picture) and the bottom from below (front at the top). The slice line dashed.
  function layerSvg(layer, face, ox, k) {
    let body = '';
    const flip = face === 'D';   // seen from below: mirrored left to right, front at the top
    // Slot k's middle angle, clockwise from the back seen from above, as a screen angle.
    const pt = (deg, r) => {
      const a = (deg * Math.PI) / 180;
      // Seen from above: back at the top of the picture, so 0° is up and angles go clockwise.
      let x = Math.sin(a) * r;
      let y = -Math.cos(a) * r;
      if (flip) { y = -y; }
      return [ox + x * k, k * 1.6 + y * k];
    };
    const P = (deg, r) => pt(deg, r).map((v) => v.toFixed(1)).join(',');
    // The slice line passes at 15° from the back: slot k spans [15 + 30k, 45 + 30k].
    let i = 0;
    while (i < 12) {
      const x = layer[i];
      const piece = PIECES[x.p];
      if (piece.kind === 'e') {
        const a0 = 15 + 30 * i;
        const r = 1 / Math.cos(Math.PI / 12);
        body += `<polygon points="${P(0, 0)} ${P(a0, r)} ${P(a0 + 30, r)}" fill="var(--st-${piece.face})"/>`;
        body += `<polygon points="${P(a0, r)} ${P(a0 + 30, r)} ${P(a0 + 30, r * 1.28)} ${P(a0, r * 1.28)}" fill="var(--st-${piece.sides[0]})"/>`;
        i++;
      } else {
        // Both of its slots: i and i + 1 (a corner may start at slot 11 and end at 0).
        const j = layer[mod(i + 1)].p === x.p ? i + 1 : i - 1;
        const first = Math.min(i, j);
        const a0 = 15 + 30 * (first === -1 ? 11 : first);
        const r = 1 / Math.cos(Math.PI / 12);
        const tip = Math.SQRT2;
        const half0 = layer[mod(first)].h;
        const half1 = layer[mod(first + 1)].h;
        body += `<polygon points="${P(0, 0)} ${P(a0, r)} ${P(a0 + 30, tip)} ${P(a0 + 60, r)}" fill="var(--st-${piece.face})"/>`;
        body += `<polygon points="${P(a0, r)} ${P(a0 + 30, tip)} ${P(a0 + 30, tip * 1.22)} ${P(a0, r * 1.28)}" fill="var(--st-${piece.sides[half0]})"/>`;
        body += `<polygon points="${P(a0 + 30, tip)} ${P(a0 + 60, r)} ${P(a0 + 60, r * 1.28)} ${P(a0 + 30, tip * 1.22)}" fill="var(--st-${piece.sides[half1]})"/>`;
        i += first === i ? 2 : 1;
      }
    }
    body += `<line x1="${P(15, 1.85).split(',')[0]}" y1="${P(15, 1.85).split(',')[1]}" x2="${P(195, 1.85).split(',')[0]}" y2="${P(195, 1.85).split(',')[1]}" stroke="var(--accent)" stroke-width="2" stroke-dasharray="5 4"/>`;
    return body;
  }
  function draw(s, opts = {}) {
    const st = s || solved();
    const k = opts.scale || 34;
    const W = k * 3.4;
    let body = layerSvg(st.top, 'U', W / 2, k) + layerSvg(st.bot, 'D', W * 1.5, k);
    // The middle layer: square, or with its right half turned.
    const my = k * 3.45;
    body += `<rect x="${(W / 2 - k * 0.9).toFixed(1)}" y="${my.toFixed(1)}" width="${(k * 0.75).toFixed(1)}" height="${(k * 0.28).toFixed(1)}" rx="3" fill="var(--st-F)"/>`;
    body += `<rect x="${(W / 2 - k * 0.1).toFixed(1)}" y="${my.toFixed(1)}" width="${(k * 1.0).toFixed(1)}" height="${(k * 0.28).toFixed(1)}" rx="3" fill="var(--st-${st.mid ? 'B' : 'F'})" ${st.mid ? 'transform="skewX(-12)" transform-origin="center"' : ''}/>`;
    const Ht = k * 3.9;
    const label = opts.label ? ` role="img" aria-label="${opts.label}"` : ' aria-hidden="true"';
    return `<svg class="pz-sq1" viewBox="0 0 ${(W * 2).toFixed(0)} ${Ht.toFixed(0)}" width="${opts.width || Math.round(W * 2)}"${label}>${body}</svg>`;
  }

  const api = { parse, write, apply, invert, turn, slash, solved, clone, isSolved, solvedUpTo, sliceable, cubeShape, isSquare, layerShape, countCorners, scramble, draw, PIECES, NAMES, TOP0, BOT0 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PzSq1 = api;
})(typeof window !== 'undefined' ? window : globalThis);
