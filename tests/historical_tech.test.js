// Tecnologie alle date storiche per l'IA e carri sovietici legati al ramo Corazzati (19/11/2026).
// Decisioni dell'utente: «date storiche» per le nazioni dell'IA finché non avranno una loro ricerca; aggiungere i principali modelli sovietici.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateHistoricalTechDates, dueTechs, createHistoricalTechSystem } from '../src/game/historicalTech.js';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { buildEquipmentRecipes, recipeLockReasons } from '../src/data/equipmentProduction.js';
import { weaponWeight } from '../src/rules/battleV2.js';
import { buildEquivalence } from '../src/data/equipmentEquivalence.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const doc = json('research/historical_tech_dates.json');
const techs = json('research/technologies.json');
const table = json('units/equipment/equipment_production.json');
const cfg = json('units/battle_v2.json');
const edir = new URL('../data/units/equipment/', import.meta.url);
const catalog = mergeEquipmentCatalogs(readdirSync(edir).filter((n) => /^catalog.*\.json$/.test(n)).sort().map((f) => JSON.parse(readFileSync(new URL(f, edir), 'utf8'))));
const recipes = buildEquipmentRecipes(catalog, table);
const rec = (id) => recipes.find((r) => r.equipmentId === id);
const nation = (done = []) => ({ research: { done, active: null } });

test('file valido: date dopo i prerequisiti; le sette potenze presenti', () => {
  assert.deepEqual(validateHistoricalTechDates(doc, techs), []);
  for (const n of ['DEU', 'USSR', 'USA', 'GBR', 'FRA', 'ITA', 'JPN']) assert.ok(doc.byNation[n], n);
  const bad = { ...doc, byNation: { USSR: { 'TECH-ARM-SLOPED': '1936-01-01' } } };
  assert.ok(validateHistoricalTechDates(bad, techs).some((e) => /prerequisito/.test(e)));
  assert.ok(validateHistoricalTechDates({ ...doc, byNation: { DEU: { 'TECH-NOPE': '1940-01-01' } } }, techs).some((e) => /sconosciuta/.test(e)));
});

test('dueTechs: solo quelle giunte alla data, in ordine, senza doppioni né quella in ricerca', () => {
  const usr = (done) => dueTechs(doc, 'USSR', nation(done), '1940-01-01');
  const due = usr(techs.initialResearch.USSR);
  assert.ok(due.includes('TECH-ARM-SLOPED') && due.includes('TECH-ARM-HEAVY') && due.includes('TECH-ARM-OPTICS'));
  assert.ok(!due.includes('TECH-ARM-TD'), 'cacciacarri sovietici solo dal 1942');
  assert.ok(due.indexOf('TECH-ARM-OPTICS') < due.indexOf('TECH-ARM-GUN-75L') && due.indexOf('TECH-ARM-GUN-75L') < due.indexOf('TECH-ARM-SLOPED'), 'prerequisiti prima');
  assert.ok(!usr([...techs.initialResearch.USSR, 'TECH-ARM-SLOPED']).includes('TECH-ARM-SLOPED'));
  const busy = { research: { done: [], active: { techId: 'TECH-IND-SERIES', daysLeft: 3 } } };
  assert.ok(!dueTechs(doc, 'USSR', busy, '1940-01-01').includes('TECH-IND-SERIES'), 'quella in ricerca resta alla ricerca');
});

test('sistema: le nazioni dell\'IA ricevono le tecnologie alla data, il giocatore no', () => {
  const sys = createHistoricalTechSystem(doc);
  const state = { date: '1940-02-01', player: 'DEU', nations: { USSR: nation(techs.initialResearch.USSR), DEU: nation(techs.initialResearch.DEU), XYZ: nation() } };
  const s = sys(state);
  assert.ok(s.nations.USSR.research.done.includes('TECH-ARM-SLOPED'));
  assert.deepEqual(s.nations.DEU.research.done, techs.initialResearch.DEU, 'il giocatore ricerca da sé');
  assert.equal(s.nations.XYZ, state.nations.XYZ);
  assert.equal(sys(s), s, 'idempotente');
  const asAi = sys({ ...state, player: 'USSR' });
  assert.ok(asAi.nations.DEU.research.done.includes('TECH-MECH-HT') && !asAi.nations.DEU.research.done.includes('TECH-ARM-GUN-75L'), 'Germania dell\'IA nel 1940');
  assert.ok(!asAi.nations.USSR.research.done.includes('TECH-ARM-SLOPED'));
});

test('carri sovietici: legati alle tecnologie e alle date; i nuovi modelli riforniscono le voci dei template', () => {
  const all = new Set(techs.technologies.map((t) => t.id));
  const lock = (id, date, r = all) => recipeLockReasons(rec(id), { date, researched: r }).map((x) => x.kind);
  const usr36 = new Set(techs.initialResearch.USSR);
  assert.deepEqual(lock('TNK-USSR-T34-1940', '1940-06-01', usr36), ['tech'], 'T-34: serve la corazza inclinata');
  assert.deepEqual(lock('TNK-USSR-T34-1940', '1940-06-01'), []);
  assert.deepEqual(lock('TNK-USSR-KV-1940', '1940-06-01', usr36), ['tech']);
  assert.deepEqual(lock('TNK-USSR-T26-1940', '1936-01-01', usr36), []);
  assert.deepEqual(lock('TNK-USSR-BT-1940', '1941-03-01', usr36), ['to']);
  for (const [id, from] of [['TNK-USSR-T34-85-1944', '1944-02-01'], ['TNK-USSR-IS2-1944', '1944-04-01'], ['TD-USSR-SU76-1943', '1942-12-01'], ['TD-USSR-SU100-1944', '1944-09-01'], ['TD-USSR-ISU152-1943', '1943-11-01']]) {
    assert.ok(rec(id), id);
    assert.deepEqual(lock(id, from), [], id);
    assert.ok(lock(id, '1941-01-01').includes('from'), id);
  }
  const src = buildEquivalence({ catalog });
  assert.ok(src('USSR', 'equipment.TNK-USSR-T34-1940').includes('equipment.TNK-USSR-T34-85-1944'), 'il T-34/85 rifornisce i reparti di T-34');
  assert.ok(src('USSR', 'equipment.TNK-USSR-KV-1940').includes('equipment.TNK-USSR-IS2-1944'));
  const w = (id, category = 'TANK') => weaponWeight({ id, category }, cfg);
  assert.ok(w('TNK-USSR-T34-1940').armor > w('TNK-USSR-BT-1940').armor);
  assert.ok(w('TNK-USSR-IS2-1944').hard > w('TNK-USSR-KV-1940').hard);
  assert.ok(w('TD-USSR-SU100-1944', 'TANK_DESTROYER').hard > w('TD-USSR-SU76-1943', 'TANK_DESTROYER').hard);
});
