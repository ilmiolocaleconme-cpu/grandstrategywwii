// Bandiere delle nazioni come forme semplici (data/flags.json): dati, non immagini. Funzioni PURE senza I/O.
export const FLAGS_SCHEMA = 'flags-v1';
export const DESCRIPTIONS_SCHEMA = 'nation-descriptions-v1';
const SHAPES = { rect: ['x', 'y', 'w', 'h'], circle: ['cx', 'cy', 'r'], polygon: [], path: [] };
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Controlli sul file delle bandiere. `nationIds`: nazioni scegliibili (devono avere tutte una bandiera). */
export function validateFlags(file, { nationIds = [] } = {}) {
  const errors = [];
  if (file?.schema !== FLAGS_SCHEMA) return [`bandiere: schema ${file?.schema}, atteso ${FLAGS_SCHEMA}`];
  for (const [id, f] of Object.entries(file.flags ?? {})) {
    if (!(f.w > 0) || !(f.h > 0)) errors.push(`bandiere: ${id} senza dimensioni`);
    if (!Array.isArray(f.shapes) || f.shapes.length === 0) errors.push(`bandiere: ${id} senza forme`);
    for (const s of f.shapes ?? []) {
      if (!(s.t in SHAPES)) { errors.push(`bandiere: ${id} con forma sconosciuta "${s.t}"`); continue; }
      for (const k of SHAPES[s.t]) if (!Number.isFinite(s[k])) errors.push(`bandiere: ${id}/${s.t} con ${k} non numerico`);
      if (s.t === 'polygon' && !/^[-\d.,\s]+$/.test(s.points ?? '')) errors.push(`bandiere: ${id} con punti non validi`);
      if (s.t === 'path' && !/^[MLAZmlaz\d\s.,-]+$/.test(s.d ?? '')) errors.push(`bandiere: ${id} con tracciato non valido`);
      const colors = s.t === 'path' ? [s.stroke] : [s.fill];
      for (const c of colors) if (!HEX.test(c ?? '')) errors.push(`bandiere: ${id}/${s.t} con colore non valido "${c}"`);
    }
  }
  for (const id of nationIds) if (!file.flags?.[id]) errors.push(`bandiere: manca la bandiera di ${id}`);
  return errors;
}

export function validateDescriptions(file, { nationIds = [] } = {}) {
  const errors = [];
  if (file?.schema !== DESCRIPTIONS_SCHEMA) return [`descrizioni: schema ${file?.schema}, atteso ${DESCRIPTIONS_SCHEMA}`];
  const known = new Set(nationIds);
  for (const [id, text] of Object.entries(file.descriptions ?? {})) {
    if (!known.has(id)) errors.push(`descrizioni: ${id} non è una nazione scegliibile`);
    if (typeof text !== 'string') errors.push(`descrizioni: ${id} senza testo`);
  }
  return errors;
}
