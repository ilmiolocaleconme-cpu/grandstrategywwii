// Carica i file in data/ e li valida. Uscita con codice 1 se ci sono errori.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateCatalog } from '../src/data/validate.js';
import { validateAdjacency } from '../src/data/adjacency.js';
import { validateSea } from '../src/data/sea.js';
import { validateLabels } from '../src/data/labels.js';
import { validateCrossingPoints } from '../src/data/crossingPoints.js';
import { validateAutostrade, validateTransport } from '../src/data/transport.js';
import { validateLinks } from '../src/data/links.js';
import { validateCityLinks } from '../src/data/cityLinks.js';
import { validateBuildings } from '../src/data/buildings.js';
import { idsChecksum } from '../src/data/adjacency.js';
import { loadProvinces } from './load-provinces.js';
import { readFile as readFileTerrain } from 'node:fs/promises';
import { validateTerrain } from '../src/data/terrain.js';
import { parseCsv } from '../src/data/csv.js';
import { loadIndustryCatalog, validateIndustryCatalog, validateProvinceIndustry } from '../src/data/industry.js';
import { buildSlotCatalog } from '../src/rules/slots.js';
import { validateRegions } from '../src/data/regions.js';
import { createHash } from 'node:crypto';

const dataDir = new URL('../data/', import.meta.url);

