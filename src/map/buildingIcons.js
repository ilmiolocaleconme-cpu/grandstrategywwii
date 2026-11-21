// Opzione «Edifici»: distintivi QUADRATI con gli angoli arrotondati (le risorse sono tonde, così non si confondono), un colore per
// categoria e un pittogramma bianco disegnato in un riquadro 24 × 24. Un lavoro in corso ha il distintivo sbiadito, il bordo
// tratteggiato e un anello d'ottone che si riempie con l'avanzamento. Oltre MAX_ICONS distintivi, «+N».
// Gira solo nel browser (Path2D, Canvas 2D). Dati: rules/mapBuildings.js (buildingsByProvince → resolveBuildingAnchors).
import { anchorOf } from './canvasModel.js';

const ICON_PX = 22; // lato del distintivo in pixel CSS
const GAP = 3;
const MAX_ICONS = 3;
const OUTLINE = 'rgba(20, 20, 20, 0.8)';
const JOB_RING = '#e0a526';
const JOB_TRACK = 'rgba(20, 20, 20, 0.55)';

/** Colore del distintivo per categoria (BUILDING_KINDS). */
export const BUILDING_COLOR = Object.freeze({
  barracks: '#6f6236', hospital: '#c62828', power: '#c98a00', hydro: '#1f6fb2', arms: '#8b2b2b', vehicles: '#55652c',
  aircraft: '#2b5c8b', steel: '#5c6168', aluminium: '#7d8b9b', refinery: '#333333', chemical: '#6f4596', industry: '#46525e',
  food: '#6b8a2a', mine: '#5b4636', port: '#1d4f7a', other: '#666666',
});

const SHAPES = (() => {
  if (typeof Path2D === 'undefined') return null;
  const p = (d) => new Path2D(d);
  return {
    barracks: [p('M4 20V11l8-4.5 8 4.5v9z'), p('M11.3 2h1.4v5h-1.4z'), p('M12.7 2l5 1.6-5 1.6z')], // camerata con la bandiera
    hospital: [p('M9.5 4h5v5.5H20v5h-5.5V20h-5v-5.5H4v-5h5.5z')], // croce
    power: [p('M13.5 2 5.5 13.5h5L9.5 22l9-12.5h-5.2z')], // fulmine
    hydro: [p('M13.2 2 7 11h4l-1 6.5 7-9.5h-4z'), p('M3 18.2c2 0 2-1.4 4.5-1.4s2.5 1.4 4.5 1.4 2-1.4 4.5-1.4 2.5 1.4 4.5 1.4v1.8c-2 0-2-1.4-4.5-1.4S14 20 12 20s-2-1.4-4.5-1.4S5 20 3 20z')],
    arms: [p('M9 21V10.5L12 3l3 7.5V21z'), p('M8 16h8v1.6H8z')], // proiettile d'artiglieria
    vehicles: [p('M3 14h18l-2 5H5z'), p('M7 10h8v4H7z'), p('M14.5 11h7v1.6h-7z')], // carro di profilo
    aircraft: [p('M12 2.5l1.3 6.5 8 3v2l-8-1.5-.5 5 2.7 1.8V21L12 20l-3.5 1v-1.7l2.7-1.8-.5-5-8 1.5v-2l8-3z')], // aereo dall'alto
    steel: [p('M3 21v-7h5l-1.5-7h4L9 14h12v7z'), p('M15 4h2.5v10H15z')], // altoforno e ciminiera
    aluminium: [p('M3 20l2-4h6l2 4z'), p('M11 20l2-4h6l2 4z'), p('M7 15l2-4h6l2 4z')], // lingotti
    refinery: [p('M4 21V9.5a2 2 0 0 1 4 0V21z'), p('M10 21V5a2 2 0 0 1 4 0v16z'), p('M16 21v-8a2 2 0 0 1 4 0v8z')], // colonne
    chemical: [p('M9.6 3h4.8v1.6h-.8v4.2l4.6 8a1.8 1.8 0 0 1-1.6 2.7H7.4a1.8 1.8 0 0 1-1.6-2.7l4.6-8V4.6h-.8z')], // provetta
    industry: [p('M3 21V11l4.5 3v-3l4.5 3v-3l4.5 3V4h3.5v17z')], // capannone a denti di sega
    food: [p('M4 21V11l5-4 5 4v10z'), p('M15 21V8a2.5 2.5 0 0 1 5 0v13z')], // fienile e silo
    port: [p('M11.2 5.5h1.6V20h-1.6z'), p('M12 2a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm0 1.2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6z'), p('M7.5 8h9v1.5h-9z'), p('M4 13.5h2a6 6 0 0 0 12 0h2a8 8 0 0 1-16 0z')], // àncora
    other: [p('M12 6a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z')],
  };
})();

