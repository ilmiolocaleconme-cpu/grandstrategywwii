// Battaglioni (moduli) e veicoli, fase 1 dell'editor a moduli (18/11/2026, decisioni dell'utente: editor a moduli, prima veicoli e
// motorizzata, prima la Germania). Dati reali, template generati, velocità di marcia, produzione e ricerca.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateModules, sumComposition, templateFromComposition, vehicleMarchSpeed } from '../src/data/modules.js';
import { buildAll } from '../scripts/build-module-templates.js';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { buildEquipmentRecipes, recipeLockReasons } from '../src/data/equipmentProduction.js';
import { templateFor, buildDivision } from '../src/rules/forces.js';
import { validateTemplate } from '../src/data/templates.js';
import { hopDays, issueMove, createMovementState, tickMovement } from '../src/rules/movement.js';
import { rawFirepower } from '../src/rules/battleV2.js';
import { buildWeaponOf } from '../src/rules/equipmentFill.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const doc = json('units/modules/modules_deu.json');
const edir = new URL('../data/units/equipment/', import.meta.url);
const catalog = mergeEquipmentCatalogs(readdirSync(edir).filter((n) => /^catalog.*\.json$/.test(n)).sort().map((f) => JSON.parse(readFileSync(new URL(f, edir), 'utf8'))));
const techs = json('research/technologies.json');
const mod = (id) => doc.modules.find((m) => m.id === id);

test('moduli tedeschi validi; errori riconosciuti', () => {
  assert.deepEqual(validateModules(doc, { catalogIds: new Set(catalog.entries.map((e) => e.equipment_id)), techIds: new Set(techs.technologies.map((t) => t.id)) }), []);
  const bad = (patch) => validateModules({ ...doc, modules: doc.modules.map((m) => (m.id === 'MOD-DEU-MOT-INF' ? { ...m, ...patch } : m)) }, { catalogIds: new Set(catalog.entries.map((e) => e.equipment_id)) });
  assert.ok(bad({ equipment: { 'INW-DEU-RIFLE-1939': 600 } }).some((e) => /motorizzato senza veicoli/.test(e)));
  assert.ok(bad({ equipment: { 'VEH-FRA-X': 3 } }).some((e) => /altra nazione/.test(e)));
  assert.ok(bad({ men: 0 }).some((e) => /uomini/.test(e)));
  assert.ok(validateModules({ ...doc, compositions: [{ ...doc.compositions[0], activeFrom: '1937-01-01', modules: [['MOD-DEU-MECH-INF', 1]] }] }).some((e) => /solo dal 1939-06-01/.test(e)), 'nessun semicingolato prima del 1939');
});

test('il template è la somma dei battaglioni e coincide col file generato', async () => {
  const s = sumComposition(doc.modules, [['MOD-DEU-MOT-INF', 2], ['MOD-DEU-ART-MOT', 1]]);
  assert.equal(s.men, 2 * 850 + 400);
  assert.equal(s.equipment['VEH-DEU-TRUCK'], 2 * 70 + 45);
  assert.equal(s.horses, 0);
  for (const { file, template } of await buildAll()) {
    assert.deepEqual(json(`units/templates/${file}`), template, `${file} va rigenerato`);
    assert.deepEqual(validateTemplate(template), []);
  }
  const mot = templateFromComposition(doc, doc.compositions.find((c) => c.templateId === 'TPL-DEU-MOT-1937'));
  assert.equal(mot.manpower.war.value, 15250, 'vicino ai circa 16.400 storici');
  assert.equal(mot.equipment['VEH-DEU-TRUCK'].value, 9 * 70 + 3 * 40 + 3 * 45 + 55 + 55 + 600);
  assert.equal(mot.equipment['ART-DEU-LEIG18'].value, 18, 'cannoni di fanteria dei reggimenti');
  assert.equal(mot.horses.value, 0, 'la divisione motorizzata non ha cavalli');
  assert.deepEqual(mot.modules[0], { id: 'MOD-DEU-MOT-INF', count: 9, name: 'Infanterie-Bataillon (mot.)', name_it: 'Battaglione di fanteria motorizzata' }); // nomi dal 20/11/2026
});

