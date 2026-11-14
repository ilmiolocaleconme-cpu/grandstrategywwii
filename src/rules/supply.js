// Linea di rifornimento delle divisioni di terra (v1, 14/11/2026). Funzioni PURE. Numeri in data/combat/supply.json (IPOTESI di bilanciamento).
// Una divisione è rifornita se il suo posto è raggiungibile da una FONTE (capitale o porto della nazione) passando per posti controllati dalla nazione,
// con al più `reachBeyond` posti NON controllati lungo il percorso; un passo su un fiume principale senza ponti agibili (canStep) è interrotto.
// Effetto: dopo `graceDays` giorni senza rifornimento la potenza vale `unsuppliedFactor` (si applica come fattore, vedi supplyFactor).
// NON MODELLATI: consumo di scorte (munizioni, carburante, cibo), capacità di ferrovie e strade, rifornimento aereo, depositi, territorio alleato, trasporto navale reale.
export const SUPPLY_SCHEMA = 'supply-v1';

/**
 * Posti riforniti: Map posto → numero di posti non controllati attraversati (0 = in territorio proprio).
 * net.neighbors; sources: posti di partenza (solo quelli controllati partono); controlled(p) → bool; canStep(a, b) → bool (facoltativa); reach: massimo posti non controllati.
 */
export function suppliedPlaces({ net, sources, controlled, canStep = null, reach = 2 }) {
  const best = new Map();
  let frontier = [];
  for (const s of sources) if (controlled(s) && !best.has(s)) { best.set(s, 0); frontier.push(s); }
  // BFS a livelli di costo: prima tutto ciò che costa 0, poi 1, ...
  for (let cost = 0; cost <= reach && frontier.length; cost += 1) {
    const next = [];
    for (let i = 0; i < frontier.length; i += 1) {
      const cur = frontier[i];
      if (best.get(cur) !== cost) continue;
      for (const n of net.neighbors(cur)) {
        if (canStep && !canStep(cur, n)) continue;
        const c = cost + (controlled(n) ? 0 : 1);
        if (c > reach || (best.has(n) && best.get(n) <= c)) continue;
        best.set(n, c);
        (c === cost ? frontier : next).push(n);
      }
    }
    frontier = next;
  }
  return best;
}

export function createSupplyState() {
  return { schema: SUPPLY_SCHEMA, out: {} };
}

/** Aggiorna lo stato: `outIds` = divisioni senza rifornimento oggi, `checkedIds` = tutte quelle valutate oggi (le altre restano com'erano). */
export function updateSupply(supply, { day, outIds, checkedIds }) {
  const out = { ...(supply?.out ?? {}) };
  const outSet = new Set(outIds);
  let changed = false;
  for (const id of checkedIds) {
    if (outSet.has(id)) { if (out[id] === undefined) { out[id] = day; changed = true; } } else if (out[id] !== undefined) { delete out[id]; changed = true; }
  }
  return changed ? { schema: SUPPLY_SCHEMA, out } : (supply ?? createSupplyState());
}

/** Fattore sulla potenza di una divisione: 1 finché rifornita o entro i giorni di tolleranza, poi cfg.unsuppliedFactor. */
export function supplyFactor(supply, unitId, day, cfg) {
  const since = supply?.out?.[unitId];
  return since !== undefined && day - since >= cfg.graceDays ? cfg.unsuppliedFactor : 1;
}

export function validateSupplyState(s) {
  if (s === undefined) return [];
  if (s?.schema !== SUPPLY_SCHEMA) return [`rifornimenti: schema ${JSON.stringify(s?.schema)}`];
  if (s.out === null || typeof s.out !== 'object' || Array.isArray(s.out)) return ['rifornimenti: out non è un oggetto'];
  return Object.entries(s.out).filter(([, d]) => !Number.isInteger(d) || d < 0).map(([id]) => `rifornimenti: giorno di ${id} non valido`);
}

export function validateSupplyConfig(cfg) {
  if (cfg?.schema !== SUPPLY_SCHEMA) return ['rifornimenti: schema del file non valido'];
  const errors = [];
  if (!['ipotesi', 'utente'].includes(cfg.basis)) errors.push('rifornimenti: basis non valido');
  if (!Number.isInteger(cfg.reachBeyond) || cfg.reachBeyond < 0 || cfg.reachBeyond > 10) errors.push('rifornimenti: reachBeyond deve essere un intero 0-10');
  if (!Number.isInteger(cfg.graceDays) || cfg.graceDays < 0 || cfg.graceDays > 60) errors.push('rifornimenti: graceDays deve essere un intero 0-60');
  if (!(cfg.unsuppliedFactor > 0 && cfg.unsuppliedFactor <= 1)) errors.push('rifornimenti: unsuppliedFactor deve essere in (0, 1]');
  return errors;
}
