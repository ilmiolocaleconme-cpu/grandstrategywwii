// Righe dei cantieri navali per l'interfaccia (25/11/2026, nessun React): livello di scalo, tonnellaggio massimo, potenziamento. Funzioni PURE.
import { slipwayCitiesOf, slipwayLevelIn } from '../game/shipyardsState.js';
import { slipwayDef, maxSlipwayLevel } from '../data/shipyards.js';
import { describeBuildFailure } from './buildOptions.js';

const fmtTons = (t) => (t === null ? 'nessun limite' : `fino a ${t.toLocaleString('it-IT')} t`);
export const slipwayText = (levels, level) => { const d = slipwayDef(levels, level); return d ? `${d.name_it} (${fmtTons(d.maxTons)})` : `Scalo livello ${level}`; };

/**
 * Cantieri della provincia madre `motherId`. ctx: { yards: { levels, coastal, historic, motherOf? }, build (createConstruction), nationId }.
 * Ogni riga: { cittaId, name, operator, level, levelText, nextText, atMax, order, cost, ok, message }.
 */
export function provinceSlipwayRows(state, motherId, { yards, build, nationId }) {
  if (!yards) return [];
  return slipwayCitiesOf(state, motherId, yards).map((cittaId) => {
    const level = slipwayLevelIn(state, cittaId, yards);
    const base = { cittaId, name: yards.coastal[cittaId].name, operator: yards.historic.get(cittaId)?.operator ?? null, level, levelText: slipwayText(yards.levels, level) };
    if (level >= maxSlipwayLevel(yards.levels)) return { ...base, nextText: null, atMax: true, order: null, cost: null, ok: false, message: '' };
    const order = { kind: 'slipway', cittaId };
    const r = build.start(state, nationId, order);
    return { ...base, nextText: slipwayText(yards.levels, level + 1), atMax: false, order, cost: r.ok ? { ecv: r.entry.paid.ecv, steel: r.entry.paid.steel, workers: r.entry.workers, days: r.entry.totalDays } : null, ok: r.ok, message: describeBuildFailure(r) };
  }).sort((a, b) => (a.name < b.name ? -1 : 1));
}
