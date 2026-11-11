// Funzioni comuni di guerra e teatro (separate per evitare dipendenze circolari tra theaterState.js e theaterPlan.js).
import { atWar } from '../rules/war.js';
import { hasAccess } from '../rules/diplomacy.js';
import { categoryPower } from '../rules/combat.js';
import { provinceStateOf } from './provinceState.js';
import { controllerOf } from '../map/geo.js';

/** Controllore effettivo di una provincia madre: quello della provincia se occupata, altrimenti quello della nazione proprietaria. */
// Una zona urbana senza controllo proprio segue la sua madre (se occupata, la città è occupata con lei).
// Sponde (11/11/2026): una sponda ha il suo controllo; senza, segue quello scritto sulla provincia madre e poi la nazione proprietaria.
// La provincia madre divisa, chiesta per nome, vale come la sua sponda principale (incarichi e salvataggi scritti per madre).
export function provinceController(state, net, id) {
  const own = provinceStateOf(state, id).controller;
  if (own) return own;
  const canon = net.canon?.(id) ?? id;
  if (canon !== id) return provinceController(state, net, canon);
  const mother = net.parentOf?.(id);
  if (mother && net.isBank?.(id)) return provinceStateOf(state, mother).controller ?? controllerOf(net.owner(id), state.control);
  return mother ? provinceController(state, net, mother) : controllerOf(net.owner(id), state.control);
}

/** Può entrare nella provincia: è sua, controllata da una nazione in guerra con essa o da chi le ha concesso accesso (alleati inclusi). */
export function canEnterWar(state, net, nation) {
  return (m) => {
    if (!net.has(m)) return false;
    const c = provinceController(state, net, m);
    return c === nation || atWar(state.war, c, nation) || hasAccess(state.diplomacy, nation, c);
  };
}

export const effectiveOf = (state, id) => state.forces?.divisions?.[id]?.items?.['manpower.war'] ?? null;

/** Divisione in grado di combattere: ha una dotazione con uomini effettivi e una categoria con potenza > 0. */
export function isFighter(state, unit) {
  const m = effectiveOf(state, unit.id);
  return Boolean(m) && m.effective > 0 && categoryPower(unit.category) > 0;
}

