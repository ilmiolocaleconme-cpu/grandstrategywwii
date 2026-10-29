// Disegno su Canvas 2D (prototipo): scena (province, bordi, laghi, fiumi) e sovrapposizione (selezione, nomi).
// Usa Path2D e il contesto 2D: gira solo nel browser. La logica che si può provare senza browser sta in
// canvasModel.js e canvasView.js (testate in tests/canvas.test.js). Gli stessi colori e spessori di styles.css (.prov, .lake, .river, ...).

import { WORLD_W, provinceFill, riverOpacity, riverRankLimit, riverWidthScale } from './geo.js';
import { cityNamesAt } from './citta.js';
import { CANVAS_LOD_TOLS } from './canvasModel.js';
import { LINE_STEP } from './labelfit.js';
import { drawTransport } from './transportView.js';
import { affineOf, lodLevelForScale, regionToUnits } from './canvasView.js';
import { drawProvinceResources } from './resourceIcons.js';
import { drawProvinceUnits } from './unitIcons.js';
import { RESOURCE_NEUTRAL } from '../data/provinceResources.js';

const COS0 = WORLD_W / 360;
const SEAM_X = Math.fround(180 * COS0);

export const COLORS = {
  sea: '#17324a',
  provStroke: 'rgba(29, 36, 24, 0.64)', // 0,4 di opacità per ciascuna delle due province che condividono l'arco, come in SVG
  border: '#1d2418',
  outline: '#ffffff',
  lakeFill: '#2f6f9c',
  lakeStroke: '#5aa3d8',
  river: '#5aa3d8',
  label: 'rgba(228, 228, 224, 0.72)',
  labelHalo: 'rgba(14, 18, 10, 0.28)',
  lakeLabel: 'rgba(221, 227, 232, 0.72)',
  lakeLabelHalo: 'rgba(10, 36, 60, 0.28)',
  landBase: '#4a5140', // terra senza provincia: neutra, scura
  seaFill: 'rgba(120, 190, 235, 0.07)',
  cityGrey: '#7d8288', // città (centro urbano)
  cityLabel: 'rgba(252, 240, 200, 0.95)',
  cityLabelHalo: 'rgba(14, 18, 10, 0.6)',
  seaStroke: 'rgba(170, 215, 245, 0.45)',
  straitFill: 'rgba(255, 214, 120, 0.16)',
  approachFill: 'rgba(120, 190, 235, 0.10)', // zone d'avvicinamento: azzurre e molto tenui, non grigie
  straitStroke: 'rgba(255, 214, 120, 0.7)',
  seaSelFill: 'rgba(255, 214, 120, 0.28)',
  seaSelStroke: '#ffd678',
  seaLabel: 'rgba(188, 217, 238, 0.7)',
  seaLabelHalo: 'rgba(10, 36, 60, 0.28)',
};

// Stile dei nomi per tipo: nazioni (grassetto, più grandi), province, laghi e mari (corsivo).
const LABEL_STYLE = {
  nation: { font: '600', fill: COLORS.label, halo: COLORS.labelHalo },
  prov: { font: '500', fill: COLORS.label, halo: COLORS.labelHalo },
  lake: { font: 'italic 400', fill: COLORS.lakeLabel, halo: COLORS.lakeLabelHalo },
  sea: { font: 'italic 400', fill: COLORS.seaLabel, halo: COLORS.seaLabelHalo },
};

// Larghezza dei testi in cache: measureText a ogni fotogramma del gesto costava più del resto della sovrapposizione.
// Si misura una volta a corpo 100 e si scala (la larghezza è proporzionale al corpo).
const WIDTHS = new Map();
function textWidth(ctx, style, text, px) {
  const key = `${style}|${text}`;
  let w = WIDTHS.get(key);
  if (w === undefined) {
    const prev = ctx.font;
    ctx.font = `${style} 100px ${FONT_FAMILY}`.trim();
    w = ctx.measureText(text).width;
    ctx.font = prev;
    if (WIDTHS.size > 20000) WIDTHS.clear();
    WIDTHS.set(key, w);
  }
  return (w * px) / 100;
}
const CITY_NAME_PX = 11;
const FONT_FAMILY = "'Palatino Linotype', Palatino, 'Book Antiqua', 'Hoefler Text', Georgia, 'Times New Roman', serif";

