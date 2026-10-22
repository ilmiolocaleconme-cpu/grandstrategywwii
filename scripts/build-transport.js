// Rigenera data/transport.json (rete di strade e ferrovie, INGRESSO di scripts/build-links.js; la mappa usa solo
// data/links.json) dai dati Natural Earth 10m (pubblico dominio). I file sorgente (~90 MB) NON stanno nel
// repository: si scaricano con
//   git clone --depth 1 --filter=blob:none --sparse https://github.com/nvkelso/natural-earth-vector ne
//   git -C ne sparse-checkout set --no-cone /geojson/ne_10m_roads.geojson /geojson/ne_10m_railroads.geojson
// e si passa la cartella `ne/geojson`:  node scripts/build-transport.js <cartella>   (oppure NE_DIR=<cartella>)
// `npm run build:transport -- <cartella>`.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadProvinces } from './load-provinces.js';
import { buildProvinceIndex } from '../src/data/geometry.js';
import { lineLengthKm } from '../src/data/rivers.js';
import { idsChecksum } from '../src/data/adjacency.js';
import { MOTORWAY_RANK, TRANSPORT_SCHEMA, railLevel, roadLevel, simplify, splitByAutostrade } from '../src/data/transport.js';

const dataUrl = (name) => new URL(`../data/${name}`, import.meta.url);
const readJson = async (name) => JSON.parse(await readFile(dataUrl(name), 'utf8'));
const r3 = (x) => Math.round(x * 1e3) / 1e3;

export const DEFAULT_PARAMS = { roadMaxRank: 6, railMaxRank: 8, simplifyDeg: 0.01, minInsideShare: 0.5, mergeDeg: 0.03, thinDeg: 0.07 };

const linesOf = (g) => (!g ? [] : g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []);

/** Quota di punti campionati (al massimo 12 per linea) che cadono in una provincia. */
function insideShare(index, coords) {
  const step = Math.max(1, Math.floor(coords.length / 12));
  let n = 0;
  let hit = 0;
  for (let i = 0; i < coords.length; i += step) { n += 1; if (index.provincesAt(coords[i][0], coords[i][1]).length > 0) hit += 1; }
  return n === 0 ? 0 : hit / n;
}

export async function buildTransportFiles(srcDir, params = DEFAULT_PARAMS) {
  const provinces = await loadProvinces();
  const ids = provinces.features.map((f) => f.properties.id);
  const index = buildProvinceIndex(provinces);
  const au = await readJson('autostrade_1936.json');
  const auStats = new Map(au.autostrade.map((a) => [a.id, { id: a.id, name: a.name, fromYear: a.fromYear, matchedKm: 0 }]));
  const read = async (n) => JSON.parse(await readFile(path.join(srcDir, n), 'utf8')).features;

  const lines = [];
  const emit = (k, rank, level, coords, extra = {}) => {
    const s = simplify(coords, params.simplifyDeg);
    lines.push({ k, level, rank, ...extra, c: s.flatMap(([x, y]) => [r3(x), r3(y)]) });
  };
  const add = (k, props, level, parts) => {
    for (const coords of parts) {
      if (coords.length < 2 || insideShare(index, coords) < params.minInsideShare) continue;
      if (k === 'road' && (props.expressway === 1 || props.type === 'Major Highway')) {
        // le prime autostrade (data/autostrade_1936.json) prendono il livello 3, il resto dell'autostrada moderna resta a 2
        for (const piece of splitByAutostrade(coords, au.autostrade, au.snapKm)) {
          if (piece.auto === null) { if (props.scalerank <= params.roadMaxRank) emit(k, props.scalerank, level, piece.coords); continue; } // fuori corridoio vale il filtro di importanza
          const a = au.autostrade.find((x) => x.id === piece.auto);
          auStats.get(a.id).matchedKm += lineLengthKm(piece.coords);
          emit(k, Math.min(props.scalerank, MOTORWAY_RANK), 3, piece.coords, { n: a.name, y: a.fromYear });
        }
      } else emit(k, props.scalerank, level, coords);
    }
  };
  for (const f of await read('ne_10m_roads.geojson')) {
    const p = f.properties;
    const level = roadLevel({ type: p.type, featurecla: p.featurecla, expressway: p.expressway });
    const motorway = p.expressway === 1 || p.type === 'Major Highway';
    if (level === null || (p.scalerank > params.roadMaxRank && !motorway)) continue; // le autostrade di rango basso servono lo stesso: nel corridoio delle prime autostrade si tengono
    add('road', p, level, linesOf(f.geometry));
  }
  for (const f of await read('ne_10m_railroads.geojson')) {
    const p = f.properties;
    const level = railLevel({ scalerank: p.scalerank, featurecla: p.featurecla });
    if (level === null || p.scalerank > params.railMaxRank) continue;
    add('rail', p, level, linesOf(f.geometry));
  }
  lines.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : a.level - b.level || a.c[0] - b.c[0] || a.c[1] - b.c[1]));
  const perKind = { road: 0, rail: 0 };
  const outLines = lines.map((l) => { perKind[l.k] += 1; return { id: `${l.k === 'road' ? 'RD' : 'RL'}_${String(perKind[l.k]).padStart(5, '0')}`, ...l }; });

  const common = {
    quality: 'hypothesis',
    source: 'Natural Earth 10m roads e railroads (pubblico dominio), rete moderna: non è quella del 1936',
    params,
    checksum: idsChecksum(ids),
  };
  return { transport: { schema: TRANSPORT_SCHEMA, ...common, count: outLines.length, perKind, autostrade: [...auStats.values()].map((a) => ({ ...a, matchedKm: Math.round(a.matchedKm) })), lines: outLines } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const src = process.argv[2] ?? process.env.NE_DIR;
  if (!src) { console.error('uso: node scripts/build-transport.js <cartella con ne_10m_roads.geojson e ne_10m_railroads.geojson>'); process.exit(2); }
  const { transport } = await buildTransportFiles(src);
  const tw = JSON.stringify(transport);
  await writeFile(dataUrl('transport.json'), `${tw}\n`);
  const vert = transport.lines.reduce((n, l) => n + l.c.length / 2, 0);
  console.log(`data/transport.json: ${transport.count} tratti (strade ${transport.perKind.road}, ferrovie ${transport.perKind.rail}), ${vert} vertici, ${(tw.length / 1e3).toFixed(0)} kB`);
  for (const a of transport.autostrade) console.log(`  ${a.matchedKm < 5 ? 'ATTENZIONE ' : ''}${a.id}: ${a.matchedKm} km agganciati`);
}
