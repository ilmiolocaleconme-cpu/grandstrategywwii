// Posizione STIMATA di un comando (corpo, armata) senza posizione nella dislocazione (decisione B dell'utente, 06/11/2026).
// Regola: la provincia dove stanno più divisioni sottostanti (nell'ORBAT); a parità vince l'id più piccolo.
// È una STIMA: non un dato storico. Va sempre etichettata come tale (source: 'stimata') e non sostituisce la posizione reale.
import { descendantsOf, orbatLevel } from './orbat.js';

/** { province, inProvince, basedOn, source: 'stimata' } oppure null se nessuna divisione sottostante ha una posizione. */
export function estimatedHqProvince({ hqId, orbat, unitsById, positionOf }) {
  const counts = new Map();
  let basedOn = 0;
  for (const id of descendantsOf(orbat, hqId)) {
    const u = unitsById.get(id);
    if (!u || orbatLevel(u) !== 'division') continue;
    const p = positionOf(id);
    if (!p) continue;
    counts.set(p, (counts.get(p) ?? 0) + 1);
    basedOn += 1;
  }
  if (counts.size === 0) return null;
  const [province, inProvince] = [...counts].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0];
  return { province, inProvince, basedOn, source: 'stimata' };
}
