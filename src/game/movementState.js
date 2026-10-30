// Movimento nello stato della partita: campo OPZIONALE `movement` (assente = tutte le unità alla dislocazione iniziale), quindi
// nessuna migrazione dello schema (come `provinces`). Le regole sono in src/rules/movement.js; qui: posizioni correnti,
// ordine del giocatore e sistema giornaliero.
import { createMovementState, issueMove, cancelMove, tickMovement, positionOf, validateMovement } from '../rules/movement.js';
import { controllerOf } from '../map/geo.js';
import { atWar } from '../rules/war.js';
import { hasAccess } from '../rules/diplomacy.js';
import { provinceStateOf } from './provinceState.js';

export function validateMovementShape(state) {
  return state.movement === undefined ? [] : validateMovement(state.movement);
}

/** Mappa unità → provincia della dislocazione iniziale (file deployment_1936.json). */
export function initialPositions(deploymentDoc) {
  return new Map(deploymentDoc.entries.map((e) => [e.unit, e.province]));
}

/** Dislocazione corrente nel formato di unitsByProvince: { entries: [{ unit, province }] }. */
export function currentDeployment(deploymentDoc, state) {
  const mv = state?.movement;
  if (!mv) return deploymentDoc;
  return { ...deploymentDoc, entries: deploymentDoc.entries.map((e) => (mv.positions[e.unit] ? { ...e, province: mv.positions[e.unit] } : e)) };
}

/** Può entrare nella provincia `m`? Province proprie (controllo effettivo, anche per occupazione), di nazioni in guerra con la propria e di chi ha concesso accesso o alleanza. */
export function canEnterFor(state, net, nation) {
  return (m) => {
    if (!net.has(m)) return false;
    const c = provinceStateOf(state, m).controller ?? controllerOf(net.owner(m), state.control);
    return c === nation || atWar(state.war, c, nation) || hasAccess(state.diplomacy, nation, c); // alleati e accordi di accesso (diplomazia 30/10/2026)
  };
}

/**
 * Ordina a `units` ([{ id, category }]) di andare in `to`. Ritorna { state, moved: [{ unit, days, path }], failed: [{ unit, reason }] }.
 * Le unità già in destinazione, o senza percorso, restano come sono e finiscono in `failed`.
 */
export function orderMove(state, { units, to, nation, deploymentDoc, net }) {
  const initial = initialPositions(deploymentDoc);
  const canEnter = canEnterFor(state, net, nation);
  let movement = state.movement ?? createMovementState();
  const moved = [];
  const failed = [];
  for (const u of units) {
    const r = issueMove(movement, u, to, { initial, net, canEnter });
    if (r.ok) { movement = r.movement; moved.push({ unit: u.id, days: r.days, path: r.path }); } else failed.push({ unit: u.id, reason: r.reason });
  }
  return { state: moved.length ? { ...state, movement } : state, moved, failed };
}

export function cancelOrders(state, unitIds) {
  if (!state.movement) return state;
  let m = state.movement;
  for (const id of unitIds) m = cancelMove(m, id);
  return { ...state, movement: m };
}

/** Sistema giornaliero (si aggiunge a GAME_SYSTEMS). */
export function createMovementSystem(net) {
  return (state) => (state.movement && Object.keys(state.movement.orders).length ? { ...state, movement: tickMovement(state.movement, net.km) } : state);
}

export { positionOf };
