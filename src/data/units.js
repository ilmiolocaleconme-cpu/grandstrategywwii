// Catalogo cronologico delle unità (data/units/units.json), generato dal CSV dell'utente (data/units/source/) più le revisioni
// manuali (data/units/unit_reviews.json). Funzioni PURE senza I/O. Qualità: DA_VERIFICARE, NON è un ordine di battaglia 1936.
//
// Regola di attivazione (decisa il 28/10/2026, politica "strict"): un'unità è attiva a una data se la sua data di inizio
// (1° gennaio dell'anno, ASSUNTA: il CSV ha solo l'anno) non è successiva e la revisione non la segna come dubbia.
export const UNITS_SCHEMA = 'units-v1';
export const UNIT_CATEGORIES = ['infantry', 'mountain', 'cavalry', 'motorized', 'mechanized', 'armored', 'airborne', 'command'];
export const UNIT_ECHELONS = ['division', 'brigade', 'command'];
export const UNIT_VARIANTS = ['colonial', 'rifle', 'guards', 'ss', 'light'];
export const REVIEW_STATUSES = ['ok', 'corrected', 'date_doubt', 'duplicate', 'excluded', 'faction_doubt'];
/** Stati di revisione che tengono l'unità INATTIVA finché non viene verificata. */
export const INACTIVE_REVIEW_STATUSES = ['date_doubt', 'duplicate', 'excluded', 'faction_doubt'];
export const REVIEW_CONFIDENCE = ['certo', 'probabile'];
export const WINDOW_START_YEAR = 1935; // il CSV usa 1935 come inizio della finestra, non come data di costituzione

/** Nome della nazione nel CSV → id di data/political_1936.json. */
export const NATION_IDS = {
  Cina: 'CHN', Francia: 'FRA', Germania: 'DEU', Giappone: 'JPN', Italia: 'ITA', 'Regno Unito': 'GBR', URSS: 'USSR', USA: 'USA',
};

const COMMAND_TYPES = new Set(["gruppo d'armate", 'armata', 'teatro', 'comando superiore', 'fronte/comando']);
const BY_TYPE = {
  fanteria: ['infantry', null], motorizzata: ['motorized', null], meccanizzata: ['mechanized', null], corazzata: ['armored', null],
  alpina: ['mountain', null], montagna: ['mountain', null], coloniale: ['infantry', 'colonial'], paracadutisti: ['airborne', null],
  aviotrasportata: ['airborne', null], fucilieri: ['infantry', 'rifle'], guardie: ['infantry', 'guards'], divisione: ['infantry', null],
};

/** { category, echelon, variant } di una riga del CSV. Lancia un Error se non riesce a classificarla (mai un'ipotesi silenziosa). */
export function classifyUnit(row) {
  const name = row.nome_formazione; const type = row.tipo;
  if (row.livello === 'comando' || COMMAND_TYPES.has(type)) return { category: 'command', echelon: 'command', variant: null };
  const echelon = /Brigade/.test(name) ? 'brigade' : 'division';
  let found = null;
  if (/Tank (Brigade|Division)/.test(name)) found = ['armored', null];
  else if (/Panzer/.test(name)) found = ['armored', /SS-Panzer/.test(name) ? 'ss' : null];
  else if (/Gebirgs/.test(name)) found = ['mountain', null];
  else if (/Kavallerie/.test(name)) found = ['cavalry', null];
  else if (/leichte Division/.test(name)) found = ['mechanized', 'light'];
  else if (/Fallschirmj|Parachute/.test(name)) found = ['airborne', null];
  else if (/Guards Division/.test(name) && row.nazione === 'Giappone') found = ['infantry', 'guards'];
  else if (/Infanterie-Division/.test(name)) found = ['infantry', null];
  else if (BY_TYPE[type]) found = BY_TYPE[type];
  if (!found) throw new Error(`unità ${row.unit_id} (${name}, tipo ${type}): categoria non classificabile`);
  return { category: found[0], echelon, variant: found[1] };
}

/** Unità del catalogo da righe CSV (già parse) e revisioni { unit_id: {status, reason, confidence, startYearOverride?, duplicateOf?} }. */
export function buildUnits(rows, reviews = {}) {
  return rows.map((row) => {
    const nation = NATION_IDS[row.nazione];
    if (!nation) throw new Error(`unità ${row.unit_id}: nazione "${row.nazione}" senza id`);
    const sourceStartYear = Number(row.data_inizio);
    const review = reviews[row.unit_id] ?? null;
    const startYear = review?.startYearOverride ?? sourceStartYear;
    const { category, echelon, variant } = classifyUnit(row);
    return {
      id: row.unit_id, nation, branch: row.forza_armata, echelon, category, variant, name: row.nome_formazione, rawType: row.tipo,
      startYear, sourceStartYear, startPrecision: 'year', dating: sourceStartYear === WINDOW_START_YEAR ? 'window_start' : 'year',
      endYear: row.data_fine === '' ? null : Number(row.data_fine), source: row.fonte_riferimento, verification: row.stato_cronologia,
      review,
    };
  });
}

