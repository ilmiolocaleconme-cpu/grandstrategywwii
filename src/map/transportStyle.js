// Aspetto di strade, autostrade, ferrovie e ponti sulla mappa Canvas: UNA sola fonte per mappa, ponti e legenda.
// Il dettaglio cresce con lo zoom (tre livelli): da lontano linee semplici, poi strade con bordo e ferrovie a
// tratteggio, da vicino il disegno «vero»: autostrada a due carreggiate con spartitraffico, ferrovia con traversine
// e rotaie (doppio binario per le linee potenziate), ponti come impalcato con parapetti che porta il simbolo di
// ciò che trasporta. Solo disegno (Canvas 2D, misure in pixel di schermo): nessun dato, nessuna regola.
// Si prova senza browser con un contesto simulato (tests/transport_style.test.js).

export const DETAIL_ZOOMS = Object.freeze([12, 20]); // da questo zoom: bordi e tratteggi · disegno completo di strade e ferrovie
export const DECK_ZOOM = 20; // da questo zoom i ponti diventano impalcati con materiale

/** Ingrandimento dei segni (spessori, tratteggi, ponti) oltre lo zoom dei ponti: 1 fino a 20, poi cresce fino a 1,6 a zoom 120. */
export function sizeBoost(k) {
  return k <= DECK_ZOOM ? 1 : Math.min(1.6, 1 + ((k - DECK_ZOOM) / (120 - DECK_ZOOM)) * 0.6);
}

/** Livello di dettaglio dallo zoom: 0 linee semplici, 1 bordi e tratteggi, 2 disegno completo (corsie, binari, ponti). */
export function detailTier(k) {
  return k < DETAIL_ZOOMS[0] ? 0 : k < DETAIL_ZOOMS[1] ? 1 : 2;
}

const INK = '#2b2618'; // bordo delle strade
const TIE = '#23232a'; // traversine
const RAIL = '#f2f2ec'; // rotaie (linee semplici a zoom basso)
const BED = '#f4f4ee'; // massicciata tra le rotaie

/**
 * Passate di tratto per tipo e livello di dettaglio, dal basso in alto: { c colore, w spessore in px, dash [pieno, vuoto] in px }.
 * A zoom alto le rotaie sono sottili tratti scuri lasciati da un tratto scuro largo coperto da uno chiaro più stretto; le traversine sono
 * un tratto largo con tratteggio cortissimo, disegnato per ultimo (stessa fase): segni di traverso sulle rotaie. Il doppio binario ha quattro rotaie.
 */
export const RECIPES = Object.freeze({
  'sea-0': [ // tratta marittima (traghetto): tratteggio azzurro, sotto a tutto
    [{ c: '#8fb4d6', w: 1, dash: [3, 3.5] }],
    [{ c: '#9cc3e6', w: 1.8, dash: [5, 4.5] }],
    [{ c: '#bcd8f2', w: 2.6, dash: [7, 5] }, { c: '#4f7aa3', w: 1, dash: [7, 5] }],
  ],
  'road-0': [ // strada sterrata: tratteggio marrone
    [{ c: '#b08a55', w: 1, dash: [2.4, 2.4] }],
    [{ c: '#8f6c38', w: 2, dash: [5, 3.4] }],
    [{ c: '#6b4e24', w: 3.8, dash: [6, 3.8] }, { c: '#d6b98a', w: 2.2, dash: [6, 3.8] }],
  ],
  'road-1': [
    [{ c: '#d8c690', w: 0.8 }],
    [{ c: INK, w: 2.8 }, { c: '#e8dcae', w: 1.5 }],
    [{ c: INK, w: 4.6 }, { c: '#eadfb4', w: 3 }],
  ],
  'road-2': [
    [{ c: '#f2d25a', w: 1.5 }],
    [{ c: INK, w: 3.8 }, { c: '#f2d25a', w: 2.4 }],
    [{ c: INK, w: 6.4 }, { c: '#f2d25a', w: 4.8 }, { c: '#fffbe6', w: 0.9, dash: [4, 3.5] }],
  ],
  'road-3': [
    [{ c: '#ff7a1a', w: 2.8 }],
    [{ c: INK, w: 4.4 }, { c: '#ff7a1a', w: 2.8 }], // una carreggiata: sono due, affiancate (OFFSETS_T1)
    [{ c: INK, w: 8.6 }, { c: '#ff7a1a', w: 7 }, { c: '#fffbe6', w: 0.8, dash: [4, 3.5] }], // una carreggiata: sono due, affiancate (OFFSETS)
  ],
  'rail-2': [
    [{ c: '#e4e4dc', w: 1, dash: [3, 2.2] }],
    [{ c: INK, w: 2.6 }, { c: RAIL, w: 1.2, dash: [3.2, 3.2] }], // linea nera con trattini bianchi, come sulle carte
    [{ c: TIE, w: 4.4 }, { c: BED, w: 3 }, { c: TIE, w: 6.6, dash: [1.2, 2.4] }], // un binario: due rotaie sottili e traversine fitte
  ],
  'rail-3': [
    [{ c: '#ffffff', w: 1.8, dash: [4.5, 2.2] }],
    [{ c: INK, w: 2.6 }, { c: RAIL, w: 1.2, dash: [3.2, 3.2] }], // un binario: sono due, affiancati (OFFSETS_T1)
    [{ c: TIE, w: 4.4 }, { c: BED, w: 3 }, { c: TIE, w: 6.6, dash: [1.2, 2.4] }], // un binario: sono due, affiancati (OFFSETS)
  ],
});

