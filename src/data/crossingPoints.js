// Punti di passaggio calcolati sui fiumi: dove un fiume incontra il confine tra due province
// (o gli fa da confine) esiste un luogo in cui, nelle regole, servono un ponte, un guado o un traghetto.
// Funzioni PURE, senza I/O: usano le stesse geometrie della mappa (data/rivers_geo.json e le province).
//
// COSA SONO: candidati geometrici, NON ponti storici. Le coordinate sono vere (sul fiume e sul confine
// di Natural Earth), ma che lì ci fosse davvero un ponte nel 1936 non è verificato: mancano strade e
// ferrovie nei dati. Per questo ogni punto è `quality: 'hypothesis'`. I ponti storici veri stanno in
// data/crossings.json (9 voci, senza coordinate) e non si confondono con questi.
// IL LIVELLO è provvisorio: classe di portata della struttura stimata dalla larghezza del fiume
// (`levelBasis`, nell'intestazione del file), da sostituire con i dati storici. Costi, tempi e capacità numeriche NON esistono.

import { kmPerLon, sampleLine, lineLengthKm } from './rivers.js';

export const CROSSING_POINTS_SCHEMA = 'crossing-points-v1';

/** Livelli della struttura (come proposto per il grafo delle infrastrutture: tre per strade e ponti). */
export const CROSSING_LEVELS = Object.freeze([
  { level: 1, id: 'light', label: 'Leggera', hint: 'strada secondaria' },
  { level: 2, id: 'medium', label: 'Media', hint: 'strada principale o ferrovia secondaria' },
  { level: 3, id: 'heavy', label: 'Pesante', hint: 'autostrada o ferrovia principale' },
]);

export const LEVEL_BASIS = 'provvisorio_da_larghezza_fiume';
export const LEVEL_BY_WIDTH = Object.freeze({ small: 1, medium: 2, large: 3 });
export const KINDS = Object.freeze(['border_cross', 'river_border']);

/** Livello provvisorio dalla classe di larghezza del fiume. */
export function levelForRiver(river) {
  return LEVEL_BY_WIDTH[river?.widthClass] ?? 1;
}

/** Livello minimo mostrato a un certo zoom: a vista d'insieme solo le strutture pesanti. */
export function minLevelForZoom(k) {
  return k < 2.5 ? 3 : k < 5 ? 2 : 1;
}

/** Lato in pixel della cella anti-sovrapposizione dei marcatori: più grande a vista d'insieme, dove ce ne sono di più per schermo. */
export function markerCellPx(k) {
  return k < 2.5 ? 24 : k < 5 ? 15 : 10;
}

function singleId(index, lon, lat) {
  const hits = index.provincesAt(lon, lat);
  return hits.length === 1 ? hits[0].properties.id : null;
}

function distKm(a, b) {
  return Math.hypot((a[0] - b[0]) * kmPerLon((a[1] + b[1]) / 2), (a[1] - b[1]) * 110.57);
}

