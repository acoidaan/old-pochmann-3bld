// Sync between devices. The key is a SHA-256 of the user's sync code; the code itself never reaches the server.
const { readJson, listAll, writeJson, send, readBody, query, newest, del } = require('./_lib');

const KEY = /^[a-f0-9]{64}$/;

module.exports = async (req, res) => {
  try {
    const k = query(req, 'k');
    if (!KEY.test(k)) return send(res, 400, { error: 'código no válido' });
    const prefix = `sync/${k}/`;
    if (req.method === 'GET') {
      const latest = newest(await listAll(prefix))[0];
      if (!latest) return send(res, 200, { data: null });
      const doc = await readJson(latest.url);
      return send(res, 200, { data: doc ? doc.data : null, at: doc ? doc.at : null });
    }
    if (req.method === 'POST') {
      const b = await readBody(req, 600000);
      if (!b || typeof b.data !== 'object' || b.data === null) return send(res, 400, { error: 'datos no válidos' });
      if (JSON.stringify(b.data).length > 500000) return send(res, 413, { error: 'demasiados datos' });
      await writeJson(`${prefix}${Date.now()}.json`, { data: b.data, at: Date.now() });
      const old = newest(await listAll(prefix)).slice(3);
      if (old.length) await del(old.map((x) => x.url));
      return send(res, 200, { ok: true });
    }
    res.setHeader('allow', 'GET, POST');
    return send(res, 405, { error: 'método no permitido' });
  } catch (e) {
    console.error(e);
    return send(res, e.status || 500, { error: e.status === 413 ? 'demasiados datos' : 'error del servidor' });
  }
};
