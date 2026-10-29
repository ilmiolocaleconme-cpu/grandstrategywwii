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
import { validateScores } from '../src/data/resourcePoints.js';
import { validateTradeProfiles } from '../src/data/tradeProfiles.js';
import { validateRecipes, validateExtractionScale } from '../src/data/recipes.js';
import { validateHydro } from '../src/data/hydro.js';
import { validateFactoryLevels } from '../src/data/factoryLevels.js';
import { validateFertilizerEffect, validateHorseBreeding } from '../src/data/livestock.js';
import { validateHospitalCare } from '../src/data/hospitals.js';
import { validateFuelConsumption, validateFuelStorage } from '../src/data/fuel.js';
import { validateAmmoConsumption } from '../src/data/ammo.js';
import { validateUnits, validateOobEstimates } from '../src/data/units.js';
import { unitsBuilt } from './build-units.js';
import { validateOfficers } from '../src/data/officers.js';
import { officersBuilt } from './build-officers.js';
import { validateTemplate } from '../src/data/templates.js';
import { validateCadreTemplates } from '../src/data/cadres.js';
import { validateDeployment } from '../src/data/deployment.js';
import { validateConditionConfig } from '../src/rules/divisionCondition.js';
import { deploymentBuilt } from './build-deployment.js';
import { validateReadiness } from '../src/rules/readiness.js';
import { validateTankModels } from '../src/data/tankModels.js';
import { readdir } from 'node:fs/promises';
import { validateEconomy } from '../src/data/economy.js';
import { validateInitialIndustry } from '../src/data/initialIndustry.js';
import { validateInitialStocks } from '../src/data/initialStocks.js';
import { validateInitialCash } from '../src/data/initialCash.js';
import { validatePopulation } from '../src/data/nationPopulation.js';
import { buildNations } from '../src/game/economyState.js';
import { validateProvinceDataset } from '../src/data/provinceData.js';
import { populationBuilt, populationFile } from './build-province-population.js';
import { validateProduction } from '../src/data/production.js';
import { validateExtractionFactors, validateLocationsExtra } from '../src/data/extraction.js';
import { productionBuilt, productionFile } from './build-production.js';
import { hydroBuilt } from './build-hydro.js';
import { resourcePointsFile } from './build-resource-points.js';
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
    const industry = loadIndustryCatalog({ factoriesCsv: await text('industry/factories.csv'), structuresCsv: await text('infrastructure/structures.csv'), categoriesCsv: await text('industry/production_categories.csv'), extraFactoriesCsv: await text('industry/factories_extra.csv'), extraStructuresCsv: await text('infrastructure/structures_extra.csv') });
    errors.push(...validateIndustryCatalog(industry));
    // Ricette e scala di estrazione (Fase 0 Risorse + Industria): riferimenti a fabbriche e risorse esistenti
    const recipesDoc = JSON.parse(await text('industry/recipes.json'));
    errors.push(...validateRecipes(recipesDoc, { factoriesById: industry.byId, resources: catalog.resources }));
    errors.push(...validateFactoryLevels(JSON.parse(await text('industry/factory_levels.json'))));
    errors.push(...validateExtractionScale(JSON.parse(await text('resources/extraction_scale.json')), { recipes: recipesDoc, resources: catalog.resources }));
    errors.push(...validateFertilizerEffect(JSON.parse(await text('agriculture/fertilizer_effect.json')), { resources: catalog.resources }));
    errors.push(...validateHorseBreeding(JSON.parse(await text('agriculture/horse_breeding.json')), { resources: catalog.resources, recipes: recipesDoc, entityIds: new Set(catalog.political.map((e) => e.id)) }));
    errors.push(...validateHospitalCare(JSON.parse(await text('medical/hospital_care.json')), { resources: catalog.resources, buildings: catalog.buildings.buildings }));
    errors.push(...validateFuelConsumption(JSON.parse(await text('military/fuel_consumption.json')), { resources: catalog.resources }));
    errors.push(...validateAmmoConsumption(JSON.parse(await text('military/ammo_consumption.json')), { resources: catalog.resources }));
    errors.push(...validateFuelStorage(JSON.parse(await text('military/fuel_storage.json')), { structureIds: industry.structures, buildingIds: new Set(catalog.buildings.buildings.map((b) => b.id)) }));
    errors.push(...validateEconomy(JSON.parse(await text('economy/economy.json')), { resources: catalog.resources, recipes: JSON.parse(await text('industry/recipes.json')) }));
    // Scambi 1930 (ipotesi qualitativa): nazioni e prodotti esistenti, copia del testo ricevuto invariata (sha256)
    errors.push(...validateTradeProfiles(JSON.parse(await text('trade/trade_profiles_1930.json')), { nationIds: new Set(JSON.parse(await text('political_1936.json')).map((e) => e.id)), productIds: new Set(catalog.resources.map((r) => r.id)) }));
    {
      const src = JSON.parse(await text('trade/SOURCE.json'));
      if (createHash('sha256').update(await readFile(new URL(`../${src.file}`, import.meta.url))).digest('hex') !== src.sha256) errors.push('scambi: il testo ricevuto è diverso dalla copia registrata (sha256)');
    }
    errors.push(...validateInitialIndustry(JSON.parse(await text('industry/initial_industry.json')), { factoriesById: industry.byId, recipes: recipesDoc, entityIds: new Set(JSON.parse(await text('political_1936.json')).map((e) => e.id)), nationIds: JSON.parse(await text('nations.json')).map((n) => n.id) }));
    errors.push(...validateInitialStocks(JSON.parse(await text('industry/initial_stocks.json')), { resourceIds: new Set(catalog.resources.map((r) => r.id)), industry: JSON.parse(await text('industry/initial_industry.json')) }));
    {
      const [pol, nat, ind, stk] = [JSON.parse(await text('political_1936.json')), JSON.parse(await text('nations.json')), JSON.parse(await text('industry/initial_industry.json')), JSON.parse(await text('industry/initial_stocks.json'))];
      const owners = new Set(Object.keys(buildNations({ political: pol, nationIds: nat.map((n) => n.id), industry: ind, stocks: stk })));
      errors.push(...validateInitialCash(JSON.parse(await text('industry/initial_cash.json')), { ownerIds: owners }));
      errors.push(...validatePopulation(JSON.parse(await text('population/population.json')), { ownerIds: owners }));
    }
    // Dataset per provincia (popolazione, agricoltura, presenza militare): riferimenti a province madri e al Pack, valori nei limiti
    const motherIdsAll = new Set(catalog.provinces.features.map((f) => f.properties.parentProvince ?? f.properties.id));
    const ownerOfMother = new Map(catalog.provinces.features.map((f) => [f.properties.parentProvince ?? f.properties.id, f.properties.owner]));
    const popDoc = JSON.parse(await text('population/province_population.json'));
    for (const [kind, file, doc] of [['population', '', popDoc], ['agriculture', 'agriculture/province_agriculture.json'], ['military', 'military/province_presence.json']]) {
      errors.push(...validateProvinceDataset(kind, doc ?? JSON.parse(await text(file)), { motherIds: motherIdsAll, structureIds: industry.structures, ownerOf: ownerOfMother }));
    }
    // Popolazione: CSV dell'utente non modificato e file generato allineato (totali nazionali distribuiti sulle province)
    for (const sh of JSON.parse(await text('population/SOURCE.json')).files) {
      if (createHash('sha256').update(await readFile(new URL(`../data/population/${sh.file}`, import.meta.url))).digest('hex') !== sh.sha256) errors.push(`popolazione: ${sh.file} diverso dalla copia ricevuta (sha256)`);
    }
    const popBuilt = await populationBuilt();
    errors.push(...popBuilt.errors, ...popBuilt.noProvinces.map((o) => `popolazione: nessuna provincia per ${o}`));
    if (JSON.stringify(popDoc) !== JSON.stringify(populationFile(popBuilt))) errors.push('popolazione: province_population.json non allineato al CSV e alle province, rigenerare con npm run build:population');
    // Produzione 1936 (CSV dell'utente): copie non modificate e file generato allineato
    for (const sh of JSON.parse(await text('resources/SOURCE_PRODUZIONE.json')).files) {
      if (createHash('sha256').update(await readFile(new URL(`../data/resources/${sh.file}`, import.meta.url))).digest('hex') !== sh.sha256) errors.push(`produzione: ${sh.file} diverso dalla copia ricevuta (sha256)`);
    }
    const prodDoc = JSON.parse(await text('resources/production_1936.json'));
    errors.push(...validateProduction(prodDoc, { resources: catalog.resources, provinceIds: new Set(catalog.provinces.features.map((f) => f.properties.id)) }));
    if (JSON.stringify(prodDoc) !== JSON.stringify(productionFile(await productionBuilt()))) errors.push('produzione: production_1936.json non allineato ai CSV, rigenerare con npm run build:production');
    errors.push(...validateExtractionFactors(JSON.parse(await text('resources/extraction_factors.json')), { resources: catalog.resources, production: prodDoc }));
    errors.push(...validateLocationsExtra(JSON.parse(await text('resources/resource_locations_extra.json')), { resources: catalog.resources, production: prodDoc, provinceIds: new Set(catalog.provinces.features.map((f) => f.properties.id)), pointsByProvince: JSON.parse(await text('resources/resource_points.json')).byProvince }));
    // Catalogo unità (CSV dell'utente): copia non modificata, file generato allineato, revisioni coerenti
    {
      const unitsDoc = JSON.parse(await text('units/units.json'));
      errors.push(...validateConditionConfig(JSON.parse(await text('units/condition_config.json'))));
      const deployDoc = JSON.parse(await text('units/deployment_1936.json'));
      errors.push(...validateDeployment(deployDoc, { unitIds: new Set(unitsDoc.units.map((u) => u.id)), motherIds: new Set(catalog.provinces.features.map((f) => f.properties.parentProvince ?? f.properties.id)) }).map((e) => `dislocazione: ${e}`));
      if (JSON.stringify(deployDoc) !== JSON.stringify(await deploymentBuilt())) errors.push('dislocazione: deployment_1936.json non allineato, rigenerare con node scripts/build-deployment.js');
      errors.push(...validateUnits(unitsDoc, { nationIds: new Set(catalog.political.map((p) => p.id)) }));
      errors.push(...validateOobEstimates(parseCsv(await text('units/oob_1936_stime.csv'), { name: 'oob_1936_stime' }), { nationIds: new Set(catalog.political.map((p) => p.id)) }));
      const ub = await unitsBuilt();
      if (createHash('sha256').update(await readFile(new URL('../data/units/source/unita_cronologia_1935_1945.csv', import.meta.url))).digest('hex') !== unitsDoc.source.sha256) errors.push('unità: CSV sorgente diverso da quello registrato in units.json (sha256)');
      for (const src of unitsDoc.sources1936 ?? []) if (createHash('sha256').update(await readFile(new URL(`../data/units/${src.file}`, import.meta.url))).digest('hex') !== src.sha256) errors.push(`unità: ${src.file} diverso da quello registrato in units.json (sha256)`);
      if (JSON.stringify(unitsDoc) !== JSON.stringify(ub)) errors.push('unità: units.json non allineato a CSV e revisioni, rigenerare con npm run build:units');
    }
    // Ufficiali (CSV dell'utente): copie non modificate, file generato allineato, revisioni coerenti
    {
      const officersDoc = JSON.parse(await text('officers/officers.json'));
      errors.push(...validateOfficers(officersDoc, { nationIds: new Set(catalog.political.map((p) => p.id)) }));
      for (const f of [officersDoc.source, officersDoc.cardTemplate]) if (createHash('sha256').update(await readFile(new URL(`../data/officers/${f.file}`, import.meta.url))).digest('hex') !== f.sha256) errors.push(`ufficiali: ${f.file} diverso da quello registrato in officers.json (sha256)`);
      if (JSON.stringify(officersDoc) !== JSON.stringify(await officersBuilt())) errors.push('ufficiali: officers.json non allineato a CSV e revisioni, rigenerare con npm run build:officers');
    }
    for (const f of ['carri_tedeschi_1934_1945.json', 'carri_cecoslovacchi_1935_1938.json']) errors.push(...validateTankModels(JSON.parse(await text(`units/models/${f}`))));
    errors.push(...validateReadiness(JSON.parse(await text('units/readiness.json'))));
    // Template di divisione (previsto/effettivo, basi e fonti)
    for (const f of (await readdir(new URL('../data/units/templates/', import.meta.url))).filter((n) => /^divisione_.*\.json$/.test(n)).sort()) {
      errors.push(...validateTemplate(JSON.parse(await text(`units/templates/${f}`))).map((e) => `template ${f}: ${e}`));
    }
    // Quadri di divisione (template per nazione, espansione in divisione tramite mobilitazione)
    {
      const divisionIds = new Set();
      for (const f of (await readdir(new URL('../data/units/templates/', import.meta.url))).filter((n) => /^divisione_.*\.json$/.test(n))) divisionIds.add(JSON.parse(await text(`units/templates/${f}`)).id);
      errors.push(...validateCadreTemplates(JSON.parse(await text('units/templates/quadri_1936.json')), { nationIds: new Set(catalog.political.map((p) => p.id)), templateIds: divisionIds }).map((e) => `quadri: ${e}`));
    }
    // Centrali idroelettriche (CSV dell'utente): copia non modificata, provincia ricavata dalle coordinate
    for (const sh of JSON.parse(await text('resources/SOURCE_IDRO.json')).files) {
      if (createHash('sha256').update(await readFile(new URL(`../data/resources/${sh.file}`, import.meta.url))).digest('hex') !== sh.sha256) errors.push(`idro: ${sh.file} diverso dalla copia ricevuta (sha256)`);
    }
    const hydroDoc = JSON.parse(await text('resources/hydro_plants.json'));
    const hb = await hydroBuilt();
    errors.push(...validateHydro(hydroDoc, { motherIds: new Set(catalog.provinces.features.map((f) => f.properties.parentProvince ?? f.properties.id)), builtUnmapped: hb.unmapped, builtAmbiguous: hb.ambiguous }));
    if (JSON.stringify(hydroDoc.plants) !== JSON.stringify(hb.plants)) errors.push('idro: hydro_plants.json non allineato al CSV e alle province, rigenerare con npm run build:hydro');
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
    const locationsExtra = JSON.parse(await text('resources/resource_locations_extra.json'));
    if (JSON.stringify(pr) !== JSON.stringify(buildProvinceResources(onDisk, linksOnDisk, locationsExtra))) errors.push('risorse: province_resources.json non allineato ai CSV e alle posizioni aggiuntive, rigenerare con npm run build:province-resources');
    // punteggi di output 1-10 e tiratura a punti: CSV ricevuto non alterato, punteggi validi, file generato allineato
    const sp = JSON.parse(await text('resources/SOURCE_PUNTEGGI.json'));
    const spActual = createHash('sha256').update(await readFileTerrain(new URL(`../data/${sp.file.replace(/^data\//, '')}`, import.meta.url))).digest('hex');
    if (spActual !== sp.sha256) errors.push(`punteggi: ${sp.file} diverso dalla copia ricevuta (sha256)`);
    errors.push(...validateScores(parseCsv(await text('resources/punteggi_output.csv'), { name: 'punteggi_output.csv' }), onDisk));
    if (JSON.stringify(JSON.parse(await text('resources/resource_points.json'))) !== JSON.stringify(await resourcePointsFile())) errors.push('punteggi: resource_points.json non allineato, rigenerare con npm run build:resource-points');
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
