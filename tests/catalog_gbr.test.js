// Regno Unito come Germania, URSS e USA, passo 1 (24/11/2026): catalogo per modelli (scelte dell'utente: 1A niente Lend-Lease, 2A elenco completo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { buildEquipmentRecipes } from '../src/data/equipmentProduction.js';
import { EQUIPMENT_GROUP } from '../src/rules/unitSheet.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const catalog = mergeEquipmentCatalogs(readdirSync(new URL('../data/units/equipment/', import.meta.url)).filter((n) => /^catalog.*\.json$/.test(n)).map((n) => json(`units/equipment/${n}`)));
const table = json('units/equipment/equipment_production.json');
const recipes = new Map(buildEquipmentRecipes(catalog, table).map((r) => [r.equipmentId, r]));
const NEW = ['INW-GBR-NO4', 'INW-GBR-PISTOL-WEBLEY', 'INW-GBR-SMG-LANCHESTER', 'INW-GBR-SMG-STEN', 'MG-GBR-LEWIS', 'MG-GBR-BREN', 'MG-GBR-VICKERS', 'ART-GBR-BOYS', 'GL-GBR-PIAT',
  'ART-GBR-MOR2IN', 'ART-GBR-MOR3IN', 'ART-GBR-MOR42IN', 'ART-GBR-18PDR', 'ART-GBR-HOW45', 'ART-GBR-HOW55', 'ART-GBR-6PDR', 'ART-GBR-17PDR', 'ART-GBR-BOFORS', 'ART-GBR-AA37IN',
  'VEH-GBR-TRUCK15', 'VEH-GBR-TRUCK3T', 'VEH-GBR-CARRIER', 'VEH-GBR-MOTO', 'VEH-GBR-MORRIS-AC', 'VEH-GBR-DAIMLER-AC'];
const byId = new Map(catalog.entries.map((e) => [e.equipment_id, e]));

test('25 modelli britannici nel catalogo, stime segnalate, producibili e con il gruppo della scheda', () => {
  for (const id of NEW) {
    const e = byId.get(id);
    assert.ok(e, id);
    assert.equal(e.nation, 'GBR');
    assert.equal(e.reliability, 'ESTIMATED', id);
    assert.ok(recipes.get(id), `${id}: ricetta`);
    assert.ok(recipes.get(id).massTonnes > 0, `${id}: massa`);
    assert.ok(EQUIPMENT_GROUP[id], `${id}: gruppo`);
  }
  assert.ok(!catalog.entries.some((e) => e.nation === 'GBR' && /SHERMAN|STUART|GRANT|THOMPSON/i.test(`${e.designation ?? ''} ${e.equipment_id}`)), 'niente Lend-Lease (scelta 1A)');
});

test('date: modelli nuovi non prima della storia, i superati escono quando arriva il successore', () => {
  const r = (id) => recipes.get(id);
  assert.equal(r('MG-GBR-BREN').availableFrom, '1937-09-01');
  assert.equal(r('MG-GBR-LEWIS').availableTo, '1938-12-31');
  assert.equal(r('ART-GBR-18PDR').availableTo, '1940-06-30');
  assert.equal(r('ART-GBR-25PDR-ARM-1939').availableFrom, '1940-01-01');
  assert.equal(r('ART-GBR-2PDR-ARM-1939').availableTo, '1942-12-31');
  assert.ok(r('ART-GBR-6PDR').availableFrom <= '1942-12-31');
  assert.equal(r('INW-GBR-SMG-STEN').requiresTech, 'TECH-INF-EMERG');
  assert.equal(r('ART-GBR-17PDR').requiresTech, 'TECH-ARM-GUN-75L');
});

test('catene di sostituzione britanniche (il vecchio copre il posto del nuovo nei rinforzi)', () => {
  const chains = new Map(json('units/equipment/replacements.json').entries.map((e) => [e.id, e.replaces]));
  assert.equal(chains.get('MG-GBR-BREN'), 'MG-GBR-LEWIS');
  assert.equal(chains.get('ART-GBR-25PDR-ARM-1939'), 'ART-GBR-18PDR');
  assert.equal(chains.get('ART-GBR-17PDR'), 'ART-GBR-6PDR');
  assert.equal(chains.get('ART-GBR-6PDR'), 'ART-GBR-2PDR-ARM-1939');
  assert.equal(chains.get('GL-GBR-PIAT'), undefined, 'PIAT e Boys sono di categorie diverse: nessuna catena');
});

test('pesi per modello di artiglieria e anticarro (scelta B): il 25 libbre vale più del 18 libbre anche per tonnellata (+20% e oltre)', async () => {
  const { weaponWeight, validateBattleV2 } = await import('../src/rules/battleV2.js');
  const { valuePerTonne } = await import('../src/rules/aiProduction.js');
  const { buildWeaponOf } = await import('../src/rules/equipmentFill.js');
  const cfg = json('units/battle_v2.json');
  const W = buildWeaponOf(catalog);
  const w = (id) => weaponWeight(W('GBR', `equipment.${id}`), cfg);
  assert.deepEqual([w('ART-GBR-25PDR-ARM-1939').soft, w('ART-GBR-25PDR-ARM-1939').hard], [160, 25]);
  assert.equal(w('ART-GBR-17PDR').hard, 180);
  assert.equal(w('ART-GBR-6PDR').hard, 70, 'senza peso proprio vale la fascia di calibro');
  const vpt = (id) => valuePerTonne(W('GBR', `equipment.${id}`), recipes.get(id).massTonnes, cfg);
  assert.ok(vpt('ART-GBR-25PDR-ARM-1939') / vpt('ART-GBR-18PDR') >= 1.2);
  const bad = structuredClone(cfg); bad.firepower.gunModels['ART-XXX'] = { soft: -1, hard: 0 };
  const errs = validateBattleV2(bad, { catalogIds: new Set(catalog.entries.map((e) => e.equipment_id)) });
  assert.ok(errs.some((e) => /arma ART-XXX non valido/.test(e)) && errs.some((e) => /arma ART-XXX inesistente/.test(e)), errs.join('; '));
});
