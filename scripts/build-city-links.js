// Rigenera data/city_links.json: i nodi di movimento delle zone urbane (src/data/cityLinks.js).
// Ingressi: data/citta_grandi.json, data/provinces/*.json, data/rivers.json, data/rivers_geo.json. Non servono dati esterni.
//   node scripts/build-city-links.js        (oppure npm run build:city-links)
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadProvinces } from './load-provinces.js';
import { buildProvinceIndex } from '../src/data/geometry.js';
import { buildRiverSegmentGrid } from '../src/data/transport.js';
import { idsChecksum } from '../src/data/adjacency.js';
import { CITY_LINKS_SCHEMA, buildCityGraph, validateCityLinks } from '../src/data/cityLinks.js';

const dataUrl = (name) => new URL(`../data/${name}`, import.meta.url);
const readJson = async (name) => JSON.parse(await readFile(dataUrl(name), 'utf8'));

export async function buildCityLinksFile() {
  const provinces = await loadProvinces();
  const zones = (await readJson('citta_grandi.json')).features;
  const rivers = await readJson('rivers.json');
  const grid = buildRiverSegmentGrid(await readJson('rivers_geo.json'));
  const widthOf = new Map(rivers.map((r) => [r.id, r.widthClass]));
  const { nodes, links } = buildCityGraph({ zones, tiles: provinces.features, index: buildProvinceIndex(provinces), grid, widthOf });
  const part = links.filter((l) => l.type === 'part');
  return {
    schema: CITY_LINKS_SCHEMA,
    quality: 'hypothesis',
    method: 'una zona urbana = un nodo di movimento; accesso al tassello di provincia che la contiene (da lì la rete di data/links.json); fra le parti della stessa città, collegamenti con ponte o guado dove la retta incrocia un fiume',
    source: 'data/citta_grandi.json (NE urban areas 10m), fiumi Natural Earth 10m; ponti e rete moderni, non del 1936',
    checksum: idsChecksum(zones.map((z) => z.properties.id)),
    counts: { nodes: nodes.length, access: links.length - part.length, part: part.length, bridges: part.filter((l) => l.crossing?.kind === 'bridge').length, fords: part.filter((l) => l.crossing?.kind === 'ford').length, tileNearest: nodes.filter((n) => n.tileHow === 'nearest').length },
    nodes,
    links,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = await buildCityLinksFile();
  const provinces = await loadProvinces();
  const errors = validateCityLinks(file, { zoneIds: new Set(file.nodes.map((n) => n.id)), tileIds: new Set(provinces.features.map((f) => f.properties.id)) });
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  await writeFile(dataUrl('city_links.json'), `${JSON.stringify(file)}\n`);
  console.log(`data/city_links.json: ${file.counts.nodes} nodi, ${file.counts.access} accessi, ${file.counts.part} collegamenti fra parti (${file.counts.bridges} ponti, ${file.counts.fords} guadi); ${file.counts.tileNearest} zone agganciate al tassello più vicino`);
}