/** Punto del confine tra due campioni di province diverse, per bisezione (precisione ben sotto il passo). */
function refine(index, p0, id0, p1, id1, steps = 10) {
  let a = p0;
  let b = p1;
  for (let i = 0; i < steps; i += 1) {
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const id = singleId(index, m[0], m[1]);
    if (id === id0) a = m;
    else if (id === id1) b = m;
    else break; // fuori da ogni provincia (mare, paese non coperto): si tiene l'intervallo trovato
  }
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

const round4 = (x) => Math.round(x * 1e4) / 1e4;

/**
 * Calcola i punti. `model` = buildRiverModel(...), `index` = buildProvinceIndex(...), `catalog` = fiumi.
 * Opzioni: maxRank (solo fiumi con scalerank <= maxRank), stepKm (passo di campionamento),
 * bankStepKm e spacingKm (fiumi che fanno da confine: un punto ogni almeno `spacingKm`), mergeKm (unisce
 * i passaggi ripetuti dello stesso fiume sulla stessa coppia di province).
 * Ritorna i punti ordinati e con id stabili: { id, kind, riverId, lon, lat, from, to, level }.
 * `quality` ('hypothesis') e `levelBasis` valgono per tutto il file e stanno nell'intestazione.
 */
export function computeCrossingPoints(model, index, catalog, { maxRank = 8, stepKm = 1, bankStepKm = 3, spacingKm = 40, offsetDeg = 0.03, mergeKm = 8 } = {}) {
  const byId = new Map(catalog.map((r) => [r.id, r]));
  const raw = [];
  for (const [riverId, { lines }] of model.rivers) {
    const river = byId.get(riverId);
    if (!river || (river.scalerank ?? 99) > maxRank) continue;
    const level = levelForRiver(river);
    const mk = (kind, from, to, lon, lat) => raw.push({ kind, riverId, lon: round4(lon), lat: round4(lat), from, to, level });
    for (const line of lines) {
      if (line.inLake) continue;
      // 1) il fiume attraversa il confine tra due province
      let last = null; // { id, pos }
      for (const pos of sampleLine(line.coordinates, stepKm)) {
        const id = singleId(index, pos[0], pos[1]);
        if (id === null) continue;
        if (last !== null && id !== last.id) {
          const [lon, lat] = refine(index, last.pos, last.id, pos, id);
          mk('border_cross', last.id, id, lon, lat);
        }
        last = { id, pos };
      }
      // 2) il fiume fa da confine: province affacciate sulle due rive
      const s = sampleLine(line.coordinates, bankStepKm);
      const lastAt = new Map(); // coppia -> posizione dell'ultimo punto emesso
      for (let i = 1; i < s.length - 1; i += 1) {
        const [lon, lat] = s[i];
        let dx = s[i + 1][0] - s[i - 1][0];
        let dy = s[i + 1][1] - s[i - 1][1];
        const n = Math.hypot(dx, dy) || 1;
        dx /= n;
        dy /= n;
        const left = singleId(index, lon - dy * offsetDeg, lat + dx * offsetDeg);
        const right = singleId(index, lon + dy * offsetDeg, lat - dx * offsetDeg);
        if (left === null || right === null || left === right) continue;
        const [a, b] = left < right ? [left, right] : [right, left];
        const key = `${a}|${b}`;
        const prev = lastAt.get(key);
        if (prev && distKm(prev, [lon, lat]) < spacingKm) continue;
        lastAt.set(key, [lon, lat]);
        mk('river_border', a, b, lon, lat);
      }
    }
  }
  // un punto "fiume-confine" vicino (< 3 km) a un attraversamento dello stesso fiume è lo stesso luogo
  const crosses = raw.filter((p) => p.kind === 'border_cross');
  const kept = raw.filter((p) => p.kind === 'border_cross' || !crosses.some((c) => c.riverId === p.riverId && distKm([c.lon, c.lat], [p.lon, p.lat]) < 3));
  kept.sort((p, q) => (p.riverId < q.riverId ? -1 : p.riverId > q.riverId ? 1 : p.lon - q.lon || p.lat - q.lat));
  // un fiume che serpeggia lungo il confine lo attraversa molte volte nello stesso luogo: stessa coppia di
  // province, stesso fiume, entro `mergeKm` = un solo punto (si tiene il primo, in ordine di longitudine)
  const out = [];
  const groups = new Map();
  for (const p of kept) {
    const key = `${p.riverId}|${p.from < p.to ? p.from : p.to}|${p.from < p.to ? p.to : p.from}`;
    const near = groups.get(key) ?? [];
    if (near.some((q) => distKm([q.lon, q.lat], [p.lon, p.lat]) < mergeKm)) continue;
    near.push(p);
    groups.set(key, near);
    out.push(p);
  }
  const perRiver = new Map();
  return out.map((p) => {
    const n = (perRiver.get(p.riverId) ?? 0) + 1;
    perRiver.set(p.riverId, n);
    return { id: `CP_${p.riverId.replace(/^R_/, '')}_${String(n).padStart(3, '0')}`, ...p };
  });
}

/**
 * Nel file le due province di ogni punto sono INDICI nell'elenco ordinato degli id (come in data/adjacency.json, con
 * la somma di controllo `checksum`): citare gli id per esteso metterebbe nello stesso chunk della build le province
 * di nazioni piccole (CZE, DANZIG, LIE) e farebbe fallire il controllo del precache (scripts/check-precache.js).
 */
export function packCrossingPoints(points, ids) {
  const index = new Map(ids.map((id, i) => [id, i]));
  return points.map((p) => ({ ...p, from: index.get(p.from), to: index.get(p.to) }));
}

/** Operazione inversa di packCrossingPoints: indici → id delle province. */
export function unpackCrossingPoints(file, ids) {
  return file.points.map((p) => ({ ...p, from: ids[p.from], to: ids[p.to] }));
}

/** Controlli sul file: schema, id unici, tipi, livelli, coordinate, fiumi e indici di provincia validi (`provinceIds` = elenco ordinato degli id). Ritorna la lista degli errori. */
export function validateCrossingPoints(file, { riverIds, provinceIds } = {}) {
  const errors = [];
  if (file?.schema !== CROSSING_POINTS_SCHEMA) errors.push(`schema atteso ${CROSSING_POINTS_SCHEMA}`);
  if (file?.quality !== 'hypothesis') errors.push('intestazione: qualità attesa "hypothesis"');
  if (typeof file?.levelBasis !== 'string' || file.levelBasis === '') errors.push('intestazione: levelBasis mancante');
  if (file?.count !== file?.points?.length) errors.push('intestazione: count diverso dal numero di punti');
  const seen = new Set();
  for (const p of file?.points ?? []) {
    if (seen.has(p.id)) errors.push(`${p.id}: id duplicato`);
    seen.add(p.id);
    if (!KINDS.includes(p.kind)) errors.push(`${p.id}: tipo non valido "${p.kind}"`);
    if (!CROSSING_LEVELS.some((l) => l.level === p.level)) errors.push(`${p.id}: livello non valido`);
    if (!(Math.abs(p.lon) <= 180) || !(Math.abs(p.lat) <= 90)) errors.push(`${p.id}: coordinate non valide`);
    if (riverIds && !riverIds.has(p.riverId)) errors.push(`${p.id}: fiume sconosciuto ${p.riverId}`);
    if (provinceIds) for (const side of [p.from, p.to]) if (!Number.isInteger(side) || side < 0 || side >= provinceIds.length) errors.push(`${p.id}: indice di provincia non valido ${side}`);
  }
  return errors;
}

export { lineLengthKm };
