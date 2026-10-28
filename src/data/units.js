import { parseCsvRows } from './csv.js';
// Catalogo cronologico delle unità (data/units/units.json), generato dal CSV dell'utente (data/units/source/) più le revisioni
// manuali (data/units/unit_reviews.json). Funzioni PURE senza I/O. Qualità: DA_VERIFICARE, NON è un ordine di battaglia 1936.
//
// Regola di attivazione (decisa il 28/10/2026, politica "strict"): un'unità è attiva a una data se la sua data di inizio
// (1° gennaio dell'anno, ASSUNTA: il CSV ha solo l'anno) non è successiva e la revisione non la segna come dubbia.
export const UNITS_SCHEMA = 'units-v1';
export const UNIT_CATEGORIES = ['infantry', 'mountain', 'cavalry', 'motorized', 'mechanized', 'armored', 'airborne', 'command'];
export const UNIT_ECHELONS = ['division', 'brigade', 'command'];
export const UNIT_VARIANTS = ['colonial', 'rifle', 'guards', 'ss', 'light'];
export const REVIEW_STATUSES = ['ok', 'corrected', 'date_doubt', 'duplicate', 'excluded', 'faction_doubt', 'placeholder'];
/** Stati di revisione che tengono l'unità INATTIVA finché non viene verificata. */
export const INACTIVE_REVIEW_STATUSES = ['date_doubt', 'duplicate', 'excluded', 'faction_doubt', 'placeholder'];
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
    if (!/^(U\d{5}|S36-[A-Z]+(-F)?-\d{3})$/.test(u.id ?? '')) errors.push(`unità: id non valido (${u.id})`);
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
      if (u.review.startYearOverride !== undefined && u.review.confidence !== 'certo' && u.review.basis !== 'user_file') errors.push(`unità ${u.id}: una data corretta richiede certezza "certo"`);
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

export const OOB_CONFIDENCE = ['certo', 'probabile', 'ipotesi'];
/** Errori delle stime aggregate dell'ordine di battaglia 1936 (righe CSV già parse). Sono intervalli, non unità. */
export function validateOobEstimates(rows, { nationIds } = {}) {
  const errors = [];
  if (rows.length === 0) errors.push('stime ordine di battaglia: file vuoto');
  rows.forEach((r, i) => {
    const at = `stime ordine di battaglia riga ${i + 2}`;
    if (nationIds && !nationIds.has(r.nation)) errors.push(`${at}: nazione ${r.nation} inesistente`);
    if (!UNIT_CATEGORIES.includes(r.category)) errors.push(`${at}: categoria ${r.category} non valida`);
    if (!['division', 'brigade', 'corps'].includes(r.echelon)) errors.push(`${at}: livello ${r.echelon} non valido`);
    const lo = Number(r.count_min); const hi = Number(r.count_max);
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 0 || hi < lo) errors.push(`${at}: intervallo ${r.count_min}-${r.count_max} non valido`);
    if (!OOB_CONFIDENCE.includes(r.confidence)) errors.push(`${at}: certezza ${r.confidence} non valida`);
    if (!String(r.source ?? '').trim()) errors.push(`${at}: senza fonte`);
  });
  return errors;
}

// --- File dell'utente con l'ordine di battaglia al 1/1/1936 (per ora solo Francia) ---
const D = (category, variant = null) => ({ category, echelon: 'division', variant });
const C = (commandLevel) => ({ category: 'command', echelon: 'command', variant: null, commandLevel });
/** Tipo del file utente → classificazione, per nazione. I tipi non elencati (marina, aviazione, SS, raggruppamenti) non entrano nel catalogo terrestre. */
export const OOB1936_TYPES = {
  FRA: { 'Divisione fanteria': D('infantry'), 'Divisione cavalleria': D('cavalry'), 'Divisione leggera meccanizzata': D('mechanized', 'light'), 'Divisione fanteria coloniale': D('infantry', 'colonial') },
  DEU: { 'Divisione fanteria': D('infantry'), 'Divisione corazzata': D('armored'), 'Divisione di cavalleria': D('cavalry'), "Corpo d'armata": C('corps'), 'Distretto militare': C('district') },
  USSR: {
    'Distretto militare / comando territoriale': C('district'), 'Corpo fucilieri': C('corps'), 'Corpo di cavalleria': C('corps'), 'Corpo meccanizzato': C('corps'),
    'Brigata aviotrasportata': { category: 'airborne', echelon: 'brigade', variant: null },
  },
};
/** Nome normalizzato per confrontare "1re Division d'infanterie" con "1re Division d'Infanterie" (maiuscole, accenti, ordinali). */
export function normalizeUnitName(name) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s'’\-]/g, '').replace(/^(\d+)(ere|re|er|e)/, '$1');
}
/**
 * Unisce le righe del file utente "ordine di battaglia 1936" al catalogo: un'unità già presente (stesso nome) viene anticipata
 * al 1936 con revisione basis "user_file" (certezza "probabile": è un dato fornito dall'utente, da verificare), una assente viene aggiunta
 * con id S36-<nazione>-nnn. Le unità in `doubts` (nome normalizzato → motivo) restano inattive (date_doubt).
 * Restituisce { units, skipped }: skipped = righe non importate (marina, aviazione, raggruppamenti: fuori dal catalogo terrestre).
 */
