// Funzioni pure per la mappa: proiezione, percorsi SVG, aree, colori.
// Nessuna dipendenza da React: sono testate in tests/map.test.js.

import { fitLabel, mainPolygon, splitName, shortName, assignShortNames, CHAR_W, TEXT_H, LINE_STEP } from './labelfit.js';
import { TERRAIN_COLORS } from '../data/terrain.js';

export const LAT0 = 47; // latitudine di riferimento della proiezione (equirettangolare)
const COS0 = Math.cos((LAT0 * Math.PI) / 180);

// Gradi -> unità di mappa (x cresce a est, y cresce a sud).
export function project(lon, lat) {
  return [lon * COS0, -lat];
}

// --- Mappa circumnavigabile -------------------------------------------------------------
// Il mondo e un cilindro: la larghezza di un giro completo (360 gradi) in unita di mappa e WORLD_W.
// Le longitudini dei dati restano nell'intervallo -180..180; la vista si ripete in orizzontale.
export const WORLD_W = 360 * COS0;
export const MAX_LAT = 85; // limite verticale della vista (i poli non sono navigabili con questa proiezione)

// Vista iniziale (⌂): indipendente dai limiti dei dati. Con l'Unione Sovietica i dati coprono tutte le
// longitudini (da -180 a 180), quindi il viewBox non puo derivare da essi: si parte da Europa, Mediterraneo
// e URSS europea e ci si sposta (o si circumnaviga) con lo scorrimento.
export const HOME_LON = [-25, 75];
export const HOME_LAT = [15, 72];
export const HOME_BOUNDS = {
  x: HOME_LON[0] * COS0,
  y: -HOME_LAT[1],
  w: (HOME_LON[1] - HOME_LON[0]) * COS0,
  h: HOME_LAT[1] - HOME_LAT[0],
};

// Cucitura dell'antimeridiano: i dati non hanno anelli che attraversano +-180 (la Ciukotka e divisa in una
// parte a +180 e una a -180 con gli stessi vertici). Un arco con entrambi gli estremi su +180 (o su -180) e
// un taglio dei dati, non una costa ne un confine: non va disegnato come linea.
export const isSeamEdge = (a, b) => Math.abs(a[0]) === 180 && a[0] === b[0];

