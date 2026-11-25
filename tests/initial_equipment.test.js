// Riserva iniziale di armi in magazzino (22/11/2026, decisione dell'utente): 14 divisioni per le grandi, 7 medie, 4 piccole.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateInitialEquipmentRules, standardInfantryTemplate, buildInitialEquipment, addInitialEquipment } from '../src/data/initialEquipment.js';
import { initialEquipmentFile } from '../scripts/build-initial-equipment.js';
import { buildNations } from '../src/game/economyState.js';

const j = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const rules = j('industry/initial_equipment_rules.json');
const file = j('industry/initial_equipment.json');
const nationIds = j('nations.json').map((n) => n.id);

test('regole valide: ogni nazione ha una fascia, le fasce concordate valgono 14 / 7 / 4', () => {
  assert.deepEqual(validateInitialEquipmentRules(rules, nationIds), []);
  assert.equal(rules.tiers.large.divisions, 14);
  assert.equal(rules.tiers.medium.divisions, 7);
  assert.equal(rules.tiers.small.divisions, 4);
  for (const id of ['DEU', 'USSR', 'USA', 'GBR', 'FRA', 'ITA', 'JPN']) assert.equal(rules.nations[id], 'large', id);
  assert.deepEqual(validateInitialEquipmentRules({ ...rules, nations: { ...rules.nations, DEU: 'enorme' } }, nationIds), ['DEU: fascia enorme inesistente']);
});

test('il file generato è aggiornato (npm run build:initial-equipment)', async () => {
  assert.deepEqual(await initialEquipmentFile(), file);
});

test('Germania: 14 dotazioni della fanteria 1936, niente carri', () => {
  const deu = file.nations.DEU;
  assert.equal(deu.templateId, 'TPL-DEU-INF-1936');
  assert.equal(deu.equipment['INW-DEU-RIFLE-1939'], 14 * 11870);
  assert.equal(deu.equipment['ART-DEU-GRW36'], 14 * 81);
  assert.ok(Object.keys(deu.equipment).every((k) => !/^TNK-/.test(k)), 'nessun carro');
  assert.ok(file.nations.USSR && file.nations.USA, 'anche URSS e USA (schema unico)');
  assert.equal(file.nations.FRA?.templateId, 'TPL-FRA-INF-1936', 'Francia dai battaglioni dal 25/11/2026');
  assert.ok(file.pending.includes('JPN'), 'il Giappone aspetta la fanteria a battaglioni');
  assert.equal(file.nations.GBR?.templateId, 'TPL-GBR-INF-1936', 'Regno Unito dai battaglioni dal 24/11/2026');
  assert.ok(!file.pending.includes('LUX') && !file.nations.LUX, 'fascia 0: niente riserva e non in attesa');
});

test('fanteria standard: la più recente attiva alla data, solo a battaglioni', () => {
  const t = (id, nation, activeFrom, modules = []) => ({ id, modules, appliesTo: { nation, category: 'infantry', echelon: 'division', activeFrom }, equipment: { X: { value: 2 } } });
  const list = [t('A', 'XXX', '1936-01-01'), t('B', 'XXX', '1939-01-01'), { ...t('C', 'XXX', '1935-01-01'), modules: undefined }];
  assert.equal(standardInfantryTemplate(list, 'XXX', '1936-06-01').id, 'A');
  assert.equal(standardInfantryTemplate(list, 'XXX', '1940-01-01').id, 'B');
  assert.equal(standardInfantryTemplate(list, 'YYY', '1940-01-01'), null);
  const doc = buildInitialEquipment({ tiers: { s: { divisions: 3 } }, nations: { XXX: 's' } }, list, '1936-06-01');
  assert.deepEqual(doc.nations.XXX.equipment, { X: 6 });
});

test('a inizio partita la riserva è nelle scorte (equipment.<id>) e scala con la difficoltà', () => {
  const start = { nationIds, industry: j('industry/initial_industry.json'), stocks: j('industry/initial_stocks.json'), economy: j('economy/economy.json') };
  const political = j('political_1936.json');
  const without = buildNations({ political, ...start, difficulty: 'media' });
  const withEq = buildNations({ political, ...start, equipment: file, difficulty: 'media' });
  assert.equal(without.DEU.stocks['equipment.INW-DEU-RIFLE-1939'] ?? 0, 0);
  assert.equal(withEq.DEU.stocks['equipment.INW-DEU-RIFLE-1939'], 14 * 11870);
  assert.equal(withEq.USSR.stocks['equipment.INW-USSR-RIFLE-1939'], file.nations.USSR.equipment['INW-USSR-RIFLE-1939']);
  assert.deepEqual(withEq.JPN.stocks, without.JPN.stocks, 'chi non ha la fanteria a battaglioni non cambia');
  assert.deepEqual(addInitialEquipment({}, file), {}, 'nazioni assenti ignorate');
});
