// Le zone urbane come destinazioni di movimento: entrano nella rete con i loro collegamenti e seguono il controllo della madre.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProvinces } from '../scripts/load-provinces.js';
import { buildMoveNet } from '../src/data/moveNet.js';
import { findPath, issueMove, createMovementState } from '../src/rules/movement.js';
import { provinceController, canEnterWar } from '../src/game/warCommon.js';

const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const collection = await loadProvinces();
const cities = read('citta_grandi.json').features;
const cityLinks = read('city_links.json');
const net = buildMoveNet(collection, read('adjacency.json'), { cities, cityLinks });
const TIRANA = 'P_ALB_TIRANA_CITTA';
const MADRE = 'P_ALB_TIRANE';

test('una zona urbana è un nodo della rete, con la sua madre come vicina e viceversa', () => {
  assert.equal(net.has(TIRANA), true);
  assert.equal(net.isCity(TIRANA), true);
  assert.equal(net.parentOf(TIRANA), MADRE);
  assert.ok(net.neighbors(TIRANA).includes(MADRE));
  assert.ok(net.neighbors(MADRE).includes(TIRANA));
  assert.equal(net.isCity(MADRE), false);
  assert.equal(net.parentOf(MADRE), null);
});

test('ogni zona urbana ha un nodo e un proprietario, e ogni madre citata esiste nella rete', () => {
  for (const z of cities) {
    assert.ok(net.has(z.properties.id), `${z.properties.id} non è un nodo`);
    assert.equal(net.owner(z.properties.id), z.properties.owner);
    if (z.properties.parentProvince) assert.ok(net.has(z.properties.parentProvince), `madre ${z.properties.parentProvince} assente`);
  }
});

test('un ordine di marcia può finire in una città: la truppa entra nella zona e non nella sola madre', () => {
  const from = net.neighbors(MADRE).find((n) => !net.isCity(n));
  const path = findPath(net, from, TIRANA, () => true);
  assert.ok(path, 'nessun percorso verso la città');
  assert.equal(path.at(-1), TIRANA);
  const r = issueMove(createMovementState(), { id: 'U1', category: 'infantry' }, TIRANA, { initial: new Map([['U1', from]]), net, canEnter: () => true });
  assert.equal(r.ok, true);
  assert.equal(r.path.at(-1), TIRANA);
});

test('il controllo della città segue la madre finché la città non ne ha uno proprio', () => {
  const state = { provinces: { [MADRE]: { controller: 'ITA' } }, control: {} };
  assert.equal(provinceController(state, net, TIRANA), 'ITA');
  const own = { provinces: { [MADRE]: { controller: 'ITA' }, [TIRANA]: { controller: 'ALB' } }, control: {} };
  assert.equal(provinceController(own, net, TIRANA), 'ALB');
  const war = { provinces: { [MADRE]: { controller: 'ITA' } }, control: {}, war: { wars: [] }, diplomacy: {} };
  assert.equal(canEnterWar(war, net, 'ITA')(TIRANA), true);
});

test('senza zone urbane la rete resta quella delle sole province', () => {
  const plain = buildMoveNet(collection, read('adjacency.json'));
  assert.equal(plain.has(TIRANA), false);
  assert.equal(net.provinces().length, plain.provinces().length + cities.length);
});
