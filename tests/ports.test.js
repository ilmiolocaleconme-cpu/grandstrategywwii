// Elenco ridotto dei porti 1936 (ipotesi): risoluzione sulle città costiere, coerenza del file derivato.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPorts, validatePorts, validatePortsList, portLevelAt } from '../src/data/ports.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const list = json('ports/ports_list.json'); const file = json('ports/ports_1936.json');
const cities = json('citta_grandi.json').features.map((f) => f.properties);

test('elenco: valido, senza doppioni, ogni porto è una città costiera del catalogo; qualità ipotesi', () => {
  assert.equal(list.quality, 'hypothesis');
  assert.deepEqual(validatePortsList(list, { cities }), []);
  assert.equal(list.ports.length, 132);
});

test('file derivato: coincide con la rigenerazione; Amburgo (2 parti) è un solo porto di livello 3', () => {
  const { file: fresh, unresolved } = buildPorts({ list, cities });
  assert.deepEqual(unresolved, []); assert.deepEqual(JSON.parse(JSON.stringify(fresh)), file);
  assert.deepEqual(validatePorts(file), []);
  assert.equal(portLevelAt(file, 'P_DEU_AMBURGO_CITTA'), 3);
  assert.equal(Object.values(file.ports).filter((p) => p.name === 'Amburgo').length, 1);
  assert.equal(portLevelAt(file, 'P_ALB_TIRANA_CITTA'), 0, 'senza porto in elenco: livello 0');
});

test('difetti segnalati: livello 1, doppione, città non costiera o inesistente', () => {
  const bad = { ...list, ports: [{ name: 'Amburgo', owner: 'DEU', level: 1 }, { name: 'Amburgo', owner: 'DEU', level: 3 }, { name: 'Tirana', owner: 'ALB', level: 2 }, { name: 'Atlantide', owner: 'DEU', level: 2 }] };
  const errors = validatePortsList(bad, { cities });
  assert.ok(errors.some((e) => /livello non valido/.test(e)) && errors.some((e) => /doppione/.test(e)));
  assert.equal(errors.filter((e) => /non è una città costiera/.test(e)).length, 2);
  assert.ok(validatePorts({ schema: 'ports-v1', ports: { X: { level: 4 } } }).length > 0);
});

test('distribuzione: pochi grandi porti, più regionali; nessuna nazione senza costa nell\'elenco', () => {
  const lv = (n) => Object.values(file.ports).filter((p) => p.level === n).length;
  assert.ok(lv(3) > 20 && lv(3) < lv(2));
  // regola minima: ogni entità con una città costiera ha almeno un porto, quelli della regola sono livello 1 e in basis 'minimum'
  const owners = new Set(cities.filter((c) => c.costiera && c.kind === 'citta').map((c) => c.owner));
  const withPort = new Set(Object.values(file.ports).map((p) => p.owner));
  assert.deepEqual([...owners].filter((o) => !withPort.has(o)), []);
  const mins = Object.values(file.ports).filter((p) => p.basis === 'minimum');
  assert.ok(mins.length > 50 && mins.every((p) => p.level === 1));
  assert.equal(Object.values(file.ports).filter((p) => p.owner === 'PRT').length, 1, 'una sola città per entità, la più grande');
  const coastalOwners = new Set(cities.filter((c) => c.costiera).map((c) => c.owner));
  for (const p of Object.values(file.ports)) assert.ok(coastalOwners.has(p.owner));
});
