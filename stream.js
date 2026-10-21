// Stream overlay: sends the app's live state to overlay.html, from either page (the 3BLD app or
// «Fridrich reducido»; the overlay draws whichever sends). Two routes: OBS (obs-websocket → obs-browser
// "emit_event" → browser source) and this browser (BroadcastChannel: the preview here, or an overlay window).
(() => {
  'use strict';
  const OP = window.OP3;
  const FR = window.Fridrich;
  const M = window.CubeModel;
  const $ = (id) => document.getElementById(id);
  const box = $('streamBox');
  if ((!OP && !FR) || !M || !box) return;
  const APP = OP || FR;

  const CFG_KEY = 'op3bld:stream:v1';
  const DEFAULTS = { layout: 'esquinas', net: true, prog: true, memo: true, big: false, demo: false, obs: false, port: 4455, pass: '' };
  const LAYOUTS = ['esquinas', 'derecha', 'izquierda', 'crono'];
  let cfg = (() => {
    try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(CFG_KEY)) || {}) }; } catch (e) { return { ...DEFAULTS }; }
  })();
  if (!LAYOUTS.includes(cfg.layout)) cfg.layout = 'esquinas';
  const saveCfg = () => { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* not kept */ } };
  const readJson = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; } };

  // Several app tabs can be connected at once (another window, the installed app…).
  // Each says who it is and when it was last used; the overlay follows the most recent.
  const SRC = Math.random().toString(36).slice(2, 10);
  let act = Date.now();
  const touch = () => { act = Date.now(); };
  // Using a tab makes it the one on stream straight away (sent shortly after, not per key).
  const used = () => { touch(); soon(); };
  ['pointerdown', 'keydown'].forEach((t) => document.addEventListener(t, used, true));
  window.addEventListener('focus', used);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') used(); });

  // ================= State snapshot =================
  const total = (t) => t.memo + t.exec;
  let cubeCache = { scr: null, cube: null, moves: 0 };
  // The overlay draws the net face by face in U L F R B D order.
  const netOf = (st) => {
    let out = '';
    for (const f of ['U', 'L', 'F', 'R', 'B', 'D']) {
      const base = 9 * M.FACE_ORDER.indexOf(f);
      for (let i = 0; i < 9; i++) out += M.faceOfSticker(st[base + i]);
    }
    return out;
  };
  function cubeFor(scr) {
    if (cubeCache.scr === scr) return cubeCache;
    let cube = null;
    let moves = 0;
    try {
      moves = M.parseAlg(scr).length;
      cube = netOf(M.apply(M.solved(), scr));
    } catch (e) { cube = null; moves = 0; }
    cubeCache = { scr, cube, moves };
    return cubeCache;
  }
  // The memo in «Practicar», only if executing it really solves this scramble
  // (the same check as «Comprobar memo»). Shown on stream while executing.
  let memoCache = { key: null, val: null };
  function checkedMemo(scr) {
    const eIn = document.getElementById('memoE');
    const cIn = document.getElementById('memoC');
    if (!scr || !eIn || !cIn) return null;
    const key = `${scr}|${eIn.value}|${cIn.value}`;
    if (memoCache.key === key) return memoCache.val;
    let val = null;
    try {
      const edges = OP.lettersOf(eIn.value);
      const corners = OP.lettersOf(cIn.value);
      const target = (kind, L) => L in OP.MODES[kind].posOf && !OP.MODES[kind].buffer.includes(L);
      if ((edges.length || corners.length) && edges.every((L) => target('edge', L)) && corners.every((L) => target('corner', L))) {
        let st = OP.apply(OP.solved(), scr);
        edges.forEach((L) => { st = OP.apply(st, OP.conjugate(OP.MODES.edge.table[L], OP.ALGS.T.moves)); });
        if (edges.length % 2) st = OP.apply(st, OP.ALGS.P.moves);
        corners.forEach((L) => { st = OP.apply(st, OP.conjugate(OP.MODES.corner.table[L], OP.ALGS.Y.moves)); });
        if (OP.isSolved(st)) val = { e: OP.pairs(edges), c: OP.pairs(corners) };
      }
    } catch (e) { val = null; }
    memoCache = { key, val };
    return val;
  }
  // «Fridrich reducido»: times with penalties, the splits per step and the case being done.
  function snapshotCfop() {
    const val = (r) => (r.pen === 'dnf' ? Infinity : r.t + (r.pen === 2 ? 2000 : 0));
    const times = FR.times();
    const timer = FR.timerState();
    const scr = timer.phase !== 'idle' && timer.scramble ? timer.scramble : FR.scramble();
    const c = cubeFor(scr);
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const today = times.filter((t) => t.at >= dayStart.getTime());
    const okToday = today.filter((t) => t.pen !== 'dnf');
    const okAll = times.filter((t) => t.pen !== 'dnf');
    const groups = (sp) => (sp ? [[0], [1], [2, 3], [4, 5]].map((idx) => (idx.every((i) => sp.s[i]) ? idx.reduce((a, i) => a + sp.s[i][0], 0) : null)) : null);
    const caseNames = (sp) => (sp ? [2, 3, 4, 5].map((i) => {
      const x = sp.s[i];
      if (!x) return null;
      if (x[4]) return 'salto';
      const k = x[3] && window.Cfop && window.Cfop.caseById(x[3]);
      return k ? k.name : null;
    }).filter(Boolean).join(' · ') : '');
    const last = times.length ? times[times.length - 1] : null;
    let lastOut = null;
    if (last) {
      const before = times.slice(0, -1).filter((t) => t.pen !== 'dnf');
      const prevBest = before.length ? Math.min(...before.map(val)) : null;
      lastOut = {
        ok: last.pen !== 'dnf', t: last.t, pen: last.pen || 0, at: last.at,
        first: last.pen !== 'dnf' && !before.length,
        pb: last.pen !== 'dnf' && prevBest != null && val(last) < prevBest,
        sp: groups(last.sp), cases: caseNames(last.sp),
        records: FR.recordsOf ? FR.recordsOf(last).map((x) => ({ k: x.k, v: Math.round(x.v) })) : [],
        pace: FR.paceFor ? FR.paceFor(last) : null,
      };
    }
    const learned = (prefix) => {
      let n = 0;
      let all = 0;
      const learn = readJson('cfop:learn:v1', {});
      (window.Cfop ? window.Cfop.CASES : []).forEach((k) => { if (k.step.startsWith(prefix)) { all++; if (learn[k.id] === 'known') n++; } });
      return [n, all];
    };
    let smart = null;
    const cube = FR.cube();
    if (cube && cube.on) {
      const live = FR.live();
      smart = {
        name: cube.name,
        net: netOf(cube.state),
        scr: live && live.scr ? { n: live.scr.n, done: live.scr.pos, half: live.scr.half, undo: live.scr.undo, lost: live.scr.lost } : null,
        live: live ? { stage: live.stage, pairs: live.pairs, steps: live.splits, skips: live.skips, case: live.case } : null,
        pace: FR.pace ? FR.pace() : null,
      };
    }
    const fin = (x) => (x === Infinity ? -1 : x);
    return {
      v: 1, mode: 'cfop', at: Date.now(), src: SRC, act,
      name: String(readJson('op3bld:name:v1', '') || '').slice(0, 24),
      scr, moves: c.moves, cube: c.cube, timer, last: lastOut, smart,
      today: {
        n: today.length, ok: okToday.length,
        best: okToday.length ? Math.min(...okToday.map(val)) : null,
        ao5: today.length >= 5 ? fin(FR.avgOf(today, 5)) : null,
        ao12: today.length >= 12 ? fin(FR.avgOf(today, 12)) : null,
      },
      record: okAll.length ? Math.min(...okAll.map(val)) : null,
      total: { n: times.length, ok: okAll.length },
      recent: today.slice(-6).map((t) => ({ ok: t.pen !== 'dnf', t: val(t) })),
      learned: { oll: learned('oll'), pll: learned('pll') },
      learn: FR.learnState ? FR.learnState() : null,
    };
  }
  function snapshot() {
    if (!OP) return snapshotCfop();
    const times = OP.data.times();
    const timer = OP.timerState();
    const scr = timer.phase !== 'idle' && timer.scramble ? timer.scramble : OP.scramble();
    const c = cubeFor(scr);
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const today = times.filter((t) => t.at >= dayStart.getTime());
    const okToday = today.filter((t) => t.ok);
    let streak = 0;
    for (let i = today.length - 1; i >= 0 && today[i].ok; i--) streak++;
    const okAll = times.filter((t) => t.ok);
    const last = times.length ? times[times.length - 1] : null;
    let lastOut = null;
    if (last) {
      const before = times.slice(0, -1).filter((t) => t.ok);
      const prevBest = before.length ? Math.min(...before.map(total)) : null;
      lastOut = {
        ok: !!last.ok, memo: last.memo, exec: last.exec, at: last.at, mem: last.mem || '',
        first: !!last.ok && !before.length,
        pb: !!last.ok && prevBest != null && total(last) < prevBest,
      };
    }
    const train = OP.data.train() || {};
    const mastered = (kind) => {
      const d = train[kind] || {};
      const letters = OP.trainLetters(kind);
      return [letters.filter((L) => d[L] && d[L].streak >= 3).length, letters.length];
    };
    let learn = null;
    if (OP.learn) {
      const done = OP.learn.get().done;
      learn = { done: OP.learn.lessons.filter((l) => done[l.id]).length, total: OP.learn.lessons.length };
    }
    let reto = null;
    if (OP.timerTag) {
      const r = readJson('op3bld:retos:v1', []).find((x) => x.id === OP.timerTag);
      reto = r ? String(r.by || '').slice(0, 24) : null;
    }
    return {
      v: 1, at: Date.now(), src: SRC, act,
      name: String(readJson('op3bld:name:v1', '') || '').slice(0, 24),
      reto, scr, moves: c.moves, cube: c.cube, timer, last: lastOut,
      smart: OP.cube && OP.cube.overlay ? OP.cube.overlay() : null,
      memo: timer.phase !== 'idle' ? checkedMemo(scr) : null,
      today: {
        n: today.length, ok: okToday.length, streak,
        best: okToday.length ? Math.min(...okToday.map(total)) : null,
        mean: okToday.length ? okToday.reduce((a, t) => a + total(t), 0) / okToday.length : null,
      },
      record: okAll.length ? Math.min(...okAll.map(total)) : null,
      total: { n: times.length, ok: okAll.length },
      recent: today.slice(-6).map((t) => ({ ok: !!t.ok, t: total(t) })),
      learn,
      train: { edge: mastered('edge'), corner: mastered('corner') },
    };
  }

  // ================= Sending =================
  const bc = 'BroadcastChannel' in window ? new BroadcastChannel('op3bld-live') : null;
  // Heartbeat, only once something listens: a reloaded browser source catches up within a few seconds.
  let beat = 0;
  const heartbeat = () => { if (!beat) beat = setInterval(() => push(), 3000); };
  if (bc) bc.onmessage = (e) => { if (e.data && e.data.type === 'hello') { heartbeat(); push(); } };
  function push(extraTimer) {
    let s;
    try { s = snapshot(); } catch (e) { return; }
    if (extraTimer) s.timer = { ...s.timer, ...extraTimer };
    const json = JSON.stringify(s);
    if (bc) bc.postMessage({ type: 'state', p: json });
    obsSend(json);
  }
  let soonT = 0;
  const soon = () => { clearTimeout(soonT); soonT = setTimeout(() => push(), 120); };
  // Timer presses go out at once, so the overlay starts and stops with the key.
  document.addEventListener('op3:timer', (e) => { touch(); push(e.detail && e.detail.cancelled ? { cancelled: true } : null); });
  document.addEventListener('op3:result', soon);
  document.addEventListener('op3:scramble', soon);
  document.addEventListener('op3:changed', soon);
  // Smart cube turns come many per second: send at most every 150 ms, and always the last one.
  let cubeT = 0;
  let cubeAt = 0;
  ['fr:timer'].forEach((ev) => document.addEventListener(ev, (e) => { touch(); push(e.detail && e.detail.cancelled ? { cancelled: true } : null); }));
  ['fr:result', 'fr:scramble', 'fr:record', 'fr:train', 'fr:view'].forEach((ev) => document.addEventListener(ev, soon));
  ['op3:cube', 'fr:cube'].forEach((ev) => document.addEventListener(ev, () => {
    const wait = 150 - (Date.now() - cubeAt);
    if (wait <= 0) { cubeAt = Date.now(); push(); return; }
    if (!cubeT) cubeT = setTimeout(() => { cubeT = 0; cubeAt = Date.now(); push(); }, wait);
  }));
  // Name fields (Retos / Ajustes) save on change; the overlay shows that name.
  document.addEventListener('change', (e) => { if (e.target && e.target.matches && e.target.matches('[data-name-input]')) soon(); });

  // ================= obs-websocket (v5) =================
  let ws = null;
  let ready = false;
  let want = false;
  let retries = 0;
  let retryT = 0;
  let reqN = 0;
  let obsVersion = '';
  async function sha256b64(str) {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    let bin = '';
    new Uint8Array(d).forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }
  function setStatus(msg, tone) {
    const el = $('ovStatus');
    if (el) { el.textContent = msg; el.className = 'hint' + (tone ? ' ' + tone : ''); }
    const live = $('obsLive');
    if (live) live.hidden = !ready;
  }
  function obsClose() {
    want = false;
    clearTimeout(retryT);
    ready = false;
    if (ws) { const s = ws; ws = null; try { s.close(); } catch (e) { /* already closed */ } }
  }
  function obsConnect() {
    if (ws) { const s = ws; ws = null; try { s.close(); } catch (e) { /* already closed */ } }
    ready = false;
    want = true;
    clearTimeout(retryT);
    if (!window.WebSocket || !window.crypto || !crypto.subtle) { setStatus('Este navegador no puede conectarse con OBS.', 'bad'); return; }
    setStatus('Conectando con OBS…');
    let sock;
    try { sock = new WebSocket(`ws://127.0.0.1:${cfg.port}`); } catch (e) { setStatus(`No se ha podido abrir la conexión: ${e.message}`, 'bad'); return; }
    ws = sock;
    sock.onmessage = async (ev) => {
      if (ws !== sock) return;
      let m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.op === 0) {
        const d = { rpcVersion: 1, eventSubscriptions: 0 };
        const auth = m.d && m.d.authentication;
        obsVersion = (m.d && m.d.obsStudioVersion) || '';
        if (auth) {
          if (!cfg.pass) {
            want = false;
            sock.close();
            setStatus('OBS pide contraseña: cópiala en OBS desde Tools → WebSocket Server Settings → Show Connect Info.', 'bad');
            return;
          }
          d.authentication = await sha256b64((await sha256b64(cfg.pass + auth.salt)) + auth.challenge);
        }
        sock.send(JSON.stringify({ op: 1, d }));
      } else if (m.op === 2) {
        ready = true;
        retries = 0;
        setStatus(`Conectado a OBS${obsVersion ? ' ' + obsVersion : ''}. El overlay se actualiza solo mientras uses la app.`, 'ok');
        heartbeat();
        push();
      } else if (m.op === 7) {
        const st = m.d && m.d.requestStatus;
        if (st && !st.result) setStatus(`OBS no ha aceptado los datos: ${st.comment || 'código ' + st.code}.`, 'bad');
      }
    };
    sock.onclose = (ev) => {
      if (ws !== sock) return;
      ws = null;
      ready = false;
      if (ev.code === 4009) {
        want = false;
        setStatus('La contraseña no es correcta. Vuelve a copiarla desde OBS (Show Connect Info).', 'bad');
        return;
      }
      if (!want) { setStatus('Desconectado de OBS.'); return; }
      retries++;
      const wait = Math.min(30, 3 * retries);
      setStatus(`No encuentro OBS en el puerto ${cfg.port}. Comprueba que está abierto y con el servidor WebSocket activado. Reintento en ${wait} s…`, 'bad');
      retryT = setTimeout(obsConnect, wait * 1000);
    };
  }
  function obsSend(json) {
    if (!ready || !ws || ws.readyState !== 1) return;
    ws.send(JSON.stringify({
      op: 6,
      d: {
        requestType: 'CallVendorRequest',
        requestId: 'op3-' + (++reqN),
        requestData: { vendorName: 'obs-browser', requestType: 'emit_event', requestData: { event_name: 'op3bld', event_data: { p: json } } },
      },
    }));
  }

  // ================= Settings panel =================
  function overlayUrl(extra) {
    const q = new URLSearchParams();
    if (cfg.layout !== 'esquinas') q.set('layout', cfg.layout);
    if (!cfg.net) q.set('net', '0');
    if (!cfg.prog) q.set('prog', '0');
    if (!cfg.memo) q.set('memo', '0');
    if (cfg.big && (cfg.layout === 'esquinas' || cfg.layout === 'crono')) q.set('size', 'grande');
    if (extra && extra.demo && !OP) q.set('modo', 'cfop');
    Object.entries(extra || {}).forEach(([k, v]) => q.set(k, v));
    const qs = q.toString();
    return new URL(`overlay.html${qs ? '?' + qs : ''}`, location.href).href;
  }
  let built = false;
  let available = null;
  function build() {
    built = true;
    box.innerHTML = (OP
      ? '<p>Muestra en tu directo el cronómetro, el scramble con el dibujo del cubo, tus números de hoy y lo que llevas aprendido. Se actualiza solo mientras usas la app. El nombre que aparece es el de «Tu nombre en los retos», más abajo.</p>'
      : '<p>El mismo overlay que en la página de 3BLD: si ya lo tienes en OBS, no hay que tocar nada. Muestra el cronómetro con los tiempos de cruz, F2L, OLL y PLL, el caso que estás haciendo, el scramble con el cubo y tus medias de hoy. Sigue a la página que estés usando.</p>')
      + '<div class=ov-preview><iframe id=ovFrame title="Vista previa del overlay" tabindex=-1></iframe><span class=ov-cam>Tu cámara</span></div>'
      + '<div class=ov-opts>'
      + '<div class=field><label for=ovLayout>Disposición</label><select id=ovLayout class=text-input>'
      + '<option value=esquinas>Esquinas (recomendada)</option><option value=derecha>Columna a la derecha</option>'
      + '<option value=izquierda>Columna a la izquierda</option><option value=crono>Solo el cronómetro</option></select></div>'
      + '<div class=ov-checks>'
      + '<label class=check><input type=checkbox id=ovNet> Dibujo del cubo</label>'
      + '<label class=check><input type=checkbox id=ovProg> Progreso de aprendizaje</label>'
      + `<label class=check title="Solo si el memo de «Practicar» resuelve el scramble"${OP ? '' : ' hidden'}><input type=checkbox id=ovMemo> Mi memo al ejecutar</label>`
      + '<label class=check><input type=checkbox id=ovBig> Tarjetas grandes (Discord)</label>'
      + '<label class=check><input type=checkbox id=ovDemo> Ver con datos de ejemplo</label>'
      + '</div></div>'
      + '<h3 class=ov-step><span>1</span> Añade el overlay en OBS</h3>'
      + '<p>En OBS: <b>Sources → + → Browser</b>. Pega esta URL, pon <b>Width 1920</b> y <b>Height 1080</b>, y deja la fuente encima de la cámara.</p>'
      + '<div class=inrow><input id=ovUrl class=text-input readonly aria-label="URL del overlay"><button class=btn type=button id=ovCopy>Copiar URL</button></div>'
      + '<h3 class=ov-step><span>2</span> Conecta la app con OBS</h3>'
      + '<p>En OBS: <b>Tools → WebSocket Server Settings</b>, marca <b>Enable WebSocket server</b>, pulsa <b>Show Connect Info</b> y copia la <b>Server Password</b>.</p>'
      + '<div class=fields><div class=field><label for=ovPass>Contraseña del servidor</label><input id=ovPass type=password autocomplete=off spellcheck=false></div>'
      + '<div class=field><label for=ovPort>Puerto</label><input id=ovPort type=number min=1 max=65535 inputmode=numeric></div></div>'
      + '<div class=actions><button class="btn primary" type=button id=ovConnect>Conectar con OBS</button><button class=btn type=button id=ovDisconnect>Desconectar</button></div>'
      + '<p class=hint id=ovStatus aria-live=polite></p>'
      + '<p class=hint>Si el navegador pregunta si esta web puede acceder a otras apps o dispositivos de tu equipo, dale a <b>Permitir</b>: es la conexión con OBS. La app tiene que estar abierta durante el directo; la contraseña se queda solo en este navegador.</p>'
      + '<details class=ov-more><summary>Para Discord</summary><p>En OBS pulsa <b>Start Virtual Camera</b> y en Discord elige <b>OBS Virtual Camera</b> como cámara. Discord comprime mucho el vídeo: si los números se ven pequeños, marca «Tarjetas grandes».</p></details>'
      + '<details class=ov-more><summary>Sin el servidor WebSocket de OBS</summary><p>Abre el overlay en una ventana con fondo verde y añádela en OBS con <b>Window Capture</b> y un filtro <b>Chroma Key</b>. La ventana tiene que estar abierta y a la vista (sin minimizar).</p>'
      + '<div class=actions><button class=btn type=button id=ovWindow>Abrir el overlay en una ventana</button></div></details>';

    $('ovLayout').value = cfg.layout;
    $('ovNet').checked = cfg.net;
    $('ovProg').checked = cfg.prog;
    $('ovMemo').checked = cfg.memo;
    $('ovBig').checked = cfg.big;
    $('ovDemo').checked = cfg.demo;
    $('ovPass').value = cfg.pass;
    $('ovPort').value = String(cfg.port);
    const changed = () => {
      cfg.layout = $('ovLayout').value;
      cfg.net = $('ovNet').checked;
      cfg.prog = $('ovProg').checked;
      cfg.memo = $('ovMemo').checked;
      cfg.big = $('ovBig').checked;
      cfg.demo = $('ovDemo').checked;
      saveCfg();
      refresh();
    };
    ['ovLayout', 'ovNet', 'ovProg', 'ovMemo', 'ovBig', 'ovDemo'].forEach((id) => $(id).addEventListener('change', changed));
    $('ovPass').addEventListener('change', () => { cfg.pass = $('ovPass').value.trim(); saveCfg(); });
    $('ovPort').addEventListener('change', () => {
      const p = Math.round(Number($('ovPort').value));
      cfg.port = p >= 1 && p <= 65535 ? p : 4455;
      $('ovPort').value = String(cfg.port);
      saveCfg();
    });
    $('ovCopy').addEventListener('click', async () => {
      const url = $('ovUrl').value;
      try { await navigator.clipboard.writeText(url); toast('URL copiada'); } catch (e) { $('ovUrl').select(); toast('Cópiala con Ctrl+C'); }
    });
    $('ovConnect').addEventListener('click', () => {
      cfg.pass = $('ovPass').value.trim();
      cfg.obs = true;
      saveCfg();
      retries = 0;
      obsConnect();
    });
    $('ovDisconnect').addEventListener('click', () => {
      cfg.obs = false;
      saveCfg();
      obsClose();
      setStatus('Desconectado de OBS.');
    });
    $('ovWindow').addEventListener('click', () => {
      window.open(overlayUrl({ bg: 'chroma' }), 'op3overlay', 'popup,width=1280,height=720');
    });
    if (ready) setStatus(`Conectado a OBS${obsVersion ? ' ' + obsVersion : ''}. El overlay se actualiza solo mientras uses la app.`, 'ok');
    else if (!cfg.obs) setStatus('Sin conectar.');
    refresh();
  }
  function refresh() {
    $('ovUrl').value = overlayUrl();
    const lateral = cfg.layout === 'derecha' || cfg.layout === 'izquierda';
    $('ovBig').disabled = lateral;
    $('ovBig').closest('label').title = lateral ? 'En las columnas las tarjetas ya ocupan todo el alto' : '';
    $('ovNet').disabled = cfg.layout === 'crono';
    $('ovProg').disabled = cfg.layout === 'crono';
    const src = overlayUrl(cfg.demo ? { demo: '1' } : {});
    const f = $('ovFrame');
    if (f.dataset.src !== src) { f.dataset.src = src; f.src = src; }
  }
  function toast(msg) {
    const t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.h);
    toast.h = setTimeout(() => { t.hidden = true; }, 2400);
  }
  // The overlay page only exists in the published app, not in a single-file copy.
  async function checkAvailable() {
    if (available !== null) return available;
    try {
      const r = await fetch('overlay.html', { method: 'HEAD', cache: 'no-store' });
      available = r.ok;
    } catch (e) { available = false; }
    return available;
  }
  async function open() {
    if (built) { refresh(); return; }
    if (!(await checkAvailable())) {
      box.innerHTML = '<p>El overlay para OBS funciona desde la app publicada: ábrela en <b>old-pochmann-3bld.vercel.app</b> y entra en Ajustes.</p>';
      return;
    }
    build();
  }
  APP.onView('ajustes', open);
  if (APP.currentView() === 'ajustes') open();

  // A small "on air" mark next to the timer while OBS is connected.
  const head = document.querySelector('[data-view=crono] .panel-head');
  if (head) {
    const live = document.createElement('span');
    live.className = 'obs-live';
    live.id = 'obsLive';
    live.hidden = true;
    live.textContent = 'En OBS';
    head.insertBefore(live, head.children[1] || null);
  }
  if (cfg.obs) obsConnect();
})();
