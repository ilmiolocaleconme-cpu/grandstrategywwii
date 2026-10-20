import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCatalog } from '../src/data/validate.js';
import { buildProvinceIndex } from '../src/data/geometry.js';
import { loadProvinces } from '../scripts/load-provinces.js';
import { riverRankLimit, riverTier } from '../src/map/geo.js';

// Fiumi dell'URSS: Natural Earth 10m (v5.2.0-pre), ritagliati sulle 177 unità sovietiche con margine 0,04 gradi.
const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const provinces = await loadProvinces();
const index = buildProvinceIndex(provinces);
const rivers = read('rivers.json');
const geo = read('rivers_geo.json');
const byId = new Map(rivers.map((r) => [r.id, r]));
const added = rivers.filter((r) => /v5\.2\.0-pre/.test(r.source));

test('fiumi URSS: 211 fiumi nuovi, fonte e licenza, stime dichiarate, lunghezza minima 25 km', () => {
  assert.equal(added.length, 211);
  assert.equal(new Set(rivers.map((r) => r.id)).size, rivers.length);
  for (const r of added) {
    assert.equal(r.license, 'Public Domain (Natural Earth)', r.id);
    assert.equal(r.approximate, true, r.id);
    assert.equal(r.widthBasis, 'proxy_from_natural_earth_scalerank', r.id);
    assert.ok(r.knownIssues.includes('modern_course_not_1936') && r.knownIssues.includes('clipped_to_territory'), r.id);
    assert.ok(r.lengthKm >= 25, `${r.id} ${r.lengthKm}`);
  }
  const v = validateCatalog({ nations: read('nations.json'), resources: read('resources.json'), rivers, crossings: read('crossings.json'), political: read('political_1936.json'), provinces, riversGeo: geo, lakes: read('lakes.json') });
  assert.equal(v.ok, true, v.errors.join('|'));
});

test('fiumi URSS: grandi fiumi presenti, con lunghezza plausibile (55-105% del valore reale: linea generalizzata e ritagliata, non una misura)', () => {
  const real = { R_VOLGA: 3530, R_LENA: 4400, R_OB: 3650, R_IRTYSH: 4248, R_YENISEY: 3487, R_AMUR: 2824, R_DNIEPER: 2201, R_DON: 1870, R_URAL: 2428, R_KAMA: 1805, R_PECHORA: 1809 };
  for (const [id, km] of Object.entries(real)) {
    const r = byId.get(id);
    assert.ok(r, id);
    assert.ok(r.lengthKm >= km * 0.55 && r.lengthKm <= km * 1.05, `${id} ${r.lengthKm} vs ${km}`);
  }
});

test('fiumi URSS: confluenze note (derivate dalla geometria) e classi coerenti', () => {
  const into = { R_KAMA: 'R_VOLGA', R_OKA: 'R_VOLGA', R_ANGARA: 'R_YENISEY', R_ALDAN: 'R_LENA', R_VILYUY: 'R_LENA', R_ISHIM: 'R_IRTYSH' };
  for (const [a, b] of Object.entries(into)) assert.equal(byId.get(a)?.flowsInto, b, a);
  for (const id of ['R_VOLGA', 'R_DNIEPER', 'R_LENA', 'R_OB', 'R_DON', 'R_URAL']) assert.equal(byId.get(id).class, 'main', id);
  assert.equal(byId.get('R_KAMA').class, 'secondary');
  // due fiumi omonimi: l'Oka europeo tiene l'id semplice, quello siberiano (affluente dell'Angara) e distinto
  assert.equal(byId.get('R_OKA_ANGARA').flowsInto, 'R_ANGARA');
  // limite noto: Pripyat → Dnieper non e rilevata (estremi a contatto, lago/serbatoio)
  assert.equal(byId.get('R_PRYPIAT').flowsInto, null);
  // le confluenze non sono complete: molti fiumi sbocciano in mari o laghi assenti, o non sono rilevati
  assert.ok(added.filter((r) => r.flowsInto).length < added.length);
});

test('fiumi URSS: navigabilita solo da elenco curato non verificato', () => {
  const nav = added.filter((r) => r.navigable).map((r) => r.name).sort();
  assert.deepEqual(nav, ['Amur', 'Dnieper', 'Don', 'Irtysh', 'Kama', 'Lena', 'Neva', 'Northern Dvina', 'Ob', 'Oka', 'Volga', 'Yenisey']);
  for (const r of added.filter((x) => x.navigable)) assert.equal(r.navigableBasis, 'curated_unverified', r.id);
});

test('fiumi URSS: ogni vertice dei tratti nuovi sta nelle province sovietiche o entro ~0,05 gradi', () => {
  const ids = new Set(added.map((r) => r.id));
  const probes = [[0, 0], [0.05, 0], [-0.05, 0], [0, 0.05], [0, -0.05], [0.035, 0.035], [-0.035, 0.035], [0.035, -0.035], [-0.035, -0.035]];
  let outside = 0;
  let n = 0;
  for (const f of geo.features) {
    if (!ids.has(f.properties.riverId)) continue;
    assert.equal(f.geometry.type, 'LineString');
    const c = f.geometry.coordinates;
    for (let i = 0; i < c.length; i += 1) {
      n += 1;
      assert.ok(Math.abs(c[i][0]) <= 180, f.properties.riverId);
      if (i > 0) assert.ok(Math.abs(c[i][0] - c[i - 1][0]) < 180, `${f.properties.riverId}: salto sull'antimeridiano`);
      if (!probes.some(([dx, dy]) => index.provincesAt(c[i][0] + dx, c[i][1] + dy).some((p) => p.properties.owner === 'USSR'))) outside += 1;
    }
  }
  assert.ok(n > 20000, `punti ${n}`);
  // fiumi di confine (Panj, Kura): la linea 1:10 milioni e il confine semplificato possono distare piu del margine
  assert.ok(outside <= 5, `vertici fuori dal territorio: ${outside}`);
});

test('mappa: i fiumi compaiono per livelli di zoom (grandi, poi principali e secondari, poi tutti)', () => {
  assert.equal(riverRankLimit(1), 0);
  assert.equal(riverRankLimit(2.5), 1);
  assert.equal(riverRankLimit(4), 2);
  const total = rivers.length;
  const rank = new Map(rivers.map((r) => [r.id, riverTier(r)]));
  const visible = (k) => geo.features.filter((f) => rank.get(f.properties.riverId) <= riverRankLimit(k)).length;
  // a zoom 1 solo i grandi (main con scalerank <= 5), a zoom 2,5 anche gli altri principali e i secondari, a zoom 4 tutti
  const grandi = new Map(rivers.map((r) => [r.id, r.class === 'main' && (r.scalerank ?? 99) <= 5]));
  assert.equal(visible(1), geo.features.filter((f) => grandi.get(f.properties.riverId)).length);
  assert.ok(visible(1) < visible(2.5) && visible(2.5) < visible(4) && visible(4) === geo.features.length);
  assert.ok(total > 500);
});
