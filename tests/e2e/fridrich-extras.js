// «Fridrich reducido», the extras: competition mode, the reconstruction of a solve, the next F2L pair, the
// chart, the cross trainer, sync between two devices, vibration, new versions and installing.
const { chromium, devices } = require('playwright');
const { SITE, SHOTS } = require('../env');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
const SOLVE = ["D R' F2 L", "U R U' R'", "U' F' U F", "L' U' L", "U B U' B'", "F R U R' U' F'", "R U R' U R U2 R'", "R U R' U' R' F R2 U' R' U' R U R' F'", "R U' R U R U R U' R' U' R2"];

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const open = async (opts, url, init) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    if (init) await ctx.addInitScript(init);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(url);
    await p.waitForFunction(() => window.Fridrich && window.Fridrich.scramble(), null, { timeout: 30000 });
    return { ctx, p };
  };
  const connect = async (p) => {
    await p.evaluate(() => document.getElementById('cubeSim').click());
    await p.waitForFunction(() => window.Fridrich.cube().on);
  };
  const turn = (p, a) => p.evaluate((x) => window.Fridrich.cube().link.turn(x), a);
  // Our own scramble: the reverse of SOLVE (held white down), as the cube feels it.
  const setScramble = (p) => p.evaluate((sol) => {
    const M = window.CubeModel;
    const link = window.Fridrich.cube().virtualLink();
    const out = [];
    link.events$.subscribe((e) => { if (e.type === 'MOVE') out.push(e.move); });
    link.turn(`z2 ${M.invertAlg(sol.join(' '))} z2`);
    window.Fridrich._.setScramble(M.simplifyAlg(out.join(' ')));
  }, SOLVE);
  const solve = async (p, parts) => { for (const a of parts) await p.evaluate((x) => window.Fridrich.cube().link.play([x], 25), a); };

  const { ctx, p } = await open({}, `${SITE}/fridrich?cubo=virtual#crono`);

  // ================= Competition mode =================
  await p.click('#focusOpen');
  check('focus: «Salir» and the scramble show straight away, before any solve', await p.evaluate(() => getComputedStyle(document.getElementById('focusExit')).visibility === 'visible' && getComputedStyle(document.getElementById('focusScr')).visibility === 'visible'));
  check('focus: only the clock, full screen', await p.evaluate(() => document.body.classList.contains('focus') && !document.getElementById('focusTop').hidden && getComputedStyle(document.getElementById('history')).display === 'none'));
  const vp = p.viewportSize();
  await p.mouse.move(vp.width / 2, vp.height * 0.8);
  await p.mouse.down(); await p.waitForTimeout(380); await p.mouse.up();
  await p.waitForTimeout(200);
  check('focus: the whole screen is the button (hold and let go → running)', await p.evaluate(() => document.getElementById('clock').dataset.phase === 'run' && document.body.dataset.timer === 'run'));
  await p.mouse.down(); await p.mouse.up();
  await p.waitForTimeout(100);
  check('focus: a tap stops it', await p.evaluate(() => document.getElementById('clock').dataset.phase === 'done' && JSON.parse(localStorage.getItem('cfop:times:v1')).length === 1));
  check('focus: today and the last time at the bottom', /Hoy 1/.test(await p.evaluate(() => document.getElementById('focusStats').innerText)));
  await p.keyboard.press('Escape');
  check('focus: Esc leaves', await p.evaluate(() => !document.body.classList.contains('focus')));
  await p.keyboard.press('f');
  check('focus: F comes back', await p.evaluate(() => document.body.classList.contains('focus')));
  await p.click('#focusExit');

  // ================= A solve with the cube: the next pair, the reconstruction =================
  await connect(p);
  await setScramble(p);
  await turn(p, await p.evaluate(() => window.Fridrich.scramble()));
  await turn(p, 'z2');
  await solve(p, [SOLVE[0]]);
  await p.waitForFunction(() => /La pareja más corta/.test(document.getElementById('liveNow').innerText), null, { timeout: 5000 }).catch(() => {});
  const pairText = await p.evaluate(() => document.getElementById('liveNow').innerText);
  check('f2l: after the cross, the shortest way to put in each pair', /La pareja más corta/.test(pairText) && /\d giros?/.test(pairText), pairText.slice(0, 200));
  const pairOk = await p.evaluate(() => {
    const C = window.Cfop; const M = window.CubeModel;
    const read = C.readCube(window.Fridrich.cube().state, 'U');
    const sols = C.pairSolutions(read.g, 600000);
    return sols.length >= 3 && sols.every((x) => {
      const after = C.stageOf(M.apply(read.g, x.moves));
      return after.cross === 4 && after.pairs[x.slot];
    });
  });
  check('f2l: and each of them really puts that pair in, keeping the cross', pairOk);
  await p.screenshot({ path: `${SHOTS}/fridrich-f2l-1280.png` });
  await solve(p, SOLVE.slice(1));
  await p.waitForTimeout(300);
  await turn(p, 'z2');   // white up again, as at the start, to scramble
  await p.waitForFunction(() => document.querySelector('.fr-an-box'), null, { timeout: 15000 }).catch(() => {});
  const last = await p.evaluate(() => { const t = JSON.parse(localStorage.getItem('cfop:times:v1')); return t[t.length - 1]; });
  const want = [SOLVE[0], SOLVE.slice(1, 5).join(' '), ...SOLVE.slice(5)];
  check('pace and records: not on a first smart-cube solve (no reference yet, no earlier record beaten)', await p.evaluate(() => !document.getElementById('pace').innerText && document.getElementById('pbBanner').hidden));
  check('recon: the turns of each step, as held (white down), half turns joined', JSON.stringify(last.rc) === JSON.stringify(want), JSON.stringify(last.rc));
  await p.evaluate(() => { document.querySelector('.fr-recon-box').open = true; });
  const recon = await p.evaluate(() => document.querySelector('.fr-recon-box').innerText.replace(/\s+/g, ' '));
  check('recon: shown under the splits, with the turn to hold it', /Inspección .*z2/.test(recon) && /OLL 2 .*R U R' U R U2 R'/.test(recon) && /Copiar reconstrucción/.test(recon), recon.slice(0, 220));
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  await p.click('.fr-recon-box [data-copy-rc]');
  const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  check('recon: copied as text', /^z2 \/\/ inspección\nD R' F2 L \/\/ Cruz\n/.test(clip), JSON.stringify(clip.slice(0, 60)));
  await p.click(`#history [data-rc="${last.at}"]`);
  check('recon: in the history too', await p.evaluate(() => /OLL 1/.test(document.querySelector('.fr-recon-row') ? document.querySelector('.fr-recon-row').innerText : '')));

  // ================= How good the solve was =================
  // The cross is the shortest (4); the first pair took 8 where 5 was enough; the others and the whole last
  // layer the shortest: 57 turns, 54 at best → 95 %.
  const an = last.an || {};
  check('analysis: each step, my turns against the shortest', JSON.stringify(an.c) === '[4,4]'
    && JSON.stringify((an.p || []).map((x) => [x[1], x[2]])) === '[[8,5],[3,3],[4,4]]'
    && JSON.stringify((an.l || []).map((x) => x && [x[0], x[1]])) === '[[6,6],[7,7],[14,14],[11,11]]'
    && an.m === 57 && an.i === 54, JSON.stringify(an));
  const anText = await p.evaluate(() => document.querySelector('.fr-an-box').innerText.replace(/\s+/g, ' '));
  check('analysis: shown after the solve: efficiency, the table and what to work on', /95 % de eficiencia: 57 giros; .* serían 54/.test(anText) && /Pareja 1 .* 8 \+3 5 Se podía en 5/.test(anText) && /Cruz 4 ✓ 4 La más corta/.test(anText) && /PLL 2 .* 11 ✓ 11 Perfecto/.test(anText) && /Solo 3 giros de más/.test(anText), anText.slice(0, 600));
  check('analysis: in the history too', await p.evaluate(() => /eficiencia/.test(document.querySelector('.fr-recon-row').innerText)));
  check('analysis: the average efficiency with the phases', /Eficiencia media 95 %/.test(await p.evaluate(() => document.getElementById('phaseLegend').innerText)));
  await p.screenshot({ path: `${SHOTS}/fridrich-analysis-1280.png`, fullPage: true });

  // ================= The cross trainer =================
  await p.evaluate(() => window.Fridrich.showView('entrenar'));
  await p.click('#ctGo');
  await p.waitForFunction(() => window.Fridrich._.ct.phase === 'scramble', null, { timeout: 30000 });
  await turn(p, await p.evaluate(() => window.Fridrich._.ct.scr));
  await p.waitForFunction(() => window.Fridrich._.ct.phase === 'plan', null, { timeout: 5000 }).catch(() => {});
  check('cross: scrambled → 15 s to plan', await p.evaluate(() => window.Fridrich._.ct.phase === 'plan' && /Planea la cruz blanca/i.test(document.getElementById('crossTr').innerText)));
  const best = await p.evaluate(() => window.Fridrich._.ct.best);
  // Two turns too many (that cannot join with the cross's first turns), then the cross.
  const first = best.moves.split(' ').slice(0, 2).map((m) => m[0]);
  const X = ['U', 'R', 'F', 'L', 'B', 'D'].find((f) => !first.includes(f));
  await turn(p, `${best.rotation} ${X} ${X}' ${best.moves}`);
  await p.waitForTimeout(100);
  const ctText = await p.evaluate(() => document.getElementById('crossTr').innerText.replace(/\s+/g, ' '));
  check('cross: done → my turns, how many more than the shortest, and the shortest', new RegExp(`${best.length + 2} giros: 2 más que la más corta`).test(ctText) && /La más corta/.test(ctText), ctText.slice(0, 220));
  check('cross: kept for the averages', /Últimas 1: de media 2.0 giros más/.test(ctText), ctText);
  await p.evaluate(() => document.getElementById('cubeOff').click());
  await p.click('#ctGo');
  await p.waitForFunction(() => window.Fridrich._.ct.phase === 'scramble', null, { timeout: 30000 });
  await p.click('#ctPlan');
  await p.click('#ctDone');
  check('cross: without the smart cube, «Ya está» → «La he hecho» → the shortest', /La más corta \(\d+ giros?\)/.test(await p.evaluate(() => document.getElementById('crossTr').innerText)));

  // ================= New versions and installing =================
  await p.evaluate(() => window.Fridrich._.offerUpdate());
  check('update: «Hay una versión nueva»', await p.evaluate(() => !document.getElementById('updateBar').hidden));
  await p.click('#updateLater');
  await p.evaluate(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => {}; e.userChoice = Promise.resolve({}); window.dispatchEvent(e); });
  check('install: the button shows when the browser offers it', await p.evaluate(() => !document.querySelector('.install').hidden));

  // ================= The chart =================
  const many = (n) => () => {
    const t = []; let at = Date.now() - 1e8;
    for (let i = 0; i < 60; i++) { at += 600000; t.push({ at, t: 40000 - i * 150 + Math.round(Math.sin(i) * 3000), pen: i === 20 ? 'dnf' : 0, scr: 'R U' }); }
    localStorage.setItem('cfop:times:v1', JSON.stringify(t));
  };
  const ch = await open({}, `${SITE}/fridrich#crono`, many(60));
  const chart = await ch.p.evaluate(() => ({
    shown: !document.getElementById('chartBox').hidden,
    dots: document.querySelectorAll('#chart .fr-dot').length,
    a5: !!document.querySelector('#chart .fr-l.a5'), a12: !!document.querySelector('#chart .fr-l.a12'),
    ends: [...document.querySelectorAll('#chart .fr-end')].map((x) => x.textContent),
    legend: document.getElementById('chartLegend').innerText,
  }));
  check('chart: the last 50 solves (49 dots: a DNF is left out), ao5 and ao12 labelled at the end', chart.shown && chart.dots === 49 && chart.a5 && chart.a12 && chart.ends.length === 2 && /ao5[\s\S]*ao12/.test(chart.legend), JSON.stringify(chart));
  await ch.p.locator('#chart svg').scrollIntoViewIfNeeded();
  const box = await ch.p.locator('#chart svg').boundingBox();
  await ch.p.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  check('chart: hovering shows that solve', /#\d+ [\d.]+/.test(await ch.p.evaluate(() => document.getElementById('chartTip').innerText)));
  await ch.p.click('[data-chart="0"]');
  check('chart: «Todos» → every solve', await ch.p.evaluate(() => document.querySelectorAll('#chart .fr-dot').length === 59));
  await ch.ctx.close();

  // ================= Sync between two devices =================
  const a = await open({}, `${SITE}/fridrich#ajustes`);
  await a.p.evaluate(() => { localStorage.setItem('cfop:times:v1', JSON.stringify([{ at: 1700000000000, t: 25000, pen: 0, scr: 'R U' }])); });
  await a.p.reload();
  await a.p.waitForFunction(() => window.Fridrich && window.Fridrich.scramble(), null, { timeout: 30000 });
  await a.p.click('#syncOn');
  await a.p.waitForFunction(() => /Sincronizado/.test(document.getElementById('syncStatus').textContent), null, { timeout: 15000 });
  const code = await a.p.evaluate(() => document.querySelector('#syncBox .code-box').textContent);
  check('sync: a code, shared with the 3BLD page', /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/.test(code) && await a.p.evaluate(() => { const s = JSON.parse(localStorage.getItem('op3bld:sync:v1')); return /^[a-f0-9]{64}$/.test(s.key); }), code);
  const b = await open({}, `${SITE}/fridrich#ajustes`);
  await b.p.fill('#syncCode', code);
  await b.p.click('#syncJoin');
  await b.p.waitForFunction(() => /Sincronizado/.test(document.getElementById('syncStatus').textContent), null, { timeout: 15000 });
  check('sync: the other device gets the solves', await b.p.evaluate(() => JSON.parse(localStorage.getItem('cfop:times:v1')).some((r) => r.at === 1700000000000)));
  // A penalty on one device reaches the other.
  await b.p.evaluate(() => window.Fridrich.showView('crono'));
  await b.p.click('[data-pen="2"][data-i="0"]');
  await b.p.evaluate(() => window.Fridrich._.syncNow(true));
  await a.p.evaluate(() => window.Fridrich._.syncNow(true));
  check('sync: a +2 made on one device shows on the other', await a.p.evaluate(() => JSON.parse(localStorage.getItem('cfop:times:v1')).find((r) => r.at === 1700000000000).pen === 2));
  await a.ctx.close();
  await b.ctx.close();

  // ================= Vibration on a phone =================
  const ph = await open({ ...devices['Pixel 7'] }, `${SITE}/fridrich?cubo=virtual#crono`);
  await connect(ph.p);
  await ph.p.evaluate(() => window.Fridrich._.setScramble('R U'));
  await turn(ph.p, 'R U');
  await turn(ph.p, "U' R'");
  await ph.p.waitForTimeout(200);
  check('vibrate: solved on a phone → it vibrates', await ph.p.evaluate(() => window.Fridrich._.vibes.length === 1 && window.Fridrich._.vibes[0].join() === '80,60,180'));
  await ph.p.click('#focusOpen');
  await ph.p.waitForTimeout(200);
  const over = await ph.p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('phone: competition mode fits', over <= 0, String(over));
  await ph.p.screenshot({ path: `${SHOTS}/fridrich-focus-pixel7.png` });
  await ph.ctx.close();

  await ctx.close();
  results.forEach((r) => console.log(r));
  console.log(`page errors: ${errs.length ? JSON.stringify(errs) : 'none'}`);
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
