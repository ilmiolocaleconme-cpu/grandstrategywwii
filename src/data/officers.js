// Catalogo ufficiali (data/officers/officers.json), generato dal CSV dell'utente (data/officers/source/) più le revisioni manuali.
// Funzioni PURE senza I/O. Qualità: DA_VERIFICARE. Modello a due livelli: la PERSONA compare in più righe (incarichi) con id diversi.
import { NATION_IDS } from './units.js';

export const OFFICERS_SCHEMA = 'officers-v1';
export const OFFICER_LEVELS = ['army_group', 'army', 'corps', 'division', 'theater', 'high_command', 'staff'];
export const OFFICER_BRANCH_TYPES = ['land', 'air', 'navy'];
export const OFFICER_REVIEW_STATUSES = ['ok', 'date_doubt', 'duplicate'];
export const OFFICER_INACTIVE_STATUSES = ['date_doubt', 'duplicate'];
export const OFFICER_WINDOW_START = '1935-01-01';

const AIR = /Luftwaffe|Aeronautica|Air Service|Air Force|Royal Air Force|Armée de l'Air|Voenno-Vozdushnye|USAAF|Chinese Air Force/;
const NAVY = /Kriegsmarine|Regia Marina|IJN|Royal Navy|Marine Nationale|Voenno-Morskoj|US Navy|Republic of China Navy/;
const LAND = /^(Heer|Heer\/Waffen-SS|Regio Esercito|IJA|British Army|Armée de Terre|Armata Rossa|US Army|National Revolutionary Army)$/;

/** 'land' | 'air' | 'navy' dalla forza armata del CSV; lancia un Error se non riconosciuta (mai un'ipotesi silenziosa). */
export function officerBranchType(branch) {
  if (AIR.test(branch)) return 'air';
  if (NAVY.test(branch)) return 'navy';
  if (LAND.test(branch)) return 'land';
  throw new Error(`forza armata non riconosciuta: ${branch}`);
}

/** Livelli di comando (insieme) dal campo livello_comando ("Army/Army Group", "Corps/Panzer Corps"...). Solo per ufficiali di terra. */
export function officerLevels(levelRaw) {
  const out = new Set();
  for (const token of levelRaw.split('/').map((t) => t.trim())) {
    if (/Army Group|Area Army|^Front$/.test(token)) out.add('army_group');
    else if (/Corps/.test(token)) out.add('corps');
    else if (/Division/.test(token)) out.add('division');
    else if (/^Theater/.test(token)) out.add('theater');
    else if (/Tank Army|^Army$|^Army Command$/.test(token)) out.add('army');
    else if (/High Command|General Command|Supreme Command|National Command|^Army$/.test(token)) out.add('high_command');
    else if (/Staff|Planning/.test(token)) out.add('staff');
    else if (/^Cavalry$/.test(token)) out.add('corps');
    else throw new Error(`livello di comando non riconosciuto: "${token}" (in "${levelRaw}")`);
  }
  return OFFICER_LEVELS.filter((l) => out.has(l));
}

/** Righe (record) di un CSV con ';' (BOM ammesso, nessuna virgoletta ammessa: errore). */
export function parseSemicolonCsv(text, { name = 'CSV' } = {}) {
  if (text.includes('"')) throw new Error(`${name}: virgolette non supportate`);
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l !== '');
  const header = lines[0].split(';');
  return lines.slice(1).map((l, i) => {
    const f = l.split(';');
    if (f.length !== header.length) throw new Error(`${name}: riga ${i + 2} con ${f.length} campi invece di ${header.length}`);
    return Object.fromEntries(header.map((h, k) => [h, f[k]]));
  });
}

