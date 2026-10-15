// Funzioni pure per la mappa: proiezione, percorsi SVG, aree, colori.
// Nessuna dipendenza da React: sono testate in tests/map.test.js.

export const LAT0 = 47; // latitudine di riferimento della proiezione (equirettangolare)
const COS0 = Math.cos((LAT0 * Math.PI) / 180);

// Gradi -> unità di mappa (x cresce a est, y cresce a sud).
export function project(lon, lat) {
  return [lon * COS0, -lat];
}

const r3 = (n) => Math.round(n * 1000) / 1000;

export function ringToPath(ring, tol = 0) {
  let pts = ring.map(([lon, lat]) => project(lon, lat));
  if (tol > 0 && pts.length > 5) {
    // anello chiuso: si semplifica dividendo a metà, così nessun vertice speciale viene perso
    const m = Math.floor(pts.length / 2);
    let simplified = [];
    // province minuscole (p. es. il Liechtenstein) collasserebbero: si riprova con tolleranze più fini
    for (const t of [tol, tol / 4, tol / 16]) {
      const a = simplifyLine(pts.slice(0, m + 1), t);
      const b = simplifyLine(pts.slice(m), t);
      simplified = [...a.slice(0, -1), ...b];
      if (simplified.length >= 6) break;
    }
    if (simplified.length >= 4) pts = simplified;
  }
  let d = '';
  for (let i = 0; i < pts.length; i += 1) d += `${i === 0 ? 'M' : 'L'}${r3(pts[i][0])} ${r3(pts[i][1])}`;
  return `${d}Z`;
}