/** A zoom pieno questi tipi si disegnano come DUE tracciati paralleli, scostati di ± il valore (px): autostrada = due carreggiate con spartitraffico, doppio binario = due binari. */
export const OFFSETS = Object.freeze({ 'road-3': 5.2, 'rail-3': 4.4 });
/** Anche a dettaglio 1 (bordi e tratteggi) autostrada e doppio binario sono due linee parallele, più vicine. */
export const OFFSETS_T1 = Object.freeze({ 'road-3': 2.8, 'rail-3': 2.3 });
/** Scostamento (px) delle due linee parallele di un tipo a un livello di dettaglio, o undefined se è una linea sola. */
export function offsetOf(key, tier) {
  return tier === 2 ? OFFSETS[key] : tier === 1 ? OFFSETS_T1[key] : undefined;
}

export const LINE_KEYS = Object.freeze(['sea-0', 'road-0', 'road-1', 'road-2', 'road-3', 'rail-2', 'rail-3']);

/** Ordine di disegno: tratte marittime, strade, poi ferrovie, poi autostrade in cima. Dentro un gruppo si fa prima la passata 0 di tutti i tipi (bordi), poi la 1, ecc. */
export const DRAW_GROUPS = Object.freeze([['sea-0'], ['road-0', 'road-1', 'road-2'], ['rail-2', 'rail-3'], ['road-3']]);

/** Spessore massimo in px del simbolo di un tipo a un livello di dettaglio. */
export function recipeWidth(key, tier) {
  return Math.max(...RECIPES[key][tier].map((p) => p.w)) + 2 * (offsetOf(key, tier) ?? 0);
}

/** Disegna un segno dritto da x0 a x1 (unità di mappa) sull'asse y = 0 del contesto: con scostamenti (OFFSETS) sono due tracciati paralleli. */
export function drawStraight(ctx, key, tier, sx, x0, x1) {
  const o = offsetOf(key, tier);
  const offs = o ? [-o / sx, o / sx] : [0];
  for (const pass of RECIPES[key][tier]) {
    for (const y of offs) {
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y);
      strokePass(ctx, pass, sx);
    }
  }
}

