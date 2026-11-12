// Collegamento produzione → divisioni (12/11/2026): i pezzi prodotti con l'id del catalogo riforniscono la voce del template della divisione.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { buildEquivalence } from '../src/data/equipmentEquivalence.js';
import { planReinforcements, dispatch, applyArrivals, validateReinforcementFields, inTransitFromStock } from '../src/rules/reinforcements.js';
import { reinforcementNeeds } from '../src/rules/reinforcementView.js';

const edir = new URL('../data/units/equipment/', import.meta.url);
const catalog = mergeEquipmentCatalogs(readdirSync(edir).filter((n) => /^catalog.*\.json$/.test(n)).sort().map((f) => JSON.parse(readFileSync(new URL(f, edir), 'utf8'))));
const upgradeMap = JSON.parse(readFileSync(new URL('upgrade_map.json', edir), 'utf8'));
const sourcesOf = buildEquivalence({ catalog, upgradeMap });

test('i fucili tedeschi prodotti (INW-DEU-RIFLE-1939) riforniscono la voce «fucili» del template 1936, e viceversa', () => {
  const s = sourcesOf('DEU', 'equipment.fucili');
  assert.equal(s[0], 'equipment.fucili', 'prima la voce stessa');
  assert.ok(s.includes('equipment.INW-DEU-RIFLE-1939'));
  assert.ok(s.includes('equipment.INW-DEU-RIFLE'));
  assert.ok(sourcesOf('DEU', 'equipment.INW-DEU-RIFLE-1939').includes('equipment.fucili'));
  assert.ok(!s.includes('equipment.pistole'), 'le pistole restano un\'altra voce');
});

test('voci senza legami e voci non di equipaggiamento: solo sé stesse (comportamento di prima)', () => {
  assert.deepEqual(sourcesOf('DEU', 'manpower.war'), ['manpower.war']);
  assert.deepEqual(sourcesOf('DEU', 'horses'), ['horses']);
  assert.deepEqual(sourcesOf('ZZZ', 'equipment.qualcosa'), ['equipment.qualcosa']);
  assert.deepEqual(sourcesOf('ITA', 'equipment.fucili'), ['equipment.fucili'], 'gli alias sono per nazione');
});

const forces = () => ({ schema: 'forces-v1', initialized: true, divisions: { D1: { templateId: 't', since: '1936-01-01', items: { 'equipment.fucili': { planned: 100, effective: 20 } } } } });
const units = [{ id: 'D1', nation: 'DEU' }];
const plan = (f, stocks, withSources = true) => planReinforcements(f, { units, nation: 'DEU', date: '1936-03-01', poolAvailable: 0, stocks, transitDays: () => 2, sourcesOf: withSources ? (item) => sourcesOf('DEU', item) : null });

test('rinforzi: si preleva prima dalla voce stessa, poi dalle equivalenti; senza legami i fucili prodotti restano in magazzino come prima', () => {
  const stocks = { 'equipment.fucili': 10, 'equipment.INW-DEU-RIFLE-1939': 500 };
  const p = plan(forces(), stocks);
  assert.deepEqual(p.transfers.map((t) => [t.item, t.qty, t.stockKey ?? null]), [['equipment.fucili', 10, null], ['equipment.fucili', 70, 'equipment.INW-DEU-RIFLE-1939']]);
  assert.equal(p.remaining.stocks['equipment.INW-DEU-RIFLE-1939'], 430);
  assert.equal(plan(forces(), { 'equipment.INW-DEU-RIFLE-1939': 500 }, false).transfers.length, 0, 'vecchio comportamento');
  const f2 = dispatch(forces(), p.transfers);
  assert.deepEqual(validateReinforcementFields(f2), []);
  assert.equal(inTransitFromStock(f2, ['D1'], 'equipment.INW-DEU-RIFLE-1939'), 70);
  assert.equal(plan(f2, stocks).transfers.length, 0, 'niente doppia assegnazione: la carenza è già in viaggio');
  const arr = applyArrivals(f2, '1936-03-03');
  assert.equal(arr.forces.divisions.D1.items['equipment.fucili'].effective, 100);
  const bad = structuredClone(f2); bad.transfers[0].stockKey = '';
  assert.ok(validateReinforcementFields(bad).some((e) => /voce di scorta/.test(e)));
});

test('scheda della divisione: la scorta mostrata somma le voci equivalenti', () => {
  const r = reinforcementNeeds({ forces: forces(), stocks: { 'equipment.INW-DEU-RIFLE-1939': 42 }, divisionId: 'D1', sourcesOf: (item) => sourcesOf('DEU', item) });
  assert.equal(r.rows[0].stock, 42);
  assert.equal(reinforcementNeeds({ forces: forces(), stocks: { 'equipment.INW-DEU-RIFLE-1939': 42 }, divisionId: 'D1' }).rows[0].stock, 0);
});

test('carri: le voci TNK delle divisioni ricevono i carri prodotti per modello e, per ultimi, i carri generici delle ricette REC-TANK-*', async () => {
  const { buildCategoryOf } = await import('../src/rules/equipmentFill.js');
  const categoryOf = buildCategoryOf(catalog);
  const src = buildEquivalence({ catalog, upgradeMap, generic: { TANK: 'tanks' }, categoryOf });
  assert.deepEqual(src('FRA', 'equipment.TNK-FRA-B1BIS-1940'), ['equipment.TNK-FRA-B1BIS-1940', 'tanks']);
  assert.ok(src('DEU', 'equipment.carri').includes('equipment.TNK-DEU-TANK'));
  assert.equal(src('DEU', 'equipment.carri').at(-1), 'tanks');
  assert.deepEqual(src('FRA', 'equipment.ART-FRA-HOW155C'), ['equipment.ART-FRA-HOW155C'], 'gli obici no');
  const f = { schema: 'forces-v1', initialized: true, divisions: { C1: { templateId: 't', since: '1940-01-01', items: { 'equipment.TNK-FRA-B1BIS-1940': { planned: 68, effective: 40 } } } } };
  const p = planReinforcements(f, { units: [{ id: 'C1', nation: 'FRA' }], nation: 'FRA', date: '1940-03-01', poolAvailable: 0, stocks: { 'equipment.TNK-FRA-B1BIS-1940': 10, tanks: 50 }, transitDays: () => 3, sourcesOf: (item) => src('FRA', item) });
  assert.deepEqual(p.transfers.map((t) => [t.qty, t.stockKey ?? null]), [[10, null], [18, 'tanks']]);
});
