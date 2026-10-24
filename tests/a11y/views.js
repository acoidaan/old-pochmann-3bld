// Audit: accessibility (axe), horizontal overflow, console errors, per view, phone and desktop, light and dark.
const { chromium } = require('playwright');
const fs = require('fs');
const { SITE_PLAIN: SITE } = require('../env');
const axeSrc = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const VIEWS = ['practicar', 'crono', 'entrenar', 'aprender', 'tabla', 'retos', 'ajustes'];

(async () => {
  const browser = await chromium.launch();
  const report = { axe: {}, overflow: [], errors: [], console: [] };
  for (const [w, h, scheme] of [[390, 844, 'light'], [390, 844, 'dark'], [1280, 900, 'light'], [1280, 900, 'dark'], [360, 740, 'dark'], [750, 340, 'light']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => report.errors.push(`${w}${scheme}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') report.console.push(`${w}${scheme}: ${m.text()}`); });
    await page.goto(`${SITE}/#practicar`);
    await page.waitForTimeout(400);
    for (const v of VIEWS) {
      await page.evaluate((x) => window.OP3.showView(x), v);
      await page.waitForTimeout(250);
      const ov = await page.evaluate(() => {
        const W = document.documentElement.clientWidth;
        const out = [];
        if (document.documentElement.scrollWidth > W + 1) out.push(`page scrollWidth ${document.documentElement.scrollWidth} > ${W}`);
        for (const el of document.querySelectorAll('.view:not([hidden]) *')) {
          const r = el.getBoundingClientRect();
          if (r.width && r.right > W + 1 && getComputedStyle(el).position !== 'fixed') {
            let p = el.parentElement; let clipped = false;
            while (p && p !== document.body) { const s = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(s.overflowX)) { clipped = true; break; } p = p.parentElement; }
            if (!clipped) out.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')} right=${Math.round(r.right)}`);
          }
        }
        return out.slice(0, 6);
      });
      if (ov.length) report.overflow.push(`${w}${scheme} ${v}: ${ov.join(' | ')}`);
      if (w !== 360) {
        await page.evaluate(axeSrc);
        const res = await page.evaluate(async () => {
          const r = await window.axe.run(document.querySelector('.view:not([hidden])') ? document : document, { resultTypes: ['violations'] });
          return r.violations.map((x) => ({ id: x.id, impact: x.impact, help: x.help, nodes: x.nodes.slice(0, 4).map((n) => n.target.join(' ') + ' :: ' + (n.failureSummary || '').split('\n').slice(1, 2).join(' ').slice(0, 160)), n: x.nodes.length }));
        });
        for (const x of res) {
          const key = `${x.id} (${x.impact}) ${x.help}`;
          report.axe[key] = report.axe[key] || [];
          report.axe[key].push(`${w}${scheme} ${v} [${x.n}]: ${x.nodes.join(' || ')}`);
        }
      }
    }
    await ctx.close();
  }
  for (const [k, v] of Object.entries(report.axe)) {
    console.log('\n## ' + k);
    const uniq = [...new Set(v)];
    uniq.slice(0, 8).forEach((l) => console.log('  ' + l));
    if (uniq.length > 8) console.log(`  … ${uniq.length - 8} more`);
  }
  console.log('\n## overflow'); report.overflow.forEach((l) => console.log('  ' + l));
  console.log('\n## page errors'); [...new Set(report.errors)].forEach((l) => console.log('  ' + l));
  console.log('\n## console'); [...new Set(report.console)].slice(0, 20).forEach((l) => console.log('  ' + l));
  const problems = Object.keys(report.axe).length + report.overflow.length + new Set(report.errors).size;
  console.log(`\n${problems} problems`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
