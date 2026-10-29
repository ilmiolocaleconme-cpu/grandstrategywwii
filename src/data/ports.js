// Porti al 1/1/1936: elenco ridotto (ipotesi) agganciato alle città costiere del catalogo. Funzioni PURE.
export const PORTS_LIST_SCHEMA = 'ports-list-v1';
export const PORTS_SCHEMA = 'ports-v1';

/** Risolve l'elenco (nome + nazione) in id di città costiere. Ritorna { file, unresolved }. */
export function buildPorts({ list, cities }) {
  const byKey = new Map();
  for (const c of cities) {
    if (!c.costiera || c.kind !== 'citta') continue;
    const key = `${c.owner}|${c.name}`;
    if (!byKey.has(key)) byKey.set(key, { cittaId: c.cittaId ?? c.id, parentProvince: c.parentProvince });
  }
  const ports = {}; const unresolved = [];
  for (const p of list?.ports ?? []) {
    const hit = byKey.get(`${p.owner}|${p.name}`);
    if (!hit) { unresolved.push(`${p.owner} ${p.name}`); continue; }
    ports[hit.cittaId] = { name: p.name, owner: p.owner, level: p.level, parentProvince: hit.parentProvince };
  }
  return { file: { schema: PORTS_SCHEMA, quality: list?.quality ?? 'hypothesis', note: list?.note ?? '', ports }, unresolved };
}

export function validatePortsList(list, { cities = null } = {}) {
  if (list?.schema !== PORTS_LIST_SCHEMA) return [`porti: schema ${list?.schema}, atteso ${PORTS_LIST_SCHEMA}`];
  const errors = []; const seen = new Set();
  for (const p of list.ports ?? []) {
    if (![2, 3].includes(p.level)) errors.push(`porti: livello non valido per ${p.name}`);
    const k = `${p.owner}|${p.name}`; if (seen.has(k)) errors.push(`porti: doppione ${k}`); seen.add(k);
  }
  if (cities) { const { unresolved } = buildPorts({ list, cities }); for (const u of unresolved) errors.push(`porti: ${u} non è una città costiera del catalogo`); }
  return errors;
}

export function validatePorts(file) {
  if (file?.schema !== PORTS_SCHEMA) return [`porti: schema ${file?.schema}, atteso ${PORTS_SCHEMA}`];
  return Object.entries(file.ports ?? {}).filter(([, p]) => ![1, 2, 3].includes(p.level)).map(([id]) => `porti: livello non valido in ${id}`);
}

/** Livello del porto di una città nel 1936 (0 = nessun porto). */
export const portLevelAt = (file, cittaId) => file?.ports?.[cittaId]?.level ?? 0;
