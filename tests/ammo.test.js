// Consumo di munizioni per categoria e fase (tabella proposta il 28/10/2026) e coerenza con la ricetta e la capacità delle fabbriche.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateAmmoConsumption, dailyAmmo, dailyRounds, ammoUnitsSupported } from '../src/data/ammo.js';
import { loadIndustryCatalog } from '../src/data/industry.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const json = (p) => JSON.parse(text(p));
const catalog = () => loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv') });

test('munizioni: file valido, 8 categorie, un colpo = 1/40000 di tonnellata, unità che non combatte a zero', () => {
  const f = json('military/ammo_consumption.json');
  assert.deepEqual(validateAmmoConsumption(f, { resources: json('resources.json') }), []);
  assert.equal(f.categories.length, 8);
  assert.equal(f.roundsPerTonne, 40000);
  assert.equal(dailyAmmo(f, 'infantry_foot', 'attack'), 8);
  assert.equal(dailyAmmo(f, 'infantry_foot', 'defense'), 5);
  assert.equal(dailyAmmo(f, 'infantry_foot', 'attack', false), 0);
  assert.equal(dailyRounds(f, 'infantry_foot', 'attack'), 320000);
  assert.equal(dailyAmmo(f, 'ufo', 'attack'), null, 'categoria sconosciuta: null, non zero');
  assert.equal(dailyAmmo(f, 'anti_air', 'attack'), null, 'fase non applicabile: null, non zero');
  assert.equal(dailyAmmo(f, 'armor', 'retreat'), null, 'fase sconosciuta: null');
});

test('in difesa si consuma meno che in attacco, per ogni categoria che ha entrambe le fasi', () => {
  for (const c of json('military/ammo_consumption.json').categories) if (typeof c.attack === 'number' && typeof c.defense === 'number') assert.ok(c.defense < c.attack, c.id);
});

test('una fabbrica del Pack regge 12 divisioni di fanteria in attacco; la Germania (2 fabbriche) 25; le 20 iniziali 250', () => {
  const f = json('military/ammo_consumption.json');
  const cap = catalog().byId.get('FCT-MUNITIONS').base_capacity_per_day;
  assert.equal(Math.floor(ammoUnitsSupported(f, 'infantry_foot', 'attack', cap)), 12);
  assert.equal(Math.floor(ammoUnitsSupported(f, 'infantry_foot', 'attack', 2 * cap)), 25);
  assert.equal(Math.floor(ammoUnitsSupported(f, 'infantry_foot', 'attack', 20 * cap)), 250);
});

test('coerenza con la ricetta: 1 t di rame = 120.000 colpi, quindi il rame per t di munizioni × 120.000 ≈ colpi per t (entro il 2%)', () => {
  const f = json('military/ammo_consumption.json');
  const rec = json('industry/recipes.json').recipes.find((r) => r.id === 'REC-MUNITIONS-001');
  const cu = rec.inputs.find((i) => i.resource === 'copper').perUnit; // 0,33 t di rame per t di munizioni
  assert.ok(Math.abs(cu * 120000 - f.roundsPerTonne) / f.roundsPerTonne < 0.02, `${cu} t di rame per t ≈ ${f.roundsPerTonne} colpi per t`);
});

test('errori rilevati', () => {
  const ok = () => json('military/ammo_consumption.json');
  const errs = (mut) => { const f = ok(); mut(f); return validateAmmoConsumption(f); };
  assert.ok(errs((f) => { f.schema = 'x'; }).some((e) => e.includes('schema')));
  assert.ok(errs((f) => { f.roundsPerTonne = 0; }).some((e) => e.includes('roundsPerTonne')));
  assert.ok(errs((f) => { f.categories[0].attack = 0; }).some((e) => e.includes('non valido')));
  assert.ok(errs((f) => { f.categories[4].defense = null; }).some((e) => e.includes('nessuna fase')));
  assert.ok(errs((f) => { f.categories.push({ ...f.categories[0] }); }).some((e) => e.includes('duplicata')));
  assert.ok(errs((f) => { f.categories = []; }).some((e) => e.includes('nessuna categoria')));
});
