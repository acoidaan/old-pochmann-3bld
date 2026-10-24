// Sync between devices in Fridrich: what travels (syncData), merging what comes (mergeIn), when it saves and
// the panel in «Ajustes».
// Installed by fridrich.js: window.FridrichSync(ctx) → { api, backend, syncData, mergeIn, syncPlan, syncNow }.
(() => {
  'use strict';
  window.FridrichSync = (ctx) => {
    const {
      $, C, K, cleanName, esc, learn, learnAt, ligas, load, onView, renderCases, renderPick, renderPlan,
      renderProgress, renderStats, renderTrStats, save, toast, train
    } = ctx;
    // The same code as in the 3BLD page (op3bld:sync:v1): set it up in either and both use it. Fridrich keeps
    // its own copy on the server, under another key, merged solve by solve.
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
        const r = await fetch(path, {
          method: body ? 'POST' : 'GET', headers: body ? { 'content-type': 'application/json' } : {},
          body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: ctrl ? ctrl.signal : undefined,
        });
        // A body cut short (a timeout halfway through) is a failure too, not an empty answer.
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error((j && j.error) || `error ${r.status}`);
        if (!j || typeof j !== 'object') throw new Error('respuesta incompleta del servidor');
        return j;
      } catch (e) { throw new Error(e.name === 'AbortError' ? 'el servidor no responde' : e.message); } finally { clearTimeout(tm); }
    }
    // What the server has: null without a store; otherwise { kind, every } (how often to sync on our own, in s).
    let pingP = null;
    const backend = () => { if (!pingP) pingP = api('api/ping').then((j) => (j.ok && j.store ? j : null), () => null); return pingP; };
    const syncState = () => load(K.sync, null);
    function syncData() {
      const keep = ctx.times.length - 200;   // the turns and the analysis of the last 200 solves travel; older ones stay here
      const lkeep = ctx.ltimes.length - 50;
      return {
        v: 1,
        times: ctx.times.map((r, i) => (i < keep && (r.rc || r.an) ? (({ rc, an, ...x }) => x)(r) : r)),
        ltimes: ctx.ltimes.map((r, i) => (i < lkeep && (r.rc || r.an) ? (({ rc, an, ...x }) => x)(r) : r)),
        deleted: load(K.deleted, []), learn, learnAt, train, crossTr: load(K.crossTr, []).slice(-300), trlog: ctx.trlog.slice(-3000),
        player: load(K.player, null), ligas: ligas(), sessions: load(K.sessions, []).slice(-100),
        practice: window.Practice ? window.Practice.data() : {},
      };
    }
    function mergeIn(remote) {
      if (!remote || typeof remote !== 'object') return false;
      let changedHere = false;
      const dead = new Set([...load(K.deleted, []), ...(Array.isArray(remote.deleted) ? remote.deleted : [])]);
      save(K.deleted, [...dead].slice(-3000));
      const mergeList = (local, incoming) => {
        const byAt = new Map(local.map((r) => [r.at, r]));
        (Array.isArray(incoming) ? incoming : []).forEach((r) => {
          if (!r || typeof r.at !== 'number' || typeof r.t !== 'number') return;
          const mine = byAt.get(r.at);
          if (!mine) { byAt.set(r.at, r); changedHere = true; } else if ((r.ed || 0) > (mine.ed || 0)) {
            mine.pen = r.pen; mine.ed = r.ed;
            if (r.no) mine.no = r.no; else delete mine.no;
            changedHere = true;
          }
          if (mine && !mine.rc && r.rc) { mine.rc = r.rc; changedHere = true; }
          if (mine && !mine.an && r.an) { mine.an = r.an; changedHere = true; }
        });
        const merged = [...byAt.values()].filter((r) => !dead.has(r.at)).sort((a, b) => a.at - b.at).slice(-2000);
        if (merged.length !== local.length) changedHere = true;
        return merged;
      };
      ctx.times = mergeList(ctx.times, remote.times);
      save(K.times, ctx.times);
      ctx.ltimes = mergeList(ctx.ltimes, remote.ltimes).filter((r) => r.m === 'll' || r.m === 'pll');
      save(K.ltimes, ctx.ltimes);
      const rl = remote.learn && typeof remote.learn === 'object' ? remote.learn : {};
      const ra = remote.learnAt && typeof remote.learnAt === 'object' ? remote.learnAt : {};
      Object.keys({ ...rl, ...ra }).forEach((id) => {
        if (!C.caseById(id)) return;
        if ((ra[id] || 0) > (learnAt[id] || 0)) {
          if (rl[id]) learn[id] = rl[id]; else delete learn[id];
          learnAt[id] = ra[id];
          changedHere = true;
        }
      });
      save(K.learn, learn);
      save(K.learnAt, learnAt);
      const total = (x) => (x ? (x.n || 0) + (x.qn || 0) + (x.mn || 0) + (x.an || 0) : 0);
      Object.entries(remote.train && typeof remote.train === 'object' ? remote.train : {}).forEach(([id, x]) => {
        if (C.caseById(id) && total(x) > total(train[id])) { train[id] = x; changedHere = true; }
      });
      save(K.train, train);
      const ct = load(K.crossTr, []);
      const seen = new Set(ct.map((x) => x.at));
      (Array.isArray(remote.crossTr) ? remote.crossTr : []).forEach((x) => { if (x && typeof x.at === 'number' && !seen.has(x.at)) { ct.push(x); changedHere = true; } });
      save(K.crossTr, ct.sort((a, b) => a.at - b.at).slice(-1000));
      const tk = (x) => `${x.at}|${x.id}|${x.m}|${x.x ? 1 : 0}`;
      const have = new Set(ctx.trlog.map(tk));
      (Array.isArray(remote.trlog) ? remote.trlog : []).forEach((x) => {
        if (x && typeof x.at === 'number' && C.caseById(x.id) && ['c', 'q', 'h'].includes(x.m) && !have.has(tk(x))) { ctx.trlog.push(x); have.add(tk(x)); changedHere = true; }
      });
      ctx.trlog.sort((a, b) => a.at - b.at);
      if (ctx.trlog.length > 5000) ctx.trlog = ctx.trlog.slice(-5000);
      if (window.Practice && window.Practice.merge(remote.practice)) changedHere = true;
      save(K.trlog, ctx.trlog);
      if (Array.isArray(remote.sessions)) {
        const mineS = load(K.sessions, []);
        const seenS = new Set(mineS.map((x) => x.at));
        remote.sessions.forEach((x) => { if (x && typeof x.at === 'number' && Number.isFinite(x.n) && !seenS.has(x.at)) { mineS.push(x); seenS.add(x.at); changedHere = true; } });
        save(K.sessions, mineS.sort((a, b) => a.at - b.at).slice(-200));
      }
      // The ranking: the same player on every device (the oldest one wins), and every league.
      const rp = remote.player;
      if (rp && /^[a-z0-9]{12,32}$/.test(rp.id || '') && /^[a-f0-9]{32,64}$/.test(rp.token || '')) {
        const lp = load(K.player, null);
        if (!lp || (lp.id !== rp.id && (rp.at || 0) < (lp.at || Infinity))) { save(K.player, { id: rp.id, token: rp.token, at: rp.at || 0 }); save(K.ligaPub, {}); changedHere = true; }
      }
      if (Array.isArray(remote.ligas)) {
        const mineL = ligas();
        remote.ligas.forEach((x) => { if (x && /^[a-z0-9]{8}$/.test(x.code) && !mineL.some((y) => y.code === x.code)) { mineL.push({ code: x.code, name: cleanName(x.name), at: x.at || Date.now(), by: x.by ? cleanName(x.by).slice(0, 24) : undefined, made: Number.isFinite(x.made) ? x.made : undefined }); changedHere = true; } });
        save(K.ligas, mineL);
      }
      return changedHere;
    }
    // When to sync on its own: syncplan.js (a change waits for the next turn, or for leaving the page).
    const syncPlan = window.SyncPlan.create({
      name: 'cfop', enabled: () => !!(syncState() && syncState().code), sync: (why) => syncNow(false, why),
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
          const k = await sha(`cfop:${normCode(st.code)}`);
          const remote = await api(`api/sync?k=${k}`);
          const changedHere = mergeIn(remote.data);
          if (syncPlan.shouldPush(why, manual, !remote.data)) {
            const mark = syncPlan.mark();
            await api(`api/sync?k=${k}`, { data: syncData() });
            syncPlan.pushed(mark);
          }
          save(K.synced, Date.now());
          setSyncStatus(`Sincronizado ${changedHere ? 'y actualizado con tus otros dispositivos' : 'correctamente'}.`);
          if (changedHere) {
            renderStats();
            if (ctx.view === 'casos') renderCases();
            renderPick();
            if (ctx.view === 'progreso') renderProgress();
            if (ctx.view === 'entrenar') { renderPlan(); renderTrStats(); }
            if (manual) toast('Datos actualizados');
          }
        } catch (e) { setSyncStatus(`No se ha podido sincronizar: ${e.message}.`, true); }
      })();
      try { await syncing; } finally { syncing = null; syncPlan.done(); }
    }
    document.addEventListener('fr:changed', () => syncPlan.changed());
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
        box.innerHTML = '<p>Guarda en la nube tus tiempos, lo que estás aprendiendo y lo que has entrenado, y úsalos en el móvil y en el ordenador. Si ya la tienes activada en la página de 3BLD, aquí se activa sola con el mismo código.</p>'
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
      box.innerHTML = '<p>Tu código de sincronización (el mismo que en la página de 3BLD):</p>'
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
      // The 3BLD page reads the same entry, with the key it uses.
      save(K.sync, { code: normCode(code), key: await sha(`op3bld:${normCode(code)}`), last: 0 });
      renderSync();
      await syncNow(true);
    }
    onView('ajustes', renderSync);

    return { api, backend, syncData, mergeIn, syncPlan, syncNow };
  };
})();
