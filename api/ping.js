// Health check: tells the app whether challenges and sync are available.
// With ?deep=1 it also writes, reads and deletes a test record in the store.
const { readJson, listAll, writeJson, send, del } = require('./_lib');

module.exports = async (req, res) => {
  const store = !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
  if (!store) return send(res, 200, { ok: true, store: false });
  if (new URL(req.url, 'http://localhost').searchParams.get('deep') !== '1') return send(res, 200, { ok: true, store: true });
  try {
    const stamp = Date.now();
    await writeJson('ping/check.json', { stamp });
    const blobs = await listAll('ping/');
    const docs = await Promise.all(blobs.map((b) => readJson(b.url).catch(() => null)));
    const roundtrip = docs.some((d) => d && d.stamp === stamp);
    if (blobs.length) await del(blobs.map((b) => b.url));
    return send(res, 200, { ok: true, store: roundtrip, deep: true, roundtrip });
  } catch (e) {
    return send(res, 200, { ok: true, store: false, deep: true, error: e.message });
  }
};
