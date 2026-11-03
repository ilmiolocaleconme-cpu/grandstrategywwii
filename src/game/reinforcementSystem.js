// Rinforzi AUTOMATICI (decisione dell'utente 03/11/2026): ogni giorno, per ogni nazione, le divisioni con rinforzo attivo (`reinforce` != false, interruttore per divisione)
// ricevono dal pool di uomini e dalle scorte della nazione (pezzi `equipment.<id>` e cavalli) fino al previsto; la merce parte dal deposito, viaggia e arriva dopo i
// giorni di trasferimento (via terra: km / TRANSIT_KM_PER_DAY; il mare si aggiunge SOLO se il percorso lo attraversa — non ancora implementato qui, vedi routeOf).
// Sistema giornaliero PURO per GAME_SYSTEMS: stato in ingresso → nuovo stato. Ordine del giorno: 1) arrivi (l'eccedenza torna in scorta), 2) nuovi invii (la merce lascia la scorta).
// Limiti dichiarati: le divisioni senza deposito della nazione o senza percorso via terra restano senza rinforzi (nessun tempo inventato); i quadri (`cadre`) non ricevono.
import { applyArrivals, dispatch, inTransit, planReinforcements, setReinforcement } from '../rules/reinforcements.js';
import { transitDaysFromRoute } from '../rules/reinforcementTransit.js';
import { findPath } from '../rules/movement.js';

const r3 = (v) => Math.round(v * 1000) / 1000;
const isStockItem = (k) => k.startsWith('equipment.') || k === 'horses';

/** Interruttore della divisione (azione del giocatore): false = nessun nuovo invio; i rinforzi già in viaggio arrivano comunque. */
export function setDivisionReinforcement(state, divisionId, enabled) {
  if (!state.forces?.divisions?.[divisionId]) throw new Error(`divisione senza istanza: ${divisionId}`);
  return { ...state, forces: setReinforcement(state.forces, divisionId, enabled) };
}

/**
 * Percorso via terra dal deposito alla divisione, solo su province percorribili (canEnter). ctx: { net, depots (depots.json), positionOf(unitId), canEnter(nation) → (provincia) => bool }.
 * Ritorna { landKm } oppure null (nessun deposito, posizione ignota o nessun percorso). Il mare non è ancora calcolato: una divisione oltremare dà null.
 */
export function depotRoute(ctx, nation, unitId) {
  const depot = ctx.depots.nations?.[nation]?.province;
  const at = ctx.positionOf(unitId);
  if (!depot || !at || !ctx.net.has(depot) || !ctx.net.has(at)) return null;
  const canEnter = ctx.canEnter(nation);
  const path = findPath(ctx.net, depot, at, (m) => m === depot || canEnter(m));
  if (!path) return null;
  let km = 0;
  for (let i = 1; i < path.length; i += 1) km += ctx.net.km(path[i - 1], path[i]);
  return { landKm: Math.round(km) };
}

/**
 * ctx: { units (unitsFile.units), poolOf(state, nation) → uomini disponibili nel pool, routeOf(state, nation, unitId) → { landKm, seaDays? } | null }.
 * Senza forze inizializzate non fa nulla.
 */
export function createReinforcementSystem({ units, poolOf, routeOf }) {
  const nationOfUnit = new Map(units.map((u) => [u.id, u.nation]));
  return function reinforcementDay(state) {
    if (!state.forces?.initialized || !state.nations) return state;
    let forces = state.forces;
    const nations = { ...state.nations };
    // 1) arrivi: l'eccedenza oltre il previsto torna nella scorta della nazione (gli uomini tornano al pool da soli: è derivato dagli arruolati)
    const arr = applyArrivals(forces, state.date);
    forces = arr.forces;
    for (const t of arr.returned) {
      const nation = nationOfUnit.get(t.divisionId);
      if (t.from === 'stock' && nation && nations[nation]) nations[nation] = { ...nations[nation], stocks: { ...nations[nation].stocks, [t.item]: r3((nations[nation].stocks[t.item] ?? 0) + t.returnedQty) } };
    }
    // 2) nuovi invii, per nazione in ordine di id
    const owners = [...new Set(Object.keys(forces.divisions).map((id) => nationOfUnit.get(id)).filter((n) => n && nations[n]))].sort();
    for (const nation of owners) {
      const days = new Map();
      const ids = Object.keys(forces.divisions).filter((id) => nationOfUnit.get(id) === nation);
      for (const id of ids) {
        const route = routeOf(state, nation, id);
        if (route) days.set(id, Math.max(1, transitDaysFromRoute(route)));
      }
      if (days.size === 0) continue;
      // la merce in viaggio ha già lasciato la scorta, ma planReinforcements la sottrae di nuovo dalle scorte che riceve: gliela si somma, così il netto è la scorta reale
      const stocks = Object.fromEntries(Object.entries(nations[nation].stocks).filter(([k]) => isStockItem(k)).map(([k, v]) => [k, Math.floor(v + 1e-9) + ids.reduce((t, id) => t + inTransit(forces, id, k), 0)]));
      const plan = planReinforcements(forces, {
        units: units.filter((u) => u.nation === nation && days.has(u.id)), nation, date: state.date,
        poolAvailable: Math.max(0, Math.floor(poolOf(state, nation))), stocks, transitDays: (id) => days.get(id),
      });
      if (plan.transfers.length === 0) continue;
      forces = dispatch(forces, plan.transfers);
      const left = { ...nations[nation].stocks };
      for (const t of plan.transfers) if (t.from === 'stock') left[t.item] = r3((left[t.item] ?? 0) - t.qty);
      nations[nation] = { ...nations[nation], stocks: left };
    }
    return { ...state, forces, nations };
  };
}
