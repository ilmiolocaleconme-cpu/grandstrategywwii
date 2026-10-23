// Livello Risorse: pittogrammi neri (stile cartello) disegnati sulle province che hanno risorse. Gira solo nel browser (Path2D, Canvas 2D).
// Ogni icona è disegnata in un riquadro 24 × 24; il metallo si riconosce dal simbolo chimico scritto sopra la roccia.
// Posizione: centro del riquadro della provincia (approssimazione: nessuna coordinata di giacimento nei dati, solo la provincia).
import { RESOURCE_META } from '../data/provinceResources.js';

const ICON_PX = 20; // lato dell'icona in pixel CSS
const GAP = 2;
const MAX_ICONS = 3; // oltre, un distintivo «+N»
const HALO = 'rgba(247, 241, 222, 0.95)';

const SHAPES = (() => {
  if (typeof Path2D === 'undefined') return null;
  const p = (d) => new Path2D(d);
  return {
    // pompa petrolifera: base, cavalletto, bilanciere con testa a cavallo, contrappeso, asta
    pumpjack: [p('M2 21h20v2H2z'), p('M8.4 21 11 9h2l2.6 12h-1.8L12 12.4 10.2 21z'), p('M2.6 9.6 17 4.4l.9 2.3L3.5 11.9z'), p('M16.6 3.6C21.4 3.2 22 8 21.4 9.6h-1.8c.3-1.8.2-3.2-1.6-3.1z'), p('M19.8 9.4h1.1V19h-1.1z'), p('M2.5 13.6h4.2V19H2.5z'), p('M4.2 11.6h1V14h-1z'), p('M18.8 18.4h3v2.4h-3z')],
    // castelletto di miniera: ruota in alto, traliccio, base
    mine: [p('M12 2a3.2 3.2 0 1 1 0 6.4A3.2 3.2 0 0 1 12 2zm0 1.8a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z'), p('M5.5 21 10 8h1.6L7.7 21z'), p('M18.5 21 14 8h-1.6l3.9 13z'), p('M8 15.5h8v1.5H8z'), p('M2 21h20v2H2z'), p('M17 12l5 9h-2.2l-4.4-7.8z')],
    // roccia/cristallo
    ore: [p('M12 2.5 20.5 9 17 21H7L3.5 9z')],
    // fabbrica a shed con ciminiera
    factory: [p('M2 22V10.5l5 3.5v-3.5l5 3.5v-3.5l5 3.5V3h4v19z')],
    drop: [p('M12 1.5C12 1.5 5 9.5 5 15a7 7 0 0 0 14 0C19 9.5 12 1.5 12 1.5z')],
    // spiga
    wheat: [p('M11.3 8h1.4v14h-1.4z'), p('M12 1.5 14.4 5 12 8.5 9.6 5z'), p('M9.2 6.5 11 9.6 9.2 12.7 6.6 11z'), p('M14.8 6.5 17.4 11l-2.6 1.7L13 9.6z'), p('M9.2 12 11 15 9.2 18.2 6.6 16.4z'), p('M14.8 12l2.6 4.4-2.6 1.8L13 15z')],
    flask: [p('M9 2h6v2h-1v5l5.3 10.2A2 2 0 0 1 17.5 22h-11a2 2 0 0 1-1.8-2.8L10 9V4H9z')],
  };
})();

