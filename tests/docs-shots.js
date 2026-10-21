// The screenshots in docs/img, taken from the built site with the virtual cube and a fake clock (so the
// times look like a real attempt). Run with «npm run shots».
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');
const { SITE, FONTS_CSS } = require('./env');

const OUT = path.join(__dirname, '..', 'docs', 'img');
fs.mkdirSync(OUT, { recursive: true });
const START = new Date('2026-10-20T18:30:00+02:00');

async function open(browser, opts, url) {
  const ctx = await browser.newContext({ deviceScaleFactor: 1, ...opts });
  await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ contentType: 'text/css', body: FONTS_CSS }));
  await ctx.route(/fonts\.gstatic\.com/, (r) => r.abort());
  const p = await ctx.newPage();
  await p.clock.install({ time: START });
  await p.goto(`${SITE}${url}`);
  await p.clock.runFor(2500);
  await p.evaluate(() => document.fonts.ready);
  return { ctx, p };
}
const connect = async (p) => {
  await p.evaluate(() => document.getElementById('cubeSim').click());
  await p.clock.runFor(200);
};
const turn = (p, alg) => p.evaluate((a) => window.OP3.cube.link.turn(a), alg);
const solution = (p, flawAt) => p.evaluate((k) => {
  const O = window.OP3;
  const toks = O.cube.simMemo(O.cube.link.state());
  return toks.map((t, i) => (i === k ? O.cube.flawed(t) : O.tokenAlg(t)));
}, flawAt);
const save = (p, name, opts) => p.screenshot({ path: path.join(OUT, name), ...opts });

