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

test('Francia 1939: i dati della specifica §12, con attendibilità per voce; il 47 mm del 1940 resta fuori dal template', async () => {
  const { templates, catalogs } = await templatesBuilt();
  const t = templates['divisione_fanteria_francia_1939.json'];
  assert.deepEqual(validateTemplate(t), []);
  assert.equal(t.id, 'TPL-FRA-INF-1939');
  assert.deepEqual([t.manpower.war.value, t.manpower.war.effective.value, t.horses.value, t.regimentsInfantry.value], [16400, 15500, 4900, 3]);
  const q = (id) => [t.equipment[id].value, t.equipment[id].reliability];
  assert.deepEqual(q('MG-FRA-FM2429'), [336, 'STANDARD_TOE']);
  assert.deepEqual(q('MG-FRA-HOTCHKISS1914'), [144, 'STANDARD_TOE']);
  assert.deepEqual(q('GL-FRA-VB1916'), [432, 'STANDARD_TOE']);
  assert.deepEqual(q('ART-FRA-MORTAR60'), [27, 'STANDARD_TOE']);
  assert.deepEqual(q('ART-FRA-MORTAR81'), [24, 'STANDARD_TOE']);
  assert.deepEqual(q('ART-FRA-AT25'), [15, 'PROVISIONAL']);
  assert.deepEqual(q('ART-FRA-ART75M1897'), [36, 'STANDARD_TOE']);
  assert.deepEqual(q('ART-FRA-HOW155C'), [24, 'STANDARD_TOE']);
  assert.deepEqual(q('INW-FRA-RIFLE-1939'), [null, 'MISSING_DATA'], 'fucili e pistole non si deducono dagli uomini');
  assert.equal(t.equipment['ART-FRA-AT47M1937'], undefined);
  const cat = catalogs['catalog_fra.json'];
  assert.equal(cat.entries.find((e) => e.equipment_id === 'ART-FRA-AT47M1937').reliability, 'DATED_VARIANT');
  assert.equal(cat.entries.find((e) => e.equipment_id === 'INW-FRA-RIFLE-1939').granularity, 'class');
});

test('Francia 1939 nel motore: scelta per data, organico iniziale reale e quantità previste per ogni voce', async () => {
  const { templates } = await templatesBuilt();
  const t = templates['divisione_fanteria_francia_1939.json'];
  const unit = { id: 'F1', nation: 'FRA', category: 'infantry', echelon: 'division' };
  assert.equal(templateFor(unit, [t], '1936-01-01').id, 'TPL-FRA-INF-1939', 'prima del settembre 1939, se è l\'unico, si usa per approssimazione (regola del 12/11/2026)');
  assert.equal(templateFor(unit, [t], '1939-09-01').id, 'TPL-FRA-INF-1939');
  const items = initialEffective(t, 0.9);
  assert.deepEqual(items['manpower.war'], { planned: 16400, effective: 15500, source: 'template' });
  assert.deepEqual(items.horses, { planned: 4900, effective: Math.round(4900 * 0.9), source: 'ratio' });
  assert.deepEqual(items['equipment.MG-FRA-FM2429'], { planned: 336, effective: Math.round(336 * 0.9), source: 'ratio' });
  assert.equal(items['equipment.INW-FRA-RIFLE-1939'], undefined, 'senza quantità nessuna istanza inventata');
});

test('cataloghi di nazioni diverse si fondono con id e alias senza collisioni', async () => {
  const { catalogs } = await templatesBuilt();
  const fra = catalogs['catalog_fra.json'];
  const ital = buildNationCatalog('ITA', [buildDivisionSet(ita())], []);
  assert.deepEqual(validateEquipmentCatalog(mergeEquipmentCatalogs([fra, ital])), []);
  assert.ok(validateEquipmentCatalog(mergeEquipmentCatalogs([fra, fra])).some((e) => /duplicato/.test(e)));
});

test('Germania 1939 e Italia 1940 (agenti di ricerca): file su disco = CSV; scelta per data senza toccare i template del 1936; dati mancanti senza effettivo', async () => {
  const { templates } = await templatesBuilt();
  const disk = (p) => JSON.parse(readFileSync(new URL(`../data/units/templates/${p}`, import.meta.url), 'utf8'));
  const deu = templates['divisione_fanteria_germania_1939.json']; const ita = templates['divisione_fanteria_italia_1940.json'];
  assert.deepEqual(disk('divisione_fanteria_germania_1939.json'), deu);
  assert.deepEqual(disk('divisione_fanteria_italia_1940.json'), ita);
  for (const t of [deu, ita]) assert.deepEqual(validateTemplate(t), []);
  assert.deepEqual([deu.id, ita.id], ['TPL-DEU-INF-1939', 'TPL-ITA-INF-1940']);
  const old = disk('divisione_fanteria_germania_1936.json');
  const unit = { id: 'D1', nation: 'DEU', category: 'infantry', echelon: 'division' };
  assert.equal(templateFor(unit, [old, deu], '1936-01-01').id, old.id, 'all\'inizio della partita resta il template del 1936');
  assert.equal(templateFor(unit, [old, deu], '1939-09-01').id, 'TPL-DEU-INF-1939', 'dal settembre 1939 vale il nuovo');
  assert.equal(templateFor({ ...unit, nation: 'ITA' }, [ita], '1939-12-31').id, 'TPL-ITA-INF-1940', 'unico template italiano: usato anche prima (approssimazione)');
  assert.equal(ita.horses.value, null); assert.equal('effective' in ita.horses, false); assert.equal(ita.manpower.war.effective.value, null, 'iniziale ignoto: lo stima il motore col rapporto');
  const items = initialEffective(ita, 0.9);
  assert.deepEqual(items['manpower.war'], { planned: 12979, effective: Math.round(12979 * 0.9), source: 'ratio' });
  assert.equal(items.horses, undefined, 'nessun cavallo inventato');
});
