// Strade e ferrovie in partita: collegamenti tra PROVINCE MADRI con livello massimo, livello di partenza e km (derivati da data/links.json),
// costo e tempo del miglioramento, effetto sulla velocità di marcia e di commercio. Funzioni PURE, senza I/O. Tutto DESIGN_DEFAULT / hypothesis.
import { difficulty } from './economy.js';
import { LADDER, markerLevelOfStep } from './links.js';

export const INFRA_SCHEMA = 'infrastructure-v1';
export const EDGES_SCHEMA = 'link-edges-v1';
const r3 = (v) => Math.round(v * 1000) / 1000;

/** Errori dei parametri (lista vuota = valido). */
export function validateInfrastructureConfig(cfg) {
  if (cfg?.schema !== INFRA_SCHEMA) return [`infrastrutture: schema ${cfg?.schema}, atteso ${INFRA_SCHEMA}`];
  const errors = [];
  if (cfg.quality !== 'DESIGN_DEFAULT') errors.push('infrastrutture: qualità attesa DESIGN_DEFAULT');
  if ((cfg.levels ?? []).length !== LADDER.length) errors.push(`infrastrutture: servono ${LADDER.length} livelli`);
  (cfg.levels ?? []).forEach((l, i) => {
    if (l.level !== i + 1) errors.push(`infrastrutture: livello ${l.level} fuori ordine`);
    if (!(l.speedFactor > 0)) errors.push(`infrastrutture: L${l.level} con velocità non valida`);
    if (i > 0 && !(l.speedFactor >= cfg.levels[i - 1].speedFactor)) errors.push(`infrastrutture: L${l.level} più lento del livello precedente`);
    if (!l.name_it) errors.push(`infrastrutture: L${l.level} senza nome`);
  });
  for (let t = 2; t <= LADDER.length; t += 1) {
    const u = cfg.upgrade?.toLevel?.[t];
    if (!u || !(u.ecvPerKm > 0) || !(u.kmPerDay > 0) || !(u.workersPerKm >= 0)) errors.push(`infrastrutture: costo del livello ${t} non valido`);
    const keep = cfg.start?.keepAtCeiling?.[t];
    if (!(keep > 0 && keep <= 1)) errors.push(`infrastrutture: frazione di partenza del livello ${t} non valida`);
    if (t > 2 && u && cfg.upgrade.toLevel[t - 1] && !(u.ecvPerKm >= cfg.upgrade.toLevel[t - 1].ecvPerKm)) errors.push(`infrastrutture: il livello ${t} costa meno del precedente`);
  }
  if (cfg.start?.railDropToMainRoad !== undefined && !(cfg.start.railDropToMainRoad >= 0 && cfg.start.railDropToMainRoad <= 1)) errors.push('infrastrutture: railDropToMainRoad non valido');
  if (!(cfg.upgrade?.minDays >= 1)) errors.push('infrastrutture: minDays non valido');
  return errors;
}

/**
 * Collegamenti tra province madri dal grafo dei collegamenti. links = data/links.json; provinces = proprietà delle province nell'ordine del grafo
 * (id, owner, parentProvince?). Ritorna il contenuto di data/infrastructure/link_edges.json.
 */
