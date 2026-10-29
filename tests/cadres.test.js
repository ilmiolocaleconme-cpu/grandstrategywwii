// Quadri di divisione: template per nazione, nessun numero inventato, espansione solo tramite mobilitazione.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateCadreTemplates } from '../src/data/cadres.js';
import { NATION_IDS } from '../src/data/units.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const doc = json('units/templates/quadri_1936.json');
const nationIds = new Set(json('political_1936.json').map((e) => e.id));
const divisionIds = new Set(readdirSync(new URL('../data/units/templates/', import.meta.url)).filter((n) => /^divisione_.*\.json$/.test(n)).map((n) => json(`units/templates/${n}`).id));
const opts = { nationIds, templateIds: divisionIds };

test('quadri 1936: un template per ciascuna delle 8 nazioni del catalogo unità, tutto valido', () => {
  assert.deepEqual(validateCadreTemplates(doc, opts), []);
  assert.deepEqual(doc.templates.map((t) => t.nation).sort(), Object.values(NATION_IDS).sort());
});

test('quadri 1936: nessun valore numerico inventato, nessuna legge di mobilitazione modellata, mai pronti al combattimento', () => {
  for (const t of doc.templates) {
    assert.equal(t.manpower.cadre.value, null);
    assert.equal(t.equipment.cadre.value, null);
    assert.equal(t.mobilization.law, null);
    assert.equal(t.mobilization.combatReady, false);
  }
});

test('quadri 1936: expandsTo punta solo a template di divisione esistenti (DEU fanteria, URSS fucilieri); gli altri sono null', () => {
  const exp = Object.fromEntries(doc.templates.map((t) => [t.nation, t.mobilization.expandsTo]));
  assert.equal(exp.DEU, 'TPL-DEU-INF-1936');
  assert.equal(exp.USSR, 'TPL-USSR-RIFLE-1936');
  for (const n of ['CHN', 'FRA', 'GBR', 'ITA', 'JPN', 'USA']) assert.equal(exp[n], null);
});

test('validateCadreTemplates: rifiuta quadro pronto al combattimento, expandsTo inesistente, id incoerente, valore su voce da_definire, duplicati', () => {
  const clone = () => JSON.parse(JSON.stringify(doc));
  const bad = (mut, re) => { const d = clone(); mut(d.templates[0]); assert.ok(validateCadreTemplates(d, opts).some((e) => re.test(e)), String(re)); };
  bad((t) => { t.mobilization.combatReady = true; }, /pronto al combattimento/);
  bad((t) => { t.mobilization.expandsTo = 'TPL-XXX-INF-1936'; }, /expandsTo/);
  bad((t) => { t.id = 'TPL-DEU-CADRE-1936'; }, /incoerente|duplicato/);
  bad((t) => { t.manpower.cadre.value = 500; }, /da_definire ma con un valore|senza fonte/);
  bad((t) => { t.kind = 'division'; }, /kind/);
  const dup = clone(); dup.templates.push(dup.templates[0]);
  assert.ok(validateCadreTemplates(dup, opts).some((e) => /duplicato/.test(e)));
});
