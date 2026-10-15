import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildProvinceIndex } from '../src/data/geometry.js';
import { featureAreaKm2 } from '../src/map/geo.js';

const load = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const provinces = load('provinces_1936.json');
const archive = load('archive/provinces_deu_1936_lander.json'); // province tedesche originali, solo per confronto
const gaue = { type: 'FeatureCollection', features: provinces.features.filter((f) => f.properties.owner === 'DEU') };
const gauIndex = buildProvinceIndex(gaue);

const GAU_NAMES = [
  'Baden', 'Bayerische Ostmark', 'Berlin', 'Düsseldorf', 'Essen', 'Franken', 'Halle-Merseburg', 'Hamburg',
  'Hessen-Nassau', 'Koblenz-Trier', 'Kurhessen', 'Kurmark', 'Köln-Aachen', 'Magdeburg-Anhalt', 'Mainfranken',
  'Mecklenburg-Lübeck', 'München-Oberbayern', 'Niederschlesien', 'Oberschlesien', 'Ost-Hannover', 'Ostpreußen', 'Pommern',
  'Saarpfalz', 'Sachsen', 'Schleswig-Holstein', 'Schwaben', 'Südhannover-Braunschweig', 'Thüringen', 'Weser-Ems',
  'Westfalen-Nord', 'Westfalen-Süd', 'Württemberg-Hohenzollern',
];

test('Germania: 32 Gaue al posto delle province, Schlesien diviso in Nieder- e Oberschlesien, tutti ipotesi', () => {
  assert.equal(gaue.features.length, GAU_NAMES.length);
  assert.deepEqual(gaue.features.map((f) => f.properties.name).sort(), [...GAU_NAMES].sort());
  assert.equal(archive.features.length, 30);
  assert.equal(provinces.features.some((f) => f.properties.id === 'P_DEU_BAVARIA'), false);
  for (const f of gaue.features) {
    assert.equal(f.properties.id, `P_DEU_${f.properties.id.slice(6)}`);
    assert.equal(f.properties.borderQuality, 'hypothesis', f.properties.id);
    assert.ok(f.properties.source && f.properties.license, f.properties.id);
    assert.ok(f.properties.knownIssues.includes('riferimento_mappa_1937'), f.properties.id);
  }
});

// Città note (lon, lat) e Gau a cui appartenevano nel 1936.
const TOWNS = [
  ['Amburgo', 9.99, 53.55, 'P_DEU_HAMBURG'], ['Monaco', 11.58, 48.14, 'P_DEU_MUENCHEN_OBERBAYERN'], ['Colonia', 6.96, 50.94, 'P_DEU_KOELN_AACHEN'],
  ['Düsseldorf', 6.78, 51.23, 'P_DEU_DUESSELDORF'], ['Essen', 7.01, 51.46, 'P_DEU_ESSEN'], ['Stoccarda', 9.18, 48.78, 'P_DEU_WUERTTEMBERG_HOHENZOLLERN'],
  ['Norimberga', 11.08, 49.45, 'P_DEU_FRANKEN'], ['Würzburg', 9.93, 49.79, 'P_DEU_MAINFRANKEN'], ['Ratisbona', 12.1, 49.02, 'P_DEU_BAYERISCHE_OSTMARK'],
  ['Augusta', 10.9, 48.37, 'P_DEU_SCHWABEN'], ['Kassel', 9.5, 51.31, 'P_DEU_KURHESSEN'], ['Francoforte', 8.68, 50.11, 'P_DEU_HESSEN_NASSAU'],
  ['Coblenza', 7.59, 50.36, 'P_DEU_KOBLENZ_TRIER'], ['Treviri', 6.64, 49.75, 'P_DEU_KOBLENZ_TRIER'], ['Saarbrücken', 6.99, 49.24, 'P_DEU_SAARPFALZ'],
  ['Münster', 7.63, 51.96, 'P_DEU_WESTFALEN_NORD'], ['Dortmund', 7.47, 51.51, 'P_DEU_WESTFALEN_SUED'], ['Hannover', 9.74, 52.37, 'P_DEU_SUEDHANNOVER_BRAUNSCHWEIG'],
  ['Braunschweig', 10.52, 52.27, 'P_DEU_SUEDHANNOVER_BRAUNSCHWEIG'], ['Lüneburg', 10.41, 53.25, 'P_DEU_OST_HANNOVER'], ['Oldenburg', 8.21, 53.14, 'P_DEU_WESER_EMS'],
  ['Brema', 8.8, 53.08, 'P_DEU_WESER_EMS'], ['Magdeburgo', 11.63, 52.13, 'P_DEU_MAGDEBURG_ANHALT'], ['Halle', 11.97, 51.48, 'P_DEU_HALLE_MERSEBURG'],
  ['Erfurt', 11.03, 50.98, 'P_DEU_THUERINGEN'], ['Dresda', 13.74, 51.05, 'P_DEU_SACHSEN'], ['Oppeln', 17.92, 50.67, 'P_DEU_OBERSCHLESIEN'], ['Gleiwitz', 18.67, 50.29, 'P_DEU_OBERSCHLESIEN'], ['Breslavia', 17.04, 51.11, 'P_DEU_NIEDERSCHLESIEN'],
  ['Berlino', 13.4, 52.52, 'P_DEU_BERLIN'], ['Königsberg', 20.51, 54.71, 'P_DEU_OSTPREUSSEN'],
  ['Stettino', 14.55, 53.43, 'P_DEU_POMMERN'], ['Schwerin', 11.41, 53.63, 'P_DEU_MECKLENBURG_LUEBECK'], ['Kiel', 10.14, 54.32, 'P_DEU_SCHLESWIG_HOLSTEIN'],
  ['Karlsruhe', 8.4, 49.01, 'P_DEU_BADEN'], ['Potsdam', 13.06, 52.4, 'P_DEU_KURMARK'], ['Francoforte sull\'Oder', 14.55, 52.35, 'P_DEU_KURMARK'],
  ['Lipsia', 12.37, 51.34, 'P_DEU_SACHSEN'], ['Weimar', 11.33, 50.98, 'P_DEU_THUERINGEN'], ['Dessau', 12.24, 51.84, 'P_DEU_MAGDEBURG_ANHALT'],
  ['Passavia', 13.46, 48.57, 'P_DEU_BAYERISCHE_OSTMARK'], ['Friburgo', 7.85, 47.99, 'P_DEU_BADEN'], ['Bayreuth', 11.58, 49.94, 'P_DEU_BAYERISCHE_OSTMARK'],
  ['Aquisgrana', 6.08, 50.78, 'P_DEU_KOELN_AACHEN'], ['Lubecca', 10.69, 53.87, 'P_DEU_MECKLENBURG_LUEBECK'], ['Wiesbaden', 8.24, 50.08, 'P_DEU_HESSEN_NASSAU'],
  ['Darmstadt', 8.65, 49.87, 'P_DEU_HESSEN_NASSAU'], ['Kaiserslautern', 7.77, 49.44, 'P_DEU_SAARPFALZ'],
];

