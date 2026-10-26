// Isole e atolli senza provincia (lontani più di 2° da qualsiasi provincia): si raggruppano per arcipelago/sovranità e ogni gruppo
// diventa una provincia (una sola, con l'isola più grande come isola principale) oppure si aggiunge a una provincia esistente dello
// stesso territorio (es. le isole della Polinesia francese lontane dalle altre). Geometrie vere di Natural Earth 10m (terre emerse e
// isole minori), semplificate; sovranità 1936 e nomi sono IPOTESI (`borderQuality: hypothesis`, `nomeDaVerificare`).
//
//   node scripts/build-islands.js <cartella geojson di Natural Earth>        (--dry: solo rapporto)
//
// Dopo: terreno (aggiunto qui, stima manuale a bassa affidabilità), build:province-industry, build:adjacency, build:sea, build:labels,
// build-links.js e, se serve, build:province-resources.
import { readFile, writeFile } from 'node:fs/promises';
import { readProvinceDocs, writeProvinceDocs } from './province-io.js';
import { simplify } from '../src/data/transport.js';

const NE = process.argv[2];
const DRY = process.argv.includes('--dry');
if (!NE) { console.error('Uso: node scripts/build-islands.js <cartella geojson di Natural Earth> [--dry]'); process.exit(1); }
const MIN_KM2 = 1;
const FAR_DEG = 2;
const LINK_DEG = 3;
const DP_TOL = 0.004;
const MATCH_DEG = 1.5;
const KM = 111.32;

