// Testi e righe dell'interfaccia di ricerca e sicurezza (funzioni pure, senza React).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newGame } from '../src/game/state.js';
import { createSecurity } from '../src/game/security.js';
import { securityOf } from '../src/game/securityState.js';
import { securitySummary, sabotageRows, describeOrderFailure, describeLog, describeIncident } from '../src/ui/securityView.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const cfg = json('security/security.json'); const political = json('political_1936.json'); const ids = json('nations.json').map((n) => n.id);
const economy = json('economy/economy.json'); const population = json('population/population.json');
const start = { nationIds: ids, industry: json('industry/initial_industry.json'), stocks: json('industry/initial_stocks.json'), cash: json('industry/initial_cash.json'), economy, population };
const security = createSecurity({ security: cfg, economy, political });
const ctx = { security, cfg, techName: (i) => `T(${i})`, nationName: (i) => `N(${i})`, facilityName: (t) => `F(${t})`, placeName: (p) => `L(${p})` };
const g0 = newGame({ nation: 'ITA', political, ownersWithProvinces: ids, start }).state;
const withIta = (patch) => ({ ...g0, nations: { ...g0.nations, ITA: { ...g0.nations.ITA, balance: 1e4, ...patch } } });

test('messaggi di rifiuto in italiano, con il nome della tecnologia', () => {
  const m = (r) => describeOrderFailure({ ok: false, ...r }, { techName: (i) => `T(${i})` });
  assert.match(m({ reason: 'missing', missing: [{ what: 'tech', need: 'X', have: null }] }), /tecnologia «T\(X\)»/);
  assert.match(m({ reason: 'no_intel' }), /spia schierata/);
  assert.match(m({ reason: 'no_agent', role: 'saboteur' }), /sabotatore/);
  assert.match(m({ reason: 'busy', active: 'A' }), /già una ricerca in corso \(T\(A\)\)/);
  assert.match(m({ reason: 'max_level', max: 5 }), /\(5\)/);
  assert.equal(describeOrderFailure({ ok: true }), '');
});

test('quadro della sicurezza: senza tecnologia agenti bloccati, la polizia militare c\'è sempre; con spia schierata compaiono gli impianti del bersaglio', () => {
  const none = securitySummary(withIta({}), 'ITA', ctx);
  assert.equal(none.canAgents, false); assert.equal(none.agentsTech, 'T(TECH-SEC-INTEL)');
  assert.ok(none.police.length > 0 && none.police[0].defense === 1 && none.police[0].max === 5);
  assert.ok(none.targetNations.some((t) => t.id === 'DEU') && !none.targetNations.some((t) => t.id === 'ITA'));
  assert.deepEqual(sabotageRows(withIta({}), 'ITA', 'DEU', ctx), []);
  const s = security.deploySpy(withIta({ research: { done: ['TECH-SEC-INTEL'], active: null }, security: { ...securityOf({}), agents: { spy: 1, saboteur: 0 } } }), 'ITA', 'DEU').state;
  const sum = securitySummary(s, 'ITA', ctx);
  assert.equal(sum.canAgents, true); assert.deepEqual(sum.deployed, [{ target: 'DEU', name: 'N(DEU)', count: 1 }]);
  const rows = sabotageRows(s, 'ITA', 'DEU', ctx);
  assert.ok(rows.length > 0 && /^F\(/.test(rows[0].name) && rows[0].chance > 0 && rows[0].chance < 1);
  assert.equal(sum.costs.sabotage.ecv, 10);
});

test('registro e incidenti leggibili', () => {
  assert.match(describeLog({ day: 5, kind: 'sabotage', result: 'success', detected: true, damage: 0.3, type: 'T', targetNation: 'FRA' }, ctx), /riuscito contro F\(T\) in N\(FRA\) \(danno 30%\) · sabotatore catturato/);
  assert.match(describeLog({ day: 5, kind: 'sabotage', result: 'failure', detected: false, type: 'T', targetNation: 'FRA' }, ctx), /fallito.*senza essere visto/);
  assert.match(describeLog({ day: 2, kind: 'spy_caught', targetNation: 'FRA', count: 2 }, ctx), /2 spie scoperte in N\(FRA\)/);
  assert.match(describeIncident({ day: 7, kind: 'sabotage', type: 'T', success: false, attacker: 'DEU' }, ctx), /sventato.*responsabile: N\(DEU\)/);
  assert.match(describeIncident({ day: 7, kind: 'sabotage', type: 'T', success: true, attacker: null }, ctx), /autore ignoto/);
});
