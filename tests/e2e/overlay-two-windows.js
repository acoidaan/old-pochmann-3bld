// Two app windows connected to OBS at once: the overlay must follow the one in use, not flicker.
const { chromium } = require('playwright');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { SITE_PLAIN: SITE } = require('../env');
const PASS = 'secreto123';
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const b64 = (s) => crypto.createHash('sha256').update(s).digest('base64');
let forward = null;
const wss = new WebSocketServer({ port: 4455 });
let sessions = 0;
wss.on('connection', (sock) => {
  const salt = 'c2FsdA==';
  const challenge = 'Y2hhbGxlbmdl';
  sock.send(JSON.stringify({ op: 0, d: { obsStudioVersion: '31.0.2', rpcVersion: 1, authentication: { salt, challenge } } }));
  sock.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m.op === 1) {
      if (m.d.authentication !== b64(b64(PASS + salt) + challenge)) { sock.close(4009); return; }
      sessions++;
      sock.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
    } else if (m.op === 6) {
      sock.send(JSON.stringify({ op: 7, d: { requestType: m.d.requestType, requestId: m.d.requestId, requestStatus: { result: true, code: 100 } } }));
      const rd = m.d.requestData.requestData;
      if (forward) forward(rd.event_name, rd.event_data);
    }
  });
});

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const obsCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await obsCtx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const obs = await obsCtx.newPage();
  obs.on('pageerror', (e) => errs.push('obs: ' + e.message));
  await obs.goto(`${SITE}/overlay.html`);
  forward = (n, d) => { obs.evaluate(([n2, d2]) => window.dispatchEvent(new CustomEvent(n2, { detail: d2 })), [n, d]).catch(() => {}); };
  const pill = () => obs.evaluate(() => document.getElementById('phase').textContent);

  // Same browser profile, two windows of the app, both connected to OBS.
  const appCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await appCtx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const connect = async (p) => {
    await p.goto(`${SITE}/#ajustes`);
    await p.waitForSelector('#ovPass');
    await p.fill('#ovPass', PASS);
    await p.click('#ovConnect');
    await wait(800);
  };
  const a = await appCtx.newPage();
  a.on('pageerror', (e) => errs.push('a: ' + e.message));
  await connect(a);
  const bPage = await appCtx.newPage();
  bPage.on('pageerror', (e) => errs.push('b: ' + e.message));
  await connect(bPage);
  check('both windows connected', sessions >= 2, String(sessions));

  // Use window A: start the timer and watch the overlay for 8 s (B keeps sending heartbeats).
  await a.bringToFront();
  await a.click('.tab[data-go=crono]');
  await a.keyboard.press('Space');
  const seen = {};
  for (let i = 0; i < 40; i++) { const p = await pill(); seen[p] = (seen[p] || 0) + 1; await wait(200); }
  check('overlay stays on the window in use', Object.keys(seen).length === 1 && seen.Memorizando === 40, JSON.stringify(seen));

  // Switch to B and use it: the overlay follows B.
  await bPage.bringToFront();
  await bPage.click('.tab[data-go=crono]');
  await wait(600);
  const afterSwitch = await pill();
  check('overlay follows the window you switch to', afterSwitch === 'Listo' || afterSwitch === 'Resuelto' || afterSwitch === 'DNF', afterSwitch);
  const seenB = {};
  for (let i = 0; i < 25; i++) { const p = await pill(); seenB[p] = (seenB[p] || 0) + 1; await wait(200); }
  check('and stays there (A still timing in the background)', !seenB.Memorizando, JSON.stringify(seenB));

  // Back to A.
  await a.bringToFront();
  await a.keyboard.press('Space');
  await wait(500);
  check('back to A when it is used again', (await pill()) === 'Ejecutando a ciegas', await pill());

  // Closing the window on stream hands over after a few seconds.
  await a.close();
  await wait(14000);
  const p2 = await pill();
  check('after closing it, the other window takes over', p2 !== 'Ejecutando a ciegas', p2);

  console.log(results.join('\n'));
  console.log('page errors:', errs.length ? errs : 'none');
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
  wss.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