// Gruppi. `target`: id di una provincia esistente a cui aggiungere i pezzi; `create`: provincia nuova { id, owner, name }. `members`: coordinate
// (lon, lat) dell'isola maggiore di ciascun raggruppamento di Natural Earth da includere. `terrain`: tipo stimato (solo province nuove).
const GROUPS = [
  { target: 'P_FJI_EASTERN', members: [[-179.91, -16.82], [177.07, -12.5], [174.61, -21.69]], west: { create: { id: 'P_FJI_TAVEUNI', owner: 'FJI', name: 'Taveuni e Lau occidentali' }, terrain: 'foresta' } },
  { target: 'P_PYF_POLINESIA_FRANCESE', members: [[-138.99, -9.77], [-140.73, -17.77], [-149.49, -23.38], [-144.32, -27.6], [-151.77, -16.5], [-109.22, 10.3]] },
  { create: { id: 'P_USA_ALEUTINE_OCCIDENTALI', owner: 'USA', name: 'Aleutine occidentali' }, terrain: 'tundra', members: [[179.05, 51.5]], west: { target: 'P_USA_ALASKA' } }, // le parti a est dell'antimeridiano restano a parte: unite ad Alaska allargherebbero il riquadro a tutto il mondo
  { target: 'P_USA_HAWAII', members: [[-171.73, 25.76], [-177.37, 28.21]] },
  { target: 'P_SVA_SVALBARD', members: [[32.56, 80.16], [19.04, 74.44]] },
  { target: 'P_SEY_SEYCHELLES', members: [[46.37, -9.39], [56.27, -7.15]] },
  { target: 'P_MDV_MALDIVE', members: [[73.1, -0.61]] },
  { target: 'P_MAU_MAURITIUS', members: [[63.41, -19.72], [56.55, -10.37], [72.42, -7.35]] },
  { target: 'P_JPN_MANDATE_MARSHALL', members: [[166.87, 11.16], [169, 14.6], [162.34, 11.35]] },
  { target: 'P_JPN_MANDATE_PALAU', members: [[131.16, 3.04]] },
  { target: 'P_JPN_MANDATE_CAROLINE', members: [[153.69, 5.3], [149.18, 7.37], [140.52, 9.77]] },
  { target: 'P_NZL_NEW_ZEALAND_OUTLYING_ISLANDS', members: [[-177.9, -29.26], [169.15, -52.53], [178.78, -49.67]], west: { create: { id: 'P_NZL_KERMADEC', owner: 'NZL', name: 'Isole Kermadec' }, terrain: 'collina' } },
  { create: { id: 'P_NOR_JAN_MAYEN', owner: 'NOR', name: 'Jan Mayen' }, terrain: 'tundra', members: [[-8.53, 70.99], [3.42, -54.42]] },
  { create: { id: 'P_FRA_KERGUELEN', owner: 'FRA', name: 'Isole Kerguelen' }, terrain: 'tundra', members: [[69.66, -49.19], [69.27, -48.96], [51.76, -46.39], [77.54, -37.86]] },
  { create: { id: 'P_FLK_GEORGIA_DEL_SUD', owner: 'FLK', name: 'Georgia del Sud' }, terrain: 'tundra', members: [[-36.91, -54.43], [-26.35, -58.44], [-42.1, -53.48]] },
  { create: { id: 'P_GBR_SANT_ELENA', owner: 'GBR', name: "Sant'Elena" }, terrain: 'collina', members: [[-5.72, -15.96], [-14.36, -7.93], [-12.26, -37.1], [-9.97, -40.35]] },
  { create: { id: 'P_GBR_BERMUDA', owner: 'GBR', name: 'Bermuda' }, terrain: 'pianura', members: [[-64.77, 32.32]] },
  { create: { id: 'P_GBR_PITCAIRN', owner: 'GBR', name: 'Pitcairn' }, terrain: 'collina', members: [[-128.32, -24.37]] },
  { create: { id: 'P_GBR_HEARD', owner: 'GBR', name: 'Isola Heard' }, terrain: 'montagna', members: [[73.52, -53.08]] },
  { create: { id: 'P_GBR_GILBERT_ELLICE', owner: 'GBR', name: 'Isole Gilbert ed Ellice' }, terrain: 'pianura', members: [[175.04, -1.49], [169.54, -0.86], [179.2, -8.5]] },
  { create: { id: 'P_GBR_LINE_FENICE', owner: 'GBR', name: 'Isole della Linea e della Fenice' }, terrain: 'pianura', members: [[-157.38, 1.87], [-154.98, -4.06], [-151.8, -11.42], [-171.68, -2.81]] },
  { create: { id: 'P_NZL_ISOLE_COOK', owner: 'NZL', name: 'Isole Cook' }, terrain: 'foresta', members: [[-159.79, -21.22], [-157.97, -8.96], [-160.97, -10.4], [-165.81, -10.95], [-169.87, -19.05], [-171.2, -9.35]] },
  { create: { id: 'P_AUS_NORFOLK', owner: 'AUS', name: 'Isola Norfolk' }, terrain: 'collina', members: [[167.95, -29.04], [159.08, -31.56]] },
  { create: { id: 'P_AUS_MACQUARIE', owner: 'AUS', name: 'Isola Macquarie' }, terrain: 'tundra', members: [[158.9, -54.61]] },
  { create: { id: 'P_MAL_ISOLA_DI_NATALE', owner: 'MAL', name: 'Isola di Natale e Cocos' }, terrain: 'foresta', members: [[105.65, -10.5], [96.85, -12.16]] },
  { create: { id: 'P_JPN_OGASAWARA', owner: 'JPN', name: 'Ogasawara' }, terrain: 'collina', members: [[142.15, 26.67], [153.95, 24.3], [140.31, 30.48], [131.24, 25.85]] },
  { create: { id: 'P_MEX_REVILLAGIGEDO', owner: 'MEX', name: 'Isole Revillagigedo' }, terrain: 'montagna', members: [[-110.99, 18.79], [-114.76, 18.34]] },
  { create: { id: 'P_BRA_FERNANDO_DE_NORONHA', owner: 'BRA', name: 'Fernando de Noronha' }, terrain: 'collina', members: [[-32.42, -3.86], [-29.39, 0.86], [-29.33, -20.57]] },
  { create: { id: 'P_CRI_ISOLA_DEL_COCCO', owner: 'CRI', name: 'Isola del Cocco' }, terrain: 'foresta', members: [[-87.09, 5.54]] },
  { create: { id: 'P_CHL_ISOLA_DI_PASQUA', owner: 'CHL', name: 'Isola di Pasqua' }, terrain: 'collina', members: [[-109.34, -27.13], [-78.87, -33.62], [-79.9, -26.35]] },
  { create: { id: 'P_USA_ISOLE_MINORI_PACIFICO', owner: 'USA', name: 'Isole minori del Pacifico (Wake)' }, terrain: 'pianura', members: [[-160.02, -0.38], [-169.54, 16.73], [-168.17, -14.53]] },
  { create: { id: 'P_USA_WAKE', owner: 'USA', name: 'Isola Wake' }, terrain: 'pianura', members: [[166.64, 19.29]] },
];

const readJson = async (n) => JSON.parse(await readFile(`${NE}/${n}`, 'utf8'));
const polysOf = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []);
const bboxOf = (r) => { let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (const [x, y] of r) { if (x < a) a = x; if (x > b) b = x; if (y < c) c = y; if (y > d) d = y; } return [a, c, b, d]; };
const pip = (rings, x, y) => { let ins = false; for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i]; const [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins; } return ins; };
const ringArea = (r) => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + (p[0] * q[1] - q[0] * p[1]); }, 0)) / 2;

