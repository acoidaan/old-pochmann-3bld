// Smart cube: virtual cube, scramble follower, auto timer, DNF analysis, MAC dialog, unsupported browsers.
const { chromium, devices } = require('playwright');
const { SITE, SHOTS } = require('../env');
const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const errs = [];
  const page = async (opts, init) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ...opts });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    if (init) await ctx.addInitScript(init);
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(e.message));
    return { ctx, p };
  };
  const setScr = (p, scr) => p.evaluate((s) => { const el = document.getElementById('scr'); el.value = s; el.dispatchEvent(new Event('input')); }, scr);
  const setMemo = (p, e, c) => p.evaluate(([e1, c1]) => {
    for (const [id, v] of [['memoE', e1], ['memoC', c1]]) { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event('input')); }
  }, [e, c]);
  const view = (p) => p.evaluate(() => ({
    scr: document.getElementById('cubeScr').innerText,
    next: [...document.querySelectorAll('#cubeScr .sm.next')].map((x) => x.textContent + (x.classList.contains('half') ? '½' : '')).join(','),
    done: document.querySelectorAll('#cubeScr .sm.done').length,
    phase: document.getElementById('clockPhase').textContent,
    ask: document.getElementById('verdictAsk').textContent,
    verdict: !document.getElementById('verdict').hidden,
    report: document.getElementById('cubeReport').innerText,
    msg: document.getElementById('cubeMsg').innerText,
    last: (() => { const t = window.OP3.data.times(); return t[t.length - 1] || null; })(),
    n: window.OP3.data.times().length,
  }));
  const fresh = async (p, n) => {
    await p.click('#cubeSync');
    await wait(80);
    const scr = await p.evaluate((k) => window.OP3.randomMoveScramble(k), n || 20);
    await setScr(p, scr);
    await p.evaluate((s) => window.OP3.cube.link.play([s], 400), scr);
    return scr;
  };
  const turn = (p, alg) => p.evaluate((a) => window.OP3.cube.link.turn(a), alg);
  const space = (p) => p.keyboard.press('Space');
  // A solution of the virtual cube as it is now: its tokens and their algorithms.
  const plan = (p) => p.evaluate(() => {
    const O = window.OP3;
    const toks = O.cube.simMemo(O.cube.link.state());
    return { toks, pairsE: O.pairs(toks.filter((t) => t.kind === 'edge').map((t) => t.L)), pairsC: O.pairs(toks.filter((t) => t.kind === 'corner').map((t) => t.L)) };
  });
  const playToks = (p, toks, mistakeAt) => p.evaluate(([t, k]) => {
    const O = window.OP3;
    const algs = t.map((x) => O.tokenAlg(x));
    if (k != null) algs[k] = O.cube.flawed(t[k]);
    return O.cube.link.play(algs, 400);
  }, [toks, mistakeAt]);

  // ================= Desktop, virtual cube =================
  {
    const { ctx, p } = await page({});
    await p.goto(`${SITE}/?cubo=virtual#crono`);
    await p.waitForSelector('#cubeSim:not([hidden])');
    check('no Bluetooth here: «Conectar cubo» still offered', await p.isVisible('#cubeConnect'));
    await p.click('#cubeSim');
    await p.waitForFunction(() => window.OP3.cube.status === 'on');
    let v = await view(p);
    check('virtual cube connects and reads as solved', /Conectado · batería 87 % · resuelto/.test(await p.textContent('#cubeInfo')), await p.textContent('#cubeInfo'));

    // ---- Scramble follower ----
    await setScr(p, "R2 U F' L D2 B R' U2");
    await wait(50);
    v = await view(p);
    check('follower: first move highlighted', v.next === 'R2' && /Primer giro: R2/.test(v.scr), v.next + ' | ' + v.scr);
    await turn(p, 'R');
    v = await view(p);
    check('half of a half turn', v.next === 'R2½' && /otra mitad del R2/.test(v.scr), v.next);
    await turn(p, "R'");
    v = await view(p);
    check('turned back → first move again', v.next === 'R2' && v.done === 0, v.next);
    await turn(p, "R'");
    v = await view(p);
    check('half the other way round', v.next === 'R2½', v.next);
    await turn(p, "R'");
    v = await view(p);
    check('R2 done as R\' R\' → next U', v.done === 1 && v.next === 'U', `${v.done} ${v.next}`);
    await turn(p, 'D');
    v = await view(p);
    check('wrong move → undo it', /Deshaz: D'/.test(v.scr) && !v.next, v.scr);
    await turn(p, 'L');
    v = await view(p);
    check('two wrong moves → undo both in order', /Deshaz: L' D'/.test(v.scr), v.scr);
    await turn(p, "L'");
    await turn(p, "D'");
    v = await view(p);
    check('undone → back on track', v.done === 1 && v.next === 'U' && !/Deshaz/.test(v.scr), v.scr);
    await turn(p, "U F' L D2 B R' U2");
    v = await view(p);
    check('whole scramble → mixed', v.done === 8 && /✓ Cubo mezclado/.test(v.scr), v.scr);
    await p.screenshot({ path: `${SHOTS}/cube-1280-mixed.png` });

    // ---- Solve: the first turn ends the memo, solved stops the clock ----
    const before = (await view(p)).n;
    await space(p);
    await wait(300);
    v = await view(p);
    check('Space starts the memo as usual', v.phase === 'Memorizando', v.phase);
    const pl = await plan(p);
    const allMoves = await p.evaluate((toks) => window.OP3.parseAlg(toks.map((t) => window.OP3.tokenAlg(t)).join(' ')).map((m) => m.text), pl.toks);
    await turn(p, allMoves[0]);
    await wait(60);
    v = await view(p);
    check('first turn → execution', v.phase === 'Ejecutando', v.phase);
    await p.evaluate((rest) => window.OP3.cube.link.play([rest.join(' ')], 400), allMoves.slice(1));
    await wait(100);
    v = await view(p);
    check('solved → clock stops and saves «Resuelto» by itself', v.n === before + 1 && v.last.ok === true && v.last.cube && v.last.cube.moves > 20 && !v.verdict,
      JSON.stringify({ n: v.n, ok: v.last && v.last.ok, cube: v.last && v.last.cube, verdict: v.verdict }));
    check('phase says the cube checked it', /lo ha comprobado el cubo/.test(v.phase), v.phase);
    const fx1 = await p.evaluate(() => ({ log: window.OP3.cube.fxLog.slice(), vib: !document.getElementById('fxVibrate').hidden }));
    check('solved → the chime plays (no vibration offered on a desktop)', fx1.log.includes('chime') && !fx1.log.includes('vibrate') && !fx1.vib, JSON.stringify(fx1));
    check('report: solved, letters done match the memo', /Resuelto, y lo ha comprobado el cubo/.test(v.report) && !/Ojo/.test(v.report)
      && v.report.includes(`aristas ${pl.pairsE}`) && (!pl.pairsC || v.report.includes(`esquinas ${pl.pairsC}`)) && /por segundo/.test(v.report), v.report);
    await p.screenshot({ path: `${SHOTS}/cube-1280-solved.png` });
    // Blindfolded you still hit the timer after the last turn: that must not start a new attempt.
    await space(p);
    await wait(100);
    v = await view(p);
    check('Space right after the cube stopped it: ignored', /lo ha comprobado el cubo/.test(v.phase) && v.n === before + 1, v.phase);
    await p.click('#clock');
    v = await view(p);
    check('…and so is a tap on the clock', /lo ha comprobado el cubo/.test(v.phase), v.phase);
    await wait(3000);
    await space(p);
    await wait(100);
    v = await view(p);
    check('a few seconds later Space starts again', v.phase === 'Memorizando', v.phase);
    await p.keyboard.press('Escape');

    // ---- DNF: one letter's undo misses its last move ----
    const scr2 = await p.evaluate(() => window.OP3.randomMoveScramble(20));
    await setScr(p, scr2);
    await p.evaluate((s) => window.OP3.cube.link.play([s], 400), scr2);
    v = await view(p);
    check('second scramble followed to the end', /✓ Cubo mezclado/.test(v.scr), v.scr.slice(-60));
    const pl2 = await plan(p);
    // A letter that is not a cycle break and has a setup, so the cube itself knows what came next.
    const k = await p.evaluate((toks) => {
      const O = window.OP3;
      let st = O.cube.link.state();
      for (let i = 0; i < toks.length; i++) {
        const t = toks[i];
        if (i >= 2 && t.kind === 'edge' && O.MODES.edge.table[t.L]) {
          const m = O.MODES.edge;
          if (m.letterOf[st[m.posOf[m.read]]] === t.L) return i;
        }
        st = O.apply(st, O.tokenAlg(t));
      }
      return -1;
    }, pl2.toks);
    check('test setup: a usable letter to get wrong', k >= 2, String(k));
    await space(p);
    await wait(100);
    await playToks(p, pl2.toks, k);
    await wait(50);
    v = await view(p);
    check('not solved → still running', v.phase === 'Ejecutando', v.phase);
    check('normal view: live turns and letters during the attempt', /\d+ giros/.test(v.scr) && v.scr.includes(pl2.toks[0].L), v.scr.slice(0, 120));
    await space(p);
    await p.waitForFunction(() => /no está resuelto/.test(document.getElementById('verdictAsk').textContent), null, { timeout: 3000 }).catch(() => {});
    v = await view(p);
    const L = pl2.toks[k].L;
    const nE = pl2.toks.slice(0, k + 1).filter((t) => t.kind === 'edge').length;
    check('manual stop: the cube says it is not solved', v.verdict && /El cubo no está resuelto/.test(v.ask), v.ask);
    check('DNF report without memo: where it failed', new RegExp(`Las ${k} primeras letras salieron bien`).test(v.report)
      && v.report.includes(`${nE}.ª letra de aristas (${L})`) && /estaba bien, pero el T-perm no salió bien/.test(v.report), v.report);
    check('DNF report suggests typing the memo', /Si escribes en «Practicar» el memo/.test(v.report));
    check('DNF report lists pieces left wrong', /Al parar quedaban mal/.test(v.report), v.report);
    await p.screenshot({ path: `${SHOTS}/cube-1280-dnf.png` });
    await p.click('#markDnf');
    await wait(100);
    v = await view(p);
    check('DNF saved, report stays', v.last.ok === false && /DNF/.test(v.report), JSON.stringify(v.last));
    // Typed the memo afterwards in «Practicar»: coming back looks again, now against the memo.
    await setMemo(p, pl2.pairsE, pl2.pairsC);
    await p.evaluate(() => { window.OP3.showView('practicar'); window.OP3.showView('crono'); });
    v = await view(p);
    check('with the memo typed: compared with it', /Comparado con tu memo/.test(v.report) && v.report.includes(`${nE}.ª letra de aristas (${L})`) && /pero el T-perm no salió bien/.test(v.report), v.report);
    check('a memo left over from another scramble is ignored', await (async () => {
      // A memo that does not solve this scramble, typed before the scramble was (re)set.
      await setMemo(p, 'KD IE', 'OU');
      const used = await p.evaluate(() => /Comparado con tu memo/.test(window.OP3.cube.analyze(window.OP3.cube.last).lines.join(' ')));
      await setScr(p, 'R U');
      await setScr(p, (await p.evaluate(() => window.OP3.data.times().slice(-1)[0].scr)));
      if (!used) return false;
      return p.evaluate(() => !/Comparado con tu memo/.test(window.OP3.cube.analyze(window.OP3.cube.last).lines.join(' ')));
    })());

    // ---- Wrong letter (executed cleanly) vs. the memo ----
    await fresh(p);
    const pl3 = await plan(p);
    await setMemo(p, pl3.pairsE, pl3.pairsC);
    // Execute a different (valid, unsolved) edge letter in position 1.
    const swapped = await p.evaluate((toks) => {
      const O = window.OP3;
      let st = O.cube.link.state();
      st = O.apply(st, O.tokenAlg(toks[0]));
      const m = O.MODES.edge;
      const want = toks[1].L;
      const other = O.trainLetters('edge').find((L) => L !== want && !O.PIECE_OF[m.posOf[L]].every((q) => st[q] === q) && O.PIECE_OF[m.posOf[L]] !== O.PIECE_OF[m.posOf[want]]);
      const out = toks.slice();
      out[1] = { kind: 'edge', L: other };
      return out;
    }, pl3.toks);
    await space(p);
    await wait(100);
    await playToks(p, swapped, null);
    await wait(50);
    await space(p);
    await p.waitForFunction(() => /no está resuelto/.test(document.getElementById('verdictAsk').textContent), null, { timeout: 3000 }).catch(() => {});
    v = await view(p);
    check('wrong letter: «tu memo dice X, pero hiciste la Y»', v.report.includes(`tu memo dice ${pl3.toks[1].L}, pero hiciste la ${swapped[1].L}`), v.report);
    await p.click('#markDnf');

    // ---- Memo wrong but executed as written ----
    await fresh(p);
    const pl4 = await plan(p);
    const wrongToks = pl4.toks.filter((t, i) => !(t.kind === 'corner' && i === pl4.toks.length - 1));   // forget the last corner letter
    const eL = wrongToks.filter((t) => t.kind === 'edge').map((t) => t.L);
    const cL = wrongToks.filter((t) => t.kind === 'corner').map((t) => t.L);
    await setMemo(p, eL.join(''), cL.join(''));
    await space(p);
    await wait(100);
    await playToks(p, wrongToks, null);
    await wait(50);
    await space(p);
    await p.waitForFunction(() => /no está resuelto/.test(document.getElementById('verdictAsk').textContent), null, { timeout: 3000 }).catch(() => {});
    v = await view(p);
    check('memo itself wrong: executed fine, memo did not solve it', /Ejecutaste bien todo tu memo, pero el memo no resolvía el cubo/.test(v.report) && /Faltan letras/.test(v.report), v.report);
    await p.click('#markDnf');

    // ---- Stopped a moment before the last turn arrived ----
    await setMemo(p, '', '');
    for (const variant of ['move', 'facelets']) {
      await fresh(p, 18);
      const pl5 = await plan(p);
      const n0 = (await view(p)).n;
      await space(p);
      await wait(100);
      const lastMove = await p.evaluate((toks) => {
        const O = window.OP3;
        const mv = O.parseAlg(toks.map((t) => O.tokenAlg(t)).join(' ')).map((m) => m.text);
        const lastM = mv.pop();
        return O.cube.link.play([mv.join(' ')], 400).then(() => lastM);
      }, pl5.toks);
      // Stop, then the last turn: as a move event, or only visible in the facelets.
      await p.evaluate(([m, how]) => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        if (how === 'move') window.OP3.cube.link.turn(m); else window.OP3.cube.link.silent(m);
      }, [lastMove, variant]);
      await wait(CHECK_WAIT());
      v = await view(p);
      check(`stop just before the last turn (${variant}) → saved as solved`, v.n === n0 + 1 && v.last.ok === true, JSON.stringify({ n: v.n, n0, ok: v.last.ok, ask: v.ask }));
    }

    // ---- Cancel ----
    await space(p);
    await wait(50);
    await p.keyboard.press('Escape');
    v = await view(p);
    check('Esc cancels as usual; no report', v.phase === 'Intento cancelado' && v.report === '', JSON.stringify({ p: v.phase, r: v.report }));

    // ---- Lost track (turned while not looking): facelets at memo start fix it ----
    await fresh(p, 18);
    await p.evaluate(() => window.OP3.cube.link.silent('F'));
    await space(p);
    await wait(150);
    const synced = await p.evaluate(() => window.OP3.cube.state.join(',') === window.OP3.cube.link.state().join(','));
    check('memo start re-reads the cube', synced);
    await p.evaluate(() => window.OP3.cube.simSolve(null, 400));
    await wait(100);
    v = await view(p);
    check('…and the solve still auto-stops', v.last.ok === true && /lo ha comprobado/.test(v.phase), v.phase);
    check('…and warns the scramble was not the app’s', /no tenía el scramble de la app/.test(v.report), v.report);

    // ---- «Está resuelto» ----
    await p.evaluate(() => window.OP3.cube.link.silent("U R"));
    await p.click('#cubeSync');
    await wait(200);
    const st = await p.evaluate(() => ({ app: window.OP3.isSolved(window.OP3.cube.state), cube: window.OP3.isSolved(window.OP3.cube.link.state()) }));
    check('«Está resuelto» resets both to solved', st.app && st.cube, JSON.stringify(st));

    // ---- Focus mode with the cube ----
    await wait(3000);   // presses are ignored for a moment after the cube stops the clock
    await setScr(p, "F2 D' L2 U R'");
    await p.keyboard.press('f');
    let fs = await p.evaluate(() => document.getElementById('focusScr').innerText);
    check('competition mode shows the live scramble', /Primer giro: F2/.test(fs), fs);
    await turn(p, "F2 D' L2 U R'");
    fs = await p.evaluate(() => document.getElementById('focusScr').innerText);
    check('competition mode: mixed', /✓ Cubo mezclado/.test(fs), fs);
    await p.screenshot({ path: `${SHOTS}/cube-1280-focus.png` });
    const plF = await plan(p);
    await space(p);
    await wait(100);
    check('competition mode: nothing at the bottom during the memo', (await p.evaluate(() => document.getElementById('focusMoves').innerText)) === '');
    const algsF = await p.evaluate((toks) => toks.map((t) => window.OP3.tokenAlg(t)), plF.toks);
    await p.evaluate((a) => window.OP3.cube.link.play([a], 400), algsF[0]);
    let fm = await p.evaluate(() => ({ text: document.getElementById('focusMoves').innerText, vis: (() => { const r = document.getElementById('focusMoves').getBoundingClientRect(); return r.height > 0 && getComputedStyle(document.getElementById('focusMoves')).visibility !== 'hidden'; })() }));
    const first = plF.toks[0].L || 'paridad';
    check('competition mode: turns and the first letter appear at the bottom', fm.vis && fm.text.split('\n')[0].trim() === first && /\d+ giros/.test(fm.text), JSON.stringify(fm));
    await p.screenshot({ path: `${SHOTS}/cube-1280-focus-live.png` });
    await p.evaluate((a) => window.OP3.cube.link.play(a, 400), algsF.slice(1));
    await wait(100);
    fm = await p.evaluate(() => document.getElementById('focusMoves').innerText);
    const wantLine = [plF.pairsE, plF.toks.some((t) => t.kind === 'parity') ? 'paridad' : '', plF.pairsC].filter(Boolean).join(' · ');
    check('competition mode: after solving, all the letters stay', fm.split('\n')[0].trim() === wantLine, fm + ' | want ' + wantLine);
    v = await view(p);
    check('competition mode: auto-stop', /lo ha comprobado/.test(v.phase) && await p.evaluate(() => document.body.classList.contains('focus')), v.phase);
    await p.mouse.click(640, 700);
    await wait(100);
    v = await view(p);
    check('competition mode: the tap to stop after the cube did is ignored', /lo ha comprobado/.test(v.phase), v.phase);
    await wait(3000);
    await p.keyboard.press('Escape');

    // ---- Bad data (wrong MAC) and disconnect ----
    await p.click('#cubeOff');
    await p.evaluate(() => {
      const subs = new Set();
      const link = {
        deviceName: 'GAN-test', events$: { subscribe(fn) { subs.add(fn); return { unsubscribe() { subs.delete(fn); } }; } },
        sendCubeCommand(c) { setTimeout(() => { if (c.type === 'REQUEST_FACELETS') subs.forEach((f) => f({ type: 'FACELETS', facelets: 'U'.repeat(54) })); }, 10); return Promise.resolve(); },
        disconnect() { return Promise.resolve(); },
      };
      window.OP3.cube.attach(link, 'gan');
    });
    await wait(200);
    v = await view(p);
    check('garbage from the cube → «la MAC no es la suya»', /no entiendo lo que manda/.test(v.msg) && /Escribir la MAC otra vez/.test(v.msg), v.msg);
    await p.evaluate(() => {
      let emit = null;
      const link = {
        deviceName: 'GAN-ok', events$: { subscribe(fn) { emit = fn; return { unsubscribe() {} }; } },
        sendCubeCommand(c) { setTimeout(() => { if (c.type === 'REQUEST_FACELETS') emit({ type: 'FACELETS', facelets: 'UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB' }); }, 10); return Promise.resolve(); },
        disconnect() { return Promise.resolve(); },
      };
      window.__drop = () => emit({ type: 'DISCONNECT' });
      window.OP3.cube.attach(link, 'gan');
    });
    await wait(100);
    const okName = await p.textContent('#cubeName');
    await p.evaluate(() => window.__drop());
    v = await view(p);
    check('a real-looking cube connects; dropping it says so', okName === 'GAN-ok' && /Se ha desconectado el cubo/.test(v.msg) && await p.isVisible('#cubeConnect'), okName + ' | ' + v.msg);
    await ctx.close();
  }

  // ================= Browsers without Web Bluetooth =================
  for (const [label, ua, re] of [
    ['Zen/Firefox', 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', /basados en él \(como Zen\) no traen Bluetooth web.*WebBT.*WebBT Server/],
    ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', /iPhone y iPad/],
    ['other', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36', /Este navegador no tiene Bluetooth web/],
  ]) {
    const { ctx, p } = await page({ userAgent: ua }, () => { try { delete Navigator.prototype.bluetooth; } catch (e) { /* none */ } });
    await p.goto(`${SITE}/#crono`);
    await p.waitForSelector('#cubeConnect');
    check(`${label}: no «Cubo virtual» button without ?cubo=virtual`, await p.isHidden('#cubeSim'));
    await p.click('#cubeConnect');
    const msg = await p.textContent('#cubeMsg');
    check(`${label}: explains why`, re.test(msg), msg);
    await ctx.close();
  }

  // ================= MAC dialog with a fake Bluetooth =================
  {
    const { ctx, p } = await page({}, () => {
      const device = {
        id: 'dev1', name: 'GAN-abc12',
        addEventListener() {}, removeEventListener() {},
        gatt: { connect: async () => { throw new DOMException('GATT fallo de prueba', 'NetworkError'); } },
      };
      window.__asked = 0;
      Object.defineProperty(navigator, 'bluetooth', {
        configurable: true,
        // Answers «no Bluetooth» wrongly, as some add-ons do: the app must try anyway.
        value: { getAvailability: async () => false, requestDevice: async () => { window.__asked++; return device; } },
      });
    });
    await p.goto(`${SITE}/#crono`);
    await p.waitForSelector('#cubeConnect');
    await p.click('#cubeConnect');
    await p.waitForSelector('#macSheet:not([hidden])', { timeout: 15000 });
    check('no MAC known → the dialog asks for it', await p.isVisible('#macInput'));
    check('dialog shows the chrome:// addresses', /chrome:\/\/flags\/#enable-experimental-web-platform-features/.test(await p.textContent('#macFlag')) && /chrome:\/\/bluetooth-internals/.test(await p.textContent('#macScan')));
    await p.screenshot({ path: `${SHOTS}/cube-1280-mac.png` });
    await p.fill('#macInput', 'hola');
    await p.click('#macForm button[type=submit]');
    check('bad MAC → says how it looks', /6 parejas/.test(await p.textContent('#macErr')) && await p.isVisible('#macSheet'));
    await p.fill('#macInput', 'ab12cd34ef56');
    await p.click('#macForm button[type=submit]');
    await p.waitForFunction(() => /No he podido conectar/.test(document.getElementById('cubeMsg').textContent), null, { timeout: 15000 }).catch(() => {});
    const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('op3bld:cube-mac:v1')));
    check('MAC normalised and remembered per cube', saved && saved['id:dev1'] === 'AB:12:CD:34:EF:56' && saved['name:GAN-abc12'] === 'AB:12:CD:34:EF:56', JSON.stringify(saved));
    check('connection error explained', /No he podido conectar el cubo: GATT fallo de prueba/.test(await p.textContent('#cubeMsg')), await p.textContent('#cubeMsg'));
    check('status back to off', await p.isVisible('#cubeConnect') && (await p.textContent('#cubeName')) === 'Cubo inteligente');
    await p.click('#cubeConnect');
    await wait(1500);
    check('second time: no dialog (MAC remembered)', await p.isHidden('#macSheet') && (await p.evaluate(() => window.__asked)) === 2);
    await p.evaluate(() => localStorage.removeItem('op3bld:cube-mac:v1'));
    await p.click('#cubeConnect');
    await p.waitForSelector('#macSheet:not([hidden])', { timeout: 15000 });
    await p.keyboard.press('Escape');
    await wait(300);
    check('Esc closes the dialog → explained', await p.isHidden('#macSheet') && /Sin la dirección del cubo/.test(await p.textContent('#cubeMsg')), await p.textContent('#cubeMsg'));
    await ctx.close();
  }

  // ================= MAC dialog in Zen/Firefox (WebBT) =================
  {
    const { ctx, p } = await page({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0' }, () => {
      const device = { id: 'dz', name: 'GAN-zen', addEventListener() {}, removeEventListener() {}, gatt: { connect: async () => { throw new DOMException('x', 'NetworkError'); } } };
      Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: { requestDevice: async () => device } });
    });
    await p.goto(`${SITE}/#crono`);
    await p.click('#cubeConnect');
    await p.waitForSelector('#macSheet:not([hidden])', { timeout: 15000 });
    const z = await p.evaluate(() => ({ auto: !document.getElementById('macAuto').hidden, how: document.getElementById('macHow').textContent, url: document.getElementById('macScan').textContent }));
    check('Zen/Firefox MAC dialog: only the manual way, through Edge', !z.auto && /abre Edge \(viene con Windows/.test(z.how) && z.url === 'edge://bluetooth-internals/#devices', JSON.stringify(z));
    await p.keyboard.press('Escape');
    await ctx.close();
  }

  // ================= Phone =================
  {
    const { ctx, p } = await page({ ...devices['Pixel 7'] });
    await p.goto(`${SITE}/?cubo=virtual#crono`);
    await p.waitForSelector('#cubeSim:not([hidden])');
    await p.tap('#cubeSim');
    await p.waitForFunction(() => window.OP3.cube.status === 'on');
    await turn(p, 'R U');
    const o = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    check('phone: no sideways scroll with the cube panel', !o);
    // Sound and vibration on a phone, and switching the sound off in Ajustes.
    await p.evaluate(() => { const O = window.OP3; O.cube.link.turn("U' R'"); });
    await p.tap('#cubeSync');
    await p.waitForTimeout(100);
    await p.evaluate(() => window.OP3.cube.link.turn(window.OP3.scramble()));
    await p.tap('#clock');
    await p.waitForTimeout(100);
    await p.evaluate(() => window.OP3.cube.simSolve(null, 400));
    await p.waitForTimeout(100);
    let log = await p.evaluate(() => window.OP3.cube.fxLog.slice());
    check('phone: solved → chime and vibration', log.includes('chime') && log.includes('vibrate'), JSON.stringify(log));
    await p.evaluate(() => window.OP3.showView('ajustes'));
    check('phone: Ajustes offers sound and vibration', await p.isVisible('#fxSound') && await p.isVisible('#fxVibrate'));
    await p.tap('#fxSound');
    check('phone: sound switched off and remembered', await p.evaluate(() => JSON.parse(localStorage.getItem('op3bld:cube-fx:v1')).sound === false && document.getElementById('fxSound').getAttribute('aria-pressed') === 'false'));
    await p.evaluate(() => { window.OP3.cube.fxLog.length = 0; window.OP3.showView('crono'); });
    await p.waitForTimeout(3100);
    await p.evaluate(() => window.OP3.cube.link.turn(window.OP3.scramble()));
    await p.tap('#clock');
    await p.waitForTimeout(100);
    await p.evaluate(() => window.OP3.cube.simSolve(null, 400));
    await p.waitForTimeout(100);
    log = await p.evaluate(() => window.OP3.cube.fxLog.slice());
    check('phone: with the sound off, only the vibration', !log.includes('chime') && log.includes('vibrate'), JSON.stringify(log));
    await p.screenshot({ path: `${SHOTS}/cube-390.png`, fullPage: true });
    await ctx.close();
  }

  console.log(results.join('\n'));
  console.log('page errors:', errs.length ? errs : 'none');
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });

function CHECK_WAIT() { return 900; }
