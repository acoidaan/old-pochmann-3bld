// «Fridrich reducido», the friends' ranking: two friends (one with a smart-cube history, one timing by hand on a
// phone) in a league, created and joined by link; total time only; records published by themselves; the detail
// of a record (its steps with the smart cube, its scramble without); trying a friend's scramble; renaming,
// someone else's entry, leaving, sync, a wrong link. The server is the real api/_liga.js over a memory store.
const { chromium, devices } = require('playwright');
const { SITE, SHOTS } = require('../env');
const { seed } = require('../fixtures/cfop-seed');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const open = async (opts, data, hash) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
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
    await p.goto(`${SITE}/fridrich#${hash}`);
    await p.waitForFunction(() => window.Fridrich && window.Fridrich.scramble(), null, { timeout: 30000 });
    return { ctx, p };
  };
  const rows = (p) => p.evaluate(() => [...document.querySelectorAll('.rk-table tbody tr:not(.rk-open)')].map((r) => r.innerText.replace(/\s+/g, ' ').trim()));
  // A solve with the timer (Space): hold, let go, wait, press.
  const timed = async (p, ms) => {
    await p.keyboard.down(' '); await p.waitForTimeout(380); await p.keyboard.up(' ');
    await p.waitForTimeout(ms);
    await p.keyboard.down(' '); await p.keyboard.up(' ');
    await p.waitForTimeout(150);
  };

  // ================= Aco creates a league =================
  const d = seed(Date.now());
  const A = await open({}, { 'cfop:times:v1': d.times, 'op3bld:name:v1': 'Aco' }, 'ranking');
  const start = await A.p.evaluate(() => document.getElementById('rankBox').innerText);
  check('start: what it is (total time only, records by themselves, no smart cube needed), create or join', /solo por el tiempo total/.test(start) && /cada vez que alguien hace un récord/.test(start) && /No hace falta cubo inteligente/.test(start) && await A.p.evaluate(() => !!document.getElementById('rkCreate') && !!document.getElementById('rkJoin') && document.getElementById('rkName').value === 'Aco'));
  await A.p.fill('#rkLeague', 'Los del piso');
  await A.p.click('#rkCreate button');
  await A.p.waitForFunction(() => document.querySelector('.rk-table'), null, { timeout: 10000 });
  const code = await A.p.evaluate(() => JSON.parse(localStorage.getItem('cfop:ligas:v1'))[0].code);
  const a1 = await rows(A.p);
  check('create: the league, with your best single already in it (from the smart cube: «con pasos»)', /^[a-z0-9]{8}$/.test(code) && a1.length === 1 && /^1 Aco \(tú\) 38\.70 con pasos/.test(a1[0]) && await A.p.evaluate(() => document.querySelector('.rk-title').innerText === 'Los del piso'), JSON.stringify(a1));
  await A.ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await A.p.evaluate(() => { try { delete navigator.share; } catch (e) { /* none */ } Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); });
  await A.p.click('[data-rk="invite"]');
  const link = await A.p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check('invite: a link to copy (or share), with the league in it', new RegExp(`/fridrich#liga=${code}$`).test(link), link);

  // ================= Pablo joins from the link, on his phone, without a smart cube =================
  const B = await open({ ...devices['Pixel 7'], colorScheme: 'dark' }, null, `liga=${code}`);
  await B.p.waitForFunction(() => document.getElementById('rkAccept'), null, { timeout: 10000 });
  const inv = await B.p.evaluate(() => ({ view: window.Fridrich.currentView(), text: document.querySelector('.rk-invite').innerText }));
  check('invite link: opens the ranking with the league, who made it and how many', inv.view === 'ranking' && /Te han invitado a la liga «Los del piso» de Aco \(1 persona\)/.test(inv.text), JSON.stringify(inv));
  await B.p.fill('#rkName', 'Pablo');
  await B.p.click('#rkAccept button[type=submit]');
  await B.p.waitForFunction(() => document.querySelector('.rk-table'), null, { timeout: 10000 });
  const b1 = await rows(B.p);
  check('join: both, Pablo still without a time', b1.length === 2 && /^1 Aco 38\.70/.test(b1[0]) && /Pablo \(tú\) sin tiempo/.test(b1[1]), JSON.stringify(b1));
  // Pablo's first solve: no record to beat yet, but it goes up to the ranking by itself.
  const kb = await open({}, null, 'crono');   // a desktop for typing Pablo's solves (same league, same player)
  await kb.p.evaluate((x) => { localStorage.setItem('cfop:player:v1', JSON.stringify(x.player)); localStorage.setItem('cfop:ligas:v1', JSON.stringify(x.ligas)); localStorage.setItem('op3bld:name:v1', JSON.stringify('Pablo')); }, await B.p.evaluate(() => ({ player: JSON.parse(localStorage.getItem('cfop:player:v1')), ligas: JSON.parse(localStorage.getItem('cfop:ligas:v1')) })));
  await kb.p.reload();
  await kb.p.waitForFunction(() => window.Fridrich && window.Fridrich.scramble(), null, { timeout: 30000 });
  await timed(kb.p, 900);
  await kb.p.waitForTimeout(1600);
  await A.p.click('[data-rk="refresh"]');
  await A.p.waitForFunction(() => /Pablo/.test(document.querySelector('.rk-table').innerText), null, { timeout: 5000 }).catch(() => {});
  const a2 = await rows(A.p);
  const a2toast = await A.p.evaluate(() => document.getElementById('toast').innerText);
  check('publish: Pablo\'s solve shows for Aco by itself, first, marked «nuevo», with a heads-up', /^1 Pablo nuevo [01]\.\d\d/.test(a2[0]) && /^2 Aco \(tú\) 38\.70/.test(a2[1]) && /novedades de Pablo/.test(a2toast), `${JSON.stringify(a2)} ${a2toast}`);
  check('publish: his time has no steps (no smart cube)', !/con pasos/.test(a2[0]), a2[0]);
  // A new record: published at once, and where it leaves him.
  await timed(kb.p, 300);
  await kb.p.waitForFunction(() => /Ranking «Los del piso»: 1\.º de 2 en single/.test(document.getElementById('toast').innerText), null, { timeout: 6000 }).catch(() => {});
  check('record: published at once, and «1.º de 2 en single»', /Ranking «Los del piso»: 1\.º de 2 en single/.test(await kb.p.evaluate(() => document.getElementById('toast').innerText)));
  const pabloBest = await kb.p.evaluate(() => window.Fridrich._.myBests().single.t);
  await A.p.click('[data-rk="refresh"]');
  await A.p.waitForTimeout(400);
  const a3 = await A.p.evaluate(() => document.querySelector('.rk-table tbody tr').innerText);
  check('record: Aco sees the new time', a3.includes((pabloBest / 1000).toFixed(2)), `${a3} ${pabloBest}`);

  // ================= The details =================
  // Pablo looks at Aco's record: with the smart cube, every step.
  await B.p.evaluate(() => window.Fridrich.showView('ranking'));
  await B.p.click('[data-rk="refresh"]');
  await B.p.waitForTimeout(400);
  const acoRow = await B.p.evaluate(() => [...document.querySelectorAll('.rk-table tbody tr')].findIndex((r) => /Aco/.test(r.innerText)));
  await B.p.click(`.rk-table tbody tr:nth-child(${acoRow + 1}) [data-rk-open]`);
  const det2 = await B.p.evaluate(() => document.querySelector('.rk-open').innerText.replace(/\s+/g, ' '));
  check('detail with a smart cube: the steps (bar, each step with its case, recognising + doing) and the efficiency', await B.p.evaluate(() => !!document.querySelector('.rk-open .fr-bar')) && /OLL 1 [\d.]+ \d+ giros/.test(det2) && /PLL 2 [\d.]+ \d+ giros PLL \(\w+\) [\d.]+ \+ [\d.]+/.test(det2) && /Eficiencia \d+ %/.test(det2), det2.slice(0, 300));
  await B.p.click('[data-rk-cat="ao5"]');
  const ao5 = await rows(B.p);
  check('media de 5: Aco has one, Pablo not yet', /^1 Aco 42\.13/.test(ao5[0]) && /Pablo \(tú\) sin tiempo/.test(ao5[1]), JSON.stringify(ao5));
  await B.p.click('.rk-table tbody tr:first-child [data-rk-open]');
  const avg = await B.p.evaluate(() => [...document.querySelectorAll('.rk-avg li')].map((x) => x.querySelector('b').innerText));
  check('media de 5: its five solves, the best and the worst in brackets', avg.length === 5 && avg.filter((x) => /^\(/.test(x)).length === 2, JSON.stringify(avg));
  await A.p.click('.rk-table tbody tr [data-rk-open]');
  const det = await A.p.evaluate(() => document.querySelector('.rk-open').innerText.replace(/\s+/g, ' '));
  check('detail without a smart cube: the scramble, to try it or copy it', /SCRAMBLE [RLUDFB]/i.test(det) && /Probar este scramble/.test(det) && /Copiar/.test(det) && /Sin cubo inteligente: solo el tiempo total/.test(det), det.slice(0, 200));
  const theirScr = await A.p.evaluate(() => document.querySelector('[data-rk-try]').dataset.rkTry);
  await A.p.click('[data-rk-try]');
  const duel = await A.p.evaluate(() => ({ view: window.Fridrich.currentView(), scr: window.Fridrich.scramble(), line: document.getElementById('duel').hidden ? '' : document.getElementById('duel').innerText }));
  check('try it: their scramble in your timer, with who and what to beat', duel.view === 'crono' && duel.scr === theirScr && /El scramble del single de Pablo \([01]\.\d\d\): ¿le ganas\?/.test(duel.line), JSON.stringify(duel));
  await timed(A.p, 200);
  const res = await A.p.evaluate(() => document.getElementById('duel').innerText);
  check('try it: after the solve, who won and by how much', /(¡Le has ganado a Pablo por \d\.\d\d s!|Pablo te gana por \d\.\d\d s|Empate con Pablo)/.test(res), res);
  await B.p.screenshot({ path: `${SHOTS}/fridrich-ranking-pixel7.png`, fullPage: true });
  const over = await B.p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('phone: the ranking fits', over <= 0, String(over));

  // ================= Name, someone else's place, leaving =================
  await B.p.click('.rk-more summary');
  await B.p.fill('#rkName', 'Pablito');
  await B.p.click('#rkRename button');
  await B.p.waitForTimeout(600);
  await A.p.evaluate(() => window.Fridrich.showView('ranking'));
  await A.p.click('[data-rk="refresh"]');
  await A.p.waitForTimeout(400);
  check('rename: the others see the new name', /Pablito/.test(await A.p.evaluate(() => document.querySelector('.rk-table').innerText)));
  const forged = await A.p.evaluate(async (c) => {
    const pid = (await (await fetch(`api/liga?code=${c}`)).json()).members.find((m) => m.name === 'Pablito').id;
    const r = await fetch(`api/liga?code=${c}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'post', player: { id: pid, token: 'f'.repeat(32), name: 'Hacker' }, best: {} }) });
    return r.status;
  }, code);
  check('someone else\'s place: refused without their token', forged === 403, String(forged));
  await A.p.screenshot({ path: `${SHOTS}/fridrich-ranking-1280.png`, fullPage: true });
  await B.p.click('[data-rk="leave"]');
  check('leave: asks first', /¿Seguro\?/.test(await B.p.evaluate(() => document.querySelector('[data-rk="leave"]').innerText)));
  await B.p.click('[data-rk="leave"]');
  await B.p.waitForFunction(() => document.getElementById('rkCreate') && !document.querySelector('.rk-table'), null, { timeout: 5000 }).catch(() => {});
  check('leave: back to the start', await B.p.evaluate(() => !!document.getElementById('rkCreate') && JSON.parse(localStorage.getItem('cfop:ligas:v1')).length === 0));
  await A.p.click('[data-rk="refresh"]');
  await A.p.waitForTimeout(400);
  const a4 = await rows(A.p);
  check('leave: gone from everyone\'s ranking', a4.length === 1 && /Aco/.test(a4[0]), JSON.stringify(a4));

  // ================= Sync and a wrong link =================
  const sync = await A.p.evaluate(() => {
    const F = window.Fridrich._;
    const me = F.player();
    F.mergeIn({ ligas: [{ code: 'abcdefgh', name: 'Otra', at: 1 }], player: { id: 'zzzzzzzzzzzzzzzz', token: 'e'.repeat(32), at: me.at + 1000 } });
    return { ligas: JSON.parse(localStorage.getItem('cfop:ligas:v1')).map((x) => x.code), id: F.player().id === me.id };
  });
  check('sync: the leagues of your other devices come in; the older player id stays', sync.ligas.includes('abcdefgh') && sync.id, JSON.stringify(sync));
  const W = await open({}, null, 'liga=zzzzzzzz');
  await W.p.waitForFunction(() => /no existe/.test(document.getElementById('rankBox').innerText), null, { timeout: 5000 }).catch(() => {});
  check('wrong link: «esa liga no existe»', /esa liga no existe/.test(await W.p.evaluate(() => document.getElementById('rankBox').innerText)));
  await W.ctx.close();
  await kb.ctx.close();
  await B.ctx.close();
  await A.ctx.close();

  results.forEach((r) => console.log(r));
  console.log(`page errors: ${errs.length ? JSON.stringify(errs) : 'none'}`);
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