/** Castello di miniera: cavalletto e ruota (disegnato in codice). */
function headframe(ctx) {
  ctx.strokeStyle = '#fff'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(5, 21); ctx.lineTo(10, 7); ctx.lineTo(15, 21); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(10, 7); ctx.lineTo(20, 15); ctx.stroke();
  ctx.lineWidth = 1.8; ctx.beginPath(); ctx.arc(10, 6, 3.2, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.fillRect(3, 20, 18, 1.8);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
}

/** Un distintivo con il centro in (cx, cy) pixel CSS. e: { kind, n, job? }. ctx: trasformazione (dpr, 0, 0, dpr, 0, 0). */
export function drawBuildingIcon(ctx, e, cx, cy, px = ICON_PX) {
  const color = BUILDING_COLOR[e.kind] ?? BUILDING_COLOR.other;
  ctx.save();
  if (e.job) { // anello d'avanzamento: traccia scura, poi la parte fatta in ottone dall'alto in senso orario
    const R = px * 0.5 + 4;
    ctx.lineWidth = 3.5; ctx.strokeStyle = JOB_TRACK; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    if (e.job.frac > 0) { ctx.lineWidth = 3; ctx.strokeStyle = JOB_RING; ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * e.job.frac); ctx.stroke(); }
  }
  ctx.translate(cx - px / 2, cy - px / 2);
  ctx.scale(px / 24, px / 24);
  roundRect(ctx, 0, 0, 24, 24, 5); ctx.fillStyle = OUTLINE; ctx.fill();
  roundRect(ctx, 0.9, 0.9, 22.2, 22.2, 4.3); ctx.fillStyle = '#fff'; ctx.fill();
  roundRect(ctx, 2.4, 2.4, 19.2, 19.2, 3.2); ctx.fillStyle = color; if (e.job) ctx.globalAlpha = 0.6; ctx.fill(); ctx.globalAlpha = 1;
  if (e.job) { ctx.setLineDash([2.4, 2]); ctx.lineWidth = 1.4; ctx.strokeStyle = '#111'; roundRect(ctx, 0.9, 0.9, 22.2, 22.2, 4.3); ctx.stroke(); ctx.setLineDash([]); }
  ctx.translate(12, 12); ctx.scale(0.72, 0.72); ctx.translate(-12, -12);
  ctx.fillStyle = '#fff';
  if (e.kind === 'mine') headframe(ctx);
  else for (const s of SHAPES?.[e.kind] ?? SHAPES?.other ?? []) ctx.fill(s);
  ctx.restore();
  if (!e.job && e.n > 1) { // quanti (o livelli): piccola targhetta scura in alto a destra
    ctx.save(); ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const t = String(e.n); const w = Math.max(11, ctx.measureText(t).width + 5);
    const x = cx + px / 2 - 3; const y = cy - px / 2 + 1;
    roundRect(ctx, x - w / 2, y - 6, w, 12, 3); ctx.fillStyle = '#111'; ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(t, x, y + 0.5); ctx.restore();
  }
}

/**
 * Disegna gli edifici sulle province visibili, sotto il punto della provincia (le risorse e le unità stanno sul punto).
 * byProvince: { idElemento: [ { kind, n, job? } ] } già con i lavori in cima. Priorità: province con lavori in corso, poi le più grandi.
 * Un gruppo che toccherebbe un riquadro già disegnato si salta (ingrandendo compare). boxes: riquadri occupati (pixel CSS).
 */
export function drawProvinceBuildings(ctx, { items, byProvince, a, dpr, copies, boxes, model }) {
  if (!byProvince) return;
  const W = ctx.canvas.width / dpr;
  const H = ctx.canvas.height / dpr;
  const cand = [];
  for (const it of items) { const list = byProvince[it.props.id]; if (list?.length) cand.push([it, list]); }
  cand.sort((x, y) => (Number(Boolean(y[1][0].job)) - Number(Boolean(x[1][0].job))) || ((y[0].areaKm2 ?? 0) - (x[0].areaKm2 ?? 0)));
  const DY = ICON_PX + 6; // sotto il segnalino delle unità e il distintivo delle risorse
  for (const [it, list] of cand) {
    const pt = model ? anchorOf(model, it) : { x: it.bbox.x + it.bbox.w / 2, y: it.bbox.y + it.bbox.h / 2 };
    const shown = list.length > MAX_ICONS ? list.slice(0, MAX_ICONS - 1) : list;
    const extra = list.length - shown.length;
    const n = shown.length + (extra > 0 ? 1 : 0);
    const w = n * ICON_PX + (n - 1) * GAP;
    for (const off of copies) {
      const px = a.sx * (pt.x + off) + a.tx;
      const py = a.sx * pt.y + a.ty + DY;
      if (px < -w || py < -ICON_PX || px > W + w || py > H + ICON_PX) continue;
      const box = [px - w / 2 - 4, py - ICON_PX / 2 - 4, px + w / 2 + 4, py + ICON_PX / 2 + 4];
      if (boxes.some((o) => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1])) continue;
      boxes.push(box);
      shown.forEach((e, i) => drawBuildingIcon(ctx, e, px - w / 2 + ICON_PX / 2 + i * (ICON_PX + GAP), py));
      if (extra > 0) {
        const x = px - w / 2 + ICON_PX / 2 + shown.length * (ICON_PX + GAP);
        ctx.save(); roundRect(ctx, x - ICON_PX / 2, py - ICON_PX / 2 + 2, ICON_PX, ICON_PX - 4, 4); ctx.fillStyle = 'rgba(17,17,17,.85)'; ctx.fill();
        ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'; ctx.fillText(`+${extra}`, x, py + 0.5); ctx.restore();
      }
    }
  }
}
