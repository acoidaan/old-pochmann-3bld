#!/usr/bin/env node
// Runs the checks: builds the site into ../public, serves it with a fake API on two ports (8793 with the
// scramble generator, 8792 without it) and runs each suite in its own process, in a real Chromium.
//
//   npm test                   every browser suite (e2e/)
//   npm test -- smart-cube     only the suites whose file name contains «smart-cube»
//   npm run audit              accessibility (axe-core) and layout audits (a11y/)
//   npm run shots              the screenshots in ../docs/img
//   node run.js --all          the suites and the audits together
//   node run.js --all --shard=2/4   the 2nd of 4 parts that take about as long (what the GitHub Action runs)
//
// Exit code 1 if any check fails, a page throws, or an audit finds a problem.
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const { start } = require('./server');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const args = process.argv.slice(2);
const mode = args.includes('--audit') ? 'a11y' : args.includes('--shots') ? 'shots' : args.includes('--all') ? 'all' : 'e2e';
const filters = args.filter((a) => !a.startsWith('--'));
const shardArg = args.find((a) => a.startsWith('--shard='));
const SHARD = shardArg && shardArg.slice(8).match(/^(\d+)\/(\d+)$/);
if (shardArg && (!SHARD || +SHARD[1] < 1 || +SHARD[1] > +SHARD[2])) { console.error('Usa --shard=k/n, con k entre 1 y n.'); process.exit(1); }
const SITE = 'http://localhost:8793';
const SITE_PLAIN = 'http://localhost:8792';
const SHOTS = process.env.SHOTS || path.join(__dirname, 'shots');
const TIMEOUT = 10 * 60 * 1000;

function suites() {
  if (mode === 'shots') return [path.join(__dirname, 'docs-shots.js')];
  const list = (mode === 'all' ? ['a11y', 'e2e'] : [mode])
    .flatMap((d) => fs.readdirSync(path.join(__dirname, d)).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`))
    .filter((f) => !filters.length || filters.some((x) => path.basename(f).includes(x)))
    .sort();
  return (SHARD ? shard(list, +SHARD[1], +SHARD[2]) : list).map((f) => path.join(__dirname, f));
}

// Part k of n: slowest first, each suite goes to the part with the fewest seconds so far (durations.json,
// measured on the GitHub runner; a suite not there counts 20 s). Every part works out the same split, so
// between them they run each suite once.
function shard(list, k, n) {
  const secs = JSON.parse(fs.readFileSync(path.join(__dirname, 'durations.json'), 'utf8'));
  const cost = (f) => secs[f] || 20;
  const parts = Array.from({ length: n }, () => ({ t: 0, files: [] }));
  [...list].sort((a, b) => cost(b) - cost(a) || (a < b ? -1 : 1)).forEach((f) => {
    const p = parts.reduce((m, x) => (x.t < m.t ? x : m));
    p.t += cost(f);
    p.files.push(f);
  });
  return parts[k - 1].files.sort();
}

function runOne(file) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [file], {
      cwd: __dirname,
      env: { ...process.env, SITE, SITE_PLAIN, SHOTS, SW_FILE: path.join(PUBLIC, 'sw.js') },
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    const timer = setTimeout(() => { out += '\nTIMEOUT'; child.kill('SIGKILL'); }, TIMEOUT);
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
}

// Each e2e suite ends with «N failed of M» and «page errors: none»; each audit with «N problems».
function verdict(out, code) {
  const e2e = out.match(/(\d+) failed of (\d+)/);
  if (e2e) {
    const pageErrors = !/page errors: none/.test(out);
    return { ok: code === 0 && e2e[1] === '0' && !pageErrors, checks: Number(e2e[2]), failed: Number(e2e[1]) + (pageErrors ? 1 : 0) };
  }
  const audit = out.match(/(\d+) problems/);
  if (audit) return { ok: code === 0 && audit[1] === '0', checks: 0, failed: Number(audit[1]) };
  return { ok: code === 0, checks: 0, failed: code === 0 ? 0 : 1 };
}

(async () => {
  console.log('Construyendo public/ …');
  execFileSync(process.execPath, ['build.js'], { cwd: ROOT, stdio: 'inherit' });
  fs.mkdirSync(SHOTS, { recursive: true });
  const servers = [
    await start({ root: PUBLIC, port: 8792, cubejs: false }),
    await start({ root: PUBLIC, port: 8793, cubejs: true }),
  ];
  const list = suites();
  if (!list.length && SHARD) { console.log('Esta parte no tiene ninguna prueba.'); process.exit(0); }
  if (!list.length) { console.error('No hay ninguna prueba con ese nombre.'); process.exit(1); }
  if (SHARD) console.log(`Parte ${SHARD[1]} de ${SHARD[2]}: ${list.map((f) => path.relative(__dirname, f)).join(', ')}`);
  let checks = 0;
  const bad = [];
  const t0 = Date.now();
  for (const file of list) {
    const name = path.relative(__dirname, file);
    const t = Date.now();
    const { code, out } = await runOne(file);
    const v = verdict(out, code);
    checks += v.checks;
    const secs = Math.round((Date.now() - t) / 1000);
    console.log(`${v.ok ? '✓' : '✗'} ${name}${v.checks ? ` · ${v.checks} comprobaciones` : ''} · ${secs} s`);
    if (!v.ok) {
      bad.push(name);
      const lines = out.split('\n').filter((l) => l.trim());
      const detail = name.startsWith('e2e')
        ? lines.filter((l) => /^FAIL|page errors: \[|TIMEOUT|Error/.test(l))
        : lines.filter((l) => !/: (axe )?clean$|^Capturas|^0 problems/.test(l));
      console.log((detail.length ? detail : out.split('\n').slice(-25)).map((l) => `    ${l}`).join('\n'));
    }
  }
  servers.forEach((s) => s.close());
  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(bad.length
    ? `\n✗ Fallan ${bad.length} de ${list.length}: ${bad.join(', ')} (${mins} min)`
    : `\n✓ Todo bien: ${list.length} ${mode === 'e2e' || mode === 'all' ? `suites, ${checks} comprobaciones` : 'pruebas'} (${mins} min)`);
  if (mode !== 'e2e') console.log(`Capturas en ${mode === 'shots' ? path.join(ROOT, 'docs', 'img') : SHOTS}`);
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
