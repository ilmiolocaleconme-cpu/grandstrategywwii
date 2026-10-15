import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildProvinceIndex } from '../src/data/geometry.js';
import { featureAreaKm2 } from '../src/map/geo.js';
import { validateCatalog } from '../src/data/validate.js';

const load = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const gaue = load('gaue_1936.json');
const provinces = load('provinces_1936.json');
const political = load('political_1936.json');
const gauIndex = buildProvinceIndex(gaue);

const GAU_NAMES = [
  'Baden', 'Bayerische Ostmark', 'Berlin', 'Danzig', 'Düsseldorf', 'Essen', 'Franken', 'Halle-Merseburg', 'Hamburg',
  'Hessen-Nassau', 'Koblenz-Trier', 'Kurhessen', 'Kurmark', 'Köln-Aachen', 'Magdeburg-Anhalt', 'Mainfranken',
  'Mecklenburg-Lübeck', 'München-Oberbayern', 'Ost-Hannover', 'Ostpreußen', 'Pommern', 'Saarpfalz', 'Sachsen', 'Schlesien',
  'Schleswig-Holstein', 'Schwaben', 'Südhannover-Braunschweig', 'Thüringen', 'Weser-Ems', 'Westfalen-Nord', 'Westfalen-Süd',
  'Württemberg-Hohenzollern',
];

test('Gaue: 31 del Reich più Danzica, id unici, tutti dichiarati ipotesi con fonte e licenza', () => {
  assert.equal(gaue.features.length, GAU_NAMES.length + 0);
  assert.deepEqual(gaue.features.map((f) => f.properties.name).sort(), [...GAU_NAMES].sort());
  assert.equal(new Set(gaue.features.map((f) => f.properties.id)).size, gaue.features.length);
  for (const f of gaue.features) {
    assert.equal(f.properties.borderQuality, 'hypothesis', f.properties.id);
    assert.ok(f.properties.source && f.properties.license, f.properties.id);
    assert.ok(f.properties.knownIssues.includes('riferimento_mappa_1937'), f.properties.id);
  }
});

test('Gaue: il validatore del catalogo li accetta e rifiuta una provincia inesistente', () => {
  const base = { nations: [], resources: [], rivers: [], crossings: [], political, provinces, gaue };
  const ok = validateCatalog({ ...base, nations: load('nations.json'), resources: load('resources.json') });
  assert.deepEqual(ok.errors.filter((e) => e.startsWith('gaue')), []);
  const broken = structuredClone(gaue);
  broken.features[0].properties.provinceIds = ['P_INESISTENTE'];
  const bad = validateCatalog({ ...base, nations: load('nations.json'), resources: load('resources.json'), gaue: broken });
  assert.ok(bad.errors.some((e) => e.includes('P_INESISTENTE')));
});

// Città note (lon, lat) e Gau a cui appartenevano nel 1936.
const TOWNS = [
  ['Amburgo', 9.99, 53.55, 'G_HAMBURG'], ['Monaco', 11.58, 48.14, 'G_MUENCHEN_OBERBAYERN'], ['Colonia', 6.96, 50.94, 'G_KOELN_AACHEN'],
  ['Düsseldorf', 6.78, 51.23, 'G_DUESSELDORF'], ['Essen', 7.01, 51.46, 'G_ESSEN'], ['Stoccarda', 9.18, 48.78, 'G_WUERTTEMBERG_HOHENZOLLERN'],
  ['Norimberga', 11.08, 49.45, 'G_FRANKEN'], ['Würzburg', 9.93, 49.79, 'G_MAINFRANKEN'], ['Ratisbona', 12.1, 49.02, 'G_BAYERISCHE_OSTMARK'],
  ['Augusta', 10.9, 48.37, 'G_SCHWABEN'], ['Kassel', 9.5, 51.31, 'G_KURHESSEN'], ['Francoforte', 8.68, 50.11, 'G_HESSEN_NASSAU'],
  ['Coblenza', 7.59, 50.36, 'G_KOBLENZ_TRIER'], ['Treviri', 6.64, 49.75, 'G_KOBLENZ_TRIER'], ['Saarbrücken', 6.99, 49.24, 'G_SAARPFALZ'],
  ['Münster', 7.63, 51.96, 'G_WESTFALEN_NORD'], ['Dortmund', 7.47, 51.51, 'G_WESTFALEN_SUED'], ['Hannover', 9.74, 52.37, 'G_SUEDHANNOVER_BRAUNSCHWEIG'],
  ['Braunschweig', 10.52, 52.27, 'G_SUEDHANNOVER_BRAUNSCHWEIG'], ['Lüneburg', 10.41, 53.25, 'G_OST_HANNOVER'], ['Oldenburg', 8.21, 53.14, 'G_WESER_EMS'],
  ['Brema', 8.8, 53.08, 'G_WESER_EMS'], ['Magdeburgo', 11.63, 52.13, 'G_MAGDEBURG_ANHALT'], ['Halle', 11.97, 51.48, 'G_HALLE_MERSEBURG'],
  ['Erfurt', 11.03, 50.98, 'G_THUERINGEN'], ['Dresda', 13.74, 51.05, 'G_SACHSEN'], ['Breslavia', 17.04, 51.11, 'G_SCHLESIEN'],
  ['Berlino', 13.4, 52.52, 'G_BERLIN'], ['Königsberg', 20.51, 54.71, 'G_OSTPREUSSEN'], ['Danzica', 18.65, 54.35, 'G_DANZIG'],
  ['Stettino', 14.55, 53.43, 'G_POMMERN'], ['Schwerin', 11.41, 53.63, 'G_MECKLENBURG_LUEBECK'], ['Kiel', 10.14, 54.32, 'G_SCHLESWIG_HOLSTEIN'],
  ['Karlsruhe', 8.4, 49.01, 'G_BADEN'], ['Potsdam', 13.06, 52.4, 'G_KURMARK'], ['Francoforte sull\'Oder', 14.55, 52.35, 'G_KURMARK'],
  ['Lipsia', 12.37, 51.34, 'G_SACHSEN'], ['Weimar', 11.33, 50.98, 'G_THUERINGEN'], ['Dessau', 12.24, 51.84, 'G_MAGDEBURG_ANHALT'],
  ['Passavia', 13.46, 48.57, 'G_BAYERISCHE_OSTMARK'], ['Friburgo', 7.85, 47.99, 'G_BADEN'], ['Bayreuth', 11.58, 49.94, 'G_BAYERISCHE_OSTMARK'],
  ['Aquisgrana', 6.08, 50.78, 'G_KOELN_AACHEN'], ['Lubecca', 10.69, 53.87, 'G_MECKLENBURG_LUEBECK'], ['Wiesbaden', 8.24, 50.08, 'G_HESSEN_NASSAU'],
  ['Darmstadt', 8.65, 49.87, 'G_HESSEN_NASSAU'], ['Kaiserslautern', 7.77, 49.44, 'G_SAARPFALZ'],
];

