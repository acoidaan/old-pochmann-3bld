// Friends' leagues: GET ?code= (the league and each member's bests), POST (create), POST ?code= (join, post
// your bests, leave). The logic is in _liga.js; here, only the HTTP plumbing.
const { run, readBody, query } = require('./_lib');
const { handle } = require('./_liga');

module.exports = (req, res) => run(res, async (store) => {
  if (req.method !== 'GET' && req.method !== 'POST') res.setHeader('allow', 'GET, POST');
  const body = req.method === 'POST' ? await readBody(req, 60000) : null;
  return handle(store, { method: req.method, code: query(req, 'code'), body });
});
