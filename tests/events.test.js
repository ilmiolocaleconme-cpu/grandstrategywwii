// Sistema degli eventi e riorganizzazioni (18/11/2026): motorizzazione di 2., 13., 20., 29. Infanterie-Division nel 1937 (decisione dell'utente).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateEvents, createEventsSystem, applyEvent, validateEventsState } from '../src/game/eventsState.js';
import { unitOf, unitsView, unitsList, validateUnitChanges, applyUnitChange } from '../src/rules/unitRegistry.js';
import { createForcesActivationSystem } from '../src/game/forcesState.js';
import { initForces, templateFor } from '../src/rules/forces.js';
import { vehicleMarchSpeed } from '../src/data/modules.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const events = json('events/events.json');
const units = json('units/units.json').units;
const byId = new Map(units.map((u) => [u.id, u]));
const FOUR = ['U00073', 'U00066', 'U00075', 'U00084'];
const tpl = (f) => json(`units/templates/${f}.json`);
const templates = [tpl('divisione_fanteria_germania_1936'), tpl('divisione_fanteria_germania_1939'), tpl('divisione_motorizzata_germania_1937')];

test('file degli eventi valido; errori riconosciuti', () => {
  assert.deepEqual(validateEvents(events, { unitIds: new Set(byId.keys()), nationIds: new Set(['DEU']), itemIds: new Set(['equipment.VEH-DEU-TRUCK']) }), []);
  const ev = events.events[0];
  const bad = (patch) => validateEvents({ ...events, events: [{ ...ev, ...patch }] }, { unitIds: new Set(byId.keys()) });
  assert.ok(bad({ date: '1937' }).length);
  assert.ok(bad({ effects: [{ kind: 'reorganize', unit: 'U99999', category: 'motorized' }] }).some((e) => /U99999/.test(e)));
  assert.ok(bad({ effects: [{ kind: 'boom' }] }).length);
  assert.ok(validateEvents({ ...events, events: [ev, ev] }).some((e) => /duplicato/.test(e)));
});

test('evento del 1/10/1937: le quattro divisioni diventano motorizzate, 3.800 autocarri alla scorta; una sola volta', () => {
  const sys = createEventsSystem({ events });
  const s0 = { date: '1937-09-30', nations: { DEU: { stocks: { steel: 1 } } } };
  assert.equal(sys(s0), s0, 'prima della data nulla cambia');
  const s1 = sys({ ...s0, date: '1937-10-01' });
  for (const id of FOUR) { assert.equal(byId.get(id).category, 'infantry'); assert.equal(unitOf(s1, id, byId).category, 'motorized'); }
  assert.equal(unitOf(s1, 'U00001', byId), byId.get('U00001'), 'le altre unità restano quelle del catalogo');
  assert.equal(s1.nations.DEU.stocks['equipment.VEH-DEU-TRUCK'], 3800);
  assert.deepEqual(s1.events.done, ['EV-DEU-MOT-1937']);
  const s2 = sys({ ...s1, date: '1937-10-02' });
  assert.equal(s2.events, s1.events, 'non si ripete');
  assert.equal(s2.nations.DEU.stocks['equipment.VEH-DEU-TRUCK'], 3800, 'gli autocarri non si consegnano due volte');
  assert.deepEqual(validateEventsState(s2.events), []);
  assert.deepEqual(validateUnitChanges(s2.unitChanges), []);
  assert.ok(validateEventsState({ ...s2.events, done: ['A', 'A'] }).length);
  assert.ok(validateUnitChanges({ schema: 'unit-changes-v1', byUnit: { U1: { patch: { nation: 'FRA' }, since: '1937-01-01' } } }).length, 'solo la categoria si può cambiare');
  assert.equal(unitsView(s2, byId).get('U00073').category, 'motorized');
  assert.equal(unitsList(s2, units).find((u) => u.id === 'U00073').category, 'motorized');
  // una partita iniziata dopo la data esegue l'evento al primo giorno
  assert.equal(unitOf(sys({ ...s0, date: '1938-01-01' }), 'U00066', byId).category, 'motorized');
});

test('dopo l’evento il gioco porta le divisioni al template motorizzato: niente cavalli, autocarri previsti da consegnare, marcia a piedi finché mancano', () => {
  const de = units.filter((u) => FOUR.includes(u.id));
  const forces = initForces({ schema: 'forces-v1', divisions: {} }, { units: de, templates, ratio: 0.6, date: '1936-01-01' }).state;
  assert.ok(FOUR.every((id) => forces.divisions[id].templateId === 'TPL-DEU-INF-1936'));
  let s = { date: '1937-10-01', forces: { ...forces, initialized: true }, nations: { DEU: { stocks: {} } } };
  s = createEventsSystem({ events })(s);
  s = createForcesActivationSystem({ units: de, templates, ratio: 0.6 })(s);
  for (const id of FOUR) {
    const d = s.forces.divisions[id];
    assert.equal(d.templateId, 'TPL-DEU-MOT-1937', id);
    assert.equal(d.items['equipment.VEH-DEU-TRUCK'].planned, 1595);
    // 20/11/2026: la fanteria 1936 (dai battaglioni) ha già 195 autocarri nei servizi: passano alla motorizzata, che marcia un po' più veloce dei 20 km a piedi
    const tr = d.items['equipment.VEH-DEU-TRUCK'];
    assert.equal(vehicleMarchSpeed(d.items, 20, 50), Math.round(20 + 30 * (tr.effective / tr.planned)), 'velocità in proporzione agli autocarri consegnati');
    assert.ok(vehicleMarchSpeed(d.items, 20, 50) < 30, 'finché mancano quasi tutti gli autocarri resta lenta');
  }
  assert.equal(s.forces.divisions.U00073.items.horses?.planned ?? 0, 0, 'la divisione motorizzata non ha più cavalli previsti');
  assert.equal(templateFor(unitOf(s, 'U00073', new Map(de.map((u) => [u.id, u]))), templates, '1940-01-01').id, 'TPL-DEU-MOT-1937', 'non torna fanteria nel 1939');
});

test('cambio di categoria: applyUnitChange non modifica il catalogo', () => {
  const s = applyUnitChange({}, 'U00073', { category: 'motorized' }, { date: '1937-10-01', event: 'X' });
  assert.equal(byId.get('U00073').category, 'infantry');
  assert.equal(unitOf(s, 'U00073', byId).category, 'motorized');
  assert.equal(applyEvent({ date: '1937-10-01', nations: {} }, { id: 'EV-X', effects: [{ kind: 'grant_stock', nation: 'ITA', item: 'x', qty: 5 }] }).nations.ITA, undefined, 'nazione assente: nessun effetto');
});
