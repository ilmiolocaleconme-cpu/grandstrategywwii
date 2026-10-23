// Regioni (data/regions.json, src/data/regions.js): REGIONE → PROVINCIA → CITTÀ, Fase A.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REGIONS_SCHEMA, buildRegionIndex, motherOf, validateRegions } from '../src/data/regions.js';
import { loadProvinces } from '../scripts/load-provinces.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const feat = (id, owner, extra = {}) => ({ type: 'Feature', id, properties: { id, owner, ...extra } });
const reg = (id, owner, provinces, extra = {}) => ({ id, name: id, owner, provinces, assignmentQuality: 'hypothesis', ...extra });
const file = (regions) => ({ schema: REGIONS_SCHEMA, regions });

// Mondo sintetico: X ha A (con due sponde), B, C; Y ha D.
const provinces = [feat('P_X_A_SP1', 'X', { parentProvince: 'P_X_A' }), feat('P_X_A_SP2', 'X', { parentProvince: 'P_X_A' }), feat('P_X_B', 'X'), feat('P_X_C', 'X'), feat('P_Y_D', 'Y')];
const ctx = { provinces, nationIds: ['X', 'Y'] };

test('motherOf: le sponde puntano alla madre, le altre a se stesse', () => {
  assert.equal(motherOf({ id: 'P_X_A_SP1', parentProvince: 'P_X_A' }), 'P_X_A');
  assert.equal(motherOf({ id: 'P_X_B' }), 'P_X_B');
});

test('sintetico: file valido, una nazione senza regioni (Y) non è controllata', () => {
  const f = file([reg('R_X_NORD', 'X', ['P_X_A', 'P_X_B']), reg('R_X_SUD', 'X', ['P_X_C'])]);
  assert.deepEqual(validateRegions(f, ctx), []);
});

test('sintetico: provincia madre in due regioni → errore', () => {
  const f = file([reg('R_X_NORD', 'X', ['P_X_A', 'P_X_B']), reg('R_X_SUD', 'X', ['P_X_B', 'P_X_C'])]);
  assert.ok(validateRegions(f, ctx).some((e) => e.includes('P_X_B') && e.includes('due regioni')));
});

test('sintetico: provincia di una nazione coperta e non assegnata → errore', () => {
  const f = file([reg('R_X_NORD', 'X', ['P_X_A', 'P_X_B'])]);
  assert.ok(validateRegions(f, ctx).some((e) => e.includes('P_X_C') && e.includes('nessuna regione')));
});

test('sintetico: provincia inesistente, di un altro owner, id duplicato o malformato → errori', () => {
  assert.ok(validateRegions(file([reg('R_X_N', 'X', ['P_X_A', 'P_X_B', 'P_X_C', 'P_X_ZZZ'])]), ctx).some((e) => e.includes('P_X_ZZZ') && e.includes('inesistente')));
  assert.ok(validateRegions(file([reg('R_X_N', 'X', ['P_X_A', 'P_X_B', 'P_X_C', 'P_Y_D'])]), ctx).some((e) => e.includes('P_Y_D') && e.includes('di Y')));
  assert.ok(validateRegions(file([reg('R_X_N', 'X', ['P_X_A', 'P_X_B']), reg('R_X_N', 'X', ['P_X_C'])]), ctx).some((e) => e.includes('duplicato')));
  assert.ok(validateRegions(file([reg('regione_x', 'X', ['P_X_A', 'P_X_B', 'P_X_C'])]), ctx).some((e) => e.includes('id non valido')));
  assert.ok(validateRegions(file([reg('R_Y_N', 'X', ['P_X_A', 'P_X_B', 'P_X_C'])]), ctx).some((e) => e.includes('non inizia con R_X_')));
});

test('sintetico: owner sconosciuto, qualità sconosciuta, regione vuota, schema sbagliato → errori', () => {
  assert.ok(validateRegions(file([reg('R_Q_N', 'Q', ['P_X_A'])]), ctx).some((e) => e.includes('owner sconosciuto')));
  assert.ok(validateRegions(file([reg('R_X_N', 'X', ['P_X_A', 'P_X_B', 'P_X_C'], { assignmentQuality: 'certo' })]), ctx).some((e) => e.includes('assignmentQuality')));
  assert.ok(validateRegions(file([reg('R_X_N', 'X', [])]), ctx).some((e) => e.includes('senza province')));
  assert.ok(validateRegions({ schema: 'altro', regions: [] }, ctx)[0].includes('schema'));
  assert.ok(validateRegions(null, ctx)[0].includes('schema'));
});

test('indice: regione di madre, di sponda, di feature; province di regione; null per sconosciuti', () => {
  const idx = buildRegionIndex(file([reg('R_X_NORD', 'X', ['P_X_A', 'P_X_B']), reg('R_X_SUD', 'X', ['P_X_C'])]));
  assert.equal(idx.regionOfMother('P_X_A'), 'R_X_NORD');
  assert.equal(idx.regionOfProvince(provinces[0]), 'R_X_NORD'); // sponda → regione della madre
  assert.equal(idx.regionOfProvince(provinces[1].properties), 'R_X_NORD'); // anche con le sole properties
  assert.equal(idx.regionOfProvince(provinces[3]), 'R_X_SUD');
  assert.equal(idx.regionOfProvince(provinces[4]), null); // nazione senza regioni
  assert.equal(idx.regionOfProvince(null), null);
  assert.deepEqual(idx.provincesOf('R_X_NORD'), ['P_X_A', 'P_X_B']);
  assert.deepEqual(idx.provincesOf('R_NO'), []);
  assert.deepEqual(idx.regionsOf('X'), ['R_X_NORD', 'R_X_SUD']);
  assert.deepEqual(idx.regionsOf('Y'), []);
  assert.deepEqual(idx.coveredOwners, ['X']);
  assert.equal(idx.region('R_X_SUD').owner, 'X');
});

