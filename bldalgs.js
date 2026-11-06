// «Entrenar → Algoritmos» on the 3BLD page: the three algorithms of Old Pochmann (T-perm, R-perm and the
// modified Y-perm), one at a time or the three mixed. Three ways: with the smart cube (it follows each turn,
// says what to undo if you go off it, and times from your first turn to the last), timing yourself on a normal
// cube (Space or a tap to start and to stop), or writing it from memory (any algorithm that does the same
// counts). The numbers stay per algorithm (op3bld:algtr:v1) and travel with the sync.
(() => {
  'use strict';
  const O = window.OP3;
  const CF = window.CubeFollow;
  const $ = (id) => document.getElementById(id);
  if (!O || !$('algTr')) return;
  const { ALGS, parseAlg, apply, solved, esc } = O;
  const KEY = 'op3bld:algtr:v1';
  const SET_KEY = 'op3bld:algtr-set:v1';
  const KEYS = ['T', 'P', 'Y'];
  const WHAT = {
    T: 'Intercambia las aristas UL ↔ UR (y de paso las esquinas UFR ↔ UBR). La de las aristas.',
    P: 'La paridad: si hay un número impar de aristas, justo al acabarlas.',
    Y: 'Intercambia las esquinas UBL ↔ DFR (y de paso las aristas UL ↔ UB). La de las esquinas.',
  };
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* this visit */ } };
  const st = { on: false, pick: 'T', how: 'cube', hide: false, alg: 'T', phase: 'ready', t0: 0, F: null, start: null, typed: null, ...load(SET_KEY, {}) };
  st.on = false; st.phase = 'ready'; st.F = null;
  if (![...KEYS, 'all'].includes(st.pick)) st.pick = 'T';
  if (!['cube', 'timer', 'type'].includes(st.how)) st.how = 'cube';
  st.alg = st.pick === 'all' ? 'T' : st.pick;
  let data = load(KEY, {});
  const keep = () => save(SET_KEY, { pick: st.pick, how: st.how, hide: st.hide });
  const movesOf = (k) => parseAlg(ALGS[k].moves).map((m) => m.text);
  const cubeOn = () => !!(O.cube && O.cube.status === 'on' && O.cube.state);
  const how = () => (st.how === 'cube' && !cubeOn() ? 'timer' : st.how);
  const statOf = (k) => { data[k] = data[k] || { n: 0, best: null, last: [], seen: 0, right: 0 }; return data[k]; };
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const tps = (k, ms) => (ms ? (movesOf(k).length / (ms / 1000)).toFixed(1).replace('.', ',') : '—');
  const secs = (ms) => (ms / 1000).toFixed(2).replace('.', ',');

  // ---- One rep
  function record(k, ms) {
    const s = statOf(k);
    s.n++;
    s.best = s.best == null ? ms : Math.min(s.best, ms);
    s.last = [...(s.last || []), Math.round(ms)].slice(-20);
    s.at = Date.now();
    save(KEY, data);
    document.dispatchEvent(new CustomEvent('op3:changed', { detail: { what: 'algtr' } }));
    const pb = s.best === ms && s.n > 1;
    return `${ALGS[k].name} en <b>${secs(ms)} s</b> · ${tps(k, ms)} TPS${pb ? ' · <b>¡tu mejor tiempo!</b>' : ''}`;
  }
  function nextAlg() {
    if (st.pick !== 'all') { st.alg = st.pick; return; }
    const others = KEYS.filter((k) => k !== st.alg);
    st.alg = others[Math.floor(Math.random() * others.length)];
  }
  function armCube() {
    st.start = O.cube.state;
    st.F = CF.makeFollow(st.start, movesOf(st.alg));
    st.t0 = 0;
    st.phase = 'ready';
  }
  function feedback(html, tone) {
    const fb = $('algFb');
    if (!fb) return;
    fb.className = `at-fb ${tone || ''}`;
    fb.innerHTML = html;
  }

  // ---- Drawing
  function chips() {
    const ms = movesOf(st.alg);
    const F = how() === 'cube' ? st.F : null;
    return ms.map((m, i) => {
      let cls = 'sm';
      if (F && !F.lost) { if (i < F.pos) cls += ' done'; else if (i === F.pos) cls += F.halfway ? ' next half' : ' next'; }
      return `<span class="${cls}">${esc(m)}</span>`;
    }).join(' ');
  }
  function statsHtml() {
    const SHORT = { T: 'T-perm', P: 'R-perm', Y: 'Y-perm' };
    return `<table class="at-stats"><thead><tr><th scope="col">Algoritmo</th><th scope="col">Veces</th><th scope="col">Mejor</th><th scope="col">Media de 5</th><th scope="col" class="at-tps">TPS</th><th scope="col">De memoria</th></tr></thead><tbody>${KEYS.map((k) => {
      const s = statOf(k);
      const m5 = (s.last || []).length >= 5 ? mean(s.last.slice(-5)) : null;
      return `<tr${k === st.alg ? ' class="cur"' : ''}><th scope="row">${SHORT[k]}</th><td>${s.n || 0}</td><td>${s.best != null ? `${secs(s.best)} s` : '—'}</td><td>${m5 != null ? `${secs(m5)} s` : '—'}</td><td class="at-tps">${s.best != null ? tps(k, s.best) : '—'}</td><td>${s.seen ? `${s.right} de ${s.seen}` : '—'}</td></tr>`;
    }).join('')}</tbody></table>`;
  }
  function render() {
    const box = $('algTr');
    if (!st.on) return;
    const h = how();
    const k = st.alg;
    const showMoves = h !== 'type' ? !st.hide : st.phase === 'answered';
    const seg = (name, list, cur, label) => `<div class="seg small" role="group" aria-label="${label}">${list.map(([v, t, dis]) => `<button type="button" data-${name}="${v}" aria-pressed="${cur === v}"${dis ? ' disabled' : ''}>${t}</button>`).join('')}</div>`;
    let action = '';
    if (h === 'cube') {
      const F = st.F;
      let hint = 'Con el blanco arriba y el verde delante, hazlo: el tiempo empieza con tu primer giro.';
      if (F && F.lost) hint = 'Te has salido del algoritmo. Deja el cubo como esté y pulsa «Empezar desde aquí».';
      else if (F && F.off.length) hint = `Ese giro no toca. Deshaz: <b>${esc(CF.undoText(F))}</b>`;
      else if (st.phase === 'run') hint = `Giro ${F.pos + (F.halfway ? 0 : 1)} de ${F.n}…`;
      action = `<p class="at-hint${F && (F.lost || F.off.length) ? ' bad' : ''}">${hint}</p><div class="actions"><button class="btn" type="button" id="algRearm">Empezar desde aquí</button></div>`;
    } else if (h === 'timer') {
      const label = st.phase === 'run' ? 'Pulsa para parar' : 'Pulsa (o Espacio) para empezar';
      action = `<button type="button" class="clock at-clock" id="algClock" data-phase="${st.phase === 'run' ? 'exec' : 'idle'}"><span class="clock-phase">${st.phase === 'run' ? 'En marcha' : 'Listo'}</span><span class="clock-time" id="algTime">${st.phase === 'run' ? '0,00' : st.lastMs ? secs(st.lastMs) : '0,00'}</span><span class="clock-split">${label}</span></button>`
        + (cubeOn() ? '' : '<p class="hint">Con el cubo inteligente conectado, además sigue cada giro y para solo.</p>');
    } else {
      action = st.phase === 'answered'
        ? '<div class="actions"><button class="btn primary" type="button" id="algNext">Siguiente</button></div>'
        : `<form class="inrow" id="algForm" autocomplete="off"><input id="algInput" type="text" spellcheck="false" autocapitalize="characters" placeholder="Escríbelo de memoria" aria-label="${esc(ALGS[k].name)} de memoria"><button class="btn primary" type="submit">Comprobar</button></form>`;
    }
    box.innerHTML = `<div class="at-top">
        ${seg('alg-pick', [['T', 'T-perm'], ['P', 'R-perm'], ['Y', 'Y-perm'], ['all', 'Las tres']], st.pick, 'Qué algoritmo')}
        ${seg('alg-how', [['cube', 'Con el cubo', !cubeOn()], ['timer', 'Cronometrando'], ['type', 'Escribiéndolo']], h, 'Cómo practicarlo')}
        ${h !== 'type' ? `<label class="check"><input type="checkbox" id="algHide"${st.hide ? ' checked' : ''}> Ocultar el algoritmo</label>` : ''}
      </div>
      <div class="at-card">
        <div class="at-name"><b>${esc(ALGS[k].name)}</b><span class="muted">${esc(WHAT[k])}</span></div>
        <p class="at-moves${showMoves ? '' : ' hidden-alg'}" aria-live="polite">${showMoves ? chips() : `<span class="muted">${h === 'type' ? 'Escríbelo abajo.' : 'Oculto: hazlo de memoria.'}</span>`}</p>
      </div>
      ${action}
      <p class="at-fb" id="algFb" aria-live="polite"></p>
      ${statsHtml()}`;
    if (st.fb) feedback(st.fb.html, st.fb.tone);
    if (h === 'type' && st.phase !== 'answered') { const inp = $('algInput'); if (inp && st.focusIn) inp.focus(); }
  }

  // ---- Turning it on and off
  function show(on) {
    st.on = on;
    document.body.dataset.trmode = on ? 'alg' : '';
    $('algTr').hidden = !on;
    document.querySelector('.view[data-view="entrenar"] .trainer').hidden = on;
    $('trAlg').setAttribute('aria-pressed', String(on));
    $('hTrain').textContent = on ? 'Entrenar algoritmos' : 'Entrenar setups';
    if (on) {
      $('trEdge').setAttribute('aria-pressed', 'false');
      $('trCorner').setAttribute('aria-pressed', 'false');
      st.phase = 'ready';
      st.fb = null;
      if (how() === 'cube') armCube();
      render();
    }
  }
  $('trAlg').addEventListener('click', () => show(true));
  ['trEdge', 'trCorner'].forEach((id) => $(id).addEventListener('click', () => { if (st.on) show(false); }));

  // ---- Buttons
  $('algTr').addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.algPick) {
      st.pick = b.dataset.algPick;
      keep();
      st.alg = st.pick === 'all' ? KEYS[Math.floor(Math.random() * 3)] : st.pick;
      st.phase = 'ready'; st.fb = null;
      if (how() === 'cube') armCube();
      render();
    } else if (b.dataset.algHow) {
      st.how = b.dataset.algHow;
      keep();
      st.phase = 'ready'; st.fb = null;
      st.focusIn = st.how === 'type';
      if (how() === 'cube') armCube();
      render();
    } else if (b.id === 'algRearm' && cubeOn()) {
      armCube();
      st.fb = null;
      render();
    } else if (b.id === 'algClock') {
      press();
    } else if (b.id === 'algNext') {
      nextAlg();
      st.phase = 'ready'; st.fb = null; st.focusIn = true;
      render();
    }
  });
  $('algTr').addEventListener('change', (ev) => {
    if (ev.target.id === 'algHide') { st.hide = ev.target.checked; keep(); render(); }
  });
  // Written from memory: any algorithm that leaves the cube exactly as this one does.
  $('algTr').addEventListener('submit', (ev) => {
    if (ev.target.id !== 'algForm') return;
    ev.preventDefault();
    const k = st.alg;
    const typed = $('algInput').value.trim();
    let ok = false;
    let msg = '';
    try {
      const want = apply(solved(), ALGS[k].moves);
      const got = apply(solved(), typed);
      ok = !!typed && want.every((v, i) => v === got[i]);
      if (!ok) msg = typed ? 'No hace lo mismo.' : 'Sin respuesta.';
    } catch (e) { msg = `${e.message}.`; }
    const s = statOf(k);
    s.seen++;
    if (ok) s.right++;
    save(KEY, data);
    document.dispatchEvent(new CustomEvent('op3:changed', { detail: { what: 'algtr' } }));
    st.phase = 'answered';
    st.fb = { html: ok ? `Correcto: ${esc(ALGS[k].name)}.` : `${esc(msg)} Es así:`, tone: ok ? 'ok' : 'ko' };
    render();
    const nx = $('algNext');
    if (nx) nx.focus();
  });

  // ---- Timing yourself
  let raf = 0;
  function press() {
    if (!st.on || how() !== 'timer') return;
    if (st.phase !== 'run') {
      st.phase = 'run';
      st.t0 = performance.now();
      st.fb = null;
      render();
      const tick = () => { const el = $('algTime'); if (st.phase !== 'run' || !el) return; el.textContent = secs(performance.now() - st.t0); raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(raf);
      const ms = performance.now() - st.t0;
      st.lastMs = ms;
      st.fb = { html: record(st.alg, ms), tone: 'ok' };
      st.phase = 'ready';
      nextAlg();
      render();
    }
  }
  // Space, on «Entrenar» (the page's own key handler leaves this view to us when it is on).
  const prevKey = O.onKey.entrenar;
  O.onKey.entrenar = (ev) => {
    if (st.on) {
      if (ev.key === ' ' && how() === 'timer' && !ev.repeat) { ev.preventDefault(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); press(); return true; }
      if (ev.key === 'Escape' && st.phase === 'run') { cancelAnimationFrame(raf); st.phase = 'ready'; render(); return true; }
      return false;
    }
    return prevKey ? prevKey(ev) : false;
  };

  // ---- With the smart cube
  document.addEventListener('op3:cubemove', (ev) => {
    if (!st.on || how() !== 'cube' || O.currentView() !== 'entrenar') return;
    const { mv, st: state, t } = ev.detail || {};
    if (!st.F) armCube();
    const F = st.F;
    if (F.lost) { render(); return; }
    if (st.phase === 'ready') { st.phase = 'run'; st.t0 = t; st.fb = null; }
    CF.followMove(F, state, mv);
    if (CF.done(F)) {
      st.fb = { html: record(st.alg, t - st.t0), tone: 'ok' };
      nextAlg();
      armCube();
    }
    render();
  });
  // The cube connecting or going: the way to practise follows.
  let wasOn = cubeOn();
  document.addEventListener('op3:cube', () => {
    const now = cubeOn();
    if (now === wasOn) return;
    wasOn = now;
    if (!st.on) return;
    if (now && st.how === 'cube') armCube();
    render();
  });
  document.addEventListener('op3:algtr', () => { data = load(KEY, {}); if (st.on) render(); });
  O.onView('entrenar', () => { if (st.on) render(); });
  O.algTrainer = { state: () => ({ on: st.on, alg: st.alg, pick: st.pick, how: how(), phase: st.phase, pos: st.F ? st.F.pos : null }), data: () => JSON.parse(JSON.stringify(data)), show };
})();
