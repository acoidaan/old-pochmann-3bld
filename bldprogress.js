// «Progreso» on the 3BLD page: how your attempts go over time. The numbers are pure functions (window.BldStats,
// used by the tests too); the view draws them: a summary, week by week (aciertos, memo and execution), where
// you fail (the letters, from your DNFs and the trainer), the days you practised and the time practised (real,
// from practice.js, and timed). Only whole attempts count here; the parts have their numbers in the crono.
(() => {
  'use strict';
  const dayStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const addDays = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };
  const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const weekStart = (t) => { const d0 = dayStart(t); const dow = (new Date(d0).getDay() + 6) % 7; return addDays(d0, -dow); };
  const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);

  // Week by week, the last `weeks` (Monday first): attempts, aciertos and the median memo and execution of the
  // solved ones.
  function weekly(list, now = Date.now(), weeks = 12) {
    const first = addDays(weekStart(now), -7 * (weeks - 1));
    const out = [];
    for (let w = 0; w < weeks; w++) {
      const from = addDays(first, 7 * w);
      const to = addDays(from, 7);
      const xs = list.filter((t) => t.at >= from && t.at < to);
      const ok = xs.filter((t) => t.ok);
      out.push({ ts: from, n: xs.length, ok: ok.length, rate: xs.length ? ok.length / xs.length : null, memo: median(ok.map((t) => t.memo)), exec: median(ok.map((t) => t.exec)) });
    }
    return out;
  }
  // The days you practised (attempts of any kind, or practice time), for a calendar of `weeks` weeks ending today,
  // and the streaks.
  function activity(times, practice, now = Date.now(), weeks = 18) {
    const per = new Map();
    const bump = (k, f, v) => { if (!per.has(k)) per.set(k, { n: 0, ms: 0 }); per.get(k)[f] += v; };
    times.forEach((t) => bump(dayKey(t.at), 'n', 1));
    Object.entries(practice || {}).forEach(([k, ms]) => { if (ms >= 60000) bump(k, 'ms', ms); });
    const today = dayStart(now);
    const start = addDays(weekStart(today), -7 * (weeks - 1));
    const cells = [];
    for (let t = start; t <= today; t = addDays(t, 1)) cells.push({ key: dayKey(t), ts: t, ...(per.get(dayKey(t)) || { n: 0, ms: 0 }) });
    const active = new Set(per.keys());
    let streak = 0;
    let t = active.has(dayKey(today)) ? today : addDays(today, -1);
    while (active.has(dayKey(t))) { streak++; t = addDays(t, -1); }
    let best = 0; let run = 0; let prev = null;
    [...active].sort().forEach((k) => {
      const ts = dayStart(new Date(`${k}T12:00:00`).getTime());
      run = prev != null && addDays(prev, 1) === ts ? run + 1 : 1;
      best = Math.max(best, run);
      prev = ts;
    });
    const active30 = cells.filter((c) => c.ts > addDays(today, -30) && (c.n || c.ms)).length;
    return { cells, streak, bestStreak: best, active30, days: active.size };
  }
  // Time practised: real (practice.js, per day) and timed (memo + execution of every attempt), today, this week,
  // this month and in all.
  function practiceTime(times, practice, now = Date.now()) {
    const today = dayStart(now);
    const week = weekStart(now);
    const d = new Date(now);
    const month = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    const spans = { today, week, month, total: -Infinity };
    const real = {};
    const timed = {};
    Object.entries(spans).forEach(([name, from]) => {
      real[name] = sum(Object.entries(practice || {}).filter(([k]) => new Date(`${k}T12:00:00`).getTime() >= from).map(([, ms]) => ms));
      timed[name] = sum(times.filter((t) => t.at >= from).map((t) => (t.memo || 0) + (t.exec || 0)));
    });
    return { real, timed };
  }
  // Where you fail: the letters that broke your attempts (found by the smart cube) and the ones you miss in
  // «Entrenar», worst first.
  function fails(train, lettersOf) {
    const out = [];
    ['edge', 'corner'].forEach((kind) => {
      const data = (train && train[kind]) || {};
      lettersOf(kind).forEach((L) => {
        const st = data[L];
        if (!st) return;
        const miss = (st.seen || 0) - (st.right || 0);
        const dnf = st.dnf || 0;
        if (!dnf && !miss) return;
        out.push({ kind, L, dnf, miss, seen: st.seen || 0, right: st.right || 0, streak: st.streak || 0, score: dnf * 3 + miss + (st.streak >= 3 ? -2 : 0) });
      });
    });
    return out.filter((x) => x.score > 0).sort((a, b) => b.score - a.score || b.dnf - a.dnf);
  }
  const BldStats = { weekly, activity, practiceTime, fails, dayKey, weekStart };
  window.BldStats = BldStats;

  // ================= The view =================
  const O = window.OP3;
  const $ = (id) => document.getElementById(id);
  if (!O || !$('bpSummary')) return;
  const { fmt, esc } = O;
  const B = O.bld;
  const fdate = (t) => new Date(t).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  const pct = (x) => (x == null ? '—' : `${Math.round(x * 100)} %`);
  const hm = (ms) => (ms >= 3600000 ? `${Math.floor(ms / 3600000)} h ${Math.round((ms % 3600000) / 60000)} min` : ms >= 60000 ? `${Math.round(ms / 60000)} min` : ms > 0 ? `${Math.round(ms / 1000)} s` : '—');
  const tile = (k, v, sub) => `<div class="stat"><span>${k}</span><b>${v}</b><small>${sub || '&nbsp;'}</small></div>`;

  function render() {
    if (O.currentView() !== 'progreso') return;
    const all = O.data.times();
    const list = all.filter((t) => B.partOf(t) === 'full');
    const practice = window.Practice ? window.Practice.days() : {};
    const train = O.data.train();
    const trained = ['edge', 'corner'].some((k) => Object.values((train && train[k]) || {}).some((st) => st && (st.seen || st.dnf)));
    const empty = !all.length && !trained;
    ['bpWeeksPanel', 'bpFailsPanel', 'bpDaysPanel', 'bpTimePanel'].forEach((id) => { $(id).hidden = empty; });
    if (empty) {
      $('bpSummary').innerHTML = '<p class="empty-note">Aún no hay nada que contar. Haz unos intentos en el cronómetro o entrena unos setups, y aquí verás cómo vas.</p>';
      return;
    }
    const now = Date.now();
    const act = BldStats.activity(all, practice, now);
    // ---- Summary
    const ok = list.filter((t) => t.ok);
    const best = ok.length ? Math.min(...ok.map(B.valueOf)) : null;
    const bestAt = best != null ? ok.find((t) => B.valueOf(t) === best).at : null;
    const wk = BldStats.weekly(list, now, 2);
    const lead = [];
    if (list.length) {
      lead.push(`Llevas <b>${list.length}</b> ${list.length === 1 ? 'intento' : 'intentos'} completos desde el ${fdate(list[0].at)}, con un <b>${pct(ok.length / list.length)}</b> de aciertos.`);
      if (wk[1].n) lead.push(`Esta semana: <b>${wk[1].n}</b> ${wk[1].n === 1 ? 'intento' : 'intentos'}, ${pct(wk[1].rate)} de aciertos${wk[0].n ? ` (la anterior, ${pct(wk[0].rate)})` : ''}.`);
      else lead.push('Esta semana aún no has hecho intentos completos.');
    } else lead.push('Aún no hay intentos completos: de momento, lo que has entrenado.');
    const P = BldStats.practiceTime(all, practice, now);
    $('bpSummary').innerHTML = `<p class="bp-lead">${lead.join(' ')}</p><div class="stats bp-tiles">${[
      tile('Mejor single', B.fmtV(best), bestAt ? fdate(bestAt) : ''),
      tile('Mejor mo3', B.fmtV(B.bestMo3Of(list)), `ahora ${B.fmtV(B.mo3Of(list))}`),
      tile('Aciertos', list.length ? pct(ok.length / list.length) : '—', list.length >= 12 ? `últimos 12: ${pct(list.slice(-12).filter((t) => t.ok).length / 12)}` : ''),
      tile('Racha', `${act.streak} ${act.streak === 1 ? 'día' : 'días'}`, `la mejor, ${act.bestStreak}`),
      tile('Practicado', hm(P.real.total || P.timed.total), P.real.total ? 'en total' : 'cronometrado'),
    ].join('')}</div>`;
    renderWeeks(BldStats.weekly(list, now, 12));
    renderFails(BldStats.fails(train, O.trainLetters));
    renderDays(act);
    renderTime(P);
  }

  // ---- Week by week: aciertos (bars) and memo / execution (lines)
  function renderWeeks(weeks) {
    const box = $('bpWeeks');
    const any = weeks.some((w) => w.n);
    if (!any) { box.innerHTML = '<p class="hint">En cuanto hagas intentos completos verás aquí cada semana: cuántos aciertas y cuánto tardas en memorizar y en ejecutar.</p>'; return; }
    const W = 360;
    const H = 150;
    const L = 36;
    const Rm = 8;
    const T = 10;
    const Bm = 24;
    const n = weeks.length;
    const step = (W - L - Rm) / n;
    const x = (i) => L + step * i + step / 2;
    const lab = (i) => (i % 3 === (n - 1) % 3 ? `<text class="bp-ax" x="${x(i)}" y="${H - 6}" text-anchor="middle">${esc(fdate(weeks[i].ts))}</text>` : '');
    // Aciertos per week.
    const yr = (v) => T + (1 - v) * (H - T - Bm);
    const bars = weeks.map((w, i) => (w.n ? `<rect class="bp-bar" x="${(x(i) - step * 0.32).toFixed(1)}" y="${yr(w.rate).toFixed(1)}" width="${(step * 0.64).toFixed(1)}" height="${Math.max(2, H - Bm - yr(w.rate)).toFixed(1)}" rx="4"><title>Semana del ${fdate(w.ts)}: ${w.ok} de ${w.n} (${pct(w.rate)})</title></rect>` : '')).join('');
    const grid = [0, 0.5, 1].map((v) => `<line class="bp-grid" x1="${L}" x2="${W - Rm}" y1="${yr(v)}" y2="${yr(v)}"/><text class="bp-ax" x="${L - 6}" y="${yr(v) + 4}" text-anchor="end">${v * 100}%</text>`).join('');
    const rateSvg = `<svg class="bp-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Aciertos por semana, las últimas ${n}">${grid}${bars}${weeks.map((w, i) => lab(i)).join('')}</svg>`;
    // Memo and execution per week (median of the solved ones).
    const vals = weeks.flatMap((w) => [w.memo, w.exec]).filter((v) => v != null);
    let timeSvg = '<p class="hint">Aún no hay aciertos para ver los tiempos.</p>';
    if (vals.length) {
      const hi = Math.max(...vals) * 1.1;
      const yt = (v) => T + (1 - v / hi) * (H - T - Bm);
      const line = (k, cls) => {
        const pts = weeks.map((w, i) => (w[k] == null ? null : [x(i), yt(w[k]), w])).filter(Boolean);
        const d = pts.map((pt, i) => `${i ? 'L' : 'M'}${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`).join(' ');
        return `<path class="bp-line ${cls}" d="${d}"/>${pts.map(([px, py, w]) => `<circle class="bp-dot ${cls}" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4"><title>Semana del ${fdate(w.ts)}: ${k === 'memo' ? 'memo' : 'ejecución'} ${fmt(w[k])} (mediana de ${w.ok} ${w.ok === 1 ? 'acierto' : 'aciertos'})</title></circle>`).join('')}`;
      };
      const tg = [0, 0.5, 1].map((f) => `<line class="bp-grid" x1="${L}" x2="${W - Rm}" y1="${yt(hi * f)}" y2="${yt(hi * f)}"/><text class="bp-ax" x="${L - 6}" y="${yt(hi * f) + 4}" text-anchor="end">${Math.round((hi * f) / 1000)}s</text>`).join('');
      timeSvg = `<svg class="bp-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Memo y ejecución por semana: la mediana de tus aciertos">${tg}${line('memo', 'memo')}${line('exec', 'exec')}${weeks.map((w, i) => lab(i)).join('')}</svg>`;
    }
    const last = [...weeks].reverse().find((w) => w.ok);
    box.innerHTML = `<div class="bp-two">
      <figure class="bp-fig"><figcaption><b>Aciertos</b> <span class="muted">· por semana</span></figcaption>${rateSvg}</figure>
      <figure class="bp-fig"><figcaption><b>Tiempos</b> <span class="bp-key"><i class="memo"></i>Memo <i class="exec"></i>Ejecución</span> <span class="muted">· mediana de los aciertos</span></figcaption>${timeSvg}</figure>
    </div>${last ? `<p class="hint">La última semana con aciertos: memo ${fmt(last.memo)} y ejecución ${fmt(last.exec)}.</p>` : ''}`;
  }

  // ---- Where you fail
  function renderFails(list) {
    const box = $('bpFails');
    if (!list.length) {
      box.innerHTML = '<p class="hint">Todavía no hay letras que se te resistan. Con el cubo inteligente, cada DNF dice en qué letra fallaste; y en «Entrenar» se apuntan las que fallas.</p>';
      return;
    }
    const noun = { edge: 'arista', corner: 'esquina' };
    const top = list.slice(0, 10);
    box.innerHTML = `<ul class="bp-fails">${top.map((x) => `<li><b class="bp-letter">${esc(x.L)}</b><span><b>${noun[x.kind]} ${esc(x.L)}</b><span class="muted">${[x.dnf && `rompió ${x.dnf} ${x.dnf === 1 ? 'intento' : 'intentos'}`, x.seen && `${x.right} de ${x.seen} en Entrenar`, x.streak >= 3 && 'ya la dominas'].filter(Boolean).join(' · ')}</span></span></li>`).join('')}</ul>
      <div class="actions">${['edge', 'corner'].filter((k) => top.some((x) => x.kind === k)).map((k) => `<button class="btn" type="button" data-bp-train="${k}">Entrenar ${k === 'edge' ? 'esas aristas' : 'esas esquinas'}</button>`).join('')}</div>`;
  }
  $('bpFails').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-bp-train]');
    if (!b) return;
    const kind = b.dataset.bpTrain;
    const letters = BldStats.fails(O.data.train(), O.trainLetters).filter((x) => x.kind === kind).slice(0, 6).map((x) => x.L);
    if (O.trainer.session) O.trainer.session(kind, letters);
    O.showView('entrenar');
  });

  // ---- Days
  function renderDays(act) {
    const lvl = (c) => { const v = c.n + Math.round(c.ms / 300000); return !v ? 0 : v <= 3 ? 1 : v <= 8 ? 2 : v <= 15 ? 3 : 4; };
    const weeks = Math.ceil(act.cells.length / 7);
    let months = '';
    let lastM = -1;
    for (let w = 0; w < weeks; w++) {
      const c = act.cells[w * 7];
      const m = new Date(c.ts).getMonth();
      months += `<span style="grid-column:${w + 1}">${m !== lastM ? new Date(c.ts).toLocaleDateString('es-ES', { month: 'short' }) : ''}</span>`;
      lastM = m;
    }
    const tip = (c) => `${fdate(c.ts)}: ${c.n || c.ms ? [c.n && `${c.n} ${c.n === 1 ? 'intento' : 'intentos'}`, c.ms && `${hm(c.ms)} practicando`].filter(Boolean).join(', ') : 'nada'}`;
    $('bpDays').innerHTML = `<div class="bp-hm-wrap" role="region" tabindex="0" aria-label="Calendario de actividad, desliza horizontalmente para ver los días">
        <div class="bp-hm-days" aria-hidden="true"><span>L</span><span></span><span>X</span><span></span><span>V</span><span></span><span>D</span></div>
        <div class="bp-hm-main">
          <div class="bp-hm-months" aria-hidden="true" style="grid-template-columns:repeat(${weeks}, var(--hm))">${months}</div>
          <div class="bp-hm" role="img" aria-label="Has practicado ${act.active30} de los últimos 30 días; racha de ${act.streak} ${act.streak === 1 ? 'día' : 'días'}" style="grid-template-columns:repeat(${weeks}, var(--hm))">${act.cells.map((c) => `<i class="h${lvl(c)}" title="${esc(tip(c))}"></i>`).join('')}</div>
        </div>
      </div>
      <p class="bp-hm-key" aria-hidden="true">Menos <i class="h0"></i><i class="h1"></i><i class="h2"></i><i class="h3"></i><i class="h4"></i> Más <span class="muted">· intentos y tiempo practicando de cada día</span></p>
      <div class="stats bp-tiles">
        ${tile('Racha', `${act.streak} ${act.streak === 1 ? 'día' : 'días'}`, act.streak ? 'seguidos, hasta hoy' : 'practica hoy y empieza una')}
        ${tile('Mejor racha', `${act.bestStreak} ${act.bestStreak === 1 ? 'día' : 'días'}`, '')}
        ${tile('Últimos 30 días', `${act.active30} ${act.active30 === 1 ? 'día' : 'días'}`, 'practicando')}
      </div>`;
  }

  // ---- Time practised
  function renderTime(P) {
    const rows = [['Hoy', 'today'], ['Esta semana', 'week'], ['Este mes', 'month'], ['En total', 'total']];
    $('bpTime').innerHTML = `<table class="bp-time"><thead><tr><th scope="col"><span class="sr-only">Cuándo</span></th><th scope="col">Practicando</th><th scope="col">Cronometrado</th></tr></thead><tbody>${rows.map(([name, k]) => `<tr><th scope="row">${name}</th><td>${hm(P.real[k])}</td><td>${hm(P.timed[k])}</td></tr>`).join('')}</tbody></table>
      <p class="hint">«Practicando» es el tiempo con la app entre una acción y la siguiente (un toque, una tecla, un giro del cubo) si no pasan más de 2 minutos: cuenta mezclar, memorizar y entrenar, no los descansos. Se guarda en cada dispositivo y se suma al sincronizar. «Cronometrado» es la memo más la ejecución de tus intentos.</p>`;
  }

  O.onView('progreso', render);
  ['op3:result', 'op3:changed'].forEach((ev) => document.addEventListener(ev, () => setTimeout(render, 0)));
  render();
})();