export function mergeOob1936(rows, units, { nation, doubts = {} }) {
  const out = units.map((u) => ({ ...u }));
  const skipped = []; let n = 0;
  for (const row of rows) {
    const mapped = OOB1936_TYPES[nation]?.[row.tipo_unita];
    if (!mapped) { skipped.push({ name: row.unita, type: row.tipo_unita }); continue; }
    const key = normalizeUnitName(row.unita);
    const doubt = doubts[key];
    const match = out.find((u) => u.nation === nation && normalizeUnitName(u.name) === key);
    const known = (v) => (v && !/^Da verificare/.test(v) ? v : undefined);
    const extra = Object.fromEntries(Object.entries({ station: known(row.provincia_stazione), corps: known(row.corpo_assegnazione), army: known(row.armata_assegnazione), note: row.note_fonte || undefined }).filter(([, v]) => v !== undefined));
    if (match) {
      Object.assign(match, { station: extra.station, corps: extra.corps, army: extra.army });
      for (const k of ['station', 'corps', 'army']) if (match[k] === undefined) delete match[k];
      if (doubt) match.review ??= { status: 'date_doubt', confidence: 'probabile', basis: 'user_file', reason: doubt };
      else if (match.startYear > 1936) {
        match.review = { status: 'corrected', confidence: 'probabile', basis: 'user_file', startYearOverride: 1936, reason: `Il file dell'utente (${row.data_riferimento}) la dà già presente; il CSV riporta ${match.sourceStartYear}. Da verificare (SHD).` };
        match.startYear = 1936;
      }
      continue;
    }
    // Stessa linea di una divisione già presente solo in versione motorizzata (es. 3e DI → 3e DI Motorisée): la versione 1936 termina l'anno prima.
    const successor = out.find((u) => u.nation === nation && normalizeUnitName(u.name) === `${key}motorisee`);
    n += 1;
    out.push({
      id: `S36-${nation}-${String(n).padStart(3, '0')}`, nation, branch: 'esercito', echelon: mapped.echelon, category: mapped.category, variant: mapped.variant, ...(mapped.commandLevel ? { commandLevel: mapped.commandLevel } : {}), name: row.unita, rawType: row.tipo_unita,
      startYear: 1936, sourceStartYear: 1936, startPrecision: 'year', dating: 'year', endYear: successor ? successor.startYear - 1 : null, ...(successor ? { supersededBy: successor.id } : {}), source: `File utente: ordine di battaglia 1/1/1936 (${nation})`, verification: 'DA_VERIFICARE',
      review: doubt ? { status: 'date_doubt', confidence: 'probabile', basis: 'user_file', reason: doubt } : null, ...extra,
    });
  }
  return { units: out, skipped };
}

/**
 * Legge il CSV dell'ordine di battaglia 1936. Le righe terrestri dei file ricevuti hanno una virgola in più (18 campi invece di 17,
 * un campo vuoto prima di data_riferimento): la riparazione è ammessa SOLO in quel caso e viene contata. Le righe con altro numero di colonne
 * (nei file ricevuti: marina e aviazione, campi spostati) NON vengono lette e sono elencate in `malformed`: mai un'ipotesi sulle colonne.
 */
export function parseOob1936Csv(text, { name = 'oob 1936' } = {}) {
  const [head, ...body] = parseCsvRows(text);
  const header = head.map((h) => h.trim());
  let repaired = 0;
  const rows = []; const malformed = [];
  body.forEach((r, i) => {
    let f = r;
    // virgola in più: un campo vuoto al posto di "aeroporto_provincia" + uno extra, subito prima di data_riferimento
    if (r.length === header.length + 1 && r[header.length - 2] === '' && /^\d{4}-\d{2}-\d{2}$/.test(r[header.length - 1])) { f = [...r.slice(0, header.length - 2), ...r.slice(header.length - 1)]; repaired += 1; }
    if (f.length !== header.length) { malformed.push({ line: i + 2, name: f[0], type: f[1], fields: f.length }); return; }
    rows.push(Object.fromEntries(header.map((h, k) => [h, f[k]])));
  });
  if (rows.length === 0) throw new Error(`${name}: nessuna riga valida`);
  return { rows, repaired, malformed };
}

/**
 * Segnaposto di divisioni (template da rivedere): `count` divisioni anonime assegnate in ordine ai comandi `corps` (nomi dei corpi).
 * Sono INATTIVE (revisione "placeholder"): non sono unità storiche, non hanno nome né numero reali. Ogni corpo riceve `perCorps` divisioni.
 */
export function makeDivisionPlaceholders({ nation, idPrefix, namePrefix, category, variant, corps, perCorps, startYear, reason }) {
  const out = [];
  corps.forEach((corpsName, c) => {
    for (let k = 0; k < perCorps; k += 1) {
      const n = c * perCorps + k + 1;
      out.push({
        id: `${idPrefix}-${String(n).padStart(3, '0')}`, nation, branch: 'esercito', echelon: 'division', category, variant, name: `${namePrefix} #${String(n).padStart(2, '0')}`,
        rawType: 'segnaposto', startYear, sourceStartYear: startYear, startPrecision: 'year', dating: 'year', endYear: null, source: 'Segnaposto generato: template da rivedere',
        verification: 'DA_VERIFICARE', placeholder: true, corps: corpsName,
        review: { status: 'placeholder', confidence: 'probabile', basis: 'user_file', reason },
      });
    }
  });
  return out;
}
