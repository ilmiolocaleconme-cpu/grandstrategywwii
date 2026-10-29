// Livello Esercito: segnalini rettangolari (stile cartografia militare) per nazione sulle province con unità.
// Posizione = provincia madre della DISLOCAZIONE DERIVATA (data/units/deployment_1936.json, base: ipotesi) — non è una posizione
// storica certa. Il segnalino mostra quante divisioni (numero grande) e, se ci sono, quanti comandi (corpi, Wehrkreis...) sono lì.
// La parte di calcolo (counterSpec) è pura e testata; il disegno gira solo nel browser (Canvas 2D).
import { anchorOf } from './canvasModel.js';
import { ownerColor } from './geo.js';

export const COUNTER_W = 38;
export const COUNTER_H = 24;
const GAP = 3;
const MAX_COUNTERS = 2; // oltre, un «+N»

/** Testo e colore del segnalino di un gruppo { nation, divisions, commands, units }. */
export function counterSpec(group) {
  const main = group.divisions > 0 ? String(group.divisions) : `${group.commands}c`;
  const sub = group.divisions > 0 && group.commands > 0 ? `+${group.commands}c` : '';
  return { nation: group.nation, main, sub, color: ownerColor(group.nation, ''), title: `${group.nation}: ${group.divisions} div., ${group.commands} com.` };
}

/** Elenco dei segnalini di una provincia: ordinati per numero di unità, al massimo MAX_COUNTERS più un «+N» di nazioni in più. */
export function countersFor(groups) {
  const sorted = [...groups].sort((x, y) => (y.units.length - x.units.length) || (x.nation < y.nation ? -1 : 1));
  return { shown: sorted.slice(0, MAX_COUNTERS).map(counterSpec), extra: Math.max(0, sorted.length - MAX_COUNTERS) };
}

function drawCounter(ctx, spec, x, y) {
  const x0 = x - COUNTER_W / 2;
  const y0 = y - COUNTER_H / 2;
  ctx.fillStyle = 'rgba(20,20,20,0.85)';
  ctx.fillRect(x0 - 1.5, y0 - 1.5, COUNTER_W + 3, COUNTER_H + 3);
  ctx.fillStyle = '#f4f1e6';
  ctx.fillRect(x0, y0, COUNTER_W, COUNTER_H);
  ctx.fillStyle = spec.color;
  ctx.fillRect(x0, y0, COUNTER_W, 5); // fascia del colore della nazione
  ctx.strokeStyle = 'rgba(20,20,20,0.55)'; // croce della fanteria
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0, y0 + 5); ctx.lineTo(x0 + COUNTER_W, y0 + COUNTER_H); ctx.moveTo(x0 + COUNTER_W, y0 + 5); ctx.lineTo(x0, y0 + COUNTER_H); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#f4f1e6';
  ctx.fillStyle = '#111';
  ctx.font = 'bold 13px sans-serif';
  ctx.strokeText(spec.main, x, y0 + 15);
  ctx.fillText(spec.main, x, y0 + 15);
  if (spec.sub) {
    ctx.font = 'bold 9px sans-serif';
    ctx.strokeText(spec.sub, x + 12, y0 + 19);
    ctx.fillText(spec.sub, x + 12, y0 + 19);
  }
}

/**
 * Disegna i segnalini sulle province visibili. `byProvince`: { idElemento: [gruppi] } (già ancorato a una sotto-provincia).
 * Un riquadro che toccherebbe uno già disegnato si salta; priorità alle province più grandi. ctx: (dpr, 0, 0, dpr, 0, 0).
 */
export function drawProvinceUnits(ctx, { items, byProvince, a, dpr, copies, boxes, model }) {
  if (!byProvince) return;
  const W = ctx.canvas.width / dpr;
  const H = ctx.canvas.height / dpr;
  const cand = [];
  for (const it of items) {
    const groups = byProvince[it.props.id];
    if (groups?.length) cand.push([it, groups]);
  }
  cand.sort((x, y) => (y[0].areaKm2 ?? 0) - (x[0].areaKm2 ?? 0));
  for (const [it, groups] of cand) {
    const pt = model ? anchorOf(model, it) : { x: it.bbox.x + it.bbox.w / 2, y: it.bbox.y + it.bbox.h / 2 };
    const { shown, extra } = countersFor(groups);
    const n = shown.length + (extra > 0 ? 1 : 0);
    const w = n * COUNTER_W + (n - 1) * GAP;
    for (const off of copies) {
      const px = a.sx * (pt.x + off) + a.tx;
      const py = a.sx * pt.y + a.ty;
      if (px < -w || py < -COUNTER_H || px > W + w || py > H + COUNTER_H) continue;
      const box = [px - w / 2, py - COUNTER_H / 2, px + w / 2, py + COUNTER_H / 2];
      if (boxes.some((o) => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1])) continue;
      boxes.push(box);
      shown.forEach((spec, i) => drawCounter(ctx, spec, box[0] + COUNTER_W / 2 + i * (COUNTER_W + GAP), py));
      if (extra > 0) {
        ctx.save();
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#fff';
        ctx.fillStyle = '#111';
        const x = box[0] + COUNTER_W / 2 + shown.length * (COUNTER_W + GAP);
        ctx.strokeText(`+${extra}`, x, py);
        ctx.fillText(`+${extra}`, x, py);
        ctx.restore();
      }
    }
  }
}
