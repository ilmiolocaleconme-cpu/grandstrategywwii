// Ritaglia le zone città a disco sulla terra della loro provincia madre: i dischi delle città costiere sporgevano in mare
// (La Valletta, Cebu, Namp'o...). Sutherland-Hodgman con il disco (convesso) come ritaglio e gli anelli della provincia come soggetto.
// Uso: node scripts/clip-city-discs.js [--write]
import { readFile, writeFile } from 'node:fs/promises';
import { loadProvinces } from './load-provinces.js';

const cross = (a, b, p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
const area2 = (r) => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i, i += 1) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return s; };

/** Ritaglia `subject` (anello aperto) con il poligono convesso `clip` (anello aperto, qualsiasi verso). */
export function clipConvex(subject, clip) {
  let sh = 0; for (let i = 0; i < clip.length; i += 1) { const a = clip[i]; const b = clip[(i + 1) % clip.length]; sh += a[0] * b[1] - b[0] * a[1]; }
  const ccw = sh > 0 ? 1 : -1; // somma di Gauss > 0: antiorario, l'interno sta a sinistra di ogni lato
  let out = subject;
  for (let i = 0; i < clip.length && out.length; i += 1) {
    const a = clip[i]; const b = clip[(i + 1) % clip.length];
    const inp = out; out = [];
    const inside = (p) => ccw * cross(a, b, p) >= 0;
    for (let k = 0; k < inp.length; k += 1) {
      const p = inp[k]; const q = inp[(k + 1) % inp.length];
      const ip = inside(p); const iq = inside(q);
      if (ip !== iq) {
        const d1 = cross(a, b, p); const d2 = cross(a, b, q);
        const t = d1 / (d1 - d2);
        out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
      if (iq) out.push(q);
    }
  }
  return out;
}

const rad = Math.PI / 180;
export function ringAreaKm2(r) { // area su sfera approssimata (equirettangolare locale)
  const lat = r.reduce((s, p) => s + p[1], 0) / r.length;
  return Math.abs(area2(r)) / 2 * 111.32 * 111.32 * Math.cos(lat * rad);
}

export async function clipDiscs() {
  const file = new URL('../data/citta_grandi.json', import.meta.url);
  const data = JSON.parse(await readFile(file, 'utf8'));
  const prov = new Map((await loadProvinces()).features.map((f) => [f.properties.id, f]));
  const report = [];
  for (const f of data.features) {
    const p = f.properties;
    if (p.geometria !== 'disco' || f.geometry.type !== 'Polygon') continue;
    const cands = [...prov.values()].filter((q) => q.properties.id === p.parentProvince || q.properties.id.startsWith(`${p.parentProvince}_SP`));
    if (!cands.length) continue;
    const disc = f.geometry.coordinates[0].slice(0, -1);
    const polys = cands.flatMap((c) => (c.geometry.type === 'Polygon' ? [c.geometry.coordinates] : c.geometry.coordinates));
    const pieces = [];
    for (const poly of polys) {
      const outer = poly[0].slice(0, -1);
      const c = clipConvex(outer, disc);
      if (c.length >= 3 && ringAreaKm2(c) > 0.3) pieces.push(c);
    }
    if (!pieces.length) continue;
    const before = p.areaKm2; const total = pieces.reduce((s, c) => s + ringAreaKm2(c), 0);
    if (total > before * 0.985) continue; // il disco sta già sulla terra
    if (total < before * 0.3 || total < 10) continue; // quasi tutto fuori dalla madre: è un pezzo assegnato altrove, non una sporgenza in mare
    const close = (r) => [...r.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6]), [Math.round(r[0][0] * 1e6) / 1e6, Math.round(r[0][1] * 1e6) / 1e6]];
    f.geometry = pieces.length === 1 ? { type: 'Polygon', coordinates: [close(pieces[0])] } : { type: 'MultiPolygon', coordinates: pieces.map((c) => [close(c)]) };
    p.areaKm2 = Math.round(total * 10) / 10;
    p.discoRitagliatoSullaCosta = true;
    report.push({ id: p.id, prima: before, dopo: p.areaKm2, pezzi: pieces.length });
  }
  return { data, report, file };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { data, report, file } = await clipDiscs();
  for (const r of report) console.log(r.id, r.prima, '->', r.dopo, r.pezzi > 1 ? `(${r.pezzi} pezzi)` : '');
  console.log(`dischi ritagliati: ${report.length}`);
  if (process.argv.includes('--write')) await writeFile(file, `${JSON.stringify(data)}\n`);
}
