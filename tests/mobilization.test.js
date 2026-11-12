// Leggi di mobilitazione (04/11/2026): la mobilitazione francese scatta con la guerra Germania-Polonia; i quadri diventano divisioni che ricevono rinforzi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newGame } from '../src/game/state.js';
import { validateState } from '../src/game/state.js';
import { initForcesState, createForcesActivationSystem } from '../src/game/forcesState.js';
import { createMobilizationSystem, validateMobilizationLaws, validateMobilizationShape } from '../src/game/mobilizationState.js';
import { advanceDays } from '../src/game/engine.js';
import { createWar, declareWar } from '../src/rules/war.js';
import { planReinforcements } from '../src/rules/reinforcements.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const units = json('units/units.json').units;
const laws = json('units/mobilization_laws.json');
const names = ['divisione_fanteria_germania_1936', 'divisione_corazzata_germania_1936', 'divisione_fanteria_gran_bretagna_1936', 'divisione_fanteria_francia_1936', 'divisione_fanteria_germania_1939', 'divisione_fanteria_francia_1939', 'divisione_fanteria_italia_1940'];
const templates = names.map((f) => json(`units/templates/${f}.json`));
const ctx = { units, templates, ratio: json('units/readiness.json').initialFillRatio.value, upgradeMap: json('units/equipment/upgrade_map.json') };
const political = json('political_1936.json');
const nationList = json('nations.json').map((n) => n.id);
const start = () => initForcesState(newGame({ nation: 'FRA', political, ownersWithProvinces: nationList }).state, ctx).state;
const nationOf = (id) => units.find((u) => u.id === id).nation;
const cadresOf = (s, nation) => Object.entries(s.forces.divisions).filter(([id, d]) => nationOf(id) === nation && d.cadre === true);
const mob = createMobilizationSystem({ units, laws });
const atWarWith = (s, a, b) => ({ ...s, war: declareWar(s.war ?? createWar(), { a, b, date: s.date }) });

test('la tabella delle leggi è valida; condizioni, nazioni ed effetti sconosciuti vengono rifiutati', () => {
  assert.deepEqual(validateMobilizationLaws(laws, { nationIds: nationList }), []);
  const bad = (patch) => validateMobilizationLaws({ ...laws, laws: [{ ...laws.laws[0], ...patch }] }, { nationIds: nationList });
  assert.match(bad({ nation: 'XXX' }).join(), /inesistente/);
  assert.match(bad({ trigger: { type: 'war', a: 'DEU', b: 'DEU' } }).join(), /due nazioni diverse/);
  assert.match(bad({ trigger: { type: 'data', a: 'DEU', b: 'POL' } }).join(), /non supportata/);
  assert.match(bad({ effect: 'boh' }).join(), /effetto/);
  assert.match(bad({ source: '' }).join(), /senza fonte/);
  assert.match(validateMobilizationLaws({ ...laws, laws: [laws.laws[0], laws.laws[0]] }, { nationIds: nationList }).join(), /duplicato/);
});

test('senza guerra Germania-Polonia nulla cambia (stesso oggetto); una guerra Germania-Francia da sola NON fa scattare la legge', () => {
  const s = start();
  assert.equal(mob(s), s);
  const g = atWarWith(s, 'DEU', 'FRA');
  assert.equal(mob(g), g);
  assert.ok(cadresOf(s, 'FRA').length > 0, 'la Francia parte con quadri');
});

test('con la guerra Germania-Polonia tutti i quadri francesi sono mobilitati e la data è registrata; Gran Bretagna e Germania non toccate; idempotente', () => {
  const s = { ...start(), date: '1939-09-01' };
  const gbrBefore = cadresOf(s, 'GBR').length;
  assert.ok(gbrBefore > 0);
  const w = mob(atWarWith(s, 'DEU', 'POL'));
  assert.equal(cadresOf(w, 'FRA').length, 0);
  assert.equal(cadresOf(w, 'GBR').length, gbrBefore, 'la legge vale solo per la Francia');
  assert.deepEqual(w.mobilization, { schema: 'mobilization-v1', started: { 'LAW-FRA-GENERAL-MOBILIZATION': { on: '1939-09-01' } } });
  assert.deepEqual(validateMobilizationShape(w.mobilization), []);
  assert.equal(mob(w), w, 'idempotente');
  // gli uomini non vengono creati dalla mobilitazione
  for (const [id, d] of Object.entries(w.forces.divisions)) if (nationOf(id) === 'FRA') assert.deepEqual(d.items, s.forces.divisions[id].items, id);
});

test('la data registrata è quella del primo giorno; un quadro comparso dopo viene mobilitato senza cambiare la data', () => {
  const s = { ...start(), date: '1939-09-01' };
  const w = mob(atWarWith(s, 'DEU', 'POL'));
  const [anyId] = Object.keys(w.forces.divisions).filter((id) => nationOf(id) === 'FRA');
  const later = { ...w, date: '1939-09-10', forces: { ...w.forces, divisions: { ...w.forces.divisions, [anyId]: { ...w.forces.divisions[anyId], cadre: true } } } };
  const w2 = mob(later);
  assert.equal(w2.forces.divisions[anyId].cadre, false);
  assert.equal(w2.mobilization.started['LAW-FRA-GENERAL-MOBILIZATION'].on, '1939-09-01');
});

test('senza forze inizializzate non registra nulla (la legge scatterà quando ci saranno i quadri)', () => {
  const raw = newGame({ nation: 'FRA', political, ownersWithProvinces: nationList }).state;
  const w = atWarWith({ ...raw, date: '1939-09-01' }, 'DEU', 'POL');
  assert.equal(mob(w), w);
});

test('effetto reale: prima i quadri francesi non ricevono nulla, dopo la mobilitazione i rinforzi colmano il previsto del template 1939', () => {
  const act = createForcesActivationSystem(ctx);
  const s0 = advanceDays({ ...start(), date: '1939-08-31' }, 2, [act]);
  const [id] = cadresOf(s0, 'FRA')[0];
  const plan = (s) => planReinforcements(s.forces, { units: units.filter((u) => u.id === id), nation: 'FRA', date: s.date, poolAvailable: 99999, stocks: { 'equipment.MG-FRA-FM2429': 99999 }, transitDays: () => 2 });
  assert.equal(plan(s0).transfers.length, 0, 'quadro: nessun rinforzo');
  const w = mob(atWarWith(s0, 'DEU', 'POL'));
  const t = plan(w).transfers;
  assert.ok(t.some((x) => x.item === 'manpower.war'), 'uomini dal pool');
  const mg = t.find((x) => x.item === 'equipment.MG-FRA-FM2429');
  assert.equal(mg.qty, 336, 'dotazione 1939 per intero (da 0)');
});

test('un salvataggio con stato mobilitazione valido passa la validazione dello stato; uno con data non valida no', () => {
  const s = { ...start(), date: '1939-09-01' };
  const w = mob(atWarWith(s, 'DEU', 'POL'));
  assert.deepEqual(validateState(w).filter((e) => /mobilitazione/.test(e)), []);
  const broken = { ...w, mobilization: { ...w.mobilization, started: { X: { on: 'ieri' } } } };
  assert.match(validateState(broken).join(), /mobilitazione/);
});
