// Rigenera data/crossing_points.json: punti di passaggio calcolati tra fiumi e confini delle province
// (src/data/crossingPoints.js). Da rieseguire quando cambiano province o fiumi (npm run build:crossing-points).
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadProvinces } from './load-provinces.js';
import { buildProvinceIndex } from '../src/data/geometry.js';
import { buildRiverModel } from '../src/data/rivers.js';
import { CROSSING_POINTS_SCHEMA, LEVEL_BASIS, computeCrossingPoints, packCrossingPoints } from '../src/data/crossingPoints.js';
import { idsChecksum } from '../src/data/adjacency.js';

const dataUrl = (name) => new URL(`../data/${name}`, import.meta.url);
const readJson = async (name) => JSON.parse(await readFile(dataUrl(name), 'utf8'));

export async function buildCrossingPointsFile() {
  const provinces = await loadProvinces();
  const catalog = await readJson('rivers.json');
  const geo = await readJson('rivers_geo.json');
  const params = { maxRank: 8, stepKm: 1, bankStepKm: 3, spacingKm: 40, offsetDeg: 0.03, mergeKm: 8 };
  const ids = provinces.features.map((f) => f.properties.id);
  const points = packCrossingPoints(computeCrossingPoints(buildRiverModel(catalog, geo), buildProvinceIndex(provinces), catalog, params), ids);
  return {
    schema: CROSSING_POINTS_SCHEMA,
    method: 'incrocio fiume/confine di provincia (bisezione, passo 1 km) e fiumi che fanno da confine (sonda sulle due rive, un punto ogni 40 km per coppia; passaggi ripetuti entro 8 km uniti)',
    note: 'Candidati geometrici, non ponti storici verificati: nessun dato su strade e ferrovie. Il livello è provvisorio (larghezza del fiume).',
    quality: 'hypothesis',
    levelBasis: LEVEL_BASIS,
    params,
    checksum: idsChecksum(ids),
    provinceRefs: 'indici nell\'elenco ordinato delle province (come adjacency.json)',
    count: points.length,
    points,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const t0 = Date.now();
  const file = await buildCrossingPointsFile();
  await writeFile(dataUrl('crossing_points.json'), `${JSON.stringify(file)}\n`);
  const byLevel = [1, 2, 3].map((l) => file.points.filter((p) => p.level === l).length);
  const byKind = ['border_cross', 'river_border'].map((k) => file.points.filter((p) => p.kind === k).length);
  console.log(`data/crossing_points.json: ${file.count} punti (livelli 1/2/3: ${byLevel.join('/')}; incroci ${byKind[0]}, fiumi-confine ${byKind[1]}) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
