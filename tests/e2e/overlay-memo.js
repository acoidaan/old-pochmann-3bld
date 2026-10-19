// Memo on the overlay while executing: only a checked memo, hidden with memo=0, kept with the result.
const { chromium } = require('playwright');
const { SITE_PLAIN: SITE, FONTS_CSS: css } = require('../env');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SCR = "D2 F2 U' B2 R2 U2 F2 D' L2 U' R' D2 B' U F' L' D2 F L2 B'";

(async () => {
  const b = await chromium.launch();
  const errs = [];
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ contentType: 'text/css', body: css }));
  const app = await ctx.newPage();
  app.on('pageerror', (e) => errs.push('app: ' + e.message));
  await app.goto(`${SITE}/#practicar`);
  await app.evaluate((s) => window.OP3.loadPractice(s, '', ''), SCR);
  await app.click('#generate');
  const memoE = await app.inputValue('#memoE');
  const memoC = await app.inputValue('#memoC');

  // Two overlays in the same browser (BroadcastChannel): default and memo=0.
  const ov = await ctx.newPage();
  ov.on('pageerror', (e) => errs.push('ov: ' + e.message));
  await ov.goto(`${SITE}/overlay.html`);
  const off = await ctx.newPage();
  await off.goto(`${SITE}/overlay.html?memo=0`);
  await wait(600);
  const memoBox = (p) => p.evaluate(() => {
    const m = document.getElementById('memoLine');
    return { hidden: m.hidden, text: m.textContent.replace(/\s+/g, ' ').trim(), pill: document.getElementById('phase').textContent };
  });

  await app.click('.tab[data-go=crono]');
  await app.keyboard.press('Space'); await wait(400);
  let s = await memoBox(ov);
  check('memo hidden while memorizing', s.hidden && s.pill === 'Memorizando', JSON.stringify(s));
  await app.keyboard.press('Space'); await wait(400);
  s = await memoBox(ov);
  check('checked memo shown while executing', !s.hidden && s.text === `Aristas${memoE}Esquinas${memoC}`, JSON.stringify(s));
  const o = await memoBox(off);
  check('memo=0 keeps it hidden', o.hidden && o.pill === 'Ejecutando a ciegas', JSON.stringify(o));
  await ov.setViewportSize({ width: 1920, height: 1080 });
  await app.keyboard.press('Space'); await wait(400);
  s = await memoBox(ov);
  check('still shown on ¿Resuelto?', !s.hidden && s.pill === '¿Resuelto?', JSON.stringify(s));
  await app.click('#markOk'); await wait(500);
  s = await memoBox(ov);
  check('result keeps the memo', !s.hidden && s.pill === 'Resuelto' && s.text.includes(memoE), JSON.stringify(s));

  // A memo that does not solve the scramble is not shown.
  await app.click('.tab[data-go=practicar]');
  await app.fill('#memoE', 'AB CD');
  await app.dispatchEvent('#memoE', 'input');
  await app.click('.tab[data-go=crono]');
  await app.keyboard.press('Space'); await wait(200);
  await app.keyboard.press('Space'); await wait(400);
  s = await memoBox(ov);
  check('wrong memo not shown', s.hidden && s.pill === 'Ejecutando a ciegas', JSON.stringify(s));
  await app.keyboard.press('Escape'); await wait(300);

  // Odd edge count shows the parity tag.
  await app.click('.tab[data-go=practicar]');
  await app.evaluate(() => window.OP3.loadPractice('R', '', ''));
  await app.click('#generate');
  const odd = (await app.inputValue('#memoE')).replace(/\s/g, '').length % 2 === 1;
  await app.click('.tab[data-go=crono]');
  await app.keyboard.press('Space'); await wait(200);
  await app.keyboard.press('Space'); await wait(400);
  s = await memoBox(ov);
  check('parity tag on an odd edge memo', odd && !s.hidden && s.text.includes('+ R-perm'), `${odd} ${JSON.stringify(s)}`);
  await app.keyboard.press('Escape');

  // Panel option writes memo=0 into the URL.
  await app.click('.tab[data-go=ajustes]');
  await app.waitForSelector('#ovMemo');
  await app.uncheck('#ovMemo');
  check('panel option sets memo=0', (await app.inputValue('#ovUrl')).includes('memo=0'), await app.inputValue('#ovUrl'));
  await app.check('#ovMemo');

  console.log(results.join('\n'));
  console.log('page errors:', errs.length ? errs : 'none');
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
