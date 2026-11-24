// Francia a battaglioni, passo 1 (24/11/2026): catalogo per modelli (scelte dell'utente: solo produzione francese, elenco completo; carri al passo 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { buildEquipmentRecipes } from '../src/data/equipmentProduction.js';
import { EQUIPMENT_GROUP } from '../src/rules/unitSheet.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const catalog = mergeEquipmentCatalogs(readdirSync(new URL('../data/units/equipment/', import.meta.url)).filter((n) => /^catalog.*\.json$/.test(n)).map((n) => json(`units/equipment/${n}`)));
const recipes = new Map(buildEquipmentRecipes(catalog, json('units/equipment/equipment_production.json')).map((r) => [r.equipmentId, r]));
const NEW = ['INW-FRA-MAS36', 'INW-FRA-PISTOL-MAS35', 'INW-FRA-SMG-MAS38', 'ART-FRA-MOR50', 'ART-FRA-GUN105L', 'ART-FRA-GUN155GPF', 'ART-FRA-GUN75-MONT',
  'ART-FRA-AA25', 'ART-FRA-AA75', 'VEH-FRA-RENAULT-UE', 'VEH-FRA-LORRAINE37L', 'VEH-FRA-CITROEN23', 'VEH-FRA-RENAULT-3T', 'VEH-FRA-LAFFLY-S20',
  'VEH-FRA-MOTO-RG', 'VEH-FRA-MOTO-AX2', 'VEH-FRA-AMD-WL', 'VEH-FRA-PANHARD178'];
const byId = new Map(catalog.entries.map((e) => [e.equipment_id, e]));

test('18 modelli francesi nel catalogo, stime segnalate, producibili e con il gruppo della scheda', () => {
  for (const id of NEW) {
    const e = byId.get(id);
    assert.ok(e, id);
    assert.equal(e.nation, 'FRA');
    assert.equal(e.reliability, 'ESTIMATED', id);
    assert.ok(recipes.get(id)?.massTonnes > 0, `${id}: ricetta con massa`);
    assert.ok(EQUIPMENT_GROUP[id], `${id}: gruppo`);
  }
  assert.ok(!catalog.entries.some((e) => e.nation === 'FRA' && /USA|BROWNING|CURTISS|THOMPSON/i.test(`${e.designation ?? ''} ${e.equipment_id}`)), 'solo produzione francese');
});

test('date: i nuovi non prima della storia, i superati escono quando arriva il successore', () => {
  const r = (id) => recipes.get(id);
  assert.equal(r('INW-FRA-MAS36').availableFrom, '1937-01-01');
  assert.equal(r('ART-FRA-AA25').availableFrom, '1939-01-01');
  assert.ok(r('VEH-FRA-MOTO-RG').availableTo >= r('VEH-FRA-MOTO-AX2').availableFrom, 'nessun vuoto fra le moto');
  assert.ok(r('VEH-FRA-AMD-WL').availableTo >= r('VEH-FRA-PANHARD178').availableFrom, 'nessun vuoto fra le autoblindo');
});

test('catene di sostituzione francesi', () => {
  const chains = new Map(json('units/equipment/replacements.json').entries.map((e) => [e.id, e.replaces]));
  assert.equal(chains.get('INW-FRA-MAS36'), 'INW-FRA-RIFLE-1939');
  assert.equal(chains.get('VEH-FRA-MOTO-AX2'), 'VEH-FRA-MOTO-RG');
  assert.equal(chains.get('VEH-FRA-PANHARD178'), 'VEH-FRA-AMD-WL');
  for (const [a, b] of chains) if (a.includes('-FRA-')) assert.equal(byId.get(a).category, byId.get(b).category, `${a}←${b}: stessa categoria`);
});
