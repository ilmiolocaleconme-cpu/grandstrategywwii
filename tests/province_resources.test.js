// Risorse per provincia: costruzione dal CSV, coerenza con le province reali e risoluzione sulle sotto-province.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv } from '../src/data/csv.js';
import { buildProvinceResources, validateProvinceResources, resolveResourceAnchors, resolveResourceFills, resourceFillColor, mixHex, RESOURCE_NEUTRAL, RESOURCE_META, RESOURCE_ORDER } from '../src/data/provinceResources.js';
import { loadProvinces } from '../scripts/load-provinces.js';

const url = (p) => new URL(`../data/${p}`, import.meta.url);
const csv = (p) => parseCsv(readFileSync(url(p), 'utf8'), { name: p });
const resources = JSON.parse(readFileSync(url('resources.json'), 'utf8'));

test('solo i giacimenti entrano nella mappa: aggregati, totali e flussi no', () => {
  const locations = [
    { location_id: 'A', resource_id: 'coal', kind: 'deposit' },
    { location_id: 'B', resource_id: 'coal', kind: 'aggregate' },
    { location_id: 'C', resource_id: 'oil', kind: 'trade_flow' },
    { location_id: 'D', resource_id: 'oil', kind: 'deposit' },
    { location_id: 'E', resource_id: 'oil', kind: 'deposit' },
  ];
  const links = [{ location_id: 'A', province_id: 'P1' }, { location_id: 'B', province_id: 'P2' }, { location_id: 'C', province_id: 'P3' }, { location_id: 'D', province_id: 'P1' }, { location_id: 'E', province_id: 'P1' }];
  const out = buildProvinceResources(locations, links);
  assert.deepEqual(out.byProvince, { P1: ['oil', 'coal'] }); // unici, in ordine di priorità
});

test('il file su disco è quello che producono i CSV (rigenerare con npm run build:province-resources)', () => {
  const built = buildProvinceResources(csv('resources/resource_locations.csv'), csv('resources/location_provinces.csv'));
  const onDisk = JSON.parse(readFileSync(url('resources/province_resources.json'), 'utf8'));
  assert.deepEqual(onDisk, built);
  assert.ok(Object.keys(built.byProvince).length > 100);
});

test('ogni risorsa ha metadati e ordine; il file è valido sulle province reali', async () => {
  for (const r of RESOURCE_ORDER) assert.ok(RESOURCE_META[r], `metadati mancanti per ${r}`);
  for (const r of Object.keys(RESOURCE_META)) assert.ok(RESOURCE_ORDER.includes(r), `${r} fuori da RESOURCE_ORDER`);
  const provinces = await loadProvinces();
  const feats = provinces.features ?? provinces.provinces?.features ?? provinces;
  const motherIds = new Set(feats.map((f) => f.properties.parentProvince ?? f.properties.id));
  const file = JSON.parse(readFileSync(url('resources/province_resources.json'), 'utf8'));
  assert.deepEqual(validateProvinceResources(file, { resourceIds: new Set(resources.map((r) => r.id)), provinceIds: motherIds }), []);
});

test('risoluzione: id diretto resta, madre divisa va sulla sotto-provincia più grande, sconosciuto si ignora', () => {
  const items = [
    { props: { id: 'P_A' }, areaKm2: 10 },
    { props: { id: 'P_B_SP1', parentProvince: 'P_B' }, areaKm2: 5 },
    { props: { id: 'P_B_SP2', parentProvince: 'P_B' }, areaKm2: 50 },
  ];
  const out = resolveResourceAnchors(items, { P_A: ['coal'], P_B: ['oil'], P_X: ['tin'] });
  assert.deepEqual(out, { P_A: ['coal'], P_B_SP2: ['oil'] });
});

test('sui dati reali ogni provincia con risorse trova un elemento della mappa', async () => {
  const provinces = await loadProvinces();
  const feats = provinces.features ?? provinces.provinces?.features ?? provinces;
  const items = feats.map((f) => ({ props: f.properties, areaKm2: 1 }));
  const file = JSON.parse(readFileSync(url('resources/province_resources.json'), 'utf8'));
  const out = resolveResourceAnchors(items, file.byProvince);
  assert.equal(Object.keys(out).length, Object.keys(file.byProvince).length);
});

test('colori distinti per risorsa e nessuna risorsa usa l\'icona della fabbrica (riservata alle industrie)', () => {
  const colors = Object.values(RESOURCE_META).map((m) => m.color.toLowerCase());
  assert.equal(new Set(colors).size, colors.length, 'due risorse con lo stesso colore');
  for (const [id, m] of Object.entries(RESOURCE_META)) {
    assert.match(m.color, /^#[0-9a-f]{6}$/i, `${id}: colore non valido`);
    assert.notEqual(m.icon, 'factory', `${id} usa l'icona della fabbrica`);
  }
});

test('riempimento: colore schiarito, sotto-province tutte colorate, prima risorsa vince, senza risorse neutro', () => {
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(mixHex('#102030', '#ffffff', 0), '#102030');
  for (const r of RESOURCE_ORDER) assert.match(resourceFillColor(r), /^#[0-9a-f]{6}$/);
  assert.notEqual(resourceFillColor('oil'), RESOURCE_NEUTRAL);
  const items = [
    { props: { id: 'P_A' } },
    { props: { id: 'P_B_SP1', parentProvince: 'P_B' } },
    { props: { id: 'P_B_SP2', parentProvince: 'P_B' } },
    { props: { id: 'P_C' } },
  ];
  const out = resolveResourceFills(items, { P_A: ['coal', 'oil'], P_B: ['wheat'] });
  assert.deepEqual(Object.keys(out).sort(), ['P_A', 'P_B_SP1', 'P_B_SP2']);
  assert.equal(out.P_A, resourceFillColor('coal'));
  assert.equal(out.P_B_SP1, out.P_B_SP2);
  assert.deepEqual(resolveResourceFills(items, null), {});
});
