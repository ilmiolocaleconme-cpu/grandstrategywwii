// Calcola una volta sola dove va ogni nome sulla mappa: nazioni, province (con le loro varianti) e zone marittime.
// Il browser non calcola più nulla: legge data/labels.json e filtra per zoom e vista (src/map/labelview.js).
// Tutte le coordinate sono in unità di mappa (project() di src/map/geo.js); `s` è il corpo del testo in unità di mappa,
// `r` la rotazione in gradi, `l` le righe già nella forma finale (maiuscolo per nazioni e province).
import { project, polygonsOf, featureAreaKm2, labelForms, HOME_BOUNDS } from '../src/map/geo.js';
import { fitLabel, mainPolygon, splitName, assignShortNames, pointInRings, CHAR_W, TEXT_H, LINE_STEP } from '../src/map/labelfit.js';
import { seaLabelLines } from '../src/map/seaView.js';

export const SEA_CHAR_W = 0.52; // corsivo minuscolo, come i nomi dei laghi
const up = (s) => s.toLocaleUpperCase('it');
const r4 = (v) => Math.round(v * 1e4) / 1e4;
const SAFE = 0.985; // il corpo salvato è un po' più piccolo del massimo trovato: gli arrotondamenti non portano il testo sul bordo
const r5 = (v) => Math.floor(v * SAFE * 1e5) / 1e5;
const rec = (lines, fit, extra = {}) => ({ l: lines, x: r4(fit.x), y: r4(fit.y), r: Math.round(fit.angle * 10) / 10, s: r5(fit.size), ...extra });

const ringArea = (ring) => Math.abs(ring.reduce((a, p, i) => { const q = ring[(i + 1) % ring.length]; return a + (p[0] * q[1] - q[0] * p[1]); }, 0) / 2);

// ---------------------------------------------------------------------------------------------------------------------
// Province: ogni variante del nome (intero, due righe, sigle) con il suo posizionamento.
// Una provincia divisa in sponde ha un solo nome: quello della madre, sulla sponda più grande. Le altre sponde
// restano nell'elenco (stessi indici dei dati) ma senza nome. Gli indici dei nomi puntano sempre alla collezione intera.
export function labelFeatures(collection) {
  const piuGrande = new Map();
  for (const f of collection.features) {
    if (!f.properties.sponda_fiume) continue;
    const madre = f.properties.parentProvince;
    const area = featureAreaKm2(f);
    if (!piuGrande.has(madre) || area > piuGrande.get(madre).area) piuGrande.set(madre, { id: f.properties.id, area });
  }
  const features = collection.features.map((f) => {
    // le città non hanno un'etichetta di provincia: il loro nome si scrive dal livello delle città (zoom)
    if (f.properties.kind === 'citta') return { ...f, properties: { ...f.properties, name: '', nameLocal: '' } };
    if (!f.properties.sponda_fiume) return f;
    if (piuGrande.get(f.properties.parentProvince)?.id !== f.properties.id) return { ...f, properties: { ...f.properties, name: '', nameLocal: '' } };
    const nome = f.properties.name.replace(/ \(sponda [A-Z]\)$/, '');
    return { ...f, properties: { ...f.properties, name: nome, nameLocal: nome } };
  });
  return { ...collection, features };
}

