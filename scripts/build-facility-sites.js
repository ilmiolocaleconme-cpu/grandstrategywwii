// Genera data/industry/initial_facility_sites.json: la provincia (o la sponda) di ogni impianto iniziale, con la regola di
// data/industry/facility_placement.json (src/rules/facilityPlacement.js). Rigenerare dopo ogni cambio di initial_industry.json,
// delle province, della popolazione o dei punti risorse: un test controlla che il file sia aggiornato.
// Uso: npm run build:facility-sites
import fs from 'node:fs';
import { loadProvinces } from './load-provinces.js';
import { facilitySitesFile } from '../src/data/facilitySites.js';
import { loadIndustryCatalog } from '../src/data/industry.js';

const j = (p) => JSON.parse(fs.readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const t = (p) => fs.readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const cat = loadIndustryCatalog({ factoriesCsv: t('industry/factories.csv'), structuresCsv: t('infrastructure/structures.csv'), categoriesCsv: t('industry/production_categories.csv'), extraFactoriesCsv: t('industry/factories_extra.csv'), extraStructuresCsv: t('infrastructure/structures_extra.csv') });
const collection = await loadProvinces();
const out = facilitySitesFile({ features: collection.features, j, factoryClassOf: (id) => cat.byId.get(id)?.factory_class ?? null });
fs.writeFileSync(new URL('../data/industry/initial_facility_sites.json', import.meta.url), `${JSON.stringify(out, null, 1)}\n`);
console.log(`impianti collocati: ${Object.keys(out.sites).length}, senza posto: ${out.unplaced.length}`, out.counts);
