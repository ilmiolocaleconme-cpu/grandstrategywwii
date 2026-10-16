import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TERRAIN_CLASSES, checkTerrain, terrainOf } from '../src/data/terrain.js';
import { LAYERS, TERRAIN_COLORS, provinceFill } from '../src/map/geo.js';
import { loadProvinces } from '../scripts/load-provinces.js';

const provinces = await loadProvinces();
const terrain = JSON.parse(readFileSync(new URL('../data/terrain.json', import.meta.url), 'utf8'));
const ids = provinces.features.map((f) => f.properties.id);

test('terreno: ogni provincia ha una classe valida e non ci sono id estranei', () => {
  assert.deepEqual(checkTerrain(terrain, ids), []);
  assert.equal(Object.keys(terrain.provinces).length, ids.length);
});

test('terreno: la stima è dichiarata come ipotesi (nessun dato di quota usato)', () => {
  assert.equal(terrain.basis, 'hypothesis');
});

test('terreno: le tre classi sono tutte rappresentate in modo sensato', () => {
  const counts = Object.fromEntries(TERRAIN_CLASSES.map((c) => [c, 0]));
  for (const id of ids) counts[terrain.provinces[id]] += 1;
  for (const c of TERRAIN_CLASSES) assert.ok(counts[c] / ids.length > 0.1, `${c}: ${counts[c]} province su ${ids.length}`);
});

test('terreno: punti di controllo geografici', () => {
  const at = (id) => terrainOf(terrain, id);
  for (const id of ['P_ITA_EMILIA', 'P_ITA_VENETO', 'P_NLD_ZEELAND', 'P_DEU_BERLIN', 'P_DANZIG_FREE_CITY']) assert.equal(at(id), 'pianura', id);
  for (const id of ['P_CHE_VALAIS', 'P_CHE_URI', 'P_AUT_TIROL', 'P_FRA_SAVOIE', 'P_ESP_HUESCA', 'P_ITA_TRIDENTINE_VENETIA', 'P_GIB_GIBRALTAR']) assert.equal(at(id), 'montagna', id);
  for (const id of ['P_ITA_TUSCANY', 'P_FRA_AVEYRON']) assert.equal(at(id), 'colline', id);
});

test('checkTerrain segnala province mancanti, classi errate e id estranei', () => {
  const bad = { ...terrain, provinces: { ...terrain.provinces, P_XXX_NULLA: 'pianura', [ids[0]]: 'palude' } };
  delete bad.provinces[ids[1]];
  const errors = checkTerrain(bad, ids);
  assert.ok(errors.some((e) => e.includes(ids[1]) && e.includes('manca')));
  assert.ok(errors.some((e) => e.includes(ids[0]) && e.includes('classe non valida')));
  assert.ok(errors.some((e) => e.includes('P_XXX_NULLA')));
  assert.ok(checkTerrain(null, ids).length > 0);
});

test('livello Terreno: esiste tra i livelli e colora per classe', () => {
  assert.ok(LAYERS.some((l) => l.id === 'terrain'));
  for (const id of ['P_ITA_EMILIA', 'P_CHE_VALAIS', 'P_ITA_TUSCANY']) {
    assert.equal(provinceFill({ id }, 'terrain', undefined, terrain), TERRAIN_COLORS[terrain.provinces[id]]);
  }
  assert.equal(provinceFill({ id: 'P_XXX_NULLA' }, 'terrain', undefined, terrain), '#777');
  assert.equal(provinceFill({ id: 'P_ITA_EMILIA' }, 'terrain'), '#777');
});
