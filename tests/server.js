// Local server for the tests: the built site (public/) plus the API's real logic (api/_sync.js, _reto.js,
// _liga.js) over the in-memory store of api/_kv.js, the scramble generator's files and a few fixtures.
const http = require('http');
const fs = require('fs');
const path = require('path');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
const FIXTURES = path.join(__dirname, 'fixtures');
const FONT_DIRS = ['unbounded', 'atkinson-hyperlegible', 'martian-mono']
  .map((p) => path.join(__dirname, 'node_modules', '@fontsource', p, 'files'));
const API = path.join(__dirname, '..', 'api');
const { memoryKv } = require(path.join(API, '_kv.js'));
const sync = require(path.join(API, '_sync.js'));
const reto = require(path.join(API, '_reto.js'));
const liga = require(path.join(API, '_liga.js'));
const CUBEJS = [path.join(__dirname, 'node_modules', 'cubejs', 'lib'), path.join(__dirname, '..', 'node_modules', 'cubejs', 'lib')]
  .find((d) => fs.existsSync(path.join(d, 'cube.js')));

// root: folder to serve; cubejs: false makes /cubejs/* fail, as when the generator cannot load.
function start({ root, port, cubejs = true }) {
  const kv = memoryKv();
  // A sync interval the client may use on its own (seconds); the tests sync by hand.
  const every = 60;
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const file = (f, headers) => {
      if (!f || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', ...headers });
      fs.createReadStream(f).pipe(res);
    };
    let body = null;
    if (req.method === 'POST') {
      let b = '';
      for await (const c of req) b += c;
      body = JSON.parse(b || '{}');
    }
    const q = (n) => u.searchParams.get(n) || '';
    const answer = async (fn) => {
      try { const out = await fn(); return send(out.status, out.body); } catch (e) { return send(500, { error: e.message }); }
    };

    if (u.pathname === '/api/ping') return send(200, { ok: true, store: true, kind: kv.kind, every });
    if (u.pathname === '/api/reto') {
      return answer(async () => {
        const out = await reto.handle(kv, { method: req.method, id: q('id'), dev: q('dev'), body });
        // A new challenge comes with two results from friends, so the list has something to show.
        if (req.method === 'POST' && !q('id') && out.status === 200) {
          await kv.putNew(`reto/${out.body.id}`, 'd:x', { name: 'Carla', memo: 98000, exec: 61000, ok: true, at: 1, dev: 'x' });
          await kv.putNew(`reto/${out.body.id}`, 'd:y', { name: 'Dani', memo: 75000, exec: 70500, ok: false, at: 2, dev: 'y' });
        }
        return out;
      });
    }
    if (u.pathname === '/api/liga') return answer(() => liga.handle(kv, { method: req.method, code: q('code'), body }));
    if (u.pathname === '/api/sync') return answer(() => sync.handle(kv, { method: req.method, k: q('k'), body }));
    if (u.pathname.startsWith('/r/')) {
      res.writeHead(302, { location: `/?reto=${u.pathname.slice(3)}` });
      return res.end();
    }
    if (u.pathname.startsWith('/cubejs/')) return file(cubejs && CUBEJS ? path.join(CUBEJS, path.basename(u.pathname)) : null);
    if (u.pathname.startsWith('/fonts/')) {
      // Asked for from the other port too (env.js FONTS_CSS): a font from another origin needs CORS.
      const name = path.basename(u.pathname);
      return file(FONT_DIRS.map((d) => path.join(d, name)).find((f) => fs.existsSync(f)), { 'access-control-allow-origin': '*' });
    }
    if (u.pathname === '/wrap.html') return file(path.join(FIXTURES, 'wrap.html'));
    if (u.pathname === '/fridrich') return file(path.join(root, 'fridrich.html'));   // like the rewrite in vercel.json
    if (u.pathname === '/principiante') return file(path.join(root, 'principiante.html'));
    return file(path.join(root, u.pathname === '/' ? 'index.html' : decodeURIComponent(u.pathname)));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve(server));
  });
}

module.exports = { start };

// Also usable by hand: node server.js <folder> <port> [--no-cubejs]
if (require.main === module) {
  const [root = path.join(__dirname, '..', 'public'), port = '8793'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  start({ root, port: Number(port), cubejs: !process.argv.includes('--no-cubejs') })
    .then(() => console.log(`http://localhost:${port}`));
}
