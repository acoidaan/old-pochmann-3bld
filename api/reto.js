// Challenges: GET ?id= (with results), POST (create), POST ?id= (add a result). The logic is in _reto.js.
const { run, readBody, query } = require('./_lib');
const { handle } = require('./_reto');

module.exports = (req, res) => run(res, async (store) => {
  if (req.method !== 'GET' && req.method !== 'POST') res.setHeader('allow', 'GET, POST');
  const body = req.method === 'POST' ? await readBody(req, 8000) : null;
  return handle(store, { method: req.method, id: query(req, 'id'), dev: query(req, 'dev'), body });
});
