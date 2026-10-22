// Slot: la capacità di costruzione/impianti di ogni luogo, UGUALE PER TUTTI (decisione di design concordata in chat, 22/10/2026):
//  - una parte di città: 10 slot (una città divisa in parti ha 10 slot per ogni parte);
//  - una provincia: 14 slot per provincia madre (le sponde di un fiume NON moltiplicano gli slot: contano come una provincia sola);
//  - una capitale: 14 slot per ogni sua parte.
// SCELTA PROVVISORIA: se tutta la provincia madre È una città (Budapest, Riga, Bucarest: provincia = città) non ha anche gli slot
// della provincia: contano solo le parti della città, altrimenti si conterebbe due volte lo stesso territorio.
// COSA NON FANNO queste regole: cosa può stare in uno slot (fabbrica, caserma, aeroporto, porto...), costi, tempi e occupazione:
// arrivano con l'economia. Funzioni PURE senza I/O. Le capitali si riconoscono con markCapitals (nome in data/nations.json).

import { markCapitals } from '../map/citta.js';

export const SLOT_CAPACITY = Object.freeze({ cityPart: 10, province: 14, capitalPart: 14 });

const motherOf = (props) => props.parentProvince ?? props.id;

/**
 * Catalogo degli slot. provinces: collezione dei pezzi di provincia (sponde e città-provincia comprese); zones: feature delle zone
 * urbane (citta_grandi.json); nations: elenco con `capital`. Ritorna { provinces: {madreId: n}, cityParts: {zonaId: n},
 * capitalParts: [zonaId], totals }.
 */
export function buildSlotCatalog({ provinces, zones, nations }) {
  const tilesByMother = new Map();
  for (const f of provinces.features) {
    const m = motherOf(f.properties);
    (tilesByMother.get(m) ?? tilesByMother.set(m, []).get(m)).push(f);
  }
  const parts = [...zones, ...provinces.features.filter((f) => f.properties.kind === 'citta' && !zones.some((z) => z.properties.parentProvince === motherOf(f.properties)))];
  const marked = markCapitals(parts.map((f) => ({ ...f, id: f.id ?? f.properties.id })), nations);
  const provincesOut = {};
  for (const [m, tiles] of tilesByMother) provincesOut[m] = tiles.every((t) => t.properties.kind === 'citta') ? 0 : SLOT_CAPACITY.province;
  const cityParts = {}; const capitalParts = [];
  for (const f of marked) {
    const id = f.properties.id;
    const cap = f.properties.capitale === true;
    if (cap) capitalParts.push(id);
    cityParts[id] = cap ? SLOT_CAPACITY.capitalPart : SLOT_CAPACITY.cityPart;
  }
  const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);
  return {
    provinces: provincesOut,
    cityParts,
    capitalParts,
    totals: { provinces: Object.values(provincesOut).filter((v) => v > 0).length, provinceSlots: sum(provincesOut), cityParts: Object.keys(cityParts).length, cityPartSlots: sum(cityParts), capitalParts: capitalParts.length, slots: sum(provincesOut) + sum(cityParts) },
  };
}

/**
 * Occupazione di un luogo: `placed` = elenco di id di edificio già costruiti lì. Gli edifici del pool 'slot' occupano slot di
 * costruzione; quelli del pool 'support' (fortificazioni, campi minati, ospedali da campo, radar, radio) stanno a parte e NON tolgono spazio.
 * Ritorna { used, support, byBuilding }.
 */
export function occupancy(placed, index) {
  let used = 0; let support = 0; const byBuilding = {};
  for (const id of placed) {
    const b = index.get(id);
    if (!b) throw new Error(`edificio sconosciuto: ${id}`);
    byBuilding[id] = (byBuilding[id] ?? 0) + 1;
    if (b.pool === 'support') support += b.slots; else used += b.slots;
  }
  return { used, support, byBuilding };
}

/**
 * Si può costruire `buildingId` in un luogo con `capacity` slot e gli edifici `placed`? Il pool 'slot' è limitato dalla capacità;
 * il pool 'support' non lo è (capienza degli slot ausiliari NON definita: `supportCapacity` opzionale, null = senza limite).
 */
export function canPlace(capacity, placed, buildingId, index, { supportCapacity = null } = {}) {
  const b = index.get(buildingId);
  if (!b) return { ok: false, reason: 'unknown_building' };
  const occ = occupancy(placed, index);
  if (b.pool === 'support') {
    if (supportCapacity !== null && occ.support + b.slots > supportCapacity) return { ok: false, reason: 'support_full' };
    return { ok: true };
  }
  if (occ.used + b.slots > capacity) return { ok: false, reason: 'slots_full' };
  return { ok: true };
}

/** Slot del luogo con quell'id (madre di provincia o parte di città), o null se non esiste. */
export function slotsOf(catalog, id) {
  return catalog.cityParts[id] ?? catalog.provinces[id] ?? null;
}
