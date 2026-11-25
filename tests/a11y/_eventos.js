// axe-core and horizontal overflow on the WCA plan's pages: the four event pages (/2x2, /4x4, /pyraminx,
// /square-1) in every view, with times, a round, the notation and «Pruébalo» open and the trainer's solution
// shown, and «Mi plan» with data from every section and a competition in the last four weeks. Run in parts
// (EV_PAGES, set by eventos-1.js and eventos-2.js), each with some of the pages, so they go at once.
const { chromium, devices } = require('playwright');
const { SITE } = require('../env');
const fs = require('fs');
const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
let problems = 0;
function seed() {
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  const now = Date.now();
  const list = (n, base, rd) => Array.from({ length: n }, (_, i) => ({ at: now - (n - i) * 60000, t: base + i * 300, pen: i === 2 ? 2 : i === 6 ? 'dnf' : 0, scr: 'R U', ...(rd && i < 5 ? { rd: now - n * 60000, ri: i } : {}) }));
  ['222', '444', 'pyram', 'sq1'].forEach((ev) => localStorage.setItem(`ev:${ev}:times:v1`, JSON.stringify(list(14, 9000, true))));
  localStorage.setItem('cfop:times:v1', JSON.stringify(Array.from({ length: 12 }, (_, i) => ({ at: now - (12 - i) * 60000, t: 33000 + i * 200, pen: 0, scr: 'R U', ph: [5000, 18000, 6000, 4000] }))));
  localStorage.setItem('op3bld:times:v1', JSON.stringify([{ at: now - 3600000, memo: 100000, exec: 70000, ok: true, scr: "R U F2 L' D B" }]));
  const d = new Date(now + 20 * 86400000);
  localStorage.setItem('plan:v1', JSON.stringify({ comp: { date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, name: 'Open de Prueba', url: 'https://www.worldcubeassociation.org/competitions/Prueba', at: now }, prep: { limits: now }, ticks: {} }));
}
(async () => {
  const b = await chromium.launch();
  const sizes = [['pixel7', { ...devices['Pixel 7'] }, 'dark'], ['iphone14-landscape', { ...devices['iPhone 14 landscape'] }, 'light'], ['1280', { viewport: { width: 1280, height: 900 } }, 'light']];
  const pages = (process.env.EV_PAGES || '2x2,4x4,pyraminx,square-1,plan').split(',');
  for (const page of pages) {
    for (const [label, opts, scheme] of sizes) {
      const ctx = await b.newContext({ ...opts, colorScheme: scheme });
      await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
      await ctx.addInitScript(seed);
      const p = await ctx.newPage();
      await p.goto(`${SITE}/${page}`);
      await p.waitForFunction(() => (window.EvPage && window.EvPage.state().scramble) || (window.PlanPage && document.querySelector('#phases li')), null, { timeout: 30000 });
      const run = async (what) => {
        await p.evaluate(axeSrc);
        const v = await p.evaluate(async () => (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(', ')}`));
        const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        const bad = [...v, ...(over > 0 ? [`overflow ${over}px`] : [])];
        console.log(`${page} ${label} ${scheme} ${what}: ${bad.length ? bad.join(' | ') : 'clean'}`);
        problems += bad.length ? 1 : 0;
      };
      if (page === 'plan') {
        await run('el plan');
        await ctx.close();
        continue;
      }
      await p.evaluate(() => window.EvPage.showView('aprender'));
      await p.click('#notationBox summary');
      const more = await p.$('.ev-next-cases summary');
      if (more) await more.click();
      await run('aprender');
      await p.click('.ev-case [data-try]');
      await p.click('#tryNext');
      await run('aprender · pruébalo');
      await p.click('#tryClose');
      await p.evaluate(() => window.EvPage.showView('crono'));
      await p.click('#modeRound');
      await p.click('#scrPicBox summary').catch(() => {});
      await run('crono · ronda');
      await p.evaluate(() => window.EvPage.showView('entrenar'));
      await p.click('#trShow');
      await run('entrenar · la solución');
      await p.evaluate(() => window.EvPage.showView('progreso'));
      await run('progreso');
      await p.evaluate(() => window.EvPage.showView('ajustes'));
      await run('ajustes');
      await ctx.close();
    }
  }
  await b.close();
  console.log(`${problems} problems`);
})().catch((e) => { console.error(e); process.exit(1); });
