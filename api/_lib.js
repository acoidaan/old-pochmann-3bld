// Shared helpers for the API routes. The data lives behind api/_kv.js (Redis, Vercel Blob or memory).
const { kv, kindFor, EVERY } = require('./_kv');

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(obj));
}

async function readBody(req, limit) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body);
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw Object.assign(new Error('too large'), { status: 413 });
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

function query(req, name) {
  if (req.query && req.query[name] != null) return String(req.query[name]);
  return new URL(req.url, 'http://localhost').searchParams.get(name) || '';
}

const RETO_ID = /^[a-z0-9]{8}$/;

// The error a route answers with: the store being paused says so; anything else stays vague.
function sendError(res, e) {
  if (!(e && (e.paused || e.status || e instanceof SyntaxError))) console.error(e);
  if (e && e.paused) return send(res, 503, { error: 'el almacenamiento de la app está en pausa', paused: true });
  if (e && e.status === 413) return send(res, 413, { error: 'demasiados datos' });
  if (e && e.status === 409) return send(res, 409, { error: e.message });
  if (e instanceof SyntaxError) return send(res, 400, { error: 'datos no válidos' });
  return send(res, 500, { error: 'error del servidor' });
}
// A pure handler's answer ({ status, body }) to the response; with no store, 503.
async function run(res, fn) {
  try {
    const store = kv();
    if (!store) return send(res, 503, { error: 'la app no tiene almacenamiento' });
    const out = await fn(store);
    return send(res, out.status, out.body);
  } catch (e) { return sendError(res, e); }
}

const KIND_TEXT = { full: 'completo', edges: 'solo aristas', corners: 'solo esquinas' };

// 3:12.40, like the app.
function fmtTime(ms) {
  const cs = Math.floor(ms / 10);
  return `${Math.floor(cs / 6000)}:${String(Math.floor((cs % 6000) / 100)).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

// What a link preview says about a challenge.
function summarizeReto(reto) {
  const { meta, results } = reto;
  const solved = results.filter((r) => r.ok && Number.isFinite(r.memo) && Number.isFinite(r.exec));
  let best = null;
  solved.forEach((r) => {
    const t = r.memo + r.exec;
    if (!best || t < best.t) best = { t, name: r.name };
  });
  return {
    by: meta.by || 'Alguien',
    kind: KIND_TEXT[meta.kind] || KIND_TEXT.full,
    scramble: meta.scramble || '',
    n: results.length,
    ok: solved.length,
    best,
  };
}

module.exports = { kv, kindFor, EVERY, send, sendError, run, readBody, query, RETO_ID, fmtTime, summarizeReto };
