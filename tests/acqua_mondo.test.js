import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProvinces } from '../scripts/load-provinces.js';
import { buildProvinceIndex } from '../src/data/geometry.js';

// Fiumi e laghi del resto del mondo (scripts/build-water-world.js, Natural Earth 10m): controlli di struttura, non di precisione.
const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const rivers = read('rivers.json');
const geo = read('rivers_geo.json');
const lakes = read('lakes.json');
const isWorld = (x) => /, world$/.test(x.source);
const world = rivers.filter(isWorld);
const byId = new Map(rivers.map((r) => [r.id, r]));
const worldLakes = lakes.features.filter((f) => isWorld(f.properties));

test('mondo: fiumi aggiunti con fonte, licenza, stime dichiarate e lunghezza minima', () => {
  assert.ok(world.length > 500, `${world.length}`);
  for (const r of world) {
    assert.equal(r.license, 'Public Domain (Natural Earth)', r.id);
    assert.equal(r.approximate, true, r.id);
    assert.ok(r.lengthKm >= 20, `${r.id} ${r.lengthKm}`);
    assert.ok(r.scalerank <= 8, r.id);
    assert.ok(r.knownIssues.includes('modern_course_not_1936'), r.id);
  }
  assert.equal(new Set(rivers.map((r) => r.id)).size, rivers.length);
});

test('mondo: confluenze senza cicli, verso fiumi esistenti, classi coerenti', () => {
  for (const r of world) {
    if (r.flowsInto) {
      const t = byId.get(r.flowsInto);
      assert.ok(t, `${r.id} -> ${r.flowsInto}`);
      assert.ok(t.scalerank <= r.scalerank, `${r.id} confluisce in un fiume meno importante`);
      assert.equal(r.class, t.flowsInto ? 'tributary' : 'secondary', r.id);
    } else assert.equal(r.class, 'main', r.id);
  }
  for (const r of rivers) {
    const seen = new Set();
    for (let c = r; c; c = byId.get(c.flowsInto)) {
      assert.ok(!seen.has(c.id), `ciclo da ${r.id}`);
      seen.add(c.id);
    }
  }
});

test('mondo: grandi fiumi e laghi presenti, nessun Caspio, nessun canale', () => {
  for (const id of ['R_MISSISSIPPI', 'R_MISSOURI', 'R_AMAZON', 'R_YANGTZE', 'R_CONGO', 'R_MEKONG', 'R_EUPHRATES', 'R_TIGRIS', 'R_MURRAY']) {
    assert.ok(byId.has(id), id);
  }
  assert.equal(byId.get('R_MISSOURI').flowsInto, 'R_MISSISSIPPI');
  assert.equal(byId.get('R_TIGRIS').flowsInto, 'R_EUPHRATES');
  assert.equal(byId.get('R_MISSISSIPPI').navigable, true);
  for (const id of ['L_SUPERIOR', 'L_TANGANYIKA', 'L_MALAWI']) assert.ok(lakes.features.some((f) => f.properties.id === id), id);
  assert.equal(world.some((r) => /canal|kanal/i.test(r.name)), false);
  assert.equal(worldLakes.some((f) => /caspian/i.test(f.properties.name ?? '')), false);
});

test('mondo: laghi con fonte, licenza, soglia di area e nessun doppione di wikidata', () => {
  assert.ok(worldLakes.length > 1000);
  const wd = new Map();
  for (const f of lakes.features) {
    const w = f.properties.wikidata;
    if (w && !isWorld(f.properties)) wd.set(w, true);
  }
  const seen = new Set();
  for (const f of worldLakes) {
    const p = f.properties;
    assert.equal(p.license, 'Public Domain (Natural Earth)', p.id);
    assert.equal(p.approximate, true, p.id);
    assert.ok(p.areaKm2 >= (p.name ? 40 : 100) - 1, `${p.id} ${p.areaKm2}`);
    if (p.wikidata) {
      assert.ok(!wd.has(p.wikidata), `${p.id} gia presente fuori dal mondo`);
      assert.ok(!seen.has(p.wikidata), `${p.id} wikidata ripetuto`);
      seen.add(p.wikidata);
    }
  }
});

test('mondo: i tratti dei fiumi del mondo stanno sul territorio delle province (margine 0,05°)', async () => {
  const index = buildProvinceIndex(await loadProvinces());
  const ids = new Set(world.map((r) => r.id));
  let n = 0;
  let out = 0;
  for (const f of geo.features) {
    if (!ids.has(f.properties.riverId)) continue;
    const c = f.geometry.coordinates;
    for (const [x, y] of [c[0], c[c.length >> 1], c[c.length - 1]]) {
      n++;
      const near = [[0, 0], [0.05, 0], [-0.05, 0], [0, 0.05], [0, -0.05]].some(([dx, dy]) => index.provincesAt(x + dx, y + dy).length > 0);
      if (!near) out++;
    }
  }
  assert.ok(n > 1000);
  assert.ok(out / n < 0.02, `${out}/${n} fuori territorio`);
});
