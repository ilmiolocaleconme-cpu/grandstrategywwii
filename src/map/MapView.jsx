import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LAYERS, buildMapModel, buildWaterModel, clampView, cssDelta, provinceFill, zoomAt } from './geo.js';

const LABEL_MIN_K = 2.2; // sotto questo zoom le etichette delle province non si mostrano
const IDENTITY = { k: 1, x: 0, y: 0 };

// Mappa strategica SVG: zoom (rotella, pizzico, pulsanti), spostamento, selezione, livelli.
// Legge le stesse province di data/provinces_1936.json usate dalle regole e dai test.
export default function MapView({ provinces, rivers, riversGeo, lakes, nationNames, selectedId, onSelect, selectedRiverId, onSelectRiver, layer, onLayerChange, showRivers, onToggleRivers }) {
  const model = useMemo(() => buildMapModel(provinces), [provinces]);
  // fiumi e laghi arrivano a parte (caricamento differito): finché mancano, la mappa funziona senza
  const water = useMemo(() => (rivers && riversGeo && lakes ? buildWaterModel(rivers, riversGeo, lakes) : null), [rivers, riversGeo, lakes]);
  const riverNames = useMemo(() => new Map((rivers ?? []).map((r) => [r.id, r.name])), [rivers]);
  const { bounds } = model;
  const pad = bounds.w * 0.02;

  const svgRef = useRef(null);
  const wrapRef = useRef(null);
  // La vista vive in un ref e la trasformazione è scritta direttamente sul DOM: durante il gesto
  // React non ridisegna le centinaia di percorsi. Lo stato `settledK` si aggiorna a gesto finito
  // (serve a etichette e dimensione del testo).
  const viewRef = useRef(IDENTITY); // vista richiesta dal gesto
  const committedRef = useRef(IDENTITY); // vista già scritta nel <g> (rasterizzata)
  const gRef = useRef(null);
  const settleTimer = useRef(null);
  const [settledK, setSettledK] = useState(1);
  const [pxPerUnit, setPxPerUnit] = useState(10);
  const [vb, setVb] = useState(`${bounds.x - pad} ${bounds.y - pad} ${bounds.w + 2 * pad} ${bounds.h + 2 * pad}`);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const moved = useRef(false);

  // Geometria della proiezione viewBox -> pixel (come preserveAspectRatio "xMidYMid meet"), calcolata
  // senza getScreenCTM: durante il gesto l'SVG ha una trasformazione CSS che la falserebbe.
  // L'SVG è grande il doppio dell'area visibile (margine di mezza schermata per lato): così lo
  // spostamento mostra contenuto già disegnato e non serve ridisegnare finché non si esce dal margine.
  const layout = useRef({ s: 10, ex: 0, ey: 0, left: 0, top: 0, w: 1, h: 1 });
  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const vbw = bounds.w + 2 * pad;
    const vbh = bounds.h + 2 * pad;
    const s = Math.min(r.width / vbw, r.height / vbh);
    const ex = (r.width - s * vbw) / 2 - s * (bounds.x - pad);
    const ey = (r.height - s * vbh) / 2 - s * (bounds.y - pad);
    layout.current = { s, ex, ey, left: r.left, top: r.top, w: r.width, h: r.height };
    setPxPerUnit(s);
    setVb(`${(-r.width / 2 - ex) / s} ${(-r.height / 2 - ey) / s} ${(2 * r.width) / s} ${(2 * r.height) / s}`);
    // cambio di dimensioni: la trasformazione CSS pendente non è più valida, si scrive subito la vista
    committedRef.current = viewRef.current;
    gRef.current?.setAttribute('transform', `translate(${viewRef.current.x} ${viewRef.current.y}) scale(${viewRef.current.k})`);
    if (svgRef.current) svgRef.current.style.transform = '';
  }, [bounds, pad]);
  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [measure]);

  // Punto della vista (unità di mappa, prima della trasformazione) sotto un punto dello schermo.
  const toView = (clientX, clientY) => {
    const { s, ex, ey, left, top } = layout.current;
    return [(clientX - left - ex) / s, (clientY - top - ey) / s];
  };

  // Durante il gesto si muove solo lo strato dell'SVG con una trasformazione CSS (compositor, nessuna
  // nuova rasterizzazione e nessun'altra modifica al DOM). La vista viene scritta nel <g> (e
  // l'immagine ridisegnata nitida) solo a dita sollevate e solo se serve: zoom cambiato o
  // spostamento oltre il margine. Un semplice spostamento non ridisegna nulla.
  const commit = useCallback(() => {
    const cur = viewRef.current;
    committedRef.current = cur;
    gRef.current?.setAttribute('transform', `translate(${cur.x} ${cur.y}) scale(${cur.k})`);
    if (svgRef.current) svgRef.current.style.transform = '';
    setSettledK(cur.k);
  }, []);
  const scheduleCommit = useCallback(() => {
    clearTimeout(settleTimer.current);
    if (pointers.current.size > 0) return; // dita ancora sullo schermo: nessun ridisegno
    settleTimer.current = setTimeout(() => {
      const { a, tx, ty } = cssDelta(committedRef.current, viewRef.current, layout.current);
      const { w, h } = layout.current;
      if (Math.abs(a - 1) > 0.001 || Math.abs(tx) > 0.4 * w || Math.abs(ty) > 0.4 * h) commit();
    }, 250);
  }, [commit]);
  const applyView = useCallback((raw) => {
    const v = clampView(raw, bounds);
    viewRef.current = v;
    const { a, tx, ty } = cssDelta(committedRef.current, v, layout.current);
    if (svgRef.current) svgRef.current.style.transform = `translate(${tx}px, ${ty}px) scale(${a})`;
    scheduleCommit();
  }, [bounds, scheduleCommit]);
  useEffect(() => () => clearTimeout(settleTimer.current), []);

  const onWheel = (e) => {
    const [cx, cy] = toView(e.clientX, e.clientY);
    applyView(zoomAt(viewRef.current, Math.exp(-e.deltaY * 0.0015), cx, cy));
  };
  // React registra wheel come passivo: serve un listener nativo per poter chiamare preventDefault.
  useEffect(() => {
    const el = svgRef.current;
    const stop = (e) => e.preventDefault();
    el.addEventListener('wheel', stop, { passive: false });
    return () => el.removeEventListener('wheel', stop);
  }, []);

  const onPointerDown = (e) => {
    // Niente setPointerCapture qui: reindirizzerebbe il click all'SVG e la selezione non partirebbe.
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    moved.current = false;
    gesture.current = { view: viewRef.current, start: [...pointers.current.values()] };
  };
  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    const g = gesture.current;
    const pts = [...pointers.current.values()];
    if (pts.length === 1 && g.start.length === 1) {
      const dx = pts[0][0] - g.start[0][0];
      const dy = pts[0][1] - g.start[0][1];
      if (!moved.current && Math.hypot(dx, dy) > 5) {
        moved.current = true;
        svgRef.current.setPointerCapture(e.pointerId);
      }
      if (moved.current) applyView({ k: g.view.k, x: g.view.x + dx / pxPerUnit, y: g.view.y + dy / pxPerUnit });
    } else if (pts.length === 2 && g.start.length === 2) {
      if (!moved.current) {
        moved.current = true;
        pointers.current.forEach((_, id) => svgRef.current.setPointerCapture(id));
      }
      const d0 = Math.hypot(g.start[0][0] - g.start[1][0], g.start[0][1] - g.start[1][1]);
      const d1 = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]);
      const [cx, cy] = toView((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
      applyView(zoomAt(g.view, d1 / Math.max(d0, 1), cx, cy));
    }
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    gesture.current = pointers.current.size ? { view: viewRef.current, start: [...pointers.current.values()] } : null;
    scheduleCommit();
  };

  const zoomButton = (factor) => {
    const cx = bounds.x + bounds.w / 2;
    const cy = bounds.y + bounds.h / 2;
    applyView(zoomAt(viewRef.current, factor, cx, cy));
  };

  const selected = model.items.find((i) => i.id === selectedId);
  const px = 1 / (pxPerUnit * settledK); // 1 pixel dello schermo in unità di mappa (a gesto finito)

  return (
    <div className="map-wrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        className="map"
        viewBox={vb}
        role="img"
        aria-label="Mappa strategica dell'Europa al 1 gennaio 1936"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <rect x={bounds.x - bounds.w} y={bounds.y - bounds.h} width={bounds.w * 3} height={bounds.h * 3} className="map-sea" onClick={() => !moved.current && onSelect(null)} />
        <g ref={gRef}>
          <ProvinceLayer items={model.items} borderD={model.borderD} layer={layer} selectedId={selectedId} onSelect={onSelect} moved={moved} />
          {showRivers && water && <WaterLayer water={water} riverNames={riverNames} selectedRiverId={selectedRiverId} onSelectRiver={onSelectRiver} moved={moved} />}
          {selected && <path d={selected.d} fillRule="evenodd" className="prov-outline" strokeWidth={2} pointerEvents="none" />}
          {settledK >= LABEL_MIN_K && <Labels items={model.items} px={px} />}
        </g>
      </svg>

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
          <button type="button" aria-label="Vista iniziale" onClick={() => applyView(IDENTITY)}>⌂</button>
        </div>
      </div>

      <Legend layer={layer} nationNames={nationNames} items={model.items} />
    </div>
  );
}

