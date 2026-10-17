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

const overlap = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
const rectOf = ({ x, y, w, h }) => [x - w / 2, y - h / 2, x + w / 2, y + h / 2];
// vista a zoom basso: tutte le zone in 400x400 px con la longitudine come ascissa
const toScreen = (z) => [(z.seed[0] + 32) * 5, (73 - z.seed[1]) * 8];

test('mare in mappa: i nomi non si sovrappongono e gli oceani hanno la precedenza', async () => {
  const { declutterSea } = await import('../src/map/seaView.js');
  const kept = declutterSea(zones, toScreen, { w: 400, h: 400 });
  assert.ok(kept.length > 0 && kept.length < zones.length);
  const rs = kept.map(rectOf);
  for (let i = 0; i < rs.length; i += 1) for (let j = i + 1; j < rs.length; j += 1) {
    assert.ok(!overlap(rs[i], rs[j]), `${kept[i].z.id} e ${kept[j].z.id} si sovrappongono`);
  }
  assert.equal(kept[0].z.kind, 'ocean');
});

test('mare in mappa: i nomi lunghi vanno a capo (max 3 righe) senza perdere parole', async () => {
  const { seaLabelLines } = await import('../src/map/seaView.js');
  for (const z of zones) {
    const lines = seaLabelLines(z.name);
    assert.ok(lines.length >= 1 && lines.length <= 3, `${z.id}: ${lines.length} righe`);
    assert.equal(lines.join(' '), z.name.split(/\s+/).join(' '), `${z.id}: parole perse o cambiate`);
    if (z.name.length <= 16) assert.equal(lines.length, 1, `${z.id}: nome corto spezzato`);
  }
  const lunga = seaLabelLines('Atlantico settentrionale (a nord-ovest della Scozia)');
  assert.ok(Math.max(...lunga.map((l) => l.length)) <= 26, 'la riga più lunga resta troppo larga');
});

test('mare in mappa: nessun nome esce dalla vista né finisce sotto i pulsanti', async () => {
  const { declutterSea } = await import('../src/map/seaView.js');
  const view = { w: 360, h: 420, reserved: [[0, 0, 260, 50], [0, 380, 100, 420]] };
  // spostamenti diversi della mappa: prova bordi sinistro, destro, alto, basso
  for (const [ox, oy] of [[0, 0], [-60, 0], [90, 20], [0, -40], [30, 60]]) {
    const kept = declutterSea(zones, (z) => { const [x, y] = toScreen(z); return [x * 0.9 + ox, y * 0.9 + oy]; }, view);
    for (const k of kept) {
      const r = rectOf(k);
      assert.ok(r[0] >= 0 && r[1] >= 0 && r[2] <= view.w && r[3] <= view.h, `${k.z.id} esce dalla vista (${r.map(Math.round)})`);
      for (const q of view.reserved) assert.ok(!overlap(r, q), `${k.z.id} sotto un pulsante`);
    }
  }
});

test('mare in mappa: un nome troppo vicino al bordo si sposta di poco, uno lontano si scarta', async () => {
  const { declutterSea, seaLabelBox } = await import('../src/map/seaView.js');
  const z = zones.find((q) => q.id === 'SZ_MARE_IRLANDA');
  const { w } = seaLabelBox(z);
  const view = { w: 360, h: 400 };
  const vicino = declutterSea([z], () => [w / 2 - 10, 200], view);
  assert.equal(vicino.length, 1);
  assert.ok(vicino[0].x - w / 2 >= 0, 'non è rientrato nel bordo');
  const lontano = declutterSea([z], () => [-w, 200], view);
  assert.equal(lontano.length, 0);
});

test('mare in mappa: con fromScreen i nomi restano sull\'acqua della zona, mai su un\'isola', async () => {
  const { declutterSea } = await import('../src/map/seaView.js');
  const { seaZoneAt } = await import('../src/map/seaView.js');
  const fromScreen = (z, x, y) => [x / 5 - 32, 73 - y / 8];
  const kept = declutterSea(zones, toScreen, { w: 400, h: 400, fromScreen });
  assert.ok(kept.length > 0, 'nessun nome visibile');
  for (const k of kept) {
    const [lon, lat] = fromScreen(k.z, k.x, k.y);
    assert.equal(seaZoneAt([k.z], lon, lat)?.id, k.z.id, `${k.z.id}: il centro del nome non è in acqua`);
  }
});
