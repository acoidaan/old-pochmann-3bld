// «Progreso» in Fridrich: the summary, day by day, the calendar of practice, the time practised, the steps,
// efficiency, the cross and the cases.
// Installed by fridrich.js: window.FridrichProgreso(ctx) → { renderProgress }.
(() => {
  'use strict';
  window.FridrichProgreso = (ctx) => {
    const { $, C, DAY_MS, K, S, STEP_NAME, deltaHtml, esc, fdate, fmt, learn, load, onView, recommendation, secs, showView } = ctx;
    let dayRange = 90;
    const KIND = { single: 'Single', ao5: 'ao5', ao12: 'ao12' };
    function spark(values, label) {
      const v = values.filter((x) => x != null && Number.isFinite(x)).slice(-80);
      if (v.length < 3) return '';
      const sm = v.map((_, i) => { const w = v.slice(Math.max(0, i - 4), i + 1); return w.reduce((a, b) => a + b, 0) / w.length; });
      const W = 200; const H = 40;
      let lo = Math.min(...sm); let hi = Math.max(...sm);
      if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
      const x = (i) => 2 + (i / (sm.length - 1)) * (W - 6);
      const y = (val) => 4 + (1 - (val - lo) / (hi - lo)) * (H - 8);
      const d = sm.map((val, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(val).toFixed(1)}`).join(' ');
      return `<svg class="fr-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}"><path d="${d}"/><circle cx="${x(sm.length - 1).toFixed(1)}" cy="${y(sm[sm.length - 1]).toFixed(1)}" r="2.6"/></svg>`;
    }
    // ---- Time practised: timed, in sessions and real time on the page
    function renderPractice(crossTr) {
      const P = S.practiceTime({ times: ctx.times, ltimes: ctx.ltimes, trlog: ctx.trlog, crossTr, sessions: load(K.sessions, []), active: window.Practice ? window.Practice.days() : {} });
      const dur = (ms) => {
        if (!ms) return '—';
        if (ms < 60000) return `${Math.max(1, Math.round(ms / 1000))} s`;
        const m = Math.round(ms / 60000);
        return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
      };
      const row = (name, v, cls) => `<tr${cls ? ` class="${cls}"` : ''}><th scope="row">${name}</th>${v.map((x) => `<td>${dur(x)}</td>`).join('')}</tr>`;
      $('progPractice').innerHTML = `<table class="fr-practice">
        <thead><tr><th scope="col"><span class="sr-only">Qué</span></th><th scope="col">Hoy</th><th scope="col">Semana</th><th scope="col">Mes</th><th scope="col">Total</th></tr></thead>
        <tbody>${P.rows.map((r) => row(r.name, r.v)).join('')}${row('Cronometrado', P.timed, 'sum')}${row('Sesiones de casos', P.sessions, 'aside')}${row('En la página', P.real, 'aside')}</tbody>
      </table>
      <p class="hint">Cronometrado: lo que suman tus tiempos. Sesiones: su tiempo activo, con los casos entrenados en ellas. En la página: el tiempo real practicando aquí, con mezclar, inspeccionar y pensar (una pausa de más de 2 minutos no cuenta); se empezó a medir con esta versión.</p>`;
    }
    function renderProgress() {
      if (!$('progSummary')) return;
      const crossTr = load(K.crossTr, []);
      const sm = S.summary(ctx.times);
      // The practice counts every solve, the ones of a phase on its own too.
      const act = S.activity([...ctx.times, ...ctx.ltimes].sort((a, b) => a.at - b.at), ctx.trlog, crossTr);
      const empty = !ctx.times.length && !ctx.ltimes.length && !ctx.trlog.length && !crossTr.length;
      ['progDaysPanel', 'progActPanel', 'progPracticePanel', 'progStepsPanel', 'progEffPanel', 'progCrossPanel', 'progCasesPanel'].forEach((id) => { $(id).hidden = empty; });
      if (empty) {
        $('progSummary').innerHTML = '<p class="empty-note">Aún no hay nada que contar. Haz unos solves en el cronómetro (mejor con el cubo inteligente: así veo cada paso) o entrena unos casos, y aquí verás cómo vas.</p>';
        return;
      }
      // ---- Summary
      const lead = [];
      if (ctx.times.length) {
        lead.push(`Llevas <b>${ctx.times.length}</b> ${ctx.times.length === 1 ? 'solve' : 'solves'} desde el ${fdate(sm.first)}${act.days > 1 ? `, en ${act.days} días distintos` : ''}.`);
        if (sm.ao12 != null && Number.isFinite(sm.ao12)) lead.push(`Tu media de 12 es <b>${fmt(sm.ao12)}</b>${sm.prevAo12 != null && Number.isFinite(sm.prevAo12) ? `: ${deltaHtml(sm.ao12, sm.prevAo12)} que las 12 de antes` : ''}.`);
        else if (sm.ao5 != null && Number.isFinite(sm.ao5)) lead.push(`Tu media de 5 es <b>${fmt(sm.ao5)}</b>.`);
        if (sm.then && Number.isFinite(sm.then.v) && Number.isFinite(sm.ao12)) lead.push(`${sm.then.month ? 'Hace un mes' : 'Al empezar'} tu media de 12 era ${fmt(sm.then.v)}: ${deltaHtml(sm.ao12, sm.then.v)}.`);
        if (sm.week.n) lead.push(`Esta semana: <b>${sm.week.n}</b> solves${sm.week.mean != null ? `, media ${fmt(sm.week.mean)}` : ''}${sm.prevWeek.mean != null && sm.week.mean != null ? ` (${deltaHtml(sm.week.mean, sm.prevWeek.mean)} que la anterior)` : ''}.`);
        else lead.push('Esta semana aún no has hecho solves.');
      } else lead.push('Aún no hay solves: de momento, lo que has entrenado.');
      const tile = (k, v, sub) => `<div class="stat"><span>${k}</span><b>${v}</b><small>${sub || '&nbsp;'}</small></div>`;
      const tiles = ctx.times.length ? [
        tile('Mejor single', sm.best ? fmt(sm.best.v) : '—', sm.best ? `${fdate(sm.best.at)} · #${sm.best.i + 1}` : ''),
        tile('Mejor ao5', sm.bestAo5 ? fmt(sm.bestAo5.v) : '—', sm.bestAo5 ? fdate(sm.bestAo5.at) : 'faltan solves'),
        tile('Mejor ao12', sm.bestAo12 ? fmt(sm.bestAo12.v) : '—', sm.bestAo12 ? fdate(sm.bestAo12.at) : 'faltan solves'),
        tile('ao12 ahora', fmt(sm.ao12), sm.ao100 != null ? `ao100 ${fmt(sm.ao100)}` : sm.ao50 != null ? `ao50 ${fmt(sm.ao50)}` : ''),
        tile('Racha', `${act.streak} ${act.streak === 1 ? 'día' : 'días'}`, `la mejor, ${act.bestStreak}`),
      ] : [tile('Racha', `${act.streak} ${act.streak === 1 ? 'día' : 'días'}`, `la mejor, ${act.bestStreak}`)];
      $('progSummary').innerHTML = `<p class="fr-prog-lead">${lead.join(' ')}</p><div class="stats fr-prog-tiles">${tiles.join('')}</div>`;
      renderPractice(crossTr);

      // ---- Day by day, and the milestones
      renderDayChart();
      const ms = S.milestones(ctx.times);
      $('progMilestones').innerHTML = ctx.times.length ? `<div class="fr-miles">
        ${ms.next.length ? `<div><h3 class="field-title">A por</h3><ul>${ms.next.map((x) => `<li><b>${KIND[x.kind]} por debajo de ${x.sub} s</b> <span class="muted">· te faltan ${secs(x.gap)}</span></li>`).join('')}</ul></div>` : ''}
        ${ms.done.length ? `<div><h3 class="field-title">Logros</h3><ul>${ms.done.slice(0, 5).map((x) => `<li><b>${KIND[x.kind]} por debajo de ${x.sub} s</b> <span class="muted">· ${fdate(x.at)} (${fmt(x.v)})</span></li>`).join('')}</ul></div>` : ''}
      </div>` : '';

      // ---- Practice: a calendar
      const lvl = (n) => (!n ? 0 : n <= 3 ? 1 : n <= 8 ? 2 : n <= 15 ? 3 : 4);
      const weeks = Math.ceil(act.cells.length / 7);
      let months = '';
      let lastM = -1;
      for (let w = 0; w < weeks; w++) {
        const c = act.cells[w * 7];
        const m = new Date(c.ts).getMonth();
        months += `<span style="grid-column:${w + 1}">${m !== lastM ? new Date(c.ts).toLocaleDateString('es-ES', { month: 'short' }) : ''}</span>`;
        lastM = m;
      }
      const cellTitle = (c) => `${fdate(c.ts)}: ${c.n ? [c.solves && `${c.solves} ${c.solves === 1 ? 'solve' : 'solves'}`, c.train && `${c.train} ${c.train === 1 ? 'caso' : 'casos'}`, c.cross && `${c.cross} ${c.cross === 1 ? 'cruz' : 'cruces'}`].filter(Boolean).join(', ') : 'nada'}`;
      $('progActivity').innerHTML = `<div class="fr-hm-wrap">
          <div class="fr-hm-days" aria-hidden="true"><span>L</span><span></span><span>X</span><span></span><span>V</span><span></span><span>D</span></div>
          <div class="fr-hm-main">
            <div class="fr-hm-months" aria-hidden="true" style="grid-template-columns:repeat(${weeks}, var(--hm))">${months}</div>
            <div class="fr-hm" role="img" aria-label="Has practicado ${act.active30} de los últimos 30 días; racha de ${act.streak} ${act.streak === 1 ? 'día' : 'días'}" style="grid-template-columns:repeat(${weeks}, var(--hm))">${act.cells.map((c) => `<i class="h${lvl(c.n)}" title="${esc(cellTitle(c))}"></i>`).join('')}</div>
          </div>
        </div>
        <p class="fr-hm-key" aria-hidden="true">Menos <i class="h0"></i><i class="h1"></i><i class="h2"></i><i class="h3"></i><i class="h4"></i> Más <span class="muted">· solves, casos entrenados y cruces de cada día</span></p>
        <div class="stats fr-prog-tiles">
          ${tile('Racha', `${act.streak} ${act.streak === 1 ? 'día' : 'días'}`, act.streak ? 'seguidos, hasta hoy' : 'practica hoy y empieza una')}
          ${tile('Mejor racha', `${act.bestStreak} ${act.bestStreak === 1 ? 'día' : 'días'}`, '')}
          ${tile('Últimos 30 días', `${act.active30} ${act.active30 === 1 ? 'día' : 'días'}`, 'practicando')}
          ${tile('Tiempo girando', act.ms >= 3600000 ? `${(act.ms / 3600000).toFixed(1)} h` : `${Math.round(act.ms / 60000)} min`, 'solves y casos cronometrados')}
        </div>`;

      // ---- Steps
      const st = S.steps(ctx.times);
      $('progSteps').innerHTML = !st.n ? '<p class="fr-note">Con el cubo inteligente verás aquí cuánto tardas en cada paso y cómo cambia con el tiempo.</p>'
        : `<p class="hint">Últimos ${st.recent} solves con el cubo${st.groups[0].before != null ? ', comparados con los anteriores' : ''}.</p>
          <div class="fr-step-cards">${st.groups.map((g) => `<div class="fr-step-card">
            <span class="field-title">${g.name}</span>
            <b class="fr-step-v">${secs(g.now, 2)}</b>
            ${deltaHtml(g.now, g.before) || '<span class="fr-delta same">&nbsp;</span>'}
            <span class="muted">${Math.round(g.share * 100)} % del solve · ${Math.round(g.moves)} giros${g.rec != null ? ` · ${secs(g.rec)} reconociendo` : ''}</span>
            ${spark(g.series.map((x) => x.v), `${g.name}: ${g.series.length} solves, media móvil de 5`)}
          </div>`).join('')}</div>
          <p class="fr-note">Giros por segundo: <b>${st.tps.toFixed(2)}</b>${st.tpsBefore != null ? ` ${deltaHtml(st.tps, st.tpsBefore, { higherBetter: true, eps: 0.05, fmt: (d) => d.toFixed(2) })}` : ''}</p>`;

      // ---- Efficiency
      const ef = S.efficiency(ctx.times);
      if (!ef.n) $('progEff').innerHTML = '<p class="fr-note">Cada solve con el cubo se analiza: cuántos giros hiciste en cada paso contra lo más corto. Aquí verás la media y si mejora.</p>';
      else {
        const a = ef.now; const b = ef.before;
        const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)} %`);
        const num = (x, d = 1) => (x == null ? '—' : x.toFixed(d));
        const row = (name, cur, before, show, opts) => `<tr><th scope="row">${name}</th><td class="fr-an-n">${show(cur)}</td><td class="fr-an-n">${b ? show(before) : '—'}</td><td class="fr-an-note">${b ? deltaHtml(cur, before, opts) : ''}</td></tr>`;
        const giros = { eps: 0.25, fmt: (d) => `${d.toFixed(1)} giros` };
        const pctO = { eps: 0.02, higherBetter: true, fmt: (d) => `${Math.round(d * 100)} %` };
        $('progEff').innerHTML = `<table class="fr-an-table"><thead><tr><th scope="col">Últimos ${Math.min(12, ef.n)} solves</th><th scope="col">Ahora</th><th scope="col">Antes</th><th scope="col">Cambio</th></tr></thead><tbody>
          ${row('Eficiencia', a.eff, b && b.eff, pct, pctO)}
          ${row('Giros por solve', a.moves, b && b.moves, (x) => (x == null ? '—' : `${Math.round(x)}`), giros)}
          ${row('Cruz: giros de más', a.crossExtra, b && b.crossExtra, num, giros)}
          ${row('Parejas: giros de más (cada una)', a.perPair, b && b.perPair, num, giros)}
          ${row('Parejas por el camino más corto', a.pairsOptimal, b && b.pairsOptimal, pct, pctO)}
          ${row('Empezaste por la pareja más fácil', a.easiest, b && b.easiest, pct, pctO)}
          ${row('Parado en el F2L', a.f2lStop, b && b.f2lStop, (x) => secs(x), {})}
          ${row('OLL y PLL: giros de más', a.llExtra, b && b.llExtra, num, giros)}
        </tbody></table>
        ${spark(ef.list.map((x) => x.eff * 100), `Eficiencia de tus ${ef.n} solves analizados, media móvil de 5`) ? `<div class="fr-eff-spark"><span class="field-title">Eficiencia, solve a solve</span>${spark(ef.list.map((x) => x.eff * 100), `Eficiencia de tus ${ef.n} solves analizados, media móvil de 5`)}</div>` : ''}
        <p class="hint">«Antes»: los 12 solves analizados anteriores${b ? '' : ' (aún no hay tantos)'}.</p>`;
      }

      // ---- The cross
      const ctl = crossTr;
      const lastC = ctl.slice(-10); const firstC = ctl.length >= 15 ? ctl.slice(0, 10) : [];
      const avgX = (xs) => (xs.length ? xs.reduce((s2, x) => s2 + (x.n - x.opt), 0) / xs.length : null);
      const cg = st.n ? st.groups[0] : null;
      $('progCross').innerHTML = (ctl.length ? `<div class="stats fr-prog-tiles">
          ${tile('Entrenadas', String(ctl.length), 'en «Entrenar la cruz»')}
          ${tile('Giros de más', avgX(lastC).toFixed(1), `de media en las últimas ${lastC.length}${firstC.length ? ` · al principio ${avgX(firstC).toFixed(1)}` : ''}`)}
          ${tile('Perfectas', `${Math.round((lastC.filter((x) => x.n <= x.opt).length / lastC.length) * 100)} %`, 'la más corta, de las últimas')}
          ${tile('Tiempo', secs(lastC.reduce((s2, x) => s2 + (x.t || 0), 0) / lastC.length, 2), 'de media')}
        </div>` : '<p class="fr-note">Aún no has usado «Entrenar la cruz»: planéala entera en la inspección y te digo cuántos giros te sobran.</p>')
        + (cg ? `<p class="fr-note">En tus solves con el cubo, la cruz te lleva <b>${secs(cg.now, 2)}</b> y ${Math.round(cg.moves)} giros${ef.n ? `, ${ef.now.crossExtra.toFixed(1)} más que la más corta` : ''}.</p>` : '')
        + '<div class="actions"><button class="btn" type="button" data-prog-go="cross">Entrenar la cruz</button></div>';

      // ---- Cases
      const p = recommendation();
      const top = p.scored.filter((x) => x.ms >= 15 && x.stats.practiced).slice(0, 3);
      const known = C.CASES.filter((c) => learn[c.id] === 'known').length;
      const learning = C.CASES.filter((c) => learn[c.id] === 'learning').length;
      const skips = { oll1: 0, oll2: 0, pll1: 0, pll2: 0 };
      ctx.times.forEach((r) => { if (r.sp) [2, 3, 4, 5].forEach((k) => { const x = r.sp.s[k]; if (x && x[4]) skips[C.LL[k - 2]]++; }); });
      const skipTxt = C.LL.filter((id) => skips[id]).map((id) => `${STEP_NAME[id]} ×${skips[id]}`).join(' · ');
      $('progCases').innerHTML = `<p class="fr-note">Te sabes <b>${known}</b> de 16${learning ? ` y estás aprendiendo ${learning}` : ''}.${skipTxt ? ` Saltos que te han tocado: ${skipTxt}.` : ''}</p>
        ${top.length ? `<h3 class="field-title">Lo que más te cuesta</h3><ol class="fr-top-cases">${top.map((x) => `<li><b>${esc(x.c.name)}</b> <span class="muted">${STEP_NAME[x.c.step]} · ${(x.ms / 1000).toFixed(2)} s por solve</span><br><span class="hint">${esc(x.why[0] || '')}</span></li>`).join('')}</ol>` : ''}
        <div class="actions"><button class="btn primary" type="button" data-prog-go="plan">Ver el set recomendado</button></div>`;
    }
    $('progCross').addEventListener('click', (ev) => { if (ev.target.closest('[data-prog-go="cross"]')) { showView('entrenar'); try { $('ctPanel').scrollIntoView({ block: 'start' }); } catch (e) { /* no layout */ } } });
    $('progCases').addEventListener('click', (ev) => { if (ev.target.closest('[data-prog-go="plan"]')) showView('entrenar'); });

    // Each day with solves: its mean and its best. One axis (seconds), hovering shows that day.
    const DCH = { w: 640, h: 220, l: 40, r: 16, t: 12, b: 26 };
    function renderDayChart() {
      const box = $('dayChart');
      document.querySelectorAll('[data-days]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.days) === dayRange)));
      const all = S.daily(ctx.times).filter((d) => d.mean != null);
      const from = dayRange ? S.dayStart(Date.now()) - (dayRange - 1) * DAY_MS : -Infinity;
      const days = all.filter((d) => d.ts >= from);
      if (days.length < 2) {
        box.innerHTML = `<p class="fr-note">${all.length < 2 ? 'Cuando tengas solves de dos días o más, aquí verás tu media y tu mejor tiempo de cada día.' : 'En estos días hay menos de dos con solves: prueba con «Todo».'}</p>`;
        $('dayLegend').innerHTML = '';
        return;
      }
      DCH.w = Math.max(300, Math.round(box.clientWidth || 640));
      DCH.h = DCH.w < 520 ? 190 : 220;
      const W = DCH.w - DCH.l - DCH.r; const H = DCH.h - DCH.t - DCH.b;
      const t0 = days[0].ts; const span = Math.max(1, days[days.length - 1].ts - t0);
      const x = (ts) => DCH.l + ((ts - t0) / span) * W;
      const vals = days.flatMap((d) => [d.mean, d.best]);
      let lo = Math.min(...vals); let hi = Math.max(...vals);
      if (hi - lo < 1000) { hi += 500; lo -= 500; }
      const pad = (hi - lo) * 0.08; lo = Math.max(0, lo - pad); hi += pad;
      const y = (v) => DCH.t + H - ((v - lo) / (hi - lo)) * H;
      const stepS = [0.5, 1, 2, 5, 10, 20, 30, 60].find((st2) => (hi - lo) / 1000 / st2 <= 5) || 120;
      let grid = '';
      for (let v = Math.ceil(lo / 1000 / stepS) * stepS; v * 1000 <= hi; v += stepS) {
        grid += `<line class="fr-grid" x1="${DCH.l}" x2="${DCH.l + W}" y1="${y(v * 1000).toFixed(1)}" y2="${y(v * 1000).toFixed(1)}"/><text class="fr-tick" x="${DCH.l - 8}" y="${(y(v * 1000) + 4).toFixed(1)}" text-anchor="end">${v % 1 ? v.toFixed(1) : v}</text>`;
      }
      const d = days.map((p, k) => `${k ? 'L' : 'M'}${x(p.ts).toFixed(1)} ${y(p.mean).toFixed(1)}`).join(' ');
      box.innerHTML = `<svg viewBox="0 0 ${DCH.w} ${DCH.h}" role="img" aria-label="Tu media y tu mejor tiempo de cada día, ${days.length} días: de ${fmt(days[0].mean)} a ${fmt(days[days.length - 1].mean)} de media">
        ${grid}<text class="fr-tick" x="${DCH.l}" y="${DCH.h - 6}">${fdate(days[0].ts)}</text><text class="fr-tick" x="${DCH.l + W}" y="${DCH.h - 6}" text-anchor="end">${fdate(days[days.length - 1].ts)}</text>
        <path class="fr-l a5" d="${d}"/>
        ${days.map((p) => `<circle class="fr-dmean" cx="${x(p.ts).toFixed(1)}" cy="${y(p.mean).toFixed(1)}" r="3"/><circle class="fr-dbest" cx="${x(p.ts).toFixed(1)}" cy="${y(p.best).toFixed(1)}" r="3"/>`).join('')}
        <line class="fr-cross-hair" id="dayHair" x1="0" x2="0" y1="${DCH.t}" y2="${DCH.t + H}" visibility="hidden"/>
        <rect class="fr-hit" x="${DCH.l - 6}" y="${DCH.t}" width="${W + 12}" height="${H}"/></svg><div class="fr-tip" id="dayTip" hidden></div>`;
      $('dayLegend').innerHTML = '<span><i class="fr-key a5"></i>Media del día</span><span><i class="fr-key best"></i>Mejor del día</span>';
      const svg = box.querySelector('svg');
      const hit = svg.querySelector('.fr-hit');
      const move = (ev) => {
        const rect = svg.getBoundingClientRect();
        const px = ((ev.clientX - rect.left) / rect.width) * DCH.w;
        let k = 0;
        days.forEach((p, i) => { if (Math.abs(x(p.ts) - px) < Math.abs(x(days[k].ts) - px)) k = i; });
        const p = days[k];
        const hair = $('dayHair');
        hair.setAttribute('x1', x(p.ts)); hair.setAttribute('x2', x(p.ts)); hair.setAttribute('visibility', 'visible');
        const tip = $('dayTip');
        tip.hidden = false;
        tip.innerHTML = `<b>${fdate(p.ts)}</b> · ${p.n} ${p.n === 1 ? 'solve' : 'solves'}<br>media ${fmt(p.mean)}<br>mejor ${fmt(p.best)}`;
        const left = (x(p.ts) / DCH.w) * rect.width;
        tip.style.left = `${Math.min(rect.width - 130, Math.max(0, left + 10))}px`;
      };
      hit.addEventListener('pointermove', move);
      hit.addEventListener('pointerdown', move);
      hit.addEventListener('pointerleave', () => { $('dayHair').setAttribute('visibility', 'hidden'); $('dayTip').hidden = true; });
    }
    document.querySelectorAll('[data-days]').forEach((b) => b.addEventListener('click', () => { dayRange = Number(b.dataset.days); renderDayChart(); }));
    let dayW = 0;
    window.addEventListener('resize', () => {
      clearTimeout(dayW);
      dayW = setTimeout(() => { if (ctx.view === 'progreso') renderDayChart(); }, 150);
    });
    onView('progreso', () => setTimeout(renderProgress, 0));

    return { renderProgress };
  };
})();
