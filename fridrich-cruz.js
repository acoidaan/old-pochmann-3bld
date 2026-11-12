// «Entrenar la cruz» in Fridrich: a scramble to follow on the cube, then the white cross against the clock,
// compared with the shortest one.
// Installed by fridrich.js: window.FridrichCruz(ctx) → { ct, ctActive, ctMove }.
(() => {
  'use strict';
  window.FridrichCruz = (ctx) => {
    const {
      $, C, COLOR_NAME, K, M, algHtml, apply, buzz, changed, done, esc, f1, faceMapFor, fmt, followMove,
      halves, inHand, isSolved, load, locate, makeFollow, now, onView, parseAlg, save, settings, solved,
      undoText, voice
    } = ctx;
    // A scramble, 15 s to plan the whole cross, then do it in one go. With the smart cube the app counts the
    // turns and the time and compares with the shortest; without it, it shows the shortest at the end.
    const ct = { phase: 'idle', scr: '', state: null, best: null, follow: null, insp0: 0, t0: 0, moves: [], result: null, raf: 0, trail: null, retry: false, replayed: false, seq: null };
    // With the smart cube, after the cross: back to the scramble turn by turn («rewind»), then the shortest
    // cross one turn at a time. `trail` is every turn since the cube was at the scramble (core frame), so the
    // way back is its undo; past TRAIL_MAX the way back is too long to be worth following.
    const TRAIL_MAX = 40;
    const CF = window.CubeFollow;
    const handMap = () => faceMapFor(C.DOWN[settings.cross]);
    const coreMap = () => { const m = handMap(); const inv = {}; Object.keys(m).forEach((f) => { inv[m[f]] = f; }); return inv; };
    const undoOf = (list) => CF.simplify(list).reverse().map((m) => CF.moveText({ base: m.base, turns: (4 - m.turns) % 4 }));
    const canRewind = () => !!(ctx.cube && ctx.cube.on && ct.trail && ct.state);
    const ctActive = () => ctx.view === 'entrenar' && ct.phase !== 'idle' && ct.phase !== 'done' && ctx.cube && ctx.cube.on;
    async function ctNew() {
      ct.phase = 'loading';
      ct.result = null;
      renderCt();
      let scr;
      try { scr = M.simplifyAlg(await M.withTimeout(M.requestScramble('full'), 30000)); } catch (e) { scr = M.randomMoveScramble(); }
      ct.scr = scr;
      ct.state = apply(solved(), scr);
      ct.best = C.bestCross(ct.state, settings.cross);
      ct.moves = [];
      ct.trail = null; ct.retry = false; ct.replayed = false; ct.seq = null;
      ct.phase = 'scramble';
      if (ctx.cube && ctx.cube.on) {
        ct.follow = makeFollow(solved(), parseAlg(scr).map((m) => m.text));
        if (!locate(ct.follow, ctx.cube.state)) { ct.follow.lost = !isSolved(ctx.cube.state); ct.follow.pos = 0; }
      } else ct.follow = null;
      renderCt();
    }
    function ctPlan() {
      ct.phase = 'plan';
      ct.insp0 = now();
      ct.said = {};
      ctTick();
      renderCt();
    }
    function ctTick() {
      cancelAnimationFrame(ct.raf);
      const step = () => {
        const el = $('ctClock');
        if (!el) return;
        if (ct.phase === 'plan') {
          const left = 15000 - (now() - ct.insp0);
          el.textContent = left > 0 ? String(Math.ceil(left / 1000)) : left > -2000 ? '+2' : 'DNF';
          if (voice) voice.judge(15000 - left, ct.said);   // as in the inspection: «ocho segundos», «doce segundos»
        } else if (ct.phase === 'do') el.textContent = fmt(now() - ct.t0);
        else return;
        ct.raf = requestAnimationFrame(step);
      };
      ct.raf = requestAnimationFrame(step);
    }
    function ctRewind() {
      if (!canRewind()) return;
      const back = undoOf(ct.trail);
      if (!back.length) { ctReplay(); return; }
      ct.phase = 'rewind';
      ct.follow = makeFollow(ctx.cube.state, back);
      ct.seq = back;
      renderCt();
    }
    function ctReplay() {
      const b = ct.best;
      ct.trail = [];
      ct.phase = 'replay';
      ct.seq = b.moves ? inHand(b.moves, coreMap()).split(' ') : [];
      ct.follow = makeFollow(ct.state, ct.seq);
      if (!ct.seq.length) { ct.phase = 'done'; ct.replayed = true; }
      renderCt();
    }
    function ctRetry() {
      ct.retry = true;
      ct.result = null;
      ct.trail = [];
      ctPlan();
    }
    const tracking = () => ct.phase === 'done' && !!ct.trail && !!(ctx.cube && ctx.cube.on);
    function ctMove(mv, st, t) {
      if (ct.phase === 'done') {
        if (!ct.trail) return;
        ct.trail.push(mv);
        if (ct.trail.length > TRAIL_MAX && CF.simplify(ct.trail).length > TRAIL_MAX) ct.trail = null;
        if (!ct.trail || ct.trail.length === 1) renderCt();
        return;
      }
      if (ct.phase === 'rewind' || ct.phase === 'replay') {
        ct.trail.push(mv);
        followMove(ct.follow, st, mv);
        if (ct.phase === 'rewind' && (done(ct.follow) || st.join(',') === ct.state.join(','))) { ctReplay(); return; }
        if (ct.phase === 'replay' && done(ct.follow)) {
          ct.phase = 'done';
          ct.replayed = true;
          if (settings.sound) window.SmartCube.chime(true);
          buzz([60]);
        }
        renderCt();
        return;
      }
      if (ct.phase === 'scramble' && ct.follow) {
        followMove(ct.follow, st, mv);
        if (done(ct.follow)) ctPlan();
        renderCt();
        return;
      }
      if (ct.phase === 'plan') { ct.phase = 'do'; ct.t0 = t; ct.moves = []; ct.trail = []; ctTick(); }
      if (ct.phase !== 'do') return;
      ct.moves.push(mv);
      if (ct.trail) ct.trail.push(mv);
      if (C.readFace(st, settings.cross).cross === 4) ctFinish(t);
      else renderCt();
    }
    function ctFinish(t) {
      cancelAnimationFrame(ct.raf);
      const used = ct.moves.length ? halves(ct.moves) : null;
      const map = faceMapFor(C.DOWN[settings.cross]);
      ct.result = {
        at: Date.now(), opt: ct.best.length, t: t ? Math.round(t - ct.t0) : null,
        n: used ? used.length : null, mine: used ? used.map((m) => inHand(m, map)).join(' ') : null,
        over: ct.insp0 && (ct.t0 || now()) - ct.insp0 > 15000, retry: ct.retry,
      };
      ct.replayed = false;
      if (used && ct.retry) {
        if (settings.sound) window.SmartCube.chime(true);
        buzz([60]);
      } else if (used) {
        const list = load(K.crossTr, []);
        list.push({ at: ct.result.at, opt: ct.result.opt, n: ct.result.n, t: ct.result.t });
        save(K.crossTr, list.slice(-1000));
        changed();
        if (settings.sound) window.SmartCube.chime(true);
        buzz([60]);
      }
      ct.phase = 'done';
      renderCt();
    }
    function ctStats() {
      const list = load(K.crossTr, []).slice(-20);
      if (!list.length) return '';
      const extra = list.reduce((a, x) => a + (x.n - x.opt), 0) / list.length;
      const tAvg = list.reduce((a, x) => a + (x.t || 0), 0) / list.length;
      return `Últimas ${list.length}: de media ${extra.toFixed(1)} giros más que la más corta, en ${f1(tAvg)} s.`;
    }
    // The turn to do now, big, and the whole sequence with where you are in it.
    function stepBox(title, note) {
      const F = ct.follow;
      const map = handMap();
      const list = ct.seq.map((m) => inHand(m, map));
      const i = Math.min(F.pos, list.length - 1);
      let html = `<div class="fr-ct-now"><span class="field-title">${esc(title)}</span>`
        + `<b id="ctNow" class="${F.halfway ? 'half' : ''}">${F.off.length ? esc(undoText(F, map)) : esc(list[i] || '')}</b>`
        + `<span class="muted" id="ctNowOf">${F.off.length ? 'deshaz ese giro' : `${Math.min(F.pos + 1, list.length)} de ${list.length}`}</span></div>`;
      html += `<p class="fr-scr fr-ct-scr fr-ct-seq">${list.map((m, k) => `<span class="sm${k < F.pos ? ' done' : k === F.pos ? (F.halfway ? ' next half' : ' next') : ''}">${esc(m)}</span>`).join(' ')}</p>`;
      html += F.lost ? '<p class="hint bad">He perdido la pista de tu cubo. Pulsa «Otra» para empezar de nuevo.</p>'
        : F.off.length ? `<p class="hint bad">Ese giro no toca. Deshaz: <b>${esc(undoText(F, map))}</b></p>`
          : `<p class="hint">${note}</p>`;
      return html;
    }
    function renderCt() {
      const box = $('crossTr');
      if (!box) return;
      const name = C.crossName(settings.cross);
      let html = '';
      if (ct.phase === 'idle') {
        html = '<div class="actions"><button class="btn primary" type="button" id="ctGo">Empezar</button></div>';
      } else if (ct.phase === 'loading') html = '<p class="fr-note">Generando un scramble…</p>';
      else {
        const F = ct.follow;
        const moves = parseAlg(ct.scr).map((m) => m.text);
        if (ct.phase !== 'rewind' && ct.phase !== 'replay') html += `<p class="fr-scr fr-ct-scr">${moves.map((m, i) => `<span class="sm${F && !F.lost && ct.phase === 'scramble' ? (i < F.pos ? ' done' : i === F.pos ? (F.halfway ? ' next half' : ' next') : '') : ''}">${esc(m)}</span>`).join(' ')}</p>`;
        if (ct.phase === 'scramble') {
          if (F) {
            html += F.lost ? '<p class="hint bad">Tu cubo no está resuelto: resuélvelo (o «Está resuelto» en el cronómetro) y mézclalo con esto.</p>'
              : F.off.length ? `<p class="hint bad">Ese giro no toca. Deshaz: <b>${esc(undoText(F))}</b></p>`
                : '<p class="hint">Mézclalo (blanco arriba, verde delante). Al acabar empiezan los 15 s.</p>';
          } else html += '<p class="hint">Mezcla tu cubo con esto (blanco arriba, verde delante) y pulsa «Ya está» para empezar los 15 s.</p><div class="actions"><button class="btn primary" type="button" id="ctPlan">Ya está</button></div>';
        } else if (ct.phase === 'plan' || ct.phase === 'do') {
          html += `<div class="fr-ct-clock"><span class="field-title">${ct.phase === 'plan' ? `Planea la ${esc(name)} entera` : 'Haciéndola…'}</span><b id="ctClock">${ct.phase === 'plan' ? '15' : '0.00'}</b></div>`;
          html += ctx.cube && ctx.cube.on
            ? `<p class="hint">${ct.phase === 'plan' ? `Pon el ${esc(COLOR_NAME[settings.cross])} abajo y hazla de una vez: empiezo a contar con tu primer giro.` : `${ct.moves.length} giros…`}</p>`
            : '<div class="actions"><button class="btn primary" type="button" id="ctDone">La he hecho</button></div>';
        } else if (ct.phase === 'rewind') {
          html += stepBox('Rebobina', `Deshaz tu cruz giro a giro, con el ${esc(COLOR_NAME[settings.cross])} abajo y el verde delante, hasta volver a la mezcla. Luego sigues la más corta.`);
          html += '<div class="actions"><button class="btn" type="button" id="ctGo">Otra</button></div>';
        } else if (ct.phase === 'replay') {
          html += `<p class="fr-note">La más corta (${ct.best.length} ${ct.best.length === 1 ? 'giro' : 'giros'}), paso a paso:</p>`;
          html += stepBox('Ahora', 'Haz cada giro cuando lo veas: paso al siguiente en cuanto lo haces.');
          html += '<div class="actions"><button class="btn" type="button" id="ctRetry">Prefiero intentarla yo</button><button class="btn" type="button" id="ctGo">Otra</button></div>';
        } else if (ct.phase === 'done') {
          const r = ct.result || {};
          const b = ct.best;
          if (ct.replayed) html += '<p class="fr-big ok">¡Hecha! Así es la más corta.</p>';
          else if (r.n != null) {
            const extra = r.n - r.opt;
            html += `<p class="fr-big ${extra <= 0 ? 'ok' : ''}">${extra <= 0 ? '¡La más corta!' : `${r.n} giros: ${extra} más que la más corta`}</p>`
              + `<p class="fr-note">Tu cruz, en ${f1(r.t)} s${r.over ? ' (pasaste de los 15 s planeando)' : ''}${r.retry ? ' (repetida: no cuenta para las medias)' : ''}: ${algHtml(r.mine)}</p>`;
          }
          html += `<p class="fr-note">La más corta (${b.length} ${b.length === 1 ? 'giro' : 'giros'}): ${b.rotation ? `<span class="muted">${esc(b.rotation)}</span> ` : ''}${b.moves ? algHtml(b.moves) : '<i>ya estaba hecha</i>'}</p>`
            + `<div class="actions">${canRewind() ? `<button class="btn primary" type="button" id="ctRewind">${ct.replayed ? 'Rebobinar otra vez' : 'Rebobinar y seguir la más corta'}</button>` : ''}`
            + `<button class="btn${canRewind() ? '' : ' primary'}" type="button" id="ctGo">Otra</button></div>`
            + (canRewind() ? '<p class="hint">Rebobinar te lleva giro a giro de vuelta a la mezcla para hacer la más corta paso a paso (o repetirla tú).</p>' : '');
        }
      }
      const stats = ctStats();
      html += stats ? `<p class="hint">${esc(stats)}</p>` : '';
      box.innerHTML = html;
      const go = $('ctGo'); if (go) go.addEventListener('click', ctNew);
      const pl = $('ctPlan'); if (pl) pl.addEventListener('click', ctPlan);
      const dn = $('ctDone'); if (dn) dn.addEventListener('click', () => ctFinish(null));
      const rw = $('ctRewind'); if (rw) rw.addEventListener('click', ctRewind);
      const rt = $('ctRetry'); if (rt) rt.addEventListener('click', ctRetry);
      if (ct.phase === 'plan' || ct.phase === 'do') ctTick();
    }
    onView('entrenar', renderCt);

    // The cross trainer at full screen: only its panel, the turn to do now as big as it fits.
    let full = false;
    function setFull(on, fromHistory) {
      if (full === on) return;
      full = on;
      document.body.classList.toggle('ctfocus', on);
      const b = $('ctFull');
      if (b) { b.textContent = on ? 'Salir' : 'Pantalla completa'; b.setAttribute('aria-pressed', String(on)); }
      try {
        if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
        if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
      } catch (e) { /* the layout alone is enough */ }
      if (on) { try { history.pushState({ frCtFull: true }, ''); } catch (e) { /* sandboxed */ } } else if (!fromHistory) { try { if (history.state && history.state.frCtFull) history.back(); } catch (e) { /* sandboxed */ } }
    }
    const fb = $('ctFull');
    if (fb) fb.addEventListener('click', () => setFull(!full));
    window.addEventListener('popstate', () => { if (full) setFull(false, true); });
    document.addEventListener('keydown', (ev) => { if (full && ev.key === 'Escape') setFull(false); });
    document.addEventListener('fullscreenchange', () => { if (full && !document.fullscreenElement) setFull(false); });
    ['crono', 'casos', 'progreso', 'ranking', 'ajustes'].forEach((v) => onView(v, () => { if (full) setFull(false); }));

    return { ct, ctActive, ctMove, tracking, setFull };
  };
})();
