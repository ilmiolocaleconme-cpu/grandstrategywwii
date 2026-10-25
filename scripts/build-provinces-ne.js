// Province «a grana grossa» per le nazioni fuori dall'Europa, da Natural Earth 10m admin-1 (pubblico dominio).
// Servono al livello Risorse (e al resto del gioco): senza una provincia non c'è dove mettere un giacimento.
//   git clone --depth 1 --filter=blob:none --sparse https://github.com/nvkelso/natural-earth-vector.git ne
//   git -C ne sparse-checkout add geojson
//   node scripts/build-provinces-ne.js <cartella con ne_10m_admin_1_states_provinces.geojson> [CODICE...]
//
// Cosa fa, e cosa NO (da non confondere con una mappa storica):
//  - usa i confini AMMINISTRATIVI MODERNI (non quelli del 1936): ogni provincia è `borderQuality: hypothesis` con `modern_borders`;
//  - i vertici sono agganciati a una griglia (SNAP gradi): due province vicine condividono gli stessi vertici, quindi non si formano
//    buchi né sovrapposizioni interne; le isole molto piccole sono omesse (si tiene sempre il poligono maggiore);
//  - l'assegnazione ai proprietari del 1936 (es. Manciuria → Manciukuo) è una scelta di gioco scritta qui sotto, motivata caso per caso.
// Scrive data/provinces/<OWNER>.json e aggiunge il codice a data/provinces/_meta.json (`order`), senza toccare le altre nazioni.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const SNAP = 0.02; // gradi (~2 km)
export const MAX_UNITS = 20; // oltre, le divisioni si fondono per regione (se Natural Earth la indica)
export const MIN_PROVINCE_AREA = 0.04; // gradi²: sotto, una provincia di una nazione con ≥ 3 province si omette (enclavi di città e isolotti: dopo l'aggancio alla griglia sono solo rumore)
export const MIN_AREA = 0.03; // gradi² (~300 km²): isole e buchi più piccoli sono omessi
const SOURCE = 'Natural Earth 10m admin-1 v5.1.1';

/**
 * Nazioni da generare. `adm0`: codici adm0_a3 di Natural Earth; `owner`: id in political_1936.json;
 * `pick(p)`: filtro sulle proprietà NE (name_en, ...); `note`: scelta di gioco da dichiarare.
 */
export const NATIONS = [
  { owner: 'CAN', minIsland: 0.5, adm0: ['CAN'], pick: (p) => p.name_en !== 'Newfoundland and Labrador', note: 'Canada: province e territori attuali, senza Terranova e Labrador (dominion a parte nel 1936, vedi NFL).' },
  { owner: 'NFL', minIsland: 0.5, adm0: ['CAN'], pick: (p) => p.name_en === 'Newfoundland and Labrador', note: 'Dominion di Terranova (con il Labrador) = provincia attuale di Terranova e Labrador.' },
  { owner: 'USA', noMerge: true, westOnly: true, minIsland: 0.3, adm0: ['USA'], note: 'Stati Uniti: stati attuali (Alaska e Hawaii erano territori nel 1936).' },
  { owner: 'MAL', adm0: ['MYS', 'SGP'], merge: { SGP: 'Singapore' }, pick: (p) => !['Sabah', 'Sarawak', 'Labuan'].includes(p.name_en), note: 'Malaya britannica: stati della penisola malese e Singapore; Borneo escluso (Sarawak e Sabah non hanno ancora un\'entità politica).' },
  { owner: 'NLD_EI', noMerge: true, adm0: ['IDN'], note: 'Indie orientali olandesi = province indonesiane attuali (compresa la Nuova Guinea occidentale); Timor Est portoghese è esclusa.' },
  { owner: 'COD', adm0: ['COD'], note: 'Congo belga: province della RD Congo attuale (confini delle province del 1936 diversi).' },
  { owner: 'CHN', noMerge: true, adm0: ['CHN'], pick: (p) => !MANCHU.includes(p.name_en) && !['Tibet', 'Paracel Islands'].includes(p.name_en), note: 'Cina: province attuali meno Manciuria (→ Manciukuo) e Tibet (→ TIB). Mengjiang e Rehe non sono ritagliati: Mongolia Interna resta intera [approssimazione].' },
  { owner: 'MAN', adm0: ['CHN'], pick: (p) => MANCHU.includes(p.name_en), note: 'Manciukuo = Liaoning, Jilin, Heilongjiang attuali; il Rehe (Chengde) e il Hulunbuir fuori dai confini sono omessi [approssimazione].' },
  { owner: 'TIB', adm0: ['CHN'], pick: (p) => p.name_en === 'Tibet', note: 'Tibet = regione autonoma attuale (Xizang).' },
];

