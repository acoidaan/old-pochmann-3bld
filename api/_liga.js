// Friends' leagues for «Fridrich reducido»: a group with a code; each member keeps their best single, ao5 and
// ao12 (with those solves and their scrambles, and the steps when done with a smart cube). Only the total time
// ranks, as in a competition. Pure logic over the store (api/_kv.js), so the API route and the tests' server
// run the same code. A league is one map: «.» is the league itself, «m:<id>» each member's entry. Each member
// writes only their own entry, and a secret token, kept hashed, stops anyone else from changing it.
// If the store loses a league (a new store, say), a member who still has it brings it back with its name.
const crypto = require('crypto');

const CODE = /^[a-z0-9]{8}$/;
const PID = /^[a-z0-9]{12,32}$/;
const TOKEN = /^[a-f0-9]{32,64}$/;
const MOVES = /^[RLUDFBMESrludfbxyzw2' ]{0,400}$/;
const CASE = /^[a-z0-9]{1,10}$/;
const MAX_MEMBERS = 60;

const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const hash = (t) => crypto.createHash('sha256').update(`liga:${t}`).digest('hex');
const okMs = (v) => Number.isFinite(v) && v >= 0 && v < 36e5;
const int = (v, max) => (Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null);
const fail = (status, error) => ({ status, body: { error } });
function newCode() {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  return [...crypto.randomBytes(8)].map((b) => abc[b % 32]).join('');
}
const keyOf = (code) => `liga/${code}`;

// ---- What a solve may carry
function cleanSp(sp) {
  if (!sp || typeof sp !== 'object' || !Array.isArray(sp.s) || sp.s.length !== 6) return null;
  const s = sp.s.map((x) => {
    if (!Array.isArray(x)) return null;
    const t = int(x[0], 36e5);
    if (t == null) return null;
    return [t, int(x[1], 400) || 0, x[2] == null ? null : int(x[2], 36e5), typeof x[3] === 'string' && CASE.test(x[3]) ? x[3] : null, x[4] ? 1 : 0];
  });
  return { f: ['U', 'D', 'F', 'B', 'R', 'L'].includes(sp.f) ? sp.f : 'U', s };
}
function cleanSolve(x, full) {
  if (!x || typeof x !== 'object' || !okMs(x.t)) return null;
  const pen = x.pen === 2 ? 2 : x.pen === 'dnf' ? 'dnf' : 0;
  const scr = clean(x.scr, 400);
  const out = { t: Math.round(x.t), pen, at: int(x.at, 1e14) || 0, scr: MOVES.test(scr) ? scr : '' };
  const sp = cleanSp(x.sp);
  if (sp) out.sp = sp;
  if (full && Array.isArray(x.rc) && x.rc.length === 6) {
    const rc = x.rc.map((m) => (m == null ? null : MOVES.test(String(m)) ? String(m).slice(0, 300) : ''));
    out.rc = rc;
  }
  if (full && x.an && typeof x.an === 'object') {
    const m = int(x.an.m, 1000);
    const i = int(x.an.i, 1000);
    if (m && i != null && i <= m) out.an = { m, i };
  }
  return out;
}
const value = (x) => (x.pen === 'dnf' ? Infinity : x.t + (x.pen === 2 ? 2000 : 0));
// WCA: drop the best and the worst; two DNFs make it DNF.
function average(solves) {
  const xs = solves.map(value).sort((a, b) => a - b).slice(1, -1);
  if (xs.some((v) => v === Infinity)) return Infinity;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function cleanAvg(a, n) {
  if (!a || typeof a !== 'object' || !Array.isArray(a.solves) || a.solves.length !== n) return null;
  const solves = a.solves.map((x) => cleanSolve(x, false));
  if (solves.some((x) => !x)) return null;
  const v = average(solves);
  // The average has to be what its solves say.
  if (!Number.isFinite(v) || !Number.isFinite(a.v) || Math.abs(v - a.v) > 15) return null;
  return { v: Math.round(v), at: int(a.at, 1e14) || solves[n - 1].at, solves };
}
function cleanBest(b) {
  const best = b && typeof b === 'object' ? b : {};
  const single = cleanSolve(best.single, true);
  return {
    single: single && single.pen !== 'dnf' ? single : null,
    ao5: cleanAvg(best.ao5, 5),
    ao12: cleanAvg(best.ao12, 12),
  };
}

// ---- Reading a league
async function readLeague(store, code) {
  const m = await store.all(keyOf(code));
  const meta = m['.'];
  if (!meta || typeof meta !== 'object') return null;
  const members = Object.keys(m).filter((f) => f.startsWith('m:')).map((f) => m[f]).filter((d) => d && typeof d === 'object' && d.id);
  return { meta, members };
}
const publicMember = (d) => ({ id: d.id, name: d.name, joined: d.joined, updated: d.updated, n: d.n || 0, best: d.best || { single: null, ao5: null, ao12: null } });
const publicLeague = (code, meta, docs) => ({
  code, name: meta.name, by: meta.by, at: meta.at,
  members: docs.map(publicMember).sort((a, b) => a.joined - b.joined),
});

// ---- One request: { method, code, body } → { status, body }
async function handle(store, { method, code, body }) {
  if (method === 'GET') {
    if (!CODE.test(code || '')) return fail(400, 'código de liga no válido');
    const lg = await readLeague(store, code);
    if (!lg) return fail(404, 'esa liga no existe');
    return { status: 200, body: publicLeague(code, lg.meta, lg.members) };
  }
  if (method !== 'POST') return fail(405, 'método no permitido');
  const b = body && typeof body === 'object' ? body : {};
  const p = b.player && typeof b.player === 'object' ? b.player : {};
  const pid = String(p.id || '');
  const token = String(p.token || '');
  const name = clean(p.name, 24);
  if (!PID.test(pid) || !TOKEN.test(token)) return fail(400, 'falta tu identificador');
  const now = Date.now();
  const memberDoc = (old, withBest) => {
    const best = withBest ? cleanBest(b.best) : old ? old.best : { single: null, ao5: null, ao12: null };
    const same = old && JSON.stringify(old.best) === JSON.stringify(best);
    return {
      id: pid, name: name || (old && old.name) || 'Sin nombre', tokenHash: hash(token),
      joined: old ? old.joined : now, updated: same ? old.updated : now,
      n: int(b.n, 1e6) != null ? int(b.n, 1e6) : old ? old.n : 0, best,
    };
  };

  if (!code) {
    if (b.action !== 'create') return fail(400, 'acción no válida');
    const lname = clean(b.name, 40);
    if (!lname || !name) return fail(400, 'falta el nombre de la liga o el tuyo');
    const meta = { name: lname, by: name, at: now };
    let created = null;
    for (let i = 0; i < 4 && !created; i++) {
      const c = newCode();
      if (await store.putNew(keyOf(c), '.', meta)) created = c;
    }
    if (!created) return fail(500, 'error del servidor');
    const doc = memberDoc(null, !!b.best);
    await store.put(keyOf(created), `m:${pid}`, doc);
    return { status: 200, body: publicLeague(created, meta, [doc]) };
  }

  if (!CODE.test(code)) return fail(400, 'código de liga no válido');
  if (!['join', 'post', 'leave'].includes(b.action)) return fail(400, 'acción no válida');
  let lg = await readLeague(store, code);
  if (!lg && b.action !== 'leave') {
    // A member bringing back a league the store lost: its name (and who made it) come from their device.
    const hint = b.league && typeof b.league === 'object' ? b.league : null;
    const lname = hint ? clean(hint.name, 40) : '';
    if (lname) {
      const meta = { name: lname, by: clean(hint.by, 24) || name || 'Alguien', at: int(hint.at, 1e14) || now };
      await store.putNew(keyOf(code), '.', meta);
      lg = await readLeague(store, code);
    }
  }
  if (!lg) return fail(404, 'esa liga no existe');
  const mine = lg.members.find((m) => m.id === pid);
  if (mine && mine.tokenHash !== hash(token)) return fail(403, 'ese sitio de la liga es de otra persona');
  if (b.action === 'leave') {
    if (mine) await store.drop(keyOf(code), `m:${pid}`);
    return { status: 200, body: publicLeague(code, lg.meta, lg.members.filter((m) => m !== mine)) };
  }
  if (!mine && lg.members.length >= MAX_MEMBERS) return fail(409, 'la liga está llena');
  if (!mine && !name) return fail(400, 'falta tu nombre');
  const doc = memberDoc(mine || null, b.action === 'post' || !!b.best);
  await store.put(keyOf(code), `m:${pid}`, doc);
  const docs = lg.members.filter((m) => m !== mine).concat([doc]);
  return { status: 200, body: publicLeague(code, lg.meta, docs) };
}

module.exports = { handle, average, cleanBest, CODE };
