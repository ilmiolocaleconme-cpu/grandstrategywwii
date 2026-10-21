// Schermata di caricamento: illustrazione originale (globo con meridiani e una stella) e barra di avanzamento.

// `done`/`total`: file di province già caricati / da caricare (total 0 = ancora sconosciuto → barra indeterminata).
import { loadingPercent } from './loadingPercent.js';

export default function LoadingScreen({ done = 0, total = 0, error = null }) {
  const pct = loadingPercent(done, total);
  const known = total > 0;
  const meridians = [-60, -30, 0, 30, 60];
  return (
    <main className="loading-screen" role="status" aria-live="polite">
      <svg className="loading-art" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
        <circle cx="100" cy="100" r="86" className="la-sea" />
        <g className="la-grid">
          {meridians.map((a) => <ellipse key={a} cx="100" cy="100" rx={Math.abs(86 * Math.sin((a * Math.PI) / 180)) || 1} ry="86" />)}
          {[-60, -30, 0, 30, 60].map((lat) => {
            const y = 100 - 86 * Math.sin((lat * Math.PI) / 180);
            const half = 86 * Math.cos((lat * Math.PI) / 180);
            return <line key={lat} x1={100 - half} x2={100 + half} y1={y} y2={y} />;
          })}
        </g>
        <circle cx="100" cy="100" r="86" className="la-rim" />
        <polygon className="la-star" points="100,70 107,92 130,92 112,105 119,127 100,114 81,127 88,105 70,92 93,92" />
      </svg>
      <h1 className="loading-title">Grand Strategy WWII</h1>
      <p className="loading-sub">1936 — il mondo alla vigilia della guerra</p>
      {error ? (
        <>
          <p className="warn">Province non caricate: {error.message ?? 'errore sconosciuto'}</p>
          <button type="button" onClick={() => window.location.reload()}>Ricarica</button>
        </>
      ) : (
        <>
          <div className={`loading-bar${known ? '' : ' indeterminate'}`} role="progressbar" aria-label="Caricamento delle province" aria-valuemin={0} aria-valuemax={100} aria-valuenow={known ? pct : undefined}>
            <span style={known ? { width: `${pct}%` } : undefined} />
          </div>
          <p className="loading-note">{known ? `Caricamento delle province… ${pct}% (${done}/${total})` : 'Preparazione…'}</p>
        </>
      )}
    </main>
  );
}
