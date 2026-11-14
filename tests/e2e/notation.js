// La notación (notation.js), the same in every section: «Casos → Notación» in Fridrich and CFOP, a panel of
// «Aprender» that opens in principiante and 3BLD. Each letter turns on a cube in 3D from the cube as held
// (yellow up in CFOP and principiante, white up in 3BLD) and ends in the state CubeModel gives it, with its
// words; ', 2, two layers, the middle ones and the whole cube; «Otra vez»; an algorithm as typed by hand,
// played whole, a move a press and jumping to a move; one it cannot read; the cube dragged round and back;
// and on phones, no sideways scroll and the cube in sight with the keys.
const { chromium, devices } = require('playwright');
const { SITE, SHOTS } = require('../env');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const open = async (opts, url) => {
    const ctx = await browser.newContext(opts);
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${url}: ${e.message}`));
    await p.goto(url);
    await p.waitForFunction(() => window.CubeNotation && window.CubeModel);
    return { ctx, p };
  };
  // The cube settled (no turn in progress), and what it should show: the cube as held, after `alg`.
  const settled = (p) => p.waitForFunction(() => { const r = document.querySelector('.nt'); return r && !r.dataset.busy; }, null, { timeout: 10000 });
  const done = (p) => p.waitForFunction(() => /Ya está/.test(document.querySelector('.nt-now').textContent), null, { timeout: 30000 });
  const facelets = (p) => p.evaluate(() => document.querySelector('.nt').dataset.facelets);
  const after = (p, alg, up) => p.evaluate(([a, u]) => {
    const M = window.CubeModel;
    const base = u === 'white' ? M.solved() : M.apply(M.solved(), 'z2');
    return M.toFacelets(a ? M.apply(base, a) : base);
  }, [alg, up]);
  const now = (p) => p.textContent('.nt-now');

  // ================= Fridrich: Casos → Notación =================
  let { ctx, p } = await open({ viewport: { width: 1200, height: 900 } }, `${SITE}/fridrich#casos`);
  await p.waitForFunction(() => window.Fridrich);
  check('every turn on screen ends where CubeModel puts it (each letter alone, with \' and with 2)', (await p.evaluate(() => window.CubeNotation._check())).length === 0);
  await p.click('[data-case-set="nota"]');
  await p.waitForSelector('#notation .nt-cube polygon');
  const s0 = await p.evaluate(() => ({
    shown: !document.getElementById('caseNotation').hidden,
    method: document.getElementById('caseMethod').hidden,
    cards: document.querySelectorAll('#caseGroups [data-case]').length,
    keys: [...document.querySelectorAll('[data-nt-key]')].map((b) => b.textContent).join(' '),
    stickers: document.querySelectorAll('.nt-cube .nt-st').length,
    saved: JSON.parse(localStorage.getItem('cfop:settings:v1') || '{}').caseSet,
  }));
  check('Casos → «Notación»: the section instead of the cases, with the 21 letters, and remembered', s0.shown && s0.method && s0.cards === 0 && s0.keys === 'R L U D F B r l u d f b M E S x y z' && s0.stickers >= 27 && s0.saved === 'nota', JSON.stringify(s0));
  check('the cube as held in the cases: yellow up, green in front', (await facelets(p)) === (await after(p, '', 'yellow')));
  await p.locator('#caseNotation').screenshot({ path: `${SHOTS}/notation.png` });

  // A letter: it turns from the cube as held and ends as the move leaves it; what it does, in words.
  await p.click('[data-nt-key="R"]');
  const busy = await p.evaluate(() => document.querySelector('.nt').dataset.busy);
  await p.waitForTimeout(200);
  await p.locator('.nt-stage').screenshot({ path: `${SHOTS}/notation-R.png` });
  await settled(p);
  let t = await now(p);
  check('R: it turns, ends as R leaves the cube, and says what it is (the right layer, a quarter up)', busy === '1' && (await facelets(p)) === (await after(p, 'R', 'yellow')) && /Derecha/.test(t) && /hacia arriba/.test(t), t);
  await p.click('[data-nt-mod="\'"]');
  const primes = await p.evaluate(() => [...document.querySelectorAll('[data-nt-key]')].slice(0, 3).map((b) => b.textContent).join(' '));
  await p.click('[data-nt-key="x"]');
  await settled(p);
  t = await now(p);
  check("«Al revés ('»: the letters with ', and x' turns the whole cube back (the top comes to the front)", primes === "R' L' U'" && (await facelets(p)) === (await after(p, "x'", 'yellow')) && /la cara de arriba pasa delante/.test(t), `${primes} · ${t}`);
  await p.click('[data-nt-mod="2"]');
  await p.click('[data-nt-key="M"]');
  await settled(p);
  t = await now(p);
  check('«Media vuelta (2)»: M2, half a turn of the middle layer, like L2', (await facelets(p)) === (await after(p, 'M2', 'yellow')) && /media vuelta \(como L2\)/.test(t), t);
  await p.click('[data-nt-mod=""]');
  await p.click('[data-nt-key="r"]');
  await settled(p);
  t = await now(p);
  check('r: two layers (also written Rw)', (await facelets(p)) === (await after(p, 'r', 'yellow')) && /Rw/.test(t), t);
  await p.click('[data-nt-again]');
  const again = await p.evaluate(() => document.querySelector('.nt').dataset.busy);
  await settled(p);
  check('«Otra vez»: the same letter again, from the start', again === '1' && (await facelets(p)) === (await after(p, 'r', 'yellow')));

  // ================= An algorithm, move by move =================
  await p.fill('.nt-alg input', '(R U R’ U’)y');
  await p.click('.nt-alg button[type=submit]');
  await done(p);
  const a1 = { f: await facelets(p), chips: await p.evaluate(() => [...document.querySelectorAll('.nt-chip')].map((b) => b.textContent).join(' ')) };
  check('an algorithm as typed by hand (brackets, ’, no spaces) plays move by move and ends as it should', a1.f === (await after(p, "R U R' U' y", 'yellow')) && a1.chips === "R U R' U' y", JSON.stringify(a1));
  await p.click('[data-nt-step]');
  await settled(p);
  await p.click('[data-nt-step]');
  await settled(p);
  const st = { f: await facelets(p), cur: await p.evaluate(() => (document.querySelector('.nt-chip[aria-current]') || {}).textContent), text: await now(p) };
  check('«Paso a paso»: from the start again, a move a press, the one turning marked', st.f === (await after(p, 'R U', 'yellow')) && st.cur === 'U' && /Giro 2 de 5/.test(st.text), JSON.stringify(st));
  await p.click('.nt-chip >> nth=3');
  const j = { f: await facelets(p), text: await now(p) };
  check('a move of it, touched: the cube as it is right after it', j.f === (await after(p, "R U R' U'", 'yellow')) && /Giro 4 de 5/.test(j.text), JSON.stringify(j));
  await p.click('[data-nt-step]');
  await settled(p);
  check('… and «Paso a paso» goes on from there', (await facelets(p)) === (await after(p, "R U R' U' y", 'yellow')));
  await p.fill('.nt-alg input', 'R Q U');
  const f0 = await facelets(p);
  await p.click('.nt-alg button[type=submit]');
  const e1 = await p.evaluate(() => ({ shown: !document.querySelector('.nt-err').hidden, text: document.querySelector('.nt-err').textContent }));
  check('a letter it does not know: it says which, and the cube stays as it was', e1.shown && /«Q»/.test(e1.text) && (await facelets(p)) === f0, JSON.stringify(e1));
  await p.click('[data-nt-ex^="x L2"]');
  await done(p);
  check('an example (the Aa-perm, with x) fills it in and plays it, and the error goes', (await p.inputValue('.nt-alg input')).startsWith('x L2') && (await facelets(p)) === (await after(p, "x L2 D2 L' U' L D2 L' U L'", 'yellow')) && await p.evaluate(() => document.querySelector('.nt-err').hidden));

  // ================= Dragged round =================
  const pic = () => p.evaluate(() => document.querySelector('.nt-cube').innerHTML);
  const before = await pic();
  const box = await p.locator('.nt-cube').boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.mouse.move(box.x + box.width / 2 + 140, box.y + box.height / 2 + 50, { steps: 6 });
  await p.mouse.up();
  const turned = { pic: await pic(), f: await facelets(p), reset: await p.evaluate(() => !document.querySelector('[data-nt-cam]').disabled) };
  await p.click('[data-nt-cam]');
  check('dragged, the view goes round the cube (the cube stays as it is); «Vista inicial» puts it back', turned.pic !== before && turned.reset && turned.f === (await facelets(p)) && (await pic()) === before);
  await ctx.close();

  // ================= CFOP completo: its own Casos, the same section =================
  ({ ctx, p } = await open({ viewport: { width: 1200, height: 900 } }, `${SITE}/cfop#casos`));
  await p.waitForFunction(() => window.Fridrich);
  await p.click('[data-case-set="nota"]');
  await p.waitForSelector('#notation .nt-cube polygon');
  await p.click('[data-nt-key="y"]');
  await settled(p);
  check('/cfop: Casos → «Notación» too (remembered as its own), y turns the cube like U', (await facelets(p)) === (await after(p, 'y', 'yellow')) && (await p.evaluate(() => JSON.parse(localStorage.getItem('cfop:settings:v1')).caseSetFull)) === 'nota');
  await ctx.close();

  // ================= principiante and 3BLD: a panel of «Aprender» =================
  ({ ctx, p } = await open({ viewport: { width: 1200, height: 900 } }, `${SITE}/principiante?cubo=virtual#aprender`));
  await p.click('#notationBox summary');
  await p.waitForSelector('#notationBox .nt-cube polygon');
  const pr0 = await facelets(p);
  await p.click('#notationBox [data-nt-key="U"]');
  await settled(p);
  check('principiante, «Aprender»: the panel opens with the cube as held (yellow up), and U turns', pr0 === (await after(p, '', 'yellow')) && (await facelets(p)) === (await after(p, 'U', 'yellow')));
  await ctx.close();
  ({ ctx, p } = await open({ viewport: { width: 1200, height: 900 } }, `${SITE}/#aprender`));
  await p.click('#notationBox summary');
  await p.waitForSelector('#notationBox .nt-cube polygon');
  const bl0 = await facelets(p);
  const ex = await p.evaluate(() => [...document.querySelectorAll('[data-nt-ex]')].map((b) => b.dataset.ntEx));
  await p.click('#notationBox [data-nt-key="d"]');
  await settled(p);
  check('3BLD, «Aprender»: white up as when scrambling, d turns two layers, and its examples are Old Pochmann\'s (T, Y, R and setups)', bl0 === (await after(p, '', 'white')) && (await facelets(p)) === (await after(p, 'd', 'white')) && ex.includes("l2 D' l2") && ex.some((a) => a.startsWith("R U' R' U' R U R' F'")), JSON.stringify(ex));
  await ctx.close();

  // ================= Phones =================
  ({ ctx, p } = await open({ ...devices['Pixel 7'], colorScheme: 'dark' }, `${SITE}/fridrich#casos`));
  await p.waitForFunction(() => window.Fridrich);
  await p.click('[data-case-set="nota"]');
  await p.waitForSelector('#notation .nt-cube polygon');
  await p.screenshot({ path: `${SHOTS}/notation-pixel7.png` });
  await p.evaluate(() => document.querySelector('.nt-rows').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(150);
  const ph = await p.evaluate(() => {
    const stage = document.querySelector('.nt-stage').getBoundingClientRect();
    const key = document.querySelector('[data-nt-key="x"]').getBoundingClientRect();
    return { over: document.documentElement.scrollWidth - window.innerWidth, stageTop: Math.round(stage.top), stageBottom: Math.round(stage.bottom), keyTop: Math.round(key.top), keyH: Math.round(key.height), vh: window.innerHeight };
  });
  check('phone: no sideways scroll; scrolled to the keys, the cube stays in sight above them; keys big enough to hit', ph.over <= 0 && ph.stageTop === 0 && ph.keyTop >= ph.stageBottom && ph.keyTop < ph.vh - 80 && ph.keyH >= 44, JSON.stringify(ph));
  await ctx.close();
  ({ ctx, p } = await open({ viewport: { width: 750, height: 340 }, isMobile: true, hasTouch: true }, `${SITE}/cfop#casos`));
  await p.waitForFunction(() => window.Fridrich);
  await p.click('[data-case-set="nota"]');
  await p.waitForSelector('#notation .nt-cube polygon');
  const land = await p.evaluate(() => {
    const cube = document.querySelector('.nt-cube').getBoundingClientRect();
    const key = document.querySelector('[data-nt-key="R"]').getBoundingClientRect();
    return { over: document.documentElement.scrollWidth - window.innerWidth, side: key.left >= cube.right, h: Math.round(cube.height) };
  });
  check('iPhone on its side: no sideways scroll, the cube beside the keys and small enough for the height', land.over <= 0 && land.side && land.h <= 220, JSON.stringify(land));
  await p.screenshot({ path: `${SHOTS}/notation-iphone-landscape.png` });
  await ctx.close();

  check('no page errors', errs.length === 0, errs.join(' | '));
  results.forEach((r) => console.log(r));
  console.log(`page errors: ${errs.length ? JSON.stringify(errs) : 'none'}`);
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