// Douglas-Peucker su una polilinea di punti [x, y] già proiettati. Tiene sempre gli estremi.
export function simplifyLine(pts, tol) {
  if (pts.length <= 2 || tol <= 0) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length) {
    const [i, j] = stack.pop();
    const [ax, ay] = pts[i];
    const dx = pts[j][0] - ax;
    const dy = pts[j][1] - ay;
    const len2 = dx * dx + dy * dy;
    let worst = -1;
    let wi = -1;
    for (let k = i + 1; k < j; k += 1) {
      const px = pts[k][0] - ax;
      const py = pts[k][1] - ay;
      let d2;
      if (len2 === 0) d2 = px * px + py * py;
      else {
        const u = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
        const ex = px - u * dx;
        const ey = py - u * dy;
        d2 = ex * ex + ey * ey;
      }
      if (d2 > worst) { worst = d2; wi = k; }
    }
    if (worst > t2) {
      keep[wi] = 1;
      stack.push([i, wi], [wi, j]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}

export function polygonsOf(feature) {
  const g = feature.geometry;
  return g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
}

export function lineToPath(coordinates, tol = 0) {
  const pts = simplifyLine(coordinates.map(([lon, lat]) => project(lon, lat)), tol);
  return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${r3(x)} ${r3(y)}`).join(''); // polilinea aperta
}

// Anello esterno + buchi nello stesso path: va usato con fill-rule="evenodd".
export function featureToPath(feature, tol = 0) {
  return polygonsOf(feature)
    .map((poly) => poly.map((ring) => ringToPath(ring, tol)).join(''))
    .join('');
}

// Area approssimata di un anello in km² (formula del geoide sferico semplificata).
export function ringAreaKm2(ring) {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    s += ((x2 - x1) * Math.PI) / 180 * (2 + Math.sin((y1 * Math.PI) / 180) + Math.sin((y2 * Math.PI) / 180));
  }
  const R = 6371.0088;
  return Math.abs((s * R * R) / 2);
}

export function featureAreaKm2(feature) {
  let total = 0;
  for (const poly of polygonsOf(feature)) {
    poly.forEach((ring, k) => {
      total += (k === 0 ? 1 : -1) * ringAreaKm2(ring);
    });
  }
  return total;
}

// Baricentro (in unità di mappa) dell'anello esterno più grande: posizione dell'etichetta.
export function labelPoint(feature) {
  let best = null;
  let bestArea = -1;
  for (const poly of polygonsOf(feature)) {
    const a = ringAreaKm2(poly[0]);
    if (a > bestArea) {
      bestArea = a;
      best = poly[0];
    }
  }
  let a2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < best.length - 1; i += 1) {
    const [x1, y1] = project(best[i][0], best[i][1]);
    const [x2, y2] = project(best[i + 1][0], best[i + 1][1]);
    const cross = x1 * y2 - x2 * y1;
    a2 += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(a2) < 1e-12) return project(best[0][0], best[0][1]);
  return [cx / (3 * a2), cy / (3 * a2)];
}

export function boundsOf(features) {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const f of features) {
    for (const poly of polygonsOf(f)) {
      for (const [lon, lat] of poly[0]) {
        const [x, y] = project(lon, lat);
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// Palette propria del gioco (nessun colore ripreso da mappe esterne): tinta per nazione,
// leggera variazione di luminosità per provincia, così le suddivisioni restano visibili.
const OWNER_HUE = {
  DEU: [32, 14], POL: [4, 42], AUT: [44, 55], BEL: [112, 30], LUX: [176, 32],
  CZE: [220, 36], NLD: [26, 62], ITA: [92, 34], YUG: [280, 28], DANZIG: [196, 45],
  FRA: [250, 38], CHE: [330, 48], LIE: [160, 50],
};

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

export function ownerColor(owner, id = '') {
  const [h, s] = OWNER_HUE[owner] ?? [hash(owner) % 360, 30];
  const l = 40 + (hash(id) % 5) * 3; // 40..52 %
  return `hsl(${h} ${s}% ${l}%)`;
}

export const QUALITY_COLORS = {
  verified: '#4f9d5c',
  approximate: '#c9a84c',
  hypothesis: '#6f9bc4',
};

export const LAYERS = [
  { id: 'political', label: 'Politico' },
  { id: 'quality', label: 'Qualità dati' },
];

export function provinceFill(props, layer) {
  if (layer === 'quality') return QUALITY_COLORS[props.borderQuality] ?? '#777';
  return ownerColor(props.owner, props.id);
}

// Fiumi e laghi: percorsi pronti per l'SVG. I fiumi sono ordinati dal più piccolo al più grande,
// così i grandi restano sopra. Stessi dati (data/rivers_geo.json) usati dalle regole.
export const RIVER_WIDTH_PX = { large: 2.4, medium: 1.5, small: 0.9 };

export function buildWaterModel(rivers, riversGeo, lakes) {
  const byId = new Map(rivers.map((r) => [r.id, r]));
  const lines = riversGeo.features
    .map((f) => {
      const river = byId.get(f.properties.riverId);
      return {
        key: `${f.properties.riverId}#${f.properties.segment}`,
        riverId: f.properties.riverId,
        inLake: Boolean(f.properties.inLake),
        d: lineToPath(f.geometry.coordinates),
        low: LOD_TOLERANCES.map((t) => lineToPath(f.geometry.coordinates, t)),
        width: RIVER_WIDTH_PX[river?.widthClass] ?? RIVER_WIDTH_PX.small,
        rank: river?.scalerank ?? 99,
      };
    })
    .sort((a, b) => b.rank - a.rank);
  const lakeItems = lakes.features.map((f) => ({ id: f.properties.id, name: f.properties.name, d: featureToPath(f), low: LOD_TOLERANCES.map((t) => featureToPath(f, t)) }));
  return { lines, lakes: lakeItems };
}

const edgeKey = (a, b) => {
  const ka = `${a[0]},${a[1]}`;
  const kb = `${b[0]},${b[1]}`;
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};

