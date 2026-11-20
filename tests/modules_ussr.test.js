// Battaglioni sovietici (19/11/2026, decisione dell'utente «Tutto dai battaglioni»): validità, taratura sul 1939, istanze per fucilieri e aviotrasportati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateModules, templateFromComposition, moduleAvailable } from '../src/data/modules.js';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { completeTemplates, initForces, createForcesState, templateFor } from '../src/rules/forces.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const doc = json('units/modules/modules_ussr.json');
const catalog = mergeEquipmentCatalogs(readdirSync(new URL('../data/units/equipment/', import.meta.url)).filter((n) => /^catalog.*\.json$/.test(n)).map((n) => json(`units/equipment/${n}`)));
const techIds = new Set(json('research/technologies.json').technologies.map((t) => t.id));
const tdir = new URL('../data/units/templates/', import.meta.url);
const templates = completeTemplates(readdirSync(tdir).filter((n) => /^(divisione|brigata)_.*\.json$/.test(n)).map((n) => JSON.parse(readFileSync(new URL(n, tdir), 'utf8'))));

test('modules_ussr: valido, armi nel catalogo, nomi russi e italiani', () => {
  assert.deepEqual(validateModules(doc, { catalogIds: new Set(catalog.entries.map((e) => e.equipment_id)), techIds }), []);
  assert.ok(doc.modules.every((m) => m.nation === 'USSR' && m.name_ru && m.name_it));
});

test('ogni composizione coincide col file su disco (stesso id dei template del CSV per 1936 e 1939)', () => {
  for (const c of doc.compositions) {
    const disk = JSON.parse(readFileSync(new URL(c.file, tdir), 'utf8'));
    assert.deepEqual(disk, templateFromComposition(doc, c), c.templateId);
  }
  assert.ok(doc.compositions.some((c) => c.templateId === 'TPL-USSR-RIFLE-1936'));
  assert.ok(doc.compositions.some((c) => c.templateId === 'TPL-USSR-INF-1939'));
});

test('fucilieri 1939 tarati sui numeri con fonte del vecchio CSV (DT, AT 45, cannoni da 76, obici), con i fucili', () => {
  const t = templates.find((x) => x.id === 'TPL-USSR-INF-1939');
  const v = (k) => t.equipment[k]?.value;
  assert.equal(v('MG-USSR-LMG-1939') >= 243, true);
  assert.equal(v('ART-USSR-AT45-1939'), 72);
  assert.equal(v('ART-USSR-GUN76-1939') + v('ART-USSR-GUN76-REGT'), 42);
  assert.equal(v('ART-USSR-HOW122-1939'), 28);
  assert.equal(v('ART-USSR-HOW152-1939'), 12);
  assert.ok(Math.abs(v('MG-USSR-HMG-1939') - 174) <= 10);
  assert.ok(v('INW-USSR-RIFLE-1939') > 10000, 'le divisioni hanno finalmente i fucili');
  assert.ok(t.manpower.war.value <= json('units/modules/editor_rules.json').maxMen);
});

test('al 1/1/1936 le divisioni di fucilieri usano il template del 1936, le brigate aviotrasportate hanno un\'istanza', () => {
  const units = json('units/units.json').units;
  const { state, withoutTemplate } = initForces(createForcesState(), { units, templates, ratio: 0.8, date: '1936-01-01' });
  const ussr = units.filter((u) => u.nation === 'USSR');
  for (const u of ussr.filter((x) => x.category === 'airborne')) {
    assert.equal(state.divisions[u.id]?.templateId, 'TPL-USSR-ABN-1936', u.id);
    assert.ok(!withoutTemplate.includes(u.id));
  }
  const rifle = ussr.filter((u) => u.echelon === 'division' && u.category === 'infantry' && state.divisions[u.id]);
  assert.ok(rifle.length > 0);
  for (const u of rifle) {
    assert.equal(state.divisions[u.id].templateId, 'TPL-USSR-RIFLE-1936');
    assert.ok(state.divisions[u.id].items['equipment.INW-USSR-RIFLE-1939'].planned > 0);
  }
});

test('scelta per data: 1939, 1941, 1942; montagna, cavalleria e motorizzata hanno il proprio template', () => {
  const u = (category) => ({ id: 'X', nation: 'USSR', category, echelon: 'division' });
  assert.equal(templateFor(u('infantry'), templates, '1939-10-01').id, 'TPL-USSR-INF-1939');
  assert.equal(templateFor(u('infantry'), templates, '1941-06-22').id, 'TPL-USSR-INF-1941');
  assert.equal(templateFor(u('infantry'), templates, '1942-06-01').id, 'TPL-USSR-INF-1942');
  assert.equal(templateFor(u('mountain'), templates, '1941-01-01').id, 'TPL-USSR-MTN-1940');
  assert.equal(templateFor(u('cavalry'), templates, '1936-01-01').id, 'TPL-USSR-CAV-1936');
  assert.equal(templateFor(u('motorized'), templates, '1940-07-01').id, 'TPL-USSR-MOT-1940');
});

test('battaglioni legati alla ricerca: motorizzati con TECH-MOT-INF, paracadutisti con TECH-INF-AIRBORNE, PPSh con la produzione d\'emergenza', () => {
  const m = (id) => doc.modules.find((x) => x.id === id);
  const at = (id, researched, date = '1943-01-01') => moduleAvailable(m(id), { nation: 'USSR', date, researched: new Set(researched) });
  assert.equal(at('MOD-USSR-MOT-STRELK', []), false);
  assert.equal(at('MOD-USSR-MOT-STRELK', ['TECH-MOT-INF']), true);
  assert.equal(at('MOD-USSR-DESANT', ['TECH-INF-AIRBORNE']), true);
  assert.equal(at('MOD-USSR-STRELK-1942', ['TECH-INF-EMERG'], '1941-06-01'), false, 'organico 1942 solo dal 1942');
  assert.equal(at('MOD-USSR-STRELK-1942', ['TECH-INF-EMERG']), true);
  assert.equal(moduleAvailable(m('MOD-USSR-STRELK'), { nation: 'DEU', date: '1943-01-01', researched: new Set() }), false, 'solo per l\'URSS');
});

test('20/11/2026: nomi russi dei template storici, niente doppioni; categorie: motorizzata e cavalleria restano tali; lanciarazzi Katjuša', async () => {
  const { designCategory } = await import('../src/data/modules.js');
  assert.deepEqual(doc.presets, [], 'i modelli di partenza sono i template storici, senza doppioni');
  assert.ok(doc.compositions.every((c) => /^[A-Z][a-z]+(aja|naja)? ?/.test(c.name) && /\(\d{4}\)$/.test(c.name)), 'nome russo con anno');
  const comp = (id) => doc.compositions.find((c) => c.templateId === id).modules;
  assert.equal(doc.compositions.find((c) => c.templateId === 'TPL-USSR-MOT-1940').category, 'motorized', 'categoria dichiarata, mostrata dall\'editor per il modello di partenza');
  assert.equal(designCategory(comp('TPL-USSR-CAV-1936'), doc.modules), 'cavalry');
  const k = doc.modules.find((m) => m.id === 'MOD-USSR-KATJUSHA');
  assert.equal(k.equipment['ART-USSR-BM13'], 12);
  assert.equal(k.requiresTech, 'TECH-ART-ROCKET');
  assert.equal(json('research/historical_tech_dates.json').byNation.USSR['TECH-ART-ROCKET'], '1941-06-01');
});
