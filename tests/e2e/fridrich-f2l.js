// «Fridrich reducido», the 41 basic F2L cases: each one and its algorithms against SpeedCubeDB's own setups
// (fixtures/f2l-scdb.json), which case a pair shows from any slot and side, Casos (the set switch, the 3D
// pictures, how you are doing with each, synced, «Pruébalo»), Entrenar (with the smart cube and «Reconocer»),
// the live help naming the case of each pair, and the phone.
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');
const { SITE, SHOTS } = require('../env');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + String(extra).replace(/\s+/g, ' ') : ''}`);
const SCDB = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'f2l-scdb.json'), 'utf8'));

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const open = async (opts, hash) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`${SITE}/fridrich?cubo=virtual#${hash}`);
    await p.waitForFunction(() => window.Fridrich && window.CfopF2l, null, { timeout: 30000 });
    return { ctx, p };
  };
  const { ctx, p } = await open({}, 'casos');
  const turn = (a) => p.evaluate((x) => window.Fridrich.cube().link.turn(x), a);

  // ================= The cases =================
  const data = await p.evaluate(() => {
    const F = window.CfopF2l;
    const sizes = F.GROUPS.map((g) => F.CASES.filter((c) => c.group === g.id).length);
    return { n: F.CASES.length, nums: F.CASES.map((c) => c.n).sort((a, b) => a - b).join(), sizes: sizes.join(), looks: F.CASES.every((c) => c.look && c.look.length > 20) };
  });
  check('cases: the 41, numbered 1–41, in the six groups (4 directas, 10 unidas, 10 separadas, 6 + 6 + 5 en su hueco)', data.n === 41 && data.nums === Array.from({ length: 41 }, (_, i) => i + 1).join() && data.sizes === '4,10,10,6,6,5' && data.looks, JSON.stringify(data));
  const vs = await p.evaluate((setups) => {
    const M = window.CubeModel; const C = window.Cfop; const F = window.CfopF2l;
    const base = M.apply(M.solved(), C.DOWN.U);
    const solves = (st, a) => C.AUF.some((u) => C.stageOf(M.apply(st, `${u} ${a}`.trim())).stage >= 2);
    const bad = [];
    Object.entries(setups).forEach(([n, setup]) => {
      const st = M.apply(base, setup);
      const c = F.caseById(`f2l${n}`);
      const r = F.recognize(st);
      if (!(r.length === 1 && r[0].case === c)) bad.push(`${n}: dice ${r.map((x) => x.case.name).join() || 'nada'}`);
      [c.alg, ...c.alts].forEach((a) => { if (!solves(st, a)) bad.push(`${n}: ${a} no lo resuelve`); });
    });
    return bad;
  }, SCDB);
  check('cases: against SpeedCubeDB\'s setups, each one recognized as its number, and its algorithm and the others solve it', vs.length === 0, vs.slice(0, 5).join(' · '));
  const rec = await p.evaluate((setups) => {
    const M = window.CubeModel; const C = window.Cfop; const F = window.CfopF2l;
    const rnd = (a) => a[Math.floor(Math.random() * a.length)];
    const LL = C.CASES.map((x) => M.invertAlg(x.alg));
    const ns = Object.keys(setups);
    let ok = 0; const bad = [];
    for (let k = 0; k < 300; k++) {
      const n = rnd(ns);
      const seq = `${rnd(C.VIEWS)} ${rnd(['', ...LL])} ${rnd(C.AUF)} ${rnd(['', ...LL])} ${rnd(C.AUF)} ${setups[n]} ${rnd(C.AUF)}`.replace(/\s+/g, ' ').trim();
      const g = C.canon(M.norm(M.apply(M.apply(M.solved(), C.DOWN.U), seq)), 'U');
      const r = F.recognize(g);
      if (r.length === 1 && r[0].case.n === Number(n)) ok++; else bad.push(`${n} → ${r.map((x) => x.case.n).join()}`);
    }
    return { ok, bad: bad.slice(0, 3) };
  }, SCDB);
  check('cases: 300 random ones (any slot, any side, the top turned, the last layer mixed) → the right case', rec.ok === 300, JSON.stringify(rec));
  const none = await p.evaluate(() => {
    const M = window.CubeModel; const C = window.Cfop; const F = window.CfopF2l;
    // Two slots empty: the back one is a basic case, the front right one has a piece trapped in the other.
    const g = M.apply(M.apply(M.solved(), C.DOWN.U), "R U' R2 U R");
    return { pairs: C.stageOf(g).pairs.map(Number).join(''), found: F.recognize(g).map((x) => `${x.slot}:${x.case.name}`) };
  });
  check('cases: a pair with a piece in another slot is not one of the 41 → only the other slot is named', none.pairs === '0011' && none.found.length === 1 && !none.found[0].startsWith('0:'), JSON.stringify(none));

  // ================= Casos =================
  await p.click('[data-case-set="f2l"]');
  let cs = await p.evaluate(() => ({
    cards: document.querySelectorAll('#caseGroups .fr-card.f2l').length, pics: document.querySelectorAll('#caseGroups .fr-card.f2l svg.fr-iso').length,
    groups: document.querySelectorAll('#caseGroups section').length, intro: !document.getElementById('caseF2lIntro').hidden, method: !document.getElementById('caseMethod').hidden,
    alts: document.querySelectorAll('#caseGroups .fr-alts').length,
  }));
  check('casos: «F2L» → the 41 in their 6 groups, each drawn in 3D, with its other algorithms folded', cs.cards === 41 && cs.pics === 41 && cs.groups === 6 && cs.intro && !cs.method && cs.alts === 41, JSON.stringify(cs));
  await p.screenshot({ path: `${SHOTS}/fridrich-f2l-casos-1280.png` });
  const card = await p.evaluate(() => {
    const el = document.querySelector('[data-case="f2l4"]');
    return { text: el.innerText.replace(/\s+/g, ' '), grey: el.querySelectorAll('polygon[fill="var(--fr-blank)"]').length, coloured: el.querySelectorAll('polygon[fill^="var(--st-"]').length };
  });
  check('casos: F2L 4 shows J Perm\'s R U R\', the last layer grey and the rest in colour', /F2L 4/.test(card.text) && /R U R'/.test(card.text) && card.grey >= 10 && card.coloured >= 12, JSON.stringify(card));
  await p.click('[data-case="f2l5"] [data-learn="learning"]');
  const learnt = await p.evaluate(() => ({ learn: JSON.parse(localStorage.getItem('cfop:learn:v1') || '{}').f2l5, sync: window.Fridrich._.syncData().learn.f2l5 }));
  check('casos: «Aprendiendo» on an F2L case is kept, and goes with the sync', learnt.learn === 'learning' && learnt.sync === 'learning', JSON.stringify(learnt));
  const merged = await p.evaluate(() => {
    window.Fridrich._.mergeIn({ learn: { f2l9: 'known' }, learnAt: { f2l9: Date.now() + 5000 }, train: { f2l9: { n: 2, sum: 3000, best: 1400 } } });
    return { learn: JSON.parse(localStorage.getItem('cfop:learn:v1')).f2l9, train: (JSON.parse(localStorage.getItem('cfop:train:v1') || '{}').f2l9 || {}).n };
  });
  check('casos: from another device, how you are doing with an F2L case comes in too', merged.learn === 'known' && merged.train === 2, JSON.stringify(merged));
  await p.click('[data-case="f2l4"] [data-try]');
  const tryBox = await p.evaluate(() => { const b = document.querySelector('[data-case="f2l4"] .fr-try'); return { open: !b.hidden, text: b.innerText.replace(/\s+/g, ' '), pic: !!b.querySelector('svg.fr-iso') }; });
  check('casos: «Pruébalo» → the algorithm backwards from solved, how it looks (in 3D) and how to solve it', tryBox.open && tryBox.pic && /R U' R'/.test(tryBox.text) && /Resuélvelo/.test(tryBox.text), tryBox.text.slice(0, 160));
  await p.reload();
  await p.waitForFunction(() => window.Fridrich && document.querySelector('#caseGroups .fr-card'), null, { timeout: 30000 });
  cs = await p.evaluate(() => ({ f2l: document.querySelectorAll('#caseGroups .fr-card.f2l').length, pressed: document.querySelector('[data-case-set="f2l"]').getAttribute('aria-pressed') }));
  check('casos: the set chosen stays after a reload', cs.f2l === 41 && cs.pressed === 'true', JSON.stringify(cs));
  await p.click('[data-case-set="ll"]');
  cs = await p.evaluate(() => ({ ll: document.querySelectorAll('#caseGroups .fr-card').length, f2l: document.querySelectorAll('#caseGroups .fr-card.f2l').length, method: !document.getElementById('caseMethod').hidden }));
  check('casos: «OLL y PLL» → the 16 of the last layer, as before', cs.ll === 16 && cs.f2l === 0 && cs.method, JSON.stringify(cs));

  // ================= Entrenar: «Reconocer» =================
  await p.evaluate(() => window.Fridrich.showView('entrenar'));
  await p.click('#trModeLook');
  await p.click('[data-pick="f2l"]');
  await p.waitForFunction(() => window.Fridrich._.tr.c && window.Fridrich._.tr.c.step === 'f2l' && document.querySelector('#trBox svg.fr-iso'), null, { timeout: 5000 }).catch(() => {});
  const q = await p.evaluate(() => {
    const c = window.Fridrich._.tr.c;
    const ids = [...document.querySelectorAll('[data-answer]')].map((b) => b.dataset.answer);
    const same = window.CfopF2l.CASES.filter((x) => x.group === c.group).map((x) => x.id);
    return { id: c.id, pic: !!document.querySelector('#trBox svg.fr-iso'), ids, same, pick: JSON.parse(localStorage.getItem('cfop:pick:v1')).length, text: document.getElementById('trBox').innerText };
  });
  check('train/look: «F2L» picks the 41; a case comes in 3D with its group\'s cases to choose from', q.pick === 41 && q.pic && q.ids.join() === q.same.join() && q.ids.includes(q.id) && /F2L ·/.test(q.text), JSON.stringify({ ...q, text: q.text.slice(0, 80) }));
  const key = String((q.ids.indexOf(q.id) + 1) % 10);
  await p.keyboard.press(key);
  const qa = await p.evaluate((id) => ({ fb: document.getElementById('trFeedback').innerText, rec: (JSON.parse(localStorage.getItem('cfop:train:v1')) || {})[id] }), q.id);
  check('train/look: the right one with its key (0 for the tenth) → ✓ and counted', /✓/.test(qa.fb) && qa.rec && qa.rec.qn === 1 && qa.rec.qok === 1, JSON.stringify(qa));

  // ================= Entrenar: with the smart cube =================
  await p.evaluate(() => window.Fridrich.showView('crono'));
  await p.click('#cubeSim');
  await p.waitForFunction(() => window.Fridrich.cube().on, null, { timeout: 10000 });
  await p.evaluate(() => window.Fridrich.showView('entrenar'));
  await p.click('#trModeCube');
  await p.waitForFunction(() => window.Fridrich._.tr.follow && window.Fridrich._.tr.c.step === 'f2l', null, { timeout: 30000 });
  const t1 = await p.evaluate(() => ({ id: window.Fridrich._.tr.c.id, setup: window.Fridrich._.tr.setup, text: document.getElementById('trBox').innerText }));
  check('train/cube: an F2L case, and how to leave the cube in it', /Déjalo en el caso/.test(t1.text) && t1.setup.split(' ').length >= 4, t1.text.slice(0, 120));
  await turn(t1.setup);
  await p.waitForFunction(() => window.Fridrich._.tr.ready, null, { timeout: 4000 }).catch(() => {});
  const read = await p.evaluate(() => {
    const C = window.Cfop; const F = window.CfopF2l; const M = window.CubeModel;
    const r = C.readCube(window.Fridrich.cube().state, 'U');
    const k = F.recognize(r.g);
    const x = k[0];
    return {
      stage: r.stage, n: k.length, id: x && x.case.id,
      alg: x && ['z2', x.view, x.auf, x.case.alg].filter(Boolean).join(' '),
      undo: x && M.invertAlg(['z2', x.view, M.invertAlg(x.case.back)].filter(Boolean).join(' ')),
    };
  });
  check('train/cube: the cube really is in that case: cross and three pairs in, that case in one slot', read.stage === 1 && read.n === 1 && read.id === t1.id, JSON.stringify(read));
  await p.evaluate((a) => window.Fridrich.cube().link.play([a], 20), read.alg);
  await turn(read.undo);   // held as before again: the rotations only change how the virtual cube is held
  await p.waitForFunction(() => /✓/.test(document.getElementById('trBox').innerText), null, { timeout: 4000 }).catch(() => {});
  const res = await p.evaluate((id) => ({ text: document.getElementById('trBox').innerText, rec: JSON.parse(localStorage.getItem('cfop:train:v1'))[id] }), t1.id);
  check('train/cube: the pair in with J Perm\'s algorithm → ✓, with recognising and doing it timed', /✓/.test(res.text) && /Reconocer [\d.]+ s · hacer [\d.]+ s/.test(res.text) && res.rec && res.rec.n === 1, res.text.slice(0, 160));

  // ================= The live help =================
  await p.evaluate(() => window.Fridrich.showView('crono'));
  await p.click('[data-timed="0"]');
  await p.evaluate(() => document.getElementById('cubeSync').click());
  await p.waitForTimeout(400);
  await turn("z2 R U' R'");   // white down: the front right pair out, F2L 4 (R U R')
  await p.waitForFunction(() => /Con los 41 casos/.test(document.getElementById('liveNow').innerText), null, { timeout: 3000 }).catch(() => {});
  const live = await p.evaluate(() => document.getElementById('liveNow').innerText.replace(/\s+/g, ' '));
  check('live: a pair that is one of the 41 → its number, its group and J Perm\'s algorithm', /Con los 41 casos/.test(live) && /F2L 4/.test(live) && /R U R'/.test(live) && /Directas/.test(live), live.slice(0, 240));
  await p.screenshot({ path: `${SHOTS}/fridrich-f2l-live-1280.png` });
  await ctx.close();

  // ================= The phone =================
  for (const [label, dev] of [['pixel7', devices['Pixel 7']], ['iphone14-landscape', devices['iPhone 14 landscape']]]) {
    const ph = await open({ ...dev }, 'casos');
    await ph.p.click('[data-case-set="f2l"]');
    const lay = await ph.p.evaluate(() => {
      const r = document.querySelector('[data-case="f2l23"] .fr-card-pic').getBoundingClientRect();
      return { wide: document.documentElement.scrollWidth > window.innerWidth + 1, pic: Math.round(r.width) };
    });
    check(`phone (${label}): the F2L cases fit, no sideways scroll, the pictures a good size`, !lay.wide && lay.pic >= 60, JSON.stringify(lay));
    await ph.p.screenshot({ path: `${SHOTS}/fridrich-f2l-casos-${label}.png` });
    await ph.ctx.close();
  }

  console.log(results.join('\n'));
  console.log('page errors:', errs.length ? errs : 'none');
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.log(results.join('\n')); console.error(e); console.log('1 failed of 1'); process.exit(1); });
