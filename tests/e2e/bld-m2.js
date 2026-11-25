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

  // ================= Timed with M2 =================
  ({ ctx, p } = await open({ viewport: { width: 1200, height: 900 } }, '/#crono'));
  await p.waitForFunction(() => window.OP3 && window.BldM2);
  await p.waitForFunction(() => document.getElementById('scr').value.trim().length > 10, null, { timeout: 20000 });
  await p.click('[data-cm="memo"]');
  await p.click('[data-em="m2"]');
  const memo = await p.evaluate(() => {
    const st = window.CubeModel.apply(window.CubeModel.solved(), document.getElementById('scr').value.trim());
    return { e: window.BldM2.trace(st, 'edge', ['U', 'K']).join(''), c: window.BldM2.trace(st, 'corner', ['E', 'A', 'R']).join(''), hint: document.getElementById('cronoKind').textContent };
  });
  const sp = async () => { await p.keyboard.press(' '); await p.waitForTimeout(150); };
  await sp(); await p.waitForTimeout(250); await sp();
  await p.fill('#maE', memo.e);
  await p.fill('#maC', memo.c);
  await p.press('#maC', 'Enter');
  const t1 = await p.evaluate(() => JSON.parse(localStorage.getItem('op3bld:times:v1') || '[]').slice(-1)[0]);
  const st = (q) => q.evaluate(() => Object.fromEntries([...document.querySelectorAll('#stats .stat')].map((x) => [x.querySelector('span').textContent, x.querySelector('b').textContent])));
  const withM2 = await st(p);
  await p.click('[data-em="op"]');
  const withOp = await st(p);
  await p.click('[data-em="m2"]');
  await p.evaluate(() => window.OP3.showView('progreso'));
  await p.waitForTimeout(200);
  const bp = await p.evaluate(() => ({ em: document.getElementById('bpEm').textContent, pressed: document.querySelector('#bpSummary') && document.querySelector('[data-view="progreso"] [data-em="m2"]').getAttribute('aria-pressed') }));
  check('crono with M2: an M2 memo checked as M2 (from DF) is right and saved as M2, with its own numbers apart from Old Pochmann; Progreso follows', t1 && t1.ok && t1.em === 'm2' && t1.m === 'memo' && withM2.Intentos === '1' && !withOp.Intentos && /M2/.test(memo.hint) && /M2/.test(bp.em) && bp.pressed === 'true', JSON.stringify({ t1, withM2, withOp, memo, bp }));
  await ctx.close();

  // ================= M2 in the whole section =================
  ({ ctx, p } = await open({ viewport: { width: 1200, height: 900 } }, '/#practicar'));
  await p.waitForFunction(() => window.OP3 && window.BldM2);
  await p.click('.rail-em [data-em="m2"]');
  const whole = await p.evaluate(() => {
    const O = window.OP3;
    const rail = { t: document.querySelector('#algT .alg-name').textContent, p: document.querySelector('#algP .alg-name').textContent, root: document.documentElement.dataset.em };
    // Practicar's generator and checker, with M2, on random cubes: solved, the traced memo accepted, a wrong
    // letter caught.
    let ok = 0; let traced = 0; let caught = 0; let odd = 0;
    for (let k = 0; k < 150; k++) {
      const s = O.randomMoveScramble(25);
      document.getElementById('scr').value = s;
      const st0 = O.apply(O.solved(), s);
      const opt = O.optimalMemo();
      let st = st0;
      opt.edges.letters.forEach((L, i) => { st = O.apply(st, O.shot('edge', L, i)); });
      if (opt.edges.letters.length % 2) { st = O.apply(st, O.parityAlg().moves); odd++; }
      opt.corners.letters.forEach((L) => { st = O.apply(st, O.shot('corner', L)); });
      if (O.isSolved(st) && !O.traceMemo(st0, opt.edges.letters, opt.corners.letters)) ok++;
      if (!O.traceMemo(st0, window.BldM2.trace(st0, 'edge', ['U', 'K']), opt.corners.letters)) traced++;
      const e = opt.edges.letters.slice();
      if (e.length > 2) { e[1] = e[1] === 'B' ? 'D' : 'B'; if (O.traceMemo(st0, e, opt.corners.letters)) caught++; } else caught++;
    }
    return { rail, ok, traced, caught, odd };
  });
  check('«Aristas con: M2» in the rail: its algorithms (M2, its parity), and Practicar generates and checks M2 memos (150 random cubes solved, the traced memo accepted, a wrong letter caught)', whole.rail.t === 'M2' && whole.rail.p === 'Paridad M2' && whole.rail.root === 'm2' && whole.ok === 150 && whole.traced === 150 && whole.caught === 150 && whole.odd > 20, JSON.stringify(whole));
  // The memo walk: a special letter as second of a pair takes its partner's algorithm.
  const walk = await p.evaluate(() => {
    document.getElementById('scr').value = '';
    document.getElementById('memoE').value = 'BCD';
    document.getElementById('memoC').value = '';
    document.getElementById('memoE').dispatchEvent(new Event('input', { bubbles: true }));
    const toks = [...document.querySelectorAll('#walkToks .tok')].map((b) => b.textContent);
    document.querySelectorAll('#walkToks .tok')[1].click();
    const seq = document.getElementById('seq').textContent.replace(/\s+/g, ' ');
    return { toks, seq, who: document.getElementById('whoDesc').textContent };
  });
  check('Practicar with M2: the walk ends in «Paridad» for an odd memo, and C as second of a pair is done with W\'s algorithm', walk.toks.join() === 'B,C,D,Paridad' && /la de W/.test(walk.seq) && /segunda letra/.test(walk.who), JSON.stringify(walk));
  const tabla = await p.evaluate(() => {
    window.OP3.showView('tabla');
    const cell = (L) => [...document.querySelectorAll('#board button, #board .cell, #board [data-l]')].find((x) => x.textContent.trim().startsWith(L));
    return { title: document.getElementById('hBoard').textContent, c: cell('C') && cell('C').textContent, b: cell('B') && cell('B').textContent, u: cell('U') && cell('U').textContent };
  });
  check('la Tabla with M2: the setups to UB, C as special, DF (U) the buffer', /M2/.test(tabla.title) && /especial/.test(tabla.c) && /R U R' U'/.test(tabla.b) && /buffer/.test(tabla.u), JSON.stringify(tabla));
  // Entrenar: an M2 special asks its whole algorithm (its partner's is told apart); M2 keeps its own record.
  const train = await p.evaluate(() => {
    const O = window.OP3;
    const j = (L, typed) => O.judgeSetup('edge', L, typed);
    const before = JSON.stringify((O.data.train() || {}).edge || {});
    return {
      c: j('C', "U2 M' U2 M'").ok, cw: j('C', 'M U2 M U2').msg, b: j('B', "R U R' U'").ok, bad: j('B', "R U' R' U").ok,
      edgeBefore: before,
    };
  });
  await p.evaluate(() => window.OP3.showView('entrenar'));
  await p.fill('#trInput', 'xx');
  await p.click('#trSkip');
  const rec = await p.evaluate(() => { const t = window.OP3.data.train(); return { m2: Object.values(t.m2 || {}).reduce((a, x) => a + (x.seen || 0), 0), edge: JSON.stringify(t.edge || {}) }; });
  check('Entrenar with M2: a setup to UB judged with M2, a special asks its algorithm (its partner\'s is told apart), and the answers go to M2\'s own record', train.c && train.b && !train.bad && /el de W/.test(train.cw) && rec.m2 === 1 && rec.edge === train.edgeBefore, JSON.stringify({ train, rec }));
  // Back to Old Pochmann: everything as before; Aprender's Old Pochmann lessons never changed.
  await p.click('.rail-em [data-em="op"]');
  const back = await p.evaluate(() => ({ t: document.querySelector('#algT .alg-name').textContent, read: window.OP3.MODES.edge.read, op: window.OP3.MODES_OP.edge.read, stored: localStorage.getItem('op3bld:em:v1') }));
  check('back to Old Pochmann from the rail: T-perm, buffer UR again, remembered; the lessons keep Old Pochmann', back.t === 'T-perm' && back.read === 'B' && back.op === 'B' && back.stored === 'op', JSON.stringify(back));
  await ctx.close();

  // ================= The smart cube with M2 =================
  // A solve on the virtual cube with one M2 letter done wrong: the cube says which one (read from what the
  // letters before it amount to) and it goes to M2's record in «Entrenar».
  ({ ctx, p } = await open({ viewport: { width: 1280, height: 900 } }, '/?cubo=virtual#crono'));
  await p.click('#cubeSim');
  await p.waitForFunction(() => window.OP3.cube.status === 'on');
  await p.evaluate(() => window.OP3.bld.setEdgeMethod('m2'));
  // «Entrenar» on the cube with M2: a letter, then the next one with the cube upside down as M2 leaves it
  // (held as it is: the virtual cube, like a real one, reports the top face, yellow now, as D).
  await p.evaluate(() => window.OP3.showView('entrenar'));
  await p.click('#trEdge');
  await p.waitForTimeout(150);
  const trTwo = [];
  for (let n = 0; n < 2; n++) {
    const L = await p.evaluate(() => window.OP3.trainer.state().letter);
    const alg = await p.evaluate((x) => window.OP3.tokenAlg({ kind: 'edge', L: x }), L);
    await p.evaluate((a) => window.OP3.cube.link.play([a], 300), alg);
    await p.waitForTimeout(300);
    trTwo.push(await p.evaluate(() => document.getElementById('trFeedback').textContent));
    await p.evaluate(() => window.OP3.trainer.next());
  }
  check('Entrenar on the cube with M2: a letter, then the next with the cube upside down as M2 leaves it, both right (a special that starts with M2 is not taken for the A)', trTwo.every((x) => /^✓/.test(x)), JSON.stringify(trTwo));
  // A special (C, W, I, S): no setup to show in the steps. And its last turn lost on the way (two faces at once
  // with M, easy on a real cube): the cube's reading a moment later still finishes the letter.
  for (let n = 0; n < 60 && !(await p.evaluate(() => /^[CWIS]$/.test(window.OP3.trainer.state().letter))); n++) await p.evaluate(() => window.OP3.trainer.next());
  const lostLast = await p.evaluate(async () => {
    const O = window.OP3;
    const L = O.trainer.state().letter;
    const moves = O.tokenAlg({ kind: 'edge', L }).split(' ');
    const steps = [...document.querySelectorAll('#trCubeLine .tr-step')].map((x) => x.textContent);
    await O.cube.link.play([moves.slice(0, -1).join(' ')], 300);
    await new Promise((r) => setTimeout(r, 100));
    const before = document.getElementById('trFeedback').textContent;
    O.cube.link.silent(moves[moves.length - 1]);
    await new Promise((r) => setTimeout(r, 1100));
    return { L, steps, before, after: document.getElementById('trFeedback').textContent };
  });
  check('Entrenar on the cube with M2: a special shows just its algorithm as the step; its last turn lost, the cube\'s reading finishes it', lostLast.steps.length === 1 && /^Especial de/.test(lostLast.steps[0]) && !/^✓/.test(lostLast.before) && /^✓/.test(lostLast.after), JSON.stringify(lostLast));
  // A reading of the cube that comes late, from before the last turn (asked for while turning): it is out of
  // date, so it changes nothing; the letter goes on and counts.
  const stale = await p.evaluate(async () => {
    const O = window.OP3;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const moves = O.tokenAlg({ kind: 'edge', L: O.trainer.state().letter }).split(' ');
    document.getElementById('trFeedback').textContent = '';
    await O.cube.link.play([moves.slice(0, 2).join(' ')], 300);
    O.cube.link.late();
    await wait(100);
    const line = document.getElementById('trCubeLine').textContent;
    await O.cube.link.play([moves.slice(2).join(' ')], 300);
    await wait(200);
    return { line, after: document.getElementById('trFeedback').textContent };
  });
  check('Entrenar on the cube with M2: a reading that comes late changes nothing, and the letter still counts', !/perdido|no toca/.test(stale.line) && /^✓/.test(stale.after), JSON.stringify(stale));
  // The cube losing turns, as a real one does with M (two faces at once): one lost before the letter (it starts
  // somewhere else than the app thought) and one lost in the middle of it. Done right, both count as right.
  const lostTurns = await p.evaluate(async () => {
    const O = window.OP3;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const algOf = () => O.tokenAlg({ kind: 'edge', L: O.trainer.state().letter }).split(' ');
    const out = [];
    const fb = document.getElementById('trFeedback');
    fb.textContent = '';
    let moves = algOf();
    // On a face the letter doesn't start with (R lost and then R' done would put the cube back where the app
    // thought it was: nothing to tell).
    O.cube.link.silent(['F2', 'D2', 'B2', 'L2', 'U2'].find((x) => !moves.slice(0, 3).some((m) => m[0] === x[0] || m[0] === 'M')) || 'F2');
    await O.cube.link.play([moves[0]], 300);
    await wait(1000);
    out.push(document.getElementById('trCubeLine').textContent);
    await O.cube.link.play([moves.slice(1).join(' ')], 300);
    await wait(300);
    out.push(document.getElementById('trFeedback').textContent);
    fb.textContent = '';
    moves = algOf();
    const j = Math.floor(moves.length / 2);
    if (j) await O.cube.link.play([moves.slice(0, j).join(' ')], 300);
    O.cube.link.silent(moves[j]);
    if (j + 1 < moves.length) await O.cube.link.play([moves.slice(j + 1).join(' ')], 300);
    await wait(1200);
    out.push(document.getElementById('trFeedback').textContent);
    // And the other way round: a turn the app heard but the cube didn't make (R and back, the way back lost).
    // It says «Ese giro no toca» only until the cube is asked how it really is.
    fb.textContent = '';
    moves = algOf();
    await O.cube.link.play(['R'], 300);
    O.cube.link.silent("R'");
    await wait(600);
    out.push(document.getElementById('trCubeLine').textContent);
    await O.cube.link.play([moves.join(' ')], 300);
    await wait(300);
    out.push(document.getElementById('trFeedback').textContent);
    return out;
  });
  check('Entrenar on the cube with M2: a turn the cube lost before the letter or in the middle of it doesn\'t count against you, nor one it heard but wasn\'t made', !/perdido|no toca/.test(lostTurns[0]) && /^✓/.test(lostTurns[1]) && /^✓/.test(lostTurns[2]) && !/no toca/.test(lostTurns[3]) && /^✓/.test(lostTurns[4]), JSON.stringify(lostTurns));
  // Seven letters, seven M2s: the right way up in the hands again for the solve below.
  await p.evaluate(() => window.OP3.cube.link.turn('x2'));
  await p.evaluate(() => window.OP3.showView('crono'));
  let plan = null;
  for (let tries = 0; tries < 20 && !(plan && plan.k >= 1); tries++) {
    const scr = await p.evaluate(() => window.OP3.randomMoveScramble(18));
    await p.evaluate((x) => { const el = document.getElementById('scr'); el.value = x; el.dispatchEvent(new Event('input')); }, scr);
    await p.evaluate((x) => window.OP3.cube.link.turn(x), scr);
    plan = await p.evaluate(() => {
      const O = window.OP3;
      const toks = O.cube.simMemo(O.cube.link.state());
      let v = O.cube.link.state();
      const m = O.MODES.edge;
      // A letter to get wrong with plain letters around it: no cycle break just before or after it, or the
      // cube cannot tell which letter was meant (and the report rightly says so).
      const plain = [];
      for (let i = 0; i < toks.length && toks[i].kind === 'edge'; i++) {
        const t = toks[i];
        plain.push(!!m.table[t.L] && m.letterOf[v[m.posOf[m.read]]] === t.L);
        v = O.traceShot('edge', v, t.L, i);
      }
      for (let i = 1; i < plain.length; i++) if (plain[i - 1] && plain[i] && (i + 1 >= plain.length || plain[i + 1])) return { toks, k: i };
      return { toks, k: -1 };
    });
    if (plan.k < 1) await p.evaluate(() => window.OP3.cube.link.turn(window.OP3.invertAlg(document.getElementById('scr').value)));
  }
  const bad = plan.toks[plan.k].L;
  await p.keyboard.press('Space');
  await p.waitForTimeout(100);
  await p.evaluate(([t, k]) => { const O = window.OP3; const a = t.map((x) => O.tokenAlg(x)); a[k] = O.cube.flawed(t[k]); return O.cube.link.play(a, 400); }, [plan.toks, plan.k]);
  await p.keyboard.press('Space');
  await p.waitForFunction(() => /no está resuelto/.test(document.getElementById('verdictAsk').textContent), null, { timeout: 3000 }).catch(() => {});
  await p.click('#markDnf');
  await p.waitForTimeout(150);
  const dnf = await p.evaluate(() => ({ rep: document.getElementById('cubeReport').textContent, t: JSON.parse(localStorage.getItem('op3bld:trainer:v1') || '{}') }));
  const flagged = (dnf.t.m2 || {})[bad];
  check('smart cube with M2: a letter done wrong is found (M2 in the report) and flagged in M2\'s own record', dnf.rep.includes(`La ${bad} (arista) te saldrá más a menudo`) && /M2/.test(dnf.rep) && flagged && flagged.dnf === 1 && !((dnf.t.edge || {})[bad] || {}).dnf, JSON.stringify({ bad, rep: dnf.rep.slice(0, 300), flagged }));
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
    return { items: [...m.querySelectorAll('a[data-sx]')].map((a) => a.dataset.sx), here: m.querySelector('a[aria-current]').dataset.sx, cfop: new URL(m.querySelector('a[data-sx="cfop"]').href).pathname };
  });
  await p.keyboard.press('Escape');
  const closed = await p.evaluate(() => [...document.querySelectorAll('.sx-menu')].every((m) => m.hidden));
  check('sections: one menu (Mi plan, CFOP, A ciegas, Principiante and the four new events), where you are marked, CFOP goes to the level last used (here completa), Escape closes it; CFOP shows its level', menu.items.join(' ') === 'plan cfop bld beg 222 444 pyram sq1' && menu.here === 'bld' && menu.cfop === '/cfop' && closed && cf.h1 === 'CFOP' && cf.lv === 'full', JSON.stringify({ menu, closed, cf }));
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
      const r = document.getElementById('rail').getBoundingClientRect();
      return { over: document.documentElement.scrollWidth - window.innerWidth, menuIn: m.left >= 0 && m.right <= window.innerWidth, railFull: Math.round(r.left) === 0 && Math.round(r.right) === window.innerWidth };
    });
    await p.screenshot({ path: `${SHOTS}/bld-m2-${name}.png` });
    check(`${name}: M2 with no sideways scroll, the sections menu inside the screen, and the algorithms' bar from edge to edge`, ph.over <= 0 && ph.menuIn && ph.railFull, JSON.stringify(ph));
    await ctx.close();
  }

  check('no page errors', errs.length === 0, errs.join(' | '));
  results.forEach((r) => console.log(r));
  console.log(`page errors: ${errs.length ? JSON.stringify(errs) : 'none'}`);
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
