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
  const QUIET_MS = 3000;  // after the cube stops the clock, presses are ignored this long
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
  const isFirefox = /Firefox\//.test(ua);
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
      // Firefox and Zen (with WebBT) have no such page: Edge, which comes with Windows, does.
      const prefix = isEdge || isFirefox ? 'edge://' : 'chrome://';
      $('macAuto').hidden = isFirefox;
      $('macHow').textContent = isFirefox
        ? 'abre Edge (viene con Windows; en Mac o Linux, Chrome con chrome://), pega esta dirección, pulsa «Start scan», busca tu cubo (empieza por GAN) y copia su dirección.'
        : 'abre esta página, pulsa «Start scan», busca tu cubo (empieza por GAN) y copia su dirección.';
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
    if (changed) handMoves = isSolved(st) ? [] : null;
    cube.state = st;
    if (cube.status !== 'on') { setStatus('on'); say(''); }
    if (changed && attempt && attempt.running) {
      // Before the first turn this is just the real starting state; later, the cube had lost track.
      if (!attempt.moves.length) { attempt.start = st; attempt.states = [st]; liveStart(attempt, st); } else { attempt.gap = true; attempt.states.push(st); }
    }
    if (attempt && attempt.checking) { finishCheck(isSolved(st)); return; }
    if (changed && !locate()) { follow.lost = true; follow.off = []; }
    render();
  }

  // ================= The scramble, move by move =================
  // Every turn since the cube was last solved (null when unknown), for «Leer el cubo».
  let handMoves = null;
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
    if (isSolved(cube.state)) handMoves = [];
    else if (handMoves) handMoves.push(m.text);
    const ph = O.clock.phase();
    if (attempt && attempt.running && (ph === 'memo' || ph === 'exec')) {
      if (ph === 'memo') O.clock.press();   // the first turn ends the memo
      record(m.text);
      if (isSolved(cube.state)) {
        attempt.auto = true;
        attempt.running = false;
        celebrate();
        O.clock.press();
        O.clock.mark(true);
        // Blindfolded, you will still hit the timer to stop it: that press must not start a new attempt.
        O.clock.quiet(QUIET_MS);
      }
    } else if (attempt && attempt.checking) {
      // Stopped by hand a moment before the last turn arrived.
      record(m.text);
      if (isSolved(cube.state)) finishCheck(true);
    } else if (ph === 'idle') {
      followMove(m.text);
      if (trActive()) trMove(m.text);
      if (guideActive()) guideMove(m.text);
    }
    render();
  }
  function record(mv) {
    attempt.moves.push(mv);
    attempt.states.push(cube.state);
    liveMove(attempt, mv, cube.state);
  }
  document.addEventListener('op3:timer', (ev) => {
    const d = ev.detail || {};
    if (d.phase === 'memo') unlockAudio();
    if (d.phase === 'memo' && !attempt && cube.status === 'on' && cube.state) {
      const scrState = (() => { try { return norm(apply(solved(), d.scramble || '')); } catch (e) { return null; } })();
      attempt = { running: true, scramble: d.scramble || '', scrState, start: cube.state, states: [cube.state], moves: [], gap: false };
      liveStart(attempt, cube.state);
      $('cubeReport').innerHTML = '';
      $('cubeReport').className = 'result cube-report';
      request('REQUEST_FACELETS');   // make sure the starting state is the real one
    } else if (d.phase === 'idle' && d.cancelled) {
      attempt = null;
      setAsk(null);
    }
    // The scramble follower slept during the attempt: find where the cube is now.
    if (d.phase === 'idle' && cube.state && !locate()) { follow.lost = true; follow.off = []; } else if (d.phase === 'done' && attempt && attempt.running) {
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
    if (ok) { attempt.auto = true; celebrate(); O.clock.mark(true); return; }
    setAsk('El cubo no está resuelto. ¿Es DNF?');
    try { $('markDnf').focus(); } catch (e) { /* hidden */ }
    attempt.cubeSaysDnf = true;
    showReport(attempt, null);
  }
  // ================= Sound and vibration when the cube confirms it is solved =================
  const FX_KEY = 'op3bld:cube-fx:v1';
  const fx = (() => {
    try { return { sound: true, vibrate: true, ...JSON.parse(localStorage.getItem(FX_KEY)) }; } catch (e) { return { sound: true, vibrate: true }; }
  })();
  // Desktop Chrome has vibrate() too, but nothing to shake: only offer it on touch screens.
  const canVibrate = typeof navigator.vibrate === 'function' && !!window.matchMedia && matchMedia('(pointer: coarse)').matches;
  let audio = null;
  // Browsers only let a page make sound after a tap or a key: start the audio on the press that starts the memo.
  function unlockAudio() {
    if (!fx.sound) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audio) audio = new AC();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
    } catch (e) { audio = null; }
  }
  // Three rising notes (C6 E6 G6), synthesised: nothing to download, works offline.
  function chime() {
    if (!fx.sound || !audio) return;
    try {
      const t0 = audio.currentTime + 0.02;
      [[1047, 0], [1319, 0.1], [1568, 0.2]].forEach(([f, d]) => {
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + d);
        g.gain.exponentialRampToValueAtTime(0.3, t0 + d + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + (d > 0.15 ? 0.9 : 0.45));
        o.connect(g).connect(audio.destination);
        o.start(t0 + d);
        o.stop(t0 + d + 1);
      });
      fxLog.push('chime');
    } catch (e) { /* no sound */ }
  }
  function buzz() {
    if (!fx.vibrate || !canVibrate) return;
    try { navigator.vibrate([80, 60, 180]); fxLog.push('vibrate'); } catch (e) { /* no vibration */ }
  }
  const fxLog = [];   // what was played, for tests
  function celebrate() { chime(); buzz(); }
  function renderFx() {
    $('fxSound').setAttribute('aria-pressed', String(fx.sound));
    $('fxVibrate').setAttribute('aria-pressed', String(fx.vibrate));
    $('fxVibrate').hidden = !canVibrate;
    $('fxNote').textContent = canVibrate
      ? 'Suenan tres notas y el móvil vibra en cuanto el cubo queda resuelto.'
      : 'Suenan tres notas en cuanto el cubo queda resuelto. Este navegador no puede vibrar (en iPhone ninguno puede); y en iPhone, con el modo silencio puesto, tampoco suena.';
  }
  const saveFx = () => { try { localStorage.setItem(FX_KEY, JSON.stringify(fx)); } catch (e) { /* this visit only */ } };
  $('fxSound').addEventListener('click', () => { fx.sound = !fx.sound; saveFx(); renderFx(); });
  $('fxVibrate').addEventListener('click', () => { fx.vibrate = !fx.vibrate; saveFx(); renderFx(); });
  $('fxTry').addEventListener('click', () => { unlockAudio(); celebrate(); });
  renderFx();

  function setAsk(text) { $('verdictAsk').textContent = text || '¿Lo has resuelto?'; }
  O.resultExtra = () => (attempt && attempt.moves.length ? { cube: { moves: attempt.moves.length } } : {});
  document.addEventListener('op3:result', (ev) => {
    setAsk(null);
    if (!attempt) return;
    last = attempt;
    attempt = null;
    last.ok = !!(ev.detail && ev.detail.ok);
    last.exec = ev.detail ? ev.detail.exec : 0;
    last.at = ev.detail ? ev.detail.at : Date.now();
    const r = showReport(last, last.ok);
    // A DNF whose failing letter is clear: that letter comes up more in «Entrenar».
    if (!last.ok && r && r.fail && !last.fed) {
      last.fed = r.fail;
      O.trainer.flag(r.fail.kind, r.fail.L);
      showReport(last, last.ok);
    }
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
  // ---- Live, during the attempt: the turns and each letter as soon as it is complete ----
  const CAND_ALGS = CANDS.map((t) => ({ t, alg: O.tokenAlg(t) }));
  function liveCands(st) {
    const m = new Map();
    for (const { t, alg } of CAND_ALGS) {
      const k = key(apply(st, alg));
      if (!m.has(k)) m.set(k, t);
    }
    return m;
  }
  function liveStart(a, st) { a.live = { done: [], cands: liveCands(st) }; }
  function liveMove(a, mv, st) {
    const L = a.live;
    if (!L) return;
    const t = L.cands.get(key(st));
    if (t) {
      L.done.push(t);
      L.cands = liveCands(st);
    }
  }
  function lettersLine(done) {
    const e = done.filter((t) => t.kind === 'edge').map((t) => t.L);
    const c = done.filter((t) => t.kind === 'corner').map((t) => t.L);
    const parts = [];
    if (e.length) parts.push(O.pairs(e));
    if (done.some((t) => t.kind === 'parity')) parts.push('paridad');
    if (c.length) parts.push(O.pairs(c));
    return parts.join(' · ');
  }
  const LIVE_MOVES = 14;
  function liveHtml(a) {
    if (!a || !a.live || !a.moves.length) return '';
    // Quarter turns of the same face read better together (R R → R2).
    const shown = simplify(a.moves.slice(-3 * LIVE_MOVES)).map(moveText).slice(-LIVE_MOVES);
    const moves = shown.map((m, i) => (i === shown.length - 1 ? `<b class="new">${m}</b>` : `<span>${m}</span>`)).join(' ');
    const letters = lettersLine(a.live.done);
    return `<p class="live-letters">${letters || '&nbsp;'}</p>`
      + `<p class="live-moves"><span class="live-n">${a.moves.length} giros</span>${moves}</p>`;
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
    let fail = null;   // the letter that went wrong in the execution, when it is clear
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
        const s = stageOf(t, r.cur, r.j, r.after);
        main = stageText(nth(toks, i), s, t);
        if (t.kind !== 'parity') fail = { kind: t.kind, L: t.L };
      }
      lines.push(`Comparado con tu memo de «Practicar»: <b>${esc(memo.text)}</b>.`);
    } else {
      // No memo: the cube itself says what came next, when the buffer holds another piece.
      const cur = r.cur;
      let next = null;
      let cycleBreak = null;   // the buffer held its own piece: any letter could have come next
      for (const kind of ['edge', 'corner']) {
        const mode = MODES[kind];
        const id = cur[mode.posOf[mode.read]];
        const pending = CUBIES.some((g) => g.length === (kind === 'edge' ? 2 : 3) && !g.every((p) => cur[p] === p));
        if (!pending) continue;
        if (!mode.buffer.some((b) => mode.posOf[b] === id)) next = { kind, L: mode.letterOf[id] };
        else cycleBreak = kind;
        break;
      }
      const n = r.done.length;
      if (!n) main = 'El fallo está ya en la primera letra.';
      else main = `${n === 1 ? 'La primera letra salió bien' : `Las ${n} primeras letras salieron bien`}; el fallo vino después.`;
      if (next) {
        const toks = [...r.done, next];
        const s = stageOf(next, cur, r.j, r.after);
        main += ` ${stageText(nth(toks, toks.length - 1), s, next)}`;
        fail = { kind: next.kind, L: next.L };
      } else if (cycleBreak) {
        main += ` Ahí tocaba un cambio de ciclo de ${cycleBreak === 'edge' ? 'aristas' : 'esquinas'}, así que el cubo no puede saber a qué letra ibas.`;
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
    return { ok, main, lines, fail };
  }
  function showReport(a, savedOk) {
    const box = $('cubeReport');
    const r = analyze(a);
    const moves = a.moves.length;
    const secs = (a.exec || 0) / 1000;
    const pace = moves && secs > 0 ? ` · ${(moves / secs).toLocaleString('es-ES', { maximumFractionDigits: 1 })} por segundo` : '';
    const head = r.ok ? r.main : `<b>DNF.</b> ${r.main}`;
    if (r.ok) a.why = '';
    else { const d = document.createElement('div'); d.innerHTML = r.main; a.why = d.textContent; }   // plain text for the stream overlay
    box.className = `result cube-report ${r.ok ? 'ok' : 'ko'}`;
    box.innerHTML = `<p>${head}</p>`
      + `<p class=sub>${moves} giros en la ejecución${savedOk == null ? '' : pace}.</p>`
      + r.lines.map((l) => `<p class=sub>${l}</p>`).join('')
      + (savedOk === true && !r.ok ? '<p class=sub>Lo has guardado como resuelto, pero el cubo dice que no lo estaba.</p>' : '')
      + (a.fed ? `<p class=sub>La <b>${a.fed.L}</b> (${a.fed.kind === 'edge' ? 'arista' : 'esquina'}) te saldrá más a menudo en «Entrenar».</p>` : '');
    return r;
  }
  // Typed the memo afterwards: look again when coming back.
  O.onView('crono', () => { if (last && !last.ok && !attempt) showReport(last, last.ok); });

  // ================= Following a known sequence of turns =================
  // From a starting state: the states after each turn of a sequence (and halfway through half turns, either
  // way round). The setup trainer and the guided execution follow the cube along one of these.
  function makePath(start, algs) {
    const at = new Map();
    const half = new Map();
    const add = (m, k, p) => { if (!m.has(k)) m.set(k, []); m.get(k).push(p); };
    let s = start;
    let p = 0;
    add(at, key(norm(s)), 0);
    const segEnd = [];
    const moves = [];
    const spat = [s];   // as held in the hands, wide turns included
    algs.forEach((alg) => {
      for (const m of parseAlg(alg)) {
        if (m.turns === 2) [m.base, `${m.base}'`].forEach((q) => add(half, key(norm(apply(s, q))), p));
        s = apply(s, m.text);
        p++;
        moves.push(m.text);
        spat.push(s);
        add(at, key(norm(s)), p);
      }
      segEnd.push(p);
    });
    return { at, half, segEnd, moves, spat, total: p, end: key(norm(s)), pos: 0, halfway: false, off: [], lost: false };
  }
  // Where the cube is on the path. A path can pass the same state twice (a turn and its inverse back to
  // back, like the end of one letter and the start of the next): take the furthest of the spots near
  // where it was, as both mean the same cube.
  function pathLocate(P, st) {
    const k = key(st);
    const pick = (list) => {
      const d = Math.min(...list.map((x) => Math.abs(x - P.pos)));
      return Math.max(...list.filter((x) => Math.abs(x - P.pos) <= d + 2));
    };
    if (P.at.has(k)) { P.pos = pick(P.at.get(k)); P.halfway = false; }
    else if (P.half.has(k)) { P.pos = pick(P.half.get(k)); P.halfway = true; }
    else return false;
    P.off = [];
    P.lost = false;
    return true;
  }
  function pathMove(P, mv, st) {
    if (pathLocate(P, st) || P.lost) return;
    P.off = simplify([...P.off.map(moveText), mv]);
    if (P.off.length > 8) P.lost = true;
  }
  // The turns to undo, named as the cube is held at that point: after a wide turn (l, d) the cube sits
  // rotated in the hands, so the face the core calls F may be the one on the bottom.
  function undoFor(P) {
    const sp = P.spat[Math.min(P.pos, P.spat.length - 1)];
    const here = norm(sp);
    return P.off.slice().reverse().map((m) => {
      const core = moveText({ base: m.base, turns: (4 - m.turns) % 4 });
      const want = key(apply(here, core));
      return FACE_MOVES.find((x) => key(norm(apply(sp, x))) === want) || core;
    }).join(' ');
  }
  const segOf = (P, pos) => { for (let i = 0; i < P.segEnd.length; i++) if (pos < P.segEnd[i]) return i; return P.segEnd.length; };
  const f1 = (x) => x.toFixed(1).replace('.', ',');

  // ================= Setup trainer on the cube =================
  // A letter is asked; you do setup, algorithm and undo on the real cube, from wherever it is. It is right
  // when the cube ends exactly where that letter leaves it; doing another letter cleanly is caught too.
  const TR_KEY = 'op3bld:train-cube:v1';
  let trUseCube = (() => { try { return localStorage.getItem(TR_KEY) !== 'type'; } catch (e) { return true; } })();
  const tr = { path: null, letter: null, kind: null, t0: 0, first: 0, clean: true, others: null, setup: '', algName: '', descSaved: null, descSet: null, descFor: null };
  const trActive = () => cube.status === 'on' && !!cube.state && trUseCube && O.currentView() === 'entrenar';
  function trStart() {
    const s = O.trainer.state();
    tr.path = null;
    if (!cube.state || !s.letter) return;
    const mode = MODES[s.kind];
    const setup = mode.table[s.letter] || '';
    tr.kind = s.kind; tr.letter = s.letter; tr.t0 = s.t0; tr.first = 0; tr.clean = true;
    tr.setup = setup; tr.algName = ALGS[mode.alg].name;
    tr.path = makePath(cube.state, setup ? [setup, ALGS[mode.alg].moves, invertAlg(setup)] : [ALGS[mode.alg].moves]);
    tr.others = new Map();
    O.trainLetters(s.kind).forEach((L) => { if (L !== s.letter) tr.others.set(key(apply(cube.state, O.tokenAlg({ kind: s.kind, L }))), L); });
  }
  function trMove(mv) {
    const P = tr.path;
    if (!P) return;
    if (!tr.first) tr.first = performance.now();
    pathMove(P, mv, cube.state);
    if (P.off.length || P.lost) tr.clean = false;
    const k = key(cube.state);
    if (k === P.end) trFinish(true);
    else if (tr.others.has(k)) trFinish(false, tr.others.get(k));
  }
  function trFinish(ok, other) {
    const now = performance.now();
    const secs = (now - tr.t0) / 1000;
    const think = tr.first ? (tr.first - tr.t0) / 1000 : secs;
    const exec = tr.first ? (now - tr.first) / 1000 : 0;
    const L = tr.letter;
    let html;
    if (ok && tr.clean) html = `✓ ${L} en ${f1(secs)} s (pensar ${f1(think)} · ejecutar ${f1(exec)}).`;
    else if (ok) html = `${L}: acabada, pero corrigiendo por el camino (${f1(secs)} s). Te saldrá más a menudo.`;
    else html = `✗ Has hecho la ${other}, no la ${L}. La ${L} es <code>${esc(tr.setup || 'sin setup')}</code>.`;
    if (O.trainer.state().phase === 'ask') O.trainer.cubeAnswer({ ok, clean: tr.clean }, secs, html);
    O.trainer.next(true);   // the next letter, from wherever the cube is now
  }
  function trRestart() { trStart(); renderTrain(); }
  function renderTrain() {
    const connected = cube.status === 'on' && !!cube.state;
    $('trHow').hidden = !connected;
    $('trHowType').setAttribute('aria-pressed', String(!trUseCube));
    $('trHowCube').setAttribute('aria-pressed', String(trUseCube));
    const on = trActive();
    const form = $('trForm');
    form.classList.toggle('cube', on);
    form.classList.toggle('ask', on && O.trainer.state().phase === 'ask');
    const line = $('trCubeLine');
    line.hidden = !on;
    // The card's text says how to answer: swap it while answering on the cube, put it back after.
    O.trainer.hint(on ? 'Haz cada letra en el cubo tal como esté, no hace falta que esté resuelto. Si te equivocas, deshaz o empieza la letra desde ahí.' : null);
    const desc = $('trDesc');
    if (!on) {
      if (tr.descSet != null && desc.innerHTML === tr.descSet) desc.innerHTML = tr.descSaved;
      tr.descSet = null;
      return;
    }
    if (tr.letter) {
      const want = `Hazla en el cubo: el setup que lleva ${tr.letter} a <b>${MODES[tr.kind].swap}</b>, la ${tr.algName} y deshacer el setup.`;
      if (desc.innerHTML !== tr.descSet || tr.descFor !== want) {
        if (desc.innerHTML !== tr.descSet) tr.descSaved = desc.innerHTML;
        desc.innerHTML = want;
        tr.descSet = desc.innerHTML;
        tr.descFor = want;
      }
    }
    const P = tr.path;
    if (!P) { line.innerHTML = ''; return; }
    const segs = tr.setup ? ['Setup', tr.algName, 'Deshacer'] : [tr.algName];
    const cur = segOf(P, P.pos);
    const chips = segs.map((name, i) => {
      const from = i ? P.segEnd[i - 1] : 0;
      const n = P.segEnd[i] - from;
      const cls = i < cur ? 'done' : i === cur && P.pos > from ? 'cur' : '';
      const count = i === cur && P.pos > from ? ` ${P.pos - from}/${n}` : '';
      return `<span class="tr-step ${cls}">${i < cur ? '✓ ' : ''}${name}${count}</span>`;
    }).join('');
    let hint = '';
    let tone = '';
    if (P.lost) { hint = 'Te has perdido. Empieza la letra desde como está el cubo ahora.'; tone = 'bad'; }
    else if (P.off.length) { hint = `Ese giro no toca. Deshaz: <b>${undoFor(P)}</b>`; tone = 'bad'; }
    else if (!P.pos) hint = 'Cuando quieras: el tiempo cuenta desde que sale la letra.';
    line.innerHTML = `<div class="tr-steps">${chips}</div>`
      + (hint ? `<p class="cube-hint ${tone}">${hint}</p>` : '')
      + (P.off.length || P.lost ? '<button class="btn" type="button" data-tr-restart>Empezar la letra desde aquí</button>' : '');
  }
  $('trCubeLine').addEventListener('click', (ev) => { if (ev.target.closest('[data-tr-restart]')) { tr.clean = false; const keep = tr.t0; trStart(); tr.t0 = keep; tr.clean = false; renderTrain(); } });
  function trSync() {
    if (trActive()) {
      const s = O.trainer.state();
      if (!tr.path || tr.letter !== s.letter || tr.t0 !== s.t0) trStart();
    } else tr.path = null;
    renderTrain();
  }
  document.addEventListener('op3:train', trSync);
  O.onView('entrenar', trSync);
  const setHow = (useCube) => {
    trUseCube = useCube;
    try { localStorage.setItem(TR_KEY, useCube ? 'cube' : 'type'); } catch (e) { /* this visit only */ }
    tr.path = null;
    trSync();
  };
  $('trHowType').addEventListener('click', () => setHow(false));
  $('trHowCube').addEventListener('click', () => setHow(true));

  // ================= Guided execution on the cube =================
  // With «Ejecución guiada» open, the steps move on by themselves as you turn the real cube, from the
  // scramble to solved; a wrong turn is caught at once.
  const gd = { path: null, cheered: false };
  const guideActive = () => cube.status === 'on' && !!cube.state && O.guideApi.open();
  function guideStart() {
    gd.path = null;
    gd.cheered = false;
    const start = O.guideApi.start();
    if (!guideActive() || !start) { renderGuideCube(); return; }
    const steps = O.guideApi.steps().filter((s) => !s.end);
    gd.path = makePath(start, steps.map((s) => (s.isAlg ? s.seq : s.move)));
    // Start the search from the step on screen, then go wherever the cube really is.
    const i = O.guideApi.index();
    gd.path.pos = i ? gd.path.segEnd[i - 1] || 0 : 0;
    // A solved cube is the end of the path too, but on opening it means «not scrambled yet».
    const fresh = isSolved(cube.state) && !isSolved(norm(start));
    if (fresh || !pathLocate(gd.path, cube.state)) gd.path.lost = true;
    guideShow();
  }
  function guideMove(mv) {
    if (!gd.path) return;
    pathMove(gd.path, mv, cube.state);
    guideShow();
  }
  function guideShow() {
    const P = gd.path;
    if (P && !P.lost && !P.off.length) {
      const step = segOf(P, P.pos);
      if (step !== O.guideApi.index()) O.guideApi.go(step);
      if (P.pos >= P.total && isSolved(cube.state) && !gd.cheered) { gd.cheered = true; celebrate(); }
    }
    renderGuideCube();
  }
  function renderGuideCube() {
    const el = $('guideCube');
    const P = gd.path;
    el.hidden = !guideActive();
    if (el.hidden) return;
    let html = '';
    let tone = '';
    if (!P || P.lost) {
      const v = followView();
      if (v && !follow.lost && follow.prog < follow.moves.length) {
        html = follow.off.length
          ? `Primero mezcla el cubo. Ese giro no toca, deshaz: <b>${undoText()}</b>`
          : `Primero mezcla el cubo con el scramble: giro ${follow.prog + 1} de ${follow.moves.length}, <b>${follow.moves[follow.prog].text}</b>${follow.halfway ? ' (falta la otra mitad)' : ''}`;
        tone = follow.off.length ? 'bad' : '';
      } else {
        html = 'Tu cubo no está en ningún punto de esta resolución. Resuélvelo y mézclalo con el scramble de «Practicar».';
        tone = 'bad';
      }
    } else if (P.off.length) {
      html = `Ese giro no toca. Deshaz: <b>${undoFor(P)}</b>`;
      tone = 'bad';
    } else if (P.pos >= P.total) {
      html = isSolved(cube.state) ? '✓ Resuelto, y lo ha comprobado el cubo' : 'Has hecho todo el memo, pero el cubo no queda resuelto: el memo tiene algún error.';
      tone = isSolved(cube.state) ? 'ok' : 'bad';
    } else {
      // Inside a whole algorithm: how far, and the turns already done dimmed.
      const step = segOf(P, P.pos);
      const from = step ? P.segEnd[step - 1] : 0;
      const s = O.guideApi.steps()[step];
      if (s && s.isAlg) {
        const mv = parseAlg(s.seq);
        const done = P.pos - from;
        $('guideSeq').innerHTML = mv.map((m, k) => `<span class="sm${k < done ? ' done' : k === done ? ' next' : ''}">${m.text}</span>`).join(' ');
        html = `Siguiendo tu cubo · ${s.move}: ${done} de ${mv.length}`;
      } else html = 'Siguiendo tu cubo: haz el giro y pasa solo al siguiente';
    }
    el.className = `guide-cube ${tone}`;
    if (el.dataset.h !== html) { el.dataset.h = html; el.innerHTML = html; }
  }
  document.addEventListener('op3:guide', (ev) => { if (ev.detail && ev.detail.open) guideStart(); else { gd.path = null; renderGuideCube(); } });

  // ================= For the stream overlay =================
  // The live cube, how far the scramble is, and the turns and letters of the attempt (or the last one).
  function overlayState() {
    const a = attempt || last;
    const on = cube.status === 'on' && !!cube.state;
    if (!on && !(a && a.live)) return null;
    const out = {};
    if (on) {
      out.name = cube.hw || cube.name;
      out.bat = cube.battery;
      out.net = ['U', 'L', 'F', 'R', 'B', 'D'].map((f) => {
        const base = 9 * O.FACE_ORDER.indexOf(f);
        return cube.state.slice(base, base + 9).map(faceOfSticker).join('');
      }).join('');
      out.scr = follow.moves.length
        ? { n: follow.moves.length, done: follow.prog, half: follow.halfway, undo: follow.off.length ? undoText() : '', lost: follow.lost }
        : null;
    }
    if (a && a.live && a.moves.length) {
      out.live = {
        cur: a === attempt, at: a.at || null, n: a.moves.length, letters: lettersLine(a.live.done),
        moves: simplify(a.moves.slice(-30)).map(moveText).slice(-10),
        checked: !!a.auto, why: a.why || '',
      };
    }
    return out;
  }

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
      if (ph !== 'idle') scr.innerHTML = liveHtml(attempt) || '<span class="cube-hint">Memorizando: el primer giro empieza la ejecución.</span>';
      else scr.innerHTML = v ? `<span class="cube-chips">${v.chips}</span><span class="cube-hint ${v.tone}">${v.hint}</span>` : '<span class="cube-hint">No hay scramble: pulsa «Nuevo scramble».</span>';
    }
    if (cube.status === 'on') renderBar();
    $('readCube').hidden = !on;
    $('cubeUseState').hidden = !(on && ph === 'idle' && follow.lost && !isSolved(cube.state));
    trSync();
    if (O.guideApi.open()) { if (on && !gd.path) guideStart(); else renderGuideCube(); }
    // Competition mode: the turns and letters at the bottom, kept after the attempt until the next one.
    $('focusMoves').innerHTML = liveHtml(attempt || last);
    O.refreshFocus();
    document.dispatchEvent(new CustomEvent('op3:cube'));
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

  // ================= Reading the cube =================
  // Scrambled by hand however you like: the app works out a scramble for that state (the inverse of a
  // solution) and makes it the current one, so the memo, the checks and the timer all use it.
  function freshFacelets(ms) {
    return new Promise((resolve) => {
      const sub = cube.link && cube.link.events$.subscribe((ev) => { if (ev && ev.type === 'FACELETS') { done(); } });
      const t = setTimeout(() => done(), ms);
      function done() { clearTimeout(t); try { if (sub) sub.unsubscribe(); } catch (e) { /* closed */ } setTimeout(resolve, 0); }
      request('REQUEST_FACELETS');
    });
  }
  async function readCube(btn, tell) {
    if (!cube.state) return;
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Leyendo…';
    try {
      await freshFacelets(600);
      if (!cube.state) throw new Error('desconectado');
      if (isSolved(cube.state)) { tell('El cubo está resuelto: mézclalo como quieras y vuelve a pulsar.', 'ko'); return; }
      // Your own turns since it was solved, if the app saw them all; otherwise a solver's scramble.
      let scr = handMoves ? O.simplifyAlg(handMoves.join(' ')) : '';
      const ok = scr && parseAlg(scr).length <= 30 && key(norm(apply(solved(), scr))) === key(cube.state);
      if (!ok) scr = await O.withTimeout(O.solveState(toFacelets(cube.state)), 30000);
      O.loadPractice(scr, '', '');
      tell(`Scramble leído de tu cubo (${parseAlg(scr).length} movimientos). Haz tu memo y compruébalo, o pulsa «Generar memo recomendado» para verlo.`, 'ok');
    } catch (e) {
      tell('No he podido sacar el scramble ahora mismo (el generador no ha cargado). Vuelve a probar en unos segundos.', 'ko');
    } finally {
      btn.disabled = false;
      btn.textContent = label;
      render();
    }
  }
  const tellPractice = (msg, tone) => { const out = $('result'); out.className = `result ${tone || ''}`; out.innerHTML = `<p>${msg}</p>`; };
  $('readCube').addEventListener('click', () => readCube($('readCube'), tellPractice));
  $('cubeUseState').addEventListener('click', () => readCube($('cubeUseState'), (msg, tone) => say(tone === 'ok' ? 'Listo: el scramble de la app es ahora el de tu cubo.' : msg, tone)));

  // ================= Buttons =================
  $('cubeConnect').addEventListener('click', () => { unlockAudio(); connectGan(); });
  $('cubeSim').addEventListener('click', () => { unlockAudio(); say(''); attach(simLink(), 'sim'); });
  $('cubeOff').addEventListener('click', () => {
    if (macWaiting) macWaiting();
    detach();
    say('');
  });
  $('cubeSync').addEventListener('click', () => {
    if (!cube.link) return;
    request('REQUEST_RESET');
    cube.state = solved();
    handMoves = [];
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
    overlay: overlayState,
    attach, detach, connectGan, simLink, simSolve, simSolution, simMemo, flawed, fromFacelets, toFacelets, norm, facePath,
    get state() { return cube.state; },
    get status() { return cube.status; },
    get link() { return cube.link; },
    get last() { return last; },
    get guidePath() { return gd.path; },
    fxLog,
    analyze,
  };
})();
