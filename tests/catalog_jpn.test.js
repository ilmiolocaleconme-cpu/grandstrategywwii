// Giappone a battaglioni, passo 1 (25/11/2026): catalogo per modelli (scelte dell'utente: solo produzione giapponese, elenco completo; carri al passo 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { buildEquipmentRecipes } from '../src/data/equipmentProduction.js';
import { EQUIPMENT_GROUP } from '../src/rules/unitSheet.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const catalog = mergeEquipmentCatalogs(readdirSync(new URL('../data/units/equipment/', import.meta.url)).filter((n) => /^catalog.*\.json$/.test(n)).map((n) => json(`units/equipment/${n}`)));
const recipes = new Map(buildEquipmentRecipes(catalog, json('units/equipment/equipment_production.json')).map((r) => [r.equipmentId, r]));
const NEW = ['INW-JPN-ARISAKA-T99', 'INW-JPN-PISTOL-T14', 'INW-JPN-SMG-T100', 'MG-JPN-T11', 'MG-JPN-T96', 'MG-JPN-T99', 'MG-JPN-T92', 'GL-JPN-T89',
  'ART-JPN-MOR81-T97', 'ART-JPN-MOR90-T94', 'ART-JPN-GUN70-T92', 'ART-JPN-GUN75-MT-T94', 'ART-JPN-GUN75-T38', 'ART-JPN-GUN75-T90', 'ART-JPN-HOW105-T91',
  'ART-JPN-HOW150-T96', 'ART-JPN-AA20-T98', 'ART-JPN-AA75-T88', 'VEH-JPN-ISUZU-T94', 'VEH-JPN-NISSAN-180', 'VEH-JPN-TRACTOR-T92', 'VEH-JPN-MOTO-RIKUO',
  'VEH-JPN-MOTO-T97', 'VEH-JPN-AC-T93'];
const byId = new Map(catalog.entries.map((e) => [e.equipment_id, e]));

test('24 modelli giapponesi nel catalogo, stime segnalate, producibili e con il gruppo della scheda', () => {
  for (const id of NEW) {
    const e = byId.get(id);
    assert.ok(e, id);
    assert.equal(e.nation, 'JPN');
    assert.equal(e.reliability, 'ESTIMATED', id);
    assert.ok(recipes.get(id)?.massTonnes > 0, `${id}: ricetta con massa`);
    assert.ok(EQUIPMENT_GROUP[id], `${id}: gruppo`);
  }
});

test('date: i nuovi non prima della storia, i superati escono quando arriva il successore', () => {
  const r = (id) => recipes.get(id);
  assert.equal(r('INW-JPN-ARISAKA-T99').availableFrom, '1940-01-01');
  assert.equal(r('MG-JPN-T96').availableFrom, '1936-06-01');
  assert.ok(r('MG-JPN-T11').availableTo >= r('MG-JPN-T96').availableFrom, 'nessun vuoto fra i fucili mitragliatori');
  assert.ok(r('VEH-JPN-MOTO-RIKUO').availableTo >= r('VEH-JPN-MOTO-T97').availableFrom, 'nessun vuoto fra le moto');
});

test('catene di sostituzione giapponesi', () => {
  const chains = new Map(json('units/equipment/replacements.json').entries.map((e) => [e.id, e.replaces]));
  assert.equal(chains.get('INW-JPN-ARISAKA-T99'), 'INW-JPN-RIFLE-1939');
  assert.equal(chains.get('MG-JPN-T96'), 'MG-JPN-T11');
  assert.equal(chains.get('MG-JPN-T99'), 'MG-JPN-T96');
  assert.equal(chains.get('ART-JPN-GUN75-T90'), 'ART-JPN-GUN75-T38');
  for (const [a, b] of chains) if (a.includes('-JPN-')) assert.equal(byId.get(a).category, byId.get(b).category, `${a}←${b}: stessa categoria`);
});
