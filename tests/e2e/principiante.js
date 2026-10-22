// «Aprende a resolver el cubo» (/principiante), the beginner's method: the method itself (lbl.js solves any
// cube with the seven steps and the beginner's rules, and never goes back a step), the seven steps to learn
// with their pictures and «Ya me lo sé», the solution of a scramble for a normal cube, the live help with the
// smart cube (it says what to do, follows each turn, waits in the middle of an algorithm and catches up when
// you do something else), the timer with the time of each step, «Contra el reloj», the trainer for one step
// (with the cube and with a normal one, «Me he perdido»), Progreso and its goals, sync, the links from the
// other pages and the phone.
const { chromium, devices } = require('playwright');
const { SITE, SHOTS } = require('../env');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const open = async (opts, hash, data) => {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, ...opts });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    if (data) {
      await ctx.addInitScript((x) => {
        if (sessionStorage.getItem('seeded')) return;
        sessionStorage.setItem('seeded', '1');
        Object.entries(x).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
      }, data);
    }
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${e.message} ${(e.stack || '').split('\n')[1] || ''}`));
    await p.goto(`${SITE}/principiante?cubo=virtual#${hash}`);
    await p.waitForFunction(() => window.Principiante && window.Lbl, null, { timeout: 30000 });
    return { ctx, p };
  };
  const connect = async (p) => {
    await p.click('#cubeSim');
    await p.waitForFunction(() => window.Principiante.cube().on);
  };
  // The virtual cube does what the help says (as the method holds it: white down), all at once.
  const doNext = (p) => p.evaluate(() => {
    const c = window.Principiante.cube();
    const pl = window.Lbl.next(c.state);
    if (pl.kind === 'solved') return 'solved';
    const back = pl.view ? window.CubeModel.invertAlg(pl.view) : '';
    c.link.turn(['z2', pl.view, ...pl.hand, back, 'z2'].filter(Boolean).join(' '));
    return pl.kind;
  });

  // ================= The method =================
  const { p, ctx } = await open({}, 'aprender');
  const method = await p.evaluate(() => {
    const M = window.CubeModel; const L = window.Lbl;
    const out = { n: 0, solved: 0, back: 0, empty: 0, max: 0, kinds: {} };
    for (let i = 0; i < 300; i++) {
      const scr = M.randomMoveScramble(30);
      const r = L.solve(scr, 200);
      out.n++;
      if (!r.solved) continue;
      out.solved++;
      let st = M.apply(M.solved(), scr);
      let prev = L.read(st).stage;
      let moves = 0;
      r.plans.forEach((pl) => {
        if (!pl.hand.length) out.empty++;
        moves += pl.hand.length;
        out.kinds[pl.kind] = 1;
        st = L.after(st, pl);
        const s = L.read(st).stage;
        if (s < prev) out.back++;
        prev = s;
      });
      out.max = Math.max(out.max, moves);
    }
    out.kinds = Object.keys(out.kinds).sort().join(',');
    return out;
  });
  check('method: 300 random cubes solved with the 7 steps, never a step back, every plan with turns', method.solved === 300 && method.back === 0 && method.empty === 0 && method.max < 260, JSON.stringify(method));
  check('method: every kind of plan comes up (daisy, down, corners, second layer, the four last-layer steps)', ['corner', 'daisy', 'down', 'middle', 'ycorners', 'ycross', 'yedges', 'yface'].every((k) => method.kinds.includes(k)), method.kinds);
  const rules = await p.evaluate(() => {
    const M = window.CubeModel; const L = window.Lbl; const C = window.Cfop;
    const base = M.apply(M.solved(), C.DOWN.U);
    const rep = (n) => M.invertAlg(Array.from({ length: n }, () => "R U R' U'").join(' '));
    // White corners: right 1, up 3, front 5.
    const corners = [1, 3, 5].map((n) => { const p = L.nextG(M.apply(base, rep(n))); return `${p.kind}:${p.looks}:${p.reps}:${p.view || '-'}:${p.pre || '-'}`; });
    // Second layer: the T, to the right and to the left.
    const middle = ['right', 'left'].map((g) => { const p = L.nextG(M.apply(base, M.invertAlg(L.ALG[g]))); return `${p.kind}:${p.goes}:${p.pre || '-'}:${p.view || '-'}`; });
    // Yellow cross: the L at the back left, the line from left to right.
    const lpl = L.nextG(M.apply(base, "F R U R' U' F'"));
    const lh = M.apply(lpl.from, lpl.view || '');
    // Yellow face: never more than 3 Sunes.
    let worst = 0;
    for (const id of ['sune', 'antisune', 'h', 'pi', 't', 'u', 'l2']) {
      for (const u of L.AUF) {
        let g = M.apply(M.apply(base, M.invertAlg(C.caseById(id).alg)), u);
        let k = 0;
        while (L.readG(g).stage === 4 && k < 6) { const p = L.nextG(g); g = M.apply(g, [p.view, ...p.hand].filter(Boolean).join(' ')); k++; }
        worst = Math.max(worst, k);
      }
    }
    // Corners: headlights at the back; edges: the full side at the back.
    const head = L.nextG(M.apply(base, M.invertAlg(C.caseById('head').alg)));
    const hh = M.apply(head.from, head.view || '');
    const ua = L.nextG(M.apply(base, M.invertAlg(C.caseById('ub').alg)));
    const uh = M.apply(ua.from, ua.view || '');
    return { corners, middle, l: lpl.shape, lBackLeft: L.isYellow(lh, 1) && L.isYellow(lh, 3), worst, head: head.lights && L.lights(hh).includes('back'), bar: ua.bar && L.bars(uh).includes('back') };
  });
  check('method: a white corner above its slot — R U R\' U\' once if white looks right, 3 if up, 5 if at you', rules.corners.join(' ') === 'corner:right:1:-:- corner:up:3:-:- corner:front:5:-:-', rules.corners.join(' '));
  check('method: the second layer — the T, then the right or the left algorithm', rules.middle.join(' ') === 'middle:right:-:- middle:left:-:-', rules.middle.join(' '));
  check('method: the last layer — L at the back left, never more than 3 Sunes, headlights and the full side at the back', rules.l === 'l' && rules.lBackLeft && rules.worst <= 3 && rules.head && rules.bar, JSON.stringify(rules));

  // ================= Aprender =================
  const learn = await p.evaluate(() => ({
    steps: document.querySelectorAll('.pr-step').length,
    goals: [...document.querySelectorAll('.pr-step .pr-goal svg')].length,
    algs: [...new Set([...document.querySelectorAll('.pr-algbox .fr-alg')].map((x) => x.innerText.replace(/\s+/g, ' ').trim()))],
    cases: document.querySelectorAll('.pr-case svg').length,
    path: document.querySelectorAll('#path li').length,
    count: document.getElementById('knownCount').innerText,
    tab: document.querySelector('[data-go="aprender"]').getAttribute('aria-current'),
  }));
  check('aprender: 7 steps, each with a picture of its goal, the 7 algorithms and the cases drawn', learn.steps === 7 && learn.goals === 7 && learn.algs.length === 7 && learn.cases >= 16 && learn.path === 7 && learn.tab === 'page', JSON.stringify(learn));
  await p.click('#basics summary');
  const basics = await p.evaluate(() => ({ turns: document.querySelectorAll('.pr-turns svg').length, text: document.getElementById('basicsBody').innerText }));
  check('aprender: before starting — the pieces, how to hold it, how turns read (with pictures), how to scramble', basics.turns === 8 && /centros/.test(basics.text) && /amarillo arriba/.test(basics.text) && /R'/.test(basics.text) && /blanco arriba/.test(basics.text), JSON.stringify({ turns: basics.turns }));
  await p.check('[data-known="cross"]');
  await p.check('[data-known="corners"]');
  const known = await p.evaluate(() => ({ count: document.getElementById('knownCount').innerText, first: document.querySelector('#path li').className, next: document.querySelectorAll('#path li')[2].className, badge: document.querySelector('#paso-1 .pr-badge').innerText, saved: JSON.parse(localStorage.getItem('lbl:known:v1')) }));
  check('aprender: «Ya me lo sé» ticks the step, counts it, points to the next one and is saved', known.count === 'Te sabes 2 de 7' && known.first === 'known' && known.next === 'next' && known.badge === '✓' && known.saved.cross > 0 && known.saved['cross@'] > 0, JSON.stringify(known));
  await p.screenshot({ path: `${SHOTS}/principiante-aprender-1200.png` });

  // ================= Resolver, without the smart cube =================
  await p.evaluate(() => window.Principiante.showView('resolver'));
  const SCR = "R2 D' B2 U F2 L2 D2 F' R U2 B' L' D F2 R2 U' B L2 F D2";
  await p.evaluate((s) => window.Principiante._.setScramble(s), SCR);
  await p.click('#solution summary');
  await p.waitForFunction(() => document.querySelector('.pr-sol'), null, { timeout: 5000 }).catch(() => {});
  const sol = await p.evaluate(() => ({ steps: document.querySelectorAll('.pr-sol > li').length, plans: document.querySelectorAll('.pr-sol .pr-plan').length, pics: document.querySelectorAll('.pr-sol .pr-plan-pic svg').length, text: document.getElementById('solutionBody').innerText.slice(0, 160) }));
  check('resolver: the whole solution of the scramble with the method, step by step, each move with a picture', sol.steps === 7 && sol.plans >= 12 && sol.pics === sol.plans && /giros/.test(sol.text), JSON.stringify(sol));
  await p.click('#solution summary');
  await p.keyboard.down(' '); await p.waitForTimeout(380); await p.keyboard.up(' ');
  await p.waitForTimeout(300);
  await p.keyboard.down(' '); await p.keyboard.up(' ');
  await p.waitForTimeout(200);
  const t1 = await p.evaluate(() => ({ n: window.Principiante._.times().length, rows: document.querySelectorAll('#history tbody tr').length, stats: document.getElementById('stats').innerText }));
  check('resolver: Space starts and stops the timer; the time goes to the history', t1.n === 1 && t1.rows === 1 && /Resueltos/i.test(t1.stats), JSON.stringify(t1));
  await p.click('#history [data-pen="2"]');
  const pen = await p.evaluate(() => window.Principiante._.times()[0].pen);
  await p.click('#history [data-del]');
  await p.click('#history [data-del]');
  check('resolver: +2 and deleting a time', pen === 2 && await p.evaluate(() => window.Principiante._.times().length === 0), String(pen));

  // ================= Resolver, with the smart cube: the live help =================
  await connect(p);
  await p.evaluate((s) => window.Principiante._.setScramble(s), SCR);
  await p.evaluate((s) => window.Principiante.cube().link.turn(s.split(' ').slice(0, 5).join(' ')), SCR);
  const half = await p.evaluate(() => ({ hint: document.getElementById('scrHint').innerText, live: document.getElementById('liveNow').innerText }));
  check('resolver: scrambling, turn by turn, and no help meanwhile', /Giro 6 de 20/.test(half.hint) && /Mezclando/.test(half.live), JSON.stringify(half));
  await p.evaluate((s) => window.Principiante.cube().link.turn(s.split(' ').slice(5).join(' ')), SCR);
  const ready = await p.evaluate(() => ({ hint: document.getElementById('scrHint').innerText, clock: document.getElementById('clockPhase').innerText, title: (document.querySelector('#liveNow .pr-plan-title') || {}).innerText, cur: document.querySelector('#liveSteps li.cur') && document.querySelector('#liveSteps li.cur').innerText }));
  check('resolver: scrambled → «Mezclado», the clock armed, and the first thing to do (the daisy)', /Mezclado/.test(ready.hint) && /empieza al girar/i.test(ready.clock) && /margarita/i.test(ready.title || '') && /Cruz/.test(ready.cur || ''), JSON.stringify(ready));
  // Doing what it says, half a plan first: it follows each turn.
  const first = await p.evaluate(() => window.Principiante._.live.info.plan);
  const firstHand = first.hand;
  await p.evaluate((m) => window.Principiante.cube().link.turn(`z2 ${m} z2`), firstHand[0]);
  const running = await p.evaluate(() => ({ phase: window.Principiante._.timer.phase, done: document.querySelectorAll('#liveNow .sm.done').length }));
  check('resolver: the first turn starts the clock and the help marks it done', running.phase === 'run' && (firstHand.length === 1 || running.done === 1), JSON.stringify({ running, firstHand }));
  if (firstHand.length > 1) await p.evaluate((m) => window.Principiante.cube().link.turn(`z2 ${m} z2`), firstHand.slice(1).join(' '));
  // Through the steps until a corner that needs R U R' U' more than once, half-way through it.
  let guard = 0;
  let kind = '';
  while (guard++ < 40) {
    kind = await p.evaluate(() => { const lv = window.Principiante._.live.info; return lv && lv.plan ? `${lv.plan.kind}:${lv.plan.reps}` : ''; });
    if (/^corner:[35]$/.test(kind)) break;
    await doNext(p);
  }
  const plan = await p.evaluate(() => window.Principiante._.live.info.plan);
  const pre = plan.pre ? plan.pre.split(' ').length : 0;
  await p.evaluate(({ x, k }) => window.Principiante.cube().link.turn(['z2', x.view, ...x.hand.slice(0, k), x.view ? window.CubeModel.invertAlg(x.view) : '', 'z2'].filter(Boolean).join(' ')), { x: plan, k: pre + 5 });
  const mid = await p.evaluate(() => ({ text: document.getElementById('liveNow').innerText, title: document.querySelector('#liveNow .pr-plan-title').innerText, next: document.querySelector('#liveNow .sm.next') && document.querySelector('#liveNow .sm.next').innerText }));
  check('resolver: in the middle of «R U R\' U\' ×3», the help stays on it and says which time it is', /vas por la 2\.ª/.test(mid.text) && /Esquinas blancas/.test(mid.title) && mid.next === 'U', JSON.stringify({ kind, mid }));
  await p.locator('#live').screenshot({ path: `${SHOTS}/principiante-ayuda-1200.png` });
  // Something else: a wrong turn away from the plan; a few turns later the help catches up with the cube.
  await p.evaluate(() => window.Principiante.cube().link.turn('z2 F z2'));
  const held = await p.evaluate(() => ({ held: !!window.Principiante._.live.info.held, text: document.getElementById('liveNow').innerText }));
  await p.evaluate(() => window.Principiante.cube().link.turn("z2 F' z2"));
  const back = await p.evaluate(() => ({ held: !!window.Principiante._.live.info.held, pos: window.Principiante._.live.info.pos }));
  check('resolver: a turn that breaks the cross waits («sigue…») and undoing it gets back on the plan', held.held && /mitad de un algoritmo/.test(held.text) && !back.held && back.pos === pre + 5, JSON.stringify({ held: held.held, back }));
  await p.evaluate(({ x, k }) => window.Principiante.cube().link.turn(['z2', x.view, ...x.hand.slice(k), x.view ? window.CubeModel.invertAlg(x.view) : '', 'z2'].filter(Boolean).join(' ')), { x: plan, k: pre + 5 });
  guard = 0;
  while (guard++ < 60 && (await doNext(p)) !== 'solved') { /* the rest */ }
  await p.waitForTimeout(200);
  const fin = await p.evaluate(() => {
    const t = window.Principiante._.times();
    const r = t[t.length - 1];
    return { n: t.length, sp: r && r.sp, help: r && r.help, rows: document.querySelectorAll('#splits tbody tr').length, done: document.querySelectorAll('#liveSteps li.done').length, live: document.getElementById('liveNow').innerText, toast: document.getElementById('toast').innerText };
  });
  check('resolver: solving it stops the clock; the time keeps each step (time and turns)', fin.n === 1 && Array.isArray(fin.sp) && fin.sp.length === 7 && fin.sp.every((x) => x && x[1] > 0 || (x && x[1] >= 0)) && fin.rows === 7 && fin.help === 1, JSON.stringify(fin.sp));
  check('resolver: «¡Resuelto!», the 7 steps done and «¡Tu primer cubo resuelto!»', /Resuelto/.test(fin.live) && fin.done === 7 && /primer cubo/.test(fin.toast), JSON.stringify({ done: fin.done, toast: fin.toast }));
  await p.locator('#splits').screenshot({ path: `${SHOTS}/principiante-pasos-1200.png` });

  // «Contra el reloj»: no help while it runs.
  await p.click('#modeClock');
  const scr2 = await p.evaluate(() => window.Principiante.scramble());
  await p.evaluate((s) => window.Principiante.cube().link.turn(s), scr2);
  await doNext(p);
  const clockMode = await p.evaluate(() => ({ phase: window.Principiante._.timer.phase, plan: !!document.querySelector('#liveNow .pr-plan'), text: document.getElementById('liveNow').innerText }));
  check('resolver: «Contra el reloj» — the clock runs and the help is hidden', clockMode.phase === 'run' && !clockMode.plan && /sin ayuda/.test(clockMode.text), JSON.stringify(clockMode));
  guard = 0;
  while (guard++ < 60 && (await doNext(p)) !== 'solved') { /* the rest */ }
  await p.waitForTimeout(150);
  check('resolver: and that one is saved without «con ayuda»', await p.evaluate(() => { const t = window.Principiante._.times(); return t.length === 2 && !t[1].help; }));
  await p.click('#modeHelp');

  // ================= Entrenar =================
  // With the cube: step 5 (the yellow face).
  await p.evaluate(() => window.Principiante.showView('entrenar'));
  await p.click('[data-step="4"]');
  await p.waitForFunction(() => ['setup', 'ready'].includes(window.Principiante._.tr.phase) || window.Principiante._.tr.phase === 'error', null, { timeout: 40000 });
  const setup = await p.evaluate(() => ({ phase: window.Principiante._.tr.phase, setup: window.Principiante._.tr.setup, text: document.getElementById('trBox').innerText }));
  check('entrenar, con el cubo: how to leave it at the start of the step, from wherever it is', setup.phase === 'setup' && setup.setup.split(' ').length >= 6 && /blanco arriba/.test(setup.text), JSON.stringify({ phase: setup.phase, text: setup.text.slice(0, 120) }));
  await p.evaluate((s) => window.Principiante.cube().link.turn(s), setup.setup);
  const tReady = await p.evaluate(() => ({ phase: window.Principiante._.tr.phase, stage: window.Lbl.read(window.Principiante.cube().state).stage, text: document.getElementById('trBox').innerText }));
  check('entrenar, con el cubo: then «¡Ya!», the cube right at the yellow face, and the help for it', tReady.phase === 'ready' && tReady.stage === 4 && /¡Ya!/.test(tReady.text) && /La cara amarilla/.test(tReady.text), JSON.stringify({ phase: tReady.phase, stage: tReady.stage }));
  guard = 0;
  while (guard++ < 6 && (await p.evaluate(() => window.Principiante._.tr.phase)) !== 'result') await doNext(p);
  const res = await p.evaluate(() => ({ phase: window.Principiante._.tr.phase, text: document.getElementById('trBox').innerText, rec: JSON.parse(localStorage.getItem('lbl:train:v1')).yface, chip: document.querySelector('[data-step="4"] small').innerText }));
  check('entrenar, con el cubo: done → ✓ with the time and the turns against the method; counted (with help: not for your best)', res.phase === 'result' && /✓ La cara amarilla en/.test(res.text) && /eran \d+/.test(res.text) && res.rec.n === 1 && res.rec.best == null && res.chip === '1 vez', JSON.stringify({ text: res.text.slice(0, 160), rec: res.rec }));
  await p.waitForFunction(() => ['setup', 'ready'].includes(window.Principiante._.tr.phase), null, { timeout: 40000 });
  check('entrenar, con el cubo: and then another one by itself', true);
  // Without help, timed; «Me he perdido» counts as failed.
  await p.uncheck('#trHelp');
  const s2 = await p.evaluate(() => window.Principiante._.tr.setup);
  await p.evaluate((s) => window.Principiante.cube().link.turn(s), s2);
  const noHelp = await p.evaluate(() => ({ plan: !!document.querySelector('#trBox .pr-plan'), text: document.getElementById('trBox').innerText }));
  await p.evaluate(() => window.Principiante.cube().link.turn('z2 R z2'));
  await p.click('[data-tr="lost"]');
  const lost = await p.evaluate(() => JSON.parse(localStorage.getItem('lbl:train:v1')).yface.fail);
  check('entrenar, con el cubo: «Con ayuda» off hides the help; «Me he perdido» counts as failed and brings another', !noHelp.plan && /Sin ayuda/.test(noHelp.text) && lost === 1, JSON.stringify({ lost }));
  await p.waitForFunction(() => ['setup', 'ready'].includes(window.Principiante._.tr.phase), null, { timeout: 40000 });
  const s3 = await p.evaluate(() => window.Principiante._.tr.setup);
  await p.evaluate((s) => window.Principiante.cube().link.turn(s), s3);
  await p.waitForTimeout(250);
  guard = 0;
  while (guard++ < 6 && (await p.evaluate(() => window.Principiante._.tr.phase)) !== 'result') await doNext(p);
  const timed = await p.evaluate(() => JSON.parse(localStorage.getItem('lbl:train:v1')).yface);
  check('entrenar, con el cubo: without help it counts for your time on that step', timed.n === 2 && timed.timed === 1 && timed.best >= 0, JSON.stringify(timed));
  await p.check('#trHelp');
  await ctx.close();

  // With a normal cube (no smart cube): a mix from solved and how to do the step from there.
  const N = await open({}, 'entrenar');
  await N.p.waitForFunction(() => window.Principiante._.tr.phase === 'hand' || window.Principiante._.tr.phase === 'error', null, { timeout: 40000 });
  await N.p.click('[data-step="2"]');
  await N.p.waitForFunction(() => window.Principiante._.tr.phase === 'hand', null, { timeout: 40000 });
  const hand = await N.p.evaluate(() => {
    const M = window.CubeModel; const L = window.Lbl; const t = window.Principiante._.tr;
    return { text: document.getElementById('trBox').innerText, mixOk: L.read(M.apply(M.solved(), t.mix)).stage === 2, plans: t.plans.every((pl) => pl.stage === 2), how: document.querySelectorAll('#trBox .pr-sol .pr-plan').length };
  });
  check('entrenar, cubo normal: a mix from solved that leaves the second layer to do, and how to do it from there', /mézclalo así/.test(hand.text) && /segunda capa/.test(hand.text) && hand.mixOk && hand.plans && hand.how >= 1, JSON.stringify({ mixOk: hand.mixOk, how: hand.how }));
  await N.p.click('[data-tr="handdone"]');
  const handRec = await N.p.evaluate(() => JSON.parse(localStorage.getItem('lbl:train:v1')).middle);
  check('entrenar, cubo normal: «Hecho» counts it', handRec.n === 1 && handRec.hand === 1, JSON.stringify(handRec));
  await N.p.screenshot({ path: `${SHOTS}/principiante-entrenar-1200.png` });

  // ================= Progreso =================
  await N.p.evaluate(() => {
    const now = Date.now();
    const sp = [[30000, 20], [40000, 30], [35000, 40], [8000, 12], [15000, 21], [9000, 9], [12000, 22]];
    const times = Array.from({ length: 6 }, (_, i) => ({ at: now - (6 - i) * 60000, t: 150000 - i * 5000, pen: 0, sp, help: i < 3 ? 1 : undefined }));
    localStorage.setItem('lbl:times:v1', JSON.stringify(times));
  });
  await N.p.goto(`${SITE}/principiante#progreso`);
  await N.p.waitForFunction(() => window.Principiante);
  const prog = await N.p.evaluate(() => ({
    tiles: document.getElementById('progSummary').innerText.replace(/\s+/g, ' '),
    chart: !!document.querySelector('#chart svg path'),
    slow: [...document.querySelectorAll('#progSteps tbody tr')].find((tr) => /aquí se te va más tiempo/.test(tr.innerText)).querySelector('th').innerText,
    goals: [...document.querySelectorAll('#goals li.on')].map((x) => x.childNodes[1].textContent.trim()),
  }));
  check('progreso: totals, the chart, the step where the time goes, and the goals reached', /Resueltos 6/.test(prog.tiles) && /Mejor 2:05\.00/.test(prog.tiles) && prog.chart && /Las esquinas blancas/.test(prog.slow) && prog.goals.includes('Tu primer cubo resuelto') && prog.goals.includes('5 resueltos') && prog.goals.includes('Uno sin ayuda') && prog.goals.includes('Menos de 3 minutos') && !prog.goals.includes('Menos de 2 minutos'), JSON.stringify({ slow: prog.slow, goals: prog.goals }));
  await N.p.click('[data-go-train]');
  check('progreso: «Entrenar» the slow step opens it in Entrenar', await N.p.evaluate(() => location.hash === '#entrenar' && document.querySelector('[data-step="1"]').getAttribute('aria-pressed') === 'true'));

  // ================= Sync =================
  const merged = await N.p.evaluate(() => {
    const F = window.Principiante._;
    const at = Date.now() + 1000;
    F.mergeIn({ times: [{ at: 1700000000000, t: 99000, pen: 0 }], known: { yface: 123, 'yface@': at, cross: 0, 'cross@': 1 }, train: { yedges: { n: 4, hand: 4 } } });
    F.mergeIn({ times: [{ at: 1700000000000, t: 99000, pen: 0 }] });
    return { n: F.times().filter((r) => r.at === 1700000000000).length, known: JSON.parse(localStorage.getItem('lbl:known:v1')), train: JSON.parse(localStorage.getItem('lbl:train:v1')).yedges };
  });
  check('sync: times from your other devices come in once; steps known and trained come too', merged.n === 1 && merged.known.yface === 123 && merged.train.n === 4, JSON.stringify(merged));
  await N.ctx.close();

  // ================= Links and the phone =================
  const H = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await H.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const hp = await H.newPage();
  hp.on('pageerror', (e) => errs.push(e.message));
  await hp.goto(`${SITE}/`);
  const fromHome = await hp.evaluate(() => [...document.querySelectorAll('a[href="principiante"]')].length);
  await hp.goto(`${SITE}/fridrich`);
  const fromFr = await hp.evaluate(() => !!document.querySelector('.fr-head a[href="principiante"]'));
  check('links: the 3BLD page and Fridrich link to it', fromHome >= 1 && fromFr, `${fromHome} ${fromFr}`);
  await H.close();
  const P = await open({ ...devices['Pixel 7'] }, 'aprender');
  const views = {};
  for (const v of ['aprender', 'resolver', 'entrenar', 'progreso', 'ajustes']) {
    await P.p.evaluate((x) => window.Principiante.showView(x), v);
    await P.p.waitForTimeout(250);
    views[v] = await P.p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  }
  await connect(P.p);
  await P.p.evaluate(() => window.Principiante.showView('resolver'));
  const s4 = await P.p.evaluate(() => window.Principiante.scramble());
  await P.p.evaluate((s) => window.Principiante.cube().link.turn(s), s4);
  for (let k = 0; k < 10; k++) await doNext(P.p);
  views.live = await P.p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  const tabs = await P.p.evaluate(() => getComputedStyle(document.getElementById('tabs')).position);
  check('phone: no view is wider than the screen (also with the live help); tabs at the bottom', Object.values(views).every((x) => x <= 0) && tabs === 'fixed', JSON.stringify({ views, tabs }));
  await P.p.locator('#live').screenshot({ path: `${SHOTS}/principiante-ayuda-pixel7.png` });
  await P.ctx.close();

  console.log(results.join('\n'));
  console.log('page errors:', errs.length ? errs : 'none');
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.log(results.join('\n')); console.error(e); console.log('1 failed of 1'); process.exit(1); });
