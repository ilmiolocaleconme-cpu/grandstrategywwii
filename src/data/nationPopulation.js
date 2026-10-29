// Popolazione per nazione (data/population/population_1939.json) e riserva di lavoratori. Solo dati e funzioni PURE.
// Valori APPROXIMATE (c. 1939, metropoli, colonie escluse): vedi il file. La riserva di lavoratori è una quota fissa della popolazione.
export const POPULATION_SCHEMA = 'population-v1';
const QUALITIES = new Set(['APPROXIMATE', 'MISSING_DATA', 'USER_ESTIMATE']);

/** Errori (lista vuota = valido). ctx: { ownerIds: Set (nazioni e proprietari che compaiono in nations dello stato) } */
export function validatePopulation(file, { ownerIds }) {
  const errors = [];
  if (file?.schema !== POPULATION_SCHEMA) return [`popolazione: schema ${file?.schema}, atteso ${POPULATION_SCHEMA}`];
  const s = file.workersShare?.value;
  if (!(s > 0 && s < 1)) errors.push('popolazione: workersShare.value deve essere tra 0 e 1');
  const r = file.recruitment;
  if (!(r?.baseShare > 0 && r.baseShare <= 1)) errors.push('popolazione: recruitment.baseShare deve essere nell\'intervallo (0, 1]');
  if (!['USER_ESTIMATE', 'MISSING_DATA'].includes(r?.quality)) errors.push(`popolazione: recruitment con qualità ${r?.quality}`);
  for (const id of ownerIds) if (!file.nations?.[id]) errors.push(`popolazione: manca ${id}`);
  for (const [id, n] of Object.entries(file.nations ?? {})) {
    if (!ownerIds.has(id)) errors.push(`popolazione: ${id} non è una nazione dello stato`);
    if (!QUALITIES.has(n.quality)) errors.push(`popolazione: ${id} con qualità ${n.quality}`);
    if (n.population === null) { if (n.quality !== 'MISSING_DATA') errors.push(`popolazione: ${id} senza valore ma non MISSING_DATA`); }
    else if (!Number.isInteger(n.population) || n.population <= 0) errors.push(`popolazione: ${id} con valore non valido`);
    else if (n.quality === 'MISSING_DATA') errors.push(`popolazione: ${id} ha un valore ma è MISSING_DATA`);
    if (typeof n.source !== 'string') errors.push(`popolazione: ${id} senza fonte`);
    if (n.year !== 1936 && n.year !== 1939) errors.push(`popolazione: ${id} con anno ${n.year} (solo 1936 o 1939)`);
  }
  return errors;
}

/** Popolazione di gioco di una nazione (MISSING_DATA = 0). */
export function populationOf(file, id) {
  return file.nations?.[id]?.population ?? 0;
}

/** Riserva totale di lavoratori di gioco di una popolazione. */
export function workersPoolTotal(population, share) {
  return Math.floor(population * share);
}
