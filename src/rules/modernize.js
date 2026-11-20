// Modernizzazione dei battaglioni di una divisione (21/11/2026, logica delle dotazioni fase 2, scelte dell'utente 1A, 3A, 4A, 5A). Funzione PURA.
// Quando un battaglione passa a una versione più recente (src/data/modules.js → targetVersions) cambia il PREVISTO della divisione; la dotazione
// effettiva non si crea dal nulla:
//  - una voce che cala tiene i pezzi fino al nuovo previsto; i pezzi in più servono prima a coprire i posti delle armi che li sostituiscono
//    (catena data/units/equipment/replacements.json: il K98k copre il posto del G43 finché il G43 non arriva, e combatte come K98k);
//  - quello che resta torna al magazzino nazionale (scelta 3A); gli uomini in più tornano al bacino da soli (sono derivati dagli effettivi);
//  - le voci nuove senza pezzi vecchi partono da 0 e le colmano i rinforzi, solo con armi prodotte (regola: prima tecnologia e produzione).
// Lo scambio graduale «pezzo nuovo dentro, pezzo vecchio in magazzino» lo fanno i rinforzi (src/rules/reinforcements.js, trasferimenti swap).
const EQUIPMENT = 'equipment.';
const r3 = (v) => Math.round(v * 1000) / 1000;

/** Previsto di una composizione: { 'manpower.war', horses, 'equipment.<id>' } (sum = sumComposition di src/data/modules.js). */
export function plannedOf(sum) {
  return { 'manpower.war': sum.men, horses: sum.horses, ...Object.fromEntries(Object.entries(sum.equipment).map(([k, v]) => [`${EQUIPMENT}${k}`, v])) };
}

/**
 * division: istanza ({ items, ... }); planned: nuovo previsto (plannedOf); predecessorsOf(percorso) → percorsi dei modelli precedenti.
 * Ritorna { division (items aggiornati, `versions`), surplus: { percorso: pezzi } da accreditare al magazzino (solo equipment.* e horses) }.
 */
export function modernizeDivision(division, planned, { versions, predecessorsOf = () => [] }) {
  const items = {};
  const excess = {};
  const paths = new Set([...Object.keys(division.items), ...Object.keys(planned)]);
  for (const p of [...paths].sort()) {
    const it = division.items[p] ?? { planned: 0, effective: 0, source: 'upgrade' };
    const np = planned[p] ?? (p.startsWith(EQUIPMENT) || p === 'horses' ? 0 : it.planned); // voci non di dotazione assenti nel nuovo previsto: invariate
    const eff = Math.min(it.effective, np);
    if (it.effective > eff && (p.startsWith(EQUIPMENT) || p === 'horses')) excess[p] = it.effective - eff;
    if (np === 0 && eff === 0) continue;
    const next = { ...it, planned: np, effective: eff };
    if (it.models) { // i modelli registrati non superano gli effettivi
      const tot = Object.values(it.models).reduce((s, q) => s + q, 0);
      if (tot > eff) next.models = Object.fromEntries(Object.entries(it.models).map(([k, q]) => [k, r3(tot > 0 ? q * eff / tot : 0)]).filter(([, q]) => q > 0));
    }
    items[p] = next;
  }
  // i pezzi in più coprono i posti delle armi che li sostituiscono (prima la versione più vicina della catena)
  for (const p of Object.keys(items).filter((k) => k.startsWith(EQUIPMENT)).sort()) {
    let room = items[p].planned - items[p].effective;
    for (const old of predecessorsOf(p)) {
      if (room <= 0) break;
      const q = Math.min(room, excess[old] ?? 0);
      if (q <= 0) continue;
      const id = old.slice(EQUIPMENT.length);
      items[p] = { ...items[p], effective: items[p].effective + q, models: { ...(items[p].models ?? {}), [id]: r3((items[p].models?.[id] ?? 0) + q) } };
      excess[old] -= q; room -= q;
    }
  }
  const surplus = Object.fromEntries(Object.entries(excess).filter(([, q]) => q > 0));
  const out = { ...division, items };
  if (Object.keys(versions ?? {}).length) out.versions = versions; else delete out.versions;
  return { division: out, surplus };
}
