// Smart cube: «Practicar» following the cube along the memo, letter by letter and step by step, with no clock.
const { chromium } = require('playwright');
const { SITE, SHOTS } = require('../env');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);

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
  const look = () => p.evaluate(() => {
    const el = document.getElementById('practiceCube');
    const cur = document.querySelector('#walkToks [aria-current="true"]');
    return {
      ...window.OP3.practice.at(),
      shown: !el.hidden && el.getBoundingClientRect().height > 0,
      line: el.innerText,
      tone: el.className,
      tok: cur ? cur.textContent : null,
      chip: (document.querySelector('#seq [aria-current="true"], #seq .on, #seq .cur') || {}).textContent || null,
    };
  });

  // The memo of this scramble, written in «Practicar».
  const scr = await p.evaluate(() => window.OP3.scramble());
  const memo = await p.evaluate(() => {
    const O = window.OP3;
    const toks = O.cube.simMemo(O.guideApi.start());
    const e = toks.filter((t) => t.kind === 'edge').map((t) => t.L).join('');
    const c = toks.filter((t) => t.kind === 'corner').map((t) => t.L).join('');
    O.loadPractice(O.scramble(), e, c);
    return { e, c, toks };
  });
  // The turns of each token, split like the steps on screen: setup turns, the algorithm, undo turns.
  const plan = await p.evaluate((toks) => {
    const O = window.OP3;
    return toks.map((t) => {
      if (t.kind === 'parity') return { setup: [], alg: O.parseAlg(O.ALGS.P.moves).map((m) => m.text), undo: [] };
      const mode = O.MODES[t.kind];
      const setup = O.parseAlg(mode.table[t.L] || '').map((m) => m.text);
      return {
        setup,
        alg: O.parseAlg(O.ALGS[mode.alg].moves).map((m) => m.text),
        undo: setup.length ? O.parseAlg(O.invertAlg(setup.join(' '))).map((m) => m.text) : [],
      };
    });
  }, memo.toks);
  await p.evaluate(() => window.OP3.showView('practicar'));

  // 1. Solved cube: first, scramble it.
  let s = await look();
  check('practice: solved cube → «Primero mezcla el cubo», on the first turn of the scramble', s.shown && /Primero mezcla el cubo con el scramble: giro 1 de \d+/.test(s.line), JSON.stringify(s));
  const mv = scr.split(' ');
  await turn(mv.slice(0, 4).join(' '));
  s = await look();
  check('practice: halfway through the scramble → the next turn', new RegExp(`giro 5 de ${mv.length}, ${mv[4].replace("'", "\\'")}`).test(s.line), s.line);
  const wrongScr = ['U', 'D', 'F', 'B', 'L', 'R'].find((f) => f !== mv[4][0]);
  await turn(wrongScr);
  s = await look();
  check('practice: a wrong turn while scrambling → undo it', new RegExp(`Primero mezcla el cubo. Ese giro no toca, deshaz: ${wrongScr}'`).test(s.line) && /bad/.test(s.tone), s.line);
  await turn(`${wrongScr}'`);
  await turn(mv.slice(4).join(' '));
  s = await look();
  check('practice: scrambled → the first letter, at «Inicio»', s.i === 0 && s.step === 0 && /Siguiendo tu cubo/.test(s.line) && !/bad/.test(s.tone), JSON.stringify(s));
  await p.screenshot({ path: `${SHOTS}/practice-cube-1280.png` });

  // 2. The first token with a setup, turn by turn.
  let at = 0;
  const doToken = async (k) => { const t = plan[k]; await turn([...t.setup, ...t.alg, ...t.undo].join(' ')); };
  const first = plan.findIndex((t) => t.setup.length >= 1);
  for (; at < first; at++) await doToken(at);
  s = await look();
  check('practice: whole letters done at once → the strip moves on', s.i === first && s.step === 0, `want ${first} · ${JSON.stringify(s)}`);
  const T = plan[first];
  let okSetup = true;
  for (let k = 0; k < T.setup.length; k++) {
    await turn(T.setup[k]);
    s = await look();
    if (s.i !== first || s.step !== k + 1) okSetup = false;
  }
  check('practice: each setup turn moves one step', okSetup && s.step === T.setup.length, JSON.stringify(s));
  await turn(T.alg.slice(0, 5).join(' '));
  s = await look();
  check('practice: inside the algorithm → still on the setup, counting the turns', s.i === first && s.step === T.setup.length && new RegExp(`· (T|Y)-perm: 5 de ${T.alg.length}`).test(s.line), s.line);
  // A wrong turn, then undone.
  const nextMv = T.alg[5];
  const wrong = ['U', 'D', 'F', 'B', 'L', 'R'].find((f) => f !== nextMv[0] && f.toLowerCase() !== nextMv[0]);
  await turn(wrong);
  s = await look();
  check('practice: a wrong turn → «Deshaz», and the step stays', /Ese giro no toca. Deshaz: \S+/.test(s.line) && /bad/.test(s.tone) && s.step === T.setup.length, s.line);
  await turn(`${wrong}'`);
  s = await look();
  check('practice: undone → following again', /Siguiendo tu cubo/.test(s.line) && !/bad/.test(s.tone), s.line);
  await turn(T.alg.slice(5).join(' '));
  s = await look();
  check('practice: algorithm done → its step', s.step === T.setup.length + 1, JSON.stringify(s));
  for (let k = 0; k < T.undo.length - 1; k++) await turn(T.undo[k]);
  s = await look();
  check('practice: undoing the setup → its steps', s.i === first && s.step === T.setup.length + T.undo.length, JSON.stringify(s));
  await turn(T.undo[T.undo.length - 1]);
  s = await look();
  const want = await p.evaluate((x) => { const t = window.OP3.practice.tokens()[x]; return t.kind === 'parity' ? 'R-perm' : t.L; }, first + 1);
  check('practice: last undo turn → the next letter, at «Inicio», marked in the strip', s.i === first + 1 && s.step === 0 && s.tok === want, `${want} · ${JSON.stringify(s)}`);
  at = first + 1;

  // 3. Clicking another letter by hand: the next turn takes it back to where the cube is.
  await p.evaluate(() => document.getElementById('memoNext').click());
  await p.evaluate(() => document.getElementById('memoNext').click());
  const t2 = plan[at];
  const firstMv = [...t2.setup, ...t2.alg][0];
  await turn(firstMv);
  s = await look();
  check('practice: after looking at other letters, the cube brings it back', s.i === at && s.step === (t2.setup.length ? 1 : 0), JSON.stringify(s));
  await turn(`${firstMv}'`);

  // 4. Away and back: still where the cube is.
  await p.evaluate(() => window.OP3.showView('crono'));
  await doToken(at); at++;
  await p.evaluate(() => window.OP3.showView('practicar'));
  s = await look();
  check('practice: a letter done in another view → back in «Practicar» it is on the next one', s.i === at && s.step === 0 && s.shown, JSON.stringify(s));

  // 5. The guided execution takes over while it is open.
  await p.click('#guideOpen');
  s = await look();
  const guide = await p.evaluate(() => !document.getElementById('guideCube').hidden);
  check('practice: the guided execution open → its own line, not this one', !s.shown && guide, JSON.stringify(s));
  await p.click('#guideClose');
  await p.waitForTimeout(50);
  s = await look();
  check('practice: closed again → back to following, same spot', s.shown && s.i === at && s.step === 0, JSON.stringify(s));

  // 6. The rest of the memo: solved, and the cube says so.
  const fx0 = await p.evaluate(() => window.OP3.cube.fxLog.length);
  for (; at < plan.length; at++) await doToken(at);
  s = await look();
  const last = plan.length - 1;
  const lastStep = plan[last].setup.length + 1 + plan[last].undo.length;
  const fx = await p.evaluate((n) => window.OP3.cube.fxLog.slice(n), fx0);
  check('practice: all done → last letter, last step, «Resuelto»', s.i === last && s.step === lastStep && /✓ Resuelto, y lo ha comprobado el cubo/.test(s.line), JSON.stringify(s));
  check('practice: and it chimes, once', fx.filter((x) => x === 'chime').length === 1, JSON.stringify(fx));
  await p.screenshot({ path: `${SHOTS}/practice-cube-done-1280.png` });

  // 7. Scrambling again from solved is a new go, not a wrong turn.
  await turn(mv[0]);
  s = await look();
  check('practice: scrambling again → «Primero mezcla», not «Deshaz»', /Primero mezcla el cubo con el scramble: giro 2 de/.test(s.line), s.line);
  await turn(mv.slice(1).join(' '));
  s = await look();
  check('practice: scrambled again → first letter, «Inicio»', s.i === 0 && s.step === 0 && /Siguiendo tu cubo/.test(s.line), JSON.stringify(s));

  // 8. A wrong memo: the end says so.
  await p.fill('#memoC', memo.c.slice(0, -2));
  await p.dispatchEvent('#memoC', 'input');
  await p.waitForTimeout(50);
  s = await look();
  check('practice: memo edited → the path is rebuilt from the scramble', s.shown && /Siguiendo tu cubo/.test(s.line), JSON.stringify(s));
  const short = await p.evaluate(() => window.OP3.practice.tokens());
  const algs = await p.evaluate((toks) => toks.map((t) => window.OP3.tokenAlg(t)), short);
  for (const a of algs) await turn(a);
  s = await look();
  check('practice: a memo that does not solve it → «el memo tiene algún error»', /el memo tiene algún error/.test(s.line) && /bad/.test(s.tone), s.line);

  // 9. Lost: a cube that is nowhere on the way.
  await p.evaluate(() => window.OP3.cube.link.silent('F2 B2'));
  await turn('U');
  s = await look();
  check('practice: a turn off the path → «Deshaz»', /Ese giro no toca. Deshaz: U'/.test(s.line), s.line);
  await turn('R U R U R U R U');
  s = await look();
  check('practice: far off the path → it says how to get back', /no está en ningún punto de esta resolución/.test(s.line) && /bad/.test(s.tone), s.line);

  // 10. Without the cube: nothing.
  await p.evaluate(() => window.OP3.showView('crono'));
  await p.click('#cubeOff');
  await p.evaluate(() => window.OP3.showView('practicar'));
  s = await look();
  check('practice: cube disconnected → no line', !s.shown, JSON.stringify(s));

  results.forEach((r) => console.log(r));
  console.log(`page errors: ${errs.length ? JSON.stringify(errs) : 'none'}`);
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
