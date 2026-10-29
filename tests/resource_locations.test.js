// Luoghi delle risorse (riferimento): classificazione delle quantità, costruzione dei CSV e coerenza con le province reali.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseCsv } from '../src/data/csv.js';
import { classifyQuantity, toTonnes, UNIT_TO_TONNES, PLANT_RESOURCE_IDS, splitPlaces, buildResourceLocations, validateResourceLocations, RESOURCE_IDS, LOCATION_HEADER, LINK_HEADER } from '../src/data/resourceLocations.js';
import { loadProvinces } from '../scripts/load-provinces.js';

const url = (p) => new URL(`../data/${p}`, import.meta.url);
const text = (p) => readFileSync(url(p), 'utf8');
const built = () => buildResourceLocations({ rawCsv: text('resources/risorse_riferimento.csv'), addedCsv: text('resources/risorse_aggiunte.csv'), notesCsv: text('resources/location_notes.csv'), placesCsv: text('resources/place_provinces.csv') });

test('quantità: nessun numero inventato dal testo qualitativo', () => {
  assert.deepEqual(classifyQuantity('263000000'), { precision: 'exact', value: 263000000, min: null, max: null });
  assert.equal(classifyQuantity('Circa 130000000').precision, 'approximate');
  assert.deepEqual(classifyQuantity('11100000-12300000'), { precision: 'range', value: null, min: 11100000, max: 12300000 });
  assert.equal(classifyQuantity('Circa 30000000-50000000').precision, 'approximate_range');
  assert.equal(classifyQuantity('Circa 1968;1306;1755;315').precision, 'series');
  for (const t of ['Grande produzione', 'Scoperto', '30% della produzione europea', '']) assert.deepEqual(classifyQuantity(t), { precision: 'qualitative', value: null, min: null, max: null });
});

test('luoghi: separatori virgola, punto e virgola, due punti', () => {
  assert.deepEqual(splitPlaces('Khuzestan: Masjed Soleyman, Aghajari; Gachsaran'), ['Khuzestan', 'Masjed Soleyman', 'Aghajari', 'Gachsaran']);
});