(async () => {
  const browser = await chromium.launch();
  const done = [];

  // Practicar: the default scramble and memo, first letter on the cube.
  {
    const { ctx, p } = await open(browser, { viewport: { width: 1280, height: 860 }, colorScheme: 'light' }, '/#practicar');
    await save(p, 'practicar.png');
    done.push('practicar.png');
    await ctx.close();
  }

  // Cronómetro with the cube: following the scramble, then a DNF and its report.
  {
    const { ctx, p } = await open(browser, { viewport: { width: 1280, height: 860 }, colorScheme: 'dark' }, '/?cubo=virtual#crono');
    await connect(p);
    const scr = await p.evaluate(() => window.OP3.scramble());
    const moves = scr.split(' ');
    await turn(p, moves.slice(0, 7).join(' '));
    await p.clock.runFor(100);
    await save(p, 'cubo-scramble.png');
    done.push('cubo-scramble.png');
    await turn(p, moves.slice(7).join(' '));
    await p.keyboard.press('Space');
    await p.clock.runFor(52300);
    const algs = await solution(p, 3);
    for (const a of algs) { await turn(p, a); await p.clock.runFor(6800); }
    await p.keyboard.press('Space');
    await p.clock.runFor(900);
    await p.evaluate(() => document.getElementById('markDnf').click());
    await p.clock.runFor(300);
    // Below the menu bar, which stays at the top of the window.
    await p.evaluate(() => window.scrollTo(0, window.scrollY + document.getElementById('clock').getBoundingClientRect().top - 110));
    await p.clock.runFor(100);
    const clip = await p.evaluate(() => {
      const a = document.getElementById('clock').getBoundingClientRect();
      const b = document.getElementById('cubeReport').getBoundingClientRect();
      return { x: Math.round(a.left) - 16, y: Math.round(a.top) - 16, width: Math.round(a.width) + 32, height: Math.round(b.bottom - a.top) + 32 };
    });
    await save(p, 'cubo-dnf.png', { clip });
    done.push('cubo-dnf.png');
    await ctx.close();
  }

  // Competition mode on a phone, executing: the turns and the letters at the bottom.
  {
    const { ctx, p } = await open(browser, { ...devices['Pixel 7'], deviceScaleFactor: 1, colorScheme: 'dark' }, '/?cubo=virtual#crono');
    await connect(p);
    await turn(p, await p.evaluate(() => window.OP3.scramble()));
    await p.evaluate(() => document.getElementById('focusOpen').click());
    await p.clock.runFor(200);
    await p.evaluate(() => document.getElementById('clock').click());
    await p.clock.runFor(48700);
    const algs = await solution(p, null);
    for (const a of algs.slice(0, 5)) { await turn(p, a); await p.clock.runFor(7100); }
    await turn(p, algs[5].split(' ').slice(0, 6).join(' '));
    await p.clock.runFor(1300);
    await save(p, 'competicion.png');
    done.push('competicion.png');
    await ctx.close();
  }

  // Entrenar answered on the cube, halfway through a letter.
  {
    const { ctx, p } = await open(browser, { viewport: { width: 1280, height: 860 }, colorScheme: 'light' }, '/?cubo=virtual#crono');
    await connect(p);
    await p.evaluate(() => window.OP3.showView('entrenar'));
    // A letter with a setup, so the three steps show.
    for (let i = 0; i < 30; i++) {
      const s = await p.evaluate(() => window.OP3.trainer.state());
      const setup = await p.evaluate((x) => window.OP3.MODES[x.kind].table[x.letter] || '', s);
      if (setup.split(' ').length >= 2) break;
      await p.evaluate(() => document.getElementById('trSkip').click());
      await p.evaluate(() => document.getElementById('trSubmit').click());
    }
    const s = await p.evaluate(() => window.OP3.trainer.state());
    const alg = await p.evaluate((x) => window.OP3.parseAlg(window.OP3.tokenAlg({ kind: x.kind, L: x.letter })).map((m) => m.text), s);
    const setupLen = await p.evaluate((x) => window.OP3.parseAlg(window.OP3.MODES[x.kind].table[x.letter]).length, s);
    await p.clock.runFor(1800);
    await turn(p, alg.slice(0, setupLen + 6).join(' '));
    await p.clock.runFor(100);
    await save(p, 'entrenar-cubo.png');
    done.push('entrenar-cubo.png');
    await ctx.close();
  }

  // «Fridrich reducido»: a solve with the cube, at the last layer (the case and its algorithm), and the
  // splits of a finished one.
  {
    const SOLVE = ["D R' F2 L", "U R U' R'", "U' F' U F", "L' U' L", "U B U' B'", "F R U R' U' F'", "R U R' U R U2 R'", "R U R' U' R' F R2 U' R' U' R U R' F'", "R U' R U R U R U' R' U' R2"];
    const PACE = [2600, 3100, 2900, 3300, 3000, 1900, 2100, 3400, 2500];
    const { ctx, p } = await open(browser, { viewport: { width: 1280, height: 1000 }, colorScheme: 'light' }, '/fridrich?cubo=virtual#crono');
    await connect(p);
    const ft = (a) => p.evaluate((x) => window.Fridrich.cube().link.turn(x), a);
    const play = async (alg, ms) => {
      const moves = alg.split(' ');
      for (const m of moves) { await ft(m); await p.clock.runFor(Math.round(ms / moves.length)); }
    };
    // An earlier solve, so the splits and the averages have something to show.
    for (let k = 0; k < 2; k++) {
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
      await ft(scr);
      await p.clock.runFor(1500);
      await ft('z2');
      const upTo = k === 0 ? SOLVE.length : 6;
      for (let i = 0; i < upTo; i++) await play(SOLVE[i], PACE[i] * (k === 0 ? 1.15 : 1));
      if (k === 0) {
        await p.clock.runFor(1500);
        // The analysis of that solve.
        await p.waitForFunction(() => document.querySelector('.fr-an-box'), null, { timeout: 15000 });
        await (await p.$('#splits')).screenshot({ path: path.join(OUT, 'fridrich-analisis.png') });
        done.push('fridrich-analisis.png');
        await ft('z2');
      }
    }
    await ft("R U R'");
    await p.clock.runFor(400);
    await save(p, 'fridrich.png');
    done.push('fridrich.png');
    await ctx.close();
  }

  // «Fridrich reducido» with a history: Progreso and «Qué entrenar hoy».
  {
    const { seed } = require('./fixtures/cfop-seed');
    const d = seed(START.getTime());
    const ctx = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 1280, height: 1000 }, colorScheme: 'light', timezoneId: 'Europe/Madrid' });
    await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ contentType: 'text/css', body: FONTS_CSS }));
    await ctx.route(/fonts\.gstatic\.com/, (r) => r.abort());
    await ctx.addInitScript((x) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      Object.entries(x).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
    }, { 'cfop:times:v1': d.times, 'cfop:trlog:v1': d.trlog, 'cfop:train:v1': d.train, 'cfop:crosstr:v1': d.crossTr, 'cfop:learn:v1': d.learn });
    const p = await ctx.newPage();
    await p.clock.install({ time: START });
    await p.goto(`${SITE}/fridrich#progreso`);
    await p.clock.runFor(2500);
    await p.evaluate(() => document.fonts.ready);
    await save(p, 'fridrich-progreso.png', { clip: { x: 0, y: 0, width: 1280, height: 1000 } });
    done.push('fridrich-progreso.png');
    await p.evaluate(() => window.Fridrich.showView('entrenar'));
    await p.clock.runFor(300);
    const top = await p.evaluate(() => document.getElementById('planBox').closest('section').getBoundingClientRect().top + window.scrollY);
    await p.evaluate((y) => window.scrollTo(0, y - 80), top);
    await save(p, 'fridrich-plan.png');
    done.push('fridrich-plan.png');
    // The ranking: a league with three friends, one record opened.
    await p.evaluate(() => { localStorage.setItem('op3bld:name:v1', JSON.stringify('Aco')); window.Fridrich.showView('ranking'); });
    await p.clock.runFor(300);
    await p.fill('#rkLeague', 'Los del piso');
    await p.click('#rkCreate button');
    await p.waitForFunction(() => document.querySelector('.rk-table'), null, { timeout: 10000 });
    await p.evaluate(async () => {
      const code = JSON.parse(localStorage.getItem('cfop:ligas:v1'))[0].code;
      const scr = "R2 D' B2 U F2 D2 L2 U' B2 R2 F' L' D2 B' U2 R F' U' R2 B";
      const s = (t) => ({ t, pen: 0, at: Date.now() - 3 * 3600000, scr });
      const avg = (ts) => { const xs = ts.slice().sort((a, b) => a - b).slice(1, -1); return { v: Math.round(xs.reduce((a, b) => a + b, 0) / xs.length), solves: ts.map(s) }; };
      const friends = [['pabloxxxxxxxxxxx', 'Pablo', [36900, 41200, 39800, 44100, 40300]], ['luciaxxxxxxxxxxx', 'Lucía', [33400, 37200, 35100, 38900, 36000]], ['danixxxxxxxxxxxx', 'Dani', [52300, 49800, 55100, 51000, 58700]]];
      for (const [id, name, ts] of friends) {
        await fetch(`api/liga?code=${code}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'join', player: { id, token: 'a'.repeat(32), name }, best: { single: s(Math.min(...ts)), ao5: avg(ts) } }) });
      }
      window.Fridrich._.lg.data = {};
    });
    await p.click('[data-rk="refresh"]');
    await p.clock.runFor(500);
    await p.waitForFunction(() => document.querySelectorAll('.rk-table tbody tr').length >= 4, null, { timeout: 10000 });
    const mine = await p.evaluate(() => [...document.querySelectorAll('.rk-table tbody tr')].findIndex((r) => /\(tú\)/.test(r.innerText)));
    await p.click(`.rk-table tbody tr:nth-child(${mine + 1}) [data-rk-open]`);
    await p.clock.runFor(300);
    await p.evaluate(() => window.scrollTo(0, 0));
    await p.clock.runFor(2600);   // the heads-up gone
    await save(p, 'fridrich-ranking.png');
    done.push('fridrich-ranking.png');
    await ctx.close();
  }

  // The stream overlay over a scene, executing with the cube.
  {
    const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
    await ctx.route(/fonts\.googleapis\.com/, (r) => r.fulfill({ contentType: 'text/css', body: FONTS_CSS }));
    await ctx.route(/fonts\.gstatic\.com/, (r) => r.abort());
    await ctx.addInitScript(() => { try { localStorage.setItem('op3bld:name:v1', JSON.stringify('Aco')); } catch (e) { /* none */ } });
    // One fake clock for the whole context: the overlay's time matches the app's.
    await ctx.clock.install({ time: START });
    const ov = await ctx.newPage();
    await ov.goto(`${SITE}/wrap.html#overlay.html`);
    const app = await ctx.newPage();
    await app.goto(`${SITE}/?cubo=virtual#crono`);
    const both = async (ms) => {
      await ctx.clock.runFor(ms);
      await app.waitForTimeout(60);   // messages between the pages go in real time
      await ctx.clock.runFor(50);
    };
    await both(2500);
    await app.click('#cubeSim');
    await both(300);
    await app.evaluate(() => window.OP3.cube.link.turn(window.OP3.scramble()));
    await both(300);
    await app.keyboard.press('Space');
    await both(51400);
    const algs = await solution(app, null);
    for (const a of algs.slice(0, 4)) { await app.evaluate((x) => window.OP3.cube.link.turn(x), a); await both(6900); }
    await app.evaluate((x) => window.OP3.cube.link.turn(x), algs[4].split(' ').slice(0, 7).join(' '));
    await both(1200);
    await ov.evaluate(() => document.fonts.ready);
    await ov.screenshot({ path: path.join(OUT, 'overlay.jpg'), type: 'jpeg', quality: 86 });
    done.push('overlay.jpg');
    await ctx.close();
  }

  await browser.close();
  console.log(`Capturas: ${done.filter((x) => typeof x === 'string').join(', ')}`);
  console.log('0 problems');
})().catch((e) => { console.error(e); process.exit(1); });
