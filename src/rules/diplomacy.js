// Diplomazia minima (30/10/2026). Funzioni PURE sul documento `state.diplomacy` (campo OPZIONALE dello stato, nessuna migrazione).
// Documento: { schema, relations: { 'A|B': numero -100..100 } (assente = 0), alliances: { 'A|B': { since } }, access: { 'titolare>ospitante': { since } } }.
// L'accesso è a senso unico: 'A>B' = A può muovere truppe nel territorio di B. Un'alleanza dà l'accesso reciproco.
import { pairKey } from './war.js';

export const DIPLOMACY_SCHEMA = 'diplomacy-v1';

export const createDiplomacy = () => ({ schema: DIPLOMACY_SCHEMA, relations: {}, alliances: {}, access: {}, proposals: [] });

const r2 = (x) => Math.round(x * 100) / 100;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export const relationOf = (d, a, b) => (a === b ? 0 : d?.relations?.[pairKey(a, b)] ?? 0);

export function setRelation(d, a, b, value, { min = -100, max = 100 } = {}) {
  if (a === b) return d;
  const v = r2(clamp(value, min, max));
  const k = pairKey(a, b);
  const { [k]: _old, ...rest } = d.relations;
  return { ...d, relations: v === 0 ? rest : { ...rest, [k]: v } };
}

export const addRelation = (d, a, b, delta, range) => setRelation(d, a, b, relationOf(d, a, b) + delta, range);

export const areAllied = (d, a, b) => a !== b && Boolean(d?.alliances?.[pairKey(a, b)]);

export function alliesOf(d, nation) {
  const out = [];
  for (const k of Object.keys(d?.alliances ?? {})) { const [x, y] = k.split('|'); if (x === nation) out.push(y); else if (y === nation) out.push(x); }
  return out.sort();
}

export const addAlliance = (d, a, b, date) => ({ ...d, alliances: { ...d.alliances, [pairKey(a, b)]: { since: date } } });
export function removeAlliance(d, a, b) { const { [pairKey(a, b)]: _g, ...alliances } = d.alliances; return { ...d, alliances }; }

/** `holder` può muovere truppe nel territorio di `host`: alleanza o accordo di accesso. */
export const hasAccess = (d, holder, host) => holder !== host && (areAllied(d, holder, host) || Boolean(d?.access?.[`${holder}>${host}`]));

export const grantAccess = (d, holder, host, date) => ({ ...d, access: { ...d.access, [`${holder}>${host}`]: { since: date } } });
export function revokeAccess(d, holder, host) { const { [`${holder}>${host}`]: _g, ...access } = d.access; return { ...d, access }; }
/** Toglie gli accessi in entrambe le direzioni (usato alla guerra). */
export const clearAccessBetween = (d, a, b) => revokeAccess(revokeAccess(d, a, b), b, a);

/** Nazioni ostili a `nation`: in guerra con lei o con rapporto <= soglia. `nationIds` limita i candidati. */
export function hostilesOf(d, war, nation, nationIds, maxRelation) {
  const warPairs = Object.keys(war?.pairs ?? {});
  return nationIds.filter((t) => t !== nation && (warPairs.includes(pairKey(t, nation)) || relationOf(d, nation, t) <= maxRelation)).sort();
}

export function validateDiplomacy(d) {
  if (d === undefined) return [];
  if (d === null || typeof d !== 'object' || Array.isArray(d)) return ['diplomazia: non è un oggetto'];
  const errors = [];
  if (d.schema !== DIPLOMACY_SCHEMA) errors.push(`diplomazia: schema ${JSON.stringify(d.schema)}`);
  const keyOk = (k) => { const p = k.split('|'); return p.length === 2 && p[0] !== '' && p[0] < p[1]; };
  for (const part of ['relations', 'alliances', 'access']) if (d[part] === null || typeof d[part] !== 'object' || Array.isArray(d[part])) return [...errors, `diplomazia: ${part} mancante`];
  for (const [k, v] of Object.entries(d.relations)) if (!keyOk(k) || !Number.isFinite(v) || v < -100 || v > 100) errors.push(`diplomazia: rapporto ${JSON.stringify(k)} non valido`);
  for (const [k, v] of Object.entries(d.alliances)) { if (!keyOk(k)) errors.push(`diplomazia: alleanza ${JSON.stringify(k)} non valida`); if (typeof v?.since !== 'string') errors.push(`diplomazia: alleanza ${k} senza data`); }
  for (const [k, v] of Object.entries(d.access)) { const p = k.split('>'); if (p.length !== 2 || p[0] === '' || p[1] === '' || p[0] === p[1]) errors.push(`diplomazia: accesso ${JSON.stringify(k)} non valido`); if (typeof v?.since !== 'string') errors.push(`diplomazia: accesso ${k} senza data`); }
  if (d.proposals !== undefined) {
    if (!Array.isArray(d.proposals)) errors.push('diplomazia: proposals non è una lista');
    else for (const x of d.proposals) if (typeof x?.id !== 'string' || typeof x?.from !== 'string' || typeof x?.to !== 'string' || x.from === x.to || x?.kind !== 'alliance' || typeof x?.date !== 'string') errors.push(`diplomazia: proposta ${JSON.stringify(x?.id)} non valida`);
  }
  return errors;
}