export async function loadCatalog(baseUrl = dataDir) {
  const read = async (name) => JSON.parse(await readFile(new URL(name, baseUrl), 'utf8'));
  return {
    nations: await read('nations.json'),
    resources: await read('resources.json'),
    rivers: await read('rivers.json'),
    crossings: await read('crossings.json'),
    political: await read('political_1936.json'),
    provinces: await loadProvinces(new URL('provinces/', baseUrl)),
    riversGeo: await read('rivers_geo.json'),
    lakes: await read('lakes.json'),
    adjacency: await read('adjacency.json'),
    sea: await read('sea_zones.json'),
    labels: await read('labels.json'),
    crossingPoints: await read('crossing_points.json'),
    transport: await read('transport.json'),
    links: await read('links.json'),
    cityLinks: await read('city_links.json'),
    buildings: await read('buildings.json'),
    cityZones: await read('citta_grandi.json'),
    autostrade: await read('autostrade_1936.json'),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let catalog;
  try {
    catalog = await loadCatalog();
  } catch (error) {
    // file province mancanti, duplicati o nel file sbagliato: si elencano tutti gli errori
    (error.errors ?? [error.message]).forEach((e) => console.error(`ERRORE ${e}`));
    console.log('FALLITO: i file in data/provinces/ non sono coerenti');
    process.exit(1);
  }
  const { ok: catalogOk, errors, warnings } = validateCatalog(catalog);
  const provinceIds = catalog.provinces.features.map((f) => f.properties.id);
  errors.push(...validateAdjacency(catalog.adjacency, provinceIds), ...validateSea(catalog.sea, provinceIds), ...validateLabels(catalog.labels, provinceIds, catalog.sea.zones.map((z) => z.id), [...new Set(catalog.provinces.features.map((f) => f.properties.owner))]));
  errors.push(...validateCrossingPoints(catalog.crossingPoints, { riverIds: new Set(catalog.rivers.map((r) => r.id)), provinceIds }));
  if (catalog.crossingPoints.checksum !== idsChecksum(provinceIds)) errors.push('punti di passaggio: somma di controllo diversa, le province sono cambiate: rigenerare con npm run build:crossing-points');
  errors.push(...validateAutostrade(catalog.autostrade), ...validateTransport(catalog.transport));
  errors.push(...validateLinks(catalog.links, { provinceIds, riverIds: new Set(catalog.rivers.map((r) => r.id)) }));
  errors.push(...validateBuildings(catalog.buildings));
  errors.push(...validateCityLinks(catalog.cityLinks, { zoneIds: new Set(catalog.cityZones.features.map((f) => f.properties.id)), tileIds: new Set(provinceIds), riverIds: new Set(catalog.rivers.map((r) => r.id)) }));
  if (catalog.cityLinks.checksum !== idsChecksum(catalog.cityZones.features.map((f) => f.properties.id))) errors.push('collegamenti urbani: somma di controllo diversa, rigenerare con npm run build:city-links');
  if (catalog.links.checksum !== idsChecksum(provinceIds)) errors.push('collegamenti: somma di controllo diversa, rigenerare con npm run build:links -- <cartella Natural Earth>');
  {
    const motherIds = [...new Set(catalog.provinces.features.map((f) => f.properties.parentProvince ?? f.properties.id))];
    const terrainDoc = JSON.parse(await readFileTerrain(new URL('../data/terrain.json', import.meta.url), 'utf8'));
    errors.push(...validateTerrain(terrainDoc, motherIds, ['P_USSR_CHUKCHI_AUTONOMOUS_OKRUG']));
    const regionsDoc = JSON.parse(await readFileTerrain(new URL('../data/regions.json', import.meta.url), 'utf8'));
    errors.push(...validateRegions(regionsDoc, { provinces: catalog.provinces.features, nationIds: catalog.nations.map((n) => n.id) }));
  }
  {
    // Data Pack v11.1: catalogo industriale, struttura dei file importati e tabella provvisoria delle province
    const text = (p) => readFileTerrain(new URL(`../data/${p}`, import.meta.url), 'utf8');
    const industry = loadIndustryCatalog({ factoriesCsv: await text('industry/factories.csv'), structuresCsv: await text('infrastructure/structures.csv'), categoriesCsv: await text('industry/production_categories.csv') });
    errors.push(...validateIndustryCatalog(industry));
    const source = JSON.parse(await text('PACK_SOURCE.json'));
    for (const [file, sha] of Object.entries(source.files)) {
      const actual = createHash('sha256').update(await readFileTerrain(new URL(`../data/${file.replace(/^data\//, '')}`, import.meta.url))).digest('hex');
      if (actual !== sha) errors.push(`pack: ${file} diverso dal Pack ${source.version} (sha256): reimportare o aggiornare PACK_SOURCE.json`);
    }
    const slotCat = buildSlotCatalog({ provinces: catalog.provinces, zones: catalog.cityZones.features, nations: catalog.nations });
    errors.push(...validateProvinceIndustry(parseCsv(await text('industry/province_industry.csv'), { name: 'province_industry.csv' }), { motherIds: new Set(Object.keys(slotCat.provinces)), cityPartIds: new Set(Object.keys(slotCat.cityParts)) }));
    const crosswalk = parseCsv(await text('core/country_crosswalk.csv'), { name: 'country_crosswalk.csv' });
    const packCountries = new Set(parseCsv(await text('core/countries.csv'), { name: 'countries.csv' }).map((c) => c.country_id));
    const repoIds = new Set(catalog.political.map((p) => p.id));
    for (const c of crosswalk) {
      if (!packCountries.has(c.pack_country_id)) errors.push(`corrispondenza paesi: ${c.pack_country_id} non esiste nel Pack`);
      if (c.repo_political_id && !repoIds.has(c.repo_political_id)) errors.push(`corrispondenza paesi: ${c.repo_political_id} non esiste in political_1936.json`);
    }
    for (const id of packCountries) if (!crosswalk.some((c) => c.pack_country_id === id)) errors.push(`corrispondenza paesi: ${id} del Pack senza riga`);
  }
  const ok = catalogOk && errors.length === 0;
  warnings.forEach((w) => console.warn(`AVVISO ${w}`));
  errors.forEach((e) => console.error(`ERRORE ${e}`));
  console.log(
    `${ok ? 'OK' : 'FALLITO'}: ${catalog.nations.length} nazioni, ${catalog.resources.length} risorse, ` +
      `${catalog.rivers.length} fiumi (${catalog.riversGeo.features.length} tratti), ${catalog.lakes.features.length} laghi, ${catalog.crossings.length} attraversamenti, ` +
      `${catalog.political.length} entità politiche (1936), ${catalog.provinces.features.length} province, ${catalog.adjacency.edges.length} adiacenze, ${catalog.sea.zones.length} zone marittime, ${catalog.labels.nations.length + catalog.labels.provinces.length + catalog.labels.seas.length} nomi in mappa, ${catalog.crossingPoints.count} punti di passaggio, ${catalog.links.counts.links} collegamenti (${catalog.links.counts.bridges} ponti nel grafo), ${catalog.cityLinks.counts.nodes} nodi urbani (${catalog.cityLinks.counts.part} collegamenti fra parti di città)`,
  );
  process.exit(ok ? 0 : 1);
}
