// Where the API keeps its data, behind one small interface: documents, and maps of documents (a league's
// members, a challenge's results), each read or written in one go. Never a listing, which is what used up
// Vercel Blob's free tier: every page load listed files, and every sync listed them twice.
//
//   get(key) → object | null        set(key, obj)        add(key, obj) → true | false (only if not there)
//   del(key)
//   all(key) → { field: object }    put(key, field, obj) putNew(key, field, obj) → true | false    drop(key, field)
//
// Three backends, picked by what the project has:
//   - Redis through Upstash's REST API (KV_REST_API_URL + KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_*), as the
//     Vercel Marketplace sets them. Every call is one command; maps are hashes, so friends writing at the same
//     time never step on each other.
//   - Vercel Blob (BLOB_READ_WRITE_TOKEN): one file per key, overwritten in place and read by its name. A
//     write is one «advanced operation» (2,000 a month on the free tier), a read one «simple» (10,000). Maps
//     are one file, changed with a conditional write (ETag) that is retried if someone else got there first.
//   - Memory, for the tests and when running by hand.

class StorePaused extends Error {
  constructor() { super('el almacenamiento de la app está en pausa'); this.status = 503; this.paused = true; }
}

const json = (v) => JSON.stringify(v);
const parse = (s) => {
  if (s == null) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
};
const copy = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));

// ---------------- Redis (Upstash REST) ----------------
function redisKv({ url, token, fetch: f = globalThis.fetch, prefix = 'op3:' }) {
  const base = String(url).replace(/\/+$/, '');
  async function cmd(...args) {
    const r = await f(base, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(args),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) {
      const e = new Error(`redis: ${j.error || r.status}`);
      // Over the plan's limits Upstash answers with an error that says so.
      if (/limit|quota|exceeded/i.test(j.error || '')) throw new StorePaused();
      throw e;
    }
    return j.result;
  }
  const k = (key) => prefix + key;
  return {
    kind: 'redis',
    async get(key) { return parse(await cmd('GET', k(key))); },
    async set(key, v) { await cmd('SET', k(key), json(v)); },
    async add(key, v) { return (await cmd('SET', k(key), json(v), 'NX')) === 'OK'; },
    async del(key) { await cmd('DEL', k(key)); },
    async all(key) {
      const flat = (await cmd('HGETALL', k(key))) || [];
      const out = {};
      for (let i = 0; i + 1 < flat.length; i += 2) { const v = parse(flat[i + 1]); if (v != null) out[flat[i]] = v; }
      return out;
    },
    async put(key, field, v) { await cmd('HSET', k(key), field, json(v)); },
    async putNew(key, field, v) { return Number(await cmd('HSETNX', k(key), field, json(v))) === 1; },
    async drop(key, field) { await cmd('HDEL', k(key), field); },
  };
}

