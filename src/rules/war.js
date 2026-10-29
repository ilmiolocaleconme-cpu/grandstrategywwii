// Stato di guerra tra nazioni. Funzioni PURE. SCELTA PROVVISORIA (30/10/2026): la diplomazia non esiste ancora, quindi la guerra la
// dichiara il giocatore a mano (e l'IA non la dichiara: MANCANTE). Campo OPZIONALE `state.war` (assente = nessuna guerra), niente migrazione.
export const WAR_SCHEMA = 'war-v1';

export const createWar = () => ({ schema: WAR_SCHEMA, pairs: {} });

/** Chiave stabile della coppia (ordine alfabetico). */
export const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export function atWar(war, a, b) {
  return Boolean(war?.pairs?.[pairKey(a, b)]) && a !== b;
}

/** Nazioni in guerra con `nation`. */
export function enemiesOf(war, nation) {
  const out = [];
  for (const k of Object.keys(war?.pairs ?? {})) {
    const [x, y] = k.split('|');
    if (x === nation) out.push(y); else if (y === nation) out.push(x);
  }
  return out.sort();
}

/** Dichiara guerra. Lancia un Error su nazioni uguali o mancanti e se già in guerra. */
export function declareWar(war, { a, b, date }) {
  if (typeof a !== 'string' || typeof b !== 'string' || a === '' || b === '') throw new Error('guerra: nazioni mancanti');
  if (a === b) throw new Error('una nazione non può dichiarare guerra a sé stessa');
  if (atWar(war, a, b)) throw new Error(`${a} e ${b} sono già in guerra`);
  return { ...war, pairs: { ...war.pairs, [pairKey(a, b)]: { by: a, since: date } } };
}

export function makePeace(war, { a, b }) {
  const k = pairKey(a, b);
  if (!war.pairs[k]) return war;
  const { [k]: _gone, ...pairs } = war.pairs;
  return { ...war, pairs };
}

export function validateWar(war) {
  if (war === undefined) return [];
  if (war === null || typeof war !== 'object' || Array.isArray(war)) return ['guerra: non è un oggetto'];
  const errors = [];
  if (war.schema !== WAR_SCHEMA) errors.push(`guerra: schema ${JSON.stringify(war.schema)}`);
  if (war.pairs === null || typeof war.pairs !== 'object') return [...errors, 'guerra: pairs mancante'];
  for (const [k, v] of Object.entries(war.pairs)) {
    const parts = k.split('|');
    if (parts.length !== 2 || parts[0] === '' || parts[0] >= parts[1]) errors.push(`guerra: chiave ${JSON.stringify(k)} non valida`);
    else if (v?.by !== parts[0] && v?.by !== parts[1]) errors.push(`guerra: ${k} dichiarata da ${JSON.stringify(v?.by)}`);
    if (typeof v?.since !== 'string') errors.push(`guerra: ${k} senza data`);
  }
  return errors;
}
