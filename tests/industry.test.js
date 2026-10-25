// Catalogo industriale del Data Pack v11.1 e tabella provvisoria province/città (Fase B, solo dati: nessuna regola di gioco).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseCsv } from '../src/data/csv.js';
import { loadIndustryCatalog, occupiesSlot, productionCategoryOf, validateIndustryCatalog, validateProvinceIndustry, BASIS_PROVISIONAL_UNIFORM } from '../src/data/industry.js';
import { SLOT_CAPACITY, buildSlotCatalog } from '../src/rules/slots.js';
import { loadProvinces } from '../scripts/load-provinces.js';

const url = (p) => new URL(`../data/${p}`, import.meta.url);
const text = (p) => readFileSync(url(p), 'utf8');
const json = (p) => JSON.parse(text(p));
const catalog = () => loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv') });

test('Pack: i file importati coincidono con lo sha256 registrato', () => {
  const src = json('PACK_SOURCE.json');
  assert.equal(src.version, 'v11.1');
  for (const [file, sha] of Object.entries(src.files)) assert.equal(createHash('sha256').update(readFileSync(url(file.replace(/^data\//, '')))).digest('hex'), sha, file);
});

test('catalogo: valido, 18 fabbriche industriali su 20 tipi, energia e agricoltura fuori dagli slot', () => {
  const cat = catalog();
  assert.deepEqual(validateIndustryCatalog(cat), []);
  assert.equal(cat.factories.length, 20);
  const slotted = cat.factories.filter(occupiesSlot);
  assert.equal(slotted.length, 18);
  assert.deepEqual(cat.factories.filter((f) => !occupiesSlot(f)).map((f) => f.factory_class).sort(), ['agriculture', 'energy']);
  assert.equal(cat.categories.size, 5);
});

test('catalogo: ogni struttura delle fabbriche esiste e un riferimento rotto viene segnalato', () => {
  const cat = catalog();
  const rotto = { ...cat, factories: [{ ...cat.factories[0], structure_id: 'FAC-NON-ESISTE' }, ...cat.factories.slice(1)] };
  assert.ok(validateIndustryCatalog(rotto).some((e) => /struttura inesistente/.test(e)));
  const dup = { ...cat, factories: [cat.factories[0], cat.factories[0]] };
  assert.ok(validateIndustryCatalog(dup).some((e) => /duplicato/.test(e)));
});

test('catalogo: productionCategoryOf usa solo le 5 categorie canoniche', () => {
  const cat = catalog();
  const found = new Set(cat.factories.map((f) => productionCategoryOf(f, cat)).filter(Boolean));
  for (const id of found) assert.ok(cat.categories.has(id));
});

test('corrispondenza paesi: GER→DEU, SOV→USSR, OTHER senza controparte, tutti i paesi del Pack coperti', () => {
  const cw = parseCsv(text('core/country_crosswalk.csv'));
  const map = Object.fromEntries(cw.map((c) => [c.pack_country_id, c.repo_political_id]));
  assert.equal(map.GER, 'DEU');
  assert.equal(map.SOV, 'USSR');
  assert.equal(map.OTHER, '');
  const pack = parseCsv(text('core/countries.csv')).map((c) => c.country_id);
  assert.deepEqual(pack.slice().sort(), cw.map((c) => c.pack_country_id).sort());
  const repo = new Set(json('political_1936.json').map((p) => p.id));
  for (const c of cw) if (c.repo_political_id) assert.ok(repo.has(c.repo_political_id), c.repo_political_id);
});

test('province_industry: coerente con il catalogo slot (2476 province, 732 parti di città, 10/14/14), capacità ≤ potenziale, provvisoria', async () => {
  const slotCat = buildSlotCatalog({ provinces: await loadProvinces(), zones: json('citta_grandi.json').features, nations: json('nations.json') });
  const rows = parseCsv(text('industry/province_industry.csv'));
  const ctx = { motherIds: new Set(Object.keys(slotCat.provinces)), cityPartIds: new Set(Object.keys(slotCat.cityParts)) };
  assert.deepEqual(validateProvinceIndustry(rows, ctx), []);
  const prov = rows.filter((r) => r.unit_kind === 'province');
  const parts = rows.filter((r) => r.unit_kind === 'city_part');
  assert.equal(prov.length, 2476);
  assert.equal(parts.length, 732);
  assert.ok(prov.every((r) => Number(r.potential_slots) === SLOT_CAPACITY.province && r.basis === BASIS_PROVISIONAL_UNIFORM && r.status === 'PROVISIONAL'));
  assert.equal(prov.reduce((s, r) => s + Number(r.potential_slots), 0) + parts.reduce((s, r) => s + Number(r.potential_slots), 0), 42176); // 22324 + 1418 province del resto del mondo x 14 slot (uniformi e provvisorie, come tutte)
  // le 3 province-città (Budapest, Riga, Bucarest) non hanno slot di provincia: nessuna riga "province" per le loro madri
  for (const [id, n] of Object.entries(slotCat.provinces)) assert.equal(rows.some((r) => r.unit_kind === 'province' && r.unit_id === id), n > 0, id);
});

test('province_industry: la validazione segnala orfani, duplicati e capacità sopra il potenziale', () => {
  const ctx = { motherIds: new Set(['P_A']), cityPartIds: new Set(['Z1']) };
  const ok = { unit_id: 'P_A', unit_kind: 'province', potential_slots: '14', capacity_slots: '14', basis: 'x', status: 'PROVISIONAL' };
  assert.deepEqual(validateProvinceIndustry([ok], ctx), []);
  assert.ok(validateProvinceIndustry([ok, ok], ctx).some((e) => /duplicato/.test(e)));
  assert.ok(validateProvinceIndustry([{ ...ok, unit_id: 'P_X' }], ctx).some((e) => /non esiste/.test(e)));
  assert.ok(validateProvinceIndustry([{ ...ok, capacity_slots: '15' }], ctx).some((e) => /sopra il potenziale/.test(e)));
  assert.ok(validateProvinceIndustry([{ ...ok, unit_kind: 'city_part' }], ctx).some((e) => /non esiste/.test(e)));
});

test('province_industry: il file generato è aggiornato (rigenerarlo non cambia nulla)', async () => {
  const { provinceIndustryRows } = await import('../scripts/build-province-industry.js');
  const { toCsv } = await import('../src/data/csv.js');
  const { PROVINCE_INDUSTRY_HEADER } = await import('../src/data/industry.js');
  assert.equal(toCsv(PROVINCE_INDUSTRY_HEADER, await provinceIndustryRows()), text('industry/province_industry.csv'));
});
