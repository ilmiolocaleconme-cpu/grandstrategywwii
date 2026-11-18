// Cacciacarri, cannoni d'assalto e brigate carri (18/11/2026, decisione dell'utente: «prima cacciacarri e brigate», con le tecnologie necessarie).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateTechnologies, consumersOf } from '../src/data/technologies.js';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { buildEquipmentRecipes, recipeLockReasons, validateEquipmentProduction, techList } from '../src/data/equipmentProduction.js';
import { validateModules } from '../src/data/modules.js';
import { weaponWeight, rawFirepower, splitLine, unitSlot } from '../src/rules/battleV2.js';
import { templateFor, initForces, validateForcesState } from '../src/rules/forces.js';
import { validateTemplate } from '../src/data/templates.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const techs = json('research/technologies.json');
const table = json('units/equipment/equipment_production.json');
const cfg = json('units/battle_v2.json');
const mods = json('units/modules/modules_deu.json');
const edir = new URL('../data/units/equipment/', import.meta.url);
const catalog = mergeEquipmentCatalogs(readdirSync(edir).filter((n) => /^catalog.*\.json$/.test(n)).sort().map((f) => JSON.parse(readFileSync(new URL(f, edir), 'utf8'))));
const recipes = buildEquipmentRecipes(catalog, table);
const rec = (eq) => recipes.find((r) => r.equipmentId === eq);
const TD = ['TD-DEU-STUG-III', 'TD-DEU-STUG-III-G', 'TD-DEU-PZJG-I', 'TD-DEU-MARDER-III', 'TD-DEU-JPZ-IV', 'TD-DEU-HETZER', 'TD-DEU-JAGDPANTHER'];
const ALL = new Set(techs.technologies.map((t) => t.id));
const tplBrig35 = json('units/templates/brigata_carri_urss_1935.json');
const tplBrig41 = json('units/templates/brigata_carri_urss_1941.json');

test('due tecnologie nuove nel ramo Corazzati, con prerequisiti e un uso reale', () => {
  const a = techs.technologies.find((t) => t.id === 'TECH-ARM-ASSAULT');
  const t = techs.technologies.find((x) => x.id === 'TECH-ARM-TD');
  assert.deepEqual(a.prerequisites, ['TECH-ARM-GUN-75S']);
  assert.deepEqual(t.prerequisites, ['TECH-ARM-GUN-3750']);
  assert.equal(a.branch, 'armor'); assert.equal(t.branch, 'armor');
  assert.deepEqual(validateTechnologies(techs), []);
  const used = consumersOf({ equipment: table, technologies: techs, modules: [mods] });
  assert.ok(used.has('TECH-ARM-ASSAULT') && used.has('TECH-ARM-TD'));
});

test('sette cacciacarri tedeschi: ricetta alla fabbrica di carri, date e tecnologie (anche più di una)', () => {
  assert.deepEqual(validateEquipmentProduction(table, { techIds: ALL }), []);
  for (const id of TD) {
    const r = rec(id);
    assert.ok(r, `${id} senza ricetta`);
    assert.equal(catalog.entries.find((e) => e.equipment_id === id).category, 'TANK_DESTROYER');
  }
  const all = new Set([...ALL]);
  const at = (id, date, researched = all) => recipeLockReasons(rec(id), { date, researched }).map((x) => x.kind);
  assert.deepEqual(at('TD-DEU-STUG-III', '1940-01-31'), ['from']);
  assert.deepEqual(at('TD-DEU-STUG-III', '1940-02-01'), []);
  assert.deepEqual(at('TD-DEU-PZJG-I', '1941-03-01'), ['to'], 'Panzerjäger I fuori produzione dal 1941');
  // StuG G: servono cannone d'assalto E 75 lungo
  const noLong = new Set([...ALL].filter((x) => x !== 'TECH-ARM-GUN-75L'));
  const lock = recipeLockReasons(rec('TD-DEU-STUG-III-G'), { date: '1943-01-01', researched: noLong });
  assert.equal(lock[0].kind, 'tech'); assert.deepEqual(lock[0].missing, ['TECH-ARM-GUN-75L']);
  // Jagdpanther: tre tecnologie
  assert.deepEqual(techList(table.overrides['TD-DEU-JAGDPANTHER'].requiresTech).sort(), ['TECH-ARM-HEAVY', 'TECH-ARM-SLOPED', 'TECH-ARM-TD']);
  // Hetzer e Marder su scafo ceco: senza la Boemia non si producono
  const ctl = (who) => () => who;
  assert.deepEqual(recipeLockReasons(rec('TD-DEU-HETZER'), { date: '1944-05-01', researched: all, controllerOf: ctl('CZE') }).map((x) => x.kind), ['control']);
  assert.deepEqual(recipeLockReasons(rec('TD-DEU-HETZER'), { date: '1944-05-01', researched: all, controllerOf: ctl('DEU') }), []);
});