export function buildLinkEdges({ links, config, provinces }) {
  const motherOf = provinces.map((p) => p.parentProvince ?? p.id);
  const ownerOf = new Map();
  provinces.forEach((p, i) => { if (!ownerOf.has(motherOf[i]) || p.parentProvince == null) ownerOf.set(motherOf[i], p.owner); });
  const pop = new Map();
  for (const n of links.nodes) { const m = motherOf[n.p]; if (m !== undefined) pop.set(m, Math.max(pop.get(m) ?? 0, n.pop ?? 0)); }
  const agg = new Map();
  for (const l of links.links) {
    const a = motherOf[l.a]; const b = motherOf[l.b];
    if (a === undefined || b === undefined || a === b) continue;
    const [x, y] = a < b ? [a, b] : [b, a];
    const key = `${x}~${y}`;
    const cur = agg.get(key) ?? { x, y, ceiling: 0, km: Infinity };
    if (l.t > cur.ceiling || (l.t === cur.ceiling && l.km < cur.km)) { cur.ceiling = l.t; cur.km = l.km; }
    agg.set(key, cur);
  }
  const ids = [...new Set([...agg.values()].flatMap((e) => [e.x, e.y]))].sort();
  const idx = new Map(ids.map((id, i) => [id, i]));
  const edges = [...agg.values()].map((e) => ({ ...e, id: `${e.x}~${e.y}`, importance: (pop.get(e.x) ?? 0) + (pop.get(e.y) ?? 0), nation: ownerOf.get(e.x) }));
  // livello di partenza: in ogni nazione, per ogni livello massimo ≥ 2, restano al massimo solo i collegamenti più importanti
  const groups = new Map();
  for (const e of edges) { e.start = e.ceiling; if (e.ceiling >= 2) { const k = `${e.nation}|${e.ceiling}`; (groups.get(k) ?? groups.set(k, []).get(k)).push(e); } }
  for (const [k, list] of groups) {
    const ceiling = Number(k.split('|')[1]);
    list.sort((p, q) => q.importance - p.importance || (p.id < q.id ? -1 : 1));
    const keep = Math.ceil(config.start.keepAtCeiling[ceiling] * list.length);
    const dropped = list.slice(keep);
    if (ceiling === 4) { const toMain = Math.ceil((config.start.railDropToMainRoad ?? 1) * dropped.length); dropped.forEach((e, i) => { e.start = i < toMain ? 3 : 1; }); }
    else dropped.forEach((e) => { e.start = ceiling - 1; });
  }
  edges.sort((p, q) => (p.id < q.id ? -1 : 1));
  const byCeiling = {}; const startAtCeiling = {}; const kmStart = {};
  for (const e of edges) {
    byCeiling[e.ceiling] = (byCeiling[e.ceiling] ?? 0) + 1;
    if (e.start === e.ceiling) startAtCeiling[e.ceiling] = (startAtCeiling[e.ceiling] ?? 0) + 1;
    kmStart[e.start] = Math.round((kmStart[e.start] ?? 0) + e.km);
  }
  return {
    schema: EDGES_SCHEMA, quality: 'hypothesis',
    note: 'Derivato da data/links.json (rete moderna, hypothesis) con data/infrastructure/infrastructure.json: rigenerare con node scripts/build-infrastructure.js. Un collegamento per coppia di province madri: livello massimo = il più alto dei collegamenti tra le loro parti, km = il più breve di quelli al livello massimo.',
    source: { links: links.schema, checksum: links.checksum }, provinces: ids,
    edges: edges.map((e) => [idx.get(e.x), idx.get(e.y), e.ceiling, e.start, Math.round(e.km * 10) / 10]),
    counts: { byCeiling, startAtCeiling, kmByStartLevel: kmStart },
  };
}

/** Errori del file dei collegamenti (lista vuota = valido). provinceIds = insieme degli id delle province madri esistenti. */
export function validateLinkEdges(file, { provinceIds = null } = {}) {
  if (file?.schema !== EDGES_SCHEMA) return [`collegamenti: schema ${file?.schema}, atteso ${EDGES_SCHEMA}`];
  const errors = [];
  if (file.quality !== 'hypothesis') errors.push('collegamenti: qualità attesa hypothesis');
  const n = file.provinces?.length ?? 0;
  if (provinceIds) for (const id of file.provinces) if (!provinceIds.has(id)) errors.push(`collegamenti: provincia sconosciuta ${id}`);
  const seen = new Set();
  for (const [a, b, ceiling, start, km] of file.edges ?? []) {
    if (!(Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b < n && a < b)) { errors.push(`collegamenti: coppia non valida ${a},${b}`); continue; }
    if (seen.has(`${a}|${b}`)) errors.push(`collegamenti: coppia duplicata ${file.provinces[a]}~${file.provinces[b]}`);
    seen.add(`${a}|${b}`);
    if (![1, 2, 3, 4].includes(ceiling) || ![1, 2, 3, 4].includes(start) || start > ceiling) errors.push(`collegamenti: livelli non validi ${file.provinces[a]}~${file.provinces[b]}`);
    if (!(km > 0)) errors.push(`collegamenti: km non validi ${file.provinces[a]}~${file.provinces[b]}`);
  }
  return errors;
}

