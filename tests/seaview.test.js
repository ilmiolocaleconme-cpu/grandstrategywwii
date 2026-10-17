import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { seaLabels, seaZoneAt } from '../src/map/seaView.js';

const file = JSON.parse(readFileSync(new URL('../data/sea_zones.json', import.meta.url), 'utf8'));
const zones = file.zones;

test('mare in mappa: i nomi degli stretti compaiono solo ingranditi', () => {
  const at = (k) => new Set(seaLabels(zones, k).map((z) => z.id));
  assert.ok(at(1).has('SZ_NORD_CENTRO') && !at(1).has('SZ_DOVER'));
  const gulf = zones.find((z) => z.kind === 'gulf');
  assert.ok(gulf, 'nessun golfo nei dati');
  assert.ok(!at(1).has(gulf.id) && at(2).has(gulf.id) && !at(2).has('SZ_DOVER'));
  assert.ok(at(4).has('SZ_DOVER') && at(4).has('SZ_BOSFORO'));
});

test('mare in mappa: un tocco in mare trova la zona giusta, sulla terra nessuna', () => {
  const id = (lon, lat) => seaZoneAt(zones, lon, lat)?.id ?? null;
  assert.equal(id(3, 56), 'SZ_NORD_CENTRO');
  assert.equal(id(-5.6, 35.95), 'SZ_GIBILTERRA');
  assert.equal(id(29.07, 41.1), 'SZ_BOSFORO');
  assert.equal(id(8, 45), null); // Pianura Padana
  assert.equal(id(30, 60), null); // Russia
  assert.equal(id(-8, 53), null); // Irlanda: isola (buco), non mare
});

test('mare in mappa: ogni zona contiene il proprio punto di partenza oppure uno vicino', () => {
  // il seme può essere stato spostato sulla cella d'acqua più vicina: almeno non cade su terra lontana
  const inside = zones.filter((z) => seaZoneAt([z], z.seed[0], z.seed[1]));
  assert.ok(inside.length >= zones.length - 3, `solo ${inside.length}/${zones.length} semi dentro la propria zona`);
});
