import { useEffect, useRef } from 'react';
import { transportLegend } from './transportView.js';
import { bridgeLegend, drawSwatch } from './transportStyle.js';

// Campione della legenda: lo stesso disegno della mappa a zoom alto (transportStyle.drawSwatch), su una piccola tela.
function Swatch({ spec, w = 44, h = 24 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr;
    c.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawSwatch(ctx, spec, w, h);
  }, [spec, w, h]);
  return <canvas ref={ref} style={{ width: w, height: h }} aria-hidden="true" />;
}

// Legenda di strade, ferrovie e ponti (i ponti sono tratti della linea): stesso disegno della mappa.
export default function TransportLegend() {
  return (
    <ul className="bridge-legend" aria-label="Legenda di strade, ferrovie e ponti">
      {transportLegend().map((t) => (
        <li key={t.key}>
          <Swatch spec={t.spec} />
          <span><b>{t.label}</b></span>
        </li>
      ))}
      {bridgeLegend().map((b) => (
        <li key={b.id}>
          <Swatch spec={b.spec} />
          <span><b>{b.label}</b></span>
        </li>
      ))}
      <li className="note"><span>Rete moderna, non del 1936. Livelli provvisori. Le strade compaiono solo avvicinandosi molto. Avvicinati per vedere corsie, binari e ponti.</span></li>
    </ul>
  );
}
