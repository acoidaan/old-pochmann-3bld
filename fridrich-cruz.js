// «Entrenar la cruz» in Fridrich: a scramble to follow on the cube, then the white cross against the clock,
// compared with the shortest one.
// Installed by fridrich.js: window.FridrichCruz(ctx) → { ct, ctActive, ctMove }.
(() => {
  'use strict';
  window.FridrichCruz = (ctx) => {
    const {
      $, C, COLOR_NAME, K, M, algHtml, apply, buzz, changed, done, esc, f1, faceMapFor, fmt, followMove,
      halves, inHand, isSolved, load, locate, makeFollow, now, onView, parseAlg, save, settings, solved,
      undoText
    } = ctx;
    // A scramble, 15 s to plan the whole cross, then do it in one go. With the smart cube the app counts the
    // turns and the time and compares with the shortest; without it, it shows the shortest at the end.
    const ct = { phase: 'idle', scr: '', state: null, best: null, follow: null, insp0: 0, t0: 0, moves: [], result: null, raf: 0 };
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
        } else if (ct.phase === 'do') el.textContent = fmt(now() - ct.t0);
        else return;
        ct.raf = requestAnimationFrame(step);
      };
      ct.raf = requestAnimationFrame(step);
    }
    function ctMove(mv, st, t) {
      if (ct.phase === 'scramble' && ct.follow) {
        followMove(ct.follow, st, mv);
        if (done(ct.follow)) ctPlan();
        renderCt();
        return;
      }
      if (ct.phase === 'plan') { ct.phase = 'do'; ct.t0 = t; ct.moves = []; ctTick(); }
      if (ct.phase !== 'do') return;
      ct.moves.push(mv);
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
        over: ct.insp0 && (ct.t0 || now()) - ct.insp0 > 15000,
      };
      if (used) {
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
        html += `<p class="fr-scr fr-ct-scr">${moves.map((m, i) => `<span class="sm${F && !F.lost && ct.phase === 'scramble' ? (i < F.pos ? ' done' : i === F.pos ? (F.halfway ? ' next half' : ' next') : '') : ''}">${esc(m)}</span>`).join(' ')}</p>`;
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
        } else if (ct.phase === 'done') {
          const r = ct.result || {};
          const b = ct.best;
          if (r.n != null) {
            const extra = r.n - r.opt;
            html += `<p class="fr-big ${extra <= 0 ? 'ok' : ''}">${extra <= 0 ? '¡La más corta!' : `${r.n} giros: ${extra} más que la más corta`}</p>`
              + `<p class="fr-note">Tu cruz, en ${f1(r.t)} s${r.over ? ' (pasaste de los 15 s planeando)' : ''}: ${algHtml(r.mine)}</p>`;
          }
          html += `<p class="fr-note">La más corta (${b.length} ${b.length === 1 ? 'giro' : 'giros'}): ${b.rotation ? `<span class="muted">${esc(b.rotation)}</span> ` : ''}${b.moves ? algHtml(b.moves) : '<i>ya estaba hecha</i>'}</p>`
            + '<div class="actions"><button class="btn primary" type="button" id="ctGo">Otra</button></div>';
        }
      }
      const stats = ctStats();
      html += stats ? `<p class="hint">${esc(stats)}</p>` : '';
      box.innerHTML = html;
      const go = $('ctGo'); if (go) go.addEventListener('click', ctNew);
      const pl = $('ctPlan'); if (pl) pl.addEventListener('click', ctPlan);
      const dn = $('ctDone'); if (dn) dn.addEventListener('click', () => ctFinish(null));
      if (ct.phase === 'plan' || ct.phase === 'do') ctTick();
    }
    onView('entrenar', renderCt);

    return { ct, ctActive, ctMove };
  };
})();
