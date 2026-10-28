// Risorse per provincia: da DOVE si trovano le risorse (data/resources/resource_locations.csv + location_provinces.csv) alla
// mappa «provincia → risorse presenti». Solo i giacimenti (`kind = deposit`): aggregati, totali nazionali e flussi commerciali
// sono già contati altrove (flag `double_count`) e non hanno una provincia propria. Funzione PURA: riceve righe già lette.
// Non è un dato storico: la posizione è quella approssimata di `location_provinces.csv` (quality = reference).

export const PROVINCE_RESOURCES_SCHEMA = 'province-resources-v1';

/**
 * Prodotti: non sono risorse naturali ma uscita di una fabbrica (deciso in chat, 24/10/2026). L'alluminio si ottiene da bauxite ed energia:
 * i suoi centri sono fonderie e il loro punteggio è capacità industriale di base. Restano nel modello a punti, ma a parte, e non sulla mappa Risorse.
 */
export const PRODUCT_IDS = Object.freeze(['aluminium', 'steel']);
// inputs: materie prime consumate; factory: id in data/industry/factories.csv. L'acciaio non ha ancora centri né punti (nessun dato di partenza: non si inventa).
export const PRODUCT_META = Object.freeze({
  aluminium: { label: 'Alluminio', symbol: 'Al', inputs: ['bauxite'], factory: 'FCT-ALUMINIUM' },
  steel: { label: 'Acciaio', symbol: 'Fe', inputs: ['iron_ore', 'coal'], factory: 'FCT-STEEL' },
});

/** Ordine di visualizzazione (e di priorità se in una provincia non entrano tutte le icone). */
export const RESOURCE_ORDER = Object.freeze(['oil', 'coal', 'iron_ore', 'bauxite', 'copper', 'rubber', 'wheat', 'tungsten', 'tin', 'manganese', 'chromium', 'nickel', 'cobalt', 'molybdenum', 'vanadium', 'antimony', 'mercury', 'sulphur', 'uranium']);

/**
 * Metadati di presentazione: etichetta, simbolo chimico (dove ha senso), famiglia d'icona e colore del distintivo.
 * Il colore è l'identità della risorsa (distintivo tondo sulla mappa e quadratino in legenda): vedi src/map/resourceIcons.js.
 * Famiglie: pumpjack (petrolio), picks (carbone), symbol (metalli: il simbolo chimico), drop, wheat, flask, radiation.
 * L'icona della fabbrica NON è usata dalle risorse: è riservata alle industrie.
 * Solo MATERIE PRIME: i prodotti (PRODUCT_IDS) non si estraggono, si producono in fabbrica, e non compaiono nel livello Risorse.
 */
export const RESOURCE_META = Object.freeze({
  oil: { label: 'Petrolio', icon: 'pumpjack', color: '#1c1c1c' },
  coal: { label: 'Carbone', icon: 'picks', color: '#5b4636' },
  iron_ore: { label: 'Minerale di ferro', icon: 'symbol', symbol: 'Fe', color: '#a0482a' },
  bauxite: { label: 'Bauxite', icon: 'symbol', symbol: 'Bx', color: '#d2812c' },
  copper: { label: 'Rame', icon: 'symbol', symbol: 'Cu', color: '#d6409f' }, // rosa: il bruno-arancio tipico del rame sarebbe confuso con carbone, ferro, bauxite e vanadio
  rubber: { label: 'Gomma naturale', icon: 'drop', color: '#2e8b57' },
  wheat: { label: 'Frumento', icon: 'wheat', color: '#c8960c' },
  tungsten: { label: 'Tungsteno', icon: 'symbol', symbol: 'W', color: '#4b4f9e' },
  tin: { label: 'Stagno', icon: 'symbol', symbol: 'Sn', color: '#7d8c95' },
  manganese: { label: 'Manganese', icon: 'symbol', symbol: 'Mn', color: '#8e44ad' },
  chromium: { label: 'Cromo', icon: 'symbol', symbol: 'Cr', color: '#1b8aa6' },
  nickel: { label: 'Nichel', icon: 'symbol', symbol: 'Ni', color: '#3f9c7a' },
  cobalt: { label: 'Cobalto', icon: 'symbol', symbol: 'Co', color: '#1f5fbf' },
  molybdenum: { label: 'Molibdeno', icon: 'symbol', symbol: 'Mo', color: '#7d7d2a' },
  vanadium: { label: 'Vanadio', icon: 'symbol', symbol: 'V', color: '#a0732a' },
  antimony: { label: 'Antimonio', icon: 'symbol', symbol: 'Sb', color: '#9c3c3c' },
  mercury: { label: 'Mercurio', icon: 'flask', symbol: 'Hg', color: '#c0392b' },
  sulphur: { label: 'Zolfo', icon: 'flask', symbol: 'S', color: '#b39b00' },
  uranium: { label: 'Uranio', icon: 'radiation', color: '#3a9d23' },
});

