// Rotte marittime (30/10/2026, prima versione): porti, costi di navigazione e percorso minimo sul grafo delle zone di data/sea_zones.json.
// Funzioni PURE e deterministiche. Nessun dato nuovo di geometria: la distanza di ogni arco è tra i semi delle due zone (formula dell'emiverseno,
// APPROSSIMAZIONE dichiarata: una zona grande viene attraversata «da seme a seme»). I parametri (data/sea_routes_params.json) sono DESIGN_DEFAULT.
// Porto = provincia costiera con almeno `minCoastKm` di costa su una zona di mare. Finché non esistono i porti reali del 1936 ogni provincia costiera
// è un possibile porto (ipotesi). Un percorso non passa da zone chiuse né da stretti il cui controllore è bloccato.
// NON implementato: capacità dei porti, rischi e perdite in mare, scorte di navi, traghetti (data/city_links.json), stagioni, ghiaccio.
import { SEA_KINDS } from './sea.js';

export const SEA_ROUTES_SCHEMA = 'sea-routes-v1';
const R_KM = 6371;

/** Distanza (km) tra due punti [lon, lat]. Il seno di metà differenza di longitudine è periodico: il giro dell'antimeridiano è gestito da sé. */
export function haversineKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Errori dei parametri (lista vuota = valido). seaFile: data/sea_zones.json; politicalIds: id di data/political_1936.json. */
export function validateSeaRoutesParams(params, seaFile, politicalIds) {
  const errors = [];
  if (params === null || typeof params !== 'object') return ['rotte mare: parametri mancanti'];
  if (params.schema !== SEA_ROUTES_SCHEMA) errors.push(`rotte mare: schema ${JSON.stringify(params.schema)} (atteso ${SEA_ROUTES_SCHEMA})`);
  if (params.quality !== 'hypothesis') errors.push('rotte mare: la qualità deve restare "hypothesis" finché i valori non hanno una fonte');
  for (const kind of SEA_KINDS) {
    if (!(params.speedKmPerDay?.[kind] > 0)) errors.push(`rotte mare: velocità non positiva per il tipo ${kind}`);
  }
  for (const kind of Object.keys(params.speedKmPerDay ?? {})) if (!SEA_KINDS.includes(kind)) errors.push(`rotte mare: velocità per un tipo sconosciuto (${kind})`);
  if (!Number.isInteger(params.portHandlingDays) || params.portHandlingDays < 0) errors.push('rotte mare: portHandlingDays deve essere un intero >= 0');
  if (!(params.minCoastKm >= 0)) errors.push('rotte mare: minCoastKm non valido');
  const zones = new Map((seaFile?.zones ?? []).map((z) => [z.id, z]));
  if (params.closedZones !== undefined && !Array.isArray(params.closedZones)) errors.push('rotte mare: closedZones deve essere un elenco');
  const closed = Array.isArray(params.closedZones) ? params.closedZones : [];
  if (new Set(closed).size !== closed.length) errors.push('rotte mare: closedZones ha zone duplicate');
  for (const id of closed) if (!zones.has(id)) errors.push(`rotte mare: zona chiusa ${id}, che non esiste`);
  const known = new Set(politicalIds ?? []);
  for (const [zoneId, controllers] of Object.entries(params.straitControl ?? {})) {
    const z = zones.get(zoneId);
    if (!z) { errors.push(`rotte mare: controllo di ${zoneId}, che non è una zona`); continue; }
    if (z.kind !== 'strait') errors.push(`rotte mare: ${zoneId} ha un controllore ma non è uno stretto`);
    if (!Array.isArray(controllers) || controllers.length === 0) { errors.push(`rotte mare: ${zoneId} senza controllori`); continue; }
    if (new Set(controllers).size !== controllers.length) errors.push(`rotte mare: ${zoneId} ha controllori duplicati`);
    for (const c of controllers) if (known.size > 0 && !known.has(c)) errors.push(`rotte mare: ${zoneId} controllato da ${c}, che non esiste`);
  }
  return errors;
}

/**
 * Grafo delle zone con costi. Ogni arco: km tra i semi e giorni = km / velocità (la minore tra i tipi delle due zone).
 * Lancia un Error se un arco punta a una zona mancante (il file di mare è validato altrove da validateSea).
 */
export function buildSeaGraph(seaFile, params) {
  const byId = new Map(seaFile.zones.map((z) => [z.id, z]));
  const adj = new Map();
  for (const z of seaFile.zones) {
    const list = [];
    for (const [n] of z.neighbors) {
      const o = byId.get(n);
      if (!o) throw new Error(`rotte mare: ${z.id} confina con ${n}, che non esiste`);
      const km = Math.max(1, Math.round(haversineKm(z.seed, o.seed)));
      const speed = Math.min(params.speedKmPerDay[z.kind], params.speedKmPerDay[o.kind]);
      list.push({ to: n, km, days: km / speed });
    }
    adj.set(z.id, list);
  }
  return {
    params,
    has: (id) => byId.has(id),
    zone: (id) => byId.get(id) ?? null,
    zoneIds: () => [...byId.keys()],
    neighbors: (id) => adj.get(id) ?? [],
    /** Nazioni che controllano uno stretto, o null. */
    control: (id) => params.straitControl?.[id] ?? null,
  };
}

