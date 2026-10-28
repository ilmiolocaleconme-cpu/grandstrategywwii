// Ciclo economico giornaliero (sistema da mettere in SYSTEMS): per ogni nazione, nell'ordine
//  1. estrazione di base dei territori che possiede → scorte;  2. produzione (produceDay: centrali, energia, fabbriche, collo di bottiglia);
//  3. entrata a valore aggiunto (dailyIncome) → cassa.
// Funzione PURA: createEconomySystem(ctx) ritorna (state) => state, senza Date.now né Math.random.
// NON ancora presenti: spese di mantenimento, costruzioni in corso, limiti di magazzino, commercio, miniere costruite dal giocatore (state.mines è ignorato),
// cambi di proprietà dei territori (proprietà e province sono quelle del 1936). Le scorte quindi possono crescere senza limite dove la produzione supera i consumi.
import { produceDay } from '../rules/production.js';
import { dailyIncome } from '../rules/treasury.js';

const r3 = (v) => Math.round(v * 1000) / 1000;

/** MW idroelettrici in servizio alla data, per proprietario: { idProprietario: MW }. Le centrali sono legate a una provincia P_<territorio>_… */
export function hydroMwByOwner(hydroFile, date, ownerOf) {
  const out = {};
  for (const p of hydroFile.plants) {
    if (p.validFrom > date) continue;
    const territory = (p.provinceId ?? '').split('_')[1];
    const owner = ownerOf.get(territory);
    if (!owner) continue;
    out[owner] = (out[owner] ?? 0) + (p.megawatts ?? 0);
  }
  return out;
}

/**
 * ctx: { catalog: { recipes: Map, factories: Map }, economy, baseline (extraction_baseline.json), hydro (hydro_plants.json), political, cash (initial_cash.json: province per proprietario) }
 */
export function createEconomySystem({ catalog, economy, baseline, hydro, political, cash }) {
  const ownerOf = new Map(political.map((e) => [e.id, e.owner ?? e.id]));
  const supply = {};
  for (const [territory, row] of Object.entries(baseline.byTerritory)) {
    const owner = ownerOf.get(territory);
    if (!owner) throw new Error(`economia: estrazione di ${territory}, che non è un'entità politica`);
    supply[owner] ??= {};
    for (const [res, t] of Object.entries(row)) supply[owner][res] = r3((supply[owner][res] ?? 0) + t);
  }
  return function economyDay(state) {
    if (!state.nations) return state;
    const hydroNow = hydroMwByOwner(hydro, state.date, ownerOf);
    const nations = {};
    for (const id of Object.keys(state.nations).sort()) {
      const n = state.nations[id];
      const extracted = supply[id] ?? {};
      const stock = { ...n.stocks };
      for (const [res, t] of Object.entries(extracted)) stock[res] = r3((stock[res] ?? 0) + t);
      let produced = {}; let consumed = {}; let after = stock;
      if (n.facilities.length > 0) {
        const r = produceDay({ facilities: n.facilities, stock, hydroMw: (hydroNow[id] ?? 0) + n.baseGridMw }, catalog);
        after = r.stock; produced = r.balance.produced; consumed = r.balance.consumed;
      }
      const goods = { ...extracted };
      for (const [res, t] of Object.entries(produced)) goods[res] = r3((goods[res] ?? 0) + t);
      const income = dailyIncome({ goods, inputs: consumed, territory: { provinces: cash.nations[id]?.provinces ?? 0, cities: 0, capitals: 1 } }, economy, state.difficulty).total;
      nations[id] = { ...n, stocks: after, balance: r3(n.balance + income) };
    }
    return { ...state, nations };
  };
}
