// Smart cube: DNF letters feed «Entrenar»; «Leer el cubo» turns a hand scramble into the app's scramble.
const { chromium } = require('playwright');
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
  const setScr = (s) => p.evaluate((x) => { const el = document.getElementById('scr'); el.value = x; el.dispatchEvent(new Event('input')); }, s);
  const train = () => p.evaluate(() => JSON.parse(localStorage.getItem('op3bld:trainer:v1') || '{}'));

  // ================= DNF → Entrenar =================
  const scr = await p.evaluate(() => window.OP3.randomMoveScramble(18));
  await setScr(scr);
  await turn(scr);
  // A letter that is not a cycle break and has a setup, so the cube knows which one failed.
  const plan = await p.evaluate(() => {
    const O = window.OP3;
    const toks = O.cube.simMemo(O.cube.link.state());
    let st = O.cube.link.state();
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (i >= 1 && t.kind === 'edge' && O.MODES.edge.table[t.L]) {
        const m = O.MODES.edge;
        if (m.letterOf[st[m.posOf[m.read]]] === t.L) return { toks, k: i };
      }
      st = O.apply(st, O.tokenAlg(t));
    }
    return { toks, k: -1 };
  });
  check('setup: a letter to get wrong', plan.k >= 1, String(plan.k));
  const L = plan.toks[plan.k].L;
  const before = ((await train()).edge || {})[L];
  await p.keyboard.press('Space');
  await wait(100);
  await p.evaluate(([t, k]) => { const O = window.OP3; const a = t.map((x) => O.tokenAlg(x)); a[k] = O.cube.flawed(t[k]); return O.cube.link.play(a, 400); }, [plan.toks, plan.k]);
  await p.keyboard.press('Space');
  await p.waitForFunction(() => /no está resuelto/.test(document.getElementById('verdictAsk').textContent), null, { timeout: 3000 }).catch(() => {});
  await p.click('#markDnf');
  await wait(150);
  let rep = await p.textContent('#cubeReport');
  check('DNF report says the letter will come up more in Entrenar', rep.includes(`La ${L} (arista) te saldrá más a menudo en «Entrenar»`), rep.slice(-120));
  let st = (await train()).edge[L];
  check('the letter is flagged: weight up, streak reset, one DNF', st.dnf === 1 && st.w >= 4 && st.streak === 0, JSON.stringify({ before, st }));
  await p.evaluate(() => { window.OP3.showView('practicar'); window.OP3.showView('crono'); });
  st = (await train()).edge[L];
  check('looking at the report again does not count it twice', st.dnf === 1, JSON.stringify(st));
  await p.evaluate(() => window.OP3.showView('entrenar'));
  await p.click('#trEdge');
  const fs = await p.evaluate(() => ({ vis: !document.getElementById('trFromSolves').hidden, text: document.getElementById('trFromSolves').textContent }));
  const cellCls = await p.evaluate((x) => [...document.querySelectorAll('#trMastery .m-cell')].find((c) => c.textContent === x).className, L);
  check('Entrenar lists it under «Fallaste en tus intentos»', fs.vis && fs.text.includes(L), fs.text);
  check('its square is marked to review', /weak/.test(cellCls), cellCls);
  check('the hint under the trainer speaks of the cube', /Haz cada letra en el cubo/.test(await p.textContent('#trStats')), await p.textContent('#trStats'));
  await p.screenshot({ path: `${SHOTS}/train-from-solves.png` });
  // Three right in a row clears it from the list.
  await p.evaluate((x) => { const d = window.OP3.data.train(); d.edge[x].streak = 3; window.OP3.data.setTrain(d); }, L);
  check('three right in a row → off the list', await p.evaluate((x) => !document.getElementById('trFromSolves').textContent.includes(x), L));

  // ================= Leer el cubo =================
  await p.evaluate(() => window.OP3.showView('crono'));
  await p.click('#cubeSync');
  await wait(150);
  await p.evaluate(() => window.OP3.showView('practicar'));
  check('Practicar: «Leer el cubo» shown with a cube', await p.isVisible('#readCube'));
  await p.click('#readCube');
  await p.waitForFunction(() => /resuelto/.test(document.getElementById('result').textContent), null, { timeout: 5000 }).catch(() => {});
  check('solved cube → «mézclalo como quieras»', /El cubo está resuelto: mézclalo/.test(await p.textContent('#result')), await p.textContent('#result'));
  // Wait for the scramble generator to be ready.
  await p.waitForFunction(() => document.getElementById('newScr').textContent === 'Nuevo scramble', null, { timeout: 30000 });
  const hand = "R U F' L2 D B' R2 U' F D2 L' B U2 R' D F2 L";
  await turn(hand);
  await p.click('#readCube');
  await p.waitForFunction(() => /Scramble leído de tu cubo/.test(document.getElementById('result').textContent), null, { timeout: 40000 }).catch(() => {});
  let r = await p.evaluate(() => {
    const O = window.OP3;
    const scr2 = document.getElementById('scr').value.trim();
    const st2 = O.cube.norm(O.apply(O.solved(), scr2));
    return { scr: scr2, same: st2.join(',') === O.cube.link.state().join(','), memo: document.getElementById('memoE').value + document.getElementById('memoC').value, msg: document.getElementById('result').textContent };
  });
  check('hand scramble read: your own turns become the scramble', r.same && r.scr === hand, r.scr);
  check('memo fields cleared for your own memo, with a hint', r.memo === '' && /Generar memo recomendado/.test(r.msg), r.msg);
  await p.click('#generate');
  check('«Generar memo recomendado» works on it', await p.evaluate(() => document.getElementById('memoE').value.length > 0));
  await p.evaluate(() => window.OP3.showView('crono'));
  const fol = await p.textContent('#cubeScr');
  check('Cronómetro: the cube already counts as mixed', /✓ Cubo mezclado/.test(fol), fol.slice(-60));
  // A short scramble: no turns that cancel each other.
  await p.click('#cubeSync');
  await wait(150);
  await turn('R U');
  await p.evaluate(() => window.OP3.showView('practicar'));
  await p.click('#readCube');
  await p.waitForFunction(() => /Scramble leído de tu cubo/.test(document.getElementById('result').textContent), null, { timeout: 40000 }).catch(() => {});
  r = await p.evaluate(() => document.getElementById('scr').value.trim());
  const clean = await p.evaluate((s) => {
    const m = window.OP3.parseAlg(s);
    const AX = { U: 0, D: 0, R: 1, L: 1, F: 2, B: 2 };
    return m.every((x, i) => i === 0 || x.base !== m[i - 1].base) && !m.some((x, i) => i >= 2 && AX[x.base] === AX[m[i - 1].base] && AX[x.base] === AX[m[i - 2].base]);
  }, r);
  check('short hand scramble → exactly what you did', r === 'R U' && clean, r);
  // Turns the app did not see (the cube lost track): the solver works the scramble out from the state.
  await p.click('#cubeSync').catch(() => {});
  await p.evaluate(() => window.OP3.showView('crono'));
  await p.click('#cubeSync');
  await wait(150);
  await p.evaluate(() => window.OP3.cube.link.silent("D2 L F' U2 B R' D L2 F U' R2 B2"));
  await p.evaluate(() => window.OP3.showView('practicar'));
  await p.click('#readCube');
  await p.waitForFunction((prev) => /Scramble leído de tu cubo/.test(document.getElementById('result').textContent) && document.getElementById('scr').value.trim() !== prev, 'R U', { timeout: 40000 }).catch(() => {});
  r = await p.evaluate(() => { const O = window.OP3; const s2 = document.getElementById('scr').value.trim(); return { s2, same: O.cube.norm(O.apply(O.solved(), s2)).join(',') === O.cube.link.state().join(',') }; });
  check('unseen turns → the solver finds a scramble for that exact cube', r.same && r.s2 !== 'R U', r.s2);
  // Cronómetro: «Usar mi cubo como scramble» when the cube is mixed some other way.
  await p.evaluate(() => window.OP3.showView('crono'));
  await setScr("F2 D' L2 U R'");
  await turn("B L'");
  await wait(50);
  check('Cronómetro: «Usar mi cubo como scramble» offered when lost', await p.isVisible('#cubeUseState'));
  await p.click('#cubeUseState');
  await p.waitForFunction(() => /Listo: el scramble de la app es ahora el de tu cubo/.test(document.getElementById('cubeMsg').textContent), null, { timeout: 40000 }).catch(() => {});
  const fol2 = await p.textContent('#cubeScr');
  check('…and then it counts as mixed', /✓ Cubo mezclado/.test(fol2) && await p.isHidden('#cubeUseState'), fol2.slice(-60));

  // A DNF right at a cycle break: the cube cannot know which letter came next, and says so.
  await p.evaluate(() => window.OP3.showView('crono'));
  await wait(3200);
  await p.click('#cubeSync');
  await wait(150);
  const brk = await p.evaluate(() => {
    const O = window.OP3;
    const m = O.MODES.edge;
    for (let tries = 0; tries < 300; tries++) {
      const scr = O.randomMoveScramble(20);
      let st = O.cube.norm(O.apply(O.solved(), scr));
      const toks = O.cube.simMemo(st);
      for (let i = 0; i < toks.length; i++) {
        const t = toks[i];
        if (t.kind !== 'edge') break;
        if (i >= 1 && m.buffer.some((b) => m.posOf[b] === st[m.posOf[m.read]])) return { scr, toks, k: i };
        st = O.apply(st, O.tokenAlg(t));
      }
    }
    return null;
  });
  check('setup: a scramble with an edge cycle break', !!brk);
  if (brk) {
    await setScr(brk.scr);
    await turn(brk.scr);
    await p.keyboard.press('Space');
    await wait(100);
    await p.evaluate(([t, k]) => { const O = window.OP3; const a = t.map((x) => O.tokenAlg(x)); a[k] = O.cube.flawed(t[k]); return O.cube.link.play(a, 400); }, [brk.toks, brk.k]);
    await p.keyboard.press('Space');
    await p.waitForFunction(() => /no está resuelto/.test(document.getElementById('verdictAsk').textContent), null, { timeout: 3000 }).catch(() => {});
    const rep2 = await p.textContent('#cubeReport');
    check('DNF at a cycle break: says it was a cycle break', /Ahí tocaba un cambio de ciclo de aristas/.test(rep2), rep2.slice(0, 200));
    await p.click('#markDnf');
  }

  console.log(results.join('\n'));
  console.log('page errors:', errs.length ? errs : 'none');
  console.log(`${results.filter((x) => x.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