test('la 4. leichte Division (meccanizzata, 1938) usa ora il template a battaglioni con carri e autocarri', () => {
  const t = [json('units/templates/divisione_meccanizzata_germania_1938.json'), json('units/templates/divisione_fanteria_germania_1936.json')];
  const unit = json('units/units.json').units.find((u) => u.id === 'U00099');
  const tpl = templateFor(unit, t, '1938-06-01');
  assert.equal(tpl.id, 'TPL-DEU-LEICHTE-1938');
  const d = buildDivision(tpl, 0.6, '1938-06-01');
  assert.equal(d.items['equipment.TNK-DEU-TANK'].planned, 80);
  assert.ok(d.items['equipment.VEH-DEU-TRUCK'].effective > 0);
});

test('velocità di marcia dagli autocarri effettivi: senza camion a piedi, al completo alla velocità della categoria', () => {
  const it = (eff) => ({ 'manpower.war': { planned: 12900, effective: 12000 }, 'equipment.VEH-DEU-TRUCK': { planned: 1000, effective: eff } });
  assert.equal(vehicleMarchSpeed(it(1000), 20, 50), 50);
  assert.equal(vehicleMarchSpeed(it(0), 20, 50), 20);
  assert.equal(vehicleMarchSpeed(it(500), 20, 50), 35);
  assert.equal(vehicleMarchSpeed(it(2000), 20, 50), 50, 'i camion in eccesso non accelerano');
  assert.equal(vehicleMarchSpeed({ 'manpower.war': { planned: 1, effective: 1 } }, 20, 50), null, 'senza veicoli nel template: velocità della categoria');
  assert.equal(hopDays(100, 'motorized'), 2);
  assert.equal(hopDays(100, 'motorized', 20), 5);
  const net = { neighbors: (m) => ({ A: ['B'], B: ['A'] }[m]), km: () => 100 };
  const slow = issueMove(createMovementState(), { id: 'U', category: 'motorized', speed: 20 }, 'B', { initial: new Map([['U', 'A']]), net, canEnter: () => true });
  const fast = issueMove(createMovementState(), { id: 'U', category: 'motorized' }, 'B', { initial: new Map([['U', 'A']]), net, canEnter: () => true });
  assert.deepEqual([slow.days, fast.days], [5, 2]);
  assert.equal(slow.movement.orders.U.speed, 20);
  assert.equal('speed' in fast.movement.orders.U, false, 'gli ordini senza velocità propria restano come prima');
  let m = slow.movement; for (let i = 0; i < 4; i += 1) m = tickMovement(m, net.km);
  assert.equal(m.positions.U, undefined); m = tickMovement(m, net.km); assert.equal(m.positions.U, 'B');
});

test('produzione: autocarri e Sd.Kfz. 251 alla fabbrica di veicoli; il 251 richiede i semicingolati e il giugno 1939', () => {
  const r = buildEquipmentRecipes(catalog, json('units/equipment/equipment_production.json'));
  const truck = r.find((x) => x.equipmentId === 'VEH-DEU-TRUCK'); const ht = r.find((x) => x.equipmentId === 'VEH-DEU-SDKFZ251');
  assert.equal(truck.factory, 'FCT-VEHICLES'); assert.equal(ht.factory, 'FCT-VEHICLES');
  assert.deepEqual(recipeLockReasons(truck, { date: '1936-01-01', researched: new Set() }), []);
  assert.deepEqual(recipeLockReasons(ht, { date: '1938-01-01', researched: new Set() }).map((x) => x.kind), ['tech', 'from']);
  assert.deepEqual(recipeLockReasons(ht, { date: '1939-07-01', researched: new Set(['TECH-MECH-HT']) }), []);
});

test('ricerca e battaglia: ramo Motorizzazione; il semicingolato ha la mitragliatrice di bordo, l’autocarro non spara', () => {
  assert.ok(techs.branches.some((b) => b.id === 'mobility'));
  assert.deepEqual(techs.technologies.find((t) => t.id === 'TECH-MECH-HT').prerequisites, ['TECH-MOT-INF']);
  assert.ok(techs.initialResearch.DEU.includes('TECH-MOT-INF') && !techs.initialResearch.DEU.includes('TECH-MECH-HT'));
  const cfg = json('units/battle_v2.json'); const W = buildWeaponOf(catalog);
  const raw = rawFirepower({ 'equipment.VEH-DEU-SDKFZ251': { planned: 10, effective: 10 }, 'equipment.VEH-DEU-TRUCK': { planned: 50, effective: 50 } }, (k) => W('DEU', k), cfg);
  assert.equal(raw.small.soft, 60);
  assert.equal(raw.direct.soft + raw.artillery.soft, 0);
  assert.equal(mod('MOD-DEU-MECH-INF').requiresTech, 'TECH-MECH-HT');
});