test('indice: file mancante o vuoto non manda in errore', () => {
  for (const f of [null, undefined, {}, { regions: [] }]) {
    const idx = buildRegionIndex(f);
    assert.equal(idx.regionOfMother('P_X_A'), null);
    assert.deepEqual(idx.coveredOwners, []);
  }
});

test('indice: la lista restituita è una copia (non altera il file)', () => {
  const f = file([reg('R_X_NORD', 'X', ['P_X_A'])]);
  const idx = buildRegionIndex(f);
  idx.provincesOf('R_X_NORD').push('P_X_B');
  assert.deepEqual(f.regions[0].provinces, ['P_X_A']);
});

test('dati reali: data/regions.json valido; coperte solo Italia e Germania', async () => {
  const features = (await loadProvinces()).features;
  const nationIds = read('nations.json').map((n) => n.id);
  const doc = read('regions.json');
  assert.deepEqual(validateRegions(doc, { provinces: features, nationIds }), []);
  assert.deepEqual(buildRegionIndex(doc).coveredOwners, ['DEU', 'ITA']);
});

test('dati reali: ogni provincia madre di Italia e Germania ha esattamente una regione, sponde comprese', async () => {
  const features = (await loadProvinces()).features;
  const idx = buildRegionIndex(read('regions.json'));
  for (const owner of ['ITA', 'DEU']) {
    const own = features.filter((f) => f.properties.owner === owner);
    assert.ok(own.length > 0);
    for (const f of own) assert.ok(idx.regionOfProvince(f), `${f.properties.id} senza regione`);
    // la regione di una sponda è quella della madre
    for (const f of own.filter((x) => x.properties.parentProvince)) assert.equal(idx.regionOfProvince(f), idx.regionOfMother(f.properties.parentProvince));
  }
});

test('dati reali: conteggi (Italia 20 regioni / 62 madri; Germania 19 regioni / 32 madri) e ogni madre contata una volta', async () => {
  const features = (await loadProvinces()).features;
  const idx = buildRegionIndex(read('regions.json'));
  const mothers = (owner) => new Set(features.filter((f) => f.properties.owner === owner).map((f) => motherOf(f.properties)));
  for (const [owner, nRegions, nMothers] of [['ITA', 20, 62], ['DEU', 19, 32]]) {
    assert.equal(idx.regionsOf(owner).length, nRegions);
    assert.equal(mothers(owner).size, nMothers);
    const listed = idx.regionsOf(owner).flatMap((r) => idx.provincesOf(r));
    assert.equal(listed.length, nMothers); // somma delle province delle regioni = madri, senza doppioni
    assert.equal(new Set(listed).size, nMothers);
  }
});

test('dati reali: Sicilia ha 9 province (incl. Catania); Amburgo, Berlino e Dodecaneso una sola; ogni Gau è in una regione tedesca', async () => {
  const idx = buildRegionIndex(read('regions.json'));
  assert.equal(idx.provincesOf('R_ITA_SICILIA').length, 9);
  assert.equal(idx.regionOfMother('P_ITA_CATANIA'), 'R_ITA_SICILIA');
  assert.equal(idx.regionOfMother('P_ITA_ROMA'), 'R_ITA_LAZIO');
  for (const r of ['R_DEU_AMBURGO', 'R_DEU_BERLINO', 'R_ITA_DODECANESO']) assert.equal(idx.provincesOf(r).length, 1);
  assert.equal(idx.regionOfMother('P_DEU_ESSEN'), 'R_DEU_RENANIA');
  assert.equal(idx.regionOfMother('P_DEU_KURHESSEN'), 'R_DEU_ASSIA');
  assert.equal(idx.regionOfMother('P_DEU_OBERSCHLESIEN'), 'R_DEU_ALTA_SLESIA');
});

test('dati reali: tutte le assegnazioni sono ipotesi dichiarate (nessuna "verified" senza fonte)', () => {
  const doc = read('regions.json');
  assert.equal(doc.quality, 'hypothesis');
  assert.ok(doc.regions.every((r) => r.assignmentQuality === 'hypothesis' && r.basis));
});

test('dati reali: le 17 regioni italiane divise hanno 3 province ciascuna (ipotesi); Sicilia, Zara e Dodecaneso restano come prima', () => {
  const doc = read('regions.json');
  const italian = doc.regions.filter((r) => r.owner === 'ITA');
  const divided = italian.filter((r) => r.provinces.length === 3);
  assert.equal(divided.length, 17);
  assert.deepEqual(italian.filter((r) => r.provinces.length !== 3).map((r) => r.id).sort(), ['R_ITA_DODECANESO', 'R_ITA_SICILIA', 'R_ITA_ZARA']);
  assert.ok(divided.every((r) => /3 province/.test(r.basis)), 'la base dichiara il taglio in 3');
});