const MANCHU = ['Liaoning', 'Jilin', 'Heilongjiang'];

// --- resto del mondo (24-25/10/2026): una provincia per divisione amministrativa moderna, fuse per regione dove sono troppe. ---
// Scelte di gioco (non storiche): l'India britannica include gli odierni Pakistan e Bangladesh; l'Indocina francese Vietnam, Laos e Cambogia;
// il Sudan anglo-egiziano anche il Sud Sudan; la Corea unita; il Ruanda-Urundi anche il Burundi. Non coperti (troppo piccoli o senza geometria
// utile): Vaticano, San Marino, Andorra, Monaco, Macao, Goa, Antille olandesi, Aden, Ifni, Hong Kong, Karafuto, Mandato giapponese,
// Camerun e Togo britannici (inclusi nei vicini per quanto possibile).
const PAP_PARTS = ['Western', 'Gulf', 'Central', 'Port Moresby', 'Milne Bay', 'Oro'];
const WORLD = [
  ...['AFG', 'IRN', 'IRQ', 'SAU', 'YEM', 'MNG', 'ETH', 'LBR', 'ARG', 'BOL', 'BRA', 'COL', 'CRI', 'CUB', 'DOM', 'ECU', 'SLV', 'GTM', 'HTI', 'HND', 'MEX', 'NIC', 'PAN', 'PRY', 'PER', 'URY', 'VEN', 'AUS', 'NZL', 'ZAF', 'BTN', 'KEN', 'NGA', 'GHA', 'SLE', 'UGA', 'MWI', 'SEN', 'MRT', 'MLI', 'NER', 'BFA', 'CIV', 'GIN', 'BEN', 'GAB', 'COG', 'CAF', 'TCD', 'MDG', 'DJI', 'AGO', 'MOZ', 'GNB', 'CPV', 'STP', 'SUR', 'ERI', 'SOM', 'TWN', 'NRU', 'WSM', 'GNQ', 'GRL', 'CMR', 'TGO', 'TZA', 'PHL'].map((o) => ({ owner: o, adm0: [o] })),
  ...Object.entries({ NEP: 'NPL', SIA: 'THA', CHL: 'CHL', CEY: 'LKA', BUR: 'MMR', GAM: 'GMB', ZAM: 'ZMB', ZIM: 'ZWE', BOT: 'BWA', LES: 'LSO', SWZ: 'SWZ', MAU: 'MUS', SEY: 'SYC', TIM: 'TLS', SWA: 'NAM', NHEB: 'VUT' }).map(([o, a]) => ({ owner: o, adm0: [a] })),
  { owner: 'JPN', noMerge: true, adm0: ['JPN'], note: 'Giappone: 47 prefetture attuali (Karafuto, Corea e Taiwan sono entità a parte).' },
  { owner: 'ESH', adm0: ['SAH'], note: 'Sahara spagnolo (Rio de Oro): contorno nazionale unico.' },
  { owner: 'IND', noMerge: true, adm0: ['IND', 'PAK', 'BGD'], note: 'India britannica = India, Pakistan e Bangladesh attuali.' },
  { owner: 'SUD', adm0: ['SDN', 'SSD'], note: 'Sudan anglo-egiziano = Sudan e Sud Sudan attuali.' },
  { owner: 'INDO', adm0: ['VNM', 'LAO', 'KHM'], note: 'Indocina francese = Vietnam, Laos e Cambogia attuali (Vietnam fuso per regione).' },
  { owner: 'RWA', adm0: ['RWA', 'BDI'], note: 'Ruanda-Urundi = Ruanda e Burundi.' },
  { owner: 'KOR', adm0: ['KOR', 'PRK'], note: 'Corea giapponese = Corea del Sud e del Nord attuali.' },
  { owner: 'PAP', adm0: ['PNG'], pick: (p) => PAP_PARTS.includes(p.name_en), note: 'Papua australiana = province meridionali della Papua Nuova Guinea [approssimazione].' },
  { owner: 'NGU', adm0: ['PNG'], pick: (p) => !PAP_PARTS.includes(p.name_en), note: 'Nuova Guinea mandato australiano = resto della Papua Nuova Guinea (con Bougainville e Nuova Britannia).' },
];
const BIG_ISLANDS = new Set(['GRL', 'CHL', 'NZL', 'AUS']); // arcipelaghi frastagliati: isole sotto ~5000 km² omesse (meno vertici, ricerca di percorsi più rapida)
for (const n of WORLD) if (BIG_ISLANDS.has(n.owner)) n.minIsland = 0.5;
const COLLAPSE = new Set(['CPV', 'SEY', 'MAU', 'STP', 'NRU', 'WSM', 'KWT', 'GNQ', 'BTN', 'DJI', 'SWZ', 'LES', 'TGO', 'TIM', 'NHEB', 'GAM']);
for (const n of WORLD) if (COLLAPSE.has(n.owner)) n.collapse = true; // paese piccolo o a isole: una sola provincia
NATIONS.push(...WORLD);


