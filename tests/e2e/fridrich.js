// «Fridrich reducido» (/fridrich): timer, inspection, the smart cube with splits and live cases, practice
// without the clock, the shortest cross, the cases, both trainers, the overlay and the phone layout.
const { chromium, devices } = require('playwright');
const { SITE, SITE_PLAIN, SHOTS } = require('../env');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);

// A CFOP solve as held with white down (J Perm's algorithms for the last layer): the cross, four pairs
// inserted the simple way, then I-Shape, Sune, Headlights and Ua. Its scramble is the reverse.
const SOLVE = ["D R' F2 L", "U R U' R'", "U' F' U F", "L' U' L", "U B U' B'", "F R U R' U' F'", "R U R' U R U2 R'", "R U R' U' R' F R2 U' R' U' R U R' F'", "R U' R U R U R U' R' U' R2"];

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const open = async (opts, url) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(url);
    return { ctx, p };
  };
  const { ctx, p } = await open({}, `${SITE}/fridrich?cubo=virtual#crono`);
  const st = () => p.evaluate(() => ({
    phase: document.getElementById('clock').dataset.phase,
    label: document.getElementById('clockPhase').textContent,
    time: document.getElementById('clockTime').textContent,
    hint: document.getElementById('scrHint').hidden ? '' : document.getElementById('scrHint').innerText,
    live: document.getElementById('live').hidden ? null : document.getElementById('liveNow').innerText,
    steps: [...document.querySelectorAll('#liveSteps li')].map((li) => li.className),
  }));
  const turn = (a) => p.evaluate((x) => window.Fridrich.cube().link.turn(x), a);
  const times = () => p.evaluate(() => JSON.parse(localStorage.getItem('cfop:times:v1') || '[]'));

  // ================= The page =================
  await p.waitForFunction(() => window.Fridrich && window.Fridrich.scramble().split(' ').length >= 15, null, { timeout: 30000 });
  const scr0 = await p.evaluate(() => window.Fridrich.scramble());
  check('page: a random-state scramble', scr0.split(' ').length >= 15 && scr0.split(' ').length <= 24, scr0);
  check('page: link back to the 3BLD app', await p.evaluate(() => { const a = document.querySelector('.fr-switch'); return !!a && new URL(a.href).pathname === '/'; }));

  // ================= Timer without a cube =================
  await p.keyboard.down(' ');
  await p.waitForTimeout(80);
  let s = await st();
  check('timer: holding Space → «Mantén…»', s.phase === 'hold', JSON.stringify(s));
  await p.waitForTimeout(350);
  s = await st();
  check('timer: held long enough → ready (green)', s.phase === 'ready' && /Suelta/.test(s.label), JSON.stringify(s));
  await p.keyboard.up(' ');
  await p.waitForTimeout(400);
  s = await st();
  check('timer: released → running', s.phase === 'run' && Number(s.time) > 0.2, JSON.stringify(s));
  await p.keyboard.press('Space');
  await p.waitForTimeout(100);
  s = await st();
  let ts = await times();
  check('timer: Space again → stopped and saved', s.phase === 'done' && ts.length === 1 && ts[0].t > 300 && ts[0].scr === scr0, JSON.stringify(ts));
  // A released-too-early press does nothing.
  await p.keyboard.down(' ');
  await p.waitForTimeout(100);
  await p.keyboard.up(' ');
  await p.waitForTimeout(100);
  s = await st();
  check('timer: a short tap does not start it', s.phase === 'done' || s.phase === 'idle', JSON.stringify(s));
  // Esc cancels.
  await p.keyboard.down(' '); await p.waitForTimeout(350); await p.keyboard.up(' ');
  await p.waitForTimeout(150);
  await p.keyboard.press('Escape');
  s = await st();
  check('timer: Esc cancels a running solve, nothing saved', s.phase === 'idle' && (await times()).length === 1, JSON.stringify(s));
  // Touch/click on the clock: press and hold, release, press to stop.
  const box = await p.locator('#clock').boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down(); await p.waitForTimeout(380); await p.mouse.up();
  await p.waitForTimeout(250);
  await p.mouse.down(); await p.mouse.up();
  check('timer: works holding the clock with the mouse / a finger', (await times()).length === 2);
  // Penalties and deleting from the history.
  await p.click('[data-pen="2"][data-i="1"]');
  ts = await times();
  check('history: +2 marks it', ts[1].pen === 2 && /\+/.test(await p.locator('#history tbody tr').first().innerText()));
  await p.click('[data-pen="dnf"][data-i="1"]');
  ts = await times();
  check('history: DNF replaces the +2', ts[1].pen === 'dnf' && /DNF/.test(await p.locator('#history tbody tr').first().innerText()));
  await p.click('[data-del="1"]');
  check('history: deleting asks once more', (await times()).length === 2 && /Borrar/.test(await p.locator('[data-del="1"]').innerText()));
  await p.click('[data-del="1"]');
  check('history: … and then deletes', (await times()).length === 1);
  const stats = await p.evaluate(() => [...document.querySelectorAll('#stats .stat')].map((x) => x.innerText.replace(/\s+/g, ' ')));
  check('stats: count, best, ao5, ao12, ao100, mean', stats.length === 6 && /SOLVES 1/i.test(stats[0]), JSON.stringify(stats));

  // ================= Inspection =================
  await p.evaluate(() => window.Fridrich.showView('ajustes'));
  await p.check('#setInspect');
  await p.evaluate(() => window.Fridrich.showView('crono'));
  await p.keyboard.down(' '); await p.waitForTimeout(350); await p.keyboard.up(' ');
  await p.waitForTimeout(200);
  s = await st();
  check('inspection: counts down from 15', s.phase === 'inspect' && /^1[45]$/.test(s.time), JSON.stringify(s));
  await p.keyboard.press('Escape');
  await p.evaluate(() => window.Fridrich.showView('ajustes'));
  await p.uncheck('#setInspect');
  await p.evaluate(() => window.Fridrich.showView('crono'));

  // ================= The smart cube =================
  await p.click('#cubeSim');
  await p.waitForFunction(() => window.Fridrich.cube().on);
  // Our own scramble: the reverse of the solve, as the cube would feel it.
  const scr = await p.evaluate((sol) => {
    const M = window.CubeModel;
    const link = window.Fridrich.cube().virtualLink();
    const out = [];
    link.events$.subscribe((e) => { if (e.type === 'MOVE') out.push(e.move); });
    link.turn(`z2 ${M.invertAlg(sol.join(' '))} z2`);
    const x = M.simplifyAlg(out.join(' '));
    window.Fridrich._.setScramble(x);
    return x;
  }, SOLVE);
  s = await st();
  check('cube: solved cube → the first turn of the scramble', new RegExp(`Giro 1 de ${scr.split(' ').length}: ${scr.split(' ')[0].replace("'", "\\'")}`).test(s.hint), s.hint);
  const mv = scr.split(' ');
  await turn(mv.slice(0, 3).join(' '));
  s = await st();
  check('cube: the scramble is followed turn by turn', new RegExp(`Giro 4 de ${mv.length}`).test(s.hint), s.hint);
  const wrong = ['U', 'D', 'F', 'B', 'L', 'R'].find((f) => f !== mv[3][0]);
  await turn(wrong);
  s = await st();
  check('cube: a wrong turn → undo it', new RegExp(`Deshaz: ${wrong}'`).test(s.hint), s.hint);
  await turn(`${wrong}'`);
  await turn(mv.slice(3).join(' '));
  s = await st();
  check('cube: scrambled → armed, starts with the first turn', /Mezclado/.test(s.hint) && /empieza al girar/i.test(s.label), JSON.stringify(s));
  check('live: before the first turn, the cross', /Cruz blanca: \d de 4 aristas/.test(s.live || ''), s.live);
  await p.click('#crossShow');
  const cross = await p.evaluate(() => document.getElementById('cross').innerText);
  check('cross: the shortest white cross, with z2', /cruz blanca más corta · \d giros?/i.test(cross) && /z2/.test(cross), cross);
  const crossOk = await p.evaluate(() => {
    const C = window.Cfop; const M = window.CubeModel;
    const x = C.bestCross(window.Fridrich.cube().state, 'U');
    return C.stageOf(M.apply(C.canon(window.Fridrich.cube().state, 'U'), x.moves)).cross === 4 && x.length <= 8;
  });
  check('cross: and it really does the cross', crossOk);
  await p.click('#crossShow');

  // Solve it, white down. After every turn, which step the help is on: it must never go back.
  await p.evaluate(() => {
    window.__steps = [];
    document.addEventListener('fr:cube', () => {
      const lis = [...document.querySelectorAll('#liveSteps li')];
      window.__steps.push(lis.findIndex((li) => li.className === 'cur'));
    });
  });
  await turn('z2');
  s = await st();
  check('cube: turning the whole cube is not a turn: still waiting', /empieza al girar/i.test(s.label), s.label);
  await p.evaluate((a) => window.Fridrich.cube().link.play([a], 20), SOLVE[0]);
  s = await st();
  check('cube: the first turn started the clock', s.phase === 'run', JSON.stringify(s));
  // Inserting a pair undoes the cross for a moment: the help stays on F2L.
  await turn('U R');
  s = await st();
  check('live: half way through inserting a pair (cross undone) → still F2L, not back to the cross', s.steps[0] === 'done' && s.steps[1] === 'cur' && /F2L/.test(s.live) && !/aristas/.test(s.live), JSON.stringify(s));
  await turn("U' R'");
  for (const part of SOLVE.slice(2, 5)) await p.evaluate((a) => window.Fridrich.cube().link.play([a], 20), part);
  await p.waitForTimeout(150);
  s = await st();
  check('live: F2L done → OLL 1 recognised as I-Shape, with how to hold it', /I-Shape/.test(s.live) && /delante/.test(s.live) && s.steps[1] === 'done' && s.steps[2] === 'cur', JSON.stringify(s));
  await p.evaluate((a) => window.Fridrich.cube().link.play([a], 20), SOLVE[5]);
  await p.waitForTimeout(150);
  s = await st();
  check('live: then OLL 2 → Sune', /Sune/.test(s.live) && /R U R' U R U2 R'/.test(s.live), s.live);
  await turn("R U R'");
  s = await st();
  check('live: halfway through the algorithm → how far along', /3 de 7/.test(s.live), s.live);
  await turn("U R U2 R'");
  await p.waitForTimeout(100);
  s = await st();
  check('live: PLL 1 → Headlights', /Headlights/.test(s.live), s.live);
  await p.screenshot({ path: `${SHOTS}/fridrich-live-1280.png` });
  for (const part of SOLVE.slice(7)) await p.evaluate((a) => window.Fridrich.cube().link.play([a], 20), part);
  await p.waitForTimeout(300);
  s = await st();
  ts = await times();
  const last = ts[ts.length - 1];
  check('cube: solved → the clock stops by itself', s.phase === 'done' && ts.length === 2 && last.scr === scr, JSON.stringify(s));
  const seen = await p.evaluate(() => window.__steps.filter((x) => x >= 0));
  const backs = seen.filter((x, i) => i && x < seen[i - 1]);
  check('live: through the whole solve the step never goes back (cross and F2L come apart mid-algorithm)', seen.length >= 50 && !backs.length, `${seen.length} turns · ${seen.join('')}`);
  const cases = last.sp ? last.sp.s.slice(2).map((x) => x && x[3]) : null;
  check('splits: six steps saved, white cross', last.sp && last.sp.f === 'U' && last.sp.s.every(Boolean), JSON.stringify(last.sp));
  check('splits: the cases were I-Shape, Sune, Headlights, Ua', JSON.stringify(cases) === JSON.stringify(['i', 'sune', 'head', 'ua']), JSON.stringify(cases));
  const sum = last.sp.s.reduce((a, x) => a + x[0], 0);
  check('splits: they add up to the time', Math.abs(sum - last.t) < 60, `${sum} vs ${last.t}`);
  check('splits: moves per step', last.sp.s.map((x) => x[1]).join() === '4,16,6,7,14,11' || last.sp.s.every((x) => x[1] > 0), last.sp.s.map((x) => x[1]).join());
  const table = await p.evaluate(() => document.getElementById('splits').innerText);
  check('splits: the table shows each step, its case and recognition + execution', /OLL 2[\s\S]*Sune/.test(table) && /PLL 2[\s\S]*Ua/.test(table) && /TPS/.test(table), table.slice(0, 300));
  const hist = await p.locator('#history tbody tr').first().innerText();
  check('history: the solve with its step times and cases', /I-Shape · Sune · Headlights · Ua/.test(hist), hist);
  check('phases: where the time goes (with the cube)', await p.evaluate(() => !document.getElementById('phases').hidden && /Cruz[\s\S]*F2L[\s\S]*OLL[\s\S]*PLL/.test(document.getElementById('phaseLegend').innerText)));
  await p.screenshot({ path: `${SHOTS}/fridrich-splits-1280.png`, fullPage: true });

  // ================= Without the clock =================
  await p.click('[data-timed="0"]');
  await p.evaluate(() => window.Fridrich.cube().link.turn(window.Fridrich.scramble()));
  await turn('z2');
  await turn("D R'");
  s = await st();
  check('practice: no clock, turns do not start one', s.phase !== 'run' && (await p.evaluate(() => document.getElementById('clock').hidden)), JSON.stringify(s));
  check('practice: the live help is on', s.live != null, s.live);
  // A Sune done from another side than the one suggested, and a slip in the middle.
  await p.evaluate(() => document.getElementById('cubeSync').click());
  await p.waitForTimeout(400);
  await turn("z2 R U2 R' U' R U' R'");   // white down: the last layer is a Sune
  s = await st();
  check('mid-alg: a Sune on the cube → Sune', /Sune/.test(s.live || ''), s.live);
  const alt = await p.evaluate(() => {
    const C = window.Cfop;
    const read = C.readCube(window.Fridrich.cube().state, 'U');
    const all = C.recognizeAll(read.g, read.stage);
    const other = all.find((r) => r.view || r.pre) || all[0];
    return { n: all.length, seq: [other.view, other.pre, other.case.alg].filter(Boolean).join(' '), front: other.front };
  });
  const altMoves = alt.seq.split(' ');
  const firstTurns = altMoves.filter((m) => !/^y/.test(m)).slice(0, 4).length;
  const upTo = altMoves.findIndex((m, i) => altMoves.slice(0, i + 1).filter((x) => !/^y/.test(x)).length === firstTurns);
  await turn(altMoves.slice(0, upTo + 1).join(' '));
  s = await st();
  check('mid-alg: done from another side → still Sune, following that way', alt.n > 1 && /Sune/.test(s.live || '') && new RegExp(`el ${alt.front} delante`).test(s.live) && s.steps[3] === 'cur', `${alt.seq} · ${s.live}`);
  await turn("F R");
  s = await st();
  check('mid-alg: a turn off the algorithm → the step and the case stay', /Sune/.test(s.live || '') && /Sigues con el algoritmo/.test(s.live) && s.steps[1] === 'done' && s.steps[3] === 'cur', JSON.stringify(s));
  await turn("R' F'");
  await turn(altMoves.slice(upTo + 1).join(' '));
  s = await st();
  check('mid-alg: finished → on to PLL', s.steps[3] === 'done' && /PLL|Resuelto/.test(s.live || ''), JSON.stringify(s));
  await p.click('[data-timed="1"]');
  await p.evaluate(() => document.getElementById('cubeSync').click());
  await p.waitForTimeout(400);

  // ================= Casos =================
  await p.evaluate(() => window.Fridrich.showView('casos'));
  const cards = await p.evaluate(() => [...document.querySelectorAll('.fr-card')].map((c) => [c.dataset.case, c.querySelector('.fr-card-alg').textContent.replace(/\s+/g, ' ').trim()]));
  check('casos: the 16 cases', cards.length === 16, String(cards.length));
  const want = { dot: "F R U R' U' F' f R U R' U' f'", sune: "R U R' U R U2 R'", u: "R2 D R' U2 R D' R' U2 R'", diag: "F R U' R' U' R U R' F' R U R' U' R' F R F'", z: "M' U M2 U M2 U M' U2 M2" };
  check("casos: J Perm's algorithms", Object.entries(want).every(([id, a]) => cards.find((c) => c[0] === id)[1] === a), JSON.stringify(cards.filter((c) => want[c[0]])));
  check('casos: every case drawn', await p.evaluate(() => document.querySelectorAll('.fr-card svg.fr-top').length === 16));
  await p.click('[data-case="sune"] [data-learn="learning"]');
  await p.click('[data-case="ua"] [data-learn="known"]');
  check('casos: what I am learning is kept', await p.evaluate(() => { const l = JSON.parse(localStorage.getItem('cfop:learn:v1')); return l.sune === 'learning' && l.ua === 'known'; }));

  // ================= «Pruébalo»: mix → the case → how to solve it =================
  await p.click('[data-case="antisune"] [data-try]');
  let tryText = await p.evaluate(() => document.querySelector('[data-case="antisune"] .fr-try').innerText.replace(/\s+/g, ' '));
  check('try: the short mix is the algorithm backwards, then the case and its algorithm', /blanco abajo y verde delante, haz: R U R' U R U2 R'/.test(tryText) && /Te queda Antisune/.test(tryText) && /verde delante: R U2 R' U' R U' R'/.test(tryText), tryText);
  await p.click('[data-case="antisune"] [data-try-mode="hidden"]');
  await p.waitForFunction(() => !/Preparando/.test(document.querySelector('[data-case="antisune"] .fr-try').textContent), null, { timeout: 30000 });
  tryText = await p.evaluate(() => document.querySelector('[data-case="antisune"] .fr-try').innerText.replace(/\s+/g, ' '));
  check('try: or a mix that does not give it away', /Te queda Antisune/.test(tryText) && !/haz: R U R' U R U2 R'/.test(tryText) && /Otra mezcla/.test(tryText), tryText);
  // Every case, both ways: doing the mix (held white down, green in front) and then the advice ends solved.
  const tries = await p.evaluate(async () => {
    const M = window.CubeModel; const C = window.Cfop; const make = window.Fridrich._.makeTry;
    const out = [];
    for (const c of C.CASES) {
      for (const hidden of [false, true]) {
        const t = await make(c, hidden);
        let g = M.apply(M.apply(M.solved(), 'z2'), t.setup);   // as held
        const read = C.readCube(M.norm(g), 'U');
        const rec = C.recognize(read.g, read.stage, c);
        const turn = C.VIEWS.find((v) => C.colour(v ? M.apply(g, v) : g, 22) === t.front);
        g = M.apply(g, [turn, t.pre, c.alg, t.post].filter(Boolean).join(' '));
        out.push({ id: c.id, hidden, isCase: !!rec, solved: M.isSolved(M.norm(g)) });
      }
    }
    return out;
  });
  const badTries = tries.filter((x) => !x.isCase || !x.solved);
  check('try: all 16 cases, short and hidden mixes, land on the case and end solved', tries.length === 32 && !badTries.length, JSON.stringify(badTries));

  // ================= Entrenar: recognising =================
  await p.click('[data-case="sune"] [data-train]');
  await p.click('#trModeLook');
  const q1 = await p.evaluate(() => window.Fridrich._.tr.c.id);
  check('train: «Entrenar» on a case → only that case', q1 === 'sune' && await p.evaluate(() => JSON.parse(localStorage.getItem('cfop:pick:v1')).join() === 'sune'), q1);
  await p.keyboard.press(String(await p.evaluate(() => [...document.querySelectorAll('[data-answer]')].findIndex((b) => b.dataset.answer === 'sune') + 1)));
  let fb = await p.evaluate(() => document.getElementById('trFeedback').textContent);
  check('train/look: the right answer (with the keyboard) → ✓ and the algorithm', /✓ Sune/.test(fb) && /R U R' U R U2 R'/.test(fb), fb);
  await p.click('[data-pick="pll"]');
  await p.waitForTimeout(100);
  const q2 = await p.evaluate(() => window.Fridrich._.tr.c);
  const wrongId = await p.evaluate(() => [...document.querySelectorAll('[data-answer]')].map((b) => b.dataset.answer).find((x) => x !== window.Fridrich._.tr.c.id));
  await p.click(`[data-answer="${wrongId}"]`);
  fb = await p.evaluate(() => document.getElementById('trFeedback').textContent);
  check('train/look: a wrong answer → ✗ and what it was', new RegExp(`✗ Era ${q2.name.replace(/[()]/g, '\\$&')}`).test(fb), fb);
  const tr = await p.evaluate(() => JSON.parse(localStorage.getItem('cfop:train:v1')));
  check('train/look: both counted', tr.sune.qn === 1 && tr.sune.qok === 1 && tr[q2.id].qn === 1 && tr[q2.id].qok === 0, JSON.stringify(tr));

  // ================= Entrenar: a normal cube =================
  await p.click('[data-pick="all"]');
  await p.click('#trModeHand');
  await p.waitForFunction(() => window.Fridrich._.tr.hand, null, { timeout: 30000 });
  const h1 = await p.evaluate(() => ({ id: window.Fridrich._.tr.hand.c.id, text: document.getElementById('trBox').innerText }));
  check('train/hand: how to mix a solved cube, then «¿Qué caso te ha quedado?»', /blanco abajo y verde delante, mezcla:/.test(h1.text) && /¿Qué caso te ha quedado\?/.test(h1.text), h1.text.slice(0, 200));
  await p.click(`[data-answer="${h1.id}"]`);
  const h2 = await p.evaluate(() => document.getElementById('trFeedback').innerText.replace(/\s+/g, ' '));
  check('train/hand: right → ✓, what it looks like and how to solve it', /✓/.test(h2) && /Resuélvelo: Amarillo arriba y el \w+ delante/.test(h2), h2);
  await p.click('#trNextQ');
  await p.waitForFunction(() => window.Fridrich._.tr.hand && !window.Fridrich._.tr.answered, null, { timeout: 30000 });
  const h3 = await p.evaluate(() => window.Fridrich._.tr.hand.c);
  const other = await p.evaluate(() => [...document.querySelectorAll('[data-answer]')].map((b) => b.dataset.answer).find((x) => x !== window.Fridrich._.tr.hand.c.id));
  if (other) {
    await p.click(`[data-answer="${other}"]`);
    const h4 = await p.evaluate(() => document.getElementById('trFeedback').innerText);
    check('train/hand: wrong → ✗ and what it was', new RegExp(`✗ Era ${h3.name.replace(/[()]/g, '\\$&')}`).test(h4), h4);
  }
  const trh = await p.evaluate(() => JSON.parse(localStorage.getItem('cfop:train:v1')));
  check('train/hand: counted apart', trh[h1.id].mn >= 1 && trh[h1.id].mok >= 1, JSON.stringify(trh[h1.id]));

  // ================= Entrenar: with the cube =================
  await p.click('[data-pick="oll"]');
  // The virtual cube back to solved and held white up, as after any solve.
  await p.evaluate(() => document.getElementById('cubeSync').click());
  await p.waitForTimeout(400);
  await p.click('#trModeCube');
  await p.waitForFunction(() => window.Fridrich._.tr.follow, null, { timeout: 30000 });
  const t1 = await p.evaluate(() => ({ id: window.Fridrich._.tr.c.id, setup: window.Fridrich._.tr.setup, text: document.getElementById('trBox').innerText }));
  check('train/cube: how to leave the cube in the case, held with white down', /Déjalo en el caso: blanco abajo/.test(t1.text) && t1.setup.split(' ').length >= 6, t1.text.slice(0, 160));
  await turn(t1.setup);
  await p.waitForTimeout(100);
  const ready = await p.evaluate(() => ({ ready: !!window.Fridrich._.tr.ready, text: document.getElementById('trBox').innerText }));
  check('train/cube: done the setup → «¡Ya!»', ready.ready && /¡Ya!/.test(ready.text), ready.text.slice(0, 120));
  const read = await p.evaluate(() => {
    const C = window.Cfop;
    const r = C.readCube(window.Fridrich.cube().state, 'U');
    const k = C.recognize(r.g, r.stage);
    return { stage: r.stage, id: k && k.case && k.case.id, alg: ['z2', k.view, k.pre, k.case.alg, k.post].filter(Boolean).join(' ') };
  });
  check('train/cube: the cube really is in that case', read.id === t1.id, JSON.stringify(read));
  await p.evaluate((a) => window.Fridrich.cube().link.play([a], 20), read.alg);
  await p.waitForFunction(() => /✓/.test(document.getElementById('trBox').innerText), null, { timeout: 4000 }).catch(() => {});
  const res = await p.evaluate(() => ({ text: document.getElementById('trBox').innerText, rec: JSON.parse(localStorage.getItem('cfop:train:v1')) }));
  check('train/cube: solved the step → ✓ with recognition and execution times', /✓/.test(res.text) && /Reconocer [\d.]+ s · hacer [\d.]+ s/.test(res.text) && res.rec[t1.id].n === 1, res.text.slice(0, 200));
  await p.waitForFunction(() => { const t = window.Fridrich._.tr; return t.follow && !t.result && !t.ready; }, null, { timeout: 30000 });
  check('train/cube: then the next case, from where the cube is', true);

  // ================= The overlay follows this page =================
  const ov = await ctx.newPage();
  ov.on('pageerror', (e) => errs.push(`overlay: ${e.message}`));
  await ov.goto(`${SITE}/overlay.html`);
  await p.evaluate(() => window.Fridrich.showView('crono'));
  await p.evaluate(() => document.dispatchEvent(new CustomEvent('fr:result')));
  await p.keyboard.press('Shift');
  await ov.waitForFunction(() => /CFOP/.test(document.getElementById('brandTag').textContent), null, { timeout: 5000 }).catch(() => {});
  const o = await ov.evaluate(() => ({
    tag: document.getElementById('brandTag').textContent,
    splits: document.getElementById('cfSplits').hidden ? null : document.getElementById('cfSplits').innerText.replace(/\s+/g, ' '),
    method: document.getElementById('method').textContent,
  }));
  check('overlay: draws Fridrich solves (Cruz / F2L / OLL / PLL)', /CFOP/.test(o.tag) && /Cruz\s*[\d.]+\s*F2L\s*[\d.]+\s*OLL\s*[\d.]+\s*PLL\s*[\d.]+/.test(o.splits || ''), JSON.stringify(o));
  await ov.close();

  // ================= Without the scramble generator =================
  const plain = await open({}, `${SITE_PLAIN}/fridrich#crono`);
  await plain.p.waitForFunction(() => window.Fridrich && window.Fridrich.scramble().split(' ').length === 25, null, { timeout: 40000 }).catch(() => {});
  check('offline generator: falls back to 25 random moves', await plain.p.evaluate(() => window.Fridrich.scramble().split(' ').length === 25));
  await plain.ctx.close();

  // ================= Phone =================
  const ph = await open({ ...devices['Pixel 7'], colorScheme: 'dark' }, `${SITE}/fridrich?cubo=virtual#crono`);
  for (const v of ['crono', 'casos', 'entrenar', 'ajustes']) {
    await ph.p.evaluate((x) => window.Fridrich.showView(x), v);
    await ph.p.waitForTimeout(150);
    const over = await ph.p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`phone: «${v}» fits the screen`, over <= 0, String(over));
    await ph.p.screenshot({ path: `${SHOTS}/fridrich-${v}-pixel7.png`, fullPage: true });
  }
  check('phone: the menu at the bottom, four tabs', await ph.p.evaluate(() => [...document.querySelectorAll('.tab')].filter((t) => getComputedStyle(t).display !== 'none').length === 4));
  await ph.ctx.close();

  // ================= From the 3BLD app =================
  const bld = await open({}, `${SITE}/#practicar`);
  const href = await bld.p.evaluate(() => { const a = document.querySelector('.to-fr'); return a ? new URL(a.href).pathname : null; });
  check('3BLD app: links to /fridrich', href === '/fridrich', href);
  await bld.ctx.close();

  results.forEach((r) => console.log(r));
  console.log(`page errors: ${errs.length ? JSON.stringify(errs) : 'none'}`);
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
