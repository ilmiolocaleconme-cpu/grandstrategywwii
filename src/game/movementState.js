// Movimento nello stato della partita: campo OPZIONALE `movement` (assente = tutte le unità alla dislocazione iniziale), quindi
// nessuna migrazione dello schema (come `provinces`). Le regole sono in src/rules/movement.js; qui: posizioni correnti,
// ordine del giocatore e sistema giornaliero.
import { createMovementState, issueMove, cancelMove, tickMovement, positionOf, validateMovement } from '../rules/movement.js';
import { canStepOver } from '../rules/bridges.js';
import { atWar } from '../rules/war.js';
import { hasAccess } from '../rules/diplomacy.js';
import { provinceController } from './warCommon.js';

export function validateMovementShape(state) {
  return state.movement === undefined ? [] : validateMovement(state.movement);
}

/** Mappa unità → provincia della dislocazione iniziale (file deployment_1936.json). */
export function initialPositions(deploymentDoc) {
  return new Map(deploymentDoc.entries.map((e) => [e.unit, e.bank ?? e.province])); // sponda, se la provincia è divisa da un fiume
}

/** Dislocazione corrente nel formato di unitsByProvince: { entries: [{ unit, province }] }. */
// La posizione è il POSTO: la sponda per le province divise da un fiume (e.bank), altrimenti la provincia.
export function currentDeployment(deploymentDoc, state) {
  const pos = state?.movement?.positions ?? {};
  return { ...deploymentDoc, entries: deploymentDoc.entries.map((e) => { const at = pos[e.unit] ?? e.bank ?? e.province; return at === e.province ? e : { ...e, province: at }; }) };
}

/** Passo a → b consentito? Falso solo se i ponti fra i due posti (state.bridges, net.bridgeIndex) sono tutti inagibili su un fiume principale. null se non ci sono ponti caricati. */
export function canStepFor(state, net) {
  return net.bridgeIndex ? (a, b) => canStepOver(net.bridgeIndex, state.bridges, a, b) : null;
}

/** Può entrare nella provincia `m`? Province proprie (controllo effettivo, anche per occupazione), di nazioni in guerra con la propria e di chi ha concesso accesso o alleanza. */
export function canEnterFor(state, net, nation) {
  return (m) => {
    if (!net.has(m)) return false;
    const c = provinceController(state, net, m);
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
    const r = issueMove(movement, u, to, { initial, net, canEnter, canStep: canStepFor(state, net) });
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
  return (state) => (state.movement && Object.keys(state.movement.orders).length ? { ...state, movement: tickMovement(state.movement, net.km, canStepFor(state, net)) } : state);
}

export { positionOf };
