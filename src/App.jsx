import { useEffect, useMemo, useState } from 'react';
import nations from '../data/nations.json';
import resources from '../data/resources.json';
import political from '../data/political_1936.json';
import crossings from '../data/crossings.json';
import { validateCatalog } from './data/validate.js';
import { loadProvinces } from './data/loadProvinces.js';
import { initPwa } from './pwa.js';
import MapView from './map/MapView.jsx';
import MapCanvas from './map/MapCanvas.jsx';
import ProvincePanel, { RiverPanel } from './map/ProvincePanel.jsx';
import { buildMapModel } from './map/geo.js';
import { buildCanvasModel } from './map/canvasModel.js';

// La mappa Canvas 2D è quella predefinita; la mappa SVG resta come ripiego con ?map=svg
const USE_CANVAS = typeof window === 'undefined' || new URLSearchParams(window.location.search).get('map') !== 'svg';
const MapScreen = USE_CANVAS ? MapCanvas : MapView;

// Fiumi e laghi (~600 kB) non stanno nel pacchetto iniziale: si scaricano dopo la comparsa della
// mappa, in blocchi separati che il service worker mette nella cache del dispositivo (offline).
function useWaterData(start) {
  const [water, setWater] = useState({ status: 'loading', rivers: null, riversGeo: null, lakes: null });
  useEffect(() => {
    if (!start) return undefined;
    let alive = true;
    Promise.all([import('../data/rivers.json'), import('../data/rivers_geo.json'), import('../data/lakes.json')])
      .then(([r, g, l]) => alive && setWater({ status: 'ready', rivers: r.default, riversGeo: g.default, lakes: l.default }))
      .catch(() => alive && setWater({ status: 'error', rivers: null, riversGeo: null, lakes: null }));
    return () => { alive = false; };
  }, [start]);
  return water;
}

// Province: un file per nazione (data/provinces/), tutti caricati all'avvio in parallelo e uniti
// in memoria. La mappa parte solo a caricamento completo: una mappa a metà falserebbe i bordi nazionali.
function useProvinces() {
  const [state, setState] = useState({ status: 'loading', provinces: null, error: null });
  useEffect(() => {
    let alive = true;
    loadProvinces().then(
      (provinces) => alive && setState({ status: 'ready', provinces, error: null }),
      (error) => alive && setState({ status: 'error', provinces: null, error }),
    );
    return () => { alive = false; };
  }, []);
  return state;
}

const NATION_NAMES = Object.fromEntries(political.map((e) => [e.id, e.name]));
// chi controlla ogni territorio nel 1936 (colonie, protettorati, mandati): decide il colore politico
const NATION_CONTROL = Object.fromEntries(political.map((e) => [e.id, e.controller ?? e.id]));

// Due schermate: la mappa strategica (province del 1936) e lo stato dei dati.
// Le meccaniche di gioco non sono ancora implementate.
export default function App() {
  const [tab, setTab] = useState('map');
  const { provinces, status: provincesStatus, error: provincesError } = useProvinces();
  // SVG: fiumi e laghi si caricano subito (come prima). Canvas (prototipo): dopo la comparsa delle province, per non rallentare la prima schermata
  const [mapShown, setMapShown] = useState(false);
  useEffect(() => {
    if (provincesStatus !== 'ready') return undefined;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setMapShown(true)));
    return () => cancelAnimationFrame(id);
  }, [provincesStatus]);
  const { rivers, riversGeo, lakes, status: waterStatus } = useWaterData(!USE_CANVAS || mapShown);
  const [layer, setLayer] = useState('political');
  const [provinceId, setProvinceId] = useState(null);
  const [riverId, setRiverId] = useState(null);
  const [showRivers, setShowRivers] = useState(true);
  const selectProvince = (id) => { setProvinceId(id); setRiverId(null); };
  const selectRiver = (id) => { setRiverId(id); setProvinceId(null); };
  const selectedRiver = rivers?.find((r) => r.id === riverId) ?? null;
  const [selected, setSelected] = useState(null);
  const [pwa, setPwa] = useState({ offlineReady: false, updateAvailable: false, error: null });
  const [applyUpdate, setApplyUpdate] = useState(null);

  const mapItems = useMemo(() => (provinces ? (USE_CANVAS ? buildCanvasModel(provinces) : buildMapModel(provinces)).items : []), [provinces]);
  const selectedItem = mapItems.find((i) => i.id === provinceId) ?? null;

  const validation = useMemo(
    () => (rivers ? validateCatalog({ nations, resources, rivers, crossings }) : null),
    [rivers],
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
        {provincesStatus !== 'ready' ? (
          <main className="map-status" role="status">
            {provincesStatus === 'loading' ? (
              <p>Caricamento delle province…</p>
            ) : (
              <>
                <p className="warn">Province non caricate: {provincesError?.message ?? 'errore sconosciuto'}</p>
                <button type="button" onClick={() => window.location.reload()}>Ricarica</button>
              </>
            )}
          </main>
        ) : (
        <div className="map-layout">
          <MapScreen provinces={provinces} rivers={rivers} riversGeo={riversGeo} lakes={lakes} nationNames={NATION_NAMES} nationControl={NATION_CONTROL} selectedId={provinceId} onSelect={selectProvince} selectedRiverId={riverId} onSelectRiver={selectRiver} layer={layer} onLayerChange={setLayer} showRivers={showRivers} onToggleRivers={() => setShowRivers((v) => !v)} />
          {selectedRiver ? (
            <RiverPanel river={selectedRiver} rivers={rivers ?? []} onClose={() => setRiverId(null)} />
          ) : (
            <ProvincePanel item={selectedItem} nationNames={NATION_NAMES} nationControl={NATION_CONTROL} onClose={() => setProvinceId(null)} />
          )}
        </div>
        )}
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
            Dati: {!validation ? (waterStatus === 'error' ? 'fiumi e laghi non caricati' : 'caricamento di fiumi e laghi…') : validation.ok ? 'validi' : `${validation.errors.length} errori`} ({nations.length} nazioni,{' '}
            {resources.length} risorse, {rivers?.length ?? '…'} fiumi, {lakes?.features.length ?? '…'} laghi, {crossings.length} attraversamenti, {provinces?.features.length ?? '…'} province)
          </li>
          <li>Offline: {pwa.offlineReady ? 'pronto' : 'non ancora confermato'}</li>
          {provincesStatus === 'error' && <li className="warn">Province non caricate: {provincesError?.message}</li>}
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
