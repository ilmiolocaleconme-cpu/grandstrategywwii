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

/**
 * Testo e colore del segnalino di un gruppo { nation, divisions, commands, units }.
 * Con `farIds` (insieme di id di divisioni fuori portata dal comando) aggiunge `far` e `farCount`: serve alla luce sulla mappa.
 * Senza `farIds` il risultato è identico a prima (nessun campo in più).
 */
export function counterSpec(group, farIds) {
  const main = group.divisions > 0 ? String(group.divisions) : `${group.commands}`;
  const sub = group.divisions > 0 && group.commands > 0 ? `+${group.commands}` : '';
  const spec = { nation: group.nation, main, sub, ...symbolOf(group), color: ownerColor(group.nation, ''), title: `${group.nation}: ${group.divisions} div., ${group.commands} com.` };
  if (!farIds || farIds.size === 0) return spec;
  const farCount = group.units.filter((u) => u.echelon === 'division' && farIds.has(u.id)).length;
  return farCount > 0 ? { ...spec, far: true, farCount, title: `${spec.title}, ${farCount} fuori portata dal comando` } : spec;
}

/** Elenco dei segnalini di una provincia: ordinati per numero di unità, al massimo MAX_COUNTERS più un «+N» di nazioni in più. */
export function countersFor(groups, farIds) {
  const sorted = [...groups].sort((x, y) => (y.units.length - x.units.length) || (x.nation < y.nation ? -1 : 1));
  return { shown: sorted.slice(0, MAX_COUNTERS).map((g) => counterSpec(g, farIds)), extra: Math.max(0, sorted.length - MAX_COUNTERS) };
}

/**
 * Estremi di un filo tra due segnalini (centri in pixel), accorciati al bordo dei riquadri così il filo non li copre.
 * hw/hh = mezza larghezza/altezza del riquadro più un margine. Ritorna null se i riquadri si toccano o coincidono (nessun filo visibile).
 */
export function threadEnds(a, b, { hw = COUNTER_W / 2 + 3, hh = COUNTER_H / 2 + 3 } = {}) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return null;
  const s = Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy));
  const sa = a.hidden ? 0 : s; // un estremo senza segnalino disegnato (fuori schermo o coperto) non si accorcia: il filo parte dal centro della provincia
  const sb = b.hidden ? 0 : s;
  if (!a.hidden && !b.hidden && s >= 0.5) return null; // i due riquadri si sovrappongono o sono quasi a contatto
  return { x0: a.x + dx * sa, y0: a.y + dy * sa, x1: b.x - dx * sb, y1: b.y - dy * sb };
}

/**
 * Coppia di punti più vicina tra una provincia e l'altra, per una nazione (la mappa si ripete in orizzontale: più copie).
 * `points` = segnalini disegnati ({province, nation, cx, cy}) più gli ancoraggi di quelli NON disegnati ({..., hidden: true}):
 * un comando a più di 300 km, cioè proprio il caso «fuori portata», è quasi sempre fuori schermo, ma il filo deve comunque raggiungerlo.
 */
export function nearestPair(points, fromProv, toProv, nation) {
  const A = points.filter((h) => h.province === fromProv && h.nation === nation);
  const B = points.filter((h) => h.province === toProv && h.nation === nation);
  let best = null;
  for (const p of A) {
    for (const q of B) {
      const d = (p.cx - q.cx) ** 2 + (p.cy - q.cy) ** 2;
      if (!best || d < best.d) best = { a: { x: p.cx, y: p.cy, hidden: Boolean(p.hidden) }, b: { x: q.cx, y: q.cy, hidden: Boolean(q.hidden) }, d };
    }
  }
  return best;
}

// Stile dei fili: tutti sottili e tratteggiati (richiesta dell'utente, 07/11/2026); il LIVELLO del comando si legge dalla lunghezza del tratteggio, non dal colore.
export const THREAD_STYLE = {
  corps: { width: 1.2, dash: [5, 4] },
  army: { width: 1.4, dash: [9, 4] },
  army_group: { width: 1.4, dash: [9, 4, 2, 4] },
  theater: { width: 1.6, dash: [14, 4, 2, 4] },
};

