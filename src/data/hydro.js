// Centrali idroelettriche (data/resources/centrali_idroelettriche_1936_1945.csv, fornito dall'utente) → data/resources/hydro_plants.json.
// L'idroelettrica è un FLUSSO (potenza in MW): non consuma ingressi, non ha autoconsumo (deciso in chat 26/10/2026) e non diventa uno stock.
// Due CSV dell'utente: base pre-1936 (già in servizio all'inizio) e centrali 1936-45 (entrano in servizio alla data indicata, come eventi).
// Funzioni PURE: ricevono righe già lette e un indice delle province (buildProvinceIndex).
export const HYDRO_SCHEMA = 'hydro-plants-v1';
export const HYDRO_HEADER = Object.freeze(['Nome_Centrale', 'Nazione', 'Provincia_Stato_Contea', 'Anno', 'Mese', 'Potenza_MW', 'Coordinate']);
export const HYDRO_HEADER_PRE = Object.freeze(['Nome della Centrale', 'Nazione', 'Provincia / Stato / Contea', 'Anno e Mese', 'Potenza Output (MW)', 'Coordinate']);

/**
 * Righe dei due CSV dell'utente → forma unica { name, country, place, year, month, mw, coords }.
 * Formato 1936-45: colonne Anno e Mese (nome del mese). Formato pre-1936: «Anno e Mese» come AAAA-MM.
 */
export function normalizeHydroRows(rows, header) {
  if (header.join('|') === HYDRO_HEADER.join('|')) {
    return rows.map((r) => ({ name: r.Nome_Centrale, country: r.Nazione, place: r.Provincia_Stato_Contea, year: Number(r.Anno), month: MONTHS[String(r.Mese).trim().toLowerCase()] ?? 0, mw: Number(r.Potenza_MW), coords: r.Coordinate, era: 'event' }));
  }
  if (header.join('|') === HYDRO_HEADER_PRE.join('|')) {
    return rows.map((r) => { const m = /^(\d{4})-(\d{2})$/.exec(String(r['Anno e Mese']).trim()); return { name: r['Nome della Centrale'], country: r.Nazione, place: r['Provincia / Stato / Contea'], year: m ? Number(m[1]) : 0, month: m ? Number(m[2]) : 0, mw: Number(r['Potenza Output (MW)']), coords: r.Coordinate, era: 'pre1936' }; });
  }
  throw new Error(`idro: intestazione CSV sconosciuta (${header.join(', ')})`);
}
const MONTHS = Object.freeze({ gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12 });

export function plantId(name) {
  const base = String(name).split('(')[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `HYD-${base}`;
}

/** "36.0162, -114.7378" → { lat, lon } oppure null. */
export function parseCoordinates(text) {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(String(text));
  if (!m) return null;
  const lat = Number(m[1]); const lon = Number(m[2]);
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? { lat, lon } : null;
}

/**
 * Centrali con provincia, da righe normalizzate. Ritorna { plants, unmapped, ambiguous }: la provincia è quella che CONTIENE le coordinate;
 * se ne contiene più di una (o nessuna) la centrale va in unmapped/ambiguous e il validatore fallisce, niente scelte silenziose.
 * `overrides` (Map id → { province_id, reason }): per le coordinate sul fiume di confine, dove il poligono semplificato sbaglia lato.
 */
export function buildHydroPlants(rows, provinceIndex, { overrides = new Map(), sites = new Map(), parentOf = (f) => f.properties.parentProvince ?? f.properties.id } = {}) {
  const plants = []; const unmapped = []; const ambiguous = [];
  for (const r of rows) {
    const id = plantId(r.name);
    const c = parseCoordinates(r.coords);
    const hits = c ? [...new Set(provinceIndex.provincesAt(c.lon, c.lat).map(parentOf))] : [];
    const ov = overrides.get(id);
    if (!c || (hits.length === 0 && !ov)) { unmapped.push(id); continue; }
    if (hits.length > 1 && !ov) { ambiguous.push({ id, hits }); continue; }
    const plant = {
      id, name: r.name, country_text: r.country, place_text: r.place,
      provinceId: ov ? ov.province_id : hits[0], lat: c.lat, lon: c.lon, megawatts: r.mw,
      validFrom: `${r.year}-${String(r.month).padStart(2, '0')}-01`, dateBasis: 'month',
      era: r.era, quality: 'user_csv',
    };
    if (sites.has(id)) plant.siteId = sites.get(id);
    if (ov) { plant.provinceOverride = true; plant.provinceFromCoordinates = hits[0] ?? null; plant.overrideReason = ov.reason; }
    plants.push(plant);
  }
  return { plants, unmapped, ambiguous };
}

export function hydroFile(built) {
  return { schema: HYDRO_SCHEMA, quality: 'user_csv', note: 'era=pre1936: già in servizio al 1/1/1936 (base); era=event: entra in servizio a validFrom (primo giorno del mese). Solo le centrali fornite dall\'utente: la base NON è completa.', plants: built.plants };
}

/** Errori (lista vuota = valido). ctx: { motherIds: Set } */
export function validateHydro(file, { motherIds, builtUnmapped = [], builtAmbiguous = [] } = {}) {
  const errors = [];
  if (file?.schema !== HYDRO_SCHEMA) return [`idro: schema ${file?.schema}, atteso ${HYDRO_SCHEMA}`];
  for (const id of builtUnmapped) errors.push(`idro: ${id} senza provincia (coordinate fuori da ogni provincia)`);
  for (const a of builtAmbiguous) errors.push(`idro: ${a.id} in più province (${a.hits.join(', ')})`);
  const seen = new Set();
  for (const p of file.plants ?? []) {
    if (seen.has(p.id)) errors.push(`idro: id duplicato ${p.id}`);
    seen.add(p.id);
    if (motherIds && !motherIds.has(p.provinceId)) errors.push(`idro: ${p.id} in una provincia inesistente (${p.provinceId})`);
    if (!(p.megawatts > 0)) errors.push(`idro: ${p.id} con potenza non valida`);
    if (!/^\d{4}-(0[1-9]|1[0-2])-01$/.test(p.validFrom)) errors.push(`idro: ${p.id} con data non valida ${p.validFrom}`);
    if (p.siteId !== undefined && !/^SITE-[A-Z0-9_]+$/.test(p.siteId)) errors.push(`idro: ${p.id} con siteId non valido`);
    if (!['pre1936', 'event'].includes(p.era)) errors.push(`idro: ${p.id} con era sconosciuta ${p.era}`);
    if ((p.era === 'pre1936') !== (p.validFrom < '1936-01-01')) errors.push(`idro: ${p.id} con era ${p.era} incoerente con la data ${p.validFrom}`);
    if (p.provinceOverride && !String(p.overrideReason ?? '').trim()) errors.push(`idro: ${p.id} con provincia forzata senza motivo`);
    if (!['user_csv', 'DESIGN_DEFAULT'].includes(p.quality)) errors.push(`idro: ${p.id} con qualità sconosciuta ${p.quality}`);
  }
  return errors;
}

/**
 * Potenza idroelettrica installata a una data (MW): somma delle centrali già in servizio. Le fasi di uno stesso sito (`siteId`) sono
 * AGGIUNTIVE (deciso in chat 26/10/2026): Vemork 108 + 108, Cubatão 84 + 440. `provinceId` filtra una provincia; senza, il totale.
 */
export function installedMegawatts(file, date, { provinceId = null } = {}) {
  return (file.plants ?? []).filter((p) => p.validFrom <= date && (provinceId === null || p.provinceId === provinceId)).reduce((t, p) => t + p.megawatts, 0);
}
