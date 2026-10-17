// Grafo di adiacenza terrestre tra province (data/adjacency.json). Nel file le province sono
// indici nell'ordine della collezione unita, non id: il file resta numerico e non duplica i dati
// delle province (inoltre il controllo del precache identifica i file nazionali dai loro id).
// L'accordo tra indici e province è garantito dalla somma di controllo degli id: se le province
// cambiano senza rigenerare il file (`npm run build:adjacency`) il caricamento FALLISCE, invece di
// collegare province sbagliate.

export const ADJACENCY_SCHEMA = 'adjacency-v1';

/** Somma di controllo FNV-1a a 32 bit degli id in ordine, in esadecimale. */
export function idsChecksum(ids) {
  let h = 0x811c9dc5;
  for (const id of ids) {
    for (let i = 0; i < id.length; i += 1) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= 0x1f; // separatore: ["ab","c"] e ["a","bc"] danno somme diverse
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Errori del file (lista vuota = valido). `ids` sono gli id della collezione, in ordine. */
export function validateAdjacency(file, ids) {
  const errors = [];
  if (file === null || typeof file !== 'object') return ['adiacenza: file mancante'];
  if (file.schema !== ADJACENCY_SCHEMA) errors.push(`adiacenza: schema ${JSON.stringify(file.schema)} (atteso ${ADJACENCY_SCHEMA})`);
  if (file.count !== ids.length) errors.push(`adiacenza: count ${file.count} ma le province sono ${ids.length}`);
  if (file.checksum !== idsChecksum(ids)) errors.push('adiacenza: somma di controllo diversa, le province sono cambiate: rigenerare con npm run build:adjacency');
  if (!Array.isArray(file.edges)) return [...errors, 'adiacenza: edges non è un elenco'];
  const seen = new Set();
  file.edges.forEach((e, n) => {
    if (!Array.isArray(e) || e.length !== 3 || !e.every(Number.isInteger)) { errors.push(`adiacenza: arco ${n} non è [i, j, km] di interi`); return; }
    const [i, j, km] = e;
    if (i < 0 || j >= ids.length || i >= j) errors.push(`adiacenza: arco ${n} [${i}, ${j}] fuori intervallo o non ordinato (serve i < j)`);
    if (km < 1) errors.push(`adiacenza: arco ${n} con km < 1`);
    const key = `${i}|${j}`;
    if (seen.has(key)) errors.push(`adiacenza: arco duplicato [${i}, ${j}]`);
    seen.add(key);
  });
  return errors;
}

/**
 * Grafo di adiacenza pronto all'uso. Lancia un Error se il file non corrisponde alle province.
 * `km` è una stima grossolana del confine comune (tende a sovrastimare): vedi scripts/adjacency-compute.js.
 */
export function buildAdjacency(collection, file) {
  const ids = collection.features.map((f) => f.properties.id);
  const errors = validateAdjacency(file, ids);
  if (errors.length > 0) throw new Error(errors.slice(0, 3).join('; '));
  const neighbors = new Map(ids.map((id) => [id, []]));
  const km = new Map();
  const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (const [i, j, k] of file.edges) {
    neighbors.get(ids[i]).push(ids[j]);
    neighbors.get(ids[j]).push(ids[i]);
    km.set(pairKey(ids[i], ids[j]), k);
  }
  return {
    neighbors: (id) => neighbors.get(id) ?? [],
    areAdjacent: (a, b) => km.has(pairKey(a, b)),
    borderKm: (a, b) => km.get(pairKey(a, b)) ?? 0,
    edgeCount: file.edges.length,
  };
}
