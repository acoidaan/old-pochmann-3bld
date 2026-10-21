// 3BLD challenges: a scramble to share, and everyone's result. One map per challenge (api/_kv.js): «.» is the
// challenge, «d:<device>» each device's result (the first one it sends). Pure logic over the store, so the API
// route and the tests' server run the same code.
const crypto = require('crypto');

const ID = /^[a-z0-9]{8}$/;
const MOVES = /^[RLUDFBMESrludfbxyzw2' ]{1,300}$/;
const KINDS = ['full', 'edges', 'corners'];
const MAX = 150;
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const ms = (v) => (Number.isFinite(v) && v >= 0 && v < 36e5 ? Math.round(v) : null);
const fail = (status, error) => ({ status, body: { error } });
function newId() {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  return [...crypto.randomBytes(8)].map((b) => abc[b % 32]).join('');
}
const keyOf = (id) => `reto/${id}`;

// The challenge and its results, oldest first; null if it does not exist.
async function readReto(kv, id) {
  if (!ID.test(id || '')) return null;
  const m = await kv.all(keyOf(id));
  const meta = m['.'];
  if (!meta) return null;
  const results = Object.keys(m).filter((f) => f.startsWith('d:')).map((f) => m[f])
    .filter((r) => r && typeof r === 'object').sort((a, b) => a.at - b.at).slice(0, MAX);
  return { meta, results, count: results.length };
}

async function handle(kv, { method, id, dev, body }) {
  if (method === 'GET') {
    if (!ID.test(id || '')) return fail(400, 'enlace de reto no válido');
    const reto = await readReto(kv, id);
    if (!reto) return fail(404, 'ese reto no existe');
    const { meta } = reto;
    const results = reto.results.map((r) => ({ name: r.name, memo: r.memo, exec: r.exec, ok: !!r.ok, at: r.at, mine: !!dev && r.dev === dev }));
    return { status: 200, body: { id, scramble: meta.scramble, kind: meta.kind, by: meta.by, at: meta.at, results } };
  }
  if (method !== 'POST') return fail(405, 'método no permitido');
  const b = body && typeof body === 'object' ? body : {};
  if (!id) {
    const scramble = clean(b.scramble, 300);
    const by = clean(b.by, 24);
    const kind = KINDS.includes(b.kind) ? b.kind : 'full';
    if (!MOVES.test(scramble) || !by) return fail(400, 'faltan datos del reto');
    for (let i = 0; i < 4; i++) {
      const created = newId();
      if (await kv.putNew(keyOf(created), '.', { scramble, by, kind, at: Date.now() })) return { status: 200, body: { id: created } };
    }
    return fail(500, 'error del servidor');
  }
  if (!ID.test(id)) return fail(400, 'enlace de reto no válido');
  const name = clean(b.name, 24);
  const device = clean(b.dev, 40);
  const memo = ms(b.memo);
  const exec = ms(b.exec);
  if (!name || !device || memo == null || exec == null) return fail(400, 'resultado no válido');
  const reto = await readReto(kv, id);
  if (!reto) return fail(404, 'ese reto no existe');
  if (reto.count >= MAX && !reto.results.some((r) => r.dev === device)) return fail(409, 'el reto está lleno');
  await kv.putNew(keyOf(id), `d:${device}`, { name, dev: device, memo, exec, ok: !!b.ok, at: Date.now() });
  return { status: 200, body: { ok: true } };
}

module.exports = { handle, readReto, ID };
