// Livello Porti: un distintivo con un'àncora su ogni provincia con almeno un porto (livello ≥ 1), più il nome del porto principale accanto
// e una linea verso la città portuale vera. La dimensione del distintivo dice il livello (locale 22 px, regionale 28 px, grande 34 px).
// Posizione del distintivo: punto sulla terra della provincia (come le risorse); la città portuale sta sul punto della sua zona urbana.
// La parte di calcolo (portPinsByProvince, pinSpec) è pura e testata; il disegno gira solo nel browser (Canvas 2D).
// Dati: data/ports/ports_1936.json + state.ports (costruzioni e miglioramenti); nessuna posizione di molo o banchina nei dati.
import { anchorOf } from './canvasModel.js';
import { portLevelIn } from '../game/portsState.js';
import { CAPITAL_NAME_ZOOM } from './citta.js';

export const PORT_DIAMETER = Object.freeze({ 1: 22, 2: 28, 3: 34 });
export const PORT_COLOR = '#14407a'; // blu navale: non coincide con i colori delle risorse
export const PORT_NAME_ZOOM = CAPITAL_NAME_ZOOM; // sotto questo zoom restano solo le icone (mappa leggera)
export const MAX_NAME_CHARS = 16;
export const LINE_MIN_PX = 6; // linea più corta: la città è praticamente sotto il distintivo
export const LINE_MAX_PX = 300; // linea più lunga: non si disegna (provincia enorme con la città lontana)
const NAME_PX = 11;
const DOT_R = 3.4;
const DOT_HIT = 9; // mezzo lato dell'area toccabile del puntino della città
const MAX_LINKS = 6;
const OUTLINE = 'rgba(20, 20, 20, 0.75)';

/**
 * Porti con livello ≥ 1 per provincia madre: { [provincia]: [{ cittaId, name, level }] }, il più alto per primo (poi per nome).
 * ports: { coastal (cittaId → { name, parentProvince }), base (ports_1936.json) }; state: stato di partita o null (= porti del 1936).
 */
export function portPinsByProvince(ports, state) {
  const out = {};
  if (!ports?.coastal) return out;
  for (const [cittaId, c] of Object.entries(ports.coastal)) {
    const level = portLevelIn(state, ports.base, cittaId);
    if (level < 1) continue;
    if (!out[c.parentProvince]) out[c.parentProvince] = [];
    out[c.parentProvince].push({ cittaId, name: c.name, level });
  }
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  for (const list of Object.values(out)) list.sort((x, y) => (y.level - x.level) || cmp(x.name, y.name) || cmp(x.cittaId, y.cittaId));
  return out;
}

/** Nome accorciato per la mappa (al massimo `max` caratteri, con «…»). */
export function shortName(name, max = MAX_NAME_CHARS) {
  const s = String(name ?? '');
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

/** Descrizione del distintivo di una provincia (lista già ordinata da portPinsByProvince): { main, level, diameter, extra, label, title }. */
export function pinSpec(list) {
  const main = list[0];
  const extra = list.length - 1;
  return {
    main,
    level: main.level,
    diameter: PORT_DIAMETER[main.level] ?? PORT_DIAMETER[1],
    extra,
    label: extra > 0 ? `${shortName(main.name)} +${extra}` : shortName(main.name),
    title: list.map((p) => `${p.name} (livello ${p.level})`).join(', '),
  };
}

const overlaps = (boxes, b) => boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]);

/** Àncora disegnata in un riquadro 24 × 24 (anello, fuso, traversa, braccia con punte). */
function anchorShape(ctx) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2.1;
  ctx.beginPath(); ctx.arc(12, 5, 2.2, 0, Math.PI * 2); ctx.stroke(); // anello
  ctx.beginPath(); ctx.moveTo(12, 7.2); ctx.lineTo(12, 19.8); ctx.stroke(); // fuso
  ctx.beginPath(); ctx.moveTo(8.4, 10.4); ctx.lineTo(15.6, 10.4); ctx.stroke(); // traversa
  ctx.beginPath(); ctx.arc(12, 12.6, 7.4, Math.PI * 0.17, Math.PI * 0.83); ctx.stroke(); // braccia
  ctx.beginPath(); ctx.moveTo(5.6, 16.3); ctx.lineTo(3.7, 14.6); ctx.moveTo(18.4, 16.3); ctx.lineTo(20.3, 14.6); ctx.stroke(); // punte
}

function drawBadge(ctx, x, y, d) {
  const r = d / 2;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r + 1.2, 0, Math.PI * 2); ctx.fillStyle = OUTLINE; ctx.fill(); // alone scuro
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = PORT_COLOR; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); // anello bianco
  const s = (d * 0.62) / 24;
  ctx.translate(x - 12 * s, y - 12 * s);
  ctx.scale(s, s);
  anchorShape(ctx);
  ctx.restore();
}

