// Prove funzionali della mappa (SVG o Canvas) nello stesso browser e con le stesse azioni, per confrontarle:
//   node scripts/bench/functional.mjs --dir <build> [--query "?map=canvas"] --out <file.json> [--shots <cartella> --label x]
// - selezione per tocco: griglia di tocchi a zoom 1 e a zoom 4; si registra il titolo del pannello (provincia, fiume o nessuna);
// - livelli e fiumi: schermate con i fiumi spenti, e con la mappa rimpicciolita (il mondo si ripete: giro a ±180°);
// - sul Canvas: nessun errore di pagina. Il confronto tra i due file .json si fa con scripts/bench/compare-select.mjs.
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

async function tapGrid(name, cols, rows) {
  const res = [];
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < cols; i += 1) {
      const x = Math.round(wrapRect.x + 20 + ((wrapRect.w - 40) * (i + 0.5)) / cols);
      const y = Math.round(wrapRect.y + 60 + ((wrapRect.h - 160) * (j + 0.5)) / rows); // fuori dalla barra degli strumenti in alto e dalla legenda in basso
      await page.touchscreen.tap(x, y);
      await sleep(250); // il pannello si apre e la mappa si ridimensiona: si attende l'assestamento prima di leggere
      const t = await title();
      res.push([x, y, t]);
      // si chiude il pannello: l'altezza della mappa (e quindi la posizione dei punti) resta uguale per tutti i tocchi
      if (t && t !== 'Nessuna provincia selezionata') { await page.click('.panel .close'); await sleep(250); }
    }
  }
  out.taps[name] = res;
}

await tapGrid('k1', 10, 12);
await page.touchscreen.tap(wrapRect.x + 195, wrapRect.y + 300); // una provincia selezionata per la schermata
if (shots) await page.screenshot({ path: path.join(shots, `${label}-selected-k1.png`) });
// zoom 4 attorno all'Europa centrale (due scatti di rotella, come nelle misure)
await page.mouse.move(160, 330);
await page.mouse.wheel(0, -462.098);
await sleep(1500);
await page.mouse.wheel(0, -462.098);
await sleep(4000);
await tapGrid('k4', 8, 10);
await page.touchscreen.tap(wrapRect.x + 160, wrapRect.y + 300);
await sleep(200);
if (shots) await page.screenshot({ path: path.join(shots, `${label}-selected-k4.png`) });

// fiumi spenti
await page.click('button[aria-label="Vista iniziale"]');
await sleep(1500);
await page.click('button[aria-label="Mostra o nascondi i fiumi"]');
await sleep(1200);
if (shots) await page.screenshot({ path: path.join(shots, `${label}-norivers-k1.png`) });
await page.click('button[aria-label="Mostra o nascondi i fiumi"]');
// mappa rimpicciolita: il mondo si ripete in orizzontale (giro a ±180°)
await page.mouse.move(195, 330);
for (let i = 0; i < 4; i += 1) { await page.mouse.wheel(0, 460); await sleep(200); }
await sleep(2500);
if (shots) await page.screenshot({ path: path.join(shots, `${label}-world-out.png`) });

writeFileSync(path.resolve(args.out ?? `${label}-functional.json`), JSON.stringify(out, null, 1));
console.log(`${label}: ${out.taps.k1.length + out.taps.k4.length} tocchi, errori: ${errors.length}`);
await browser.close();
server.close();
