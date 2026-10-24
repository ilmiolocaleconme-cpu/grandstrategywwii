// Livello Risorse: distintivi tondi colorati (un colore per risorsa) con pittogramma bianco, sulle province che hanno risorse.
// Gira solo nel browser (Path2D, Canvas 2D). Pittogrammi disegnati in un riquadro 24 × 24; i metalli mostrano il simbolo chimico.
// Posizione: centro del riquadro della provincia (approssimazione: nessuna coordinata di giacimento nei dati, solo la provincia).
// L'icona della fabbrica non è usata qui: resta libera per le industrie.
import { RESOURCE_META } from '../data/provinceResources.js';

const ICON_PX = 24; // diametro del distintivo in pixel CSS
const GAP = 3;
const MAX_ICONS = 3; // oltre, un distintivo «+N»
const RING = '#ffffff';
const OUTLINE = 'rgba(20, 20, 20, 0.75)';

const SHAPES = (() => {
  if (typeof Path2D === 'undefined') return null;
  const p = (d) => new Path2D(d);
  return {
    // pompa petrolifera: base, cavalletto, bilanciere con testa a cavallo, contrappeso
    pumpjack: [p('M3 20h18v1.8H3z'), p('M9 20 11.2 9.5h1.6L15 20h-1.6L12 12.4 10.6 20z'), p('M3.2 9.6 16 5l.7 1.9L3.9 11.5z'), p('M15.6 4.6C19.6 4 20.6 7.6 20 10h-1.7c.3-1.6.1-2.7-1.3-2.5z'), p('M18.9 9.6h1V17h-1z'), p('M3 13.4h3.6V18H3z')],
    // goccia (gomma)
    drop: [p('M12 3C12 3 6.5 9.4 6.5 13.6a5.5 5.5 0 0 0 11 0C17.5 9.4 12 3 12 3z')],
    // spiga di frumento
    wheat: [p('M11.4 9h1.2v11h-1.2z'), p('M12 3 13.9 5.8 12 8.6 10.1 5.8z'), p('M9.6 7.4 11 10 9.6 12.5 7.6 10.3z'), p('M14.4 7.4l2 2.9-2 2.2L13 10z'), p('M9.6 12.6 11 15.2 9.6 17.6 7.6 15.5z'), p('M14.4 12.6l2 2.9-2 2.1L13 15.2z')],
    // provetta (mercurio, zolfo)
    flask: [p('M9.6 4h4.8v1.6h-.8v4l4.3 7.2a1.7 1.7 0 0 1-1.5 2.6H7.6a1.7 1.7 0 0 1-1.5-2.6l4.3-7.2v-4h-.8z')],
  };
})();

/** Due picconi incrociati (carbone), disegnati in codice con tratti arrotondati. */
function picks(ctx) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#fff';
  for (const m of [1, -1]) {
    ctx.save();
    if (m < 0) { ctx.translate(24, 0); ctx.scale(-1, 1); }
    ctx.lineWidth = 1.9;
    ctx.beginPath(); ctx.moveTo(4.5, 20.5); ctx.lineTo(17.5, 7.5); ctx.stroke(); // manico
    ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(11, 4.2); ctx.quadraticCurveTo(20.5, 2.8, 21, 12.5); ctx.stroke(); // testa
    ctx.restore();
  }
}

/** Trifoglio della radioattività (uranio), disegnato in codice. */
function radiation(ctx) {
  const rad = (d) => (d * Math.PI) / 180;
  ctx.fillStyle = '#fff';
  for (const a of [-90, 30, 150]) {
    ctx.beginPath();
    ctx.moveTo(12 + 3 * Math.cos(rad(a - 30)), 12 + 3 * Math.sin(rad(a - 30)));
    ctx.arc(12, 12, 8, rad(a - 30), rad(a + 30));
    ctx.lineTo(12 + 3 * Math.cos(rad(a + 30)), 12 + 3 * Math.sin(rad(a + 30)));
    ctx.arc(12, 12, 3, rad(a + 30), rad(a - 30), true);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(12, 12, 1.7, 0, Math.PI * 2);
  ctx.fill();
}

/** Disegna un distintivo con il centro in (cx, cy) pixel CSS e diametro `px`. ctx: trasformazione (dpr, 0, 0, dpr, 0, 0). */
export function drawResourceIcon(ctx, id, cx, cy, px = ICON_PX) {
  const meta = RESOURCE_META[id];
  if (!meta) return;
  ctx.save();
  ctx.translate(cx - px / 2, cy - px / 2);
  ctx.scale(px / 24, px / 24);
  // distintivo: contorno scuro sottile, anello bianco, disco del colore della risorsa
  ctx.beginPath(); ctx.arc(12, 12, 12, 0, Math.PI * 2); ctx.fillStyle = OUTLINE; ctx.fill();
  ctx.beginPath(); ctx.arc(12, 12, 11.2, 0, Math.PI * 2); ctx.fillStyle = RING; ctx.fill();
  ctx.beginPath(); ctx.arc(12, 12, 9.6, 0, Math.PI * 2); ctx.fillStyle = meta.color; ctx.fill();
  ctx.fillStyle = '#fff';
  // i pittogrammi stanno dentro il disco: ridotti attorno al centro (la radioattività e i simboli sono già della misura giusta)
  const small = () => { ctx.translate(12, 12); ctx.scale(0.74, 0.74); ctx.translate(-12, -12); };
  if (meta.icon === 'picks') { small(); picks(ctx); }
  else if (meta.icon === 'radiation') radiation(ctx);
  else if (meta.icon === 'symbol') {
    ctx.font = `bold ${meta.symbol.length > 1 ? 10.5 : 13}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(meta.symbol, 12, 12.6);
  } else if (SHAPES?.[meta.icon]) {
    small();
    for (const s of SHAPES[meta.icon]) ctx.fill(s);
  }
  ctx.restore();
}

/**
 * Disegna i distintivi delle risorse sulle province visibili. `byProvince`: { idElemento: [idRisorsa...] }.
 * Un riquadro che toccherebbe uno già disegnato si salta (a zoom maggiore compare); priorità alle province più grandi.
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
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#fff';
        ctx.fillStyle = '#111';
        const x = box[0] + ICON_PX / 2 + shown.length * (ICON_PX + GAP);
        ctx.strokeText(`+${extra}`, x, py);
        ctx.fillText(`+${extra}`, x, py);
        ctx.restore();
      }
    }
  }
}