export function computeProvinceLabels(input) {
  const collection = labelFeatures(input);
  const nameOf = (f) => f.properties.nameLocal ?? f.properties.name;
  const entries = collection.features
    .filter((f) => nameOf(f))
    .map((f) => ({ id: f.properties.id, name: nameOf(f), group: f.properties.owner ?? '', area: featureAreaKm2(f), explicit: f.properties.short }));
  const shorts = assignShortNames(entries);
  const out = [];
  for (let index = 0; index < collection.features.length; index += 1) {
    const f = collection.features[index];
    const raw = nameOf(f);
    if (!raw) continue;
    const polys = polygonsOf(f).map((poly) => poly.map((ring) => ring.map(([lon, lat]) => project(lon, lat))));
    const main = mainPolygon(polys);
    if (!main) continue;
    const x = shorts.get(f.properties.id);
    const list = (Array.isArray(x) ? x : x ? [x] : []).map((q) => up(String(q)));
    const cache = new Map();
    const forms = [];
    for (const form of labelForms(up(raw), list)) {
      const key = `${form.longest}|${form.lines.length}`;
      if (!cache.has(key)) cache.set(key, fitLabel(main, form.longest, { charW: CHAR_W, lines: form.lines.length }));
      const fit = cache.get(key);
      if (fit) forms.push(rec(form.lines, fit, form.abbr ? { a: 1 } : {}));
    }
    // si usa l'indice nella collezione unita (come adjacency.json e sea_zones.json): gli id delle province compaiono solo nei loro file
    if (forms.length) out.push({ i: index, f: forms });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Zone marittime: gli anelli sono con regola pari-dispari (i buchi sono isole). Si usa l'anello più esteso come esterno e
// gli anelli che vi stanno dentro come buchi; i bacini staccati restano fuori.
export function computeSeaLabels(seaFile) {
  const out = [];
  for (const z of seaFile.zones) {
    const rings = z.rings.map((r) => r.map(([lon, lat]) => project(lon, lat)));
    let mainIdx = 0;
    rings.forEach((r, i) => { if (ringArea(r) > ringArea(rings[mainIdx])) mainIdx = i; });
    const main = rings[mainIdx];
    const holes = rings.filter((r, i) => i !== mainIdx && pointInRings(r[0][0], r[0][1], [main]));
    const shape = [main, ...holes];
    let best = null;
    for (const n of [1, 2, 3]) {
      const lines = n === 1 ? [z.name] : n === 2 ? splitName(z.name) : seaLabelLines(z.name, 10);
      if (!lines || lines.length !== n) continue;
      const longest = Math.max(...lines.map((l) => l.length));
      const fit = fitLabel(shape, longest, { charW: SEA_CHAR_W, lines: n });
      if (!fit) continue;
      if (!best || fit.size > best.fit.size * 1.12) best = { lines, fit }; // più righe solo se il corpo cresce sensibilmente
    }
    if (best) out.push({ id: z.id, ...rec(best.lines, best.fit) });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Nazioni: l'unione delle province non è un poligono pronto, quindi si lavora su una griglia (raster) del territorio
// principale: il nome sta dentro la nazione, e il corpo è il più grande che entra senza toccare mare o altre nazioni.

function rasterize(polys, bbox, cell) {
  const nx = Math.max(1, Math.ceil(bbox.w / cell));
  const ny = Math.max(1, Math.ceil(bbox.h / cell));
  const mask = new Uint8Array(nx * ny);
  for (const poly of polys) {
    let y0 = Infinity; let y1 = -Infinity;
    for (const [, y] of poly[0]) { if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const j0 = Math.max(0, Math.floor((y0 - bbox.y) / cell - 0.5));
    const j1 = Math.min(ny - 1, Math.ceil((y1 - bbox.y) / cell - 0.5));
    for (let j = j0; j <= j1; j += 1) {
      const y = bbox.y + (j + 0.5) * cell;
      const xs = [];
      for (const ring of poly) {
        for (let i = 0, k = ring.length - 1; i < ring.length; k = i, i += 1) {
          const [xa, ya] = ring[k];
          const [xb, yb] = ring[i];
          if ((ya <= y) !== (yb <= y)) xs.push(xa + ((y - ya) * (xb - xa)) / (yb - ya));
        }
      }
      xs.sort((a, b) => a - b);
      for (let p = 0; p + 1 < xs.length; p += 2) {
        const a = Math.max(0, Math.ceil((xs[p] - bbox.x) / cell - 0.5));
        const b = Math.min(nx - 1, Math.floor((xs[p + 1] - bbox.x) / cell - 0.5));
        for (let i = a; i <= b; i += 1) mask[j * nx + i] = 1;
      }
    }
  }
  return { nx, ny, cell, x0: bbox.x, y0: bbox.y, mask };
}

/** Componente connessa più grande (4 vicini): nuova maschera e riquadro in celle. */
function largestComponent(g) {
  const { nx, ny, mask } = g;
  const label = new Int32Array(nx * ny);
  let bestId = 0; let bestCount = 0; let id = 0;
  const stack = [];
  for (let s = 0; s < nx * ny; s += 1) {
    if (!mask[s] || label[s]) continue;
    id += 1; let count = 0; stack.push(s); label[s] = id;
    while (stack.length) {
      const c = stack.pop(); count += 1;
      const cx = c % nx; const cy = (c - cx) / nx;
      if (cx > 0 && mask[c - 1] && !label[c - 1]) { label[c - 1] = id; stack.push(c - 1); }
      if (cx < nx - 1 && mask[c + 1] && !label[c + 1]) { label[c + 1] = id; stack.push(c + 1); }
      if (cy > 0 && mask[c - nx] && !label[c - nx]) { label[c - nx] = id; stack.push(c - nx); }
      if (cy < ny - 1 && mask[c + nx] && !label[c + nx]) { label[c + nx] = id; stack.push(c + nx); }
    }
    if (count > bestCount) { bestCount = count; bestId = id; }
  }
  const out = new Uint8Array(nx * ny);
  let i0 = nx; let i1 = -1; let j0 = ny; let j1 = -1;
  for (let c = 0; c < nx * ny; c += 1) {
    if (label[c] !== bestId) continue;
    out[c] = 1;
    const cx = c % nx; const cy = (c - cx) / nx;
    if (cx < i0) i0 = cx; if (cx > i1) i1 = cx; if (cy < j0) j0 = cy; if (cy > j1) j1 = cy;
  }
  return { ...g, mask: out, i0, i1, j0, j1, count: bestCount };
}

/** Distanza dal bordo in celle (approssimazione 3-4 su griglia con cornice vuota): campo con cornice di 1 cella. */
function distanceField(g) {
  const { nx, ny, mask } = g;
  const W = nx + 2; const H = ny + 2;
  const d = new Int32Array(W * H);
  const INF = 1e8;
  for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) d[(j + 1) * W + i + 1] = mask[j * nx + i] ? INF : 0;
  for (let j = 1; j < H - 1; j += 1) for (let i = 1; i < W - 1; i += 1) {
    const c = j * W + i;
    if (d[c] === 0) continue;
    d[c] = Math.min(d[c], d[c - 1] + 3, d[c - W] + 3, d[c - W - 1] + 4, d[c - W + 1] + 4);
  }
  for (let j = H - 2; j >= 1; j -= 1) for (let i = W - 2; i >= 1; i -= 1) {
    const c = j * W + i;
    if (d[c] === 0) continue;
    d[c] = Math.min(d[c], d[c + 1] + 3, d[c + W] + 3, d[c + W + 1] + 4, d[c + W - 1] + 4);
  }
  return { d, W };
}

function momentsAxis(g) {
  const { nx, mask, cell, x0, y0 } = g;
  let n = 0; let sx = 0; let sy = 0; let sxx = 0; let syy = 0; let sxy = 0;
  for (let c = 0; c < mask.length; c += 1) {
    if (!mask[c]) continue;
    const i = c % nx; const j = (c - i) / nx;
    const x = x0 + (i + 0.5) * cell; const y = y0 + (j + 0.5) * cell;
    n += 1; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
  }
  const mx = sx / n; const my = sy / n;
  const cxx = sxx / n - mx * mx; const cyy = syy / n - my * my; const cxy = sxy / n - mx * my;
  const tr = cxx + cyy; const det = cxx * cyy - cxy * cxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc; const l2 = Math.max(tr / 2 - disc, 1e-12);
  return { angle: 0.5 * Math.atan2(2 * cxy, cxx - cyy), elongation: Math.sqrt(l1 / l2) };
}

function fitInRaster(g, len, charW, lines) {
  const { cell, x0, y0, nx, ny } = g;
  const { d, W } = distanceField(g);
  const inside = (x, y) => {
    const i = Math.floor((x - x0) / cell); const j = Math.floor((y - y0) / cell);
    if (i < 0 || j < 0 || i >= nx || j >= ny) return false;
    return d[(j + 1) * W + i + 1] >= 6; // almeno due celle dal bordo (distanza 3-4: 3 per cella): il contorno vero può tagliare la cella
  };
  const hEm = TEXT_H + (lines - 1) * LINE_STEP;
  const rectOk = (x, y, ang, w, h) => {
    const c = Math.cos(ang); const s = Math.sin(ang);
    const step = cell;
    const pt = (u, v) => inside(x + u * c - v * s, y + u * s + v * c);
    for (let u = -w / 2; u <= w / 2 + 1e-9; u += step) for (const v of [-h / 2, -h / 4, 0, h / 4, h / 2]) if (!pt(u, v)) return false;
    for (let v = -h / 2; v <= h / 2 + 1e-9; v += step) if (!pt(-w / 2, v) || !pt(w / 2, v)) return false;
    return true;
  };
  const reach = (x, y, dx, dy) => { let t = 0; while (t < 2000 * cell && inside(x + dx * t, y + dy * t)) t += cell / 2; return t; };
  const sizeAt = (x, y, ang) => {
    const c = Math.cos(ang); const s = Math.sin(ang);
    const halfW = Math.min(reach(x, y, c, s), reach(x, y, -c, -s));
    const halfH = Math.min(reach(x, y, -s, c), reach(x, y, s, -c));
    if (!(halfW > 0 && halfH > 0)) return 0;
    let hi = Math.min((2 * halfW) / (len * charW), (2 * halfH) / hEm) * 1.02;
    let lo = 0;
    for (let k = 0; k < 12; k += 1) { const mid = (lo + hi) / 2; if (rectOk(x, y, ang, len * charW * mid, hEm * mid)) lo = mid; else hi = mid; }
    return lo;
  };
  // centri candidati: i punti lontani dal bordo (almeno metà del massimo), a passo regolare
  let dmax = 0; let pole = null;
  for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) { const v = d[(j + 1) * W + i + 1]; if (v > dmax) { dmax = v; pole = [i, j]; } }
  if (!pole || dmax < 3) return null;
  const centers = [];
  const stride = Math.max(1, Math.round(Math.sqrt((nx * ny) / 1500)));
  for (let j = 0; j < ny; j += stride) for (let i = 0; i < nx; i += stride) if (d[(j + 1) * W + i + 1] >= dmax * 0.5) centers.push([i, j]);
  centers.push(pole);
  const axis = momentsAxis(g);
  const deg = (axis.angle * 180) / Math.PI;
  const angles = [0];
  if (axis.elongation >= 1.6 && Math.abs(deg) > 6 && Math.abs(deg) <= 60) angles.push(axis.angle); // oltre 60° il nome sarebbe quasi verticale: si legge male
  // Tutti i candidati (centro, angolo, corpo). Si sceglie il corpo massimo; ma se il nome così sta fuori dalla vista iniziale
  // (HOME_BOUNDS) mentre la nazione vi entra, si preferisce una posizione dentro la vista iniziale che dia almeno il 60 % del corpo:
  // altrimenti a zoom 1 della nazione più grande si leggerebbe solo un pezzo del nome.
  const cands = [];
  for (const ang of angles) {
    let local = null;
    for (const [i, j] of centers) {
      const x = x0 + (i + 0.5) * cell; const y = y0 + (j + 0.5) * cell;
      const size = sizeAt(x, y, ang);
      if (size > 0) cands.push({ x, y, angle: ang, size });
      if (!local || size > local.size) local = { x, y, angle: ang, size };
    }
    // la rotazione si usa solo se dà un corpo almeno 25 % più grande dell'orizzontale
    if (ang !== 0 && local) local.rotated = true;
  }
  const horiz = cands.filter((c) => c.angle === 0);
  const rot = cands.filter((c) => c.angle !== 0);
  const bestH = horiz.reduce((a, c) => (!a || c.size > a.size ? c : a), null);
  const bestR = rot.reduce((a, c) => (!a || c.size > a.size ? c : a), null);
  const useRot = bestR && (!bestH || bestR.size > bestH.size * 1.25);
  const pool = useRot ? rot : horiz;
  const top = pool.reduce((a, c) => (!a || c.size > a.size ? c : a), null);
  if (!top) return null;
  const CAP = 5; // unità di mappa: oltre questo corpo, alla vista iniziale il nome è già al massimo (26 px) e non cresce
  const eff = (c) => Math.min(c.size, CAP);
  const inHome = (c) => {
    const w = len * charW * eff(c); const h = hEm * eff(c);
    const hx = (w / 2) * Math.abs(Math.cos(c.angle)) + (h / 2) * Math.abs(Math.sin(c.angle));
    const hy = (w / 2) * Math.abs(Math.sin(c.angle)) + (h / 2) * Math.abs(Math.cos(c.angle));
    return c.x - hx >= HOME_BOUNDS.x && c.x + hx <= HOME_BOUNDS.x + HOME_BOUNDS.w && c.y - hy >= HOME_BOUNDS.y && c.y + hy <= HOME_BOUNDS.y + HOME_BOUNDS.h;
  };
  let best = top;
  if (!inHome(top)) {
    const home = pool.filter((c) => eff(c) >= eff(top) * 0.6 && inHome(c)).reduce((a, c) => (!a || c.size > a.size ? c : a), null);
    if (home) best = home;
  }
  return { x: best.x, y: best.y, angle: (best.angle * 180) / Math.PI, size: best.size };
}

export function computeNationLabels(collection, political) {
  const nameOf = new Map(political.map((e) => [e.id, e.name]));
  const byOwner = new Map();
  for (const f of collection.features) {
    const o = f.properties.owner;
    if (!o) continue;
    if (!byOwner.has(o)) byOwner.set(o, []);
    byOwner.get(o).push(f);
  }
  const out = [];
  for (const [owner, feats] of [...byOwner].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const name = nameOf.get(owner);
    if (!name) continue;
    const polys = feats.flatMap((f) => polygonsOf(f).map((poly) => poly.map((ring) => ring.map(([lon, lat]) => project(lon, lat)))));
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const poly of polys) for (const [x, y] of poly[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    // passo 1: griglia grossolana su tutto il territorio, per trovare il pezzo principale
    const full = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    const coarse = largestComponent(rasterize(polys, full, Math.max(full.w, full.h) / 300));
    const pad = coarse.cell * 2;
    const region = { x: coarse.x0 + coarse.i0 * coarse.cell - pad, y: coarse.y0 + coarse.j0 * coarse.cell - pad, w: (coarse.i1 - coarse.i0 + 1) * coarse.cell + 2 * pad, h: (coarse.j1 - coarse.j0 + 1) * coarse.cell + 2 * pad };
    // passo 2: griglia fine sul pezzo principale
    const fine = largestComponent(rasterize(polys, region, Math.max(region.w, region.h) / 320));
    const upper = up(name);
    let best = null;
    for (const lines of [[upper], splitName(upper)]) {
      if (!lines) continue;
      const longest = Math.max(...lines.map((l) => l.length));
      const fit = fitInRaster(fine, longest, CHAR_W, lines.length);
      if (!fit) continue;
      if (!best || fit.size > best.fit.size * 1.12) best = { lines, fit };
    }
    if (best) out.push({ id: owner, ...rec(best.lines, best.fit) });
  }
  return out;
}
