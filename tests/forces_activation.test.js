// Attivazione delle forze nel tempo (03/11/2026): Francia dal 1/9/1939 e Italia dal 1/6/1940, con i template da CSV; le istanze esistenti non cambiano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { newGame } from '../src/game/state.js';
import { initForcesState, createForcesActivationSystem } from '../src/game/forcesState.js';
import { advanceDays } from '../src/game/engine.js';
import { validateForcesState } from '../src/rules/forces.js';
import { isActiveAt } from '../src/data/units.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const units = json('units/units.json').units;
const names = ['divisione_fanteria_germania_1936', 'divisione_corazzata_germania_1936', 'divisione_fanteria_gran_bretagna_1936', 'divisione_fanteria_germania_1939', 'divisione_fanteria_francia_1939', 'divisione_fanteria_italia_1940'];
const templates = names.map((f) => json(`units/templates/${f}.json`));
const ratio = json('units/readiness.json').initialFillRatio.value;
const ctx = { units, templates, ratio };
const political = json('political_1936.json');
const nationList = json('nations.json').map((n) => n.id);
const start = () => initForcesState(newGame({ nation: 'FRA', political, ownersWithProvinces: nationList }).state, ctx).state;
const of = (s, nation) => Object.entries(s.forces.divisions).filter(([id]) => units.find((u) => u.id === id).nation === nation);

test('al 1936 solo i template del 1936 creano istanze; Francia e Italia restano senza dotazione', () => {
  const s = start();
  assert.equal(of(s, 'FRA').length, 0);
  assert.equal(of(s, 'ITA').length, 0);
  assert.ok(of(s, 'DEU').length > 0 && of(s, 'GBR').length > 0);
});

test('1/9/1939: la fanteria francese riceve il template FRA 1939 (15.500 uomini effettivi); l\'Italia ancora no; le istanze tedesche del 1936 non cambiano', () => {
  const s0 = { ...start(), date: '1939-08-30' };
  const sys = createForcesActivationSystem(ctx);
  const before = of(s0, 'DEU');
  const a = advanceDays(s0, 1, [sys]);
  assert.equal(of(a, 'FRA').length, 0, '31 agosto: ancora nulla');
  const b = advanceDays(a, 1, [sys]);
  const fra = of(b, 'FRA');
  const franceInf = units.filter((u) => u.nation === 'FRA' && u.echelon === 'division' && u.category === 'infantry' && isActiveAt(u, '1939-09-01'));
  assert.ok(franceInf.length > 0 && fra.length === franceInf.length, `${fra.length}/${franceInf.length}`);
  for (const [, d] of fra) { assert.equal(d.templateId, 'TPL-FRA-INF-1939'); assert.deepEqual(d.items['manpower.war'], { planned: 16400, effective: 15500, source: 'template' }); }
  assert.equal(of(b, 'ITA').length, 0);
  const after = Object.fromEntries(of(b, 'DEU'));
  for (const [id, d] of before) assert.deepEqual(after[id], d, 'nessuna istanza esistente cambia versione di template');
  const nuove = Object.entries(after).filter(([id]) => !before.some(([i]) => i === id));
  for (const [id, d] of nuove) if (units.find((u) => u.id === id).category === 'infantry') assert.ok(['TPL-DEU-INF-1936', 'TPL-DEU-INF-1939'].includes(d.templateId), 'riceve il template valido nel giorno di entrata in servizio');
  assert.deepEqual(validateForcesState(b.forces, units), []);
  const c = advanceDays(b, 1, [sys]);
  assert.deepEqual(c.forces, b.forces, 'idempotente');
});

test('1/6/1940: fanteria italiana con il template ITA 1940 (organico iniziale ignoto → rapporto); cavalli assenti senza inventarli', () => {
  const sys = createForcesActivationSystem(ctx);
  const s = advanceDays({ ...start(), date: '1940-05-30' }, 3, [sys]);
  const ita = of(s, 'ITA');
  assert.ok(ita.length > 0);
  for (const [, d] of ita) {
    assert.equal(d.templateId, 'TPL-ITA-INF-1940');
    assert.deepEqual(d.items['manpower.war'], { planned: 12979, effective: Math.round(12979 * ratio), source: 'ratio' });
    assert.equal(d.items.horses, undefined);
  }
});

test('senza forze inizializzate o prima del primo template non fa nulla', () => {
  const sys = createForcesActivationSystem(ctx);
  const raw = newGame({ nation: 'FRA', political, ownersWithProvinces: nationList }).state;
  const late = { ...raw, date: '1940-01-01' };
  assert.equal(sys(late), late, 'forze non inizializzate: stesso oggetto');
  const s = start();
  assert.equal(sys(s), s, 'stesso oggetto: nessuna copia');
});