/** Fili di comando. `threads` da commandThreads(); `points` = segnalini disegnati e ancoraggi dei non disegnati (vedi nearestPair). */
function drawThreads(ctx, threads, points) {
  ctx.save();
  ctx.lineCap = 'round';
  for (const t of threads) {
    const pair = nearestPair(points, t.fromProv, t.toProv, t.nation);
    const e = pair && threadEnds(pair.a, pair.b);
    if (!e) continue; // provincia senza unità della nazione, o riquadri a contatto: nessun filo inventato
    const st = THREAD_STYLE[t.level] ?? THREAD_STYLE.corps;
    for (const [w, color] of [[st.width + 2.5, 'rgba(20,20,20,0.75)'], [st.width, '#f2e6b8']]) { // alone scuro sotto: leggibile su ogni colore di provincia
      ctx.setLineDash(st.dash);
      ctx.lineWidth = w;
      ctx.strokeStyle = color;
      ctx.beginPath(); ctx.moveTo(e.x0, e.y0); ctx.lineTo(e.x1, e.y1); ctx.stroke();
    }
  }
  ctx.restore();
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
  if (spec.far) { // divisioni fuori portata dal comando: alone ambra + medaglione «!» (forma e testo, non solo colore); fisso, senza animazione
    ctx.save();
    ctx.shadowColor = '#ffb020';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = '#ffb020';
    ctx.lineWidth = 3;
    ctx.strokeRect(x0 - 3, y0 - 3, w + 6, h + 6);
    ctx.restore();
    ctx.fillStyle = '#ffb020';
    ctx.beginPath(); ctx.arc(x0 + 1, y0 + h - 1, 8, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = '#111'; ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', x0 + 1, y0 + h);
  }
}

/**
 * Disegna i segnalini sulle province visibili. `byProvince`: { idElemento: [gruppi] } (già ancorato a una sotto-provincia).
 * Un riquadro che toccherebbe uno già disegnato si salta; priorità alle province più grandi. ctx: (dpr, 0, 0, dpr, 0, 0).
 */
export function drawProvinceUnits(ctx, { items, byProvince, a, dpr, copies, boxes, model, hits, farIds, threads }) {
  if (!byProvince) return;
  const W = ctx.canvas.width / dpr;
  const H = ctx.canvas.height / dpr;
  const cand = [];
  for (const it of items) {
    const groups = byProvince[it.props.id];
    if (groups?.length) cand.push([it, groups]);
  }
  cand.sort((x, y) => (y[0].areaKm2 ?? 0) - (x[0].areaKm2 ?? 0));
  const hidden = []; // ancoraggi dei segnalini non disegnati (fuori schermo o coperti da uno più grande): servono solo ai fili
  for (const [it, groups] of cand) {
    const pt = model ? anchorOf(model, it) : { x: it.bbox.x + it.bbox.w / 2, y: it.bbox.y + it.bbox.h / 2 };
    const { shown, extra } = countersFor(groups, farIds);
    const n = shown.length + (extra > 0 ? 1 : 0);
    const w = n * COUNTER_W + (n - 1) * GAP;
    for (const off of copies) {
      const px = a.sx * (pt.x + off) + a.tx;
      const py = a.sx * pt.y + a.ty;
      const skip = () => { if (threads?.length) for (const g of groups) hidden.push({ province: it.props.parentProvince ?? it.props.id, nation: g.nation, cx: px, cy: py, hidden: true }); };
      if (px < -w || py < -COUNTER_H || px > W + w || py > H + COUNTER_H) { skip(); continue; }
      const box = [px - w / 2, py - COUNTER_H / 2, px + w / 2, py + COUNTER_H / 2];
      if (boxes.some((o) => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1])) { skip(); continue; }
      boxes.push(box);
      shown.forEach((spec, i) => {
        const cx = box[0] + COUNTER_W / 2 + i * (COUNTER_W + GAP);
        drawCounter(ctx, spec, cx, py);
        // area toccabile del segnalino (pixel CSS), con provincia madre e nazione: lo legge il tocco della mappa
        hits?.push({ x0: cx - COUNTER_W / 2 - 2, y0: py - COUNTER_H / 2 - 10, x1: cx + COUNTER_W / 2 + 2, y1: py + COUNTER_H / 2 + 2, province: it.props.parentProvince ?? it.props.id, nation: spec.nation, cx, cy: py });
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
  if (threads?.length) drawThreads(ctx, threads, [...(hits ?? []), ...hidden]); // fili di comando: dopo i segnalini; accorciati ai bordi dei riquadri disegnati
}
