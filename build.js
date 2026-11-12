// Builds the static site into public/: copies the files with versioned URLs and draws the app icons.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const crypto = require('crypto');

const out = path.join(__dirname, 'public');
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'manifest.webmanifest'), path.join(out, 'manifest.webmanifest'));
// The stream overlay is a self-contained page that OBS loads as a browser source.
fs.copyFileSync(path.join(__dirname, 'overlay.html'), path.join(out, 'overlay.html'));
// Third-party code with the version in its name (the smart cube library), loaded only when needed.
fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });
for (const f of fs.readdirSync(path.join(__dirname, 'vendor')).filter((x) => !x.endsWith('.md'))) {
  fs.copyFileSync(path.join(__dirname, 'vendor', f), path.join(out, 'vendor', f));
}

// Static files get a content hash in their URL, so browsers and the service worker never keep stale copies.
const ASSETS = ['audio/eight.mp3', 'audio/twelve.mp3', 'app.css', 'cubemodel.js', 'follow.js', 'core.js', 'learn.js', 'syncplan.js', 'social.js', 'stream.js', 'cube.js', 'fridrich.css', 'cfop.js', 'cfopf2l.js', 'cfopfull.js', 'cfopstats.js', 'smartcube.js', 'practice.js', 'fridrich-progreso.js', 'fridrich-cruz.js', 'fridrich-sync.js', 'fridrich.js', 'lbl.js', 'principiante.css', 'principiante.js', 'cubefab.js', 'bldprogress.js', 'bldalgs.js', 'awake.js'];
const versions = {};
const all = crypto.createHash('sha1');
for (const f of ASSETS) {
  const data = fs.readFileSync(path.join(__dirname, f));
  versions[f] = crypto.createHash('sha1').update(data).digest('hex').slice(0, 10);
  all.update(data);
  fs.mkdirSync(path.dirname(path.join(out, f)), { recursive: true });
  fs.writeFileSync(path.join(out, f), data);
}
// The pages: the 3BLD app, «Fridrich reducido» (/fridrich) and the beginner's method (/principiante).
const PAGES = ['index.html', 'fridrich.html', 'principiante.html'];
const pages = {};
for (const page of PAGES) {
  let html = fs.readFileSync(path.join(__dirname, page), 'utf8');
  for (const f of ASSETS) {
    html = html.replace(new RegExp(`(href|src)=(["']?)${f.replace('.', '\\.')}\\2`, 'g'), `$1=$2${f}?v=${versions[f]}$2`);
  }
  pages[page] = html;
  all.update(html);
}
// Full CFOP (/cfop): the Fridrich page in its full mode (data-cfop="full": the 57 OLL and 21 PLL instead of
// 2-look), with its own name. Each replacement has to find its text, or the page would keep the other name.
const FULL_CFOP = [
  ['<html lang="es">', '<html lang="es" data-cfop="full">'],
  [/<meta name="description" content="[^"]*">/, '<meta name="description" content="CFOP completo, con los 57 OLL y los 21 PLL de J Perm: cronómetro con tiempos por fase, casos reconocidos por el cubo inteligente y entrenador.">'],
  ['<meta property="og:title" content="Fridrich reducido">', '<meta property="og:title" content="CFOP completo">'],
  [/<meta property="og:description" content="[^"]*">/, '<meta property="og:description" content="CFOP con los 57 OLL y los 21 PLL de J Perm: casos, entrenador y cronómetro.">'],
  ['vercel.app/fridrich"', 'vercel.app/cfop"'],
  ['href="fridrich.webmanifest"', 'href="cfop.webmanifest"'],
  ['content="Fridrich">', 'content="CFOP">'],
  ['<title>Fridrich reducido</title>', '<title>CFOP completo</title>'],
  ['<h1>Fridrich reducido</h1>', '<h1>CFOP completo</h1>'],
  ['<p>CFOP en 2 pasos · algoritmos de J Perm</p>', '<p>57 OLL y 21 PLL · algoritmos de J Perm</p>'],
];
pages['cfop.html'] = FULL_CFOP.reduce((html, [from, to]) => {
  if (typeof from === 'string' ? !html.includes(from) : !from.test(html)) throw new Error(`cfop.html: no encuentro ${from}`);
  return html.replace(from, to);
}, pages['fridrich.html']);
all.update(pages['cfop.html']);
const build = all.digest('hex').slice(0, 10);
// Each page knows its build, so it can tell when a newer one has replaced it.
for (const page of Object.keys(pages)) fs.writeFileSync(path.join(out, page), pages[page].replace('__BUILD__', build));
for (const m of ['fridrich.webmanifest', 'cfop.webmanifest', 'principiante.webmanifest']) fs.copyFileSync(path.join(__dirname, m), path.join(out, m));
const sw = fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8')
  .replace('__BUILD__', build)
  .replace('__ASSETS__', ASSETS.map((f) => `'${f}?v=${versions[f]}'`).join(', '));
// One left over (written twice, say in a comment) would leave the service worker broken.
if (/__(BUILD|ASSETS)__/.test(sw)) throw new Error('sw.js: __BUILD__ y __ASSETS__ deben salir una sola vez');
fs.writeFileSync(path.join(out, 'sw.js'), sw);

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const BG = rgb('#0E1116');
const STICKERS = ['#F5F6F1', '#D7263D', '#1E9E4B', '#F07A16', '#AE2259', '#1F5BCB', '#F4D30C', '#1E9E4B', '#F5F6F1'].map(rgb);

// A 3x3 face of stickers inside the maskable safe zone, 4 samples per pixel.
function colourAt(size, x, y) {
  const area = size * 0.62;
  const gap = area * 0.045;
  const cell = (area - 2 * gap) / 3;
  const o = (size - area) / 2;
  const r = cell * 0.16;
  const cx = Math.floor((x - o) / (cell + gap));
  const cy = Math.floor((y - o) / (cell + gap));
  if (cx < 0 || cx > 2 || cy < 0 || cy > 2) return BG;
  const lx = x - o - cx * (cell + gap);
  const ly = y - o - cy * (cell + gap);
  if (lx > cell || ly > cell) return BG;
  const dx = Math.max(r - lx, lx - (cell - r), 0);
  const dy = Math.max(r - ly, ly - (cell - r), 0);
  return dx * dx + dy * dy <= r * r ? STICKERS[cy * 3 + cx] : BG;
}

function icon(size) {
  const row = size * 3 + 1;
  const raw = Buffer.alloc(size * row);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (const [sx, sy] of [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]) {
        const c = colourAt(size, x + sx, y + sy);
        for (let k = 0; k < 3; k++) acc[k] += c[k];
      }
      for (let k = 0; k < 3; k++) raw[y * row + 1 + x * 3 + k] = Math.round(acc[k] / 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) fs.writeFileSync(path.join(out, `icon-${size}.png`), icon(size));
console.log('public/ ready');