/** Trifoglio della radioattività (uranio), disegnato in codice. */
function radiation(ctx) {
  const rad = (d) => (d * Math.PI) / 180;
  for (const a of [-90, 30, 150]) {
    ctx.beginPath();
    ctx.moveTo(12 + 3.2 * Math.cos(rad(a - 30)), 12 + 3.2 * Math.sin(rad(a - 30)));
    ctx.arc(12, 12, 10.5, rad(a - 30), rad(a + 30));
    ctx.lineTo(12 + 3.2 * Math.cos(rad(a + 30)), 12 + 3.2 * Math.sin(rad(a + 30)));
    ctx.arc(12, 12, 3.2, rad(a + 30), rad(a - 30), true);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(12, 12, 2, 0, Math.PI * 2);
  ctx.fill();
}

/** Disegna un'icona con il centro in (cx, cy) pixel CSS, `px` pixel di lato. ctx deve avere la trasformazione (dpr, 0, 0, dpr, 0, 0). */
export function drawResourceIcon(ctx, id, cx, cy, px = ICON_PX) {
  const meta = RESOURCE_META[id];
  if (!meta) return;
  ctx.save();
  ctx.translate(cx - px / 2, cy - px / 2);
  ctx.scale(px / 24, px / 24);
  ctx.lineJoin = 'round';
  ctx.fillStyle = meta.color;
  ctx.strokeStyle = HALO;
  ctx.lineWidth = 3.2;
  if (meta.icon === 'radiation') {
    // alone: stessa forma, linea larga
    ctx.save(); ctx.lineWidth = 3.2; ctx.beginPath(); ctx.arc(12, 12, 10.5, 0, Math.PI * 2); ctx.fillStyle = HALO; ctx.fill(); ctx.restore();
    ctx.fillStyle = meta.color;
    radiation(ctx);
  } else if (SHAPES?.[meta.icon]) {
    for (const s of SHAPES[meta.icon]) ctx.stroke(s);
    for (const s of SHAPES[meta.icon]) ctx.fill(s);
  }
  if (meta.symbol && (meta.icon === 'ore' || meta.icon === 'factory' || meta.icon === 'flask')) {
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${meta.symbol.length > 1 ? 8 : 9}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(meta.symbol, 12, meta.icon === 'ore' ? 13 : meta.icon === 'flask' ? 16.5 : 16);
  }
  ctx.restore();
}

/**
 * Disegna le icone delle risorse sulle province visibili. `byProvince`: { idProvincia: [idRisorsa...] }.
 * Le icone con riquadro che toccherebbe uno già disegnato si saltano (a zoom maggiore compaiono); priorità alle province più grandi.
 * `boxes`: riquadri già occupati (pixel CSS), aggiornato con quelli nuovi. ctx: trasformazione (dpr, 0, 0, dpr, 0, 0).
 */
export function drawProvinceResources(ctx, { items, byProvince, a, dpr, copies, boxes }) {
  if (!byProvince) return;
  const W = ctx.canvas.width / dpr;
  const H = ctx.canvas.height / dpr;
  const cand = [];
  for (const it of items) {
    const list = byProvince[it.props.id];
    if (list) cand.push([it, list]);
  }
  cand.sort((x, y) => (y[0].areaKm2 ?? 0) - (x[0].areaKm2 ?? 0));
  for (const [it, list] of cand) {
    const b = it.bbox;
    const shown = list.slice(0, MAX_ICONS);
    const extra = list.length - shown.length;
    const n = shown.length + (extra > 0 ? 1 : 0);
    const w = n * ICON_PX + (n - 1) * GAP;
    for (const off of copies) {
      const px = a.sx * (b.x + b.w / 2 + off) + a.tx;
      const py = a.sx * (b.y + b.h / 2) + a.ty;
      if (px < -w || py < -ICON_PX || px > W + w || py > H + ICON_PX) continue;
      const box = [px - w / 2, py - ICON_PX / 2, px + w / 2, py + ICON_PX / 2];
      if (boxes.some((o) => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1])) continue;
      boxes.push(box);
      shown.forEach((id, i) => drawResourceIcon(ctx, id, box[0] + ICON_PX / 2 + i * (ICON_PX + GAP), py));
      if (extra > 0) {
        ctx.save();
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = HALO;
        ctx.fillStyle = '#111';
        const x = box[0] + ICON_PX / 2 + shown.length * (ICON_PX + GAP);
        ctx.strokeText(`+${extra}`, x, py);
        ctx.fillText(`+${extra}`, x, py);
        ctx.restore();
      }
    }
  }
}
