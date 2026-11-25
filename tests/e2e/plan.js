// «Mi plan» (/plan), the WCA 2027 roadmap made live from what every section keeps: with CFOP solves (with their
// phases), 3BLD attempts, a 2×2 round and some cases marked, the phases and their state, the goals reached,
// what to do today, the week's routine counted by itself and the sessions added by hand, the F2L share, the
// starting point against now, the competition with its countdown and the last four weeks' checklist (and
// what the plan recommends then), the theme, CFOP's links at the level in use, and phones without sideways
// scroll.
const { chromium, devices } = require('playwright');
const { SITE } = require('../env');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);

// What the other sections would have saved: 12 CFOP solves a minute apart today (Ao12 about 31,5 s, every one
// timed by phases), three correct 3BLD attempts, a 2×2 round of 5, and a few cases known in CFOP.
function seed(level) {
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  const now = Date.now();
  const cfop = Array.from({ length: 12 }, (_, i) => ({ at: now - (12 - i) * 60000, t: 30000 + i * 250, pen: 0, scr: 'R U', ph: [5000, 17000, 6000, 3000] }));
  localStorage.setItem('cfop:times:v1', JSON.stringify(cfop));
  localStorage.setItem('cfop:learn:v1', JSON.stringify({ 'oll-1': 'known', 'oll-2': 'known', 'pll-Aa': 'known', f2l1: 'known', 'oll-3': 'learning' }));
  localStorage.setItem('op3bld:times:v1', JSON.stringify(Array.from({ length: 3 }, (_, i) => ({ at: now - (5 - i) * 600000, memo: 120000, exec: 60000, ok: true, scr: "R U F2 L' D B" }))));
  const rd = now - 400000;
  localStorage.setItem('ev:222:times:v1', JSON.stringify(Array.from({ length: 5 }, (_, i) => ({ at: rd + i * 30000, t: 14000 + i * 500, pen: 0, scr: 'R U', rd, ri: i }))));
  if (level) localStorage.setItem('cfop:level:v1', level);
}

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const open = async (opts, level, scheme) => {
    const ctx = await browser.newContext({ ...opts, colorScheme: scheme || 'light' });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.addInitScript(seed, level || '');
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`${SITE}/plan`);
    await p.waitForFunction(() => window.PlanPage && document.querySelector('#phases li'));
    return { ctx, p };
  };
  let { ctx, p } = await open({ viewport: { width: 1280, height: 900 } });

  const menu = await p.evaluate(() => ({ n: document.querySelectorAll('#sxMenu a[data-sx]').length, here: (document.querySelector('#sxMenu a[aria-current="page"]') || {}).textContent || '' }));
  check('the section menu with its 8 sections, «Mi plan» marked', menu.n === 8 && /Mi plan/.test(menu.here), JSON.stringify(menu));
  const phases = await p.evaluate(() => [...document.querySelectorAll('#phases > li')].map((li) => ({ cls: li.className, name: li.querySelector('.pl-phase-name').textContent.trim(), prog: li.querySelector('.pl-phase-prog').textContent, href: li.querySelector('.pl-phase-name').getAttribute('href') })));
  const by = Object.fromEntries(phases.map((x) => [x.name, x]));
  check('six phases in the roadmap\'s order, each linking to its section', phases.map((x) => x.name).join('|') === '3×3|2×2|4×4|Pyraminx|3×3 BLD|Square-1'
    && by['2×2'].href === '2x2' && by.Pyraminx.href === 'pyraminx' && by['Square-1'].href === 'square-1' && by['3×3'].href === 'fridrich', phases.map((x) => `${x.name}→${x.href}`).join(' '));
  check('3×3: Ao12 under 35 s is the first goal reached, and the cases known in CFOP counted', /s-first/.test(by['3×3'].cls) && by['3×3'].prog === 'OLL 2/57 · PLL 1/21 · F2L 1/41', `${by['3×3'].cls} · ${by['3×3'].prog}`);
  check('2×2: a solve without help reaches «Resolver sin ayuda»; BLD: three correct attempts', /s-first/.test(by['2×2'].cls) && /5 tiempos/.test(by['2×2'].prog) && /s-first/.test(by['3×3 BLD'].cls), `${by['2×2'].cls} ${by['3×3 BLD'].cls}`);
  check('4×4, Pyraminx and Square-1 not reached yet', ['4×4', 'Pyraminx', 'Square-1'].every((n) => !/s-first|s-done/.test(by[n].cls)));
  const goals = await p.evaluate(() => [...document.querySelectorAll('#goalsAll tbody tr')].map((tr) => [...tr.querySelectorAll('.pl-goal')].map((g) => g.classList.contains('done'))));
  check('the goals table: six events with their two milestones, the reached ones ticked', goals.length === 6 && goals[0][0] && !goals[0][1] && goals[1][0] && !goals[2][0] && goals[4][0], JSON.stringify(goals));

  // The week: today counts one 3×3 session (10 solves or more), the 2×2 (5 solves), BLD and the timed round.
  const week = async () => p.evaluate(() => [...document.querySelectorAll('#week > li')].map((li) => li.querySelector('.pl-week-n').textContent.trim()));
  const w0 = await week();
  check('the week counts by itself what was done today: 3×3 1/3, the new event, BLD and the timed round', w0.join(' | ') === '1/3 | 1/1 | 1/1 | 1/1', w0.join(' | '));
  const today0 = await p.evaluate(() => ({ h: document.getElementById('hToday').textContent, href: document.querySelector('#today a.btn').getAttribute('href') }));
  check('today: the 3×3 session still to do, with its link to CFOP', today0.h === 'Sesión de 3×3' && today0.href === 'fridrich#entrenar', JSON.stringify(today0));
  await p.click('#week [data-tick="333"][data-d="1"]');
  await p.click('#week [data-tick="333"][data-d="1"]');
  const w1 = await week();
  const today1 = await p.textContent('#hToday');
  await p.reload();
  await p.waitForFunction(() => document.querySelector('#week li'));
  const w2 = await week();
  await p.click('#week [data-tick="333"][data-d="-1"]');
  const w3 = await week();
  check('+1 adds sessions done without the app (kept after reloading), −1 takes them off; with the week full, today says so', /^3\/3 \(2 a mano\)/.test(w1[0]) && today1 === 'Semana completa' && w2[0] === w1[0] && /^2\/3 \(1 a mano\)/.test(w3[0]), `${w1[0]} · ${today1} · ${w2[0]} · ${w3[0]}`);
  const focus = await p.textContent('#focus');
  check('the priority: the F2L share of your solves from their phases (55 %)', /55\s?%/.test(focus), focus.slice(0, 160));
  const start = await p.evaluate(() => [...document.querySelectorAll('#start tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent.trim())));
  const ao12 = start.find((r) => /Ao12/.test(r[0]));
  check('the starting point against now: Ao12 39,1 s in November, now about 31 s (better)', ao12 && /39,1/.test(ao12[1]) && /^3[01],\d s/.test(ao12[2]), JSON.stringify(ao12));

  // The competition: in 20 days, inside the last four weeks.
  const in20 = await p.evaluate(() => { const d = new Date(Date.now() + 20 * 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
  await p.fill('#compUrl', 'worldcubeassociation.org/competitions/Prueba2027');
  await p.fill('#compDate', in20);
  await p.click('#compForm button[type="submit"]');
  const badUrl = await p.evaluate(() => window.EvData.plan().comp.date || '');
  check('a link that is not a web address is not saved', !badUrl, badUrl);
  await p.fill('#compUrl', 'https://www.worldcubeassociation.org/competitions/Prueba2027');
  await p.fill('#compName', 'Open de Prueba 2027');
  await p.click('#compForm button[type="submit"]');
  const comp = await p.evaluate(() => ({ count: document.getElementById('count').textContent, h: document.getElementById('hToday').textContent, href: document.querySelector('#today a.btn').getAttribute('href'), items: [...document.querySelectorAll('#prep [data-prep]')].map((b) => `${b.dataset.prep}:${b.checked ? 1 : 0}${b.disabled ? 'a' : ''}`).join(' '), rounds: [...document.querySelectorAll('#prep .pl-rounds a')].map((a) => a.textContent).join(' '), limits: !!document.querySelector('#prep a[href*="Prueba2027"]') }));
  check('20 days to go, in the last four weeks: the countdown with its name', /20\s*días para Open de Prueba 2027/.test(comp.count) && /Últimas 4 semanas/.test(comp.count), comp.count);
  check('then today is a round of 5 of the event with fewest rounds lately (the 4×4)', comp.h === 'Simula una ronda de 5 de 4×4' && comp.href === '4x4#crono', `${comp.h} ${comp.href}`);
  check('the checklist: rounds per event (3×3 from CFOP solves in a row), inspection and BLD ticked by themselves, the competition\'s page linked',
    comp.items === 'limits:0 rounds:0 inspect:1a bld:1a safe:0 rules:0' && comp.rounds === '3×3: 2 2×2: 1 4×4: 0 Pyraminx: 0 Square-1: 0' && comp.limits, `${comp.items} · ${comp.rounds}`);
  await p.check('#prep [data-prep="limits"]');
  await p.reload();
  await p.waitForFunction(() => document.querySelector('#prep [data-prep]'));
  const kept = await p.evaluate(() => ({ limits: document.querySelector('#prep [data-prep="limits"]').checked, date: document.getElementById('compDate').value, name: document.getElementById('compName').value }));
  check('a ticked item and the competition stay after reloading', kept.limits && kept.date === in20 && kept.name === 'Open de Prueba 2027', JSON.stringify(kept));
  await p.click('#compClear');
  check('«Quitar» forgets the competition', /Ya sabes cuál será/.test(await p.textContent('#count')) && !(await p.evaluate(() => window.EvData.plan().comp.date)));
  // Theme.
  await p.click('[data-theme-set="carbon"]');
  const carbon = await p.evaluate(() => ({ attr: document.documentElement.dataset.theme, kept: localStorage.getItem('op3bld:theme:v1'), pressed: document.querySelector('[data-theme-set="carbon"]').getAttribute('aria-pressed') }));
  await p.click('[data-theme-set="auto"]');
  check('the theme: Carbón applied and kept, Automático back', carbon.attr === 'carbon' && carbon.kept === 'carbon' && carbon.pressed === 'true' && !(await p.evaluate(() => document.documentElement.dataset.theme)), JSON.stringify(carbon));
  await ctx.close();

  // CFOP at the full level: the plan's links go to /cfop.
  ({ ctx, p } = await open({ viewport: { width: 1280, height: 900 } }, 'cfop'));
  const links = await p.evaluate(() => [...document.querySelectorAll('.pl-main a[href]')].map((a) => a.getAttribute('href')).filter((h) => /^(fridrich|cfop)/.test(h)));
  check('with CFOP used at the full level, its links go to /cfop', links.length >= 3 && links.every((h) => h.startsWith('cfop')), links.join(' '));
  await ctx.close();

  // Syncing for real (the test server runs api/_sync.js): a 2×2 time and a step known on one device reach the
  // plan on another with the same code, and the competition set there comes back.
  const fresh = async (url) => { const c = await browser.newContext(); await c.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort()); const pg = await c.newPage(); pg.on('pageerror', (e) => errs.push(e.message)); await pg.goto(url); return { c, pg }; };
  const synced = (pg) => pg.waitForFunction(() => /Sincronizado/.test((document.getElementById('syncStatus') || {}).textContent || ''), null, { timeout: 10000 });
  const A = await fresh(`${SITE}/2x2#ajustes`);
  await A.pg.waitForFunction(() => window.EvPage);
  await A.pg.evaluate(() => { window.EvData.setTimes('222', [{ at: 1700000000000, t: 9000, pen: 0, scr: 'R U' }]); window.EvData.setKnown('222', 'oll', true); });
  await A.pg.click('#syncOn');
  await synced(A.pg);
  const code = (await A.pg.textContent('.code-box')).trim();
  const B = await fresh(`${SITE}/plan`);
  await B.pg.waitForFunction(() => window.PlanPage);
  await B.pg.fill('#syncCode', code);
  await B.pg.click('#syncJoin');
  await synced(B.pg);
  const onB = await B.pg.evaluate(() => document.querySelector('#phases li:nth-child(2) .pl-phase-prog').textContent);
  await B.pg.evaluate(() => window.EvData.setComp({ date: '2027-04-10', name: 'Open B' }));
  await B.pg.click('#syncNow');
  await B.pg.waitForFunction(() => /Sincronizado/.test(document.getElementById('syncStatus').textContent) && Date.now() - window.EvData.load('ev:synced:v1', 0) < 5000);
  await A.pg.click('#syncNow');
  await A.pg.waitForFunction(() => window.EvData.plan().comp.name === 'Open B', null, { timeout: 10000 }).catch(() => {});
  const onA = await A.pg.evaluate(() => window.EvData.plan().comp.name);
  check('sync between devices: the 2×2 time and step reach the plan on the other one, its competition comes back', onB === 'Pasos 1/3 · 1 tiempo' && onA === 'Open B', `${onB} · ${onA}`);
  await A.c.close();
  await B.c.close();

  // Phones.
  for (const [label, opts, scheme] of [['Pixel 7', { ...devices['Pixel 7'] }, 'dark'], ['iPhone on its side', { viewport: { width: 750, height: 340 }, isMobile: true, hasTouch: true }, 'light']]) {
    ({ ctx, p } = await open(opts, '', scheme));
    const o = await p.evaluate(() => ({ over: document.documentElement.scrollWidth - window.innerWidth, out: [...document.querySelectorAll('main *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 1 && !e.closest('.fr-table'); }).length }));
    check(`${label}: no sideways scroll, nothing sticking out`, o.over <= 0 && o.out === 0, JSON.stringify(o));
    await ctx.close();
  }

  check('no page errors', errs.length === 0, errs.join(' | '));
  results.forEach((r) => console.log(r));
  console.log(`page errors: ${errs.length ? JSON.stringify(errs) : 'none'}`);
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
