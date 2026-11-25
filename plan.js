// «Mi plan» (/plan): the Roadmap WCA 2027 as a page that keeps itself up to date. What to do today, the six
// events in their order with where each one is, the goals with your numbers, this week against the suggested
// routine, the priority (how much of your solve the F2L takes), where you started, and your competition with
// the checklist of its last four weeks. The numbers come from evdata.js (which reads every section).
(() => {
  'use strict';
  const D = window.EvData;
  const I = window.EvIcons;
  if (!D || !I) return;
  const $ = (id) => document.getElementById(id);
  const esc = (txt) => String(txt).replace(/[&<>'"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
  const ICON = { 333: I.ICONS.cfop, 222: I.ICONS['222'], 444: I.ICONS['444'], pyram: I.ICONS.pyram, '333bf': I.ICONS.bld, sq1: I.ICONS.sq1 };
  const hm = (ms) => (ms >= 3600000 ? `${Math.floor(ms / 3600000)} h ${String(Math.round((ms % 3600000) / 60000)).padStart(2, '0')} min` : `${Math.round(ms / 60000)} min`);
  const pct = (x) => `${Math.round(x * 100)} %`;
  const bar = (p, label) => `<div class="ev-bar" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p * 100)}"><i style="width:${Math.round(p * 100)}%"></i></div>`;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.h);
    toast.h = setTimeout(() => { t.hidden = true; }, 2600);
  }

  // ================= Today =================
  function renderToday() {
    const w = D.week();
    const p = D.prep();
    const cur = D.current();
    const parts = D.cfopParts();
    const f2l = parts ? parts.shares[1] : D.START.f2lShare;
    let rec;
    if (p.inWindow) {
      const evs = ['333', ...D.NEW];
      const id = evs.slice().sort((a, b) => p.roundsBy[a] - p.roundsBy[b])[0];
      const ev = D.eventOf(id);
      rec = { title: `Simula una ronda de 5 de ${ev.name}`, text: `Quedan ${p.daysLeft} ${p.daysLeft === 1 ? 'día' : 'días'} para competir: cinco intentos seguidos con inspección, como allí. Es la modalidad que menos rondas lleva estas semanas.`, href: id === '333' ? 'fridrich#crono' : `${ev.href}#crono`, go: 'Al cronómetro' };
    } else {
      const missing = w.slots.find((s) => s.done < s.need);
      if (!missing) rec = { title: 'Semana completa', text: 'Ya has hecho todas las sesiones de la rutina. Descansa, o repasa lo que más te cueste.', href: 'fridrich#entrenar', go: 'Repasar casos' };
      else if (missing.id === '333') rec = { title: 'Sesión de 3×3', text: `Cruz, F2L y repaso de PLL/OLL. Prioridad: el F2L, que es el ${pct(f2l)} de tu solve.`, href: 'fridrich#entrenar', go: 'Ir a CFOP' };
      else if (missing.id === 'new') rec = cur ? { title: `Sesión de ${cur.ev.name}`, text: `${cur.ev.method}. ${cur.state === 'later' ? `Su fase es en ${cur.ev.phase.replace(/^\d · /, '')}, pero puedes adelantarla.` : 'Es tu modalidad nueva.'}`, href: `${cur.ev.href}#aprender`, go: `Ir al ${cur.ev.name}` } : { title: 'Sesión de una modalidad', text: 'Ya tienes el primer hito de todas: repasa la que más te cueste.', href: 'square-1#crono', go: 'Ir al Square-1' };
      else if (missing.id === 'bld') rec = { title: 'Sesión de BLD', text: 'Old Pochmann fiable: un intento entero cronometrado, o entrena las letras que fallas.', href: './#crono', go: 'Ir a A ciegas' };
      else rec = { title: 'Solves cronometrados y revisión', text: 'Una tanda de solves (o una ronda de 5) y mira en Progreso dónde se va el tiempo.', href: 'fridrich#crono', go: 'Al cronómetro' };
    }
    $('today').innerHTML = `<span class="field-title">Hoy toca</span><h2 id="hToday">${esc(rec.title)}</h2><p>${esc(rec.text)}</p><div class="actions"><a class="btn primary" href="${esc(rec.href)}">${esc(rec.go)}</a></div>`;
    if (p.compAt) {
      const d = p.daysLeft;
      $('count').innerHTML = d >= 0
        ? `<span class="pl-count-n">${d}</span><span class="pl-count-t">${d === 1 ? 'día' : 'días'} para ${p.comp.name ? esc(p.comp.name) : 'tu competición'}</span>${p.inWindow ? '<span class="pl-chip">Últimas 4 semanas</span>' : ''}`
        : `<span class="pl-count-t">${p.comp.name ? esc(p.comp.name) : 'Tu competición'} ya pasó. Apunta la siguiente abajo.</span>`;
    } else {
      $('count').innerHTML = '<span class="pl-count-t">¿Ya sabes cuál será tu primera competición?</span><a class="btn" href="#hComp">Apúntala</a>';
    }
  }

  // ================= The phases =================
  function progressLine(id) {
    if (id === '333') {
      const a = D.cfopAlgs();
      return `OLL ${a.oll.known}/${a.oll.of} · PLL ${a.pll.known}/${a.pll.of} · F2L ${a.f2l.known}/${a.f2l.of}`;
    }
    if (id === '333bf') {
      const b = D.bldLearn();
      return `Lecciones ${b.lessons}/${b.ofLessons} · M2 ${b.m2}/${b.ofM2} letras`;
    }
    const ev = D.eventOf(id);
    const k = Object.values(D.known(id)).filter((v) => v > 0).length;
    const n = D.times(id).length;
    return `Pasos ${Math.min(k, ev.steps)}/${ev.steps} · ${n} ${n === 1 ? 'tiempo' : 'tiempos'}`;
  }
  function renderPhases() {
    $('phases').innerHTML = D.EVENTS.map((ev) => {
      const s = D.status(ev.id);
      const g = s.goals.find((x) => !x.done) || s.goals[1];
      return `<li class="pl-phase s-${s.state}">
          <div class="pl-phase-top"><span class="pl-phase-n">${esc(ev.phase)}</span><span class="pl-state">${esc(D.STATE_TEXT[s.state])}</span></div>
          <a class="pl-phase-name" href="${esc(ev.href)}">${ICON[ev.id]}<span>${esc(ev.name)}</span></a>
          <p class="pl-phase-method">${esc(ev.method)}</p>
          <p class="pl-phase-prog">${esc(progressLine(ev.id))}</p>
          <p class="hint">${s.goals[0].done && s.goals[1].done ? '¡Las dos metas cumplidas!' : `${g.done ? '✓ ' : ''}${esc(g.text)}: ${esc(g.note)}`}</p>
        </li>`;
    }).join('');
  }

  // ================= The goals =================
  function goalCell(g) {
    return `<div class="pl-goal${g.done ? ' done' : ''}"><b>${g.done ? '✓ ' : ''}${esc(g.text)}</b>${g.kind === 'bldcons' ? '' : bar(g.progress, g.text)}<span class="hint">${esc(g.note)}</span></div>`;
  }
  function renderGoals() {
    $('goalsAll').innerHTML = `<div class="fr-table" tabindex="0" role="region" aria-label="Objetivos de cada modalidad"><table class="pl-goal-table"><thead><tr><th scope="col">Modalidad</th><th scope="col">Primer hito</th><th scope="col">Siguiente hito</th></tr></thead><tbody>${
      D.EVENTS.map((ev) => { const gs = D.goalsOf(ev.id); return `<tr><th scope="row"><a href="${esc(ev.href)}">${ICON[ev.id]}${esc(ev.name)}</a></th><td data-label="Primer hito">${goalCell(gs[0])}</td><td data-label="Siguiente hito">${goalCell(gs[1])}</td></tr>`; }).join('')}</tbody></table></div>`;
  }

  // ================= The week =================
  const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  function renderWeek() {
    const w = D.week();
    const from = new Date(w.from);
    const to = new Date(w.from + 6 * 86400000);
    $('weekWhen').textContent = `Del ${from.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} al ${to.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}`;
    const cur = D.current();
    $('week').innerHTML = w.slots.map((s) => {
      const text = s.id === 'new' && cur ? `${s.text} (${cur.ev.name})` : s.text;
      const pips = Array.from({ length: s.need }, (_, i) => `<i class="${i < s.done ? 'on' : ''}"></i>`).join('');
      return `<li class="${s.done >= s.need ? 'done' : ''}">
          <span class="pl-week-t">${esc(text)}</span>
          <span class="pl-pips" role="img" aria-label="${s.done} de ${s.need} sesiones">${pips}</span>
          <span class="pl-week-n">${s.done}/${s.need}${s.extra ? ` <span class="muted">(${s.extra} a mano)</span>` : ''}</span>
          <span class="pl-week-acts"><button class="x" type="button" data-tick="${s.id}" data-d="-1" aria-label="Quitar una sesión de ${esc(text)} hecha sin la app" ${s.extra ? '' : 'disabled'}>−1</button><button class="x" type="button" data-tick="${s.id}" data-d="1" aria-label="Sumar una sesión de ${esc(text)} hecha sin la app">+1</button></span>
        </li>`;
    }).join('');
    const max = Math.max(...w.perDay, 1);
    const goal = 4 * 3600000;
    $('hours').innerHTML = `<div class="pl-hours-head"><span class="field-title">Tiempo practicando</span><b>${hm(w.total)}</b><span class="hint">de 3 a 4 h</span></div>${bar(Math.min(1, w.total / goal), 'Horas de la semana')}
      <ol class="pl-days" aria-label="Minutos cada día">${w.perDay.map((ms, i) => `<li title="${hm(ms)}"><span class="pl-day-bar"><i style="height:${Math.round((ms / max) * 100)}%"></i></span><span class="pl-day-l">${DAYS[i]}</span><span class="sr-only">${hm(ms)}</span></li>`).join('')}</ol>`;
  }
  $('week').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-tick]');
    if (!b) return;
    const w = D.week();
    const s = w.slots.find((x) => x.id === b.dataset.tick);
    D.setTick(w.week, s.id, s.extra + Number(b.dataset.d));
    D.changed();
    renderWeek();
    renderToday();
    cfopLinks();
  });

  // ================= Priority and the starting point =================
  const PARTS = ['Cruz', 'F2L', 'OLL', 'PLL'];
  const SEG = ['fr-seg-cruz', 'fr-seg-f2l', 'fr-seg-oll', 'fr-seg-pll'];
  function renderFocus() {
    const parts = D.cfopParts();
    const shares = parts ? parts.shares : (() => { const t = D.START.parts.reduce((a, b) => a + b, 0); return D.START.parts.map((x) => x / t); })();
    const means = parts ? parts.means : D.START.parts;
    const top = shares.indexOf(Math.max(...shares));
    $('focus').innerHTML = `<p>${parts ? `En tus últimos ${parts.n} solves con fases` : 'En el roadmap (sin solves con fases todavía)'}, el <b>${PARTS[top]}</b> es el <b>${pct(shares[top])}</b> de tu solve.${top === 1 ? ' Mejorar su fluidez te dará más que memorizar deprisa todos los OLL.' : ''}</p>
      <div class="fr-bar" role="img" aria-label="${PARTS.map((n, i) => `${n} ${pct(shares[i])}`).join(', ')}">${shares.map((s, i) => `<span class="fr-seg ${SEG[i]}" style="flex-grow:${Math.max(1, Math.round(s * 100))}"><b>${PARTS[i]}</b></span>`).join('')}</div>
      <p class="hint">${PARTS.map((n, i) => `${n} ${D.short(means[i])}`).join(' · ')}</p>
      <div class="actions"><a class="btn primary" href="fridrich#entrenar">Entrenar el F2L</a><a class="btn" href="fridrich#progreso">Ver tus fases</a></div>
      <p class="hint">Cronometra por fases (en CFOP, Ajustes) o con el cubo inteligente para que esto se calcule con tus solves.</p>`;
  }
  function renderStart() {
    const S = D.START;
    const s = D.summary(D.cfopTimes());
    const a = D.cfopAlgs();
    const parts = D.cfopParts();
    const row = (label, then, nowV, better) => {
      const arrow = nowV == null || then == null ? '' : better ? '<span class="pl-up">▲</span>' : '';
      return `<tr><th scope="row">${label}</th><td>${then}</td><td><b>${nowV == null ? '—' : nowV}</b> ${arrow}</td></tr>`;
    };
    const lower = (x, y) => x != null && Number.isFinite(x) && x < y;
    $('start').innerHTML = `<div class="fr-table" tabindex="0" role="region" aria-label="Punto de partida frente a ahora"><table class="pl-start"><thead><tr><th scope="col"><span class="sr-only">Medida</span></th><th scope="col">Nov 2026</th><th scope="col">Ahora</th></tr></thead><tbody>
      ${row('Ao12 (3×3)', D.short(S.ao12), s.ao12 != null ? D.short(s.ao12) : null, lower(s.ao12, S.ao12))}
      ${row('Mejor single', D.short(S.best), s.best != null ? D.short(s.best) : null, lower(s.best, S.best))}
      ${row('Solves', String(S.n), String(s.n), s.n > S.n)}
      ${PARTS.map((n, i) => row(n, D.short(S.parts[i]), parts ? D.short(parts.means[i]) : null, parts && parts.means[i] < S.parts[i])).join('')}
      ${row('OLL (de 57)', String(S.algs.oll[0]), String(a.oll.known), a.oll.known > S.algs.oll[0])}
      ${row('PLL (de 21)', String(S.algs.pll[0]), String(a.pll.known), a.pll.known > S.algs.pll[0])}
      ${row('F2L (de 41)', String(S.algs.f2l[0]), String(a.f2l.known), a.f2l.known > S.algs.f2l[0])}
      </tbody></table></div><p class="hint">Los algoritmos son los que marcas como «Me lo sé» en CFOP → Casos.</p>`;
  }

  // ================= The competition =================
  function renderComp() {
    const p = D.prep();
    if (document.activeElement && document.activeElement.closest('#compForm')) { /* typing: leave the form alone */ } else {
      $('compDate').value = p.comp.date || '';
      $('compName').value = p.comp.name || '';
      $('compUrl').value = p.comp.url || '';
    }
    $('compClear').hidden = !p.comp.date && !p.comp.name;
    const names = { 333: '3×3', 222: '2×2', 444: '4×4', pyram: 'Pyraminx', sq1: 'Square-1' };
    const links = { 333: 'fridrich#crono', 222: '2x2#crono', 444: '4x4#crono', pyram: 'pyraminx#crono', sq1: 'square-1#crono' };
    const head = p.compAt == null ? '<p>Apunta la fecha y verás aquí la cuenta atrás. Cuando falten cuatro semanas, esto es lo que toca:</p>'
      : p.daysLeft < 0 ? '<p>Esa competición ya pasó. Apunta la próxima.</p>'
        : p.inWindow ? `<p><b>Estás en las últimas 4 semanas.</b> Esto es lo que toca${p.comp.name ? ` antes de ${esc(p.comp.name)}` : ''}:</p>`
          : `<p>Faltan ${p.daysLeft} días. A cuatro semanas (desde el ${new Date(p.compAt - 28 * 86400000).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}), esto es lo que toca:</p>`;
    $('prep').innerHTML = `${head}<ul class="pl-prep">${p.items.map((it) => {
      let extra = '';
      if (it.id === 'rounds') extra = `<span class="pl-rounds">${['333', '222', '444', 'pyram', 'sq1'].map((id) => `<a class="pl-chip${p.roundsBy[id] ? ' on' : ''}" href="${links[id]}">${names[id]}: ${p.roundsBy[id]}</a>`).join('')}</span><span class="hint">Rondas de 5 en las últimas 4 semanas. En 3×3 cuentan 5 solves seguidos en CFOP.</span>`;
      if (it.id === 'limits') extra = p.comp.url ? `<a href="${esc(p.comp.url)}" target="_blank" rel="noopener">Abrir la página de tu competición</a>` : '<span class="hint">Pon arriba el enlace de tu competición en la WCA.</span>';
      if (it.id === 'inspect') extra = '<span class="hint">Se marca solo si tienes la inspección puesta en CFOP o en las modalidades nuevas.</span>';
      if (it.id === 'bld') extra = `<span class="hint">${p.bldRecent ? `${p.bldRecent} ${p.bldRecent === 1 ? 'intento entero' : 'intentos enteros'} en estas semanas.` : 'Cronométrate memo y ejecución juntos en A ciegas.'}</span>`;
      if (it.id === 'rules') extra = '<a href="https://www.worldcubeassociation.org/regulations/" target="_blank" rel="noopener">Reglamento de la WCA</a>';
      const auto = it.auto && !it.marked;
      return `<li class="${it.done ? 'done' : ''}"><label class="check"><input type="checkbox" data-prep="${it.id}" ${it.done ? 'checked' : ''} ${auto ? 'disabled' : ''}> ${esc(it.text)}${auto ? ' <span class="muted">(hecho)</span>' : ''}</label>${extra ? `<div class="pl-prep-x">${extra}</div>` : ''}</li>`;
    }).join('')}</ul>`;
  }
  $('compForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const url = $('compUrl').value.trim();
    if (url && !/^https?:\/\//i.test(url)) { toast('El enlace tiene que empezar por https://'); return; }
    D.setComp({ date: $('compDate').value, name: $('compName').value.trim(), url });
    D.changed();
    toast('Competición guardada');
    renderAll();
  });
  $('compClear').addEventListener('click', () => { D.setComp({}); D.changed(); renderAll(); });
  $('prep').addEventListener('change', (ev) => {
    const box = ev.target.closest('[data-prep]');
    if (!box) return;
    D.setPrep(box.dataset.prep, box.checked);
    D.changed();
    renderComp();
    cfopLinks();
  });

  // ================= Settings =================
  function renderSettings() {
    const th = (() => { try { return localStorage.getItem(D.K.theme) || 'auto'; } catch (e) { return 'auto'; } })();
    document.querySelectorAll('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === th)));
  }
  document.querySelectorAll('[data-theme-set]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.themeSet;
    try { if (v === 'auto') localStorage.removeItem(D.K.theme); else localStorage.setItem(D.K.theme, v); } catch (e) { /* this visit */ }
    if (v === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', v);
    renderSettings();
  }));

  // CFOP at the level you use (as the section menu does): /cfop with the full OLL and PLL, /fridrich with 2 looks.
  function cfopLinks() {
    let level = 'fridrich';
    try { if (localStorage.getItem('cfop:level:v1') === 'cfop') level = 'cfop'; } catch (e) { /* the 2 looks */ }
    if (level === 'fridrich') return;
    document.querySelectorAll('.pl-main a[href^="fridrich"]').forEach((a) => a.setAttribute('href', a.getAttribute('href').replace(/^fridrich/, level)));
  }
  function renderAll() {
    renderToday();
    renderPhases();
    renderGoals();
    renderWeek();
    renderFocus();
    renderStart();
    renderComp();
    renderSettings();
    cfopLinks();
  }
  const sync = window.EvSync({ $, toast, onChanged: renderAll });
  // Back on the page (another tab or section may have changed something): everything again.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') renderAll(); });
  window.addEventListener('storage', () => renderAll());

  // ================= Install and new versions =================
  let installEvt = null;
  const installBtns = [...document.querySelectorAll('.install')];
  window.addEventListener('beforeinstallprompt', (ev) => { ev.preventDefault(); installEvt = ev; installBtns.forEach((b) => { b.hidden = false; }); });
  installBtns.forEach((b) => b.addEventListener('click', async () => {
    if (!installEvt) return;
    installEvt.prompt();
    try { await installEvt.userChoice; } catch (e) { /* dismissed */ }
    installEvt = null;
    installBtns.forEach((x) => { x.hidden = true; });
  }));
  function watchUpdates(reg) {
    const meta = document.querySelector('meta[name=op3-build]');
    const mine = meta && /^[0-9a-f]{10}$/.test(meta.content) ? `op3bld-${meta.content}` : null;
    if (!mine || !window.caches) return;
    let offered = false;
    const compare = () => {
      if (offered) return;
      caches.keys().then((keys) => {
        const lives = keys.filter((k) => k.startsWith('op3bld-'));
        if (lives.length && !lives.includes(mine)) { offered = true; $('updateBar').hidden = false; }
      }).catch(() => {});
    };
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      const sw = navigator.serviceWorker.controller;
      if (!sw || sw.state === 'activated') { compare(); return; }
      sw.addEventListener('statechange', () => { if (sw.state === 'activated') compare(); });
    });
    setInterval(() => reg.update().catch(() => {}), 30 * 60e3);
  }
  $('updateGo').addEventListener('click', () => location.reload());
  $('updateLater').addEventListener('click', () => { $('updateBar').hidden = true; });

  window.PlanPage = { renderAll, D };
  renderAll();
  sync.renderSync();
  if ('serviceWorker' in navigator && document.querySelector('link[rel=manifest]')) navigator.serviceWorker.register('sw.js').then(watchUpdates).catch(() => {});
})();
