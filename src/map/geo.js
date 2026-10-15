// Funzioni pure per la mappa: proiezione, percorsi SVG, aree, colori.
// Nessuna dipendenza da React: sono testate in tests/map.test.js.

export const LAT0 = 47; // latitudine di riferimento della proiezione (equirettangolare)
const COS0 = Math.cos((LAT0 * Math.PI) / 180);

// Gradi -> unità di mappa (x cresce a est, y cresce a sud).
export function project(lon, lat) {
  return [lon * COS0, -lat];
}

const r3 = (n) => Math.round(n * 1000) / 1000;

export function ringToPath(ring) {
  let d = '';
  for (let i = 0; i < ring.length; i += 1) {
    const [x, y] = project(ring[i][0], ring[i][1]);
    d += `${i === 0 ? 'M' : 'L'}${r3(x)} ${r3(y)}`;
  }
  return `${d}Z`;
}

export function polygonsOf(feature) {
  const g = feature.geometry;
  return g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
}

export function lineToPath(coordinates) {
  return ringToPath(coordinates).slice(0, -1); // polilinea aperta: niente chiusura Z
}

// Anello esterno + buchi nello stesso path: va usato con fill-rule="evenodd".
export function featureToPath(feature) {
  return polygonsOf(feature)
    .map((poly) => poly.map(ringToPath).join(''))
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
        width: RIVER_WIDTH_PX[river?.widthClass] ?? RIVER_WIDTH_PX.small,
        rank: river?.scalerank ?? 99,
      };
    })
    .sort((a, b) => b.rank - a.rank);
  const lakeItems = lakes.features.map((f) => ({ id: f.properties.id, name: f.properties.name, d: featureToPath(f) }));
  return { lines, lakes: lakeItems };
}

export function buildMapModel(collection) {
  const items = collection.features.map((f) => ({
    id: f.properties.id,
    props: f.properties,
    d: featureToPath(f),
    label: labelPoint(f),
    areaKm2: featureAreaKm2(f),
  }));
  return { items, bounds: boundsOf(collection.features) };
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
