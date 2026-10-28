// Produzione giornaliera di una nazione: collo di bottiglia, energia (pool in MW), danno, scorte. Funzione PURA e deterministica:
// stesso ingresso → stesso risultato (nessun Date.now, nessun Math.random), ordine di elaborazione fisso. NON è ancora collegata a SYSTEMS
// (engine.js): serve prima lo stato iniziale dell'industria per nazione. Regole, in ordine:
//  1. Centrali (recipe con outputUnit MW): consumano carbone in proporzione alla potenza prodotta; si elaborano per prime, il pool = loro MW + idro.
//  2. Le altre fabbriche, in ordine di priorità (numero più basso prima) poi per id, prelevano dalla scorta comune.
//  3. Rapporto per ingresso = disponibile / necessario a pieno regime (max 1); il MINORE dei rapporti è il collo di bottiglia.
//  4. Energia: rapporto comune = min(1, pool / domanda) — oggi la carenza riduce in proporzione tutte le fabbriche (da confermare).
//  5. Efficienza effettiva = min(rapporti ingressi, rapporto energia) × (1 − danno). Consumo e produzione sono proporzionali all'efficienza.
//  6. Bilancio: iniziale + prodotto − consumato = finale (nessuna risorsa dal nulla). Tutto in tonnellate; elettricità in MW (flusso, mai in scorta).
import { fullCapacityFlows } from '../data/recipes.js';

const r3 = (v) => Math.round(v * 1000) / 1000;

/**
 * facilities: [{ id, type (factory_id, es. 'FCT-STEEL'), recipeId, damage (0..1), priority (default 100), active (default true) }]
 * stock: { risorsa: tonnellate }; hydroMw: potenza idroelettrica disponibile (MW)
 * catalog: { recipes: Map(id → ricetta), factories: Map(factory_id → fabbrica) }
 * Ritorna { stock, powerMw: { supply, demand, ratio }, facilities: [{ id, efficiency, bottleneck, inputRatios, energyRatio, produced, consumed, state }], balance }
 */
export function produceDay({ facilities, stock, hydroMw = 0 }, catalog) {
  const next = { ...stock };
  const initial = { ...stock };
  const produced = {}; const consumed = {};
  const add = (m, k, v) => { m[k] = r3((m[k] ?? 0) + v); };
  const report = [];
  const ordered = [...facilities].filter((f) => f.active !== false).sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100) || (a.id < b.id ? -1 : 1));
  const info = (f) => {
    const recipe = catalog.recipes.get(f.recipeId);
    const factory = catalog.factories.get(f.type);
    if (!recipe || !factory) throw new Error(`produzione: ${f.id} con ricetta o fabbrica sconosciuta (${f.recipeId}/${f.type})`);
    if (recipe.factory !== f.type) throw new Error(`produzione: ${f.id} usa la ricetta ${f.recipeId} di ${recipe.factory}, non di ${f.type}`);
    const damage = f.damage ?? 0;
    if (!(damage >= 0 && damage <= 1)) throw new RangeError(`produzione: ${f.id} con danno ${damage} fuori da 0-1`);
    return { recipe, factory, flows: fullCapacityFlows(recipe, factory), damage };
  };
  const ratioFor = (flows) => {
    let ratio = 1; let bottleneck = null; const inputRatios = {};
    for (const [res, need] of Object.entries(flows.inputsPerDay)) {
      const r = need > 0 ? Math.min(1, (next[res] ?? 0) / need) : 1;
      inputRatios[res] = r3(r);
      if (r < ratio) { ratio = r; bottleneck = res; }
    }
    return { ratio, bottleneck, inputRatios };
  };
  const consume = (flows, share) => {
    for (const [res, need] of Object.entries(flows.inputsPerDay)) {
      const q = r3(need * share);
      next[res] = r3((next[res] ?? 0) - q);
      add(consumed, res, q);
    }
  };

  // 1) centrali: producono potenza (MW), consumano carbone in proporzione
  let supply = hydroMw;
  const plants = ordered.filter((f) => info(f).flows.outputUnit === 'MW');
  const factories = ordered.filter((f) => info(f).flows.outputUnit !== 'MW');
  for (const f of plants) {
    const { flows, damage } = info(f);
    const { ratio, bottleneck, inputRatios } = ratioFor(flows);
    const eff = ratio * (1 - damage);
    const mw = r3(flows.outputPerDay * eff);
    consume(flows, eff);
    supply = r3(supply + mw);
    report.push({ id: f.id, kind: 'power', efficiency: r3(eff), bottleneck: ratio < 1 ? bottleneck : null, inputRatios, energyRatio: 1, produced: { electricity_mw: mw }, consumed: {}, state: stateOf(eff, damage) });
  }
  // 2) domanda di energia: MW a pieno regime di tutte le fabbriche attive, ripartita in proporzione
  const demand = r3(factories.reduce((t, f) => t + info(f).flows.energyMw, 0));
  const energyRatio = demand > 0 ? Math.min(1, supply / demand) : 1;
  // 3) fabbriche in ordine di priorità
  for (const f of factories) {
    const { recipe, flows, damage } = info(f);
    const { ratio, bottleneck, inputRatios } = ratioFor(flows);
    const limitedBy = ratio <= energyRatio ? bottleneck : 'energy';
    const base = Math.min(ratio, energyRatio);
    const eff = base * (1 - damage);
    const fConsumed = {}; for (const [res, need] of Object.entries(flows.inputsPerDay)) fConsumed[res] = r3(need * eff);
    consume(flows, eff);
    const out = r3(flows.outputPerDay * eff * recipe.output.perUnit);
    next[recipe.output.product] = r3((next[recipe.output.product] ?? 0) + out);
    add(produced, recipe.output.product, out);
    report.push({ id: f.id, kind: 'factory', efficiency: r3(eff), bottleneck: base < 1 ? limitedBy : null, inputRatios, energyRatio: r3(energyRatio), produced: { [recipe.output.product]: out }, consumed: fConsumed, state: stateOf(eff, damage) });
  }
  return { stock: next, powerMw: { supply, demand, ratio: r3(energyRatio) }, facilities: report, balance: { initial, produced, consumed, final: next } };
}

/** Stato leggibile: operativo / ridotta capacità / danneggiato / fermo. Il danno e gli ingressi si distinguono nella UI dal collo di bottiglia. */
function stateOf(eff, damage) {
  if (eff <= 0) return 'fermo';
  if (damage > 0 && damage >= 0.5) return 'danneggiato';
  if (eff < 1) return 'ridotta capacità';
  return 'operativo';
}

/** Verifica del bilancio: per ogni bene, iniziale + prodotto − consumato = finale (tolleranza di arrotondamento). Lista errori vuota = torna. */
export function checkBalance(balance) {
  const errors = [];
  const keys = new Set([...Object.keys(balance.initial), ...Object.keys(balance.produced), ...Object.keys(balance.consumed), ...Object.keys(balance.final)]);
  for (const k of keys) {
    const exp = (balance.initial[k] ?? 0) + (balance.produced[k] ?? 0) - (balance.consumed[k] ?? 0);
    if (Math.abs(exp - (balance.final[k] ?? 0)) > 0.01) errors.push(`bilancio: ${k} iniziale+prodotto−consumato = ${exp}, finale ${balance.final[k] ?? 0}`);
    if ((balance.final[k] ?? 0) < -0.001) errors.push(`bilancio: ${k} finale negativo`);
  }
  return errors;
}
