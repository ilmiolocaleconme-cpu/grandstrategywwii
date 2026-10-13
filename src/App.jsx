import { useEffect, useMemo, useState } from 'react';
import nations from '../data/nations.json';
import resources from '../data/resources.json';
import rivers from '../data/rivers.json';
import crossings from '../data/crossings.json';
import { validateCatalog } from './data/validate.js';
import { initPwa } from './pwa.js';

// Schermata iniziale provvisoria: mostra i dati reali caricati e il loro stato di
// validazione. La mappa e le meccaniche di gioco non sono ancora implementate.
export default function App() {
  const [selected, setSelected] = useState(null);
  const [pwa, setPwa] = useState({ offlineReady: false, updateAvailable: false, error: null });
  const [applyUpdate, setApplyUpdate] = useState(null);

  const validation = useMemo(
    () => validateCatalog({ nations, resources, rivers, crossings }),
    [],
  );

  useEffect(() => {
    const update = initPwa({
      onOfflineReady: () => setPwa((s) => ({ ...s, offlineReady: true })),
      onUpdateAvailable: () => setPwa((s) => ({ ...s, updateAvailable: true })),
      onError: (error) => setPwa((s) => ({ ...s, error })),
    });
    setApplyUpdate(() => update);
  }, []);

  return (
    <main className="app">
      <header>
        <h1>Grand Strategy WWII</h1>
        <p className="muted">Prototipo dell&apos;infrastruttura: nessuna meccanica di gioco ancora attiva.</p>
      </header>

      <section aria-labelledby="nations-title">
        <h2 id="nations-title">Scegli una nazione</h2>
        <ul className="cards">
          {nations.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                className={selected === n.id ? 'card selected' : 'card'}
                onClick={() => setSelected(n.id)}
              >
                <strong>{n.name}</strong>
                <span className="muted">Capitale: {n.capital}</span>
              </button>
            </li>
          ))}
        </ul>
        {selected && <p>Nazione selezionata: {nations.find((n) => n.id === selected)?.name}</p>}
      </section>

      <section aria-labelledby="status-title">
        <h2 id="status-title">Stato</h2>
        <ul className="status">
          <li>
            Dati: {validation.ok ? 'validi' : `${validation.errors.length} errori`} ({nations.length} nazioni,{' '}
            {resources.length} risorse, {rivers.length} fiumi, {crossings.length} attraversamenti)
          </li>
          <li>Offline: {pwa.offlineReady ? 'pronto' : 'non ancora confermato'}</li>
          {pwa.error && <li className="warn">Errore del service worker</li>}
        </ul>
        {pwa.updateAvailable && applyUpdate && (
          <p className="notice">
            Aggiornamento disponibile.{' '}
            <button type="button" onClick={applyUpdate}>
              Aggiorna ora
            </button>
          </p>
        )}
      </section>
    </main>
  );
}
