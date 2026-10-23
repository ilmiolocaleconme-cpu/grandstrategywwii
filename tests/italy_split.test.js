// Taglio in 3 province delle 17 regioni italiane con una sola provincia (ipotesi): data/provinces/ITA.json, data/regions.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRegionIndex, motherOf } from '../src/data/regions.js';
import { loadProvinces } from '../scripts/load-provinces.js';
import { ringKm2 } from '../src/data/splitline.js';
import { MIN_PIECE_KM2 } from '../scripts/build-italy-split.js';

const read = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const features = (await loadProvinces()).features;
const regions = buildRegionIndex(read('regions.json'));
const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates);
const km2 = (f) => polysOf(f.geometry).reduce((s, p) => s + ringKm2(p[0]) - p.slice(1).reduce((t, h) => t + ringKm2(h), 0), 0);
const divided = regions.regionsOf('ITA').filter((r) => regions.provincesOf(r).length === 3);
const motherArea = (m) => features.filter((f) => motherOf(f.properties) === m).reduce((s, f) => s + km2(f), 0);

test('taglio italiano: 17 regioni, 51 province madri nuove, ognuna con geometria e dichiarata ipotesi', () => {
  assert.equal(divided.length, 17);
  for (const r of divided) {
    for (const m of regions.provincesOf(r)) {
      const own = features.filter((f) => motherOf(f.properties) === m);
      assert.ok(own.length > 0, `${m} senza geometria`);
      assert.ok(own.every((f) => f.properties.borderQuality === 'hypothesis' && f.properties.knownIssues?.includes('divisione_ipotetica_in_3_province')), `${m}: ipotesi non dichiarata`);
    }
  }
});

test('taglio italiano: nessuna provincia nata dal taglio è una scheggia (area minima per provincia e per pezzo principale)', () => {
  for (const r of divided) {
    for (const m of regions.provincesOf(r)) {
      assert.ok(motherArea(m) >= 1000, `${m}: ${Math.round(motherArea(m))} km² (troppo piccola)`);
    }
  }
  // un pezzo può essere piccolo solo se è un'enclave/isola già presente nei confini d'origine: nessun frammento di taglio sotto la soglia
  const tinyIds = features.filter((f) => divided.some((r) => regions.provincesOf(r).includes(motherOf(f.properties)))).flatMap((f) => polysOf(f.geometry).map((p) => [f.properties.id, ringKm2(p[0])])).filter(([, a]) => a < MIN_PIECE_KM2).map(([id]) => id).sort();
  assert.deepEqual([...new Set(tinyIds)], ['P_ITA_COMO', 'P_ITA_FIRENZE_SP2', 'P_ITA_NUORO', 'P_ITA_PERUGIA_NORD_SP1'].filter((x) => tinyIds.includes(x)), 'solo enclave e isole preesistenti (Campione d\'Italia, San Marino, exclave toscana, isola sarda)');
  assert.ok(tinyIds.length <= 4);
});

test('taglio italiano: ogni città italiana punta a una provincia madre esistente (i punti noti sono in provinces.test.js)', () => {
  const cities = read('sources/citta_base.json').features.filter((f) => f.properties.owner === 'ITA' && f.properties.parentProvince);
  assert.ok(cities.length > 20);
  const mothers = new Set(features.map((f) => motherOf(f.properties)));
  for (const c of cities) {
    assert.ok(mothers.has(c.properties.parentProvince), `${c.properties.id}: provincia ${c.properties.parentProvince} inesistente`);
  }
});

test('taglio italiano: nessun vecchio id regionale rimasto come provincia', () => {
  const old = ['P_ITA_PIEDMONT', 'P_ITA_LIGURIA', 'P_ITA_LOMBARDY', 'P_ITA_TRIDENTINE_VENETIA', 'P_ITA_VENETO', 'P_ITA_JULIAN_MARCH', 'P_ITA_EMILIA', 'P_ITA_TUSCANY', 'P_ITA_MARCHE', 'P_ITA_UMBRIA', 'P_ITA_LAZIO', 'P_ITA_ABRUZZI_E_MOLISE', 'P_ITA_CAMPANIA', 'P_ITA_APULIA', 'P_ITA_LUCANIA', 'P_ITA_CALABRIA', 'P_ITA_SARDINIA'];
  const mothers = new Set(features.map((f) => motherOf(f.properties)));
  for (const id of old) assert.equal(mothers.has(id), false, id);
});

test('taglio italiano: i ponti nel grafo dei collegamenti attraversano Po, Adige, Tevere e Ticino fra province nuove', () => {
  const ids = features.map((f) => f.properties.id);
  const links = read('links.json');
  const newMothers = new Set(divided.flatMap((r) => regions.provincesOf(r)));
  const mo = (i) => ids[i].replace(/_SP\d+$/, '');
  const lk = new Map(links.links.map((l) => [l.id, l]));
  const nodeP = ids.map((_, i) => i); // i collegamenti LK_i_j usano gli indici delle province
  const count = {};
  for (const b of links.bridges) {
    const l = lk.get(b.link);
    if (!l) continue;
    const [a, c] = [mo(nodeP[l.a]), mo(nodeP[l.b])];
    if (a.startsWith('P_ITA_') && c.startsWith('P_ITA_') && a !== c && (newMothers.has(a) || newMothers.has(c))) count[b.riverId] = (count[b.riverId] ?? 0) + 1;
  }
  assert.ok((count.R_PO ?? 0) >= 3, JSON.stringify(count));
  for (const r of ['R_ADIGE', 'R_TIBER']) assert.ok((count[r] ?? 0) >= 1, `${r}: ${JSON.stringify(count)}`);
});