// ---------------- Vercel Blob ----------------
// sdk = { put, get, del } from @vercel/blob (or a fake in the tests).
function blobKv({ sdk, access = 'private', prefix = 'v2/' }) {
  const path = (key) => `${prefix}${key}.json`;
  const exists = (e) => /already exists/i.test((e && e.message) || '');
  const conflict = (e) => (e && (e.name === 'BlobPreconditionFailedError' || /precondition/i.test(e.message || ''))) || exists(e);
  const paused = (e) => e && (e.name === 'BlobStoreSuspendedError' || /suspended/i.test(e.message || ''));
  const guard = async (fn) => {
    try { return await fn(); } catch (e) { if (paused(e)) throw new StorePaused(); throw e; }
  };
  async function read(key) {
    const r = await guard(() => sdk.get(path(key), { access, useCache: false }));
    if (!r || r.statusCode !== 200 || !r.stream) return null;
    const value = parse(await new Response(r.stream).text());
    return { value, etag: (r.blob && r.blob.etag) || null };
  }
  const opts = (extra) => ({ access, addRandomSuffix: false, contentType: 'application/json', cacheControlMaxAge: 60, ...extra });
  const write = (key, v, extra) => guard(() => sdk.put(path(key), json(v), opts(extra)));
  // Read, change, write back only if nobody wrote in between; a few tries.
  async function change(key, fn) {
    for (let i = 0; i < 5; i++) {
      const cur = await read(key);
      const map = cur && cur.value && typeof cur.value === 'object' ? cur.value : {};
      const res = fn(map);
      if (res === false) return false;
      try {
        if (cur && cur.etag) await write(key, map, { allowOverwrite: true, ifMatch: cur.etag });
        else if (cur) await write(key, map, { allowOverwrite: true });
        else await write(key, map, { allowOverwrite: false });
        return true;
      } catch (e) {
        if (!conflict(e)) throw e;
        await new Promise((ok) => setTimeout(ok, 40 + Math.random() * 160));
      }
    }
    throw Object.assign(new Error('demasiada gente escribiendo a la vez'), { status: 409 });
  }
  return {
    kind: 'blob',
    async get(key) { const r = await read(key); return r ? r.value : null; },
    async set(key, v) { await write(key, v, { allowOverwrite: true }); },
    async add(key, v) {
      try { await write(key, v, { allowOverwrite: false }); return true; } catch (e) { if (exists(e)) return false; throw e; }
    },
    async del(key) { await guard(() => sdk.del(path(key))); },
    async all(key) { const r = await read(key); return r && r.value && typeof r.value === 'object' ? r.value : {}; },
    async put(key, field, v) { await change(key, (m) => { m[field] = v; }); },
    async putNew(key, field, v) { return change(key, (m) => { if (field in m) return false; m[field] = v; return true; }); },
    async drop(key, field) { await change(key, (m) => { if (!(field in m)) return false; delete m[field]; return true; }); },
  };
}

// ---------------- Memory ----------------
function memoryKv() {
  const docs = new Map();
  const maps = new Map();
  return {
    kind: 'memory',
    docs, maps,
    async get(key) { return copy(docs.has(key) ? docs.get(key) : null); },
    async set(key, v) { docs.set(key, copy(v)); },
    async add(key, v) { if (docs.has(key)) return false; docs.set(key, copy(v)); return true; },
    async del(key) { docs.delete(key); },
    async all(key) { return copy(Object.fromEntries(maps.get(key) || [])); },
    async put(key, field, v) { if (!maps.has(key)) maps.set(key, new Map()); maps.get(key).set(field, copy(v)); },
    async putNew(key, field, v) {
      if (!maps.has(key)) maps.set(key, new Map());
      if (maps.get(key).has(field)) return false;
      maps.get(key).set(field, copy(v));
      return true;
    },
    async drop(key, field) { if (maps.has(key)) maps.get(key).delete(field); },
  };
}

// ---------------- The one the API uses ----------------
function redisEnv(env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}
function kindFor(env = process.env) {
  if (env.STORE === 'memory') return 'memory';
  if (redisEnv(env) && env.STORE !== 'blob') return 'redis';
  if (env.BLOB_READ_WRITE_TOKEN || env.BLOB_STORE_ID) return 'blob';
  return null;
}
let cached = null;
function kv(env = process.env) {
  if (cached) return cached;
  const kind = kindFor(env);
  if (kind === 'redis') cached = redisKv(redisEnv(env));
  else if (kind === 'blob') {
    // eslint-disable-next-line global-require
    const { put, get, del } = require('@vercel/blob');
    cached = blobKv({ sdk: { put, get, del }, access: env.BLOB_ACCESS === 'public' ? 'public' : 'private' });
  } else if (kind === 'memory') cached = memoryKv();
  return cached;
}
// How often the app may sync on its own: often with Redis, rarely with Blob's free tier.
const EVERY = { redis: 60, blob: 600, memory: 60 };

module.exports = { kv, kindFor, EVERY, redisKv, blobKv, memoryKv, StorePaused };
