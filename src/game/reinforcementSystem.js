// Rinforzi AUTOMATICI (decisione dell'utente 03/11/2026): ogni giorno, per ogni nazione, le divisioni con rinforzo attivo (`reinforce` != false, interruttore per divisione)
// ricevono dal pool di uomini e dalle scorte della nazione (pezzi `equipment.<id>` e cavalli) fino al previsto; la merce parte dal deposito, viaggia e arriva dopo i
// giorni di trasferimento (via terra: km / TRANSIT_KM_PER_DAY; i giorni di mare si aggiungono SOLO se il percorso attraversa il mare, vedi depotRoute).
// Sistema giornaliero PURO per GAME_SYSTEMS: stato in ingresso → nuovo stato. Ordine del giorno: 1) arrivi (l'eccedenza torna in scorta), 2) nuovi invii (la merce lascia la scorta).
// Limiti dichiarati: le divisioni senza deposito della nazione o senza percorso (né terra né mare con porti propri) restano senza rinforzi (nessun tempo inventato); i quadri (`cadre`) non ricevono.
import { applyArrivals, dispatch, inTransitFromStock, stockKeyOf, planReinforcements, priorityRequests, setPriority, setReinforcement, mayNeedReinforcement } from '../rules/reinforcements.js';
import { transitDaysFromRoute } from '../rules/reinforcementTransit.js';
import { findPath } from '../rules/movement.js';
import { findSeaRoute } from '../data/seaRoutes.js';

const r3 = (v) => Math.round(v * 1000) / 1000;
const isStockItem = (k) => k.startsWith('equipment.') || k === 'horses';

/** Interruttore della divisione (azione del giocatore): false = nessun nuovo invio; i rinforzi già in viaggio arrivano comunque. */
export function setDivisionReinforcement(state, divisionId, enabled) {
  if (!state.forces?.divisions?.[divisionId]) throw new Error(`divisione senza istanza: ${divisionId}`);
  return { ...state, forces: setReinforcement(state.forces, divisionId, enabled) };
}

/** Priorità della divisione (azione del giocatore): true = servita per prima dal pool e dalle scorte; non crea risorse. */
export function setDivisionPriority(state, divisionId, on) {
  if (!state.forces?.divisions?.[divisionId]) throw new Error(`divisione senza istanza: ${divisionId}`);
  return { ...state, forces: setPriority(state.forces, divisionId, on) };
}

/** Distanze (km) dalla provincia `from` a tutte le province raggiungibili entrando solo dove `canEnter`. */
function landDistances(net, from, canEnter) {
  const dist = new Map([[from, 0]]); const done = new Set();
  for (;;) {
    let cur = null; let best = Infinity;
    for (const [m, d] of dist) if (!done.has(m) && (d < best || (d === best && m < cur))) { cur = m; best = d; }
    if (cur === null) return dist;
    done.add(cur);
    for (const n of net.neighbors(cur)) {
      if (done.has(n) || !canEnter(n)) continue;
      const nd = best + net.km(cur, n);
      if (!dist.has(n) || nd < dist.get(n)) dist.set(n, nd);
    }
  }
}

/** Fra `origins` quella più vicina a `at` per via di terra (meno passaggi, poi meno km, poi id): null se nessuna è raggiungibile. */
function nearestOrigin(net, at0, origins, canEnter) {
  const canon = net.canon ?? ((x) => x); // province madri divise: si confronta il posto canonico (sponda principale)
  const at = canon(at0);
  const want = new Set(origins.map(canon));
  if (want.has(at)) return origins.find((o) => canon(o) === at);
  const hops = new Map([[at, 0]]); const dist = new Map([[at, 0]]); const queue = [at];
  for (let i = 0; i < queue.length; i += 1) {
    const cur = queue[i];
    for (const n of net.neighbors(cur)) {
      if (!canEnter(n) && !want.has(n)) continue;
      const h = hops.get(cur) + 1; const d = dist.get(cur) + net.km(cur, n);
      if (!hops.has(n)) { hops.set(n, h); dist.set(n, d); if (!want.has(n)) queue.push(n); } else if (h === hops.get(n) && d < dist.get(n)) dist.set(n, d);
    }
  }
  const found = origins.filter((o) => hops.has(canon(o))).sort((a, b) => hops.get(canon(a)) - hops.get(canon(b)) || dist.get(canon(a)) - dist.get(canon(b)) || (a < b ? -1 : 1));
  return found[0] ?? null;
}

/**
 * Percorso dal deposito alla divisione. ctx: { net, depots (depots.json), positionOf(unitId), canEnter(nation) → (provincia) => bool,
 *   sea?: { context: contesto di rotte marittime legato allo stato (GAME_SEA.sea.at(state)), motherOf(idProvincia) → provincia madre } }.
 * Prima la via di terra: { landKm }. Se non c'è e c'è `sea`: tratto di terra deposito → porto proprio, traversata (findSeaRoute fra i porti propri delle due coste), tratto di terra
 * porto → divisione: { landKm: somma dei due tratti, seaDays } (i giorni di mare si aggiungono SOLO così). Nessuna via o nessun porto: null (mai un tempo inventato).
 * LIMITI: gli stretti controllati da nemici e i blocchi navali non sono modellati per i convogli di rinforzo; il porto è scelto dal percorso di mare più rapido, non dal totale.
 */
