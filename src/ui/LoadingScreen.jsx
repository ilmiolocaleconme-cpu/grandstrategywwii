// Schermata di caricamento: immagine d'apertura (public/loading/loading-art.webp) e barra di avanzamento.

// `done`/`total`: file di province già caricati / da caricare (total 0 = ancora sconosciuto → barra indeterminata).
import { loadingPercent } from './loadingPercent.js';
import Flag from './Flag.jsx';

// Con `nation` (partita appena avviata) al posto dell'immagine d'apertura c'è la bandiera della nazione scelta e la barra segue i
// passi di caricamento della mappa (`steps`: elenco di { label, done }); la mappa sta già disegnandosi sotto, nascosta.
export default function LoadingScreen({ done = 0, total = 0, error = null, nation = null }) {
  if (nation) {
    const done_ = nation.steps.filter((x) => x.done).length;
    const pct = Math.round((done_ / nation.steps.length) * 100);
    const next = nation.steps.find((x) => !x.done);
    return (
      <main className="loading-screen nation-loading" role="status" aria-live="polite">
        <Flag flag={nation.flag} className="loading-flag" style={nation.flag ? { width: `min(70vw, 300px, calc(36vh * ${nation.flag.w / nation.flag.h}))`, aspectRatio: `${nation.flag.w} / ${nation.flag.h}` } : { width: 'min(60vw, 200px)', aspectRatio: '3 / 2' }} />
        <h1 className="loading-title">{nation.name}</h1>
        <p className="loading-sub">1936 — preparazione della mappa</p>
        <div className="loading-bar" role="progressbar" aria-label="Caricamento della mappa" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="loading-note">{next ? `${next.label}… ${pct}%` : 'Quasi pronto…'}</p>
      </main>
    );
  }
  const pct = loadingPercent(done, total);
  const known = total > 0;
  return (
    <main className="loading-screen" role="status" aria-live="polite">
      <div className="loading-art">
        <img src="loading/loading-art.webp" alt="" width="1024" height="521" />
      </div>
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
          <p className="loading-note">{known ? `Caricamento dei dati… ${pct}% (${done}/${total})` : 'Preparazione…'}</p>
        </>
      )}
    </main>
  );
}