const docs = await readProvinceDocs();
const feats = [];
for (const d of docs) for (const f of d.data.features) feats.push({ f, doc: d });
const byId = new Map(feats.map((e) => [e.f.id, e]));
const provParts = [];
for (const e of feats) for (const rings of polysOf(e.f.geometry)) provParts.push({ rings, bb: bboxOf(rings[0]) });
const covered = (x, y) => provParts.some((p) => x >= p.bb[0] && x <= p.bb[2] && y >= p.bb[1] && y <= p.bb[3] && pip(p.rings, x, y));
const nearProv = (x, y, r) => provParts.some((p) => x >= p.bb[0] - r && x <= p.bb[2] + r && y >= p.bb[1] - r && y <= p.bb[3] + r);

// parti di terra emersa (terre + isole minori), senza doppioni, non coperte e lontane dalle province
const raw = [];
for (const file of ['ne_10m_land.geojson', 'ne_10m_minor_islands.geojson']) for (const f of (await readJson(file)).features) for (const rings of polysOf(f.geometry)) raw.push(rings);
const seen = new Set();
const far = [];
for (const rings of raw) {
  const bb = bboxOf(rings[0]);
  if (bb[3] < -60 || bb[1] > 85) continue;
  const cx = (bb[0] + bb[2]) / 2; const cy = (bb[1] + bb[3]) / 2;
  const km2 = ringArea(rings[0]) * KM * KM * Math.cos((cy * Math.PI) / 180);
  if (km2 < MIN_KM2 || km2 > 5e6) continue;
  const k = `${cx.toFixed(2)},${cy.toFixed(2)}`;
  if (seen.has(k)) continue; seen.add(k);
  if (covered(cx, cy) || nearProv(cx, cy, FAR_DEG)) continue;
  far.push({ rings, bb, cx, cy, km2 });
}
// raggruppamenti per vicinanza (bbox a meno di LINK_DEG, anche oltre l'antimeridiano)
const gapDeg = (a, b) => {
  const dx = Math.max(a.bb[0] - b.bb[2], b.bb[0] - a.bb[2], 0);
  const dxw = Math.max(a.bb[0] + 360 - b.bb[2], b.bb[0] - (a.bb[2] + 360), a.bb[0] - 360 - b.bb[2], 0);
  return Math.hypot(Math.min(dx, dxw), Math.max(a.bb[1] - b.bb[3], b.bb[1] - a.bb[3], 0));
};
const par = far.map((_, i) => i);
const find = (i) => (par[i] === i ? i : (par[i] = find(par[i])));
for (let i = 0; i < far.length; i += 1) for (let j = i + 1; j < far.length; j += 1) if (gapDeg(far[i], far[j]) <= LINK_DEG) par[find(i)] = find(j);
const clusters = new Map();
far.forEach((q, i) => { const r = find(i); if (!clusters.has(r)) clusters.set(r, []); clusters.get(r).push(q); });

const matched = new Map(); // indice gruppo -> parti
const unmatched = [];
for (const parts of clusters.values()) {
  parts.sort((a, b) => b.km2 - a.km2);
  const m = parts[0];
  let best = -1; let bd = MATCH_DEG;
  GROUPS.forEach((g, gi) => { for (const [x, y] of g.members) { const d = Math.hypot(x - m.cx, y - m.cy); if (d < bd) { bd = d; best = gi; } } });
  if (best < 0) { unmatched.push({ at: [+m.cx.toFixed(2), +m.cy.toFixed(2)], km2: Math.round(parts.reduce((s, q) => s + q.km2, 0)), parts: parts.length }); continue; }
  if (!matched.has(best)) matched.set(best, []);
  matched.get(best).push(...parts);
}

const toLL = ([x, y]) => [Math.max(-179.9999, Math.min(179.9999, Math.round(x * 1e4) / 1e4)), Math.round(y * 1e4) / 1e4]; // mai esattamente su ±180: la cucitura è riservata alla Ciukotka
const geomOf = (parts) => {
  const out = [];
  for (const q of parts) {
    const rings = [];
    q.rings.forEach((ring, i) => {
      const open = ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring.slice(0, -1) : ring;
      const s = simplify([...open, open[0]], DP_TOL).slice(0, -1);
      if (s.length >= 3 && (i === 0 || ringArea(s) > 1e-6)) rings.push([...s, s[0]].map(toLL));
    });
    if (rings.length) out.push(rings);
  }
  return out;
};

