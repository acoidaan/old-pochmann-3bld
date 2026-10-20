// A GAN smart cube over Web Bluetooth (or a virtual one with ?cubo=virtual), for pages other than the 3BLD
// one (cube.js has its own, tied to that page). Draws the cube bar (#cubeBar …), asks for the MAC address
// when the browser hides it (#macSheet) and reports the cube's state and every face turn, in the cube's own
// frame: the centres never move, a wide or slice turn arrives as face turns.
//
//   const cube = SmartCube.start({ info, onState(st), onMove(move, st, t), onStatus(status) });
(() => {
  'use strict';
  const M = window.CubeModel;
  if (!M) return;
  const { apply, parseAlg, solved, isSolved, norm, fromFacelets, toFacelets } = M;
  const $ = (id) => document.getElementById(id);
  const key = (st) => st.join(',');
  const esc = (txt) => String(txt).replace(/[&<>'"]/g, (ch) => `&#${ch.charCodeAt(0)};`);

  const LIB = 'vendor/gan-web-bluetooth-3.0.2.js';
  const LIB_CDN = 'https://cdn.jsdelivr.net/npm/gan-web-bluetooth@3.0.2/+esm';
  const MAC_KEY = 'op3bld:cube-mac:v1';   // shared with the 3BLD page: a cube's MAC is asked for once
  const ua = navigator.userAgent || '';
  const isEdge = /\bEdg\//.test(ua);
  const isFirefox = /Firefox\//.test(ua);
  const simAllowed = /[?&]cubo=(virtual|sim)\b/.test(location.search);

  function noBluetoothText() {
    if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) {
      return 'En iPhone y iPad ningún navegador tiene Bluetooth web, tampoco Safari. Ahí solo funciona con la app Bluefy; si no, usa el ordenador o un Android.';
    }
    if (isFirefox) {
      return 'Firefox y los navegadores basados en él (como Zen) no traen Bluetooth web. Se lo añade la extensión '
        + '<a href="https://addons.mozilla.org/firefox/addon/webbt/" target="_blank" rel="noopener">WebBT</a> junto con su programa '
        + '<a href="https://github.com/stevennyman/webbt/releases/latest" target="_blank" rel="noopener">WebBT Server</a> '
        + '(instala los dos y recarga la página). Si da problemas, usa Chrome o Edge.';
    }
    return 'Este navegador no tiene Bluetooth web. Abre la app en Chrome o Edge, en el ordenador o en Android.';
  }

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

  // A cube that only exists here, for trying everything without one. Behaves like a GAN.
  function virtualLink() {
    const subs = new Set();
    let space = solved();   // as held: wide turns and rotations move the centres
    let core = solved();    // what the core feels
    const emit = (ev) => subs.forEach((fn) => fn({ timestamp: performance.now(), ...ev }));
    const later = (fn) => setTimeout(fn, 15);
    const link = {
      deviceName: 'Cubo virtual', deviceMAC: '00:00:00:00:00:00',
      events$: { subscribe(fn) { subs.add(fn); return { unsubscribe() { subs.delete(fn); } }; } },
      sendCubeCommand(c) {
        later(() => {
          if (c.type === 'REQUEST_FACELETS') emit({ type: 'FACELETS', facelets: toFacelets(core) });
          else if (c.type === 'REQUEST_BATTERY') emit({ type: 'BATTERY', batteryLevel: 87 });
          else if (c.type === 'REQUEST_HARDWARE') emit({ type: 'HARDWARE', hardwareName: 'Cubo virtual' });
          else if (c.type === 'REQUEST_RESET') { space = solved(); core = solved(); }
        });
        return Promise.resolve();
      },
      disconnect() { subs.clear(); return Promise.resolve(); },
      turn(alg) {
        for (const m of parseAlg(alg)) {
          space = apply(space, m.text);
          const target = norm(space);
          for (const q of facePath(core, target) || []) {
            core = apply(core, q);
            emit({ type: 'MOVE', move: q, localTimestamp: performance.now() });
          }
          core = target;
        }
      },
      silent(alg) { space = apply(space, alg); core = norm(space); },
      play(algs, tps) {
        const list = algs.flatMap((a) => parseAlg(a).map((m) => m.text));
        const gap = 1000 / (tps || 10);
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

  // ================= The MAC address, when the browser hides it =================
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
  const cleanMac = (v) => {
    const hex = v.toUpperCase().replace(/[^0-9A-F]/g, '');
    return hex.length === 12 ? hex.match(/../g).join(':') : null;
  };
  let macWaiting = null;
  function askMac(device) {
    return new Promise((resolve) => {
      const sheet = $('macSheet');
      if (!sheet) { resolve(null); return; }
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
      const done = (mac) => {
        sheet.hidden = true;
        sheet.removeEventListener('keydown', onKey);
        if (macWaiting === onCancel) macWaiting = null;
        $('macForm').removeEventListener('submit', onSubmit);
        $('macCancel').removeEventListener('click', onCancel);
        if (mac) rememberMac(device, mac);
        resolve(mac);
      };
      const onSubmit = (ev) => {
        ev.preventDefault();
        const mac = cleanMac($('macInput').value);
        if (!mac) { $('macErr').textContent = 'Son 6 parejas de números y letras de la A a la F, como AB:12:CD:34:EF:56.'; return; }
        done(mac);
      };
      const onCancel = () => done(null);
      const onKey = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); onCancel(); } };
      $('macForm').addEventListener('submit', onSubmit);
      $('macCancel').addEventListener('click', onCancel);
      sheet.addEventListener('keydown', onKey);
      macWaiting = onCancel;
    });
  }
  document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const text = $(b.dataset.copy).textContent;
    try { await navigator.clipboard.writeText(text); b.textContent = 'Copiado'; } catch (e) { b.textContent = 'Cópialo a mano'; }
    setTimeout(() => { b.textContent = 'Copiar'; }, 2000);
  }));

  // ================= Sound =================
  let audio = null;
  const fxLog = [];
  function unlockAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audio) audio = new AC();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
    } catch (e) { audio = null; }
  }
  // Three rising notes (C6 E6 G6), or a short single one; synthesised, so it works offline.
  function chime(short) {
    if (!audio) return;
    try {
      const t0 = audio.currentTime + 0.02;
      const notes = short ? [[1319, 0]] : [[1047, 0], [1319, 0.1], [1568, 0.2]];
      notes.forEach(([f, d]) => {
        const o = audio.createOscillator();
        const g = audio.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + d);
        g.gain.exponentialRampToValueAtTime(short ? 0.18 : 0.3, t0 + d + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + (d > 0.15 ? 0.9 : 0.3));
        o.connect(g).connect(audio.destination);
        o.start(t0 + d);
        o.stop(t0 + d + 1);
      });
      fxLog.push(short ? 'tick' : 'chime');
    } catch (e) { /* no sound */ }
  }

  // ================= The connection =================
  function start(opts) {
    const o = opts || {};
    const cube = { link: null, kind: null, status: 'off', name: '', hw: '', battery: null, state: null, sub: null, wait: 0, poll: 0, queue: Promise.resolve(), tries: 0 };
    let lastDevice = null;
    const say = (html, tone, buttons) => {
      const box = $('cubeMsg');
      if (!box) return;
      box.className = `result${tone ? ` ${tone}` : ''}`;
      box.innerHTML = html ? `<p>${html}</p>` : '';
      (buttons || []).forEach(([label, fn]) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'btn'; b.textContent = label;
        b.addEventListener('click', fn);
        box.firstElementChild.appendChild(b);
      });
    };
    let libPromise = null;
    const loadLib = () => {
      if (!libPromise) {
        libPromise = import(new URL(LIB, document.baseURI).href).catch(() => import(LIB_CDN));
        libPromise.catch(() => { libPromise = null; });
      }
      return libPromise;
    };
    function renderBar(note) {
      const s = cube.status;
      $('cubeDot').dataset.s = s;
      const on = s === 'on' || s === 'linking';
      $('cubeConnect').hidden = s !== 'off';
      $('cubeSim').hidden = s !== 'off' || !simAllowed;
      $('cubeSync').hidden = s !== 'on';
      $('cubeOff').hidden = !on && s !== 'connecting';
      $('cubeOff').textContent = s === 'connecting' ? 'Cancelar' : 'Desconectar';
      let name = 'Cubo inteligente';
      let info = o.info || 'Conecta un GAN por Bluetooth.';
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
    const setStatus = (s) => {
      const was = cube.status;
      cube.status = s;
      renderBar();
      if (o.onStatus && was !== s) o.onStatus(s);
    };
    function macProvider(device, fallback) {
      lastDevice = device;
      if (!fallback) {
        const saved = macOf(device);
        if (!saved) renderBar('Buscando la dirección del cubo…');
        return Promise.resolve(saved);
      }
      return askMac(device);
    }
    async function connect() {
      say('');
      if (!navigator.bluetooth || !navigator.bluetooth.requestDevice) { say(noBluetoothText(), 'ko'); return; }
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
        if (mine !== cube.tries) { try { conn.disconnect(); } catch (e) { /* gone */ } return; }
        attach(conn, 'gan');
      } catch (e) {
        if (mine !== cube.tries) return;
        setStatus('off');
        const msg = String((e && e.message) || e);
        const name = e && e.name;
        if (name === 'NotFoundError' && /cancel/i.test(msg)) return;
        if (/adapter/i.test(msg) || (available === false && name === 'NotFoundError')) say('El Bluetooth está apagado (o este equipo no tiene). Enciéndelo y vuelve a probar.', 'ko');
        else if (name === 'NotFoundError') say('No he encontrado ningún cubo. Gíralo un poco para despertarlo, acércalo y vuelve a probar.', 'ko');
        else if (name === 'SecurityError' || name === 'NotAllowedError') say('El navegador no deja usar Bluetooth en esta página. Ábrela directamente en old-pochmann-3bld.vercel.app con Chrome o Edge.', 'ko');
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
        [['Escribir la MAC otra vez', () => { forgetMac(device); connect(); }]]);
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
      if (!st) { if (!cube.state) badData(); return; }
      clearTimeout(cube.wait);
      const changed = !cube.state || key(st) !== key(cube.state);
      cube.state = st;
      if (cube.status !== 'on') { setStatus('on'); say(''); }
      renderBar();
      if (changed && o.onState) o.onState(st);
    }
    function onMove(mv) {
      if (!cube.state) return;   // moves only count once the cube has said what it looks like
      let m;
      try { m = parseAlg(mv)[0]; } catch (e) { return; }
      cube.state = apply(cube.state, m.text);
      if (o.onMove) o.onMove(m.text, cube.state, performance.now());
      renderBar();
    }

    $('cubeConnect').addEventListener('click', () => { unlockAudio(); connect(); });
    $('cubeSim').addEventListener('click', () => { unlockAudio(); say(''); attach(virtualLink(), 'sim'); });
    $('cubeOff').addEventListener('click', () => { if (macWaiting) macWaiting(); detach(); say(''); });
    $('cubeSync').addEventListener('click', () => {
      if (!cube.link) return;
      request('REQUEST_RESET');
      cube.state = solved();
      renderBar();
      if (o.onState) o.onState(cube.state);
      setTimeout(() => request('REQUEST_FACELETS'), 300);
    });
    if (navigator.bluetooth) setTimeout(() => loadLib().catch(() => {}), 1200);
    renderBar();

    return {
      get state() { return cube.state; },
      get status() { return cube.status; },
      get on() { return cube.status === 'on' && !!cube.state; },
      get link() { return cube.link; },
      get kind() { return cube.kind; },
      get name() { return cube.hw || cube.name; },
      connect, attach, detach, say, unlockAudio, chime, fxLog, virtualLink,
    };
  }

  window.SmartCube = { start, facePath, unlockAudio, chime };
})();
