// Costruzione di template v2 e cataloghi da CSV (Fase 6, 03/11/2026). La Francia 1939 è il caso reale; l'Italia sotto è un esempio SINTETICO (non dati
// storici) che prova la scalabilità: stessa procedura, nessun codice per nazione.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDivisionSet, buildNationCatalog, csvRows } from '../src/data/templateBuilder.js';
import { validateTemplate } from '../src/data/templates.js';
import { validateEquipmentCatalog, mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { templateFor } from '../src/rules/forces.js';
import { initialEffective } from '../src/rules/readiness.js';
import { templatesBuilt } from '../scripts/build-templates.js';

const T = 'template_id,nation,category,echelon,series,division_name,reference_date,formation,infantry_regiments,manpower_initial_estimate,manpower_organic_max,horses_organic,status,source_quality,note\n';
const L = 'template_id,subunit_id,equipment_id,quantity,quantity_status,basis,effective_quantity,mechanics_profile_id,source_note\n';
const C = 'equipment_id,nation,designation,family,class,caliber_mm,role,quantity_planned,quantity_effective,quantity_basis,reference_date,confidence,source_note\n';
const ita = (over = {}) => ({
  template: csvRows(`${T}TPL-ITA-INF-9DI-1940,ITA,infantry,division,B,9a Divisione di prova,1940-06,triangular,3,10000,12000,3000,RECONSTRUCTED_TEMPLATE,TEST,esempio sintetico\n`, 't'),
  lines: csvRows(`${L}TPL-ITA-INF-9DI-1940,RGT,ITA-MORT45,30,STANDARD_TOE,x,,,riga di prova\n`, 'l'),
  catalog: csvRows(`${C}ITA-MORT45,ITA,Mortaio di prova,infantry_support,light_mortar,45,close,30,,x,1940-06,STANDARD_TOE,nota\nITA-MG-NEW,ITA,Mitragliatrice di prova,small_arms,heavy_machine_gun,8,support,,,x,1941-01,DATED_VARIANT,variante\n`, 'c'),
  ...over,
});

test('una nazione qualsiasi si costruisce con la stessa procedura: template v2 valido, id per categoria, catalogo coerente', () => {
  const b = buildDivisionSet(ita());
  assert.equal(b.template.id, 'TPL-ITA-INF-1940');
  assert.equal(b.template.metadata.sourceTemplateId, 'TPL-ITA-INF-9DI-1940');
  assert.equal(b.template.appliesTo.validFrom, '1940-06-01');
  assert.deepEqual(validateTemplate(b.template), []);
  assert.deepEqual(Object.keys(b.template.equipment), ['ART-ITA-MORT45'], 'la variante datata non entra nel template');
  assert.equal(b.template.equipment['ART-ITA-MORT45'].value, 30);
  const doc = buildNationCatalog('ITA', [b], []);
  assert.deepEqual(validateEquipmentCatalog(doc, { templates: [b.template] }), []);
  assert.ok(doc.entries.some((e) => e.equipment_id === 'MG-ITA-MG-NEW' && e.reliability === 'DATED_VARIANT'));
});

test('dati mancanti: nessuna quantità inventata (null + MISSING_DATA, senza effettivo)', () => {
  const c = ita(); c.catalog = csvRows(`${C}ITA-RIFLE,ITA,Fucile,small_arms,rifle,,i,,,x,1940-06,MISSING_DATA,manca\n`, 'c'); c.lines = [];
  const b = buildDivisionSet(c);
  assert.deepEqual([b.template.equipment['INW-ITA-RIFLE'].value, b.template.equipment['INW-ITA-RIFLE'].reliability], [null, 'MISSING_DATA']);
  assert.equal('effective' in b.template.equipment['INW-ITA-RIFLE'], false);
  assert.deepEqual(validateTemplate(b.template), []);
});

test('incoerenze dei CSV = errore esplicito, mai dati troncati o inventati', () => {
  const bad = (over, re) => assert.throws(() => buildDivisionSet(ita(over)), re);
  bad({ lines: csvRows(`${L}TPL-ITA-INF-1DI-1940,RGT,ITA-MORT45,30,STANDARD_TOE,x,,,n\n`, 'l') }, /template_id/);
  bad({ lines: csvRows(`${L}TPL-ITA-INF-9DI-1940,RGT,ITA-XXX,30,STANDARD_TOE,x,,,n\n`, 'l') }, /assente dal catalogo/);
  bad({ lines: csvRows(`${L}TPL-ITA-INF-9DI-1940,RGT,ITA-MORT45,31,STANDARD_TOE,x,,,n\n`, 'l') }, /diversa da quella del catalogo/);
  bad({ lines: csvRows(`${L}TPL-ITA-INF-9DI-1940,RGT,ITA-MORT45,3x,STANDARD_TOE,x,,,n\n`, 'l') }, /intero atteso/);
  bad({ lines: csvRows(`${L}TPL-ITA-INF-9DI-1940,RGT,ITA-MORT45,30,CERTO,x,,,n\n`, 'l') }, /quantity_status/);
  bad({ lines: csvRows(`${L}TPL-ITA-INF-9DI-1940,RGT,ITA-MG-NEW,5,STANDARD_TOE,x,,,n\n`, 'l') }, /DATED_VARIANT/);
  bad({ catalog: csvRows(`${C}ITA-X,ITA,X,f,cannone_strano,5,r,,,x,1940-06,STANDARD_TOE,n\n`, 'c') }, /classe sconosciuta/);
  bad({ template: csvRows(`${T}TPL-ITA-INF-9DI-1940,ITA,cavalry,division,B,x,1940-06,t,3,1,2,3,S,Q,n\n`, 't') }, /categoria sconosciuta/);
  bad({ template: csvRows(`${T}TPL-ITA-INF-9DI-1940,ITA,infantry,division,B,x,1940-06,t,3,13000,12000,3,S,Q,n\n`, 't') }, /supera il massimo/);
});

test('Francia 1939 reale: i file su disco coincidono con quelli ricostruiti dai CSV (nessuna modifica a mano)', async () => {
  const built = await templatesBuilt();
  const disk = (p) => JSON.parse(readFileSync(new URL(`../data/units/${p}`, import.meta.url), 'utf8'));
  for (const [name, doc] of Object.entries(built.templates)) assert.deepEqual(disk(`templates/${name}`), doc, name);
  for (const [name, doc] of Object.entries(built.catalogs)) assert.deepEqual(disk(`equipment/${name}`), doc, name);
});

// 25/11/2026 (schema unico, Francia passo 2): il CSV francese 1939 genera solo il catalogo; il template (stesso id) è la somma dei battaglioni
// di data/units/modules/modules_fra.json, con i totali allineati alle cifre della specifica §12 (uomini, cavalli, armi di reparto).
test('Francia 1939: dai battaglioni, con le cifre della specifica §12; il 47 mm del 1940 resta fuori dal template', async () => {
  const { templates, catalogs } = await templatesBuilt();
  assert.equal(templates['divisione_fanteria_francia_1939.json'], undefined, 'il CSV non genera più il template francese');
  const t = JSON.parse(readFileSync(new URL('../data/units/templates/divisione_fanteria_francia_1939.json', import.meta.url), 'utf8'));
  assert.deepEqual(validateTemplate(t), []);
  assert.equal(t.id, 'TPL-FRA-INF-1939');
  assert.ok(Array.isArray(t.modules) && t.modules.length > 0);
  assert.deepEqual([t.manpower.war.value, t.horses.value], [16400, 4900]);
  const q = (id) => t.equipment[id].value;
  assert.deepEqual(['MG-FRA-FM2429', 'MG-FRA-HOTCHKISS1914', 'GL-FRA-VB1916', 'ART-FRA-MORTAR60', 'ART-FRA-MORTAR81', 'ART-FRA-AT25', 'ART-FRA-ART75M1897', 'ART-FRA-HOW155C'].map(q), [336, 144, 432, 27, 24, 15, 36, 24]);
  assert.equal(t.equipment['ART-FRA-AT47M1937'], undefined);
  assert.equal(t.equipment['ART-FRA-AT47-ARM-1940'], undefined);
  const cat = catalogs['catalog_fra.json'];
  assert.equal(cat.entries.find((e) => e.equipment_id === 'ART-FRA-AT47M1937').reliability, 'DATED_VARIANT');
  assert.equal(cat.entries.find((e) => e.equipment_id === 'INW-FRA-RIFLE-1939').granularity, 'class');
});

test('Francia 1939 nel motore: scelta per data e quantità previste per ogni voce', async () => {
  const t = JSON.parse(readFileSync(new URL('../data/units/templates/divisione_fanteria_francia_1939.json', import.meta.url), 'utf8'));
  const unit = { id: 'F1', nation: 'FRA', category: 'infantry', echelon: 'division' };
  assert.equal(templateFor(unit, [t], '1936-01-01').id, 'TPL-FRA-INF-1939', 'prima del settembre 1939, se è l\'unico, si usa per approssimazione (regola del 12/11/2026)');
  assert.equal(templateFor(unit, [t], '1939-09-01').id, 'TPL-FRA-INF-1939');
  const items = initialEffective(t, 0.9);
  assert.equal(items['manpower.war'].planned, 16400);
  assert.deepEqual(items.horses, { planned: 4900, effective: Math.round(4900 * 0.9), source: 'ratio' });
  assert.deepEqual(items['equipment.MG-FRA-FM2429'], { planned: 336, effective: Math.round(336 * 0.9), source: 'ratio' });
  assert.equal(items['equipment.INW-FRA-RIFLE-1939'].planned, 10810, 'fucili ora stimati dai battaglioni');
});

test('cataloghi di nazioni diverse si fondono con id e alias senza collisioni', async () => {
  const { catalogs } = await templatesBuilt();
  const fra = catalogs['catalog_fra.json'];
  const ital = buildNationCatalog('ITA', [buildDivisionSet(ita())], []);
  assert.deepEqual(validateEquipmentCatalog(mergeEquipmentCatalogs([fra, ital])), []);
  assert.ok(validateEquipmentCatalog(mergeEquipmentCatalogs([fra, fra])).some((e) => /duplicato/.test(e)));
});

// 20/11/2026 (schema unico): il CSV tedesco 1939 genera solo il catalogo (templateOutput: false); il template è la somma dei battaglioni, stesso id
test('Germania 1939 e Italia 1940 (dai battaglioni, stesso id; Italia dal 24/11/2026): scelta per data senza toccare i template del 1936', async () => {
  const { templates } = await templatesBuilt();
  const disk = (p) => JSON.parse(readFileSync(new URL(`../data/units/templates/${p}`, import.meta.url), 'utf8'));
  assert.equal(templates['divisione_fanteria_germania_1939.json'], undefined, 'il CSV non genera più il template tedesco');
  assert.equal(templates['divisione_fanteria_italia_1940.json'], undefined, 'né quello italiano');
  const deu = disk('divisione_fanteria_germania_1939.json'); const ita = disk('divisione_fanteria_italia_1940.json'); const ita36 = disk('divisione_fanteria_italia_1936.json');
  for (const t of [deu, ita, ita36]) { assert.ok(Array.isArray(t.modules) && t.modules.length > 0, 'somma di battaglioni'); assert.deepEqual(validateTemplate(t), []); }
  assert.deepEqual([deu.id, ita.id], ['TPL-DEU-INF-1939', 'TPL-ITA-INF-1940']);
  const old = disk('divisione_fanteria_germania_1936.json');
  const unit = { id: 'D1', nation: 'DEU', category: 'infantry', echelon: 'division' };
  assert.equal(templateFor(unit, [old, deu], '1936-01-01').id, old.id, 'all\'inizio della partita resta il template del 1936');
  assert.equal(templateFor(unit, [old, deu], '1939-09-01').id, 'TPL-DEU-INF-1939', 'dal settembre 1939 vale il nuovo');
  assert.equal(templateFor({ ...unit, nation: 'ITA' }, [ita36, ita], '1936-01-01').id, 'TPL-ITA-INF-1936', 'Italia 1936: divisione ternaria');
  assert.equal(templateFor({ ...unit, nation: 'ITA' }, [ita36, ita], '1939-12-31').id, 'TPL-ITA-INF-1940', 'dal 1939 la binaria');
});
