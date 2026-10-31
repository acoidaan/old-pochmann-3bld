// «Fridrich reducido», importing from csTimer: its export file (sessions, +2, DNF, comments, several solves in the
// same second), choosing the sessions, the solves joining the history in order, importing it again (nothing
// twice), a file that is not csTimer's, and the phone.
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
