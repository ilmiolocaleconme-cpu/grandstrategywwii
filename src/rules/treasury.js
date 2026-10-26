// Tesoreria: entrata giornaliera di una nazione. Funzioni PURE e deterministiche (nessuna data/random).
// Entrata = valore delle merci prodotte o estratte nel giorno (prezzi di data/economy/economy.json) + quota per i territori controllati,
// il tutto per il moltiplicatore di entrata della difficoltà. L'elettricità non ha prezzo (servizio) e non produce entrata.
import { difficulty } from '../data/economy.js';

const round = (v) => Math.round(v * 1000) / 1000;

/**
 * goods: { risorsa|prodotto: tonnellate del giorno } (produzione delle fabbriche + estrazione)
 * territory: { provinces, cities, capitals } (numeri interi di territori controllati)
 * Ritorna { goods, territory, total, byGood } (in ECV, prima e dopo il moltiplicatore nel campo total).
 */
export function dailyIncome({ goods = {}, territory = {} }, economy, difficultyId) {
  const d = difficulty(economy, difficultyId);
  if (!d) throw new Error(`difficoltà sconosciuta: ${difficultyId}`);
  const byGood = {};
  let goodsValue = 0;
  for (const id of Object.keys(goods).sort()) {
    const p = economy.prices[id];
    const t = goods[id];
    if (!(t > 0) || typeof p !== 'number') continue; // senza prezzo (elettricità, risorse non commerciate) non genera entrata
    byGood[id] = round(t * p);
    goodsValue += t * p;
  }
  const t = economy.territory;
  const terr = (territory.provinces ?? 0) * t.perProvince + (territory.cities ?? 0) * t.perCity + (territory.capitals ?? 0) * t.perCapital;
  return { goods: round(goodsValue), territory: round(terr), byGood, total: round((goodsValue + terr) * d.incomeMul) };
}

/** Applica una spesa alla tesoreria. Mai negativa: se non c'è abbastanza ritorna ok:false e NON modifica il saldo. */
export function spend(balance, amount) {
  if (!(amount >= 0)) throw new Error('importo non valido');
  return balance >= amount ? { ok: true, balance: round(balance - amount) } : { ok: false, balance, missing: round(amount - balance) };
}