test('requiresTech come elenco: tecnologia inesistente segnalata', () => {
  const bad = { ...table, overrides: { ...table.overrides, 'TD-DEU-HETZER': { ...table.overrides['TD-DEU-HETZER'], requiresTech: ['TECH-ARM-TD', 'TECH-NOPE'] } } };
  assert.ok(validateEquipmentProduction(bad, { techIds: ALL }).some((e) => /TECH-NOPE/.test(e)));
  assert.deepEqual(techList(null), []); assert.deepEqual(techList('A'), ['A']);
});

test('battaglia: i cacciacarri pesano per modello; il Marder colpisce i carri ma è poco corazzato', () => {
  const w = (id) => weaponWeight({ id, category: 'TANK_DESTROYER' }, cfg);
  assert.equal(w('TD-DEU-STUG-III').class, 'direct');
  assert.ok(w('TD-DEU-MARDER-III').hard > w('TD-DEU-STUG-III').hard, 'il 75 lungo buca più del 75 corto');
  assert.ok(w('TD-DEU-MARDER-III').armor < 0.5);
  assert.ok(w('TD-DEU-JAGDPANTHER').hard > w('TD-DEU-JPZ-IV').hard);
  // entrano nella corazza media insieme ai carri
  const items = { a: { planned: 10, effective: 10 }, b: { planned: 10, effective: 10 } };
  const weaponOf = (k) => (k === 'a' ? { id: 'PZ-IV', category: 'TANK' } : { id: 'TD-DEU-MARDER-III', category: 'TANK_DESTROYER' });
  const r = rawFirepower(items, weaponOf, cfg, 0);
  const pz = weaponWeight({ id: 'PZ-IV', category: 'TANK' }, cfg).armor;
  assert.ok(Math.abs(r.armor - (pz + 0.35) / 2) < 1e-9);
});

test('gruppi di cacciacarri tedeschi validi, con le tecnologie giuste', () => {
  assert.deepEqual(validateModules(mods, { catalogIds: new Set(catalog.entries.map((e) => e.equipment_id)), techIds: ALL }), []);
  const m = (id) => mods.modules.find((x) => x.id === id);
  assert.equal(m('MOD-DEU-STUG').equipment['TD-DEU-STUG-III'], 30);
  assert.deepEqual(m('MOD-DEU-JAGDPANTHER').requiresTech, ['TECH-ARM-TD', 'TECH-ARM-HEAVY', 'TECH-ARM-SLOPED']);
});

test('brigate: mezzo posto nel fronte', () => {
  assert.equal(unitSlot({ echelon: 'brigade' }, cfg), 0.5);
  assert.equal(unitSlot({ echelon: 'division' }, cfg), 1);
  const u = (id, echelon) => ({ id, echelon, cohesion: 100, effective: 1000 });
  const s = splitLine([u('a', 'division'), u('b', 'brigade'), u('c', 'brigade'), u('d', 'division')], 2, (x) => unitSlot(x, cfg));
  assert.deepEqual(s.line.map((x) => x.id), ['a', 'b', 'c']);
  assert.deepEqual(s.reserve.map((x) => x.id), ['d']);
  assert.equal(splitLine([u('a'), u('b'), u('c')], 2).line.length, 2, 'senza posti: come prima');
});

test('brigate carri sovietiche: template validi, istanza nelle forze; le aviotrasportate restano senza template', () => {
  assert.deepEqual(validateTemplate(tplBrig35), []); assert.deepEqual(validateTemplate(tplBrig41), []);
  const brig = { id: 'U00267', nation: 'USSR', echelon: 'brigade', category: 'armored', startYear: 1935, endYear: null };
  const air = { id: 'S36-USSR-047', nation: 'USSR', echelon: 'brigade', category: 'airborne', startYear: 1936, endYear: null };
  const tpls = [tplBrig35, tplBrig41];
  assert.equal(templateFor(brig, tpls, '1936-01-01').id, 'TPL-USSR-TBR-1935');
  assert.equal(templateFor(brig, tpls, '1942-01-01').id, 'TPL-USSR-TBR-1941');
  const r = initForces({ divisions: {} }, { units: [brig, air], templates: tpls, ratio: 1, date: '1936-01-01' });
  assert.ok(r.state.divisions.U00267);
  assert.equal(r.state.divisions.U00267.items['equipment.TNK-USSR-BT-1940'].planned, 110);
  assert.ok(!r.state.divisions['S36-USSR-047']);
  assert.deepEqual(validateForcesState(r.state, [brig, air]), []);
});
