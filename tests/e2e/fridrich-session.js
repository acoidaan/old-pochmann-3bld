// «Fridrich reducido», learning against the timer: the two modes (their look switches by itself), a training
// session (each case tracked, mastered after a few right in a row, the next case that costs most coming in;
// or the cases you choose, before or during it),
// the OBS overlay switching to a learning layout by itself, leaving and coming back, a reload in the middle,
// the summary and the past sessions, the suggestion that keeps up by itself outside a session, sync and the
// phone.
const { chromium, devices } = require('playwright');
const { SITE, SHOTS } = require('../env');
const { seed } = require('../fixtures/cfop-seed');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + String(extra).replace(/\s+/g, ' ') : ''}`);
const keys = (d) => ({ 'cfop:times:v1': d.times, 'cfop:trlog:v1': d.trlog, 'cfop:train:v1': d.train, 'cfop:crosstr:v1': d.crossTr, 'cfop:learn:v1': d.learn });

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const open = async (opts, data, hash) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    // The screen wake lock, by hand: what the page asked for and let go of.
    await ctx.addInitScript(() => {
      window.__wake = [];
      const lock = () => {
        const fns = [];
        return { addEventListener: (t, f) => fns.push(f), release() { window.__wake.push('release'); fns.forEach((f) => f()); return Promise.resolve(); } };
      };
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: () => { window.__wake.push('request'); return Promise.resolve(lock()); } } });
    });
    if (data) {
      await ctx.addInitScript((x) => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        Object.entries(x).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
      }, data);
    }
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`${SITE}/fridrich#${hash}`);
    await p.waitForFunction(() => window.Fridrich && window.Fridrich.scramble(), null, { timeout: 30000 });
    return { ctx, p };
  };
  // Answer the case on screen in «Reconocer» (right or wrong) and go to the next one.
  const answer = async (p, right) => {
    const id = await p.evaluate(() => window.Fridrich._.tr.c.id);
    const pickId = right ? id : await p.evaluate((x) => [...document.querySelectorAll('[data-answer]')].map((b) => b.dataset.answer).find((y) => y !== x), id);
    await p.click(`[data-answer="${pickId}"]`);
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => !window.Fridrich._.tr.answered, null, { timeout: 3000 }).catch(() => {});
    return id;
  };

  const { ctx, p } = await open({}, keys(seed(Date.now())), 'crono');

  // ================= Two looks =================
  const look = (v) => p.evaluate(async (x) => {
    window.Fridrich.showView(x);
    await new Promise((r) => setTimeout(r, 500));   // the colour fades in
    const tab = document.querySelector(`[data-go="${x}"]`);
    return { mode: document.body.dataset.mode, pill: document.getElementById('modePill').innerText, bg: getComputedStyle(document.body).backgroundColor, tab: getComputedStyle(tab).backgroundColor };
  }, v);
  const lc = await look('crono');
  const le = await look('entrenar');
  const lk = await look('casos');
  const lp = await look('progreso');
  check('modes: the timer (and Progreso) in «Modo cronómetro»', lc.mode === 'time' && lp.mode === 'time' && /Modo cronómetro/.test(lc.pill), JSON.stringify([lc, lp]));
  check('modes: Entrenar and Casos in «Modo aprendizaje», with their own colour (page and menu), by themselves', le.mode === 'learn' && lk.mode === 'learn' && /Modo aprendizaje/.test(le.pill) && le.bg !== lc.bg && le.tab !== lc.tab && le.tab === 'rgb(11, 122, 114)', JSON.stringify([lc, le]));

  // ================= The suggestion keeps up by itself =================
  await p.evaluate(() => window.Fridrich.showView('entrenar'));
  await p.click('#trModeLook');
  const mark = await p.evaluate(() => { const n = document.getElementById('planBox').firstElementChild; n.dataset.old = '1'; return !!n; });
  for (let i = 0; i < 10; i++) await answer(p, true);
  check('outside a session, the recommended set is worked out again every 10 cases', mark && await p.evaluate(() => !document.querySelector('#planBox [data-old]')));

  // ================= A session =================
  await p.click('[data-set-go="look"]');
  await p.waitForFunction(() => window.Fridrich._.session(), null, { timeout: 5000 });
  const s0 = await p.evaluate(() => ({
    set: window.Fridrich._.session().set, pick: JSON.parse(localStorage.getItem('cfop:pick:v1')),
    bar: document.getElementById('sessBar').innerText, rule: document.getElementById('sessRule').innerText,
    hidden: ['planBox', 'ctPanel', 'trStatsPanel'].map((id) => getComputedStyle(document.getElementById(id).closest('section') || document.getElementById(id)).display),
    cards: document.querySelectorAll('#sessSet .fr-sc').length, cur: document.querySelectorAll('#sessSet .fr-sc.cur').length,
  }));
  check('session: its own screen (the bar, the trainer and your set; the rest hidden)', /Sesión de entrenamiento/.test(s0.bar) && /0 casos/.test(s0.bar) && s0.hidden.every((x) => x === 'none') && s0.cards === 5 && s0.cur === 1, JSON.stringify(s0));
  check('session: only the set comes up, and what mastering a case takes', JSON.stringify(s0.set.slice().sort()) === JSON.stringify(s0.pick.slice().sort()) && /Dominas un caso con 4 seguidos bien y en menos de \d\.\d s/.test(s0.rule), JSON.stringify(s0));
  await p.waitForTimeout(1200);
  check('session: a clock of the time training', /0:0[1-9]/.test(await p.evaluate(() => document.getElementById('sessClock').innerText)));
  // A wrong answer: its progress back to zero.
  const wrongId = await answer(p, false);
  const wrong = await p.evaluate((id) => ({ pips: document.querySelector(`#sessSet [data-sc="${id}"] .fr-pips`).getAttribute('aria-label'), last: document.querySelector(`#sessSet [data-sc="${id}"] .fr-sc-last`).innerText }), wrongId);
  check('session: a mistake shows in that case and its streak starts again', /^0 de 4/.test(wrong.pips) && /✗/.test(wrong.last), JSON.stringify(wrong));
  // Right answers until one is mastered.
  let won = null;
  for (let i = 0; i < 40 && !won; i++) {
    await answer(p, true);
    won = await p.evaluate(() => window.Fridrich._.session().done[0] || null);
  }
  const s1 = await p.evaluate(() => ({ s: window.Fridrich._.session(), toast: document.getElementById('toast').innerText, done: (document.querySelector('.fr-sc-done') || {}).innerText || '', pick: JSON.parse(localStorage.getItem('cfop:pick:v1')) }));
  const inCase = s1.s.swaps[0] && s1.s.swaps[0].in;
  check('session: 4 right in a row → mastered, it leaves the set and the next one that costs most comes in', !!won && !s1.s.set.includes(won) && !!inCase && s1.s.set.includes(inCase) && s1.pick.includes(inCase) && !s1.pick.includes(won), JSON.stringify({ won, set: s1.s.set, swaps: s1.s.swaps }));
  check('session: it tells you, and lists what you mastered', /dominado · entra/.test(s1.toast) && /Dominados en esta sesión/i.test(s1.done), `${s1.toast} | ${s1.done}`);
  await p.screenshot({ path: `${SHOTS}/fridrich-session-1280.png`, fullPage: true });

  // ================= The OBS overlay switches to learning by itself =================
  const ov = await ctx.newPage();
  ov.on('pageerror', (e) => errs.push(`overlay: ${e.message}`));
  await ov.goto(`${SITE}/overlay.html`);
  await p.bringToFront();   // (a tab in the background runs its timers late)
  await p.waitForTimeout(300);
  await p.evaluate(() => document.dispatchEvent(new CustomEvent('fr:train')));
  await ov.waitForFunction(() => document.getElementById('statsLabel').textContent === 'Sesión de entrenamiento', null, { timeout: 5000 }).catch(() => {});
  const o1 = await ov.evaluate(() => ({
    learn: document.getElementById('stage').hasAttribute('data-learn'), tag: document.getElementById('brandTag').textContent, method: document.getElementById('method').textContent,
    stats: document.getElementById('statsLabel').textContent, rows: [...document.querySelectorAll('.setrow')].map((r) => r.innerText.replace(/\s+/g, ' ')),
    done: document.querySelectorAll('.donechips span').length, pill: document.getElementById('phase').textContent, label: document.getElementById('scrLabel').textContent,
    pic: !!document.querySelector('#learnPic svg'), name: !!document.querySelector('#learnPic .lp-name'),
  }));
  check('overlay: learning by itself (its colour, «Aprendiendo», the session with each case and its progress, what you mastered)', o1.learn && o1.tag === 'Aprendiendo · CFOP' && /reconociendo/.test(o1.method) && o1.stats === 'Sesión de entrenamiento' && o1.rows.length === 5 && o1.rows.every((r) => /[●○]{4}/.test(r)) && o1.done >= 1, JSON.stringify(o1));
  check('overlay: the case being asked, without giving its name away', o1.pill === '¿Qué caso es?' && /¿qué caso es\?/i.test(o1.label) && o1.pic && !o1.name, JSON.stringify(o1));
  const asked = await p.evaluate(() => window.Fridrich._.tr.c);
  await p.click(`[data-answer="${asked.id}"]`);
  await ov.waitForFunction(() => document.getElementById('phase').textContent === 'Acertado', null, { timeout: 3000 }).catch(() => {});
  const o2 = await ov.evaluate(() => ({ pill: document.getElementById('phase').textContent, name: (document.querySelector('#learnPic .lp-name') || {}).textContent, line: document.getElementById('liveLine').innerText, time: document.getElementById('time').textContent }));
  check('overlay: once answered, the case, right or wrong, and how long it took', o2.pill === 'Acertado' && o2.name === asked.name && new RegExp(`✓\\s*${asked.name.replace(/[()]/g, '\\$&')}`).test(o2.line) && /^\d+\.\d\d$/.test(o2.time), JSON.stringify(o2));
  await p.evaluate(() => window.Fridrich.showView('crono'));
  await ov.waitForFunction(() => !document.getElementById('stage').hasAttribute('data-learn'), null, { timeout: 3000 }).catch(() => {});
  check('overlay: back to the timer layout with the timer', await ov.evaluate(() => !document.getElementById('stage').hasAttribute('data-learn') && document.getElementById('brandTag').textContent === 'Speedcubing · CFOP' && document.getElementById('statsLabel').textContent === 'Hoy'));
  await ov.close();
  await p.evaluate(() => window.Fridrich.showView('entrenar'));

  // ================= Away and back, and a reload =================
  await p.evaluate(() => window.Fridrich.showView('crono'));
  const away = await p.evaluate(() => ({ pill: document.getElementById('modePill').innerText, role: document.getElementById('modePill').getAttribute('role'), training: document.body.classList.contains('training') }));
  check('away: the header says a session is on, and takes you back', /Sesión en curso · \d+:\d\d/.test(away.pill) && away.role === 'button' && !away.training, JSON.stringify(away));
  await p.click('#modePill');
  check('away: back in the session', await p.evaluate(() => window.Fridrich.currentView() === 'entrenar' && document.body.classList.contains('training')));
  const n1 = await p.evaluate(() => window.Fridrich._.session().n);
  await p.reload();
  await p.waitForFunction(() => window.Fridrich && window.Fridrich.scramble(), null, { timeout: 30000 });
  await p.evaluate(() => window.Fridrich.showView('entrenar'));
  const back = await p.evaluate(() => ({ n: window.Fridrich._.session() && window.Fridrich._.session().n, bar: !document.getElementById('sessBar').hidden, cards: document.querySelectorAll('#sessSet .fr-sc').length }));
  check('reload: the session goes on where it was', back.n === n1 && back.bar && back.cards === 5, JSON.stringify(back));

  // ================= The screen stays on =================
  const awake = async () => {
    await p.waitForTimeout(100);
    return p.evaluate(() => window.__wake.lastIndexOf('request') > window.__wake.lastIndexOf('release'));
  };
  const w1 = await awake();
  await p.evaluate(() => window.Fridrich.showView('casos'));
  const w2 = await awake();
  await p.evaluate(() => window.Fridrich.showView('entrenar'));
  const w3 = await awake();
  check('screen: kept on during a session in Entrenar, let go in another tab and on again back in it', w1 && !w2 && w3, JSON.stringify([w1, w2, w3]));

  // ================= The end =================
  await p.click('#sessEnd');
  const sum = await p.evaluate(() => ({ open: !document.getElementById('sessSheet').hidden, text: document.getElementById('sessSum').innerText, rows: document.querySelectorAll('#sessSum tbody tr').length, focus: document.activeElement && document.activeElement.id }));
  check('end: a summary (time, cases, how many right, what you mastered, each case today against before)', sum.open && /TIEMPO/i.test(sum.text) && new RegExp(`CASOS\\s*${n1}`, 'i').test(sum.text) && /DOMINADOS\s*[1-9]/i.test(sum.text) && /Has dominado/.test(sum.text) && sum.rows >= 3 && /reconociendo/.test(sum.text) && sum.focus === 'sessClose', `${n1} ${sum.rows} ${sum.focus} ${JSON.stringify(sum.text).slice(0, 120)}`);
  await p.screenshot({ path: `${SHOTS}/fridrich-session-summary-1280.png` });
  check('screen: let go when the session ends', !(await awake()));
  await p.keyboard.press('Escape');
  const after = await p.evaluate(() => ({ sheet: document.getElementById('sessSheet').hidden, training: document.body.classList.contains('training'), pick: JSON.parse(localStorage.getItem('cfop:pick:v1')).length, list: (document.querySelector('.fr-sess-list') || {}).innerText || '', stored: JSON.parse(localStorage.getItem('cfop:sessions:v1')).length, live: localStorage.getItem('cfop:session:v1') }));
  check('end: back to Entrenar as before (every case), the session kept in «Tus sesiones»', after.sheet && !after.training && after.pick === 16 && /Tus sesiones/i.test(after.list) && after.stored === 1 && after.live === 'null', JSON.stringify(after));

  // ================= Sync =================
  const synced = await p.evaluate(() => {
    window.Fridrich._.mergeIn({ sessions: [{ at: 1700000000000, end: 1700000600000, active: 540000, mode: 'cube', n: 30, ok: 27, lost: 1, done: ['ua'], cases: [] }] });
    window.Fridrich._.mergeIn({ sessions: [{ at: 1700000000000, end: 1700000600000, active: 540000, mode: 'cube', n: 30, ok: 27, lost: 1, done: ['ua'], cases: [] }] });
    return JSON.parse(localStorage.getItem('cfop:sessions:v1')).filter((x) => x.at === 1700000000000).length;
  });
  check('sync: sessions from your other devices come in once', synced === 1, String(synced));
  await ctx.close();

  // ================= Your own cases =================
  const own = await open({}, keys(seed(Date.now())), 'entrenar');
  const q = own.p;
  await q.click('[data-set-pick]');
  const pk0 = await q.evaluate(() => ({ open: !document.getElementById('pickSheet').hidden, on: [...document.querySelectorAll('[data-pc][aria-pressed="true"]')].map((x) => x.dataset.pc).sort().join(), auto: document.getElementById('pickAuto').checked, go: document.getElementById('pickGo').textContent, stars: document.querySelectorAll('#pickCases .fr-chip-star').length }));
  check('choose: «Elegir yo los casos» opens the 16, the recommended ones ticked (★) to start from', pk0.open && pk0.on === 'diag,pi,ua,ub,z' && pk0.stars === 5 && pk0.auto && /con 5 casos/.test(pk0.go), JSON.stringify(pk0));
  await q.click('[data-pq="pll"]');
  const pk1 = await q.evaluate(() => ({ n: document.querySelectorAll('[data-pc][aria-pressed="true"]').length, auto: document.getElementById('pickAuto').checked }));
  await q.click('[data-pq="none"]');
  const pk2 = await q.evaluate(() => ({ disabled: document.getElementById('pickGo').disabled, hint: document.getElementById('pickHint').textContent }));
  check('choose: quick picks (all PLL: 6), and with none you cannot start', pk1.n === 6 && !pk1.auto && pk2.disabled && /al menos un caso/.test(pk2.hint), JSON.stringify([pk1, pk2]));
  for (const id of ['z', 't', 'sune']) await q.click(`[data-pc="${id}"]`);
  await q.click('[data-pm="look"]');
  await q.click('#pickGo');
  await q.waitForFunction(() => window.Fridrich._.session(), null, { timeout: 5000 });
  const ses = await q.evaluate(() => { const x = window.Fridrich._.session(); return { set: x.set.join(), auto: x.auto, mode: x.mode, pick: JSON.parse(localStorage.getItem('cfop:pick:v1')).join(), rule: document.getElementById('sessRule').textContent, cards: [...document.querySelectorAll('#sessSet .fr-sc')].map((c) => c.dataset.sc).join() }; });
  check('choose: the session with exactly your cases, how you chose', ses.set === 'sune,t,z' && ses.pick === 'sune,t,z' && ses.cards === 'sune,t,z' && ses.mode === 'look' && ses.auto === false && /Se queda en el set hasta que lo quites/.test(ses.rule), JSON.stringify(ses));
  let kept = null;
  for (let i = 0; i < 30 && !kept; i++) {
    await answer(q, true);
    kept = await q.evaluate(() => window.Fridrich._.session().done[0] || null);
  }
  const k1 = await q.evaluate((id) => ({ set: window.Fridrich._.session().set.join(), card: document.querySelector(`#sessSet [data-sc="${id}"]`) ? document.querySelector(`#sessSet [data-sc="${id}"]`).className + '|' + document.querySelector(`#sessSet [data-sc="${id}"]`).innerText.replace(/\s+/g, ' ') : '' }), kept);
  check('choose: a mastered case of yours stays in the set, marked «Dominado»', !!kept && k1.set === 'sune,t,z' && /mastered/.test(k1.card) && /✓ Dominado/i.test(k1.card), JSON.stringify({ kept, k1 }));
  await q.click('#sessEdit');
  const ed0 = await q.evaluate(() => ({ title: document.getElementById('pickTitle').textContent, on: [...document.querySelectorAll('[data-pc][aria-pressed="true"]')].map((x) => x.dataset.pc).join(), mode: document.getElementById('pickModeRow').hidden }));
  check('change: in the session, «Cambiar los casos» with yours ticked', /Cambiar los casos de la sesión/.test(ed0.title) && ed0.on === 'sune,t,z' && ed0.mode, JSON.stringify(ed0));
  await q.keyboard.press('Escape');
  check('change: Esc closes it, nothing changed', await q.evaluate(() => document.getElementById('pickSheet').hidden && window.Fridrich._.session().set.join() === 'sune,t,z'));
  await q.click('#sessEdit');
  await q.click('[data-pc="t"]');
  await q.click('[data-pc="ua"]');
  await q.click('#pickGo');
  await q.waitForTimeout(200);
  const ed1 = await q.evaluate(() => ({ set: window.Fridrich._.session().set.join(), pick: JSON.parse(localStorage.getItem('cfop:pick:v1')).join(), cur: window.Fridrich._.tr.c.id, toast: document.getElementById('toast').innerText, cards: document.querySelectorAll('#sessSet .fr-sc').length }));
  check('change: out goes T, in comes Ua (the rest keep their place and count), and only those come up', ed1.set === 'sune,z,ua' && ed1.pick === 'sune,z,ua' && ['sune', 'z', 'ua'].includes(ed1.cur) && /Set cambiado: 3 casos/.test(ed1.toast) && ed1.cards === 3, JSON.stringify(ed1));
  await own.ctx.close();

  // ================= With the algorithm in view, case by case =================
  // Each case of the set has an eye: on, that case comes up with its algorithm in view (practice: marked with
  // an eye, it neither adds to the streak nor breaks it), and the session says so; the others do not change.
  const pk = await open({}, null, 'entrenar');
  await pk.p.evaluate(() => window.Fridrich._.startSession('cube', ['sune', 'antisune'], false));
  const eyes = () => pk.p.evaluate(() => ({ sune: document.querySelector('[data-eye="sune"]').getAttribute('aria-pressed'), anti: document.querySelector('[data-eye="antisune"]').getAttribute('aria-pressed'), note: !document.getElementById('sessPeek').hidden, saved: JSON.parse(localStorage.getItem('cfop:settings:v1')).peek }));
  const e0 = await eyes();
  await pk.p.click('[data-eye="sune"]');
  const e1 = await eyes();
  check('eye: each case of the set has one, off at first; on for Sune only (saved), and the session says it', e0.sune === 'false' && e0.anti === 'false' && !e0.note && e1.sune === 'true' && e1.anti === 'false' && e1.note && e1.saved.sune === 1 && !e1.saved.antisune, JSON.stringify({ e0, e1 }));
  const peek = await pk.p.evaluate(() => {
    const F = window.Fridrich._;
    const card = () => { const c = document.querySelector('#sessSet [data-sc="sune"]'); return { pips: c.querySelector('.fr-pips').getAttribute('aria-label'), eye: c.querySelectorAll('.fr-sc-last .pk svg').length, ok: c.querySelectorAll('.fr-sc-last .ok').length }; };
    F.logTr({ id: 'sune', m: 'c', ok: 1, t: 1000, r: 300 });
    F.logTr({ id: 'sune', m: 'c', ok: 1, t: 900, r: 300, a: 1 });
    const mixed = card();
    F.logTr({ id: 'sune', m: 'c', ok: 1, t: 1100, r: 300 });
    const after = card();
    F.logTr({ id: 'antisune', m: 'c', ok: 1, t: 800, r: 200, a: 1 });
    const only = document.querySelector('#sessSet [data-sc="antisune"] .fr-sc-line').innerText;
    return { mixed, after, only };
  });
  check('eye: an attempt with it in view has an eye and does not break the streak (1, then 2 in a row)', /^1 de 3/.test(peek.mixed.pips) && peek.mixed.eye === 1 && peek.mixed.ok === 1 && /^2 de 3/.test(peek.after.pips) && /1 con el algoritmo a la vista \(no cuenta\)/.test(peek.only), JSON.stringify(peek));
  await pk.p.click('[data-eye="sune"]');
  const e2 = await eyes();
  check('eye: pressing it again hides it (and the note goes)', e2.sune === 'false' && !e2.note && !e2.saved.sune, JSON.stringify(e2));
  await pk.ctx.close();

  // ================= The overlay's demo: with the smart cube =================
  const od = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const dp = await od.newPage();
  dp.on('pageerror', (e) => errs.push(`overlay: ${e.message}`));
  await dp.goto(`${SITE}/overlay.html?demo=1&modo=cfop&phase=done&learn=setup`);
  await dp.waitForTimeout(300);
  const ds = await dp.evaluate(() => ({ label: document.getElementById('scrLabel').textContent, moves: [...document.querySelectorAll('#scrText .mv')].map((x) => x.className.replace('mv', '').trim() || '-').join(','), net: !document.getElementById('net').hidden, pill: document.getElementById('phase').textContent }));
  check('overlay (smart cube): while leaving the cube in the case, the turns done and the next one, on the live cube', ds.label === 'Preparando el caso' && ds.moves === 'done,done,done,next,-,-,-,-,-' && ds.net && ds.pill === 'Preparando el caso', JSON.stringify(ds));
  await dp.goto(`${SITE}/overlay.html?demo=1&modo=cfop&phase=done&learn=result`);
  await dp.waitForTimeout(300);
  const dr = await dp.evaluate(() => ({ pill: document.getElementById('phase').textContent, line: document.getElementById('liveLine').innerText, time: document.getElementById('time').textContent }));
  check('overlay (smart cube): solved → the time, recognising + doing', dr.pill === 'Resuelto' && dr.time === '3.12' && /Sune · reconocer 0\.84 \+ hacer 2\.28/.test(dr.line), JSON.stringify(dr));
  await dp.screenshot({ path: `${SHOTS}/overlay-learn.png` });
  // A big set (many cases ticked) stays on screen in every layout, with the case being done shown.
  for (const layout of ['esquinas', 'derecha', 'izquierda']) {
    await dp.goto(`${SITE}/overlay.html?demo=1&modo=cfop&phase=done&learn=solving&casos=30&layout=${layout}`);
    await dp.waitForTimeout(500);
    const fit = await dp.evaluate(() => {
      const r = document.getElementById('statsCard').getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), cur: !!document.querySelector('.setrow.cur'), more: (document.querySelector('.setrows').innerText.match(/\+(\d+) más/) || [])[1] };
    });
    check(`overlay (${layout}): 30 cases in the set fit on screen, the current one shown and "+N más"`, fit.top >= 0 && fit.bottom <= 1080 && fit.cur && +fit.more > 0, JSON.stringify(fit));
  }
  await od.close();

  // ================= Phone =================
  const ph = await open({ ...devices['Pixel 7'], colorScheme: 'dark' }, keys(seed(Date.now())), 'entrenar');
  await ph.p.click('[data-set-go="look"]');
  await ph.p.waitForFunction(() => window.Fridrich._.session(), null, { timeout: 5000 });
  for (let i = 0; i < 3; i++) await answer(ph.p, true);
  const pm = await ph.p.evaluate(() => ({ over: document.documentElement.scrollWidth - window.innerWidth, mini: getComputedStyle(document.getElementById('sessMini')).display, n: document.querySelectorAll('#sessMini span').length, text: document.getElementById('sessMini').innerText }));
  check('phone: the session fits, and the bar shows each case of the set with its progress', pm.over <= 0 && pm.mini === 'flex' && pm.n === 5 && /[●○]/.test(pm.text), JSON.stringify(pm));
  await ph.p.screenshot({ path: `${SHOTS}/fridrich-session-pixel7.png` });
  await ph.ctx.close();

  results.forEach((r) => console.log(r));
  console.log(`page errors: ${errs.length ? JSON.stringify(errs) : 'none'}`);
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
