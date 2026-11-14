// Rifornimenti in partita (v1, 14/11/2026): sistema giornaliero che dice quali divisioni sono senza rifornimento e fattore da applicare alla potenza.
// Regole e numeri: src/rules/supply.js, data/combat/supply.json (ipotesi). Fonti: capitale (net.supplyCapitals: nazione → province madri) e porti controllati
// (ctx.portProvinces(state) → province madri con porto livello ≥ 1). Solo le nazioni in guerra: in pace nessuno è senza rifornimenti.
import { suppliedPlaces, updateSupply, supplyFactor, createSupplyState } from '../rules/supply.js';
import { canStepFor } from './movementState.js';
import { positionOf } from '../rules/movement.js';
import { provinceController, isFighter } from './warCommon.js';
import { unitOf } from '../rules/unitRegistry.js';
import { nationsAtWar } from './aiWarSystem.js';

const nodesOf = (net, mother) => (net.banksOf?.(mother)?.length ? net.banksOf(mother) : [mother]);

/** Posti fonte di una nazione: capitale e porti che controlla. */
export function supplySources(state, net, nation, portProvinces = []) {
  const out = new Set();
  for (const m of net.supplyCapitals?.get(nation) ?? []) for (const n of nodesOf(net, m)) out.add(n);
  for (const m of portProvinces) if (provinceController(state, net, m) === nation) for (const n of nodesOf(net, m)) out.add(n);
  return [...out].sort();
}

/** Sistema giornaliero (da mettere DOPO il movimento e PRIMA del teatro). ctx come createTheaterSystem + portProvinces(state); cfg = data/combat/supply.json. */
export function createSupplySystem(ctx, cfg) {
  return (state) => {
    if (!state.war || Object.keys(state.war.pairs).length === 0) return state.supply === undefined || Object.keys(state.supply.out).length === 0 ? state : { ...state, supply: createSupplyState() };
    const net = ctx.getNet(state);
    if (!net) return state;
    const ports = ctx.portProvinces?.(state) ?? [];
    const maps = new Map();
    const checked = []; const out = [];
    for (const nation of nationsAtWar(state.war)) {
      const sources = supplySources(state, net, nation, ports);
      if (!sources.length) continue; // senza fonti note non si penalizza nessuno (dato mancante, non guerra)
      maps.set(nation, suppliedPlaces({ net, sources, controlled: (p) => provinceController(state, net, p) === nation, canStep: canStepFor(state, net), reach: cfg.reachBeyond }));
    }
    for (const e of ctx.deploymentDoc.entries) {
      const u = unitOf(state, e.unit, ctx.unitsById);
      if (!u || !isFighter(state, u) || !maps.has(u.nation)) continue;
      const at = positionOf(state.movement, ctx.initial, u.id);
      if (!at) continue;
      checked.push(u.id);
      if (!maps.get(u.nation).has(at)) out.push(u.id);
    }
    const next = updateSupply(state.supply, { day: state.day, outIds: out, checkedIds: checked });
    if (next === state.supply || (state.supply === undefined && Object.keys(next.out).length === 0)) return state; // nessun cambiamento: lo stato resta com'è
    return { ...state, supply: next };
  };
}

/** Fattore di potenza per la battaglia e l'IA (ctx.supplyFactor). */
export const supplyFactorOf = (state, unit, cfg) => supplyFactor(state.supply, unit.id, state.day, cfg);
