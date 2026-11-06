// Sistema giornaliero della distanza dal comando (regola in src/rules/commandDistance.js) e ordine di marcia di un comando.
// Un comando senza posizione reale usa la posizione STIMATA (src/rules/hqPosition.js) come punto di partenza.
import { applyDistancePenalties, isFarFromCommand } from '../rules/commandDistance.js';
import { conditionOf, createConditionState } from '../rules/divisionCondition.js';
import { estimatedHqProvince } from '../rules/hqPosition.js';
import { positionOf, createMovementState, issueMove } from '../rules/movement.js';
import { canEnterFor } from './movementState.js';

/** Posizione di un comando: quella reale (movimento o dislocazione), altrimenti la stimata. null se nessuna. */
export function commandPosition({ state, initial, orbat, unitsById, id }) {
  const real = positionOf(state.movement, initial, id);
  if (real) return real;
  return estimatedHqProvince({ hqId: id, orbat, unitsById, positionOf: (x) => positionOf(state.movement, initial, x) })?.province ?? null;
}

/** Sistema giornaliero: per ogni divisione con un comando superiore, lontananza (km) → penalità di prontezza. */
export function createCommandDistanceSystem({ net, orbat, unitsById, initial, cfg }) {
  return (state) => {
    const divisions = Object.keys(state.forces?.divisions ?? {});
    if (divisions.length === 0 || !net) return state;
    const cache = new Map();
    const cmdPos = (cid) => {
      if (!cache.has(cid)) cache.set(cid, commandPosition({ state, initial, orbat, unitsById, id: cid }));
      return cache.get(cid);
    };
    const updates = [];
    for (const id of divisions) {
      const parent = orbat.links?.[id]?.parent;
      if (!parent) continue;
      const dp = positionOf(state.movement, initial, id);
      const cp = cmdPos(parent);
      if (!dp || !cp) continue;
      const far = isFarFromCommand(net.km(cp, dp));
      const nation = unitsById.get(id)?.nation ?? null;
      const c = conditionOf(state.conditions, id, cfg, nation);
      const base = { experience: c.experience, morale: c.morale, readiness: c.readinessBeforeDistance, policy: c.policy, isNew: c.isNew, trainedThrough: c.trainedThrough };
      updates.push({ unitId: id, far, base });
    }
    if (updates.length === 0) return state;
    const next = applyDistancePenalties(state.conditions ?? createConditionState(), updates);
    // nessuna penalità in gioco e nessuna già salvata: lo stato resta com'è (nessuna voce vuota)
    if (!state.conditions && Object.keys(next.byUnit).length === 0) return state;
    return next === state.conditions ? state : { ...state, conditions: next };
  };
}

/** Ordina a un comando (corpo, armata) di muoversi, come una divisione. Ritorna { state, ok, reason?, path?, days? }. */
export function orderCommandMove(state, { unitId, to, nation, net, initial, startProvince }) {
  const base = state.movement ?? createMovementState();
  const withStart = positionOf(base, initial, unitId) || !startProvince ? base : { ...base, positions: { ...base.positions, [unitId]: startProvince } };
  const r = issueMove(withStart, { id: unitId, category: 'command' }, to, { initial, net, canEnter: canEnterFor(state, net, nation) });
  if (!r.ok) return { state, ok: false, reason: r.reason };
  return { state: { ...state, movement: r.movement }, ok: true, path: r.path, days: r.days };
}
