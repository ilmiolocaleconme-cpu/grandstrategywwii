// Catalogo degli equipaggiamenti (Fase 3, 03/11/2026): coerenza, copertura dei template esistenti, nessun modello inventato.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validateEquipmentCatalog, resolveEquipment, equipmentIdForPath, mergeEquipmentCatalogs, CATEGORIES } from '../src/data/equipmentCatalog.js';
import { validateTankModels } from '../src/data/tankModels.js';

const root = new URL('../', import.meta.url);
const json = (p) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const edir = new URL('data/units/equipment/', root);
const catalog = mergeEquipmentCatalogs(readdirSync(edir).filter((n) => /^catalog.*\.json$/.test(n)).sort().map((f) => JSON.parse(readFileSync(new URL(f, edir), 'utf8'))));
const tdir = new URL('data/units/templates/', root);
const templates = readdirSync(tdir).filter((n) => /^divisione_.*\.json$/.test(n)).map((f) => JSON.parse(readFileSync(new URL(f, tdir), 'utf8')));

test('il catalogo reale è valido e copre tutte le chiavi equipment dei template di divisione', () => {
  assert.deepEqual(validateEquipmentCatalog(catalog, { templates }), []);
  assert.ok(templates.filter((t) => t.equipment && t.appliesTo?.nation).length >= 3);
});

test('nessun modello o caratteristica inventata: models vuoti, calibro solo dove la chiave lo dichiara', () => {
  for (const e of catalog.entries) {
    assert.deepEqual(e.models, [], e.equipment_id);
    assert.equal(e.durable, true);
  }
  const key = (id) => catalog.aliases.find((a) => a.equipment_id === id).templateKey;
  for (const e of catalog.entries.filter((x) => x.caliber_mm !== null && x.granularity === 'class')) assert.match(key(e.equipment_id), new RegExp(`${e.caliber_mm}mm`), e.equipment_id);
});

test('armi di nazioni diverse non sono equivalenti: stesso template key, voci diverse; stessa funzione e calibro diverso, voci diverse', () => {
  const d = resolveEquipment(catalog, 'DEU', 'mitragliatrici');
  const g = resolveEquipment(catalog, 'GBR', 'mitragliatrici');
  assert.notEqual(d.equipment_id, g.equipment_id);
  assert.equal(resolveEquipment(catalog, 'DEU', 'obiciLeggeri105mm').category, 'HOWITZER');
  assert.notEqual(resolveEquipment(catalog, 'DEU', 'obiciLeggeri105mm').equipment_id, resolveEquipment(catalog, 'DEU', 'obiciPesanti150mm').equipment_id);
  assert.equal(resolveEquipment(catalog, 'FRA', 'fucili'), null, 'nessuna voce per nazioni senza template');
});

test('equipmentIdForPath: percorso del template → equipment_id; altri percorsi → null', () => {
  assert.equal(equipmentIdForPath(catalog, 'DEU', 'equipment.mortaiPesanti81mm'), 'ART-DEU-MOR-81');
  assert.equal(equipmentIdForPath(catalog, 'DEU', 'manpower.war'), null);
  assert.equal(equipmentIdForPath(catalog, 'DEU', 'equipment.inesistente'), null);
});

test('i carri rimandano al catalogo MDL-* esistente, che resta valido', () => {
  const tank = catalog.entries.find((e) => e.category === 'TANK');
  assert.equal(tank.equipment_id, 'TNK-DEU-TANK');
  const models = JSON.parse(readFileSync(new URL(tank.modelCatalog.replace(/^data\//, 'data/'), root), 'utf8'));
  assert.deepEqual(validateTankModels(models), []);
});

test('validatore: errori su id duplicato, nazione incoerente, categoria, alias orfani/duplicati e chiavi non coperte', () => {
  const ok = () => structuredClone(catalog);
  const has = (doc, re, opts) => assert.ok(validateEquipmentCatalog(doc, opts).some((e) => re.test(e)), String(re));
  let c = ok(); c.entries.push({ ...c.entries[0] }); has(c, /duplicato/);
  c = ok(); c.entries[0].nation = 'GBR'; has(c, /nazione dell'id/);
  c = ok(); c.entries[0].category = 'ARMA'; has(c, /categoria/);
  c = ok(); c.entries[0].category = null; has(c, /categoria nulla/);
  c = ok(); c.entries[0].durable = false; has(c, /durevoli/);
  c = ok(); c.aliases.push({ ...c.aliases[0] }); has(c, /duplicato/);
  c = ok(); c.aliases[0].equipment_id = 'INW-DEU-NONE'; has(c, /inesistente/);
  c = ok(); c.aliases = c.aliases.slice(1); has(c, /nessun alias/);
  c = ok(); c.aliases = c.aliases.filter((a) => a.templateKey !== 'radio' || a.nation !== 'GBR'); has(c, /nessun alias|non ha un alias/, { templates });
  const orphan = structuredClone(templates[0]); orphan.equipment.nuovaArma = { value: 1 }; has(ok(), /nuovaArma/, { templates: [orphan] });
  assert.equal(validateEquipmentCatalog({ schema: 'x' }).length, 1);
  assert.equal(CATEGORIES.length, 17);
});