/** Errori del catalogo e delle revisioni. nationIds: id di political_1936.json. */
export function validateUnits(doc, { nationIds } = {}) {
  const errors = [];
  if (doc?.schema !== UNITS_SCHEMA) return [`unità: schema ${doc?.schema}, atteso ${UNITS_SCHEMA}`];
  if (doc.quality !== 'DA_VERIFICARE') errors.push('unità: qualità attesa DA_VERIFICARE');
  const units = doc.units ?? [];
  if (units.length === 0) errors.push('unità: catalogo vuoto');
  const ids = new Set(); const byName = new Map();
  for (const u of units) {
    if (!/^U\d{5}$/.test(u.id ?? '')) errors.push(`unità: id non valido (${u.id})`);
    if (ids.has(u.id)) errors.push(`unità: id duplicato ${u.id}`);
    ids.add(u.id);
    if (!String(u.name ?? '').trim()) errors.push(`unità ${u.id}: senza nome`);
    if (nationIds && !nationIds.has(u.nation)) errors.push(`unità ${u.id}: nazione ${u.nation} inesistente in political_1936.json`);
    if (!UNIT_CATEGORIES.includes(u.category)) errors.push(`unità ${u.id}: categoria ${u.category} non valida`);
    if (!UNIT_ECHELONS.includes(u.echelon)) errors.push(`unità ${u.id}: livello ${u.echelon} non valido`);
    if (u.variant !== null && !UNIT_VARIANTS.includes(u.variant)) errors.push(`unità ${u.id}: variante ${u.variant} non valida`);
    if ((u.category === 'command') !== (u.echelon === 'command')) errors.push(`unità ${u.id}: categoria ${u.category} incoerente con il livello ${u.echelon}`);
    if (!Number.isInteger(u.startYear) || u.startYear < 1900 || u.startYear > 1945) errors.push(`unità ${u.id}: anno di inizio ${u.startYear} non valido`);
    if (u.endYear !== null && (!Number.isInteger(u.endYear) || u.endYear < u.startYear)) errors.push(`unità ${u.id}: anno di fine ${u.endYear} precedente all'inizio`);
    if (u.startPrecision !== 'year') errors.push(`unità ${u.id}: precisione ${u.startPrecision} (il CSV ha solo l'anno)`);
    const key = `${u.nation}|${u.name.toLowerCase()}`;
    if (byName.has(key) && u.review?.status !== 'duplicate' && byName.get(key).review?.status !== 'duplicate') errors.push(`unità: ${u.id} e ${byName.get(key).id} hanno lo stesso nome (${u.name}) senza revisione "duplicate"`);
    byName.set(key, u);
    if (u.review) {
      if (!REVIEW_STATUSES.includes(u.review.status)) errors.push(`unità ${u.id}: stato di revisione ${u.review.status} non valido`);
      if (!String(u.review.reason ?? '').trim()) errors.push(`unità ${u.id}: revisione senza motivo`);
      if (!REVIEW_CONFIDENCE.includes(u.review.confidence)) errors.push(`unità ${u.id}: revisione senza livello di certezza`);
      if (u.review.startYearOverride !== undefined && u.review.confidence !== 'certo') errors.push(`unità ${u.id}: una data corretta richiede certezza "certo"`);
      if (u.review.startYearOverride !== undefined && u.startYear !== u.review.startYearOverride) errors.push(`unità ${u.id}: anno effettivo diverso dalla correzione`);
      if (u.review.status === 'corrected' && u.review.startYearOverride === undefined) errors.push(`unità ${u.id}: "corrected" senza startYearOverride`);
    } else if (u.startYear !== u.sourceStartYear) errors.push(`unità ${u.id}: data modificata senza revisione`);
  }
  for (const u of units) if (u.review?.duplicateOf && !ids.has(u.review.duplicateOf)) errors.push(`unità ${u.id}: duplicateOf ${u.review.duplicateOf} inesistente`);
  return errors;
}

/** true se l'unità è attiva alla data ISO (YYYY-MM-DD). Inizio = 1° gennaio dell'anno (assunto); fine = 31 dicembre. */
export function isActiveAt(unit, isoDate, { policy = 'strict' } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new Error(`data non valida: ${isoDate}`);
  if (isoDate < `${unit.startYear}-01-01`) return false;
  if (unit.endYear !== null && isoDate > `${unit.endYear}-12-31`) return false;
  if (policy === 'strict' && unit.review && INACTIVE_REVIEW_STATUSES.includes(unit.review.status)) return false;
  return true;
}

export function unitsActiveAt(units, isoDate, { nation, policy = 'strict' } = {}) {
  return units.filter((u) => (nation === undefined || u.nation === nation) && isActiveAt(u, isoDate, { policy }));
}

/** Conteggio per nazione e categoria delle unità attive (solo scaglioni diversi da "command" salvo includeCommands). */
export function countActive(units, isoDate, { policy = 'strict', includeCommands = false } = {}) {
  const out = {};
  for (const u of unitsActiveAt(units, isoDate, { policy })) {
    if (u.category === 'command' && !includeCommands) continue;
    out[u.nation] ??= {};
    out[u.nation][u.category] = (out[u.nation][u.category] ?? 0) + 1;
  }
  return out;
}