test('Gaue: ogni città nota cade in un solo Gau, quello storico', () => {
  for (const [name, lon, lat, expected] of TOWNS) {
    const hits = gauIndex.provincesAt(lon, lat).map((f) => f.properties.id);
    assert.deepEqual(hits, [expected], name);
  }
});

test('Gaue: coprono lo stesso territorio delle province tedesche originali', () => {
  const was = archive.features.reduce((s, f) => s + featureAreaKm2(f), 0);
  const now = gaue.features.reduce((s, f) => s + featureAreaKm2(f), 0);
  assert.ok(Math.abs(now / was - 1) < 0.005, `rapporto aree ${now / was}`);
  // un punto interno di ogni provincia originale cade in un solo Gau
  const was_index = buildProvinceIndex(archive);
  let probes = 0;
  for (const f of archive.features) {
    const ring = f.geometry.coordinates[0][0];
    const [x, y] = ring[Math.floor(ring.length / 3)];
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    for (const [px, py] of [[cx, cy], [(x + cx) / 2, (y + cy) / 2]]) {
      if (was_index.provincesAt(px, py).length !== 1) continue;
      probes += 1;
      assert.equal(gauIndex.provincesAt(px, py).length, 1, `${f.properties.id} (${px.toFixed(3)}, ${py.toFixed(3)})`);
    }
  }
  assert.ok(probes > 40, `punti provati ${probes}`);
});

const edgeKey = (a, b) => {
  const ka = `${a[0]},${a[1]}`;
  const kb = `${b[0]},${b[1]}`;
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};
function edgeCounts(collection) {
  const m = new Map();
  collection.features.forEach((f) => {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    polys.forEach((poly) => poly.forEach((ring) => {
      for (let i = 0; i + 1 < ring.length; i += 1) {
        const k = edgeKey(ring[i], ring[i + 1]);
        m.set(k, (m.get(k) ?? new Set()).add(f.properties.id));
      }
    }));
  });
  return m;
}

test('Gaue: i bordi esterni coincidono con quelli delle province originali (tranne gli spigoli suddivisi)', () => {
  const g = edgeCounts(gaue);
  const p = edgeCounts(archive);
  let notOnOldExterior = 0;
  for (const [k, ids] of g) if (ids.size === 1 && !(p.has(k) && p.get(k).size === 1)) notOnOldExterior += 1;
  let missing = 0;
  for (const [k, ids] of p) if (ids.size === 1 && !g.has(k)) missing += 1;
  assert.ok(notOnOldExterior <= 8, `spigoli esterni dei Gaue fuori dal vecchio bordo: ${notOnOldExterior}`);
  assert.ok(missing <= 8, `spigoli esterni delle vecchie province assenti dai Gaue: ${missing}`);
});

test('Gaue: ogni Gau dichiara da quali province originali deriva; la Baviera è divisa in sei Gaue', () => {
  const oldIds = new Set(archive.features.map((f) => f.properties.id));
  for (const f of gaue.features) {
    for (const pid of f.properties.derivedFromProvinces) assert.ok(oldIds.has(pid), `${f.properties.id} → ${pid}`);
    for (const pid of f.properties.derivedPartialProvinces) assert.ok(f.properties.derivedFromProvinces.includes(pid));
  }
  const bavaria = gaue.features.filter((f) => f.properties.derivedFromProvinces.includes('P_DEU_BAVARIA')).map((f) => f.properties.id);
  assert.ok(bavaria.length >= 6, bavaria.join(','));
  const upper = gaue.features.find((f) => f.properties.id === 'P_DEU_OBERSCHLESIEN');
  assert.deepEqual(upper.properties.derivedFromProvinces, ['P_DEU_PROVINCE_OF_UPPER_SILESIA']);
});
