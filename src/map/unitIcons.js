// Livello Esercito: segnalini NATO (APP-6 semplificato: riquadro, simbolo d'arma, grado XX/XXX sopra) per nazione sulle province con unità.
// Posizione = provincia madre della DISLOCAZIONE DERIVATA (data/units/deployment_1936.json, base: ipotesi) — non è una posizione
// storica certa. Il segnalino mostra quante divisioni (numero grande) e, se ci sono, quanti comandi (corpi, Wehrkreis...) sono lì.
// La parte di calcolo (counterSpec) è pura e testata; il disegno gira solo nel browser (Canvas 2D).
import { anchorOf } from './canvasModel.js';
import { ownerColor } from './geo.js';

export const COUNTER_W = 40;
export const COUNTER_H = 26;
const GAP = 3;
const MAX_COUNTERS = 2; // oltre, un «+N»

/** Segnalino toccato in (x, y) pixel CSS, oppure null. I più recenti (sopra) vincono. */
export function hitAt(hits, x, y) {
  for (let i = (hits?.length ?? 0) - 1; i >= 0; i -= 1) {
    const h = hits[i];
    if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) return h;
  }
  return null;
}

const LEVEL_RANK = { district: 1, corps: 2, army: 3, army_group: 4, theater: 5, high_command: 5 };
const LEVEL_MARK = { division: 'XX', corps: 'XXX', district: 'XXX', army: 'XXXX', army_group: 'XXXXX', theater: 'XXXXXX', high_command: 'XXXXXX' };

/** Simbolo e grado del segnalino (simbologia NATO APP-6 semplificata): categoria più numerosa tra le divisioni; senza divisioni, il comando di grado più alto. */
export function symbolOf(group) {
  const divs = group.units.filter((u) => u.echelon === 'division');
  if (divs.length) {
    const n = {};
    for (const u of divs) n[u.category] = (n[u.category] ?? 0) + 1;
    const category = Object.keys(n).sort((a, b) => (n[b] - n[a]) || (a < b ? -1 : 1))[0];
    return { category, mark: LEVEL_MARK.division };
  }
  const top = [...group.units].sort((a, b) => (LEVEL_RANK[b.commandLevel] ?? 0) - (LEVEL_RANK[a.commandLevel] ?? 0))[0];
  return { category: 'command', mark: LEVEL_MARK[top?.commandLevel] ?? 'XXX' };
}

/** Testo e colore del segnalino di un gruppo { nation, divisions, commands, units }. */
export function counterSpec(group) {
  const main = group.divisions > 0 ? String(group.divisions) : `${group.commands}`;
  const sub = group.divisions > 0 && group.commands > 0 ? `+${group.commands}` : '';
  return { nation: group.nation, main, sub, ...symbolOf(group), color: ownerColor(group.nation, ''), title: `${group.nation}: ${group.divisions} div., ${group.commands} com.` };
}

/** Elenco dei segnalini di una provincia: ordinati per numero di unità, al massimo MAX_COUNTERS più un «+N» di nazioni in più. */
export function countersFor(groups) {
  const sorted = [...groups].sort((x, y) => (y.units.length - x.units.length) || (x.nation < y.nation ? -1 : 1));
  return { shown: sorted.slice(0, MAX_COUNTERS).map(counterSpec), extra: Math.max(0, sorted.length - MAX_COUNTERS) };
}

/** Simbolo interno nel riquadro (x0,y0,w,h): fanteria = croce, corazzata = ovale, cavalleria = diagonale, ecc. */
function drawSymbol(ctx, category, x0, y0, w, h) {
  const cx = x0 + w / 2;
  const cy = y0 + h / 2;
  const cross = () => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + w, y0 + h); ctx.moveTo(x0 + w, y0); ctx.lineTo(x0, y0 + h); ctx.stroke(); };
  const oval = () => { ctx.beginPath(); ctx.ellipse(cx, cy, w * 0.3, h * 0.28, 0, 0, Math.PI * 2); ctx.stroke(); };
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = '#111';
  if (category === 'infantry') cross();
  else if (category === 'armored') oval();
  else if (category === 'mechanized') { cross(); oval(); }
  else if (category === 'motorized') { cross(); ctx.beginPath(); ctx.moveTo(cx, y0); ctx.lineTo(cx, y0 + h); ctx.stroke(); }
  else if (category === 'cavalry') { ctx.beginPath(); ctx.moveTo(x0, y0 + h); ctx.lineTo(x0 + w, y0); ctx.stroke(); }
  else if (category === 'mountain') { cross(); ctx.beginPath(); ctx.moveTo(cx - 4, y0 + h - 2); ctx.lineTo(cx, y0 + h - 8); ctx.lineTo(cx + 4, y0 + h - 2); ctx.stroke(); }
  else if (category === 'airborne') { cross(); ctx.beginPath(); ctx.arc(cx, y0 + h + 1, 7, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
  // 'command': riquadro vuoto (solo grado)
}

function drawCounter(ctx, spec, x, y) {
  const w = COUNTER_W;
  const h = COUNTER_H;
  const x0 = x - w / 2;
  const y0 = y - h / 2;
  ctx.fillStyle = 'rgba(20,20,20,0.9)'; // alone scuro per la leggibilità sulla mappa
  ctx.fillRect(x0 - 2, y0 - 2, w + 4, h + 4);
  ctx.fillStyle = spec.color; // riquadro APP-6 (colore della nazione)
  ctx.fillRect(x0, y0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.78)'; // campo chiaro: il simbolo nero resta leggibile
  ctx.fillRect(x0 + 2, y0 + 2, w - 4, h - 4);
  ctx.save();
  ctx.beginPath(); ctx.rect(x0 + 2, y0 + 2, w - 4, h - 4); ctx.clip();
  drawSymbol(ctx, spec.category, x0 + 2, y0 + 2, w - 4, h - 4);
  ctx.restore();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  // indicatore di grado sopra il riquadro (XX = divisione, XXX = corpo, ...)
  ctx.font = 'bold 9px sans-serif';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#fff';
  ctx.fillStyle = '#111';
  ctx.strokeText(spec.mark, x, y0 - 6);
  ctx.fillText(spec.mark, x, y0 - 6);
  // quantità (e comandi) sul riquadro, in basso a destra
  ctx.font = 'bold 12px sans-serif';
  const label = spec.sub ? `${spec.main} ${spec.sub}` : spec.main;
  ctx.textAlign = 'right';
  ctx.strokeText(label, x0 + w - 3, y0 + h - 6);
  ctx.fillText(label, x0 + w - 3, y0 + h - 6);
}

/**
 * Disegna i segnalini sulle province visibili. `byProvince`: { idElemento: [gruppi] } (già ancorato a una sotto-provincia).
 * Un riquadro che toccherebbe uno già disegnato si salta; priorità alle province più grandi. ctx: (dpr, 0, 0, dpr, 0, 0).
 */
export function drawProvinceUnits(ctx, { items, byProvince, a, dpr, copies, boxes, model, hits }) {
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
      shown.forEach((spec, i) => {
        const cx = box[0] + COUNTER_W / 2 + i * (COUNTER_W + GAP);
        drawCounter(ctx, spec, cx, py);
        // area toccabile del segnalino (pixel CSS), con provincia madre e nazione: lo legge il tocco della mappa
        hits?.push({ x0: cx - COUNTER_W / 2 - 2, y0: py - COUNTER_H / 2 - 10, x1: cx + COUNTER_W / 2 + 2, y1: py + COUNTER_H / 2 + 2, province: it.props.parentProvince ?? it.props.id, nation: spec.nation });
      });
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
