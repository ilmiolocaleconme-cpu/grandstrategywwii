// Servizi dei reparti (20/11/2026): schema comune a tutte le nazioni; effetti su esperienza iniziale e precedenza nei rinforzi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateServices, serviceOf, withServiceExperience, servicePriority } from '../src/data/services.js';
import { conditionOf } from '../src/rules/divisionCondition.js';
import { planReinforcements } from '../src/rules/reinforcements.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const doc = json('units/services.json');
const units = json('units/units.json').units;
const byId = new Map(units.map((u) => [u.id, u]));
const cfg = json('units/condition_config.json');

test('servizi: file valido; un servizio di default per ciascuna delle 7 grandi potenze; reparti esistenti e della nazione giusta', () => {
  assert.deepEqual(validateServices(doc, { unitsById: byId }), []);
  const defaults = doc.services.filter((s) => s.default).map((s) => s.nation).sort();
  assert.deepEqual(defaults, ['DEU', 'FRA', 'GBR', 'ITA', 'JPN', 'USA', 'USSR']);
  const bad = structuredClone(doc); bad.services.find((s) => s.id === 'DEU-WAFFEN-SS').units.push('U00291');
  assert.ok(validateServices(bad, { unitsById: byId }).some((e) => /è di USSR/.test(e)));
});

test('servizio di un reparto: SS, Guardie e Guardia imperiale dai loro elenchi, gli altri il default della nazione', () => {
  assert.equal(serviceOf(doc, byId.get('U00116')).id, 'DEU-WAFFEN-SS');
  assert.equal(serviceOf(doc, byId.get('U00291')).id, 'USSR-GVARDIJA');
  assert.equal(serviceOf(doc, byId.get('U00171')).id, 'JPN-KONOE');
  assert.equal(serviceOf(doc, units.find((u) => u.nation === 'DEU' && u.category === 'infantry' && u.echelon === 'division')).id, 'DEU-HEER');
});

test('esperienza iniziale: nazione + bonus del servizio (SS 55+5, Guardie 35+10); gli altri reparti invariati', () => {
  const c = withServiceExperience(cfg, doc, units);
  const exp = (id) => conditionOf({ byUnit: {} }, id, c, byId.get(id).nation).experience;
  const base = cfg.initial.existing1936.experienceByNation;
  assert.equal(exp('U00116'), base.DEU + 5);
  assert.equal(exp('U00291'), base.USSR + 10);
  const heer = units.find((u) => u.nation === 'DEU' && u.category === 'infantry' && u.echelon === 'division');
  assert.equal(exp(heer.id), base.DEU);
  assert.equal(cfg.initial.existing1936.experienceByUnit, undefined, 'il file di configurazione non viene modificato');
});

test('rinforzi: i reparti del servizio con precedenza passano davanti a pari carenza', () => {
  const p = servicePriority(doc, units, 'DEU');
  assert.ok(p.U00116 && p.U00118 && p.U00119);
  assert.equal(Object.keys(p).length, 3);
  const item = (planned, effective) => ({ planned, effective, source: 'ratio' });
  const forces = { divisions: { U00100: { items: { 'equipment.X': item(100, 50) } }, U00116: { items: { 'equipment.X': item(100, 50) } } } };
  const us = [{ id: 'U00100', nation: 'DEU', echelon: 'division' }, { id: 'U00116', nation: 'DEU', echelon: 'division' }];
  const plan = planReinforcements(forces, { units: us, nation: 'DEU', date: '1940-01-01', poolAvailable: 0, stocks: { 'equipment.X': 30 }, requests: p, transitDays: () => 1 });
  assert.equal(plan.transfers.find((t) => t.item === 'equipment.X').divisionId, 'U00116', 'la SS riceve per prima');
});
