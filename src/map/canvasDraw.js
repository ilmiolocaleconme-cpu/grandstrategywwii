// Disegno su Canvas 2D (prototipo): scena (province, bordi, laghi, fiumi) e sovrapposizione (selezione, nomi).
// Usa Path2D e il contesto 2D: gira solo nel browser. La logica che si può provare senza browser sta in
// canvasModel.js e canvasView.js (testate in tests/canvas.test.js). Gli stessi colori e spessori di styles.css (.prov, .lake, .river, ...).

import { WORLD_W, provinceFill, riverRankLimit } from './geo.js';
import { CANVAS_LOD_TOLS } from './canvasModel.js';
import { LINE_STEP } from './labelfit.js';
import { affineOf, lodLevelForScale, regionToUnits } from './canvasView.js';

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
  label: '#d9d9d6',
  labelHalo: 'rgba(14, 18, 10, 0.65)',
  lakeLabel: '#dde3e8',
  lakeLabelHalo: 'rgba(10, 36, 60, 0.65)',
  seaFill: 'rgba(120, 190, 235, 0.07)',
  seaStroke: 'rgba(170, 215, 245, 0.45)',
  straitFill: 'rgba(255, 214, 120, 0.16)',
  straitStroke: 'rgba(255, 214, 120, 0.7)',
  seaSelFill: 'rgba(255, 214, 120, 0.28)',
  seaSelStroke: '#ffd678',
  seaLabel: '#bcd9ee',
  seaLabelHalo: 'rgba(10, 36, 60, 0.7)',
};
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

