// Istanze di divisione nello stato (schema 6): dotazione previsto/effettivo dai template, pool di uomini dalla popolazione.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newGame, validateState } from '../src/game/state.js';
import { parseSave, serializeSave, SAVE_FORMAT, MIGRATIONS } from '../src/game/save.js';
import { migrateV5toV6, validateForcesShape, initForcesState, nationManpowerPool } from '../src/game/forcesState.js';
import { createForcesState, templateFor, initForces, enlistedManpower, validateForcesState } from '../src/rules/forces.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const units = json('units/units.json').units;
const templates = ['divisione_fanteria_germania_1936', 'divisione_corazzata_germania_1936'].map((f) => json(`units/templates/${f}.json`));
const ratio = json('units/readiness.json').initialFillRatio.value;
const pop = json('population/population.json');
const political = json('political_1936.json');
const nationList = json('nations.json').map((n) => n.id);
const newState = (nation = 'DEU') => newGame({ nation, political, ownersWithProvinces: nationList }).state;
const ctx = { units, templates, ratio };
const deu = (s) => Object.entries(s.forces.divisions).map(([id, d]) => [units.find((u) => u.id === id), d]);

test('schema 6: nuova partita con forze vuote e non inizializzate, migrazione 5→6, validazione di forma', () => {
  const s = newState();
  assert.deepEqual(s.forces, { schema: 'forces-v1', initialized: false, divisions: {} });
  assert.deepEqual(validateState(s), []);
  const { forces: _f, ...rest } = s;
  const v5 = { ...rest, schema: 5 };
  const r = parseSave(JSON.stringify({ format: SAVE_FORMAT, schema: 5, savedAt: null, label: 'v5', state: v5 }));
  assert.equal(r.ok, true); assert.equal(r.migratedFrom, 5); assert.deepEqual(r.state, s);
  assert.deepEqual(migrateV5toV6(v5), s);
  assert.equal(typeof MIGRATIONS[5], 'function');
  const item = (over) => ({ templateId: 'T', since: '1936-01-01', items: { 'horses': { planned: 10, effective: 5, source: 'ratio', ...over } } });
  for (const [bad, re] of [[null, /oggetto/], [{ schema: 'x', initialized: false, divisions: {} }, /schema/], [{ schema: 'forces-v1', initialized: 'si', divisions: {} }, /booleano/],
    [{ schema: 'forces-v1', initialized: false, divisions: [] }, /divisions/],
    [{ schema: 'forces-v1', initialized: true, divisions: { A: item({ effective: 11 }) } }, /supera il previsto/],
    [{ schema: 'forces-v1', initialized: true, divisions: { A: item({ effective: -1 }) } }, /effettivo non valido/],
    [{ schema: 'forces-v1', initialized: true, divisions: { A: item({ planned: 1.5 }) } }, /previsto non valido/],
    [{ schema: 'forces-v1', initialized: true, divisions: { A: item({ source: 'boh' }) } }, /origine/],
    [{ schema: 'forces-v1', initialized: true, divisions: { A: { templateId: '', since: 1, items: [] } } }, /templateId|senza data|senza items/]]) {
    assert.ok(validateForcesShape(bad).some((e) => re.test(e)), String(re));
  }
  assert.ok(validateState({ ...s, forces: undefined }).some((e) => /forze/.test(e)));
});

