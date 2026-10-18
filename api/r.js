// Short challenge link /r/<id>. Link-preview bots (Discord, WhatsApp, Telegram…) get a page with the
// challenge's title and image; everyone else goes straight to the app.
const { query, readReto, RETO_ID, fmtTime, summarizeReto } = require('./_lib');

const BOTS = /bot\b|bot\/|discord|twitterbot|telegram|whatsapp|facebookexternalhit|facebot|slack|linkedin|embedly|skypeuripreview|iframely|mastodon|bluesky|pinterest|vkshare|redditbot|applebot|preview/i;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function redirect(res, to) {
  res.statusCode = 302;
  res.setHeader('location', to);
  res.setHeader('cache-control', 'no-store');
  res.end();
}

module.exports = async (req, res) => {
  const id = query(req, 'id');
  if (!RETO_ID.test(id)) return redirect(res, '/');
  const app = `/?reto=${id}`;
  if (!BOTS.test(req.headers['user-agent'] || '')) return redirect(res, app);
  let reto = null;
  try { reto = await readReto(id); } catch (e) { console.error(e); }
  if (!reto) return redirect(res, '/');
  const s = summarizeReto(reto);
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const base = `https://${host}`;
  const title = `${s.by} te reta a un 3BLD`;
  const best = s.best ? `Mejor tiempo: ${fmtTime(s.best.t)} (${s.best.name})` : 'Todavía nadie lo ha resuelto';
  const people = s.n === 1 ? '1 participante' : `${s.n} participantes`;
  const desc = s.n
    ? `Scramble ${s.kind}. ${best} · ${people}. Resuélvelo a ciegas y compara tu tiempo.`
    : `Scramble ${s.kind}. Todavía nadie lo ha intentado: resuélvelo a ciegas y compara tu tiempo.`;
  const image = `${base}/api/og?reto=${id}&n=${s.n}-${s.ok}`;
  res.statusCode = 200;
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(`<!doctype html><html lang=es><head><meta charset=utf-8>
<title>${esc(title)}</title>
<meta name=description content="${esc(desc)}">
<meta property=og:type content=website>
<meta property=og:site_name content="Old Pochmann 3BLD">
<meta property=og:title content="${esc(title)}">
<meta property=og:description content="${esc(desc)}">
<meta property=og:url content="${esc(`${base}/r/${id}`)}">
<meta property=og:image content="${esc(image)}">
<meta property=og:image:width content=1200>
<meta property=og:image:height content=630>
<meta property=og:image:alt content="${esc(title)}">
<meta property=og:locale content=es_ES>
<meta name=twitter:card content=summary_large_image>
<meta name=theme-color content="#F0699C">
<meta http-equiv=refresh content="0;url=${esc(app)}">
</head><body><p><a href="${esc(app)}">Abrir el reto en Old Pochmann 3BLD</a></p></body></html>`);
};