/** Longitudine riportata nell'intervallo [-180, 180). */
export function wrapLon(lon) {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** Differenza di longitudine piu breve da `from` a `to`, in [-180, 180): positiva verso est. Serve a distanze e rotte. */
export function lonDelta(from, to) {
  return wrapLon(to - from);
}

/**
 * Normalizza la vista (schermo = k * locale + t) per la mappa che si ripete: la traslazione orizzontale
 * e riportata modulo un giro (il centro della vista resta tra -180 e 180 gradi) e quella verticale limitata
 * a +-MAX_LAT. `vb` e il viewBox dell'SVG {x, y, w, h}. Non cambia l'immagine mostrata.
 */
export function wrapView(view, vb, worldW = WORLD_W, maxLat = MAX_LAT) {
  const { k } = view;
  const cx = (vb.x + vb.w / 2 - view.x) / k;
  const n = Math.floor((cx + worldW / 2) / worldW);
  const x = view.x + n * worldW * k;
  const h = vb.h / k;
  const top = (vb.y - view.y) / k;
  const lo = -maxLat;
  const hi = maxLat - h;
  const newTop = hi < lo ? -h / 2 : Math.min(hi, Math.max(lo, top));
  return { k, x, y: vb.y - newTop * k };
}

/**
 * Zoom minimo per uno schermo W x H (pixel) con `s` pixel per unità di vista a zoom 1 (layoutOf): sotto questo valore il mondo
 * sarebbe più stretto dello schermo (la mappa si ripeterebbe in orizzontale) o più basso (bande vuote sopra e sotto).
 */
export function minZoomToFit(W, H, s, worldW = WORLD_W, maxLat = MAX_LAT) {
  if (!(W > 0) || !(H > 0) || !(s > 0)) return 0.3;
  return Math.max(W / (s * worldW), H / (s * 2 * maxLat));
}

/** Spostamenti orizzontali (multipli di worldW) delle copie della mappa che toccano la vista; di norma [0]. */
export function visibleCopies(view, vb, bounds, worldW = WORLD_W) {
  const x0 = (vb.x - view.x) / view.k;
  const x1 = x0 + vb.w / view.k;
  const out = [];
  for (let n = -3; n <= 3; n += 1) {
    const off = n * worldW;
    if (bounds.x + off < x1 && bounds.x + bounds.w + off > x0) out.push(off);
  }
  return out;
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

/** La provincia ha archi sulla cucitura dell'antimeridiano? */
export function hasSeam(feature) {
  return polygonsOf(feature).some((poly) => poly.some((ring) => {
    for (let i = 0; i + 1 < ring.length; i += 1) if (isSeamEdge(ring[i], ring[i + 1])) return true;
    return false;
  }));
}

// Contorno senza gli archi di cucitura: polilinee aperte che si interrompono sul taglio. Serve a disegnare
// il bordo di una provincia a cavallo dell'antimeridiano senza una falsa costa lungo +-180.
export function featureToStrokePath(feature) {
  let d = '';
  for (const poly of polygonsOf(feature)) {
    for (const ring of poly) {
      let run = [];
      const flush = () => {
        if (run.length >= 2) d += run.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${r3(x)} ${r3(y)}`).join('');
        run = [];
      };
      for (let i = 0; i + 1 < ring.length; i += 1) {
        if (isSeamEdge(ring[i], ring[i + 1])) { flush(); continue; }
        if (run.length === 0) run.push(project(ring[i][0], ring[i][1]));
        run.push(project(ring[i + 1][0], ring[i + 1][1]));
      }
      flush();
    }
  }
  return d;
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
  HUN: [140, 38], ROM: [58, 45], BGR: [350, 40], GRC: [165, 40], ALB: [28, 62],
  GBR: [315, 40], ESP: [14, 66], USSR: [0, 62],
  IRL: [128, 58], ISL: [200, 52],
  DNK: [90, 66], EGY: [70, 66], EST: [275, 66], FIN: [300, 66], LTU: [35, 42],
  LVA: [340, 66], NOR: [180, 66], PRT: [320, 66], SWE: [215, 66], TUR: [240, 66],
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
  { id: 'terrain', label: 'Terreno' },
  { id: 'resources', label: 'Risorse' },
  { id: 'army', label: 'Esercito' },
  { id: 'ports', label: 'Porti' },
];

// Colore politico: quello della potenza che controlla il territorio (colonie, protettorati e mandati
// prendono il colore della madrepatria o dell'amministratore). `control` = { idTerritorio: idControllore }
// da political_1936.json; senza, vale il proprietario della provincia.
export function controllerOf(owner, control) {
  return control?.[owner] ?? owner;
}

export function provinceFill(props, layer, control) {
  if (layer === 'terrain') return TERRAIN_COLORS[props.terreno] ?? '#777'; // senza dato (es. Chukotka) grigio scuro
  return ownerColor(controllerOf(props.owner, control), props.id);
}

// Fiumi e laghi: percorsi pronti per l'SVG. I fiumi sono ordinati dal più piccolo al più grande,
// così i grandi restano sopra. Stessi dati (data/rivers_geo.json) usati dalle regole.
export const RIVER_WIDTH_PX = { large: 2.4, medium: 1.5, small: 0.9 };

// Livelli dei fiumi per classe: più si ingrandisce, più classi si vedono. A vista d'insieme solo i principali, da zoom 1,8
// anche i secondari, da zoom 3,5 anche i terziari (tributary). Il fiume selezionato resta sempre visibile.
// Livello 0: principali (main). Livello 1: secondari. Livello 2: terziari.
// Livello 2: i piccoli (tributari e il resto).
export function riverTier(river) {
  if (river?.class === 'main') return 0;
  if (river?.class === 'secondary') return 1;
  return 2;
}
export function riverRankLimit(k) {
  return k < 1.8 ? 0 : k < 3.5 ? 1 : 2;
}
// Spessore dei fiumi per zoom: a vista d'insieme più sottili, così i principali non coprono la mappa.
export function riverWidthScale(k) {
  return k < 1.8 ? 0.55 : k < 3.5 ? 0.8 : 1;
}
// Opacità dei fiumi per zoom: a vista d'insieme più trasparenti, così non fanno da rete di linee blu sulla mappa.
export function riverOpacity(k) {
  return k < 1.8 ? 0.6 : k < 3.5 ? 0.8 : 1;
}

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
        rank: riverTier(river),
      };
    })
    .sort((a, b) => b.rank - a.rank || a.width - b.width);
  const lakeItems = lakes.features.map((f) => ({
    id: f.properties.id,
    name: f.properties.name,
    props: f.properties,
    d: featureToPath(f),
    low: LOD_TOLERANCES.map((t) => featureToPath(f, t)),
    areaKm2: f.properties.areaKm2 ?? featureAreaKm2(f),
    bbox: boundsOf([f]),
    feature: f,
    kind: 'lake',
  }));
  return { lines, lakes: lakeItems };
}

const edgeKey = (a, b) => {
  // sulla cucitura +180 e -180 sono lo stesso meridiano: la chiave le unisce, cosi le due meta si accoppiano
  const lon = (p) => (isSeamEdge(a, b) ? 180 : p[0]);
  // stesso arrotondamento del Canvas (canvasModel.buildBorders: 1e-5 gradi, circa 1 m): vertici agganciati entro 1 m
  // ma non identici nel file (0,000001 gradi di differenza) contano come lo stesso punto in entrambi i percorsi
  // Il Canvas lavora in unità di mappa (x = lon * COS0, y = -lat) in float32 e arrotonda lì: qui lo stesso passaggio,
  // altrimenti due vertici vicini cadrebbero nella stessa cella in un percorso e in due celle diverse nell'altro.
  const cos0 = WORLD_W / 360;
  const qx = (p) => Math.round(Math.fround(lon(p) * cos0) * 1e5);
  const qy = (p) => Math.round(Math.fround(-p[1]) * 1e5);
  const ka = `${qx(a)},${qy(a)}`;
  const kb = `${qx(b)},${qy(b)}`;
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};

// Bordi "nazionali": tutti gli archi tranne quelli condivisi esattamente da due province dello stesso
// proprietario. Servono a disegnare i confini interni più leggeri di quelli tra Stati e delle coste.
// La classificazione degli archi (la parte costosa: una chiave di testo per ogni arco) si fa una sola volta
// per collezione; le versioni a bassa risoluzione dei bordi riusano gli stessi tratti e li semplificano soltanto.
const borderRunsCache = new WeakMap();
function nationalBorderRuns(collection) {
  if (borderRunsCache.has(collection)) return borderRunsCache.get(collection);
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
  const interior = (k, seam) => {
    const o = owners.get(k);
    // sulla cucitura le due meta (+180 e -180) possono essere della stessa provincia: sono comunque un taglio interno
    return o.length === 2 && (seam || o[0].id !== o[1].id) && o[0].owner === o[1].owner;
  };
  const runs = [];
  collection.features.forEach((f) => {
    polygonsOf(f).forEach((poly) => poly.forEach((ring) => {
      let run = [];
      const flush = () => { if (run.length >= 2) runs.push(run); run = []; };
      for (let i = 0; i + 1 < ring.length; i += 1) {
        if (interior(edgeKey(ring[i], ring[i + 1]), isSeamEdge(ring[i], ring[i + 1]))) { flush(); continue; }
        if (run.length === 0) run.push(project(ring[i][0], ring[i][1]));
        run.push(project(ring[i + 1][0], ring[i + 1][1]));
      }
      flush();
    }));
  });
  borderRunsCache.set(collection, runs);
  return runs;
}

export function nationalBorderPath(collection, tol = 0) {
  let d = '';
  for (const run of nationalBorderRuns(collection)) {
    simplifyLine(run, tol).forEach(([x, y], i) => { d += `${i === 0 ? 'M' : 'L'}${r3(x)} ${r3(y)}`; });
  }
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
    // le province sulla cucitura restano al dettaglio pieno: la semplificazione potrebbe spostare i vertici del taglio
    items: new Map(collection.features.map((f) => [f.properties.id, LOD_TOLERANCES.map((t) => featureToPath(f, hasSeam(f) ? 0 : t))])),
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
    seamD: hasSeam(f) ? featureToStrokePath(f) : null,
    label: labelPoint(f),
    areaKm2: featureAreaKm2(f),
    bbox: boundsOf([f]),
    feature: f,
  }));
  return { items, bounds: boundsOf(collection.features), borderD: nationalBorderPath(collection) };
}

// Nei laghi le isole piccole (< 2 % dell'area del lago) non fermano il nome: il testo ci passa sopra.
export const SMALL_HOLE_FRACTION = 0.02;
export function withoutSmallHoles(poly) {
  const area = (ring) => Math.abs(ring.reduce((a, p, i) => a + (ring[(i + 1) % ring.length][0] * p[1] - p[0] * ring[(i + 1) % ring.length][1]), 0) / 2);
  const outer = area(poly[0]);
  return [poly[0], ...poly.slice(1).filter((h) => area(h) >= outer * SMALL_HOLE_FRACTION)];
}

// Posizione e corpo del nome dentro la forma (unità di mappa), calcolati una volta per elemento.
export function labelFitOf(item, text, charW = CHAR_W, lines = 1) {
  const key = `${text}|${charW}|${lines}`;
  if (item.fits?.has(key)) return item.fits.get(key);
  const polys = polygonsOf(item.feature).map((poly) => poly.map((ring) => ring.map(([lon, lat]) => project(lon, lat))));
  let main = mainPolygon(polys);
  if (main && item.kind === 'lake') main = withoutSmallHoles(main);
  // `text` = riga più lunga (per più righe si passa la riga più lunga, `lines` dice quante sono)
  const value = main ? fitLabel(main, text.length, { charW, lines }) : null;
  if (!item.fits) item.fits = new Map();
  item.fits.set(key, value);
  return value;
}

// Condizione necessaria (economica) perché un rettangolo w x h, ruotato fino a 75 gradi, stia nel riquadro della
// forma: l'ingombro orizzontale e verticale del rettangolo ruotato non può superare il riquadro. Scarta in
// anticipo le forme per cui il calcolo del posizionamento (costoso) non può dare un corpo sufficiente.
export function rectCouldFit(bbox, w, h) {
  for (let deg = 0; deg <= 75; deg += 5) {
    const a = (deg * Math.PI) / 180;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    if (w * c + h * sn <= bbox.w && w * sn + h * c <= bbox.h) return true;
  }
  return false;
}

// Etichette incastrate nella forma: il nome sta dentro la provincia (o il lago), con corpo, posizione e
// rotazione calcolati sulla forma (src/map/labelfit.js). Il corpo cresce con lo zoom fino a `maxPx`; sotto
// `minPx` il nome non si mostra. Priorità ai più grandi; si salta chi si sovrappone a un'etichetta già scelta
// (anche di `opts.avoid`, rettangoli in pixel di un'altra passata); si ignora ciò che è fuori vista; tetto al numero.
// `view`: {k,x,y} come in MapView; `vb`: {x,y,w,h} del viewBox; `pxPerUnit`: pixel per unità di viewBox
// (senza zoom); `offsets`: copie del mondo visibili. Ogni etichetta ha `size` (corpo in unità di mappa), `angle`
// (gradi), `length` (larghezza del testo in unità di mappa: va imposta con textLength) e `rect` (ingombro in pixel).
// `charW`: larghezza media di un carattere in em; `upper`: maiuscolo (province) o testo com'è (laghi).
export function pickLabels(items, view, vb, pxPerUnit, offsets = [0], opts = {}) {
  const { minPx = 7, maxPx = 20, maxLabels = 70, avoid = [], charW = CHAR_W, upper = true, nameOf = (it) => it.props.nameLocal ?? it.props.name, shortOf = null, variants = false, budgetMs = Infinity } = opts;
  // budgetMs: tempo massimo speso a calcolare forme nuove (i risultati restano in cache): scaduto il tempo si
  // restituisce quanto trovato con out.partial = true, e una chiamata successiva prosegue dalle forme già pronte.
  // variants: se il nome intero non entra con corpo comodo (< VARIANT_COMFORT_PX) si provano due righe e la sigla
  // (campo `short` dei dati o iniziali), e si sceglie la forma con il corpo più grande. Solo la mappa Canvas le disegna.
  const t0 = Number.isFinite(budgetMs) ? performance.now() : 0;
  const sx = view.k * pxPerUnit; // pixel per unità di mappa
  const order = [...items].sort((a, b) => b.areaKm2 - a.areaKm2);
  const shorts = variants && !shortOf ? shortsOf(items, nameOf) : null;
  const placed = [...avoid]; // rettangoli in pixel [x0,y0,x1,y1]
  const out = [];
  const usedAbbr = new Set(); // una sigla già mostrata non si ripete (due province con le stesse iniziali: meglio nessun nome che un nome ambiguo)
  for (const off of offsets) {
    for (const it of order) {
      if (out.length >= maxLabels) return out;
      const raw = nameOf(it);
      if (!raw) continue;
      const name = upper ? raw.toLocaleUpperCase('it') : raw; // lettering da carta anni Trenta: maiuscolo per le province
      const forms = variants ? labelForms(name, (() => { const x = shortOf ? shortOf(it) : shorts.get(it.id); const list = Array.isArray(x) ? x : x ? [x] : []; return upper ? list.map((q) => String(q).toLocaleUpperCase('it')) : list; })()) : [{ lines: [name], longest: name.length }];
      const probeLen = Math.min(...forms.map((f) => f.longest)); // la forma più corta: condizione necessaria per tutte
      // scarto economico: nemmeno riempiendo tutto il rettangolo di ingombro il nome arriverebbe al corpo minimo
      if (it.bbox.w * it.bbox.h * sx * sx < probeLen * charW * TEXT_H * minPx * minPx) continue;
      if (!rectCouldFit(it.bbox, probeLen * charW * minPx / sx, TEXT_H * minPx / sx)) continue;
      // fuori vista (il nome sta dentro la forma, quindi dentro il suo riquadro): si scarta prima del calcolo, che è il passo costoso
      const bx0 = (view.k * (it.bbox.x + off) + view.x - vb.x) * pxPerUnit;
      const by0 = (view.k * it.bbox.y + view.y - vb.y) * pxPerUnit;
      if (bx0 + it.bbox.w * sx < 0 || bx0 > vb.w * pxPerUnit || by0 + it.bbox.h * sx < 0 || by0 > vb.h * pxPerUnit) continue;
      // Ordine di preferenza: nome intero, poi due righe, poi sigla. Vince la prima forma con corpo comodo; se nessuna lo è,
      // la forma non-sigla con il corpo più grande (>= minPx); la sigla (corpo tra ABBR_MIN_PX e ABBR_MAX_PX) solo se non entra nessun'altra forma.
      let chosen = null;
      let abbrChoice = null;
      for (const form of forms) {
        const longestLine = form.lines.reduce((x, y) => (y.length > x.length ? y : x));
        const key = `${longestLine}|${charW}|${form.lines.length}`;
        const cached = it.fits?.has(key);
        if (!cached && Number.isFinite(budgetMs) && performance.now() - t0 > budgetMs) { out.partial = true; return out; }
        const fit = labelFitOf(it, longestLine, charW, form.lines.length);
        if (!fit) continue;
        const fontPx = Math.min(fit.size * sx, maxPx);
        if (fontPx < minPx) continue;
        if (form.abbr) {
          // la prima sigla che entra (le più esplicite stanno prima), mai una già mostrata nella schermata
          if (!abbrChoice && fontPx >= ABBR_MIN_PX && !usedAbbr.has(form.lines[0])) abbrChoice = { form, fit, fontPx: Math.min(fontPx, ABBR_MAX_PX) };
          continue;
        }
        if (!chosen || fontPx > chosen.fontPx) chosen = { form, fit, fontPx };
        if (fontPx >= VARIANT_COMFORT_PX) break; // corpo comodo: non serve provare forme più compatte
      }
      if (!chosen) chosen = abbrChoice; // la sigla è l'ultima scelta: mai al posto di un nome che entra (anche piccolo)
      if (!chosen) continue;
      const { form, fit, fontPx } = chosen;
      const nLines = form.lines.length;
      const cxp = (view.k * (fit.x + off) + view.x - vb.x) * pxPerUnit;
      const cyp = (view.k * fit.y + view.y - vb.y) * pxPerUnit;
      const w = form.longest * fontPx * charW;
      const h = fontPx * (TEXT_H + (nLines - 1) * LINE_STEP);
      const a = (fit.angle * Math.PI) / 180;
      const hx = (w / 2) * Math.abs(Math.cos(a)) + (h / 2) * Math.abs(Math.sin(a));
      const hy = (w / 2) * Math.abs(Math.sin(a)) + (h / 2) * Math.abs(Math.cos(a));
      if (cxp + hx < 0 || cxp - hx > vb.w * pxPerUnit || cyp + hy < 0 || cyp - hy > vb.h * pxPerUnit) continue;
      const r = [cxp - hx - 2, cyp - hy - 1, cxp + hx + 2, cyp + hy + 1];
      if (placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) continue;
      placed.push(r);
      if (form.abbr) usedAbbr.add(form.lines[0]);
      const rec = { id: it.id, name: form.lines.join(' '), x: fit.x, y: fit.y, off, angle: fit.angle, size: fontPx / sx, length: w / sx, rect: r };
      if (variants) {
        rec.lines = form.lines;
        rec.lineLengths = form.lines.map((ln) => (ln.length * fontPx * charW) / sx);
        rec.abbr = Boolean(form.abbr);
      }
      out.push(rec);
    }
  }
  return out;
}

// Sigle uniche per nazione, calcolate una volta per elenco di elementi (le nazioni hanno nomi che si somigliano:
// «Pohjois-Savo» e «Pohjois-Karjala» non devono diventare entrambe «PS»/«PK» ambigue, o due «BN» in Romania).
const shortsCache = new WeakMap();
function shortsOf(items, nameOf) {
  if (shortsCache.has(items)) return shortsCache.get(items);
  const entries = [];
  for (const it of items) {
    const name = nameOf(it);
    if (name) entries.push({ id: it.id, name, group: it.props.owner ?? '', area: it.areaKm2, explicit: it.props.short });
  }
  const map = assignShortNames(entries);
  shortsCache.set(items, map);
  return map;
}

// Sotto questo corpo (px) si provano le forme alternative del nome (due righe, sigla) e si sceglie la più leggibile.
export const VARIANT_COMFORT_PX = 8;
// Una sigla sotto questo corpo (px) non si legge: meglio nessun nome.
export const ABBR_MIN_PX = 7;
// ...e non deve dominare la mappa: corpo massimo delle sigle (px).
export const ABBR_MAX_PX = 11;

// Forme di un nome, dalla più completa alla più compatta: intero, due righe, sigla.
export function labelForms(name, shortList) {
  const forms = [{ lines: [name], longest: name.length }];
  const two = splitName(name);
  if (two) forms.push({ lines: two, longest: Math.max(two[0].length, two[1].length) });
  // sigle già assegnate (dalla più esplicita alla più compatta); senza assegnazione, una sigla automatica sola
  let list = Array.isArray(shortList) ? shortList : shortList ? [shortList] : [];
  if (!Array.isArray(shortList) && !shortList) { const one = shortName(name); list = one ? [one] : []; }
  const seen = new Set();
  for (const sg of list) {
    if (!sg || sg.length >= name.length || seen.has(sg)) continue;
    seen.add(sg);
    forms.push({ lines: [sg], longest: sg.length, abbr: true });
  }
  return forms;
}

// Zoom attorno a un punto fisso (coordinate della vista), limiti min/max inclusi.
export const MAX_K = 120; // abbastanza per vedere i binari, i ponti e le singole carreggiate
export function zoomAt(view, factor, cx, cy, minK = 1, maxK = MAX_K) {
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