function drawLink(ctx, px, py, r, cx, cy) {
  const dx = cx - px;
  const dy = cy - py;
  const d = Math.hypot(dx, dy);
  const sx = px + (dx / d) * r;
  const sy = py + (dy / d) * r;
  ctx.save();
  ctx.lineCap = 'round';
  for (const [w, c] of [[4, 'rgba(255,255,255,0.85)'], [1.6, PORT_COLOR]]) { // alone bianco sotto, linea blu sopra
    ctx.lineWidth = w; ctx.strokeStyle = c;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(cx, cy); ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(cx, cy, DOT_R, 0, Math.PI * 2); ctx.fillStyle = PORT_COLOR; ctx.fill(); // puntino sulla città portuale
  ctx.lineWidth = 1.8; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.restore();
}

/**
 * Disegna i porti sulle province visibili. `byProvince`: { idElemento: [porti] } (già ancorato a una sotto-provincia da resolveResourceAnchors).
 * Priorità al porto di livello più alto, poi alla provincia più grande; un distintivo che toccherebbe un riquadro già scritto si salta.
 * Il nome compare da zoom PORT_NAME_ZOOM e solo se ha spazio. `hits`: aree toccabili (pixel CSS), lo legge il tocco della mappa; i puntini
 * delle città si inseriscono prima del distintivo, che quindi ha la precedenza dove si sovrappongono. ctx: (dpr, 0, 0, dpr, 0, 0).
 */
export function drawProvincePorts(ctx, { items, byProvince, a, dpr, copies, boxes, model, hits, k = 1 }) {
  if (!byProvince) return;
  const W = ctx.canvas.width / dpr;
  const H = ctx.canvas.height / dpr;
  const cand = [];
  for (const it of items) {
    const list = byProvince[it.props.id];
    if (list?.length) cand.push([it, list, pinSpec(list)]);
  }
  cand.sort((x, y) => (y[2].level - x[2].level) || ((y[0].areaKm2 ?? 0) - (x[0].areaKm2 ?? 0)) || (x[0].props.id < y[0].props.id ? -1 : 1));
  const showName = k >= PORT_NAME_ZOOM;
  if (showName) { ctx.font = `bold ${NAME_PX}px sans-serif`; }
  for (const [it, list, spec] of cand) {
    const pt = anchorOf(model, it);
    const r = spec.diameter / 2;
    for (const off of copies) {
      const px = a.sx * (pt.x + off) + a.tx;
      const py = a.sx * pt.y + a.ty;
      if (px < -80 || py < -r || px > W + 80 || py > H + r) continue;
      const box = [px - r, py - r, px + r, py + r];
      if (overlaps(boxes, box)) continue;
      boxes.push(box);
      let x1 = px + r;
      let labelX = null; // ascissa del nome, se c'è spazio
      if (showName) {
        const w = ctx.measureText(spec.label).width + 4;
        const lbox = [px + r + 2, py - NAME_PX / 2 - 1, px + r + 2 + w, py + NAME_PX / 2 + 1];
        if (!overlaps(boxes, lbox)) { boxes.push(lbox); x1 = lbox[2]; labelX = lbox[0] + 1; }
      }
      // linee e puntini verso le città portuali vere (sotto il distintivo)
      list.slice(0, MAX_LINKS).forEach((p) => {
        const city = model.byId.get(p.cittaId);
        if (!city) return;
        const cp = anchorOf(model, city);
        const cx = a.sx * (cp.x + off) + a.tx;
        const cy = a.sx * cp.y + a.ty;
        const d = Math.hypot(cx - px, cy - py);
        if (d < r + LINE_MIN_PX || d > LINE_MAX_PX) return;
        drawLink(ctx, px, py, r, cx, cy);
        hits?.push({ x0: cx - DOT_HIT, y0: cy - DOT_HIT, x1: cx + DOT_HIT, y1: cy + DOT_HIT, province: it.props.id, cittaId: p.cittaId });
      });
      drawBadge(ctx, px, py, spec.diameter);
      if (labelX !== null) {
        ctx.save();
        ctx.font = `bold ${NAME_PX}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = '#fff';
        ctx.fillStyle = '#0d2a4f';
        ctx.strokeText(spec.label, labelX, py);
        ctx.fillText(spec.label, labelX, py);
        ctx.restore();
      }
      hits?.push({ x0: px - r, y0: py - r, x1, y1: py + r, province: it.props.id, cittaId: spec.main.cittaId });
    }
  }
}
