// Esperienza, morale, prontezza, stato operativo (regole pure) e relativi scenari della specifica che il progetto può già verificare.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateConditionConfig, experienceLevel, conditionOf, createConditionState, markNew, trainUntil, setPolicy, materialStrength, valueBand, operationalState, validateConditionState, clamp } from '../src/rules/divisionCondition.js';
import { createConditionSystem, playerSetPolicy } from '../src/game/conditionState.js';
import { unitInfo } from '../src/rules/unitInfo.js';
import { parseSave, serializeSave } from '../src/game/save.js';

const cfg = JSON.parse(readFileSync(new URL('../data/units/condition_config.json', import.meta.url), 'utf8'));

test('configurazione valida; valori decisi dall\'utente: iniziale 45, unità nuove 10/45, tetto 39 a +1 al mese', () => {
  assert.deepEqual(validateConditionConfig(cfg), []);
  assert.deepEqual([cfg.initial.existing1936.experience, cfg.initial.existing1936.morale], [45, 95]);
  assert.deepEqual([cfg.training.morale.from, cfg.training.morale.cap, cfg.training.morale.perMonth], [45, 85, null], 'velocità del morale in reclutamento ancora da decidere');
  assert.deepEqual([cfg.initial.newUnit.experience, cfg.initial.newUnit.morale], [10, 45]);
  assert.equal(cfg.initial.existing1936.readiness, 80, 'decisione dell\'utente: pace, organizzazione intatta');
  assert.equal(cfg.initial.newUnit.readiness, 45);
  assert.deepEqual([cfg.training.newUnitCap, cfg.training.perMonth], [39, 1]);
  assert.deepEqual(validateConditionConfig({ ...cfg, levels: cfg.levels.slice(1) }).length > 0, true);
});

test('fasce descrittive di morale/prontezza: soglie 90/70/50/30 e mai fuori scala', () => {
  const b = (v) => valueBand(v, cfg).name;
  assert.deepEqual([100, 90, 89, 70, 69, 50, 49, 30, 29, 0].map(b), ['Eccellente', 'Eccellente', 'Buono', 'Buono', 'Mediocre', 'Mediocre', 'Critico', 'Critico', 'Collasso', 'Collasso']);
  assert.equal(b(250), 'Eccellente');
});

test('prontezza (organizzazione) e forza materiale sono distinte: una divisione al completo con prontezza bassa è limitata dalla prontezza; una organizzata ma senza mezzi, dalla dotazione', () => {
  assert.deepEqual([st({ readiness: 15 }).id, st({ readiness: 15 }).cause], ['not_operational', 'prontezza 15']);
  const s = operationalState({ ...full, equipmentWorstRatio: 0.3, readiness: 95, morale: 95 }, cfg);
  assert.deepEqual([s.id, s.cause], ['inefficient', 'equipaggiamento 30']);
});

