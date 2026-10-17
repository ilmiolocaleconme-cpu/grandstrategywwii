// Rasterizzazione di poligoni su una griglia regolare (solo script di costruzione, non entra nel browser).
// Una cella appartiene a un poligono se il suo CENTRO è dentro (regola pari/dispari, buchi inclusi).

export function makeGrid({ lon0, lat0, lon1, lat1, step }) {
  const nx = Math.round((lon1 - lon0) / step);
  const ny = Math.round((lat1 - lat0) / step);
  return { lon0, lat0, lon1, lat1, step, nx, ny };
}

export const cellCenter = (g, ix, iy) => [g.lon0 + (ix + 0.5) * g.step, g.lat0 + (iy + 0.5) * g.step];

/** Riempie in `out` (Uint16Array nx*ny) il valore `value` per le celle dentro il poligono `rings` (primo anello esterno, altri buchi: pari/dispari). */
export function fillPolygon(g, rings, out, value) {
  const edges = [];
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i += 1) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[i + 1];
      if (y0 === y1) continue;
      edges.push(y0 < y1 ? [x0, y0, x1, y1] : [x1, y1, x0, y0]);
      minY = Math.min(minY, y0, y1);
      maxY = Math.max(maxY, y0, y1);
    }
  }
  if (edges.length === 0) return;
  const iy0 = Math.max(0, Math.floor((minY - g.lat0) / g.step - 0.5));
  const iy1 = Math.min(g.ny - 1, Math.ceil((maxY - g.lat0) / g.step));
  for (let iy = iy0; iy <= iy1; iy += 1) {
    const y = g.lat0 + (iy + 0.5) * g.step;
    const xs = [];
    for (const [x0, y0, x1, y1] of edges) {
      if (y >= y0 && y < y1) xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const ia = Math.max(0, Math.ceil((xs[k] - g.lon0) / g.step - 0.5));
      const ib = Math.min(g.nx - 1, Math.floor((xs[k + 1] - g.lon0) / g.step - 0.5));
      for (let ix = ia; ix <= ib; ix += 1) out[iy * g.nx + ix] = value;
    }
  }
}

/** Province in una griglia: ogni cella = indice provincia + 1 (0 = nessuna). */
export function rasterizeProvinces(g, collection) {
  const out = new Uint16Array(g.nx * g.ny);
  collection.features.forEach((f, i) => {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const p of polys) fillPolygon(g, p, out, i + 1);
  });
  return out;
}
