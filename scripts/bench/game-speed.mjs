// Velocità del gioco vero in Chromium (build di scripts/bench/build.mjs): avvio partita, durata di ogni passo «+1 g», e profilo CPU con le funzioni più costose.
//   node scripts/bench/game-speed.mjs --dir <build> [--nation "Reich tedesco"] [--steps 30] [--cpu 1] [--profile]
// CHROME = percorso di Chromium (predefinito /opt/pw-browsers/chromium-1243/chrome-linux64/chrome).
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const TOOLS = process.env.NPM_TOOLS ?? '/opt/npm-tools/node_modules';
const CHROME = process.env.CHROME ?? '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome';
const { chromium } = createRequire(`${TOOLS}/`)('playwright-core');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? 'true' : all[i + 1]]] : a), []));
const dir = path.resolve(args.dir);
const nation = args.nation ?? 'Regno d\'Italia';
const steps = Number(args.steps ?? 30);
const cpu = Number(args.cpu ?? 1);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer((req, res) => {
  const p = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0];
  try { const b = readFileSync(path.join(dir, p)); res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
const cdp = await page.context().newCDPSession(page);
if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
const t0 = Date.now();
await page.goto(`http://localhost:${server.address().port}/`);
await page.waitForSelector('text=Nuova partita');
console.log(`pagina pronta: ${Date.now() - t0} ms`);
await page.getByText(nation, { exact: true }).first().click();
const tStart = Date.now();
await page.getByRole('button', { name: /^Gioca con/ }).click();
await page.waitForSelector('text=1 gennaio 1936', { timeout: 120000 });
console.log(`avvio partita (clic → mappa con data): ${Date.now() - tStart} ms`);
await page.waitForTimeout(3000); // assestamento (province, mappa)
const dateOf = () => page.evaluate(() => { const el = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && /^\d+ (gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre) 19\d\d$/.test(e.textContent.trim())); return el ? el.textContent.trim() : null; });
if (args.profile) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 }); await cdp.send('Profiler.start'); }
const step = page.getByText('+1 g', { exact: true }).first();
const times = []; const inPage = [];
for (let i = 0; i < steps; i += 1) {
  const before = await dateOf();
  const t = Date.now();
  // tempo di CPU del passo (simulazione + disegno React) misurato nella pagina: il clic e il microtask con cui React applica lo stato
  inPage.push(await step.evaluate(async (el) => { const t0 = performance.now(); el.click(); await new Promise((r) => queueMicrotask(r)); return performance.now() - t0; }));
  // il giorno è avanzato quando cambia la data mostrata e il browser ha disegnato
  await page.waitForFunction((d) => { const el = [...document.querySelectorAll('*')].find((e) => e.children.length === 0 && /^\d+ [a-z]+ 19\d\d$/.test(e.textContent.trim())); return el && el.textContent.trim() !== d; }, before, { timeout: 60000 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  times.push(Date.now() - t);
}
const sorted = [...times].sort((a, b) => a - b);
const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
console.log(`+1 g × ${steps} (CPU ×${cpu}): mediana ${q(0.5)} ms · 95° ${q(0.95)} ms · max ${sorted.at(-1)} ms · primo ${times[0]} ms · somma ${times.reduce((a, b) => a + b, 0)} ms`);
const ip = [...inPage].sort((a, b) => a - b);
console.log(`CPU del passo (nella pagina): mediana ${ip[Math.floor(ip.length / 2)].toFixed(0)} ms · max ${ip.at(-1).toFixed(0)} ms`);
console.log('tempi:', times.join(' '));
if (args.profile) {
  const { profile } = await cdp.send('Profiler.stop');
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = profile.timeDeltas;
  profile.samples.forEach((id, i) => { self.set(id, (self.get(id) ?? 0) + (dt[i] ?? 0)); });
  const byFn = new Map();
  for (const [id, us] of self) { const n = nodes.get(id); const cf = n.callFrame; const key = `${cf.functionName || '(anonima)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}`; byFn.set(key, (byFn.get(key) ?? 0) + us); }
  const total = [...byFn.values()].reduce((a, b) => a + b, 0);
  // tempo inclusivo: ogni campione conta per tutte le funzioni sulla catena dei chiamanti (una volta per funzione)
  const parent = new Map(); for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const incl = new Map();
  profile.samples.forEach((id, i) => {
    const seen = new Set();
    for (let cur = id; cur !== undefined; cur = parent.get(cur)) { const cf = nodes.get(cur).callFrame; const key = `${cf.functionName || '(anonima)'} ${cf.url.split('/').pop()}:${cf.lineNumber + 1}`; if (!seen.has(key)) { seen.add(key); incl.set(key, (incl.get(key) ?? 0) + (dt[i] ?? 0)); } }
  });
  console.log('\ntempo inclusivo (con i chiamati):');
  [...incl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40).forEach(([k, us]) => console.log(`${(us / 1000).toFixed(0).padStart(7)} ms  ${k}`));
  console.log(`\nprofilo CPU (tempo proprio), totale ${(total / 1000).toFixed(0)} ms:`);
  [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, us]) => console.log(`${(us / 1000).toFixed(0).padStart(7)} ms  ${((us / total) * 100).toFixed(1).padStart(5)}%  ${k}`));
}
if (args.run) {
  // velocità di gioco 3× (un giorno ogni 120 ms): quanti giorni passano davvero e quanto resta bloccato il thread principale
  const secs = Number(args.run);
  await page.evaluate(() => { window.__lt = []; window.__fr = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration); }).observe({ entryTypes: ['longtask'] }); let last = performance.now(); const f = (t) => { window.__fr.push(t - last); last = t; requestAnimationFrame(f); }; requestAnimationFrame(f); });
  const d0 = await dateOf();
  for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: /^Avanti/ }).click(); // riprendi, poi 2×, poi 3×
  await page.waitForTimeout(secs * 1000);
  const d1 = await dateOf();
  const r = await page.evaluate(() => ({ lt: window.__lt, fr: window.__fr }));
  const fr = [...r.fr].sort((a, b) => a - b);
  console.log(`\nFlusso a 3× per ${secs} s: da «${d0}» a «${d1}»`);
  console.log(`attività lunghe (>50 ms): ${r.lt.length}, la più lunga ${Math.max(0, ...r.lt).toFixed(0)} ms, bloccato in tutto ${r.lt.reduce((a, b) => a + b, 0).toFixed(0)} ms su ${secs * 1000}`);
  console.log(`fotogrammi: ${fr.length} · intervallo mediano ${fr[Math.floor(fr.length / 2)]?.toFixed(0)} ms · 95° ${fr[Math.floor(fr.length * 0.95)]?.toFixed(0)} ms`);
}
if (errors.length) console.log('errori di pagina:', errors.slice(0, 5));
await browser.close(); server.close();
