// Livello Porti: un distintivo con un'àncora SUL PORTO (nel punto della città portuale, vicino alla costa), con il nome accanto.
// La dimensione del distintivo dice il livello (locale 22 px, regionale 28 px, grande 34 px). Nessuna linea di collegamento.
// Posizione: punto della zona urbana della città portuale (stesso dato della città sulla mappa); nei dati non esiste la posizione del molo.
// La parte di calcolo (portPins, pinSpec) è pura e testata; il disegno gira solo nel browser (Canvas 2D).
// Dati: data/ports/ports_1936.json + state.ports (costruzioni e miglioramenti); nessuna posizione di molo o banchina nei dati.
import { anchorOf } from './canvasModel.js';
import { portLevelIn } from '../game/portsState.js';
import { CAPITAL_NAME_ZOOM } from './citta.js';
import { ICONS } from './portIconShapes.js';

export const PORT_DIAMETER = Object.freeze({ 1: 22, 2: 28, 3: 34 });
export const PORT_COLOR = '#14407a'; // blu navale: non coincide con i colori delle risorse
export const PORT_NAME_ZOOM = CAPITAL_NAME_ZOOM; // sotto questo zoom restano solo le icone (mappa leggera)
export const MAX_NAME_CHARS = 16;
const NAME_PX = 11;
export const YARD_COLOR = '#7a4a14'; // bruno: cantiere navale
export const YARD_DIAMETER = 24;
export const SHIPYARD_ID = 'FCT-SHIPYARD';
const OUTLINE = 'rgba(20, 20, 20, 0.75)';

/**
 * Porti con livello ≥ 1 come elenco piatto: [{ cittaId, name, province, level }], il più alto per primo (poi per nome).
 * ports: { coastal (cittaId → { name, parentProvince }), base (ports_1936.json) }; state: stato di partita o null (= porti del 1936).
 */
export function portPins(ports, state) {
  const out = [];
  if (!ports?.coastal) return out;
  for (const [cittaId, c] of Object.entries(ports.coastal)) {
    const level = portLevelIn(state, ports.base, cittaId);
    if (level >= 1) out.push({ cittaId, name: c.name, province: c.parentProvince, level });
  }
  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return out.sort((x, y) => (y.level - x.level) || cmp(x.name, y.name) || cmp(x.cittaId, y.cittaId));
}

/**
 * Cantieri navali costruiti (state.nations[*].facilities di tipo FCT-SHIPYARD con provinceId), uno per provincia: [{ provinceId, cittaId, name, count }].
 * La posizione è quella del porto principale della provincia (livello più alto); senza porti, della prima città costiera. Province senza coste: nessun segno.
 * Nei dati non esiste la posizione del cantiere dentro la provincia: è un'approssimazione.
 */
export function shipyardPins(ports, state) {
  const counts = new Map();
  for (const n of Object.values(state?.nations ?? {})) {
    for (const f of n.facilities ?? []) if (f.type === SHIPYARD_ID && typeof f.provinceId === 'string') counts.set(f.provinceId, (counts.get(f.provinceId) ?? 0) + 1);
  }
  if (!counts.size || !ports?.coastal) return [];
  const pins = portPins(ports, state);
  const out = [];
  for (const [provinceId, count] of [...counts].sort()) {
    const host = pins.find((p) => p.province === provinceId)
      ?? Object.entries(ports.coastal).filter(([, c]) => c.parentProvince === provinceId).sort(([a], [b]) => (a < b ? -1 : 1)).map(([cittaId, c]) => ({ cittaId, name: c.name }))[0];
    if (host) out.push({ provinceId, cittaId: host.cittaId, name: host.name, count });
  }
  return out;
}

