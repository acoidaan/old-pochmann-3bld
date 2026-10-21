// Friends' leagues: GET ?code= (the league and each member's bests), POST (create), POST ?code= (join, post
// your bests, leave). The logic is in _liga.js; here, only the Blob store and the HTTP plumbing.
const { readJson, listAll, writeJson, send, readBody, query, del } = require('./_lib');
const { handle } = require('./_liga');

const store = { list: listAll, read: (url) => readJson(url), write: writeJson, del: (urls) => (urls.length ? del(urls) : null) };

module.exports = async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') res.setHeader('allow', 'GET, POST');
    const body = req.method === 'POST' ? await readBody(req, 60000) : null;
    const out = await handle(store, { method: req.method, code: query(req, 'code'), body });
    return send(res, out.status, out.body);
  } catch (e) {
    console.error(e);
    return send(res, e.status || 500, { error: e.status === 413 ? 'demasiados datos' : 'error del servidor' });
  }
};
