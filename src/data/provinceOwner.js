// Entità politica (id di data/political_1936.json) a cui appartiene una provincia. Solo funzione PURA.
// Gli id provincia sono `P_<ENTITÀ>_<NOME>` e l'id dell'entità può contenere un trattino basso (MAR_ES, NLD_EI, JPN_MANDATE):
// `split('_')[1]` dava «MAR» invece di «MAR_ES» e quelle province risultavano «non controllate» (bug trovato il 29/10/2026).
// Si cerca quindi l'entità nota più lunga con cui l'id comincia («P_<entità>_»); senza corrispondenza si ripiega sul vecchio
// comportamento (seconda parte dell'id), così un id sconosciuto non lancia errori.
const SETS = new WeakMap(); // elenco di entità (stesso oggetto) → insieme: evita di rileggere 70+ entità a ogni chiamata
function setOf(entityIds) {
  if (entityIds instanceof Set) return entityIds;
  if (typeof entityIds !== 'object' || entityIds === null || typeof entityIds.next === 'function') return new Set(entityIds); // iteratori: una sola lettura
  let s = SETS.get(entityIds);
  if (!s) { s = new Set(entityIds); SETS.set(entityIds, s); }
  return s;
}

export function entityOfProvinceId(provinceId, entityIds) {
  const id = String(provinceId);
  const parts = id.split('_');
  if (parts[0] === 'P') {
    const known = setOf(entityIds);
    // candidati «P_<a>_», «P_<a>_<b>_», ...: vale il più lungo che è un'entità nota
    for (let k = parts.length - 1; k >= 2; k -= 1) {
      const cand = parts.slice(1, k).join('_');
      if (known.has(cand)) return cand;
    }
  }
  return parts[1];
}