function Legend({ layer, nationNames, items }) {
  const owners = useMemo(() => [...new Set(items.map((i) => i.props.owner))].sort(), [items]);
  if (layer === 'quality') {
    return (
      <ul className="legend" aria-label="Legenda qualità dei confini">
        <li><i style={{ background: provinceFill({ borderQuality: 'verified' }, 'quality') }} />verificato</li>
        <li><i style={{ background: provinceFill({ borderQuality: 'approximate' }, 'quality') }} />approssimato</li>
        <li><i style={{ background: provinceFill({ borderQuality: 'hypothesis' }, 'quality') }} />ipotesi</li>
      </ul>
    );
  }
  return (
    <ul className="legend" aria-label="Legenda nazioni">
      {owners.map((o) => (
        <li key={o}><i style={{ background: provinceFill({ owner: o, id: '' }, 'political') }} />{nationNames[o] ?? o}</li>
      ))}
    </ul>
  );
}

// Strati memorizzati: si ridisegnano solo se cambiano i loro dati, non a ogni gesto.
// Gli spessori sono in pixel dello schermo (vector-effect: non-scaling-stroke nel CSS).
const ProvinceLayer = memo(function ProvinceLayer({ items, borderD, layer, selectedId, onSelect, moved }) {
  return (
    <>
      {items.map((it) => (
        <path
          key={it.id}
          d={it.d}
          fillRule="evenodd"
          fill={provinceFill(it.props, layer)}
          className={it.id === selectedId ? 'prov selected' : 'prov'}
          strokeWidth={0.6}
          data-id={it.id}
          onClick={() => !moved.current && onSelect(it.id)}
        />
      ))}
      <path d={borderD} className="border-national" strokeWidth={1.2} pointerEvents="none" />
    </>
  );
});

const WaterLayer = memo(function WaterLayer({ water, riverNames, selectedRiverId, onSelectRiver, moved }) {
  return (
    <>
      {water.lakes.map((l) => (
        <path key={l.id} d={l.d} fillRule="evenodd" className="lake" strokeWidth={0.6} pointerEvents="none" />
      ))}
      {water.lines.map((l) => (
        <g key={l.key}>
          <path d={l.d} className={l.inLake ? 'river in-lake' : 'river'} strokeWidth={l.riverId === selectedRiverId ? l.width + 1.5 : l.width} pointerEvents="none" />
          <path d={l.d} className="river-hit" strokeWidth={12} onClick={() => !moved.current && onSelectRiver(l.riverId)}>
            <title>{riverNames.get(l.riverId)}</title>
          </path>
        </g>
      ))}
    </>
  );
});

const Labels = memo(function Labels({ items, px }) {
  return items.map((it) => (
    <text key={it.id} x={it.label[0]} y={it.label[1]} fontSize={11 * px} className="map-label" strokeWidth={3 * px} textAnchor="middle" pointerEvents="none">
      {it.props.nameLocal ?? it.props.name}
    </text>
  ));
});
