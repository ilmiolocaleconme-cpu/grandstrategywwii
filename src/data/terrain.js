// Terreno delle province (data/terrain.json, schema terrain-v1): stima da raster Natural Earth, non quote misurate.
// Ogni provincia "madre" ha un tipo; le sponde dei fiumi (parentProvince) ereditano quello della madre.
// Le zone urbane (kind: 'citta') restano "urbano" (data/citta_grandi.json).

export const TERRAIN_TYPES = ['pianura', 'collina', 'montagna', 'foresta', 'palude', 'deserto', 'tundra'];

export const TERRAIN_LABEL = {
  pianura: 'Pianura', collina: 'Collina e altopiano', montagna: 'Montagna', foresta: 'Foresta',
  palude: 'Palude', deserto: 'Deserto', tundra: 'Tundra', urbano: 'Urbano',
};

export const TERRAIN_COLORS = {
  pianura: '#d8d38a', collina: '#b79a5c', montagna: '#7a5a45', foresta: '#4a8a52',
  palude: '#4a97ad', deserto: '#e8c872', tundra: '#b9c4cf', urbano: '#8f8f8f',
};

export const AFFIDABILITA = ['bassa', 'media', 'normale'];

/** Id della provincia madre: le sponde puntano alla madre con parentProvince, le città non hanno terreno proprio nel file. */
export function motherId(props) {
  return props.parentProvince ?? props.id;
}

/** Terreno di una provincia (o di una sua sponda); undefined se il file non lo conosce. */
export function terrainOf(props, doc) {
  return doc?.province?.[motherId(props)]?.terreno;
}

/**
 * Collezione con `properties.terreno` (e `terrenoSecondario`) aggiunti alle province non urbane. Crea nuovi oggetti:
 * non modifica la collezione in ingresso (i modelli di mappa sono memorizzati per oggetto).
 */
export function withTerrain(collection, doc) {
  if (!collection || !doc) return collection;
  return {
    ...collection,
    features: collection.features.map((f) => {
      if (f.properties.kind === 'citta') return f;
      const t = doc.province[motherId(f.properties)];
      if (!t) return f;
      return { ...f, properties: { ...f.properties, terreno: t.terreno, terrenoSecondario: t.secondario ?? null } };
    }),
  };
}

/**
 * Controlli del file: schema, classi, frazioni che sommano a 1, secondario diverso dal primo, affidabilità valida,
 * ogni id è una provincia madre esistente. `motherIds` = id madri; `allowMissing` = id madri ammessi senza dato.
 * Ritorna l'elenco degli errori (vuoto se tutto torna).
 */
export function validateTerrain(doc, motherIds, allowMissing = []) {
  const errors = [];
  if (doc?.schema !== 'terrain-v1') return ['terrain.json: schema diverso da terrain-v1'];
  if (JSON.stringify(doc.classi) !== JSON.stringify(TERRAIN_TYPES)) errors.push('terrain.json: elenco delle classi diverso da TERRAIN_TYPES');
  if (!Array.isArray(doc.fonti) || doc.fonti.length === 0) errors.push('terrain.json: fonti mancanti');
  if (!doc.licenza) errors.push('terrain.json: licenza mancante');
  if (!doc.metodo) errors.push('terrain.json: metodo mancante');
  const known = new Set(motherIds);
  for (const [id, t] of Object.entries(doc.province ?? {})) {
    if (!known.has(id)) { errors.push(`terrain.json: ${id} non è una provincia madre`); continue; }
    if (!TERRAIN_TYPES.includes(t.terreno)) errors.push(`${id}: terreno «${t.terreno}» sconosciuto`);
    if (t.secondario !== null && (!TERRAIN_TYPES.includes(t.secondario) || t.secondario === t.terreno)) errors.push(`${id}: secondario non valido`);
    if (!AFFIDABILITA.includes(t.affidabilita)) errors.push(`${id}: affidabilità non valida`);
    const entries = Object.entries(t.frazioni ?? {});
    const sum = entries.reduce((s, [, v]) => s + v, 0);
    if (entries.length === 0 || Math.abs(sum - 1) > 0.05) errors.push(`${id}: le frazioni sommano a ${sum.toFixed(2)}, non a 1`);
    for (const [k, v] of entries) if (!TERRAIN_TYPES.includes(k) || !(v > 0 && v <= 1)) errors.push(`${id}: frazione non valida (${k}: ${v})`);
    if (!(t.frazioni?.[t.terreno] > 0)) errors.push(`${id}: il tipo principale «${t.terreno}» non ha frazione`);
  }
  const allowed = new Set(allowMissing);
  for (const id of known) if (!(id in (doc.province ?? {})) && !allowed.has(id)) errors.push(`${id}: provincia madre senza terreno`);
  return errors;
}