test('Gaue: ogni città nota cade in un solo Gau, quello storico', () => {
  for (const [name, lon, lat, expected] of TOWNS) {
    const hits = gauIndex.provincesAt(lon, lat).map((f) => f.properties.id);
    assert.deepEqual(hits, [expected], name);
  }
});

test('Gaue: coprono tutto il territorio tedesco e di Danzica, senza sovrapposizioni evidenti', () => {
  const deu = provinces.features.filter((f) => ['DEU', 'DANZIG'].includes(f.properties.owner));
  const provArea = deu.reduce((s, f) => s + featureAreaKm2(f), 0);
  const gauArea = gaue.features.reduce((s, f) => s + featureAreaKm2(f), 0);
  assert.ok(Math.abs(gauArea / provArea - 1) < 0.005, `rapporto aree ${gauArea / provArea}`);
  // un punto interno di ogni provincia tedesca cade in un solo Gau
  const provIndex = buildProvinceIndex({ features: deu });
  let probes = 0;
  for (const f of deu) {
    const ring = f.geometry.coordinates[0][0];
    const [x, y] = ring[Math.floor(ring.length / 3)];
    // sposta il punto di poco verso l'interno scegliendo il baricentro dell'anello
    const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    for (const [px, py] of [[cx, cy], [(x + cx) / 2, (y + cy) / 2]]) {
      if (provIndex.provincesAt(px, py).length !== 1) continue;
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

test('Gaue: i bordi esterni coincidono con quelli delle province (tranne i pochi spigoli suddivisi)', () => {
  const g = edgeCounts(gaue);
  const p = edgeCounts({ features: provinces.features.filter((f) => ['DEU', 'DANZIG'].includes(f.properties.owner)) });
  let notOnProvinceExterior = 0;
  for (const [k, ids] of g) if (ids.size === 1 && !(p.has(k) && p.get(k).size === 1)) notOnProvinceExterior += 1;
  let missing = 0;
  for (const [k, ids] of p) if (ids.size === 1 && !g.has(k)) missing += 1;
  assert.ok(notOnProvinceExterior <= 8, `spigoli esterni dei Gaue fuori dal bordo delle province: ${notOnProvinceExterior}`);
  assert.ok(missing <= 8, `spigoli esterni delle province assenti dai Gaue: ${missing}`);
});

test('Gaue: le province elencate esistono e quelle divise sono segnate come parziali', () => {
  const ids = new Set(provinces.features.map((f) => f.properties.id));
  for (const f of gaue.features) {
    for (const pid of f.properties.provinceIds) assert.ok(ids.has(pid), `${f.properties.id} → ${pid}`);
    for (const pid of f.properties.partialProvinceIds) assert.ok(f.properties.provinceIds.includes(pid));
  }
  const bavaria = gaue.features.filter((f) => f.properties.provinceIds.includes('P_DEU_BAVARIA')).map((f) => f.properties.id);
  assert.ok(bavaria.length >= 5);
});
