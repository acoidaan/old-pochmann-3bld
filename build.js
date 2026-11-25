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
const ASSETS = ['audio/eight.mp3', 'audio/twelve.mp3', 'app.css', 'sections.js', 'cubemodel.js', 'notation.js', 'follow.js', 'core.js', 'learn.js', 'm2.js', 'syncplan.js', 'social.js', 'stream.js', 'cube.js', 'fridrich.css', 'cfop.js', 'cfopf2l.js', 'cfopfull.js', 'cfopstats.js', 'smartcube.js', 'practice.js', 'fridrich-progreso.js', 'fridrich-cruz.js', 'fridrich-sync.js', 'fridrich.js', 'lbl.js', 'principiante.css', 'principiante.js', 'cubefab.js', 'bldprogress.js', 'bldalgs.js', 'awake.js',
  'evicons.js', 'evdata.js', 'evsync.js', 'eventos.css', 'eventos.js', 'plan.js', 'pz-cube.js', 'pz-pyra.js', 'pz-sq1.js', 'ev-222.js', 'ev-444.js', 'ev-pyram.js', 'ev-sq1.js'];
const versions = {};
const all = crypto.createHash('sha1');
for (const f of ASSETS) {
  const data = fs.readFileSync(path.join(__dirname, f));
  versions[f] = crypto.createHash('sha1').update(data).digest('hex').slice(0, 10);
  all.update(data);
  fs.mkdirSync(path.dirname(path.join(out, f)), { recursive: true });
  fs.writeFileSync(path.join(out, f), data);
}
// The pages: the 3BLD app, «Fridrich reducido» (/fridrich), the beginner's method (/principiante), the WCA plan
// (/plan) and an event page for each new event, all from evento.html (/2x2, /4x4, /pyraminx, /square-1).
const PAGES = ['index.html', 'fridrich.html', 'principiante.html', 'plan.html'];
const EVENT_PAGES = [
  { file: '2x2.html', ev: '222', name: '2×2', title: '2×2 · Ortega', method: 'Ortega: cara, OLL y PBL', methodName: 'Ortega', phase: '1 · dic 2026', scripts: ['pz-cube.js', 'ev-222.js'],
    desc: 'El 2×2 con el método Ortega: la cara, los 7 casos de OLL y los 5 de PBL con sus dibujos, cronómetro con inspección y rondas de 5 como en la WCA, y entrenador de casos.' },
  { file: '4x4.html', ev: '444', name: '4×4', title: '4×4 · Yau', method: 'Yau: centros, cruz, 3-2-3 y paridades', methodName: 'El Yau', phase: '2 · ene 2027', scripts: ['pz-cube.js', 'ev-444.js'],
    desc: 'El 4×4 con Yau: dos centros, la cruz, los otros centros, las aristas con 3-2-3, el 3×3 y las dos paridades, con cronómetro con inspección y rondas de 5 como en la WCA.' },
  { file: 'pyraminx.html', ev: 'pyram', name: 'Pyraminx', title: 'Pyraminx · Principiante y L4E', method: 'Principiante y después L4E', methodName: 'El método principiante', phase: '3 · feb 2027', scripts: ['pz-pyra.js', 'ev-pyram.js'],
    desc: 'El Pyraminx capa a capa y después L4E (sus 35 casos): dibujos, mezclas de estado aleatorio como las de la WCA, cronómetro con inspección y rondas de 5.' },
  { file: 'square-1.html', ev: 'sq1', name: 'Square-1', title: 'Square-1 · Vandenbergh', method: 'Forma, capas y permutación (Vandenbergh)', methodName: 'Vandenbergh', phase: '4 · mar/abr 2027', scripts: ['pz-sq1.js', 'ev-sq1.js'],
    desc: 'El Square-1 con Vandenbergh para principiantes: forma de cubo, capas, permutación y paridad, con dibujos de cada caso, cronómetro con inspección y rondas de 5.' },
];
const tpl = fs.readFileSync(path.join(__dirname, 'evento.html'), 'utf8');
const sources = {};
for (const page of PAGES) sources[page] = fs.readFileSync(path.join(__dirname, page), 'utf8');
for (const e of EVENT_PAGES) {
  const href = e.file.replace(/\.html$/, '');
  const tokens = {
    __SX__: e.ev, __EV__: e.ev, __PRACTICE__: `ev${e.ev}`, __HREF__: href, __NAME__: e.name, __METHOD__: e.method, __METHOD_NAME__: e.methodName,
    __TITLE__: e.title, __DESC__: e.desc,
    __PHASE__: `<span class="ev-phase-n">${e.phase}</span><span>Tu plan</span>`,
  };
  let html = tpl;
  for (const [k, v] of Object.entries(tokens)) html = html.split(k).join(v);
  html = html.replace('<!--ev-scripts-->', e.scripts.map((f) => `<script src="${f}"></script>`).join('\n'));
  if (/__[A-Z_]+__/.test(html.replace('__BUILD__', ''))) throw new Error(`${e.file}: queda algún __X__ sin poner`);
  sources[e.file] = html;
  // Its own manifest, so that installed it opens on its own page.
  fs.writeFileSync(path.join(out, `${href}.webmanifest`), JSON.stringify({
    name: e.title, short_name: e.name, description: e.desc, lang: 'es', start_url: `./${href}`, scope: './',
    display: 'standalone', background_color: '#0F1319', theme_color: '#0F1319',
    icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
  }, null, 2));
}
fs.writeFileSync(path.join(out, 'plan.webmanifest'), JSON.stringify({
  name: 'Mi plan WCA 2027', short_name: 'Mi plan', description: 'De CFOP a seis modalidades oficiales: fases, metas, rutina y preparación para competir.', lang: 'es', start_url: './plan', scope: './',
  display: 'standalone', background_color: '#0F1319', theme_color: '#0F1319',
  icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
}, null, 2));
// The sections menu, the same in every page (evicons.js): each page leaves <!--sx--> where its items go.
const MENU = require('./evicons.js').menuItems();
const pages = {};
for (const page of Object.keys(sources)) {
  let html = sources[page];
  if (!html.includes('<!--sx-->')) throw new Error(`${page}: falta <!--sx--> en el menú de secciones`);
  html = html.split('<!--sx-->').join(MENU);
  for (const f of ASSETS) {
    html = html.replace(new RegExp(`(href|src)=(["']?)${f.replace('.', '\\.')}\\2`, 'g'), `$1=$2${f}?v=${versions[f]}$2`);
  }
  pages[page] = html;
  all.update(html);
}
// Full CFOP (/cfop): the Fridrich page in its full mode (data-cfop="full": the 57 OLL and 21 PLL instead of
// 2-look), with its own name. Each replacement has to find its text, or the page would keep the other name.
const FULL_CFOP = [
  ['<html lang="es" data-section="cfop">', '<html lang="es" data-section="cfop" data-cfop="full">'],
  [/<meta name="description" content="[^"]*">/, '<meta name="description" content="CFOP completo, con los 57 OLL y los 21 PLL de J Perm: cronómetro con tiempos por fase, casos reconocidos por el cubo inteligente y entrenador.">'],
  ['<meta property="og:title" content="CFOP · 2 looks">', '<meta property="og:title" content="CFOP completo">'],
  [/<meta property="og:description" content="[^"]*">/, '<meta property="og:description" content="CFOP con los 57 OLL y los 21 PLL de J Perm: casos, entrenador y cronómetro.">'],
  ['vercel.app/fridrich"', 'vercel.app/cfop"'],
  ['href="fridrich.webmanifest"', 'href="cfop.webmanifest"'],
  ['content="Fridrich">', 'content="CFOP">'],
  ['<title>CFOP · 2 looks</title>', '<title>CFOP completo</title>'],
  ['<p>Última capa en 2 looks · algoritmos de J Perm</p>', '<p>Última capa completa: 57 OLL y 21 PLL · algoritmos de J Perm</p>'],
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
