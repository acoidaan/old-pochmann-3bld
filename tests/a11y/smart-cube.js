// axe + overflow on the timer with the virtual cube connected (follower, DNF report, virtual cube box) and the MAC dialog.
const { chromium } = require('playwright');
const fs = require('fs');
const { SITE, SHOTS } = require('../env');
const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
(async () => {
  const browser = await chromium.launch();
  const out = [];
  for (const [w, h, scheme] of [[390, 844, 'light'], [390, 844, 'dark'], [1280, 900, 'light'], [1280, 900, 'dark']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const p = await ctx.newPage();
    p.on('pageerror', (e) => out.push(`${w}${scheme} pageerror ${e.message}`));
    await p.goto(`${SITE}/?cubo=virtual#crono`);
    await p.click('#cubeSim');
    await p.waitForFunction(() => window.OP3.cube.status === 'on');
    await p.evaluate(() => window.OP3.cube.link.turn("R U"));   // off track: shows «Deshaz»
    const run = async (label) => {
      await p.evaluate(axeSrc);
      const v = await p.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`));
      const ov = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      out.push(`${w}${scheme} ${label}: axe ${v.length ? v.join(' | ') : 'clean'}${ov ? ' | OVERFLOW' : ''}`);
    };
    await run('follower');
    // DNF report
    await p.click('#cubeSync');
    await p.waitForTimeout(100);
    await p.evaluate(() => window.OP3.cube.link.turn(window.OP3.scramble()));
    await p.keyboard.press('Space');
    await p.waitForTimeout(50);
    await p.evaluate(() => { const O = window.OP3; const s = O.cube.simSolution(O.cube.link.state(), 2); return O.cube.link.play(s.algs, 400); });
    await p.keyboard.press('Space');
    await p.waitForTimeout(900);
    await run('dnf report');
    await p.click('#markDnf');
    await p.click('#cubeOff');
    // MAC dialog (fake Bluetooth device)
    await p.evaluate(() => {
      const device = { id: 'd', name: 'GAN-x', addEventListener() {}, removeEventListener() {}, gatt: { connect: async () => { throw new Error('x'); } } };
      Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: { requestDevice: async () => device } });
    });
    await p.click('#cubeConnect');
    await p.waitForSelector('#macSheet:not([hidden])', { timeout: 15000 });
    await run('mac dialog');
    await p.screenshot({ path: `${SHOTS}/cube-mac-${w}-${scheme}.png` });
    await ctx.close();
  }
  console.log(out.join('\n'));
  console.log(`${out.filter((l) => !/: axe clean$/.test(l)).length} problems`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
