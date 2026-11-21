// M2 for the edges in 3BLD («Aprender → M2», m2.js) and the sections of the app (sections.js). M2: every
// letter's algorithm does what M2 should (the buffer DF swapped with that letter, the rest as M2 leaves it),
// random cubes come out solved with their traced M2 memo (parity and Old Pochmann corners included), the
// course is chosen and remembered, a letter turns on the cube, the special ones as second of a pair, the
// letters drill keeps score, and a typed memo is checked by solving with it. Sections: the menu in every
// page, where you are marked, CFOP going to the level last used, Escape closing it, and phones.
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
    await p.goto(`${SITE}${url}`);
    return { ctx, p };
  };
  const settled = (p) => p.waitForFunction(() => { const c = document.getElementById('m2Cube'); return c && !c.dataset.busy && c.dataset.facelets; }, null, { timeout: 20000 });

  // ================= The method =================
  let { ctx, p } = await open({ viewport: { width: 1200, height: 900 } }, '/#aprender');
  await p.waitForFunction(() => window.BldM2 && window.OP3);
  const algs = await p.evaluate(() => {
    const B = window.BldM2; const M = window.CubeModel; const E = window.OP3.MODES.edge.posOf;
    const m2 = M.apply(M.solved(), 'M2');
    const piece = (L) => M.PIECE_OF[E[L]];
    return B.TARGETS.filter((L) => !B.SPECIAL[L]).filter((L) => {
      const st = M.apply(M.solved(), B.ALG[L]);
      const mine = new Set([...piece('U'), ...piece(L), ...piece('A')]);
      const swap = st[E[L]] === E.U && st[E.U] === E[L];
      const rest = st.every((v, i) => mine.has(i) || v === m2[i]);
      return !(swap && rest);
    });
  });
  check('each letter (but C, W, I, S): the buffer DF swapped with it, the rest of the cube as M2 leaves it', algs.length === 0, algs.join());
  const sim = await p.evaluate(() => {
    const B = window.BldM2; const M = window.CubeModel;
    let ok = 0; let odd = 0; const bad = [];
    for (let i = 0; i < 400; i++) {
      const scr = M.randomMoveScramble(25);
      const st = M.apply(M.solved(), scr);
      const e = B.trace(st, 'edge', ['U', 'K']);
      if (e.length % 2) odd++;
      if (B.solves(st, e)) ok++; else if (bad.length < 3) bad.push(`${scr} → ${e.join('')}`);
    }
    return { ok, odd, bad };
  });
  check('400 random cubes solved with their M2 edge memo (specials as second of a pair swapped, parity, then Old Pochmann corners), some with parity', sim.ok === 400 && sim.odd > 50, JSON.stringify(sim));

  // ================= The course =================
  const c0 = await p.evaluate(() => ({ op: !document.getElementById('learnPanel').hidden, m2: !document.getElementById('m2Panel').hidden }));
  await p.click('[data-course="m2"]');
  await p.waitForSelector('#m2Cube polygon');
  const c1 = await p.evaluate(() => ({ op: !document.getElementById('learnPanel').hidden, m2: !document.getElementById('m2Panel').hidden, letters: document.querySelectorAll('button.m2-letter').length, prog: document.getElementById('m2Progress').textContent }));
  await p.reload();
  await p.waitForFunction(() => window.BldM2);
  const c2 = await p.evaluate(() => !document.getElementById('m2Panel').hidden);
  check('«Aprender»: Old Pochmann by default; «M2 · aristas» shows the course (22 letters, the buffer apart) and is remembered', c0.op && !c0.m2 && !c1.op && c1.m2 && c1.letters === 22 && /0 de 22/.test(c1.prog) && c2, JSON.stringify({ c0, c1, c2 }));

  await p.click('.m2-letter[data-m2-letter="B"]');
  const busy = await p.evaluate(() => document.getElementById('m2Cube').dataset.busy);
  await p.waitForFunction(() => !document.querySelector('#m2Line [aria-current]') && document.getElementById('m2Cube').dataset.busy !== '1', null, { timeout: 20000 });
  await settled(p);
  const b = await p.evaluate(() => {
    const M = window.CubeModel;
    return { f: document.getElementById('m2Cube').dataset.facelets === M.toFacelets(M.apply(M.solved(), window.BldM2.ALG.B)), detail: document.getElementById('m2Detail').innerText, now: document.getElementById('m2Now').innerText };
  });
  check('a letter (B): it turns on the cube (white up) to the state after its algorithm; its setup, M2 and the undo, in words', busy === '1' && b.f && /UR/.test(b.now) && /R U R' U'/.test(b.detail) && /lleva B a UB/.test(b.detail), JSON.stringify(b));
  await p.locator('#m2Cube').screenshot({ path: `${SHOTS}/bld-m2-cube.png` });
  await p.click('.m2-play[data-m2-letter="W"][data-m2-second="1"]');
  await p.waitForTimeout(100);
  const w = await p.evaluate(() => ({ line: [...document.querySelectorAll('#m2Line .m2-mv')].map((x) => x.textContent).join(' '), now: document.getElementById('m2Now').innerText }));
  check('a special one as second of a pair (W): C\'s algorithm', w.line === "U2 M' U2 M'" && /segunda/.test(w.now), JSON.stringify(w));

  // ================= Drills =================
  const L = await p.evaluate(() => document.querySelector('.m2-qletter').textContent);
  await p.click('[data-m2-drill="show"]');
  const shownAlg = await p.evaluate(() => !!document.querySelector('#m2Drill .m2-alg .m2-mv'));
  await p.click('[data-m2-drill="ok"]');
  const k = await p.evaluate((x) => (JSON.parse(localStorage.getItem('op3bld:m2:v1')).k || {})[x], L);
  const next = await p.evaluate(() => document.querySelector('.m2-qletter').textContent);
  check('letters drill: «Ver el algoritmo» shows it, «Me lo sabía» counts for that letter, and another comes', shownAlg && k === 1 && next !== L, JSON.stringify({ L, k, next }));
  const ans = await p.evaluate(() => window.BldM2.trace(window.CubeModel.apply(window.CubeModel.solved(), document.getElementById('m2Scr').textContent), 'edge', ['U', 'K']).join(''));
  await p.fill('#m2MemoIn', 'AB');
  await p.click('#m2MemoForm button[type=submit]');
  const wrong = await p.textContent('#m2MemoMsg');
  await p.fill('#m2MemoIn', ans.replace(/(..)/g, '$1 '));
  await p.click('#m2MemoForm button[type=submit]');
  const right = await p.textContent('#m2MemoMsg');
  check('memo drill: a wrong one is said, the right one (with spaces, any case) is good', /No resuelve/.test(wrong) && /✓ Bien/.test(right), `${wrong} | ${right}`);
  await ctx.close();

  // ================= The sections =================
  ({ ctx, p } = await open({ viewport: { width: 1200, height: 800 } }, '/cfop#crono'));
  await p.waitForFunction(() => window.Fridrich);
  const cf = await p.evaluate(() => ({ h1: document.querySelector('h1').textContent, lv: document.querySelector('.sx-level a[aria-current]').dataset.lv }));
  await p.goto(`${SITE}/#practicar`);
  await p.waitForFunction(() => window.OP3);
  const btn = p.locator('.sx-btn:visible').first();
  await btn.click();
  const menu = await p.evaluate(() => {
    const m = [...document.querySelectorAll('.sx-menu')].find((x) => !x.hidden);
    return { items: [...m.querySelectorAll('a')].map((a) => a.textContent.trim().split('\n')[0]), here: m.querySelector('a[aria-current]').dataset.sx, cfop: new URL(m.querySelector('a[data-sx="cfop"]').href).pathname };
  });
  await p.keyboard.press('Escape');
  const closed = await p.evaluate(() => [...document.querySelectorAll('.sx-menu')].every((m) => m.hidden));
  check('sections: one menu (A ciegas, CFOP, Principiante), where you are marked, CFOP goes to the level last used (here completa), Escape closes it; CFOP shows its level', menu.items.length === 3 && menu.here === 'bld' && menu.cfop === '/cfop' && closed && cf.h1 === 'CFOP' && cf.lv === 'full', JSON.stringify({ menu, closed, cf }));
  await ctx.close();

  for (const [name, opts] of [['pixel7', { ...devices['Pixel 7'] }], ['iphone-landscape', { viewport: { width: 750, height: 340 }, isMobile: true, hasTouch: true }]]) {
    ({ ctx, p } = await open(opts, '/#aprender'));
    await p.waitForFunction(() => window.BldM2);
    // The algorithms' rail, stuck at the top of a phone, folded away first (as you would on its side).
    if (await p.evaluate(() => document.getElementById('railToggle').getAttribute('aria-expanded') === 'true')) await p.click('#railToggle');
    await p.click('[data-course="m2"]');
    await p.waitForSelector('#m2Cube polygon');
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.locator('.sx-btn:visible').first().click();
    const ph = await p.evaluate(() => {
      const m = [...document.querySelectorAll('.sx-menu')].find((x) => !x.hidden).getBoundingClientRect();
      return { over: document.documentElement.scrollWidth - window.innerWidth, menuIn: m.left >= 0 && m.right <= window.innerWidth };
    });
    await p.screenshot({ path: `${SHOTS}/bld-m2-${name}.png` });
    check(`${name}: M2 with no sideways scroll, and the sections menu inside the screen`, ph.over <= 0 && ph.menuIn, JSON.stringify(ph));
    await ctx.close();
  }

  check('no page errors', errs.length === 0, errs.join(' | '));
  results.forEach((r) => console.log(r));
  console.log(`page errors: ${errs.length ? JSON.stringify(errs) : 'none'}`);
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
