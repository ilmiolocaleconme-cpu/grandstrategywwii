// Funzioni comuni di guerra e teatro (separate per evitare dipendenze circolari tra theaterState.js e theaterPlan.js).
import { atWar } from '../rules/war.js';
import { categoryPower } from '../rules/combat.js';
import { provinceStateOf } from './provinceState.js';
import { controllerOf } from '../map/geo.js';

/** Controllore effettivo di una provincia madre: quello della provincia se occupata, altrimenti quello della nazione proprietaria. */
export function provinceController(state, net, id) {
  return provinceStateOf(state, id).controller ?? controllerOf(net.owner(id), state.control);
}

/** Può entrare nella provincia: è sua o controllata da una nazione in guerra con essa. */
export function canEnterWar(state, net, nation) {
  return (m) => {
    if (!net.has(m)) return false;
    const c = provinceController(state, net, m);
    return c === nation || atWar(state.war, c, nation);
  };
}

export const effectiveOf = (state, id) => state.forces?.divisions?.[id]?.items?.['manpower.war'] ?? null;

/** Divisione in grado di combattere: ha una dotazione con uomini effettivi e una categoria con potenza > 0. */
export function isFighter(state, unit) {
  const m = effectiveOf(state, unit.id);
  return Boolean(m) && m.effective > 0 && categoryPower(unit.category) > 0;
}

