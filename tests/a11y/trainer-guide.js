// axe on «Entrenar» answered with the cube and on the guided execution following the cube.
const { chromium } = require('playwright');
const { SITE } = require('../env');
const fs = require('fs');
const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
let problems = 0;
(async () => {
  const b = await chromium.launch();
  for (const [w, h, scheme] of [[390, 844, 'light'], [1280, 900, 'dark']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const p = await ctx.newPage();
    await p.goto(`${SITE}/?cubo=virtual#crono`);
    await p.click('#cubeSim');
    await p.waitForFunction(() => window.OP3.cube.status === 'on');
    await p.evaluate(() => window.OP3.showView('entrenar'));
    await p.evaluate(() => window.OP3.cube.link.turn('R U D'));
    const run = async (label) => { await p.evaluate(axeSrc); const v = await p.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`)); console.log(`${w}${scheme} ${label}: ${v.length ? v.join(' | ') : 'clean'}`); problems += v.length ? 1 : 0; };
    await run('trainer');
    await p.evaluate(() => window.OP3.showView('practicar'));
    await p.click('#guideOpen');
    await run('guide');
    await ctx.close();
  }
  console.log(`${problems} problems`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