const nameOf = (p) => p.name_en || p.name || p.name_local || p.adm1_code || String(p.ne_id);
const slug = (s) => s.replace(/Đ/g, 'D').replace(/đ/g, 'd').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const snap = (v) => Math.round(v / SNAP) * SNAP;
const fix = (v) => Number(snap(v).toFixed(4));

function ringArea(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
}

/** Aggancia l'anello alla griglia, toglie i punti ripetuti, richiude. Ritorna null se degenera. */
export function snapRing(ring) {
  const out = [];
  for (const [x, y] of ring) {
    const p = [fix(x), fix(y)];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  if (out.length > 1 && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push(out[0]);
  return out.length >= 4 ? out : null;
}

/** Geometria NE → Polygon/MultiPolygon agganciata alla griglia, senza isole né buchi piccoli. */
export function simplifyGeometry(geometry, westOnly = false, minIsland = MIN_AREA) {
  let polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  // westOnly: toglie i poligoni a est dell'antimeridiano (Aleutine occidentali dell'Alaska): un riquadro che attraversa ±180° rompe terreno e mappa
  if (westOnly) polys = polys.filter((p) => p[0].some(([x]) => x < 0) || p[0].every(([x]) => x < 90));
  const kept = [];
  for (const poly of polys) {
    const outer = snapRing(poly[0]);
    if (!outer) continue;
    const holes = poly.slice(1).map(snapRing).filter((h) => h && ringArea(h) >= MIN_AREA);
    kept.push({ area: ringArea(outer), rings: [outer, ...holes] });
  }
  if (!kept.length) return null;
  kept.sort((a, b) => b.area - a.area);
  const big = kept.filter((k, i) => i === 0 || k.area >= minIsland).map((k) => k.rings);
  return big.length === 1 ? { type: 'Polygon', coordinates: big[0] } : { type: 'MultiPolygon', coordinates: big };
}


const signedArea = (r) => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return -a / 2; }; // > 0 = antiorario
const inRing = (pt, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > pt[1]) !== (r[j][1] > pt[1]) && pt[0] < ((r[j][0] - r[i][0]) * (pt[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c; };

/**
 * Fonde più poligoni (già agganciati alla griglia) in una geometria sola: i lati condivisi, percorsi in senso opposto, si annullano e
 * restano solo i contorni esterni (e i buchi). Funziona perché i vertici sono agganciati alla stessa griglia: nessuna libreria geometrica.
 * polys: [[anello esterno, ...buchi], ...]. Ritorna le coordinate di un MultiPolygon.
 */
export function dissolve(polys) {
  const key = (p) => `${p[0]},${p[1]}`;
  const edges = new Map(); // "a>b" → [a, b]
  for (const poly of polys) {
    poly.forEach((ring, k) => {
      const r = (signedArea(ring) > 0) === (k === 0) ? ring : [...ring].reverse(); // esterni antiorari, buchi orari
      for (let i = 0; i + 1 < r.length; i++) {
        const a = key(r[i]); const b = key(r[i + 1]);
        if (a === b) continue;
        if (edges.has(`${b}>${a}`)) edges.delete(`${b}>${a}`); else edges.set(`${a}>${b}`, [r[i], r[i + 1]]);
      }
    });
  }
  const out = new Map();
  for (const [a, b] of edges.values()) { const k = key(a); if (!out.has(k)) out.set(k, []); out.get(k).push(b); }
  const loops = [];
  for (const [a0, b0] of edges.values()) {
    const list0 = out.get(key(a0));
    if (!list0.includes(b0)) continue; // già usato
    const ring = [a0];
    let cur = a0; let next = b0;
    for (let guard = 0; guard < 1e6; guard++) {
      const list = out.get(key(cur)); list.splice(list.indexOf(next), 1);
      ring.push(next); cur = next;
      if (key(cur) === key(a0)) break;
      const nl = out.get(key(cur));
      if (!nl || !nl.length) break;
      next = nl[0];
    }
    if (ring.length >= 4 && key(ring[0]) === key(ring[ring.length - 1])) loops.push(ring);
  }
  const outers = loops.filter((l) => signedArea(l) > 0).map((l) => [l]);
  for (const hole of loops.filter((l) => signedArea(l) <= 0)) {
    const host = outers.filter((o) => inRing(hole[0], o[0])).sort((x, y) => signedArea(x[0]) - signedArea(y[0]))[0];
    if (host) host.push(hole);
  }
  return outers;
}

const gridPolys = (geometry) => (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).map((poly) => poly.map(snapRing).filter(Boolean)).filter((poly) => poly.length);

export function buildNation(nation, features, admin0 = []) {
  const have = new Set(features.map((f) => f.properties.adm0_a3));
  let picked = features.filter((f) => nation.adm0.includes(f.properties.adm0_a3) && (!nation.pick || nation.pick(f.properties)));
  // paesi senza suddivisioni in Natural Earth admin-1 (o troppo piccoli): una sola provincia dal contorno nazionale (admin-0)
  for (const code of nation.adm0.filter((c) => !have.has(c))) {
    for (const f of admin0.filter((a) => a.properties.ADM0_A3 === code)) {
      const n = f.properties.NAME_EN;
      picked.push({ properties: { adm0_a3: code, name_en: n, name_it: n, name: n, ne_id: f.properties.NE_ID ?? code, wikidataid: f.properties.WIKIDATAID ?? null }, geometry: f.geometry });
    }
  }
  // paesi con troppe divisioni (> MAX_UNITS): si fondono per `region` di Natural Earth, se esiste e dà un numero ragionevole di gruppi
  const regionOf = (p) => (p.region || '').trim();
  const mergeBy = {};
  for (const code of nation.adm0) {
    const mine = picked.filter((f) => f.properties.adm0_a3 === code);
    const regions = new Set(mine.map((f) => regionOf(f.properties)).filter(Boolean));
    if (!nation.noMerge && mine.length > MAX_UNITS && regions.size >= 3 && regions.size <= mine.length / 2 && mine.filter((f) => regionOf(f.properties)).length >= 0.7 * mine.length) mergeBy[code] = true;
    if (mergeBy[code]) console.log(`  ${nation.owner}/${code}: ${mine.length} divisioni fuse in ${regions.size} regioni`);
  }
  const groups = new Map();
  const units = [];
  for (const f of picked) {
    const code = f.properties.adm0_a3;
    const name = nation.collapse ? (nation.collapseName ?? f.properties.admin ?? nation.owner) : nation.merge?.[code] ?? (mergeBy[code] ? regionOf(f.properties) || null : null);
    if (!name) { units.push(f); continue; }
    const k = `${code}|${name}`;
    let g = groups.get(k);
    if (!g) { g = { properties: { ...f.properties, name_en: name, name_it: name, name }, polys: [] }; groups.set(k, g); units.push(g); }
    g.polys.push(...gridPolys(f.geometry));
  }
  for (const g of groups.values()) g.geometry = { type: 'MultiPolygon', coordinates: dissolve(g.polys) };
  const seen = new Set();
  const out = [];
  const items = units;
  for (const f of items) {
    const p = f.properties;
    const geometry = simplifyGeometry(f.geometry, nation.westOnly, nation.minIsland);
    if (!geometry) continue;
    let id = `P_${nation.owner}_${slug(nameOf(p))}`;
    if (seen.has(id)) id = `${id}_${slug(p.postal || p.iso_3166_2 || '2')}`;
    while (seen.has(id)) id += '_2';
    seen.add(id);
    const name = `${p.name_it || nameOf(p)}${id.endsWith('_DC') ? ' D.C.' : ''}`;
    out.push({
      type: 'Feature',
      id,
      properties: {
        id, name, nameLocal: p.name || nameOf(p), owner: nation.owner, adminLevel: 4, neId: String(p.ne_id), wikidata: p.wikidataid ?? null,
        validFrom: '1936-01-01', validTo: '9999-12-31', dateBasis: 'assumed', borderQuality: 'hypothesis',
        source: SOURCE, license: 'Public Domain (Natural Earth)',
        notes: `Confini moderni, non verificati per il 1936. ${nation.note ?? ""}`,
        knownIssues: ['modern_borders', 'land_only', 'coarse_grid'],
      },
      geometry,
    });
  }
  if (out.length >= 3) {
    const area = (g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).reduce((t, p) => t + ringArea(p[0]), 0);
    for (let i = out.length - 1; i >= 0; i--) if (area(out[i].geometry) < MIN_PROVINCE_AREA) out.splice(i, 1);
  }
  out.sort((a, b) => (a.id < b.id ? -1 : 1));
  return { type: 'FeatureCollection', owner: nation.owner, features: out };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, ...only] = process.argv.slice(2);
  if (!dir) { console.error('uso: node scripts/build-provinces-ne.js <cartella NE geojson> [CODICE...]'); process.exit(2); }
  const features = JSON.parse(await readFile(path.join(dir, 'ne_10m_admin_1_states_provinces.geojson'), 'utf8')).features;
  const admin0 = JSON.parse(await readFile(path.join(dir, 'ne_10m_admin_0_countries.geojson'), 'utf8')).features;
  const dataDir = new URL('../data/provinces/', import.meta.url);
  const meta = JSON.parse(await readFile(new URL('_meta.json', dataDir), 'utf8'));
  for (const nation of NATIONS.filter((n) => !only.length || only.includes(n.owner))) {
    const file = buildNation(nation, features, admin0);
    if (!file.features.length) { console.error(`${nation.owner}: nessuna provincia trovata`); process.exitCode = 1; continue; }
    const text = `${JSON.stringify(file)}\n`;
    await writeFile(new URL(`${nation.owner}.json`, dataDir), text);
    if (!meta.order.includes(nation.owner)) meta.order.push(nation.owner);
    console.log(`${nation.owner}: ${file.features.length} province, ${(text.length / 1024).toFixed(0)} KB`);
  }
  await writeFile(new URL('_meta.json', dataDir), `${JSON.stringify(meta, null, 1)}\n`);
}
