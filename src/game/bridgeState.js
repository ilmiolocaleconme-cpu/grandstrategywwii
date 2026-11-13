// Ponti in partita: sistema giornaliero (ripristini) e azioni del giocatore. Lo stato è `state.bridges` (src/rules/bridges.js); l'indice dei
// ponti sta sulla rete di movimento (`net.bridgeIndex`, collegata quando links.json, fiumi e province sono caricati).
import { createBridgeState, destroyPair, startRepair, tickBridges } from '../rules/bridges.js';
import { positionOf } from '../rules/movement.js';

/** Sistema giornaliero (si aggiunge a GAME_SYSTEMS): i ripristini arrivati a termine tornano integri. */
export function createBridgeSystem() {
  return (state) => {
    if (!state.bridges || Object.keys(state.bridges.repairing).length === 0) return state;
    const next = tickBridges(state.bridges, state.day);
    return next === state.bridges ? state : { ...state, bridges: next };
  };
}

/** Il giocatore ha un'unità propria in uno dei due posti? (serve per demolire o ripristinare: nessun genio/risorse ancora modellati). */
function hasOwnUnitAt(state, ctx, places) {
  for (const u of ctx.unitsById.values()) if (u.nation === state.player && places.includes(positionOf(state.movement, ctx.initial, u.id))) return true;
  return false;
}

function guard(state, ctx, net, a, b) {
  if (!net.bridgeIndex) throw new Error('ponti non caricati');
  if (!hasOwnUnitAt(state, ctx, [a, b])) throw new Error('serve un\'unità tua su una delle due sponde');
}

/** Demolisce i ponti agibili fra i posti a e b. Lancia un Error se non si può. */
export function playerDestroyBridge(state, { a, b, ctx, net }) {
  guard(state, ctx, net, a, b);
  const r = destroyPair(state.bridges ?? createBridgeState(), net.bridgeIndex, a, b, { day: state.day });
  return { state: { ...state, bridges: r.bridges }, destroyed: r.destroyed };
}

/** Avvia il ripristino dei ponti distrutti fra a e b (durata da data/combat/bridges.json). */
export function playerRepairBridge(state, { a, b, ctx, net, cfg }) {
  guard(state, ctx, net, a, b);
  const r = startRepair(state.bridges ?? createBridgeState(), net.bridgeIndex, a, b, { day: state.day, cfg });
  return { state: { ...state, bridges: r.bridges }, started: r.started };
}
