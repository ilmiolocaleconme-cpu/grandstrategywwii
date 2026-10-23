// Risorse per provincia: da DOVE si trovano le risorse (data/resources/resource_locations.csv + location_provinces.csv) alla
// mappa «provincia → risorse presenti». Solo i giacimenti (`kind = deposit`): aggregati, totali nazionali e flussi commerciali
// sono già contati altrove (flag `double_count`) e non hanno una provincia propria. Funzione PURA: riceve righe già lette.
// Non è un dato storico: la posizione è quella approssimata di `location_provinces.csv` (quality = reference).

export const PROVINCE_RESOURCES_SCHEMA = 'province-resources-v1';

/** Ordine di visualizzazione (e di priorità se in una provincia non entrano tutte le icone). */
export const RESOURCE_ORDER = Object.freeze(['oil', 'coal', 'iron_ore', 'bauxite', 'aluminium', 'rubber', 'wheat', 'tungsten', 'tin', 'manganese', 'chromium', 'nickel', 'cobalt', 'molybdenum', 'vanadium', 'antimony', 'mercury', 'sulphur', 'uranium']);

/**
 * Metadati di presentazione: etichetta, simbolo chimico (dove ha senso), famiglia d'icona, colore del distintivo.
 * Le famiglie sono pochi pittogrammi (vedi src/map/resourceIcons.js); i metalli condividono il pittogramma e si distinguono dal simbolo.
 */
export const RESOURCE_META = Object.freeze({
  oil: { label: 'Petrolio', icon: 'pumpjack', color: '#111111' },
  coal: { label: 'Carbone', icon: 'mine', color: '#3a3a3a' },
  iron_ore: { label: 'Minerale di ferro', icon: 'ore', symbol: 'Fe', color: '#8a4b2a' },
  bauxite: { label: 'Bauxite', icon: 'ore', symbol: 'Bx', color: '#b5651d' },
  aluminium: { label: 'Alluminio', icon: 'factory', symbol: 'Al', color: '#5d7a8c' },
  rubber: { label: 'Gomma naturale', icon: 'drop', color: '#2f6f3e' },
  wheat: { label: 'Frumento', icon: 'wheat', color: '#b88a00' },
  tungsten: { label: 'Tungsteno', icon: 'ore', symbol: 'W', color: '#4a4a6a' },
  tin: { label: 'Stagno', icon: 'ore', symbol: 'Sn', color: '#6b7b83' },
  manganese: { label: 'Manganese', icon: 'ore', symbol: 'Mn', color: '#7a3b6e' },
  chromium: { label: 'Cromo', icon: 'ore', symbol: 'Cr', color: '#2b6f8f' },
  nickel: { label: 'Nichel', icon: 'ore', symbol: 'Ni', color: '#4f8a6a' },
  cobalt: { label: 'Cobalto', icon: 'ore', symbol: 'Co', color: '#1f4fa0' },
  molybdenum: { label: 'Molibdeno', icon: 'ore', symbol: 'Mo', color: '#5a5a2a' },
  vanadium: { label: 'Vanadio', icon: 'ore', symbol: 'V', color: '#7a5a2a' },
  antimony: { label: 'Antimonio', icon: 'ore', symbol: 'Sb', color: '#6a3a3a' },
  mercury: { label: 'Mercurio', icon: 'flask', symbol: 'Hg', color: '#8a2a2a' },
  sulphur: { label: 'Zolfo', icon: 'flask', symbol: 'S', color: '#a89a00' },
  uranium: { label: 'Uranio', icon: 'radiation', color: '#2a7a2a' },
});

const rank = (id) => { const i = RESOURCE_ORDER.indexOf(id); return i < 0 ? RESOURCE_ORDER.length : i; };

/**
 * locations: righe di resource_locations.csv; links: righe di location_provinces.csv.
 * Restituisce { schema, byProvince: { provinceId: [resourceId, ...] } } con id unici, in RESOURCE_ORDER, province in ordine alfabetico.
 */
export function buildProvinceResources(locations, links) {
  const deposit = new Map();
  for (const l of locations) if (l.kind === 'deposit') deposit.set(l.location_id, l.resource_id);
  const acc = new Map();
  for (const k of links) {
    const resource = deposit.get(k.location_id);
    if (!resource) continue; // collegamento di una riga non-giacimento
    if (!acc.has(k.province_id)) acc.set(k.province_id, new Set());
    acc.get(k.province_id).add(resource);
  }
  const byProvince = {};
  for (const id of [...acc.keys()].sort()) byProvince[id] = [...acc.get(id)].sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
  return { schema: PROVINCE_RESOURCES_SCHEMA, quality: 'reference', byProvince };
}

/** Errori (lista vuota = valido): schema, id risorsa noti, province esistenti, nessun elenco vuoto o duplicato. */
export function validateProvinceResources(file, { resourceIds, provinceIds }) {
  const errors = [];
  if (!file || file.schema !== PROVINCE_RESOURCES_SCHEMA) return [`risorse per provincia: schema diverso da ${PROVINCE_RESOURCES_SCHEMA}`];
  for (const [pid, list] of Object.entries(file.byProvince ?? {})) {
    if (!provinceIds.has(pid)) errors.push(`risorse per provincia: provincia ${pid} inesistente`);
    if (!Array.isArray(list) || list.length === 0) { errors.push(`risorse per provincia: ${pid} senza risorse`); continue; }
    if (new Set(list).size !== list.length) errors.push(`risorse per provincia: ${pid} ha risorse duplicate`);
    for (const r of list) {
      if (!resourceIds.has(r)) errors.push(`risorse per provincia: ${pid} risorsa ${r} sconosciuta`);
      if (!RESOURCE_META[r]) errors.push(`risorse per provincia: ${r} senza metadati di presentazione`);
    }
  }
  return errors;
}

/**
 * Le province madri divise in sotto-province (`parentProvince`) non esistono più come elementi della mappa: l'icona va su UNA sola
 * sotto-provincia, la più grande (area dell'elemento), perché ripeterla su tutte darebbe l'impressione di più giacimenti.
 * items: elementi del modello ({ props: { id, parentProvince }, areaKm2 }). Restituisce { idElemento: [idRisorsa...] }.
 * Un id che non corrisponde a nessun elemento (né diretto né come madre) viene ignorato.
 */
export function resolveResourceAnchors(items, byProvince) {
  const direct = new Set();
  const children = new Map();
  for (const it of items) {
    direct.add(it.props.id);
    const parent = it.props.parentProvince;
    if (parent) { if (!children.has(parent)) children.set(parent, []); children.get(parent).push(it); }
  }
  const out = {};
  for (const [pid, list] of Object.entries(byProvince ?? {})) {
    if (direct.has(pid)) { out[pid] = list; continue; }
    const kids = children.get(pid);
    if (!kids?.length) continue;
    const best = kids.reduce((a, b) => ((b.areaKm2 ?? 0) > (a.areaKm2 ?? 0) || ((b.areaKm2 ?? 0) === (a.areaKm2 ?? 0) && b.props.id < a.props.id) ? b : a));
    out[best.props.id] = list;
  }
  return out;
}
