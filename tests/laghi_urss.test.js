import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCatalog } from '../src/data/validate.js';
import { buildProvinceIndex } from '../src/data/geometry.js';
import { loadProvinces } from '../scripts/load-provinces.js';

// Laghi dell'URSS: Natural Earth 10m lakes + lakes_europe (v5.2.0-pre). Soglie larghe: il poligono non e il lago reale.
const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const lakes = read('lakes.json');
const provinces = await loadProvinces();
const index = buildProvinceIndex(provinces);
const added = lakes.features.filter((f) => /v5\.2\.0-pre/.test(f.properties.source));
const byName = new Map(added.filter((f) => f.properties.name).map((f) => [f.properties.name, f]));

const inRing = (x, y, r) => {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const inLake = (f, x, y) => f.geometry.coordinates.some((poly) => poly.reduce((n, r) => n + (inRing(x, y, r) ? 1 : 0), 0) % 2 === 1);

test('laghi URSS: 435 laghi, catalogo valido, id unici, fonte e licenza', () => {
  assert.equal(added.length, 435);
  assert.equal(new Set(lakes.features.map((f) => f.properties.id)).size, lakes.features.length);
  const v = validateCatalog({ nations: read('nations.json'), resources: read('resources.json'), rivers: read('rivers.json'), crossings: read('crossings.json'), political: read('political_1936.json'), provinces, riversGeo: read('rivers_geo.json'), lakes });
  assert.equal(v.ok, true, v.errors.join('|'));
  for (const f of added) {
    const p = f.properties;
    assert.equal(p.license, 'Public Domain (Natural Earth)', p.id);
    assert.equal(p.approximate, true, p.id);
    assert.ok(p.areaKm2 >= 8, `${p.id} ${p.areaKm2}`);
    assert.ok(p.areaKm2 >= 25 || p.name, `${p.id}: sotto soglia senza nome`);
  }
  // nessun lago nuovo ripete un wikidata gia presente
  const old = new Set(lakes.features.filter((f) => !/v5\.2\.0-pre/.test(f.properties.source)).map((f) => f.properties.wikidata).filter(Boolean));
  for (const f of added) assert.equal(old.has(f.properties.wikidata), false, `${f.properties.id} gia presente`);
});

test('laghi URSS: grandi laghi presenti con area plausibile (60-110%) e punto interno al lago', () => {
  const cases = [['Baikal', 31722, 108, 53.5], ['Ladoga', 17700, 31.5, 60.8], ['Balkhash', 16400, 74.5, 46.5], ['Onega', 9720, 35.5, 61.8], ['Issyk-Kul', 6236, 77.3, 42.45]];
  for (const [name, km2, lon, lat] of cases) {
    const f = byName.get(name);
    assert.ok(f, name);
    assert.ok(f.properties.areaKm2 >= km2 * 0.6 && f.properties.areaKm2 <= km2 * 1.10, `${name} ${f.properties.areaKm2} vs ${km2}`);
    assert.equal(inLake(f, lon, lat), true, `${name}: punto interno`);
  }
});

test('laghi URSS: bacini artificiali segnati, Caspio e saline effimere escluse', () => {
  const res = added.filter((f) => f.properties.knownIssues?.includes('reservoir_may_postdate_1936')).map((f) => f.properties.name);
  assert.ok(res.length >= 30, `bacini: ${res.length}`);
  for (const n of ['Kuybyshev', 'Rybinsk', 'Bratsk']) assert.ok(res.includes(n), n);
  assert.equal(byName.has('Baikal') && byName.get('Baikal').properties.knownIssues, undefined);
  assert.equal([...lakes.features].some((f) => /caspian/i.test(f.properties.name) && !/swamp/i.test(f.properties.name)), false, 'Mar Caspio non incluso');
  assert.equal(added.some((f) => /swamp/i.test(f.properties.name)), false);
  // nessun lago effimero senza nome nella bassa del Caspio settentrionale (49-59 E, 43-48,5 N)
  const bassa = added.filter((f) => !f.properties.name).filter((f) => {
    const r = f.geometry.coordinates[0][0];
    const cx = r.reduce((s, p) => s + p[0], 0) / r.length;
    const cy = r.reduce((s, p) => s + p[1], 0) / r.length;
    return cx >= 49 && cx <= 59 && cy >= 43 && cy <= 48.5;
  });
  assert.equal(bassa.length, 0);
});

test('laghi URSS: ogni lago ha vertici nelle province sovietiche o entro ~0,05 gradi (almeno meta)', () => {
  const probes = [[0, 0], [0.05, 0], [-0.05, 0], [0, 0.05], [0, -0.05], [0.035, 0.035], [-0.035, 0.035], [0.035, -0.035], [-0.035, -0.035]];
  const bad = [];
  for (const f of added) {
    const ring = f.geometry.coordinates[0][0];
    const step = Math.max(1, Math.floor(ring.length / 60));
    let n = 0;
    let ok = 0;
    for (let i = 0; i < ring.length; i += step) {
      n += 1;
      if (probes.some(([dx, dy]) => index.provincesAt(ring[i][0] + dx, ring[i][1] + dy).some((p) => p.properties.owner === 'USSR'))) ok += 1;
    }
    // il criterio di selezione e sul poligono piu grande: i laghi in piu parti possono avere la parte principale altrove
    if (ok / n < 0.3 && f.geometry.coordinates.length === 1) bad.push(`${f.properties.id} ${ok}/${n}`);
  }
  assert.deepEqual(bad, []);
});
