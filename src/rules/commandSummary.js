// Riepilogo in alto dello stato maggiore (primo passo della scheda di comando): solo dati che il motore produce già.
// Prontezza e morale sono medie sulle divisioni del giocatore con condizione; senza divisioni: null (mai zero inventato).
import { conditionOf } from './divisionCondition.js';
import { unitOf } from './unitRegistry.js';

export function commandSummary(state, { nation, unitsById, conditionConfig, availableMen, alerts = 0 }) {
  const ids = Object.keys(state.forces?.divisions ?? {}).filter((id) => unitOf(state, id, unitsById)?.nation === nation);
  const conds = ids.map((id) => conditionOf(state.conditions, id, conditionConfig, nation));
  const avg = (xs) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  return {
    ecv: state.nations?.[nation]?.balance ?? null,
    men: availableMen ?? null,
    readiness: avg(conds.map((c) => c.readiness)),
    morale: avg(conds.map((c) => c.morale)),
    divisions: ids.length,
    alerts,
  };
}