/** Aggiunge a `path` la polilinea `c` scostata di `d` unità di lato (normale media tra segmenti; angoli stretti limitati). */
export function addOffset(path, c, d) {
  const n = c.length / 2;
  const pt = (i) => {
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(n - 1, i + 1);
    let tx = c[2 * i1] - c[2 * i0];
    let ty = c[2 * i1 + 1] - c[2 * i0 + 1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len; ty /= len;
    return [c[2 * i] - ty * d, c[2 * i + 1] + tx * d];
  };
  const [x0, y0] = pt(0);
  path.moveTo(x0, y0);
  for (let i = 1; i < n; i += 1) { const [x, y] = pt(i); path.lineTo(x, y); }
}

/** Applica una passata di tratto al percorso corrente di `ctx` (o a `path`, un Path2D). Misure in px, divise per `sx`. */
export function strokePass(ctx, pass, sx, path) {
  ctx.strokeStyle = pass.c;
  ctx.lineWidth = pass.w / sx;
  ctx.setLineDash(pass.dash ? pass.dash.map((d) => d / sx) : []);
  if (path) ctx.stroke(path); else ctx.stroke();
}

/** Tipo di ponte da ciò che porta: id, materiale/aspetto e titolo (usati dalla legenda e dalla scheda futura). Materiale = ipotesi grafica dal livello. */
export function bridgeKind({ road = 0, rail = 0 }) {
  if (road && rail) return { id: 'mixed', style: 'iron', label: 'Ponte in ferro strada e ferrovia' };
  if (rail) return rail >= 3 ? { id: 'rail-double', style: 'iron', label: 'Ponte in ferro a traliccio, doppio binario' } : { id: 'rail-single', style: 'iron-deck', label: 'Ponte ferroviario in ferro, binario unico' };
  if (road >= 3) return { id: 'road-3', style: 'stone', label: 'Ponte autostradale (due carreggiate)' };
  if (road === 2) return { id: 'road-2', style: 'stone', label: 'Ponte stradale in muratura' };
  return { id: 'road-1', style: 'wood', label: 'Ponte in legno' };
}

/** Righe della legenda dei ponti a zoom alto: un esempio per tipo (spec per drawSwatch). */
export function bridgeLegend() {
  return [
    { road: 1, rail: 0 },
    { road: 2, rail: 0 },
    { road: 3, rail: 0 },
    { road: 0, rail: 2 },
    { road: 0, rail: 3 },
    { road: 2, rail: 2 },
  ].map((b) => ({ ...bridgeKind(b), spec: { kind: 'bridge', ...b } }));
}

const DECK_LEN = 34; // px: lunghezza del campione della legenda
const DECK_PAD = 2.4; // px di impalcato oltre il simbolo, per lato (legno e autostrada)
export const BRIDGE_MIN_PX = 30; // lunghezza minima sullo schermo di un ponte a dettaglio pieno (sotto, il tratto-ponte sarebbe un puntino)

const DECK_FILL = { wood: '#b98f58', stone: '#d3d1c6', iron: '#dde3ea', 'iron-deck': '#dde3ea' };
const STEEL = '#2f3a49';

/**
 * Disegna un ponte visto dall'alto, con la costruzione riconoscibile dal tipo (bridgeKind), come nella tavola dei simboli:
 *  - legno (strada comune): tavolato di traverso, montanti tondi lungo i bordi, parapetti scuri;
 *  - muratura (strada principale): conci sfalsati, profilo ad arco, contrafforti quadrati agli angoli;
 *  - autostrada: piano grigio con due carreggiate e pile tonde ovali agli angoli;
 *  - ferro a traliccio (doppio binario, o strada + ferrovia): controventi a X in campate quadre, travi di bordo, blocchi bianchi di fondazione;
 *  - ferro a travata (binario unico): due travi piene ai lati, traversi, blocchi di fondazione.
 * Il simbolo di ciò che il ponte porta (carreggiate, binari) sta sempre sopra il piano.
 * Il contesto ha già origine nel centro del ponte e rotazione lungo la linea; `sx` = px per unità, `len` = lunghezza in px.
 * Ritorna { len, width } in px.
 */
export function drawBridgeDeck(ctx, { road = 0, rail = 0 }, sx, len = DECK_LEN) {
  const kind = bridgeKind({ road, rail });
  const wood = kind.style === 'wood';
  const arch = kind.style === 'stone' && kind.id !== 'road-3';
  const highway = kind.id === 'road-3';
  const truss = kind.style === 'iron';
  const girder = kind.style === 'iron-deck';
  const keys = [];
  if (road) keys.push(`road-${Math.min(3, road)}`);
  if (rail) keys.push(`rail-${rail >= 3 ? 3 : 2}`);
  const ws = keys.map((k) => recipeWidth(k, 2));
  const gap = keys.length > 1 ? 1.5 : 0;
  const inner = ws.reduce((a, b) => a + b, 0) + gap;
  const pad = arch ? 4.6 : truss || girder ? 3.2 : DECK_PAD; // la muratura e il ferro mostrano più piano ai lati della strada
  const width = inner + 2 * pad;
  const u = 1 / sx;
  const L = Math.max(len, 12) * u;
  const hw = (width / 2) * u;
  const line = (x0, y0, x1, y1, w, c, dash, off = 0) => {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    ctx.strokeStyle = c; ctx.lineWidth = w * u; ctx.setLineDash(dash ? dash.map((d) => d * u) : []); ctx.lineDashOffset = off * u; ctx.stroke();
    ctx.lineDashOffset = 0;
  };
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.setLineDash([]);
  // ombra e piano del ponte: staccano il ponte dalla linea e dal fiume
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.fillRect(-L / 2 + 1.6 * u, -hw + 1.8 * u, L, 2 * hw);
  ctx.fillStyle = DECK_FILL[kind.style];
  ctx.fillRect(-L / 2, -hw, L, 2 * hw);
  // costruzione
  if (wood) {
    line(-L / 2, 0, L / 2, 0, 2 * hw * sx, '#8a6a3c', [0.9, 2.1]); // tavole di traverso
  } else if (arch) {
    line(-L / 2, -hw / 2, L / 2, -hw / 2, hw * sx, '#8d8c82', [0.7, 3.6]); // conci in due corsi sfalsati
    line(-L / 2, hw / 2, L / 2, hw / 2, hw * sx, '#8d8c82', [0.7, 3.6], 2.15);
    line(-L / 2, 0, L / 2, 0, 0.7, '#8d8c82');
    ctx.save(); // profilo dell'arco: mezza ellissi dal bordo di sotto, due anelli
    ctx.beginPath(); ctx.rect(-L / 2, -hw, L, 2 * hw); ctx.clip();
    for (const [k, c, w] of [[1, '#4b4a44', 1.2], [0.8, '#7d7c72', 0.8]]) {
      ctx.beginPath(); ctx.ellipse(0, hw, (L / 2 - 2.5 * u) * k, hw * 1.75 * k, 0, Math.PI, 2 * Math.PI);
      ctx.strokeStyle = c; ctx.lineWidth = w * u; ctx.stroke();
    }
    ctx.restore();
  } else if (truss) { // controventi a X in campate quadre, sotto i binari
    const n = Math.max(2, Math.round(L / (2 * hw * 1.15)));
    ctx.strokeStyle = STEEL; ctx.lineWidth = 1 * u; ctx.setLineDash([]);
    ctx.beginPath();
    for (let i = 0; i < n; i += 1) {
      const x0 = -L / 2 + (i * L) / n;
      const x1 = x0 + L / n;
      ctx.moveTo(x0, -hw); ctx.lineTo(x1, hw); ctx.moveTo(x0, hw); ctx.lineTo(x1, -hw);
      ctx.moveTo(x1, -hw); ctx.lineTo(x1, hw);
    }
    ctx.stroke();
  } else if (girder) {
    line(-L / 2, 0, L / 2, 0, 2 * hw * sx, 'rgba(47,58,73,0.55)', [1.1, 4.4]); // traversi
  }
  // simbolo di ciò che porta
  let off = -inner / 2;
  keys.forEach((k, i) => {
    const y = (off + ws[i] / 2) * u;
    off += ws[i] + gap;
    ctx.save();
    ctx.translate(0, y);
    drawStraight(ctx, k, 2, sx, -L / 2 + u, L / 2 - u);
    ctx.restore();
  });
  // bordi: parapetti (legno: scuri e con montanti tondi; ferro: travi d'acciaio piene)
  ctx.setLineDash([]);
  if (truss || girder) {
    for (const y of [-hw, hw]) line(-L / 2, y, L / 2, y, girder ? 2.6 : 2, STEEL);
  } else {
    const edge = wood ? '#4a3418' : '#14140f';
    for (const y of [-hw, hw]) line(-L / 2, y, L / 2, y, 1.6, edge);
  }
  if (wood) { // montanti tondi
    ctx.fillStyle = '#4a3418';
    for (let x = -L / 2 + 2 * u; x <= L / 2 - 1.5 * u; x += 6 * u) for (const y of [-hw - 0.4 * u, hw + 0.4 * u]) { ctx.beginPath(); ctx.arc(x, y, 1.5 * u, 0, Math.PI * 2); ctx.fill(); }
  }
  // spalle e fondazioni
  ctx.setLineDash([]);
  if (arch) { // contrafforti quadrati di muratura
    ctx.fillStyle = '#bdbbb0'; ctx.strokeStyle = '#14140f'; ctx.lineWidth = 1.1 * u;
    for (const a of [-1, 1]) for (const b of [-1, 1]) { ctx.fillRect(a * L / 2 - 2.4 * u, b * hw - 2.4 * u, 4.8 * u, 4.8 * u); ctx.strokeRect(a * L / 2 - 2.4 * u, b * hw - 2.4 * u, 4.8 * u, 4.8 * u); }
  } else if (highway) { // pile tonde agli angoli
    ctx.fillStyle = '#b9b9b0'; ctx.strokeStyle = '#14140f'; ctx.lineWidth = 1.2 * u;
    for (const a of [-1, 1]) for (const b of [-1, 1]) { ctx.beginPath(); ctx.arc(a * L / 2, b * hw, 3.6 * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  } else if (truss || girder) { // blocchi bianchi di fondazione
    ctx.fillStyle = '#f4f4ee'; ctx.strokeStyle = '#14140f'; ctx.lineWidth = 1 * u;
    for (const a of [-1, 1]) for (const b of [-1, 1]) { ctx.fillRect(a * L / 2 - 2.2 * u, b * hw - 2.2 * u, 4.4 * u, 4.4 * u); ctx.strokeRect(a * L / 2 - 2.2 * u, b * hw - 2.2 * u, 4.4 * u, 4.4 * u); }
  } else { // legno: travi di testata
    line(-L / 2, -hw - 1.6 * u, -L / 2, hw + 1.6 * u, 2.4, '#4a3418');
    line(L / 2, -hw - 1.6 * u, L / 2, hw + 1.6 * u, 2.4, '#4a3418');
  }
  ctx.restore();
  return { len: Math.max(len, 12), width };
}

/** Campioni per la legenda: disegna un esempio nel contesto `ctx` di una tela w × h px (pixel di schermo, sx = 1). */
export function drawSwatch(ctx, spec, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  if (spec.kind === 'line') {
    drawStraight(ctx, spec.key, 2, 1, -w / 2 + 2, w / 2 - 2);
  } else if (spec.kind === 'bridge') {
    drawBridgeDeck(ctx, spec, 1, Math.min(DECK_LEN, w - 8));
  }
  ctx.restore();
}

/**
 * Ponti come TRATTI della linea (grafo dei collegamenti): lo stesso tracciato della strada o ferrovia, con aspetto di ponte.
 * `list` = tratti-ponte del modello ({ kind, level, coords:Float32Array }); `tier` = dettaglio (detailTier). Misure in px / `sx`.
 * Dettaglio 0: come la linea normale. 1: la linea con un bordo chiaro. 2: il ponte vero (drawBridgeDeck) sul tratto, orientato
 * come la corda del tratto e lungo come lui (almeno BRIDGE_MIN_PX): legno, muratura, autostrada, ferro a traliccio o a travata.
 */
export function drawBridgeSegments(ctx, list, { sx, tier }) {
  const byKey = new Map();
  for (const l of list) { const key = `${l.kind}-${l.level}`; if (!RECIPES[key]) continue; (byKey.get(key) ?? byKey.set(key, []).get(key)).push(l); }
  const u = 1 / sx;
  const build = (lines, d) => { const p = new Path2D(); for (const l of lines) addOffset(p, l.coords, d * u); return p; };
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  for (const [key, lines] of byKey) {
    if (tier === 2) {
      const level = lines[0].level;
      const spec = key.startsWith('rail') ? { road: 0, rail: level } : { road: Math.max(1, level), rail: 0 }; // strada sterrata: ponte di legno come la strada comune
      for (const l of lines) {
        const c = l.coords; const n = c.length;
        const dx = c[n - 2] - c[0]; const dy = c[n - 1] - c[1];
        ctx.save();
        ctx.translate((c[0] + c[n - 2]) / 2, (c[1] + c[n - 1]) / 2);
        ctx.rotate(Math.atan2(dy, dx));
        drawBridgeDeck(ctx, spec, sx, Math.max(BRIDGE_MIN_PX, Math.hypot(dx, dy) * sx));
        ctx.restore();
      }
      continue;
    }
    const off = offsetOf(key, tier);
    const symbol = off ? [build(lines, -off), build(lines, off)] : [build(lines, 0)];
    if (tier === 1) { // bordo chiaro attorno alla linea: il ponte si nota
      for (const p of symbol) strokePass(ctx, { c: 'rgba(250,250,246,0.95)', w: recipeWidth(key, 1) + 3.4 }, sx, p);
    }
    for (const pass of RECIPES[key][tier]) for (const p of symbol) strokePass(ctx, pass, sx, p);
  }
  ctx.setLineDash([]);
}
