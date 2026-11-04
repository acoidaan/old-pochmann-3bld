// The 3BLD page's «Progreso» and the training sessions in «Entrenar»: the numbers (BldStats: week by week, the
// days and the streaks, the time practised, where you fail) on a known history; the view (summary, the two
// charts, the letters, the calendar, the time table, empty); «Entrenar esas aristas» starting a session with
// them; a session (only its letters, three in a row to master one and the next one coming in, a miss resetting
// it, the eye showing the setup without counting, kept on reload, ended); the practice time in sync; the phone
// with seven tabs and the iPhone on its side.
const { chromium, devices } = require('playwright');
const { SITE, SHOTS } = require('../env');
const axeSrc = require('fs').readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const SCR = "U' L2 D' U R2 B' D' U' L2 B2 R' U' B' F' L U2 F R2 U'";
const DAY = 86400000;
// Fourteen days of attempts, two a day, every fourth one a DNF; the memo gets quicker.
function history(now) {
  const out = [];
  for (let d = 13; d >= 0; d--) {
    for (let k = 0; k < 2; k++) {
      const i = out.length;
      out.push({ at: now - d * DAY - (2 - k) * 3600000, memo: 60000 - i * 1000, exec: 50000, ok: i % 4 !== 3, scr: SCR });
    }
  }
  return out;
}

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const open = async (opts, seed, hash = 'progreso') => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.addInitScript((x) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      Object.entries(x || {}).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
    }, seed || {});
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`${SITE}/#${hash}`);
    await p.waitForFunction(() => window.OP3 && window.BldStats);
    return { ctx, p };
  };
  const now = Date.now();
  const train = {
    edge: { K: { seen: 6, right: 2, streak: 0, w: 9, dnf: 2 }, D: { seen: 4, right: 1, streak: 0, w: 7 }, B: { seen: 5, right: 5, streak: 5, w: 1 } },
    corner: { V: { seen: 3, right: 1, streak: 0, w: 5, dnf: 1 } },
  };
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  const seed = { 'op3bld:times:v1': history(now), 'op3bld:trainer:v1': train, 'op3bld:practice:v1': { dev1: { [today]: 25 * 60000 } } };

  // ---------- The numbers ----------
  const { ctx, p } = await open({}, seed);
  const eng = await p.evaluate((n) => {
    const S = window.BldStats;
    const times = JSON.parse(localStorage.getItem('op3bld:times:v1'));
    const wk = S.weekly(times, n, 3);
    const act = S.activity(times, { }, n, 18);
    const P = S.practiceTime(times, window.Practice.days(), n);
    const f = S.fails(JSON.parse(localStorage.getItem('op3bld:trainer:v1')), window.OP3.trainLetters);
    return { wkN: wk.reduce((a, w) => a + w.n, 0), rates: wk.map((w) => w.rate), streak: act.streak, days: act.days, cells: act.cells.length, realToday: P.real.today, timedTotal: P.timed.total, fails: f.map((x) => x.L).join(','), mastered: f.some((x) => x.L === 'B') };
  }, now);
  check('numbers: 28 attempts over the last weeks, every fourth a DNF', eng.wkN === 28 && eng.rates.every((r) => r == null || (r > 0.6 && r < 0.9)), JSON.stringify(eng));
  check('numbers: 14 days in a row, a calendar of 18 weeks', eng.streak === 14 && eng.days === 14 && eng.cells > 17 * 7, JSON.stringify(eng));
  check('numbers: time practised (25 min today) and timed (memo + execution of all)', eng.realToday === 25 * 60000 && eng.timedTotal === history(now).reduce((a, t) => a + t.memo + t.exec, 0), JSON.stringify(eng));
  check('numbers: where you fail, worst first (K broke two attempts, then V one), the one mastered left out', eng.fails === 'K,V,D' && !eng.mastered, eng.fails);

  // ---------- The view ----------
  const v = await p.evaluate(() => ({
    lead: document.querySelector('.bp-lead').textContent,
    tiles: [...document.querySelectorAll('#bpSummary .stat')].map((s) => `${s.querySelector('span').textContent}=${s.querySelector('b').textContent}`),
    bars: document.querySelectorAll('#bpWeeks .bp-bar').length,
    dots: document.querySelectorAll('#bpWeeks .bp-dot').length,
    fails: [...document.querySelectorAll('.bp-fails li')].map((li) => li.querySelector('.bp-letter').textContent).join(','),
    cells: document.querySelectorAll('.bp-hm i').length,
    time: document.querySelector('.bp-time') && document.querySelector('.bp-time').innerText.replace(/\s+/g, ' '),
  }));
  check('view: the summary (28 intentos, aciertos, mejor single, mejor mo3, racha, practicado)', /Llevas 28 intentos completos/.test(v.lead) && v.tiles.some((t) => /^Racha=14 días$/.test(t)) && v.tiles.some((t) => /^Mejor mo3=\d/.test(t)) && v.tiles.some((t) => /^Practicado=25 min$/.test(t)), JSON.stringify(v));
  check('view: week by week, the aciertos bars and the memo and execution lines', v.bars >= 2 && v.dots >= 4, `${v.bars} ${v.dots}`);
  check('view: the letters that cost you, and the calendar', v.fails === 'K,V,D' && v.cells > 100, `${v.fails} ${v.cells}`);
  check('view: the time table (today: 25 min practising)', /Hoy 25 min/.test(v.time || ''), v.time);
  await p.screenshot({ path: `${SHOTS}/bld-progreso-1280.png`, fullPage: true });
  const axe = async (what) => {
    await p.evaluate(axeSrc);
    const v = await p.evaluate(async () => (await window.axe.run(document.querySelector('.view:not([hidden])'), { resultTypes: ['violations'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`));
    check(`axe: «${what}» with data, no violations`, !v.length, v.join(' | '));
  };
  await axe('Progreso');

  // ---------- From «Dónde fallas» to a session ----------
  await p.click('[data-bp-train="edge"]');
  await wait(200);
  let s = await p.evaluate(() => ({ view: window.OP3.currentView(), ses: window.OP3.trainer.sessionState(), letter: window.OP3.trainer.state().letter }));
  check('session: «Entrenar esas aristas» opens «Entrenar» with them first, five in all', s.view === 'entrenar' && s.ses.kind === 'edge' && s.ses.set.slice(0, 2).join() === 'K,D' && s.ses.set.length === 5 && s.ses.set.includes(s.letter), JSON.stringify(s));
  const answer = async (right) => {
    const L = await p.evaluate(() => window.OP3.trainer.state().letter);
    const setup = right ? await p.evaluate((x) => window.OP3.MODES.edge.table[x] || '', L) : "R U R' U' R U";
    await p.fill('#trInput', setup);
    await p.click('#trSubmit');
    const fb = await p.evaluate(() => document.getElementById('trFeedback').innerText);
    await p.click('#trSubmit');   // «Siguiente»
    return { L, fb };
  };
  const seen = new Set();
  for (let i = 0; i < 12; i++) seen.add((await answer(true)).L);
  s = await p.evaluate(() => window.OP3.trainer.sessionState());
  check('session: only its letters come up', [...seen].every((L) => s.set.includes(L) || s.done.includes(L)), `${[...seen]} vs ${s.set}+${s.done}`);
  // Master one: answer it right until it goes, with a miss in between that resets it.
  let mastered = null;
  let reset = false;
  for (let i = 0; i < 40 && !mastered; i++) {
    const st = await p.evaluate(() => window.OP3.trainer.sessionState());
    const L = await p.evaluate(() => window.OP3.trainer.state().letter);
    if (!reset && (st.k[L] || 0) === 2) {
      await answer(false);
      const k = await p.evaluate((x) => window.OP3.trainer.sessionState().k[x], L);
      reset = k === 0;
      continue;
    }
    const r = await answer(true);
    if (/dominada/.test(r.fb)) mastered = r;
  }
  s = await p.evaluate(() => window.OP3.trainer.sessionState());
  check('session: a miss resets the streak of that letter', reset);
  check('session: three right in a row → dominada, and the next one comes in', !!mastered && s.done.length >= 1 && s.set.length === 5 && !s.set.includes(s.done[0]) && /Entra la/.test(mastered.fb), JSON.stringify({ mastered, s }));
  const pips = await p.evaluate(() => [...document.querySelectorAll('.tr-ses-l')].length + '|' + [...document.querySelectorAll('.tr-ses-done span')].map((x) => x.textContent).join(','));
  check('session: the bar shows the set with its streaks and the mastered ones', pips.startsWith('5|✓'), pips);

  // The eye.
  const cur = await p.evaluate(() => window.OP3.trainer.state().letter);
  await p.click(`[data-tr-eye="${cur}"]`);
  const peek = await p.evaluate((L) => ({ shown: !document.getElementById('trPeek').hidden, text: document.getElementById('trPeek').textContent, want: window.OP3.MODES.edge.table[L] }), cur);
  check('eye: the setup of that letter in view', peek.shown && peek.text.includes(peek.want || 'sin setup'), JSON.stringify(peek));
  const before = await p.evaluate((L) => window.OP3.trainer.sessionState().k[L] || 0, cur);
  const fbPeek = (await answer(true)).fb;
  const after = await p.evaluate((L) => window.OP3.trainer.sessionState().k[L] || 0, cur);
  check('eye: an answer with it on does not count', after === before && /no cuenta/.test(fbPeek), `${before} → ${after} · ${fbPeek}`);

  // Kept on reload, then ended.
  await p.reload();
  await p.waitForFunction(() => window.OP3);
  s = await p.evaluate(() => window.OP3.trainer.sessionState());
  check('session: kept on reload', s && s.done.length >= 1 && s.peek[cur] === true, JSON.stringify(s));
  await p.evaluate(() => window.OP3.showView('entrenar'));
  await p.click('#trSesEnd');
  s = await p.evaluate(() => ({ ses: window.OP3.trainer.sessionState(), btn: !!document.getElementById('trSesGo') }));
  check('session: «Terminar» ends it and offers a new one', !s.ses && s.btn, JSON.stringify(s));
  await p.click('#trSesGo');
  s = await p.evaluate(() => window.OP3.trainer.sessionState());
  const first = await p.evaluate((L) => { const x = JSON.parse(localStorage.getItem('op3bld:trainer:v1')).edge[L]; return x && (x.dnf || x.seen > x.right); }, s && s.set[0]);
  check('session: «Empezar sesión» picks five, one that costs you first', s && s.set.length === 5 && new Set(s.set).size === 5 && first, JSON.stringify(s && s.set));
  await p.screenshot({ path: `${SHOTS}/bld-sesion-1280.png` });
  await axe('Entrenar' + ' con una sesión');

  // ---------- Eight tabs on a desktop: no page wider than the window ----------
  for (const w of [1280, 1100, 900]) {
    await p.setViewportSize({ width: w, height: 800 });
    await wait(150);
    const o = await p.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, gear: [...document.querySelectorAll('.tab-ajustes, .rail-gear')].some((x) => x.getBoundingClientRect().width > 0) }));
    check(`desktop ${w}: the tabs fit, Ajustes still reachable`, o.over <= 0 && o.gear, JSON.stringify(o));
  }

  await ctx.close();

  // ---------- Empty ----------
  const e = await open({}, {});
  check('empty: says so, no panels', await e.p.evaluate(() => /Aún no hay nada que contar/.test(document.getElementById('bpSummary').textContent) && document.getElementById('bpWeeksPanel').hidden));
  await e.ctx.close();

  // ---------- Practice time in sync ----------
  const A = await open({}, seed, 'ajustes');
  await A.p.click('#syncOn');
  await A.p.waitForSelector('.code-box');
  await wait(1500);
  const code = await A.p.evaluate(() => document.querySelector('.code-box').textContent);
  const B = await open({ ...devices['Pixel 7'] }, {}, 'ajustes');
  await B.p.fill('#syncCode', code);
  await B.p.click('#syncJoin');
  await wait(2000);
  const bp = await B.p.evaluate(() => window.Practice.days());
  check('sync: the practice time reaches the other device', Object.values(bp).reduce((a, b) => a + b, 0) >= 25 * 60000, JSON.stringify(bp));

  // ---------- Phone ----------
  await B.p.evaluate(() => window.OP3.showView('progreso'));
  await wait(300);
  const ph = await B.p.evaluate(() => ({
    over: document.documentElement.scrollWidth - innerWidth,
    tabs: [...document.querySelectorAll('#tabs .tab')].filter((t) => t.getBoundingClientRect().width > 30).map((t) => t.innerText.trim()),
    clipped: [...document.querySelectorAll('#tabs .tab span')].filter((x) => x.getBoundingClientRect().width > 0 && x.scrollWidth > x.clientWidth + 1).map((x) => x.textContent),
  }));
  check('phone: fits, seven tabs at the bottom with Progreso, none cut', ph.over <= 0 && ph.tabs.length === 7 && ph.tabs.includes('Progreso') && !ph.clipped.length, JSON.stringify(ph));
  await B.p.screenshot({ path: `${SHOTS}/bld-progreso-pixel7.png`, fullPage: true });
  await A.ctx.close();
  await B.ctx.close();
  const land = await open({ viewport: { width: 750, height: 340 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, seed);
  const ls = await land.p.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, tabs: document.getElementById('tabs').getBoundingClientRect().height }));
  check('iPhone on its side: fits, a slim menu', ls.over <= 0 && ls.tabs < 60, JSON.stringify(ls));
  await land.p.evaluate(() => window.OP3.showView('entrenar'));
  const le = await land.p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  check('iPhone on its side: «Entrenar» with the session fits', le <= 0, String(le));
  await land.ctx.close();

  results.forEach((r) => console.log(r));
  console.log(`page errors: ${errs.length ? JSON.stringify(errs) : 'none'}`);
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
