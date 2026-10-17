// Calendario di gioco: date ISO "AAAA-MM-GG", un tick = un giorno (master: simulazione giornaliera).
// Aritmetica in UTC: il risultato non dipende dal fuso orario del dispositivo né dall'ora legale.

export const START_DATE = '1936-01-01';
const DAY_MS = 86_400_000;

export const MONTHS_IT = [
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre',
];

/** Millisecondi UTC di una data ISO valida; TypeError se il formato è sbagliato o il giorno non esiste (es. 1937-02-29). */
export function parseDate(iso) {
  const m = typeof iso === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso) : null;
  if (!m) throw new TypeError(`data non valida: ${JSON.stringify(iso)} (atteso AAAA-MM-GG)`);
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (toIso(t) !== iso) throw new TypeError(`data inesistente: ${iso}`);
  return t;
}

export function toIso(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isValidDate(iso) {
  try {
    parseDate(iso);
    return true;
  } catch {
    return false;
  }
}

export function addDays(iso, days) {
  if (!Number.isInteger(days)) throw new TypeError('addDays: days deve essere un intero');
  return toIso(parseDate(iso) + days * DAY_MS);
}

/** Giorni da `from` a `to` (negativo se `to` precede `from`). */
export function daysBetween(from, to) {
  return Math.round((parseDate(to) - parseDate(from)) / DAY_MS);
}

/** "1 gennaio 1936". */
export function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  parseDate(iso);
  return `${d} ${MONTHS_IT[m - 1]} ${y}`;
}
