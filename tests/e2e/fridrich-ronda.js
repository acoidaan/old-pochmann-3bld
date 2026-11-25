// A round of 5 in CFOP (/fridrich and /cfop), as in a competition: «Ronda de 5» next to «Qué practicar» (only for
// whole solves), five solves with the attempt that comes next, at the fifth the WCA average with its best and
// worst in brackets (and a toast), the next solve starting another round, «Empezar otra», a deleted solve leaving
// room in the round, the round in competition mode, kept after reloading, Progreso's table, «#ronda» from the
// plan and the plan counting it, /cfop the same, and phones without sideways scroll.
const { chromium, devices } = require('playwright');
const { SITE } = require('../env');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const open = async (ctx, url) => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${url}: ${e.message}`));
    await p.goto(url);
    await p.waitForFunction(() => window.Fridrich && window.Fridrich.scramble(), null, { timeout: 30000 });
    return p;
  };
  const context = async (opts) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    return ctx;
  };
  // A solve without inspection: hold Space until ready, let go, and stop it.
  const solve = async (p) => {
    await p.keyboard.down(' ');
    await p.waitForFunction(() => window.Fridrich._.timer.phase === 'ready');
    await p.keyboard.up(' ');
    await p.waitForFunction(() => window.Fridrich._.timer.phase === 'run');
    await p.waitForTimeout(30);
    await p.keyboard.down(' ');
    await p.keyboard.up(' ');
    await p.waitForFunction(() => window.Fridrich._.timer.phase === 'done');
  };
  const panel = (p) => p.evaluate(() => {
    const box = document.getElementById('round');
    return {
      hidden: box.hidden,
      head: box.querySelector('.ev-round-head') ? box.querySelector('.ev-round-head').textContent.replace(/\s+/g, ' ').trim() : '',
      slots: [...box.querySelectorAll('.ev-round-slots li')].map((li) => `${li.querySelector('b').textContent}${li.classList.contains('cur') ? '*' : ''}`).join(' '),
      foot: (box.querySelector('.ev-round-avg') || {}).textContent || '',
    };
  });

  let ctx = await context();
  let p = await open(ctx, `${SITE}/fridrich#crono`);
  const seg0 = await p.evaluate(() => ({ seg: !document.getElementById('roundSeg').hidden, free: document.getElementById('modeFree').getAttribute('aria-pressed'), box: document.getElementById('round').hidden }));
  check('the clock: «Libre» by default, with «Ronda de 5» next to «Qué practicar», no round on screen', seg0.seg && seg0.free === 'true' && seg0.box, JSON.stringify(seg0));
  await p.click('#modeRound');
  let pn = await panel(p);
  check('«Ronda de 5»: five empty attempts, the first one next', !pn.hidden && pn.slots === '—* — — — —' && /Ronda de 5/.test(pn.head), JSON.stringify(pn));
  for (let i = 0; i < 3; i++) await solve(p);
  pn = await panel(p);
  const three = await p.evaluate(() => window.Fridrich._.roundsOf(JSON.parse(localStorage.getItem('cfop:times:v1'))));
  check('three solves in: in the round in order, the fourth next («intento 4 de 5»)', /intento 4 de 5/.test(pn.head) && pn.slots.split(' ').filter((x) => x !== '—' && x !== '—*').length === 3 && /—\*/.test(pn.slots)
    && three.length === 1 && three[0].times.map((r) => r.ri).join() === '0,1,2' && !three[0].done, JSON.stringify(pn));
  await p.evaluate(() => window.Fridrich.showView('crono'));
  await solve(p);
  await solve(p);
  pn = await panel(p);
  const five = await p.evaluate(() => {
    const F = window.Fridrich._;
    const r = F.roundsOf(JSON.parse(localStorage.getItem('cfop:times:v1')))[0];
    const out = F.trimmed(r.times);
    return { done: r.done, avg: r.avg, want: r.times.map((x, i) => (out.has(i) ? '(' : '') + ((x.t + (x.pen === 2 ? 2000 : 0)) / 1000).toFixed(2) + (out.has(i) ? ')' : '')).join(' ') };
  });
  await p.waitForFunction(() => /Ronda terminada/.test(document.getElementById('toast').textContent), null, { timeout: 4000 }).catch(() => {});
  const toast = await p.textContent('#toast');
  check('at the fifth: the WCA average on screen, its best and its worst in brackets, and a toast', five.done && pn.slots === five.want && /Media de la ronda/.test(pn.foot) && (pn.slots.match(/\(/g) || []).length === 2 && /Ronda terminada: media/.test(toast), `${JSON.stringify(pn)} ${JSON.stringify(five)} ${toast}`);
  const stats = await p.evaluate(() => [...document.querySelectorAll('#stats .stat')].map((x) => x.textContent).join(' '));
  check('the times are normal solves too (the stats count them)', /Solves\s*5/.test(stats), stats);
  await solve(p);
  pn = await panel(p);
  const after6 = await p.evaluate(() => window.Fridrich._.roundsOf(JSON.parse(localStorage.getItem('cfop:times:v1'))).map((r) => r.times.length).join());
  check('the next solve starts another round', after6 === '5,1' && /intento 2 de 5/.test(pn.head), `${after6} ${JSON.stringify(pn)}`);
  // A deleted solve of the round in progress leaves its place free.
  const lastI = await p.evaluate(() => JSON.parse(localStorage.getItem('cfop:times:v1')).length - 1);
  await p.click(`#history [data-del="${lastI}"]`);
  await p.click(`#history [data-del="${lastI}"]`);
  await p.waitForTimeout(100);
  pn = await panel(p);
  const afterDel = await p.evaluate(() => window.Fridrich._.roundsOf(JSON.parse(localStorage.getItem('cfop:times:v1'))).map((r) => r.times.length).join());
  check('deleting the last solve (two clicks) takes it out of the round: the round starts again at the first attempt', afterDel === '5' && /—\*/.test(pn.slots.split(' ')[0]) && !/intento/.test(pn.head), `${afterDel} ${JSON.stringify(pn)}`);
  await solve(p);
  await solve(p);
  await p.click('#roundNew');
  pn = await panel(p);
  await solve(p);
  const fresh = await p.evaluate(() => window.Fridrich._.roundsOf(JSON.parse(localStorage.getItem('cfop:times:v1'))).map((r) => r.times.length).join());
  check('«Empezar otra» leaves that round half done and the next solve starts a new one', /—\*/.test(pn.slots) && fresh === '5,2,1', fresh);

  // Competition mode: the round instead of today's solves.
  await p.click('#focusOpen');
  await p.waitForTimeout(150);
  const fc = await p.evaluate(() => ({ row: [...document.querySelectorAll('#focusRecent > span:not(.sr-only)')].map((x) => x.textContent).join(' '), stats: document.getElementById('focusStats').textContent }));
  check('competition mode: the round at the bottom (the attempts to come as «—») and which attempt is next', /^\d+\.\d\d — — — —$/.test(fc.row) && /Ronda de 5 · intento 2 de 5/.test(fc.stats), JSON.stringify(fc));
  for (let i = 0; i < 4; i++) await solve(p);
  const fc2 = await p.evaluate(() => ({ row: [...document.querySelectorAll('#focusRecent > span:not(.sr-only)')].map((x) => x.textContent).join(' '), stats: document.getElementById('focusStats').textContent }));
  check('…and at the fifth, the round with its brackets and its average', (fc2.row.match(/\(/g) || []).length === 2 && fc2.row.split(' ').length === 5 && /Ronda de 5 · media/.test(fc2.stats), JSON.stringify(fc2));
  await p.keyboard.press('Escape');

  // Changing to a phase: no round (those solves have their own list).
  await p.selectOption('#scrMode', 'pll');
  const pll = await p.evaluate(() => ({ seg: document.getElementById('roundSeg').hidden, box: document.getElementById('round').hidden }));
  await p.selectOption('#scrMode', 'full');
  const back = await p.evaluate(() => ({ seg: document.getElementById('roundSeg').hidden, box: document.getElementById('round').hidden }));
  check('«Solo PLL» and the other phases: no round; back to whole solves, the round is there again', pll.seg && pll.box && !back.seg && !back.box, JSON.stringify({ pll, back }));

  // Reloading keeps the mode and the round.
  await solve(p);
  await p.reload();
  await p.waitForFunction(() => window.Fridrich && window.Fridrich.scramble());
  pn = await panel(p);
  check('after reloading: still «Ronda de 5», with the round in progress', !pn.hidden && /intento 2 de 5/.test(pn.head) && (await p.getAttribute('#modeRound', 'aria-pressed')) === 'true', JSON.stringify(pn));

  // Progreso.
  await p.evaluate(() => window.Fridrich.showView('progreso'));
  const prog = await p.evaluate(() => ({ hidden: document.getElementById('progRoundsPanel').hidden, rows: [...document.querySelectorAll('#progRounds tbody tr')].map((tr) => tr.lastElementChild.textContent), stats: document.getElementById('progRounds').querySelector('.stats').textContent.replace(/\s+/g, ' ') }));
  check('Progreso: «Rondas de 5» with each round done (newest first, in WCA notation) and the best average', !prog.hidden && prog.rows.length === 2 && prog.rows.every((x) => (x.match(/\(/g) || []).length === 2) && /Rondas\s*2/.test(prog.stats) && /Mejor media/.test(prog.stats), JSON.stringify(prog));

  // The plan counts the 3×3 rounds, and «#ronda» opens the clock with a round.
  const plan = await open(ctx, `${SITE}/fridrich#progreso`);
  await plan.goto(`${SITE}/plan`);
  await plan.waitForFunction(() => window.PlanPage && document.querySelector('#week li'));
  const pl = await plan.evaluate(() => ({ rounds: window.EvData.prep().roundsBy['333'], crono: [...document.querySelectorAll('#week > li')][3].querySelector('.pl-week-n').textContent.trim() }));
  check('the plan: the 3×3 rounds of the last four weeks, and today counts as timed solves', pl.rounds === 2 && /^1\/1/.test(pl.crono), JSON.stringify(pl));
  await plan.close();
  await ctx.close();

  ctx = await context();
  await ctx.addInitScript(() => { try { localStorage.setItem('cfop:settings:v1', JSON.stringify({ scrMode: 'pll' })); } catch (e) { /* none */ } });
  p = await open(ctx, `${SITE}/fridrich#ronda`);
  const deep = await p.evaluate(() => ({ view: location.hash, mode: document.getElementById('scrMode').value, round: !document.getElementById('round').hidden }));
  check('«#ronda» (the plan\'s link): the clock, on whole solves, with a round of 5', deep.view === '#crono' && deep.mode === 'full' && deep.round, JSON.stringify(deep));
  await ctx.close();

  // /cfop: the same.
  ctx = await context();
  p = await open(ctx, `${SITE}/cfop#crono`);
  await p.click('#modeRound');
  await solve(p);
  pn = await panel(p);
  check('/cfop (full OLL and PLL): the same round of 5', !pn.hidden && /intento 2 de 5/.test(pn.head), JSON.stringify(pn));
  await ctx.close();

  // Phones.
  for (const [label, opts] of [['Pixel 7', { ...devices['Pixel 7'] }], ['iPhone on its side', { viewport: { width: 750, height: 340 }, isMobile: true, hasTouch: true }]]) {
    ctx = await context(opts);
    p = await open(ctx, `${SITE}/fridrich#crono`);
    await p.click('#modeRound');
    const o = await p.evaluate(() => {
      const box = document.getElementById('round').getBoundingClientRect();
      return { over: document.documentElement.scrollWidth - window.innerWidth, inside: box.left >= 0 && box.right <= window.innerWidth + 1 };
    });
    check(`${label}: the round on screen, no sideways scroll`, o.over <= 0 && o.inside, JSON.stringify(o));
    await ctx.close();
  }

  check('no page errors', errs.length === 0, errs.join(' | '));
  results.forEach((r) => console.log(r));
  console.log(`page errors: ${errs.length ? JSON.stringify(errs) : 'none'}`);
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