// Bordi "nazionali": tutti gli archi tranne quelli condivisi esattamente da due province dello stesso
// proprietario. Servono a disegnare i confini interni più leggeri di quelli tra Stati e delle coste.
export function nationalBorderPath(collection, tol = 0) {
  const owners = new Map();
  collection.features.forEach((f) => {
    polygonsOf(f).forEach((poly) => poly.forEach((ring) => {
      for (let i = 0; i + 1 < ring.length; i += 1) {
        const k = edgeKey(ring[i], ring[i + 1]);
        if (!owners.has(k)) owners.set(k, []);
        owners.get(k).push({ id: f.properties.id, owner: f.properties.owner });
      }
    }));
  });
  const interior = (k) => {
    const o = owners.get(k);
    return o.length === 2 && o[0].id !== o[1].id && o[0].owner === o[1].owner;
  };
  let d = '';
  const flush = (run) => {
    if (run.length < 2) return;
    simplifyLine(run, tol).forEach(([x, y], i) => { d += `${i === 0 ? 'M' : 'L'}${r3(x)} ${r3(y)}`; });
  };
  collection.features.forEach((f) => {
    polygonsOf(f).forEach((poly) => poly.forEach((ring) => {
      let run = [];
      for (let i = 0; i + 1 < ring.length; i += 1) {
        if (interior(edgeKey(ring[i], ring[i + 1]))) { flush(run); run = []; continue; }
        if (run.length === 0) run.push(project(ring[i][0], ring[i][1]));
        run.push(project(ring[i + 1][0], ring[i + 1][1]));
      }
      flush(run);
    }));
  });
  return d;
}

// Versioni semplificate per il gesto (tolleranze in unità di mappa, ~1 grado = 0,7 unità):
// bassa, media e alta risoluzione secondo lo zoom; il dettaglio pieno torna a gesto fermo.
export const LOD_TOLERANCES = [0.06, 0.02, 0.005];
export function lodLevel(k) {
  return k < 3 ? 0 : k < 10 ? 1 : 2;
}

// Versioni semplificate di province e bordi, calcolate a parte (dopo la prima schermata).
export function buildLod(collection) {
  return {
    items: new Map(collection.features.map((f) => [f.properties.id, LOD_TOLERANCES.map((t) => featureToPath(f, t))])),
    borders: LOD_TOLERANCES.map((t) => nationalBorderPath(collection, t)),
  };
}

const modelCache = new WeakMap();
export function buildMapModel(collection) {
  // App e mappa chiedono lo stesso modello: si calcola una volta sola
  if (!modelCache.has(collection)) modelCache.set(collection, buildMapModelUncached(collection));
  return modelCache.get(collection);
}

function buildMapModelUncached(collection) {
  const items = collection.features.map((f) => ({
    id: f.properties.id,
    props: f.properties,
    d: featureToPath(f),
    label: labelPoint(f),
    areaKm2: featureAreaKm2(f),
  }));
  return { items, bounds: boundsOf(collection.features), borderD: nationalBorderPath(collection) };
}

// Zoom attorno a un punto fisso (coordinate della vista), limiti min/max inclusi.
export function zoomAt(view, factor, cx, cy, minK = 1, maxK = 40) {
  const k = Math.min(maxK, Math.max(minK, view.k * factor));
  const f = k / view.k;
  return { k, x: cx - (cx - view.x) * f, y: cy - (cy - view.y) * f };
}

// Limita lo spostamento: almeno una frazione `keep` della mappa deve restare nella vista.
// La vista è schermo = k * locale + t, con viewBox uguale ai limiti della mappa.
export function clampView(view, bounds, keep = 0.2) {
  const { k } = view;
  const lim = (b0, bs, t) => {
    const lo = b0 + bs * keep - k * (b0 + bs); // bordo finale della mappa >= b0 + keep*bs
    const hi = b0 + bs - bs * keep - k * b0; // bordo iniziale della mappa <= b0 + bs - keep*bs
    return Math.min(hi, Math.max(lo, t));
  };
  return { k, x: lim(bounds.x, bounds.w, view.x), y: lim(bounds.y, bounds.h, view.y) };
}