function ringsToPath(path, coords, offsets, r0, r1) {
  for (let r = r0; r < r1; r += 1) {
    const s = offsets[r];
    const e = offsets[r + 1];
    if (e - s < 2) continue;
    path.moveTo(coords[2 * s], coords[2 * s + 1]);
    for (let i = s + 1; i < e; i += 1) path.lineTo(coords[2 * i], coords[2 * i + 1]);
    path.closePath();
  }
}

/** Path2D della provincia al livello di semplificazione richiesto (0..2) o al dettaglio pieno (3); se il livello non è pronto si usa il pieno. */
export function itemPath(model, lod, item, level) {
  const lv = level < 3 && lod?.levels?.[level] ? level : 3;
  const cache = item.paths ?? (item.paths = [null, null, null, null]);
  if (cache[lv]) return cache[lv];
  const p = new Path2D();
  if (lv === 3) ringsToPath(p, model.coords, model.ringOffsets, item.ringStart, item.ringEnd);
  else ringsToPath(p, lod.levels[lv].coords, lod.levels[lv].ringOffsets, item.ringStart, item.ringEnd);
  cache[lv] = p;
  return p;
}

/** Contorno di una provincia sulla cucitura dell'antimeridiano, senza gli archi sul taglio (polilinee aperte, dettaglio pieno). */
export function seamStrokePath(model, item) {
  if (item.seamPath) return item.seamPath;
  const p = new Path2D();
  const { coords, ringOffsets } = model;
  for (let r = item.ringStart; r < item.ringEnd; r += 1) {
    const s = ringOffsets[r];
    const e = ringOffsets[r + 1];
    let open = false;
    for (let i = s; i + 1 < e; i += 1) {
      const ax = coords[2 * i];
      const bx = coords[2 * (i + 1)];
      if (ax === bx && Math.abs(ax) === SEAM_X) { open = false; continue; }
      if (!open) { p.moveTo(ax, coords[2 * i + 1]); open = true; }
      p.lineTo(bx, coords[2 * (i + 1) + 1]);
    }
  }
  item.seamPath = p;
  return p;
}

