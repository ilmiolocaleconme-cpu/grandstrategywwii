// Scheda unità, fase 3: equipaggiamento per categoria, differenze, template incompleti. Nessuna voce scartata, nessuna categoria inventata.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { equipmentGroups, EQUIPMENT_GROUP, EQUIPMENT_GROUP_LABEL } from '../src/rules/unitSheet.js';
import { countUndefined } from '../src/rules/unitInfo.js';

const dir = new URL('../data/units/templates/', import.meta.url);
const templates = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')));
const realKeys = [...new Set(templates.flatMap((t) => Object.keys(t.equipment ?? {})))].sort();

test('ogni chiave di template reale è classificata oppure dichiarata non classificata (nessuna sparisce)', () => {
  const unclassified = realKeys.filter((k) => !EQUIPMENT_GROUP[k]);
  assert.deepEqual(unclassified, ['GL-FRA-VB1916', 'armiLeggere'], 'solo le due voci ambigue restano fuori dalla tabella');
  const rows = realKeys.map((item) => ({ item, planned: 1, effective: 1, ratio: 1 }));
  const grouped = equipmentGroups(rows);
  assert.equal(grouped.reduce((s, g) => s + g.rows.length, 0), realKeys.length, 'nessuna voce scartata');
});

test('voce sconosciuta: resta in «non classificati» con il codice originale, mai attribuita a una categoria', () => {
  const g = equipmentGroups([{ item: 'ART-XYZ-999', planned: 4, effective: 2 }]);
  assert.equal(g.length, 1);
  assert.equal(g[0].id, 'non_classificati');
  assert.equal(g[0].rows[0].item, 'ART-XYZ-999');
  assert.equal(EQUIPMENT_GROUP_LABEL.non_classificati, 'Non classificati');
});

test('differenza = effettivi − previsti; gruppi vuoti non compaiono; l\'ordine dei gruppi è fisso', () => {
  const g = equipmentGroups([
    { item: 'mortai', planned: 12, effective: 9 },
    { item: 'fucili', planned: 100, effective: 120 },
  ]);
  assert.deepEqual(g.map((x) => x.id), ['individuali', 'mortai']);
  assert.equal(g[0].rows[0].difference, 20);
  assert.equal(g[1].rows[0].difference, -3);
});

test('template incompleto: le voci con value null si contano, non si riempiono', () => {
  const tpl = templates.find((t) => t.id === 'TPL-DEU-INF-1936');
  assert.ok(tpl, 'template tedesco di fanteria 1936');
  const n = countUndefined(tpl);
  assert.ok(n > 0, 'il template ha voci da definire');
  assert.equal(countUndefined({ a: { value: 5, basis: 'utente' }, b: { value: null, basis: 'da_definire' } }), 1);
  assert.equal(countUndefined({ value: 3, basis: 'utente', effective: { value: null } }), 0, 'gli effettivi non contano come previsti');
});

test('provenienza: la voce conserva source (template o stima); la UI segnala le stime', () => {
  const g = equipmentGroups([{ item: 'mortai', planned: 10, effective: 9, source: 'ratio' }]);
  assert.equal(g[0].rows[0].source, 'ratio');
});