/** Controlla il file dei parametri (diplomacy.json). */
export function validateDiplomacyConfig(c) {
  const errors = [];
  const num = (path, v) => { if (!Number.isFinite(v)) errors.push(`diplomazia config: ${path} non è un numero`); };
  const need = (o, k) => { if (!o || typeof o !== 'object') { errors.push(`diplomazia config: manca ${k}`); return {}; } return o; };
  const rel = need(c?.relation, 'relation'); num('relation.min', rel.min); num('relation.max', rel.max);
  if (rel.min >= rel.max) errors.push('diplomazia config: relation.min >= relation.max');
  const t = need(c?.trade, 'trade'); num('trade.minRelation', t.minRelation); num('trade.dailyGain', t.dailyGain); num('trade.gainCap', t.gainCap);
  num('sabotage.maxRelation', need(c?.sabotage, 'sabotage').maxRelation);
  const i = need(c?.improve, 'improve'); num('improve.ecv', i.ecv); num('improve.gain', i.gain); num('improve.maxRelation', i.maxRelation);
  const al = need(c?.alliance, 'alliance'); num('alliance.minRelation', al.minRelation); num('alliance.ecv', al.ecv); num('alliance.breakPenalty', al.breakPenalty);
  const ac = need(c?.access, 'access'); num('access.minRelation', ac.minRelation); num('access.ecv', ac.ecv);
  const w = need(c?.war, 'war'); for (const k of ['victimPenalty', 'victimAlliesPenalty', 'dailyDrift', 'peaceMinRelation', 'afterPeaceRelation']) num(`war.${k}`, w[k]);
  const ai = need(c?.ai, 'ai'); num('ai.period', ai.period); num('ai.reserveEcv', ai.reserveEcv);
  if (Number.isFinite(ai.period) && ai.period < 1) errors.push('diplomazia config: ai.period < 1');
  const pr = need(c?.proposals, 'proposals'); num('proposals.expireDays', pr.expireDays); num('proposals.rejectPenalty', pr.rejectPenalty);
  if (Number.isFinite(t.minRelation) && Number.isFinite(c?.sabotage?.maxRelation) && c.sabotage.maxRelation >= t.minRelation) errors.push('diplomazia config: la soglia di sabotaggio deve stare sotto quella del commercio');
  if (!['DESIGN_DEFAULT', 'hypothesis'].includes(c?.quality)) errors.push('diplomazia config: quality deve essere DESIGN_DEFAULT o hypothesis');
  return errors;
}

/** Controlla il file della situazione iniziale. */
export function validateDiplomacyStart(doc, nationIds) {
  const errors = [];
  const known = new Set(nationIds);
  const seen = new Set();
  for (const [a, b, v] of doc?.relations ?? []) {
    if (!known.has(a) || !known.has(b) || a === b) errors.push(`diplomazia 1936: coppia ${a}-${b} non valida`);
    if (!Number.isFinite(v) || v < -100 || v > 100) errors.push(`diplomazia 1936: rapporto ${a}-${b} fuori scala`);
    const k = pairKey(a, b); if (seen.has(k)) errors.push(`diplomazia 1936: coppia ${k} duplicata`); seen.add(k);
  }
  for (const [a, b] of doc?.alliances ?? []) {
    if (!known.has(a) || !known.has(b) || a === b) errors.push(`diplomazia 1936: alleanza ${a}-${b} non valida`);
    else if (!seen.has(pairKey(a, b))) errors.push(`diplomazia 1936: alleanza ${a}-${b} senza rapporto iniziale`);
  }
  if (doc?.quality !== 'hypothesis') errors.push('diplomazia 1936: quality deve restare hypothesis finché i valori sono stime');
  return errors;
}
