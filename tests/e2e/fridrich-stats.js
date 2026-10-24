// «Fridrich reducido», the numbers: the stats engine on a known history (fixtures/cfop-seed.js), the
// «Progreso» view, «Qué entrenar hoy» (where the time goes, the recommended set and training it), the cases in
// numbers, «me he perdido» with the smart cube and with a normal cube, the training log in sync, the live pace
// against your average and the records (page and OBS overlay), the empty page and the phone.
const { chromium, devices } = require('playwright');
const { SITE, SHOTS } = require('../env');
const { seed } = require('../fixtures/cfop-seed');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
const FIXED = seed();   // a fixed «now» for the engine's own numbers
const keys = (d) => ({ 'cfop:times:v1': d.times, 'cfop:trlog:v1': d.trlog, 'cfop:train:v1': d.train, 'cfop:crosstr:v1': d.crossTr, 'cfop:learn:v1': d.learn });

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const open = async (opts, data, hash = 'progreso') => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, timezoneId: 'Europe/Madrid', locale: 'es-ES', ...opts });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    if (data) {
      await ctx.addInitScript((x) => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        Object.entries(x).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
      }, data);
    }
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`${SITE}/fridrich?cubo=virtual#${hash}`);
    await p.waitForFunction(() => window.Fridrich && window.Fridrich.scramble(), null, { timeout: 30000 });
    return { ctx, p };
  };

  const { ctx, p } = await open({}, keys(seed(Date.now())));

  // ================= The engine, on the fixed history =================
  const eng = await p.evaluate((d) => {
    const S = window.CfopStats;
    const sm = S.summary(d.times, d.now);
    const act = S.activity(d.times, d.trlog, d.crossTr, d.now);
    const ms = S.milestones(d.times);
    const st = S.steps(d.times);
    const rc = S.recommend({ ...d });
    return {
      sm: [sm.n, sm.dnf, sm.best.v, Math.round(sm.bestAo5.v), Math.round(sm.bestAo12.v), Math.round(sm.ao12), Math.round(sm.prevAo12), sm.week.n, sm.prevWeek.n, Math.round(sm.then.v)],
      days: S.daily(d.times).length,
      act: [act.streak, act.bestStreak, act.active30, act.cells.length % 7 === 0 || act.cells.length > 7 * 17],
      next: ms.next.map((x) => `${x.kind}<${x.sub}`),
      done0: `${ms.done[0].kind}<${ms.done[0].sub}`,
      steps: st.groups.map((g) => Math.round(g.now)),
      parts: rc.parts.map((x) => x.id),
      set: rc.set.map((x) => x.id),
      why: rc.set[0].why[0],
      lost: rc.set.find((x) => x.id === 'diag').why[0],
    };
  }, FIXED);
  check('engine: summary (90 solves, 1 DNF, best 38.70, best ao5/ao12, now, before, this week and last, a month ago)',
    JSON.stringify(eng.sm) === JSON.stringify([90, 1, 38704, 42129, 42670, 42670, 45832, 14, 14, 56683]), JSON.stringify(eng.sm));
  check('engine: 45 days with solves, a streak of 45, 30 of the last 30 days', eng.days === 45 && eng.act[0] === 45 && eng.act[1] === 45 && eng.act[2] === 30, JSON.stringify(eng.act));
  check('engine: milestones (last: single under 40; next: single under 35, ao5 and ao12 under 40)', eng.done0 === 'single<40' && JSON.stringify(eng.next) === JSON.stringify(['single<35', 'ao5<40', 'ao12<40']), JSON.stringify(eng));
  check('engine: each step now (cross, F2L, OLL, PLL)', JSON.stringify(eng.steps) === JSON.stringify([4681, 21276, 6165, 10430]), JSON.stringify(eng.steps));
  check('engine: where the time goes, biggest first (stops in the F2L, extra turns in the pairs, the cross, recognising)', eng.parts.slice(0, 4).join() === 'f2lStop,f2lExtra,cross,look', eng.parts.join());
  check('engine: the set (Ub slow to recognise, Z mixed up, Diagonal lost, Pi slow, Ua common)', eng.set.join() === 'ub,z,diag,pi,ua', eng.set.join());
  check('engine: and why', /^Tardas 2\.3 s en reconocerlo/.test(eng.why) && /^Te perdiste 4 veces/.test(eng.lost), `${eng.why} | ${eng.lost}`);

  // ================= Progreso =================
  const exp = await p.evaluate(() => {
    const S = window.CfopStats; const F = window.Fridrich;
    const act = S.activity(F.times(), JSON.parse(localStorage.getItem('cfop:trlog:v1')), JSON.parse(localStorage.getItem('cfop:crosstr:v1')));
    return { streak: act.streak, days90: S.daily(F.times()).filter((d) => d.ts >= S.dayStart(Date.now()) - 89 * 86400000).length, days30: S.daily(F.times()).filter((d) => d.ts >= S.dayStart(Date.now()) - 29 * 86400000).length, cells: act.cells.length };
  });
  const prog = await p.evaluate(() => ({
    lead: document.querySelector('.fr-prog-lead').innerText,
    tiles: [...document.querySelectorAll('#progSummary .stat')].map((x) => x.innerText.replace(/\s+/g, ' ')),
    miles: document.getElementById('progMilestones').innerText.replace(/\s+/g, ' '),
  }));
  check('progreso: in words (90 solves, the ao12 and how it changed)', /Llevas 90 solves/.test(prog.lead) && /Tu media de 12 es 42\.67: ▼ 3\.2 s mejor/.test(prog.lead) && /Esta semana: 14 solves/.test(prog.lead), prog.lead);
  check('progreso: best single, ao5, ao12, now and the streak', /MEJOR SINGLE 38\.70/i.test(prog.tiles[0]) && /42\.13/.test(prog.tiles[1]) && /42\.67/.test(prog.tiles[2]) && new RegExp(`RACHA ${exp.streak} días`, 'i').test(prog.tiles[4]), JSON.stringify(prog.tiles));
  check('progreso: what to go for next and what you got', /Single por debajo de 35 s · te faltan 3\.7 s/.test(prog.miles) && /Single por debajo de 40 s/.test(prog.miles), prog.miles.slice(0, 200));
  // Time practised: the engine on a small known history (now: Wednesday 21 October 2026, at noon).
  const pt = await p.evaluate(() => {
    const at = (m, d, h) => new Date(2026, m - 1, d, h || 9).getTime();
    const P = window.CfopStats.practiceTime({
      times: [{ at: at(10, 21, 10), t: 20000 }, { at: at(10, 19), t: 30000 }, { at: at(9, 30), t: 40000 }],
      ltimes: [{ at: at(10, 20), t: 5000, m: 'll' }],
      trlog: [{ at: at(10, 21, 11), t: 3000 }, { at: at(10, 21, 11), x: 1 }],
      crossTr: [{ at: at(10, 2), t: 7000 }],
      sessions: [{ at: at(10, 21, 8), active: 600000 }],
      active: { '2026-10-21': 1200000, '2026-10-18': 60000 },
    }, at(10, 21, 12));
    return { rows: P.rows.map((r) => r.v.join()), timed: P.timed.join(), sessions: P.sessions.join(), real: P.real.join() };
  });
  check('practice time: today, this week (from Monday), this month and in all, by kind', pt.rows.join('|') === '20000,50000,50000,90000|0,5000,5000,5000|3000,3000,3000,3000|0,0,7000,7000'
    && pt.timed === '23000,58000,65000,105000' && pt.sessions === '600000,600000,600000,600000' && pt.real === '1200000,1200000,1260000,1260000', JSON.stringify(pt));
  const ptab = await p.evaluate(() => [...document.querySelectorAll('#progPractice tr')].map((x) => x.innerText.replace(/\s+/g, ' ').trim()));
  check('practice time: the table on «Progreso», with the timed total and the real time', /Hoy Semana Mes Total/.test(ptab[0]) && ptab.some((r) => /^Solves completos .*\d+ (min|h)/.test(r)) && ptab.some((r) => /^Cronometrado /.test(r)) && ptab.some((r) => /^En la página /.test(r)), JSON.stringify(ptab));
  const chart = async () => p.evaluate(() => ({ mean: document.querySelectorAll('#dayChart .fr-dmean').length, best: document.querySelectorAll('#dayChart .fr-dbest').length, legend: document.getElementById('dayLegend').innerText }));
  const c90 = await chart();
  check('progreso: each day, its mean and its best (90 days)', c90.mean === exp.days90 && c90.best === exp.days90 && /Media del día/.test(c90.legend) && /Mejor del día/.test(c90.legend), JSON.stringify(c90));
  await p.click('[data-days="30"]');
  const c30 = await chart();
  check('progreso: 30 days', c30.mean === exp.days30 && c30.mean < c90.mean, JSON.stringify(c30));
  const box = await p.locator('#dayChart svg .fr-hit').boundingBox();
  await p.mouse.move(box.x + box.width - 3, box.y + box.height / 2);
  check('progreso: hovering shows that day', /solves?[\s\S]*media [\d.]+[\s\S]*mejor [\d.]+/.test(await p.evaluate(() => document.getElementById('dayTip').innerText)));
  const hm = await p.evaluate(() => ({ cells: document.querySelectorAll('.fr-hm i').length, on: document.querySelectorAll('.fr-hm i:not(.h0)').length, label: document.querySelector('.fr-hm').getAttribute('aria-label') }));
  check('progreso: a calendar of practice, with how many days', hm.cells === exp.cells && hm.on >= 45 && /Has practicado 30 de los últimos 30 días/.test(hm.label), JSON.stringify(hm));
  const steps = await p.evaluate(() => [...document.querySelectorAll('.fr-step-card')].map((x) => x.innerText.replace(/\s+/g, ' ')));
  check('progreso: each step now, against before, with a line', steps.length === 4 && /^CRUZ 4\.68 s ▼ 0\.4 s mejor/i.test(steps[0]) && /F2L 21\.28 s ▼ 1\.6 s mejor 50 % del solve/i.test(steps[1]) && await p.evaluate(() => document.querySelectorAll('.fr-step-card .fr-spark').length === 4), JSON.stringify(steps));
  const eff = await p.evaluate(() => [...document.querySelectorAll('#progEff tbody tr')].map((x) => x.innerText.replace(/\s+/g, ' ')));
  check('progreso: efficiency now and before', eff.length === 8 && /^Eficiencia 93 % 93 %/.test(eff[0]) && /Parado en el F2L 2\.8 s/.test(eff[6]), JSON.stringify(eff));
  const crossP = await p.evaluate(() => document.getElementById('progCross').innerText.replace(/\s+/g, ' '));
  check('progreso: the cross (trainer and solves)', /ENTRENADAS 12/i.test(crossP) && /la cruz te lleva 4\.68 s/.test(crossP), crossP.slice(0, 200));
  const casesP = await p.evaluate(() => document.getElementById('progCases').innerText.replace(/\s+/g, ' '));
  check('progreso: what costs most among the cases', /Te sabes 6 de 16 y estás aprendiendo 3/.test(casesP) && /^PLL \(Ub\)/.test(await p.evaluate(() => document.querySelector('.fr-top-cases li').innerText)), casesP.slice(0, 200));
  await p.screenshot({ path: `${SHOTS}/fridrich-progreso-1280.png`, fullPage: true });
  await p.click('[data-prog-go="plan"]');
  check('progreso: «Ver el set recomendado» → Entrenar', await p.evaluate(() => window.Fridrich.currentView() === 'entrenar'));

  // ================= Qué entrenar hoy =================
  const planT = await p.evaluate(() => ({
    parts: [...document.querySelectorAll('.fr-gain-list li')].map((x) => x.querySelector('b').innerText),
    set: [...document.querySelectorAll('[data-set-case]')].map((x) => x.dataset.setCase),
    go: document.querySelector('[data-set-go].primary').innerText,
    buttons: document.querySelectorAll('.fr-gain-list [data-plan-go="slow"]').length,
  }));
  check('plan: where you can win time, biggest first', planT.parts[0] === 'Pararte en el F2L' && planT.parts.includes('Cruz más larga de la cuenta'), JSON.stringify(planT.parts));
  check('plan: «Practicar sin crono» once, not on every F2L line', planT.buttons === 1, String(planT.buttons));
  check('plan: the recommended set, with pictures, algorithms and why', planT.set.join() === 'ub,z,diag,pi,ua' && await p.evaluate(() => [...document.querySelectorAll('.fr-set-card')].every((c) => c.querySelector('svg') && c.querySelector('.fr-alg') && c.querySelectorAll('.fr-why li').length >= 1)), JSON.stringify(planT));
  check('plan: without the smart cube, a session with a normal cube', /Empezar sesión · Cubo normal/.test(planT.go), planT.go);
  await p.click('[data-set-go].primary');
  await p.waitForFunction(() => window.Fridrich._.tr.hand, null, { timeout: 30000 });
  const inSet = await p.evaluate(() => ({ pick: JSON.parse(localStorage.getItem('cfop:pick:v1')).sort().join(), c: window.Fridrich._.tr.hand.c.id, bar: !document.getElementById('sessBar').hidden, training: document.body.classList.contains('training'), cards: [...document.querySelectorAll('#sessSet .fr-sc')].map((x) => x.dataset.sc).join(), mode: window.Fridrich._.settings.trMode }));
  check('plan: «Empezar sesión» → only those cases, in that mode, each one tracked', inSet.pick === 'diag,pi,ua,ub,z' && ['ub', 'z', 'diag', 'pi', 'ua'].includes(inSet.c) && inSet.bar && inSet.training && inSet.cards === 'ub,z,diag,pi,ua' && inSet.mode === 'hand', JSON.stringify(inSet));

  // ================= «Me he perdido» with a normal cube =================
  const hc = inSet.c;
  const before = await p.evaluate(() => JSON.parse(localStorage.getItem('cfop:trlog:v1')).length);
  await p.click(`[data-answer="${hc}"]`);
  await p.click('#trHandLost');
  await p.waitForFunction(() => window.Fridrich._.tr.hand && !window.Fridrich._.tr.answered, null, { timeout: 30000 });
  const hl = await p.evaluate((id) => ({ t: JSON.parse(localStorage.getItem('cfop:train:v1'))[id], log: JSON.parse(localStorage.getItem('cfop:trlog:v1')).slice(-2), toast: document.getElementById('toast').innerText, sess: document.getElementById('sessNums').innerText, card: document.querySelector(`#sessSet [data-sc="${id}"] .fr-sc-line`).innerText }), hc);
  check('lost (normal cube): the answer, then «Me he perdido» counted as a fail', hl.t.mfail === 1 && hl.log[0].m === 'h' && hl.log[0].ok === 1 && hl.log[1].m === 'h' && hl.log[1].x === 1 && /apuntado como fallo/.test(hl.toast), JSON.stringify(hl));
  check('lost (normal cube): a new case of the set comes, and the session counts it (bar and that case)', /1 caso · 100 % bien · 1 perdido · 0 dominados/.test(hl.sess) && /1 de 1 bien · perdido 1/.test(hl.card) && await p.evaluate((n) => JSON.parse(localStorage.getItem('cfop:trlog:v1')).length === n + 2, before), JSON.stringify(hl));
  await p.click('#sessEnd');
  await p.click('#sessClose');

  // ================= The cases in numbers =================
  await p.waitForFunction(() => /TE PERDISTE\s*5/i.test(document.getElementById('trStats').innerText), null, { timeout: 3000 }).catch(() => {});
  const table = async () => p.evaluate(() => [...document.querySelectorAll('#trStats .fr-case-table tbody tr')].map((x) => x.querySelector('.fr-case-n').innerText));
  const rows = await table();
  const costliest = await p.evaluate(() => {
    const L = (k, d) => JSON.parse(localStorage.getItem(k)) || d;
    const rc = window.CfopStats.recommend({ times: L('cfop:times:v1', []), train: L('cfop:train:v1', {}), trlog: L('cfop:trlog:v1', []), learn: L('cfop:learn:v1', {}), crossTr: L('cfop:crosstr:v1', []) });
    return rc.scored.slice(0, 3).map((x) => x.c.name);
  });
  check('numbers: the 16 cases, the costliest first', rows.length === 16 && JSON.stringify(rows.slice(0, 3)) === JSON.stringify(costliest), `${JSON.stringify(rows.slice(0, 4))} ${JSON.stringify(costliest)}`);
  const ubRow = await p.evaluate(() => [...document.querySelectorAll('#trStats .fr-case-table tbody tr')].find((r) => r.querySelector('.fr-case-n').innerText === 'PLL (Ub)').innerText.replace(/\s+/g, ' '));
  check('numbers: per case, in solves (times · recognise + do), training and what it costs per solve', /\d+ · 2\.\d s \+ \d\.\d s/.test(ubRow) && /10 con el cubo/.test(ubRow) && /reconocer 100 %/.test(ubRow) && /0\.\d\d s/.test(ubRow), ubRow);
  const tiles = await p.evaluate(() => [...document.querySelectorAll('#trStats .stat')].map((x) => x.innerText.replace(/\s+/g, ' ')));
  check('numbers: this week, recognising, with the cube, with a normal cube, lost', tiles.length === 5 && /ESTA SEMANA \d+ casos en \d+ días/i.test(tiles[0]) && /RECONOCER 93 %/i.test(tiles[1]) && /TE PERDISTE 5/i.test(tiles[4]), JSON.stringify(tiles));
  await p.click('[data-case-sort="step"]');
  const byStep = await table();
  check('numbers: «Por paso» → in the order of the steps', byStep[0] === 'Dot Shape' && byStep[15] === 'PLL (Z)', JSON.stringify(byStep));

  // ================= «Me he perdido» with the smart cube =================
  await p.evaluate(() => window.Fridrich.showView('crono'));
  await p.evaluate(() => document.getElementById('cubeSim').click());
  await p.waitForFunction(() => window.Fridrich.cube().on);
  await p.evaluate(() => window.Fridrich.showView('entrenar'));
  await p.click('[data-set-go="cube"]');
  await p.waitForFunction(() => window.Fridrich._.tr.follow && window.Fridrich._.settings.trMode === 'cube', null, { timeout: 30000 });
  check('lost (smart cube): while setting it up, «Otro caso» (not a fail)', await p.evaluate(() => /Otro caso/.test(document.getElementById('trBox').innerText) && !/Me he perdido/.test(document.getElementById('trBox').innerText)));
  const c1 = await p.evaluate(() => ({ id: window.Fridrich._.tr.c.id, setup: window.Fridrich._.tr.setup }));
  const fail0 = await p.evaluate((id) => (JSON.parse(localStorage.getItem('cfop:train:v1'))[id] || {}).fail || 0, c1.id);
  await p.evaluate((x) => window.Fridrich.cube().link.turn(x), c1.setup);
  await p.waitForFunction(() => window.Fridrich._.tr.ready, null, { timeout: 5000 }).catch(() => {});
  check('lost (smart cube): once in the case, «Me he perdido · otro caso»', await p.evaluate(() => /Me he perdido · otro caso/.test(document.getElementById('trBox').innerText)));
  await p.evaluate(() => window.Fridrich.cube().link.turn("R U R'"));   // a mess
  await p.click('[data-tr-lost]');
  await p.waitForFunction(() => { const t = window.Fridrich._.tr; return t.follow && !t.ready && !t.busy; }, null, { timeout: 30000 });
  const cl = await p.evaluate((id) => ({ t: JSON.parse(localStorage.getItem('cfop:train:v1'))[id], last: JSON.parse(localStorage.getItem('cfop:trlog:v1')).slice(-1)[0], c: window.Fridrich._.tr.c.id, setup: window.Fridrich._.tr.setup, set: window.Fridrich._.session().set }), c1.id);
  check('lost (smart cube): counted as a fail, and another case of the set, from where the cube is', cl.t.fail === fail0 + 1 && cl.last.m === 'c' && cl.last.x === 1 && cl.last.id === c1.id && cl.set.includes(cl.c) && cl.setup.length > 0, JSON.stringify(cl));
  await p.click('#sessEnd');
  await p.click('#sessClose');
  check('session: «Terminar sesión» → every case again', await p.evaluate(() => JSON.parse(localStorage.getItem('cfop:pick:v1')).length === 16 && !document.body.classList.contains('training')));

  // ================= The training log travels with sync =================
  const merged = await p.evaluate(() => {
    const F = window.Fridrich._;
    const e = { at: 1700000000000, id: 'ua', m: 'q', ok: 1, t: 640 };
    F.mergeIn({ trlog: [e, { at: 1, id: 'nope', m: 'q', ok: 1 }] });
    F.mergeIn({ trlog: [e] });
    const log = JSON.parse(localStorage.getItem('cfop:trlog:v1'));
    return { n: log.filter((x) => x.at === 1700000000000).length, bad: log.some((x) => x.id === 'nope'), sorted: log.every((x, i) => !i || log[i - 1].at <= x.at) };
  });
  check('sync: training attempts merge in once, in order, unknown cases left out', merged.n === 1 && !merged.bad && merged.sorted, JSON.stringify(merged));
  await ctx.close();

  // ================= Pace and records =================
  // A seeded history (best 38.70, mean of the last 12 about 42.6) and a quick solve with the virtual cube.
  const SOLVE = ["D R' F2 L", "U R U' R'", "U' F' U F", "L' U' L", "U B U' B'", "F R U R' U' F'", "R U R' U R U2 R'", "R U R' U' R' F R2 U' R' U' R U R' F'", "R U' R U R U R U' R' U' R2"];
  const pr = await open({}, { 'cfop:times:v1': seed(Date.now()).times }, 'crono');
  const q = pr.p;
  await q.evaluate(() => document.getElementById('cubeSim').click());
  await q.waitForFunction(() => window.Fridrich.cube().on);
  await q.evaluate((sol) => {
    const M = window.CubeModel; const link = window.Fridrich.cube().virtualLink(); const out = [];
    link.events$.subscribe((e2) => { if (e2.type === 'MOVE') out.push(e2.move); });
    link.turn(`z2 ${M.invertAlg(sol.join(' '))} z2`);
    window.Fridrich._.setScramble(M.simplifyAlg(out.join(' ')));
  }, SOLVE);
  await q.evaluate((x) => window.Fridrich.cube().link.turn(x), await q.evaluate(() => window.Fridrich.scramble()));
  await q.evaluate(() => window.Fridrich.cube().link.turn('z2'));
  const ref = await q.evaluate(() => window.Fridrich._.paceRef());
  check('pace: the reference is the mean of the last 12 smart-cube solves, part by part', ref && ref.label === 'tu media de 12' && Math.round(ref.cum[3]) === 42551 && ref.best.every((x) => x > 0), JSON.stringify(ref));
  for (let i = 0; i < 6; i++) await q.evaluate((x) => window.Fridrich.cube().link.play([x], 25), SOLVE[i]);
  await q.waitForTimeout(150);
  const mid = await q.evaluate(() => ({
    chips: [...document.querySelectorAll('#pace .pc')].map((c) => `${c.className.replace('pc ', '')}:${c.innerText.replace(/\s+/g, ' ')}`),
    proj: (document.querySelector('#pace .pc-proj') || {}).innerText || '',
  }));
  check('pace: while solving, each part done against the reference (ahead, and gold if the best ever), the next one waiting', /^gold:CRUZ 0\.\d\d −4\.\d ★$/i.test(mid.chips[0]) && /^gold:F2L \d\.\d\d −2\d\.\d ★$/i.test(mid.chips[1]) && /^cur:OLL …/i.test(mid.chips[2]) && /^todo:PLL/i.test(mid.chips[3]), JSON.stringify(mid.chips));
  check('pace: where it is heading', /^Vas para \d+\.\d\d$/.test(mid.proj), mid.proj);
  // (read at once: the next frame puts the real gap back)
  const late = await q.evaluate(() => { window.Fridrich._.paceTick(99999); const c = document.querySelector('#pace .pc.cur'); return c ? `${c.className}|${c.textContent.replace(/\s+/g, ' ')}` : ''; });
  check('pace: past the reference for the part under way → the gap counts up, in red', /late/.test(late) && /\+\d+\.\d/.test(late), late);
  for (let i = 6; i < SOLVE.length; i++) await q.evaluate((x) => window.Fridrich.cube().link.play([x], 25), SOLVE[i]);
  await q.waitForFunction(() => document.getElementById('clock').dataset.phase === 'done', null, { timeout: 5000 }).catch(() => {});
  await q.waitForTimeout(150);
  const fin = await q.evaluate(() => ({
    pace: document.getElementById('pace').innerText.replace(/\s+/g, ' '),
    banner: document.getElementById('pbBanner').hidden ? '' : document.getElementById('pbBanner').innerText.replace(/\s+/g, ' '),
    confetti: !!document.querySelector('.fr-confetti'),
    toast: document.getElementById('toast').innerText,
    line: (document.querySelector('.fr-pace-line') || {}).innerText || '',
    tag: !!document.querySelector('#history tbody tr .fr-pbtag'),
  }));
  check('pace: after the solve, the four parts and the total against the reference', /CRUZ.*F2L.*OLL.*PLL.*−\d+\.\d s contra tu media de 12/i.test(fin.pace), fin.pace);
  check('records: a new single, ao5 and ao12 → «¡Nuevo récord!» with what it beat, and confetti', /¡Nuevo récord! Single \d\.\d\d · ao5 \d+\.\d\d · ao12 \d+\.\d\d antes Single 38\.70/.test(fin.banner) && fin.confetti && /¡Nuevo récord!/.test(fin.toast), JSON.stringify(fin));
  check('records: in the splits too, and a PB tag in the history', /Contra tu media de 12:/.test(fin.line) && /★ tu mejor cruz/.test(fin.line) && fin.tag, fin.line.replace(/\s+/g, ' '));
  const forOverlay = await q.evaluate(() => { const F = window.Fridrich; const l = F.last(); return { rec: F.recordsOf(l).map((x) => x.k), pace: F.paceFor(l) }; });
  check('records: what the OBS overlay gets (records, and each part against the reference)', forOverlay.rec.join() === 'single,ao5,ao12' && forOverlay.pace.d.length === 4 && forOverlay.pace.gold.every(Boolean) && forOverlay.pace.label === 'tu media de 12', JSON.stringify(forOverlay));
  await q.evaluate(() => window.Fridrich.showView('ajustes'));
  await q.selectOption('#setPace', 'pb');
  check('pace: «Contra tu mejor solve» → your best solve is the reference', await q.evaluate(() => /^tu mejor solve \(\d\.\d\d\)$/.test(window.Fridrich._.paceRef().label)));
  await q.selectOption('#setPace', 'off');
  await q.evaluate(() => window.Fridrich.showView('crono'));
  check('pace: «No mostrarlo» → nothing', await q.evaluate(() => !document.getElementById('pace').innerText && !window.Fridrich._.paceRef() && !document.querySelector('.fr-pace-line')));
  await pr.ctx.close();

  // The overlay: a record and the parts against the reference (its demo).
  const ovc = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ovc.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const ov = await ovc.newPage();
  ov.on('pageerror', (e2) => errs.push(`overlay: ${e2.message}`));
  await ov.goto(`${SITE}/overlay.html?demo=1&modo=cfop&phase=pb`);
  await ov.waitForTimeout(400);
  const ovPb = await ov.evaluate(() => ({ banner: (document.querySelector('.banner') || {}).textContent || '', d: [...document.querySelectorAll('#cfSplits .pd')].map((x) => `${x.className}:${x.textContent}`), confetti: !!document.querySelector('.confetti') }));
  check('overlay: «¡Nuevo récord! · Single 21.30», confetti, and each part against the reference (gold ★ for the best ever)', ovPb.banner === '¡Nuevo récord! · Single 21.30' && ovPb.confetti && ovPb.d.join('|') === 'pd ahead:−1.3|pd gold:−2.6 ★|pd ahead:−3.6|pd gold:−6.6 ★', JSON.stringify(ovPb));
  await ov.goto(`${SITE}/overlay.html?demo=1&modo=cfop&phase=run&ms=23000`);
  await ov.waitForTimeout(300);
  const ovRun = await ov.evaluate(() => [...document.querySelectorAll('#cfSplits .pd')].map((x) => x.textContent));
  check('overlay: while solving, the parts done against the reference', ovRun.slice(0, 3).every((x) => /^−\d\.\d$/.test(x)) && ovRun[3] === '', JSON.stringify(ovRun));
  await ovc.close();

  // ================= Nothing yet =================
  const e = await open({}, null);
  check('empty: Progreso says there is nothing yet', /Aún no hay nada que contar/.test(await e.p.evaluate(() => document.getElementById('progSummary').innerText)) && await e.p.evaluate(() => document.getElementById('progDaysPanel').hidden));
  await e.p.evaluate(() => window.Fridrich.showView('entrenar'));
  const ep = await e.p.evaluate(() => ({ note: document.getElementById('planBox').innerText, set: [...document.querySelectorAll('[data-set-case]')].map((x) => x.dataset.setCase) }));
  check('empty: a set anyway, the commonest cases first, not practised yet', ep.set.length === 5 && ep.set[0] === 'head' && /Aún no lo has practicado/.test(ep.note) && /empiezo por los casos que más salen/.test(ep.note), JSON.stringify(ep.set));
  await e.ctx.close();

  // ================= Phone =================
  const ph = await open({ ...devices['Pixel 7'] }, keys(seed(Date.now())));
  const fits = async () => ph.p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const o1 = await fits();
  await ph.p.screenshot({ path: `${SHOTS}/fridrich-progreso-pixel7.png`, fullPage: true });
  await ph.p.evaluate(() => window.Fridrich.showView('entrenar'));
  await ph.p.waitForTimeout(200);
  const o2 = await fits();
  await ph.p.screenshot({ path: `${SHOTS}/fridrich-plan-pixel7.png`, fullPage: true });
  const tabs = await ph.p.evaluate(() => [...document.querySelectorAll('#tabs .tab')].filter((t) => t.getBoundingClientRect().width > 40).map((t) => t.innerText.trim()));
  check('phone: Progreso and Entrenar fit, six tabs at the bottom', o1 <= 0 && o2 <= 0 && tabs.join() === 'Cronómetro,Casos,Entrenar,Progreso,Ranking,Ajustes', `${o1} ${o2} ${tabs.join()}`);
  await ph.ctx.close();

  results.forEach((r) => console.log(r));
  console.log(`page errors: ${errs.length ? JSON.stringify(errs) : 'none'}`);
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
