// «Entrenar → Algoritmos» on the 3BLD page: T-perm, R-perm and Y-perm. The panel (instead of the setups, and
// back), timing yourself (Space and the clock, its numbers), «Las tres» mixing them, «Ocultar el algoritmo»,
// writing it from memory (the same one, an equivalent one, a wrong one), the smart cube (it follows each turn,
// says what to undo, times first to last turn and the next rep starts from there; the letter trainer does not
// react meanwhile), the numbers in sync, and the phone.
const { chromium, devices } = require('playwright');
const { SITE, SHOTS } = require('../env');
const axeSrc = require('fs').readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const T = "R U R' U' R' F R2 U' R' U' R U R' F'";
const Y = "R U' R' U' R U R' F' R U R' U' R' F R";

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const open = async (opts, q = '') => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    // The floating «Conectar cubo» has its own suite: out of the way of the clicks here.
    await ctx.addInitScript(() => document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = '.cube-fab, .cube-fab-tip { display: none !important; }';
      document.head.appendChild(s);
    }));
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`${SITE}/${q}#entrenar`);
    await p.waitForFunction(() => window.OP3 && window.OP3.algTrainer);
    return { ctx, p };
  };
  const S = (p) => p.evaluate(() => window.OP3.algTrainer.state());
  const D = (p) => p.evaluate(() => window.OP3.algTrainer.data());

  const { ctx, p } = await open({});
  await p.click('#trAlg');
  let v = await p.evaluate(() => ({ panel: !document.getElementById('algTr').hidden, trainer: document.querySelector('.view[data-view=entrenar] .trainer').hidden, title: document.getElementById('hTrain').textContent, pressed: document.getElementById('trAlg').getAttribute('aria-pressed'), name: document.querySelector('.at-name b').textContent, moves: document.querySelector('.at-moves').textContent.replace(/\s+/g, ' ').trim() }));
  check('panel: «Algoritmos» shows it instead of the setups, with the T-perm', v.panel && v.trainer && v.title === 'Entrenar algoritmos' && v.pressed === 'true' && v.name === 'T-perm' && v.moves === T, JSON.stringify(v));
  check('panel: without a smart cube, «Con el cubo» is off and it times', (await S(p)).how === 'timer' && await p.evaluate(() => document.querySelector('[data-alg-how="cube"]').disabled));

  // ---------- Timing yourself ----------
  await p.keyboard.press(' ');
  await wait(400);
  check('timer: Space starts it', (await S(p)).phase === 'run');
  await p.keyboard.press(' ');
  let d = await D(p);
  check('timer: Space stops it, saved for the T-perm with its TPS', d.T.n === 1 && d.T.best >= 350 && /T-perm en \d,\d\d s · \d+,\d TPS/.test(await p.evaluate(() => document.getElementById('algFb').textContent)), JSON.stringify(d));
  await p.click('#algClock');
  await wait(200);
  await p.click('#algClock');
  d = await D(p);
  check('timer: or tapping the clock; the table says how many, the best and the TPS', d.T.n === 2 && await p.evaluate(() => /T-perm\s*2\s*0,\d\d s/.test(document.querySelector('.at-stats').innerText)));
  // The three mixed.
  await p.click('[data-alg-pick="all"]');
  const seen = new Set();
  for (let i = 0; i < 9; i++) { seen.add((await S(p)).alg); await p.keyboard.press(' '); await wait(30); await p.keyboard.press(' '); }
  d = await D(p);
  check('las tres: they take turns, never the same twice in a row', seen.size === 3 && ['T', 'P', 'Y'].reduce((a, k) => a + ((d[k] && d[k].n) || 0), 0) === 11, JSON.stringify([...seen]));
  await p.click('[data-alg-pick="Y"]');
  await p.check('#algHide');
  check('ocultar: the algorithm hidden while you do it', await p.evaluate(() => !document.querySelector('.at-moves .sm') && /Oculto/.test(document.querySelector('.at-moves').textContent)));
  await p.uncheck('#algHide');

  // ---------- From memory ----------
  await p.click('[data-alg-how="type"]');
  check('memoria: the algorithm hidden until you answer, the box ready', await p.evaluate(() => !document.querySelector('.at-moves .sm') && document.activeElement.id === 'algInput'));
  await p.fill('#algInput', `  ${Y.replace(/ /g, '  ')} `);
  await p.press('#algInput', 'Enter');
  v = await p.evaluate(() => ({ fb: document.getElementById('algFb').textContent, moves: !!document.querySelector('.at-moves .sm') }));
  check('memoria: the same algorithm (any spacing) → right, and then it shows', /Correcto/.test(v.fb) && v.moves, JSON.stringify(v));
  await p.click('#algNext');
  await p.fill('#algInput', `${Y} U U'`);
  await p.press('#algInput', 'Enter');
  check('memoria: an equivalent one counts', /Correcto/.test(await p.evaluate(() => document.getElementById('algFb').textContent)));
  await p.click('#algNext');
  await p.fill('#algInput', "R U R' U'");
  await p.press('#algInput', 'Enter');
  v = await p.evaluate(() => ({ fb: document.getElementById('algFb').textContent, moves: document.querySelector('.at-moves').textContent.replace(/\s+/g, ' ').trim() }));
  d = await D(p);
  check('memoria: a wrong one says so and shows it; 2 of 3 in the table', /No hace lo mismo/.test(v.fb) && v.moves === Y && d.Y.seen === 3 && d.Y.right === 2, JSON.stringify({ v, y: d.Y }));
  await p.screenshot({ path: `${SHOTS}/bld-algs-1280.png` });
  await p.evaluate(axeSrc);
  const ax = await p.evaluate(async () => (await window.axe.run(document.querySelector('.view:not([hidden])'), { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
  check('axe: the panel, no violations', !ax.length, ax.join(' | '));

  // Back to the setups.
  await p.click('#trEdge');
  v = await p.evaluate(() => ({ panel: document.getElementById('algTr').hidden, trainer: !document.querySelector('.view[data-view=entrenar] .trainer').hidden, title: document.getElementById('hTrain').textContent, mode: document.body.dataset.trmode }));
  check('back: «Aristas» brings the setups back', v.panel && v.trainer && v.title === 'Entrenar setups' && !v.mode, JSON.stringify(v));
  await ctx.close();

  // ---------- With the smart cube ----------
  const c = await open({}, '?cubo=virtual');
  await c.p.evaluate(() => window.OP3.showView('crono'));
  await c.p.click('#cubeSim');
  await c.p.waitForFunction(() => window.OP3.cube.status === 'on');
  await c.p.evaluate(() => window.OP3.showView('entrenar'));
  await c.p.click('#trAlg');
  await c.p.click('[data-alg-how="cube"]');
  await c.p.click('[data-alg-pick="T"]');
  const turn = (a) => c.p.evaluate((x) => window.OP3.cube.link.turn(x), a);
  const letterBefore = await c.p.evaluate(() => window.OP3.trainer.state());
  check('cube: «Con el cubo» on, waiting for the first turn', (await S(c.p)).how === 'cube' && (await S(c.p)).phase === 'ready');
  await turn("R U R' U'");
  await wait(150);
  let s = await S(c.p);
  const chips = await c.p.evaluate(() => [document.querySelectorAll('.at-moves .sm.done').length, !!document.querySelector('.at-moves .sm.next')]);
  check('cube: it follows each turn (4 done, the next marked) and the clock runs', s.phase === 'run' && s.pos === 4 && chips[0] === 4 && chips[1], JSON.stringify({ s, chips }));
  const cnt = await c.p.evaluate(() => ({ text: document.querySelector('.at-count b').textContent, dots: document.querySelectorAll('.at-dots i.on').length }));
  check('cube: the counter says 4 of 14, with four dots on', cnt.text === '4/14' && cnt.dots === 4, JSON.stringify(cnt));
  await turn('D');
  await wait(100);
  check('cube: a wrong turn → the low sound', (await c.p.evaluate(() => window.OP3.cube.fxLog.slice(-1)[0])) === 'bad', JSON.stringify(await c.p.evaluate(() => window.OP3.cube.fxLog.slice(-3))));
  check('cube: a wrong turn → what to undo', /Deshaz: <b>D'<\/b>|Deshaz: D'/.test(await c.p.evaluate(() => document.querySelector('.at-hint').innerHTML)));
  await turn("D'");
  await turn("R' F R2 U' R' U' R U R' F'");
  await wait(200);
  d = await D(c.p);
  s = await S(c.p);
  check('cube: done → «✓ Hecha» with its time, and the chime', await c.p.evaluate(() => /Hecha/.test(document.querySelector('.at-count').textContent) && window.OP3.cube.fxLog.includes('chime')));
  check('cube: done with the last turn → saved, and the next T-perm starts from there', d.T && d.T.n === 1 && s.phase === 'ready' && s.pos === 0 && /T-perm en/.test(await c.p.evaluate(() => document.getElementById('algFb').textContent)), JSON.stringify({ d, s }));
  await turn(T);
  await wait(200);
  d = await D(c.p);
  check('cube: and again (the cube solved again: the T-perm twice)', d.T.n === 2 && await c.p.evaluate(() => window.OP3.isSolved(window.OP3.cube.state)), JSON.stringify(d.T));
  const letterAfter = await c.p.evaluate(() => window.OP3.trainer.state());
  check('cube: the letter trainer did not take those turns as answers', letterAfter.letter === letterBefore.letter && letterAfter.phase === letterBefore.phase, `${JSON.stringify(letterBefore)} → ${JSON.stringify(letterAfter)}`);
  // Lost, then from here.
  await turn("L D L' D' F2 B2");
  await turn("U2 D2 L2 R2");
  await wait(100);
  check('cube: far off → lost, «Empezar desde aquí»', /Te has salido/.test(await c.p.evaluate(() => document.querySelector('.at-hint').textContent)));
  await c.p.click('#algRearm');
  await turn(T);
  await wait(200);
  check('cube: from where it is now, it counts again', (await D(c.p)).T.n === 3);
  await c.p.screenshot({ path: `${SHOTS}/bld-algs-cube.png` });
  await c.ctx.close();

  // ---------- Phone ----------
  const ph = await open({ ...devices['Pixel 7'] });
  await ph.p.click('#trAlg');
  await wait(200);
  const over = await ph.p.evaluate(() => { const panel = document.querySelector('.view[data-view=entrenar] .panel').getBoundingClientRect(); return { page: document.documentElement.scrollWidth - innerWidth, out: [...document.querySelectorAll('#algTr *')].filter((e) => e.getBoundingClientRect().right > panel.right + 1).map((e) => e.className || e.tagName).slice(0, 4) }; });
  check('phone: fits, nothing past the panel', over.page <= 0 && !over.out.length, JSON.stringify(over));
  await ph.p.screenshot({ path: `${SHOTS}/bld-algs-pixel7.png`, fullPage: true });
  await ph.ctx.close();
  const land = await open({ viewport: { width: 750, height: 340 }, isMobile: true, hasTouch: true });
  // The algorithms rail stays at the top on a phone on its side: the button can be under it.
  await land.p.evaluate(() => document.getElementById('trAlg').click());
  check('iPhone on its side: fits', await land.p.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 0));
  await land.ctx.close();

  results.forEach((r) => console.log(r));
  console.log(`page errors: ${errs.length ? JSON.stringify(errs) : 'none'}`);
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => {
  const at = (String(e.stack || '').split('\n').find((l) => /e2e\/bld-/.test(l)) || '').trim();
  console.log(`FAIL stopped — ${String(e.message || e).split('\n')[0]} ${at}`);
  console.error(e);
  process.exit(1);
});
