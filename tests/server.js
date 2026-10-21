// Local server for the tests: the built site (public/) plus an in-memory fake of the API with the same
// contract as api/*.js (retos, sync, ping, /r/<id>; the leagues run the real api/_liga.js), the scramble
// generator's files and a few fixtures.
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
// The leagues run the real logic (api/_liga.js) over an in-memory store shaped like Vercel Blob.
const { handle: ligaHandle } = require(path.join(__dirname, '..', 'api', '_liga.js'));
const CUBEJS = [path.join(__dirname, 'node_modules', 'cubejs', 'lib'), path.join(__dirname, '..', 'node_modules', 'cubejs', 'lib')]
  .find((d) => fs.existsSync(path.join(d, 'cube.js')));

// root: folder to serve; cubejs: false makes /cubejs/* fail, as when the generator cannot load.
function start({ root, port, cubejs = true }) {
  const blobs = new Map();
  let seq = 0;
  const files = new Map();   // pathname → { pathname, url, uploadedAt, data }
  let tick = 0;
  const ligaStore = {
    list: async (prefix) => [...files.values()].filter((f) => f.pathname.startsWith(prefix)),
    read: async (url) => { const f = [...files.values()].find((x) => x.url === url); return f ? JSON.parse(JSON.stringify(f.data)) : null; },
    write: async (pathname, data) => {
      const name = `${pathname.replace(/\.json$/, '')}-${(tick++).toString(36)}.json`;
      files.set(name, { pathname: name, url: `mem://${name}`, uploadedAt: new Date(1e12 + tick * 1000).toISOString(), data: JSON.parse(JSON.stringify(data)) });
    },
    del: async (urls) => { urls.forEach((u) => { for (const [k, f] of files) if (f.url === u) files.delete(k); }); },
  };
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const file = (f) => {
      if (!f || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('no'); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    };
    let body = null;
    if (req.method === 'POST') {
      let b = '';
      for await (const c of req) b += c;
      body = JSON.parse(b || '{}');
    }
    const list = (prefix) => [...blobs.entries()].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v);

    if (u.pathname === '/api/ping') return send(200, { ok: true, store: true });
    if (u.pathname === '/api/reto') {
      const id = u.searchParams.get('id');
      if (!body) {
        const meta = list(`retos/${id}/meta`)[0];
        if (!meta) return send(404, { error: 'ese reto no existe' });
        const seen = new Set();
        const results = list(`retos/${id}/r/`)
          .filter((r) => (seen.has(r.dev) ? false : seen.add(r.dev)))
          .map((r) => ({ ...r, mine: r.dev === u.searchParams.get('dev'), dev: undefined }));
        return send(200, { id, ...meta, results });
      }
      if (!id) {
        // A new challenge comes with two results from friends, so the list has something to show.
        const nid = `k3x9m2p${seq++ % 10}`;
        blobs.set(`retos/${nid}/meta`, { ...body, at: Date.now() });
        blobs.set(`retos/${nid}/r/a`, { name: 'Carla', memo: 98000, exec: 61000, ok: true, at: 1, dev: 'x' });
        blobs.set(`retos/${nid}/r/b`, { name: 'Dani', memo: 75000, exec: 70500, ok: false, at: 2, dev: 'y' });
        return send(200, { id: nid });
      }
      blobs.set(`retos/${id}/r/${seq++}`, { ...body, at: Date.now() });
      return send(200, { ok: true });
    }
    if (u.pathname === '/api/liga') {
      const out = await ligaHandle(ligaStore, { method: req.method, code: u.searchParams.get('code') || '', body });
      return send(out.status, out.body);
    }
    if (u.pathname === '/api/sync') {
      const k = `sync/${u.searchParams.get('k')}`;
      if (body) { blobs.set(k, body.data); return send(200, { ok: true }); }
      return send(200, { data: blobs.get(k) || null });
    }
    if (u.pathname.startsWith('/r/')) {
      res.writeHead(302, { location: `/?reto=${u.pathname.slice(3)}` });
      return res.end();
    }
    if (u.pathname.startsWith('/cubejs/')) return file(cubejs && CUBEJS ? path.join(CUBEJS, path.basename(u.pathname)) : null);
    if (u.pathname.startsWith('/fonts/')) {
      const name = path.basename(u.pathname);
      return file(FONT_DIRS.map((d) => path.join(d, name)).find((f) => fs.existsSync(f)));
    }
    if (u.pathname === '/wrap.html') return file(path.join(FIXTURES, 'wrap.html'));
    if (u.pathname === '/fridrich') return file(path.join(root, 'fridrich.html'));   // like the rewrite in vercel.json
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