/** Ufficiali da righe CSV e revisioni { officer_id: {status, confidence, reason, duplicateOf?} }. */
export function buildOfficers(rows, reviews = {}) {
  return rows.map((r) => {
    const nation = NATION_IDS[r.nazione];
    if (!nation) throw new Error(`ufficiale ${r.officer_id}: nazione "${r.nazione}" senza id`);
    const branchType = officerBranchType(r.forza_armata);
    return {
      id: r.officer_id, personKey: r.nome_ufficiale, name: r.nome_ufficiale, nation, branch: r.forza_armata, branchType,
      levelRaw: r.livello_comando, levels: branchType === 'land' ? officerLevels(r.livello_comando) : [], role: r.ruolo, rank: r.grado_periodo,
      availableFrom: r.data_inizio_disponibilita, availableTo: r.data_fine_disponibilita,
      dating: r.data_inizio_disponibilita === OFFICER_WINDOW_START ? 'window_start' : 'date',
      exampleFormation: r.formazione_esempio, source: r.fonte_riferimento, verification: r.stato_verifica,
      historicalMode: r.modalita_storica === 'SI', alternativeMode: r.modalita_alternativa === 'SI', review: reviews[r.officer_id] ?? null,
    };
  });
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** Errori del catalogo ufficiali. nationIds: id di political_1936.json. */
export function validateOfficers(doc, { nationIds } = {}) {
  const errors = [];
  if (doc?.schema !== OFFICERS_SCHEMA) return [`ufficiali: schema ${doc?.schema}, atteso ${OFFICERS_SCHEMA}`];
  if (doc.quality !== 'DA_VERIFICARE') errors.push('ufficiali: qualità attesa DA_VERIFICARE');
  const list = doc.officers ?? [];
  if (list.length === 0) errors.push('ufficiali: catalogo vuoto');
  const ids = new Set(); const seen = new Map();
  for (const o of list) {
    if (!/^OFF-\d{4}$/.test(o.id ?? '')) errors.push(`ufficiale: id non valido (${o.id})`);
    if (ids.has(o.id)) errors.push(`ufficiale: id duplicato ${o.id}`);
    ids.add(o.id);
    if (!String(o.name ?? '').trim()) errors.push(`ufficiale ${o.id}: senza nome`);
    if (nationIds && !nationIds.has(o.nation)) errors.push(`ufficiale ${o.id}: nazione ${o.nation} inesistente`);
    if (!OFFICER_BRANCH_TYPES.includes(o.branchType)) errors.push(`ufficiale ${o.id}: tipo di forza armata ${o.branchType} non valido`);
    if (o.branchType === 'land' && o.levels.length === 0) errors.push(`ufficiale ${o.id}: nessun livello di comando`);
    for (const l of o.levels ?? []) if (!OFFICER_LEVELS.includes(l)) errors.push(`ufficiale ${o.id}: livello ${l} non valido`);
    if (!ISO.test(o.availableFrom) || !ISO.test(o.availableTo)) errors.push(`ufficiale ${o.id}: date non ISO`);
    else if (o.availableTo < o.availableFrom) errors.push(`ufficiale ${o.id}: fine precedente all'inizio`);
    const key = [o.nation, o.name, o.levelRaw, o.exampleFormation, o.availableFrom, o.availableTo].join('|');
    if (seen.has(key) && o.review?.status !== 'duplicate' && seen.get(key).review?.status !== 'duplicate') errors.push(`ufficiali: ${o.id} e ${seen.get(key).id} identici senza revisione "duplicate"`);
    seen.set(key, o);
    if (o.review) {
      if (!OFFICER_REVIEW_STATUSES.includes(o.review.status)) errors.push(`ufficiale ${o.id}: stato di revisione ${o.review.status} non valido`);
      if (!String(o.review.reason ?? '').trim()) errors.push(`ufficiale ${o.id}: revisione senza motivo`);
    }
  }
  for (const o of list) if (o.review?.duplicateOf && !ids.has(o.review.duplicateOf)) errors.push(`ufficiale ${o.id}: duplicateOf ${o.review.duplicateOf} inesistente`);
  return errors;
}

/** true se l'ufficiale è disponibile alla data ISO (estremi inclusi). Politica strict: escluse le revisioni date_doubt/duplicate. */
export function isOfficerAvailable(officer, isoDate, { policy = 'strict' } = {}) {
  if (!ISO.test(isoDate)) throw new Error(`data non valida: ${isoDate}`);
  if (isoDate < officer.availableFrom || isoDate > officer.availableTo) return false;
  if (policy === 'strict' && officer.review && OFFICER_INACTIVE_STATUSES.includes(officer.review.status)) return false;
  return true;
}
