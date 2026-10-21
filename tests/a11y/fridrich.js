// axe-core and horizontal overflow on «Fridrich reducido»: every view, phone and desktop, light and dark,
// with the cube following a solve and both trainers, and with a history (Progreso, «Qué entrenar hoy»).
const { chromium, devices } = require('playwright');
const { SITE } = require('../env');
const fs = require('fs');
const { seed } = require('../fixtures/cfop-seed');
const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
let problems = 0;
const SOLVE = ["D R' F2 L", "U R U' R'", "U' F' U F", "L' U' L", "U B U' B'", "F R U R' U' F'", "R U R' U R U2 R'", "R U R' U' R' F R2 U' R' U' R U R' F'", "R U' R U R U R U' R' U' R2"];
(async () => {
  const b = await chromium.launch();
  const sizes = [['pixel7', { ...devices['Pixel 7'] }, 'light'], ['pixel7', { ...devices['Pixel 7'] }, 'dark'], ['1280', { viewport: { width: 1280, height: 900 } }, 'dark'], ['1280', { viewport: { width: 1280, height: 900 } }, 'light']];
  for (const [label, opts, scheme] of sizes) {
    const ctx = await b.newContext({ ...opts, colorScheme: scheme });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const p = await ctx.newPage();
    await p.goto(`${SITE}/fridrich?cubo=virtual#crono`);
    await p.waitForFunction(() => window.Fridrich && window.Fridrich.scramble(), null, { timeout: 30000 });
    const run = async (what) => {
      await p.evaluate(axeSrc);
      const v = await p.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`));
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const bad = [...v, ...(over > 0 ? [`overflow ${over}px`] : [])];
      console.log(`${label} ${scheme} ${what}: ${bad.length ? bad.join(' | ') : 'clean'}`);
      problems += bad.length ? 1 : 0;
    };
    await run('crono');
    // The cube on, half-way through a last layer, with the help showing the case.
    await p.evaluate(() => document.getElementById('cubeSim').click());
    await p.waitForFunction(() => window.Fridrich.cube().on);
    await p.evaluate(() => window.Fridrich.cube().link.turn("z2 R U R' U R U2 R' z2"));
    await p.waitForTimeout(100);
    await run('crono + cube');
    // A whole solve: the analysis and the reconstruction, also opened in the history.
    await p.evaluate(() => window.Fridrich.cube().link.turn("z2 R U2 R' U' R U' R' z2"));
    await p.evaluate((sol) => {
      const M = window.CubeModel; const link = window.Fridrich.cube().virtualLink(); const out = [];
      link.events$.subscribe((e) => { if (e.type === 'MOVE') out.push(e.move); });
      link.turn(`z2 ${M.invertAlg(sol.join(' '))} z2`);
      window.Fridrich._.setScramble(M.simplifyAlg(out.join(' ')));
    }, SOLVE);
    await p.evaluate((x) => window.Fridrich.cube().link.turn(x), await p.evaluate(() => window.Fridrich.scramble()));
    await p.evaluate(() => window.Fridrich.cube().link.turn('z2'));
    for (const a of SOLVE) await p.evaluate((x) => window.Fridrich.cube().link.play([x], 20), a);
    await p.waitForFunction(() => document.querySelector('.fr-an-box'), null, { timeout: 15000 });
    await p.evaluate(() => window.Fridrich.cube().link.turn('z2'));
    await p.evaluate(() => { document.querySelector('.fr-recon-box').open = true; document.querySelector('#history [data-rc]').click(); });
    await run('crono · análisis y reconstrucción');
    for (const v of ['casos', 'ajustes']) {
      await p.evaluate((x) => window.Fridrich.showView(x), v);
      await p.waitForTimeout(150);
      if (v === 'casos') await p.click('[data-case="sune"] [data-try]');
      await run(v);
    }
    await p.evaluate(() => window.Fridrich.showView('entrenar'));
    await p.click('#trModeLook');
    await run('entrenar · reconocer');
    await p.click('[data-answer]');
    await run('entrenar · reconocer (respuesta)');
    await p.click('#trModeHand');
    await p.waitForFunction(() => window.Fridrich._.tr.hand, null, { timeout: 30000 });
    await run('entrenar · cubo normal');
    await p.click('[data-answer]');
    await run('entrenar · cubo normal (respuesta)');
    await p.click('#trModeCube');
    await p.waitForFunction(() => window.Fridrich._.tr.follow || window.Fridrich._.tr.err, null, { timeout: 30000 });
    await run('entrenar · con el cubo');
    // With a history: Progreso and «Qué entrenar hoy».
    await p.evaluate((d) => {
      Object.entries({ 'cfop:times:v1': d.times, 'cfop:trlog:v1': d.trlog, 'cfop:train:v1': d.train, 'cfop:crosstr:v1': d.crossTr, 'cfop:learn:v1': d.learn }).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
    }, seed(Date.now()));
    await p.goto(`${SITE}/fridrich?cubo=virtual#crono`);
    await p.waitForFunction(() => window.Fridrich && window.Fridrich.scramble(), null, { timeout: 30000 });
    // A record-breaking solve: the pace against the average and the celebration.
    await p.evaluate(() => document.getElementById('cubeSim').click());
    await p.waitForFunction(() => window.Fridrich.cube().on);
    await p.evaluate((sol) => {
      const M = window.CubeModel; const link = window.Fridrich.cube().virtualLink(); const out = [];
      link.events$.subscribe((e) => { if (e.type === 'MOVE') out.push(e.move); });
      link.turn(`z2 ${M.invertAlg(sol.join(' '))} z2`);
      window.Fridrich._.setScramble(M.simplifyAlg(out.join(' ')));
    }, SOLVE);
    await p.evaluate((x) => window.Fridrich.cube().link.turn(x), await p.evaluate(() => window.Fridrich.scramble()));
    await p.evaluate(() => window.Fridrich.cube().link.turn('z2'));
    for (const a of SOLVE) await p.evaluate((x) => window.Fridrich.cube().link.play([x], 20), a);
    await p.waitForFunction(() => !document.getElementById('pbBanner').hidden, null, { timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(3900);   // the confetti gone
    await run('crono · récord y ritmo');
    await p.evaluate(() => window.Fridrich.showView('progreso'));
    await p.waitForFunction(() => document.querySelector('.fr-prog-lead'), null, { timeout: 30000 });
    await run('progreso');
    await p.evaluate(() => window.Fridrich.showView('entrenar'));
    await p.waitForTimeout(200);
    await run('entrenar · qué entrenar hoy');
    // The ranking: the start, a league, a record's detail.
    await p.evaluate(() => { localStorage.setItem('op3bld:name:v1', JSON.stringify('Aco')); window.Fridrich.showView('ranking'); });
    await p.waitForFunction(() => document.getElementById('rkCreate'), null, { timeout: 10000 });
    await run('ranking · empezar');
    await p.fill('#rkLeague', 'Los del piso');
    await p.click('#rkCreate button');
    await p.waitForFunction(() => document.querySelector('.rk-table'), null, { timeout: 10000 });
    await p.click('[data-rk-open]');
    await run('ranking · liga y detalle');
    await ctx.close();
  }
  console.log(`${problems} problems`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
