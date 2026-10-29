// Province per nazione: un file JSON per nazione in data/provinces/<OWNER>.json, più
// data/provinces/_meta.json (metadati comuni e ordine di unione). Tutti i file si caricano
// all'avvio, in parallelo, e si uniscono in una sola FeatureCollection in memoria: nessun
// caricamento per area (causerebbe buchi mentre si scorre e bordi nazionali che cambiano
// spessore all'arrivo del vicino).
//
// Questo modulo non usa import.meta.glob né I/O: gira uguale nel browser e in Node (test).
// L'elenco dei file lo fornisce src/data/loadProvinces.js (browser) o scripts/load-provinces.js (Node).

export const META_NAME = '_meta';
export const META_SCHEMA = 'provinces-meta-v1'; // versione del formato di _meta.json; serve anche a riconoscerlo nella build (check-precache)

/** Nome del file senza cartella né estensione: "../../data/provinces/DEU.json" -> "DEU". */
export function fileName(path) {
  const m = /([^/\\]+)\.json$/.exec(path);
  return m ? m[1] : path;
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Controlli di coerenza tra metadati e file nazionali. `parts` è { [nome file]: FeatureCollection }.
 * Ritorna la lista degli errori (vuota se tutto torna). La validazione delle singole province
 * (schema, date, geometrie) resta a validateCatalog in validate.js, che riceve la collezione unita.
 */
export function checkProvinceParts(meta, parts) {
  const errors = [];
  if (!isObject(meta)) return ['province: _meta mancante o non valido'];
  if (meta.schema !== META_SCHEMA) return [`province: _meta.schema deve essere "${META_SCHEMA}" (trovato ${JSON.stringify(meta.schema)})`];
  if (!Array.isArray(meta.order) || meta.order.length === 0 || meta.order.some((o) => typeof o !== 'string' || o === '')) {
    return ['province: _meta.order deve essere un elenco non vuoto di codici nazione'];
  }
  if (new Set(meta.order).size !== meta.order.length) errors.push('province: _meta.order contiene codici duplicati');
  if (!isObject(meta.metadata)) errors.push('province: _meta.metadata mancante');
  if (!isObject(parts)) return [...errors, 'province: nessun file nazionale'];

  for (const owner of meta.order) if (!(owner in parts)) errors.push(`province: manca il file ${owner}.json elencato in _meta.order`);
  for (const name of Object.keys(parts)) if (!meta.order.includes(name)) errors.push(`province: il file ${name}.json non è elencato in _meta.order`);

  const seen = new Map();
  for (const owner of meta.order) {
    const part = parts[owner];
    if (part === undefined) continue;
    if (!isObject(part) || part.type !== 'FeatureCollection' || !Array.isArray(part.features)) {
      errors.push(`province: ${owner}.json deve essere una FeatureCollection con "features"`);
      continue;
    }
    if (part.owner !== owner) errors.push(`province: ${owner}.json dichiara owner "${part.owner}"`);
    if (part.features.length === 0) errors.push(`province: ${owner}.json non contiene province`);
    part.features.forEach((f, i) => {
      const props = f?.properties;
      if (!props || typeof props.id !== 'string') {
        errors.push(`province: ${owner}.json[${i}] senza properties.id`);
        return;
      }
      if (props.owner !== owner) errors.push(`province: "${props.id}" ha owner "${props.owner}" ma sta in ${owner}.json`);
      if (seen.has(props.id)) errors.push(`province: id duplicato "${props.id}" (${seen.get(props.id)}.json e ${owner}.json)`);
      else seen.set(props.id, owner);
    });
  }
  return errors;
}

/**
 * Unisce i file nazionali in una FeatureCollection, nell'ordine di `meta.order` (e, dentro
 * ogni file, nell'ordine del file). Lancia un Error (con `.errors`) se i file non tornano.
 */
export function mergeProvinceParts(meta, parts) {
  const errors = checkProvinceParts(meta, parts);
  if (errors.length > 0) {
    const error = new Error(`Province non valide (${errors.length}): ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '; …' : ''}`);
    error.errors = errors;
    throw error;
  }
  return {
    type: 'FeatureCollection',
    metadata: meta.metadata,
    features: meta.order.flatMap((owner) => parts[owner].features),
  };
}

/** Valori di partenza del caricamento: poche richieste alla volta e qualche nuovo tentativo per file. */
export const LOAD_DEFAULTS = Object.freeze({ concurrency: 12, retries: 2, delayMs: 400 });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadWithRetry(load, retries, delayMs, sleep) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await load();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(delayMs * (attempt + 1));
    }
  }
  throw lastError;
}

/**
 * Carica tutti i moduli e li unisce. `modules` è { percorso: () => Promise<modulo JSON> }, come
 * restituito da import.meta.glob. Le richieste partono a gruppi (`concurrency`, 12 di default): su rete
 * mobile 178 richieste insieme ne facevano cadere alcune. Ogni file fallito viene riprovato `retries`
 * volte (2 di default) con pausa crescente. Alcuni browser non ripetono un import() fallito: in quel caso i
 * tentativi non bastano e serve ricaricare la pagina.
 * Se anche un solo file resta non caricato la mappa non parte: una mappa a metà falserebbe i bordi
 * nazionali, e l'errore elenca tutti i file mancanti (utile quando manca qualcosa nella cache offline).
 * `options` può cambiare concurrency, retries, delayMs e sleep (usato dai test).
 */
export async function loadProvincesFrom(modules, onProgress, options = {}) {
  const { concurrency, retries, delayMs } = { ...LOAD_DEFAULTS, ...options };
  const sleep = options.sleep ?? wait;
  const entries = Object.entries(modules);
  const total = entries.length;
  let done = 0;
  // onProgress(done, total) dopo ogni file finito (riuscito o definitivamente fallito): serve alla barra di caricamento
  const tick = () => { done += 1; if (typeof onProgress === 'function') onProgress(done, total); };
  if (typeof onProgress === 'function') onProgress(0, total);
  const settled = new Array(entries.length);
  let next = 0;
  const worker = async () => {
    while (next < entries.length) {
      const i = next;
      next += 1;
      try {
        settled[i] = { status: 'fulfilled', value: await loadWithRetry(entries[i][1], retries, delayMs, sleep) };
      } catch (reason) {
        settled[i] = { status: 'rejected', reason };
      }
      tick();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, entries.length)) }, worker));
  const failed = [];
  const parts = {};
  let meta = null;
  settled.forEach((res, i) => {
    const name = fileName(entries[i][0]);
    if (res.status === 'rejected') {
      failed.push(name);
      return;
    }
    const value = res.value?.default ?? res.value;
    if (name === META_NAME) meta = value;
    else parts[name] = value;
  });
  if (failed.length > 0) {
    const error = new Error(`Province: caricamento non riuscito per ${failed.map((n) => `${n}.json`).join(', ')}`);
    error.failed = failed;
    throw error;
  }
  if (meta === null) throw new Error('Province: manca _meta.json');
  return mergeProvinceParts(meta, parts);
}