/** Indice dei collegamenti: { edges, byId, byProvince, pair(a, b) } con edge = { id, a, b, ceiling, start, km }. */
export function createInfraIndex(file) {
  const edges = (file?.edges ?? []).map(([ia, ib, ceiling, start, km]) => ({ id: `${file.provinces[ia]}~${file.provinces[ib]}`, a: file.provinces[ia], b: file.provinces[ib], ceiling, start, km }));
  const byId = new Map(edges.map((e) => [e.id, e]));
  const byProvince = new Map();
  for (const e of edges) for (const p of [e.a, e.b]) (byProvince.get(p) ?? byProvince.set(p, []).get(p)).push(e);
  return { edges, byId, byProvince, pair: (a, b) => byId.get(a < b ? `${a}~${b}` : `${b}~${a}`) ?? null };
}

/** Livello attuale di un collegamento: quello migliorato in partita, altrimenti quello di partenza. */
export const levelOf = (state, edge) => state?.infrastructure?.levels?.[edge.id] ?? edge.start;

export const levelName = (config, level) => config.levels.find((l) => l.level === level)?.name_it ?? `L${level}`;
export const speedFactor = (config, level) => config.levels.find((l) => l.level === level)?.speedFactor ?? 1;

/** Costo del miglioramento da `fromLevel` a `fromLevel + 1`: { ecv, steel, workers, days }. Null se il livello non esiste. economy = economy.json. */
export function upgradeEdgeCost(config, economy, edge, fromLevel, difficultyId) {
  const u = config.upgrade.toLevel[fromLevel + 1];
  const d = difficulty(economy, difficultyId);
  const k = economy.construction?.steelPerEcv;
  if (!u || !d || !(k > 0)) return null;
  const ecv = r3(edge.km * u.ecvPerKm * d.costMul);
  return { ecv, steel: r3(ecv * k), workers: Math.round(edge.km * u.workersPerKm), days: Math.max(config.upgrade.minDays, Math.ceil((edge.km / u.kmPerDay) * d.timeMul)) };
}

/**
 * Rete di movimento con le strade della partita: i chilometri tra due province vicine sono divisi per il fattore di velocità del livello del
 * collegamento (senza collegamento: 1). Percorsi e tempi di marcia e di commercio ne tengono conto senza altre modifiche. `km` NON è più la distanza
 * geografica ma i «km equivalenti» a velocità di strada.
 */
export function infraNet(net, index, config, state) {
  return { ...net, km: (a, b) => { const e = index.pair(a, b); return net.km(a, b) / (e ? speedFactor(config, levelOf(state, e)) : 1); } };
}

/**
 * Copia del grafo dei collegamenti (data/links.json) con i gradini della PARTITA: ogni collegamento tra due province madri passa al minimo
 * tra il suo gradino e il livello del collegamento tra le madri; tratti e ponti seguono (stessa regola di applyRailOverrides). provinceIds = ids nell'ordine del grafo.
 */
export function applyLinkLevels(file, { provinceIds, motherOf, index, state }) {
  const lad = (t) => LADDER.find((x) => x.t === t);
  const newT = new Map();
  for (const l of file.links) {
    const a = motherOf(provinceIds[l.a]); const b = motherOf(provinceIds[l.b]);
    if (!a || !b || a === b) continue;
    const e = index.pair(a, b);
    if (!e) continue;
    const t = Math.min(l.t, levelOf(state, e));
    if (t !== l.t) newT.set(l.id, t);
  }
  if (newT.size === 0) return file;
  const links = file.links.map((l) => (newT.has(l.id) ? { ...l, t: newT.get(l.id) } : l));
  const segments = file.segments.map((s) => { const t = newT.get(s.link); if (t === undefined) return s; const st = lad(t); return { ...s, t, k: st.k, level: st.level, rank: st.rank }; });
  const bridges = file.bridges.map((b) => { const t = newT.get(b.link); if (t === undefined) return b; const st = lad(t); const ml = markerLevelOfStep(t); return { ...b, t, mode: st.k, level: ml, road: st.k === 'road' ? ml : 0, rail: st.k === 'rail' ? ml : 0 }; });
  const nodeT = new Map();
  for (const l of links) for (const p of [l.a, l.b]) nodeT.set(p, Math.max(nodeT.get(p) ?? 1, l.t));
  const nodes = file.nodes.map((n) => ({ ...n, t: nodeT.get(n.p) ?? n.t }));
  return { ...file, links, segments, bridges, nodes };
}
