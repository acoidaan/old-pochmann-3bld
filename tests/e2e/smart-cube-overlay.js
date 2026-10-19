// Stream overlay with the smart cube: scramble progress, live cube, turns and letters, checked result, DNF reason.
const { chromium } = require('playwright');
const { SITE, SHOTS } = require('../env');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  for (const layout of ['esquinas', 'derecha']) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const ov = await ctx.newPage();
    await ov.setViewportSize({ width: 1920, height: 1080 });
    ov.on('pageerror', (e) => errs.push('overlay: ' + e.message));
    await ov.goto(`${SITE}/overlay.html?layout=${layout}`);
    const app = await ctx.newPage();
    app.on('pageerror', (e) => errs.push('app: ' + e.message));
    await app.goto(`${SITE}/?cubo=virtual#crono`);
    await app.click('#cubeSim');
    await app.waitForFunction(() => window.OP3.cube.status === 'on');
    const L = `[${layout}] `;
    const o = () => ov.evaluate(() => ({
      tag: !document.getElementById('cubeTag').hidden,
      done: [...document.querySelectorAll('#scrText .mv.done')].length,
      next: [...document.querySelectorAll('#scrText .mv.next')].map((x) => x.textContent + (x.classList.contains('half') ? '½' : '')).join(','),
      hint: document.getElementById('scrHint').hidden ? '' : document.getElementById('scrHint').textContent,
      live: document.getElementById('liveLine').hidden ? '' : document.getElementById('liveLine').innerText,
      pill: document.getElementById('phase').textContent,
      net: [...document.querySelectorAll('#net i')].map((c) => c.className.slice(2)).join(''),
    }));
    const settle = () => wait(350);
    const setScr = (s) => app.evaluate((x) => { const el = document.getElementById('scr'); el.value = x; el.dispatchEvent(new Event('input')); }, s);
    const turn = (a) => app.evaluate((x) => window.OP3.cube.link.turn(x), a);

    await setScr("R2 U F' L D2 B R' U2");
    await settle();
    let s = await o();
    check(L + 'overlay: «cubo en directo» and the first move highlighted', s.tag && s.next === 'R2' && s.done === 0, JSON.stringify(s).slice(0, 160));
    await turn('R');
    await settle();
    s = await o();
    check(L + 'overlay: half of R2', s.next === 'R2½', s.next);
    await turn('R U');
    await settle();
    s = await o();
    check(L + 'overlay: two moves done, next F\'', s.done === 2 && s.next === "F'", `${s.done} ${s.next}`);
    await turn('D');
    await settle();
    s = await o();
    check(L + 'overlay: a wrong turn shows the undo', /Deshaciendo un giro: D'/.test(s.hint) && !s.next, s.hint);
    await turn("D' F' L D2 B R' U2");
    await settle();
    s = await o();
    const appNet = await app.evaluate(() => window.OP3.cube.overlay().net);
    check(L + 'overlay: mixed, and the drawing is the live cube', /✓ Cubo mezclado/.test(s.hint) && s.net === appNet, s.hint);

    // Attempt: turns and letters live.
    const toks = await app.evaluate(() => window.OP3.cube.simMemo(window.OP3.cube.link.state()));
    const algs = await app.evaluate((t) => t.map((x) => window.OP3.tokenAlg(x)), toks);
    await app.keyboard.press('Space');
    await wait(100);
    await app.evaluate((a) => window.OP3.cube.link.play([a], 400), algs[0]);
    await settle();
    s = await o();
    check(L + 'overlay: cards fit during the execution', await ov.evaluate(() => { const st = document.getElementById('stage').getBoundingClientRect(); return [...document.querySelectorAll('.card')].filter((c) => getComputedStyle(c).display !== 'none').every((c) => c.getBoundingClientRect().bottom <= st.bottom + 1); }));
    check(L + 'overlay: during the execution, the first letter and the turns', s.live.includes(toks[0].L || 'paridad') && /\d+ giros/.test(s.live) && /Ejecutando/i.test(s.pill), s.live.replace(/\n/g, ' ').slice(0, 120));
    await ov.screenshot({ path: `${SHOTS}/overlay-${layout}-cube-exec.png` });
    await app.evaluate((a) => window.OP3.cube.link.play(a, 400), algs.slice(1));
    await wait(600);
    s = await o();
    check(L + 'overlay: solved by the cube → «Resuelto» and «lo ha comprobado el cubo»', /Resuelto/i.test(s.pill) && /Lo ha comprobado el cubo/i.test(s.live), `${s.pill} | ${s.live.replace(/\n/g, ' ')}`);

    // DNF with its reason.
    await wait(3000);
    await app.click('#cubeSync');
    await wait(100);
    const scr2 = await app.evaluate(() => window.OP3.randomMoveScramble(18));
    await setScr(scr2);
    await turn(scr2);
    const toks2 = await app.evaluate(() => window.OP3.cube.simMemo(window.OP3.cube.link.state()));
    await app.keyboard.press('Space');
    await wait(100);
    await app.evaluate((t) => { const O = window.OP3; const a = t.map((x) => O.tokenAlg(x)); a[1] = O.cube.flawed(t[1]); return O.cube.link.play(a, 400); }, toks2);
    await app.keyboard.press('Space');
    await app.waitForFunction(() => /no está resuelto/.test(document.getElementById('verdictAsk').textContent), null, { timeout: 3000 }).catch(() => {});
    await app.click('#markDnf');
    await wait(600);
    s = await o();
    check(L + 'overlay: DNF shows where it went wrong', /DNF/i.test(s.pill) && /Fallo en|cambio de ciclo/.test(s.live), `${s.pill} | ${s.live.replace(/\n/g, ' ')}`);
    await ov.screenshot({ path: `${SHOTS}/overlay-${layout}-cube-dnf.png` });
    const fits = await ov.evaluate(() => { const st = document.getElementById('stage').getBoundingClientRect(); return [...document.querySelectorAll('.card')].filter((c) => !c.hidden && getComputedStyle(c).display !== 'none').every((c) => { const r = c.getBoundingClientRect(); return r.bottom <= st.bottom + 1 && r.top >= st.top - 1; }); });
    check(L + 'overlay: every card still fits on screen', fits);
    s = await o();
    check(L + 'overlay: after the DNF the scramble is not «mezclado» any more', !/✓ Cubo mezclado/.test(s.hint) && s.done === 0, s.hint);
    // Disconnected: back to the plain scramble drawing.
    await app.click('#cubeOff');
    await settle();
    s = await o();
    check(L + 'overlay: cube off → no «en directo», no progress marks', !s.tag && s.done === 0 && !s.next, JSON.stringify({ tag: s.tag, done: s.done }));
    await ctx.close();
  }
  // «Ver con datos de ejemplo»: the example shows the smart cube too, with the turns coming in.
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const ov = await ctx.newPage();
    ov.on('pageerror', (e) => errs.push('demo: ' + e.message));
    await ov.goto(`${SITE}/overlay.html?demo=1`);
    const live = () => ov.evaluate(() => (document.getElementById('liveLine').hidden ? '' : document.getElementById('liveLine').innerText));
    await ov.waitForFunction(() => /Ejecutando/i.test(document.getElementById('phase').textContent), null, { timeout: 6000 });
    await wait(1500);
    const a = await live();
    await wait(2500);
    const b = await live();
    const n = (x) => Number((x.match(/(\d+) giros/) || [])[1] || 0);
    check('demo: turns come in during the execution', n(a) > 31 && n(b) > n(a), `${n(a)} → ${n(b)}`);
    check('demo: «cubo en directo» on the scramble', await ov.evaluate(() => !document.getElementById('cubeTag').hidden));
    await ov.screenshot({ path: `${SHOTS}/overlay-demo-exec.png` });
    await ov.waitForFunction(() => document.getElementById('phase').textContent.trim() === 'Resuelto', null, { timeout: 15000 });
    check('demo: the result says the cube checked it', /Lo ha comprobado el cubo/i.test(await live()), await live());
    const marks = await ov.evaluate(() => [document.querySelectorAll('#scrText .mv.done').length, document.querySelectorAll('#scrText .mv.next').length]);
    check('demo: the next scramble half done', marks[0] === 7 && marks[1] === 1, JSON.stringify(marks));
    await ctx.close();
  }

  console.log(results.join('\n'));
  console.log('page errors:', errs.length ? errs : 'none');
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