const spanOf = (g) => { let a = 1e9, b = -1e9; for (const p of polysOf(g)) for (const [x] of p[0]) { if (x < a) a = x; if (x > b) b = x; } return Math.round(b - a); };
const newTerrain = {};
// i gruppi a cavallo dell'antimeridiano si dividono per emisfero (un riquadro largo 359° farebbe disegnare la provincia in ogni piastrella)
const jobs = [];
for (const [gi, parts] of [...matched.entries()].sort((a, b) => a[0] - b[0])) {
  const g = GROUPS[gi];
  const west = parts.filter((q) => q.cx < 0); const east = parts.filter((q) => q.cx >= 0);
  if (g.west && west.length && east.length) { jobs.push({ g, parts: east }); jobs.push({ g: g.west, parts: west }); } else jobs.push({ g, parts });
}
const rep = [];
for (const { g, parts } of jobs) {
  parts.sort((a, b) => b.km2 - a.km2);
  const geom = geomOf(parts);
  const km2 = Math.round(parts.reduce((s, q) => s + q.km2, 0));
  const main = parts[0];
  if (g.target) {
    const e = byId.get(g.target);
    if (!e) throw new Error(`provincia ${g.target} non trovata`);
    const prev = polysOf(e.f.geometry);
    e.f.geometry = { type: 'MultiPolygon', coordinates: [...prev, ...geom] };
    e.f.properties.isoleAggiunte = { parti: parts.length, areaKm2: km2, note: 'isole e atolli senza provincia (Natural Earth 10m) aggiunti al territorio; geometria semplificata' };
    e.doc.touched = true;
    rep.push({ target: g.target, parti: parts.length, km2, larghezzaGradi: spanOf(e.f.geometry) });
  } else {
    if (byId.has(g.create.id)) throw new Error(`id già presente: ${g.create.id}`);
    const doc = docs.find((d) => d.name === `${g.create.owner}.json`);
    if (!doc) throw new Error(`file province di ${g.create.owner} mancante`);
    const props = {
      id: g.create.id, name: g.create.name, nameLocal: g.create.name, owner: g.create.owner, adminLevel: null, kind: 'isole', neId: null, wikidata: null,
      validFrom: '1936-01-01', validTo: '9999-12-31', dateBasis: 'assumed', borderQuality: 'hypothesis',
      source: 'Natural Earth 10m terre emerse e isole minori (isole senza provincia, raggruppate per arcipelago); sovranità 1936 e nome ipotizzati',
      license: 'Public Domain (Natural Earth)', nomeDaVerificare: true,
      isolePrincipale: { lon: +main.cx.toFixed(2), lat: +main.cy.toFixed(2), areaKm2: Math.round(main.km2) }, isole: parts.length, areaKm2: km2,
      knownIssues: ['modern_borders', 'land_only', 'island_group'],
      notes: 'Raggruppamento di isole e atolli in una sola provincia: l\'isola principale è la più grande del gruppo.',
    };
    const feature = { type: 'Feature', id: g.create.id, properties: props, geometry: { type: 'MultiPolygon', coordinates: geom } };
    doc.data.features.push(feature);
    doc.touched = true;
    const t = g.terrain;
    newTerrain[g.create.id] = { terreno: t, secondario: null, frazioni: { [t]: 1 }, rugosita: 0, tinta: 0, campioni: 0, affidabilita: 'bassa' };
    rep.push({ create: g.create.id, owner: g.create.owner, isole: parts.length, km2, larghezzaGradi: spanOf(feature.geometry) });
  }
}
console.log(JSON.stringify({ gruppiApplicati: rep.length, daGruppi: GROUPS.length, clusterSenzaGruppo: unmatched.length }));
for (const r of rep) console.log(JSON.stringify(r));
const missing = GROUPS.map((g, i) => (matched.has(i) ? null : (g.target ?? g.create.id))).filter(Boolean);
console.log('gruppi senza isole trovate:', missing.join(' ') || 'nessuno');
console.log('cluster non assegnati (ignorati):', JSON.stringify(unmatched));
if (!DRY) {
  console.log('scritti', (await writeProvinceDocs(docs)).join(' '));
  // terreno: righe nello stesso formato del file, in ordine alfabetico
  const url = new URL('../data/terrain.json', import.meta.url);
  const txt = await readFile(url, 'utf8');
  const open = txt.indexOf('  "province": {\n') + '  "province": {\n'.length;
  const close = txt.lastIndexOf('\n  }\n}');
  const lines = txt.slice(open, close).split(',\n').map((l) => l.replace(/,$/, ''));
  const have = new Set(lines.map((l) => l.trim().split('"')[1]));
  for (const [id, t] of Object.entries(newTerrain)) if (!have.has(id)) lines.push(`    ${JSON.stringify(id)}: ${dump1(t)}`);
  lines.sort((a, b) => a.trim().split('"')[1].localeCompare(b.trim().split('"')[1], 'en'));
  await writeFile(url, `${txt.slice(0, open)}${lines.join(',\n')}${txt.slice(close)}`);
  console.log('terreno: aggiunte', Object.keys(newTerrain).length, 'voci');
}
function dump1(t) {
  const fr = Object.entries(t.frazioni).map(([k, v]) => `"${k}": ${v}`).join(', ');
  return `{"terreno": "${t.terreno}", "secondario": null, "frazioni": {${fr}}, "rugosita": ${t.rugosita}, "tinta": ${t.tinta}, "campioni": ${t.campioni}, "affidabilita": "${t.affidabilita}"}`;
}
