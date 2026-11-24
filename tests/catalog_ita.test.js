// Italia a battaglioni, passo 1 (24/11/2026): catalogo per modelli (scelte dell'utente: solo produzione italiana, elenco completo; carri al passo 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { buildEquipmentRecipes } from '../src/data/equipmentProduction.js';
import { EQUIPMENT_GROUP } from '../src/rules/unitSheet.js';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const catalog = mergeEquipmentCatalogs(readdirSync(new URL('../data/units/equipment/', import.meta.url)).filter((n) => /^catalog.*\.json$/.test(n)).map((n) => json(`units/equipment/${n}`)));
const recipes = new Map(buildEquipmentRecipes(catalog, json('units/equipment/equipment_production.json')).map((r) => [r.equipmentId, r]));
const NEW = ['INW-ITA-CARCANO-9138', 'INW-ITA-PISTOL-BERETTA34', 'INW-ITA-SMG-MAB38', 'MG-ITA-BREDA30', 'MG-ITA-FIAT1435', 'MG-ITA-BREDA37',
  'ART-ITA-GUN65-17', 'ART-ITA-HOW75-18', 'ART-ITA-GUN105-28', 'ART-ITA-HOW149-13', 'ART-ITA-AA20-BREDA', 'ART-ITA-AA75-46', 'ART-ITA-AA90-53',
  'VEH-ITA-SPA-DOV35', 'VEH-ITA-FIAT626', 'VEH-ITA-LANCIA3RO', 'VEH-ITA-TL37', 'VEH-ITA-MOTO-GT17', 'VEH-ITA-MOTO-ALCE', 'VEH-ITA-AB40', 'VEH-ITA-AB41'];
const byId = new Map(catalog.entries.map((e) => [e.equipment_id, e]));

test('21 modelli italiani nel catalogo, stime segnalate, producibili e con il gruppo della scheda', () => {
  for (const id of NEW) {
    const e = byId.get(id);
    assert.ok(e, id);
    assert.equal(e.nation, 'ITA');
    assert.equal(e.reliability, 'ESTIMATED', id);
    assert.ok(recipes.get(id)?.massTonnes > 0, `${id}: ricetta con massa`);
    assert.ok(EQUIPMENT_GROUP[id], `${id}: gruppo`);
  }
  assert.ok(!catalog.entries.some((e) => e.nation === 'ITA' && /SOLOTHURN|MG34|MG42|PAK|KAR98/i.test(e.equipment_id)), 'solo produzione italiana (niente armi importate)');
});

test('date: i nuovi non prima della storia, i superati escono quando arriva il successore', () => {
  const r = (id) => recipes.get(id);
  assert.equal(r('MG-ITA-BREDA37').availableFrom, '1937-06-01');
  assert.equal(r('MG-ITA-FIAT1435').availableTo, '1940-12-31');
  assert.equal(r('ART-ITA-AA90-53').availableFrom, '1941-01-01');
  assert.ok(r('VEH-ITA-AB40').availableTo >= r('VEH-ITA-AB41').availableFrom, 'nessun vuoto fra AB 40 e AB 41');
  assert.ok(r('VEH-ITA-MOTO-GT17').availableTo >= r('VEH-ITA-MOTO-ALCE').availableFrom, 'nessun vuoto fra le moto');
});

test('catene di sostituzione italiane', () => {
  const chains = new Map(json('units/equipment/replacements.json').entries.map((e) => [e.id, e.replaces]));
  assert.equal(chains.get('INW-ITA-CARCANO-9138'), 'INW-ITA-RIFLE-1940');
  assert.equal(chains.get('MG-ITA-BREDA37'), 'MG-ITA-FIAT1435');
  assert.equal(chains.get('VEH-ITA-AB41'), 'VEH-ITA-AB40');
  assert.equal(chains.get('VEH-ITA-MOTO-ALCE'), 'VEH-ITA-MOTO-GT17');
  for (const [a, b] of chains) if (a.includes('-ITA-')) assert.equal(byId.get(a).category, byId.get(b).category, `${a}←${b}: stessa categoria`);
});
