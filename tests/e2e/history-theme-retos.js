// Full history with filter, theme selector, spoiler shortcut, and removing retos (also across synced devices).
const { chromium } = require('playwright');
const { SITE, SHOTS } = require('../env');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const newPage = async (w, h, scheme) => {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme || 'light' });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    return { ctx, p };
  };

  // ---------- History ----------
  {
    const { ctx, p } = await newPage(1280, 900);
    await p.goto(`${SITE}/#crono`);
    await p.evaluate(() => {
      const t0 = Date.now() - 40 * 86400e3;
      const times = Array.from({ length: 27 }, (_, i) => ({ at: t0 + i * 3600e3, memo: 60000 + i * 1000, exec: 90000, ok: i % 3 !== 0, scr: `R U${i}` }));
      localStorage.setItem('op3bld:times:v1', JSON.stringify(times));
    });
    await p.reload();
    await p.waitForSelector('#history table');
    const rows = () => p.evaluate(() => [...document.querySelectorAll('#history tbody tr')].map((r) => r.cells[0].textContent));
    const first = await rows();
    check('history shows the 10 newest first', first.length === 10 && first[0] === '27' && first[9] === '18', first.join(','));
    check('count and «Ver más»', await p.evaluate(() => document.getElementById('histCount').textContent === '10 de 27' && !document.getElementById('histMore').hidden && document.getElementById('histMore').textContent.includes('17')));
    await p.click('#histMore');
    check('«Ver más» adds 20', (await rows()).length === 27 && await p.evaluate(() => document.getElementById('histMore').hidden));
    await p.click('[data-hf=dnf]');
    const dnf = await p.evaluate(() => [...document.querySelectorAll('#history tbody tr')].map((r) => r.cells[4].textContent));
    check('DNF filter', dnf.length === 9 && dnf.every((x) => x === 'DNF'), `${dnf.length}`);
    await p.click('[data-hf=ok]');
    const ok = await p.evaluate(() => ({ n: document.querySelectorAll('#history tbody tr').length, count: document.getElementById('histCount').textContent }));
    check('Resueltos filter pages again from 10', ok.n === 10 && ok.count === '10 de 18', JSON.stringify(ok));
    // Deleting from a filtered view deletes the right attempt.
    const victim = await p.evaluate(() => document.querySelector('#history tbody tr').cells[0].textContent);
    await p.click('#history tbody tr:first-child [data-del]');
    const after = await p.evaluate(() => JSON.parse(localStorage.getItem('op3bld:times:v1')));
    check('delete in filtered view removes that attempt', after.length === 26 && !after.some((t) => t.scr === `R U${Number(victim) - 1}`), victim);
    await p.screenshot({ path: `${SHOTS}/history-1280.png`, fullPage: false });
    await ctx.close();
  }

  // ---------- Theme ----------
  {
    const { ctx, p } = await newPage(390, 844, 'light');
    await p.goto(`${SITE}/#ajustes`);
    await p.waitForSelector('[data-theme-set]');
    const bg = () => p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const light = await bg();
    await p.click('[data-theme-set=dark]');
    const dark = await bg();
    check('Oscuro switches a light-system device to dark', dark !== light && await p.evaluate(() => document.documentElement.dataset.theme === 'dark'), `${light} → ${dark}`);
    check('browser bar colour follows', await p.evaluate(() => [...document.querySelectorAll('meta[name=theme-color]')].every((m) => m.content === '#0F1319')));
    // Applied before the app scripts run (no flash).
    await p.addInitScript(() => {
      document.addEventListener('readystatechange', () => {
        if (document.readyState === 'interactive' && !window.__themeAt) window.__themeAt = document.documentElement.getAttribute('data-theme');
      });
    });
    await p.reload();
    await p.waitForSelector('[data-theme-set]');
    check('remembered and applied from <head>', await p.evaluate(() => window.__themeAt === 'dark' && document.querySelector('[data-theme-set=dark]').getAttribute('aria-pressed') === 'true'));
    await p.screenshot({ path: `${SHOTS}/theme-dark-on-light-390.png` });
    await p.click('[data-theme-set=auto]');
    check('Automático goes back to the system', !(await p.evaluate(() => document.documentElement.hasAttribute('data-theme'))) && (await bg()) === light && await p.evaluate(() => localStorage.getItem('op3bld:theme:v1') === null));
    await ctx.close();
    const d = await newPage(1280, 900, 'dark');
    await d.p.goto(`${SITE}/#ajustes`);
    await d.p.waitForSelector('[data-theme-set]');
    await d.p.click('[data-theme-set=light]');
    check('Claro on a dark-system device', await d.p.evaluate(() => getComputedStyle(document.body).backgroundColor === 'rgb(236, 239, 243)'));
    await d.ctx.close();
  }

  // ---------- Spoiler shortcut ----------
  {
    const { ctx, p } = await newPage(1280, 900);
    await p.goto(`${SITE}/#entrenar`);
    await p.waitForSelector('#trInput');
    await p.focus('#trInput');
    await p.keyboard.type("l D");
    await p.keyboard.press('Shift+Slash');
    await p.keyboard.type('?');
    const s1 = await p.evaluate(() => ({ open: !document.getElementById('trCube').hidden, val: document.getElementById('trInput').value }));
    check('«?» while typing toggles and is not typed', s1.val === 'l D', JSON.stringify(s1));
    await p.evaluate(() => document.getElementById('trInput').blur());
    const before = await p.evaluate(() => !document.getElementById('trCube').hidden);
    await p.keyboard.type('?');
    const afterKey = await p.evaluate(() => !document.getElementById('trCube').hidden);
    check('«?» outside the box toggles too', before !== afterKey);
    check('hint shown on desktop', await p.evaluate(() => getComputedStyle(document.querySelector('.kbd-hint')).display !== 'none'));
    await ctx.close();
    const m = await newPage(390, 844);
    await m.p.goto(`${SITE}/#entrenar`);
    await m.p.waitForSelector('#trSpoil');
    check('hint hidden on phones', await m.p.evaluate(() => getComputedStyle(document.querySelector('.kbd-hint')).display === 'none'));
    await m.ctx.close();
  }

  // ---------- Removing retos, across two synced devices ----------
  {
    const A = await newPage(1280, 900);
    const B = await newPage(390, 844);
    await A.p.goto(`${SITE}/#ajustes`);
    await A.p.evaluate(() => {
      const now = Date.now();
      localStorage.setItem('op3bld:retos:v1', JSON.stringify([
        { id: 'aaaa2222', by: 'Carla', kind: 'full', at: now - 5000 },
        { id: 'bbbb3333', by: 'Dani', kind: 'edges', at: now - 4000, done: true },
      ]));
    });
    await A.p.reload();
    await A.p.waitForSelector('#syncOn');
    await A.p.click('#syncOn');
    await A.p.waitForSelector('.code-box');
    await wait(1500);
    const code = await A.p.evaluate(() => document.querySelector('.code-box').textContent);
    await B.p.goto(`${SITE}/#ajustes`);
    await B.p.waitForSelector('#syncCode');
    await B.p.fill('#syncCode', code);
    await B.p.click('#syncJoin');
    await wait(2000);
    const bIds = () => B.p.evaluate(() => (JSON.parse(localStorage.getItem('op3bld:retos:v1')) || []).map((r) => r.id).sort().join(','));
    check('second device gets both retos', (await bIds()) === 'aaaa2222,bbbb3333', await bIds());

    await A.p.evaluate(() => window.OP3.showView('retos'));
    await A.p.waitForSelector('[data-forget=aaaa2222]');
    await A.p.click('[data-forget=aaaa2222]');
    const armed = await A.p.evaluate(() => ({ t: document.querySelector('[data-forget=aaaa2222]').textContent, n: document.querySelectorAll('.reto-row').length }));
    check('first tap only asks', armed.t === '¿Quitar?' && armed.n === 2, JSON.stringify(armed));
    await A.p.screenshot({ path: `${SHOTS}/retos-armed-1280.png` });
    await A.p.click('[data-forget=aaaa2222]');
    const left = await A.p.evaluate(() => [...document.querySelectorAll('.reto-row [data-open]')].map((b) => b.dataset.open).join(','));
    check('second tap removes it', left === 'bbbb3333', left);
    await A.p.evaluate(() => window.OP3.showView('ajustes'));
    await A.p.click('#syncNow');
    await wait(1500);
    await B.p.click('#syncNow');
    await wait(1500);
    check('removal reaches the other device', (await bIds()) === 'bbbb3333', await bIds());
    // And B syncing back does not resurrect it on A.
    await A.p.click('#syncNow');
    await wait(1500);
    check('and does not come back', await A.p.evaluate(() => (JSON.parse(localStorage.getItem('op3bld:retos:v1')) || []).map((r) => r.id).join(',')) === 'bbbb3333');
    await A.ctx.close();
    await B.ctx.close();
  }

  console.log(results.join('\n'));
  console.log('page errors:', errs.length ? errs : 'none');
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
