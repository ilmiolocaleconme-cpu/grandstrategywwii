// Zone marittime (data/sea_zones.json). Sono una divisione di GIOCO (qualità `hypothesis`), non
// storica: servono a flotte, porti e rotte commerciali. Come per l'adiacenza, il file è numerico:
// `coastal` usa indici di provincia nell'ordine della collezione unita, protetti da una somma di
// controllo degli id (se le province cambiano il caricamento fallisce: `npm run build:sea`).
import { idsChecksum } from './adjacency.js';

export const SEA_SCHEMA = 'sea-zones-v1';
export const SEA_KINDS = ['ocean', 'sea', 'gulf', 'strait', 'approach'];

/** Errori del file (lista vuota = valido). `ids` sono gli id delle province, in ordine. */
export function validateSea(file, ids) {
  const errors = [];
  if (file === null || typeof file !== 'object') return ['mare: file mancante'];
  if (file.schema !== SEA_SCHEMA) errors.push(`mare: schema ${JSON.stringify(file.schema)} (atteso ${SEA_SCHEMA})`);
  if (file.count !== ids.length) errors.push(`mare: count ${file.count} ma le province sono ${ids.length}`);
  if (file.checksum !== idsChecksum(ids)) errors.push('mare: somma di controllo diversa, le province sono cambiate: rigenerare con npm run build:sea');
  if (!Array.isArray(file.zones)) return [...errors, 'mare: zones non è un elenco'];
  const byId = new Map();
  for (const z of file.zones) {
    if (typeof z.id !== 'string' || !/^SZ_[A-Z0-9_]+$/.test(z.id)) { errors.push(`mare: id non valido ${JSON.stringify(z.id)}`); continue; }
    if (byId.has(z.id)) errors.push(`mare: id duplicato ${z.id}`);
    byId.set(z.id, z);
  }
  for (const z of file.zones) {
    if (!byId.has(z.id)) continue;
    if (typeof z.name !== 'string' || z.name === '') errors.push(`mare: ${z.id} senza nome`);
    if (!SEA_KINDS.includes(z.kind)) errors.push(`mare: ${z.id} tipo ${JSON.stringify(z.kind)} sconosciuto`);
    if (!(z.areaKm2 > 0)) errors.push(`mare: ${z.id} area non positiva`);
    if (!Array.isArray(z.rings) || z.rings.length === 0) errors.push(`mare: ${z.id} senza contorno`);
    for (const ring of z.rings ?? []) {
      if (!Array.isArray(ring) || ring.length < 3) errors.push(`mare: ${z.id} anello con meno di 3 punti`);
    }
    for (const [other, km] of z.neighbors ?? []) {
      const o = byId.get(other);
      if (!o) { errors.push(`mare: ${z.id} confina con ${other}, che non esiste`); continue; }
      if (other === z.id) errors.push(`mare: ${z.id} confina con sé stessa`);
      if (!(km > 0)) errors.push(`mare: ${z.id}-${other} km non positivi`);
      const back = (o.neighbors ?? []).find(([x]) => x === z.id);
      if (!back) errors.push(`mare: confine ${z.id}->${other} non simmetrico`);
      else if (back[1] !== km) errors.push(`mare: confine ${z.id}-${other} con km diversi (${km} / ${back[1]})`);
    }
    for (const [p, km] of z.coastal ?? []) {
      if (!Number.isInteger(p) || p < 0 || p >= ids.length) errors.push(`mare: ${z.id} costa con indice di provincia ${p} fuori intervallo`);
      if (!(km > 0)) errors.push(`mare: ${z.id} costa con km non positivi`);
    }
  }
  // grafo connesso: ogni zona raggiungibile da ogni altra via mare
  if (errors.length === 0 && file.zones.length > 0) {
    const seen = new Set([file.zones[0].id]);
    const stack = [file.zones[0].id];
    while (stack.length > 0) {
      for (const [n] of byId.get(stack.pop()).neighbors) if (!seen.has(n)) { seen.add(n); stack.push(n); }
    }
    for (const z of file.zones) if (!seen.has(z.id)) errors.push(`mare: ${z.id} non è collegata alle altre zone`);
  }
  return errors;
}

/**
 * Zone marittime pronte all'uso. Lancia un Error se il file non corrisponde alle province.
 * `portsOf(provinceId)` = zone costiere della provincia; `zonesOf` ecc. servono a flotte e commercio.
 */
export function buildSea(collection, file) {
  const ids = collection.features.map((f) => f.properties.id);
  const errors = validateSea(file, ids);
  if (errors.length > 0) throw new Error(errors.slice(0, 3).join('; '));
  const zones = new Map(file.zones.map((z) => [z.id, z]));
  const coast = new Map(); // id provincia -> [{zone, km}]
  for (const z of file.zones) {
    for (const [p, km] of z.coastal) {
      const list = coast.get(ids[p]);
      const entry = { zone: z.id, km };
      if (list) list.push(entry); else coast.set(ids[p], [entry]);
    }
  }
  return {
    zone: (id) => zones.get(id) ?? null,
    zoneIds: () => [...zones.keys()],
    neighbors: (id) => (zones.get(id)?.neighbors ?? []).map(([n]) => n),
    areAdjacent: (a, b) => (zones.get(a)?.neighbors ?? []).some(([n]) => n === b),
    coastalZones: (provinceId) => coast.get(provinceId) ?? [],
    isCoastal: (provinceId) => coast.has(provinceId),
  };
}
