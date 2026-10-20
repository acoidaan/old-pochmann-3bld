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
    // «Practicar» following the cube, with the memo of the scramble written in.
    await p.evaluate(() => {
      const O = window.OP3;
      const toks = O.cube.simMemo(O.guideApi.start());
      O.loadPractice(O.scramble(), toks.filter((t) => t.kind === 'edge').map((t) => t.L).join(''), toks.filter((t) => t.kind === 'corner').map((t) => t.L).join(''));
    });
    await p.waitForTimeout(50);
    const ov = await p.evaluate(() => (document.getElementById('practiceCube').hidden ? 'hidden' : '') + (document.documentElement.scrollWidth > window.innerWidth ? ' overflow' : ''));
    if (ov) { console.log(`${w}${scheme} practice: ${ov}`); problems++; }
    await run('practice');
    await p.click('#guideOpen');
    await run('guide');
    await ctx.close();
  }
  console.log(`${problems} problems`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
