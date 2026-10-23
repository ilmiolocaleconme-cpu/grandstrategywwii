// Carica i file in data/ e li valida. Uscita con codice 1 se ci sono errori.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateCatalog } from '../src/data/validate.js';
import { validateAdjacency } from '../src/data/adjacency.js';
import { validateSea } from '../src/data/sea.js';
import { validateLabels } from '../src/data/labels.js';
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
import { buildResourceLocations, validateResourceLocations } from '../src/data/resourceLocations.js';
import { buildProvinceResources, validateProvinceResources } from '../src/data/provinceResources.js';
import { validateFlags, validateDescriptions } from '../src/data/flags.js';
import { playableNations } from '../src/game/state.js';
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
    const choosable = playableNations(catalog.political, catalog.provinces.features.map((f) => f.properties.owner)).map((n) => n.id);
    const wheel = JSON.parse(await readFileTerrain(new URL('../data/nation_order.json', import.meta.url), 'utf8'));
    const politicalIds = new Set(catalog.political.map((e) => e.id));
    if (wheel.schema !== 'nation-order-v1') errors.push(`ruota nazioni: schema ${wheel.schema}`);
    if (new Set(wheel.order).size !== wheel.order.length) errors.push('ruota nazioni: id doppi nell\'ordine');
    for (const id of wheel.order) if (!politicalIds.has(id)) errors.push(`ruota nazioni: ${id} non esiste tra le entità politiche`);
    for (const id of choosable) if (!wheel.order.includes(id)) errors.push(`ruota nazioni: ${id} è scegliibile ma manca dall'ordine`);
    if (!wheel.order.includes(wheel.start)) errors.push(`ruota nazioni: la nazione iniziale ${wheel.start} non è nell'ordine`);
    errors.push(...validateFlags(JSON.parse(await readFileTerrain(new URL('../data/flags.json', import.meta.url), 'utf8')), { nationIds: wheel.order }));
    errors.push(...validateDescriptions(JSON.parse(await readFileTerrain(new URL('../data/nation_descriptions.json', import.meta.url), 'utf8')), { nationIds: wheel.order }));
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
  {
    // Luoghi delle risorse (riferimento, non storico): copia grezza non alterata, CSV generati allineati allo script, province esistenti
    const text = (p) => readFileTerrain(new URL(`../data/${p}`, import.meta.url), 'utf8');
    const src = JSON.parse(await text('resources/SOURCE.json'));
    const actual = createHash('sha256').update(await readFileTerrain(new URL(`../data/${src.file.replace(/^data\//, '')}`, import.meta.url))).digest('hex');
    if (actual !== src.sha256) errors.push(`risorse: ${src.file} diverso dalla copia ricevuta (sha256)`);
    const built = buildResourceLocations({ rawCsv: await text('resources/risorse_riferimento.csv'), addedCsv: await text('resources/risorse_aggiunte.csv'), notesCsv: await text('resources/location_notes.csv'), placesCsv: await text('resources/place_provinces.csv') });
    const motherIds = new Set(catalog.provinces.features.map((f) => f.properties.parentProvince ?? f.properties.id));
    errors.push(...validateResourceLocations(built, { resourceIds: new Set(catalog.resources.map((r) => r.id)), countryIds: new Set(catalog.political.map((p) => p.id)), motherIds }));
    for (const u of built.unmapped) errors.push(`risorse: ${u.location_id} luogo senza provincia (${u.country_id}/${u.place})`);
    const onDisk = parseCsv(await text('resources/resource_locations.csv'), { name: 'resource_locations.csv' });
    if (onDisk.length !== built.locations.length) errors.push('risorse: resource_locations.csv non allineato alle sorgenti, rigenerare con npm run build:resource-locations');
    const linksOnDisk = parseCsv(await text('resources/location_provinces.csv'), { name: 'location_provinces.csv' });
    if (linksOnDisk.length !== built.links.length) errors.push('risorse: location_provinces.csv non allineato alle sorgenti, rigenerare con npm run build:resource-locations');
    // risorse per provincia (livello Risorse della mappa): file generato dai due CSV, id noti e province esistenti
    const pr = JSON.parse(await text('resources/province_resources.json'));
    errors.push(...validateProvinceResources(pr, { resourceIds: new Set(catalog.resources.map((r) => r.id)), provinceIds: motherIds }));
    if (JSON.stringify(pr) !== JSON.stringify(buildProvinceResources(onDisk, linksOnDisk))) errors.push('risorse: province_resources.json non allineato ai CSV, rigenerare con npm run build:province-resources');
  }
  const ok = catalogOk && errors.length === 0;
  warnings.forEach((w) => console.warn(`AVVISO ${w}`));
  errors.forEach((e) => console.error(`ERRORE ${e}`));
  console.log(
    `${ok ? 'OK' : 'FALLITO'}: ${catalog.nations.length} nazioni, ${catalog.resources.length} risorse, ` +
      `${catalog.rivers.length} fiumi (${catalog.riversGeo.features.length} tratti), ${catalog.lakes.features.length} laghi, ${catalog.crossings.length} attraversamenti, ` +
      `${catalog.political.length} entità politiche (1936), ${catalog.provinces.features.length} province, ${catalog.adjacency.edges.length} adiacenze, ${catalog.sea.zones.length} zone marittime, ${catalog.labels.nations.length + catalog.labels.provinces.length + catalog.labels.seas.length} nomi in mappa, ${catalog.links.counts.links} collegamenti (${catalog.links.counts.bridges} ponti nel grafo), ${catalog.cityLinks.counts.nodes} nodi urbani (${catalog.cityLinks.counts.part} collegamenti fra parti di città)`,
  );
  process.exit(ok ? 0 : 1);
}
