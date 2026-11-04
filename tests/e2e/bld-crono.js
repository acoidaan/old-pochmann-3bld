// The 3BLD crono, what came after Fridrich: your memo under the clock (also in competition mode, not in «solo
// memo»), the 3BLD numbers (aciertos, mejor, mo3 with DNF, mejor mo3), each part on its own (an edges-only or
// corners-only scramble goes to its own list, older attempts too), «solo memo» (stop, write it, checked on its
// own, and «Verlo en Practicar»), notes on the attempts (and on another device through sync), and the phone.
const { chromium, devices } = require('playwright');
const { SITE, SHOTS } = require('../env');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const SCR = "U' L2 D' U R2 B' D' U' L2 B2 R' U' B' F' L U2 F R2 U'";   // the app's example: its memo is below
const MEMO_E = 'KD IE XO WJ HL QN X';
const MEMO_C = 'OU SC VN QI F';
const EDGES = "R2 U R U R' U' R' U' R' U R'";          // Ua: only edges move
const CORNERS = "R' F R' B2 R F' R' B2 R2";            // Aa: only corners move

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const open = async (opts, seed) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.addInitScript((x) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('op3bld:v1', JSON.stringify({ scr: x.scr, memoE: x.e, memoC: x.c }));
      if (x.times) localStorage.setItem('op3bld:times:v1', JSON.stringify(x.times));
    }, { scr: SCR, e: MEMO_E, c: MEMO_C, ...(seed || {}) });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`${SITE}/#crono`);
    await p.waitForFunction(() => window.OP3);
    return { ctx, p };
  };
  const tap = async (p) => { await p.keyboard.press(' '); await wait(120); };
  const attempt = async (p, ok) => { await tap(p); await tap(p); await tap(p); await p.click(ok ? '#markOk' : '#markDnf'); };
  const stats = (p) => p.evaluate(() => Object.fromEntries([...document.querySelectorAll('#stats .stat')].map((s) => [s.querySelector('span').textContent, s.querySelector('b').textContent])));
  const times = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('op3bld:times:v1') || '[]'));

  // ---------- Your memo under the clock ----------
  const { ctx, p } = await open({});
  let m = await p.evaluate(() => ({ hidden: document.getElementById('clockMemo').hidden, text: document.getElementById('clockMemo').innerText.replace(/\s+/g, ' ') }));
  check('memo: the one from «Practicar» under the clock, when it solves the scramble', !m.hidden && m.text.includes(MEMO_E) && m.text.includes(MEMO_C), JSON.stringify(m));
  await p.evaluate(() => { const el = document.getElementById('memoE'); el.value = 'AB'; el.dispatchEvent(new Event('input')); });
  check('memo: one that does not solve it is not shown', await p.evaluate(() => document.getElementById('clockMemo').hidden));
  await p.evaluate((v) => { const el = document.getElementById('memoE'); el.value = v; el.dispatchEvent(new Event('input')); }, MEMO_E);
  await p.click('#focusOpen');
  await wait(200);
  m = await p.evaluate(() => { const el = document.getElementById('clockMemo'); const r = el.getBoundingClientRect(); return { shown: !el.hidden && r.width > 0 && getComputedStyle(el).visibility !== 'hidden', text: el.innerText }; });
  check('memo: in competition mode too', m.shown && m.text.includes('KD IE'), JSON.stringify(m));
  await tap(p);
  check('memo: and while memorising', await p.evaluate(() => !document.getElementById('clockMemo').hidden && document.body.dataset.timer === 'memo'));
  await tap(p); await tap(p);
  await p.click('#markOk');
  await p.click('#focusExit');

  // ---------- The numbers ----------
  await attempt(p, false);
  await attempt(p, true);
  let st = await stats(p);
  check('numbers: aciertos, mejor, mo3 (a DNF makes it DNF), no «media últimos 5»', st.Intentos === '3' && /^2 \(67 %\)$/.test(st.Aciertos) && st.mo3 === 'DNF' && st['Mejor mo3'] === '—' && !('Media últimos 5' in st) && 'Ejecución media' in st, JSON.stringify(st));
  await attempt(p, true);
  await attempt(p, true);
  st = await stats(p);
  check('numbers: three solved in a row → mo3 and mejor mo3', /^0:0\d\.\d\d$/.test(st.mo3) && st['Mejor mo3'] === st.mo3, JSON.stringify(st));
  const memoInHist = await p.evaluate(() => (document.querySelector('#history .h-memo') || {}).textContent || '');
  check('history: each attempt with its memo', memoInHist.includes('KD IE XO'), memoInHist);

  // ---------- A note ----------
  await p.click('#history [data-note]');
  await p.fill('.h-note-form input', 'fallé la paridad');
  await p.press('.h-note-form input', 'Enter');
  let note = await p.evaluate(() => ({ shown: (document.querySelector('#history .h-note') || {}).textContent, saved: JSON.parse(localStorage.getItem('op3bld:times:v1')).filter((t) => t.no).map((t) => [t.no, !!t.ed]) }));
  check('note: saved, with its edit time, and shown under the attempt', note.shown === 'fallé la paridad' && note.saved.length === 1 && note.saved[0][1], JSON.stringify(note));
  await p.click('#history [data-note]');
  await p.fill('.h-note-form input', '');
  await p.click('.h-note-form button');
  check('note: emptied, it goes', await p.evaluate(() => !document.querySelector('#history .h-note') && !JSON.parse(localStorage.getItem('op3bld:times:v1')).some((t) => t.no)));

  // ---------- Parts: edges only, corners only ----------
  await p.evaluate((s) => { const el = document.getElementById('scr'); el.value = s; el.dispatchEvent(new Event('input')); }, EDGES);
  await wait(100);
  check('parts: an edges-only scramble says it goes to its own list, and the list follows it', await p.evaluate(() => /solo de aristas/.test(document.getElementById('cronoKind').textContent) && document.querySelector('[data-part="edges"]').getAttribute('aria-pressed') === 'true' && /Aún no hay intentos de «Solo aristas»/.test(document.getElementById('history').innerText)));
  await attempt(p, true);
  st = await stats(p);
  check('parts: its attempt counts there, alone', st.Intentos === '1', JSON.stringify(st));
  await p.click('[data-part="full"]');
  st = await stats(p);
  check('parts: the whole ones keep theirs', st.Intentos === '5', JSON.stringify(st));
  await ctx.close();
  // Older attempts sort themselves by their scramble.
  const old = await open({}, { times: [
    { at: 1, memo: 20000, exec: 30000, ok: true, scr: SCR },
    { at: 2, memo: 9000, exec: 11000, ok: true, scr: CORNERS },
    { at: 3, memo: 8000, exec: 9000, ok: false, scr: EDGES },
  ] });
  await old.p.click('[data-part="corners"]');
  const oc = await stats(old.p);
  await old.p.click('[data-part="edges"]');
  const oe = await stats(old.p);
  check('parts: older attempts sorted by their scramble (corners 1, edges 1)', oc.Intentos === '1' && oc.Mejor === '0:20.00' && oe.Intentos === '1' && /^0 \(0 %\)$/.test(oe.Aciertos), `${JSON.stringify(oc)} ${JSON.stringify(oe)}`);
  await old.ctx.close();

  // ---------- Solo memo ----------
  const sm = await open({});
  await sm.p.click('[data-cm="memo"]');
  check('solo memo: your memo is not under the clock, the list is «Solo memo»', await sm.p.evaluate(() => document.getElementById('clockMemo').hidden && document.querySelector('[data-part="memo"]').getAttribute('aria-pressed') === 'true'));
  await tap(sm.p);
  await wait(300);
  await tap(sm.p);
  check('solo memo: the second tap stops it and asks for the memo', await sm.p.evaluate(() => !document.getElementById('memoAsk').hidden && document.activeElement.id === 'maE'));
  await sm.p.fill('#maE', MEMO_E.toLowerCase());
  await sm.p.fill('#maC', MEMO_C);
  await sm.p.press('#maC', 'Enter');
  let t = (await times(sm.p)).slice(-1)[0];
  check('solo memo: a memo that solves it → correct, saved as «memo» with no execution', t.m === 'memo' && t.ok && t.exec === 0 && t.memo >= 250 && /Correcto/.test(await sm.p.evaluate(() => document.getElementById('afterText').textContent)), JSON.stringify(t));
  await tap(sm.p);
  await tap(sm.p);
  await sm.p.fill('#maE', 'AB');
  await sm.p.click('#memoAsk button');
  t = (await times(sm.p)).slice(-1)[0];
  st = await stats(sm.p);
  check('solo memo: one that does not → «fallos», and its own numbers', !t.ok && t.mem === 'AB · —' && st.Intentos === '2' && 'Mejor memo' in st && !('Ejecución media' in st), `${JSON.stringify(t)} ${JSON.stringify(st)}`);
  await sm.p.click('#afterCheck');
  const pr = await sm.p.evaluate(() => ({ view: window.OP3.currentView(), e: document.getElementById('memoE').value, res: document.getElementById('result').className }));
  check('solo memo: «Verlo en Practicar» opens it there with what you wrote, checked', pr.view === 'practicar' && pr.e === 'AB' && /ko/.test(pr.res), JSON.stringify(pr));
  await sm.p.evaluate(() => window.OP3.showView('crono'));
  await tap(sm.p);
  await sm.p.keyboard.press('Escape');
  check('solo memo: Esc cancels it', await sm.p.evaluate(() => document.getElementById('memoAsk').hidden && document.getElementById('clockPhase').textContent === 'Intento cancelado'));
  await sm.p.click('#focusOpen');
  await tap(sm.p);
  await tap(sm.p);
  const fm = await sm.p.evaluate(() => { const r = document.getElementById('maE').getBoundingClientRect(); return r.width > 0 && r.bottom <= innerHeight && getComputedStyle(document.getElementById('memoAsk')).display !== 'none'; });
  check('solo memo: in competition mode, the memo box is on screen', fm);
  await sm.p.screenshot({ path: `${SHOTS}/bld-solo-memo-focus.png` });
  await sm.ctx.close();

  // ---------- A note reaching another device ----------
  const A = await open({});
  await attempt(A.p, true);
  await A.p.evaluate(() => window.OP3.showView('ajustes'));
  await A.p.click('#syncOn');
  await A.p.waitForSelector('.code-box');
  await wait(1500);
  const code = await A.p.evaluate(() => document.querySelector('.code-box').textContent);
  const B = await open({ ...devices['Pixel 7'] });
  await B.p.evaluate(() => window.OP3.showView('ajustes'));
  await B.p.fill('#syncCode', code);
  await B.p.click('#syncJoin');
  await wait(2000);
  await A.p.evaluate(() => window.OP3.showView('crono'));
  await A.p.click('#history [data-note]');
  await A.p.fill('.h-note-form input', 'me perdí en la K');
  await A.p.press('.h-note-form input', 'Enter');
  await A.p.evaluate(() => window.OP3.showView('ajustes'));
  await A.p.click('#syncNow');
  await wait(1500);
  await B.p.click('#syncNow');
  await wait(1500);
  const bn = await B.p.evaluate(() => (JSON.parse(localStorage.getItem('op3bld:times:v1')) || []).map((x) => x.no).filter(Boolean));
  check('note: reaches the other device', bn.join() === 'me perdí en la K', JSON.stringify(bn));

  // ---------- Phone ----------
  await B.p.evaluate(() => window.OP3.showView('crono'));
  await wait(200);
  const over = await B.p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check('phone: fits', over <= 0, String(over));
  await B.p.screenshot({ path: `${SHOTS}/bld-crono-pixel7.png`, fullPage: true });
  await A.ctx.close();
  await B.ctx.close();

  results.forEach((r) => console.log(r));
  console.log(`page errors: ${errs.length ? JSON.stringify(errs) : 'none'}`);
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
