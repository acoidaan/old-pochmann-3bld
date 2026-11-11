// «Fridrich reducido», importing from csTimer: its export file (sessions, +2, DNF, comments, several solves in the
// same second), choosing the sessions, the solves joining the history in order, importing it again (nothing
// twice), a file that is not csTimer's, solves timed by phases («multi-phase»: each phase, the history, the
// averages; the ones brought before get theirs; in sync), and the phone.
const { chromium, devices } = require('playwright');
const { SITE, SHOTS } = require('../env');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);

const T0 = 1761900000;   // unix seconds
const CS = {
  session1: [
    [[0, 12345], "R U R' U'", '', T0],
    [[2000, 11000], "F R U", 'se me cayó', T0 + 60],
    [[-1, 15000], "D L2", '', T0 + 120],
    [[0, 10500], "B2 U", '', T0 + 120],
  ],
  session2: [[[0, 25000], "R U", '', T0 + 30]],
  session3: [],
  properties: { sessionData: JSON.stringify({ 1: { name: '3x3 casa', opt: {} }, 2: { name: 'OH', opt: { scrType: '333oh' } }, 3: { name: 'vacía' } }) },
};

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const open = async (opts) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.addInitScript((at) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('cfop:times:v1', JSON.stringify([{ at, t: 9000, pen: 0, scr: 'U' }]));
    }, T0 * 1000 + 90000);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`${SITE}/fridrich#ajustes`);
    await p.waitForFunction(() => window.Fridrich && window.Fridrich.scramble(), null, { timeout: 40000 });
    return { ctx, p };
  };
  const file = (obj, name = 'cstimer_20261031.txt') => ({ name, mimeType: 'text/plain', buffer: Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)) });
  const times = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('cfop:times:v1') || '[]'));
  const toastText = (p) => p.evaluate(() => [...document.querySelectorAll('.toast')].map((x) => x.textContent).join(' | '));

  const { ctx, p } = await open({});
  await p.setInputFiles('#csFile', file(CS));
  await p.waitForSelector('#csBox:not([hidden]) [data-cs]');
  const list = await p.evaluate(() => [...document.querySelectorAll('[data-cs]')].map((b) => [b.closest('label').innerText.replace(/\s+/g, ' ').trim(), b.checked]));
  check('csTimer: the sessions with their names and counts (the empty one left out); 3x3 ticked, OH not', list.length === 2 && /3x3 casa · 4 tiempos/.test(list[0][0]) && list[0][1] && /OH · 1 tiempo · 333oh/.test(list[1][0]) && !list[1][1], JSON.stringify(list));
  await p.click('#csGo');
  let t = await times(p);
  const imp = t.filter((r) => r.at !== T0 * 1000 + 90000);
  check('import: 4 solves, in order with the one already there', t.length === 5 && t.every((r, i) => !i || r.at > t[i - 1].at), JSON.stringify(t.map((r) => r.at - T0 * 1000)));
  check('import: +2, DNF, the comment as a note, the scramble', imp[1].pen === 2 && imp[1].t === 11000 && imp[1].no === 'se me cayó' && imp[2].pen === 'dnf' && imp[0].scr === "R U R' U'" && imp[0].t === 12345, JSON.stringify(imp));
  check('import: two in the same second stay two', imp[2].at + 1 === imp[3].at, JSON.stringify(imp.map((r) => r.at)));
  check('import: says how many, and the history and the stats show them', /4 tiempos importados/.test(await toastText(p)) && /Solves\s*5/i.test(await p.evaluate(() => document.getElementById('stats').innerText)) && (await p.evaluate(() => document.querySelectorAll('#history tbody tr').length)) >= 5, await toastText(p));
  check('import: the box closes', await p.evaluate(() => document.getElementById('csBox').hidden));

  // Again, now with OH too: only OH is new.
  await p.setInputFiles('#csFile', file(CS));
  await p.waitForSelector('#csBox:not([hidden]) [data-cs]');
  await p.check('[data-cs="1"]');
  await p.click('#csGo');
  t = await times(p);
  check('again: nothing twice, only the new session', t.length === 6 && /1 tiempo importado · 4 ya estaban/.test(await toastText(p)), `${t.length} ${await toastText(p)}`);

  // Not csTimer's.
  await p.setInputFiles('#csFile', file('hola', 'otra.txt'));
  await p.waitForTimeout(300);
  check('a file that is not csTimer: says so, nothing changes', /no es una copia de csTimer/.test(await toastText(p)) && (await times(p)).length === 6 && await p.evaluate(() => document.getElementById('csBox').hidden));
  // None chosen.
  await p.setInputFiles('#csFile', file(CS));
  await p.waitForSelector('#csBox:not([hidden]) [data-cs]');
  await p.uncheck('[data-cs="0"]');
  await p.click('#csGo');
  check('none chosen: asks for one', /Elige al menos una sesión/.test(await toastText(p)) && !(await p.evaluate(() => document.getElementById('csBox').hidden)));
  await p.click('#csCancel');

  // By phases in csTimer («multi-phase»): [penalty, total, end of phase 3, of 2, of 1]. The first one came
  // before without them and gets them now; one of 3 phases stays as it is; a DNF, without.
  const CS2 = {
    session1: [
      [[0, 12345, 10000, 6000, 2000], "R U R' U'", '', T0],
      [[0, 20000, 15000, 9000, 4000], 'U2 F', '', T0 + 300],
      [[0, 9000, 6000, 3000], 'L2 B', '', T0 + 360],
      [[-1, 30000, 20000, 10000, 5000], 'D2', '', T0 + 420],
    ],
    properties: { sessionData: JSON.stringify({ 1: { name: '3x3 fases', opt: { phases: 4 } } }) },
  };
  await p.setInputFiles('#csFile', file(CS2));
  await p.waitForSelector('#csBox:not([hidden]) [data-cs]');
  const lab = await p.evaluate(() => document.querySelector('[data-cs]').closest('label').innerText.replace(/\s+/g, ' ').trim());
  check('multi-phase: the session says how many came by phases', /3x3 fases · 4 tiempos · 3 por fases/.test(lab), lab);
  await p.click('#csGo');
  t = await times(p);
  const at = (dt) => t.find((r) => r.at === (T0 + dt) * 1000) || {};
  check('multi-phase: each phase as csTimer’s P.1 … P.4, adding up to the time', JSON.stringify(at(300).ph) === '[4000,5000,6000,5000]', JSON.stringify(at(300)));
  check('multi-phase: the one brought before gets its phases; says so', JSON.stringify(at(0).ph) === '[2000,4000,4000,2345]' && /3 tiempos importados · 1 ya estaba \(le he añadido sus fases\)/.test(await toastText(p)), `${JSON.stringify(at(0))} ${await toastText(p)}`);
  check('multi-phase: 3 phases kept as they are; a DNF without them', JSON.stringify(at(360).ph) === '[3000,3000,3000]' && !at(420).ph && at(420).pen === 'dnf', JSON.stringify([at(360), at(420)]));
  const hist = await p.evaluate(() => [...document.querySelectorAll('#history tbody tr')].map((tr) => [...tr.cells].map((c) => c.textContent.trim())));
  const row = (time) => hist.find((c) => c[1] && c[1].startsWith(time)) || [];
  check('multi-phase: the history shows cross, F2L, OLL and PLL', row('20.00').slice(3, 7).join() === '4.00,5.00,6.00,5.00', JSON.stringify(row('20.00')));
  check('multi-phase: other phases than the four, each one in order', /Fases 3\.00 · 3\.00 · 3\.00/.test(row('9.00').join(' ')), JSON.stringify(row('9.00')));
  check('multi-phase: where the time goes, from the solves by phases', /media de 2 solves por fases/.test(await p.evaluate(() => document.getElementById('phasesN').textContent)), await p.evaluate(() => document.getElementById('phasesN').textContent));
  // Sync: the phases of a solve another device had without them.
  const synced = await p.evaluate((x) => {
    const F = window.Fridrich._;
    const plain = JSON.parse(localStorage.getItem('cfop:times:v1')).find((r) => r.at === x);
    F.mergeIn({ times: [{ ...plain, ph: [1000, 2000, 3000, plain.t - 6000] }] });
    return JSON.parse(localStorage.getItem('cfop:times:v1')).find((r) => r.at === x).ph;
  }, (T0 + 60) * 1000);
  check('sync: phases that come in fill a solve without them', JSON.stringify(synced) === '[1000,2000,3000,5000]', JSON.stringify(synced));
  await ctx.close();

  const ph = await open({ ...devices['Pixel 7'] });
  await ph.p.setInputFiles('#csFile', file(CS));
  await ph.p.waitForSelector('#csBox:not([hidden]) [data-cs]');
  const over = await ph.p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('phone: fits', over <= 0, String(over));
  await ph.p.locator('#csBox').screenshot({ path: `${SHOTS}/fridrich-cstimer-pixel7.png` });
  await ph.ctx.close();

  results.forEach((r) => console.log(r));
  console.log(`page errors: ${errs.length ? JSON.stringify(errs) : 'none'}`);
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
