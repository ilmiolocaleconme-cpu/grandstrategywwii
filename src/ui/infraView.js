// Righe e riepilogo delle strade e delle ferrovie per l'interfaccia (nessun React): funzioni PURE.
import { levelOf, levelName, speedFactor } from '../data/infrastructure.js';
import { describeBuildFailure } from './buildOptions.js';

/**
 * Collegamenti di una provincia madre con le province vicine. ctx: { infra: { index, config }, build (createConstruction), provinceName(id), nationId, techName? }.
 * Solo i collegamenti che si possono migliorare (massimo ≥ 2) o hanno già un livello utile; i sentieri di terra senza possibilità di miglioramento sono contati a parte.
 * Ogni riga: { edgeId, other, level, levelName, ceiling, ceilingName, km, speed, order|null, cost, ok, message, atMax }.
 */
export function provinceLinkRows(state, motherId, { infra, build, provinceName = (id) => id, nationId }) {
  const edges = infra.index.byProvince.get(motherId) ?? [];
  const rows = [];
  let plain = 0;
  for (const e of edges) {
    if (e.ceiling < 2) { plain += 1; continue; }
    const level = levelOf(state, e); const other = e.a === motherId ? e.b : e.a;
    const base = { edgeId: e.id, other: provinceName(other), level, levelName: levelName(infra.config, level), ceiling: e.ceiling, ceilingName: levelName(infra.config, e.ceiling), km: Math.round(e.km), speed: speedFactor(infra.config, level) };
    if (level >= e.ceiling) { rows.push({ ...base, atMax: true, order: null, cost: null, ok: false, message: '' }); continue; }
    const order = { kind: 'infra', edgeId: e.id };
    const r = build.start(state, nationId, order);
    rows.push({ ...base, atMax: false, order, cost: r.ok ? { ecv: r.entry.paid.ecv, steel: r.entry.paid.steel, workers: r.entry.workers, days: r.entry.totalDays } : null, ok: r.ok, message: describeBuildFailure(r) });
  }
  rows.sort((a, b) => (a.atMax - b.atMax) || b.ceiling - a.ceiling || (a.other < b.other ? -1 : 1));
  return { rows, plain };
}

/**
 * Riepilogo della rete di una nazione: km per livello attuale sui collegamenti con massimo ≥ 2 le cui due province sono sue, e km ancora migliorabili.
 * ctx: { infra: { index, config }, entityOf(provinceId), control: state.control }.
 */
export function infraSummary(state, nationId, { infra, entityOf }) {
  const km = { 1: 0, 2: 0, 3: 0, 4: 0 }; let upgradable = 0; let links = 0;
  for (const e of infra.index.edges) {
    if (e.ceiling < 2) continue;
    if (state.control[entityOf(e.a)] !== nationId || state.control[entityOf(e.b)] !== nationId) continue;
    const level = levelOf(state, e);
    km[level] += e.km; links += 1;
    if (level < e.ceiling) upgradable += 1;
  }
  return { links, upgradable, km: Object.fromEntries(Object.entries(km).map(([l, v]) => [l, Math.round(v)])), names: Object.fromEntries(infra.config.levels.map((l) => [l.level, l.name_it])) };
}
