// Old Pochmann 3BLD · retos con amigos, sincronización entre dispositivos y tarjetas para compartir.
(() => {
  'use strict';
  const OP = window.OP3;
  if (!OP) return;
  const $ = (id) => document.getElementById(id);
  const esc = OP.esc;
  const fmt = OP.fmt;
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* not kept */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* nothing */ } },
  };
  const NAME_KEY = 'op3bld:name:v1';
  const DEV_KEY = 'op3bld:dev:v1';
  const RETOS_KEY = 'op3bld:retos:v1';
  const GONE_KEY = 'op3bld:retos-gone:v1';  // { id: time it was removed from the list }
  const SYNC_KEY = 'op3bld:sync:v1';
  const DELETED_KEY = 'op3bld:deleted:v1';
  const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function randomCode(n) {
    const a = new Uint8Array(n);
    (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.floor(Math.random() * 256); });
    return [...a].map((b) => ALPHA[b % 32]).join('');
  }
  const dev = store.get(DEV_KEY, null) || (() => { const d = randomCode(14).toLowerCase(); store.set(DEV_KEY, d); return d; })();
  const KIND_LABEL = { full: 'completo', edges: 'solo aristas', corners: 'solo esquinas' };
  const dateText = (ms) => new Date(ms).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.h);
    toast.h = setTimeout(() => { t.hidden = true; }, 2800);
  }

  // ---------------- Server ----------------
  async function api(path, opts = {}) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tm = setTimeout(() => ctrl && ctrl.abort(), opts.timeout || 15000);
    try {
      const r = await fetch(path, {
        method: opts.body ? 'POST' : 'GET',
        headers: opts.body ? { 'content-type': 'application/json' } : {},
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        cache: 'no-store',
        signal: ctrl ? ctrl.signal : undefined,
      });
      // A body cut short (a timeout halfway through) is a failure too, not an empty answer.
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error((j && j.error) || `error ${r.status}`);
      if (!j || typeof j !== 'object') throw new Error('respuesta incompleta del servidor');
      return j;
    } catch (e) {
      throw new Error(e.name === 'AbortError' ? 'el servidor no responde' : e.message);
    } finally { clearTimeout(tm); }
  }
  // What the server has: null without a store; otherwise { kind, every } (how often to sync on our own, in s).
  let pingP = null;
  const backend = () => {
    if (!pingP) pingP = api('api/ping', { timeout: 8000 }).then((j) => (j.ok && j.store ? j : null), () => null);
    return pingP;
  };
  // When to sync on its own: syncplan.js (a change waits for the next turn, or for leaving the page).
  const plan = window.SyncPlan.create({
    name: 'op3bld', enabled: () => !!(syncState() && syncState().key), sync: (why) => syncNow(false, why),
    gap: async () => { const b = await backend(); return b && b.every; },
  });
  const offlineNote = '<div class="result ko"><p>Esto necesita la app publicada en internet: ábrela en <b>old-pochmann-3bld.vercel.app</b>. Si ya estás ahí, revisa tu conexión.</p></div>';

  // ---------------- Name ----------------
  const getName = () => store.get(NAME_KEY, '');
  function setName(v) {
    const n = String(v || '').trim().slice(0, 24);
    store.set(NAME_KEY, n);
    document.querySelectorAll('[data-name-input]').forEach((i) => { if (i.value !== n) i.value = n; });
    changed();
    return n;
  }

  // ---------------- Share card ----------------
  const COLORS = { bg: '#0F1319', panel: '#171C25', line: '#2B3341', ink: '#E6EAF0', muted: '#98A3B5', accent: '#F0699C', ok: '#4CC774' };
  const STICK = ['#F5F6F1', '#D7263D', '#1E9E4B', '#F07A16', '#F0699C', '#2563D6', '#F0CF0C', '#1E9E4B', '#F5F6F1'];
  function wrapLines(ctx, text, width) {
    const out = [];
    let line = '';
    text.split(' ').forEach((w) => {
      const t = line ? `${line} ${w}` : w;
      if (ctx.measureText(t).width > width && line) { out.push(line); line = w; } else line = t;
    });
    if (line) out.push(line);
    return out;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // Sets the largest font (down to min) whose advance width fits in maxW.
  function fitFont(ctx, text, maxW, size, min, font) {
    let px = size;
    ctx.font = font(px);
    while (px > min && ctx.measureText(text).width > maxW) { px -= 1; ctx.font = font(px); }
    return px;
  }
  // Same, measuring the painted glyphs (no side bearings), for the big time.
  function fitInk(ctx, text, maxW, size, font) {
    ctx.font = font(size);
    let m = ctx.measureText(text);
    const ink = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    if (ink > maxW) {
      ctx.font = font(Math.floor((size * maxW) / ink));
      m = ctx.measureText(text);
    }
    return m;
  }
  async function drawCard(entry, extra) {
    try { await Promise.all(['700 64px Unbounded', '400 32px "Atkinson Hyperlegible"', '400 32px "Martian Mono"'].map((f) => document.fonts.load(f))); } catch (e) { /* system fonts */ }
    const W = 1080;
    const H = 1350;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    const display = 'Unbounded, "Arial Black", sans-serif';
    const body = '"Atkinson Hyperlegible", system-ui, sans-serif';
    const mono = '"Martian Mono", ui-monospace, monospace';
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, '#141A23'); grad.addColorStop(1, COLORS.bg);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    // logo: a 3x3 face
    const s = 22; const g = 4; const lx = 80; const ly = 78;
    roundRect(ctx, lx - 8, ly - 8, 3 * s + 2 * g + 16, 3 * s + 2 * g + 16, 14);
    ctx.fillStyle = '#05070A'; ctx.fill();
    STICK.forEach((c, i) => { ctx.fillStyle = c; roundRect(ctx, lx + (i % 3) * (s + g), ly + Math.floor(i / 3) * (s + g), s, s, 4); ctx.fill(); });
    ctx.fillStyle = COLORS.ink;
    ctx.font = `700 34px ${display}`;
    ctx.textBaseline = 'middle';
    ctx.fillText('OLD POCHMANN 3BLD', 186, 112);
    const titleEnd = 186 + ctx.measureText('OLD POCHMANN 3BLD').width;
    ctx.fillStyle = COLORS.muted;
    const date = new Date(entry.at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    // Long month names must not run into the title.
    fitFont(ctx, date, W - 80 - (titleEnd + 28), 30, 20, (px) => `400 ${px}px ${body}`);
    ctx.textAlign = 'right';
    ctx.fillText(date, W - 80, 112);
    ctx.textAlign = 'left';
    // verdict chip
    const label = entry.ok ? 'RESUELTO' : 'DNF';
    ctx.font = `700 30px ${display}`;
    const cw = ctx.measureText(label).width + 56;
    roundRect(ctx, 80, 250, cw, 64, 32);
    ctx.fillStyle = entry.ok ? COLORS.ok : COLORS.accent; ctx.fill();
    ctx.fillStyle = COLORS.bg;
    ctx.fillText(label, 108, 283);
    // time: as big as fits between the margins (10+ minutes has one more digit)
    const total = entry.memo + entry.exec;
    const big = entry.ok ? fmt(total) : 'DNF';
    ctx.fillStyle = COLORS.ink;
    const m = fitInk(ctx, big, W - 160, entry.ok ? 190 : 170, (px) => `700 ${px}px ${display}`);
    ctx.fillText(big, 80 + m.actualBoundingBoxLeft, 470);
    ctx.fillStyle = COLORS.muted;
    const splits = `${entry.ok ? '' : `Tiempo ${fmt(total)} · `}Memo ${fmt(entry.memo)} · Ejecución ${fmt(entry.exec)}`;
    fitFont(ctx, splits, W - 160, 40, 26, (px) => `400 ${px}px ${body}`);
    ctx.fillText(splits, 80, 610);
    let y = 700;
    if (extra && extra.reto) {
      ctx.fillStyle = COLORS.accent;
      ctx.font = `700 40px ${body}`;
      ctx.fillText(extra.reto, 80, y);
      y += 80;
    }
    // memo + scramble
    const block = (title, text, size) => {
      ctx.fillStyle = COLORS.muted;
      ctx.font = `700 26px ${body}`;
      ctx.fillText(title.toUpperCase(), 80, y);
      y += 52;
      ctx.fillStyle = COLORS.ink;
      ctx.font = `400 ${size}px ${mono}`;
      wrapLines(ctx, text, W - 160).forEach((ln) => { ctx.fillText(ln, 80, y); y += size * 1.6; });
      y += 34;
    };
    if (entry.mem) block('Memo', entry.mem, 34);
    if (entry.scr) block('Scramble', entry.scr, 34);
    ctx.fillStyle = COLORS.muted;
    ctx.font = `400 28px ${body}`;
    ctx.fillText('old-pochmann-3bld.vercel.app', 80, H - 80);
    return cv;
  }
  let shareFile = null;
  async function openShare(entry, extra) {
    if (!entry) return;
    const sheet = $('shareSheet');
    const cv = await drawCard(entry, extra);
    if (!cv) { toast('Tu navegador no puede crear la imagen.'); return; }
    const url = cv.toDataURL('image/png');
    $('shareImg').src = url;
    shareFile = null;
    try {
      const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
      if (blob && typeof File !== 'undefined') shareFile = new File([blob], `3bld-${fmt(entry.memo + entry.exec).replace(/[:.]/g, '-')}.png`, { type: 'image/png' });
    } catch (e) { /* data URL only */ }
    const canShare = !!(shareFile && navigator.canShare && navigator.canShare({ files: [shareFile] }));
    $('shareGo').hidden = !canShare;
    $('shareSave').dataset.url = url;
    $('shareSave').dataset.name = shareFile ? shareFile.name : '3bld.png';
    $('shareNote').textContent = canShare ? '' : 'Si no se descarga, mantén pulsada la imagen para guardarla.';
    sheet.hidden = false;
    (canShare ? $('shareGo') : $('shareSave')).focus();
  }
  function closeShare() { $('shareSheet').hidden = true; }
  $('shareClose').addEventListener('click', closeShare);
  $('shareSheet').addEventListener('click', (ev) => { if (ev.target === $('shareSheet')) closeShare(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('shareSheet').hidden) closeShare(); });
  $('shareGo').addEventListener('click', async () => {
    if (!shareFile) return;
    try { await navigator.share({ files: [shareFile], title: 'Mi tiempo de 3BLD' }); } catch (e) { /* cancelled */ }
  });
  $('shareSave').addEventListener('click', () => {
    const a = document.createElement('a');
    a.href = $('shareSave').dataset.url;
    a.download = $('shareSave').dataset.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
  document.addEventListener('op3:share', (ev) => {
    const entry = ev.detail;
    const reto = entry && entry.reto ? retos().find((r) => r.id === entry.reto) : null;
    openShare(entry, reto ? { reto: `Reto de ${reto.by}` } : null);
  });

  // ---------------- Retos ----------------
  const retos = () => store.get(RETOS_KEY, []);
  const saveRetos = (list) => { store.set(RETOS_KEY, list.slice(-60)); changed(); };
  // Opening a challenge again brings it back even if it was removed: `touched` is newer than the removal.
  function remember(r) {
    const list = retos().filter((x) => x.id !== r.id);
    const prev = retos().find((x) => x.id === r.id) || {};
    list.push({ ...prev, ...r, touched: Date.now() });
    saveRetos(list);
  }
  const gone = () => store.get(GONE_KEY, {});
  const isGone = (r, g) => (g[r.id] || 0) > (r.touched || r.at || 0);
  function forgetReto(id) {
    const g = gone();
    g[id] = Date.now();
    const ids = Object.keys(g).sort((a, b) => g[b] - g[a]).slice(0, 300);
    store.set(GONE_KEY, Object.fromEntries(ids.map((k) => [k, g[k]])));
    saveRetos(retos().filter((x) => x.id !== id));
    if (view.open === id) { view.open = null; view.data = null; renderCard(); }
    renderList();
  }
  const view = { open: null, data: null, busy: false };

  function renderRetos() {
    const box = $('retos');
    const name = getName();
    box.innerHTML = `
      <section class=panel id=retoCard hidden></section>
      <section class=panel aria-labelledby=hRetos>
        <div class=panel-head><h2 id=hRetos>Retos con amigos</h2></div>
        <p class=hint>Creas un reto con un scramble, mandas el enlace y cada uno lo resuelve con el cronómetro. La clasificación se actualiza sola.</p>
        <div id=retoOffline></div>
        <div class=fields>
          <div class=field><label for=retoName>Tu nombre</label><input id=retoName data-name-input type=text maxlength=24 spellcheck=false autocomplete=nickname placeholder='p. ej. Aco' value='${esc(name)}'></div>
          <div class=field><label for=retoKind>Scramble</label><select id=retoKind class=text-input><option value=full>Completo</option><option value=edges>Solo aristas</option><option value=corners>Solo esquinas</option></select></div>
        </div>
        <div class=actions><button class='btn primary' type=button id=retoCreate>Crear reto</button></div>
        <p class=result id=retoMsg></p>
      </section>
      <section class=panel aria-labelledby=hMyRetos>
        <div class=panel-head><h2 id=hMyRetos>Tus retos</h2></div>
        <div class=reto-list id=retoList></div>
      </section>`;
    $('retoName').addEventListener('change', (ev) => setName(ev.target.value));
    $('retoCreate').addEventListener('click', createReto);
    backend().then((ok) => { if (!ok) $('retoOffline').innerHTML = offlineNote; });
    renderList();
    if (view.open) renderCard();
  }
  function renderList() {
    const list = retos().slice().reverse();
    const box = $('retoList');
    if (!box) return;
    if (!list.length) { box.innerHTML = '<p class=empty-note>Aún no tienes retos. Crea uno o abre el enlace que te pase alguien.</p>'; return; }
    box.innerHTML = list.map((r) => `<div class=reto-row><button type=button class=reto-item data-open='${r.id}'>`
      + `<span><b>Reto de ${esc(r.by)}</b><span class=muted> · ${KIND_LABEL[r.kind] || 'completo'} · ${dateText(r.at)}</span></span>`
      + `<span class='pill ${r.done ? 'ok' : 'dnf'}'>${r.done ? 'Hecho' : 'Pendiente'}</span></button>`
      + `<button type=button class=reto-del data-forget='${r.id}' aria-label='Quitar el reto de ${esc(r.by)} de tu lista' title='Quitar de la lista'>×</button></div>`).join('');
    box.querySelectorAll('[data-open]').forEach((b) => b.addEventListener('click', () => openReto(b.dataset.open)));
    // Two taps: the first one asks, the second one removes (the link still works if you open it again).
    box.querySelectorAll('[data-forget]').forEach((b) => b.addEventListener('click', () => {
      if (b.classList.contains('armed')) { forgetReto(b.dataset.forget); return; }
      b.classList.add('armed');
      b.textContent = '¿Quitar?';
      setTimeout(() => { if (b.isConnected) { b.classList.remove('armed'); b.textContent = '×'; } }, 3000);
    }));
  }
  async function createReto() {
    const msg = $('retoMsg');
    const name = setName($('retoName').value);
    if (!name) { msg.className = 'result ko'; msg.textContent = 'Escribe tu nombre para que tus amigos sepan de quién es el reto.'; $('retoName').focus(); return; }
    if (!(await backend())) { msg.className = 'result ko'; msg.innerHTML = 'No hay conexión con el servidor de retos.'; return; }
    const kind = $('retoKind').value;
    const btn = $('retoCreate');
    btn.disabled = true;
    btn.textContent = 'Generando scramble…';
    msg.className = 'result'; msg.textContent = '';
    try {
      let scramble;
      try { scramble = await OP.withTimeout(OP.requestScramble(kind), 30000); } catch (e) {
        if (kind !== 'full') throw new Error('no he podido generar el scramble');
        scramble = OP.randomMoveScramble();
      }
      btn.textContent = 'Creando reto…';
      const { id } = await api('api/reto', { body: { scramble, kind, by: name } });
      remember({ id, by: name, kind, at: Date.now(), mine: true });
      await openReto(id, true);
    } catch (e) {
      msg.className = 'result ko';
      msg.textContent = `No se ha podido crear el reto: ${e.message}.`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Crear reto';
    }
  }
  // Short link (/r/id): Discord and other sites show a preview of the challenge; people land in the app.
  const linkOf = (id) => (location.pathname === '/'
    ? `${location.origin}/r/${id}`
    : `${location.origin}${location.pathname}?reto=${id}`);
  async function shareLink(id) {
    const r = retos().find((x) => x.id === id) || {};
    const url = linkOf(id);
    const text = `Reto de 3BLD de ${r.by || 'un amigo'}: resuelve este scramble a ciegas y compara tu tiempo.`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Reto de 3BLD', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); toast('Enlace copiado'); } catch (e) {
      const card = $('retoCard');
      const p = document.createElement('p');
      p.className = 'scr-box';
      p.textContent = url;
      card.appendChild(p);
      toast('Copia el enlace de abajo');
    }
  }
  async function openReto(id, fromCreate) {
    view.open = id;
    view.data = null;
    if (OP.currentView() !== 'retos') OP.showView('retos');
    else renderCard();
    const card = $('retoCard');
    if (card && card.scrollIntoView && !fromCreate) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    await refreshReto();
    if (fromCreate) shareLink(id);
  }
  async function refreshReto() {
    const id = view.open;
    if (!id) return;
    view.busy = true;
    renderCard();
    try {
      const data = await api(`api/reto?id=${encodeURIComponent(id)}&dev=${encodeURIComponent(dev)}`);
      if (view.open !== id) return;
      view.data = data;
      const mine = data.results.find((x) => x.mine);
      remember({ id, by: data.by, kind: data.kind, at: data.at, done: !!mine });
      view.error = null;
    } catch (e) {
      view.error = e.message;
    }
    view.busy = false;
    renderCard();
    renderList();
  }
  function ranking(results) {
    const solvedRows = results.filter((r) => r.ok).sort((a, b) => (a.memo + a.exec) - (b.memo + b.exec));
    const dnf = results.filter((r) => !r.ok).sort((a, b) => a.at - b.at);
    return [...solvedRows, ...dnf];
  }
  function renderCard() {
    const card = $('retoCard');
    if (!card) return;
    if (!view.open) { card.hidden = true; return; }
    card.hidden = false;
    const d = view.data;
    const local = retos().find((x) => x.id === view.open) || {};
    if (!d) {
      card.innerHTML = `<div class=panel-head><h2>Reto</h2><button class=btn type=button data-act=close>Cerrar</button></div>`
        + (view.error ? `<p class='result ko'>No he podido abrir el reto: ${esc(view.error)}.</p><div class=actions><button class=btn type=button data-act=refresh>Reintentar</button></div>` : '<p class=hint>Cargando el reto…</p>');
      wireCard(card);
      return;
    }
    const rows = ranking(d.results);
    const mine = d.results.find((x) => x.mine);
    const pending = local.pending;
    const playing = OP.timerTag === d.id;
    let pos = 0;
    const table = rows.length
      ? '<div class=history><table><thead><tr><th>#</th><th>Nombre</th><th>Total</th><th>Memo</th><th>Ejecución</th><th>Resultado</th></tr></thead><tbody>'
        + rows.map((r) => {
          if (r.ok) pos++;
          return `<tr${r.mine ? ' class=me' : ''}><td>${r.ok ? pos : '—'}</td><td>${esc(r.name)}${r.mine ? ' (tú)' : ''}</td><td>${fmt(r.memo + r.exec)}</td><td>${fmt(r.memo)}</td><td>${fmt(r.exec)}</td>`
            + `<td><span class='pill ${r.ok ? 'ok' : 'dnf'}'>${r.ok ? 'Resuelto' : 'DNF'}</span></td></tr>`;
        }).join('') + '</tbody></table></div>'
      : '<p class=empty-note>Todavía nadie lo ha hecho. ¡Sé el primero!</p>';
    card.innerHTML = `<div class=panel-head><h2>Reto de ${esc(d.by)}</h2><span class=hint>Scramble ${KIND_LABEL[d.kind] || 'completo'} · ${dateText(d.at)} · ${d.results.length} ${d.results.length === 1 ? 'participante' : 'participantes'}</span></div>`
      + `<p class=scr-box>${esc(d.scramble)}</p>`
      + '<div class=actions>'
      + (mine ? '' : `<button class='btn primary' type=button data-act=play>${playing ? 'Volver al cronómetro' : 'Hacer el reto'}</button>`)
      + (pending ? '<button class=btn type=button data-act=retry>Reintentar el envío</button>' : '')
      + '<button class=btn type=button data-act=link>Compartir enlace</button>'
      + `<button class=btn type=button data-act=refresh${view.busy ? ' disabled' : ''}>${view.busy ? 'Actualizando…' : 'Actualizar'}</button>`
      + (mine ? '<button class=btn type=button data-act=img>Compartir mi resultado</button>' : '')
      + '<button class=btn type=button data-act=close>Cerrar</button></div>'
      + (mine ? '' : '<p class=hint>Al pulsar «Hacer el reto» se carga el scramble y vas al cronómetro. Solo cuenta tu primer intento.</p>')
      + (view.error ? `<p class='result ko'>${esc(view.error)}</p>` : '')
      + table;
    wireCard(card);
  }
  function wireCard(card) {
    card.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
      const act = b.dataset.act;
      if (act === 'close') { view.open = null; view.data = null; renderCard(); }
      else if (act === 'refresh') refreshReto();
      else if (act === 'link') shareLink(view.open);
      else if (act === 'play') playReto();
      else if (act === 'retry') submitPending(view.open);
      else if (act === 'img') {
        const d = view.data;
        const mine = d.results.find((x) => x.mine);
        const rows = ranking(d.results);
        const place = rows.filter((r) => r.ok).indexOf(mine) + 1;
        openShare({ at: mine.at, memo: mine.memo, exec: mine.exec, ok: mine.ok, scr: d.scramble },
          { reto: `Reto de ${d.by}${mine.ok ? ` · ${place}.º de ${d.results.length}` : ''}` });
      }
    }));
  }
  function playReto() {
    const d = view.data;
    if (!d) return;
    if (!getName()) {
      const n = setName(($('retoName') || {}).value || '');
      if (!n) { toast('Escribe tu nombre primero'); if ($('retoName')) $('retoName').focus(); return; }
    }
    if (OP.timerTag !== d.id) OP.loadPractice(d.scramble, '', '');
    OP.timerTag = d.id;
    renderBanner();
    OP.showView('crono');
  }
  function renderBanner() {
    const b = $('retoBanner');
    const r = OP.timerTag ? retos().find((x) => x.id === OP.timerTag) : null;
    if (!r) { b.hidden = true; return; }
    const scr = $('scr').value;
    b.hidden = false;
    b.innerHTML = `<div><b>Reto de ${esc(r.by)}</b><span class=muted> · tu resultado se enviará al marcar Resuelto o DNF</span></div>`
      + `<p class=scr-box>${esc(scr)}</p>`
      + '<div class=actions><button class=btn type=button id=retoCancel>Salir del reto</button></div>';
    $('retoCancel').addEventListener('click', () => { OP.timerTag = null; renderBanner(); });
  }
  async function submitResult(id, result) {
    remember({ id, pending: result });
    try {
      await api(`api/reto?id=${encodeURIComponent(id)}`, { body: { ...result, name: getName(), dev } });
      remember({ id, pending: null, done: true });
      toast('Resultado enviado al reto');
    } catch (e) {
      toast(`No se ha podido enviar: ${e.message}`);
    }
    view.open = id;
    view.data = null;
    OP.showView('retos');
    await refreshReto();
  }
  function submitPending(id) {
    const r = retos().find((x) => x.id === id);
    if (r && r.pending) submitResult(id, r.pending);
  }
  document.addEventListener('op3:result', (ev) => {
    const e = ev.detail;
    if (!e || !e.reto) return;
    OP.timerTag = null;
    renderBanner();
    submitResult(e.reto, { memo: e.memo, exec: e.exec, ok: e.ok });
  });

  // ---------------- Sync ----------------
  const syncState = () => store.get(SYNC_KEY, null);
  const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const prettyCode = (c) => normCode(c).replace(/(.{4})(?=.)/g, '$1-');
  async function keyOf(code) {
    const data = new TextEncoder().encode(`op3bld:${normCode(code)}`);
    const h = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  function snapshot() {
    return {
      v: 1,
      times: OP.data.times(),
      deleted: store.get(DELETED_KEY, []),
      train: OP.data.train(),
      learn: OP.learn ? OP.learn.get() : null,
      retos: retos().map(({ pending, ...r }) => r),
      retosGone: gone(),
      name: getName(),
    };
  }
  // Merges remote data into this device. Returns true when anything changed here.
  function mergeIn(remote) {
    if (!remote || typeof remote !== 'object') return false;
    let changedHere = false;
    const dead = new Set([...store.get(DELETED_KEY, []), ...(Array.isArray(remote.deleted) ? remote.deleted : [])]);
    store.set(DELETED_KEY, [...dead].slice(-2000));
    const byAt = new Map();
    OP.data.times().forEach((t) => byAt.set(t.at, t));
    const before = byAt.size;
    (Array.isArray(remote.times) ? remote.times : []).forEach((t) => { if (t && typeof t.at === 'number' && !byAt.has(t.at)) byAt.set(t.at, t); });
    const merged = [...byAt.values()].filter((t) => !dead.has(t.at)).sort((a, b) => a.at - b.at).slice(-500);
    if (merged.length !== OP.data.times().length || byAt.size !== before) { OP.data.setTimes(merged); changedHere = true; }
    const train = JSON.parse(JSON.stringify(OP.data.train() || {}));
    let trainChanged = false;
    const rt = remote.train && typeof remote.train === 'object' ? remote.train : {};
    ['edge', 'corner'].forEach((k) => {
      const mine = train[k] || {};
      Object.entries(rt[k] || {}).forEach(([L, st]) => {
        if (st && typeof st.seen === 'number' && (!mine[L] || st.seen > mine[L].seen)) { mine[L] = st; trainChanged = true; }
      });
      train[k] = mine;
    });
    if (trainChanged) { OP.data.setTrain(train); changedHere = true; }
    if (OP.learn && remote.learn && OP.learn.merge(remote.learn)) changedHere = true;
    const g = gone();
    const rg = remote.retosGone && typeof remote.retosGone === 'object' ? remote.retosGone : {};
    Object.entries(rg).forEach(([id, at]) => { if (typeof at === 'number' && at > (g[id] || 0)) g[id] = at; });
    store.set(GONE_KEY, g);
    let list = retos();
    if (Array.isArray(remote.retos)) {
      remote.retos.forEach((r) => {
        if (!r || !r.id) return;
        const i = list.findIndex((x) => x.id === r.id);
        if (i < 0) { list.push(r); changedHere = true; } else {
          if (r.done && !list[i].done) { list[i].done = true; changedHere = true; }
          if ((r.touched || 0) > (list[i].touched || 0)) list[i].touched = r.touched;
        }
      });
    }
    const kept = list.filter((r) => !isGone(r, g));
    if (kept.length !== list.length) changedHere = true;
    list = kept;
    store.set(RETOS_KEY, list.slice(-60));
    if (!getName() && remote.name) { store.set(NAME_KEY, String(remote.name).slice(0, 24)); changedHere = true; }
    return changedHere;
  }
  let syncing = null;
  async function syncNow(manual, why = 'hand') {
    const st = syncState();
    if (!st || !st.key) return;
    if (syncing) return syncing;
    syncing = (async () => {
      if (manual) setSyncStatus('Sincronizando…');
      try {
        if (!(await backend())) throw new Error('no hay conexión con el servidor');
        const remote = await api(`api/sync?k=${st.key}`);
        const changedHere = mergeIn(remote.data);
        if (plan.shouldPush(why, manual, !remote.data)) {
          const mark = plan.mark();
          await api(`api/sync?k=${st.key}`, { body: { data: snapshot() } });
          plan.pushed(mark);
        }
        store.set(SYNC_KEY, { ...(syncState() || st), last: Date.now() });
        setSyncStatus(`Sincronizado ${changedHere ? 'y actualizado con tus otros dispositivos' : 'correctamente'}.`);
        if (changedHere) { renderList(); if (manual) toast('Datos actualizados'); }
      } catch (e) {
        setSyncStatus(`No se ha podido sincronizar: ${e.message}.`, true);
      }
    })();
    try { await syncing; } finally { syncing = null; plan.done(); }
  }
  function changed() { plan.changed(); }
  document.addEventListener('op3:changed', changed);
  function setSyncStatus(text, bad) {
    const s = $('syncStatus');
    if (!s) return;
    s.textContent = text;
    s.className = 'hint' + (bad ? ' bad' : '');
  }
  function renderSync() {
    const box = $('syncBox');
    const st = syncState();
    if (!st) {
      box.innerHTML = '<p>Guarda en la nube tus tiempos, las estadísticas del entrenador, el progreso del tutorial y tus retos, y úsalos en el móvil y en el ordenador a la vez.</p>'
        + '<div id=syncOffline></div>'
        + "<div class=actions><button class='btn primary' type=button id=syncOn>Activar sincronización</button></div>"
        + '<div class=field><label for=syncCode>¿Ya la activaste en otro dispositivo? Escribe su código</label>'
        + "<div class=inrow><input id=syncCode class=text-input type=text spellcheck=false autocomplete=off autocapitalize=characters placeholder='XXXX-XXXX-XXXX-XXXX'>"
        + '<button class=btn type=button id=syncJoin>Usar este código</button></div></div>'
        + '<p class=hint id=syncStatus></p>';
      $('syncOn').addEventListener('click', async () => {
        const code = randomCode(16);
        await activate(code);
      });
      $('syncJoin').addEventListener('click', async () => {
        const code = normCode($('syncCode').value);
        if (code.length !== 16 || [...code].some((c) => !ALPHA.includes(c))) { setSyncStatus('Ese código no es válido: son 16 letras y números.', true); return; }
        await activate(code);
      });
    } else {
      box.innerHTML = '<p>Tu código de sincronización:</p>'
        + `<p class=code-box>${prettyCode(st.code)}</p>`
        + '<p class=hint>Escríbelo en «Ajustes» en tu otro dispositivo. Quien tenga este código puede ver y cambiar tus datos, así que no lo compartas.</p>'
        + '<div id=syncOffline></div>'
        + "<div class=actions><button class='btn primary' type=button id=syncNow>Sincronizar ahora</button>"
        + '<button class=btn type=button id=syncCopy>Copiar código</button>'
        + '<button class=btn type=button id=syncOff>Desactivar en este dispositivo</button></div>'
        + `<p class=hint id=syncStatus>${st.last ? `Última sincronización: ${new Date(st.last).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.` : ''}</p>`;
      $('syncNow').addEventListener('click', () => syncNow(true));
      $('syncCopy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(prettyCode(st.code)); toast('Código copiado'); } catch (e) { toast('Cópialo a mano'); }
      });
      let armed = 0;
      $('syncOff').addEventListener('click', () => {
        const b = $('syncOff');
        if (Date.now() - armed > 3000) { armed = Date.now(); b.textContent = 'Pulsa otra vez para desactivar'; setTimeout(() => { b.textContent = 'Desactivar en este dispositivo'; }, 3000); return; }
        store.del(SYNC_KEY);
        renderSync();
        toast('Sincronización desactivada en este dispositivo');
      });
    }
    backend().then((ok) => { const o = $('syncOffline'); if (o && !ok) o.innerHTML = offlineNote; });
  }
  async function activate(code) {
    if (!(window.crypto && crypto.subtle)) { setSyncStatus('Este navegador no permite activar la sincronización.', true); return; }
    if (!(await backend())) { setSyncStatus('No hay conexión con el servidor.', true); return; }
    const key = await keyOf(code);
    store.set(SYNC_KEY, { code: normCode(code), key, last: 0 });
    renderSync();
    await syncNow(true);
  }

  // ---------------- Wiring ----------------
  const setNameInput = $('setName');
  setNameInput.dataset.nameInput = '';
  setNameInput.value = getName();
  setNameInput.addEventListener('change', (ev) => setName(ev.target.value));
  let retosRendered = false;
  OP.onView('retos', () => { if (!retosRendered) { retosRendered = true; renderRetos(); } else { renderList(); renderCard(); } });
  OP.onView('ajustes', () => { renderSync(); setNameInput.value = getName(); });
  OP.onView('crono', renderBanner);
  if (OP.currentView() === 'retos') { retosRendered = true; renderRetos(); }
  if (OP.currentView() === 'ajustes') renderSync();
  const params = new URLSearchParams(location.search);
  const linkReto = params.get('reto');
  if (linkReto && /^[a-z0-9]{8}$/.test(linkReto)) {
    try { history.replaceState(null, '', `${location.pathname}#retos`); } catch (e) { /* sandboxed */ }
    openReto(linkReto);
  }
  plan.start(1200);
})();