// Gruppi di percorsi ordinati nello spazio (curva di Morton sul centro del riquadro): ogni gruppo ha il proprio riquadro, così chi
// disegna una porzione di mappa (una piastrella) salta i gruppi che stanno altrove invece di far elaborare al motore grafico
// tutto il mondo. Ognuno ha al massimo ~CHUNK_PTS punti: si disegnano in passi separati e nessun passo occupa il thread a lungo.
const CHUNK_PTS = 6000;
const MORTON_X0 = -180 * COS0;
const MORTON_SPAN_X = 360 * COS0;
function morton(cx, cy) {
  const qx = Math.max(0, Math.min(1023, Math.floor(((cx - MORTON_X0) / MORTON_SPAN_X) * 1024)));
  const qy = Math.max(0, Math.min(1023, Math.floor(((cy + 90) / 180) * 1024)));
  let m = 0;
  for (let i = 0; i < 10; i += 1) m += (((qx >> i) & 1) << (2 * i)) + (((qy >> i) & 1) << (2 * i + 1));
  return m;
}
/** runs: [{ x0, y0, x1, y1, pts, add(path) }] → [{ path, bbox }] ordinati nello spazio. */
export function spatialChunks(runs, maxPts = CHUNK_PTS) {
  const order = runs.map((r, i) => ({ i, m: morton((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2) })).sort((u, v) => u.m - v.m);
  const out = [];
  let path = new Path2D();
  let n = 0;
  let bb = null;
  for (const { i } of order) {
    const r = runs[i];
    r.add(path);
    n += r.pts;
    bb = bb ? { x0: Math.min(bb.x0, r.x0), y0: Math.min(bb.y0, r.y0), x1: Math.max(bb.x1, r.x1), y1: Math.max(bb.y1, r.y1) } : { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 };
    if (n >= maxPts) { out.push({ path, bbox: bb }); path = new Path2D(); n = 0; bb = null; }
  }
  if (n > 0) out.push({ path, bbox: bb });
  return out;
}

function borderChunks(borders, level) {
  const cache = borders.chunks ?? (borders.chunks = [null, null, null, null]);
  const lv = level < 3 && borders.levels?.[level] ? level : 3;
  if (cache[lv]) return cache[lv];
  const src = lv === 3 ? borders : borders.levels[lv];
  const runs = [];
  for (let k = 0; k + 1 < src.runStarts.length; k += 1) {
    const s = src.runStarts[k];
    const e = src.runStarts[k + 1];
    if (e - s < 2) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = s; i < e; i += 1) {
      const x = src.points[2 * i], y = src.points[2 * i + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    runs.push({ x0, y0, x1, y1, pts: e - s, add: (p) => { p.moveTo(src.points[2 * s], src.points[2 * s + 1]); for (let i = s + 1; i < e; i += 1) p.lineTo(src.points[2 * i], src.points[2 * i + 1]); } });
  }
  cache[lv] = spatialChunks(runs);
  return cache[lv];
}

function featurePath(feature) {
  const g = feature.geometry;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const p = new Path2D();
  for (const poly of polys) {
    for (const ring of poly) {
      ring.forEach(([lon, lat], i) => (i === 0 ? p.moveTo(lon * COS0, -lat) : p.lineTo(lon * COS0, -lat)));
      p.closePath();
    }
  }
  return p;
}

/** Path2D delle zone marittime (anelli aperti nel file: si chiudono qui), in gruppi per stile; la zona è in cache sull'oggetto. */
function zonePath(z) {
  if (z.path) return z.path;
  const p = new Path2D();
  for (const ring of z.rings) {
    ring.forEach(([lon, lat], i) => (i === 0 ? p.moveTo(lon * COS0, -lat) : p.lineTo(lon * COS0, -lat)));
    p.closePath();
  }
  z.path = p;
  return p;
}

// Riquadro (unità di mappa) di una zona, in cache: serve a scartare le zone fuori dalla regione disegnata.
function zoneBox(z) {
  if (z.box) return z.box;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const ring of z.rings) for (const [lon, lat] of ring) {
    const x = lon * COS0, y = -lat;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  z.box = { x0, y0, x1, y1 };
  return z.box;
}

// Solo le zone che toccano la regione: con le zone di tutto il mondo il tratteggio dell'intero contorno (decine di migliaia di
// punti, a zoom alto milioni di trattini) costava molto anche per ciò che sta fuori schermo.
/**
 * Contorno di una zona senza i lati lungo l'antimeridiano (lon = ±180): il calcolo taglia le zone alla cucitura del mondo,
 * ma lì non c'è nessun confine, quindi la riga non si deve vedere (il riempimento resta invariato).
 */
function zoneLinePath(z) {
  if (z.line) return z.line;
  const p = new Path2D();
  const onSeam = (pt) => Math.abs(Math.abs(pt[0]) - 180) < 0.08;
  for (const ring of z.rings) {
    const n = ring.length;
    p.moveTo(ring[0][0] * COS0, -ring[0][1]);
    for (let i = 1; i <= n; i += 1) {
      const a = ring[i - 1], b = ring[i % n];
      if (onSeam(a) && onSeam(b) && Math.sign(a[0]) === Math.sign(b[0])) p.moveTo(b[0] * COS0, -b[1]);
      else p.lineTo(b[0] * COS0, -b[1]);
    }
  }
  z.line = p;
  return p;
}

function seaGroups(seas, cull) {
  const g = { open: new Path2D(), strait: new Path2D(), approach: new Path2D(), openLine: new Path2D(), straitLine: new Path2D() };
  for (const z of seas.zones) {
    const b = zoneBox(z);
    if (cull && (b.x0 > cull.x1 || b.x1 < cull.x0 || b.y0 > cull.y1 || b.y1 < cull.y0)) continue;
    const strait = z.kind === 'strait' || z.kind === 'approach';
    g[z.kind === 'approach' ? 'approach' : strait ? 'strait' : 'open'].addPath(zonePath(z));
    g[strait ? 'straitLine' : 'openLine'].addPath(zoneLinePath(z));
  }
  return g;
}

function drawSeas(ctx, seas, selectedSeaId, sx, cull) {
  const g = seaGroups(seas, cull);
  ctx.setLineDash([4 / sx, 3 / sx]);
  ctx.lineWidth = 0.8 / sx;
  ctx.fillStyle = COLORS.seaFill; ctx.strokeStyle = COLORS.seaStroke;
  ctx.fill(g.open, 'evenodd'); ctx.stroke(g.openLine);
  // Riempimenti sfumati: il tracciato si disegna lontano fuori dal canvas e la sua ombra sfocata rientra (shadowOffset non risente
  // della trasformazione), così resta solo il contorno morbido senza il bordo netto che sembrava un taglio nella mappa.
  featherFill(ctx, g.approach, COLORS.approachFill);
  featherFill(ctx, g.strait, COLORS.straitFill);
  ctx.strokeStyle = COLORS.straitStroke;
  ctx.stroke(g.straitLine);
  ctx.setLineDash([]);
}

// Terra neutra sotto le province (data/land_base.json): dove le province non arrivano si vede terra, non mare.
function landPath(land) {
  if (land.path) return land.path;
  const p = new Path2D();
  for (const rings of land.polygons) for (const ring of rings) {
    p.moveTo(ring[0][0] * COS0, -ring[0][1]);
    for (let i = 1; i < ring.length; i += 1) p.lineTo(ring[i][0] * COS0, -ring[i][1]);
    p.closePath();
  }
  land.path = p;
  return p;
}
function drawLandBase(ctx, land) {
  ctx.fillStyle = COLORS.landBase;
  ctx.fill(landPath(land), 'evenodd');
}

const FEATHER_PX = 14;
const FEATHER_OFF = 100000;
function featherFill(ctx, path, color) {
  const k = ctx.getTransform().a; // pixel del canvas per unità: lo spostamento dell'ombra è in pixel del canvas
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = FEATHER_PX;
  ctx.shadowOffsetX = FEATHER_OFF;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#000';
  ctx.translate(-FEATHER_OFF / k, 0);
  ctx.fill(path, 'evenodd');
  ctx.restore();
}

// Percorso di un lago (in cache sull'elemento): i laghi si disegnano uno per uno, così quelli fuori dalla regione si saltano.
function lakePath(lake) {
  return lake.path ?? (lake.path = featurePath(lake.feature));
}

// Fiumi raggruppati per spessore (i grandi sopra ai piccoli) per ciascuna soglia di densità, a blocchi spaziali; i tratti dentro i laghi si escludono.
function riverGroups(water, rankLimit) {
  water.groups ??= new Map();
  if (water.groups.has(rankLimit)) return water.groups.get(rankLimit);
  const byWidth = new Map();
  for (const l of water.lines) {
    if (l.rank > rankLimit || l.inLake) continue;
    if (!byWidth.has(l.width)) byWidth.set(l.width, []);
    const c = l.coords;
    byWidth.get(l.width).push({
      x0: l.bbox.x, y0: l.bbox.y, x1: l.bbox.x + l.bbox.w, y1: l.bbox.y + l.bbox.h, pts: c.length / 2,
      add: (p) => { p.moveTo(c[0], c[1]); for (let i = 2; i < c.length; i += 2) p.lineTo(c[i], c[i + 1]); },
    });
  }
  const groups = [...byWidth.entries()].sort((a, b) => a[0] - b[0]).map(([w, runs]) => [w, spatialChunks(runs, 4000)]);
  water.groups.set(rankLimit, groups);
  return groups;
}

// Testo del nome di una città: senza la sigla di sponda; la stella solo sulla capitale a nord; le altre parti di una capitale sono "<nome> sud".
function cityText(p) {
  const nome = p.name.replace(/ \(sponda [A-Z]\)$/, '').replace(/ \(città\)/, '');
  if (p.capital) return `★ ${nome}`;
  if (p.capitale && !/ (sud|nord|est|ovest)( \d+)?$/.test(nome)) return `${nome} sud`;
  return nome;
}

function fillOf(item, layer, control, resourceFills) {
  if (item.props.kind === 'citta') return COLORS.cityGrey; // centro urbano: grigio
  if (layer === 'resources') return resourceFills?.[item.props.id] ?? RESOURCE_NEUTRAL; // colore della risorsa; senza risorse neutro (nessuna cache: i dati arrivano dopo)
  const cache = item.fills ?? (item.fills = {});
  return cache[layer] ?? (cache[layer] = provinceFill(item.props, layer, control));
}

const STROKE_CHUNK = 60; // province per passo di tracciamento dei contorni
const LAKE_CHUNK = 60; // laghi per passo

/**
 * Disegna la scena nella tela `ctx` (grande quanto `region`, in pixel CSS rispetto allo schermo, per `dpr`) a passi:
 * è un generatore che cede il controllo dopo ogni passo (mare e riempimenti, gruppi di contorni, gruppi di bordi, laghi,
 * ogni spessore di fiumi), così chi lo guida può lasciare passare i tocchi tra un passo e l'altro. Un ridisegno completo
 * costa da centinaia di ms a secondi sul telefono: in un solo compito bloccherebbe i gesti.
 * p: { model, lod, borders, water, view, vb, lay, dpr, region, layer, nationControl, showRivers, copies, light }
 * light: versione leggera per i ridisegni a gesto in corso (solo mare e riempimenti delle province, senza contorni, bordi,
 * laghi e fiumi, che sono il grosso del costo): a gesto fermo si ridisegna sempre la scena completa.
 */
export function* renderBaseSteps(ctx, p) {
  const { model, lod, borders, water, view, vb, lay, dpr, region, layer, nationControl, showRivers, copies, trace, seas, selectedSeaId, light, transport, resourceFills, land } = p;
  // piastrella: trasformazione e riquadro di ritaglio già calcolati dal chiamante (sx = pixel CSS per unità a quel livello, tx/ty = origine
  // in pixel CSS rispetto alla tela, cull = riquadro in unità di mappa); view.k serve solo alle soglie di fiumi e simili
  const a = p.tile ? { sx: p.tile.sx, tx: p.tile.tx, ty: p.tile.ty } : affineOf(view, vb, lay);
  const level = lodLevelForScale(a.sx, CANVAS_LOD_TOLS);
  const cull = p.tile ? p.tile.cull : regionToUnits(view, vb, lay, region);
  const pad = 2 / a.sx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLORS.sea;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  // spigoli smussati e estremi netti: sulle linee sottili (0,6-3 px) non si vede la differenza dai tondi, ma la rasterizzazione costa circa
  // un quarto in meno per piastrella (misurato: 77 -> 58 ms a piastrella; le linee sono l'85 % del costo, i riempimenti il 10 %)
  ctx.lineJoin = 'bevel';
  ctx.lineCap = 'butt';
  for (const off of copies) {
    const place = () => ctx.setTransform(dpr * a.sx, 0, 0, dpr * a.sx, dpr * (a.tx - region.x + a.sx * off), dpr * (a.ty - region.y));
    place();
    const x0 = cull.x0 - off - pad;
    const x1 = cull.x1 - off + pad;
    const y0 = cull.y0 - pad;
    const y1 = cull.y1 + pad;
    const hits = (b) => !(b.x0 > x1 || b.x1 < x0 || b.y0 > y1 || b.y1 < y0);
    if (seas) {
      // sotto le province: la terra copre i bordi imprecisi. Un errore qui non deve mai bloccare la mappa.
      try { drawSeas(ctx, seas, selectedSeaId, a.sx, { x0, x1, y0, y1 }); } catch (e) { ctx.setLineDash([]); if (!seas.failed) { seas.failed = true; console.error('zone marittime non disegnate', e); } }
    }
    if (land) drawLandBase(ctx, land);
    const groups = new Map();
    const singles = []; // percorsi riempiti uno per uno (evenodd annulla le sovrapposizioni dello stesso colore)
    const visible = [];
    for (const it of model.items) {
      const b = it.bbox;
      if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
      const path = itemPath(model, lod, it, level);
      const col = fillOf(it, layer, nationControl, resourceFills);
      if (col === COLORS.cityGrey) singles.push(path); // zone urbane e province-città si sovrappongono: ognuna a parte
      else {
        let g = groups.get(col);
        if (!g) { g = new Path2D(); groups.set(col, g); }
        g.addPath(path);
      }
      if (!light) visible.push([it, path, col]);
    }
    trace?.('prep', ctx);
    for (const [col, g] of groups) { ctx.fillStyle = col; ctx.fill(g, 'evenodd'); }
    ctx.fillStyle = COLORS.cityGrey;
    for (const path of singles) ctx.fill(path, 'evenodd');
    trace?.('fill', ctx);
    yield 'fill';
    if (light) continue;
    // province sulla cucitura: un filo dello stesso colore contro i vuoti tra le due metà, come in SVG
    const seam = visible.filter(([it]) => it.hasSeam);
    if (seam.length) {
      ctx.lineWidth = 1 / a.sx;
      for (const [, path, col] of seam) { ctx.strokeStyle = col; ctx.stroke(path); }
    }
    // contorni delle province, a gruppi
    for (let i = 0; i < visible.length; i += STROKE_CHUNK) {
      const strokeAll = new Path2D();
      for (let j = i; j < Math.min(i + STROKE_CHUNK, visible.length); j += 1) {
        const [it, path] = visible[j];
        strokeAll.addPath(it.hasSeam ? seamStrokePath(model, it) : path);
      }
      ctx.lineWidth = 0.6 / a.sx;
      ctx.strokeStyle = COLORS.provStroke;
      ctx.stroke(strokeAll);
      yield 'stroke';
    }
    trace?.('stroke', ctx);
    if (borders) {
      for (const chunk of borderChunks(borders, level)) {
        if (!hits(chunk.bbox)) continue;
        ctx.lineWidth = 1.2 / a.sx;
        ctx.strokeStyle = COLORS.border;
        ctx.stroke(chunk.path);
        yield 'borders';
      }
      trace?.('borders', ctx);
    }
    if (showRivers && water) {
      const lakes = water.lakes.filter((l) => {
        const b = l.bbox;
        return !(b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0); // fuori dalla regione: niente da rasterizzare
      });
      for (let i = 0; i < lakes.length; i += LAKE_CHUNK) {
        ctx.fillStyle = COLORS.lakeFill;
        ctx.strokeStyle = COLORS.lakeStroke;
        ctx.lineWidth = 0.6 / a.sx;
        for (let j = i; j < Math.min(i + LAKE_CHUNK, lakes.length); j += 1) {
          const lp = lakePath(lakes[j]);
          ctx.fill(lp, 'evenodd');
          ctx.stroke(lp);
        }
        yield 'lakes';
      }
      trace?.('lakes', ctx);
      ctx.strokeStyle = COLORS.river;
      ctx.globalAlpha = riverOpacity(view.k);
      for (const [width, chunks] of riverGroups(water, riverRankLimit(view.k))) {
        ctx.strokeStyle = COLORS.river;
        ctx.lineWidth = (width * riverWidthScale(view.k)) / a.sx;
        for (const chunk of chunks) {
          if (!hits(chunk.bbox)) continue;
          ctx.stroke(chunk.path);
          yield 'rivers';
        }
      }
      ctx.globalAlpha = 1;
      trace?.('rivers', ctx);
    }
    // strade e ferrovie (spente di default; i ponti sono tratti della linea): sopra i fiumi
    if (transport) {
      drawTransport(ctx, transport, { sx: a.sx, k: view.k, cull: { x0, x1, y0, y1 } });
      trace?.('transport', ctx);
      yield 'transport';
    }
  }
}

/** Disegna la scena in un solo colpo (tutti i passi di renderBaseSteps di seguito). */
export function renderBase(ctx, p) {
  for (const step of renderBaseSteps(ctx, p)) void step;
}

/** Sovrapposizione: contorno della provincia selezionata e nomi, con la vista corrente (si ridisegna a ogni fotogramma del gesto). */
export function drawOverlay(ctx, p) {
  const { model, lod, view, vb, lay, dpr, selectedId, labels, copies, layer, provinceResources, provinceUnits, unitHits, seas, selectedSeaId } = p;
  const a = affineOf(view, vb, lay);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  // zona di mare selezionata (nella sovrapposizione: cambiare selezione non rifà la scena)
  const selSea = seas && selectedSeaId ? seas.zones.find((z) => z.id === selectedSeaId) : null;
  if (selSea) {
    ctx.lineJoin = 'round';
    ctx.fillStyle = COLORS.seaSelFill;
    ctx.strokeStyle = COLORS.seaSelStroke;
    ctx.lineWidth = 2 / a.sx;
    for (const off of copies) {
      ctx.setTransform(dpr * a.sx, 0, 0, dpr * a.sx, dpr * (a.tx + a.sx * off), dpr * a.ty);
      ctx.fill(zonePath(selSea), 'evenodd');
      ctx.stroke(zoneLinePath(selSea));
    }
  }
  const sel = selectedId ? model.byId.get(selectedId) : null;
  if (sel) {
    const level = lodLevelForScale(a.sx, CANVAS_LOD_TOLS);
    const path = sel.hasSeam ? seamStrokePath(model, sel) : itemPath(model, lod, sel, level);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = COLORS.outline;
    ctx.lineWidth = 2 / a.sx;
    for (const off of copies) {
      ctx.setTransform(dpr * a.sx, 0, 0, dpr * a.sx, dpr * (a.tx + a.sx * off), dpr * a.ty);
      ctx.stroke(path);
    }
  }
  // nomi delle città: le capitali (con la stella) da zoom medio, le altre città solo da vicino
  const cityBoxes = []; // riquadri dei nomi di città già scritti (pixel CSS)
  // livello Risorse: le icone vengono prima dei nomi, che le evitano (come per i nomi delle città)
  if (layer === 'resources' && provinceResources) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawProvinceResources(ctx, { items: model.items, byProvince: provinceResources, a, dpr, copies, boxes: cityBoxes, model });
  }
  // livello Esercito: segnalini delle unità (dislocazione derivata), prima dei nomi come le risorse
  if (unitHits) unitHits.length = 0;
  if (layer === 'army' && provinceUnits) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawProvinceUnits(ctx, { items: model.items, byProvince: provinceUnits, a, dpr, copies, boxes: cityBoxes, model, hits: unitHits });
  }
  const nomi = cityNamesAt(model.items, view.k);
  if (nomi.length) {
    ctx.font = `${CITY_NAME_PX}px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.cityLabelHalo;
    ctx.fillStyle = COLORS.cityLabel;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Regola dei nomi: prima le capitali, poi le città più grandi; un nome che toccherebbe uno già scritto si salta
    // (a zoom maggiore, con più spazio sullo schermo, ricompare). I nomi delle province che cadrebbero sotto un nome di
    // città si saltano più sotto: la città, sopra, è l'informazione più utile.
    const ordine = [...nomi].sort((x, y) => (Number(Boolean(y.props.capitale)) - Number(Boolean(x.props.capitale))) || ((y.props.areaKm2 ?? 0) - (x.props.areaKm2 ?? 0)) || (x.props.id < y.props.id ? -1 : 1));
    for (const it of ordine) {
      const b = it.bbox;
      const testo = cityText(it.props);
      const w = textWidth(ctx, '', testo, CITY_NAME_PX) + 4;
      const h = CITY_NAME_PX + 2;
      for (const off of copies) {
        const px = a.sx * (b.x + b.w / 2 + off) + a.tx;
        const py = a.sx * (b.y + b.h / 2) + a.ty;
        if (px < -w || py < -h || px > ctx.canvas.width / dpr + w || py > ctx.canvas.height / dpr + h) continue; // fuori schermo
        const box = [px - w / 2, py - h / 2, px + w / 2, py + h / 2];
        if (cityBoxes.some((o) => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1])) continue;
        cityBoxes.push(box);
        ctx.strokeText(testo, px, py);
        ctx.fillText(testo, px, py);
      }
    }
  }
  if (!labels || labels.length === 0) return;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const l of labels) {
    const st = LABEL_STYLE[l.kind] ?? LABEL_STYLE.prov;
    const px = a.sx * (l.x + l.off) + a.tx;
    const py = a.sx * l.y + a.ty;
    const fontPx = l.size * a.sx;
    if (cityBoxes.length) {
      const nl = (l.lines || [l.name]).length;
      const hw = (l.lineLengths ? Math.max(...l.lineLengths) : l.length) * a.sx / 2;
      const hh = (nl * fontPx * LINE_STEP) / 2;
      if (cityBoxes.some((o) => px - hw < o[2] && px + hw > o[0] && py - hh < o[3] && py + hh > o[1])) continue;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(px, py);
    if (l.angle) ctx.rotate((l.angle * Math.PI) / 180);
    ctx.font = `${st.font} ${fontPx}px ${FONT_FAMILY}`;
    const lines = l.lines || [l.name];
    const pitch = fontPx * LINE_STEP; // distanza fra le righe (solo nomi su più righe)
    ctx.lineWidth = 0.12 * fontPx;
    ctx.strokeStyle = st.halo;
    ctx.fillStyle = st.fill;
    for (let i = 0; i < lines.length; i += 1) {
      const text = lines[i];
      const dy = (i - (lines.length - 1) / 2) * pitch;
      const w = textWidth(ctx, st.font, text, fontPx);
      const target = (l.lineLengths ? l.lineLengths[i] : l.length) * a.sx; // larghezza imposta (come textLength in SVG)
      ctx.save();
      ctx.translate(0, dy);
      if (w > 0) ctx.scale(target / w, 1);
      ctx.strokeText(text, 0, 0);
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }
  }
}
