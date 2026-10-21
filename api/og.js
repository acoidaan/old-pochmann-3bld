// Link preview image (1200x630) for Discord and other sites: the app's card, or ?reto=<id> for a
// challenge, with who sent it, the best time so far and the scrambled cube.
const Cube = require('cubejs');
const { kv, query, send, RETO_ID, fmtTime, summarizeReto } = require('./_lib');
const { readReto } = require('./_reto');

const W = 1200;
const H = 630;
const C = {
  bg: '#0F1319', top: '#141A23', panel: '#171C25', line: '#2B3341',
  ink: '#E6EAF0', muted: '#98A3B5', accent: '#F0699C', onAccent: '#1B0811', ok: '#4CC774', plastic: '#05070A',
};
const STICKER = { U: '#E9EBE5', R: '#D7263D', F: '#1E9E4B', D: '#F0CF0C', L: '#EE7A1A', B: '#2563D6' };
const LOGO = ['#F5F6F1', '#D7263D', '#1E9E4B', '#F07A16', '#F0699C', '#2563D6', '#F0CF0C', '#1E9E4B', '#F5F6F1'];
const HOME_SCRAMBLE = "D2 F2 U' B2 R2 U2 F2 D' L2 U' R' D2 B' U F' L' D2 F L2 B'";
const DISPLAY = 'Unbounded';
const BODY = 'Atkinson Hyperlegible';
const MONO = 'Martian Mono';

// Fonts come from the npm CDN once per instance; if one fails, the image still renders with the rest.
const FONT_CDN = 'https://cdn.jsdelivr.net/npm/@fontsource';
const FONT_FILES = [
  [DISPLAY, 700, 'unbounded@5.3.0/files/unbounded-latin-700-normal.woff'],
  [BODY, 400, 'atkinson-hyperlegible@5.3.0/files/atkinson-hyperlegible-latin-400-normal.woff'],
  [BODY, 700, 'atkinson-hyperlegible@5.3.0/files/atkinson-hyperlegible-latin-700-normal.woff'],
  [MONO, 400, 'martian-mono@5.3.0/files/martian-mono-latin-400-normal.woff'],
];
let fontsPromise = null;
function loadFonts() {
  if (!fontsPromise) {
    fontsPromise = Promise.all(FONT_FILES.map(async ([name, weight, file]) => {
      try {
        const r = await fetch(`${FONT_CDN}/${file}`, { signal: AbortSignal.timeout(4000) });
        if (!r.ok) return null;
        return { name, weight, style: 'normal', data: await r.arrayBuffer() };
      } catch (e) {
        return null;
      }
    })).then((list) => {
      const fonts = list.filter(Boolean);
      if (fonts.length < FONT_FILES.length) fontsPromise = null;  // try again next time
      return fonts;
    });
  }
  return fontsPromise;
}

// Elements for satori: h(type, style, ...children).
function h(type, style, ...children) {
  const kids = children.flat().filter((c) => c != null && c !== false && c !== '');
  // satori rejects an empty children array on a non-flex box, so leaf boxes get none at all.
  const props = { style };
  if (kids.length) props.children = kids.length === 1 ? kids[0] : kids;
  return { type, props };
}
const row = (style, ...kids) => h('div', { display: 'flex', ...style }, ...kids);
const col = (style, ...kids) => h('div', { display: 'flex', flexDirection: 'column', ...style }, ...kids);

// 54 sticker colours in URFDLB order, or null if the scramble cannot be read.
function facelets(scramble) {
  try {
    const cube = new Cube();
    if (scramble) cube.move(scramble);
    return cube.asString();
  } catch (e) {
    return null;
  }
}

function net(stickers, cell) {
  const gap = Math.round(cell * 0.13);
  const pad = Math.round(cell * 0.17);
  const faceSize = 3 * cell + 2 * gap + 2 * pad + 2;  // + the 1px border on each side
  const between = Math.round(cell * 0.2);
  const order = 'URFDLB';
  const face = (f) => {
    const base = order.indexOf(f) * 9;
    return h('div', {
      display: 'flex', flexWrap: 'wrap', width: faceSize, height: faceSize, padding: pad, gap,
      background: C.plastic, borderRadius: Math.round(cell * 0.28), border: `1px solid ${C.line}`,
    }, ...Array.from({ length: 9 }, (_, k) => h('div', {
      width: cell, height: cell, borderRadius: Math.round(cell * 0.14), background: STICKER[stickers[base + k]],
    })));
  };
  const spacer = () => h('div', { width: faceSize, height: faceSize });
  return col({ gap: between },
    row({ gap: between }, spacer(), face('U')),
    row({ gap: between }, face('L'), face('F'), face('R'), face('B')),
    row({ gap: between }, spacer(), face('D')));
}

