// Challenges: GET ?id= (with results), POST (create), POST ?id= (add a result).
const crypto = require('crypto');
const { listAll, writeJson, send, readBody, query, readReto, RETO_ID: ID } = require('./_lib');
const MOVES = /^[RLUDFBMESrludfbxyzw2' ]{1,300}$/;
const KINDS = ['full', 'edges', 'corners'];
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const ms = (v) => (Number.isFinite(v) && v >= 0 && v < 36e5 ? Math.round(v) : null);
function newId() {
  const abc = 'abcdefghijkmnpqrstuvwxyz23456789';
  return [...crypto.randomBytes(8)].map((b) => abc[b % 32]).join('');
}

module.exports = async (req, res) => {
  try {
    const id = query(req, 'id');
    if (req.method === 'GET') {
      if (!ID.test(id)) return send(res, 400, { error: 'enlace de reto no válido' });
      const reto = await readReto(id);
      if (!reto) return send(res, 404, { error: 'ese reto no existe' });
      const { meta } = reto;
      const dev = query(req, 'dev');
      const results = reto.results.map((r) => ({ name: r.name, memo: r.memo, exec: r.exec, ok: !!r.ok, at: r.at, mine: !!dev && r.dev === dev }));
      return send(res, 200, { id, scramble: meta.scramble, kind: meta.kind, by: meta.by, at: meta.at, results });
    }
    if (req.method === 'POST') {
      const b = await readBody(req, 8000);
      if (!id) {
        const scramble = clean(b.scramble, 300);
        const by = clean(b.by, 24);
        const kind = KINDS.includes(b.kind) ? b.kind : 'full';
        if (!MOVES.test(scramble) || !by) return send(res, 400, { error: 'faltan datos del reto' });
        const created = newId();
        await writeJson(`retos/${created}/meta.json`, { scramble, by, kind, at: Date.now() });
        return send(res, 200, { id: created });
      }
      if (!ID.test(id)) return send(res, 400, { error: 'enlace de reto no válido' });
      const name = clean(b.name, 24);
      const dev = clean(b.dev, 40);
      const memo = ms(b.memo);
      const exec = ms(b.exec);
      if (!name || !dev || memo == null || exec == null) return send(res, 400, { error: 'resultado no válido' });
      const blobs = await listAll(`retos/${id}/`);
      if (!blobs.some((x) => x.pathname.startsWith(`retos/${id}/meta`))) return send(res, 404, { error: 'ese reto no existe' });
      if (blobs.length > 300) return send(res, 409, { error: 'el reto está lleno' });
      await writeJson(`retos/${id}/r/${Date.now()}.json`, { name, dev, memo, exec, ok: !!b.ok, at: Date.now() });
      return send(res, 200, { ok: true });
    }
    res.setHeader('allow', 'GET, POST');
    return send(res, 405, { error: 'método no permitido' });
  } catch (e) {
    console.error(e);
    return send(res, e.status || 500, { error: e.status === 413 ? 'demasiados datos' : 'error del servidor' });
  }
};
