// Livello Ponti: segnalini sui ponti DISTRUTTI (rosso, croce) e IN RIPRISTINO (ambra, frecce circolari). I ponti integri non hanno segnalino (sono migliaia).
// Posizione: punto del ponte nei dati (links.json: dove il collegamento incrocia il fiume; ponti ipotetici: centro del confine fra le sponde).
// "Danneggiato" non è uno stato del modello: oggi un ponte è integro, distrutto o in ripristino. Il calcolo (bridgeMarks) è puro e testato; il disegno gira solo nel browser.
import { project } from './geo.js';
import { bridgeStatus } from '../rules/bridges.js';

export const BRIDGE_MARK_DIAMETER = 20;
export const BRIDGE_COLORS = Object.freeze({ destroyed: '#b3261e', repairing: '#c98a00' });
const OUTLINE = 'rgba(20, 20, 20, 0.75)';

/** Segnalini: [{ id, status, x, y, main, inferred, title }] per ogni ponte distrutto o in ripristino con posizione nota (x, y in unità di mappa). */
export function bridgeMarks(index, bs, nameOf = (x) => x) {
  if (!index || !bs) return [];
  const ids = [...new Set([...Object.keys(bs.destroyed ?? {}), ...Object.keys(bs.repairing ?? {})])].sort();
  const out = [];
  for (const id of ids) {
    const b = index.byId.get(id);
    if (!b || typeof b.lon !== 'number' || typeof b.lat !== 'number') continue;
    const status = bridgeStatus(bs, id);
    if (status === 'intact') continue;
    const [x, y] = project(b.lon, b.lat);
    const [pa, pb] = b.key.split('|');
    out.push({ id, status, x, y, main: b.main, inferred: b.inferred === true, title: `Ponte ${status === 'destroyed' ? 'distrutto' : 'in ripristino'}: ${nameOf(pa)} – ${nameOf(pb)}` });
  }
  return out;
}

function drawMark(ctx, x, y, d, status) {
  const r = d / 2;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r + 1.2, 0, Math.PI * 2); ctx.fillStyle = OUTLINE; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = BRIDGE_COLORS[status]; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.lineCap = 'round'; ctx.lineWidth = 2.4;
  const q = r * 0.42;
  if (status === 'destroyed') { // croce
    ctx.beginPath(); ctx.moveTo(x - q, y - q); ctx.lineTo(x + q, y + q); ctx.moveTo(x + q, y - q); ctx.lineTo(x - q, y + q); ctx.stroke();
  } else { // due archi con punta: ripristino in corso
    ctx.beginPath(); ctx.arc(x, y, q + 1, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, q + 1, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  }
  ctx.restore();
}

/** Disegna i segnalini; `boxes` (riquadri già occupati) li fa evitare dai nomi. ctx: (dpr, 0, 0, dpr, 0, 0). I ponti principali sono un po' più grandi. */
export function drawBridgeMarks(ctx, { marks, a, dpr, copies, boxes }) {
  if (!marks?.length) return;
  const W = ctx.canvas.width / dpr; const H = ctx.canvas.height / dpr;
  for (const m of marks) {
    const d = m.main ? BRIDGE_MARK_DIAMETER : BRIDGE_MARK_DIAMETER - 4; const r = d / 2;
    for (const off of copies) {
      const px = a.sx * (m.x + off) + a.tx; const py = a.sx * m.y + a.ty;
      if (px < -r || py < -r || px > W + r || py > H + r) continue;
      boxes.push([px - r, py - r, px + r, py + r]);
      drawMark(ctx, px, py, d, m.status);
    }
  }
}
