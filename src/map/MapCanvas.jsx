import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { focusView } from './focus.js';
import { HOME_BOUNDS, LAYERS, MAX_K, MAX_LAT, RIVER_WIDTH_PX, WORLD_W, minZoomToFit, riverTier, pickLabels, visibleCopies, wrapView, zoomAt } from './geo.js';
import { citySnapTolerance, nearestCityAt } from './citta.js';
import { buildBorders, buildCanvasModel, buildCanvasWater, createBorderLodJob, createLodJob, nearestSmallProvinceAt, pickProvinceAt, CANVAS_LOD_TOLS } from './canvasModel.js';
import { affineOf, layoutOf, lodLevelForScale, screenToUnit, screenToView } from './canvasView.js';
import { MAX_LEVEL, TILE_BLEED, TILE_CSS, TileStore, ancestorOf, childrenOf, columns, levelFor, levelScale, tileKey, tileOrigin, tileRect, visibleTiles } from './tiles.js';
import { COLORS, drawOverlay, renderBaseSteps } from './canvasDraw.js';
import { hitAt } from './unitIcons.js';
import { resolveResourceAnchors, resolveResourceFills } from '../data/provinceResources.js';
import { buildLinksModel } from './transportView.js';
import { seaZoneAt } from './seaView.js';
import { pickStaticLabels } from './labelview.js';

// Mappa strategica su Canvas 2D (predefinita; la mappa SVG si attiva con ?map=svg): React resta per interfaccia, pannelli,
// selezione, livelli e legenda; la mappa si disegna su due tele (scena e sovrapposizione) e il gesto non passa da React:
// durante il trascinamento e lo zoom si ridisegna solo un'immagine già pronta (bitmap con margine), e il dettaglio
// pieno torna a gesto fermo. Stesse province, fiumi e laghi di MapView (nessun dato duplicato).

const ISLAND_SNAP_PX = 22; // raggio di cattura (px) intorno a un'isola piccola
const ISLAND_MAX_PX = 140; // oltre questa dimensione a schermo una provincia non è "piccola"
const IDENTITY = { k: 1, x: 0, y: 0 };
const LAKE_LABEL_MIN_K = 3; // i nomi dei laghi compaiono da questo zoom (a zoom basso restano solo le nazioni)
const MAX_DPR = 2; // oltre, il costo di disegno cresce senza vantaggi visibili
const PYRAMID_LEVELS = 0; // livelli intermedi prima di quello giusto: con 3 il riempimento dopo un salto di zoom raddoppiava (le piastrelle dei livelli bassi costano molto)
const PREFETCH_NEXT = 4;
const IDLE_PREFETCH = true; // a schermo fermo prepara anche un secondo giro di piastrelle e i livelli vicini // piastrelle del livello successivo preparate a schermo fermo
const FADE_MS = 160; // dissolvenza di una piastrella nuova sopra quella provvisoria: niente scatto da sfocato a nitido
const TILE_LIMIT = 72; // piastrelle in cache (a dpr 2 circa 1 MB l'una)
const LOD_METHOD = 'radial'; // 'radial' (veloce, usata) o 'dp' (Douglas-Peucker in secondo piano: più fedele, ma ricostruisce i tracciati)
const IDLE_MS = 160; // gesto fermo: dettaglio pieno e nomi
const PAD = HOME_BOUNDS.w * 0.02;
const VB = { x: HOME_BOUNDS.x - PAD, y: HOME_BOUNDS.y - PAD, w: HOME_BOUNDS.w + 2 * PAD, h: HOME_BOUNDS.h + 2 * PAD };
const EMPTY_WATER = { lines: [], lakes: [] };

// la vista può cambiare quanto vuole in orizzontale durante il gesto (il giro del mondo si normalizza a gesto fermo); in verticale restano i poli
const clampY = (v) => ({ k: v.k, x: v.x, y: wrapView(v, VB).y });