function borderPath(borders, level) {
  const cache = borders.paths ?? (borders.paths = [null, null, null, null]);
  const lv = level < 3 && borders.levels?.[level] ? level : 3;
  if (cache[lv]) return cache[lv];
  const src = lv === 3 ? borders : borders.levels[lv];
  const p = new Path2D();
  for (let k = 0; k + 1 < src.runStarts.length; k += 1) {
    const s = src.runStarts[k];
    const e = src.runStarts[k + 1];
    if (e - s < 2) continue;
    p.moveTo(src.points[2 * s], src.points[2 * s + 1]);
    for (let i = s + 1; i < e; i += 1) p.lineTo(src.points[2 * i], src.points[2 * i + 1]);
  }
  cache[lv] = p;
  return p;
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

function seaGroups(seas) {
  if (seas.groups) return seas.groups;
  const open = new Path2D();
  const strait = new Path2D();
  for (const z of seas.zones) (z.kind === 'strait' || z.kind === 'approach' ? strait : open).addPath(zonePath(z));
  seas.groups = { open, strait };
  return seas.groups;
}

function drawSeas(ctx, seas, selectedSeaId, sx) {
  const g = seaGroups(seas);
  ctx.setLineDash([4 / sx, 3 / sx]);
  ctx.lineWidth = 0.8 / sx;
  ctx.fillStyle = COLORS.seaFill; ctx.strokeStyle = COLORS.seaStroke;
  ctx.fill(g.open, 'evenodd'); ctx.stroke(g.open);
  ctx.fillStyle = COLORS.straitFill; ctx.strokeStyle = COLORS.straitStroke;
  ctx.fill(g.strait, 'evenodd'); ctx.stroke(g.strait);
  ctx.setLineDash([]);
  const sel = selectedSeaId ? seas.zones.find((z) => z.id === selectedSeaId) : null;
  if (sel) {
    ctx.fillStyle = COLORS.seaSelFill; ctx.strokeStyle = COLORS.seaSelStroke; ctx.lineWidth = 2 / sx;
    ctx.fill(zonePath(sel), 'evenodd'); ctx.stroke(zonePath(sel));
  }
}

function lakesPath(water) {
  if (!water.lakesPath) {
    const p = new Path2D();
    for (const l of water.lakes) p.addPath(featurePath(l.feature));
    water.lakesPath = p;
  }
  return water.lakesPath;
}

// Fiumi raggruppati per spessore (i grandi sopra ai piccoli) per ciascuna soglia di densità; i tratti dentro i laghi si escludono.
function riverGroups(water, rankLimit) {
  water.groups ??= new Map();
  if (water.groups.has(rankLimit)) return water.groups.get(rankLimit);
  const byWidth = new Map();
  for (const l of water.lines) {
    if (l.rank > rankLimit || l.inLake) continue;
    if (!byWidth.has(l.width)) byWidth.set(l.width, new Path2D());
    const p = byWidth.get(l.width);
    const c = l.coords;
    p.moveTo(c[0], c[1]);
    for (let i = 2; i < c.length; i += 2) p.lineTo(c[i], c[i + 1]);
  }
  const groups = [...byWidth.entries()].sort((a, b) => a[0] - b[0]);
  water.groups.set(rankLimit, groups);
  return groups;
}

function fillOf(item, layer, control) {
  const cache = item.fills ?? (item.fills = {});
  return cache[layer] ?? (cache[layer] = provinceFill(item.props, layer, control));
}

/**
 * Disegna la scena nella tela `ctx` (grande quanto `region`, in pixel CSS rispetto allo schermo, per `dpr`).
 * p: { model, lod, borders, water, view, vb, lay, dpr, region, layer, nationControl, showRivers, selectedRiverId, copies }
 */
export function renderBase(ctx, p) {
  const { model, lod, borders, water, view, vb, lay, dpr, region, layer, nationControl, showRivers, selectedRiverId, copies, trace, seas, selectedSeaId } = p;
  const a = affineOf(view, vb, lay);
  const level = lodLevelForScale(a.sx, CANVAS_LOD_TOLS);
  const cull = regionToUnits(view, vb, lay, region);
  const pad = 2 / a.sx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COLORS.sea;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const off of copies) {
    ctx.setTransform(dpr * a.sx, 0, 0, dpr * a.sx, dpr * (a.tx - region.x + a.sx * off), dpr * (a.ty - region.y));
    const x0 = cull.x0 - off - pad;
    const x1 = cull.x1 - off + pad;
    const y0 = cull.y0 - pad;
    const y1 = cull.y1 + pad;
    if (seas) drawSeas(ctx, seas, selectedSeaId, a.sx); // sotto le province: la terra copre i bordi imprecisi
    const groups = new Map();
    const strokeAll = new Path2D();
    const seamFills = [];
    for (const it of model.items) {
      const b = it.bbox;
      if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
      const path = itemPath(model, lod, it, level);
      const col = fillOf(it, layer, nationControl);
      let g = groups.get(col);
      if (!g) { g = new Path2D(); groups.set(col, g); }
      g.addPath(path);
      if (it.hasSeam) { strokeAll.addPath(seamStrokePath(model, it)); seamFills.push([col, path]); } else strokeAll.addPath(path);
    }
    trace?.('prep', ctx);
    for (const [col, g] of groups) { ctx.fillStyle = col; ctx.fill(g, 'evenodd'); }
    trace?.('fill', ctx);
    // province sulla cucitura: un filo dello stesso colore contro i vuoti tra le due metà, come in SVG
    ctx.lineWidth = 1 / a.sx;
    for (const [col, path] of seamFills) { ctx.strokeStyle = col; ctx.stroke(path); }
    ctx.lineWidth = 0.6 / a.sx;
    ctx.strokeStyle = COLORS.provStroke;
    ctx.stroke(strokeAll);
    trace?.('stroke', ctx);
    if (borders) {
      ctx.lineWidth = 1.2 / a.sx;
      ctx.strokeStyle = COLORS.border;
      ctx.stroke(borderPath(borders, level));
      trace?.('borders', ctx);
    }
    if (showRivers && water) {
      ctx.fillStyle = COLORS.lakeFill;
      ctx.strokeStyle = COLORS.lakeStroke;
      ctx.lineWidth = 0.6 / a.sx;
      const lp = lakesPath(water);
      ctx.fill(lp, 'evenodd');
      ctx.stroke(lp);
      ctx.strokeStyle = COLORS.river;
      trace?.('lakes', ctx);
      for (const [width, path] of riverGroups(water, riverRankLimit(view.k))) { ctx.lineWidth = width / a.sx; ctx.stroke(path); }
      trace?.('rivers', ctx);
      if (selectedRiverId) {
        for (const l of water.lines) {
          if (l.riverId !== selectedRiverId) continue;
          const c = l.coords;
          const path = new Path2D();
          path.moveTo(c[0], c[1]);
          for (let i = 2; i < c.length; i += 2) path.lineTo(c[i], c[i + 1]);
          ctx.lineWidth = (l.width + 1.5) / a.sx;
          ctx.setLineDash(l.inLake ? [2, 3] : []);
          ctx.globalAlpha = l.inLake ? 0.7 : 1;
          ctx.stroke(path);
        }
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
    }
  }
}

/** Sovrapposizione: contorno della provincia selezionata e nomi, con la vista corrente (si ridisegna a ogni fotogramma del gesto). */
export function drawOverlay(ctx, p) {
  const { model, lod, view, vb, lay, dpr, selectedId, labels, copies, seaNames } = p;
  const a = affineOf(view, vb, lay);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
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
  if (seaNames && seaNames.length > 0) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const z of seaNames) {
      const fontPx = z.kind === 'ocean' ? 14 : 10;
      ctx.font = `italic 500 ${fontPx}px ${FONT_FAMILY}`;
      ctx.lineWidth = 0.2 * fontPx;
      ctx.strokeStyle = COLORS.seaLabelHalo;
      ctx.fillStyle = COLORS.seaLabel;
      for (const off of copies) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const x = a.sx * (z.seed[0] * COS0 + off) + a.tx;
        const y = a.sx * -z.seed[1] + a.ty;
        ctx.strokeText(z.name, x, y);
        ctx.fillText(z.name, x, y);
      }
    }
  }
  if (!labels || labels.length === 0) return;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const l of labels) {
    const lake = l.kind === 'lake';
    const px = a.sx * (l.x + l.off) + a.tx;
    const py = a.sx * l.y + a.ty;
    const fontPx = l.size * a.sx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.translate(px, py);
    if (l.angle) ctx.rotate((l.angle * Math.PI) / 180);
    ctx.font = `${lake ? 'italic 500' : '600'} ${fontPx}px ${FONT_FAMILY}`;
    const lines = l.lines || [l.name];
    const pitch = fontPx * LINE_STEP; // distanza fra le righe (solo nomi su più righe)
    ctx.lineWidth = 0.2 * fontPx;
    ctx.strokeStyle = lake ? COLORS.lakeLabelHalo : COLORS.labelHalo;
    ctx.fillStyle = lake ? COLORS.lakeLabel : COLORS.label;
    for (let i = 0; i < lines.length; i += 1) {
      const text = lines[i];
      const dy = (i - (lines.length - 1) / 2) * pitch;
      const w = ctx.measureText(text).width;
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