export function depotRoute(ctx, nation, unitId) {
  const capital = ctx.depots.nations?.[nation]?.province;
  const at = ctx.positionOf(unitId);
  if (!at || !ctx.net.has(at)) return null;
  const canEnter = ctx.canEnter(nation);
  // caserme (20/11/2026): ctx.originsOf?(nation) → province delle caserme controllate; i rinforzi partono dal punto più vicino per via di terra
  // (meno passaggi, poi meno km, come findPath) fra il deposito della capitale e le caserme. Senza via di terra si usa il deposito per il mare.
  const extra = (ctx.originsOf?.(nation) ?? []).filter((p) => ctx.net.has(p));
  const depot = extra.length ? nearestOrigin(ctx.net, at, [...(capital && ctx.net.has(capital) ? [capital] : []), ...extra], canEnter) ?? capital : capital;
  if (!depot || !ctx.net.has(depot)) return null;
  const passable = (m) => m === depot || m === at || canEnter(m);
  const path = findPath(ctx.net, depot, at, passable);
  if (path) {
    let km = 0;
    for (let i = 1; i < path.length; i += 1) km += ctx.net.km(path[i - 1], path[i]);
    return { landKm: Math.round(km) };
  }
  if (!ctx.sea) return null;
  const fromLand = landDistances(ctx.net, depot, canEnter);
  const toLand = landDistances(ctx.net, at, canEnter);
  // tutti i porti propri (anche più di uno sulla stessa zona di mare, p. es. Königsberg e Stettino sul Baltico), il più vicino per via di terra per primo
  const ports = (ctx.sea.context.allPortsOf ?? ctx.sea.context.portsOf)(nation).map((p) => ({ ...p, mother: ctx.sea.motherOf(p.province) }));
  const nearest = (land) => ports.filter((p) => land.has(p.mother)).sort((a, b) => (land.get(a.mother) - land.get(b.mother)) || (a.province < b.province ? -1 : 1));
  const fromPorts = nearest(fromLand);
  const toPorts = nearest(toLand);
  const graph = ctx.sea.context.graph;
  const route = findSeaRoute(graph, fromPorts, toPorts, { closedZones: new Set(graph.params.closedZones ?? []) });
  if (!route.ok) return null;
  return { landKm: Math.round(fromLand.get(route.ports.from.mother) + toLand.get(route.ports.to.mother)), seaDays: route.days };
}

/**
 * ctx: { units (unitsFile.units), poolOf(state, nation) → uomini disponibili nel pool, routeOf(state, nation, unitId) → { landKm, seaDays? } | null }.
 * Senza forze inizializzate non fa nulla.
 */
export function createReinforcementSystem({ units, poolOf, routeOf, sourcesOf = null, priorityOf = null }) { // priorityOf(nation) → { id: true }: precedenza per servizio (20/11/2026)
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
      if (t.from === 'stock' && nation && nations[nation]) nations[nation] = { ...nations[nation], stocks: { ...nations[nation].stocks, [stockKeyOf(t)]: r3((nations[nation].stocks[stockKeyOf(t)] ?? 0) + t.returnedQty) } };
    }
    // 2) nuovi invii, per nazione in ordine di id
    const owners = [...new Set(Object.keys(forces.divisions).map((id) => nationOfUnit.get(id)).filter((n) => n && nations[n]))].sort();
    for (const nation of owners) {
      const ids = Object.keys(forces.divisions).filter((id) => nationOfUnit.get(id) === nation);
      // i percorsi (ricerca su tutta la mappa) si calcolano SOLO quando il piano ha davvero qualcosa da spedire a quella divisione, e una volta sola per divisione
      const days = new Map();
      const transitDays = (id) => {
        if (!days.has(id)) { const route = routeOf(state, nation, id); days.set(id, route ? Math.max(1, transitDaysFromRoute(route)) : null); }
        return days.get(id);
      };
      const candidates = ids.filter((id) => mayNeedReinforcement(forces, id)); // niente carenza e niente merce in viaggio: nulla da pianificare
      if (candidates.length === 0) continue;
      // la merce in viaggio ha già lasciato la scorta, ma planReinforcements la sottrae di nuovo dalle scorte che riceve: gliela si somma, così il netto è la scorta reale
      const stocks = Object.fromEntries(Object.entries(nations[nation].stocks).filter(([k]) => isStockItem(k)).map(([k, v]) => [k, Math.floor(v + 1e-9) + inTransitFromStock(forces, ids, k)]));
      const plan = planReinforcements(forces, {
        units: units.filter((u) => u.nation === nation && candidates.includes(u.id)), nation, date: state.date,
        poolAvailable: Math.max(0, Math.floor(poolOf(state, nation))), stocks, requests: { ...(priorityOf ? priorityOf(nation) : {}), ...priorityRequests(forces) }, transitDays,
        sourcesOf: sourcesOf ? (item) => sourcesOf(nation, item) : null, // fucili prodotti come INW-DEU-RIFLE-1939 riforniscono anche la voce «fucili» del 1936
      });
      if (plan.transfers.length === 0) continue;
      forces = dispatch(forces, plan.transfers);
      const left = { ...nations[nation].stocks };
      for (const t of plan.transfers) if (t.from === 'stock') left[stockKeyOf(t)] = r3((left[stockKeyOf(t)] ?? 0) - t.qty);
      nations[nation] = { ...nations[nation], stocks: left };
    }
    return { ...state, forces, nations };
  };
}
