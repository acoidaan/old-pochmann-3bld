// Sync between devices: one document per sync code, overwritten on every push. The key is a SHA-256 of the
// user's sync code; the code itself never reaches the server. Pure logic over a store (api/_kv.js), so the API
// route and the tests' server run the same code.
const KEY = /^[a-f0-9]{64}$/;
const MAX = 500000;
const fail = (status, error) => ({ status, body: { error } });

async function handle(kv, { method, k, body }) {
  if (!KEY.test(k || '')) return fail(400, 'código no válido');
  const key = `sync/${k}`;
  if (method === 'GET') {
    const doc = await kv.get(key);
    return { status: 200, body: { data: doc ? doc.data : null, at: doc ? doc.at : null } };
  }
  if (method === 'POST') {
    if (!body || typeof body.data !== 'object' || body.data === null || Array.isArray(body.data)) return fail(400, 'datos no válidos');
    if (JSON.stringify(body.data).length > MAX) return fail(413, 'demasiados datos');
    const at = Date.now();
    await kv.set(key, { data: body.data, at });
    return { status: 200, body: { ok: true, at } };
  }
  return fail(405, 'método no permitido');
}

module.exports = { handle, KEY };
