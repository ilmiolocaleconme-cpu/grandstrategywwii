// Ponti candidati dagli incroci tra strade/ferrovie e fiumi (grafo dei collegamenti, data/links.json) e loro unione con i
// passaggi sul confine delle province (src/data/crossingPoints.js). Funzioni PURE, senza I/O.
// Sono candidati geometrici sulla rete MODERNA di Natural Earth: non ponti storici verificati.

export const BRIDGES_SCHEMA = 'transport-bridges-v1';

/** Controlli su un file di ponti. Ritorna la lista degli errori. */
export function validateBridges(file, { riverIds } = {}) {
  const errors = [];
  if (file?.schema !== BRIDGES_SCHEMA) errors.push(`schema atteso ${BRIDGES_SCHEMA}`);
  if (file?.quality !== 'hypothesis') errors.push('intestazione: qualità attesa "hypothesis"');
  if (file?.count !== file?.points?.length) errors.push('intestazione: count diverso dal numero di ponti');
  const seen = new Set();
  for (const p of file?.points ?? []) {
    if (seen.has(p.id)) errors.push(`${p.id}: id duplicato`);
    seen.add(p.id);
    if (![1, 2, 3].includes(p.level)) errors.push(`${p.id}: livello non valido`);
    if (![0, 1, 2, 3].includes(p.road) || ![0, 2, 3].includes(p.rail) || p.road + p.rail === 0) errors.push(`${p.id}: livelli di strada/ferrovia non validi`);
    if (!Number.isInteger(p.ang) || p.ang < 0 || p.ang > 179) errors.push(`${p.id}: direzione (ang) non valida`);
    if (p.level !== Math.max(p.road, p.rail)) errors.push(`${p.id}: livello incoerente con strada e ferrovia`);
    if (!(Math.abs(p.lon) <= 180) || !(Math.abs(p.lat) <= 90)) errors.push(`${p.id}: coordinate non valide`);
  }
  if (riverIds) for (const p of file?.points ?? []) if (!riverIds.has(p.riverId)) errors.push(`${p.id}: fiume sconosciuto ${p.riverId}`);
  return errors;
}

function kmBetween(a, b) {
  return Math.hypot((a.lon - b.lon) * 111.32 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180), (a.lat - b.lat) * 110.57);
}

/**
 * Punti da mostrare sulla mappa: tutti i ponti da incroci strada/ferrovia più, tra i passaggi sul confine delle
 * province, solo quelli dove sullo stesso fiume non c'è un ponte entro `radiusKm` (lì il dato di strada manca:
 * restano come ipotesi con il livello provvisorio dalla larghezza del fiume). Ogni punto: { id, kind, riverId,
 * lon, lat, level, road, rail } con kind 'bridge' (da strada/ferrovia) oppure quello del passaggio di confine.
 */
export function mergeCandidates(bridges, borderPoints, { radiusKm = 15 } = {}) {
  const byRiver = new Map();
  for (const b of bridges) {
    const list = byRiver.get(b.riverId);
    if (list) list.push(b); else byRiver.set(b.riverId, [b]);
  }
  const out = bridges.map((b) => ({ id: b.id, kind: 'bridge', riverId: b.riverId, lon: b.lon, lat: b.lat, level: b.level, road: b.road, rail: b.rail, ang: b.ang }));
  for (const p of borderPoints) {
    if ((byRiver.get(p.riverId) ?? []).some((b) => kmBetween(b, p) < radiusKm)) continue;
    out.push({ id: p.id, kind: p.kind, riverId: p.riverId, lon: p.lon, lat: p.lat, level: p.level, road: 0, rail: 0, ang: null });
  }
  return out;
}
