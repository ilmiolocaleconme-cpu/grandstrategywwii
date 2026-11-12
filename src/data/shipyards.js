// Cantieri navali storici 1936 (data/naval/shipyards_1936.json): BOZZA di presenza per la mappa, basis «ipotesi». Solo dati e funzioni PURE.
// Non è capacità produttiva: il cantiere (FCT-SHIPYARD) non ha ricetta e oggi non produce navi.
export const SHIPYARDS_SCHEMA = 'shipyards-v1';
const KINDS = ['navy', 'private', 'mixed'];
const BASES = ['utente', 'ipotesi'];

/** Errori (lista vuota = valido). coastal = città costiere del catalogo (cittaId → { name, owner, parentProvince }). */
export function validateShipyards(doc, { coastal }) {
  const errors = [];
  if (doc?.schema !== SHIPYARDS_SCHEMA) return [`cantieri: schema ${JSON.stringify(doc?.schema)}, atteso ${SHIPYARDS_SCHEMA}`];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.asOf ?? '')) errors.push('cantieri: asOf non valido');
  if (!String(doc.note ?? '').trim()) errors.push('cantieri: nota di origine mancante');
  if (!Array.isArray(doc.shipyards)) return [...errors, 'cantieri: shipyards non è un array'];
  const ids = new Set(); const cities = new Set();
  for (const y of doc.shipyards) {
    const p = `cantieri ${y?.id}`;
    if (typeof y?.id !== 'string' || y.id === '') { errors.push('cantieri: voce senza id'); continue; }
    if (ids.has(y.id)) errors.push(`${p}: id duplicato`);
    ids.add(y.id);
    const c = coastal?.[y.cittaId];
    if (!c) errors.push(`${p}: la città ${JSON.stringify(y.cittaId)} non è una città costiera del catalogo`);
    else {
      if (cities.has(y.cittaId)) errors.push(`${p}: due cantieri sulla stessa città (uno per città)`);
      cities.add(y.cittaId);
      if (y.nation !== c.owner) errors.push(`${p}: nazione ${y.nation} diversa dal proprietario della città (${c.owner})`);
      if (y.name !== c.name) errors.push(`${p}: nome ${JSON.stringify(y.name)} diverso dalla città (${c.name})`);
    }
    if (!String(y.operator ?? '').trim()) errors.push(`${p}: senza operatore`);
    if (!KINDS.includes(y.kind)) errors.push(`${p}: tipo ${JSON.stringify(y.kind)}`);
    if (!BASES.includes(y.basis)) errors.push(`${p}: basis ${JSON.stringify(y.basis)}`);
  }
  return errors;
}