test('copia grezza non alterata e CSV generati uguali a quelli su disco', () => {
  const src = JSON.parse(text('resources/SOURCE.json'));
  assert.equal(createHash('sha256').update(readFileSync(url(src.file.replace(/^data\//, '')))).digest('hex'), src.sha256);
  const b = built();
  assert.equal(parseCsv(text('resources/resource_locations.csv')).length, b.locations.length);
  assert.deepEqual(Object.keys(parseCsv(text('resources/resource_locations.csv'))[0]), [...LOCATION_HEADER]);
  assert.deepEqual(Object.keys(parseCsv(text('resources/location_provinces.csv'))[0]), [...LINK_HEADER]);
  assert.deepEqual(b.unmapped, []);
});

test('ogni giacimento di un paese con province ha almeno una provincia madre esistente; ID risorsa nel catalogo', async () => {
  const provinces = await loadProvinces();
  const motherIds = new Set(provinces.features.map((f) => f.properties.parentProvince ?? f.properties.id));
  const political = JSON.parse(text('political_1936.json'));
  const resources = JSON.parse(text('resources.json'));
  assert.deepEqual(validateResourceLocations(built(), { resourceIds: new Set(resources.map((r) => r.id)), countryIds: new Set(political.map((p) => p.id)), motherIds }), []);
  for (const id of Object.values(RESOURCE_IDS)) assert.ok(resources.some((r) => r.id === id), id);
});

test('segnalazioni di revisione e righe aggiunte da Claude', () => {
  const { locations } = built();
  const flagged = (f) => locations.filter((l) => l.review_flags.split(';').includes(f));
  assert.equal(flagged('duplicate_value').length, 3);
  assert.ok(flagged('value_suspect').length >= 10);
  const added = locations.filter((l) => l.source === 'claude_note');
  assert.equal(added.length, 8, 'petrolio tedesco + 4 alluminio + 2 ferro + stagno cinese');
  const de = added.filter((l) => l.resource_id === 'oil');
  assert.equal(de.length, 1);
  assert.equal(de[0].country_id, 'DEU');
  assert.equal(de[0].precision, 'qualitative');
  assert.equal(de[0].quantity_value, '');
  assert.deepEqual(added.filter((l) => l.resource_id !== 'oil').map((l) => `${l.resource_id}:${l.country_text}`).sort(), ['aluminium:Francia', 'aluminium:Regno Unito', 'aluminium:Stati Uniti', 'aluminium:URSS', 'iron_ore:Regno Unito', 'iron_ore:URSS', 'tin:Cina']);
  assert.ok(locations.filter((l) => l.source === 'user_csv').length === 196);
});

test('i paesi senza province restano senza collegamenti, senza errori', () => {
  const { locations, links } = built();
  // senza entità politica (Guyana britannica, Nuova Caledonia, Bahrain, Sarawak, Trinidad, Kuwait...) il giacimento non ha provincia
  const senza = locations.filter((l) => l.kind === 'deposit' && l.country_id === '');
  assert.ok(senza.length > 0);
  for (const l of senza) assert.equal(links.filter((k) => k.location_id === l.location_id).length, 0);
  assert.equal(locations.filter((l) => l.kind === 'aggregate').length, 8);
});

test('alluminio: nessuna riga è un giacimento (prodotto industriale), i siti sono impianti con province', () => {
  const { locations, links } = built();
  const al = locations.filter((l) => l.resource_id === 'aluminium');
  assert.ok(al.length >= 15);
  assert.deepEqual(PLANT_RESOURCE_IDS, ['aluminium']);
  assert.equal(al.filter((l) => l.kind === 'deposit').length, 0, 'nessun giacimento di alluminio');
  const plants = al.filter((l) => l.kind === 'plant');
  assert.equal(plants.length, 17);
  const linked = new Set(links.map((k) => k.location_id));
  for (const l of plants) if (l.country_id) assert.ok(linked.has(l.location_id), `${l.location_id} senza provincia`);
  assert.ok(locations.filter((l) => l.kind === 'plant').every((l) => l.resource_id === 'aluminium'));
});

test('alluminio come giacimento: il validatore lo rifiuta', () => {
  const { locations, links } = built();
  const bad = locations.map((l) => (l.kind === 'plant' ? { ...l, kind: 'deposit' } : l));
  const errors = validateResourceLocations({ locations: bad, links }, { resourceIds: new Set(Object.values(RESOURCE_IDS)), countryIds: new Set(locations.map((l) => l.country_id).filter(Boolean)), motherIds: new Set(links.map((k) => k.province_id)) });
  assert.ok(errors.some((e) => e.includes('prodotto industriale') && e.includes('giacimento')));
});

test('unità: tutto in tonnellate metriche con conversione esplicita, mai un numero inventato', () => {
  assert.equal(toTonnes(1000, 'long ton'), 1016.047);
  assert.equal(toTonnes(1000, 't metriche'), 1000);
  assert.equal(toTonnes(1000, 'bushel'), 27.216);
  assert.equal(toTonnes(1, 'barili/giorno'), 49.64);
  assert.equal(toTonnes(5, ''), null, 'unità vuota: nessuna conversione');
  assert.equal(toTonnes(5, 'cubit'), null, 'unità sconosciuta: nessuna conversione');
  assert.equal(toTonnes('', 'long ton'), null);
  assert.equal(UNIT_TO_TONNES['barili/giorno'].quality, 'approximate');
  const { locations } = built();
  for (const l of locations) {
    assert.ok(l.unit === '' || UNIT_TO_TONNES[l.unit], `${l.location_id}: unità ${l.unit} senza conversione`);
    if (l.unit === '' || l.quantity_value === '') assert.equal(l.quantity_t, '', `${l.location_id}: t senza unità o senza quantità`);
  }
  const by = (id) => locations.find((l) => l.location_id === id);
  assert.equal(by('RL-0056').quantity_t, 28903489.009, 'ferro USA 28.447.000 long ton');
  assert.equal(by('RL-0116').quantity_t, '', 'intervallo: nessun valore unico');
  assert.equal(by('RL-0116').quantity_t_min, 114305100);
  assert.equal(by('RL-0001').quantity_t, 263000000, 'già in t metriche: invariato');
});
