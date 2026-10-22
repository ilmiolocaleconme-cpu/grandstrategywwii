// Genera data/industry/province_industry.csv: potenziale e capacità industriale PROVVISORI di ogni provincia madre e di ogni parte
// di città, dalle regole di src/rules/slots.js (10 per parte di città, 14 per provincia e per ogni parte di capitale). Non sono dati
// storici: `basis = provisional_uniform`, `status = PROVISIONAL`. Capacità = potenziale finché non esiste il sistema di sviluppo.
//   node scripts/build-province-industry.js
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadProvinces } from './load-provinces.js';
import { buildSlotCatalog } from '../src/rules/slots.js';
import { BASIS_PROVISIONAL_UNIFORM, PROVINCE_INDUSTRY_HEADER } from '../src/data/industry.js';
import { toCsv } from '../src/data/csv.js';

const dataUrl = (name) => new URL(`../data/${name}`, import.meta.url);
const readJson = async (name) => JSON.parse(await readFile(dataUrl(name), 'utf8'));

export async function provinceIndustryRows() {
  const cat = buildSlotCatalog({ provinces: await loadProvinces(), zones: (await readJson('citta_grandi.json')).features, nations: await readJson('nations.json') });
  const row = (id, kind, n) => ({ unit_id: id, unit_kind: kind, potential_slots: n, capacity_slots: n, basis: BASIS_PROVISIONAL_UNIFORM, status: 'PROVISIONAL' });
  const provinces = Object.entries(cat.provinces).filter(([, n]) => n > 0).map(([id, n]) => row(id, 'province', n));
  const cityParts = Object.entries(cat.cityParts).map(([id, n]) => row(id, 'city_part', n));
  return [...provinces, ...cityParts].sort((a, b) => (a.unit_kind === b.unit_kind ? (a.unit_id < b.unit_id ? -1 : 1) : a.unit_kind < b.unit_kind ? 1 : -1));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rows = await provinceIndustryRows();
  await writeFile(dataUrl('industry/province_industry.csv'), toCsv(PROVINCE_INDUSTRY_HEADER, rows));
  console.log(`data/industry/province_industry.csv: ${rows.length} righe (${rows.filter((r) => r.unit_kind === 'province').length} province, ${rows.filter((r) => r.unit_kind === 'city_part').length} parti di città)`);
}
