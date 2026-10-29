// Trinceramento delle divisioni. Funzioni PURE. Una divisione che resta ferma e si trincera, ogni giorno intero senza battaglia, aumenta il
// bonus difensivo fino al giorno `rampDays` (7, dall'utente); poi resta al massimo. Muoversi azzera; un giorno di battaglia non aumenta
// il bonus ma non lo azzera (altrimenti il trinceramento sparirebbe proprio quando serve).
// Il bonus massimo (+50%) è un'IPOTESI di Claude con calcolo in data/units/entrenchment.json (campo rationale).
// Stato: campo OPZIONALE `state.entrench = { schema, dig: { unitId: true }, days: { unitId: n }, pos: { unitId: provincia } }`.
export const ENTRENCH_SCHEMA = 'entrench-v1';
export const DEFAULT_ENTRENCH = Object.freeze({ maxBonus: 0.5, rampDays: 7, curve: 'linear' });

export const createEntrench = () => ({ schema: ENTRENCH_SCHEMA, dig: {}, days: {}, pos: {} });

/** Bonus difensivo (0..maxBonus) dopo `days` giorni interi di trinceramento. */
export function entrenchBonus(days, cfg = DEFAULT_ENTRENCH) {
  if (!(days > 0)) return 0;
  return cfg.maxBonus * Math.min(days, cfg.rampDays) / cfg.rampDays;
}

export function validateEntrenchConfig(cfg) {
  const errors = [];
  if (cfg === null || typeof cfg !== 'object') return ['trinceramento: configurazione mancante'];
  if (!(cfg.maxBonus > 0 && cfg.maxBonus <= 2)) errors.push('trinceramento: maxBonus deve stare tra 0 e 2');
  if (!Number.isInteger(cfg.rampDays) || cfg.rampDays < 1) errors.push('trinceramento: rampDays deve essere un intero >= 1');
  if (cfg.curve !== 'linear') errors.push(`trinceramento: curva ${JSON.stringify(cfg.curve)} non supportata`);
  return errors;
}

/** Inizia o smette di trincerarsi. positions: { unitId: provincia }. Ritorna un nuovo stato di trinceramento. */
export function setDig(entrench, { unitIds, on, positions }) {
  const dig = { ...entrench.dig }; const days = { ...entrench.days }; const pos = { ...entrench.pos };
  for (const id of unitIds) {
    if (on) { if (!dig[id]) { dig[id] = true; days[id] = 0; if (positions[id]) pos[id] = positions[id]; } } else { delete dig[id]; delete days[id]; delete pos[id]; }
  }
  return { ...entrench, dig, days, pos };
}

/**
 * Un giorno. candidates: [{ id, pos, hasOrder, fought, manual }] per le unità che si trincerano. `manual` = scelta del giocatore: vale finché l'unità
 * non riceve un ordine di marcia (poi cade); le altre (es. incarico di difesa) restano candidate. Con un ordine di marcia i giorni tornano a 0;
 * cambiare provincia senza ordine (ritirata) idem; un giorno di battaglia (`fought`) non aumenta il bonus ma non lo azzera.
 * Ritorna il nuovo stato; chi non è più candidato esce.
 */
export function tickEntrench(entrench, candidates, cfg = DEFAULT_ENTRENCH) {
  const dig = {}; const days = {}; const pos = {};
  for (const c of [...candidates].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (c.hasOrder) {
      if (!c.manual) { dig[c.id] = true; days[c.id] = 0; pos[c.id] = c.pos; }
      continue;
    }
    const relocated = entrench.pos[c.id] !== undefined && entrench.pos[c.id] !== c.pos;
    const prev = entrench.days[c.id] ?? 0;
    dig[c.id] = true;
    pos[c.id] = c.pos;
    days[c.id] = relocated ? 0 : (c.fought ? prev : Math.min(prev + 1, cfg.rampDays));
  }
  return { ...entrench, dig, days, pos };
}

export function validateEntrench(e) {
  if (e === undefined) return [];
  if (e === null || typeof e !== 'object' || Array.isArray(e)) return ['trinceramento: non è un oggetto'];
  const errors = [];
  if (e.schema !== ENTRENCH_SCHEMA) errors.push(`trinceramento: schema ${JSON.stringify(e.schema)}`);
  for (const k of ['dig', 'days', 'pos']) if (e[k] === null || typeof e[k] !== 'object') errors.push(`trinceramento: ${k} mancante`);
  if (errors.length) return errors;
  for (const [id, n] of Object.entries(e.days)) if (!Number.isInteger(n) || n < 0) errors.push(`trinceramento: giorni di ${id} non validi`);
  for (const [id, v] of Object.entries(e.dig)) if (v !== true) errors.push(`trinceramento: dig di ${id} non valido`);
  return errors;
}
