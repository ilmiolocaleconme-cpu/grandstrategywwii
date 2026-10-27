// Rigenera data/sea_zones.json da data/sea_zones_design.json e dalle province (npm run build:sea).
// Va rieseguito quando cambiano le province o il progetto: la somma di controllo degli id lo impone al caricamento.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadProvinces } from './load-provinces.js';
import { computeSeaZones } from './sea-compute.js';
import { idsChecksum } from '../src/data/adjacency.js';

export const SEA_SCHEMA = 'sea-zones-v1';

const inRing = (r, x, y) => { let ins = false; for (let i = 0, j = r.length - 1; i < r.length; j = i, i += 1) { const [xi, yi] = r[i]; const [xj, yj] = r[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins; } return ins; };
const boxOf = (r) => { let a = 1e9; let b = 1e9; let c = -1e9; let d = -1e9; for (const [x, y] of r) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; } return [a, b, c, d]; };
/** Toglie da ogni zona i buchi minuscoli (≤ 6 punti, ≤ 0,25°): sono blocchi della griglia di terra attorno a isole e atolli, non coste vere. La terra si disegna comunque sopra il mare; rimasti, comparivano come rettangoli tratteggiati lungo le coste (La Valletta). */
export function dropRasterHoles(zones) {
  let dropped = 0;
  for (const z of zones) {
    const small = z.rings.map((r) => { if (r.length > 6) return false; const [a, b, c, d] = boxOf(r); return c - a <= 0.25 && d - b <= 0.25; });
    if (!small.some(Boolean)) continue;
    z.rings = z.rings.filter((r, i) => {
      if (!small[i]) return true;
      const depth = z.rings.reduce((n, o, j) => n + (j !== i && o.length > r.length && inRing(o, r[0][0], r[0][1]) ? 1 : 0), 0);
      if (depth % 2 === 1) { dropped += 1; return false; }
      return true;
    });
  }
  return dropped;
}
const dataUrl = (n) => new URL(`../data/${n}`, import.meta.url);

export async function buildSeaFile({ debug = false } = {}) {
  const collection = await loadProvinces();
  const design = JSON.parse(await readFile(dataUrl('sea_zones_design.json'), 'utf8'));
  const land = design.landFile ? JSON.parse(await readFile(dataUrl(design.landFile), 'utf8')).polygons : [];
  const { zones, grid, report, debug: dbg } = computeSeaZones(collection, design, { debug, land });
  report.rasterHolesDropped = dropRasterHoles(zones);
  const ids = collection.features.map((f) => f.properties.id);
  return {
    file: {
      schema: SEA_SCHEMA,
      method: 'acqua = area d\'interesse meno province e terre escluse; celle assegnate al seme più vicino per via d\'acqua (raggio massimo per i passaggi); contorni semplificati. Anelli con regola pari/dispari (i buchi sono isole).',
      quality: 'hypothesis',
      stepDeg: grid.step,
      simplifyTolDeg: design.simplifyTolDeg,
      count: ids.length,
      checksum: idsChecksum(ids),
      zones,
    },
    report,
    debug: dbg,
    grid,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const t0 = Date.now();
  const { file, report } = await buildSeaFile();
  await writeFile(dataUrl('sea_zones.json'), `${JSON.stringify(file)}\n`);
  const pts = file.zones.reduce((a, z) => a + z.rings.reduce((b, r) => b + r.length, 0), 0);
  console.log(`data/sea_zones.json: ${file.zones.length} zone, ${pts} punti, ${Date.now() - t0} ms`);
  console.log(`acqua ${report.waterCells} celle, non assegnate ${report.unassigned} (sacche assegnate: ${report.pocketsAssigned}; masse lasciate fuori: ${report.skippedMasses.join(', ') || 'nessuna'}); buchi di griglia tolti: ${report.rasterHolesDropped}; semi spostati: ${report.snapped.join(', ') || 'nessuno'}`);
}
