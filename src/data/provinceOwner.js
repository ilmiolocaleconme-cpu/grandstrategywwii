// Entità politica (id di data/political_1936.json) a cui appartiene una provincia. Solo funzione PURA.
// Gli id provincia sono `P_<ENTITÀ>_<NOME>` e l'id dell'entità può contenere un trattino basso (MAR_ES, NLD_EI, JPN_MANDATE):
// `split('_')[1]` dava «MAR» invece di «MAR_ES» e quelle province risultavano «non controllate» (bug trovato il 29/10/2026).
// Si cerca quindi l'entità nota più lunga con cui l'id comincia («P_<entità>_»); senza corrispondenza si ripiega sul vecchio
// comportamento (seconda parte dell'id), così un id sconosciuto non lancia errori.
export function entityOfProvinceId(provinceId, entityIds) {
  const id = String(provinceId);
  let best = null;
  for (const e of entityIds) {
    if (id.startsWith(`P_${e}_`) && (best === null || e.length > best.length)) best = e;
  }
  return best ?? id.split('_')[1];
}
