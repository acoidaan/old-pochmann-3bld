// «Fridrich reducido», practising one phase: the scrambles of «Última capa» and «Solo PLL» leave the cross and
// the F2L done and only bring the cases asked for; their times go to their own list (not the solves', the
// records or the ranking), with their own averages; a note on a solve; the phase times and notes in sync;
// the phone.
const { chromium, devices } = require('playwright');
const { SITE, SHOTS } = require('../env');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const open = async (opts) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('cfop:learn:v1', JSON.stringify({ sune: 'known', antisune: 'learning', i: 'known', head: 'known', ua: 'known' }));
    });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`${SITE}/fridrich#crono`);
    await p.waitForFunction(() => window.Fridrich && window.Fridrich.scramble(), null, { timeout: 40000 });
    return { ctx, p };
  };
  const idle = (p) => p.waitForFunction(() => !document.getElementById('newScr').disabled, null, { timeout: 40000 });
  const sample = async (p, n) => {
    const out = [];
    for (let k = 0; k < n; k++) {
      await idle(p);
      await p.click('#newScr');
      await p.waitForTimeout(30);
      await idle(p);
      out.push(await p.evaluate(() => {
        const M = window.CubeModel;
        const C = window.Cfop;
        const r = C.readCube(M.apply(M.solved(), window.Fridrich.scramble()), 'U');
        const meta = JSON.parse(localStorage.getItem('cfop:scrmeta:v1'));
        return { stage: r.stage, pairs: r.n, m: meta.m, c: meta.c || [] };
      }));
    }
    return out;
  };
  const { ctx, p } = await open({});

  await p.selectOption('#scrMode', 'll');
  await p.selectOption('#scrCases', 'known');
  let s = await sample(p, 6);
  check('última capa · los que me sé: the F2L done, and only known cases (one per step)', s.every((x) => x.pairs === 4 && x.m === 'll' && x.c.join() === 'i,sune,head,ua'), JSON.stringify(s));
  check('última capa: the cross button goes (the cross is done) and the count says the phase', await p.evaluate(() => document.getElementById('crossShow').hidden && /Última capa/.test(document.getElementById('scrCount').textContent)));
  await p.selectOption('#scrCases', 'kl');
  s = await sample(p, 10);
  check('última capa · sé + aprendiendo: the learning case comes too', s.every((x) => x.pairs === 4 && ['sune', 'antisune'].includes(x.c[1])) && s.some((x) => x.c[1] === 'antisune'), JSON.stringify(s.map((x) => x.c[1])));
  await p.selectOption('#scrMode', 'pll');
  await p.selectOption('#scrCases', 'all');
  s = await sample(p, 5);
  check('solo PLL · todos: the OLL done too (stage PLL), two PLL cases', s.every((x) => x.stage >= 4 && x.pairs === 4 && x.m === 'pll' && x.c.length === 2), JSON.stringify(s));

  // Two timed «Solo PLL» solves (by hand): their own list.
  for (let k = 0; k < 2; k++) {
    await idle(p);
    await p.keyboard.down(' ');
    await p.waitForTimeout(400);
    await p.keyboard.up(' ');
    await p.waitForTimeout(600);
    await p.keyboard.press('a');
    await p.waitForTimeout(300);
  }
  const st = await p.evaluate(() => ({
    full: JSON.parse(localStorage.getItem('cfop:times:v1') || '[]').length,
    l: JSON.parse(localStorage.getItem('cfop:ltimes:v1') || '[]').map((r) => r.m),
    stats: document.getElementById('stats').innerText,
    rows: document.querySelectorAll('#history tbody tr').length,
    shown: document.querySelector('[data-hist="pll"]').getAttribute('aria-pressed'),
  }));
  check('solo PLL: the times go to their own list, not to the solves', st.full === 0 && st.l.join() === 'pll,pll' && /SOLVES\s*2/i.test(st.stats) && st.rows === 2 && st.shown === 'true', JSON.stringify(st));
  await p.click('[data-hist="full"]');
  check('the solves list stays empty', /Aún no hay tiempos/.test(await p.evaluate(() => document.getElementById('history').innerText)));
  await p.click('[data-hist="ll"]');
  check('última capa: none yet, says how', /Última capa/.test(await p.evaluate(() => document.getElementById('history').innerText)));
  await p.click('[data-hist="pll"]');

  // A note.
  await p.click('#history [data-note]');
  await p.fill('.fr-note-form input', 'me lie con la T');
  await p.press('.fr-note-form input', 'Enter');
  const note = await p.evaluate(() => ({ text: (document.querySelector('.fr-note-text') || {}).textContent, saved: JSON.parse(localStorage.getItem('cfop:ltimes:v1')).filter((r) => r.no).map((r) => r.no) }));
  check('a note on a solve: saved and shown under it', note.text === 'me lie con la T' && note.saved.join() === 'me lie con la T', JSON.stringify(note));
  await p.click('#history [data-note]');
  await p.fill('.fr-note-form input', '');
  await p.click('.fr-note-form button');
  check('a note emptied goes', await p.evaluate(() => !document.querySelector('.fr-note-text') && !JSON.parse(localStorage.getItem('cfop:ltimes:v1')).some((r) => r.no)));

  // Sync: the phase times travel and a newer note wins.
  const merged = await p.evaluate(() => {
    const F = window.Fridrich._;
    const mine = JSON.parse(localStorage.getItem('cfop:ltimes:v1'));
    const remote = { ltimes: [{ ...mine[0], no: 'desde el móvil', ed: Date.now() + 1000 }, { at: 1000, t: 4000, pen: 0, scr: "R U R'", m: 'll' }] };
    F.mergeIn(remote);
    const l = JSON.parse(localStorage.getItem('cfop:ltimes:v1'));
    return { n: l.length, note: l.find((r) => r.at === mine[0].at).no, data: !!F.syncData().ltimes };
  });
  check('sync: the phase times and their notes travel', merged.n === 3 && merged.note === 'desde el móvil' && merged.data, JSON.stringify(merged));
  await ctx.close();

  // Phone.
  const ph = await open({ ...devices['Pixel 7'] });
  await ph.p.selectOption('#scrMode', 'll');
  await idle(ph.p);
  const over = await ph.p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('phone: fits', over <= 0, String(over));
  await ph.p.screenshot({ path: `${SHOTS}/fridrich-phases-pixel7.png` });
  await ph.ctx.close();

  results.forEach((r) => console.log(r));
  console.log(`page errors: ${errs.length ? JSON.stringify(errs) : 'none'}`);
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
