




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
const shots = args.shots ? path.resolve(args.shots) : null;
const label = args.label ?? 'fn';
if (shots) mkdirSync(shots, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer((req, res) => {
  const p = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0];
  try { const body = readFileSync(path.join(dir, p)); res.writeHead(200, { 'content-type': MIME[path.extname(p)] ?? 'application/octet-stream' }); res.end(body); } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/${query}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message ?? e)));
await page.goto(url, { waitUntil: 'commit' });
await page.waitForFunction(() => document.querySelector('.map-wrap') && (document.querySelector('path.prov') || document.querySelector('canvas.map-canvas[data-drawn="1"]')), null, { timeout: 120000, polling: 100 });
await page.waitForFunction(() => document.querySelector('path.lake') || document.querySelector('canvas.map-canvas[data-water="1"]'), null, { timeout: 120000, polling: 100 });
await sleep(3000); // fine del lavoro in secondo piano (bordi, versioni semplificate)

const title = () => page.evaluate(() => document.querySelector('.panel h2')?.textContent ?? null);
const wrapRect = await page.evaluate(() => { const r = document.querySelector('.map-wrap').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const out = { url: query, wrapRect, taps: {}, errors };

// Confronto con la verità nota: ogni punto è il polo di inaccessibilità di una provincia (lontano dai confini).
//   node scripts/bench/tap-truth.mjs --dir <build> [--query ...] --points points.json
const points = JSON.parse(readFileSync(path.resolve(args.points), 'utf8'));
const res = { k1: [], k4: [] };
async function run(name) {
  for (const p of points[name]) {
    await page.touchscreen.tap(p.x, p.y);
    await sleep(250);
    const t = await title();
    res[name].push({ ...p, got: t });
    if (t && t !== 'Nessuna provincia selezionata') { await page.click('.panel .close'); await sleep(250); }
  }
}

const pts = points.k4;
await page.click('button[aria-label="Vista iniziale"]'); await sleep(800);
await page.mouse.move(160, 330); await page.mouse.wheel(0, -462.098); await sleep(1500); await page.mouse.wheel(0, -462.098); await sleep(4000);
const info = () => page.evaluate(() => { const c = document.querySelector('canvas.map-canvas:last-of-type'); const r = document.querySelector('.map-wrap').getBoundingClientRect(); const cs = [...document.querySelectorAll('canvas')].map((x) => { const b = x.getBoundingClientRect(); return [x.width, x.height, Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; }); return { wrap: [r.y, r.height], cs, title: document.querySelector('.panel h2')?.textContent }; });
for (const i of [31, 32, 33, 34]) {
  const p = pts[i];
  console.log('prima', i, JSON.stringify(await info()));
  await page.touchscreen.tap(p.x, p.y); await sleep(300);
  console.log('dopo', i, p.name, JSON.stringify(await info()));
  await page.screenshot({ path: `${process.env.SHOTDIR}/dbg-${i}.png` });
  if ((await title()) !== 'Nessuna provincia selezionata') { await page.click('.panel .close'); await sleep(300); }
}
await browser.close(); server.close();
