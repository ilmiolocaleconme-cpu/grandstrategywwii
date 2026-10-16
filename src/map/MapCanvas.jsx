import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createNationLabelJob, placeNationLabels } from './nationLabels.js';
import { HOME_BOUNDS, LAYERS, RIVER_WIDTH_PX, riverRankLimit, pickLabels, visibleCopies, wrapView, zoomAt } from './geo.js';
import { buildBorders, buildCanvasModel, buildCanvasWater, createBorderLodJob, createLodJob, pickProvinceAt, pickRiverNear, CANVAS_LOD_TOLS } from './canvasModel.js';
import { affineOf, blitPlan, coversScreen, layoutOf, lodLevelForScale, screenToUnit, screenToView } from './canvasView.js';
import { COLORS, drawOverlay, renderBase } from './canvasDraw.js';
import { Legend } from './MapView.jsx';

// Mappa strategica su Canvas 2D (PROTOTIPO, attivabile con ?map=canvas): React resta per interfaccia, pannelli,
// selezione, livelli e legenda; la mappa si disegna su due tele (scena e sovrapposizione) e il gesto non passa da React:
// durante il trascinamento e lo zoom si ridisegna solo un'immagine già pronta (bitmap con margine), e il dettaglio
// pieno torna a gesto fermo. Stesse province, fiumi e laghi di MapView (nessun dato duplicato).

const IDENTITY = { k: 1, x: 0, y: 0 };
const PROVINCE_MIN_LABEL_PX = 5;
const PROVINCE_LABEL_MIN_K = 8; // i nomi delle province compaiono solo da questo zoom in su (più alto = meno lavoro e mappa più pulita)
const MIN_K = 0.3;
const MAX_DPR = 2; // oltre, il costo di disegno cresce senza vantaggi visibili
const MARGIN = 0.3; // margine della bitmap attorno allo schermo (frazione di W e H)
const LOD_METHOD = 'radial'; // 'radial' (veloce, usata) o 'dp' (Douglas-Peucker in secondo piano: più fedele, ma ricostruisce i tracciati)
const IDLE_MS = 160; // gesto fermo: dettaglio pieno e nomi
const PAD = HOME_BOUNDS.w * 0.02;
const VB = { x: HOME_BOUNDS.x - PAD, y: HOME_BOUNDS.y - PAD, w: HOME_BOUNDS.w + 2 * PAD, h: HOME_BOUNDS.h + 2 * PAD };
const EMPTY_WATER = { lines: [], lakes: [] };

// la vista può cambiare quanto vuole in orizzontale durante il gesto (il giro del mondo si normalizza a gesto fermo); in verticale restano i poli
// rettangolo visibile in unità di mappa (copia base del mondo): serve a far scorrere le scritte delle nazioni dentro lo schermo
const nationVisible = (view, l, size) => {
  const a = affineOf(view, VB, l);
  return { x0: -a.tx / a.sx, x1: (size.w - a.tx) / a.sx, y0: -a.ty / a.sx, y1: (size.h - a.ty) / a.sx };
};
const clampY = (v) => ({ k: v.k, x: v.x, y: wrapView(v, VB).y });

