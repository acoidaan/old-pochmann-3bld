// «Aprende a resolver el cubo»: the beginner's method (lbl.js) for someone starting from zero. Seven steps to
// learn with pictures; live help with the smart cube that says what to do next and follows each turn; the
// solution of any scramble, step by step, for a normal cube; a trainer for one step at a time; a timer with
// the time of each step; progress and goals; sync between devices. No ranking and no overlay.
(() => {
  'use strict';
  const M = window.CubeModel;
  const C = window.Cfop;
  const L = window.Lbl;
  if (!M || !C || !L) return;
  const { apply, solved, parseAlg, invertAlg, isSolved, norm, faceOfSticker, toFacelets, STICKERS, FACES, FACE_ORDER } = M;
  const $ = (id) => document.getElementById(id);
  const esc = (txt) => String(txt).replace(/[&<>'"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
  const key = (st) => st.join(',');
  const now = () => performance.now();
  const emit = (name, detail) => document.dispatchEvent(new CustomEvent(`pr:${name}`, { detail }));

  const K = {
    times: 'lbl:times:v1', set: 'lbl:settings:v1', known: 'lbl:known:v1', train: 'lbl:train:v1', view: 'lbl:view:v1',
    scr: 'lbl:scramble:v1', deleted: 'lbl:deleted:v1', synced: 'lbl:synced:v1', sync: 'op3bld:sync:v1', theme: 'op3bld:theme:v1',
  };
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* this visit only */ } };
  const settings = { sound: true, vibrate: true, mode: 'help', trHelp: true, trStep: null, ...load(K.set, {}) };
  const saveSettings = () => save(K.set, settings);
  let times = load(K.times, []);
  let known = load(K.known, {});    // step id → when it was marked (0: unmarked, kept for sync)
  let train = load(K.train, {});    // step id → { n, sum, best, moves, fail, hand }
  const changed = () => emit('changed', null);
  const STEPS = L.STEPS;
  const isKnown = (id) => (known[id] || 0) > 0;

  // ================= Times =================
  const value = (r) => (r.pen === 'dnf' ? Infinity : r.t + (r.pen === 2 ? 2000 : 0));
  function fmt(ms) {
    if (ms == null) return '—';
    if (ms === Infinity) return 'DNF';
    const s = Math.max(0, ms) / 1000;
    if (s < 60) return s.toFixed(2);
    const m = Math.floor(s / 60);
    return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`;
  }
  const fmtRes = (r) => (r.pen === 'dnf' ? 'DNF' : `${fmt(value(r))}${r.pen === 2 ? '+' : ''}`);
  const secs = (ms) => (ms == null || !Number.isFinite(ms) ? '—' : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : fmt(ms));
  function avgOf(list, n) {
    if (list.length < n) return null;
    const xs = list.slice(-n).map(value).sort((a, b) => a - b);
    const mid = xs.slice(1, n - 1);
    if (mid.some((x) => x === Infinity)) return Infinity;
    return mid.reduce((a, b) => a + b, 0) / mid.length;
  }

  // ================= Views =================
  const VIEWS = ['aprender', 'resolver', 'entrenar', 'progreso', 'ajustes'];
  const viewHooks = {};
  let view = 'aprender';
  function showView(name) {
    if (!VIEWS.includes(name)) name = 'aprender';
    const was = view;
    view = name;
    document.querySelectorAll('.view').forEach((el) => { el.hidden = el.dataset.view !== name; });
    const f = document.activeElement;
    if (f && f !== document.body && f.closest('.view') && f.closest('.view').hidden) f.blur();
    document.querySelectorAll('[data-go]').forEach((b) => {
      if (b.dataset.go === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    save(K.view, name);
    emit('view', name);
    try { history.replaceState(null, '', `${location.pathname}${location.search}#${name}`); } catch (e) { /* sandboxed */ }
    if (was !== name) { try { window.scrollTo(0, 0); } catch (e) { /* no layout */ } }
    (viewHooks[name] || []).forEach((fn) => fn());
  }
  const onView = (name, fn) => { (viewHooks[name] = viewHooks[name] || []).push(fn); };
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.go)));
  window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    if (VIEWS.includes(h) && h !== view) showView(h);
    else if (/^paso-[1-7]$/.test(h)) { showView('aprender'); const el = $(h); if (el) el.scrollIntoView(); }
  });
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.h);
    toast.h = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ================= Words =================
  const FEM = { blanco: 'blanca', rojo: 'roja', amarillo: 'amarilla', verde: 'verde', naranja: 'naranja', azul: 'azul' };
  const fem = (c) => FEM[c] || c;
  const andList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);
  // A piece by its colours, white first: «la esquina blanca, roja y verde», «la arista roja y verde».
  const pieceName = (kind, colours) => {
    const list = [...colours].sort((a, b) => (a === 'blanco' ? -1 : b === 'blanco' ? 1 : 0));
    return `la ${kind} ${andList(list.map(fem))}`;
  };
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const vez = (n) => (n === 1 ? 'una vez' : `${n} veces`);
  const algHtml = (alg) => `<span class="fr-alg">${parseAlg(alg).map((m) => `<span>${esc(m.text)}</span>`).join(' ')}</span>`;
  const turnWords = (u) => ({ U: 'a la izquierda (U)', "U'": 'a la derecha (U\')', U2: 'media vuelta (U2)' }[u] || '');

  // ================= Drawings =================
  // The cube in perspective, from above (yellow, front and right) or from below (white, front and right),
  // as held: `g` has the white centre at the bottom. `focus(i)`: the stickers that matter; the rest in grey.
  const R2 = Math.SQRT2;
  const R6 = Math.sqrt(6);
  const CAMS = {
    top: { X: [1 / R2, 0, -1 / R2], Y: [-1 / R6, 2 / R6, -1 / R6], d: [1, 1, 1] },
    bottom: { X: [1 / R2, 0, -1 / R2], Y: [1 / R6, 2 / R6, 1 / R6], d: [1, -1, 1] },
  };
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  function iso(g, o = {}) {
    const cam = CAMS[o.from || 'top'];
    const S = 30;
    const pt = (p) => [dot3(p, cam.X) * S, -dot3(p, cam.Y) * S];
    const poly = (ps) => ps.map((p) => pt(p).map((v) => v.toFixed(1)).join(',')).join(' ');
    const axes = (n) => [0, 1, 2].filter((a) => n[a] === 0);
    const unit = (a, s) => [0, 1, 2].map((k) => (k === a ? s : 0));
    const add = (...vs) => [0, 1, 2].map((k) => vs.reduce((t, v) => t + v[k], 0));
    let out = '';
    FACE_ORDER.forEach((f) => {
      const n = FACES[f].n;
      if (dot3(n, cam.d) <= 0) return;
      const [a, b] = axes(n);
      const c = n.map((x) => x * 1.5);
      out += `<polygon points="${poly([add(c, unit(a, 1.52), unit(b, 1.52)), add(c, unit(a, 1.52), unit(b, -1.52)), add(c, unit(a, -1.52), unit(b, -1.52)), add(c, unit(a, -1.52), unit(b, 1.52))])}" fill="var(--plastic)" stroke="var(--plastic)" stroke-width="3" stroke-linejoin="round"/>`;
    });
    STICKERS.forEach((s, i) => {
      const n = s.nrm;
      if (dot3(n, cam.d) <= 0) return;
      const [a, b] = axes(n);
      const ax = [0, 1, 2].find((k) => n[k] !== 0);
      const c = s.pos.map((v, k) => (k === ax ? 1.5 * n[k] : v));
      const r = 0.43;
      const fill = o.focus && !o.focus(i) ? 'var(--fr-blank)' : `var(--st-${faceOfSticker(g[i])})`;
      out += `<polygon points="${poly([add(c, unit(a, r), unit(b, r)), add(c, unit(a, r), unit(b, -r)), add(c, unit(a, -r), unit(b, -r)), add(c, unit(a, -r), unit(b, r))])}" fill="${fill}" stroke="${fill}" stroke-width="2.4" stroke-linejoin="round"/>`;
    });
    const w = 3 * S * R2 * 0.5 * 2 + 10;
    const h = 3 * S * (2 / R6) * 2 + 10;
    return `<svg class="pr-iso${o.size ? ` ${o.size}` : ''}" viewBox="${(-w / 2).toFixed(1)} ${(-h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" role="img" aria-label="${esc(o.label || 'El cubo')}">${out}</svg>`;
  }
  // The top layer from above with the side stickers around (as J Perm draws it): `mode` 'oll' paints only the
  // yellow; 'pll' every colour, with arrows from each piece to its place.
  const SIDES = { back: [47, 46, 45], left: [36, 37, 38], right: [11, 10, 9], front: [18, 19, 20] };
  // `edgesOnly`: the corners in grey too (the yellow cross only looks at the edges).
  const CORNER_BITS = new Set([0, 2, 6, 8, 47, 45, 36, 38, 11, 9, 18, 20]);
  function topView(g, o = {}) {
    const top = faceOfSticker(g[4]);
    const fill = (i) => {
      if (o.edgesOnly && CORNER_BITS.has(i)) return 'var(--fr-blank)';
      const f = faceOfSticker(g[i]);
      if (o.mode === 'oll') return f === top ? `var(--st-${top})` : 'var(--fr-blank)';
      return `var(--st-${f})`;
    };
    const S = 26; const gap = 3; const side = 9; const pad = 4;
    const off = pad + side + gap;
    const size = off * 2 + S * 3 + gap * 2;
    let out = `<svg class="fr-top" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(o.label || 'La capa de arriba, vista desde arriba')}">`;
    out += `<rect x="${pad + side - 1}" y="${pad + side - 1}" width="${S * 3 + gap * 4 + 2}" height="${S * 3 + gap * 4 + 2}" rx="5" fill="var(--plastic)"/>`;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out += `<rect x="${off + c * (S + gap)}" y="${off + r * (S + gap)}" width="${S}" height="${S}" rx="3.5" fill="${fill(r * 3 + c)}"/>`;
    const strip = (ids, x0, y0, horiz) => ids.forEach((id, k) => {
      const x = horiz ? off + k * (S + gap) : x0;
      const y = horiz ? y0 : off + k * (S + gap);
      out += `<rect x="${x}" y="${y}" width="${horiz ? S : side}" height="${horiz ? side : S}" rx="2.5" fill="${fill(id)}"/>`;
    });
    strip(SIDES.back, 0, pad, true);
    strip(SIDES.front, 0, size - pad - side, true);
    strip(SIDES.left, pad, 0, false);
    strip(SIDES.right, size - pad - side, 0, false);
    if (o.arrows) out += arrows(g, off, S, gap);
    return `${out}</svg>`;
  }
  function arrows(g, off, S, gap) {
    const centreColour = (i) => faceOfSticker(g[Math.floor(i / 9) * 9 + 4]);
    const pieceAt = {};
    M.CUBIES.forEach((p) => { const u = p.find((i) => i < 9); if (u != null) pieceAt[u] = p; });
    const homeOf = (cell) => {
      const p = pieceAt[cell];
      const colours = p.filter((i) => i >= 9).map((i) => faceOfSticker(g[i])).sort().join('');
      return Object.keys(pieceAt).map(Number).find((c) => pieceAt[c].length === p.length
        && pieceAt[c].filter((i) => i >= 9).map(centreColour).sort().join('') === colours);
    };
    const moves = [];
    Object.keys(pieceAt).map(Number).filter((c) => c !== 4).forEach((c) => { const h = homeOf(c); if (h != null && h !== c) moves.push([c, h]); });
    const ctr = (c) => [off + (c % 3) * (S + gap) + S / 2, off + Math.floor(c / 3) * (S + gap) + S / 2];
    let out = '';
    const seen = new Set();
    moves.forEach(([a, b]) => {
      if (seen.has(`${b}>${a}`)) return;
      const swap = moves.some(([x, y]) => x === b && y === a);
      seen.add(`${a}>${b}`);
      const [x1, y1] = ctr(a); const [x2, y2] = ctr(b);
      const len = Math.hypot(x2 - x1, y2 - y1); const ux = (x2 - x1) / len; const uy = (y2 - y1) / len;
      const sx = x1 + ux * 6; const sy = y1 + uy * 6; const ex = x2 - ux * 6; const ey = y2 - uy * 6;
      const head = (x, y, dx, dy) => `<path d="M${x} ${y} l${(-dx * 7 - dy * 4).toFixed(1)} ${(-dy * 7 + dx * 4).toFixed(1)} M${x} ${y} l${(-dx * 7 + dy * 4).toFixed(1)} ${(-dy * 7 - dx * 4).toFixed(1)}"/>`;
      out += `<g class="fr-arrow"><path d="M${sx.toFixed(1)} ${sy.toFixed(1)} L${ex.toFixed(1)} ${ey.toFixed(1)}"/>${head(ex.toFixed(1), ey.toFixed(1), ux, uy)}${swap ? head(sx.toFixed(1), sy.toFixed(1), -ux, -uy) : ''}</g>`;
    });
    return out;
  }

  // Which stickers matter in each step (the rest in grey), for a cube held with white down.
  const BASE = L.canon(solved());    // solved, as held: yellow up, green in front
  const sideOf = (i) => STICKERS[i].pos;
  const layer = (i) => sideOf(i)[1];   // -1 bottom, 0 middle, 1 top
  const isCentre = (i) => i % 9 === 4;

  // ================= What to do, in words =================
  // A plan from lbl.js as a title, numbered things to do, the turns, and a picture of how to hold the cube
  // just before the turns. `pos`: how many of the turns are done (-1: none shown as done).
  // How the cube has to be just before the turns: held with that side in front and the top turned.
  const heldBefore = (p) => {
    const h = p.view ? apply(p.from, p.view) : p.from;
    return p.pre && p.kind !== 'daisy' && p.kind !== 'auf' ? apply(h, p.pre) : h;
  };
  function planPicture(p, size) {
    const h = heldBefore(p);
    const z = size || '';
    switch (p.kind) {
      case 'daisy': return iso(h, { size: z, focus: (i) => isCentre(i) || L.isWhite(h, i), label: 'Las aristas blancas y el centro amarillo' });
      case 'down': return iso(h, { size: z, focus: (i) => isCentre(i) || M.PIECE_OF[i].some((j) => L.isWhite(h, j)) && M.PIECE_OF[i].length === 2, label: 'Los pétalos y los centros' });
      case 'corner': case 'corner-twist': case 'corner-out':
        return iso(h, { size: z, focus: (i) => isCentre(i) || layer(i) === -1 || M.PIECE_OF[i].includes(8) || M.PIECE_OF[i].includes(29), label: 'La esquina delante a la derecha' });
      case 'middle': case 'middle-out':
        return iso(h, { size: z, focus: (i) => isCentre(i) || layer(i) <= 0 || M.PIECE_OF[i].includes(7), label: 'La arista delante, encima de su centro' });
      case 'ycross': return topView(h, { mode: 'oll', edgesOnly: true, label: 'Las aristas de arriba, vistas desde arriba' });
      case 'yface': return topView(h, { mode: 'oll', label: 'La cara de arriba, vista desde arriba' });
      case 'ycorners': case 'yedges': case 'auf': return topView(h, { mode: 'pll', arrows: p.kind !== 'ycorners', label: 'La capa de arriba, vista desde arriba' });
      default: return iso(h, { size: z });
    }
  }
  const SHAPE = { dot: 'solo el punto del centro', l: 'una L (dos aristas juntas y el centro)', line: 'una línea' };
  const SHAPE_NEXT = { dot: 'la L', l: 'la línea', line: 'la cruz' };
  function planWords(p) {
    const s = p.sides || {};
    const front = s.front;
    const hold = p.view ? `Gira el cubo entero para tener el <b>${esc(front)}</b> delante (el amarillo sigue arriba).` : `Con el <b>${esc(front)}</b> delante y el amarillo arriba.`;
    const pre = p.pre ? `Gira la capa de arriba ${turnWords(p.pre)}` : '';
    switch (p.kind) {
      case 'daisy': return {
        title: `La margarita: ${p.petals} de 4 pétalos`,
        lines: [`Sube ${p.colour ? `<b>${esc(pieceName('arista', ['blanco', p.colour]))}</b>` : 'otra arista blanca'} junto al centro amarillo, con el blanco hacia arriba. Así${p.petals ? ', sin tirar los pétalos que ya tienes' : ''}:`],
        note: 'Gira las caras con el amarillo arriba y el verde delante. Si el hueco de arriba está ocupado, primero se gira la capa de arriba.',
      };
      case 'down': return {
        title: `Bajar los pétalos: ${p.cross} de 4 en la cruz`,
        lines: [
          p.pre ? `${pre} hasta que el pétalo <b>${esc(p.colour)}</b> quede encima del centro ${esc(p.colour)}.` : `El pétalo <b>${esc(p.colour)}</b> ya está encima del centro ${esc(p.colour)}.`,
          `Pon el <b>${esc(p.colour)}</b> delante y gira esa cara dos veces: <b>F2</b>. El pétalo baja a la cruz.`,
        ],
      };
      case 'corner': {
        const look = { right: 'a la derecha', up: 'hacia arriba', front: 'hacia ti' }[p.looks];
        return {
          title: `Esquinas blancas: ${p.corners} de 4`,
          lines: [
            hold,
            p.pre ? `${pre} hasta que <b>${esc(pieceName('esquina', p.piece))}</b> quede arriba, delante a la derecha: justo encima de su sitio.` : `<b>${esc(cap(pieceName('esquina', p.piece)))}</b> ya está arriba, delante a la derecha: justo encima de su sitio.`,
            `Su blanco mira ${look}: haz <b>R U R' U'</b> ${vez(p.reps)}.`,
          ],
        };
      }
      case 'corner-twist': return {
        title: `Esquinas blancas: ${p.corners} de 4`,
        lines: [hold, `<b>${esc(cap(pieceName('esquina', p.piece)))}</b> está en su sitio (abajo, delante a la derecha) pero girada.`, `Haz <b>R U R' U'</b> ${vez(p.reps)} y queda bien.`],
      };
      case 'corner-out': return {
        title: `Esquinas blancas: ${p.corners} de 4`,
        lines: [hold, `<b>${esc(cap(pieceName('esquina', p.piece)))}</b> está abajo, delante a la derecha, pero ese no es su sitio.`, 'Haz <b>R U R\' U\'</b> una vez para subirla arriba. Luego ya la colocas en el suyo.'],
      };
      case 'middle': return {
        title: `Segunda capa: ${p.middle} de 4`,
        lines: [
          hold,
          p.pre ? `${pre} hasta que <b>${esc(pieceName('arista', p.piece))}</b> quede delante, con su ${esc(p.piece[0])} encima del centro ${esc(p.piece[0])} (forma una T).` : `<b>${esc(cap(pieceName('arista', p.piece)))}</b> está delante, con su ${esc(p.piece[0])} encima del centro ${esc(p.piece[0])} (forma una T).`,
          `Su color de arriba, el ${esc(p.piece[1])}, es el del centro de la <b>${p.goes === 'right' ? 'derecha' : 'izquierda'}</b>: haz el algoritmo de la ${p.goes === 'right' ? 'derecha' : 'izquierda'}.`,
        ],
      };
      case 'middle-out': return {
        title: `Segunda capa: ${p.middle} de 4`,
        lines: [hold, `Arriba solo quedan aristas con amarillo, así que <b>${esc(pieceName('arista', p.piece))}</b> está metida delante a la derecha pero mal (al revés o en otro sitio).`, 'Haz el algoritmo de la derecha para sacarla arriba. Luego ya la colocas.'],
      };
      case 'ycross': return {
        title: 'La cruz amarilla',
        lines: [
          `Arriba tienes ${SHAPE[p.shape]}.`,
          p.shape === 'dot' ? 'Hazlo desde cualquier lado.' : p.shape === 'l' ? `${hold.replace('.', ',')} así la L queda detrás y a la izquierda.` : `${hold.replace('.', ',')} así la línea queda de izquierda a derecha.`,
          `Haz <b>F R U R' U' F'</b>: saldrá ${SHAPE_NEXT[p.shape]}.`,
        ],
      };
      case 'yface': return {
        title: 'La cara amarilla',
        lines: [
          p.count === 1 ? 'Hay una esquina con el amarillo arriba.' : p.count === 0 ? 'Ninguna esquina tiene el amarillo arriba.' : 'Hay dos esquinas con el amarillo arriba.',
          `${hold.replace('.', ',')} ${p.count === 1 ? 'esa esquina queda delante a la izquierda.' : p.count === 0 ? 'la esquina de delante a la izquierda tiene el amarillo mirando a la izquierda.' : 'la esquina de delante a la izquierda tiene el amarillo mirando hacia ti.'}`,
          'Haz <b>R U R\' U R U2 R\'</b> y vuelve a mirar (como mucho, 3 veces).',
        ],
      };
      case 'ycorners': return {
        title: 'Las esquinas amarillas',
        lines: p.lights
          ? ['Un lado tiene sus dos esquinas de arriba del mismo color: son los <b>faros</b>.', `${hold.replace('.', ',')} los faros quedan detrás.`, 'Haz el algoritmo una vez.']
          : ['Ningún lado tiene sus dos esquinas iguales.', 'Haz el algoritmo una vez, desde cualquier lado: aparecerán unos faros.'],
      };
      case 'yedges': return {
        title: 'Las aristas amarillas',
        lines: p.bar
          ? ['Un lado ya tiene la capa de arriba entera de un color.', `${hold.replace('.', ',')} ese lado queda detrás.`, 'Haz el algoritmo. Si no queda resuelto, hazlo otra vez.']
          : ['Ningún lado tiene la capa de arriba entera de un color.', 'Haz el algoritmo una vez, desde cualquier lado: luego ya habrá uno.'],
      };
      case 'auf': return { title: '¡Último giro!', lines: [`Gira la capa de arriba ${turnWords(p.pre)} y está resuelto.`] };
      default: return { title: '', lines: [] };
    }
  }
  // The turns as chips, with how far along; an algorithm repeated shows once, with how many times.
  function chipsHtml(p, pos) {
    const pre = parseAlg(p.pre || '').map((m) => m.text);
    const chip = (m, j) => `<span class="sm ${pos < 0 ? '' : j < pos ? 'done' : j === pos ? 'next' : ''}${j < pre.length ? ' pre' : ''}">${esc(m)}</span>`;
    const sep = pre.length ? ' <span class="pr-then" aria-hidden="true">→</span> ' : '';
    if (p.base && p.reps > 1) {
      const base = parseAlg(p.base).map((m) => m.text);
      const inAlg = pos - pre.length;
      const rep = inAlg < 0 ? 0 : Math.min(p.reps - 1, Math.floor(inAlg / base.length));
      const within = inAlg < 0 ? -1 : inAlg - rep * base.length;
      const bc = base.map((m, j) => `<span class="sm ${pos < 0 || inAlg < 0 ? '' : j < within ? 'done' : j === within ? 'next' : ''}">${esc(m)}</span>`).join(' ');
      return `<p class="pr-moves">${pre.map(chip).join(' ')}${sep}<span class="pr-rep">${bc} <span class="pr-times">×${p.reps}${pos >= 0 && inAlg >= 0 ? ` · vas por la ${rep + 1}.ª` : ''}</span></span></p>`;
    }
    const chips = p.hand.map(chip);
    return `<p class="pr-moves">${chips.slice(0, pre.length).join(' ')}${sep}${chips.slice(pre.length).join(' ')}</p>`;
  }
  function planHtml(p, pos = -1, opts = {}) {
    if (p.kind === 'solved') return '<p class="pr-done-big">¡Resuelto!</p>';
    const w = planWords(p);
    const pic = planPicture(p, opts.small ? 'small' : '');
    const caption = p.kind === 'daisy' || p.kind === 'auf' ? 'Así está ahora'
      : p.kind === 'down' ? 'Así, justo antes de F2'
        : ['ycross', 'yface', 'ycorners', 'yedges'].includes(p.kind) ? 'Así, visto desde arriba, justo antes del algoritmo' : 'Así, justo antes del algoritmo';
    return `<div class="pr-plan">
      <div class="pr-plan-pic">${pic}<span>${caption}</span></div>
      <div class="pr-plan-text">
        <span class="pr-plan-title">${esc(w.title)}</span>
        <ol class="pr-do">${w.lines.map((x) => `<li>${x}</li>`).join('')}</ol>
        ${p.hand.length ? chipsHtml(p, pos) : ''}
        ${w.note ? `<p class="pr-note">${esc(w.note)}</p>` : ''}
        ${opts.note ? `<p class="pr-note">${esc(opts.note)}</p>` : ''}
      </div>
    </div>`;
  }

  // ================= Aprender: the method =================
  // Pictures of each step, made from a solved cube held with yellow up.
  const fromBase = (alg) => (alg ? apply(BASE, alg) : BASE);
  const llState = (id, test) => {
    const g0 = C.caseState(C.caseById(id));
    for (const u of L.AUF) { const g = u ? apply(g0, u) : g0; if (test(g)) return g; }
    return g0;
  };
  const Y = (g, i) => L.isYellow(g, i);
  // A cube at the start of a step (so the steps before are done), always the same one.
  const DEMO = "R2 D' B2 U F2 L2 D2 F' R U2 B' L' D F2 R2 U' B L2 F D2";
  const demoAt = (stage) => L.canon(L.stateAt(stage, DEMO) || solved());
  const lights = (g) => L.lights(g);
  const STEP_INFO = {
    cross: {
      goal: () => iso(demoAt(1), { from: 'bottom', size: 'big', focus: (i) => isCentre(i) || (M.PIECE_OF[i].length === 2 && layer(i) === -1), label: 'La cruz blanca hecha, vista desde abajo' }),
      goalText: 'Las cuatro aristas blancas abajo, en cruz, y cada una con su otro color igual que el centro de su lado.',
      how: [
        '<b>La margarita.</b> Con el amarillo arriba, sube las cuatro aristas blancas alrededor del centro amarillo, con el blanco mirando hacia arriba: son los pétalos.',
        'Si el hueco de arriba donde quieres subir una arista ya tiene un pétalo, gira antes la capa de arriba (U) para dejarlo libre: así no tiras ninguno.',
        '<b>Bájalos.</b> Gira la capa de arriba hasta que el otro color de un pétalo coincida con el centro de su lado (rojo encima del centro rojo, por ejemplo).',
        'Pon ese lado delante y gíralo dos veces (<b>F2</b>): el pétalo baja a su sitio. Repite con los cuatro.',
      ],
      algs: [],
      cases: () => [
        { pic: iso(fromBase('F2 R2 B2 L2 U'), { focus: (i) => isCentre(i) || L.isWhite(fromBase('F2 R2 B2 L2 U'), i) }), title: 'La margarita', text: 'Las 4 aristas blancas arriba, con el blanco hacia arriba.' },
        { pic: iso(fromBase('F2 R2 B2 L2'), { focus: (i) => isCentre(i) || (M.PIECE_OF[i].length === 2 && layer(i) === 1) }), title: 'Pétalo encima de su centro', text: 'El verde del pétalo encima del centro verde: gira <b>F2</b>.' },
        { pic: iso(fromBase('R2 B2 L2'), { focus: (i) => isCentre(i) || (M.PIECE_OF[i].length === 2 && layer(i) === 1) || M.PIECE_OF[i].includes(25) }), title: 'Uno abajo', text: 'El verde ya está en la cruz. Ahora, el siguiente pétalo.' },
      ],
      tip: 'No hace falta aprender giros de memoria en este paso: piensa adónde va cada arista. Al principio cuesta; en pocos días sale solo.',
    },
    corners: {
      goal: () => iso(demoAt(2), { from: 'bottom', size: 'big', focus: (i) => isCentre(i) || layer(i) === -1, label: 'La cara blanca entera, vista desde abajo' }),
      goalText: 'Toda la cara de abajo blanca, y en cada lado la fila de abajo de su color.',
      how: [
        'Busca arriba una esquina con blanco. Mira sus otros dos colores (por ejemplo rojo y verde): su sitio está abajo, entre el centro rojo y el verde.',
        'Gira la capa de arriba hasta que la esquina quede justo encima de su sitio, y gira el cubo entero para tenerla <b>delante a la derecha</b>.',
        'Repite <b>R U R\' U\'</b> hasta que baje bien: <b>1 vez</b> si su blanco mira a la derecha, <b>3</b> si mira hacia arriba y <b>5</b> si mira hacia ti.',
        'Si una esquina blanca está abajo pero en un sitio que no es el suyo, o girada, ponla delante a la derecha y haz R U R\' U\' una vez: sube arriba y ya la colocas.',
      ],
      algs: [{ name: 'Para bajar una esquina', alg: "R U R' U'" }],
      cases: () => [1, 3, 5].map((n) => {
        const g = fromBase(invertAlg(Array.from({ length: n }, () => "R U R' U'").join(' ')));
        const look = n === 1 ? 'a la derecha' : n === 3 ? 'hacia arriba' : 'hacia ti';
        return { pic: iso(g, { focus: (i) => isCentre(i) || layer(i) === -1 || M.PIECE_OF[i].includes(8) }), title: `Blanco ${look}`, text: `R U R' U' <b>${vez(n)}</b>.` };
      }),
      tip: '«R U R\' U\'» es el movimiento más útil del cubo: derecha arriba, capa de arriba a la izquierda, derecha abajo, capa de arriba a la derecha. Con práctica sale casi sin pensar.',
    },
    middle: {
      goal: () => iso(demoAt(3), { size: 'big', focus: (i) => isCentre(i) || layer(i) <= 0, label: 'Las dos primeras capas hechas' }),
      goalText: 'Las dos capas de abajo enteras: solo falta la de arriba.',
      how: [
        'Busca arriba una arista <b>sin amarillo</b>.',
        'Gira la capa de arriba hasta que su color de delante coincida con el centro de delante: forma una <b>T</b>. Ese lado es el de delante.',
        'Mira su color de arriba: si es el del centro de la <b>derecha</b>, haz el algoritmo de la derecha; si es el de la <b>izquierda</b>, el de la izquierda.',
        'Si arriba solo hay aristas con amarillo pero falta alguna, es que está metida al revés o en otro sitio: ponla delante a la derecha y haz el de la derecha para sacarla.',
      ],
      algs: [{ name: 'A la derecha', alg: L.ALG.right }, { name: 'A la izquierda', alg: L.ALG.left }],
      cases: () => [['right', 'A la derecha', 'derecha'], ['left', 'A la izquierda', 'izquierda']].map(([goes, title, side]) => {
        const g = fromBase(invertAlg(L.ALG[goes]));
        return { pic: iso(g, { focus: (i) => isCentre(i) || layer(i) <= 0 || M.PIECE_OF[i].includes(7) }), title, text: `La T delante; su color de arriba es el del centro de la ${side}.` };
      }),
      tip: 'Los dos algoritmos son el mismo pero en espejo: la primera mitad aparta la arista y la segunda vuelve a poner la esquina en su sitio.',
    },
    ycross: {
      goal: () => topView(llState('sune', () => true), { mode: 'oll', edgesOnly: true, label: 'La cruz amarilla hecha' }),
      goalText: 'Una cruz amarilla arriba. Los colores de los lados aún no importan.',
      how: [
        'Mira solo las aristas de arriba: puede haber solo el punto del centro, una L o una línea.',
        '<b>L:</b> ponla detrás y a la izquierda. <b>Línea:</b> ponla de izquierda a derecha. <b>Punto:</b> da igual.',
        'Haz el algoritmo. Del punto sale la L, de la L la línea y de la línea la cruz.',
      ],
      algs: [{ name: 'Cruz amarilla', alg: L.ALG.ycross }],
      cases: () => [
        { pic: topView(llState('dot', () => true), { mode: 'oll', edgesOnly: true }), title: 'Punto', text: 'Hazlo desde cualquier lado.' },
        { pic: topView(llState('l', (g) => Y(g, 1) && Y(g, 3)), { mode: 'oll', edgesOnly: true }), title: 'L', text: 'Detrás y a la izquierda.' },
        { pic: topView(llState('i', (g) => Y(g, 3) && Y(g, 5)), { mode: 'oll', edgesOnly: true }), title: 'Línea', text: 'De izquierda a derecha.' },
      ],
      tip: 'F es la cara de delante: F gira como las agujas del reloj mirándola de frente.',
    },
    yface: {
      goal: () => topView(llState('head', () => true), { mode: 'oll', label: 'La cara amarilla hecha' }),
      goalText: 'Toda la cara de arriba amarilla.',
      how: [
        'Cuenta las esquinas que tienen el amarillo arriba.',
        '<b>Una:</b> ponla delante a la izquierda. <b>Ninguna:</b> pon delante a la izquierda una con el amarillo mirando a la izquierda. <b>Dos:</b> pon delante a la izquierda una con el amarillo mirando hacia ti.',
        'Haz el algoritmo y vuelve a contar. Como mucho son 3 veces.',
      ],
      algs: [{ name: 'Cara amarilla (Sune)', alg: L.ALG.yface }],
      cases: () => [
        { pic: topView(llState('sune', (g) => Y(g, 6)), { mode: 'oll' }), title: 'Una', text: 'Delante a la izquierda.' },
        { pic: topView(llState('pi', (g) => Y(g, 38)), { mode: 'oll' }), title: 'Ninguna', text: 'La de delante a la izquierda, con el amarillo a la izquierda.' },
        { pic: topView(llState('u', (g) => Y(g, 18)), { mode: 'oll' }), title: 'Dos', text: 'La de delante a la izquierda, con el amarillo hacia ti.' },
      ],
      tip: 'Mientras lo haces, las capas de abajo se deshacen un momento: al terminar el algoritmo vuelven solas.',
    },
    ycorners: {
      goal: () => topView(llState('ua', () => true), { mode: 'pll', label: 'Las esquinas de arriba en su sitio' }),
      goalText: 'Las cuatro esquinas de arriba en su sitio: en cada lado, las dos esquinas de arriba del mismo color.',
      how: [
        'Busca un lado con sus dos esquinas de arriba del mismo color: son los <b>faros</b>.',
        'Ponlos <b>detrás</b> y haz el algoritmo una vez.',
        'Si ningún lado tiene faros, haz el algoritmo una vez desde cualquier lado: aparecerán, y entonces lo repites con ellos detrás.',
        'Al final, gira la capa de arriba hasta que las esquinas coincidan con sus centros.',
      ],
      algs: [{ name: 'Esquinas amarillas', alg: L.ALG.ycorners }],
      cases: () => [
        { pic: topView(llState('head', (g) => lights(g).includes('back')), { mode: 'pll' }), title: 'Faros', text: 'Ponlos detrás.' },
        { pic: topView(llState('diag', () => true), { mode: 'pll' }), title: 'Sin faros', text: 'Desde cualquier lado, y otra vez.' },
      ],
      tip: 'B es la cara de detrás: B2 es media vuelta de esa cara. Se hace bien girando el cubo un poco hacia ti.',
    },
    yedges: {
      goal: () => iso(BASE, { size: 'big', label: 'El cubo resuelto' }),
      goalText: 'El cubo resuelto.',
      how: [
        'Busca un lado con la capa de arriba entera de un color (tres pegatinas iguales).',
        'Ponlo <b>detrás</b> y haz el algoritmo. Si no queda resuelto, hazlo otra vez.',
        'Si ningún lado está entero, haz el algoritmo una vez desde cualquier lado: luego ya habrá uno.',
        'Al final, gira la capa de arriba si hace falta.',
      ],
      algs: [{ name: 'Aristas amarillas', alg: L.ALG.yedges }],
      cases: () => [
        { pic: topView(llState('ua', (g) => L.bars(g).includes('back')), { mode: 'pll', arrows: true }), title: 'Un lado entero', text: 'Detrás, y el algoritmo.' },
        { pic: topView(llState('z', () => true), { mode: 'pll', arrows: true }), title: 'Ninguno', text: 'Desde cualquier lado, y otra vez.' },
      ],
      tip: 'Este último paso cambia de sitio tres aristas. Si giran hacia el otro lado, al repetirlo se arregla.',
    },
  };

  const nextToLearn = () => STEPS.find((s) => !isKnown(s.id)) || null;
  function renderPath() {
    const nx = nextToLearn();
    $('path').innerHTML = STEPS.map((s) => `<li class="${isKnown(s.id) ? 'known' : nx && nx.id === s.id ? 'next' : ''}"><a href="#paso-${s.n}"><span class="pr-n">${isKnown(s.id) ? '✓' : s.n}</span>${esc(s.short)}</a></li>`).join('');
    const n = STEPS.filter((s) => isKnown(s.id)).length;
    $('knownCount').textContent = n === 7 ? '¡Te los sabes todos!' : `Te sabes ${n} de 7`;
  }
  function renderBasics() {
    const turn = (m) => `<figure class="pr-fig">${iso(fromBase(m), { size: 'small', label: `El cubo después de ${m}` })}<figcaption><b>${esc(m)}</b></figcaption></figure>`;
    $('basicsBody').innerHTML = `<div class="pr-body">
      <p><b>Las piezas.</b> Los <b>centros</b> no se mueven entre sí: cada cara es del color de su centro. Las <b>aristas</b> tienen dos colores y las <b>esquinas</b>, tres. Una pieza va siempre al sitio que está entre los centros de sus colores.</p>
      <div class="pr-figs">
        <figure class="pr-fig">${iso(BASE, { size: 'small', focus: isCentre, label: 'Los centros' })}<figcaption>Centros</figcaption></figure>
        <figure class="pr-fig">${iso(BASE, { size: 'small', focus: (i) => M.PIECE_OF[i].length === 2, label: 'Las aristas' })}<figcaption>Aristas</figcaption></figure>
        <figure class="pr-fig">${iso(BASE, { size: 'small', focus: (i) => M.PIECE_OF[i].length === 3, label: 'Las esquinas' })}<figcaption>Esquinas</figcaption></figure>
      </div>
      <p><b>Cómo se sujeta.</b> Todo el método se hace con el <b>amarillo arriba</b> y el <b>blanco abajo</b>. «Delante» es la cara que te mira. Cuando una explicación dice «pon el rojo delante», gira el cubo entero (sin girar capas) hasta que el centro rojo te mire.</p>
      <p><b>Cómo se leen los giros.</b> Cada letra es una cara: <b>R</b> derecha, <b>L</b> izquierda, <b>U</b> arriba, <b>D</b> abajo, <b>F</b> delante y <b>B</b> detrás. La letra sola es un cuarto de vuelta como las agujas del reloj, mirando esa cara de frente; con <b>'</b> (R') es al revés, y con <b>2</b> (R2), media vuelta.</p>
      <div class="pr-turns">${['R', "R'", 'U', "U'", 'F', 'F2', 'L', 'D'].map(turn).join('')}</div>
      <p class="hint">Cada dibujo es el cubo resuelto después de ese giro, con el amarillo arriba y el verde delante.</p>
      <p><b>Cómo se mezcla.</b> Las mezclas de la app se hacen con el <b>blanco arriba</b> y el <b>verde delante</b> (como el cubo nuevo). Después le das la vuelta para resolverlo con el amarillo arriba.</p>
    </div>`;
  }
  function renderSteps() {
    $('steps').innerHTML = STEPS.map((s) => {
      const info = STEP_INFO[s.id];
      const tr = train[s.id];
      const cases = info.cases();
      return `<section class="panel pr-step${isKnown(s.id) ? ' known' : ''}" id="paso-${s.n}" aria-labelledby="hStep${s.n}">
        <div class="pr-step-head"><span class="pr-badge" aria-hidden="true">${isKnown(s.id) ? '✓' : s.n}</span><h2 id="hStep${s.n}">Paso ${s.n}. ${esc(s.name)}</h2></div>
        <div class="pr-step-top">
          <div class="pr-goal">${info.goal()}<span>El objetivo</span></div>
          <div class="pr-step-text">
            <p><b>Objetivo:</b> ${esc(info.goalText)}</p>
            <ol class="pr-howto">${info.how.map((x) => `<li>${x}</li>`).join('')}</ol>
          </div>
        </div>
        ${info.algs.map((a) => `<div class="pr-algbox"><span class="pr-alg-name">${esc(a.name)}</span>${algHtml(a.alg)}</div>`).join('')}
        <div class="pr-cases">${cases.map((c) => `<figure class="pr-case">${c.pic}<figcaption><b>${esc(c.title)}</b><span>${c.text}</span></figcaption></figure>`).join('')}</div>
        <p class="pr-tip">${esc(info.tip)}</p>
        <div class="pr-step-acts">
          <button class="btn primary" type="button" data-try="${s.id}">Practicar este paso</button>
          <label class="check"><input type="checkbox" data-known="${s.id}"${isKnown(s.id) ? ' checked' : ''}> Ya me lo sé</label>
          ${tr && tr.n ? `<span class="hint">Practicado ${vez(tr.n)}${tr.best != null ? ` · tu mejor: ${secs(tr.best)}` : ''}</span>` : ''}
        </div>
      </section>`;
    }).join('');
  }
  $('steps').addEventListener('change', (ev) => {
    const id = ev.target.dataset.known;
    if (!id) return;
    known[id] = ev.target.checked ? Date.now() : 0;
    known[`${id}@`] = Date.now();
    save(K.known, known);
    changed();
    renderPath();
    const card = ev.target.closest('.pr-step');
    card.classList.toggle('known', ev.target.checked);
    card.querySelector('.pr-badge').textContent = ev.target.checked ? '✓' : STEPS.find((s) => s.id === id).n;
    if (ev.target.checked) toast(`«${STEPS.find((s) => s.id === id).name}»: ¡aprendido!`);
  });
  $('steps').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-try]');
    if (!b) return;
    trChoose(STEPS.findIndex((s) => s.id === b.dataset.try));
    showView('entrenar');
  });
  onView('aprender', () => { renderPath(); });

  // ================= Following a known sequence of turns =================
  // The cube's state after each turn (and part way through half turns, whichever face comes first), in the
  // cube's own frame; the cube is where its state matches.
  function partialKeys(before, after) {
    const path = window.SmartCube ? window.SmartCube.facePath(before, after) : null;
    if (!path || !path.length) return [];
    const per = {};
    path.forEach((q) => { const f = q[0]; per[f] = (per[f] || 0) + (q.length > 1 ? 3 : 1); });
    const faces = Object.keys(per);
    const options = faces.map((f) => { const t = per[f] % 4; return t === 2 ? ['', f, `${f}'`, `${f}2`] : ['', t === 1 ? f : `${f}'`]; });
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
  const AXIS = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };
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
      // Two turns on opposite faces (R L', U D2) can come in either order, or at once.
      const p = moves[i - 1];
      if (prev && p[0] !== m[0] && AXIS[m[0]] != null && AXIS[m[0]] === AXIS[p[0]]) partialKeys(prev, after).forEach((k) => add(half, k, i - 1));
      add(at, key(after), i + 1);
      prev = before;
    });
    return { moves, n: moves.length, at, half, pos: 0, halfway: false, off: [], lost: false };
  }
  function simplify(list) {
    const out = [];
    for (const t of list) {
      const m = parseAlg(t)[0];
      const last = out[out.length - 1];
      if (last && last.base === m.base) { last.turns = (last.turns + m.turns) % 4; if (!last.turns) out.pop(); } else out.push({ base: m.base, turns: m.turns });
    }
    return out;
  }
  const moveText = (m) => m.base + (m.turns === 2 ? '2' : m.turns === 3 ? "'" : '');
  function locate(F, st) {
    if (!F) return false;
    const k = key(st);
    const pick = (list) => list.reduce((b, x) => { const db = Math.abs(b - F.pos); const dx = Math.abs(x - F.pos); return dx < db || (dx === db && x > b) ? x : b; });
    if (F.at.has(k)) { F.pos = pick(F.at.get(k)); F.halfway = false; F.off = []; F.lost = false; return true; }
    if (F.half.has(k)) { F.pos = pick(F.half.get(k)); F.halfway = true; F.off = []; F.lost = false; return true; }
    return false;
  }
  function followMove(F, st, mv) {
    if (!F || locate(F, st) || F.lost) return;
    F.off = simplify([...F.off.map(moveText), mv]);
    if (F.off.length > 6) F.lost = true;
  }
  const done = (F) => !!F && !F.lost && !F.off.length && !F.halfway && F.pos >= F.n;
  const undoText = (F) => F.off.slice().reverse().map((m) => moveText({ base: m.base, turns: (4 - m.turns) % 4 })).join(' ');
  const setupChips = (F) => F.moves.map((m, i) => `<span class="sm${i < F.pos ? ' done' : i === F.pos && !F.lost ? (F.halfway ? ' next half' : ' next') : ''}">${esc(m)}</span>`).join(' ');

  // ================= Live help: what to do next, following each turn =================
  // A plan's turns, as states in the cube's frame: the help stays with the plan while the cube is on it (in an
  // algorithm the layers below come apart for a moment) and works out the next one when it ends or the cube
  // leaves it. If the cube goes back below the step it had reached, the help waits a few turns before going
  // back with it: that is what an algorithm done from another side looks like for a moment.
  function pathOf(p) {
    let s = p.view ? apply(p.from, p.view) : p.from;
    const keys = [key(norm(s))];
    const half = [];
    const halfAt = [];
    p.hand.forEach((m, j) => {
      const before = norm(s);
      s = apply(s, m);
      const after = norm(s);
      partialKeys(before, after).forEach((x) => { half.push(x); halfAt.push(j); });
      keys.push(key(after));
    });
    return { keys, half, halfAt };
  }
  const HOLD = 10;
  function makeLive() { return { plan: null, path: null, pos: 0, max: -1, off: 0, info: null }; }
  function liveStep(lv, st) {
    const k = key(st);
    if (lv.path) {
      const i = lv.path.keys.indexOf(k);
      if (i >= 0 && i < lv.path.keys.length - 1) { lv.pos = i; lv.off = 0; lv.info = { plan: lv.plan, pos: i }; return lv.info; }
      const h = i < 0 ? lv.path.half.indexOf(k) : -1;
      if (h >= 0) { lv.pos = lv.path.halfAt[h]; lv.off = 0; lv.info = { plan: lv.plan, pos: lv.pos, half: true }; return lv.info; }
    }
    const r = L.read(st);
    if (lv.plan && lv.max >= 0 && r.stage < lv.max && lv.off < HOLD) {
      lv.off++;
      lv.info = { plan: lv.plan, pos: -1, held: true, read: r };
      return lv.info;
    }
    lv.plan = L.next(st);
    lv.path = lv.plan.kind === 'solved' ? null : pathOf(lv.plan);
    lv.pos = 0;
    lv.max = r.stage;
    lv.off = 0;
    lv.info = { plan: lv.plan, pos: 0, read: r };
    return lv.info;
  }
  const HELD_NOTE = 'Si estás a mitad de un algoritmo, sigue: las capas de abajo se deshacen un momento y vuelven al terminarlo.';

  // ================= The smart cube =================
  let cube = null;
  let prevState = null;
  const live = makeLive();
  cube = window.SmartCube ? window.SmartCube.start({
    info: 'Conecta un GAN y la app ve tu cubo: te dice qué hacer en cada paso y te avisa si te equivocas.',
    onStatus: () => { Object.assign(live, makeLive()); renderAll(); },
    onState: (st, at) => {
      prevState = st;
      if (follow && !locate(follow, st)) markLost();
      if (timer.phase === 'run' && timer.line) timer.line.push({ t: (at > timer.t0 ? at : now()) - timer.t0, st });
      // A turn the cube lost on the way, found when it is asked: if it was the last one, the solve ends there.
      if (timer.phase === 'run' && at > timer.t0 && isSolved(st)) stopRun(at);
      Object.assign(live, makeLive());
      if (trActive()) trSync();
      renderAll();
    },
    onMove: (mv, st, t) => {
      const before = prevState;
      prevState = st;
      if (trActive()) { trMove(mv, st, t); return; }
      if (timer.phase === 'run') {
        if (timer.line) timer.line.push({ t: t - timer.t0, st, m: mv });
        if (isSolved(st)) stopRun(t);
      } else if (view === 'resolver' && done(follow) && (timer.phase === 'idle' || timer.phase === 'done')) {
        startRun(t, before);
        timer.line.push({ t: 0, st, m: mv });
      } else if (follow) {
        if (timer.phase === 'done') setPhase('idle');
        followMove(follow, st, mv);
        if (done(follow)) Object.assign(live, makeLive());
      }
      if (view === 'resolver' && !scramblingNow()) liveStep(live, st);
      renderScramble();
      renderLive();
      renderClock();
      emit('cube', null);
    },
  }) : null;
  const simBox = $('cubeSimBox');
  function renderSim() { simBox.hidden = !(cube && cube.on && cube.kind === 'sim'); }
  simBox.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const v = $('cubeSimMoves').value.trim();
    if (!v || !cube.link) return;
    try { parseAlg(v); } catch (e) { toast('No entiendo esos giros'); return; }
    cube.link.turn(v);
    $('cubeSimMoves').value = '';
  });
  // The virtual cube does what the help says (it is held as the method says: white down, then back).
  $('cubeSimNext').addEventListener('click', () => {
    if (!cube.link || !cube.on) return;
    const p = L.next(cube.state);
    if (p.kind === 'solved') { toast('Ya está resuelto'); return; }
    const back = invertAlg([p.view].filter(Boolean).join(' '));
    cube.link.play([['z2', p.view, ...p.hand, back, 'z2'].filter(Boolean).join(' ')], 8);
  });

  // ================= Resolver: scramble =================
  let scramble = load(K.scr, '');
  let follow = null;
  let scrSeq = 0;
  let scrBusy = false;
  function setScramble(scr) {
    scrSeq++;
    scramble = scr;
    save(K.scr, scr);
    let ok = true;
    try { apply(solved(), scr); } catch (e) { ok = false; }
    follow = ok ? makeFollow(solved(), parseAlg(scr).map((m) => m.text)) : null;
    if (cube && cube.on) locate(follow, cube.state) || markLost();
    Object.assign(live, makeLive());
    renderScramble();
    renderSolution();
    renderLive();
    emit('scramble', scr);
  }
  const scramblingNow = () => !!(follow && !follow.lost && !done(follow) && timer.phase !== 'run');
  function markLost() { if (follow && cube && cube.state) { follow.lost = !isSolved(cube.state); follow.off = []; follow.pos = 0; } }
  async function newScramble() {
    if (scrBusy) return;
    scrBusy = true;
    const btn = $('newScr');
    btn.disabled = true;
    btn.textContent = M.scramblerReady() ? 'Generando…' : 'Preparando…';
    const mine = scrSeq;
    let scr;
    try { scr = M.simplifyAlg(await M.withTimeout(M.requestScramble('full'), 30000)); } catch (e) { scr = M.randomMoveScramble(); }
    btn.disabled = false;
    btn.textContent = 'Otra mezcla';
    scrBusy = false;
    if (mine === scrSeq && timer.phase !== 'run') setScramble(scr);
  }
  function renderScramble() {
    const moves = scramble ? parseAlg(scramble).map((m) => m.text) : [];
    $('scrCount').textContent = moves.length ? `· ${moves.length} giros` : '';
    const F = follow;
    const on = cube && cube.on && F && !F.lost && timer.phase !== 'run';
    $('scr').innerHTML = moves.map((m, i) => `<span class="sm${on ? (i < F.pos ? ' done' : i === F.pos ? (F.halfway ? ' next half' : ' next') : '') : ''}">${esc(m)}</span>`).join(' ') || '<span class="muted">Generando…</span>';
    const hint = $('scrHint');
    let text = '';
    let tone = '';
    if (cube && cube.on && F && timer.phase !== 'run') {
      if (F.lost) {
        text = isSolved(cube.state) ? 'Mezcla el cubo con estos giros, con el blanco arriba y el verde delante.' : 'Tu cubo no está en esta mezcla: resuélvelo con la ayuda de abajo, o pulsa «Está resuelto» si ya lo está.';
        tone = isSolved(cube.state) ? '' : 'bad';
      } else if (F.off.length) { text = `Ese giro no toca. Deshaz: <b>${esc(undoText(F))}</b>`; tone = 'bad'; } else if (done(F)) {
        text = 'Mezclado. Dale la vuelta (amarillo arriba): el reloj empieza con tu primer giro.';
        tone = 'ok';
      } else text = `Giro ${F.pos + 1} de ${F.n}: <b>${esc(F.moves[F.pos])}</b>${F.halfway ? ' (falta la otra mitad)' : ''}`;
    }
    hint.hidden = !text;
    hint.className = `fr-hint ${tone}`;
    hint.innerHTML = text;
  }
  $('newScr').addEventListener('click', () => { if (timer.phase !== 'run') newScramble(); });

  // The whole solution of the scramble with the method, step by step (for a normal cube).
  let solOpen = false;
  function renderSolution() {
    const box = $('solutionBody');
    if (!solOpen) { box.innerHTML = ''; return; }
    if (!scramble) { box.innerHTML = '<p class="hint">Aún no hay mezcla.</p>'; return; }
    let res;
    try { res = L.solve(scramble); } catch (e) { res = null; }
    if (!res || !res.solved) { box.innerHTML = '<p class="hint">No he podido resolver esta mezcla.</p>'; return; }
    const groups = STEPS.map((s, i) => ({ s, plans: res.plans.filter((p) => p.stage === i) }));
    const total = res.plans.reduce((a, p) => a + p.hand.length, 0);
    box.innerHTML = `<p class="hint">Con el método, desde esta mezcla: ${total} giros. Sigue los pasos con el amarillo arriba; cada dibujo es cómo tiene que estar el cubo justo antes.</p>
      <ol class="pr-sol">${groups.map(({ s, plans }) => `<li><h3>Paso ${s.n}. ${esc(s.name)}</h3>${plans.length ? `<ol>${plans.map((p) => `<li>${planHtml(p, -1, { small: true })}</li>`).join('')}</ol>` : '<p class="hint">Ya está hecho: sáltatelo.</p>'}</li>`).join('')}</ol>`;
  }
  $('solution').addEventListener('toggle', () => { solOpen = $('solution').open; renderSolution(); });

  // ================= Resolver: timer =================
  // idle → (hold) → ready → run → done. With the cube: armed once it is scrambled, the first turn starts it
  // and solving it stops it.
  const HOLD_MS = 300;
  const timer = { phase: 'idle', t0: 0, t: 0, hold: 0, raf: 0, line: null, last: null };
  function setPhase(p) {
    timer.phase = p;
    document.body.dataset.timer = p === 'run' ? 'run' : 'idle';
    renderClock();
    emit('timer', p);
  }
  function tick() {
    cancelAnimationFrame(timer.raf);
    const step = () => {
      if (timer.phase !== 'run') return;
      $('clockTime').textContent = fmt(now() - timer.t0);
      timer.raf = requestAnimationFrame(step);
    };
    timer.raf = requestAnimationFrame(step);
  }
  function startRun(at, startState) {
    timer.t0 = at || now();
    timer.scr = scramble;
    timer.line = cube && cube.on ? [{ t: 0, st: startState || cube.state }] : null;
    timer.help = settings.mode === 'help';
    Object.assign(live, makeLive());
    setPhase('run');
    tick();
    renderLive();
  }
  // Each step's time and turns, from the states after every turn of the solve.
  function splitsOf(line) {
    if (!line || line.length < 2) return null;
    const stages = line.map((e) => L.read(e.st).stage);
    const reach = [0];
    for (let s = 1; s <= 7; s++) reach.push(stages.findIndex((x) => x >= s));
    return STEPS.map((_, i) => {
      const from = reach[i];
      const to = reach[i + 1];
      if (from == null || from < 0 || to < 0) return null;
      return [Math.round(line[to].t - line[from].t), to - from];
    });
  }
  function stopRun(at) {
    if (timer.phase !== 'run') return;
    timer.t = Math.round((at || now()) - timer.t0);
    cancelAnimationFrame(timer.raf);
    const r = { at: Date.now(), t: timer.t, pen: 0, scr: timer.scr || scramble };
    if (timer.help) r.help = 1;
    const sp = splitsOf(timer.line);
    if (sp && sp.every(Boolean)) r.sp = sp;
    const before = times.filter((x) => x.pen !== 'dnf');
    const prevBest = before.length ? Math.min(...before.map(value)) : null;
    times.push(r);
    if (times.length > 2000) times = times.slice(-2000);
    save(K.times, times);
    changed();
    timer.last = r;
    if (follow && cube && cube.on && !locate(follow, cube.state)) markLost();
    if (follow && follow.pos >= follow.n) { follow.pos = 0; follow.lost = true; }
    $('clockTime').textContent = fmtRes(r);
    setPhase('done');
    const first = !before.length;
    const pb = prevBest != null && value(r) < prevBest;
    if (settings.sound && window.SmartCube) window.SmartCube.chime(pb || first ? 'pb' : undefined);
    buzz([80, 60, 180]);
    if (first) toast('¡Tu primer cubo resuelto!');
    else if (pb) toast(`¡Récord! ${fmt(value(r))}`);
    renderSplits(r);
    renderStats();
    emit('result', r);
    newScramble();
  }
  function cancel() {
    cancelAnimationFrame(timer.raf);
    timer.line = null;
    $('clockTime').textContent = fmt(0);
    setPhase('idle');
    renderScramble();
  }
  function renderClock() {
    const p = timer.phase;
    const el = $('clock');
    el.dataset.phase = p;
    const armed = cube && cube.on && done(follow) && p !== 'run';
    $('clockPhase').textContent = { idle: armed ? 'Listo · empieza al girar' : 'Listo', hold: 'Mantén…', ready: 'Suelta para empezar', run: 'En marcha', done: 'Tiempo' }[p] || '';
    let sub = '';
    if (p === 'idle' || p === 'done') sub = cube && cube.on ? (armed ? 'Gira y empieza · o mantén Espacio y suelta' : 'Mezcla el cubo con los giros de arriba · o mantén Espacio y suelta') : 'Mantén pulsado (o Espacio) y suelta para empezar';
    else if (p === 'run') sub = cube && cube.on ? 'Se para solo al resolverlo · o pulsa para parar' : 'Pulsa para parar';
    $('clockSplit').textContent = sub;
    if (p === 'idle' && !timer.last) $('clockTime').textContent = fmt(0);
  }
  const typing = (el) => el && ((el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes(el.type)) || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  function press() {
    const p = timer.phase;
    if (p === 'run') { stopRun(); return true; }
    if (p === 'idle' || p === 'done') { timer.hold = setTimeout(() => { if (timer.phase === 'hold') setPhase('ready'); }, HOLD_MS); setPhase('hold'); return true; }
    return false;
  }
  function release() {
    clearTimeout(timer.hold);
    const p = timer.phase;
    if (p === 'ready') { if (window.SmartCube) window.SmartCube.unlockAudio(); startRun(); } else if (p === 'hold') setPhase(timer.last ? 'done' : 'idle');
  }
  document.addEventListener('keydown', (ev) => {
    if (view !== 'resolver' || typing(ev.target)) return;
    if (ev.key === 'Escape') { if (['run', 'hold', 'ready'].includes(timer.phase)) { ev.preventDefault(); cancel(); } return; }
    if (timer.phase === 'run' && !ev.repeat && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { ev.preventDefault(); stopRun(); return; }
    if (ev.key !== ' ') return;
    ev.preventDefault();
    if (ev.repeat) return;
    press();
  });
  document.addEventListener('keyup', (ev) => {
    if (ev.key !== ' ' || view !== 'resolver' || typing(ev.target)) return;
    ev.preventDefault();
    release();
  });
  const clockEl = $('clock');
  clockEl.addEventListener('pointerdown', (ev) => { if (ev.button === 0 && press()) { ev.preventDefault(); if (clockEl.setPointerCapture) clockEl.setPointerCapture(ev.pointerId); } });
  clockEl.addEventListener('pointerup', () => release());
  clockEl.addEventListener('pointercancel', () => { if (timer.phase === 'hold' || timer.phase === 'ready') cancel(); });
  clockEl.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') ev.preventDefault(); });
  clockEl.addEventListener('click', (ev) => ev.preventDefault());

  // ---- Help on or off
  function renderMode() {
    $('modeHelp').setAttribute('aria-pressed', String(settings.mode !== 'clock'));
    $('modeClock').setAttribute('aria-pressed', String(settings.mode === 'clock'));
  }
  $('modeHelp').addEventListener('click', () => { settings.mode = 'help'; saveSettings(); renderMode(); renderLive(); });
  $('modeClock').addEventListener('click', () => { settings.mode = 'clock'; saveSettings(); renderMode(); renderLive(); });

  // ---- The live panel
  function renderLive() {
    const box = $('live');
    box.hidden = !(cube && cube.on);
    if (box.hidden) return;
    const st = cube.state;
    const solvedNow = isSolved(st);
    const scrambling = follow && !follow.lost && follow.pos > 0 && !done(follow) && timer.phase !== 'run';
    const running = timer.phase === 'run';
    if (!live.info && !solvedNow && !scrambling) liveStep(live, st);
    const info = live.info;
    const stage = solvedNow ? 7 : info && info.plan ? (info.held ? live.max : info.plan.stage) : 0;
    const sp = running && timer.line ? splitsLive() : null;
    $('liveSteps').innerHTML = STEPS.map((s, i) => {
      let cls = solvedNow || stage > i ? 'done' : stage === i ? 'cur' : '';
      if (scrambling || (solvedNow && timer.phase !== 'done')) cls = '';
      const t = sp && sp[i] != null ? `<span class="fr-st">${(sp[i] / 1000).toFixed(1)}</span>` : '';
      return `<li class="${cls}"><span class="pr-sn" aria-hidden="true">${s.n}</span><span class="pr-sl">${esc(s.short)}</span>${t}</li>`;
    }).join('');
    let html;
    if (solvedNow) html = timer.phase === 'done' ? '<p class="pr-done-big">¡Resuelto!</p>' : '<p class="fr-note">Tu cubo está resuelto. Mézclalo con los giros de arriba (blanco arriba, verde delante) y aquí te iré diciendo qué hacer.</p>';
    else if (scrambling) html = '<p class="fr-note">Mezclando… Cuando acabes, dale la vuelta: amarillo arriba.</p>';
    else if (settings.mode === 'clock' && (running || done(follow))) html = running ? `<p class="fr-note"><b>${esc(STEPS[Math.min(stage, 6)].name)}</b> · sin ayuda</p>` : '<p class="fr-note">Sin ayuda: el reloj empieza con tu primer giro.</p>';
    else if (info && info.plan) html = planHtml(info.plan, info.held ? -1 : info.pos, { note: info.held ? HELD_NOTE : '' });
    else html = '';
    const now2 = $('liveNow');
    if (now2.dataset.h !== html) { now2.dataset.h = html; now2.innerHTML = html; }
  }
  // While the clock runs: when each step was reached.
  function splitsLive() {
    const line = timer.line;
    const stages = line.map((e) => (e.stage != null ? e.stage : (e.stage = L.read(e.st).stage)));
    const out = [];
    let prev = 0;
    for (let s = 1; s <= 7; s++) {
      const k = stages.findIndex((x) => x >= s);
      if (k < 0) break;
      out.push(line[k].t - prev);
      prev = line[k].t;
    }
    return out;
  }

  // ================= Resolver: splits, stats, history =================
  function stepBar(sp) {
    const total = sp.reduce((a, x) => a + x[0], 0) || 1;
    return `<div class="fr-bar">${sp.map((x, i) => `<span class="fr-seg pr-seg-${i}" style="flex-grow:${Math.max(1, x[0])}" title="${esc(STEPS[i].name)} ${secs(x[0])}"><b>${i + 1}</b></span>`).join('')}</div>`
      + `<p class="hint">${sp.map((x, i) => `${STEPS[i].n}. ${esc(STEPS[i].short)} ${secs(x[0])} (${Math.round((x[0] / total) * 100)} %)`).join(' · ')}</p>`;
  }
  function renderSplits(r) {
    const box = $('splits');
    if (!r || !r.sp) { box.hidden = true; return; }
    box.hidden = false;
    const rows = r.sp.map((x, i) => `<tr><th scope="row">${STEPS[i].n}. ${esc(STEPS[i].name)}</th><td>${secs(x[0])}</td><td>${x[1]} giros</td></tr>`).join('');
    box.innerHTML = `<div class="fr-splits-head"><span class="field-title">Tu resolución, paso a paso</span><b>${fmtRes(r)}</b></div>${stepBar(r.sp)}
      <div class="fr-table" tabindex="0" role="region" aria-label="Tiempo de cada paso"><table><thead><tr><th scope="col">Paso</th><th scope="col">Tiempo</th><th scope="col">Giros</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  let histShown = 20;
  function renderStats() {
    const ok = times.filter((r) => r.pen !== 'dnf');
    const best = ok.length ? Math.min(...ok.map(value)) : null;
    const cells = [['Resueltos', String(times.length)], ['Mejor', fmt(best)], ['Media de 5', fmt(avgOf(times, 5))], ['Media de 12', fmt(avgOf(times, 12))]];
    $('stats').innerHTML = times.length ? cells.map(([k, v]) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`).join('') : '';
    renderHistory();
  }
  function renderHistory() {
    const box = $('history');
    if (!times.length) { box.innerHTML = '<p class="empty-note">Aún no hay tiempos. Cuando resuelvas el cubo con el reloj en marcha, aparecerán aquí.</p>'; $('histMore').hidden = true; return; }
    const list = times.map((r, i) => ({ r, i })).reverse().slice(0, histShown);
    box.innerHTML = `<table><thead><tr><th scope="col">#</th><th scope="col">Tiempo</th><th scope="col">Cuándo</th><th scope="col">Pasos</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead><tbody>${
      list.map(({ r, i }) => `<tr><td class="muted">${i + 1}</td><td><b>${fmtRes(r)}</b>${r.help ? ' <span class="muted">· con ayuda</span>' : ''}</td><td class="muted">${new Date(r.at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>`
        + `<td class="muted">${r.sp ? r.sp.map((x) => secs(x[0])).join(' · ') : ''}</td>`
        + `<td class="fr-acts"><button class="x" type="button" data-pen="2" data-i="${i}" aria-label="Poner o quitar +2 al ${i + 1}" aria-pressed="${r.pen === 2}">+2</button>`
        + `<button class="x" type="button" data-pen="dnf" data-i="${i}" aria-label="Marcar o desmarcar DNF el ${i + 1}" aria-pressed="${r.pen === 'dnf'}">DNF</button>`
        + `<button class="x" type="button" data-del="${i}" aria-label="Borrar el ${i + 1}">×</button></td></tr>`).join('')}</tbody></table>`;
    $('histMore').hidden = times.length <= histShown;
  }
  $('history').addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.del != null) {
      const i = Number(b.dataset.del);
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '¿Borrar?'; b.classList.add('armed'); setTimeout(() => { if (b.isConnected) { b.dataset.armed = ''; b.textContent = '×'; b.classList.remove('armed'); } }, 3000); return; }
      if (times[i] === timer.last) timer.last = null;
      const gone = load(K.deleted, []);
      gone.push(times[i].at);
      save(K.deleted, gone.slice(-3000));
      times.splice(i, 1);
    } else if (b.dataset.pen) {
      const r = times[Number(b.dataset.i)];
      const p = b.dataset.pen === '2' ? 2 : 'dnf';
      r.pen = r.pen === p ? 0 : p;
      r.ed = Date.now();
    } else return;
    save(K.times, times);
    renderStats();
    emit('result', null);
    changed();
  });
  $('histMore').addEventListener('click', () => { histShown += 50; renderHistory(); });
  onView('resolver', () => { if (cube && cube.on) liveStep(live, cube.state); renderLive(); renderScramble(); renderClock(); });

  // ================= Entrenar: one step at a time =================
  // The cube is left right at the start of the step, as it comes in a real solve (a random cube solved with
  // the method up to there). With the smart cube: the turns that take it there from wherever it is, then the
  // step is timed from when it is ready until it is done. With a normal cube: a mix from solved, and how to do
  // the step from there.
  const tr = { step: null, phase: 'idle', seq: 0, target: null, setup: '', follow: null, ready: 0, first: 0, moves: 0, err: '', result: null, mix: '', plans: null, live: makeLive() };
  const trCubeMode = () => !!(cube && cube.on);
  const trActive = () => view === 'entrenar' && trCubeMode() && tr.step != null && tr.phase !== 'idle';
  function suggestStep() {
    const nx = nextToLearn();
    if (nx) return STEPS.indexOf(nx);
    // Everything known: the slowest step in the last solves.
    const sp = times.filter((r) => r.sp).slice(-12);
    if (!sp.length) return 0;
    const avg = STEPS.map((_, i) => sp.reduce((a, r) => a + r.sp[i][0], 0) / sp.length);
    return avg.indexOf(Math.max(...avg));
  }
  function renderPick() {
    const cur = tr.step;
    $('trPick').innerHTML = STEPS.map((s, i) => {
      const t = train[s.id];
      return `<button type="button" data-step="${i}" aria-pressed="${cur === i}"><span class="pr-n">${isKnown(s.id) ? '✓' : s.n}</span>${esc(s.short)}<small>${t && t.n ? `${t.n} ${t.n === 1 ? 'vez' : 'veces'}` : 'nuevo'}</small></button>`;
    }).join('');
  }
  $('trPick').addEventListener('click', (ev) => { const b = ev.target.closest('[data-step]'); if (b) trChoose(Number(b.dataset.step)); });
  function trChoose(i) {
    settings.trStep = i;
    saveSettings();
    tr.step = i;
    renderPick();
    trNext();
  }
  // A cube at the start of step `i`, in the cube's frame.
  function targetFor(i) {
    for (let k = 0; k < 20; k++) {
      const st = L.stateAt(i, M.randomMoveScramble(30));
      if (st) return st;
    }
    return null;
  }
  async function trNext() {
    tr.seq++;
    const mine = tr.seq;
    Object.assign(tr, { phase: 'prep', target: null, setup: '', follow: null, ready: 0, first: 0, moves: 0, err: '', result: null, mix: '', plans: null, live: makeLive() });
    renderTrain();
    const target = targetFor(tr.step);
    if (!target) { tr.err = 'No he podido preparar el paso.'; tr.phase = 'error'; renderTrain(); return; }
    tr.target = target;
    // How the method does the step from there (for «ver cómo se hace» and to compare).
    const res = L.solve(target);
    tr.plans = res.plans.filter((p) => p.stage === tr.step);
    tr.best = tr.plans.reduce((a, p) => a + p.hand.length, 0);
    let moves = null;
    try {
      if (trCubeMode()) {
        const from = cube.state;
        const inv = new Array(54);
        from.forEach((id, i) => { inv[id] = i; });
        const x = target.map((id) => inv[id]);
        const s = await M.withTimeout(M.solveState(toFacelets(x)), 25000);
        moves = s ? parseAlg(s).map((m) => m.text) : [];
        if (key(apply(from, moves.join(' '))) !== key(target)) moves = null;
      } else {
        const s = await M.withTimeout(M.solveState(toFacelets(target)), 25000);
        moves = s != null ? parseAlg(s).map((m) => m.text) : null;
        if (moves && key(apply(solved(), moves.join(' '))) !== key(target)) moves = null;
      }
    } catch (e) { moves = null; }
    if (mine !== tr.seq) return;
    if (!moves) { tr.err = 'No he podido preparar el paso: el generador de mezclas no ha cargado. Comprueba la conexión y vuelve a intentarlo.'; tr.phase = 'error'; renderTrain(); return; }
    if (trCubeMode()) {
      tr.setup = moves.join(' ');
      tr.follow = makeFollow(cube.state, moves);
      locate(tr.follow, cube.state);
      tr.phase = done(tr.follow) ? 'ready' : 'setup';
      if (tr.phase === 'ready') tr.ready = now();
    } else {
      tr.mix = moves.join(' ');
      tr.phase = 'hand';
    }
    renderTrain();
  }
  function trSync() {
    if (tr.phase === 'setup' && tr.follow) { locate(tr.follow, cube.state); if (done(tr.follow)) { tr.phase = 'ready'; tr.ready = now(); } }
    renderTrain();
  }
  function trMove(mv, st, t) {
    if (tr.phase === 'setup') {
      followMove(tr.follow, st, mv);
      if (done(tr.follow)) { tr.phase = 'ready'; tr.ready = t; Object.assign(tr.live, makeLive()); }
      renderTrain();
      return;
    }
    if (tr.phase === 'ready' || tr.phase === 'solving') {
      if (tr.phase === 'ready') { tr.phase = 'solving'; tr.first = t; }
      tr.moves++;
      liveStep(tr.live, st);
      const stage = L.read(st).stage;
      if (stage > tr.step) {
        const total = Math.round(t - tr.ready);
        const rec = train[STEPS[tr.step].id] || {};
        rec.n = (rec.n || 0) + 1;
        if (!settings.trHelp) {
          rec.timed = (rec.timed || 0) + 1;
          rec.sum = (rec.sum || 0) + total;
          rec.best = rec.best == null ? total : Math.min(rec.best, total);
        }
        rec.moves = (rec.moves || 0) + tr.moves;
        rec.last = Date.now();
        train[STEPS[tr.step].id] = rec;
        save(K.train, train);
        changed();
        tr.result = { total, moves: tr.moves, best: tr.best, help: !!settings.trHelp };
        tr.phase = 'result';
        if (settings.sound && window.SmartCube) window.SmartCube.chime(true);
        buzz([60]);
        renderPick();
        const mine = tr.seq;
        setTimeout(() => { if (tr.seq === mine && tr.phase === 'result' && view === 'entrenar') trNext(); }, 2600);
      }
      renderTrain();
    }
  }
  function trLost() {
    if (tr.phase === 'solving' || tr.phase === 'ready') {
      const rec = train[STEPS[tr.step].id] || {};
      rec.fail = (rec.fail || 0) + 1;
      train[STEPS[tr.step].id] = rec;
      save(K.train, train);
      changed();
    }
    trNext();
  }
  function trHandDone() {
    const rec = train[STEPS[tr.step].id] || {};
    rec.n = (rec.n || 0) + 1;
    rec.hand = (rec.hand || 0) + 1;
    rec.last = Date.now();
    train[STEPS[tr.step].id] = rec;
    save(K.train, train);
    changed();
    renderPick();
    toast('¡Hecho!');
    trNext();
  }
  function trHowHtml() {
    if (!tr.plans || !tr.plans.length) return '';
    return `<details class="pr-solution"><summary>Ver cómo se hace desde aquí (${tr.best} giros con el método)</summary><ol class="pr-sol">${tr.plans.map((p) => `<li>${planHtml(p, -1, { small: true })}</li>`).join('')}</ol></details>`;
  }
  function renderTrain() {
    const box = $('trBox');
    if (tr.step == null) { box.innerHTML = '<p class="empty-note">Elige un paso.</p>'; return; }
    const s = STEPS[tr.step];
    let html = `<span class="field-title">Paso ${s.n} · ${esc(s.name)}</span>`;
    if (tr.phase === 'prep') html += '<p class="fr-note">Preparando…</p>';
    else if (tr.phase === 'error') html += `<p class="hint bad">${esc(tr.err)}</p><div class="actions"><button class="btn" type="button" data-tr="again">Reintentar</button></div>`;
    else if (tr.phase === 'hand') {
      html += `<p class="fr-note"><b>1.</b> Con el cubo resuelto, el <b>blanco arriba</b> y el <b>verde delante</b>, mézclalo así:</p>
        <p class="fr-setup">${parseAlg(tr.mix).map((m) => `<span class="sm">${esc(m.text)}</span>`).join(' ')}</p>
        <p class="fr-note"><b>2.</b> Dale la vuelta (amarillo arriba): ${tr.step ? `los pasos de antes ya están hechos y ahora te toca <b>${esc(s.name.toLowerCase())}</b>` : 'ahora te toca hacer la cruz blanca'}.</p>
        <div class="pr-goal-row">${iso(L.canon(tr.target), { size: 'small', label: 'Así tiene que quedar tu cubo después de mezclarlo' })}<span class="hint">Así tiene que quedar (con el amarillo arriba).</span></div>
        ${trHowHtml()}
        <div class="actions"><button class="btn primary" type="button" data-tr="handdone">Hecho</button><button class="btn" type="button" data-tr="again">Otro</button></div>
        <p class="hint">Con el cubo inteligente conectado, te dejo el cubo en el paso yo y te sigo cada giro.</p>`;
    } else if (tr.phase === 'setup') {
      const F = tr.follow;
      html += `<p class="fr-note">Déjalo justo al empezar el paso: con el <b>blanco arriba</b> y el <b>verde delante</b>, gira:</p><p class="fr-setup">${setupChips(F)}</p>`;
      if (F.lost) html += '<p class="hint bad">Te has perdido. <button class="btn" type="button" data-tr="again">Empezar desde como está</button></p>';
      else if (F.off.length) html += `<p class="hint bad">Ese giro no toca. Deshaz: <b>${esc(undoText(F))}</b></p>`;
    } else if (tr.phase === 'ready' || tr.phase === 'solving') {
      html += tr.phase === 'ready' ? `<p class="fr-big">¡Ya! Dale la vuelta (amarillo arriba) y haz ${esc(s.name.toLowerCase())}.</p>` : `<p class="fr-note">Haciéndolo… ${tr.moves} ${tr.moves === 1 ? 'giro' : 'giros'}</p>`;
      if (settings.trHelp) {
        const info = tr.live.info || liveStep(tr.live, cube.state);
        if (info && info.plan && info.plan.kind !== 'solved') {
          const r = info.read || L.read(cube.state);
          if (r.stage < tr.step && !info.held) html += '<p class="hint bad">Se ha deshecho un paso de antes: arréglalo primero (te digo cómo) o pide otro.</p>';
          html += planHtml(info.plan, info.held ? -1 : info.pos, { note: info.held ? HELD_NOTE : '' });
        }
      } else html += '<p class="hint">Sin ayuda. Si te atascas, activa «Con ayuda» arriba.</p>';
      html += '<div class="actions"><button class="btn" type="button" data-tr="lost">Me he perdido · otro</button></div>';
    } else if (tr.phase === 'result') {
      const r = tr.result;
      html += `<p class="fr-big ok">✓ ${esc(s.name)} en ${secs(r.total)}</p><p class="hint">${r.moves} giros${r.best ? ` · con el método, desde ahí, eran ${r.best}` : ''}${r.help ? ' · con ayuda (no cuenta para tu mejor tiempo)' : ''}. Ahora otro…</p>`;
    }
    const t = train[s.id];
    if (t && t.n) html += `<p class="hint">Este paso: ${vez(t.n)}${t.timed ? ` · sin ayuda, media ${secs(t.sum / t.timed)} y mejor ${secs(t.best)}` : ''}${t.fail ? ` · te perdiste ${vez(t.fail)}` : ''}</p>`;
    if (box.dataset.h !== html) { box.dataset.h = html; box.innerHTML = html; }
  }
  $('trBox').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-tr]');
    if (!b) return;
    const what = b.dataset.tr;
    if (what === 'again') trNext();
    else if (what === 'lost') trLost();
    else if (what === 'handdone') trHandDone();
  });
  $('trHelp').addEventListener('change', (ev) => { settings.trHelp = ev.target.checked; saveSettings(); renderTrain(); });
  onView('entrenar', () => {
    $('trHelp').checked = !!settings.trHelp;
    if (tr.step == null) { tr.step = settings.trStep != null ? settings.trStep : suggestStep(); }
    renderPick();
    // A new case if the way of training changed (cube connected or not) or there is none yet.
    const wantCube = trCubeMode();
    if (tr.phase === 'idle' || tr.phase === 'error' || (wantCube && tr.phase === 'hand') || (!wantCube && ['setup', 'ready', 'solving'].includes(tr.phase))) trNext();
    else renderTrain();
  });

  // ================= Progreso =================
  function renderProgress() {
    const ok = times.filter((r) => r.pen !== 'dnf');
    const best = ok.length ? Math.min(...ok.map(value)) : null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const nToday = times.filter((r) => r.at >= today.getTime()).length;
    const tiles = [['Resueltos', String(times.length)], ['Hoy', String(nToday)], ['Mejor', fmt(best)], ['Media de 5', fmt(avgOf(times, 5))], ['Media de 12', fmt(avgOf(times, 12))], ['Pasos que te sabes', `${STEPS.filter((s) => isKnown(s.id)).length} de 7`]];
    $('progSummary').innerHTML = `<div class="pr-tiles">${tiles.map(([k, v]) => `<div class="pr-tile"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
    renderChart(ok);
    // Step by step: what you know, what you trained and how long it takes you in your solves.
    const sp = times.filter((r) => r.sp && r.pen !== 'dnf').slice(-12);
    const avg = STEPS.map((_, i) => (sp.length ? sp.reduce((a, r) => a + r.sp[i][0], 0) / sp.length : null));
    const total = avg.reduce((a, x) => a + (x || 0), 0) || 1;
    const slow = sp.length ? avg.indexOf(Math.max(...avg)) : -1;
    const rows = STEPS.map((s, i) => {
      const t = train[s.id] || {};
      return `<tr><th scope="row">${s.n}. ${esc(s.name)}</th><td>${isKnown(s.id) ? '✓' : '—'}</td><td>${t.n ? `${t.n}${t.timed ? ` · media ${secs(t.sum / t.timed)}` : ''}` : '—'}</td><td>${avg[i] != null ? `${secs(avg[i])} <span class="muted">(${Math.round((avg[i] / total) * 100)} %)</span>${i === slow ? ' <b>← aquí se te va más tiempo</b>' : ''}` : '—'}</td></tr>`;
    }).join('');
    $('progSteps').innerHTML = `${sp.length ? `<p class="hint">En tus resoluciones con el cubo inteligente (las últimas ${sp.length}).</p>` : '<p class="hint">Resuelve con el cubo inteligente conectado y verás cuánto tardas en cada paso.</p>'}
      <div class="fr-table" tabindex="0" role="region" aria-label="Cada paso"><table class="pr-steps-table"><thead><tr><th scope="col">Paso</th><th scope="col">Te lo sabes</th><th scope="col">Entrenado</th><th scope="col">En tus resoluciones</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${slow >= 0 ? `<div class="actions"><button class="btn" type="button" data-go-train="${slow}">Entrenar «${esc(STEPS[slow].name)}»</button></div>` : ''}`;
    const GOALS = [
      ['Tu primer cubo resuelto', times.length >= 1],
      ['5 resueltos', times.length >= 5],
      ['25 resueltos', times.length >= 25],
      ['100 resueltos', times.length >= 100],
      ['Los 7 pasos aprendidos', STEPS.every((s) => isKnown(s.id))],
      ['Uno sin ayuda', times.some((r) => !r.help && r.pen !== 'dnf')],
      ['Menos de 5 minutos', best != null && best < 300000],
      ['Menos de 3 minutos', best != null && best < 180000],
      ['Menos de 2 minutos', best != null && best < 120000],
      ['Menos de 1 minuto', best != null && best < 60000],
    ];
    $('goals').innerHTML = GOALS.map(([t, on]) => `<li class="${on ? 'on' : ''}"><i aria-hidden="true">${on ? '✓' : ''}</i>${esc(t)}<span class="sr-only">${on ? ': conseguido' : ': pendiente'}</span></li>`).join('');
  }
  function renderChart(ok) {
    const box = $('chart');
    const pts = ok.slice(-50);
    if (pts.length < 2) { box.innerHTML = '<p class="hint">Cuando tengas unos cuantos tiempos, aquí verás cómo bajan.</p>'; return; }
    const W = 640; const H = 180; const l = 50; const r = 10; const t = 10; const b = 22;
    const vals = pts.map(value);
    const lo = Math.min(...vals); const hi = Math.max(...vals);
    const span = hi - lo || 1;
    const x = (i) => l + (i / (pts.length - 1)) * (W - l - r);
    const y = (v) => t + (1 - (v - lo) / span) * (H - t - b);
    const mean = vals.reduce((a, v) => a + v, 0) / vals.length;
    const d = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tus últimos ${pts.length} tiempos: de ${fmt(vals[0])} a ${fmt(vals[vals.length - 1])}, media ${fmt(mean)}">
      <text class="fr-tick" x="4" y="${t + 10}">${fmt(hi)}</text><text class="fr-tick" x="4" y="${H - b}">${fmt(lo)}</text>
      <line class="pr-chart-mean" x1="${l}" x2="${W - r}" y1="${y(mean).toFixed(1)}" y2="${y(mean).toFixed(1)}"/>
      <path class="pr-chart-line" d="${d}"/>${vals.map((v, i) => `<circle class="pr-chart-dot" cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3"/>`).join('')}</svg>
      <p class="hint">Tus últimos ${pts.length} tiempos (la línea de puntos es la media: ${fmt(mean)}).</p>`;
  }
  $('progSteps').addEventListener('click', (ev) => { const b = ev.target.closest('[data-go-train]'); if (b) { trChoose(Number(b.dataset.goTrain)); showView('entrenar'); } });
  onView('progreso', renderProgress);

  // ================= Vibration, install, new versions =================
  const canVibrate = typeof navigator.vibrate === 'function' && !!window.matchMedia && matchMedia('(pointer: coarse)').matches;
  function buzz(pattern) {
    if (!settings.vibrate || !canVibrate) return;
    try { navigator.vibrate(pattern); } catch (e) { /* no vibration */ }
  }
  let installEvt = null;
  const installBtns = [...document.querySelectorAll('.install')];
  window.addEventListener('beforeinstallprompt', (ev) => { ev.preventDefault(); installEvt = ev; installBtns.forEach((b) => { b.hidden = false; }); });
  installBtns.forEach((b) => b.addEventListener('click', async () => {
    if (!installEvt) return;
    installEvt.prompt();
    try { await installEvt.userChoice; } catch (e) { /* dismissed */ }
    installEvt = null;
    installBtns.forEach((x) => { x.hidden = true; });
  }));
  function offerUpdate() {
    const show = () => { $('updateBar').hidden = false; };
    if (timer.phase !== 'run') { show(); return; }
    const wait = () => { if (timer.phase !== 'run') { document.removeEventListener('pr:timer', wait); show(); } };
    document.addEventListener('pr:timer', wait);
  }
  function watchUpdates(reg) {
    const meta = document.querySelector('meta[name=op3-build]');
    const mine = meta && /^[0-9a-f]{10}$/.test(meta.content) ? `op3bld-${meta.content}` : null;
    if (!mine || !window.caches) return;
    let offered = false;
    const compare = () => {
      if (offered) return;
      caches.keys().then((keys) => {
        const lives = keys.filter((k) => k.startsWith('op3bld-'));
        if (lives.length && !lives.includes(mine)) { offered = true; offerUpdate(); }
      }).catch(() => {});
    };
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      const sw = navigator.serviceWorker.controller;
      if (!sw || sw.state === 'activated') { compare(); return; }
      sw.addEventListener('statechange', () => { if (sw.state === 'activated') compare(); });
    });
    let last = Date.now();
    const poll = () => { last = Date.now(); reg.update().catch(() => {}); };
    setInterval(poll, 30 * 60e3);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - last > 5 * 60e3) poll(); });
  }
  $('updateGo').addEventListener('click', () => location.reload());
  $('updateLater').addEventListener('click', () => { $('updateBar').hidden = true; });

  // ================= Sync between devices =================
  // The same code as the other pages (op3bld:sync:v1); this page keeps its own copy on the server.
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const prettyCode = (c) => normCode(c).replace(/(.{4})(?=.)/g, '$1-');
  const randomCode = (n) => {
    const a = new Uint8Array(n);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a); else a.forEach((_, i) => { a[i] = Math.floor(Math.random() * 256); });
    return [...a].map((b) => ALPHA[b % 32]).join('');
  };
  async function sha(text) {
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  async function api(path, body) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tm = setTimeout(() => ctrl && ctrl.abort(), 15000);
    try {
      const r = await fetch(path, { method: body ? 'POST' : 'GET', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: ctrl ? ctrl.signal : undefined });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error((j && j.error) || `error ${r.status}`);
      if (!j || typeof j !== 'object') throw new Error('respuesta incompleta del servidor');
      return j;
    } catch (e) { throw new Error(e.name === 'AbortError' ? 'el servidor no responde' : e.message); } finally { clearTimeout(tm); }
  }
  let pingP = null;
  const backend = () => { if (!pingP) pingP = api('api/ping').then((j) => (j.ok && j.store ? j : null), () => null); return pingP; };
  const syncState = () => load(K.sync, null);
  const syncData = () => ({ v: 1, times, deleted: load(K.deleted, []), known, train });
  function mergeIn(remote) {
    if (!remote || typeof remote !== 'object') return false;
    let changedHere = false;
    const dead = new Set([...load(K.deleted, []), ...(Array.isArray(remote.deleted) ? remote.deleted : [])]);
    save(K.deleted, [...dead].slice(-3000));
    const byAt = new Map(times.map((r) => [r.at, r]));
    (Array.isArray(remote.times) ? remote.times : []).forEach((r) => {
      if (!r || typeof r.at !== 'number' || typeof r.t !== 'number') return;
      const mine = byAt.get(r.at);
      if (!mine) { byAt.set(r.at, r); changedHere = true; } else if ((r.ed || 0) > (mine.ed || 0)) { mine.pen = r.pen; mine.ed = r.ed; changedHere = true; }
    });
    const merged = [...byAt.values()].filter((r) => !dead.has(r.at)).sort((a, b) => a.at - b.at).slice(-2000);
    if (merged.length !== times.length) changedHere = true;
    times = merged;
    save(K.times, times);
    // Known steps: the latest change of each one wins.
    const rk = remote.known && typeof remote.known === 'object' ? remote.known : {};
    STEPS.forEach((s) => {
      const at = `${s.id}@`;
      if ((rk[at] || 0) > (known[at] || 0)) { known[s.id] = rk[s.id] || 0; known[at] = rk[at]; changedHere = true; }
    });
    save(K.known, known);
    Object.entries(remote.train && typeof remote.train === 'object' ? remote.train : {}).forEach(([id, x]) => {
      if (STEPS.some((s) => s.id === id) && x && (x.n || 0) > ((train[id] && train[id].n) || 0)) { train[id] = x; changedHere = true; }
    });
    save(K.train, train);
    return changedHere;
  }
  const syncPlan = window.SyncPlan.create({
    name: 'lbl', enabled: () => !!(syncState() && syncState().code), sync: (why) => syncNow(false, why),
    gap: async () => { const b = await backend(); return b && b.every; },
  });
  let syncing = null;
  async function syncNow(manual, why = 'hand') {
    const st = syncState();
    if (!st || !st.code) return;
    if (syncing) return syncing;
    syncing = (async () => {
      if (manual) setSyncStatus('Sincronizando…');
      try {
        if (!(window.crypto && crypto.subtle)) throw new Error('este navegador no lo permite');
        if (!(await backend())) throw new Error('no hay conexión con el servidor');
        const k = await sha(`lbl:${normCode(st.code)}`);
        const remote = await api(`api/sync?k=${k}`);
        const changedHere = mergeIn(remote.data);
        if (syncPlan.shouldPush(why, manual, !remote.data)) {
          const mark = syncPlan.mark();
          await api(`api/sync?k=${k}`, { data: syncData() });
          syncPlan.pushed(mark);
        }
        save(K.synced, Date.now());
        setSyncStatus(`Sincronizado ${changedHere ? 'y actualizado con tus otros dispositivos' : 'correctamente'}.`);
        if (changedHere) { renderAll(); if (manual) toast('Datos actualizados'); }
      } catch (e) { setSyncStatus(`No se ha podido sincronizar: ${e.message}.`, true); }
    })();
    try { await syncing; } finally { syncing = null; syncPlan.done(); }
  }
  document.addEventListener('pr:changed', () => syncPlan.changed());
  function setSyncStatus(text, bad) {
    const el = $('syncStatus');
    if (!el) return;
    el.textContent = text;
    el.className = `hint${bad ? ' bad' : ''}`;
  }
  function renderSync() {
    const box = $('syncBox');
    const st = syncState();
    if (!st) {
      box.innerHTML = '<p>Guarda en la nube tus tiempos, los pasos que te sabes y lo que has entrenado, y úsalos en el móvil y en el ordenador.</p>'
        + '<div class="actions"><button class="btn primary" type="button" id="syncOn">Activar sincronización</button></div>'
        + '<div class="field"><label for="syncCode">¿Ya la activaste en otro dispositivo? Escribe su código</label>'
        + '<div class="inrow"><input id="syncCode" class="text-input" type="text" spellcheck="false" autocomplete="off" autocapitalize="characters" placeholder="XXXX-XXXX-XXXX-XXXX">'
        + '<button class="btn" type="button" id="syncJoin">Usar este código</button></div></div>'
        + '<p class="hint" id="syncStatus"></p>';
      $('syncOn').addEventListener('click', () => activate(randomCode(16)));
      $('syncJoin').addEventListener('click', () => {
        const code = normCode($('syncCode').value);
        if (code.length !== 16 || [...code].some((c) => !ALPHA.includes(c))) { setSyncStatus('Ese código no es válido: son 16 letras y números.', true); return; }
        activate(code);
      });
      return;
    }
    const last = load(K.synced, 0);
    box.innerHTML = '<p>Tu código de sincronización:</p>'
      + `<p class="code-box">${esc(prettyCode(st.code))}</p>`
      + '<p class="hint">Escríbelo en «Ajustes» en tu otro dispositivo. Quien tenga este código puede ver y cambiar tus datos, así que no lo compartas.</p>'
      + '<div class="actions"><button class="btn primary" type="button" id="syncNow">Sincronizar ahora</button><button class="btn" type="button" id="syncCopy">Copiar código</button></div>'
      + `<p class="hint" id="syncStatus">${last ? `Última sincronización: ${new Date(last).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.` : ''}</p>`;
    $('syncNow').addEventListener('click', () => syncNow(true));
    $('syncCopy').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(prettyCode(st.code)); toast('Código copiado'); } catch (e) { toast('Cópialo a mano'); }
    });
  }
  async function activate(code) {
    if (!(window.crypto && crypto.subtle)) { setSyncStatus('Este navegador no permite activar la sincronización.', true); return; }
    if (!(await backend())) { setSyncStatus('No hay conexión con el servidor.', true); return; }
    save(K.sync, { code: normCode(code), key: await sha(`op3bld:${normCode(code)}`), last: 0 });
    renderSync();
    await syncNow(true);
  }

  // ================= Settings and data =================
  function renderSettings() {
    $('setSound').checked = settings.sound;
    $('setVibrate').checked = settings.vibrate;
    $('setVibrateRow').hidden = !canVibrate;
    const th = load(K.theme, 'auto') || 'auto';
    document.querySelectorAll('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === th)));
  }
  $('setSound').addEventListener('change', (e) => { settings.sound = e.target.checked; saveSettings(); if (settings.sound && window.SmartCube) window.SmartCube.unlockAudio(); });
  $('setVibrate').addEventListener('change', (e) => { settings.vibrate = e.target.checked; saveSettings(); });
  document.querySelectorAll('[data-theme-set]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.themeSet;
    try { if (v === 'auto') localStorage.removeItem(K.theme); else localStorage.setItem(K.theme, v); } catch (e) { /* this visit */ }
    if (v === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', v);
    renderSettings();
  }));
  $('exportData').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ times, known, train, settings }, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `principiante-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('clearTimes').addEventListener('click', (ev) => {
    const b = ev.currentTarget;
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = `¿Borrar ${times.length} tiempos? Pulsa otra vez`; setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Borrar tiempos'; }, 4000); return; }
    b.dataset.armed = '';
    b.textContent = 'Borrar tiempos';
    const gone = load(K.deleted, []);
    times.forEach((r) => gone.push(r.at));
    save(K.deleted, gone.slice(-3000));
    times = [];
    save(K.times, times);
    renderStats();
    renderSplits(null);
    toast('Tiempos borrados');
    changed();
  });
  onView('ajustes', () => { renderSettings(); renderSync(); });

  // ================= Everything =================
  function renderAll() {
    renderSim();
    renderScramble();
    renderClock();
    renderLive();
    if (view === 'entrenar') { renderPick(); renderTrain(); }
    if (view === 'progreso') renderProgress();
    if (view === 'aprender') renderPath();
  }

  window.Principiante = {
    cube: () => cube,
    showView,
    scramble: () => scramble,
    _: { L, live, tr, timer, settings, follow: () => follow, setScramble, syncNow, syncPlan, mergeIn, trChoose, trNext, planHtml, planWords, liveStep, makeLive, times: () => times },
  };

  // ================= Start =================
  renderBasics();
  renderSteps();
  renderPath();
  renderMode();
  renderStats();
  const lastSp = times.length ? times[times.length - 1] : null;
  if (lastSp && lastSp.sp) renderSplits(lastSp);
  const first = location.hash.slice(1);
  if (/^paso-[1-7]$/.test(first)) { showView('aprender'); setTimeout(() => { const el = $(first); if (el) el.scrollIntoView(); }, 50); } else showView(VIEWS.includes(first) ? first : load(K.view, 'aprender'));
  if (scramble) setScramble(scramble); else { renderScramble(); newScramble(); }
  syncPlan.start(1500);
  setTimeout(() => { if (typeof Worker !== 'undefined') M.startScrambler().catch(() => {}); }, 400);
  if ('serviceWorker' in navigator && document.querySelector('link[rel=manifest]')) navigator.serviceWorker.register('sw.js').then(watchUpdates).catch(() => {});
})();
