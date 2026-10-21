// Costruisce un pacchetto di prova dell'app (src/main.jsx) con esbuild, senza Vite né rete:
//   node scripts/bench/build.mjs <cartella-uscita>
// - `virtual:pwa-register` è sostituito da un finto modulo (nessun service worker);
// - `import.meta.glob` di src/data/loadProvinces.js è sostituito da import espliciti dei file in data/provinces/;
// - react/react-dom si leggono da /opt/npm-tools/node_modules (npm non raggiunge la rete).
// Serve solo alle misure (scripts/bench/measure.mjs): non tocca la build di produzione (`npm run build`).
import { createRequire } from 'node:module';
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const TOOLS = process.env.NPM_TOOLS ?? '/opt/npm-tools/node_modules';
const require = createRequire(`${TOOLS}/`);
const { build } = require('esbuild');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.resolve(process.argv[2] ?? 'bench-dist');
mkdirSync(out, { recursive: true });

const provDir = path.join(root, 'data/provinces');
const files = readdirSync(provDir).filter((f) => f.endsWith('.json')).sort();

const plugin = {
  name: 'bench-shims',
  setup(b) {
    b.onResolve({ filter: /^virtual:pwa-register$/ }, () => ({ path: 'pwa-stub', namespace: 'stub' }));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export const registerSW = () => () => {};', loader: 'js' }));
    b.onLoad({ filter: /src[\\/]data[\\/]loadProvinces\.js$/ }, () => ({
      resolveDir: path.join(root, 'src/data'),
      loader: 'js',
      contents: `import { loadProvincesFrom } from './provinces.js';
const modules = {${files.map((f) => `'../../data/provinces/${f}': () => import('../../data/provinces/${f}')`).join(',')}};
let pending = null;
let progress = { done: 0, total: 0 };
const listeners = new Set();
export function loadProvinces(cb) {
  if (typeof cb === 'function') { listeners.add(cb); cb(progress.done, progress.total); }
  if (pending === null) pending = loadProvincesFrom(modules, (done, total) => { progress = { done, total }; for (const fn of listeners) fn(done, total); });
  return pending;
}
export function unwatchProvinces(cb) { listeners.delete(cb); }`,
    }));
  },
};

await build({
  entryPoints: [path.join(root, 'src/main.jsx')],
  outdir: out,
  entryNames: 'app',
  bundle: true,
  minify: process.env.BENCH_MIN !== '0',
  sourcemap: false,
  format: 'iife',
  jsx: 'automatic',
  nodePaths: [TOOLS],
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.json': 'json' },
  plugins: [plugin],
  logLevel: 'warning',
});

writeFileSync(path.join(out, 'index.html'), `<!doctype html>
<html lang="it"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<link rel="stylesheet" href="app.css" /><title>bench</title></head>
<body><div id="root"></div><script src="app.js"></script></body></html>`);
console.log(`bench build -> ${out}`);