test('istanze al 1/1/1936: Germania 30 fanterie + 3 Panzer con dotazione 0,915; le divisioni senza template restano senza istanza', () => {
  const s0 = newState('DEU');
  const r = initForcesState(s0, ctx);
  const inf = deu(r.state).filter(([u]) => u.category === 'infantry');
  const pz = deu(r.state).filter(([u]) => u.category === 'armored');
  assert.equal(inf.length, 30); assert.equal(pz.length, 3);
  assert.equal(r.created, 33);
  assert.ok(deu(r.state).every(([u]) => u.nation === 'DEU'), 'solo la Germania ha template');
  assert.deepEqual(inf[0][1].items['manpower.war'], { planned: 17263, effective: Math.round(17263 * ratio), source: 'ratio' });
  assert.equal(inf[0][1].items['manpower.war'].effective, 15796);
  assert.equal(pz[0][1].items['manpower.war'], undefined, 'organico della corazzata non noto: nessun valore inventato');
  assert.deepEqual(pz[0][1].items['equipment.carri'], { planned: 416, effective: 381, source: 'ratio' });
  assert.equal(r.withoutTemplate.length, 67, 'altre nazioni e tipi senza template non hanno istanza');
  assert.ok(r.withoutTemplate.every((id) => !r.state.forces.divisions[id]));
  assert.equal(r.state.forces.initialized, true);
  assert.deepEqual(validateState(r.state), []);
  assert.deepEqual(validateForcesState(r.state.forces, units), []);
  assert.deepEqual(parseSave(serializeSave(r.state)).state, r.state, 'andata e ritorno del salvataggio');
});

test('inizializzazione idempotente e deterministica; il dato reale del template batte la frazione', () => {
  const s0 = newState('DEU');
  const a = initForcesState(s0, ctx); const b = initForcesState(s0, ctx);
  assert.deepEqual(a.state, b.state);
  const again = initForcesState(a.state, ctx);
  assert.equal(again.state, a.state); assert.equal(again.created, 0);
  const real = structuredClone(templates[0]); real.horses.effective = { value: 4000, asOf: '1936-01-01', basis: 'utente', source: 'prova' };
  const r = initForces(createForcesState(), { units, templates: [real, templates[1]], ratio, date: '1936-01-01' });
  const first = Object.values(r.state.divisions).find((d) => d.templateId === real.id);
  assert.deepEqual(first.items.horses, { planned: 4465, effective: 4000, source: 'template' });
  assert.equal(templateFor(units.find((u) => u.nation === 'FRA' && u.echelon === 'division'), templates), null);
  assert.equal(templateFor(units.find((u) => u.category === 'command'), templates), null);
});

test('pool di uomini della Germania dallo stato: 5% della popolazione meno gli uomini arruolati nelle divisioni', () => {
  const s = initForcesState(newState('DEU'), ctx).state;
  assert.equal(enlistedManpower(s.forces, units, 'DEU'), 30 * 15796);
  const pool = nationManpowerPool(s, 'DEU', { units, population: pop.nations.DEU.population, baseShare: pop.recruitment.baseShare });
  assert.deepEqual([pool.capacity, pool.enlisted, pool.available, pool.overdrawn], [3425000, 473880, 2951120, false]);
  assert.equal(enlistedManpower(s.forces, units, 'FRA'), 0, 'nessun dato per la Francia: non inventato');
  const mods = [{ id: 'SYN-MOB', kind: 'add', value: 0.04, source: 'esempio di prova' }];
  assert.equal(nationManpowerPool(s, 'DEU', { units, population: pop.nations.DEU.population, baseShare: 0.05, modifiers: mods }).capacity, 6165000);
});

test('validateForcesState: unità inesistente, non divisione, effettivo oltre il previsto', () => {
  const f = { schema: 'forces-v1', initialized: true, divisions: { ZZZ: { templateId: 'T', since: 'x', items: {} } } };
  assert.ok(validateForcesState(f, units).some((e) => /inesistente/.test(e)));
  const cmd = units.find((u) => u.category === 'command');
  assert.ok(validateForcesState({ ...f, divisions: { [cmd.id]: { templateId: 'T', since: 'x', items: {} } } }, units).some((e) => /non è una divisione/.test(e)));
  const d = units.find((u) => u.echelon === 'division');
  assert.ok(validateForcesState({ ...f, divisions: { [d.id]: { templateId: 'T', since: 'x', items: { k: { planned: 1, effective: 2, source: 'ratio' } } } } }, units).some((e) => /supera/.test(e)));
});
