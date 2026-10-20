// axe-core and horizontal overflow on «Fridrich reducido»: every view, phone and desktop, light and dark,
// with the cube following a solve and both trainers.
const { chromium, devices } = require('playwright');
const { SITE } = require('../env');
const fs = require('fs');
const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
let problems = 0;
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
    await ctx.close();
  }
  console.log(`${problems} problems`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
