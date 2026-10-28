// Dataset per provincia (popolazione, agricoltura, presenza militare). Contratto dati comune: ogni file ha
// { schema, quality, note, byProvince: { <id provincia MADRE>: { ...campi, quality? } } }.
// Una sola fonte per ogni dato: la geometria resta in data/provinces/, qui ci sono solo riferimenti per id.
// `byProvince` può essere vuoto: un dato che non c'è NON si inventa (la UI mostra «dato mancante»).
// Solo funzioni PURE, nessun I/O. Cartelle dei file: data/population/, data/agriculture/, data/military/.

export const QUALITIES = Object.freeze(['USER_ESTIMATE', 'DESIGN_DEFAULT', 'reference', 'MISSING_DATA']);

const int = (min, max = Infinity) => ({ check: (v) => Number.isInteger(v) && v >= min && v <= max, hint: `intero tra ${min} e ${max === Infinity ? '∞' : max}` });
const num = (min, max) => ({ check: (v) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max, hint: `numero tra ${min} e ${max}` });
const bool = () => ({ check: (v) => typeof v === 'boolean', hint: 'true o false' });
const idList = () => ({ check: (v) => Array.isArray(v) && v.every((x) => typeof x === 'string' && x !== '') && new Set(v).size === v.length, hint: 'elenco di id senza doppioni' });

export const PROVINCE_DATASETS = Object.freeze({
  population: {
    schema: 'province-population-v1',
    label: 'popolazione',
    fields: { population: int(0), workforce: int(0), growthPerYear: num(-0.1, 0.1) },
  },
  agriculture: {
    schema: 'province-agriculture-v1',
    label: 'agricoltura',
    // potenziale 0..10 e quota di frumento: le produzioni effettive (cibo, frumento) si CALCOLANO a runtime, non si salvano
    fields: { potential: int(0, 10), wheatShare: num(0, 1) },
  },
  military: {
    schema: 'province-military-v1',
    label: 'presenza militare',
    // PRESENZA, non unità: le divisioni restano nel sistema esercito. Livelli 0..3 come i gradini L1-L3 del Pack.
    fields: { garrison: int(0), hq: bool(), fortifications: int(0, 3), antiAir: int(0, 3), radar: int(0, 3), installations: idList() },
  },
});

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Errori di un file per provincia (lista vuota = valido).
 * kind: 'population' | 'agriculture' | 'military'. ctx: { motherIds: Set|array, structureIds?: Set } — structureIds, se dato,
 * controlla `installations` della presenza militare contro i `structure_id` del Pack; ownerOf: Map(idMadre → proprietario), serve a
 * verificare che la somma delle province di ogni nazione di `nationalTotals` (solo popolazione) sia ESATTAMENTE il totale dichiarato.
 */
export function validateProvinceDataset(kind, file, { motherIds, structureIds = null, ownerOf = null } = {}) {
  const spec = PROVINCE_DATASETS[kind];
  if (!spec) return [`province: dataset sconosciuto "${kind}"`];
  const tag = `province/${spec.label}`;
  if (!isObject(file)) return [`${tag}: file mancante o non valido`];
  if (file.schema !== spec.schema) return [`${tag}: schema ${JSON.stringify(file.schema)}, atteso ${spec.schema}`];
  const errors = [];
  if (!QUALITIES.includes(file.quality)) errors.push(`${tag}: qualità del file non valida (${JSON.stringify(file.quality)})`);
  if (typeof file.note !== 'string' || file.note.trim() === '') errors.push(`${tag}: nota di origine mancante`);
  if (!isObject(file.byProvince)) return [...errors, `${tag}: byProvince deve essere un oggetto`];
  const known = new Set(motherIds ?? []);
  for (const [id, entry] of Object.entries(file.byProvince)) {
    if (!known.has(id)) { errors.push(`${tag}: ${id} non è una provincia madre esistente`); continue; }
    if (!isObject(entry)) { errors.push(`${tag}: ${id} non è un oggetto`); continue; }
    if (entry.quality !== undefined && !QUALITIES.includes(entry.quality)) errors.push(`${tag}: ${id} ha qualità non valida`);
    for (const [k, v] of Object.entries(entry)) {
      if (k === 'quality') continue;
      const f = spec.fields[k];
      if (!f) errors.push(`${tag}: ${id} ha il campo sconosciuto "${k}"`);
      else if (!f.check(v)) errors.push(`${tag}: ${id}.${k} non valido (atteso ${f.hint})`);
    }
    if (kind === 'population' && Number.isInteger(entry.population) && Number.isInteger(entry.workforce) && entry.workforce > entry.population) {
      errors.push(`${tag}: ${id} ha più forza lavoro che abitanti`);
    }
    if (kind === 'military' && structureIds && Array.isArray(entry.installations)) {
      for (const s of entry.installations) if (!structureIds.has(s)) errors.push(`${tag}: ${id} cita l'installazione ${s}, che non esiste nel Pack`);
    }
  }
  if (kind === 'population' && file.nationalTotals !== undefined) {
    if (!isObject(file.nationalTotals)) errors.push(`${tag}: nationalTotals deve essere un oggetto`);
    else if (ownerOf) {
      const sums = {};
      for (const [id, entry] of Object.entries(file.byProvince)) if (Number.isInteger(entry?.population) && ownerOf.has(id)) sums[ownerOf.get(id)] = (sums[ownerOf.get(id)] ?? 0) + entry.population;
      for (const [owner, total] of Object.entries(file.nationalTotals)) {
        if (!Number.isInteger(total) || total <= 0) errors.push(`${tag}: totale di ${owner} non valido`);
        else if ((sums[owner] ?? 0) !== total) errors.push(`${tag}: la somma delle province di ${owner} è ${sums[owner] ?? 0}, il totale dichiarato è ${total}`);
      }
    }
  }
  return errors;
}

/** Voce di una provincia (o di una sua sponda, tramite la madre); null se il file non la conosce. */
export function provinceEntry(file, props) {
  const id = props.parentProvince ?? props.id;
  const entry = file?.byProvince?.[id];
  return entry ? { ...entry, quality: entry.quality ?? file.quality } : null; // la qualità del file vale per le voci che non ne hanno una
}
