// Where the data lives (api/_kv.js) and how often the app touches it. Vercel Blob's free tier ran out
// (2,000 writes and listings a month) because every load listed files and every change synced; this suite
// keeps that from coming back:
//   - the three stores (memory, Redis over Upstash's REST API, Vercel Blob) behind the same handlers: sync,
//     challenges and leagues work the same on all of them, and on Blob nothing ever lists, a read is one
//     «simple» operation and a save one «advanced»; friends writing at the same time do not step on each
//     other; a paused store says so (503);
//   - the routes themselves (api/sync.js…) over memory;
//   - in the browser, with a fake clock: how often Fridrich and 3BLD save on their own (Blob: every 10 min,
//     Redis: every minute, and when you leave the page), that opening or coming back only reads, and that a
//     league the server lost comes back with its name.
const path = require('path');
const { chromium } = require('playwright');
const { SITE } = require('../env');

const API = path.join(__dirname, '..', '..', 'api');
const { memoryKv, redisKv, blobKv, StorePaused } = require(path.join(API, '_kv.js'));
const sync = require(path.join(API, '_sync.js'));
const reto = require(path.join(API, '_reto.js'));
const liga = require(path.join(API, '_liga.js'));

const results = [];
const check = (name, ok, extra) => results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
const tick = () => new Promise((ok) => setImmediate(ok));

// ---------------- Fakes of the two real stores ----------------
// Upstash's REST API: POST [command, ...args] → { result } or { error }.
function fakeRedis() {
  const data = new Map();
  const st = { calls: 0, over: false };
  const hash = (k) => { if (!data.has(k)) data.set(k, new Map()); return data.get(k); };
  const exec = ([cmd, k, ...a]) => {
    switch (cmd) {
      case 'GET': return data.has(k) && typeof data.get(k) === 'string' ? data.get(k) : null;
      case 'SET': if (a[1] === 'NX' && data.has(k)) return null; data.set(k, a[0]); return 'OK';
      case 'DEL': return data.delete(k) ? 1 : 0;
      case 'HGETALL': return [...(data.get(k) || new Map())].flat();
      case 'HSET': hash(k).set(a[0], a[1]); return 1;
      case 'HSETNX': if (hash(k).has(a[0])) return 0; hash(k).set(a[0], a[1]); return 1;
      case 'HDEL': return hash(k).delete(a[0]) ? 1 : 0;
      default: throw new Error(`unknown ${cmd}`);
    }
  };
  const fetch = async (url, init) => {
    st.calls++;
    await tick();
    if (init.headers.authorization !== 'Bearer t0k') return { ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) };
    if (st.over) return { ok: false, status: 400, json: async () => ({ error: 'ERR max requests limit exceeded. Limit: 500000, Usage: 500000' }) };
    try { const result = exec(JSON.parse(init.body)); return { ok: true, status: 200, json: async () => ({ result }) }; } catch (e) { return { ok: false, status: 400, json: async () => ({ error: e.message }) }; }
  };
  return { st, fetch, data };
}
// @vercel/blob's put / get / del, with ETags, allowOverwrite and ifMatch like the real one; counts operations
// the way Vercel bills them (put = advanced, get = simple; list never happens because there is no list).
function fakeBlob() {
  const files = new Map();
  const st = { simple: 0, advanced: 0, suspended: false, seq: 0 };
  const suspended = () => Object.assign(new Error('This store has been suspended.'), { name: 'BlobStoreSuspendedError' });
  return {
    st, files,
    sdk: {
      async get(pathname, opts) {
        await tick();
        if (st.suspended) throw new Error('Failed to fetch blob: 403 Forbidden');
        st.simple++;
        if (opts.useCache !== false) throw new Error('reads must skip the cache');
        const f = files.get(pathname);
        if (!f) return null;
        return { statusCode: 200, stream: new Blob([f.body]).stream(), blob: { pathname, etag: f.etag } };
      },
      async put(pathname, body, opts) {
        await tick();
        if (st.suspended) throw suspended();
        st.advanced++;
        await tick();
        if (opts.addRandomSuffix) throw new Error('no random suffixes: one file per key');
        const f = files.get(pathname);
        if (f && !opts.allowOverwrite) throw new Error('This blob already exists, use `allowOverwrite: true` if you want to overwrite it.');
        // Checked and written in one step, as the real store does.
        if (opts.ifMatch && (!f || f.etag !== opts.ifMatch)) throw Object.assign(new Error('Precondition failed: ETag mismatch.'), { name: 'BlobPreconditionFailedError' });
        files.set(pathname, { body, etag: `"e${st.seq++}"` });
        return { pathname, url: `https://x.private.blob.vercel-storage.com/${pathname}` };
      },
      async del(pathname) { files.delete(pathname); },
    },
  };
}