function brand() {
  return row({ alignItems: 'center', gap: 18 },
    h('div', {
      display: 'flex', flexWrap: 'wrap', width: 76, height: 76, padding: 7, gap: 4, background: C.plastic, borderRadius: 14,
    }, ...LOGO.map((c) => h('div', { width: 17.3, height: 17.3, borderRadius: 4, background: c }))),
    h('div', { fontFamily: DISPLAY, fontWeight: 700, fontSize: 26, color: C.ink, letterSpacing: 1 }, 'OLD POCHMANN 3BLD'));
}

function frame(left, stickers) {
  return row({
    width: W, height: H, padding: '56px 64px', justifyContent: 'space-between', alignItems: 'center',
    backgroundImage: `linear-gradient(180deg, ${C.top}, ${C.bg})`, color: C.ink, fontFamily: BODY,
  },
  col({ width: 620, height: '100%', justifyContent: 'space-between' }, ...left),
  stickers ? net(stickers, 26) : null);
}

function homeImage() {
  return frame([
    brand(),
    col({ gap: 18 },
      h('div', { fontFamily: DISPLAY, fontWeight: 700, fontSize: 64, lineHeight: 1.05 }, 'Aprende 3BLD'),
      h('div', { fontFamily: DISPLAY, fontWeight: 700, fontSize: 38, lineHeight: 1.1, color: C.accent }, 'con Old Pochmann'),
      h('div', { fontSize: 29, lineHeight: 1.35, color: C.muted, marginTop: 10, maxWidth: 600 },
        'Setups, memo, cronómetro, tutorial y retos con tus amigos.')),
    h('div', { fontSize: 24, color: C.muted }, 'old-pochmann-3bld.vercel.app'),
  ], facelets(HOME_SCRAMBLE));
}

function stat(label, value, sub, tone) {
  return col({
    padding: '16px 22px', gap: 4, background: C.panel, border: `1.5px solid ${C.line}`, borderRadius: 16,
  },
  h('div', { fontSize: 24, color: C.muted }, label),
  h('div', { fontFamily: DISPLAY, fontWeight: 700, fontSize: 44, lineHeight: 1.15, color: tone || C.ink }, value),
  sub ? h('div', { fontSize: 24, color: C.muted, maxWidth: 260, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }, sub) : null);
}

function retoImage(s) {
  const title = `${s.by} te reta`;
  const size = Math.max(40, Math.min(68, Math.floor(610 / (title.length * 0.8))));
  const stats = s.n
    ? row({ gap: 14 },
      s.best ? stat('Mejor tiempo', fmtTime(s.best.t), s.best.name, C.ok) : stat('Mejor tiempo', 'DNF', 'nadie lo ha resuelto'),
      stat('Participantes', String(s.n)),
      stat('Resueltos', String(s.ok)))
    : row({}, stat('Todavía nadie lo ha intentado', '¿Serás el primero?'));
  return frame([
    brand(),
    col({ gap: 14 },
      row({},
        h('div', {
          fontWeight: 700, fontSize: 22, letterSpacing: 2, padding: '6px 16px', borderRadius: 999,
          background: C.accent, color: C.onAccent,
        }, `RETO 3BLD · SCRAMBLE ${s.kind.toUpperCase()}`)),
      h('div', { fontFamily: DISPLAY, fontWeight: 700, fontSize: size, lineHeight: 1.1, maxWidth: 620 }, title),
      h('div', { fontSize: 30, lineHeight: 1.35, color: C.muted }, 'Resuélvelo a ciegas y compara tu tiempo.')),
    stats,
  ], facelets(s.scramble));
}

module.exports = async (req, res) => {
  // ?check=1 renders the image but answers in JSON, to test the function without an image viewer.
  const check = query(req, 'check') === '1';
  const t0 = Date.now();
  try {
    const id = query(req, 'reto');
    let tree = null;
    let cache = 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800';
    if (RETO_ID.test(id)) {
      const reto = kv() ? await readReto(kv(), id).catch(() => null) : null;
      if (reto) {
        tree = retoImage(summarizeReto(reto));
        cache = 'public, max-age=600, s-maxage=600, stale-while-revalidate=86400';
      }
    }
    if (!tree) tree = homeImage();
    const fonts = await loadFonts();
    const { ImageResponse } = await import('@vercel/og');
    const img = new ImageResponse(tree, { width: W, height: H, fonts: fonts.length ? fonts : undefined });
    const png = Buffer.from(await img.arrayBuffer());
    if (check) {
      return send(res, 200, {
        ok: png.length > 1000 && png.readUInt32BE(0) === 0x89504e47,
        bytes: png.length, ms: Date.now() - t0, fonts: fonts.map((f) => `${f.name} ${f.weight}`),
      });
    }
    res.statusCode = 200;
    res.setHeader('content-type', 'image/png');
    res.setHeader('cache-control', cache);
    res.end(png);
  } catch (e) {
    console.error(e);
    if (check) return send(res, 200, { ok: false, error: String(e && e.message) });
    res.statusCode = 500;
    res.setHeader('cache-control', 'no-store');
    res.end();
  }
};

module.exports.homeImage = homeImage;
module.exports.retoImage = retoImage;
