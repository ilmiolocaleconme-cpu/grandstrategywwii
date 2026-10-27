// Tesoreria: entrata giornaliera di una nazione. Funzioni PURE e deterministiche (nessuna data/random).
// Entrata = valore delle merci prodotte o estratte nel giorno (prezzi di data/economy/economy.json) + quota per i territori controllati,
// il tutto per il moltiplicatore di entrata della difficoltà. L'elettricità non ha prezzo (servizio) e non produce entrata.
import { difficulty } from '../data/economy.js';

const round = (v) => Math.round(v * 1000) / 1000;

/**
 * Entrata a VALORE AGGIUNTO (deciso in chat 26/10/2026): valore di ciò che si produce o estrae meno il valore degli ingressi consumati,
 * così una catena (ferro → acciaio → macchinari) non conta due volte lo stesso valore.
 * goods: { merce: tonnellate prodotte o estratte nel giorno }; inputs: { merce: tonnellate consumate nel giorno };
 * territory: { provinces, cities, capitals } (numeri interi di territori controllati).
 * Ritorna { goods, inputs, valueAdded, territory, total, byGood } in ECV; total = (valueAdded + territory) × incomeMul, mai negativo.
 * L'elettricità non ha prezzo (servizio): non produce entrata, mentre il carbone bruciato dalle centrali è un costo.
 */
export function dailyIncome({ goods = {}, inputs = {}, territory = {} }, economy, difficultyId) {
  const d = difficulty(economy, difficultyId);
  if (!d) throw new Error(`difficoltà sconosciuta: ${difficultyId}`);
  const value = (map) => {
    const by = {};
    let sum = 0;
    for (const id of Object.keys(map).sort()) {
      const p = economy.prices[id];
      const t = map[id];
      if (!(t > 0) || typeof p !== 'number') continue; // senza prezzo (elettricità, risorse non commerciate) non conta
      by[id] = round(t * p);
      sum += t * p;
    }
    return { by, sum };
  };
  const out = value(goods);
  const inp = value(inputs);
  const t = economy.territory;
  const terr = (territory.provinces ?? 0) * t.perProvince + (territory.cities ?? 0) * t.perCity + (territory.capitals ?? 0) * t.perCapital;
  const valueAdded = out.sum - inp.sum;
  return { goods: round(out.sum), inputs: round(inp.sum), valueAdded: round(valueAdded), territory: round(terr), byGood: out.by, total: round(Math.max(0, valueAdded + terr) * d.incomeMul) };
}

/** Applica una spesa alla tesoreria. Mai negativa: se non c'è abbastanza ritorna ok:false e NON modifica il saldo. */
export function spend(balance, amount) {
  if (!(amount >= 0)) throw new Error('importo non valido');
  return balance >= amount ? { ok: true, balance: round(balance - amount) } : { ok: false, balance, missing: round(amount - balance) };
}
