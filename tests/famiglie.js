// Una provincia divisa lungo un fiume è un insieme di sponde con id `<madre>_SP<n>` (kind/proprietà della madre,
// `sponda_fiume: true`, `parentProvince`). Nei test che contano o cercano "la provincia" si usa la vista per madre:
// ogni famiglia di sponde diventa una sola feature (MultiPolygon, stessa area) con l'id e le proprietà della madre.
export const madreId = (id) => id.replace(/_SP\d+$/, '');
export const pezziDi = (features, madre) => features.filter((f) => madreId(f.id ?? f.properties.id) === madre);

export function vistaProvince(collection) {
  const features = [];
  const famiglie = new Map();
  for (const f of collection.features) {
    if (!f.properties.sponda_fiume) { features.push(f); continue; }
    const madre = f.properties.parentProvince;
    if (!famiglie.has(madre)) {
      const slot = { type: 'Feature', id: madre, properties: null, coordinates: [] };
      famiglie.set(madre, slot);
      features.push(slot);
    }
    const slot = famiglie.get(madre);
    const { sponda_fiume: _s, parentProvince: _p, sponda: _l, ...props } = f.properties;
    slot.properties ??= { ...props, id: madre, name: props.name.replace(/ \(sponda [A-Z]\)$/, ''), nameLocal: props.name.replace(/ \(sponda [A-Z]\)$/, '') };
    slot.coordinates.push(...(f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates));
  }
  return {
    ...collection,
    features: features.map((f) => (f.coordinates ? { type: 'Feature', id: f.id, properties: f.properties, geometry: { type: 'MultiPolygon', coordinates: f.coordinates } } : f)),
  };
}

/** Adiacenza per madre: due madri sono adiacenti se lo è almeno una coppia delle loro sponde (o delle province intere). */
export function grafoFamiglie(graph, collection) {
  const pezzi = new Map();
  for (const f of collection.features) {
    const m = madreId(f.properties.id);
    pezzi.set(m, [...(pezzi.get(m) ?? []), f.properties.id]);
  }
  return {
    areAdjacent: (a, b) => (pezzi.get(a) ?? []).some((x) => (pezzi.get(b) ?? []).some((y) => graph.areAdjacent(x, y))),
    neighbors: (m) => [...new Set((pezzi.get(m) ?? []).flatMap((x) => graph.neighbors(x)).map(madreId))].filter((n) => n !== m),
  };
}
