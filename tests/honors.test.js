// Vittorie e promozioni (20/11/2026): Guardie sovietiche per promozione dopo 3 vittorie, dal 18/9/1941.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recordWins, createPromotionSystem, serviceOfUnit, validateHonors } from '../src/game/honorsState.js';
import { validateServices, servicePriority } from '../src/data/services.js';
import { unitsList, validateUnitChanges } from '../src/rules/unitRegistry.js';
import { conditionOf } from '../src/rules/divisionCondition.js';
import { serializeSave } from '../src/game/save.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const doc = json('units/services.json');
const units = json('units/units.json').units;
const cfg = json('units/condition_config.json');
const rifle = units.find((u) => u.nation === 'USSR' && u.category === 'infantry' && u.echelon === 'division' && !/Guards/.test(u.name));
const sys = createPromotionSystem({ doc, unitsOf: (s) => unitsList(s, units), conditionCfg: cfg });
const withWins = (date, n) => ({ date, honors: recordWins(undefined, Array(n).fill(rifle.id)) });

test('servizi con promozione: file valido (da, vittorie, nomi)', () => {
  assert.deepEqual(validateServices(doc, { unitsById: new Map(units.map((u) => [u.id, u])) }), []);
  const g = doc.services.find((s) => s.id === 'USSR-GVARDIJA');
  assert.deepEqual([g.promotion.from, g.promotion.wins], ['USSR-RKKA', 3]);
});

test('vittorie: si contano per reparto', () => {
  const h = recordWins(recordWins(undefined, ['A', 'B']), ['A']);
  assert.deepEqual(h.wins, { A: 2, B: 1 });
  assert.deepEqual(validateHonors(h), []);
  assert.ok(validateHonors({ schema: 'x' }).length);
});

test('promozione: 3 vittorie dopo il 18/9/1941 → Guardia, nome russo col numero successivo, esperienza +10, precedenza nei rinforzi', () => {
  assert.equal(sys(withWins('1941-09-17', 5)).honors.services[rifle.id], undefined, 'prima del 18/9/1941 no');
  assert.equal(sys(withWins('1941-10-01', 2)).honors.services?.[rifle.id], undefined, 'servono 3 vittorie');
  const s = sys(withWins('1941-10-01', 3));
  assert.deepEqual(s.honors.services[rifle.id], { service: 'USSR-GVARDIJA', since: '1941-10-01', exName: rifle.name });
  const u = unitsList(s, units).find((x) => x.id === rifle.id);
  assert.equal(u.name, '14-ja gvardejskaja strelkovaja divizija', 'dopo la 13ª Guardie storica');
  assert.deepEqual(validateUnitChanges(s.unitChanges), []);
  assert.equal(serviceOfUnit(doc, s, u).id, 'USSR-GVARDIJA');
  assert.equal(conditionOf(s.conditions, rifle.id, cfg, 'USSR').experience, cfg.initial.existing1936.experienceByNation.USSR + 10);
  assert.equal(servicePriority(doc, units, 'USSR', s)[rifle.id], true);
  assert.equal(sys(s), s, 'già promossa: nessun cambio');
  assert.deepEqual(JSON.parse(serializeSave(s)).state.honors, s.honors, 'nel salvataggio');
  assert.deepEqual(validateHonors(s.honors), []);
});

test('la Germania non ha promozioni: le vittorie tedesche non cambiano servizio', () => {
  const deu = units.find((u) => u.nation === 'DEU' && u.echelon === 'division');
  const s = sys({ date: '1942-01-01', honors: recordWins(undefined, [deu.id, deu.id, deu.id, deu.id]) });
  assert.equal(s.honors.services?.[deu.id], undefined);
});
