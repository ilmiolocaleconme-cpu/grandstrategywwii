import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LAYERS, buildLod, buildMapModel, lodLevel, buildWaterModel, pickLabels, controllerOf, provinceFill, visibleCopies, wrapView, zoomAt } from './geo.js';

const IDENTITY = { k: 1, x: 0, y: 0 };
const MIN_K = 0.3; // si puo allontanare fino a vedere quasi tutto il giro del mondo

// Mappa strategica SVG: zoom (rotella, pizzico, pulsanti), spostamento, selezione, livelli.
// Legge le stesse province (data/provinces/, un file per nazione, uniti in memoria) usate dalle regole e dai test.
export default function MapView({ provinces, rivers, riversGeo, lakes, nationNames, nationControl, selectedId, onSelect, selectedRiverId, onSelectRiver, layer, onLayerChange, showRivers, onToggleRivers }) {
  const model = useMemo(() => buildMapModel(provinces), [provinces]);
  // fiumi e laghi arrivano a parte (caricamento differito): finché mancano, la mappa funziona senza
  const water = useMemo(() => (rivers && riversGeo && lakes ? buildWaterModel(rivers, riversGeo, lakes) : { lines: [], lakes: [] }), [rivers, riversGeo, lakes]);
  const riverNames = useMemo(() => new Map((rivers ?? []).map((r) => [r.id, r.name])), [rivers]);
  const { bounds } = model;
  const pad = bounds.w * 0.02;
  const vbRect = { x: bounds.x - pad, y: bounds.y - pad, w: bounds.w + 2 * pad, h: bounds.h + 2 * pad };
  const vb = `${vbRect.x} ${vbRect.y} ${vbRect.w} ${vbRect.h}`;

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
    setView(wrapView(v, vbRect)); // il mondo si ripete in orizzontale (circumnavigabile); in verticale restano i poli
    setMoving(true);
    clearTimeout(movingTimer.current);
    movingTimer.current = setTimeout(() => setMoving(false), 160);
  }, [vbRect.x, vbRect.y, vbRect.w, vbRect.h]);

  const onWheel = (e) => {
    const [cx, cy] = toView(e.clientX, e.clientY);
    applyView(zoomAt(view, Math.exp(-e.deltaY * 0.0015), cx, cy, MIN_K));
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
      applyView(zoomAt(g.view, d1 / Math.max(d0, 1), cx, cy, MIN_K));
    }
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    gesture.current = pointers.current.size ? { view, start: [...pointers.current.values()] } : null;
  };

  const zoomButton = (factor) => {
    const cx = vbRect.x + vbRect.w / 2; // centro della vista, non dei dati: la vista puo essere ovunque nel mondo
    const cy = vbRect.y + vbRect.h / 2;
    applyView(zoomAt(view, factor, cx, cy, MIN_K));
  };

  const selected = model.items.find((i) => i.id === selectedId);
  const px = 1 / (pxPerUnit * view.k); // 1 pixel dello schermo in unità di mappa
  const level = moving && lod ? lodLevel(view.k) : -1;
  const waterLevel = moving ? lodLevel(view.k) : -1; // fiumi e laghi restano visibili, con meno punti
  const copies = visibleCopies(view, vbRect, bounds); // di norma una sola; due quando la vista attraversa l'antimeridiano
  const [legendOpen, setLegendOpen] = useState(false);
  // etichette: solo quelle che stanno nella provincia e non si sovrappongono; nascoste durante il gesto
  // il nome sta dentro la forma (corpo, posizione e rotazione calcolati sulla provincia o sul lago)
  const labels = useMemo(() => {
    if (moving) return [];
    const prov = pickLabels(model.items, view, vbRect, pxPerUnit, copies).map((l) => ({ ...l, kind: 'prov' }));
    if (!showRivers) return prov;
    const lakeLabels = pickLabels(water.lakes, view, vbRect, pxPerUnit, copies, {
      maxLabels: 30, minPx: 6, maxPx: 15, charW: 0.52, upper: false, avoid: prov.map((l) => l.rect), nameOf: (it) => it.props.name,
    }).map((l) => ({ ...l, kind: 'lake' }));
    return [...prov, ...lakeLabels];
  }, [moving, model.items, water.lakes, showRivers, view, pxPerUnit, vbRect.x, vbRect.y, vbRect.w, vbRect.h, copies.join()]);

  return (
    <div className="map-wrap">
      <svg
        ref={svgRef}
        className="map"
        viewBox={vb}
        role="img"
        aria-label="Mappa strategica al 1 gennaio 1936 (Europa e Mediterraneo; il mondo si ripete in orizzontale)"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <rect x={bounds.x - bounds.w} y={bounds.y - bounds.h} width={bounds.w * 3} height={bounds.h * 3} className="map-sea" onClick={() => !moved.current && onSelect(null)} />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {copies.map((off) => (
            <g key={off} transform={off ? `translate(${off} 0)` : undefined}>
              {model.items.map((it) => (
                <path
                  key={it.id}
                  d={level >= 0 ? lod.items.get(it.id)[level] : it.d}
                  fillRule="evenodd"
                  fill={provinceFill(it.props, layer, nationControl)}
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
              {labels.filter((l) => l.off === off).map((l) => (
                <text key={l.id} x={l.x} y={l.y} fontSize={l.size} textLength={l.length} lengthAdjust="spacingAndGlyphs" className={l.kind === 'lake' ? 'map-label lake-label' : 'map-label'} strokeWidth={0.2 * l.size} textAnchor="middle" dominantBaseline="central" transform={l.angle ? `rotate(${l.angle.toFixed(1)} ${l.x} ${l.y})` : undefined} pointerEvents="none">
                  {l.name}
                </text>
              ))}
            </g>
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

      <Legend layer={layer} nationNames={nationNames} nationControl={nationControl} items={model.items} open={legendOpen} onToggle={() => setLegendOpen((o) => !o)} />
    </div>
  );
}

function Legend({ layer, nationNames, nationControl, items, open, onToggle }) {
  const owners = useMemo(() => [...new Set(items.map((i) => controllerOf(i.props.owner, nationControl)))].sort(), [items, nationControl]);
  const entries = layer === 'quality'
    ? [['verificato', provinceFill({ borderQuality: 'verified' }, 'quality')], ['approssimato', provinceFill({ borderQuality: 'approximate' }, 'quality')], ['ipotesi', provinceFill({ borderQuality: 'hypothesis' }, 'quality')]]
    : owners.map((o) => [nationNames[o] ?? o, provinceFill({ owner: o, id: '' }, 'political')]);
  return (
    <div className="legend-box">
      <button type="button" className="legend-toggle" aria-expanded={open} onClick={onToggle}>
        Legenda {open ? '▾' : '▴'}
      </button>
      {open && (
        <ul className="legend" aria-label={layer === 'quality' ? 'Legenda qualità dei confini' : 'Legenda nazioni'}>
          {entries.map(([name, color]) => (
            <li key={name}><i style={{ background: color }} />{name}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
