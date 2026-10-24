// End-to-end: app → fake obs-websocket (password auth) → "OBS" browser context running overlay.html.
// Also: live preview in Ajustes, overlay window via BroadcastChannel, wrong password, screenshots.
const { chromium } = require('playwright');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { SITE_PLAIN: SITE, SHOTS, FONTS_CSS: css } = require('../env');
const PASS = 'secreto123';
const out = (n) => `${SHOTS}/${n}.png`;
const results = [];
const check = (name, ok, extra) => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };

// ---- fake OBS ----
const b64 = (s) => crypto.createHash('sha256').update(s).digest('base64');
let forward = null;          // set to a function that delivers event_data to the OBS page
const vendorCalls = [];
let identifyOk = 0;
const wss = new WebSocketServer({ port: 4455 });
wss.on('connection', (sock) => {
  const salt = crypto.randomBytes(16).toString('base64');
  const challenge = crypto.randomBytes(16).toString('base64');
  sock.send(JSON.stringify({ op: 0, d: { obsStudioVersion: '31.0.2', obsWebSocketVersion: '5.5.4', rpcVersion: 1, authentication: { salt, challenge } } }));
  sock.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m.op === 1) {
      const want = b64(b64(PASS + salt) + challenge);
      if (m.d.authentication !== want || m.d.rpcVersion !== 1) { sock.close(4009, 'Authentication failed.'); return; }
      identifyOk++;
      sock.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
    } else if (m.op === 6) {
      const ok = m.d.requestType === 'CallVendorRequest' && m.d.requestData.vendorName === 'obs-browser' && m.d.requestData.requestType === 'emit_event';
      sock.send(JSON.stringify({ op: 7, d: { requestType: m.d.requestType, requestId: m.d.requestId, requestStatus: { result: ok, code: ok ? 100 : 400 } } }));
      if (ok) {
        const rd = m.d.requestData.requestData;
        vendorCalls.push(rd);
        // obs-browser: window.dispatchEvent(new CustomEvent(event_name, { detail: event_data }))
        if (forward) forward(rd.event_name, rd.event_data);
      }
    }
  });
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const watch = (p, tag) => {
    p.on('pageerror', (e) => errs.push(`${tag}: ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error' && !/cubejs|Failed to load resource/.test(m.text())) errs.push(`${tag}: ${m.text()}`); });
  };
  const fonts = async (ctx) => { await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ contentType: 'text/css', body: css })); await ctx.route(/fonts\.gstatic\.com/, (r) => r.abort()); };

  // "OBS": its own context (separate storage, no BroadcastChannel link to the app).
  const obsCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await fonts(obsCtx);
  const obs = await obsCtx.newPage();
  watch(obs, 'obs');
  await obs.goto(`${SITE}/wrap.html#` + encodeURIComponent('overlay.html'));
  await wait(800);
  const isOv = (f) => { try { return new URL(f.url()).pathname === '/overlay.html'; } catch (e) { return false; } };
  const ovFrame = () => obs.frames().find(isOv);
  forward = (name, data) => { ovFrame().evaluate(([n, d]) => window.dispatchEvent(new CustomEvent(n, { detail: d })), [name, data]).catch(() => {}); };
  const ov = (fn) => ovFrame().evaluate(fn);
  check('overlay waits for the app first', await ov(() => !document.getElementById('wait').hidden));

  // The app (the user's browser).
  const appCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await fonts(appCtx);
  const app = await appCtx.newPage();
  watch(app, 'app');
  await app.goto(`${SITE}/#ajustes`);
  await app.waitForSelector('#ovFrame', { timeout: 8000 });
  await app.fill('#setName', 'Aco');
  await app.dispatchEvent('#setName', 'change');
  await wait(1500);
  const pf = app.frames().find(isOv);
  const previewName = await pf.evaluate(() => document.getElementById('who').textContent);
  check('live preview gets the app state', previewName === 'Aco', previewName);
  check('overlay URL is absolute', (await app.inputValue('#ovUrl')) === `${SITE}/overlay.html`, await app.inputValue('#ovUrl'));
  await app.selectOption('#ovLayout', 'derecha');
  check('URL follows options', (await app.inputValue('#ovUrl')).endsWith('overlay.html?layout=derecha'));
  check('large cards disabled for columns', await app.isDisabled('#ovBig'));
  await app.selectOption('#ovLayout', 'esquinas');

  // Wrong password first.
  await app.fill('#ovPass', 'mal');
  await app.click('#ovConnect');
  await wait(1200);
  const badTxt = await app.textContent('#ovStatus');
  check('wrong password is reported', /contraseña no es correcta/.test(badTxt), badTxt);

  await app.fill('#ovPass', PASS);
  await app.click('#ovConnect');
  await wait(1200);
  const okTxt = await app.textContent('#ovStatus');
  check('connects with the right password', /Conectado a OBS 31\.0\.2/.test(okTxt) && identifyOk === 1, okTxt);
  await wait(400);
  check('OBS overlay received state', await ov(() => document.getElementById('wait').hidden && document.getElementById('who').textContent === 'Aco'));
  check('payload sent as JSON string field', vendorCalls.length > 0 && typeof vendorCalls[0].event_data.p === 'string' && vendorCalls[0].event_name === 'op3bld');
  await app.screenshot({ path: out('app-ajustes-1280'), fullPage: false });

  // Timer through the overlay.
  await app.click('.tab[data-go=crono]');
  check('"En OBS" mark next to the timer', await app.isVisible('#obsLive'));
  const scr = await app.evaluate(() => window.OP3.scramble());
  await app.keyboard.press('Space');
  await wait(450);
  const memoPill = await ov(() => document.getElementById('phase').textContent);
  check('memo phase reaches OBS', memoPill === 'Memorizando', memoPill);
  const t1 = await ov(() => document.getElementById('time').textContent);
  await wait(600);
  const t2 = await ov(() => document.getElementById('time').textContent);
  check('overlay clock runs on its own', t1 !== t2 && /^0:0\d\.\d\d$/.test(t2), `${t1} → ${t2}`);
  await app.keyboard.press('Space');
  await wait(450);
  check('execution phase', (await ov(() => document.getElementById('phase').textContent)) === 'Ejecutando a ciegas');
  await obs.screenshot({ path: out('e2e-exec') });
  await app.keyboard.press('Space');
  await wait(450);
  check('waiting for verdict', (await ov(() => document.getElementById('phase').textContent)) === '¿Resuelto?');
  await app.click('#markOk');
  await wait(600);
  const after = await ov(() => ({
    pill: document.getElementById('phase').textContent,
    banner: (document.querySelector('.banner') || {}).textContent,
    stats: document.getElementById('statsBody').textContent,
  }));
  check('result + first-solve banner', after.pill === 'Resuelto' && after.banner === '¡Primer resuelto!', JSON.stringify(after));
  check('today stats updated', /Intentos1Resueltos1100%/.test(after.stats.replace(/\s+/g, '')), after.stats);
  await obs.screenshot({ path: out('e2e-first') });

  // Second attempt as DNF, then a cancelled one.
  await app.keyboard.press('Space'); await wait(200); await app.keyboard.press('Space'); await wait(200); await app.keyboard.press('Space'); await wait(200);
  await app.click('#markDnf');
  await wait(500);
  const dnf = await ov(() => [document.getElementById('phase').textContent, document.querySelectorAll('.chip').length, document.getElementById('timerCard').dataset.tone]);
  check('DNF shown with two chips', dnf[0] === 'DNF' && dnf[1] === 2 && dnf[2] === 'dnf', JSON.stringify(dnf));
  await app.keyboard.press('Space'); await wait(300); await app.keyboard.press('Escape'); await wait(400);
  check('cancel shown', (await ov(() => document.getElementById('phase').textContent)) === 'Intento cancelado');

  // Scramble + cube: the overlay must show the app's scramble and the same cube state.
  const newScr = "R U R' U' F2 D B'";
  await app.click('.tab[data-go=practicar]');
  await app.fill('#scr', newScr);
  await app.dispatchEvent('#scr', 'input');
  await wait(600);
  const shown = await ov(() => document.getElementById('scrText').textContent);
  const cubeApp = await app.evaluate(() => {
    const O = window.OP3; const st = O.apply(O.solved(), O.scramble()); let s = '';
    for (const f of ['U', 'L', 'F', 'R', 'B', 'D']) { const b = 9 * O.FACE_ORDER.indexOf(f); for (let i = 0; i < 9; i++) s += O.faceOfSticker(st[b + i]); }
    return s;
  });
  const cubeOv = await ov(() => [...document.querySelectorAll('#net i')].map((c) => c.className.slice(2)).join(''));
  check('scramble text follows the app', shown === newScr, shown);
  check('cube net matches the app model', cubeApp === cubeOv && cubeOv.length === 54, cubeOv);
  check('scramble before was shown too', scr.length > 0);

  // Reload the OBS source: it should come back with the cached state, then live again.
  await obs.reload();
  await wait(900);
  check('reloaded source restores last state', await ov(() => document.getElementById('wait').hidden && document.getElementById('scrText').textContent === "R U R' U' F2 D B'"));

  // Fallback: overlay window in the same browser (BroadcastChannel), chroma background.
  await app.click('.tab[data-go=ajustes]');
  await app.click('.ov-more:nth-of-type(2) summary').catch(() => {});
  await app.evaluate(() => { document.querySelectorAll('.ov-more').forEach((d) => { d.open = true; }); });
  const [win] = await Promise.all([app.waitForEvent('popup'), app.click('#ovWindow')]);
  await wait(1200);
  const w = await win.evaluate(() => [getComputedStyle(document.body).backgroundColor, document.getElementById('who').textContent, document.getElementById('scrText').textContent]);
  check('overlay window: chroma + live data', w[0] === 'rgb(0, 255, 0)' && w[1] === 'Aco' && w[2] === "R U R' U' F2 D B'", JSON.stringify(w));

  // Disconnect.
  await app.click('#ovDisconnect');
  await wait(300);
  check('disconnect', /Desconectado/.test(await app.textContent('#ovStatus')));

  // UI screenshots of the panel.
  for (const [name, vw, scheme] of [['panel-390-dark', 390, 'dark'], ['panel-1280-light', 1280, 'light']]) {
    const c = await browser.newContext({ viewport: { width: vw, height: 1400 }, colorScheme: scheme });
    await fonts(c);
    const p = await c.newPage();
    watch(p, name);
    await p.goto(`${SITE}/#ajustes`);
    await p.waitForSelector('#ovFrame');
    await wait(1200);
    const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(`${name} no horizontal overflow`, over <= 0, String(over));
    await p.screenshot({ path: out(name), fullPage: false });
    await c.close();
  }

  console.log(results.join('\n'));
  console.log('page errors:', errs.length ? errs : 'none');
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
  wss.close();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
