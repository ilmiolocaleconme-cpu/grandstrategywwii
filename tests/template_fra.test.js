// Template fanteria francese 1936. Dal 25/11/2026 (schema unico, Francia passo 2) è la somma dei battaglioni di data/units/modules/modules_fra.json
// (3 reggimenti su 3 battaglioni, 16.610 uomini; prima: voci generiche senza quantità, 17.500 uomini ipotesi 1939-40). Resta il quadro al 30%.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateTemplate } from '../src/data/templates.js';
import { initForces, createForcesState } from '../src/rules/forces.js';
import { MANPOWER_ITEM } from '../src/rules/reinforcements.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const t = json('units/templates/divisione_fanteria_francia_1936.json');
const units = json('units/units.json').units;

test('template FRA 1936: valido, dai battaglioni (9 di fanteria), stime segnalate, quadro al 30%; nessun dato copiato da altre nazioni', () => {
  assert.deepEqual(validateTemplate(t), []);
  assert.equal(t.modules.find((m) => m.id === 'MOD-FRA-INF-1936').count, 9);
  assert.equal(t.manpower.war.value, 16610);
  assert.equal(t.manpower.war.reliability, 'ESTIMATED');
  assert.equal(t.equipment['ART-FRA-ART75M1897'].value, 36);
  assert.equal(t.equipment['MG-FRA-FM2429'].value, 336);
  assert.ok(Object.keys(t.equipment).every((k) => k.includes('-FRA-')), 'solo armi francesi');
  assert.equal(t.initialFillRatio.value, 0.3); assert.equal(t.initialFillRatio.basis, 'USER_EXAMPLE'); assert.equal(t.startsAsCadre, true);
  assert.equal(t.manpower.peace.value, null);
});

test('al 1/1/1936: le 16 divisioni di fanteria francesi ricevono la dotazione (quadro al 30%, come il template britannico)', () => {
  const r = initForces(createForcesState(), { units, templates: [t], ratio: 0.915, date: '1936-01-01' });
  const ids = Object.keys(r.state.divisions);
  assert.ok(ids.length >= 16, `trovate ${ids.length}`);
  for (const id of ids) {
    assert.equal(units.find((x) => x.id === id).nation, 'FRA');
    assert.deepEqual(r.state.divisions[id].items[MANPOWER_ITEM], { planned: 16610, effective: Math.round(16610 * 0.3), source: 'ratio' });
  }
});

test('App.jsx carica il template francese (dal 20/11/2026 tutti i template divisione_* e brigata_* per glob: nessun elenco a mano)', () => {
  const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /import\.meta\.glob\('\.\.\/data\/units\/templates\/divisione_\*\.json'/);
  assert.match(app, /import\.meta\.glob\('\.\.\/data\/units\/templates\/brigata_\*\.json'/);
  assert.match(app, /templates: completeTemplates\(ALL_TEMPLATES\)/);
});
