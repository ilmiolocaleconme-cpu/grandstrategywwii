// Template provvisorio fanteria francese: valido, dichiarato ipotesi, nessun dato copiato da altre nazioni, collegato in App.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateTemplate, leaves } from '../src/data/templates.js';
import { initForces, createForcesState } from '../src/rules/forces.js';
import { MANPOWER_ITEM } from '../src/rules/reinforcements.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const t = json('units/templates/divisione_fanteria_francia_1936.json');
const units = json('units/units.json').units;

test('template FRA: valido, previsto 17.500 marcato ipotesi 1939-40 con fonte; nessun valore non sostenuto da fonte', () => {
  assert.deepEqual(validateTemplate(t), []);
  assert.equal(t.status, 'BOZZA_DA_CONFERMARE');
  assert.equal(t.manpower.war.value, 17500);
  assert.equal(t.structure.reggimentiFanteria.value * t.structure.battaglioniPerReggimento.value, 9);
  for (const [, l] of leaves(t).filter(([, x]) => typeof x.value === 'number' && x.basis !== 'USER_EXAMPLE')) { assert.equal(l.basis, 'ipotesi'); assert.match(String(l.referenceYear), /^1939/); assert.ok(l.source.length > 20); }
  assert.ok(!/13863|libbre|britann/i.test(JSON.stringify(t)), 'nessun dato britannico rimasto nel clone');
  assert.equal(t.manpower.peace.value, null);
});

test('al 1/1/1936: le 16 divisioni di fanteria francesi ricevono la dotazione (quadro al 30%, come il template britannico)', () => {
  const r = initForces(createForcesState(), { units, templates: [t], ratio: 0.915, date: '1936-01-01' });
  const ids = Object.keys(r.state.divisions);
  assert.ok(ids.length >= 16, `trovate ${ids.length}`);
  for (const id of ids) {
    assert.equal(units.find((x) => x.id === id).nation, 'FRA');
    assert.deepEqual(r.state.divisions[id].items[MANPOWER_ITEM], { planned: 17500, effective: Math.round(17500 * 0.3), source: 'ratio' });
  }
});

test('App.jsx carica il template francese', () => {
  assert.match(readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8'), /tplFraInfantry\]/);
});
