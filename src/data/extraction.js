// Estrazione giornaliera per provincia (t/giorno di gioco). Funzioni PURE.
// Per un territorio con produzione storica 1936 (data/resources/production_1936.json): Mt/anno → t/giorno con il fattore della risorsa
// (data/resources/extraction_factors.json), poi ripartiti tra le sue province con punti in proporzione ai punti base.
// Per il resto: punti × scala (data/resources/extraction_scale.json), come prima. Se un territorio ha produzione ma nessuna provincia con punti
// per quella risorsa, NON si inventa una provincia: finisce in `unallocated` (MISSING_DATA) finché non si sceglie dove.
export const EXTRACTION_FACTORS_SCHEMA = 'extraction-factors-v1';
const round = (v) => Math.round(v * 10) / 10;

export function validateExtractionFactors(file, { resources, production }) {
  const errors = [];
  if (file?.schema !== EXTRACTION_FACTORS_SCHEMA) return [`fattori di estrazione: schema ${file?.schema}, atteso ${EXTRACTION_FACTORS_SCHEMA}`];
  const known = new Set(resources.map((r) => r.id));
  for (const [id, f] of Object.entries(file.factors ?? {})) {
    if (!known.has(id)) errors.push(`fattori di estrazione: ${id} non esiste in resources.json`);
    if (!(f.realPerGame > 0)) errors.push(`fattori di estrazione: ${id} con realPerGame non valido`);
    if (!['DESIGN_DEFAULT', 'PROVISIONAL'].includes(f.status)) errors.push(`fattori di estrazione: ${id} con stato sconosciuto "${f.status}"`);
    if (!String(f.rationale ?? '').trim()) errors.push(`fattori di estrazione: ${id} senza motivazione`);
  }
  for (const r of production?.rows ?? []) if (!(r.resource in (file.factors ?? {}))) errors.push(`fattori di estrazione: manca il fattore di ${r.resource}, che ha produzione storica`);
  return errors;
}

/**
 * pointsByProvince: { provinceId: { risorsa: { base } } } (resource_points.json `byProvince`)
 * Ritorna { byProvince: Map(provinceId → t/giorno), unallocated: [{resource, territory, tonsPerDay}], total }
 */
export function resourceExtraction(resourceId, { production, factors, scaleFile, pointsByProvince }) {
  const factor = factors.factors[resourceId]?.realPerGame;
  const scale = scaleFile.unitsPerPoint?.[resourceId];
  const byProvince = new Map();
  const unallocated = [];
  const covered = new Set();
  const basePts = (id) => pointsByProvince[id]?.[resourceId]?.base ?? 0;
  const ids = Object.keys(pointsByProvince).filter((id) => basePts(id) > 0);
  for (const r of (production.rows ?? []).filter((x) => x.resource === resourceId)) {
    const start = r.scope ?? `P_${r.prefix}_`;
    const mine = ids.filter((id) => id.startsWith(start));
    const tpd = (r.mt * 1e6) / 365 / factor;
    const sum = mine.reduce((s, id) => s + basePts(id), 0);
    if (mine.length === 0) { unallocated.push({ resource: resourceId, territory: r.territory, tonsPerDay: round(tpd) }); continue; }
    for (const id of mine) { byProvince.set(id, round(tpd * basePts(id) / sum)); covered.add(id); }
  }
  for (const id of ids) if (!covered.has(id) && typeof scale === 'number') byProvince.set(id, round(basePts(id) * scale));
  let total = 0;
  for (const v of byProvince.values()) total += v;
  return { byProvince, unallocated, total: round(total) };
}

/** Totale per prefisso della nazione (P_<prefisso>_): comodo per tabelle e test. */
export function totalByPrefix(extraction, prefix) {
  let t = 0;
  for (const [id, v] of extraction.byProvince) if (id.startsWith(`P_${prefix}_`)) t += v;
  return round(t);
}
