// IA dei ponti v1 (14/11/2026): ogni PERIOD giorni, ogni nazione NON del giocatore in guerra
//  - DEMOLISCE i ponti dei fiumi PRINCIPALI sul proprio lato quando il nemico è presente sull'altra sponda con potenza ≥ della propria sul lato proprio
//    (non può tenere la linea: ritirata); al massimo MAX_DEMOLITIONS per periodo;
//  - RIPRISTINA i ponti distrutti fra due posti che controlla entrambi quando nessun nemico è nei due posti né nei loro vicini.
// Usa le stesse azioni del giocatore (bridgeState.js): serve un'unità propria su una delle due sponde. Nessun costo né genio (non modellati).
// IPOTESI di bilanciamento di Claude, da approvare. NON FATTO: demolizione preventiva prima di una ritirata decisa dai teatri, ponti dei fiumi minori,
// demolizione di ponti sul territorio nemico in avanzata, ripristino dei ponti dopo una conquista, bilancio fra rifornimenti e difesa (un'IA che distrugge
// i propri ponti può tagliarsi la logistica: i rifornimenti non usano ancora i ponti).
import { enemiesOf } from '../rules/war.js';
import { unitOf } from '../rules/unitRegistry.js';
import { positionOf } from '../rules/movement.js';
import { pairState } from '../rules/bridges.js';
import { isFighter, provinceController } from './warCommon.js';
import { powerOfUnit } from './theaterPlan.js';
import { playerDestroyBridge, playerRepairBridge } from './bridgeState.js';
import { nationsAtWar } from './aiWarSystem.js';

export const PERIOD = 7;
export const MAX_DEMOLITIONS = 3;

function powers(state, ctx, nation, enemies) {
  const mine = new Map(); const theirs = new Map();
  for (const e of ctx.deploymentDoc.entries) {
    const u = unitOf(state, e.unit, ctx.unitsById);
    if (!u || !isFighter(state, u)) continue;
    const at = positionOf(state.movement, ctx.initial, u.id);
    if (!at) continue;
    const power = powerOfUnit(state, u, ctx);
    if (u.nation === nation) mine.set(at, (mine.get(at) ?? 0) + power);
    else if (enemies.has(u.nation)) theirs.set(at, (theirs.get(at) ?? 0) + power);
  }
  return { mine, theirs };
}

function planNation(state, nation, ctx, net, cfg) {
  const enemies = new Set(enemiesOf(state.war, nation));
  const { mine, theirs } = powers(state, ctx, nation, enemies);
  const control = (p) => provinceController(state, net, p);
  const enemyNear = (p) => (theirs.get(p) ?? 0) + net.neighbors(p).reduce((t, n) => t + (theirs.get(n) ?? 0), 0);
  let s = state; let demolished = 0;
  const keys = [...net.bridgeIndex.byPair.keys()].sort();
  for (const key of keys) {
    const [x, y] = key.split('|');
    const st = pairState(net.bridgeIndex, s.bridges, x, y);
    if (!st.main) continue;
    try {
      if (st.intact > 0 && demolished < MAX_DEMOLITIONS) {
        // il lato proprio è quello che controllo e dove ho truppe; il nemico è sull'altra sponda con almeno la mia forza
        for (const [own, far] of [[x, y], [y, x]]) {
          if (control(own) !== nation || (mine.get(own) ?? 0) <= 0 || (theirs.get(far) ?? 0) < (mine.get(own) ?? 0)) continue;
          s = playerDestroyBridge(s, { a: own, b: far, ctx, net, nation }).state;
          demolished += 1;
          break;
        }
      } else if (st.intact === 0 && st.bridges > 0 && control(x) === nation && control(y) === nation && enemyNear(x) === 0 && enemyNear(y) === 0
        && ((mine.get(x) ?? 0) > 0 || (mine.get(y) ?? 0) > 0)) {
        s = playerRepairBridge(s, { a: x, b: y, ctx, net, cfg, nation }).state;
      }
    } catch { /* nessuna unità propria su una sponda o niente da fare: si passa oltre */ }
  }
  return s;
}

/** Sistema giornaliero (da mettere DOPO l'IA di guerra e PRIMA del teatro). ctx come createTheaterSystem; cfg = data/combat/bridges.json. */
export function createAiBridges(ctx, cfg) {
  return (state) => {
    if (!state.war || Object.keys(state.war.pairs).length === 0 || state.day % PERIOD !== 0) return state;
    const net = ctx.getNet(state);
    if (!net?.bridgeIndex) return state;
    let s = state;
    for (const n of nationsAtWar(state.war)) if (n !== state.player) s = planNation(s, n, ctx, net, cfg);
    return s;
  };
}