// ---------------- The same story on each store ----------------
const P = (id, name) => ({ id: id.padEnd(16, 'x'), token: id.charCodeAt(0).toString(16).repeat(16).slice(0, 32), name });
const single = (t, at) => ({ t, pen: 0, at, scr: "R U R' U'" });
async function story(label, kv) {
  const out = {};
  // Sync
  const k = 'a'.repeat(64);
  let r = await sync.handle(kv, { method: 'GET', k });
  out.syncEmpty = r.status === 200 && r.body.data === null;
  r = await sync.handle(kv, { method: 'POST', k, body: { data: { v: 1, times: [1, 2] } } });
  out.syncSaved = r.status === 200 && r.body.ok && Number.isFinite(r.body.at);
  await sync.handle(kv, { method: 'POST', k, body: { data: { v: 1, times: [1, 2, 3] } } });
  r = await sync.handle(kv, { method: 'GET', k });
  out.syncLatest = r.body.data && r.body.data.times.length === 3;
  out.syncBad = (await sync.handle(kv, { method: 'GET', k: 'nope' })).status === 400 && (await sync.handle(kv, { method: 'POST', k, body: { data: [1] } })).status === 400;

  // Challenges
  r = await reto.handle(kv, { method: 'POST', body: { scramble: "R U R' U'", by: 'Aco', kind: 'edges' } });
  const id = r.body.id;
  out.retoMade = r.status === 200 && /^[a-z0-9]{8}$/.test(id || '');
  await reto.handle(kv, { method: 'POST', id, body: { name: 'Aco', dev: 'devA', memo: 60000, exec: 50000, ok: true } });
  await reto.handle(kv, { method: 'POST', id, body: { name: 'Aco', dev: 'devA', memo: 1000, exec: 1000, ok: true } });   // a second try: the first one counts
  await reto.handle(kv, { method: 'POST', id, body: { name: 'Carla', dev: 'devC', memo: 70000, exec: 40000, ok: false } });
  r = await reto.handle(kv, { method: 'GET', id, dev: 'devA' });
  out.retoRead = r.status === 200 && r.body.kind === 'edges' && r.body.by === 'Aco' && r.body.results.length === 2
    && r.body.results[0].memo === 60000 && r.body.results[0].mine && !r.body.results[1].mine && !('dev' in r.body.results[0]);
  out.retoMissing = (await reto.handle(kv, { method: 'GET', id: 'zzzzzzzz' })).status === 404
    && (await reto.handle(kv, { method: 'POST', id: 'zzzzzzzz', body: { name: 'X', dev: 'd', memo: 1, exec: 1 } })).status === 404;

  // Leagues
  const aco = P('aco', 'Aco');
  const carla = P('carla', 'Carla');
  const dani = P('dani', 'Dani');
  r = await liga.handle(kv, { method: 'POST', code: '', body: { action: 'create', name: 'Los del piso', player: aco, best: { single: single(14000, 5) } } });
  const code = r.body.code;
  out.ligaMade = r.status === 200 && /^[a-z0-9]{8}$/.test(code || '') && r.body.members.length === 1;
  // Two friends joining at the very same moment: both get in.
  const [j1, j2] = await Promise.all([
    liga.handle(kv, { method: 'POST', code, body: { action: 'join', player: carla, best: { single: single(18000, 6) }, n: 3 } }),
    liga.handle(kv, { method: 'POST', code, body: { action: 'join', player: dani, best: { single: single(21000, 7) }, n: 2 } }),
  ]);
  r = await liga.handle(kv, { method: 'GET', code });
  out.ligaRace = j1.status === 200 && j2.status === 200 && r.body.members.length === 3;
  await liga.handle(kv, { method: 'POST', code, body: { action: 'post', player: carla, best: { single: single(12000, 8) }, n: 4 } });
  r = await liga.handle(kv, { method: 'GET', code });
  const c = r.body.members.find((m) => m.name === 'Carla');
  out.ligaPost = c && c.best.single.t === 12000 && c.n === 4 && !('tokenHash' in c);
  out.ligaForged = (await liga.handle(kv, { method: 'POST', code, body: { action: 'post', player: { ...carla, token: 'f'.repeat(32) }, best: {} } })).status === 403;
  await liga.handle(kv, { method: 'POST', code, body: { action: 'leave', player: dani } });
  r = await liga.handle(kv, { method: 'GET', code });
  out.ligaLeave = r.body.members.length === 2 && !r.body.members.some((m) => m.name === 'Dani');
  // A league the store does not have: 404, unless a member brings it back with its name.
  const lost = 'q7w8e9r2';
  out.ligaLost = (await liga.handle(kv, { method: 'GET', code: lost })).status === 404
    && (await liga.handle(kv, { method: 'POST', code: lost, body: { action: 'post', player: aco, best: {} } })).status === 404;
  r = await liga.handle(kv, { method: 'POST', code: lost, body: { action: 'post', player: aco, best: { single: single(15000, 9) }, league: { name: 'La de antes', by: 'Aco', at: 123 } } });
  out.ligaBack = r.status === 200 && r.body.name === 'La de antes' && r.body.by === 'Aco' && r.body.at === 123 && r.body.members.length === 1;
  // …and a second member bringing it back too does not rename it.
  r = await liga.handle(kv, { method: 'POST', code: lost, body: { action: 'post', player: carla, best: {}, league: { name: 'Otro nombre', by: 'Carla' } } });
  out.ligaBackOnce = r.status === 200 && r.body.name === 'La de antes' && r.body.members.length === 2;
  const bad = Object.entries(out).filter(([, v]) => !v).map(([x]) => x);
  check(`${label}: sync, challenges and leagues (two joining at once, a forged token, leaving, a lost league brought back)`, !bad.length, bad.join(', '));
}

