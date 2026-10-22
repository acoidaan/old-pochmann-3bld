// axe-core and horizontal overflow on «Aprende a resolver el cubo» (/principiante): every view, phone and
// desktop, light and dark; the basics open, the solution of a scramble, the live help in the middle of a
// solve, a finished solve with its steps, the trainer with a normal cube and with the smart cube, and
// Progreso with a history.
const { chromium, devices } = require('playwright');
const { SITE } = require('../env');
const fs = require('fs');
const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
let problems = 0;
(async () => {
  const b = await chromium.launch();
  const sizes = [['pixel7', { ...devices['Pixel 7'] }, 'light'], ['pixel7', { ...devices['Pixel 7'] }, 'dark'], ['1280', { viewport: { width: 1280, height: 900 } }, 'dark'], ['1280', { viewport: { width: 1280, height: 900 } }, 'light']];
  const doNext = (p) => p.evaluate(() => {
    const c = window.Principiante.cube();
    const pl = window.Lbl.next(c.state);
    if (pl.kind === 'solved') return 'solved';
    const back = pl.view ? window.CubeModel.invertAlg(pl.view) : '';
    c.link.turn(['z2', pl.view, ...pl.hand, back, 'z2'].filter(Boolean).join(' '));
    return pl.kind;
  });
  for (const [label, opts, scheme] of sizes) {
    const ctx = await b.newContext({ ...opts, colorScheme: scheme });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const p = await ctx.newPage();
    await p.goto(`${SITE}/principiante?cubo=virtual#aprender`);
    await p.waitForFunction(() => window.Principiante, null, { timeout: 30000 });
    const run = async (what) => {
      await p.evaluate(axeSrc);
      const v = await p.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`));
      const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      const bad = [...v, ...(over > 0 ? [`overflow ${over}px`] : [])];
      console.log(`${label} ${scheme} ${what}: ${bad.length ? bad.join(' | ') : 'clean'}`);
      problems += bad.length ? 1 : 0;
    };
    await p.click('#basics summary');
    await p.check('[data-known="cross"]');
    await run('aprender');
    await p.evaluate(() => window.Principiante.showView('resolver'));
    await p.waitForFunction(() => window.Principiante.scramble());
    await p.click('#solution summary');
    await p.waitForFunction(() => document.querySelector('.pr-sol'), null, { timeout: 5000 }).catch(() => {});
    await run('resolver · la solución');
    await p.click('#solution summary');
    await p.click('#cubeSim');
    await p.waitForFunction(() => window.Principiante.cube().on);
    await p.evaluate((s) => window.Principiante.cube().link.turn(s), await p.evaluate(() => window.Principiante.scramble()));
    for (let k = 0; k < 9; k++) await doNext(p);
    await run('resolver · ayuda en directo');
    for (let k = 0; k < 60 && (await doNext(p)) !== 'solved'; k++) { /* to the end */ }
    await p.waitForTimeout(150);
    await run('resolver · resuelto, con sus pasos');
    await p.evaluate(() => window.Principiante.showView('entrenar'));
    await p.click('[data-step="3"]');
    await p.waitForFunction(() => ['setup', 'ready', 'error'].includes(window.Principiante._.tr.phase), null, { timeout: 40000 });
    await p.evaluate((s) => window.Principiante.cube().link.turn(s), await p.evaluate(() => window.Principiante._.tr.setup));
    await run('entrenar · con el cubo y ayuda');
    await p.evaluate(() => window.Principiante.showView('progreso'));
    await run('progreso');
    await p.evaluate(() => window.Principiante.showView('ajustes'));
    await run('ajustes');
    // Without the cube: the trainer with a normal cube.
    await p.click('#cubeOff');
    await p.evaluate(() => window.Principiante.showView('entrenar'));
    await p.waitForFunction(() => window.Principiante._.tr.phase === 'hand', null, { timeout: 40000 });
    await p.click('#trBox .pr-solution summary');
    await run('entrenar · cubo normal');
    await ctx.close();
  }
  await b.close();
  console.log(`${problems} problems`);
  process.exit(problems ? 1 : 0);
})();
