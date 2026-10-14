// Geometria minima per le province: nessuna dipendenza, nessun I/O.
// Le coordinate sono [longitudine, latitudine] in gradi (GeoJSON).

function inRing(ring, lon, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Punto in poligono GeoJSON (primo anello = esterno, successivi = buchi). */
export function pointInPolygon(polygon, lon, lat) {
  if (!inRing(polygon[0], lon, lat)) return false;
  for (let k = 1; k < polygon.length; k++) if (inRing(polygon[k], lon, lat)) return false;
  return true;
}

export function polygonsOf(geometry) {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

export function bboxOf(geometry) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polygonsOf(geometry)) {
    for (const [x, y] of poly[0]) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY];
}

/**
 * Indice per interrogare più province: calcola i bbox una volta sola.
 * `provincesAt(lon, lat)` ritorna le feature che contengono il punto (normalmente 0 o 1).
 */
export function buildProvinceIndex(collection) {
  const entries = collection.features.map((feature) => ({
    feature,
    bbox: bboxOf(feature.geometry),
    polygons: polygonsOf(feature.geometry),
  }));
  return {
    provincesAt(lon, lat) {
      const hits = [];
      for (const { feature, bbox, polygons } of entries) {
        if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue;
        if (polygons.some((poly) => pointInPolygon(poly, lon, lat))) hits.push(feature);
      }
      return hits;
    },
  };
}
