// Sync between devices for the four event pages and the plan: one document with all of them (EvData.syncData,
// EvData.mergeIn), with the same code as the rest of the app (op3bld:sync:v1, set up in any section). When it
// syncs on its own: syncplan.js. Its panel in «Ajustes». Installed by eventos.js and plan.js:
// window.EvSync({ $, toast, onChanged }) → { syncNow, renderSync }.
(() => {
  'use strict';
  window.EvSync = ({ $, toast, onChanged }) => {
    const D = window.EvData;
    const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const prettyCode = (c) => normCode(c).replace(/(.{4})(?=.)/g, '$1-');
    const esc = (txt) => String(txt).replace(/[&<>'"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
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
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error((j && j.error) || `error ${r.status}`);
        if (!j || typeof j !== 'object') throw new Error('respuesta incompleta del servidor');
        return j;
      } catch (e) { throw new Error(e.name === 'AbortError' ? 'el servidor no responde' : e.message); } finally { clearTimeout(tm); }
    }
    let pingP = null;
    const backend = () => { if (!pingP) pingP = api('api/ping').then((j) => (j.ok && j.store ? j : null), () => null); return pingP; };
    const state = () => D.load(D.K.sync, null);
    const plan = window.SyncPlan.create({
      name: 'ev', enabled: () => !!(state() && state().code), sync: (why) => syncNow(false, why),
      gap: async () => { const b = await backend(); return b && b.every; },
    });
    let syncing = null;
    function setStatus(text, bad) {
      const el = $('syncStatus');
      if (!el) return;
      el.textContent = text;
      el.className = `hint${bad ? ' bad' : ''}`;
    }
    async function syncNow(manual, why = 'hand') {
      const st = state();
      if (!st || !st.code) return;
      if (syncing) return;
      syncing = (async () => {
        if (manual) setStatus('Sincronizando…');
        try {
          if (!(window.crypto && crypto.subtle)) throw new Error('este navegador no lo permite');
          if (!(await backend())) throw new Error('no hay conexión con el servidor');
          const k = await sha(`ev:${normCode(st.code)}`);
          const remote = await api(`api/sync?k=${k}`);
          const changedHere = D.mergeIn(remote.data);
          if (plan.shouldPush(why, manual, !remote.data)) {
            const mark = plan.mark();
            await api(`api/sync?k=${k}`, { data: D.syncData() });
            plan.pushed(mark);
          }
          D.save(D.K.synced, Date.now());
          setStatus(`Sincronizado ${changedHere ? 'y actualizado con tus otros dispositivos' : 'correctamente'}.`);
          if (changedHere) { onChanged(); if (manual) toast('Datos actualizados'); }
        } catch (e) { setStatus(`No se ha podido sincronizar: ${e.message}.`, true); }
      })();
      try { await syncing; } finally { syncing = null; plan.done(); }
    }
    document.addEventListener('ev:changed', () => plan.changed());
    function renderSync() {
      const box = $('syncBox');
      if (!box) return;
      const st = state();
      if (!st) {
        box.innerHTML = '<p>Guarda en la nube tus tiempos, lo que vas aprendiendo y tu plan, y úsalos en el móvil y en el ordenador. Es el mismo código que en las demás secciones: si ya lo tienes en una, aquí funciona solo.</p>'
          + '<div class="actions"><button class="btn primary" type="button" id="syncOn">Activar sincronización</button></div>'
          + '<div class="field"><label for="syncCode">¿Ya la activaste en otro dispositivo? Escribe su código</label>'
          + '<div class="inrow"><input id="syncCode" class="text-input" type="text" spellcheck="false" autocomplete="off" autocapitalize="characters" placeholder="XXXX-XXXX-XXXX-XXXX">'
          + '<button class="btn" type="button" id="syncJoin">Usar este código</button></div></div>'
          + '<p class="hint" id="syncStatus"></p>';
        $('syncOn').addEventListener('click', () => activate(randomCode(16)));
        $('syncJoin').addEventListener('click', () => {
          const code = normCode($('syncCode').value);
          if (code.length !== 16 || [...code].some((c) => !ALPHA.includes(c))) { setStatus('Ese código no es válido: son 16 letras y números.', true); return; }
          activate(code);
        });
        return;
      }
      const last = D.load(D.K.synced, 0);
      box.innerHTML = '<p>Tu código de sincronización (el mismo en todas las secciones):</p>'
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
      if (!(window.crypto && crypto.subtle)) { setStatus('Este navegador no permite activar la sincronización.', true); return; }
      if (!(await backend())) { setStatus('No hay conexión con el servidor.', true); return; }
      // The 3BLD page reads the same entry, with the key it uses.
      D.save(D.K.sync, { code: normCode(code), key: await sha(`op3bld:${normCode(code)}`), last: 0 });
      plan.reset();
      renderSync();
      await syncNow(true);
    }
    plan.start(1500);
    return { syncNow, renderSync };
  };
})();