/**
 * Porti di una nazione: una provincia per zona di mare (quella con più costa; a parità, l'id minore).
 * ownerOf(idProvincia) → proprietario; portFilter(idProvincia, idZona) facoltativo per restringere ai porti reali.
 * Ritorna [{ province, zone, coastKm }] ordinato per zona.
 */
export function nationPorts(seaFile, provinceIds, ownerOf, nation, { minCoastKm = 0, portFilter = null } = {}) {
  const best = new Map();
  for (const z of seaFile.zones) {
    for (const [p, km] of z.coastal) {
      if (km < minCoastKm) continue;
      const id = provinceIds[p];
      if (ownerOf(id) !== nation) continue;
      if (portFilter && !portFilter(id, z.id)) continue;
      const cur = best.get(z.id);
      if (!cur || km > cur.coastKm || (km === cur.coastKm && id < cur.province)) best.set(z.id, { province: id, zone: z.id, coastKm: km });
    }
  }
  return [...best.values()].sort((a, b) => (a.zone < b.zone ? -1 : 1));
}

/** Uno stretto è chiuso se tutti i suoi controllori sono bloccati e nessuno è venditore o compratore (come per la via terra). */
function straitClosed(graph, zoneId, blocked, seller, buyer) {
  const controllers = graph.control(zoneId);
  if (!controllers) return false;
  return controllers.every((c) => blocked.has(c) && c !== seller && c !== buyer);
}

/**
 * Percorso marittimo più rapido (in giorni) tra due insiemi di porti.
 * options: { seller, buyer, blocked: Set di nazioni, closedZones: Set di id zona }.
 * Ritorna { ok: true, kind: 'sea', km, days, zones, via, ports: { from, to } } oppure { ok: false, reason }:
 * 'same_nation' | 'no_port_seller' | 'no_port_buyer' | 'no_route'. `via` = controllori degli stretti attraversati, esclusi venditore e compratore.
 */
export function findSeaRoute(graph, fromPorts, toPorts, { seller = null, buyer = null, blocked = new Set(), closedZones = new Set() } = {}) {
  if (seller !== null && seller === buyer) return { ok: false, reason: 'same_nation' };
  if (fromPorts.length === 0) return { ok: false, reason: 'no_port_seller' };
  if (toPorts.length === 0) return { ok: false, reason: 'no_port_buyer' };
  const open = (id) => graph.has(id) && !closedZones.has(id) && !straitClosed(graph, id, blocked, seller, buyer);
  const targets = new Map(toPorts.filter((p) => open(p.zone)).map((p) => [p.zone, p]));
  const starts = new Map(fromPorts.filter((p) => open(p.zone)).map((p) => [p.zone, p]));
  if (targets.size === 0 || starts.size === 0) return { ok: false, reason: 'no_route' };
  const dist = new Map(); const km = new Map(); const prev = new Map(); const done = new Set();
  for (const id of starts.keys()) { dist.set(id, 0); km.set(id, 0); }
  for (;;) {
    let cur = null; let best = Infinity;
    for (const [id, d] of dist) if (!done.has(id) && (d < best - 1e-12 || (Math.abs(d - best) <= 1e-12 && id < cur))) { cur = id; best = d; }
    if (cur === null) return { ok: false, reason: 'no_route' };
    if (targets.has(cur)) {
      const zones = [cur];
      while (prev.has(zones[0])) zones.unshift(prev.get(zones[0]));
      const via = [...new Set(zones.flatMap((z) => graph.control(z) ?? []))].filter((n) => n !== seller && n !== buyer).sort();
      const handling = 2 * (graph.params.portHandlingDays ?? 0);
      return {
        ok: true, kind: 'sea', km: km.get(cur), days: Math.max(1, Math.ceil(best + handling - 1e-9)),
        zones, via, ports: { from: starts.get(zones[0]), to: targets.get(cur) },
      };
    }
    done.add(cur);
    for (const e of graph.neighbors(cur)) {
      if (done.has(e.to) || !open(e.to)) continue;
      const nd = best + e.days;
      if (!dist.has(e.to) || nd < dist.get(e.to) - 1e-12) { dist.set(e.to, nd); km.set(e.to, km.get(cur) + e.km); prev.set(e.to, cur); }
    }
  }
}

/**
 * Contesto pronto per il commercio: { graph, portsOf(nazione), route(venditore, compratore) }.
 * ownerOf(idProvincia) deve dare il proprietario ATTUALE; blocked e closedZones sono letti a ogni chiamata (funzioni o insiemi).
 * Le zone di params.closedZones (ghiaccio artico) sono sempre chiuse; closedZones aggiunge chiusure di partita (blocchi, mine).
 */
export function createSeaContext({ seaFile, params, provinceIds, ownerOf, portFilter = null, blocked = new Set(), closedZones = new Set() }) {
  const graph = buildSeaGraph(seaFile, params);
  const get = (v) => (typeof v === 'function' ? v() : v);
  const portsOf = (nation) => nationPorts(seaFile, provinceIds, ownerOf, nation, { minCoastKm: params.minCoastKm, portFilter });
  const baseClosed = params.closedZones ?? [];
  const route = (seller, buyer) => findSeaRoute(graph, portsOf(seller), portsOf(buyer), { seller, buyer, blocked: get(blocked), closedZones: new Set([...baseClosed, ...get(closedZones)]) });
  return { graph, portsOf, route };
}
