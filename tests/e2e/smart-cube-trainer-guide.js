// Smart cube: setup trainer answered on the cube, and the guided execution following the cube.
const { chromium, devices } = require('playwright');
const { SITE, SHOTS } = require('../env');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(`${SITE}/?cubo=virtual#crono`);
  await p.click('#cubeSim');
  await p.waitForFunction(() => window.OP3.cube.status === 'on');
  const turn = (a) => p.evaluate((x) => window.OP3.cube.link.turn(x), a);
  const tstate = () => p.evaluate(() => ({
    ...window.OP3.trainer.state(),
    fb: document.getElementById('trFeedback').textContent,
    line: document.getElementById('trCubeLine').hidden ? null : document.getElementById('trCubeLine').innerText,
    desc: document.getElementById('trDesc').textContent,
    input: getComputedStyle(document.getElementById('trInput')).display !== 'none',
    submit: getComputedStyle(document.getElementById('trSubmit')).display !== 'none',
    how: !document.getElementById('trHow').hidden,
  }));
  const tok = (s) => p.evaluate((x) => window.OP3.tokenAlg({ kind: x.kind, L: x.letter }), s);
  const stat = (kind, L) => p.evaluate(([k, l]) => JSON.parse(localStorage.getItem('op3bld:trainer:v1'))[k][l], [kind, L]);

  // ================= Trainer =================
  await p.evaluate(() => window.OP3.showView('entrenar'));
  let s = await tstate();
  check('trainer: «Responder con el cubo» offered and on', s.how && !s.input && !s.submit && /Hazla en el cubo/.test(s.desc) && s.line != null, JSON.stringify(s).slice(0, 200));
  await p.screenshot({ path: `${SHOTS}/train-cube-1280.png` });
  // 1. Right, clean.
  const L1 = s.letter;
  await turn(await tok(s));
  s = await tstate();
  check('trainer: the right letter done on the cube → ✓ with times', new RegExp(`✓ ${L1} en [\\d,]+ s \\(pensar`).test(s.fb) && s.letter !== L1 && s.phase === 'ask', s.fb);
  let st = await stat('edge', L1);
  check('trainer: it counts as a hit', st.right === 1 && st.streak === 1, JSON.stringify(st));
  // 2. Halfway: the steps light up.
  const L2 = s.letter;
  const alg2 = await tok(s);
  const mv2 = await p.evaluate((a) => window.OP3.parseAlg(a).map((m) => m.text), alg2);
  const setupLen = await p.evaluate((x) => window.OP3.parseAlg(window.OP3.MODES.edge.table[x] || '').length, L2);
  await turn(mv2.slice(0, setupLen + 3).join(' '));
  s = await tstate();
  check('trainer: progress shows setup done and the algorithm on its way', (setupLen ? /✓ Setup/.test(s.line) : true) && /T-perm 3\/\d+/.test(s.line), s.line);
  // A wrong turn, then undone.
  const next = mv2[setupLen + 3];
  const wrong = ['U', 'D', 'F', 'B', 'L', 'R'].find((f) => f !== next[0] && f.toLowerCase() !== next[0]);
  await turn(wrong);
  s = await tstate();
  check('trainer: a wrong turn → «Deshaz»', new RegExp(`Deshaz: ${wrong}'`).test(s.line) && /Empezar la letra desde aquí/.test(s.line), `${L2} alg=${alg2} wrong=${wrong} | ${s.line}`);
  await turn(`${wrong}'`);
  await turn(mv2.slice(setupLen + 3).join(' '));
  s = await tstate();
  check('trainer: finished after a correction → counts, but flagged', new RegExp(`${L2}: acabada, pero corrigiendo`).test(s.fb), s.fb);
  st = await stat('edge', L2);
  check('trainer: corrected letter keeps a high weight and no streak', st.right === 1 && st.streak === 0 && st.w >= 2, JSON.stringify(st));
  // 3. Another letter done cleanly.
  const L3 = s.letter;
  const other = await p.evaluate((x) => window.OP3.trainLetters('edge').find((l) => l !== x), L3);
  await turn(await p.evaluate((l) => window.OP3.tokenAlg({ kind: 'edge', L: l }), other));
  s = await tstate();
  check('trainer: another letter done → «Has hecho la X, no la Y»', s.fb.includes(`Has hecho la ${other}, no la ${L3}`), s.fb);
  // 4. «No lo sé», then doing it.
  const L4 = s.letter;
  await p.click('#trSkip');
  s = await tstate();
  check('trainer: «No lo sé» shows the answer and a «Siguiente»', /Sin respuesta/.test(s.fb) && s.submit && s.letter === L4, s.fb);
  await turn(await tok(s));
  s = await tstate();
  check('trainer: doing it afterwards moves on', s.letter !== L4 && s.phase === 'ask' && !s.submit, `${s.letter} ${s.phase}`);
  // 5. Lost, then «Empezar la letra desde aquí».
  await turn("B2 F2 U D' L R' B F' U2 D2");
  s = await tstate();
  check('trainer: far off → «Te has perdido» with a restart button', /Te has perdido/.test(s.line), s.line);
  await p.click('[data-tr-restart]');
  const L5 = s.letter;
  await turn(await tok(s));
  s = await tstate();
  check('trainer: restarted from there and finished', new RegExp(`${L5}: acabada, pero corrigiendo`).test(s.fb) && s.letter !== L5, s.fb);
  // 6. Typing again.
  await p.click('#trHowType');
  s = await tstate();
  check('trainer: «Escribiendo» brings the input and its text back', s.input && s.submit && new RegExp(`Escribe el setup que lleva ${s.letter}`).test(s.desc) && s.line == null, s.desc);
  await p.click('#trHowCube');
  // 7. Corners.
  await p.click('#trCorner');
  s = await tstate();
  check('trainer: corners on the cube', s.kind === 'corner' && /Y-perm modificada/.test(s.desc), s.desc);
  const C1 = s.letter;
  await turn(await tok(s));
  s = await tstate();
  check('trainer: corner done → ✓', new RegExp(`✓ ${C1} en`).test(s.fb), s.fb);
  await p.screenshot({ path: `${SHOTS}/train-cube-1280-done.png` });

  // ================= Guided execution =================
  await p.click('#cubeSync').catch(() => {});
  await p.evaluate(() => window.OP3.showView('crono'));
  await p.click('#cubeSync');
  await wait(100);
  await p.evaluate(() => window.OP3.showView('practicar'));
  const scr = await p.evaluate(() => window.OP3.randomMoveScramble(16));
  await p.evaluate((x) => { const el = document.getElementById('scr'); el.value = x; el.dispatchEvent(new Event('input')); }, scr);
  const memo = await p.evaluate(() => { const m = window.OP3.optimalMemo(); return { e: window.OP3.pairs(m.edges.letters), c: window.OP3.pairs(m.corners.letters) }; });
  await p.evaluate(([e, c]) => { for (const [id, v] of [['memoE', e], ['memoC', c]]) { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input')); } }, [memo.e, memo.c]);
  await p.click('#guideOpen');
  const g = () => p.evaluate(() => ({
    i: window.OP3.guideApi.index(), n: window.OP3.guideApi.steps().length,
    cube: document.getElementById('guideCube').hidden ? null : document.getElementById('guideCube').textContent,
    prog: document.getElementById('guideProg').textContent,
    seqDone: document.querySelectorAll('#guideSeq .sm.done').length,
    move: document.getElementById('guideMove').textContent,
  }));
  let gs = await g();
  check('guide: asks to scramble first, move by move', /Primero mezcla el cubo con el scramble: giro 1 de 16/.test(gs.cube), gs.cube);
  await turn(scr);
  gs = await g();
  check('guide: scrambled → following the cube from the first step', /Siguiendo tu cubo/.test(gs.cube) && gs.i === 0, `${gs.i} ${gs.cube}`);
  const steps = await p.evaluate(() => window.OP3.guideApi.steps().filter((x) => !x.end).map((x) => (x.isAlg ? x.seq : x.move)));
  await turn(steps[0]);
  gs = await g();
  check('guide: a turn moves it to the next step by itself', gs.i === 1, String(gs.i));
  // Inside the algorithm step.
  let k = 1;
  while (k < steps.length && steps[k].split(' ').length < 3) { await turn(steps[k]); k++; }
  gs = await g();
  const algMoves = steps[k].split(' ');
  await turn(algMoves.slice(0, 5).join(' '));
  gs = await g();
  check('guide: inside an algorithm, how far and the turns done', gs.i === k && / 5 de \d+/.test(gs.cube) && gs.seqDone === 5, `${gs.i}/${k} ${gs.cube} done=${gs.seqDone}`);
  await p.screenshot({ path: `${SHOTS}/guide-cube-1280.png` });
  const nextMv = algMoves[5];
  const wrongG = ['U', 'D', 'F', 'B', 'L', 'R'].find((f) => f !== nextMv[0]);
  await turn(wrongG);
  gs = await g();
  check('guide: a wrong turn → «Deshaz»', new RegExp(`Deshaz: ${wrongG}'`).test(gs.cube), gs.cube);
  await turn(`${wrongG}'`);
  await turn(algMoves.slice(5).join(' '));
  gs = await g();
  check('guide: algorithm done → next step', gs.i === k + 1, String(gs.i));
  // Close, do two more steps by hand, reopen: it finds where the cube is.
  await p.click('#guideClose');
  await turn(steps.slice(k + 1, k + 3).join(' '));
  await p.click('#guideOpen');
  gs = await g();
  check('guide: reopened mid-solve → jumps to where the cube is', gs.i === k + 3, `${gs.i} vs ${k + 3}`);
  // Algorithms move by move.
  await p.click('#guideSplit');
  const split = await p.evaluate(() => window.OP3.guideApi.steps().filter((x) => !x.end).map((x) => x.move));
  gs = await g();
  const doneMoves = await p.evaluate((st) => st.slice(0, 0).length, steps);
  check('guide: «movimiento a movimiento» keeps the place', /Siguiendo tu cubo/.test(gs.cube) && split.length > steps.length && gs.i > k, `${gs.i} ${gs.cube}`);
  // Finish.
  await p.evaluate(() => { window.OP3.cube.fxLog.length = 0; });
  const rest = await p.evaluate(() => {
    const st = window.OP3.guideApi.steps();
    return st.slice(window.OP3.guideApi.index()).filter((x) => !x.end).map((x) => x.move).join(' ');
  });
  await p.evaluate((a) => window.OP3.cube.link.play([a], 400), rest);
  await wait(100);
  gs = await g();
  const fx = await p.evaluate(() => window.OP3.cube.fxLog.slice());
  const dbg = await p.evaluate(() => { const P = window.OP3.cube.guidePath; const O = window.OP3; return { pos: P.pos, total: P.total, half: P.halfway, solved: O.isSolved(O.cube.state), endKeyHits: P.at.get(O.cube.state.join(',')), rest: null }; });
  check('guide: the end → «Terminado» and «lo ha comprobado el cubo», with the chime', gs.prog === 'Terminado' && /✓ Resuelto, y lo ha comprobado el cubo/.test(gs.cube) && fx.includes('chime'), `${gs.prog} | ${gs.cube} | ${fx} | ${JSON.stringify(dbg)} | rest=${rest.slice(-40)}`);
  await p.screenshot({ path: `${SHOTS}/guide-cube-1280-done.png` });
  await p.click('#guideClose');
  // Without a cube, the guide is as before.
  await p.evaluate(() => { window.OP3.showView('crono'); });
  await p.click('#cubeOff');
  await p.evaluate(() => window.OP3.showView('practicar'));
  await p.click('#guideOpen');
  gs = await g();
  check('guide without a cube: no cube line', gs.cube === null);
  await p.click('#guideClose');

  // ================= Guide during a timed attempt =================
  // With the clock running (memo, then execution), the guide still follows the cube, and the end
  // is celebrated once even though the clock stops by itself at the same turn.
  {
    await p.evaluate(() => window.OP3.showView('crono'));
    await p.click('#cubeSim');
    await p.waitForFunction(() => window.OP3.cube.status === 'on');
    await p.click('#cubeSync');
    await wait(150);
    const scr2 = await p.evaluate(() => window.OP3.randomMoveScramble(14));
    await p.evaluate((x) => { const el = document.getElementById('scr'); el.value = x; el.dispatchEvent(new Event('input')); }, scr2);
    const memo2 = await p.evaluate(() => { const m = window.OP3.optimalMemo(); return [window.OP3.pairs(m.edges.letters), window.OP3.pairs(m.corners.letters)]; });
    await p.evaluate(([e, c]) => { for (const [id, v] of [['memoE', e], ['memoC', c]]) { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input')); } }, memo2);
    await turn(scr2);
    await wait(3200);
    await p.keyboard.press('Space');
    await wait(100);
    await p.evaluate(() => window.OP3.showView('practicar'));
    await p.click('#guideOpen');
    const steps2 = await p.evaluate(() => window.OP3.guideApi.steps().filter((x) => !x.end).map((x) => (x.isAlg ? x.seq : x.move)));
    await turn(steps2[0]);
    await turn(steps2[1]);
    let g2 = await p.evaluate(() => ({ i: window.OP3.guideApi.index(), phase: window.OP3.clock.phase() }));
    check('timer running: the guide still follows the cube', g2.i === 2 && g2.phase === 'exec', JSON.stringify(g2));
    await p.evaluate(() => { window.OP3.cube.fxLog.length = 0; });
    await turn(steps2.slice(2).join(' '));
    await wait(100);
    g2 = await p.evaluate(() => ({ prog: document.getElementById('guideProg').textContent, fx: window.OP3.cube.fxLog.filter((x) => x === 'chime').length, last: window.OP3.data.times().slice(-1)[0] }));
    check('…the end: guide done, attempt saved as solved, one chime', g2.prog === 'Terminado' && g2.last.ok === true && g2.fx === 1, JSON.stringify({ prog: g2.prog, fx: g2.fx, ok: g2.last && g2.last.ok }));
    await p.click('#guideClose');
  }

  // ================= Phone =================
  {
    const c2 = await browser.newContext({ ...devices['Pixel 7'] });
    await c2.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const q = await c2.newPage();
    q.on('pageerror', (e) => errs.push('phone: ' + e.message));
    await q.goto(`${SITE}/?cubo=virtual#crono`);
    await q.tap('#cubeSim');
    await q.waitForFunction(() => window.OP3.cube.status === 'on');
    await q.evaluate(() => window.OP3.showView('entrenar'));
    await q.evaluate(() => { const s = window.OP3.trainer.state(); const a = window.OP3.parseAlg(window.OP3.tokenAlg({ kind: s.kind, L: s.letter })).map((m) => m.text); window.OP3.cube.link.turn(a.slice(0, 4).join(' ')); });
    const o = await q.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    check('phone: trainer with the cube fits', !o);
    await q.screenshot({ path: `${SHOTS}/train-cube-390.png` });
    await c2.close();
  }

  console.log(results.join('\n'));
  console.log('page errors:', errs.length ? errs : 'none');
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
