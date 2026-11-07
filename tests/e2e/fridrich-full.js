// Full CFOP, its own page (/cfop, the Fridrich page with data-cfop="full"): the 57 OLL and the 21 PLL (cfopfull.js). Each algorithm does its step and
// keeps the first two layers, every case is told apart from the others (from any top turn), Casos (the two new
// sets, by groups, «Pruébalo» with a PLL that turns the whole cube), Entrenar («Reconocer» with the options of
// its group, with the smart cube until the ✓), a session that keeps to full OLL, /fridrich left as it was
// (2-look only), and the phone.
const { chromium, devices } = require('playwright');
const { SITE, SHOTS } = require('../env');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + String(extra).replace(/\s+/g, ' ') : ''}`);

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const open = async (opts, hash, page = 'cfop') => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.addInitScript(() => { try { localStorage.setItem('op3bld:awake:v1', '0'); } catch (e) { /* none */ } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(`${SITE}/${page}?cubo=virtual#${hash}`);
    await p.waitForFunction(() => window.Fridrich && window.CfopFull, null, { timeout: 30000 });
    await p.addStyleTag({ content: '.cube-fab { display: none !important; }' });
    return { ctx, p };
  };
  const { ctx, p } = await open({}, 'casos');
  const turn = (a) => p.evaluate((x) => window.Fridrich.cube().link.turn(x), a);

  // ================= The cases =================
  const data = await p.evaluate(() => {
    const M = window.CubeModel; const C = window.Cfop; const F = window.CfopFull;
    const bad = [];
    const keys = new Set();
    F.CASES.forEach((c) => {
      const g = F.caseState(c);
      const st = C.stageOf(g).stage;
      const r = F.recognize(g, c.step);
      // The algorithm does its step and keeps the F2L (the whole-cube turn it makes undone).
      const h = M.apply(M.apply(g, c.alg), c.back);
      const after = C.stageOf(h).stage;
      const done = c.step === 'foll' ? after >= 4 : C.AUF.some((u) => C.stageOf(u ? M.apply(h, u) : h).stage === 6);
      if (st < 2 || (c.step === 'foll' ? st >= 4 : st < 4 || st === 6) || !done || !r || r.case.id !== c.id) bad.push(c.name);
      if (c.step === 'foll') {
        const yellow = (x) => [0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 18, 19, 20, 36, 37, 38, 45, 46, 47].map((i) => (M.faceOfSticker(x[i]) === M.faceOfSticker(x[4]) ? 1 : 0)).join('');
        keys.add(C.AUF.map((u) => yellow(u ? M.apply(g, u) : g)).sort()[0]);
      }
      if (!c.look || c.look.length < 15) bad.push(`${c.name}: look`);
    });
    // Each PLL from any top turn is only itself.
    F.PLL.forEach((c) => C.AUF.forEach((u) => { const r = F.recognize(M.apply(F.caseState(c), u), 'fpll'); if (!r || r.case.id !== c.id) bad.push(`${c.name} ${u}`); }));
    return {
      bad, nO: F.OLL.length, nP: F.PLL.length, distinct: keys.size,
      nums: F.OLL.map((c) => c.n).sort((a, b) => a - b).join(), names: F.PLL.map((c) => c.n).sort().join(),
      byId: !!(C.caseById('oll-27') && C.caseById('pll-T')),
    };
  });
  check('cases: 57 OLL (1–57, all different) and 21 PLL, each algorithm does its step and keeps the F2L, each one recognised as itself', data.bad.length === 0 && data.nO === 57 && data.nP === 21 && data.distinct === 57
    && data.nums === Array.from({ length: 57 }, (_, i) => i + 1).join() && data.names === 'Aa,Ab,E,F,Ga,Gb,Gc,Gd,H,Ja,Jb,Na,Nb,Ra,Rb,T,Ua,Ub,V,Y,Z' && data.byId, JSON.stringify(data));

  // The trainer's cases: from any side, with any PLL after a full OLL (some PLL turn the whole cube, Aa: x …),
  // the cube really is in that case.
  const targets = await p.evaluate(() => {
    const C = window.Cfop; const F = window.CfopFull; const bad = [];
    for (const c of [...F.OLL, ...F.PLL]) {
      for (let k = 0; k < 6; k++) {
        const g = C.canon(window.Fridrich._.caseTarget(c), 'U');
        const r = F.recognize(g, c.step);
        if (!r || r.case.id !== c.id) { bad.push(c.name); break; }
      }
    }
    return bad;
  });
  check('train: every case the trainer prepares (6 times each, from any side) is really that case', targets.length === 0, targets.join());

  // ================= Casos =================
  const head = await p.evaluate(() => ({
    title: document.title, h1: document.querySelector('h1').textContent, full: document.documentElement.dataset.cfop,
    sets: [...document.querySelectorAll('[data-case-set]')].filter((b) => b.offsetParent).map((b) => b.dataset.caseSet).join(),
    picks: [...document.querySelectorAll('[data-pick]')].filter((b) => b.offsetParent || b.closest('details')).filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.dataset.pick).join(),
    back: !!document.querySelector('a.fr-switch[href="fridrich"]'),
  }));
  check('page: /cfop is «CFOP completo», with only OLL, PLL and F2L (no 2-look) and a link back to Fridrich reducido', head.title === 'CFOP completo' && head.h1 === 'CFOP completo' && head.full === 'full' && head.sets === 'f2l,foll,fpll' && head.picks === 'f2l,foll,fpll,learning' && head.back, JSON.stringify(head));
  await p.click('[data-case-set="foll"]');
  let cs = await p.evaluate(() => ({
    n: document.querySelectorAll('#caseGroups .fr-card').length, groups: document.querySelectorAll('#caseGroups section').length,
    intro: !document.getElementById('caseFullIntro').hidden, method: !document.getElementById('caseMethod').hidden,
    sune: document.querySelector('[data-case="oll-27"]').innerText.replace(/\s+/g, ' '), pics: document.querySelectorAll('#caseGroups .fr-card-pic svg').length,
  }));
  check('casos: «OLL 57» → the 57 in their 15 groups, each with its picture, and what full CFOP is', cs.n === 57 && cs.groups === 15 && cs.pics === 57 && cs.intro && !cs.method && /OLL 27/.test(cs.sune) && /R U R' U R U2 R'/.test(cs.sune), JSON.stringify(cs));
  await p.click('[data-case-set="fpll"]');
  cs = await p.evaluate(() => ({ n: document.querySelectorAll('#caseGroups .fr-card').length, groups: document.querySelectorAll('#caseGroups section').length, arrows: document.querySelectorAll('[data-case="pll-T"] .fr-card-pic .fr-arrow').length >= 2 }));
  check('casos: «PLL 21» → the 21 in their 5 groups, drawn with arrows', cs.n === 21 && cs.groups === 5 && cs.arrows, JSON.stringify(cs));
  await p.click('[data-case="pll-Aa"] [data-learn="learning"]');
  const learnt = await p.evaluate(() => ({ learn: JSON.parse(localStorage.getItem('cfop:learn:v1'))['pll-Aa'], sync: (window.Fridrich._.syncData().learn || {})['pll-Aa'] }));
  check('casos: «Aprendiendo» on a full PLL is kept, and goes with the sync', learnt.learn === 'learning' && learnt.sync === 'learning', JSON.stringify(learnt));
  await p.evaluate(() => window.Fridrich.showView('progreso'));
  const prog = await p.evaluate(() => ({ text: document.getElementById('progCases').innerText.replace(/\s+/g, ' '), bars: document.querySelectorAll('#progCases .fr-know-bar').length, lbar: !!document.querySelectorAll('#progCases .fr-know-bar')[1].querySelector('.l') }));
  check('progreso: how many you know and are learning of OLL, PLL and F2L, in %', prog.bars === 3 && /^OLL 0 %/.test(prog.text) && /PLL 0 %/.test(prog.text) && /Aprendiendo 1 \(5 %\)/.test(prog.text) && prog.lbar && !/2 looks/.test(prog.text), JSON.stringify(prog).slice(0, 300));
  await p.evaluate(() => window.Fridrich.showView('casos'));
  await p.click('[data-case="pll-Aa"] [data-try]');
  const tryBox = await p.evaluate(() => {
    const b = document.querySelector('[data-case="pll-Aa"] .fr-try');
    return { open: !b.hidden, text: b.innerText.replace(/\s+/g, ' '), pic: !!b.querySelector('.fr-try-pic svg') };
  });
  // The Aa starts with x: its setup undoes that turn, so the cube ends held as before, top on top.
  const held = await p.evaluate(() => {
    const M = window.CubeModel; const C = window.Cfop; const c = C.caseById('pll-Aa');
    const setup = `${M.invertAlg(c.back)} ${M.invertAlg(c.alg)}`;
    const g = M.apply(M.apply(M.solved(), C.DOWN.U), setup);
    return { centres: [4, 13, 22, 31, 40, 49].every((i) => g[i] === M.apply(M.solved(), C.DOWN.U)[i]), stage: C.stageOf(g).stage };
  });
  check('casos: «Pruébalo» with the Aa (it turns the whole cube) → a setup that leaves it held as before, its picture and how to solve it', tryBox.open && tryBox.pic && /Resuélvelo/.test(tryBox.text) && held.centres && held.stage === 4, JSON.stringify({ ...held, text: tryBox.text.slice(0, 140) }));
  // Fridrich reducido stays as it was: 2-look and F2L only, its own cases to train, and a link here.
  const rp = await ctx.newPage();
  rp.on('pageerror', (e) => errs.push(e.message));
  await rp.goto(`${SITE}/fridrich?cubo=virtual#casos`);
  await rp.waitForFunction(() => window.Fridrich && document.querySelector('#caseGroups .fr-card'), null, { timeout: 30000 });
  cs = await rp.evaluate(() => ({
    title: document.title, n: document.querySelectorAll('#caseGroups .fr-card').length, method: !document.getElementById('caseMethod').hidden,
    sets: [...document.querySelectorAll('[data-case-set]')].filter((b) => b.offsetParent).map((b) => b.dataset.caseSet).join(),
    link: !!document.querySelector('a.fr-switch[href="cfop"]'), learn: JSON.parse(localStorage.getItem('cfop:learn:v1') || '{}')['pll-Aa'],
  }));
  check('fridrich: still «Fridrich reducido», the 16 of 2-look and the F2L only, a link to CFOP completo; what you marked here is there too', cs.title === 'Fridrich reducido' && cs.n === 16 && cs.method && cs.sets === 'll,f2l' && cs.link && cs.learn === 'learning', JSON.stringify(cs));
  await rp.close();

  // ================= Entrenar: «Reconocer» =================
  await p.evaluate(() => window.Fridrich.showView('entrenar'));
  await p.click('#trModeLook');
  await p.click('[data-pick="foll"]');
  await p.waitForFunction(() => window.Fridrich._.tr.c && window.Fridrich._.tr.c.step === 'foll', null, { timeout: 5000 }).catch(() => {});
  const q = await p.evaluate(() => {
    const c = window.Fridrich._.tr.c;
    const ids = [...document.querySelectorAll('[data-answer]')].map((b) => b.dataset.answer);
    const same = window.CfopFull.OLL.filter((x) => x.group === c.group).map((x) => x.id);
    return { id: c.id, ids, same, pick: JSON.parse(localStorage.getItem('cfop:pick-full:v1')).length, text: document.getElementById('trBox').innerText, pic: !!document.querySelector('#trBox .fr-quiz-pic svg') };
  });
  check('train/look: «OLL completo» picks the 57; a case comes with its group\'s cases to choose from', q.pick === 57 && q.pic && q.ids.join() === q.same.join() && q.ids.includes(q.id) && /OLL ·/.test(q.text), JSON.stringify({ ...q, text: q.text.slice(0, 80) }));
  await p.keyboard.press(String((q.ids.indexOf(q.id) + 1) % 10));
  const qa = await p.evaluate((id) => ({ fb: document.getElementById('trFeedback').innerText, rec: (JSON.parse(localStorage.getItem('cfop:train:v1')) || {})[id] }), q.id);
  check('train/look: the right one with its key → ✓ and counted', /✓/.test(qa.fb) && qa.rec && qa.rec.qn === 1 && qa.rec.qok === 1, JSON.stringify(qa));

  // ================= A session with full OLL =================
  await p.waitForFunction(() => !window.Fridrich._.tr.answered, null, { timeout: 3000 }).catch(() => {});
  await p.click('[data-set-pick]');
  await p.click('[data-pq="foll"]');
  const all57 = await p.evaluate(() => document.querySelectorAll('#pickCases [data-pc^="oll-"][aria-pressed="true"]').length);
  await p.click('[data-pq="none"]');
  await p.evaluate(() => document.querySelector('[data-pc="oll-27"]').click());
  await p.evaluate(() => document.querySelector('[data-pc="oll-45"]').click());
  const autoText = await p.evaluate(() => document.getElementById('pickAutoText').textContent);
  await p.click('[data-pm="look"]');
  await p.click('#pickGo');
  await p.waitForFunction(() => window.Fridrich._.session() && window.Fridrich._.tr.c, null, { timeout: 5000 }).catch(() => {});
  const ses = await p.evaluate(() => ({ set: window.Fridrich._.session().set, cards: document.querySelectorAll('#sessSet .fr-sc').length, text: document.getElementById('sessSet').innerText.replace(/\s+/g, ' ') }));
  check('session: the picker has the full OLL («OLL completo» picks the 57) → a session with OLL 27 and OLL 45', all57 === 57 && /OLL completo/.test(autoText) && ses.set.join() === 'oll-27,oll-45' && ses.cards === 2 && /OLL 27/.test(ses.text), JSON.stringify({ all57, autoText, ...ses }));
  await p.click('#sessEnd');
  await p.keyboard.press('Escape');

  // ================= Entrenar: with the smart cube =================
  await p.evaluate(() => window.Fridrich.showView('casos'));
  await p.click('[data-case-set="fpll"]');
  await p.click('[data-case="pll-Aa"] [data-train]');
  await p.evaluate(() => window.Fridrich.showView('crono'));
  await p.click('#cubeSim');
  await p.waitForFunction(() => window.Fridrich.cube().on, null, { timeout: 10000 });
  await p.evaluate(() => window.Fridrich.showView('entrenar'));
  await p.click('#trModeCube');
  await p.waitForFunction(() => window.Fridrich._.tr.follow && window.Fridrich._.tr.c.id === 'pll-Aa', null, { timeout: 30000 });
  const t1 = await p.evaluate(() => ({ setup: window.Fridrich._.tr.setup, text: document.getElementById('trBox').innerText }));
  check('train/cube: a full PLL, and how to leave the cube in it', /Déjalo en el caso/.test(t1.text) && /PLL · Solo esquinas/i.test(t1.text) && t1.setup.length > 0, t1.text.slice(0, 120));
  await turn(t1.setup);
  await p.waitForFunction(() => window.Fridrich._.tr.ready, null, { timeout: 4000 }).catch(() => {});
  const read = await p.evaluate(() => {
    const C = window.Cfop; const F = window.CfopFull;
    const r = C.readCube(window.Fridrich.cube().state, 'U');
    const k = F.recognize(r.g, 'fpll');
    return { stage: r.stage, id: k && k.case.id, alg: k && ['z2', k.pre, k.case.alg, k.case.back, k.post].filter(Boolean).join(' ') };
  });
  check('train/cube: the cube really is in that case: the F2L and the top oriented, the Aa on top', read.stage >= 4 && read.id === 'pll-Aa', JSON.stringify(read));
  await p.evaluate((a) => window.Fridrich.cube().link.play([a], 20), read.alg);
  await turn('z2');   // held as before again: the rotations only change how the virtual cube is held
  await p.waitForFunction(() => /✓/.test(document.getElementById('trBox').innerText), null, { timeout: 4000 }).catch(() => {});
  const res = await p.evaluate(() => ({ text: document.getElementById('trBox').innerText, rec: JSON.parse(localStorage.getItem('cfop:train:v1'))['pll-Aa'] }));
  check('train/cube: solved with J Perm\'s Aa → ✓, with recognising and doing it timed', /✓/.test(res.text) && /Reconocer [\d.]+ s · hacer [\d.]+ s/.test(res.text) && res.rec && res.rec.n === 1, res.text.slice(0, 160));
  await ctx.close();

  // ================= The phone =================
  for (const [label, dev] of [['pixel7', devices['Pixel 7']], ['iphone14-landscape', devices['iPhone 14 landscape']]]) {
    const ph = await open({ ...dev }, 'casos');
    await ph.p.click('[data-case-set="foll"]');
    const lay = await ph.p.evaluate(() => {
      const bs = [...document.querySelectorAll('[data-case-set]')].filter((b) => b.offsetParent).map((b) => b.getBoundingClientRect());
      const r = document.querySelector('[data-case="oll-1"] .fr-card-pic').getBoundingClientRect();
      return { wide: document.documentElement.scrollWidth > window.innerWidth + 1, row: bs.every((b) => Math.abs(b.top - bs[0].top) < 2), pic: Math.round(r.width) };
    });
    check(`phone (${label}): the three sets in one row, the OLL cases fit, no sideways scroll`, !lay.wide && lay.row && lay.pic >= 60, JSON.stringify(lay));
    await ph.p.screenshot({ path: `${SHOTS}/fridrich-full-casos-${label}.png` });
    await ph.ctx.close();
  }

  console.log(results.join('\n'));
  console.log('page errors:', errs.length ? errs : 'none');
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.log(results.join('\n')); console.error(e); console.log('1 failed of 1'); process.exit(1); });