export default function MapCanvas({ land, provinces, rivers, riversGeo, lakes, nationNames, nationControl, selectedId, onSelect, layer, onLayerChange, showRivers, onToggleRivers, seas, showSeas, onToggleSeas, selectedSeaId, onSelectSea, labelData, transport, showTransport, onToggleTransport, toolsHost, provinceResources, provinceUnits, onSelectUnits, focus, dataReady, readyKey, onReady }) {
  const model = useMemo(() => buildCanvasModel(provinces), [provinces]);
  // `land` (terra di base, data/land_base.json) arriva dall'App, precaricata all'apertura con gli altri dati: caricarla qui,
  // dopo il montaggio, faceva disegnare la mappa due volte (prima senza terra, poi con) e si vedeva uno sfarfallio.
  const seaData = useMemo(() => (seas ? { zones: seas.zones } : null), [seas]); // oggetto stabile: ci si mettono in cache i tracciati
  const water = useMemo(
    () => (rivers && riversGeo && lakes ? buildCanvasWater(rivers, riversGeo, lakes, (r) => RIVER_WIDTH_PX[r?.widthClass] ?? RIVER_WIDTH_PX.small, riverTier) : EMPTY_WATER),
    [rivers, riversGeo, lakes],
  );
  const transportModel = useMemo(() => (transport && showTransport ? buildLinksModel(transport, WORLD_W / 360) : null), [transport, showTransport]);
  const wrapRef = useRef(null);
  const baseRef = useRef(null);
  const anchoredResources = useMemo(() => (provinceResources ? resolveResourceAnchors(model.items, provinceResources) : null), [model, provinceResources]);
  const anchoredUnits = useMemo(() => (provinceUnits ? resolveResourceAnchors(model.items, provinceUnits) : null), [model, provinceUnits]);
  const resourceFills = useMemo(() => (layer === 'resources' && provinceResources ? resolveResourceFills(model.items, provinceResources) : null), [layer, model, provinceResources]);
  const overlayRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [viewRev, setViewRev] = useState(0); // sale a ogni assestamento della vista: fa ripartire il calcolo dei nomi
  const [labelPass, setLabelPass] = useState(0);

  // stato mutabile del disegno: fuori da React, così il gesto non provoca ridisegni dell'interfaccia
  const st = useRef({ view: IDENTITY, tiles: new TileStore(TILE_LIMIT), gen: 0, job: null, pumpTimer: 0, tileDev: TILE_CSS, labels: [], lod: { levels: [] }, borders: null, dpr: 1, size: { w: 0, h: 0 }, raf: 0, idleTimer: 0, scratch: null, labelTimer: 0, unitHits: [], labelsContinue: false, pointers: new Map(), gesture: null, moved: false });
  // ultimi valori delle proprietà (letti dalle funzioni di disegno senza ricrearle)
  const props = useRef({});
  props.current = { dataReady, onReady, land, model, water, layer, nationControl, selectedId, showRivers, onSelect, seaData, showSeas, selectedSeaId, onSelectSea, labelData, transportModel, provinceResources: anchoredResources, provinceUnits: anchoredUnits, onSelectUnits, resourceFills };

  const lay = () => layoutOf(VB, st.current.size.w, st.current.size.h);
  // zoom minimo: tutto il mondo e non più (niente copie affiancate della mappa)
  const minK = () => { const z = st.current.size; return minZoomToFit(z.w, z.h, lay().s); };

  // --- disegno a piastrelle ----------------------------------------------------------------------------------
  // La scena non è un'unica immagine ridisegnata a ogni spostamento: il mondo è diviso in piastrelle (vedi tiles.js) che si
  // disegnano una volta sola per livello di zoom e restano in cache. Trascinare significa copiare piastrelle già pronte;
  // le nuove si disegnano una alla volta in secondo piano (dal centro verso fuori) e, finché non sono pronte, al loro posto si
  // vede la versione meno (o più) dettagliata già in cache: lo schermo non resta mai vuoto e nulla si ridisegna da capo.

  // versione semplificata per la scala `sx` (pixel CSS per unità): se la definitiva (in secondo piano) non è ancora pronta
  // se ne ricava subito una veloce, così la prima schermata non disegna tutti i vertici
  const ensureLevel = (sx) => {
    const s = st.current;
    const lv = lodLevelForScale(sx, CANVAS_LOD_TOLS);
    if (lv >= CANVAS_LOD_TOLS.length) return;
    if (!s.lod.levels[lv]) s.lod.levels[lv] = createLodJob(props.current.model, CANVAS_LOD_TOLS[lv], 'radial').step(Infinity);
    if (s.borders && !s.borders.levels[lv]) s.borders.levels[lv] = createBorderLodJob(s.borders, CANVAS_LOD_TOLS[lv], 'radial').step(Infinity);
  };

  const flushCanvas = (c) => {
    const s = st.current;
    if (!s.scratch) { s.scratch = document.createElement('canvas'); s.scratch.width = 1; s.scratch.height = 1; }
    s.scratch.getContext('2d').drawImage(c, 0, 0, 1, 1, 0, 0, 1, 1); // la tela rimanda la rasterizzazione alla prima lettura: la si forza qui
  };

  // La scena è cambiata (dati, opzioni, bordi): le piastrelle in cache restano visibili finché la nuova non è pronta, poi la sostituiscono.
  const invalidate = () => {
    const s = st.current;
    s.gen += 1;
    if (s.job) { s.tiles.pool.push(s.job.canvas); s.job = null; }
    pumpTiles();
  };

  const tileCss = () => st.current.tileDev / TILE_CSS; // pixel dispositivo per pixel CSS delle piastrelle (intero se dpr lo è)

  const startJob = (z, c, r) => {
    const s = st.current;
    const p = props.current;
    const dprT = tileCss();
    const { x0, y0, span } = tileOrigin(z, c, r, WORLD_W);
    const sx = levelScale(z, WORLD_W);
    const size = s.tileDev + 2 * TILE_BLEED;
    let canvas = s.tiles.take();
    if (!canvas || canvas.width !== size) { canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size; }
    const bleed = TILE_BLEED / dprT; // pixel CSS
    const l = lay();
    ensureLevel(sx);
    const tile = { sx, tx: bleed - x0 * sx, ty: bleed - y0 * sx, cull: { x0: x0 - bleed / sx, x1: x0 + span + bleed / sx, y0: y0 - bleed / sx, y1: y0 + span + bleed / sx } };
    const it = renderBaseSteps(canvas.getContext('2d'), {
      model: p.model, lod: s.lod, borders: s.borders, water: p.water.lines.length ? p.water : null, view: { k: sx / l.s, x: 0, y: 0 }, vb: VB, lay: l, dpr: dprT,
      region: { x: 0, y: 0, w: size / dprT, h: size / dprT }, layer: p.layer, nationControl: p.nationControl, showRivers: p.showRivers,
      seas: p.showSeas ? p.seaData : null, selectedSeaId: null, copies: [-WORLD_W, 0, WORLD_W], transport: p.transportModel, resourceFills: p.resourceFills,
      land: p.land, trace: window.__gsTrace, light: false, tile,
    });
    return { z, c, r, canvas, it, gen: s.gen, key: tileKey(z, c, r), water: Boolean(p.water.lines.length && p.showRivers) };
  };

  // piastrelle da avere, in ordine: il livello 0 (sempre in cache: ultima risorsa), poi quelle sullo schermo, poi un giro attorno
  const wantedTiles = () => {
    const s = st.current;
    const a = affineOf(s.view, VB, lay());
    const z = levelFor(a.sx, WORLD_W);
    const out = [];
    if (z > 0) {
      const span0 = WORLD_W / columns(0);
      for (let r = Math.floor(-MAX_LAT / span0); r <= Math.floor((MAX_LAT - 1e-9) / span0); r += 1) for (let c = 0; c < columns(0); c += 1) out.push({ z: 0, c, r, keep: true });
    }
    const screen = visibleTiles(z, a, s.size.w, s.size.h, WORLD_W, -MAX_LAT, MAX_LAT, 0);
    // piramide, dal grossolano al fine: dopo un salto di zoom grande, prima i pochi tasselli dei 3 livelli sopra (ognuno copre 4 volte
    // l'area del successivo, quindi costano poco) e solo dopo quelli del livello giusto. Così in pochi decimi di secondo lo schermo passa
    // da una macchia ingrandita 16 volte a una a metà dettaglio, e non resta sfocato per tutto il tempo del riempimento.
    for (let k = Math.min(PYRAMID_LEVELS, z - 1); k >= 1; k -= 1) {
      const seenUp = new Set();
      for (const t of screen) {
        const an = ancestorOf(t.c, t.r, k);
        const key = `${an.c}/${an.r}`;
        if (seenUp.has(key)) continue;
        seenUp.add(key);
        out.push({ z: z - k, c: an.c, r: an.r, keep: false });
      }
    }
    for (const t of screen) out.push({ z, c: t.c, r: t.r, keep: z === 0 });
    const seen = new Set(screen.map((t) => `${t.ci}/${t.r}`));
    for (const t of visibleTiles(z, a, s.size.w, s.size.h, WORLD_W, -MAX_LAT, MAX_LAT, 1)) if (!seen.has(`${t.ci}/${t.r}`)) out.push({ z, c: t.c, r: t.r, keep: z === 0 });
    if (IDLE_PREFETCH && !s.moving) {
      // a schermo fermo, in anticipo: un secondo giro attorno (il prossimo trascinamento trova già tutto), le piastrelle più vicine al centro
      // del livello successivo (il prossimo zoom parte già nitido) e quelle del livello sopra (per rimpicciolire)
      const seen1 = new Set(visibleTiles(z, a, s.size.w, s.size.h, WORLD_W, -MAX_LAT, MAX_LAT, 1).map((t) => `${t.ci}/${t.r}`));
      for (const t of visibleTiles(z, a, s.size.w, s.size.h, WORLD_W, -MAX_LAT, MAX_LAT, 2)) if (!seen1.has(`${t.ci}/${t.r}`)) out.push({ z, c: t.c, r: t.r, keep: z === 0 });
      if (z < MAX_LEVEL) for (const t of visibleTiles(z + 1, a, s.size.w, s.size.h, WORLD_W, -MAX_LAT, MAX_LAT, 0).slice(0, PREFETCH_NEXT)) out.push({ z: z + 1, c: t.c, r: t.r, keep: false });
      if (z > 1) {
        const seenUp = new Set();
        for (const t of screen) {
          const an = ancestorOf(t.c, t.r, 1);
          const key = `${an.c}/${an.r}`;
          if (seenUp.has(key)) continue;
          seenUp.add(key);
          out.push({ z: z - 1, c: an.c, r: an.r, keep: false });
        }
      }
    }
    return out;
  };

  const nextMissing = () => {
    const s = st.current;
    for (const w of wantedTiles()) {
      const t = s.tiles.touch(tileKey(w.z, w.c, w.r)); // quelle volute non si scartano
      if (!t || t.gen !== s.gen) return w;
    }
    return null;
  };

  const runPump = () => {
    const s = st.current;
    s.pumpTimer = 0;
    if (!s.size.w) return;
    const t0 = performance.now();
    const budget = s.moving ? 5 : 12;
    let done = 0;
    do {
      if (!s.job) {
        const w = nextMissing();
        if (!w) break;
        s.job = startJob(w.z, w.c, w.r);
        s.job.keep = w.keep;
      }
      const j = s.job;
      const r = j.it.next();
      if (r.done) {
        const had = s.tiles.get(j.key);
        s.tiles.set(j.key, { canvas: j.canvas, gen: j.gen, keep: j.keep, born: had ? 0 : performance.now() }); // sostituzione di una versione vecchia: nessuna dissolvenza
        s.job = null;
        done += 1;
        baseRef.current.dataset.drawn = '1';
        if (j.water) baseRef.current.dataset.water = '1';
      } else flushCanvas(j.canvas);
    } while (performance.now() - t0 < budget);
    if (done) requestFrame();
    if (s.job || nextMissing()) pumpTiles(); // altre da fare: dopo una pausa breve se c'è un gesto in corso
  };

  const pumpTiles = () => {
    const s = st.current;
    if (s.pumpTimer) return;
    s.pumpTimer = setTimeout(runPump, s.moving ? 30 : 0);
  };

  const paintOverlay = () => {
    const s = st.current;
    const o = overlayRef.current;
    if (!o || !s.size.w) return;
    const p = props.current;
    const l = lay();
    const copies = visibleCopies(s.view, VB, p.model.bounds);
    drawOverlay(o.getContext('2d'), { model: p.model, lod: s.lod, view: s.view, vb: VB, lay: l, dpr: s.dpr, selectedId: p.selectedId, seas: p.showSeas ? p.seaData : null, selectedSeaId: p.selectedSeaId, labels: s.labels, copies, layer: p.layer, provinceResources: p.provinceResources, provinceUnits: p.provinceUnits, unitHits: s.unitHits });
  };

  // porta alla vista corrente le piastrelle in cache (trascinamento e zoom costano solo questo)
  const blit = () => {
    const s = st.current;
    const base = baseRef.current;
    if (!base || !s.size.w) return;
    const ctx = base.getContext('2d');
    const dpr = s.dpr;
    const l = lay();
    const a = affineOf(s.view, VB, l);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.sea;
    ctx.fillRect(0, 0, base.width, base.height);
    const z = levelFor(a.sx, WORLD_W);
    s.tiles.nextFrame();
    const T = s.tileDev;
    const B = TILE_BLEED;
    const full = T + 2 * B;
    let missing = 0;
    let fading = false;
    const now = performance.now();
    // al posto di una piastrella assente: le 4 del livello più fine (se ci sono tutte), altrimenti il quadrante di quella più grossolana
    const drawFallback = (t, dx0, dy0, dx1, dy1) => {
      if (z < MAX_LEVEL) {
        const kids = childrenOf(t.c, t.r).map((k) => ({ ...k, tile: s.tiles.touch(tileKey(z + 1, k.c, k.r)) }));
        if (kids.every((k) => k.tile)) {
          const mx = Math.round((dx0 + dx1) / 2);
          const my = Math.round((dy0 + dy1) / 2);
          for (const k of kids) ctx.drawImage(k.tile.canvas, B, B, T, T, k.qx ? mx : dx0, k.qy ? my : dy0, (k.qx ? dx1 : mx) - (k.qx ? mx : dx0), (k.qy ? dy1 : my) - (k.qy ? my : dy0));
          return true;
        }
      }
      for (let dz = 1; dz <= z; dz += 1) {
        const an = ancestorOf(t.c, t.r, dz);
        const pt = s.tiles.touch(tileKey(z - dz, an.c, an.r));
        if (!pt) continue;
        const sz = T / an.f;
        ctx.drawImage(pt.canvas, B + an.qx * sz, B + an.qy * sz, sz, sz, dx0, dy0, dx1 - dx0, dy1 - dy0);
        return true;
      }
      return false;
    };
    for (const t of visibleTiles(z, a, s.size.w, s.size.h, WORLD_W, -MAX_LAT, MAX_LAT, 0)) {
      const rc = tileRect(z, t.ci, t.r, a, WORLD_W);
      const dx0 = Math.round(rc.x * dpr);
      const dy0 = Math.round(rc.y * dpr);
      const dx1 = Math.round((rc.x + rc.w) * dpr);
      const dy1 = Math.round((rc.y + rc.h) * dpr);
      const exact = s.tiles.touch(tileKey(z, t.c, t.r));
      if (exact) {
        if (exact.gen !== s.gen) missing += 1;
        const fx = (dx1 - dx0) / T;
        const fy = (dy1 - dy0) / T;
        const age = exact.born ? now - exact.born : FADE_MS;
        if (age < FADE_MS) { // appena disegnata: si dissolve sopra la versione provvisoria
          fading = true;
          drawFallback(t, dx0, dy0, dx1, dy1);
          ctx.globalAlpha = age / FADE_MS;
        }
        ctx.drawImage(exact.canvas, 0, 0, full, full, dx0 - B * fx, dy0 - B * fy, full * fx, full * fy);
        ctx.globalAlpha = 1;
        continue;
      }
      missing += 1;
      drawFallback(t, dx0, dy0, dx1, dy1);
    }
    if (fading) startFade(); // la dissolvenza va avanti finché dura
    base.dataset.tileMiss = String(missing); // diagnostica dei test: piastrelle dello schermo non ancora al livello giusto
    if (missing || s.tiles.size < 4) pumpTiles();
    paintOverlay();
  };

  const requestFrame = () => {
    const s = st.current;
    if (s.raf) return;
    s.raf = requestAnimationFrame(() => { s.raf = 0; blit(); });
  };

  // Dissolvenza: finché una piastrella è appena nata (FADE_MS) la si ridisegna da sola, con opacità crescente, sopra quello che c'è già
  // (la versione provvisoria): niente ridisegno dell'intera scena a ogni fotogramma, che rallentava il riempimento di un terzo.
  const fadeStep = () => {
    const s = st.current;
    s.fadeRaf = 0;
    const base = baseRef.current;
    if (!base || !s.size.w) return;
    const ctx = base.getContext('2d');
    const dpr = s.dpr;
    const a = affineOf(s.view, VB, lay());
    const z = levelFor(a.sx, WORLD_W);
    const T = s.tileDev;
    const B = TILE_BLEED;
    const full = T + 2 * B;
    const now = performance.now();
    let more = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const t of visibleTiles(z, a, s.size.w, s.size.h, WORLD_W, -MAX_LAT, MAX_LAT, 0)) {
      const ex = s.tiles.get(tileKey(z, t.c, t.r));
      if (!ex || !ex.born) continue;
      const age = now - ex.born;
      const rc = tileRect(z, t.ci, t.r, a, WORLD_W);
      const dx0 = Math.round(rc.x * dpr);
      const dy0 = Math.round(rc.y * dpr);
      const dx1 = Math.round((rc.x + rc.w) * dpr);
      const dy1 = Math.round((rc.y + rc.h) * dpr);
      const fx = (dx1 - dx0) / T;
      const fy = (dy1 - dy0) / T;
      ctx.globalAlpha = Math.min(1, age / FADE_MS);
      ctx.drawImage(ex.canvas, 0, 0, full, full, dx0 - B * fx, dy0 - B * fy, full * fx, full * fy);
      if (age >= FADE_MS) ex.born = 0; else more = true;
    }
    ctx.globalAlpha = 1;
    if (more) s.fadeRaf = requestAnimationFrame(fadeStep);
  };
  const startFade = () => {
    const s = st.current;
    if (!s.fadeRaf) s.fadeRaf = requestAnimationFrame(fadeStep);
  };

  // gesto fermo: giro del mondo normalizzato, poi i nomi
  const settle = () => {
    const s = st.current;
    s.moving = false;
    s.view = wrapView(s.view, VB); // il giro del mondo cambia solo il modo di contare: le piastrelle si ripetono
    if (s.view.k < minK()) s.view = wrapView(zoomAt(s.view, minK() / s.view.k, VB.x + VB.w / 2, VB.y + VB.h / 2, 0, MAX_K), VB); // dopo un ridimensionamento
    blit();
    pumpTiles();
    setViewRev((n) => n + 1);
  };
  const touched = () => {
    const s = st.current;
    if (!s.moving) {
      s.moving = true;
      if (s.labels.length) { s.labels = []; baseRef.current.dataset.labels = '0'; baseRef.current.dataset.lakeLabels = '0'; }
    }
    clearTimeout(s.idleTimer);
    s.idleTimer = setTimeout(settle, IDLE_MS);
  };
  const applyView = (v) => {
    st.current.view = clampY(v);
    touched();
    requestFrame();
  };

  // --- misura del contenitore -----------------------------------------------------------------------------
  useEffect(() => {
    const el = wrapRef.current;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const s = st.current;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      if (Math.round(r.width) === s.size.w && Math.round(r.height) === s.size.h && dpr === s.dpr) return;
      s.size = { w: Math.round(r.width), h: Math.round(r.height) };
      if (dpr !== s.dpr) { s.tiles.clear(); s.job = null; s.gen += 1; } // la risoluzione delle piastrelle dipende da dpr
      s.dpr = dpr;
      s.tileDev = Math.round(TILE_CSS * dpr);
      for (const cv of [baseRef.current, overlayRef.current]) { cv.width = Math.round(s.size.w * dpr); cv.height = Math.round(s.size.h * dpr); }
      setSize(s.size);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // nuovi dati: si riparte da zero (bordi e versioni semplificate si rifanno dopo la prima schermata)
  useEffect(() => {
    const s = st.current;
    s.borders = null;
    s.lod = { levels: [] };
    s.bgDone = false;
    s.tiles.clear();
    s.job = null;
    s.gen += 1;
    return () => { s.bgDead = true; };
  }, [model]);

  // Lavoro in secondo piano, SOLO dopo che la prima schermata è stata disegnata e presentata (due fotogrammi): prima
  // i bordi nazionali (poi la scena si ridisegna con i bordi), poi le versioni semplificate definitive (Douglas-Peucker)
  // a fette brevi, per non bloccare i gesti. La prima schermata usa già versioni veloci (vedi ensureLevel).
  const startBackground = () => {
    const s = st.current;
    if (s.bgDone) return;
    s.bgDone = true;
    s.bgDead = false;
    const m = props.current.model;
    const later = (fn, ms = 0) => setTimeout(() => { if (!s.bgDead && props.current.model === m) fn(); }, ms);
    requestAnimationFrame(() => requestAnimationFrame(() => later(() => {
      s.borders = buildBorders(m);
      s.borders.levels = [];
      later(() => {
        invalidate(); // bordi pronti: le piastrelle si rifanno con i bordi
        blit();
        // Versioni semplificate: con 'dp' sostituiscono quelle veloci; con 'radial' sono le stesse che ensureLevel
        // costruirebbe in un colpo solo al primo zoom oltre la soglia (con tutte le province del mondo è un compito da
        // centinaia di ms, nel mezzo di un gesto): si preparano a fette brevi a mappa ferma.
        const dp = LOD_METHOD === 'dp';
        const jobs = [];
        const replace = (lv) => {
          for (const it of m.items) if (it.paths) it.paths[lv] = null;
          if (s.borders.paths) s.borders.paths[lv] = null;
          if (s.borders.chunks) s.borders.chunks[lv] = null;
        };
        CANVAS_LOD_TOLS.forEach((tol, i) => {
          if (dp || !s.lod.levels[i]) jobs.push({ job: createLodJob(m, tol, LOD_METHOD), done: (r) => { if (dp || !s.lod.levels[i]) { s.lod.levels[i] = r; if (dp) replace(i); } } });
          if (dp || !s.borders.levels[i]) jobs.push({ job: createBorderLodJob(s.borders, tol, LOD_METHOD), done: (r) => { if (dp || !s.borders.levels[i]) { s.borders.levels[i] = r; if (dp) replace(i); } } });
        });
        const run = () => {
          const j = jobs[0];
          if (!j) return;
          const r = j.job.step(dp ? 6 : 4);
          if (r) { j.done(r); jobs.shift(); }
          later(run, s.moving ? 150 : 0); // durante un gesto si cede il passo
        };
        later(run, 50);
      }, 0);
    })));
  };

  // inquadratura iniziale sulla nazione scelta: una sola volta per nazione, prima del primo disegno
  const focusKey = focus ? `${focus.lon0},${focus.lat0},${focus.lon1},${focus.lat1}` : '';
  useEffect(() => {
    const s = st.current;
    if (!size.w || !focus || s.focusKey === focusKey) return;
    s.focusKey = focusKey;
    s.view = focusView(focus, s.size.w, s.size.h, VB);
    if (s.view.k < minK()) s.view = wrapView(zoomAt(s.view, minK() / s.view.k, VB.x + VB.w / 2, VB.y + VB.h / 2, 0, MAX_K), VB);
  }, [size, focusKey]);

  // mappa pronta: dati caricati, bordi costruiti e tutte le piastrelle dello schermo al livello giusto, stabili per due controlli di fila
  useEffect(() => {
    let steady = 0;
    let lastGen = -1;
    const id = setInterval(() => {
      const s = st.current;
      const ok = props.current.dataReady && s.borders && s.size.w > 0 && baseRef.current?.dataset.tileMiss === '0' && !s.job;
      steady = ok && s.gen === lastGen ? steady + 1 : 0;
      lastGen = s.gen;
      if (steady >= 2) { clearInterval(id); props.current.onReady?.(); }
    }, 250);
    return () => clearInterval(id);
  }, [readyKey]); // si riarma a ogni richiesta di copertura (cambio livello)

  // primo disegno e ridisegno quando cambiano i dati o le opzioni che cambiano la scena
  useEffect(() => {
    if (!size.w) return;
    invalidate();
    blit();
    startBackground();
    const s = st.current;
    if (!s.painted) {
      // i nomi partono solo dopo che la prima schermata è stata presentata (due fotogrammi)
      requestAnimationFrame(() => requestAnimationFrame(() => { s.painted = true; setViewRev((n) => n + 1); }));
    }
  }, [size, model, water, layer, showRivers, seaData, showSeas, transportModel, resourceFills, land]);
  // la selezione della provincia cambia solo la sovrapposizione
  useEffect(() => { paintOverlay(); }, [selectedId, selectedSeaId, seaData, showSeas, layer, anchoredResources, anchoredUnits]);

  // nomi: solo quelli che stanno nella provincia e non si sovrappongono; compaiono a gesto fermo
  useEffect(() => {
    const s = st.current;
    if (!s.size.w || s.moving || !s.painted) return undefined;
    const t = setTimeout(() => {
      if (s.moving) return;
      const p = props.current;
      const l = lay();
      const view = s.view;
      const copies = visibleCopies(view, VB, p.model.bounds);
      // nazioni, province e mari: posizioni già calcolate (data/labels.json), qui si sceglie solo per zoom e vista
      const stat = p.labelData ? pickStaticLabels(p.labelData, view, VB, l.s, copies, { showSeas: p.showSeas }) : [];
      let partial = false;
      let result = stat;
      let lakeCount = 0;
      if (p.showRivers && p.water.lakes.length && view.k >= LAKE_LABEL_MIN_K) {
        const lakeLabels = pickLabels(p.water.lakes, view, VB, l.s, copies, { maxLabels: 30, minPx: 6, maxPx: 15, charW: 0.52, upper: false, avoid: stat.map((x) => x.rect), nameOf: (it) => it.props.name, budgetMs: 40 });
        partial = Boolean(lakeLabels.partial);
        lakeCount = lakeLabels.length;
        result = [...stat, ...lakeLabels.map((x) => ({ ...x, kind: 'lake' }))];
      }
      s.labels = result;
      s.labelsContinue = partial;
      baseRef.current.dataset.labels = String(stat.filter((x) => x.kind === 'prov').length);
      baseRef.current.dataset.nationLabels = String(stat.filter((x) => x.kind === 'nation').length);
      baseRef.current.dataset.seaLabels = String(stat.filter((x) => x.kind === 'sea').length);
      baseRef.current.dataset.lakeLabels = String(lakeCount);
      paintOverlay();
      if (partial) setLabelPass((n) => n + 1);
    }, s.labelsContinue ? 350 : 120);
    return () => clearTimeout(t);
  }, [viewRev, labelPass, showRivers, showSeas, model, water, size, labelData]);

  useEffect(() => () => {
    const s = st.current;
    cancelAnimationFrame(s.raf);
    clearTimeout(s.pumpTimer);
    cancelAnimationFrame(s.fadeRaf);
    clearTimeout(s.idleTimer);
    clearTimeout(s.labelTimer);
  }, []);

  // --- gesti ------------------------------------------------------------------------------------------------
  const clientToLocal = (clientX, clientY) => {
    const r = overlayRef.current.getBoundingClientRect();
    return [clientX - r.left, clientY - r.top];
  };
  const toView = (clientX, clientY) => {
    const [px, py] = clientToLocal(clientX, clientY);
    return screenToView(VB, lay(), px, py);
  };

  const onWheel = (e) => {
    const [cx, cy] = toView(e.clientX, e.clientY);
    applyView(zoomAt(st.current.view, Math.exp(-e.deltaY * 0.0015), cx, cy, minK(), MAX_K));
  };
  const onWheelRef = useRef(onWheel);
  onWheelRef.current = onWheel;
  useEffect(() => {
    const el = overlayRef.current;
    const handler = (e) => { e.preventDefault(); onWheelRef.current(e); };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const tap = (clientX, clientY) => {
    const s = st.current;
    const p = props.current;
    const [px, py] = clientToLocal(clientX, clientY);
    const l = lay();
    const view = s.view;
    const [ux, uy] = screenToUnit(view, VB, l, px, py);
    const copies = visibleCopies(view, VB, p.model.bounds);
    if (p.layer === 'army' && p.onSelectUnits) {
      const hit = hitAt(s.unitHits, px, py); // i segnalini hanno la precedenza su città e province
      if (hit) { p.onSelectUnits({ province: hit.province, nation: hit.nation }); return; }
    }
    const tolCitta = citySnapTolerance(view.k, l.s); // le città piccole si toccano anche un po' fuori dal contorno, ma solo da vicino (vedi citta.js)
    for (const off of copies) {
      const c = nearestCityAt(p.model.items, ux - off, uy, tolCitta);
      if (c) { p.onSelect(c.id); return; }
    }
    for (const off of copies) {
      const it = pickProvinceAt(p.model, ux - off, uy);
      if (it) { p.onSelect(it.id); return; }
    }
    // isole e atolli: se il tocco è vicino (ma fuori dal contorno) vincono sulla zona di mare, che è molto più grande
    const tolIsola = ISLAND_SNAP_PX / (l.s * view.k);
    for (const off of copies) {
      const it = nearestSmallProvinceAt(p.model, ux - off, uy, tolIsola, ISLAND_MAX_PX / (l.s * view.k));
      if (it) { p.onSelect(it.id); return; }
    }
    if (p.showSeas && p.seaData) {
      for (const off of copies) {
        const z = seaZoneAt(p.seaData.zones, (ux - off) / (WORLD_W / 360), -uy);
        if (z) { p.onSelectSea?.(z.id); return; }
      }
    }
    p.onSelect(null);
  };

  const onPointerDown = (e) => {
    const s = st.current;
    s.pointers.set(e.pointerId, [e.clientX, e.clientY]);
    s.moved = false;
    s.gesture = { view: s.view, start: [...s.pointers.values()] };
  };
  const onPointerMove = (e) => {
    const s = st.current;
    if (!s.pointers.has(e.pointerId)) return;
    s.pointers.set(e.pointerId, [e.clientX, e.clientY]);
    const g = s.gesture;
    const pts = [...s.pointers.values()];
    const l = lay();
    if (pts.length === 1 && g.start.length === 1) {
      const dx = pts[0][0] - g.start[0][0];
      const dy = pts[0][1] - g.start[0][1];
      if (!s.moved && Math.hypot(dx, dy) > 5) {
        s.moved = true;
        overlayRef.current.setPointerCapture(e.pointerId);
      }
      if (s.moved) applyView({ k: g.view.k, x: g.view.x + dx / l.s, y: g.view.y + dy / l.s });
    } else if (pts.length === 2 && g.start.length === 2) {
      if (!s.moved) {
        s.moved = true;
        s.pointers.forEach((_, id) => overlayRef.current.setPointerCapture(id));
      }
      const d0 = Math.hypot(g.start[0][0] - g.start[1][0], g.start[0][1] - g.start[1][1]);
      const d1 = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]);
      const [cx, cy] = toView((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
      applyView(zoomAt(g.view, d1 / Math.max(d0, 1), cx, cy, minK(), MAX_K));
    }
  };
  const onPointerUp = (e) => {
    const s = st.current;
    const wasTap = e.type === 'pointerup' && !s.moved && s.pointers.size === 1 && s.pointers.has(e.pointerId);
    s.pointers.delete(e.pointerId);
    s.gesture = s.pointers.size ? { view: s.view, start: [...s.pointers.values()] } : null;
    s.tapAt = wasTap ? [e.clientX, e.clientY] : null;
  };
  // La selezione avviene sul click (come in SVG), non su pointerup: se il pannello si apre e la mappa si ridimensiona
  // prima del click sintetico, questo cadrebbe su un altro controllo (es. la legenda) che nel frattempo si è spostato sotto il dito.
  const onClick = () => {
    const s = st.current;
    const at = s.tapAt;
    s.tapAt = null;
    if (at) tap(at[0], at[1]);
  };

  const zoomButton = (factor) => {
    applyView(zoomAt(st.current.view, factor, VB.x + VB.w / 2, VB.y + VB.h / 2, minK(), MAX_K)); // centro della vista, non dei dati
  };
  const goHome = useCallback(() => {
    const s = st.current;
    s.view = IDENTITY;
    clearTimeout(s.idleTimer);
    settle();
  }, []);

  return (
    <div className="map-wrap" ref={wrapRef}>
      <canvas ref={baseRef} className="map-canvas" aria-hidden="true" />
      <canvas
        ref={overlayRef}
        className="map map-overlay"
        role="img"
        aria-label="Mappa strategica al 1 gennaio 1936 (Europa e Mediterraneo; il mondo si ripete in orizzontale)"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
      />

      {toolsHost ? createPortal(
      <div className="nav-tools" role="toolbar" aria-label="Livelli e zoom">
        <div className="seg">
          {LAYERS.map((l) => (
            <button key={l.id} type="button" className={layer === l.id ? 'on' : ''} aria-pressed={layer === l.id} onClick={() => onLayerChange(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
        <div className="zoom">
          <button type="button" className={showRivers ? 'on' : ''} aria-pressed={showRivers} aria-label="Mostra o nascondi i fiumi" onClick={onToggleRivers}>≈</button>
          {onToggleTransport ? (
            <button type="button" className={showTransport ? 'on' : ''} aria-pressed={Boolean(showTransport)} aria-label="Mostra o nascondi strade e ferrovie" onClick={onToggleTransport}>═</button>
          ) : null}
          <button type="button" className={showSeas ? 'on' : ''} aria-pressed={showSeas} aria-label="Mostra o nascondi le zone marittime" onClick={onToggleSeas}>⚓</button>
          <button type="button" className="zoom-step" aria-label="Ingrandisci" onClick={() => zoomButton(1.6)}>+</button>
          <button type="button" className="zoom-step" aria-label="Riduci" onClick={() => zoomButton(1 / 1.6)}>−</button>
          <button type="button" aria-label="Vista iniziale" onClick={goHome}>⌂</button>
        </div>
      </div>
      , toolsHost) : null}

    </div>
  );
}
