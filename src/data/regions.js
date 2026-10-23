// Regioni (data/regions.json): livello superiore della gerarchia REGIONE → PROVINCIA → CITTÀ.
// Una regione raggruppa province MADRI (le sponde dei fiumi ereditano la regione dalla madre). Funzioni PURE senza I/O.
// Niente valori derivati salvati nei dati: gli aggregati si calcolano con i selettori che useranno questo indice.

export const REGIONS_SCHEMA = 'regions-v1';
export const ASSIGNMENT_QUALITIES = Object.freeze(['verified', 'approximate', 'hypothesis']);

/** Id della provincia madre di una feature (le sponde puntano alla madre con `parentProvince`). */
export const motherOf = (props) => props.parentProvince ?? props.id;

/**
 * Errori del file delle regioni (lista vuota = valido).
 * `provinces`: feature delle province (tutte). `nationIds`: id ammessi come `owner`.
 * Regola di copertura: per ogni nazione che ha almeno una regione, OGNI sua provincia madre sta in una sola regione.
 * Le nazioni senza regioni non sono controllate (si aggiungono una alla volta).
 */
export function validateRegions(file, { provinces, nationIds }) {
  if (file?.schema !== REGIONS_SCHEMA) return [`regioni: schema ${JSON.stringify(file?.schema)}, atteso ${REGIONS_SCHEMA}`];
  const errors = [];
  const ownerOfMother = new Map();
  for (const f of provinces) ownerOfMother.set(motherOf(f.properties), f.properties.owner);
  const ids = new Set();
  const regionOfMother = new Map();
  const owners = new Set();
  const nations = new Set(nationIds);
  for (const r of file.regions ?? []) {
    if (typeof r.id !== 'string' || !/^R_[A-Z0-9]+_[A-Z0-9_]+$/.test(r.id)) errors.push(`regioni: id non valido ${JSON.stringify(r.id)}`);
    if (ids.has(r.id)) errors.push(`regioni: id duplicato ${r.id}`);
    ids.add(r.id);
    if (!r.name) errors.push(`regioni: ${r.id} senza nome`);
    if (!nations.has(r.owner)) errors.push(`regioni: ${r.id} con owner sconosciuto ${JSON.stringify(r.owner)}`);
    else if (typeof r.id === 'string' && !r.id.startsWith(`R_${r.owner}_`)) errors.push(`regioni: ${r.id} non inizia con R_${r.owner}_`);
    owners.add(r.owner);
    if (!ASSIGNMENT_QUALITIES.includes(r.assignmentQuality)) errors.push(`regioni: ${r.id} con assignmentQuality sconosciuta ${JSON.stringify(r.assignmentQuality)}`);
    if (!Array.isArray(r.provinces) || r.provinces.length === 0) { errors.push(`regioni: ${r.id} senza province`); continue; }
    for (const m of r.provinces) {
      if (!ownerOfMother.has(m)) { errors.push(`regioni: ${r.id} cita la provincia inesistente ${m}`); continue; }
      if (ownerOfMother.get(m) !== r.owner) errors.push(`regioni: ${r.id} (${r.owner}) contiene ${m} di ${ownerOfMother.get(m)}`);
      if (regionOfMother.has(m)) errors.push(`regioni: ${m} è in due regioni (${regionOfMother.get(m)} e ${r.id})`);
      else regionOfMother.set(m, r.id);
    }
  }
  for (const [m, owner] of ownerOfMother) {
    if (owners.has(owner) && !regionOfMother.has(m)) errors.push(`regioni: ${m} (${owner}) non è in nessuna regione`);
  }
  return errors;
}

/**
 * Indice di consultazione. Ritorna funzioni pure sul solo contenuto del file:
 *  regionOfMother(id), regionOfProvince(feature o props), provincesOf(regionId), regionsOf(owner), region(id), coveredOwners.
 */
export function buildRegionIndex(file) {
  const regions = new Map();
  const ofMother = new Map();
  const byOwner = new Map();
  for (const r of file?.regions ?? []) {
    regions.set(r.id, r);
    for (const m of r.provinces ?? []) ofMother.set(m, r.id);
    (byOwner.get(r.owner) ?? byOwner.set(r.owner, []).get(r.owner)).push(r.id);
  }
  const propsOf = (x) => x?.properties ?? x;
  return {
    region: (id) => regions.get(id) ?? null,
    regionOfMother: (motherId) => ofMother.get(motherId) ?? null,
    regionOfProvince: (x) => { const p = propsOf(x); return p ? ofMother.get(motherOf(p)) ?? null : null; },
    provincesOf: (regionId) => [...(regions.get(regionId)?.provinces ?? [])],
    regionsOf: (owner) => [...(byOwner.get(owner) ?? [])],
    coveredOwners: [...byOwner.keys()].sort(),
  };
}
