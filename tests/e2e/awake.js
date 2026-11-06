// The screen kept on (awake.js) on the three pages and any view, the «Ajustes» switch turning it off (and on
// again), and it coming back when the page is shown again.
const { chromium, devices } = require('playwright');
const { SITE } = require('../env');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fake = () => {
  const held = new Set();
  window.__wl = { held };
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: {
      request() {
        const ls = [];
        const s = { released: false, addEventListener(e, f) { if (e === 'release') ls.push(f); }, release() { if (!s.released) { s.released = true; held.delete(s); ls.forEach((f) => f()); } return Promise.resolve(); } };
        held.add(s);
        return Promise.resolve(s);
      },
    },
  });
};

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.addInitScript(fake);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  const held = () => p.evaluate(() => !!(window.KeepAwake && window.KeepAwake.held()));
  for (const [path, views] of [['/', ['practicar', 'tabla', 'progreso']], ['/fridrich', ['casos', 'progreso']], ['/principiante', ['aprender', 'progreso']]]) {
    for (const v of views) {
      await p.goto(`${SITE}${path}#${v}`);
      await p.waitForFunction(() => window.KeepAwake);
      await wait(100);
      check(`${path} #${v}: the screen kept on`, await held());
    }
  }
  await p.goto(`${SITE}/#ajustes`);
  await p.waitForFunction(() => window.KeepAwake);
  await wait(100);
  await p.uncheck('#awakeSet');
  check('ajustes: off → let go, and saved', !(await held()) && (await p.evaluate(() => localStorage.getItem('op3bld:awake:v1'))) === '0');
  await p.goto(`${SITE}/fridrich#casos`);
  await p.waitForFunction(() => window.KeepAwake);
  await wait(100);
  check('off: the other pages do not keep it on either, and their switch says so', !(await held()) && !(await p.isChecked('#awakeSet')));
  await p.goto(`${SITE}/fridrich#ajustes`);
  await p.check('#awakeSet');
  check('ajustes: on again → kept on', await held());
  await p.evaluate(() => { [...window.__wl.held].forEach((s) => s.release()); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await wait(100);
  check('back to the page (the browser had let it go) → taken again', await held());
  await ctx.close();

  results.forEach((r) => console.log(r));
  console.log(`page errors: ${errs.length ? JSON.stringify(errs) : 'none'}`);
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.log(`FAIL stopped — ${String(e.message || e).split('\n')[0]}`); console.error(e); process.exit(1); });
