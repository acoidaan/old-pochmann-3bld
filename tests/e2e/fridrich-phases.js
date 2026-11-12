// «Fridrich reducido», practising one phase: the scrambles of «Última capa» and «Solo PLL» leave the cross and
// the F2L done and only bring the cases asked for; their times go to their own list (not the solves', the
// records or the ranking), with their own averages; a note on a solve; the phase times and notes in sync;
// timing by phases by hand (a press at the end of each one: the panel, the history, the pace, «Última capa»);
// «Solo F2L» (the cross done; by hand, pair by pair; with the cube, it stops when the F2L is done, with each
// pair, its analysis and its turns); «Cruz + F2L» (a whole scramble, the same up to the F2L, the cross too);
// the judge's voice in the inspection (recorded, «eight seconds», «twelve seconds»; or the browser's in Spanish;
// off in Ajustes); the phone.
const { chromium, devices } = require('playwright');
const { SITE, SHOTS } = require('../env');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const open = async (opts, query = '') => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('cfop:learn:v1', JSON.stringify({ sune: 'known', antisune: 'learning', i: 'known', head: 'known', ua: 'known' }));
    });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`${SITE}/fridrich${query}#crono`);
    await p.waitForFunction(() => window.Fridrich && window.Fridrich.scramble(), null, { timeout: 40000 });
    return { ctx, p };
  };
  const idle = (p) => p.waitForFunction(() => !document.getElementById('newScr').disabled, null, { timeout: 40000 });
  // A scramble of that practice in place (one for another may finish first).
  const modeReady = (p, m) => p.waitForFunction((x) => (JSON.parse(localStorage.getItem('cfop:scrmeta:v1') || '{}').m === x), m, { timeout: 40000 });
  const sample = async (p, n) => {
    const out = [];
    for (let k = 0; k < n; k++) {
      await idle(p);
      await p.click('#newScr');
      await p.waitForTimeout(30);
      await idle(p);
      out.push(await p.evaluate(() => {
        const M = window.CubeModel;
        const C = window.Cfop;
        const r = C.readCube(M.apply(M.solved(), window.Fridrich.scramble()), 'U');
        const meta = JSON.parse(localStorage.getItem('cfop:scrmeta:v1'));
        return { stage: r.stage, pairs: r.n, m: meta.m, c: meta.c || [] };
      }));
    }
    return out;
  };
  const { ctx, p } = await open({});

  await p.selectOption('#scrMode', 'll');
  await p.selectOption('#scrCases', 'known');
  let s = await sample(p, 6);
  check('última capa · los que me sé: the F2L done, and only known cases (one per step)', s.every((x) => x.pairs === 4 && x.m === 'll' && x.c.join() === 'i,sune,head,ua'), JSON.stringify(s));
  check('última capa: the cross button goes (the cross is done) and the count says the phase', await p.evaluate(() => document.getElementById('crossShow').hidden && /Última capa/.test(document.getElementById('scrCount').textContent)));
  await p.selectOption('#scrCases', 'kl');
  s = await sample(p, 10);
  check('última capa · sé + aprendiendo: the learning case comes too', s.every((x) => x.pairs === 4 && ['sune', 'antisune'].includes(x.c[1])) && s.some((x) => x.c[1] === 'antisune'), JSON.stringify(s.map((x) => x.c[1])));
  await p.selectOption('#scrMode', 'pll');
  await p.selectOption('#scrCases', 'all');
  s = await sample(p, 5);
  check('solo PLL · todos: the OLL done too (stage PLL), two PLL cases', s.every((x) => x.stage >= 4 && x.pairs === 4 && x.m === 'pll' && x.c.length === 2), JSON.stringify(s));

  // Two timed «Solo PLL» solves (by hand): their own list.
  for (let k = 0; k < 2; k++) {
    await idle(p);
    await p.keyboard.down(' ');
    await p.waitForTimeout(400);
    await p.keyboard.up(' ');
    await p.waitForTimeout(600);
    await p.keyboard.press('a');
    await p.waitForTimeout(300);
  }
  const st = await p.evaluate(() => ({
    full: JSON.parse(localStorage.getItem('cfop:times:v1') || '[]').length,
    l: JSON.parse(localStorage.getItem('cfop:ltimes:v1') || '[]').map((r) => r.m),
    stats: document.getElementById('stats').innerText,
    rows: document.querySelectorAll('#history tbody tr').length,
    shown: document.querySelector('[data-hist="pll"]').getAttribute('aria-pressed'),
  }));
  check('solo PLL: the times go to their own list, not to the solves', st.full === 0 && st.l.join() === 'pll,pll' && /SOLVES\s*2/i.test(st.stats) && st.rows === 2 && st.shown === 'true', JSON.stringify(st));
  await p.click('[data-hist="full"]');
  check('the solves list stays empty', /Aún no hay tiempos/.test(await p.evaluate(() => document.getElementById('history').innerText)));
  await p.click('[data-hist="ll"]');
  check('última capa: none yet, says how', /Última capa/.test(await p.evaluate(() => document.getElementById('history').innerText)));
  await p.click('[data-hist="pll"]');

  // A note.
  await p.click('#history [data-note]');
  await p.fill('.fr-note-form input', 'me lie con la T');
  await p.press('.fr-note-form input', 'Enter');
  const note = await p.evaluate(() => ({ text: (document.querySelector('.fr-note-text') || {}).textContent, saved: JSON.parse(localStorage.getItem('cfop:ltimes:v1')).filter((r) => r.no).map((r) => r.no) }));
  check('a note on a solve: saved and shown under it', note.text === 'me lie con la T' && note.saved.join() === 'me lie con la T', JSON.stringify(note));
  await p.click('#history [data-note]');
  await p.fill('.fr-note-form input', '');
  await p.click('.fr-note-form button');
  check('a note emptied goes', await p.evaluate(() => !document.querySelector('.fr-note-text') && !JSON.parse(localStorage.getItem('cfop:ltimes:v1')).some((r) => r.no)));

  // Sync: the phase times travel and a newer note wins.
  const merged = await p.evaluate(() => {
    const F = window.Fridrich._;
    const mine = JSON.parse(localStorage.getItem('cfop:ltimes:v1'));
    const remote = { ltimes: [{ ...mine[0], no: 'desde el móvil', ed: Date.now() + 1000 }, { at: 1000, t: 4000, pen: 0, scr: "R U R'", m: 'll' }] };
    F.mergeIn(remote);
    const l = JSON.parse(localStorage.getItem('cfop:ltimes:v1'));
    return { n: l.length, note: l.find((r) => r.at === mine[0].at).no, data: !!F.syncData().ltimes };
  });
  check('sync: the phase times and their notes travel', merged.n === 3 && merged.note === 'desde el móvil' && merged.data, JSON.stringify(merged));
  await ctx.close();

  // ================= By phases, by hand (csTimer's «multi-phase») =================
  const hp = await open({});
  const q = hp.p;
  const clk = () => q.evaluate(() => ({ ph: document.getElementById('clockPhase').textContent, sub: document.getElementById('clockSplit').textContent, pace: document.getElementById('pace').textContent }));
  const go = async () => { await idle(q); await q.keyboard.down(' '); await q.waitForTimeout(400); await q.keyboard.up(' '); await q.waitForTimeout(300); };
  const tap = async () => { await q.keyboard.press(' '); await q.waitForTimeout(300); };
  check('by phases: offered without the smart cube', await q.evaluate(() => !document.getElementById('setPhasesRow').hidden && /Cruz, F2L, OLL, PLL/.test(document.getElementById('setPhasesHint').textContent)));
  await q.check('#setPhases');
  await go();
  const c0 = await clk();
  await q.keyboard.press(' ');   // the cross done
  await q.keyboard.press(' ');   // straight after: a bounce, nothing
  const c1 = await clk();
  check('by phases: it says the phase and what to press for; a second press at once is a bounce', c0.ph === 'Cruz · 1/4' && /al acabar la cruz/.test(c0.sub) && c1.ph === 'F2L · 2/4' && /al acabar el F2L/.test(c1.sub) && /Cruz\s*\d+\.\d\d/.test(c1.pace), JSON.stringify({ c0, c1 }));
  check('by phases: a soft touch at the end of a phase', (await q.evaluate(() => window.Fridrich.cube().fxLog.filter((x) => x === 'phase').length)) === 1, JSON.stringify(await q.evaluate(() => window.Fridrich.cube().fxLog)));
  await q.waitForTimeout(300);
  await tap();   // F2L
  await tap();   // OLL
  const c3 = await clk();
  await q.keyboard.press(' ');   // PLL: stops
  await q.waitForTimeout(150);
  const r1 = await q.evaluate(() => JSON.parse(localStorage.getItem('cfop:times:v1'))[0]);
  check('by phases: the last press stops; each phase kept, adding up to the time', c3.ph === 'PLL · 4/4' && /para parar/.test(c3.sub) && Array.isArray(r1.ph) && r1.ph.length === 4 && r1.ph.reduce((a, x) => a + x, 0) === r1.t && r1.ph.every((x) => x >= 200), JSON.stringify({ c3, r1 }));
  const after = await q.evaluate(() => ({
    splits: document.getElementById('splits').innerText.replace(/\s+/g, ' '),
    row: [...document.querySelector('#history tbody tr').cells].slice(3, 7).map((c) => c.textContent),
    phases: document.getElementById('phasesN').textContent,
  }));
  check('by phases: the panel after the solve, the history and where the time goes', /por fases/i.test(after.splits) && /Cruz[\s\S]*F2L[\s\S]*OLL[\s\S]*PLL/.test(after.splits) && after.row.every((x) => /^\d+\.\d\d$/.test(x)) && /media de 1 solve por fases/.test(after.phases), JSON.stringify(after));
  // Two more, and the third has a reference to go against, as with the cube.
  for (let k = 0; k < 2; k++) { await go(); for (let j = 0; j < 4; j++) await tap(); }
  check('by phases: they make the pace reference', await q.evaluate(() => { const r = window.Fridrich._.paceRef(); return !!r && /tu media de 3/.test(r.label); }));
  await go();
  await tap();
  const live = await clk();
  for (let j = 0; j < 3; j++) await tap();
  check('by phases: the pace live and after, against your average', /Cruz\s*\d+\.\d\d\s*[+−±]\d+\.\d/.test(live.pace) && /Contra tu media de 3/.test(await q.evaluate(() => document.getElementById('splits').innerText)), JSON.stringify(live));
  // «Última capa»: OLL and PLL.
  await q.selectOption('#scrMode', 'll');
  check('by phases: «Última capa» is OLL and PLL', /OLL, PLL/.test(await q.evaluate(() => document.getElementById('setPhasesHint').textContent)));
  await go();
  await tap();
  await tap();
  const ll = await q.evaluate(() => ({ r: JSON.parse(localStorage.getItem('cfop:ltimes:v1'))[0], row: [...document.querySelector('#history tbody tr').cells].slice(3, 5).map((c) => c.textContent) }));
  check('by phases: «Última capa» keeps its two, in its own list', ll.r && ll.r.m === 'll' && ll.r.ph && ll.r.ph.length === 2 && ll.row.every((x) => /^\d+\.\d\d$/.test(x)), JSON.stringify(ll));
  await q.selectOption('#scrMode', 'pll');
  check('by phases: not for «Solo PLL» (one phase)', await q.evaluate(() => document.getElementById('setPhasesRow').hidden));
  // The touch can be turned off (Ajustes), and goes with the sound.
  await q.evaluate(() => window.Fridrich.showView('ajustes'));
  await q.uncheck('#setPhaseSound');
  await q.uncheck('#setSound');
  const offSet = await q.evaluate(() => document.getElementById('setPhaseSound').disabled);
  await q.check('#setSound');
  await q.evaluate(() => window.Fridrich.showView('crono'));
  // «Solo F2L»: the cross comes done; by phases, one press per pair.
  const fxBefore = await q.evaluate(() => window.Fridrich.cube().fxLog.filter((x) => x === 'phase').length);
  await q.selectOption('#scrMode', 'f2l');
  await modeReady(q, 'f2l');
  const f2s = await q.evaluate(() => {
    const M = window.CubeModel;
    const r = window.Cfop.readFace(M.apply(M.solved(), window.Fridrich.scramble()), 'U');
    return { cross: r.cross, stage: r.stage, m: JSON.parse(localStorage.getItem('cfop:scrmeta:v1')).m, cases: document.getElementById('scrCasesBox').hidden, crossBtn: document.getElementById('crossShow').hidden, hint: document.getElementById('setPhasesHint').textContent };
  });
  check('solo F2L: the scramble leaves the white cross done and the F2L to do; no cases to choose, no cross to show', f2s.cross === 4 && f2s.stage === 1 && f2s.m === 'f2l' && f2s.cases && f2s.crossBtn && /cada pareja/.test(f2s.hint), JSON.stringify(f2s));
  await go();
  const p1 = await clk();
  for (let j = 0; j < 4; j++) await tap();
  const f2 = await q.evaluate(() => ({
    r: JSON.parse(localStorage.getItem('cfop:ltimes:v1')).find((x) => x.m === 'f2l'),
    head: document.querySelector('#history thead').innerText.replace(/\s+/g, ' '),
    row: [...document.querySelector('#history tbody tr').cells].slice(3, 7).map((c) => c.textContent),
    splits: document.getElementById('splits').innerText.replace(/\s+/g, ' '),
  }));
  check('the soft touch off in Ajustes (and greyed out without the sound): no touch', offSet && (await q.evaluate(() => window.Fridrich.cube().fxLog.filter((x) => x === 'phase').length)) === fxBefore);
  check('solo F2L by hand: pair by pair, in its own list with a column for each', p1.ph === 'Pareja 1 · 1/4' && /al acabar la 1\.ª pareja/.test(p1.sub) && f2.r && f2.r.ph.length === 4 && /P1\s*P2\s*P3\s*P4/i.test(f2.head) && f2.row.every((x) => /^\d+\.\d\d$/.test(x)) && /Tu F2L por parejas/i.test(f2.splits), JSON.stringify({ p1, f2 }));
  // «Cruz + F2L»: a whole scramble (the shortest cross to see), the cross and the F2L.
  await q.selectOption('#scrMode', 'cf2l');
  await modeReady(q, 'cf2l');
  await idle(q);
  const cfs = await q.evaluate(() => {
    const M = window.CubeModel;
    const r = window.Cfop.readFace(M.apply(M.solved(), window.Fridrich.scramble()), 'U');
    return { cross: r.cross, crossBtn: !document.getElementById('crossShow').hidden, cases: document.getElementById('scrCasesBox').hidden, hint: document.getElementById('setPhasesHint').textContent };
  });
  check('cruz + F2L: a whole scramble, its shortest cross to see, by phases the cross and the F2L', cfs.cross < 4 && cfs.crossBtn && cfs.cases && /Cruz, F2L/.test(cfs.hint), JSON.stringify(cfs));
  await go();
  await tap();
  await tap();
  const cf = await q.evaluate(() => ({
    r: JSON.parse(localStorage.getItem('cfop:ltimes:v1')).find((x) => x.m === 'cf2l'),
    head: document.querySelector('#history thead').innerText.replace(/\s+/g, ' '),
    row: [...document.querySelector('#history tbody tr').cells].slice(3, 5).map((c) => c.textContent),
    splits: document.getElementById('splits').innerText.replace(/\s+/g, ' '),
  }));
  // The chart of each list: «Cruz + F2L» with three solves of its own.
  for (let k = 0; k < 2; k++) { await go(); await tap(); await tap(); }
  const ch = await q.evaluate(() => ({ shown: !document.getElementById('chartBox').hidden, end: [...document.querySelectorAll('#chart .fr-tick')].map((t) => t.textContent).pop(), n: JSON.parse(localStorage.getItem('cfop:ltimes:v1')).filter((r) => r.m === 'cf2l').length }));
  check('the chart («Cómo vas») in the lists of one phase too, with their own solves', ch.shown && ch.n === 3 && ch.end === '#3', JSON.stringify(ch));
  check('cruz + F2L by hand: in its own list, the cross and the F2L', cf.r && cf.r.ph.length === 2 && /Cruz\s*F2L\s*Giros/i.test(cf.head) && cf.row.every((x) => /^\d+\.\d\d$/.test(x)) && /Tu cruz y tu F2L/i.test(cf.splits), JSON.stringify(cf));
  await q.selectOption('#scrMode', 'full');
  await hp.ctx.close();

  // ================= «Solo F2L» with the smart cube (the virtual one) =================
  const vc = await open({}, '?cubo=virtual');
  const v = vc.p;
  await v.evaluate(() => document.getElementById('cubeSim').click());
  await v.waitForFunction(() => window.Fridrich.cube().on);
  await v.selectOption('#scrMode', 'f2l');
  await modeReady(v, 'f2l');
  await v.evaluate(() => window.Fridrich.cube().link.turn(window.Fridrich.scramble()));
  await v.waitForTimeout(150);
  await v.evaluate(() => window.Fridrich.cube().link.turn('z2'));   // white down, as you hold it
  // Pair by pair, the shortest each time, a moment apart.
  for (let k = 0; k < 4; k++) {
    const left = await v.evaluate(() => {
      const C = window.Cfop;
      const g = C.canon(window.Fridrich.cube().state, 'U');
      if (C.stageOf(g).stage >= 2) return 0;
      const sol = C.pairSolutions(g, 600000)[0];
      window.Fridrich.cube().link.turn(sol.moves);
      return 1;
    });
    if (!left) break;
    await v.waitForTimeout(250);
  }
  await v.waitForFunction(() => { const l = JSON.parse(localStorage.getItem('cfop:ltimes:v1') || '[]'); return l.length && l[0].an; }, null, { timeout: 20000 }).catch(() => {});
  const vr = await v.evaluate(() => ({
    r: JSON.parse(localStorage.getItem('cfop:ltimes:v1') || '[]')[0],
    solved: window.CubeModel.isSolved(window.Fridrich.cube().state),
    clock: document.getElementById('clock').dataset.phase,
    splits: document.getElementById('splits').innerText.replace(/\s+/g, ' '),
    row: [...document.querySelector('#history tbody tr').cells].map((c) => c.textContent.trim()),
  }));
  const r2 = vr.r || {};
  check('solo F2L with the cube: it stops when the F2L is done (the cube not solved yet)', vr.clock === 'done' && !vr.solved && r2.m === 'f2l' && r2.sp && r2.sp.s[1], JSON.stringify({ clock: vr.clock, solved: vr.solved, r: r2 }).slice(0, 300));
  check('solo F2L with the cube: each pair, adding up to the time', Array.isArray(r2.ph) && r2.ph.length === 4 && r2.ph.reduce((a, x) => a + x, 0) === r2.t, JSON.stringify(r2.ph));
  const fxF = await v.evaluate(() => window.Fridrich.cube().fxLog.slice());
  check('solo F2L with the cube: a soft touch for each pair, and the chime at the end', fxF.filter((x) => x === 'phase').length >= 1 && fxF.filter((x) => x === 'phase').length <= 3 && fxF[fxF.length - 1] === 'chime', JSON.stringify(fxF));
  check('solo F2L with the cube: each pair against the shortest, no cross or last layer, and its turns', /Tu F2L · cruz blanca/i.test(vr.splits) && /Pareja 1/.test(vr.splits) && !/Cruz \d/.test(vr.splits) && !/OLL/.test(vr.splits) && /de eficiencia/.test(vr.splits) && /Reconstrucción/.test(vr.splits), vr.splits.slice(0, 400));
  check('solo F2L with the cube: the history with each pair and the turns', vr.row.slice(3, 7).every((x) => /^\d+\.\d\d$/.test(x)) && /\d+ giros · \d+ %/.test(vr.row[7]), JSON.stringify(vr.row));
  await vc.ctx.close();

  // ================= «Cruz + F2L» with the smart cube =================
  const vc2 = await open({}, '?cubo=virtual');
  const w = vc2.p;
  await w.evaluate(() => document.getElementById('cubeSim').click());
  await w.waitForFunction(() => window.Fridrich.cube().on);
  await w.selectOption('#scrMode', 'cf2l');
  await modeReady(w, 'cf2l');
  await idle(w);
  await w.evaluate(() => window.Fridrich.cube().link.turn(window.Fridrich.scramble()));
  await w.waitForTimeout(150);
  // White down, its shortest cross, then pair by pair.
  await w.evaluate(() => { const C = window.Cfop; const x = C.bestCross(window.Fridrich.cube().state, 'U'); window.Fridrich.cube().link.turn(`z2 ${x.moves}`); });
  await w.waitForTimeout(250);
  for (let k = 0; k < 4; k++) {
    const left = await w.evaluate(() => {
      const C = window.Cfop;
      const g = C.canon(window.Fridrich.cube().state, 'U');
      if (C.stageOf(g).stage >= 2) return 0;
      window.Fridrich.cube().link.turn(C.pairSolutions(g, 600000)[0].moves);
      return 1;
    });
    if (!left) break;
    await w.waitForTimeout(250);
  }
  await w.waitForFunction(() => { const l = JSON.parse(localStorage.getItem('cfop:ltimes:v1') || '[]'); return l.length && l[0].an; }, null, { timeout: 20000 }).catch(() => {});
  const wr = await w.evaluate(() => ({
    r: JSON.parse(localStorage.getItem('cfop:ltimes:v1') || '[]')[0],
    solved: window.CubeModel.isSolved(window.Fridrich.cube().state),
    clock: document.getElementById('clock').dataset.phase,
    splits: document.getElementById('splits').innerText.replace(/\s+/g, ' '),
    row: [...document.querySelector('#history tbody tr').cells].map((c) => c.textContent.trim()),
  }));
  const r3 = wr.r || {};
  check('cruz + F2L with the cube: it stops when the F2L is done, the cross and the F2L adding up to the time', wr.clock === 'done' && !wr.solved && r3.m === 'cf2l' && Array.isArray(r3.ph) && r3.ph.length === 2 && r3.ph[0] + r3.ph[1] === r3.t, JSON.stringify({ clock: wr.clock, solved: wr.solved, ph: r3.ph, t: r3.t, m: r3.m }));
  const fxC = await w.evaluate(() => window.Fridrich.cube().fxLog.slice());
  check('cruz + F2L with the cube: a soft touch when the cross is done, then the chime', fxC.filter((x) => x === 'phase').length === 1 && fxC[fxC.length - 1] === 'chime', JSON.stringify(fxC));
  check('cruz + F2L with the cube: the cross and each pair against the shortest, no last layer', /Tu cruz y tu F2L/i.test(wr.splits) && /Cruz \d/.test(wr.splits) && /Pareja 1/.test(wr.splits) && !/OLL/.test(wr.splits) && /Reconstrucción/.test(wr.splits), wr.splits.slice(0, 400));
  check('cruz + F2L with the cube: the history with the cross, the F2L and the turns', wr.row.slice(3, 5).every((x) => /^\d+\.\d\d$/.test(x)) && /\d+ giros · \d+ %/.test(wr.row[5]), JSON.stringify(wr.row));
  await vc2.ctx.close();

  // ================= The judge's voice in the inspection =================
  const vo = await open({});
  const u = vo.p;
  await u.evaluate(() => { window.__said = []; window.speechSynthesis.speak = (x) => window.__said.push(x.text); });
  const said = () => u.evaluate(() => window.__said.filter((t) => t.trim()));
  const clips = () => u.evaluate(() => window.Fridrich.cube().fxLog.filter((x) => x.startsWith('clip:')));
  await u.evaluate(() => window.Fridrich.showView('ajustes'));
  await u.check('#setInspect');
  const vset = await u.evaluate(() => ({ on: document.getElementById('setVoice').checked, src: document.getElementById('setVoiceName').value }));
  await u.click('#voiceTry');
  await u.waitForTimeout(400);
  const tried = await clips();
  await u.evaluate(() => window.Fridrich.showView('crono'));
  await idle(u);
  const inspect = async () => { await u.keyboard.down(' '); await u.waitForTimeout(400); await u.keyboard.up(' '); await u.waitForTimeout(100); };
  const shift = async (ms) => { await u.evaluate((x) => { window.Fridrich._.timer.insp0 -= x; }, ms); await u.waitForTimeout(350); };
  await inspect();
  const ph0 = await u.evaluate(() => window.Fridrich._.timer.phase);
  await shift(8000);
  const c8 = await clips();
  await shift(4000);
  const c12 = await clips();
  check('voice: the recorded one by default; «Probar» plays it, then «eight seconds» at 8 s and «twelve seconds» at 12 s of the inspection, once each', vset.on && vset.src === 'clip' && tried.join() === 'clip:eight' && ph0 === 'inspect' && c8.join() === 'clip:eight,clip:eight' && c12.join() === 'clip:eight,clip:eight,clip:twelve' && !(await said()).length, JSON.stringify({ vset, tried, ph0, c8, c12 }));
  await u.keyboard.press('Escape');
  // The browser's own instead, in Spanish.
  await u.evaluate(() => window.Fridrich.showView('ajustes'));
  await u.selectOption('#setVoiceName', '');
  await u.evaluate(() => window.Fridrich.showView('crono'));
  await inspect();
  await shift(8000);
  check('voice: the browser’s instead, «Ocho segundos»', (await said()).join() === 'Ocho segundos,Ocho segundos' && (await clips()).length === 3, JSON.stringify(await said()));
  await u.keyboard.press('Escape');
  await u.evaluate(() => window.Fridrich.showView('ajustes'));
  await u.uncheck('#setVoice');
  await u.evaluate(() => window.Fridrich.showView('crono'));
  await inspect();
  await shift(8500);
  check('voice: off in Ajustes, silence', (await said()).length === 2 && (await clips()).length === 3);
  await u.keyboard.press('Escape');
  await vo.ctx.close();

  // Phone.
  const ph = await open({ ...devices['Pixel 7'] });
  await ph.p.selectOption('#scrMode', 'll');
  await idle(ph.p);
  const over = await ph.p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('phone: fits', over <= 0, String(over));
  await ph.p.screenshot({ path: `${SHOTS}/fridrich-phases-pixel7.png` });
  await ph.ctx.close();

  results.forEach((r) => console.log(r));
  console.log(`page errors: ${errs.length ? JSON.stringify(errs) : 'none'}`);
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
