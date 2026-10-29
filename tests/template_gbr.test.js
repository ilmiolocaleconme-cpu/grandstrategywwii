// Template fanteria britannica 1936: struttura + cifre 1939-40 come riferimento; nessun previsto inventato.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateTemplate, leaves } from '../src/data/templates.js';
import { initialEffective } from '../src/rules/readiness.js';
import { initForces, createForcesState } from '../src/rules/forces.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const t = json('units/templates/divisione_fanteria_gran_bretagna_1936.json');
const units = json('units/units.json').units;
const ratio = json('units/readiness.json').initialFillRatio.value;

test('template GBR: valido, struttura 3×3, cifre 1939-40 solo come riferimento con fonte e anno', () => {
  assert.deepEqual(validateTemplate(t), []);
  assert.equal(t.id, 'TPL-GBR-INF-1936');
  assert.equal(t.structure.brigateFanteria.value * t.structure.battaglioniPerBrigata.value, 9);
  const refs = leaves({ referenceFigures: t.referenceFigures });
  assert.equal(refs.length, 6);
  for (const [, l] of refs) { assert.equal(l.basis, 'ipotesi'); assert.match(String(l.referenceYear), /^1939/); assert.ok(l.source.length > 20); }
  assert.equal(t.referenceFigures.uominiTotali1939_40.value, 13863);
});

test('template GBR: il previsto di pace resta da definire, quindi il gioco non crea istanze né inventa numeri', () => {
  assert.equal(t.manpower.war.value, null); assert.equal(t.manpower.peace.value, null);
  assert.deepEqual(initialEffective(t, ratio), {});
  const r = initForces(createForcesState(), { units, templates: [t], ratio, date: '1936-01-01' });
  assert.equal(Object.keys(r.state.divisions).length, Object.keys(r.state.divisions).filter((id) => units.find((u) => u.id === id).nation === 'GBR').length);
  for (const d of Object.values(r.state.divisions)) assert.deepEqual(d.items, {}, 'nessuna voce numerica: nessuna dotazione inventata');
});
