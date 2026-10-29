// Stima delle guarnigioni 1936 e suo effetto sulla difesa (29/10/2026). DESIGN_DEFAULT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGarrisonEstimate, presenceFromEstimate, validateGarrisonEstimate } from '../src/data/garrison.js';
import { createSecurity } from '../src/game/security.js';
import { newGame } from '../src/game/state.js';
import { validateSecurityConfig } from '../src/rules/security.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const cfg = json('security/security.json'); const political = json('political_1936.json'); const economy = json('economy/economy.json');
const units = json('units/units.json').units; const deployment = json('units/deployment_1936.json'); const entityIds = political.map((e) => e.id);
const build = (over = {}) => buildGarrisonEstimate({ deployment, units, config: cfg, entityIds, ...over });

test('stima: il file nel repository coincide con la derivazione, livelli nei limiti, i comandi non contano', () => {
  const est = build();
  assert.deepEqual(JSON.parse(JSON.stringify(est)), json('military/garrison_estimate_1936.json'));
  assert.deepEqual(validateGarrisonEstimate(est), []); assert.equal(est.quality, 'DESIGN_DEFAULT');
  const echelon = new Map(units.map((u) => [u.id, u.echelon]));
  const counted = deployment.entries.filter((e) => ['division', 'brigade'].includes(echelon.get(e.unit))).length;
  assert.equal(Object.values(est.byProvince).reduce((a, v) => a + v.units, 0), counted);
  for (const v of Object.values(est.byProvince)) assert.ok(v.garrison >= 1 && v.garrison <= 3 && v.garrison === Math.min(3, v.units));
  for (const v of Object.values(est.byEntity)) assert.ok(v.garrison >= 1 && v.garrison <= 2);
});

test('stima: soglie dell\'entità e dati difettosi', () => {
  const est = build({ deployment: { entries: [{ unit: units.find((u) => u.echelon === 'division').id, province: 'P_DEU_BERLIN' }] } });
  assert.equal(est.byEntity.DEU.garrison, 1); assert.equal(est.byProvince.P_DEU_BERLIN.garrison, 1);
  assert.ok(validateGarrisonEstimate({ schema: 'x' }).length > 0);
  assert.ok(validateGarrisonEstimate({ schema: 'garrison-estimate-v1', byProvince: { P: { garrison: 4 } } }).length > 0);
  const bad = structuredClone(cfg); bad.garrison.estimate.entityThresholds = [6, 1];
  assert.ok(validateSecurityConfig(bad).length > 0);
  assert.deepEqual(validateSecurityConfig(cfg, {}).filter((e) => /guarnigione/.test(e)), []);
});

test('difesa: la guarnigione stimata alza la difesa dell\'impianto iniziale della Germania e non cambia chi non ha unità schierate', () => {
  const presence = presenceFromEstimate(json('military/garrison_estimate_1936.json'));
  const withG = createSecurity({ security: cfg, economy, political, presence }); const without = createSecurity({ security: cfg, economy, political });
  const start = { nationIds: json('nations.json').map((n) => n.id), industry: json('industry/initial_industry.json'), stocks: json('industry/initial_stocks.json'), cash: json('industry/initial_cash.json'), economy, population: json('population/population.json') };
  const s = newGame({ nation: 'ITA', political, ownersWithProvinces: start.nationIds, start }).state;
  const f = s.nations.DEU.facilities[0]; const place = withG.placeOf(f);
  assert.ok(withG.defenseAt(s.nations.DEU, place).garrison > without.defenseAt(s.nations.DEU, place).garrison, `luogo ${place}`);
  const g = s.nations.ITA.facilities[0];
  assert.equal(withG.defenseAt(s.nations.ITA, withG.placeOf(g)).garrison, 0, 'nessuna unità schierata nei dati: nessuna guarnigione stimata');
});
