import { useEffect, useMemo, useState } from 'react';
import nations from '../data/nations.json';
import resources from '../data/resources.json';
import rivers from '../data/rivers.json';
import political from '../data/political_1936.json';
import provinces from '../data/provinces_1936.json';
import crossings from '../data/crossings.json';
import { validateCatalog } from './data/validate.js';
import { initPwa } from './pwa.js';
import MapView from './map/MapView.jsx';
import ProvincePanel from './map/ProvincePanel.jsx';
import { buildMapModel } from './map/geo.js';

const NATION_NAMES = Object.fromEntries(political.map((e) => [e.id, e.name]));

// Due schermate: la mappa strategica (province del 1936) e lo stato dei dati.
// Le meccaniche di gioco non sono ancora implementate.
export default function App() {
  const [tab, setTab] = useState('map');
  const [layer, setLayer] = useState('political');
  const [provinceId, setProvinceId] = useState(null);
  const [selected, setSelected] = useState(null);
  const [pwa, setPwa] = useState({ offlineReady: false, updateAvailable: false, error: null });
  const [applyUpdate, setApplyUpdate] = useState(null);

  const mapItems = useMemo(() => buildMapModel(provinces).items, []);
  const selectedItem = mapItems.find((i) => i.id === provinceId) ?? null;

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

  const tabs = (
    <nav className="tabs" aria-label="Schermate">
      <strong className="brand">Grand Strategy WWII</strong>
      <button type="button" className={tab === 'map' ? 'on' : ''} aria-pressed={tab === 'map'} onClick={() => setTab('map')}>Mappa</button>
      <button type="button" className={tab === 'status' ? 'on' : ''} aria-pressed={tab === 'status'} onClick={() => setTab('status')}>Stato</button>
    </nav>
  );

  if (tab === 'map') {
    return (
      <div className="shell">
        {tabs}
        <div className="map-layout">
          <MapView provinces={provinces} nationNames={NATION_NAMES} selectedId={provinceId} onSelect={setProvinceId} layer={layer} onLayerChange={setLayer} />
          <ProvincePanel item={selectedItem} nationNames={NATION_NAMES} onClose={() => setProvinceId(null)} />
        </div>
      </div>
    );
  }

  return (
    <div className="shell">
    {tabs}
    <main className="app">
      <header>
        <h1>Grand Strategy WWII</h1>
        <p className="muted">Prototipo: mappa delle province del 1936 attiva; nessuna meccanica di gioco ancora attiva.</p>
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
            {resources.length} risorse, {rivers.length} fiumi, {crossings.length} attraversamenti, {provinces.features.length} province)
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
    </div>
  );
}
