// Schema unit-template-v2 (Fase 2, 03/11/2026): provenienza facoltativa, attendibilità facoltativa, finestre di validità e scelta del template per data.
// Esempi SINTETICI: non sono dati storici.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateTemplate, templateWindow, isTemplateValidAt, RELIABILITY } from '../src/data/templates.js';
import { templateFor } from '../src/rules/forces.js';

const base = (over = {}) => ({
  schema: 'unit-template-v2',
  id: 'TPL-XXX-INF-1939',
  appliesTo: { nation: 'XXX', category: 'infantry', echelon: 'division', validFrom: '1939-09-01', validTo: '1940-05-09' },
  manpower: { war: { value: 16400 } },
  equipment: { mortai81: { value: 24, reliability: 'STANDARD_TOE' }, anticarro25: { value: 15, reliability: 'PROVISIONAL' } },
  ...over,
});

test('v2: una voce senza basis, source e anno di riferimento è valida', () => {
  assert.deepEqual(validateTemplate(base()), []);
});

test('v2: reliability fuori dall\'enum è rifiutata; i valori dell\'enum sono accettati', () => {
  for (const r of RELIABILITY) assert.deepEqual(validateTemplate(base({ equipment: { a: { value: 1, reliability: r } } })), [], r);
  assert.ok(validateTemplate(base({ equipment: { a: { value: 1, reliability: 'CERTO' } } })).some((e) => /reliability/.test(e)));
});

test('v2: basis, se presente, resta nell\'enum; l\'effettivo non supera il previsto ma non richiede data né fonte', () => {
  assert.ok(validateTemplate(base({ manpower: { war: { value: 10, basis: 'boh' } } })).some((e) => /basis/.test(e)));
  assert.deepEqual(validateTemplate(base({ manpower: { war: { value: 10, effective: { value: 8 } } } })), []);
  assert.ok(validateTemplate(base({ manpower: { war: { value: 10, effective: { value: 11 } } } })).some((e) => /supera il previsto/.test(e)));
  assert.ok(validateTemplate(base({ manpower: { war: { value: 10, effective: { value: 8, asOf: '1939' } } } })).some((e) => /senza data/.test(e)));
});

test('v1 invariato: provenienza, fonte e anno di riferimento restano obbligatori', () => {
  const v1 = base({ schema: 'unit-template-v1' });
  const errs = validateTemplate(v1);
  assert.ok(errs.some((e) => /basis/.test(e)) && errs.some((e) => /senza fonte/.test(e)));
});

test('finestra di validità: validFrom/validTo, activeFrom come sinonimo, date e ordine controllati', () => {
  assert.deepEqual(templateWindow({ appliesTo: { activeFrom: '1936-01-01' } }), { from: '1936-01-01', to: null });
  assert.deepEqual(templateWindow({ appliesTo: { activeFrom: '1936-01-01', validFrom: '1937-01-01' } }), { from: '1937-01-01', to: null });
  assert.ok(validateTemplate(base({ appliesTo: { nation: 'XXX', category: 'infantry', echelon: 'division', validFrom: '1940-01-01', validTo: '1939-01-01' } })).some((e) => /incoerente/.test(e)));
  assert.ok(validateTemplate(base({ appliesTo: { nation: 'XXX', category: 'infantry', echelon: 'division', validFrom: '1939' } })).some((e) => /validFrom/.test(e)));
  const t = base();
  assert.ok(isTemplateValidAt(t, '1939-09-01') && isTemplateValidAt(t, '1940-05-09'));
  assert.ok(!isTemplateValidAt(t, '1939-08-31') && !isTemplateValidAt(t, '1940-05-10'));
  assert.ok(isTemplateValidAt(t, null));
});

test('templateFor con data: sceglie la versione valida più recente; senza data resta il primo; fuori finestra = null', () => {
  const t36 = base({ id: 'TPL-XXX-INF-1936', appliesTo: { nation: 'XXX', category: 'infantry', echelon: 'division', validFrom: '1936-01-01', validTo: '1939-08-31' } });
  const t39 = base();
  const unit = { id: 'U1', nation: 'XXX', category: 'infantry', echelon: 'division' };
  assert.equal(templateFor(unit, [t36, t39], '1937-06-01').id, 'TPL-XXX-INF-1936');
  assert.equal(templateFor(unit, [t36, t39], '1939-10-01').id, 'TPL-XXX-INF-1939');
  assert.equal(templateFor(unit, [t39, t36], '1939-10-01').id, 'TPL-XXX-INF-1939', 'indipendente dall\'ordine dell\'elenco');
  assert.equal(templateFor(unit, [t36, t39]).id, 'TPL-XXX-INF-1936', 'senza data: primo template, come prima');
  assert.equal(templateFor(unit, [t36, t39], '1941-01-01'), null);
  assert.equal(templateFor({ ...unit, echelon: 'corps' }, [t36, t39], '1937-06-01'), null);
});

test('i template reali (v1) restano validi con il validatore esteso', () => {
  const dir = new URL('../data/units/templates/', import.meta.url);
  for (const f of readdirSync(dir).filter((n) => /^divisione_.*\.json$/.test(n))) { // stesso filtro di scripts/validate-data.js
    const d = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    if (d.schema === 'unit-template-v1') assert.deepEqual(validateTemplate(d), [], f);
  }
});