export default function MapCanvas({ provinces, rivers, riversGeo, lakes, nationNames, nationControl, selectedId, onSelect, selectedRiverId, onSelectRiver, layer, onLayerChange, showRivers, onToggleRivers }) {
  const model = useMemo(() => buildCanvasModel(provinces), [provinces]);
  const water = useMemo(
    () => (rivers && riversGeo && lakes ? buildCanvasWater(rivers, riversGeo, lakes, (r) => RIVER_WIDTH_PX[r?.widthClass] ?? RIVER_WIDTH_PX.small, (r) => r?.scalerank ?? 99) : EMPTY_WATER),
    [rivers, riversGeo, lakes],
  );
  const wrapRef = useRef(null);
  const baseRef = useRef(null);
  const overlayRef = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [viewRev, setViewRev] = useState(0); // sale a ogni assestamento della vista: fa ripartire il calcolo dei nomi
  const [labelPass, setLabelPass] = useState(0);
  const [legendOpen, setLegendOpen] = useState(false);

  // stato mutabile del disegno: fuori da React, così il gesto non provoca ridisegni dell'interfaccia
  const st = useRef({ view: IDENTITY, cache: null, labels: [], lod: { levels: [] }, borders: null, dpr: 1, size: { w: 0, h: 0 }, raf: 0, idleTimer: 0, renderTimer: 0, labelTimer: 0, labelsContinue: false, pointers: new Map(), gesture: null, moved: false });
  // ultimi valori delle proprietà (letti dalle funzioni di disegno senza ricrearle)
  const props = useRef({});
  props.current = { model, water, layer, nationNames, nationControl, selectedId, selectedRiverId, showRivers, onSelect, onSelectRiver };

  const lay = () => layoutOf(VB, st.current.size.w, st.current.size.h);

  // --- disegno --------------------------------------------------------------------------------------------
  const copiesFor = (view, region, l) => {
    const [x0, y0] = screenToView(VB, l, region.x, region.y);
    const [x1, y1] = screenToView(VB, l, region.x + region.w, region.y + region.h);
    return visibleCopies(view, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, props.current.model.bounds);
  };

  // versione semplificata per lo zoom corrente: se la definitiva (Douglas-Peucker, in secondo piano) non è ancora pronta
  // se ne ricava subito una veloce, così la prima schermata non disegna tutti i 222.000 vertici
  const ensureLevel = (view) => {
    const s = st.current;
    const lv = lodLevelForScale(affineOf(view, VB, lay()).sx, CANVAS_LOD_TOLS);
    if (lv >= CANVAS_LOD_TOLS.length) return;
    if (!s.lod.levels[lv]) s.lod.levels[lv] = createLodJob(props.current.model, CANVAS_LOD_TOLS[lv], 'radial').step(Infinity);
    if (s.borders && !s.borders.levels[lv]) s.borders.levels[lv] = createBorderLodJob(s.borders, CANVAS_LOD_TOLS[lv], 'radial').step(Infinity);
  };

  const renderCache = () => {
    const s = st.current;
    const { w, h } = s.size;
    if (!w || !h) return;
    const p = props.current;
    const dpr = s.dpr;
    const mx = Math.round(w * MARGIN);
    const my = Math.round(h * MARGIN);
    const region = { x: -mx, y: -my, w: w + 2 * mx, h: h + 2 * my };
    let c = s.cache?.canvas;
    const pw = Math.round(region.w * dpr);
    const ph = Math.round(region.h * dpr);
    if (!c || c.width !== pw || c.height !== ph) { c = document.createElement('canvas'); c.width = pw; c.height = ph; }
    const l = lay();
    const view = s.view;
    ensureLevel(view);
    renderBase(c.getContext('2d'), { model: p.model, lod: s.lod, borders: s.borders, water: p.water.lines.length ? p.water : null, view, vb: VB, lay: l, dpr, region, layer: p.layer, nationControl: p.nationControl, showRivers: p.showRivers, selectedRiverId: p.selectedRiverId, copies: copiesFor(view, region, l), trace: window.__gsTrace });
    s.cache = { canvas: c, view: { ...view }, region };
    baseRef.current.dataset.drawn = '1';
    if (p.water.lines.length && p.showRivers) baseRef.current.dataset.water = '1';
  };

  const paintOverlay = () => {
    const s = st.current;
    const o = overlayRef.current;
    if (!o || !s.size.w) return;
    const p = props.current;
    const l = lay();
    const copies = visibleCopies(s.view, VB, p.model.bounds);
    drawOverlay(o.getContext('2d'), { model: p.model, lod: s.lod, view: s.view, vb: VB, lay: l, dpr: s.dpr, selectedId: p.selectedId, labels: s.labels, copies, nation: placeNationLabels(s.nation, s.view.k, l.s, copies, { visible: nationVisible(s.view, l, s.size) }) });
  };

  // porta l'ultima immagine disegnata alla vista corrente (trascinamento e zoom costano solo questo)
  const blit = () => {
    const s = st.current;
    const base = baseRef.current;
    if (!base || !s.size.w) return;
    const ctx = base.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = COLORS.sea;
    ctx.fillRect(0, 0, base.width, base.height);
    const c = s.cache;
    if (c) {
      const plan = blitPlan(c.view, s.view, VB, lay(), c.region);
      ctx.drawImage(c.canvas, 0, 0, c.canvas.width, c.canvas.height, plan.x * s.dpr, plan.y * s.dpr, plan.w * s.dpr, plan.h * s.dpr);
      // bordi vuoti o immagine troppo ingrandita/rimpicciolita: serve un nuovo disegno senza aspettare la fine del gesto
      if (!coversScreen(plan, s.size.w, s.size.h)) scheduleRender(0);
      else if (plan.r > 1.8 || plan.r < 0.55) scheduleRender(80);
    }
    paintOverlay();
  };

  const scheduleRender = (delay) => {
    const s = st.current;
    clearTimeout(s.renderTimer);
    s.renderTimer = setTimeout(() => { renderCache(); blit(); }, delay);
  };

  const requestFrame = () => {
    const s = st.current;
    if (s.raf) return;
    s.raf = requestAnimationFrame(() => { s.raf = 0; blit(); });
  };

  // gesto fermo: giro del mondo normalizzato, dettaglio pieno, poi i nomi
  const settle = () => {
    const s = st.current;
    s.moving = false;
    s.view = wrapView(s.view, VB);
    clearTimeout(s.renderTimer);
    renderCache();
    blit();
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
      s.dpr = dpr;
      for (const cv of [baseRef.current, overlayRef.current]) { cv.width = Math.round(s.size.w * dpr); cv.height = Math.round(s.size.h * dpr); }
      s.cache = null;
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
    s.nation = null;
    s.lod = { levels: [] };
    s.bgDone = false;
    s.cache = null;
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
        if (!s.moving) { renderCache(); blit(); }
        // nomi delle nazioni: calcolo una tantum a fette brevi (non blocca i gesti); poi si ridisegna lo strato dei nomi
        const nj = createNationLabelJob(m.items, props.current.nationNames, props.current.nationControl);
        const nstep = () => {
          const r = nj.step(6);
          if (r) { s.nation = r; paintOverlay(); return; }
          later(nstep, 0);
        };
        later(nstep, 30);
        if (LOD_METHOD !== 'dp') return; // con il metodo veloce non serve altro
        const jobs = [];
        const replace = (lv) => {
          for (const it of m.items) if (it.paths) it.paths[lv] = null;
          if (s.borders.paths) s.borders.paths[lv] = null;
        };
        CANVAS_LOD_TOLS.forEach((tol, i) => {
          jobs.push({ job: createLodJob(m, tol, 'dp'), done: (r) => { s.lod.levels[i] = r; replace(i); } });
          jobs.push({ job: createBorderLodJob(s.borders, tol, 'dp'), done: (r) => { s.borders.levels[i] = r; replace(i); } });
        });
        const run = () => {
          const j = jobs[0];
          if (!j) return;
          const r = j.job.step(6);
          if (r) { j.done(r); jobs.shift(); }
          later(run, 0);
        };
        later(run, 50);
      }, 0);
    })));
  };

  // primo disegno e ridisegno quando cambiano i dati o le opzioni che cambiano la scena
  useEffect(() => {
    if (!size.w) return;
    renderCache();
    blit();
    startBackground();
    const s = st.current;
    if (!s.painted) {
      // i nomi partono solo dopo che la prima schermata è stata presentata (due fotogrammi)
      requestAnimationFrame(() => requestAnimationFrame(() => { s.painted = true; setViewRev((n) => n + 1); }));
    }
  }, [size, model, water, layer, showRivers, selectedRiverId]);
  // la selezione della provincia cambia solo la sovrapposizione
  useEffect(() => { paintOverlay(); }, [selectedId]);

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
      const provRaw = view.k >= PROVINCE_LABEL_MIN_K ? pickLabels(p.model.items, view, VB, l.s, copies, { budgetMs: 50, minPx: PROVINCE_MIN_LABEL_PX }) : [];
      const prov = provRaw.map((x) => ({ ...x, kind: 'prov' }));
      let partial = Boolean(provRaw.partial);
      let result = prov;
      let lakeCount = 0;
      if (p.showRivers && p.water.lakes.length) {
        const lakeLabels = pickLabels(p.water.lakes, view, VB, l.s, copies, { maxLabels: 30, minPx: 6, maxPx: 15, charW: 0.52, upper: false, avoid: prov.map((x) => x.rect), nameOf: (it) => it.props.name, budgetMs: 40 });
        partial = partial || Boolean(lakeLabels.partial);
        lakeCount = lakeLabels.length;
        result = [...prov, ...lakeLabels.map((x) => ({ ...x, kind: 'lake' }))];
      }
      s.labels = result;
      s.labelsContinue = partial;
      baseRef.current.dataset.labels = String(prov.length);
      baseRef.current.dataset.lakeLabels = String(lakeCount);
      paintOverlay();
      if (partial) setLabelPass((n) => n + 1);
    }, s.labelsContinue ? 350 : 120);
    return () => clearTimeout(t);
  }, [viewRev, labelPass, showRivers, model, water, size]);

  useEffect(() => () => {
    const s = st.current;
    cancelAnimationFrame(s.raf);
    clearTimeout(s.idleTimer);
    clearTimeout(s.renderTimer);
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
    applyView(zoomAt(st.current.view, Math.exp(-e.deltaY * 0.0015), cx, cy, MIN_K));
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
    if (p.showRivers && p.water.lines.length) {
      const tol = 6 / (l.s * view.k); // la zona sensibile dei fiumi è larga 12 pixel, come in SVG
      for (const off of copies) {
        const id = pickRiverNear(p.water, ux - off, uy, tol, riverRankLimit(view.k), p.selectedRiverId);
        if (id) { p.onSelectRiver(id); return; }
      }
    }
    for (const off of copies) {
      const it = pickProvinceAt(p.model, ux - off, uy);
      if (it) { p.onSelect(it.id); return; }
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
      applyView(zoomAt(g.view, d1 / Math.max(d0, 1), cx, cy, MIN_K));
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
    applyView(zoomAt(st.current.view, factor, VB.x + VB.w / 2, VB.y + VB.h / 2, MIN_K)); // centro della vista, non dei dati
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

      <div className="map-tools" role="toolbar" aria-label="Livelli e zoom">
        <div className="seg">
          {LAYERS.map((l) => (
            <button key={l.id} type="button" className={layer === l.id ? 'on' : ''} aria-pressed={layer === l.id} onClick={() => onLayerChange(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
        <div className="zoom">
          <button type="button" className={showRivers ? 'on' : ''} aria-pressed={showRivers} aria-label="Mostra o nascondi i fiumi" onClick={onToggleRivers}>≈</button>
          <button type="button" aria-label="Ingrandisci" onClick={() => zoomButton(1.6)}>+</button>
          <button type="button" aria-label="Riduci" onClick={() => zoomButton(1 / 1.6)}>−</button>
          <button type="button" aria-label="Vista iniziale" onClick={goHome}>⌂</button>
        </div>
      </div>

      <Legend layer={layer} nationNames={nationNames} nationControl={nationControl} items={model.items} open={legendOpen} onToggle={() => setLegendOpen((o) => !o)} />
    </div>
  );
}
