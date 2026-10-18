// Shared helpers for the API routes. Data lives in a private Vercel Blob store.
const { put, list, get, del } = require('@vercel/blob');

const ACCESS = process.env.BLOB_ACCESS === 'public' ? 'public' : 'private';

async function readJson(url) {
  const r = await get(url, { access: ACCESS, useCache: false });
  if (!r || r.statusCode !== 200 || !r.stream) return null;
  return JSON.parse(await new Response(r.stream).text());
}

async function listAll(prefix) {
  const out = [];
  let cursor;
  do {
    const r = await list({ prefix, cursor, limit: 1000 });
    out.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

function writeJson(pathname, data) {
  return put(pathname, JSON.stringify(data), { access: ACCESS, addRandomSuffix: true, contentType: 'application/json' });
}

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

const newest = (blobs) => blobs.slice().sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

const RETO_ID = /^[a-z0-9]{8}$/;

// A challenge with its results, one per device (the first one sent), oldest first; null if it does not exist.
async function readReto(id) {
  const blobs = await listAll(`retos/${id}/`);
  const metaBlob = newest(blobs.filter((b) => b.pathname.startsWith(`retos/${id}/meta`)))[0];
  if (!metaBlob) return null;
  const meta = await readJson(metaBlob.url);
  const rows = await Promise.all(blobs
    .filter((b) => b.pathname.startsWith(`retos/${id}/r/`))
    .sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt))
    .slice(0, 150)
    .map((b) => readJson(b.url).catch(() => null)));
  const seen = new Set();
  const results = [];
  rows.filter(Boolean).sort((a, b) => a.at - b.at).forEach((r) => {
    if (seen.has(r.dev)) return;
    seen.add(r.dev);
    results.push(r);
  });
  return { meta, results, count: blobs.length };
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

module.exports = {
  readJson, listAll, writeJson, send, readBody, query, newest, del, readReto, RETO_ID, fmtTime, summarizeReto,
};
