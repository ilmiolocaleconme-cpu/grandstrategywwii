// Rigenera le forme delle città in data/citta_grandi.json (npm run build:citta-forme): contorni ortogonali
// (angoli retti) e inventati, scelti in base all'id della città, dentro il riquadro della forma attuale.
// Il riquadro resta quello della città: il test «sta nel riquadro della provincia madre» continua a valere.
// Idempotente: le città già marcate con `forma` non vengono toccate.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const FILE = fileURLToPath(new URL('../data/citta_grandi.json', import.meta.url));
export const FORMA = 'ortogonale_v1';

// Sagome in un quadrato unitario: solo lati orizzontali e verticali.
const TEMPLATES = [
  [[0, 0], [1, 0], [1, 1], [0, 1]], // blocco
  [[0, 0], [1, 0], [1, 0.45], [0.5, 0.45], [0.5, 1], [0, 1]], // a L
  [[0, 0.6], [0.35, 0.6], [0.35, 0], [0.65, 0], [0.65, 0.6], [1, 0.6], [1, 1], [0, 1]], // a T rovesciata
  [[0, 0], [0.3, 0], [0.3, 0.6], [0.7, 0.6], [0.7, 0], [1, 0], [1, 1], [0, 1]], // a U
  [[0, 0], [1, 0], [1, 0.7], [0.75, 0.7], [0.75, 1], [0.25, 1], [0.25, 0.7], [0, 0.7]], // a gradino
];

// Generatore pseudocasuale deterministico (mulberry32) seminato dall'id.
function rng(seedText) {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bboxOf(geometry) {
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polys) for (const [x, y] of poly[0]) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Contorno ortogonale per una città: stesso centro e riquadro di `geometry`, area vicina a `areaKm2`. */
export function formaOrtogonale(id, geometry, areaKm2) {
  const { minX, minY, maxX, maxY } = bboxOf(geometry);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const w = maxX - minX;
  const h = maxY - minY;
  const kmX = w * 111.32 * Math.cos((cy * Math.PI) / 180);
  const kmY = h * 110.57;
  const random = rng(id);
  const template = TEMPLATES[Math.floor(random() * TEMPLATES.length)];
  // Area più piccola del riquadro: la forma si restringe al centro; con i fattori casuali le sagome non sono tutte uguali.
  const scale = kmX * kmY > 0 ? Math.min(1, Math.sqrt(areaKm2 / (kmX * kmY))) : 1;
  const W = w * scale * (0.8 + 0.2 * random());
  const H = h * scale * (0.8 + 0.2 * random());
  const ring = template.map(([u, v]) => [cx + (u - 0.5) * W, cy + (v - 0.5) * H].map((n) => Math.round(n * 1e6) / 1e6));
  ring.push(ring[0]);
  return { type: 'Polygon', coordinates: [ring] };
}

export async function buildCittaForme(file = FILE) {
  const data = JSON.parse(await readFile(file, 'utf8'));
  let cambiate = 0;
  for (const feature of data.features) {
    const p = feature.properties;
    if (p.forma === FORMA) continue;
    feature.geometry = formaOrtogonale(p.id, feature.geometry, p.areaKm2);
    p.forma = FORMA;
    cambiate += 1;
  }
  await writeFile(file, `${JSON.stringify(data)}\n`);
  return cambiate;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const n = await buildCittaForme();
  console.log(`Forme ortogonali: ${n} città aggiornate`);
}