test('livelli di esperienza: soglie esatte della tabella e valori fuori scala ricondotti nell\'intervallo', () => {
  const at = (v) => experienceLevel(v, cfg).level;
  assert.deepEqual([0, 19, 20, 39, 40, 59, 60, 79, 80, 100].map(at), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  assert.equal(at(45), 3);
  assert.equal(at(-5), 1);
  assert.equal(at(140), 5);
  assert.equal(clamp(120), 100);
});

test('condizione di base: le divisioni del 1936 partono a 45/45 senza voci memorizzate; la politica predefinita è «normale»', () => {
  const c = conditionOf(undefined, 'U1', cfg);
  assert.deepEqual([c.experience, c.morale, c.readiness, c.policy, c.isNew], [45, 95, 80, 'normal', false]);
});

test('addestramento: solo le unità nuove, +1 al mese fino al tetto 39, mai oltre; le unità del 1936 restano a 45', () => {
  let cond = markNew(createConditionState(), ['N1'], cfg, '1936-01-15');
  assert.equal(conditionOf(cond, 'N1', cfg).experience, 10);
  cond = trainUntil(cond, '1936-01-31', cfg);
  assert.equal(cond.byUnit.N1.experience, 10, 'stesso mese: nessun aumento');
  cond = trainUntil(cond, '1936-04-02', cfg);
  assert.equal(cond.byUnit.N1.experience, 13, 'tre mesi: +3');
  cond = trainUntil(cond, '1940-01-01', cfg);
  assert.equal(cond.byUnit.N1.experience, 39, 'tetto raggiunto');
  const again = trainUntil(cond, '1950-01-01', cfg);
  assert.equal(again.byUnit.N1.experience, 39, 'mai oltre il tetto');
  assert.equal(conditionOf(cond, 'VECCHIA', cfg).experience, 45);
});

test('tick idempotenti e deterministici: stessa data due volte = stesso stato; il sistema non tocca lo stato senza voci', () => {
  const sys = createConditionSystem(cfg);
  const base = { date: '1936-03-01', conditions: markNew(createConditionState(), ['N1'], cfg, '1936-01-01') };
  const a = sys(base);
  const b = sys(a);
  assert.equal(a.conditions.byUnit.N1.experience, 12);
  assert.deepEqual(b, a);
  assert.deepEqual(sys(base), sys(base));
  const noCond = { date: '1936-03-01' };
  assert.equal(sys(noCond), noCond);
});

test('politica d\'impiego: viene memorizzata e NON cambia esperienza né morale; valori non validi rifiutati', () => {
  const s = playerSetPolicy({ date: '1936-01-01' }, 'U1', 'aggressive', cfg);
  const c = conditionOf(s.conditions, 'U1', cfg);
  assert.deepEqual([c.policy, c.experience, c.morale, c.readiness], ['aggressive', 45, 95, 80]);
  assert.throws(() => setPolicy(createConditionState(), 'U1', 'folle', cfg), RangeError);
});

test('forza materiale (componente dello stato operativo, NON la prontezza) = il più basso tra uomini e dotazione, con la causa', () => {
  assert.deepEqual(materialStrength({ manpowerRatio: 0.9, equipment: [{ item: 'carri', ratio: 0.4 }, { item: 'cannoni', ratio: 0.8 }] }), { value: 40, cause: 'carri' });
  assert.deepEqual(materialStrength({ manpowerRatio: 0.3, equipment: [{ item: 'carri', ratio: 0.9 }] }), { value: 30, cause: 'uomini' });
  assert.deepEqual(materialStrength({ manpowerRatio: null, equipment: [] }), { value: null, cause: null });
  assert.equal(materialStrength({ manpowerRatio: 1.5, equipment: [] }).value, 100, 'mai oltre 100');
});

// --- scenari della specifica (6.11) verificabili oggi -------------------------------------------------------------
const full = { manpowerRatio: 1, equipmentWorstRatio: 1, cadre: false };
const st = (o) => operationalState({ ...full, readiness: 100, morale: 80, ...o }, cfg);

test('scenario 1: veterana (esperienza 70), morale basso, equipaggiamento completo → inefficiente o non operativa per il morale; l\'esperienza non lo salva', () => {
  assert.equal(experienceLevel(70, cfg).name, 'Veterana');
  const s = st({ morale: 15 });
  assert.deepEqual([s.id, s.cause], ['not_operational', 'morale 15']);
  assert.equal(st({ morale: 30 }).id, 'inefficient');
});

test('scenario 2: recluta (esperienza 10), morale alto, prontezza alta → Pronta: l\'esperienza non entra nello stato operativo', () => {
  assert.equal(experienceLevel(10, cfg).name, 'Recluta');
  assert.equal(st({ morale: 90, readiness: 95 }).id, 'ready');
});

test('scenario 8: armi obsolete ma personale veterano → l\'esperienza resta, la carenza di dotazione appare come causa', () => {
  const cond = { byUnit: { V: { experience: 70, morale: 80, policy: 'normal', isNew: false } } };
  const c = conditionOf(cond, 'V', cfg);
  const s = operationalState({ ...full, equipmentWorstRatio: 0.3, readiness: 30, morale: c.morale }, cfg);
  assert.equal(c.experience, 70);
  assert.deepEqual([s.id, s.cause], ['inefficient', 'equipaggiamento 30']);
});

test('scenario 9: sotto organico con morale alto → Ridotta per l\'organico', () => {
  const s = st({ manpowerRatio: 0.6, readiness: 60, morale: 95 });
  assert.deepEqual([s.id, s.cause], ['reduced', 'organico 60']);
});

test('quadro: sempre Non operativa, con la causa; componenti sconosciute non entrano nel calcolo', () => {
  assert.deepEqual([st({ cadre: true }).id, st({ cadre: true }).cause], ['not_operational', 'quadro (non pronto al combattimento)']);
  assert.equal(operationalState({ manpowerRatio: null, equipmentWorstRatio: null, morale: null, readiness: null, cadre: false }, cfg).id, 'unknown');
  assert.equal(st({ manpowerRatio: 0.85, readiness: 85 }).id, 'ready');
});

test('stato operativo derivato: non compare nello stato memorizzato; le soglie sono per componente (nessuna soglia unica nel codice)', () => {
  const cond = playerSetPolicy({ date: '1936-01-01' }, 'U1', 'normal', cfg).conditions;
  assert.equal(JSON.stringify(cond).includes('operational'), false);
  const custom = structuredClone(cfg);
  custom.operationalStates.bands.morale = { ready: 95, reduced: 70, inefficient: 40 };
  assert.equal(operationalState({ ...full, readiness: 100, morale: 80 }, cfg).id, 'ready');
  assert.equal(operationalState({ ...full, readiness: 100, morale: 80 }, custom).id, 'reduced');
});

test('salvataggio: lo stato con conditions viaggia identico; forma errata segnalata', () => {
  assert.deepEqual(validateConditionState(undefined), []);
  const conditions = markNew(createConditionState(), ['N1'], cfg, '1936-01-01');
  assert.deepEqual(validateConditionState(conditions), []);
  assert.deepEqual(JSON.parse(JSON.stringify(conditions)), conditions);
  assert.match(validateConditionState({ schema: 'conditions-v1', byUnit: { X: { experience: 130, morale: 50, policy: 'x', isNew: 1 } } }).join('|'), /fuori da 0–100.*politica non valida.*non booleano/);
  const stateNew = markNew(createConditionState(), ['N1'], cfg, '1936-01-01');
  assert.equal(stateNew.byUnit.N1.morale, 45, 'unità nuova: morale 45');
  assert.equal(trainUntil(stateNew, '1938-01-01', cfg).byUnit.N1.morale, 45, 'senza velocità decisa il morale non si muove');
  const fast = structuredClone(cfg); fast.training.morale.perMonth = 2;
  assert.equal(trainUntil(stateNew, '1936-06-01', fast).byUnit.N1.morale, 55, '5 mesi a +2');
  assert.equal(trainUntil(stateNew, '1940-01-01', fast).byUnit.N1.morale, 85, 'tetto del reclutamento 85');
  assert.equal(typeof parseSave, 'function'); assert.equal(typeof serializeSave, 'function');
});

test('scheda unità: esperienza con livello, morale, prontezza con causa e stato operativo con causa', () => {
  const units = [{ id: 'D1', name: '1. ID', nation: 'DEU', echelon: 'division', category: 'infantry' }];
  const state = {
    commanders: { assignments: {} }, orbat: { links: {} }, movement: undefined,
    forces: { divisions: { D1: { templateId: 'T', items: { 'manpower.war': { planned: 1000, effective: 900 }, 'equipment.carri': { planned: 100, effective: 40 } } } } },
  };
  const info = unitInfo(state, units[0], { unitsById: new Map(units.map((u) => [u.id, u])), officersById: new Map(), initial: new Map([['D1', 'P_A']]), conditionConfig: cfg });
  assert.deepEqual([info.condition.experience, info.condition.experienceLevel.name, info.condition.morale], [45, 'Esperta', 95]);
  assert.deepEqual(info.condition.material, { value: 40, cause: 'carri' });
  assert.deepEqual([info.condition.readiness, info.condition.readinessBand, info.condition.moraleBand], [80, 'Buono', 'Eccellente']);
  assert.deepEqual([info.condition.operational.id, info.condition.operational.cause], ['inefficient', 'equipaggiamento 40']);
  assert.equal(info.condition.policy, 'normal');
});
