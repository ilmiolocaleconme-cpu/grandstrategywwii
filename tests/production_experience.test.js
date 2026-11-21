// Esperienza delle fabbriche (21/11/2026, scelte dell'utente 1A-5A): bonus col tempo sullo stesso prodotto, malus alla riconversione,
// metà dell'esperienza per un modello della stessa catena, tetto per i materiali, IA che riconverte solo se ne vale la pena.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateExperience, experienceFactor, retooledDays } from '../src/rules/productionExperience.js';
import { produceDay } from '../src/rules/production.js';
import { retoolFacility, aiRetoolNation } from '../src/game/retoolSystem.js';

const CFG = JSON.parse(fs.readFileSync(new URL('../data/industry/production_experience.json', import.meta.url)));

test('production_experience.json è valido; i valori sbagliati sono segnalati', () => {
  assert.deepEqual(validateExperience(CFG), []);
  assert.match(validateExperience({ ...CFG, curve: [[0, 1], [10, 0.5]] }).join(), /non crescente/);
  assert.match(validateExperience({ ...CFG, sameChainKeep: 2 }).join(), /sameChainKeep/);
});

test('curva 1A: 60% appena convertito, 100% a un anno, 120% a due; materiali al massimo 110% (4A); il 1936 parte al 100%', () => {
  assert.equal(experienceFactor(0, CFG), 0.6);
  assert.equal(experienceFactor(182.5, CFG), 0.8);
  assert.equal(experienceFactor(365, CFG), 1);
  assert.equal(experienceFactor(730, CFG), 1.2);
  assert.equal(experienceFactor(5000, CFG), 1.2);
  assert.equal(experienceFactor(730, CFG, { equipment: false }), 1.1);
  assert.equal(experienceFactor(CFG.initialDays, CFG), 1, 'impianti senza contatore: come prima');
});

test('riconversione: da zero, o metà dei giorni per un modello della stessa catena (3A)', () => {
  assert.equal(retooledDays({ expDays: 600 }, CFG, false), 0);
  assert.equal(retooledDays({ expDays: 600 }, CFG, true), 300);
  assert.equal(retooledDays({}, CFG, true), 182, 'impianto iniziale: metà di 365');
  const r = retoolFacility({ id: 'F', recipeId: 'A', expDays: 700, wip: 3 }, 'B', '1940-01-01', {}, null, { cfg: CFG, related: false });
  assert.equal(r.facility.expDays, 0);
  assert.equal(retoolFacility({ id: 'F', recipeId: 'A', expDays: 700 }, 'B', '1940-01-01', {}, null).facility.expDays, undefined, 'senza configurazione: come prima');
});

test('produzione 2A: più pezzi con le stesse materie; il contatore cresce solo quando l\'impianto produce', () => {
  const recipe = { id: 'R', factory: 'FCT-X', outputUnit: 't/day', inputs: [{ resource: 'steel', perUnit: 1 }], output: { product: 'P', perUnit: 1 }, equipmentId: 'EQ' };
  const catalog = (experience) => ({ recipes: new Map([['R', recipe]]), factories: new Map([['FCT-X', { base_capacity_per_day: 10, energy_consumption: 0 }]]), experience });
  const day = (f, steel, experience = CFG) => produceDay({ facilities: [f], stock: { steel }, hydroMw: 100, date: '1940-01-01' }, catalog(experience));
  const fresh = day({ id: 'F', type: 'FCT-X', recipeId: 'R', expDays: 0 }, 100);
  const vet = day({ id: 'F', type: 'FCT-X', recipeId: 'R', expDays: 730 }, 100);
  const old = day({ id: 'F', type: 'FCT-X', recipeId: 'R' }, 100, undefined);
  assert.equal(old.balance.produced.P, 10);
  assert.equal(fresh.balance.produced.P, 6);
  assert.equal(vet.balance.produced.P, 12);
  assert.equal(fresh.balance.consumed.steel, vet.balance.consumed.steel, 'stesse materie');
  assert.equal(fresh.facilities[0].progress.expDays, 1);
  assert.equal(vet.facilities[0].progress.expDays, 730, 'oltre la curva non si conta');
  assert.equal(day({ id: 'F', type: 'FCT-X', recipeId: 'R', expDays: 10 }, 0).facilities[0].progress.expDays, 10, 'senza acciaio non impara');
});

test('IA 5A: una linea senza fabbisogno resta se il nuovo fabbisogno non la tiene occupata; una linea ferma si riconverte comunque', () => {
  const mk = (id, eq, extra = {}) => ({ id, factory: 'FCT-W', massTonnes: 1, capacityShare: 1, equipmentId: eq, group: 'g', role: 'r', output: { product: `equipment.${eq}`, perUnit: 1 }, ...extra });
  const recipes = new Map([['A', mk('A', 'W-USA-A')], ['B', mk('B', 'W-USA-B')]]);
  const ctx = (need, experience = CFG) => ({ recipes, factories: new Map([['FCT-W', { base_capacity_per_day: 10 }]]), table: { groups: { g: { requires: null } } }, researched: new Set(), date: '1940-02-01', need, experience });
  const nation = { facilities: [{ id: 'F', type: 'FCT-W', recipeId: 'A' }], stocks: {} };
  assert.equal(aiRetoolNation(nation, 'USA', ctx(new Map([['equipment.W-USA-B', 500]]))).changes.length, 0, '500 pezzi < 10 al giorno × 90 giorni');
  assert.equal(aiRetoolNation(nation, 'USA', ctx(new Map([['equipment.W-USA-B', 2000]]))).changes.length, 1);
  assert.equal(aiRetoolNation(nation, 'USA', ctx(new Map([['equipment.W-USA-B', 500]]), null)).changes.length, 1, 'senza esperienza: la regola di prima');
});

// fabbrica appena costruita: expDays 0 → 60% (scelta dell'utente del 21/11/2026), verificato in tests/construction_game.test.js
