// Terreno dominante delle province (data/terrain.json): pianura, colline, montagna.
// Per ora è una stima a mano (basis "hypothesis"), non ricavata da dati di quota.
// Modulo puro: nessun I/O, gira uguale nel browser e in Node (test).

export const TERRAIN_SCHEMA = 'terrain-v1';
export const TERRAIN_CLASSES = ['pianura', 'colline', 'montagna'];
export const TERRAIN_LABEL = { pianura: 'Pianura', colline: 'Colline', montagna: 'Montagna' };

/** Classe di terreno di una provincia, o null se non classificata. */
export function terrainOf(terrain, provinceId) {
  return terrain?.provinces?.[provinceId] ?? null;
}

/**
 * Controlli di coerenza tra terrain.json e l'elenco degli id delle province.
 * Ritorna gli errori (lista vuota se ogni provincia ha una classe valida e non ci sono id estranei).
 */
export function checkTerrain(terrain, provinceIds) {
  const errors = [];
  if (terrain === null || typeof terrain !== 'object' || Array.isArray(terrain)) return ['terreno: file mancante o non valido'];
  if (terrain.schema !== TERRAIN_SCHEMA) errors.push(`terreno: schema deve essere "${TERRAIN_SCHEMA}" (trovato ${JSON.stringify(terrain.schema)})`);
  if (!['verified', 'approximate', 'hypothesis'].includes(terrain.basis)) errors.push(`terreno: basis non valido (${JSON.stringify(terrain.basis)})`);
  if (JSON.stringify(terrain.classes) !== JSON.stringify(TERRAIN_CLASSES)) errors.push('terreno: classes deve essere [pianura, colline, montagna]');
  const map = terrain.provinces;
  if (map === null || typeof map !== 'object' || Array.isArray(map)) return [...errors, 'terreno: provinces mancante'];
  const known = new Set(provinceIds);
  for (const id of provinceIds) {
    if (!(id in map)) errors.push(`terreno: manca la provincia "${id}"`);
    else if (!TERRAIN_CLASSES.includes(map[id])) errors.push(`terreno: "${id}" ha una classe non valida (${JSON.stringify(map[id])})`);
  }
  for (const id of Object.keys(map)) if (!known.has(id)) errors.push(`terreno: "${id}" non è una provincia esistente`);
  return errors;
}
