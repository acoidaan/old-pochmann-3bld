// Sync between devices: GET ?k= (what is saved), POST ?k= (save). The logic is in _sync.js.
const { run, readBody, query } = require('./_lib');
const { handle } = require('./_sync');

module.exports = (req, res) => run(res, async (store) => {
  if (req.method !== 'GET' && req.method !== 'POST') res.setHeader('allow', 'GET, POST');
  const body = req.method === 'POST' ? await readBody(req, 600000) : null;
  return handle(store, { method: req.method, k: query(req, 'k'), body });
});