(async () => {
  // ================= The three stores =================
  await story('memory', memoryKv());

  const redis = fakeRedis();
  await story('redis', redisKv({ url: 'https://eu1-x.upstash.io/', token: 't0k', fetch: redis.fetch }));
  check('redis: keys under one prefix, maps as hashes', [...redis.data.keys()].every((x) => x.startsWith('op3:')) && redis.data.get(`op3:sync/${'a'.repeat(64)}`) && [...redis.data.values()].some((v) => v instanceof Map));
  redis.st.over = true;
  let paused = null;
  try { await redisKv({ url: 'https://x', token: 't0k', fetch: redis.fetch }).get('x'); } catch (e) { paused = e; }
  check('redis: over the plan\'s limit → «paused», not a crash', paused instanceof StorePaused && paused.status === 503);

  const blob = fakeBlob();
  const bkv = blobKv({ sdk: blob.sdk });
  await story('blob', bkv);
  check('blob: one file per key, under v2/, no random suffix', [...blob.files.keys()].every((x) => /^v2\/[a-z]+\/[a-z0-9]+\.json$/.test(x)), [...blob.files.keys()].join(' '));
  // What each request costs on Blob.
  const cost = async (fn) => { const a = blob.st.advanced; const s = blob.st.simple; await fn(); return [blob.st.advanced - a, blob.st.simple - s]; };
  const k = 'b'.repeat(64);
  const syncPost = await cost(() => sync.handle(bkv, { method: 'POST', k, body: { data: { v: 1 } } }));
  const syncGet = await cost(() => sync.handle(bkv, { method: 'GET', k }));
  const made = await liga.handle(bkv, { method: 'POST', code: '', body: { action: 'create', name: 'Coste', player: P('aco', 'Aco'), best: {} } });
  const ligaGet = await cost(() => liga.handle(bkv, { method: 'GET', code: made.body.code }));
  const ligaPost = await cost(() => liga.handle(bkv, { method: 'POST', code: made.body.code, body: { action: 'post', player: P('aco', 'Aco'), best: { single: single(9000, 1) } } }));
  check('blob: a sync save = 1 write, a sync read = 1 read, a league read = 1 read, a league post = 1 write (+2 reads)',
    `${syncPost}|${syncGet}|${ligaGet}|${ligaPost}` === '1,0|0,1|0,1|1,2', `${syncPost}|${syncGet}|${ligaGet}|${ligaPost}`);
  // Five friends posting at the same moment on Blob: the ETag catches the overlaps and nobody is lost.
  const many = await Promise.all(['ana', 'bea', 'ces', 'dia', 'eva'].map((n, i) => liga.handle(bkv, { method: 'POST', code: made.body.code, body: { action: 'join', player: P(n, n), best: { single: single(10000 + i, 2) } } })));
  const after = await liga.handle(bkv, { method: 'GET', code: made.body.code });
  check('blob: five friends writing at once, all six in the league', many.every((x) => x.status === 200) && after.body.members.length === 6, `${many.map((x) => x.status)} → ${after.body.members.length}`);
  blob.st.suspended = true;
  paused = null;
  try { await sync.handle(bkv, { method: 'POST', k, body: { data: { v: 1 } } }); } catch (e) { paused = e; }
  check('blob: a suspended store → «paused» (503)', paused instanceof StorePaused && paused.status === 503);

  // ================= The routes, over memory =================
  process.env.STORE = 'memory';
  const route = (name) => require(path.join(API, `${name}.js`));
  const call = async (name, method, url, body) => {
    const req = { method, url, query: Object.fromEntries(new URL(url, 'http://x').searchParams), body };
    const res = { statusCode: 0, headers: {}, out: '', setHeader(h, v) { this.headers[h.toLowerCase()] = v; }, end(x) { this.out = x || ''; } };
    await route(name)(req, res);
    return { status: res.statusCode, body: res.out ? JSON.parse(res.out) : null, headers: res.headers };
  };
  const ping = await call('ping', 'GET', '/api/ping');
  check('route ping: says which store and how often to sync', ping.status === 200 && ping.body.store && ping.body.kind === 'memory' && ping.body.every === 60, JSON.stringify(ping.body));
  const deep = await call('ping', 'GET', '/api/ping?deep=1');
  check('route ping ?deep=1: a write and read back', deep.body.roundtrip === true);
  const kk = 'c'.repeat(64);
  await call('sync', 'POST', `/api/sync?k=${kk}`, { data: { v: 1, n: 7 } });
  const got = await call('sync', 'GET', `/api/sync?k=${kk}`);
  check('route sync: save and read back, never cached', got.status === 200 && got.body.data.n === 7 && got.headers['cache-control'] === 'no-store');
  const rt = await call('reto', 'POST', '/api/reto', { scramble: 'R U', by: 'Aco' });
  const rg = await call('reto', 'GET', `/api/reto?id=${rt.body.id}`);
  const lgc = await call('liga', 'POST', '/api/liga', { action: 'create', name: 'Ruta', player: P('aco', 'Aco') });
  const lgg = await call('liga', 'GET', `/api/liga?code=${lgc.body.code}`);
  const put = await call('sync', 'PUT', `/api/sync?k=${kk}`);
  check('route reto and liga: create and read; other methods 405', rg.status === 200 && rg.body.scramble === 'R U' && lgg.status === 200 && lgg.body.name === 'Ruta' && put.status === 405 && put.headers.allow === 'GET, POST');
  const { sendError } = require(path.join(API, '_lib.js'));
  const res = { statusCode: 0, headers: {}, setHeader(h, v) { this.headers[h] = v; }, end(x) { this.out = x; } };
  sendError(res, new StorePaused());
  check('route error: a paused store answers 503 and says so', res.statusCode === 503 && /pausa/.test(JSON.parse(res.out).error));

  // ================= In the browser: how often the app syncs on its own =================
  const browser = await chromium.launch();
  const errs = [];
  // Fresh codes each run, so the suite also works against a server that is already running.
  const rnd = (abc, n) => Array.from({ length: n }, () => abc[Math.floor(Math.random() * abc.length)]).join('');
  const CODE = rnd('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 16);
  const KEY3 = rnd('0123456789abcdef', 64);
  const LOST = rnd('abcdefghijkmnpqrstuvwxyz23456789', 8);
  const T0 = new Date('2026-10-20T10:00:00Z').getTime();
  const open = async (page, every, extra = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.route(/\/api\/ping/, (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, store: true, kind: every > 60 ? 'blob' : 'redis', every }) }));
    await ctx.addInitScript((x) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      Object.entries(x).forEach(([key, v]) => localStorage.setItem(key, JSON.stringify(v)));
    }, { 'op3bld:sync:v1': { code: CODE, key: KEY3, last: 0 }, 'op3bld:name:v1': 'Aco', ...extra });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${page}: ${e.message} ${(e.stack || '').split('\n').slice(1, 4).join(' | ')}`));
    const log = [];
    p.on('request', (q) => { const m = q.url().match(/\/api\/(sync|liga)/); if (m) log.push(`${m[1]} ${q.method()}`); });
    await p.clock.install({ time: T0 });
    await p.goto(`${SITE}/${page}`);
    return { ctx, p, log };
  };
  const pushes = (log) => log.filter((x) => x === 'sync POST').length;
  const reads = (log) => log.filter((x) => x === 'sync GET').length;
  const settle = (p) => p.waitForTimeout(400);
  const visibility = (p, state) => p.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { value: s, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);

  // ---- Fridrich on Blob's free tier (every 10 min)
  {
    const { ctx, p, log } = await open('fridrich#entrenar', 600);
    await p.waitForFunction(() => window.Fridrich && window.Fridrich.scramble(), null, { timeout: 30000 });
    await p.clock.runFor(2000);
    await settle(p);
    check('fridrich, blob: opening reads, and saves only because the server has nothing yet', reads(log) === 1 && pushes(log) === 1, log.join(', '));
    // Training for five minutes: a change every 7 s.
    for (let i = 0; i < 43; i++) {
      await p.evaluate(() => document.dispatchEvent(new CustomEvent('fr:changed')));
      await p.clock.runFor(7000);
      await p.waitForTimeout(30);   // let a request in flight finish before the fake clock times it out
    }
    await settle(p);
    check('fridrich, blob: 43 changes in 5 minutes → nothing sent yet', pushes(log) === 1 && reads(log) === 1, log.join(', '));
    await p.clock.runFor(300000);
    await settle(p);
    const info = await p.evaluate(() => window.Fridrich._.syncPlan.info());
    check('fridrich, blob: ten minutes after the last save, one save with all of them', pushes(log) === 2 && reads(log) === 2 && !info.dirty, `${log.join(', ')} · ${JSON.stringify(info)}`);
    // A change, then leaving the page right away: it waits (saved 0 min ago); later, leaving saves it.
    await p.evaluate(() => document.dispatchEvent(new CustomEvent('fr:changed')));
    await visibility(p, 'hidden');
    await settle(p);
    const early = pushes(log);
    await visibility(p, 'visible');
    await p.clock.runFor(150000);
    await p.evaluate(() => document.dispatchEvent(new CustomEvent('fr:changed')));
    await visibility(p, 'hidden');
    await settle(p);
    check('fridrich, blob: leaving the page saves what is pending (not if it saved under 2 min ago)', early === 2 && pushes(log) === 3, `${early} → ${log.join(', ')}`);
    // Coming back more than a minute later: only reads.
    await p.clock.runFor(90000);
    await visibility(p, 'visible');
    await settle(p);
    check('fridrich, blob: coming back reads, without saving', reads(log) === 4 && pushes(log) === 3, log.join(', '));
    await p.evaluate(() => window.Fridrich._.syncNow(true));
    await settle(p);
    check('fridrich: «Sincronizar ahora» reads and saves', reads(log) === 5 && pushes(log) === 4, log.join(', '));
    await ctx.close();
  }

  // ---- 3BLD on Redis (every minute)
  {
    const { ctx, p, log } = await open('#crono', 60);
    await p.waitForFunction(() => window.OP3, null, { timeout: 30000 });
    await p.clock.runFor(2000);
    await settle(p);
    const first = `${reads(log)}/${pushes(log)}`;
    for (let i = 0; i < 43; i++) {
      await p.evaluate(() => document.dispatchEvent(new CustomEvent('op3:changed')));
      await p.clock.runFor(7000);
      await p.waitForTimeout(30);
    }
    await p.clock.runFor(60000);
    await settle(p);
    const n = pushes(log) - 1;
    check('3bld, redis: opening reads (and fills the empty server); five minutes of changes → a save a minute', first === '1/1' && n >= 4 && n <= 6, `${first} · ${n} saves · ${log.join(', ')}`);
    await ctx.close();
  }

  // ---- A league the server lost comes back
  {
    const { ctx, p, log } = await open('fridrich#ranking', 60, {
      'cfop:ligas:v1': [{ code: LOST, name: 'Los de siempre', at: 1, by: 'Aco', made: 1700000000000 }],
      'cfop:times:v1': [{ t: 15230, pen: 0, at: 1700000000000, scr: "R U R' U'" }],
    });
    await p.waitForFunction(() => window.Fridrich && window.Fridrich.scramble(), null, { timeout: 30000 });
    await p.clock.runFor(4000);
    await p.waitForFunction(() => /Los de siempre/.test(document.getElementById('rankBox').innerText) && document.querySelectorAll('.rk-table tbody tr').length >= 1, null, { timeout: 10000 }).catch(() => {});
    const seen = await p.evaluate(() => ({ text: document.getElementById('rankBox').innerText.replace(/\s+/g, ' ').slice(0, 300), rows: document.querySelectorAll('.rk-table tbody tr:not(.rk-open)').length }));
    check('ranking: a league of yours the server lost comes back, with its name and your time', /Los de siempre/.test(seen.text) && /15[.,]23/.test(seen.text) && seen.rows === 1 && !/no existe/.test(seen.text), `${JSON.stringify(seen)} · ${log.join(', ')}`);
    // Looking at the ranking for 10 minutes on Redis: a read every 30 s at most.
    const before = log.filter((x) => x === 'liga GET').length;
    await p.clock.runFor(600000);
    await settle(p);
    const polls = log.filter((x) => x === 'liga GET').length - before;
    check('ranking, redis: 10 minutes looking at it → about one read every 30 s', polls >= 15 && polls <= 21, String(polls));
    await ctx.close();
  }
  {
    const { ctx, p, log } = await open('fridrich#ranking', 600, { 'cfop:ligas:v1': [{ code: LOST, name: 'Los de siempre', at: 1 }] });
    await p.waitForFunction(() => window.Fridrich && window.Fridrich.scramble(), null, { timeout: 30000 });
    await p.clock.runFor(4000);
    await settle(p);
    const before = log.filter((x) => x === 'liga GET').length;
    await p.clock.runFor(600000);
    await settle(p);
    const polls = log.filter((x) => x === 'liga GET').length - before;
    check('ranking, blob: 10 minutes looking at it → one read every 5 min', polls >= 1 && polls <= 2, String(polls));
    await ctx.close();
  }
  await browser.close();

  console.log(results.join('\n'));
  console.log('page errors:', errs.length ? errs : 'none');
  console.log(`${results.filter((r) => r.startsWith('FAIL')).length} failed of ${results.length}`);
  process.exit(0);
})().catch((e) => { console.log(results.join('\n')); console.error(e); console.log('1 failed of 1'); process.exit(1); });
