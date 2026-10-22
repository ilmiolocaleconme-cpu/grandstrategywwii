// Misure della mappa in Chromium con CPU rallentata (CDP Emulation.setCPUThrottlingRate), schermo 390x844:
//   node scripts/bench/measure.mjs --dir <cartella-build> [--query "?map=canvas"] [--cpu 4] [--dpr 1] [--runs 3] [--label x] [--shots <cartella>] [--focus x,y] [--startup-only] [--no-perf]
// Metodologia (uguale per SVG e Canvas):
// - "mappa visibile": ms da navigationStart fino al secondo requestAnimationFrame dopo la comparsa delle province;
// - "nomi": numero di nomi di provincia dopo che il conteggio resta stabile 2 s, a zoom 1, 2 e 4 (rotella: k = exp(-deltaY*0.0015));
// - "fotogramma": differenza tra due requestAnimationFrame consecutivi durante il gesto, con un solo movimento di dito per fotogramma
//   (touch via CDP Input.dispatchTouchEvent); si riporta la mediana e il 95° percentile.
// Prerequisiti: build di scripts/bench/build.mjs; Chromium e playwright-core come da variabili d'ambiente (valori predefiniti sotto).
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const TOOLS = process.env.NPM_TOOLS ?? '/opt/npm-tools/node_modules';
const CHROME = process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const { chromium } = createRequire(`${TOOLS}/`)('playwright-core');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? 'true' : all[i + 1]]] : a), []));
const dir = path.resolve(args.dir);
const query = args.query ?? '';
const cpu = Number(args.cpu ?? 4);
const dpr = Number(args.dpr ?? 1);
const runs = Number(args.runs ?? 3);
const label = args.label ?? 'run';
const noPerf = args['no-perf'] === 'true'; // prova: senza il dominio CDP Performance
const [fx, fy] = (args.focus ?? '160,330').split(',').map(Number); // punto dello schermo attorno a cui si zooma per contare i nomi (Europa centrale, zona densa)
const shots = args.shots ? path.resolve(args.shots) : null;
const W = 390;
const H = 844;
if (shots) mkdirSync(shots, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer((req, res) => {
  const p = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0];
  try {
    const body = readFileSync(path.join(dir, p));
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/${query}`;

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null; };
const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

const INIT = () => {
  window.__gs = { t: {}, frames: [], rec: false, last: 0 };
  const q = (s) => document.querySelector(s);
  const mark = (name) => { if (!window.__gs.t[name]) requestAnimationFrame(() => requestAnimationFrame(() => { window.__gs.t[name] = performance.now(); })); };
  const tick = (now) => {
    const g = window.__gs;
    if (g.rec && g.last) g.frames.push(now - g.last);
    g.last = now;
    if (!g.seen) g.seen = {};
    const seen = (name, cond) => { if (!g.seen[name] && cond) { g.seen[name] = 1; mark(name); } };
    seen('prov', q('path.prov') || q('canvas.map-canvas[data-drawn="1"]'));
    seen('water', q('path.lake') || q('canvas.map-canvas[data-water="1"]'));
    seen('label', q('text.map-label') || (q('canvas.map-canvas') && Number(q('canvas.map-canvas').dataset.labels) > 0));
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__gs.lastLong = 0;
  try { new PerformanceObserver((l) => { window.__gs.lastLong = performance.now(); }).observe({ entryTypes: ['longtask'] }); } catch { /* senza longtask si usa solo la stabilità del conteggio */ }
  window.__labels = () => {
    const c = document.querySelector('canvas.map-canvas');
    if (c) return { prov: Number(c.dataset.labels ?? 0), lake: Number(c.dataset.lakeLabels ?? 0), elements: document.querySelectorAll('*').length };
    return { prov: document.querySelectorAll('text.map-label:not(.lake-label)').length, lake: document.querySelectorAll('text.lake-label').length, elements: document.querySelectorAll('*').length };
  };
};

const nextFrame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function settleLabels(page, maxMs = 90000) {
  const quiet = Math.max(2000, 1500 * cpu); // con la CPU rallentata i nomi arrivano a passate lente: si aspetta di più prima di dare il conteggio per stabile
  const t0 = Date.now();
  let last = null;
  let since = Date.now();
  for (;;) {
    const cur = await page.evaluate(() => window.__labels());
    const key = `${cur.prov}/${cur.lake}`;
    if (key !== last) { last = key; since = Date.now(); }
    // il calcolo dei nomi procede a passate (compiti lunghi): si dà per finito quando il conteggio è stabile E non ci sono compiti lunghi da un po'
    const idleFor = await page.evaluate(() => performance.now() - window.__gs.lastLong);
    if ((Date.now() - since > quiet && idleFor > quiet) || Date.now() - t0 > maxMs) return { ...cur, settleMs: Date.now() - since < quiet ? null : since - t0 };
    await sleep(250);
  }
}

async function perf(cdp) {
  const { metrics } = await cdp.send('Performance.getMetrics');
  return Object.fromEntries(metrics.map((m) => [m.name, m.value]));
}

async function gesture(page, cdp, name, run) {
  await page.evaluate(() => { window.__gs.frames = []; window.__gs.rec = true; window.__gs.last = 0; });
  const m0 = await perf(cdp);
  const t0 = Date.now();
  await run();
  const wall = Date.now() - t0;
  const m1 = await perf(cdp);
  const frames = await page.evaluate(() => { window.__gs.rec = false; return window.__gs.frames; });
  const used = frames.slice(2); // i primi due fotogrammi sono di avvio del gesto
  const n = Math.max(used.length, 1);
  const d = (k) => ((m1[k] - m0[k]) * 1000) / n;
  return {
    name, frames: used.length, medianMs: r1(median(used)), p95Ms: r1(pct(used, 0.95)), maxMs: r1(Math.max(0, ...used)),
    over33: used.filter((f) => f > 33).length, wallMs: wall,
    perFrame: { taskMs: r1(d('TaskDuration')), scriptMs: r1(d('ScriptDuration')), layoutMs: r1(d('LayoutDuration')), styleMs: r1(d('RecalcStyleDuration')) },
  };
}

async function oneRun(browser, runIdx) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(INIT);
  if (!noPerf) await cdp.send('Performance.enable');
  if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  await page.goto(url, { waitUntil: 'commit' });
  const res = { run: runIdx };
  await page.waitForFunction(() => window.__gs?.t?.prov, null, { timeout: 120000, polling: 100 });
  const t = await page.evaluate(() => window.__gs.t);
  res.visibleMs = r1(t.prov);
  // attesa dei dati accessori e dei primi nomi
  await page.waitForFunction(() => window.__gs.t.water, null, { timeout: 120000, polling: 200 }).catch(() => {});
  res.labels1 = await settleLabels(page);
  const t2 = await page.evaluate(() => window.__gs.t);
  res.waterMs = r1(t2.water);
  res.firstLabelMs = r1(t2.label);
  if (shots && runIdx === 0) await page.screenshot({ path: path.join(shots, `${label}-k1.png`) });
  if (args['startup-only']) { res.errors = errors.slice(0, 5); await ctx.close(); return res; }

  const cx = W / 2;
  const cy = 420;
  // trascinamento a zoom 1: avanti e indietro, un movimento per fotogramma
  res.dragK1 = await gesture(page, cdp, 'drag k1', async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 0 }] });
    for (let i = 1; i <= 40; i += 1) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + i * 4, y: cy + i * 2, id: 0 }] }); await nextFrame(page); }
    for (let i = 39; i >= 0; i -= 1) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + i * 4, y: cy + i * 2, id: 0 }] }); await nextFrame(page); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  });
  await sleep(1500);
  // pizzico a zoom 1: due dita che si allargano e si richiudono
  res.pinchK1 = await gesture(page, cdp, 'pinch k1', async () => {
    const pts = (d) => [{ x: cx - d, y: cy, id: 0 }, { x: cx + d, y: cy, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(40) });
    for (let i = 1; i <= 30; i += 1) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(40 + i * 4) }); await nextFrame(page); }
    for (let i = 29; i >= 0; i -= 1) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(40 + i * 4) }); await nextFrame(page); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  });
  await sleep(1500);
  // zoom con la rotella: 30 scatti avanti e 30 indietro
  res.wheelK1 = await gesture(page, cdp, 'wheel k1', async () => {
    await page.mouse.move(cx, cy);
    for (let i = 0; i < 30; i += 1) { await page.mouse.wheel(0, -40); await nextFrame(page); }
    for (let i = 0; i < 30; i += 1) { await page.mouse.wheel(0, 40); await nextFrame(page); }
  });
  await sleep(1500);
  // nomi a zoom 2 e 4 (rotella: k = exp(-deltaY*0.0015); la vista torna a k = 1 prima, con il pulsante ⌂)
  await page.click('button[aria-label="Vista iniziale"]');
  await sleep(500);
  await page.mouse.move(fx, fy);
  await page.mouse.wheel(0, -462.098);
  res.labels2 = await settleLabels(page);
  if (shots && runIdx === 0) await page.screenshot({ path: path.join(shots, `${label}-k2.png`) });
  await page.mouse.wheel(0, -462.098);
  res.labels4 = await settleLabels(page);
  if (shots && runIdx === 0) await page.screenshot({ path: path.join(shots, `${label}-k4.png`) });
  res.dragK4 = await gesture(page, cdp, 'drag k4', async () => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 0 }] });
    for (let i = 1; i <= 40; i += 1) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + i * 4, y: cy + i * 2, id: 0 }] }); await nextFrame(page); }
    for (let i = 39; i >= 0; i -= 1) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + i * 4, y: cy + i * 2, id: 0 }] }); await nextFrame(page); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  });
  res.errors = errors.slice(0, 5);
  await ctx.close();
  return res;
}

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const all = [];
for (let i = 0; i < runs; i += 1) {
  const r = await oneRun(browser, i);
  all.push(r);
  console.error(r.dragK1 ? `[${label}] run ${i}: visibile ${r.visibleMs} ms, drag k1 mediana ${r.dragK1.medianMs} ms, pizzico ${r.pinchK1.medianMs}, rotella ${r.wheelK1.medianMs}, nomi ${r.labels1.prov}/${r.labels2.prov}/${r.labels4.prov}` : `[${label}] run ${i}: visibile ${r.visibleMs} ms, primo nome ${r.firstLabelMs} ms, nomi k1 ${r.labels1.prov}`);
}
await browser.close();
server.close();

const pick = (f) => median(all.map(f));
const summary = {
  label, url: query, cpu, dpr, runs,
  visibleMs: pick((r) => r.visibleMs),
  waterMs: pick((r) => r.waterMs),
  firstLabelMs: pick((r) => r.firstLabelMs),
  ...(args['startup-only'] ? {} : {
    dragK1: { medianMs: pick((r) => r.dragK1.medianMs), p95Ms: pick((r) => r.dragK1.p95Ms), perFrame: all[0].dragK1.perFrame },
    pinchK1: { medianMs: pick((r) => r.pinchK1.medianMs), p95Ms: pick((r) => r.pinchK1.p95Ms), perFrame: all[0].pinchK1.perFrame },
    wheelK1: { medianMs: pick((r) => r.wheelK1.medianMs), p95Ms: pick((r) => r.wheelK1.p95Ms), perFrame: all[0].wheelK1.perFrame },
    dragK4: { medianMs: pick((r) => r.dragK4.medianMs), p95Ms: pick((r) => r.dragK4.p95Ms) },
    labelsProv: { k1: pick((r) => r.labels1.prov), k2: pick((r) => r.labels2.prov), k4: pick((r) => r.labels4.prov) },
    labelsLake: { k1: pick((r) => r.labels1.lake), k2: pick((r) => r.labels2.lake), k4: pick((r) => r.labels4.lake) },
  }),
  domElements: all[0].labels1.elements,
  errors: all.flatMap((r) => r.errors).slice(0, 5),
};
console.log(JSON.stringify(summary, null, 1));
if (shots) writeFileSync(path.join(shots, `${label}-raw.json`), JSON.stringify(all, null, 1));
