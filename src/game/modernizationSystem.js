// Sistema giornaliero della modernizzazione dei battaglioni (21/11/2026, logica delle dotazioni fase 2).
// Per ogni divisione composta da battaglioni (template con `modules`): versioni bersaglio (src/data/modules.js → targetVersions: data,
// tecnologia, armi nuove producibili), e se cambiano nuovo previsto con src/rules/modernize.js; i pezzi in più tornano al magazzino della
// nazione. Una divisione con `modernize: 'hold'` (scelta del giocatore) resta com'è. Stessa regola per il giocatore e per l'IA.
import { targetVersions, compositionWithVersions, sumComposition } from '../data/modules.js';
import { modernizeDivision, plannedOf } from '../rules/modernize.js';
import { unitOf } from '../rules/unitRegistry.js';

const r3 = (v) => Math.round(v * 1000) / 1000;
const same = (a = {}, b = {}) => { const ka = Object.keys(a); return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]); };

/**
 * ctx: { units, templates (tutti, con quelli dei battaglioni), modules (tutti i battaglioni), predecessorsOf(nazione, percorso),
 * researchedOf(state, nazione) → Set, producible(state, nazione, equipment_id) → boolean }.
 */
export function createModernizationSystem({ units, templates, modules, predecessorsOf, researchedOf, producible }) {
  const unitsById = new Map(units.map((u) => [u.id, u]));
  const tplById = new Map(templates.filter((t) => Array.isArray(t.modules)).map((t) => [t.id, t]));
  const withVersions = new Set(modules.filter((m) => m.supersedes).map((m) => m.nation));
  const firstDate = modules.filter((m) => m.supersedes).map((m) => m.availableFrom).sort()[0] ?? null;
  return function modernizationDay(state) {
    if (!state.forces?.initialized || !firstDate || state.date < firstDate) return state;
    let divisions = state.forces.divisions;
    let nations = state.nations;
    const researched = new Map();
    for (const id of Object.keys(divisions).sort()) {
      const d = divisions[id];
      if (d.modernize === 'hold') continue;
      const t = tplById.get(d.templateId);
      const unit = t && unitOf(state, id, unitsById);
      if (!unit || !withVersions.has(unit.nation)) continue;
      if (!researched.has(unit.nation)) researched.set(unit.nation, researchedOf(state, unit.nation));
      const versions = targetVersions({ composition: t.modules, modules, nation: unit.nation, date: state.date, researched: researched.get(unit.nation),
        producible: (eq) => producible(state, unit.nation, eq), current: d.versions ?? {} });
      if (same(versions, d.versions ?? {})) continue;
      const planned = plannedOf(sumComposition(modules, compositionWithVersions(t.modules, versions)));
      const up = modernizeDivision(d, planned, { versions, predecessorsOf: (p) => predecessorsOf(unit.nation, p) });
      divisions = { ...divisions, [id]: up.division };
      if (nations?.[unit.nation] && Object.keys(up.surplus).length) {
        const stocks = { ...nations[unit.nation].stocks };
        for (const [p, q] of Object.entries(up.surplus)) stocks[p] = r3((stocks[p] ?? 0) + q);
        nations = { ...nations, [unit.nation]: { ...nations[unit.nation], stocks } };
      }
    }
    return divisions === state.forces.divisions ? state : { ...state, forces: { ...state.forces, divisions }, nations };
  };
}
