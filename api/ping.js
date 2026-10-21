// Health check: tells the app whether challenges and sync are available, which store holds them and how often
// the app may sync on its own («every», in seconds). With ?deep=1 it also writes, reads and deletes a test
// record (that costs a write, so the app never asks for it).
const { kv, kindFor, EVERY, send, query } = require('./_lib');

module.exports = async (req, res) => {
  const kind = kindFor();
  if (!kind) return send(res, 200, { ok: true, store: false });
  const info = { ok: true, store: true, kind, every: EVERY[kind] };
  if (query(req, 'deep') !== '1') return send(res, 200, info);
  try {
    const stamp = Date.now();
    const store = kv();
    await store.set('ping/check', { stamp });
    const back = await store.get('ping/check');
    await store.del('ping/check');
    const roundtrip = !!back && back.stamp === stamp;
    return send(res, 200, { ...info, store: roundtrip, deep: true, roundtrip });
  } catch (e) {
    return send(res, 200, { ...info, store: false, deep: true, paused: !!e.paused, error: e.message });
  }
};
