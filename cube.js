// Smart cube (GAN over Web Bluetooth). Follows the scramble move by move, ends the memo on the first turn,
// stops the clock when the cube is solved and, after a DNF, works out where the solve went wrong.
// A virtual cube (?cubo=virtual) behaves the same way, for trying it without one.
(() => {
  'use strict';
  const O = window.OP3;
  if (!O || !document.getElementById('cubeBar')) return;
  const $ = (id) => document.getElementById(id);
  const { apply, parseAlg, invertAlg, solved, isSolved, faceOfSticker, PIECE_OF, MODES, ALGS, esc } = O;

  const LIB = 'vendor/gan-web-bluetooth-3.0.2.js';
  const LIB_CDN = 'https://cdn.jsdelivr.net/npm/gan-web-bluetooth@3.0.2/+esm';
  const MAC_KEY = 'op3bld:cube-mac:v1';
  const CHECK_MS = 700;   // after a manual stop, wait this long for the last turn to arrive
  const key = (st) => st.join(',');

  // ================= Cube frame =================
  // The cube only feels its six faces turning around a fixed core: a wide turn (l, d) arrives as the opposite
  // face turn and a slice (M) as two face turns. States are compared in that frame, with the centres home.
  const CENTERS = [4, 13, 22, 31, 40, 49];
  const ROTATIONS = ['', 'x', 'x2', "x'", 'z', "z'"].flatMap((a) => ['', 'y', 'y2', "y'"].map((b) => `${a} ${b}`.trim()));
  const centred = (st) => CENTERS.every((c) => st[c] === c);
  function norm(st) {
    if (centred(st)) return st;
    for (const r of ROTATIONS) {
      const s = apply(st, r);
      if (centred(s)) return s;
    }
    return st;
  }
  // Pieces as groups of sticker positions, and each home piece by its colours.
  const CUBIES = [];
  const HOME = new Map();
  for (let p = 0; p < 54; p++) {
    const g = PIECE_OF[p];
    if (g.length < 2 || CUBIES.includes(g)) continue;
    CUBIES.push(g);
    HOME.set(g.map(faceOfSticker).sort().join(''), g);
  }
  // The cube sends 54 colours (URFDLB, Kociemba order, the same as ours); the app tracks sticker ids.
  function fromFacelets(f) {
    if (typeof f !== 'string' || f.length !== 54) return null;
    const st = new Array(54);
    for (const c of CENTERS) {
      if (f[c] !== faceOfSticker(c)) return null;
      st[c] = c;
    }
    const used = new Set();
    for (const g of CUBIES) {
      const home = HOME.get(g.map((p) => f[p]).sort().join(''));
      if (!home || used.has(home)) return null;
      used.add(home);
      for (const p of g) st[p] = home.find((id) => faceOfSticker(id) === f[p]);
    }
    return st;
  }
  const toFacelets = (st) => st.map(faceOfSticker).join('');
  const FACE_MOVES = ['U', 'R', 'F', 'D', 'L', 'B'].flatMap((f) => [f, `${f}2`, `${f}'`]);
  const quarters = (m) => (m.endsWith('2') ? [m[0], m[0]] : [m]);
  // Quarter face turns (one or two faces) that take a to b, as the cube would report them.
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
  const moveText = (m) => m.base + (m.turns === 2 ? '2' : m.turns === 3 ? "'" : '');
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

  // ================= Connection =================
  const cube = {
    link: null, kind: null, status: 'off', name: '', hw: '', battery: null,
    state: null, sub: null, wait: 0, poll: 0, queue: Promise.resolve(), tries: 0,
  };
  const simAllowed = /[?&]cubo=(virtual|sim)\b/.test(location.search);
  const ua = navigator.userAgent || '';
  const isEdge = /\bEdg\//.test(ua);
  function noBluetoothText() {
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
      return 'En iPhone y iPad ningún navegador tiene Bluetooth web, tampoco Safari. Ahí solo funciona con la app Bluefy; si no, usa el ordenador o un Android.';
    }
    if (/Firefox\//.test(ua)) {
      return 'Firefox y los navegadores basados en él (como Zen) no traen Bluetooth web. Se lo añade la extensión '
        + '<a href="https://addons.mozilla.org/firefox/addon/webbt/" target="_blank" rel="noopener">WebBT</a> junto con su programa '
        + '<a href="https://github.com/stevennyman/webbt/releases/latest" target="_blank" rel="noopener">WebBT Server</a> '
        + '(instala los dos y recarga la página). Si da problemas, usa Chrome o Edge.';
    }
    return 'Este navegador no tiene Bluetooth web. Abre la app en Chrome o Edge, en el ordenador o en Android.';
  }
  function say(html, tone, buttons) {
    const box = $('cubeMsg');
    box.className = `result${tone ? ` ${tone}` : ''}`;
    box.innerHTML = html ? `<p>${html}</p>` : '';
    (buttons || []).forEach(([label, fn]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn'; b.textContent = label;
      b.addEventListener('click', fn);
      box.firstElementChild.appendChild(b);
    });
  }
  let libPromise = null;
  function loadLib() {
    if (!libPromise) {
      libPromise = import(new URL(LIB, document.baseURI).href).catch(() => import(LIB_CDN));
      libPromise.catch(() => { libPromise = null; });
    }
    return libPromise;
  }
  // The MAC address salts the encryption. Remembered per cube once known.
  const macs = () => { try { return JSON.parse(localStorage.getItem(MAC_KEY)) || {}; } catch (e) { return {}; } };
  const macOf = (device) => { const m = macs(); return m[`id:${device.id}`] || m[`name:${device.name}`] || null; };
  function rememberMac(device, mac) {
    const m = macs();
    m[`id:${device.id}`] = mac;
    if (device.name) m[`name:${device.name}`] = mac;
    try { localStorage.setItem(MAC_KEY, JSON.stringify(m)); } catch (e) { /* asked again next time */ }
  }
  function forgetMac(device) {
    if (!device) return;
    const m = macs();
    delete m[`id:${device.id}`];
    delete m[`name:${device.name}`];
    try { localStorage.setItem(MAC_KEY, JSON.stringify(m)); } catch (e) { /* nothing kept */ }
  }
  const MAC_RE = /^([0-9A-F]{2}[:-]?){5}[0-9A-F]{2}$/;
  const cleanMac = (v) => {
    const hex = v.toUpperCase().replace(/[^0-9A-F]/g, '');
    return hex.length === 12 ? hex.match(/../g).join(':') : null;
  };
  let lastDevice = null;
  let macWaiting = null;   // closes the MAC dialog if the connection is cancelled
  function askMac(device) {
    return new Promise((resolve) => {
      const sheet = $('macSheet');
      const prefix = isEdge ? 'edge://' : 'chrome://';
      $('macFlag').textContent = `${prefix}flags/#enable-experimental-web-platform-features`;
      $('macScan').textContent = `${prefix}bluetooth-internals/#devices`;
      $('macErr').textContent = '';
      $('macInput').value = '';
      sheet.hidden = false;
      $('macInput').focus();
      let cancelMac = null;
      let offKey = () => {};
      const done = (mac) => {
        sheet.hidden = true;
        offKey();
        if (macWaiting === cancelMac) macWaiting = null;
        $('macForm').removeEventListener('submit', onSubmit);
        $('macCancel').removeEventListener('click', onCancel);
        if (mac) rememberMac(device, mac);
        resolve(mac);
      };
      const onSubmit = (ev) => {
        ev.preventDefault();
        const mac = cleanMac($('macInput').value);
        if (!mac || !MAC_RE.test(mac)) { $('macErr').textContent = 'Son 6 parejas de números y letras de la A a la F, como AB:12:CD:34:EF:56.'; return; }
        done(mac);
      };
      const onCancel = () => done(null);
      const onKey = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); onCancel(); } };
      $('macForm').addEventListener('submit', onSubmit);
      $('macCancel').addEventListener('click', onCancel);
      sheet.addEventListener('keydown', onKey);
      cancelMac = onCancel;
      macWaiting = onCancel;
      offKey = () => sheet.removeEventListener('keydown', onKey);
    });
  }
  document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const text = $(b.dataset.copy).textContent;
    try { await navigator.clipboard.writeText(text); b.textContent = 'Copiado'; } catch (e) { b.textContent = 'Cópialo a mano'; }
    setTimeout(() => { b.textContent = 'Copiar'; }, 2000);
  }));
  function macProvider(device, fallback) {
    lastDevice = device;
    if (!fallback) {
      const saved = macOf(device);
      if (!saved) renderBar('Buscando la dirección del cubo…');
      return Promise.resolve(saved);
    }
    return askMac(device);
  }

  async function connectGan() {
    say('');
    if (!navigator.bluetooth || !navigator.bluetooth.requestDevice) { say(noBluetoothText(), 'ko'); return; }
    // Only used to explain a failure: some add-ons (WebBT in Firefox) answer it wrongly.
    let available = null;
    try { if (navigator.bluetooth.getAvailability) available = await navigator.bluetooth.getAvailability(); } catch (e) { /* unknown */ }
    let lib;
    try { lib = await loadLib(); } catch (e) {
      say('No he podido cargar el código del cubo. Comprueba la conexión a internet y vuelve a probar.', 'ko');
      return;
    }
    setStatus('connecting');
    const mine = ++cube.tries;
    try {
      const conn = await lib.connectGanCube(macProvider);
      if (mine !== cube.tries) { try { conn.disconnect(); } catch (e) { /* gone */ } return; }   // cancelled meanwhile
      attach(conn, 'gan');
    } catch (e) {
      if (mine !== cube.tries) return;
      setStatus('off');
      const msg = String((e && e.message) || e);
      const name = e && e.name;
      if (name === 'NotFoundError' && /cancel/i.test(msg)) return;   // closed the chooser
      if (/adapter/i.test(msg) || (available === false && name === 'NotFoundError')) say('El Bluetooth está apagado (o este equipo no tiene). Enciéndelo y vuelve a probar.', 'ko');
      else if (name === 'NotFoundError') say('No he encontrado ningún cubo. Gíralo un poco para despertarlo, acércalo y vuelve a probar.', 'ko');
      else if (name === 'SecurityError' || name === 'NotAllowedError') say('El navegador no deja usar Bluetooth en esta página. Abre la app directamente en old-pochmann-3bld.vercel.app con Chrome o Edge.', 'ko');
      else if (/MAC address/i.test(msg)) say('Sin la dirección del cubo no puedo conectarlo. Cuando la tengas, vuelve a pulsar «Conectar cubo».', 'ko');
      else if (/services|unsupported/i.test(msg)) say('Ese cubo no es un GAN compatible (o este modelo todavía no está soportado).', 'ko');
      else say(`No he podido conectar el cubo: ${esc(msg)}. Gíralo para despertarlo, acércalo y vuelve a probar.`, 'ko');
    }
  }

  function request(type) {
    const link = cube.link;
    if (!link) return;
    cube.queue = cube.queue.then(() => link.sendCubeCommand({ type })).catch(() => {});
  }
  function attach(link, kind) {
    detach(true);
    cube.link = link; cube.kind = kind; cube.name = link.deviceName || 'Cubo'; cube.hw = ''; cube.battery = null; cube.state = null;
    cube.sub = link.events$.subscribe(onEvent);
    setStatus('linking');
    // Moves only count once the cube has said what it looks like.
    request('REQUEST_HARDWARE');
    request('REQUEST_FACELETS');
    request('REQUEST_BATTERY');
    clearTimeout(cube.wait);
    cube.wait = setTimeout(() => { if (cube.link === link && !cube.state) badData(); }, 6000);
    clearInterval(cube.poll);
    cube.poll = setInterval(() => request('REQUEST_BATTERY'), 5 * 60e3);
  }
  function detach(quiet) {
    cube.tries++;
    clearTimeout(cube.wait);
    if (attempt) { attempt = null; setAsk(null); }
    clearInterval(cube.poll);
    const link = cube.link;
    if (cube.sub) { try { cube.sub.unsubscribe(); } catch (e) { /* closed */ } }
    cube.sub = null; cube.link = null; cube.state = null;
    if (link) { try { Promise.resolve(link.disconnect()).catch(() => {}); } catch (e) { /* gone */ } }
    if (!quiet) setStatus('off');
  }
  function badData() {
    const device = lastDevice;
    detach();
    say('El cubo se ha conectado, pero no entiendo lo que manda. Casi seguro que la dirección MAC no es la suya.', 'ko',
      [['Escribir la MAC otra vez', () => { forgetMac(device); connectGan(); }]]);
  }
  function onEvent(ev) {
    switch (ev && ev.type) {
      case 'FACELETS': onFacelets(ev.facelets); break;
      case 'MOVE': onMove(ev.move); break;
      case 'BATTERY': cube.battery = ev.batteryLevel; renderBar(); break;
      case 'HARDWARE': if (ev.hardwareName) cube.hw = ev.hardwareName; renderBar(); break;
      case 'DISCONNECT':
        if (cube.link) {
          detach();
          say('Se ha desconectado el cubo. Si se ha dormido, gíralo y vuelve a conectarlo.', 'ko');
        }
        break;
      default: break;
    }
  }
  function onFacelets(f) {
    const st = fromFacelets(f);
    if (!st) {
      if (!cube.state) badData();
      return;
    }
    clearTimeout(cube.wait);
    const changed = !cube.state || key(st) !== key(cube.state);
    cube.state = st;
    if (cube.status !== 'on') { setStatus('on'); say(''); }
    if (changed && attempt && attempt.running) {
      // Before the first turn this is just the real starting state; later, the cube had lost track.
      if (!attempt.moves.length) { attempt.start = st; attempt.states = [st]; } else { attempt.gap = true; attempt.states.push(st); }
    }
    if (attempt && attempt.checking) { finishCheck(isSolved(st)); return; }
    if (changed && !locate()) { follow.lost = true; follow.off = []; }
    render();
  }

  // ================= The scramble, move by move =================
  const follow = { scr: null, moves: [], prefix: new Map(), half: new Map(), prog: 0, halfway: false, off: [], lost: true, target: null };
  function setScramble(scr) {
    if (scr === follow.scr) return;
    follow.scr = scr;
    let mv = [];
    try { mv = parseAlg(scr); } catch (e) { mv = []; }
    follow.moves = mv;
    follow.prefix = new Map();
    follow.half = new Map();
    let s = solved();
    follow.prefix.set(key(s), 0);
    mv.forEach((m, k) => {
      // A half turn can be done either way round: both halfway states are fine.
      if (m.turns === 2) [m.base, `${m.base}'`].forEach((q) => { follow.half.set(key(norm(apply(s, q))), k); });
      s = norm(apply(s, m.text));
      follow.prefix.set(key(s), k + 1);
    });
    follow.target = s;
    follow.prog = 0; follow.halfway = false; follow.off = []; follow.lost = true;
    locate();
  }
  function locate() {
    if (!cube.state) return false;
    const k = key(cube.state);
    if (follow.prefix.has(k)) { follow.prog = follow.prefix.get(k); follow.halfway = false; }
    else if (follow.half.has(k)) { follow.prog = follow.half.get(k); follow.halfway = true; }
    else return false;
    follow.off = []; follow.lost = false;
    return true;
  }
  function followMove(mv) {
    if (locate() || follow.lost) return;
    follow.off = simplify([...follow.off.map(moveText), mv]);
    if (follow.off.length > 8) follow.lost = true;
  }
  const undoText = () => follow.off.slice().reverse().map((m) => moveText({ base: m.base, turns: (4 - m.turns) % 4 })).join(' ');
  function followView() {
    const n = follow.moves.length;
    if (!cube.state || !n) return null;
    const chips = follow.moves.map((m, k) => {
      let cls = 'sm';
      if (!follow.lost) {
        if (k < follow.prog) cls += ' done';
        else if (k === follow.prog && !follow.off.length) cls += follow.halfway ? ' next half' : ' next';
      }
      return `<span class="${cls}">${m.text}</span>`;
    }).join(' ');
    let hint;
    let tone = '';
    if (follow.lost) {
      hint = follow.off.length > 8
        ? 'Te has perdido. Resuelve el cubo para volver a empezar el scramble.'
        : 'El cubo no está resuelto: resuélvelo para mezclarlo con este scramble. Si ya lo está, pulsa «Está resuelto».';
      tone = 'bad';
    } else if (follow.off.length) {
      hint = `Ese giro no toca. Deshaz: <b>${undoText()}</b>`;
      tone = 'bad';
    } else if (follow.prog >= n) {
      hint = '✓ Cubo mezclado. Ya puedes empezar el memo.';
      tone = 'ok';
    } else if (follow.halfway) {
      hint = `Te falta la otra mitad del <b>${follow.moves[follow.prog].text}</b>.`;
    } else {
      hint = `${follow.prog ? 'Siguiente' : 'Primer giro'}: <b>${follow.moves[follow.prog].text}</b>`;
    }
    return { chips, hint, tone };
  }
  O.scrHtml = () => {
    if (cube.status !== 'on') return null;
    const v = followView();
    return v ? `<span class="cube-chips">${v.chips}</span><span class="cube-hint ${v.tone}">${v.hint}</span>` : null;
  };

  // ================= Attempts =================
  let attempt = null;
  let last = null;   // the last finished attempt, for the report
  function onMove(mv) {
    if (!cube.state) return;
    let m;
    try { m = parseAlg(mv)[0]; } catch (e) { return; }
    if (!m) return;
    cube.state = apply(cube.state, m.text);
    const ph = O.clock.phase();
    if (attempt && attempt.running && (ph === 'memo' || ph === 'exec')) {
      if (ph === 'memo') O.clock.press();   // the first turn ends the memo
      attempt.moves.push(m.text);
      attempt.states.push(cube.state);
      if (isSolved(cube.state)) {
        attempt.auto = true;
        attempt.running = false;
        O.clock.press();
        O.clock.mark(true);
      }
    } else if (attempt && attempt.checking) {
      // Stopped by hand a moment before the last turn arrived.
      attempt.moves.push(m.text);
      attempt.states.push(cube.state);
      if (isSolved(cube.state)) finishCheck(true);
    } else if (ph === 'idle') {
      followMove(m.text);
    }
    render();
  }
  document.addEventListener('op3:timer', (ev) => {
    const d = ev.detail || {};
    if (d.phase === 'memo' && !attempt && cube.status === 'on' && cube.state) {
      const scrState = (() => { try { return norm(apply(solved(), d.scramble || '')); } catch (e) { return null; } })();
      attempt = { running: true, scramble: d.scramble || '', scrState, start: cube.state, states: [cube.state], moves: [], gap: false };
      $('cubeReport').innerHTML = '';
      $('cubeReport').className = 'result cube-report';
      request('REQUEST_FACELETS');   // make sure the starting state is the real one
    } else if (d.phase === 'idle' && d.cancelled) {
      attempt = null;
      setAsk(null);
    } else if (d.phase === 'done' && attempt && attempt.running) {
      attempt.running = false;
      if (attempt.moves.length && cube.status === 'on') startCheck();
    }
    render();
  });
  function startCheck() {
    attempt.checking = true;
    setAsk('Comprobando el cubo…');
    request('REQUEST_FACELETS');
    clearTimeout(attempt.timer);
    attempt.timer = setTimeout(() => finishCheck(cube.state && isSolved(cube.state)), CHECK_MS);
  }
  function finishCheck(ok) {
    if (!attempt || !attempt.checking) return;
    clearTimeout(attempt.timer);
    attempt.checking = false;
    if (O.clock.phase() !== 'done') return;   // already marked by hand
    if (ok) { O.clock.mark(true); return; }
    setAsk('El cubo no está resuelto. ¿Es DNF?');
    try { $('markDnf').focus(); } catch (e) { /* hidden */ }
    attempt.cubeSaysDnf = true;
    showReport(attempt, null);
  }
  function setAsk(text) { $('verdictAsk').textContent = text || '¿Lo has resuelto?'; }
  O.resultExtra = () => (attempt && attempt.moves.length ? { cube: { moves: attempt.moves.length } } : {});
  document.addEventListener('op3:result', (ev) => {
    setAsk(null);
    if (!attempt) return;
    last = attempt;
    attempt = null;
    last.ok = !!(ev.detail && ev.detail.ok);
    last.exec = ev.detail ? ev.detail.exec : 0;
    showReport(last, last.ok);
    if (last.auto && last.ok) $('clockPhase').textContent = 'Resuelto · lo ha comprobado el cubo';
  });

  // ================= Where it went wrong =================
  const CANDS = [
    ...O.trainLetters('edge').map((L) => ({ kind: 'edge', L })),
    { kind: 'parity' },
    ...O.trainLetters('corner').map((L) => ({ kind: 'corner', L })),
  ];
  const same = (a, b) => !!a && !!b && a.kind === b.kind && a.L === b.L;
  const nounOf = (t) => (t.kind === 'edge' ? 'aristas' : 'esquinas');
  // The memo typed in «Practicar», when it belongs to this scramble: it solves it, or it was typed after the
  // scramble was set (a memo left over from another scramble would only confuse).
  let memoAt = 0;
  let scrAt = 0;
  let scrSeen = O.scramble();
  ['memoE', 'memoC'].forEach((id) => $(id).addEventListener('input', () => { memoAt = performance.now(); }));
  document.addEventListener('op3:scramble', (ev) => {
    if (ev.detail !== scrSeen) { scrSeen = ev.detail; scrAt = performance.now(); }
  });
  function typedMemo(a) {
    if (O.scramble() !== a.scramble) return null;
    const e = O.lettersOf($('memoE').value);
    const c = O.lettersOf($('memoC').value);
    if (!e.length && !c.length) return null;
    const bad = (kind, L) => !(L in MODES[kind].posOf) || MODES[kind].buffer.includes(L);
    if (e.some((L) => bad('edge', L)) || c.some((L) => bad('corner', L))) return null;
    if (!(memoAt > scrAt) && !(a.scrState && !O.traceMemo(a.scrState, e, c))) return null;
    const toks = e.map((L) => ({ kind: 'edge', L }));
    if (e.length % 2) toks.push({ kind: 'parity' });
    c.forEach((L) => toks.push({ kind: 'corner', L }));
    return { e, c, toks, text: `${O.pairs(e)} · ${O.pairs(c)}` };
  }
  // Rebuilds the letters done from the states the cube went through: after each letter (setup, algorithm,
  // undo) the cube must be exactly where shooting that letter leaves it.
  function retrace(a) {
    const at = new Map();
    a.states.forEach((s, i) => { const k = key(s); if (!at.has(k)) at.set(k, []); at.get(k).push(i); });
    const after = (st, j) => { const l = at.get(key(st)); if (!l) return -1; for (const i of l) if (i > j) return i; return -1; };
    const done = [];
    let j = 0;
    let cur = a.states[0];
    for (let guard = 0; guard < 80; guard++) {
      let best = null;
      for (const t of CANDS) {
        const s = apply(cur, O.tokenAlg(t));
        const i = after(s, j);
        if (i >= 0 && (!best || i < best.i)) best = { t, i, s };
      }
      if (!best) break;
      done.push({ ...best.t, at: best.i, before: cur, from: j });
      j = best.i;
      cur = best.s;
    }
    return { done, cur, j, after };
  }
  // How far into one letter the solve got: setup, algorithm, undoing the setup.
  function stageOf(t, cur, j, after) {
    const parity = t.kind === 'parity';
    const mode = parity ? null : MODES[t.kind];
    const setup = parity ? '' : mode.table[t.L] || '';
    const algKey = parity ? 'P' : mode.alg;
    const set = apply(cur, setup);
    const k1 = setup ? after(norm(set), j) : j;
    const k2 = k1 >= 0 ? after(norm(apply(set, ALGS[algKey].moves)), k1) : -1;
    return { setup, undo: setup ? invertAlg(setup) : '', alg: ALGS[algKey].name, stage: k1 < 0 ? 'setup' : k2 < 0 ? 'alg' : 'undo' };
  }
  function nth(toks, i) {
    const t = toks[i];
    if (t.kind === 'parity') return 'la paridad';
    const n = toks.slice(0, i + 1).filter((x) => x.kind === t.kind).length;
    return `la ${n}.ª letra de ${nounOf(t)} (<b>${t.L}</b>)`;
  }
  function stageText(where, s, t) {
    if (t.kind === 'parity') return `Fallo en la paridad: el ${s.alg} no salió bien.`;
    const code = (x) => `<code>${esc(x)}</code>`;
    if (s.stage === 'setup') return `Fallo en ${where}: el setup ${code(s.setup)} no dejó el cubo como debía.`;
    if (s.stage === 'alg') {
      return s.setup
        ? `Fallo en ${where}: el setup ${code(s.setup)} estaba bien, pero el ${s.alg} no salió bien.`
        : `Fallo en ${where}: el ${s.alg} no salió bien.`;
    }
    return `Fallo en ${where}: el setup y el ${s.alg} estaban bien, pero al deshacer el setup (${code(s.undo)}) algo falló.`;
  }
  function doneText(done) {
    const e = done.filter((t) => t.kind === 'edge').map((t) => t.L);
    const c = done.filter((t) => t.kind === 'corner').map((t) => t.L);
    const parts = [];
    if (e.length) parts.push(`aristas <b>${O.pairs(e)}</b>`);
    if (done.some((t) => t.kind === 'parity')) parts.push('paridad');
    if (c.length) parts.push(`esquinas <b>${O.pairs(c)}</b>`);
    return parts.join(' · ');
  }
  function wrongPieces(st) {
    const e = []; const c = [];
    for (const g of CUBIES) {
      if (g.every((p) => st[p] === p)) continue;
      (g.length === 2 ? e : c).push(O.pieceName(g[0]));
    }
    const list = (arr, one, many) => (arr.length ? `${arr.length} ${arr.length === 1 ? one : many} (${arr.join(', ')})` : '');
    return [list(e, 'arista', 'aristas'), list(c, 'esquina', 'esquinas')].filter(Boolean).join(' y ');
  }
  function analyze(a) {
    const end = a.states[a.states.length - 1];
    const ok = isSolved(end);
    const r = retrace(a);
    const memo = typedMemo(a);
    const lines = [];
    let main = '';
    if (ok) {
      main = 'Resuelto, y lo ha comprobado el cubo.';
    } else if (memo) {
      const toks = memo.toks;
      let i = 0;
      while (i < r.done.length && i < toks.length && same(r.done[i], toks[i])) i++;
      if (i < r.done.length && i < toks.length) {
        const did = r.done[i];
        main = `Fallo en ${nth(toks, i)}: tu memo dice <b>${toks[i].L || 'paridad'}</b>, pero hiciste la <b>${did.L || 'paridad'}</b> (la ejecutaste bien, pero no tocaba).`;
      } else if (i >= toks.length) {
        const err = O.traceMemo(a.start, memo.e, memo.c);
        main = `Ejecutaste bien todo tu memo, pero el memo no resolvía el cubo.${err ? ` ${O.errorText(err)}` : ''}`;
      } else {
        // Every letter before this one went as the memo says: the cube is where the last one left it.
        const t = toks[i];
        main = stageText(nth(toks, i), stageOf(t, r.cur, r.j, r.after), t);
      }
      lines.push(`Comparado con tu memo de «Practicar»: <b>${esc(memo.text)}</b>.`);
    } else {
      // No memo: the cube itself says what came next, when the buffer holds another piece.
      const cur = r.cur;
      let next = null;
      for (const kind of ['edge', 'corner']) {
        const mode = MODES[kind];
        const id = cur[mode.posOf[mode.read]];
        const pending = CUBIES.some((g) => g.length === (kind === 'edge' ? 2 : 3) && !g.every((p) => cur[p] === p));
        if (!pending) continue;
        if (!mode.buffer.some((b) => mode.posOf[b] === id)) next = { kind, L: mode.letterOf[id] };
        break;
      }
      const n = r.done.length;
      if (!n) main = 'El fallo está ya en la primera letra.';
      else main = `${n === 1 ? 'La primera letra salió bien' : `Las ${n} primeras letras salieron bien`}; el fallo vino después.`;
      if (next) {
        const toks = [...r.done, next];
        const s = stageOf(next, cur, r.j, r.after);
        main += ` ${stageText(nth(toks, toks.length - 1), s, next)}`;
      }
      lines.push('Si escribes en «Practicar» el memo que hiciste y vuelves aquí, te digo también si el error estaba en el memo o en la ejecución.');
    }
    if (r.done.length) lines.unshift(`Lo que hiciste: ${doneText(r.done)}.`);
    if (!ok) {
      const w = wrongPieces(end);
      if (w) lines.push(`Al parar quedaban mal ${w}.`);
    }
    if (a.scrState && key(a.start) !== key(a.scrState)) lines.push('Ojo: al empezar, el cubo no tenía el scramble de la app.');
    if (a.gap) lines.push('El cubo perdió algún giro por el camino, así que el análisis puede no ser exacto.');
    return { ok, main, lines };
  }
  function showReport(a, savedOk) {
    const box = $('cubeReport');
    const r = analyze(a);
    const moves = a.moves.length;
    const secs = (a.exec || 0) / 1000;
    const pace = moves && secs > 0 ? ` · ${(moves / secs).toLocaleString('es-ES', { maximumFractionDigits: 1 })} por segundo` : '';
    const head = r.ok ? r.main : `<b>DNF.</b> ${r.main}`;
    box.className = `result cube-report ${r.ok ? 'ok' : 'ko'}`;
    box.innerHTML = `<p>${head}</p>`
      + `<p class=sub>${moves} giros en la ejecución${savedOk == null ? '' : pace}.</p>`
      + r.lines.map((l) => `<p class=sub>${l}</p>`).join('')
      + (savedOk === true && !r.ok ? '<p class=sub>Lo has guardado como resuelto, pero el cubo dice que no lo estaba.</p>' : '');
  }
  // Typed the memo afterwards: look again when coming back.
  O.onView('crono', () => { if (last && !last.ok && !attempt) showReport(last, last.ok); });

  // ================= Drawing =================
  const netCells = O.buildNet($('cubeNet'));
  function setStatus(s) { cube.status = s; renderBar(); render(); }
  function renderBar(note) {
    const s = cube.status;
    $('cubeDot').dataset.s = s;
    const on = s === 'on' || s === 'linking';
    $('cubeConnect').hidden = s !== 'off';
    $('cubeConnect').textContent = 'Conectar cubo';
    $('cubeSim').hidden = s !== 'off' || !simAllowed;
    $('cubeSync').hidden = s !== 'on';
    $('cubeOff').hidden = !on && s !== 'connecting';
    $('cubeOff').textContent = s === 'connecting' ? 'Cancelar' : 'Desconectar';
    let name = 'Cubo inteligente';
    let info = 'Conecta un GAN por Bluetooth: sigue el scramble, para el crono solo y te dice dónde fallaste.';
    if (s === 'connecting') { name = 'Conectando…'; info = note || 'Elige tu cubo en la ventana del navegador.'; }
    if (s === 'linking') { name = cube.hw || cube.name; info = 'Conectado. Leyendo el cubo…'; }
    if (s === 'on') {
      name = cube.hw || cube.name;
      const bits = [];
      if (cube.battery != null) bits.push(`batería ${cube.battery} %`);
      if (cube.state) bits.push(isSolved(cube.state) ? 'resuelto' : 'mezclado');
      info = `Conectado${bits.length ? ` · ${bits.join(' · ')}` : ''}`;
    }
    $('cubeName').textContent = name;
    $('cubeInfo').textContent = info;
  }
  function render() {
    const on = cube.status === 'on' && !!cube.state;
    const ph = O.clock.phase();
    $('cubeFollow').hidden = !on;
    $('cubeSimBox').hidden = !(on && cube.kind === 'sim');
    if (on) {
      O.paintCells(netCells, MODES.edge, cube.state, {});
      setScramble(O.scramble());
      const v = followView();
      const scr = $('cubeScr');
      if (ph !== 'idle') scr.innerHTML = '<span class="cube-hint">Intento en marcha.</span>';
      else scr.innerHTML = v ? `<span class="cube-chips">${v.chips}</span><span class="cube-hint ${v.tone}">${v.hint}</span>` : '<span class="cube-hint">No hay scramble: pulsa «Nuevo scramble».</span>';
    }
    if (cube.status === 'on') renderBar();
    O.refreshFocus();
  }
  document.addEventListener('op3:scramble', () => { if (cube.status === 'on') render(); });

  // ================= Virtual cube =================
  function simLink() {
    const subs = new Set();
    let space = solved();   // as held: wide turns and rotations move the centres
    let core = solved();    // what the core feels: the centres never move
    let serial = 0;
    const emit = (ev) => subs.forEach((fn) => fn({ timestamp: performance.now(), ...ev }));
    const later = (fn) => setTimeout(fn, 15);
    const link = {
      deviceName: 'Cubo virtual', deviceMAC: '00:00:00:00:00:00',
      events$: { subscribe(fn) { subs.add(fn); return { unsubscribe() { subs.delete(fn); } }; } },
      sendCubeCommand(c) {
        later(() => {
          if (c.type === 'REQUEST_FACELETS') emit({ type: 'FACELETS', serial, facelets: toFacelets(core) });
          else if (c.type === 'REQUEST_BATTERY') emit({ type: 'BATTERY', batteryLevel: 87 });
          else if (c.type === 'REQUEST_HARDWARE') emit({ type: 'HARDWARE', hardwareName: 'Cubo virtual', softwareVersion: '-', hardwareVersion: '-', gyroSupported: false });
          else if (c.type === 'REQUEST_RESET') { space = solved(); core = solved(); }
        });
        return Promise.resolve();
      },
      disconnect() { subs.clear(); return Promise.resolve(); },
      // One move as the hands do it; the cube reports the face turns its core feels.
      turn(alg) {
        for (const m of parseAlg(alg)) {
          space = apply(space, m.text);
          const target = norm(space);
          const path = facePath(core, target) || [];
          for (const q of path) {
            core = apply(core, q);
            serial = (serial + 1) & 255;
            emit({ type: 'MOVE', move: q, face: 'URFDLB'.indexOf(q[0]), direction: q.length > 1 ? 1 : 0, serial, localTimestamp: performance.now(), cubeTimestamp: null });
          }
          core = target;
        }
      },
      // Turned while the app was not looking (the cube lost track): only the facelets tell.
      silent(alg) { space = apply(space, alg); core = norm(space); },
      play(algs, tps) {
        const list = algs.flatMap((a) => parseAlg(a).map((m) => m.text));
        const gap = 1000 / (tps || 12);
        return new Promise((resolve) => {
          let i = 0;
          const step = () => {
            if (i >= list.length || !subs.size) { resolve(); return; }
            link.turn(list[i++]);
            setTimeout(step, gap);
          };
          step();
        });
      },
      state: () => core,
    };
    return link;
  }
  // The memo for the virtual cube as it is now (the same method as the app's optimal memo).
  function simMemo(st) {
    const edges = O.generateFor('edge', st);
    const mid = edges.letters.length % 2 ? apply(edges.state, ALGS.P.moves) : edges.state;
    const corners = O.generateFor('corner', mid);
    const toks = edges.letters.map((L) => ({ kind: 'edge', L }));
    if (edges.letters.length % 2) toks.push({ kind: 'parity' });
    corners.letters.forEach((L) => toks.push({ kind: 'corner', L }));
    return toks;
  }
  // One letter done wrong: the algorithm loses its last move (setup and undo are fine).
  function flawed(t) {
    const parity = t.kind === 'parity';
    const setup = parity ? '' : MODES[t.kind].table[t.L] || '';
    const alg = parseAlg(ALGS[parity ? 'P' : MODES[t.kind].alg].moves).map((m) => m.text);
    alg.pop();
    return [setup, alg.join(' '), setup ? invertAlg(setup) : ''].filter(Boolean).join(' ');
  }
  // The solution as a list of algorithms, optionally with one letter done wrong.
  function simSolution(st, mistakeAt) {
    const toks = simMemo(st);
    const algs = toks.map((t) => O.tokenAlg(t));
    if (mistakeAt != null && toks.length) {
      const k = Math.max(0, Math.min(toks.length - 1, mistakeAt));
      algs[k] = flawed(toks[k]);
    }
    return { toks, algs };
  }
  async function simSolve(mistakeAt, tps) {
    const link = cube.link;
    if (!link || cube.kind !== 'sim') return null;
    const sol = simSolution(link.state(), mistakeAt);
    if (O.clock.phase() === 'idle') {
      O.clock.press();
      await new Promise((r) => setTimeout(r, 600));
    }
    await link.play(sol.algs, tps || 15);
    return sol;
  }
  $('cubeSimBox').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const input = $('cubeSimMoves');
    try {
      parseAlg(input.value);
      if (cube.link && cube.kind === 'sim') cube.link.turn(input.value);
      input.value = '';
    } catch (e) {
      say(esc(e.message), 'ko');
    }
  });
  $('cubeSimScr').addEventListener('click', () => {
    if (!cube.link || cube.kind !== 'sim') return;
    const scr = O.scramble();
    if (scr) cube.link.play([scr], 12);
  });
  $('cubeSimSolve').addEventListener('click', () => simSolve(null));
  $('cubeSimFail').addEventListener('click', () => {
    if (!cube.link || cube.kind !== 'sim') return;
    const n = simMemo(cube.link.state()).length;
    simSolve(n > 2 ? 1 + Math.floor(Math.random() * (n - 2)) : 0);
  });

  // ================= Buttons =================
  $('cubeConnect').addEventListener('click', connectGan);
  $('cubeSim').addEventListener('click', () => { say(''); attach(simLink(), 'sim'); });
  $('cubeOff').addEventListener('click', () => {
    if (macWaiting) macWaiting();
    detach();
    say('');
  });
  $('cubeSync').addEventListener('click', () => {
    if (!cube.link) return;
    request('REQUEST_RESET');
    cube.state = solved();
    locate();
    render();
    setTimeout(() => request('REQUEST_FACELETS'), 300);
  });
  $('cubeNewScr').addEventListener('click', () => $('newScr').click());
  // Fetch the library ahead, so «Conectar» opens the chooser while the click still counts as one.
  O.onView('crono', () => { if (navigator.bluetooth) loadLib().catch(() => {}); });
  if (O.currentView() === 'crono' && navigator.bluetooth) loadLib().catch(() => {});
  renderBar();

  O.cube = {
    attach, detach, connectGan, simLink, simSolve, simSolution, simMemo, flawed, fromFacelets, toFacelets, norm, facePath,
    get state() { return cube.state; },
    get status() { return cube.status; },
    get link() { return cube.link; },
    get last() { return last; },
    analyze,
  };
})();
