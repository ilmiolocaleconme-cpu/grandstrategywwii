// Catalogo dei carri tedeschi 1934-1945 (tabella dell'utente): validazione e disponibilità per data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateTankModels, modelsAvailableAt } from '../src/data/tankModels.js';

const doc = JSON.parse(readFileSync(new URL('../data/units/models/carri_tedeschi_1934_1945.json', import.meta.url), 'utf8'));

test('catalogo carri: 7 modelli validi, dati dell\'utente non verificati, nessuna statistica inventata', () => {
  assert.deepEqual(validateTankModels(doc), []);
  assert.equal(doc.status, 'DA_VERIFICARE');
  assert.equal(doc.models.length, 7);
  assert.deepEqual(doc.models.map((m) => m.name), ['Panzer I', 'Panzer II', 'Panzer III', 'Panzer IV', 'Panther', 'Tiger I', 'Tiger II (King Tiger)']);
  assert.ok(doc.models.every((m) => m.basis === 'utente' && !('armor' in m) && !('gun' in m)));
  assert.equal(doc.models.reduce((s, m) => s + m.producedApprox, 0), 26190);
  const p3 = doc.models.find((m) => m.name === 'Panzer III');
  assert.equal(p3.checks.length, 1, 'Panzer III: un controllo su fonte indicata dall\'utente');
  assert.match(p3.checks[0].confirmed, /agosto 1943/);
  assert.match(p3.checks[0].notDocumented, /non dà l'anno di inizio/);
  assert.equal(p3.productionStart, 1937, 'l\'anno della tabella non è stato cambiato: non confermato né smentito');
});

test('disponibilità per data (anno intero, inizio dal 1° gennaio): al 1/1/1936 Panzer I, II e IV (da decidere); nel 1943 Panther e Tiger', () => {
  const at = (d) => modelsAvailableAt(doc, d).map((m) => m.name);
  assert.deepEqual(at('1934-06-01'), ['Panzer I']);
  assert.deepEqual(at('1936-01-01'), ['Panzer I', 'Panzer II', 'Panzer IV'], 'Panzer IV con inizio 1936 nella tabella: segnalato come dubbio');
  assert.deepEqual(at('1937-01-01'), ['Panzer I', 'Panzer II', 'Panzer III', 'Panzer IV']);
  assert.ok(at('1943-07-01').includes('Panther') && at('1943-07-01').includes('Tiger I') && !at('1943-07-01').includes('Tiger II (King Tiger)'));
  assert.deepEqual(at('1945-12-31').sort(), ['Panther', 'Panzer IV', 'Tiger II (King Tiger)']);
  assert.throws(() => modelsAvailableAt(doc, '1936'), /data non valida/);
});

test('validateTankModels: rifiuti', () => {
  const bad = (mut, re) => { const d = structuredClone(doc); mut(d); assert.ok(validateTankModels(d).some((e) => re.test(e)), String(re)); };
  bad((d) => { d.models[1].id = d.models[0].id; }, /duplicato/);
  bad((d) => { d.models[0].productionStart = 1950; }, /anni di produzione/);
  bad((d) => { d.models[0].class = 'super'; }, /classe/);
  bad((d) => { d.models[0].source = ''; }, /senza fonte/);
  bad((d) => { d.models[0].nation = 'FRA'; }, /nazione/);
  bad((d) => { d.models[0].producedApprox = 0; }, /quantità/);
  bad((d) => { d.models[2].designation = d.models[0].designation; }, /designazione duplicata/);
  assert.ok(validateTankModels({ schema: 'x' })[0].includes('schema'));
});

test('carri cecoslovacchi (Panzer 35(t) e 38(t)): entrano solo con un evento, mai per data', () => {
  assert.deepEqual(validateTankModels(doc), []);
  assert.deepEqual(doc.eventModels.map((m) => m.name), ['Panzer 35(t)', 'Panzer 38(t)']);
  assert.deepEqual(doc.eventModels.map((m) => m.originalDesignation), ['LT vz. 35', 'LT vz. 38']);
  assert.ok(doc.eventModels.every((m) => m.originNation === 'CZE' && m.availability.type === 'event' && m.availability.date === null && m.availability.eventId === 'EVT-CSK-CARRI'));
  for (const d of ['1936-01-01', '1939-06-01', '1943-01-01', '1945-12-31']) {
    assert.ok(modelsAvailableAt(doc, d).every((m) => !/\(t\)/.test(m.name)), `${d}: i modelli a evento non compaiono per data`);
  }
  const bad = (mut, re) => { const d = structuredClone(doc); mut(d); assert.ok(validateTankModels(d).some((e) => re.test(e)), String(re)); };
  bad((d) => { d.eventModels[0].availability = { type: 'year', year: 1939 }; }, /non legata a un evento/);
  bad((d) => { d.eventModels[0].productionStart = 1938; }, /non ha anni di produzione/);
  bad((d) => { d.eventModels[0].originNation = ''; }, /nazione d'origine/);
  bad((d) => { d.eventModels[1].id = d.eventModels[0].id; }, /duplicato/);
  bad((d) => { d.eventModels[0].availability.date = '1939'; }, /data dell'evento/);
});