/** Colore delle province senza risorse nel livello Risorse: chiaro e neutro, perché risaltino quelle colorate. */
export const RESOURCE_NEUTRAL = '#d9d6c3';

/** Mescola due colori #rrggbb: t = 0 → a, t = 1 → b. */
export function mixHex(a, b, t) {
  const n = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [n(a), n(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/** Colore di riempimento di una provincia con quella risorsa: il colore della risorsa schiarito, così il distintivo (stesso colore) resta ben visibile. */
export function resourceFillColor(id) {
  const meta = RESOURCE_META[id];
  return meta ? mixHex(meta.color, '#ffffff', 0.4) : RESOURCE_NEUTRAL;
}

const rank = (id) => { const i = RESOURCE_ORDER.indexOf(id); return i < 0 ? RESOURCE_ORDER.length : i; };

/**
 * Risorse le cui posizioni aggiuntive approvate (data/resources/resource_locations_extra.json) entrano anche nella mappa Risorse.
 * Il rame non ha giacimenti nel CSV (e quindi nemmeno punti): le sue province vengono solo da lì. Le altre risorse con posizioni
 * aggiuntive (ferro, carbone, gomma, zolfo) NON sono ancora sulla mappa: aggiungerle qui è una scelta di design, non automatica.
 */
export const EXTRA_ON_MAP = Object.freeze(['copper']);

/**
 * locations: righe di resource_locations.csv; links: righe di location_provinces.csv; extra (facoltativo): resource_locations_extra.json.
 * Restituisce { schema, byProvince: { provinceId: [resourceId, ...] } } con id unici, in RESOURCE_ORDER, province in ordine alfabetico.
 */
export function buildProvinceResources(locations, links, extra = null) {
  const deposit = new Map();
  for (const l of locations) if (l.kind === 'deposit' && !PRODUCT_IDS.includes(l.resource_id)) deposit.set(l.location_id, l.resource_id); // i prodotti non sono risorse naturali
  const acc = new Map();
  const add = (province, resource) => {
    if (!acc.has(province)) acc.set(province, new Set());
    acc.get(province).add(resource);
  };
  for (const k of links) {
    const resource = deposit.get(k.location_id);
    if (!resource) continue; // collegamento di una riga non-giacimento
    add(k.province_id, resource);
  }
  for (const r of extra?.rows ?? []) if (EXTRA_ON_MAP.includes(r.resource)) for (const id of r.provinces) add(id, r.resource);
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
      if (PRODUCT_IDS.includes(r)) errors.push(`risorse per provincia: ${pid} contiene il prodotto ${r}, che non è una risorsa naturale`);
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

/**
 * Riempimento delle province nel livello Risorse: { idElemento: colore }. Una provincia madre divisa in sotto-province le colora TUTTE
 * (è l'intera regione ad avere la risorsa; solo l'icona sta su una). Con più risorse vale la prima in ordine di priorità
 * (le altre si vedono dalle icone). Le province non elencate restano neutre.
 */
export function resolveResourceFills(items, byProvince) {
  const out = {};
  if (!byProvince) return out;
  for (const it of items) {
    const list = byProvince[it.props.id] ?? byProvince[it.props.parentProvince];
    if (list?.length) out[it.props.id] = resourceFillColor(list[0]);
  }
  return out;
}
