// Rigenera data/sea_zones.json da data/sea_zones_design.json e dalle province (npm run build:sea).
// Va rieseguito quando cambiano le province o il progetto: la somma di controllo degli id lo impone al caricamento.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadProvinces } from './load-provinces.js';
import { computeSeaZones } from './sea-compute.js';
import { idsChecksum } from '../src/data/adjacency.js';

export const SEA_SCHEMA = 'sea-zones-v1';
const dataUrl = (n) => new URL(`../data/${n}`, import.meta.url);

export async function buildSeaFile({ debug = false } = {}) {
  const collection = await loadProvinces();
  const design = JSON.parse(await readFile(dataUrl('sea_zones_design.json'), 'utf8'));
  const land = design.landFile ? JSON.parse(await readFile(dataUrl(design.landFile), 'utf8')).polygons : [];
  const { zones, grid, report, debug: dbg } = computeSeaZones(collection, design, { debug, land });
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
  console.log(`acqua ${report.waterCells} celle, non assegnate ${report.unassigned} (sacche assegnate: ${report.pocketsAssigned}; masse lasciate fuori: ${report.skippedMasses.join(', ') || 'nessuna'}); semi spostati: ${report.snapped.join(', ') || 'nessuno'}`);
}
