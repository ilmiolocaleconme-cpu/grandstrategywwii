// Righe dei porti per l'interfaccia (nessun React): funzioni PURE.
import { portLevelIn } from '../game/portsState.js';
import { portLevelDef, maxPortLevel } from '../data/portLevels.js';
import { describeBuildFailure } from './buildOptions.js';

export const portLevelName = (levels, level) => (level === 0 ? 'Nessun porto' : portLevelDef(levels, level)?.name_it ?? `L${level}`);

/**
 * Porti delle città costiere di una provincia madre. ctx: { ports: { levels, coastal, base }, build (createConstruction), nationId, techName? }.
 * Ogni riga: { cittaId, name, level, levelName, nextName, atMax, order, cost, ok, message }. Le città a più parti compaiono una volta sola (stesso cittaId).
 */
export function provincePortRows(state, motherId, { ports, build, nationId, techName = (id) => id }) {
  if (!ports) return [];
  const rows = [];
  for (const [cittaId, c] of Object.entries(ports.coastal)) {
    if (c.parentProvince !== motherId) continue;
    const level = portLevelIn(state, ports.base, cittaId);
    const base = { cittaId, name: c.name, level, levelName: portLevelName(ports.levels, level) };
    if (level >= maxPortLevel(ports.levels)) { rows.push({ ...base, nextName: null, atMax: true, order: null, cost: null, ok: false, message: '' }); continue; }
    const order = { kind: 'port', cittaId };
    const r = build.start(state, nationId, order);
    rows.push({ ...base, nextName: portLevelName(ports.levels, level + 1), atMax: false, order, cost: r.ok ? { ecv: r.entry.paid.ecv, steel: r.entry.paid.steel, workers: r.entry.workers, days: r.entry.totalDays } : null, ok: r.ok, message: describeBuildFailure(r, techName) });
  }
  return rows.sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** Numero di porti per livello nei territori della nazione (controllo della provincia madre). */
export function portSummary(state, nationId, { ports, entityOf }) {
  const count = { 1: 0, 2: 0, 3: 0 };
  if (!ports) return { count, total: 0, names: {} };
  for (const [cittaId, c] of Object.entries(ports.coastal)) {
    if (state.control[entityOf(c.parentProvince)] !== nationId) continue;
    const level = portLevelIn(state, ports.base, cittaId);
    if (level > 0) count[level] += 1;
  }
  return { count, total: count[1] + count[2] + count[3], names: Object.fromEntries(ports.levels.levels.map((l) => [l.level, l.name_it])) };
}
