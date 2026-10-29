// Pool nazionale di uomini (reclutamento): quota della popolazione che può essere arruolata, meno gli uomini già nelle forze armate.
// Quota base = ESEMPIO dell'utente (5%, data/population/population.json). Può crescere con leggi, diplomazia, nuove leve (per la Germania),
// mobilitazione totale, aumento dell'età di leva: sono MODIFICATORI additivi alla quota, definiti altrove. Funzioni PURE.
// NON definito (da stabilire con l'utente): rimpiazzo delle perdite, addestramento, costi e tempi, tetto massimo alla quota (oggi solo <= 100%).

/** Errori dei modificatori: [{ id, kind: 'add', value, source }] (value = punti di quota, per esempio 0.01 = +1% della popolazione). */
export function validateModifiers(modifiers) {
  const errors = [];
  const ids = new Set();
  for (const m of modifiers) {
    if (typeof m?.id !== 'string' || m.id === '') { errors.push('modificatore senza id'); continue; }
    if (ids.has(m.id)) errors.push(`modificatore duplicato: ${m.id}`);
    ids.add(m.id);
    if (m.kind !== 'add') errors.push(`${m.id}: tipo ${JSON.stringify(m.kind)} (solo 'add')`);
    if (typeof m.value !== 'number' || !Number.isFinite(m.value)) errors.push(`${m.id}: valore non valido`);
    if (!String(m.source ?? '').trim()) errors.push(`${m.id}: senza fonte (legge, evento o accordo)`);
  }
  return errors;
}

/** Quota effettiva = base + somma dei modificatori, tra 0 e 1. Lancia un Error se i modificatori non sono validi. */
export function manpowerShare(baseShare, modifiers = []) {
  const errors = validateModifiers(modifiers);
  if (errors.length) throw new Error(`modificatori non validi: ${errors.join('; ')}`);
  if (!(baseShare > 0 && baseShare <= 1)) throw new RangeError(`quota base non valida: ${baseShare}`);
  const share = baseShare + modifiers.reduce((s, m) => s + m.value, 0);
  return Math.min(1, Math.max(0, share));
}

/** Pool di uomini: { share, capacity, enlisted, available, overdrawn } (available può essere negativo: forze oltre la capacità, segnalato da overdrawn). */
export function manpowerPoolState({ population, baseShare, modifiers = [], enlisted = 0 }) {
  if (!Number.isFinite(population) || population < 0) throw new RangeError(`popolazione non valida: ${population}`);
  if (!Number.isFinite(enlisted) || enlisted < 0) throw new RangeError(`uomini arruolati non validi: ${enlisted}`);
  const share = manpowerShare(baseShare, modifiers);
  const capacity = Math.floor(population * share);
  const available = capacity - enlisted;
  return { share, capacity, enlisted, available, overdrawn: available < 0 };
}