/** Nome accorciato per la mappa (al massimo `max` caratteri, con «…»). */
export function shortName(name, max = MAX_NAME_CHARS) {
  const s = String(name ?? '');
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

/** Descrizione del distintivo di un porto: { level, diameter, label, title }. */
export function pinSpec(p) {
  return { level: p.level, diameter: PORT_DIAMETER[p.level] ?? PORT_DIAMETER[1], label: shortName(p.name), title: `${p.name} (livello ${p.level})` };
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

/** Disegna il glifo di un'icona (ICONS[nome]) in bianco, centrato in (x, y), a contorno. */
function drawGlyph(ctx, name, x, y, size) {
  if (typeof Path2D === 'undefined') return; // ambiente senza Canvas reale (test): niente glifo
  const def = ICONS[name];
  const s = size / 64;
  ctx.save();
  ctx.translate(x - 32 * s, y - 32 * s);
  ctx.scale(s, s);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const d of [...def.shapes, ...def.always, ...def.lines, ...(def.wave ? [def.wave] : [])]) ctx.stroke(new Path2D(d));
  ctx.restore();
}

function drawYardBadge(ctx, x, y) {
  const r = YARD_DIAMETER / 2;
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r + 1.2, 0, Math.PI * 2); ctx.fillStyle = OUTLINE; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = YARD_COLOR; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.restore();
  drawGlyph(ctx, 'cantiere-navale', x, y, YARD_DIAMETER * 0.78);
}

/**
 * Disegna i porti sulla mappa, uno per città portuale, nel punto della città. `pins`: elenco di portPins().
 * Priorità al livello più alto; un distintivo che toccherebbe un riquadro già scritto si salta. Il nome compare da zoom PORT_NAME_ZOOM
 * e solo se ha spazio. `hits`: aree toccabili (pixel CSS) { x0,y0,x1,y1,province,cittaId }, le legge il tocco della mappa.
 * ctx: (dpr, 0, 0, dpr, 0, 0).
 */
export function drawPorts(ctx, { pins, yards = [], a, dpr, copies, boxes, model, hits, k = 1 }) {
  if (!pins?.length && !yards?.length) return;
  const placed = []; // porti disegnati: { cittaId, px, py, r }
  const W = ctx.canvas.width / dpr;
  const H = ctx.canvas.height / dpr;
  const showName = k >= PORT_NAME_ZOOM;
  if (showName) ctx.font = `bold ${NAME_PX}px sans-serif`;
  for (const p of pins ?? []) {
    const city = model.byId.get(p.cittaId);
    if (!city) continue;
    const spec = pinSpec(p);
    const pt = anchorOf(model, city);
    const r = spec.diameter / 2;
    for (const off of copies) {
      const px = a.sx * (pt.x + off) + a.tx;
      const py = a.sx * pt.y + a.ty;
      if (px < -80 || py < -r || px > W + 80 || py > H + r) continue;
      const box = [px - r, py - r, px + r, py + r];
      if (overlaps(boxes, box)) continue;
      boxes.push(box);
      let x1 = px + r;
      let labelX = null;
      if (showName) {
        const w = ctx.measureText(spec.label).width + 4;
        const lbox = [px + r + 2, py - NAME_PX / 2 - 1, px + r + 2 + w, py + NAME_PX / 2 + 1];
        if (!overlaps(boxes, lbox)) { boxes.push(lbox); x1 = lbox[2]; labelX = lbox[0] + 1; }
      }
      drawBadge(ctx, px, py, spec.diameter);
      placed.push({ cittaId: p.cittaId, px, py, r });
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
      hits?.push({ x0: px - r, y0: py - r, x1, y1: py + r, province: p.province, cittaId: p.cittaId });
    }
  }
  // cantieri navali: attaccati in basso a sinistra del distintivo del porto (o, senza porto, sul punto della città costiera)
  for (const y of yards ?? []) {
    const city = model.byId.get(y.cittaId);
    if (!city) continue;
    const pt = anchorOf(model, city);
    const yr = YARD_DIAMETER / 2;
    for (const off of copies) {
      const base = placed.find((q) => q.cittaId === y.cittaId && Math.abs(q.px - (a.sx * (pt.x + off) + a.tx)) < 1);
      const cx = a.sx * (pt.x + off) + a.tx;
      const cy = a.sx * pt.y + a.ty;
      const x = base ? base.px - base.r * 0.85 : cx;
      const yy = base ? base.py + base.r * 0.95 : cy;
      if (x < -80 || yy < -yr || x > W + 80 || yy > H + yr) continue;
      const box = [x - yr, yy - yr, x + yr, yy + yr];
      if (!base && overlaps(boxes, box)) continue;
      if (!base) boxes.push(box);
      drawYardBadge(ctx, x, yy);
      hits?.push({ x0: x - yr, y0: yy - yr, x1: x + yr, y1: yy + yr, province: y.provinceId, cittaId: y.cittaId, yard: true });
    }
  }
}
