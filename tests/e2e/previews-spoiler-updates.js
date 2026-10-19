// New in this round: link preview tags, short reto links, the Entrenar spoiler, the screen lock while
// timing, and the "new version" bar driven by a real service worker update.
const { chromium } = require('playwright');
const fs = require('fs');
const { SITE, SHOTS, SW_FILE } = require('../env');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// navigator.wakeLock stand-in that counts held locks and lets the test drop them like a hidden tab would.
const fakeWakeLock = () => {
  const held = new Set();
  window.__wl = { requests: 0, held, drop() { [...held].forEach((s) => s.__drop()); } };
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: {
      request(type) {
        window.__wl.requests++;
        const listeners = [];
        const s = {
          type, released: false,
          addEventListener(ev, fn) { if (ev === 'release') listeners.push(fn); },
          release() { if (!s.released) { s.released = true; held.delete(s); listeners.forEach((f) => f()); } return Promise.resolve(); },
          __drop() { s.release(); },
        };
        held.add(s);
        return Promise.resolve(s);
      },
    },
  });
};

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  fs.mkdirSync(SHOTS, { recursive: true });
  const swOriginal = fs.readFileSync(SW_FILE, 'utf8');
  try {
    // ---------- 1. Link preview tags ----------
    const html = await (await fetch(`${SITE}/`)).text();
    const build = (html.match(/name=.?op3-build.? content=.?([0-9a-f]{10})/) || [])[1];
    check('page carries its build id', !!build && swOriginal.includes(`op3bld-${build}`), build);
    check('og:image + large card', /og:image.? content=.?https:\/\/old-pochmann-3bld\.vercel\.app\/api\/og\?v=1/.test(html) && /twitter:card.? content=.?summary_large_image/.test(html));

    // ---------- 2. Spoiler in Entrenar ----------
    for (const [w, h, scheme] of [[1280, 900, 'light'], [390, 844, 'dark']]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
      await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errs.push(`spoiler ${w}: ${e.message}`));
      await p.goto(`${SITE}/#entrenar`);
      await p.waitForSelector('#trSpoil');
      const before = await p.evaluate(() => ({ hidden: document.getElementById('trCube').hidden, exp: document.getElementById('trSpoil').getAttribute('aria-expanded') }));
      check(`${w}: spoiler starts hidden`, before.hidden && before.exp === 'false');
      await p.click('#trSpoil');
      const open = await p.evaluate(() => {
        const L = document.getElementById('trLetter').textContent;
        const cube = document.getElementById('trCube');
        return {
          L, hidden: cube.hidden, exp: document.getElementById('trSpoil').getAttribute('aria-expanded'),
          cells: cube.querySelectorAll('.cell').length,
          tgt: [...cube.querySelectorAll('.badge.tgt')].map((b) => b.textContent),
          buf: [...cube.querySelectorAll('.badge.buf')].map((b) => b.textContent),
          labs: cube.querySelectorAll('.lab').length,
          swap: cube.querySelectorAll('.cell.swap').length,
          legend: document.getElementById('trLegend').textContent,
          btn: document.getElementById('trSpoilText').textContent,
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
      });
      check(`${w}: spoiler opens with the asked letter marked`, !open.hidden && open.exp === 'true' && open.cells === 54 && open.tgt.length === 1 && open.tgt[0] === open.L,
        JSON.stringify({ L: open.L, tgt: open.tgt, buf: open.buf, labs: open.labs, swap: open.swap }));
      check(`${w}: every edge letter is shown`, open.labs + open.tgt.length + open.buf.length === 24 && open.swap === 1 && open.legend.includes(`(${open.L})`), `${open.labs} labels`);
      check(`${w}: no sideways scroll with the cube open`, !open.overflow);
      await p.screenshot({ path: `${SHOTS}/spoiler-${w}-${scheme}.png`, fullPage: false });
      // Next card hides it again.
      await p.click('#trSkip');
      await p.click('#trSubmit');
      const next = await p.evaluate(() => ({ hidden: document.getElementById('trCube').hidden, btn: document.getElementById('trSpoilText').textContent }));
      check(`${w}: next letter hides the spoiler`, next.hidden && next.btn === 'Spoiler: ver el cubo', next.btn);
      // Corners.
      await p.click('#trCorner');
      await p.click('#trSpoil');
      const corner = await p.evaluate(() => {
        const cube = document.getElementById('trCube');
        return { L: document.getElementById('trLetter').textContent, tgt: [...cube.querySelectorAll('.badge.tgt')].map((b) => b.textContent), all: cube.querySelectorAll('.lab').length + cube.querySelectorAll('.badge').length };
      });
      check(`${w}: corners spoiler`, corner.tgt[0] === corner.L && corner.all === 24, JSON.stringify(corner));
      if (w === 390) await p.screenshot({ path: `${SHOTS}/spoiler-${w}-${scheme}-corner.png`, fullPage: false });
      await ctx.close();
    }

    // ---------- 3. Screen stays on while timing ----------
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
      await ctx.addInitScript(fakeWakeLock);
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errs.push(`wakelock: ${e.message}`));
      await p.goto(`${SITE}/#crono`);
      await p.waitForSelector('#clock');
      const held = () => p.evaluate(() => window.__wl.held.size);
      check('no lock before the attempt', (await held()) === 0);
      await p.keyboard.press('Space');
      await wait(100);
      check('lock taken when memo starts', (await held()) === 1);
      // The browser drops it when the app is hidden; on return it is taken again.
      await p.evaluate(() => {
        window.__wl.drop();
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      await wait(100);
      check('lock taken again after coming back', (await held()) === 1, String(await p.evaluate(() => window.__wl.requests)));
      await p.keyboard.press('Space');
      await p.keyboard.press('Space');
      await wait(100);
      check('still on while choosing the verdict', (await held()) === 1);
      await p.click('#markOk');
      await wait(100);
      check('released once the attempt is saved', (await held()) === 0);
      await p.keyboard.press('Space');
      await wait(100);
      await p.keyboard.press('Escape');
      await wait(100);
      check('released when the attempt is cancelled', (await held()) === 0);
      await ctx.close();
    }

    // ---------- 4. New version bar (real service worker) ----------
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errs.push(`update: ${e.message}`));
      await p.goto(`${SITE}/#crono`);
      await p.evaluate(() => navigator.serviceWorker.ready);
      await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
      await wait(800);
      check('first install shows no update bar', await p.evaluate(() => document.getElementById('updateBar').hidden));
      // Mid-attempt deploy: wait for the attempt to end.
      await p.keyboard.press('Space');
      fs.writeFileSync(SW_FILE, swOriginal.replace(/op3bld-[0-9a-f]{10}/, 'op3bld-ffffffffff'));
      await p.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
      await p.waitForFunction(() => caches.keys().then((k) => k.includes('op3bld-ffffffffff') && k.length === 1), null, { timeout: 15000 });
      await wait(800);
      check('no bar in the middle of an attempt', await p.evaluate(() => document.getElementById('updateBar').hidden));
      await p.keyboard.press('Space');
      await p.keyboard.press('Space');
      await p.click('#markOk');
      await p.waitForFunction(() => !document.getElementById('updateBar').hidden, null, { timeout: 5000 }).catch(() => {});
      const bar = await p.evaluate(() => ({ hidden: document.getElementById('updateBar').hidden, text: document.getElementById('updateBar').textContent.replace(/\s+/g, ' ').trim() }));
      check('bar appears once the attempt is saved', !bar.hidden, bar.text);
      await p.screenshot({ path: `${SHOTS}/update-bar-1280.png` });
      await p.click('#updateGo');
      await p.waitForLoadState('load');
      await wait(800);
      check('after reloading, no bar', await p.evaluate(() => document.getElementById('updateBar').hidden));
      // Dismiss path on a second open tab.
      fs.writeFileSync(SW_FILE, swOriginal.replace(/op3bld-[0-9a-f]{10}/, 'op3bld-eeeeeeeeee'));
      const p2 = await ctx.newPage();
      await p2.setViewportSize({ width: 390, height: 844 });
      await p2.goto(`${SITE}/#practicar`);
      await wait(500);
      await p2.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
      await p2.waitForFunction(() => !document.getElementById('updateBar').hidden, null, { timeout: 15000 }).catch(() => {});
      check('a tab left open also gets the bar', await p2.evaluate(() => !document.getElementById('updateBar').hidden));
      await p2.screenshot({ path: `${SHOTS}/update-bar-390.png` });
      await p2.click('#updateLater');
      check('the × closes it', await p2.evaluate(() => document.getElementById('updateBar').hidden));
      await ctx.close();
    }

    // ---------- 5. Reto links are short ----------
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
      await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
      const p = await ctx.newPage();
      p.on('pageerror', (e) => errs.push(`reto: ${e.message}`));
      await p.goto(`${SITE}/#retos`);
      await p.evaluate(() => { delete navigator.share; window.OP3.requestScramble = () => Promise.resolve("D2 F' U2 B2 L2 F U2 R2 F' D2 F2 R' D' B' L' R2 U L D2 F' R2 U'"); });
      await p.waitForSelector('#retoName');
      await p.fill('#retoName', 'Aco');
      await p.click('#retoCreate');
      await wait(1500);
      const link = await p.evaluate(() => navigator.clipboard.readText());
      check('shared reto link is /r/<id>', /^http:\/\/localhost:879[0-9]\/r\/[a-z0-9]{8}$/.test(link), link);
      const p2 = await ctx.newPage();
      await p2.goto(link);
      await p2.waitForSelector('#retoCard h2', { timeout: 10000 }).catch(() => {});
      const h2 = await p2.evaluate(() => (document.querySelector('#retoCard h2') || {}).textContent || '');
      check('opening it lands in the reto', /Reto de Aco/.test(h2), p2.url() + ' · ' + h2);
      await ctx.close();
    }
  } finally {
    fs.writeFileSync(SW_FILE, swOriginal);
  }
  console.log(results.join('\n'));
  console.log('page errors:', errs.length ? errs : 'none');
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
