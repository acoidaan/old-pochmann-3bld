// The smart cube between sections: with it connected, a link to another section opens it over the page and
// lends it the same connection (no reconnecting), turns reach the section on screen and not the one asleep
// underneath, the address bar and «atrás» follow, coming back wakes the first page, disconnecting from the
// section on screen makes it the page, and without a cube links just navigate.
const { chromium } = require('playwright');
const { SITE } = require('../env');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${SITE}/fridrich?cubo=virtual#crono`);
  await p.waitForFunction(() => window.Fridrich && window.SmartCube);
  await p.click('#cubeSim');
  await p.waitForFunction(() => window.Fridrich.cube().on);
  const frame = () => p.frames().find((f) => f !== p.mainFrame());
  await p.evaluate(() => window.Fridrich._.setScramble('R U F'));
  const path = () => p.evaluate(() => location.pathname);

  // ---- To principiante: in a frame, with the same connection ----
  await p.click('a[href="principiante"]');
  await p.waitForFunction(() => {
    const f = document.querySelector('.sc-frame');
    const w = f && f.contentWindow;
    return w && w.Principiante && w.Principiante.cube().on;
  }, null, { timeout: 10000 });
  let s = await p.evaluate(() => {
    const w = document.querySelector('.sc-frame').contentWindow;
    return {
      same: w.Principiante.cube().link === window.Fridrich.cube().link,
      path: location.pathname,
      hosting: document.documentElement.classList.contains('sc-hosting'),
    };
  });
  check('cube connected + link to principiante → opens over the page with the same connection', s.same && s.hosting && s.path === '/principiante', JSON.stringify(s));
  const before = await p.evaluate(() => window.Fridrich._.follow() && window.Fridrich._.follow().pos);
  await p.evaluate(() => window.Fridrich.cube().link.turn('R U'));
  await p.waitForTimeout(100);
  s = await p.evaluate(() => {
    const w = document.querySelector('.sc-frame').contentWindow;
    const M = window.CubeModel;
    const want = M.apply(M.solved(), 'R U').join(',');
    return { frame: w.Principiante.cube().state.join(',') === want, below: window.Fridrich.cube().state.join(',') === want, pos: window.Fridrich._.follow() && window.Fridrich._.follow().pos };
  });
  check('turns reach the section on screen; the page below keeps the state but sleeps', s.frame && s.below && before === 0 && s.pos === 0, JSON.stringify(s));

  // ---- From the frame to 3BLD, then back to Fridrich ----
  await frame().click('a[href="./"]');
  await p.waitForFunction(() => {
    const w = document.querySelector('.sc-frame') && document.querySelector('.sc-frame').contentWindow;
    return w && w.OP3 && w.OP3.cube && w.OP3.cube.status === 'on';
  }, null, { timeout: 10000 });
  check('a link inside the frame (to 3BLD) → still in the frame, still connected', await path() === '/' && await p.evaluate(() => document.querySelector('.sc-frame').contentWindow.OP3.cube.link === window.Fridrich.cube().link));
  await frame().click('a[href="fridrich"]');
  await p.waitForFunction(() => !document.querySelector('.sc-frame'), null, { timeout: 5000 }).catch(() => {});
  s = await p.evaluate(() => ({ frame: !!document.querySelector('.sc-frame'), path: location.pathname, on: window.Fridrich.cube().on, hosting: document.documentElement.classList.contains('sc-hosting'), pos: window.Fridrich._.follow().pos }));
  check('back to Fridrich → the frame goes, the page wakes where the cube is (2 turns of the scramble), still connected', !s.frame && !s.hosting && s.path === '/fridrich' && s.on && s.pos === 2, JSON.stringify(s));

  // ---- «Atrás» goes back to the section before ----
  await p.goBack();
  await p.waitForFunction(() => {
    const w = document.querySelector('.sc-frame') && document.querySelector('.sc-frame').contentWindow;
    return w && w.OP3 && w.OP3.cube && w.OP3.cube.status === 'on';
  }, null, { timeout: 10000 }).catch(() => {});
  check('«atrás» → 3BLD again, in the frame', await path() === '/' && await p.evaluate(() => !!document.querySelector('.sc-frame')));

  // ---- Disconnecting in the frame: that section becomes the page ----
  await frame().evaluate(() => document.getElementById('cubeOff').click());   // its bar is in «Cronómetro»
  await p.waitForFunction(() => window.OP3 && !document.querySelector('.sc-frame'), null, { timeout: 10000 }).catch(() => {});
  s = await p.evaluate(() => ({ path: location.pathname, op3: !!window.OP3, frame: !!document.querySelector('.sc-frame'), status: window.OP3 && window.OP3.cube.status }));
  check('«Desconectar» in the frame → 3BLD becomes the page, disconnected', s.path === '/' && s.op3 && !s.frame && s.status === 'off', JSON.stringify(s));

  // ---- Without a cube, a link just navigates ----
  await Promise.all([p.waitForNavigation(), p.click('a[href="fridrich"]')]);
  await p.waitForFunction(() => window.Fridrich);
  check('no cube connected → a link navigates as always', await path() === '/fridrich' && await p.evaluate(() => !document.querySelector('.sc-frame')));
  await ctx.close();

  console.log(results.join('\n'));
  console.log('page errors:', errs.length ? errs : 'none');
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.log(results.join('\n')); console.error(e); console.log('1 failed of 1'); process.exit(1); });
