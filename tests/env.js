// Shared settings for the suites: where the site runs, where screenshots go, and the fonts for the
// OBS screenshots. `run.js` sets these; the defaults match it, so a suite can also run on its own.
const fs = require('fs');
const path = require('path');

const SITE = process.env.SITE || 'http://localhost:8793';             // with the scramble generator
const SITE_PLAIN = process.env.SITE_PLAIN || 'http://localhost:8792'; // without it (offline fallback)
const SHOTS = process.env.SHOTS || path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

// The real fonts (from @fontsource, served by server.js) instead of Google Fonts, so the overlay
// screenshots look like the real thing without network access.
const FONTS = [
  ['Unbounded', 500, 'unbounded-latin-500-normal.woff2'],
  ['Unbounded', 700, 'unbounded-latin-700-normal.woff2'],
  ['Atkinson Hyperlegible', 400, 'atkinson-hyperlegible-latin-400-normal.woff2'],
  ['Atkinson Hyperlegible', 700, 'atkinson-hyperlegible-latin-700-normal.woff2'],
  ['Martian Mono', 400, 'martian-mono-latin-400-normal.woff2'],
  ['Martian Mono', 600, 'martian-mono-latin-600-normal.woff2'],
];
const FONTS_CSS = FONTS
  .map(([family, weight, file]) => `@font-face{font-family:'${family}';font-weight:${weight};src:url(${SITE_PLAIN}/fonts/${file}) format('woff2')}`)
  .join('\n');

module.exports = {
  SITE,
  SITE_PLAIN,
  SHOTS,
  SW_FILE: process.env.SW_FILE || path.join(__dirname, '..', 'public', 'sw.js'),
  FONTS_CSS,
};
