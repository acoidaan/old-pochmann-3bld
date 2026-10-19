// Competition mode: only the clock, full screen; tap anywhere / Space; F and Esc; back gesture; screen kept on.
const { chromium, devices } = require('playwright');
const { SITE, SHOTS } = require('../env');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fakeWakeLock = () => {
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
  const state = (p) => p.evaluate(() => {
    const vis = (id) => { const el = document.getElementById(id); if (!el) return false; const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
    const panel = document.querySelector('.view[data-view=crono] > .panel').getBoundingClientRect();
    return {
      focus: document.body.classList.contains('focus'),
      full: panel.left === 0 && panel.top === 0 && Math.round(panel.width) === innerWidth && Math.round(panel.height) === innerHeight,
      phase: document.getElementById('clockPhase').textContent,
      top: vis('focusTop'), bottom: vis('focusBottom'), verdict: vis('verdict'), time: vis('clockTime'),
      tabsOnTop: (() => { const t = document.querySelector('.tabs'); const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!(el && el.closest('.tabs')); })(),
      scr: document.getElementById('focusScr').textContent,
      stats: document.getElementById('focusStats').textContent,
      held: window.__wl ? window.__wl.held.size : -1,
      overflowX: document.documentElement.scrollWidth > innerWidth,
    };
  });

  // ---------- Desktop ----------
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.addInitScript(fakeWakeLock);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push('desktop: ' + e.message));
    await p.goto(`${SITE}/#crono`);
    await p.waitForSelector('#focusOpen');
    const scr = await p.evaluate(() => document.getElementById('scr').value.trim());
    await p.click('#focusOpen');
    let s = await state(p);
    check('button opens it full screen', s.focus && s.full && !s.tabsOnTop, JSON.stringify({ full: s.full, tabs: s.tabsOnTop }));
    check('shows the scramble and the clock', s.top && s.time && s.scr === scr && s.bottom, s.scr);
    check('screen kept on while open, even idle', s.held === 1, String(s.held));
    await p.screenshot({ path: `${SHOTS}/focus-1280-idle.png` });
    await p.keyboard.press('Space');
    await wait(150);
    s = await state(p);
    check('Space starts memo and hides everything but the time', s.phase === 'Memorizando' && !s.top && !s.bottom && s.time, JSON.stringify(s));
    await p.screenshot({ path: `${SHOTS}/focus-1280-memo.png` });
    await p.keyboard.press('Space');
    await p.keyboard.press('Space');
    await wait(100);
    s = await state(p);
    check('after stopping: verdict, still nothing else', s.verdict && !s.top, JSON.stringify({ v: s.verdict, top: s.top }));
    await p.click('#markOk');
    await wait(150);
    s = await state(p);
    check('saved: back to idle with today stats', s.top && /Hoy 1 de 1/.test(s.stats) && s.held === 1, s.stats);
    await p.keyboard.press('Escape');
    await wait(100);
    s = await state(p);
    check('Esc leaves when idle', !s.focus && !s.full && s.held === 0, JSON.stringify({ focus: s.focus, held: s.held }));
    await p.keyboard.press('f');
    s = await state(p);
    check('F opens it', s.focus);
    await p.keyboard.press('Space');
    await wait(100);
    await p.keyboard.press('Escape');
    await wait(100);
    s = await state(p);
    check('Esc during an attempt cancels, stays in the mode', s.focus && s.phase === 'Intento cancelado', s.phase);
    await p.click('#focusExit');
    check('Salir leaves', !(await state(p)).focus);
    await p.keyboard.press('f');
    await p.evaluate(() => window.OP3.showView('practicar'));
    s = await state(p);
    check('changing section closes it', !s.focus);
    await ctx.close();
  }

  // ---------- Phone (touch) ----------
  {
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.addInitScript(fakeWakeLock);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push('phone: ' + e.message));
    await p.goto(`${SITE}/#practicar`);
    await p.goto(`${SITE}/#crono`);
    await p.waitForSelector('#focusOpen');
    await p.tap('#focusOpen');
    let s = await state(p);
    check('phone: full screen, no sideways scroll', s.focus && s.full && !s.overflowX && !s.tabsOnTop);
    check('phone: touch hint', await p.evaluate(() => getComputedStyle(document.querySelector('.focus-hint .on-touch')).display !== 'none' && getComputedStyle(document.querySelector('.focus-hint .on-keys')).display === 'none'));
    await p.screenshot({ path: `${SHOTS}/focus-390-idle.png` });
    const vw = await p.evaluate(() => [innerWidth, innerHeight]);
    // Tapping the scramble text (top of the screen) also starts: the whole screen is the button.
    const scrBox = await p.evaluate(() => { const r = document.getElementById('focusScr').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    await p.touchscreen.tap(scrBox[0], scrBox[1]);
    await wait(150);
    s = await state(p);
    check('phone: tapping anywhere (even the scramble) starts memo', s.phase === 'Memorizando', s.phase);
    await p.screenshot({ path: `${SHOTS}/focus-390-memo.png` });
    await p.touchscreen.tap(vw[0] / 2, vw[1] * 0.8);
    await wait(100);
    await p.touchscreen.tap(30, 30);
    await wait(150);
    s = await state(p);
    check('phone: two more taps → verdict', s.verdict && /Terminado/.test(s.phase), s.phase);
    await p.screenshot({ path: `${SHOTS}/focus-390-done.png` });
    await p.tap('#markDnf');
    await wait(150);
    s = await state(p);
    check('phone: DNF saved, stats show it', /último DNF/.test(s.stats) && s.focus, s.stats);
    await p.goBack();
    await wait(300);
    s = await state(p);
    check('phone: back gesture leaves the mode, not the app', !s.focus && p.url().startsWith(SITE), p.url());
    // New scramble from inside the mode.
    await p.tap('#focusOpen');
    const before = (await state(p)).scr;
    await p.tap('#focusNew');
    const changed = await p.waitForFunction((b) => document.getElementById('focusScr').textContent !== b && !document.getElementById('focusNew').disabled, before, { timeout: 40000 }).then(() => true, () => false);
    s = await state(p);
    check('phone: «Nuevo scramble» works inside the mode', changed && s.focus, s.scr);
    await ctx.close();
  }

  console.log(results.join('\n'));
  console.log('page errors:', errs.length ? errs : 'none');
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
