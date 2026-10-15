import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LAYERS, buildLod, buildMapModel, lodLevel, buildWaterModel, clampView, provinceFill, zoomAt } from './geo.js';

const LABEL_MIN_K = 2.2; // sotto questo zoom le etichette delle province non si mostrano
const IDENTITY = { k: 1, x: 0, y: 0 };

// Mappa strategica SVG: zoom (rotella, pizzico, pulsanti), spostamento, selezione, livelli.
// Legge le stesse province di data/provinces_1936.json usate dalle regole e dai test.
export default function MapView({ provinces, rivers, riversGeo, lakes, nationNames, selectedId, onSelect, selectedRiverId, onSelectRiver, layer, onLayerChange, showRivers, onToggleRivers }) {
  const model = useMemo(() => buildMapModel(provinces), [provinces]);
  // fiumi e laghi arrivano a parte (caricamento differito): finché mancano, la mappa funziona senza
  const water = useMemo(() => (rivers && riversGeo && lakes ? buildWaterModel(rivers, riversGeo, lakes) : { lines: [], lakes: [] }), [rivers, riversGeo, lakes]);
  const riverNames = useMemo(() => new Map((rivers ?? []).map((r) => [r.id, r.name])), [rivers]);
  const { bounds } = model;
  const pad = bounds.w * 0.02;
  const vb = `${bounds.x - pad} ${bounds.y - pad} ${bounds.w + 2 * pad} ${bounds.h + 2 * pad}`;

  const svgRef = useRef(null);
  const [view, setView] = useState(IDENTITY);
  const [pxPerUnit, setPxPerUnit] = useState(10);
  // Durante il gesto si disegnano versioni con meno punti e senza fiumi (telefoni con poca memoria/GPU);
  // a gesto fermo torna il dettaglio pieno. Le versioni semplificate si calcolano dopo la prima schermata.
  const [moving, setMoving] = useState(false);
  const [lod, setLod] = useState(null);
  const movingTimer = useRef(null);
  useEffect(() => {
    const t = setTimeout(() => setLod(buildLod(provinces)), 300);
    return () => { clearTimeout(t); clearTimeout(movingTimer.current); };
  }, [provinces]);
  const pointers = useRef(new Map());
  const gesture = useRef(null);
  const moved = useRef(false);

  const measure = useCallback(() => {
    const ctm = svgRef.current?.getScreenCTM();
    if (ctm) setPxPerUnit(ctm.a);
  }, []);
  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(svgRef.current);
    return () => ro.disconnect();
  }, [measure]);

  // Punto della vista (unità di mappa, prima della trasformazione) sotto un punto dello schermo.
  const toView = (clientX, clientY) => {
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return [p.x, p.y];
  };

  const applyView = useCallback((v) => {
    setView(clampView(v, bounds));
    setMoving(true);
    clearTimeout(movingTimer.current);
    movingTimer.current = setTimeout(() => setMoving(false), 160);
  }, [bounds]);

  const onWheel = (e) => {
    const [cx, cy] = toView(e.clientX, e.clientY);
    applyView(zoomAt(view, Math.exp(-e.deltaY * 0.0015), cx, cy));
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
    gesture.current = { view, start: [...pointers.current.values()] };
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
    gesture.current = pointers.current.size ? { view, start: [...pointers.current.values()] } : null;
  };

  const zoomButton = (factor) => {
    const cx = bounds.x + bounds.w / 2;
    const cy = bounds.y + bounds.h / 2;
    applyView(zoomAt(view, factor, cx, cy));
  };

  const selected = model.items.find((i) => i.id === selectedId);
  const px = 1 / (pxPerUnit * view.k); // 1 pixel dello schermo in unità di mappa
  const level = moving && lod ? lodLevel(view.k) : -1;
  const waterLevel = moving ? lodLevel(view.k) : -1; // fiumi e laghi restano visibili, con meno punti

  return (
    <div className="map-wrap">
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
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {model.items.map((it) => (
            <path
              key={it.id}
              d={level >= 0 ? lod.items.get(it.id)[level] : it.d}
              fillRule="evenodd"
              fill={provinceFill(it.props, layer)}
              className={it.id === selectedId ? 'prov selected' : 'prov'}
              strokeWidth={0.6 * px}
              data-id={it.id}
              onClick={() => !moved.current && onSelect(it.id)}
            />
          ))}
          <path d={level >= 0 ? lod.borders[level] : model.borderD} className="border-national" strokeWidth={1.2 * px} pointerEvents="none" />
          {showRivers && water.lakes.map((l) => (
            <path key={l.id} d={waterLevel >= 0 ? l.low[waterLevel] : l.d} fillRule="evenodd" className="lake" strokeWidth={0.6 * px} pointerEvents="none" />
          ))}
          {showRivers && water.lines.map((l) => (
            <g key={l.key}>
              <path d={waterLevel >= 0 ? l.low[waterLevel] : l.d} className={l.inLake ? 'river in-lake' : 'river'} strokeWidth={(l.riverId === selectedRiverId ? l.width + 1.5 : l.width) * px} pointerEvents="none" />
              {!moving && (
                <path d={l.d} className="river-hit" strokeWidth={12 * px} onClick={() => !moved.current && onSelectRiver(l.riverId)}>
                  <title>{riverNames.get(l.riverId)}</title>
                </path>
              )}
            </g>
          ))}
          {selected && <path d={selected.d} fillRule="evenodd" className="prov-outline" strokeWidth={2 * px} pointerEvents="none" />}
          {view.k >= LABEL_MIN_K &&
            model.items.map((it) => (
              <text key={it.id} x={it.label[0]} y={it.label[1]} fontSize={11 * px} className="map-label" strokeWidth={3 * px} textAnchor="middle" pointerEvents="none">
                {it.props.nameLocal ?? it.props.name}
              </text>
            ))}
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
          <button type="button" aria-label="Vista iniziale" onClick={() => setView(IDENTITY)}>⌂</button>
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
