// Terreno e fortificazioni nella difesa (11/2026): regole pure, dati reali e integrazione con il sistema di teatro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateDefenseModifiers, defenseMultiplier, createDefenseMultiplier } from '../src/rules/defenseModifiers.js';
import { resolveBattleDay } from '../src/rules/combat.js';
import { createTheaterSystem, playerAssign, playerDeclareWar } from '../src/game/theaterState.js';
import { createMovementSystem } from '../src/game/movementState.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const cfg = read('combat/defense_modifiers.json');
const terrainClass = read('combat/terrain_class.json');
const presence = read('military/province_presence.json');

test('dati: valido, e il validatore rifiuta numeri fuori scala, livelli decrescenti e classi sconosciute', () => {
  assert.deepEqual(validateDefenseModifiers(cfg), []);
  assert.equal(cfg.basis, 'ipotesi');
  const bad = (patch) => validateDefenseModifiers({ ...cfg, ...patch }).join();
  assert.match(bad({ terrain: { ...cfg.terrain, montagna: 0.5 } }), /montagna/);
  assert.match(bad({ terrain: { ...cfg.terrain, ghiaccio: 1.2 } }), /sconosciuto/);
  assert.match(bad({ fortification: { ...cfg.fortification, 3: 1.1 } }), /diminuire/);
  assert.match(bad({ cap: 0 }), /tetto/);
  assert.match(bad({ basis: 'certo' }), /basis/);
  assert.match(validateDefenseModifiers({ schema: 'x' }).join(), /schema/);
});

test('moltiplicatore: prodotto con tetto; terreno o livello sconosciuto = 1 (mai inventato)', () => {
  assert.equal(defenseMultiplier(cfg, { terrain: 'pianura', fortification: 0 }), 1);
  assert.equal(defenseMultiplier(cfg, { terrain: 'montagna', fortification: 0 }), 1.4);
  assert.ok(Math.abs(defenseMultiplier(cfg, { terrain: 'collina', fortification: 3 }) - 1.15 * 1.6) < 1e-9);
  assert.ok(Math.abs(defenseMultiplier(cfg, { terrain: 'montagna', fortification: 3 }) - 2.24) < 1e-9, 'montagna + livello 3 resta sotto il tetto attuale');
  assert.equal(defenseMultiplier({ ...cfg, cap: 2 }, { terrain: 'montagna', fortification: 3 }), 2, 'il tetto limita il prodotto');
  assert.equal(defenseMultiplier(cfg, {}), 1);
  assert.equal(defenseMultiplier(cfg, { terrain: 'luna', fortification: 9 }), 1);
});

test('dati reali: il file delle classi coincide con terrain.json; le 4 province della Maginot sono a livello 3 e pesano più del solo terreno', () => {
  const t = read('terrain.json').province;
  assert.equal(Object.keys(terrainClass.classes).length, Object.keys(t).length);
  for (const [id, p] of Object.entries(t)) assert.equal(terrainClass.classes[id], p.terreno, id);
  const mult = createDefenseMultiplier({ cfg, terrainOf: (id) => terrainClass.classes[id] ?? null, fortificationOf: (id) => presence.byProvince[id]?.fortifications ?? null });
  for (const id of Object.keys(presence.byProvince)) {
    assert.ok(terrainClass.classes[id], id);
    assert.equal(mult(id), defenseMultiplier(cfg, { terrain: terrainClass.classes[id], fortification: 3 }));
    assert.ok(mult(id) >= 1.6, `${id}: almeno la fortificazione di livello 3`);
  }
  assert.equal(mult('P_NON_ESISTE'), 1);
});

test('le zone urbane valgono 1 (hanno regole proprie); la provincia divisa in sponde usa la madre', () => {
  const mult = createDefenseMultiplier({ cfg, terrainOf: (id) => ({ P_M: 'montagna' })[id] ?? null, fortificationOf: () => null, isCity: (id) => id === 'CITTA', motherOf: (id) => (id === 'P_M_SP1' ? 'P_M' : id) });
  assert.equal(mult('CITTA'), 1);
  assert.equal(mult('P_M'), 1.4);
  assert.equal(mult('P_M_SP1'), 1.4);
  assert.equal(mult('P_ALTRA'), 1);
});

test('battaglia: stesso attacco, più terreno e fortificazioni = meno perdite per il difensore e più per l\'attaccante; deterministico', () => {
  const A = [{ id: 'a', category: 'infantry', effective: 10000, planned: 10000 }];
  const D = [{ id: 'd', category: 'infantry', effective: 8000, planned: 10000 }];
  const flat = resolveBattleDay({ attackers: A, defenders: D, defenseMultiplier: 1 });
  const maginot = resolveBattleDay({ attackers: A, defenders: D, defenseMultiplier: defenseMultiplier(cfg, { terrain: 'collina', fortification: 3 }) });
  assert.ok(maginot.defenderLoss.d < flat.defenderLoss.d);
  assert.ok(maginot.attackerLoss.a > flat.attackerLoss.a);
  assert.deepEqual(resolveBattleDay({ attackers: A, defenders: D, defenseMultiplier: 1.84 }), resolveBattleDay({ attackers: A, defenders: D, defenseMultiplier: 1.84 }));
});

test('integrazione: nel sistema di teatro la provincia fortificata costa più cara all\'attaccante di una uguale senza fortificazioni', () => {
  const OWNERS = { A: 'GER', B: 'FRA' };
  const net = { has: (m) => m in OWNERS, neighbors: (m) => (m === 'A' ? ['B'] : ['A']), km: () => 100, owner: (m) => OWNERS[m] ?? null, name: (m) => m, isCity: () => false };
  const UNITS = [{ id: 'G1', name: 'G1', nation: 'GER', category: 'infantry', echelon: 'division' }, { id: 'F1', name: 'F1', nation: 'FRA', category: 'infantry', echelon: 'division' }];
  const unitsById = new Map(UNITS.map((u) => [u.id, u]));
  const div = (n) => ({ templateId: 't', since: '1936-01-01', items: { 'manpower.war': { planned: 10000, effective: n, source: 'template' } } });
  const DEPLOY = { entries: [{ unit: 'G1', province: 'B' }, { unit: 'F1', province: 'B' }] };
  const initial = new Map(DEPLOY.entries.map((e) => [e.unit, e.province]));
  const run = (fort) => {
    const mult = createDefenseMultiplier({ cfg, terrainOf: () => 'pianura', fortificationOf: () => fort, isCity: (id, st, n) => n?.isCity?.(id) === true });
    const ctx = { getNet: () => net, unitsById, deploymentDoc: DEPLOY, initial, defenseMultiplier: mult };
    let s = { schema: 7, startDate: '1936-01-01', date: '1936-01-01', day: 0, player: 'GER', control: { GER: 'GER', FRA: 'FRA' }, difficulty: 'normal', forces: { schema: 'forces-v1', initialized: true, divisions: { G1: div(10000), F1: div(10000) } } };
    s = playerDeclareWar(s, 'FRA');
    s = createTheaterSystem(ctx)(createMovementSystem(net)({ ...s, day: 1 }));
    return s.combat.log[0];
  };
  const open = run(0); const fort = run(3);
  assert.ok(open && fort, 'la battaglia avviene');
  assert.ok(fort.defenderLoss < open.defenderLoss, 'il difensore fortificato perde meno');
  assert.ok(fort.attackerLoss > open.attackerLoss, 'l\'attaccante perde di più');
});
