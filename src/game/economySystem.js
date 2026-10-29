// Ciclo economico giornaliero (sistema da mettere in SYSTEMS): per ogni nazione, nell'ordine
//  1. estrazione di base dei territori che possiede → scorte;  2. produzione (produceDay: centrali, energia, fabbriche, collo di bottiglia);
//  3. entrata a valore aggiunto (dailyIncome) → cassa.
// Funzione PURA: createEconomySystem(ctx) ritorna (state) => state, senza Date.now né Math.random.
// Con `livestock` (facoltativo; senza, comportamento invariato) il giorno ha due passi in più, prima della produzione (29/10/2026):
//  a. fertilizzanti: la scorta di fertilizzante aumenta il frumento estratto (rules/fertilizer.js);
//  b. mantenimento del pool dei cavalli: i cavalli in scorta mangiano il mangime in scorta, chi resta senza cibo muore in parte (rules/horsePool.js).
// Il fertilizzante e il mangime consumati contano come ingressi nel valore aggiunto (costano, come ogni merce consumata).
// Le miniere costruite (state.mines, dati in mine_sites.json) aumentano l'estrazione; le costruzioni in corso sono in game/construction.js.
// NON ancora presenti: spese di mantenimento, limiti di magazzino, commercio, cambi di proprietà dei territori (proprietà e province sono quelle del 1936). Le scorte quindi possono crescere senza limite dove la produzione supera i consumi.
import { produceDay } from '../rules/production.js';
import { fertilizerEffect } from '../rules/fertilizer.js';
import { horseUpkeep } from '../rules/horsePool.js';
import { dailyIncome } from '../rules/treasury.js';
import { entityOfProvinceId } from '../data/provinceOwner.js';

const r3 = (v) => Math.round(v * 1000) / 1000;

/** MW idroelettrici in servizio alla data, per proprietario: { idProprietario: MW }. Le centrali sono legate a una provincia P_<territorio>_… */
export function hydroMwByOwner(hydroFile, date, ownerOf) {
  const out = {};
  for (const p of hydroFile.plants) {
    if (p.validFrom > date) continue;
    const territory = entityOfProvinceId(p.provinceId ?? '', ownerOf.keys());
    const owner = ownerOf.get(territory);
    if (!owner) continue;
    out[owner] = (out[owner] ?? 0) + (p.megawatts ?? 0);
  }
  return out;
}

/**
 * ctx: { sites (mine_sites.json, opzionale), catalog: { recipes: Map, factories: Map }, economy, baseline (extraction_baseline.json), hydro (hydro_plants.json), political, cash (initial_cash.json: province per proprietario),
 *        livestock (opzionale): { fertilizer: contenuto di fertilizer_effect.json, horses: contenuto di horse_breeding.json } }
 */
export function createEconomySystem({ catalog, economy, baseline, hydro, political, cash, sites = { byProvince: {} }, livestock = null }) {
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
      const extracted = { ...(supply[id] ?? {}) };
      for (const m of n.mines ?? []) { // miniere costruite dal giocatore: produzione in più della base al livello raggiunto
        const extra = sites.byProvince[m.provinceId]?.[m.resource]?.extraPerDay[m.level - 1];
        if (extra) extracted[m.resource] = r3((extracted[m.resource] ?? 0) + extra);
      }
      const stock = { ...n.stocks };
      const upfront = {}; // consumi fuori dalle fabbriche (fertilizzante, mangime del pool): contano come ingressi nell'entrata
      if (livestock) { // a. fertilizzanti: più frumento estratto, in proporzione alla copertura
        const f = fertilizerEffect({ baseWheat: extracted.wheat ?? 0, fertilizer: stock.fertilizer ?? 0 }, livestock.fertilizer);
        if (f.used > 0) {
          stock.fertilizer = r3((stock.fertilizer ?? 0) - f.used);
          extracted.wheat = r3((extracted.wheat ?? 0) + f.extraWheat);
          upfront.fertilizer = f.used;
        }
      }
      for (const [res, t] of Object.entries(extracted)) stock[res] = r3((stock[res] ?? 0) + t);
      if (livestock && (stock.horses ?? 0) > 0) { // b. mantenimento del pool: prima i cavalli già nati, poi gli allevamenti prendono il mangime che resta
        const u = horseUpkeep({ horses: stock.horses, feed: stock.feed ?? 0 }, livestock.horses.upkeep);
        stock.horses = u.horses;
        stock.feed = r3((stock.feed ?? 0) - u.feedUsed);
        if (u.feedUsed > 0) upfront.feed = u.feedUsed;
      }
      let produced = {}; let consumed = {}; let after = stock;
      if (n.facilities.length > 0) {
        const r = produceDay({ facilities: n.facilities, stock, hydroMw: (hydroNow[id] ?? 0) + n.baseGridMw }, catalog);
        after = r.stock; produced = r.balance.produced; consumed = r.balance.consumed;
      }
      for (const [res, t] of Object.entries(upfront)) consumed = { ...consumed, [res]: r3((consumed[res] ?? 0) + t) };
      const goods = { ...extracted };
      for (const [res, t] of Object.entries(produced)) goods[res] = r3((goods[res] ?? 0) + t);
      const income = dailyIncome({ goods, inputs: consumed, territory: { provinces: cash.nations[id]?.provinces ?? 0, cities: 0, capitals: 1 } }, economy, state.difficulty).total;
      nations[id] = { ...n, stocks: after, balance: r3(n.balance + income) };
    }
    return { ...state, nations };
  };
}
