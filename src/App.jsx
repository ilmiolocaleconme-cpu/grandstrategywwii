import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import resources from '../data/resources.json';
import political from '../data/political_1936.json';
import nations from '../data/nations.json';
import crossings from '../data/crossings.json';
import { validateCatalog } from './data/validate.js';
import { mergeCandidates } from './data/bridges.js';
import { loadProvinces, unwatchProvinces } from './data/loadProvinces.js';
import { initPwa } from './pwa.js';
import MapView from './map/MapView.jsx';
import MapCanvas from './map/MapCanvas.jsx';
import { markCapitals, markCapitalsInCollection, withCities } from './map/citta.js';
import ProvincePanel from './map/ProvincePanel.jsx';
import { SeaPanel, useSeaIndex } from './map/SeaLayer.jsx';
import { buildMapModel } from './map/geo.js';
import { withTerrain } from './data/terrain.js';
import { buildCanvasModel } from './map/canvasModel.js';
import { newGame, playableNations } from './game/state.js';
import { advanceDay } from './game/engine.js';
import { browserStorage, createSaveStore } from './game/save.js';
import GameBar, { SPEEDS } from './ui/GameBar.jsx';
import NewGame, { describeSaveError } from './ui/NewGame.jsx';
import LoadingScreen from './ui/LoadingScreen.jsx';
import FullscreenButton from './ui/FullscreenButton.jsx';
import { fullscreenSupport } from './ui/fullscreen.js';

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

// Grafo dei collegamenti (~1,3 MB: strade, ferrovie e ponti come tratti della linea): caricato dopo la mappa e messo in cache dal
// service worker. I marcatori dei ponti (e dei passaggi sul confine dove manca un ponte entro 15 km) ne derivano.
function useLinks(start) {
  const [file, setFile] = useState(null);
  useEffect(() => {
    if (!start || file) return undefined;
    let alive = true;
    import('../data/links.json').then((m) => alive && setFile(m.default)).catch(() => {});
    return () => { alive = false; };
  }, [start, file]);
  return file;
}

function useCrossingPoints(links) {
  const [border, setBorder] = useState(null);
  useEffect(() => {
    if (!links) return undefined;
    let alive = true;
    import('../data/crossing_points.json').then((c) => alive && setBorder(c.default.points)).catch(() => alive && setBorder([]));
    return () => { alive = false; };
  }, [links]);
  return useMemo(() => (links && border ? { points: mergeCandidates(links.bridges, border) } : null), [links, border]);
}

// Zone marittime (~95 kB): come fiumi e laghi, caricate dopo la mappa e messe in cache dal service worker.
function useSeaData(start) {
  const [sea, setSea] = useState({ status: 'loading', file: null });
  useEffect(() => {
    if (!start) return undefined;
    let alive = true;
    import('../data/sea_zones.json')
      .then((m) => alive && setSea({ status: 'ready', file: m.default }))
      .catch(() => alive && setSea({ status: 'error', file: null }));
    return () => { alive = false; };
  }, [start]);
  return sea;
}

// Posizione dei nomi (~190 kB, data/labels.json): caricata con le altre dopo la mappa e messa in cache dal service worker.
function useLabelData(start) {
  const [labels, setLabels] = useState(null);
  useEffect(() => {
    if (!start) return undefined;
    let alive = true;
    import('../data/labels.json').then((m) => alive && setLabels(m.default)).catch(() => {});
    return () => { alive = false; };
  }, [start]);
  return labels;
}

// Terreno (data/terrain.json, ~200 kB): blocco a parte, dopo la prima schermata; nel precache per l'offline
function useTerrain(enabled) {
  const [terrain, setTerrain] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    import('../data/terrain.json').then((m) => alive && setTerrain(m.default)).catch(() => {});
    return () => { alive = false; };
  }, [enabled]);
  return terrain;
}

// Città a parte (data/citta_grandi.json): si caricano dopo le province, come l'acqua, per non rallentare la prima schermata
function useCities(enabled) {
  const [cities, setCities] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    import('../data/citta_grandi.json').then((m) => alive && setCities(m.default.features)).catch(() => {});
    return () => { alive = false; };
  }, [enabled]);
  return cities;
}

// Province: un file per nazione (data/provinces/), tutti caricati all'avvio in parallelo e uniti
// in memoria. La mappa parte solo a caricamento completo: una mappa a metà falserebbe i bordi nazionali.
function useProvinces() {
  const [state, setState] = useState({ status: 'loading', provinces: null, error: null });
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  useEffect(() => {
    let alive = true;
    const onProgress = (done, total) => { if (alive) setProgress({ done, total }); };
    loadProvinces(onProgress).then(
      (provinces) => alive && setState({ status: 'ready', provinces, error: null }),
      (error) => alive && setState({ status: 'error', provinces: null, error }),
    );
    return () => { alive = false; unwatchProvinces(onProgress); };
  }, []);
  return { ...state, progress };
}

const NATION_NAMES = Object.fromEntries(political.map((e) => [e.id, e.name]));
// chi controlla ogni territorio nel 1936 (colonie, protettorati, mandati): decide il colore politico
const NATION_CONTROL = Object.fromEntries(political.map((e) => [e.id, e.controller ?? e.id]));

// Tre schermate: partita (nuova/continua), mappa strategica (province del 1936) e stato dei dati.
// La partita oggi fa solo scorrere il tempo (src/game/engine.js): le altre meccaniche non sono ancora implementate.
export default function App() {
  const [tab, setTab] = useState('game');
  const [game, setGame] = useState(null);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [notice, setNotice] = useState(null);
  const store = useMemo(() => { const st = browserStorage(); return st ? createSaveStore(st) : null; }, []);
  const [saves, setSaves] = useState({ auto: null, manual: null });
  const refreshSaves = useCallback(() => setSaves({ auto: store?.info('auto') ?? null, manual: store?.info('manual') ?? null }), [store]);
  useEffect(() => { refreshSaves(); }, [refreshSaves]);
  const gameRef = useRef(null);
  gameRef.current = game;
  const { provinces, status: provincesStatus, error: provincesError, progress: provincesProgress } = useProvinces();
  // SVG: fiumi e laghi si caricano subito (come prima). Canvas (prototipo): dopo la comparsa delle province, per non rallentare la prima schermata
  const [mapShown, setMapShown] = useState(false);
  useEffect(() => {
    if (provincesStatus !== 'ready') return undefined;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setMapShown(true)));
    return () => cancelAnimationFrame(id);
  }, [provincesStatus]);
  const { rivers, riversGeo, lakes, status: waterStatus } = useWaterData(!USE_CANVAS || mapShown);
  const { file: seaFile } = useSeaData(!USE_CANVAS || mapShown);
  const links = useLinks(USE_CANVAS && mapShown);
  const crossingPoints = useCrossingPoints(links);
  const [showBridges, setShowBridges] = useState(false); // i marcatori dei passaggi (gialli) si accendono col pulsante ⊓
  const [showTransport, setShowTransport] = useState(false);
  const transport = showTransport ? links : null;
  const labelData = useLabelData(!USE_CANVAS || mapShown);
  const [layer, setLayer] = useState('political');
  const citiesRaw = useCities(USE_CANVAS && mapShown);
  // le città sono province a parte: entrano nello stesso modello e sono cliccabili come le altre
  const cities = useMemo(() => (citiesRaw ? markCapitals(citiesRaw, nations) : null), [citiesRaw]);
  // il terreno si scarica solo quando si apre il livello Terreno: il modello della mappa non si ricostruisce una volta in più all'avvio
  const terrain = useTerrain(USE_CANVAS && mapShown && layer === 'terrain');
  const provincesWithCities = useMemo(() => withTerrain(withCities(provinces && markCapitalsInCollection(provinces, nations), cities), terrain), [provinces, cities, terrain]);
  const seaById = useSeaIndex(seaFile);
  const [showSeas, setShowSeas] = useState(true);
  const [seaId, setSeaId] = useState(null);
  const [provinceId, setProvinceId] = useState(null);
  const [showRivers, setShowRivers] = useState(true);
  const selectProvince = (id) => { setProvinceId(id); setSeaId(null); };
  const selectSea = (id) => { setSeaId(id); setProvinceId(null); };
  const [pwa, setPwa] = useState({ offlineReady: false, updateAvailable: false, error: null });
  const [applyUpdate, setApplyUpdate] = useState(null);

  const mapItems = useMemo(() => (provincesWithCities ? (USE_CANVAS ? buildCanvasModel(provincesWithCities) : buildMapModel(provinces)).items : []), [provincesWithCities, provinces]);
  const selectedItem = mapItems.find((i) => i.id === provinceId) ?? null;
  const control = game ? game.control : NATION_CONTROL;
  const choosable = useMemo(
    () => (provinces ? playableNations(political, provinces.features.map((f) => f.properties.owner)) : []),
    [provinces],
  );

  const saveTo = useCallback((slot, label) => {
    const g = gameRef.current;
    if (!g || !store) return false;
    const r = store.write(slot, g, { savedAt: new Date().toISOString(), label });
    refreshSaves();
    if (!r.ok) setNotice({ kind: 'error', text: `Salvataggio non riuscito (${r.reason}). La partita continua ma non è salvata.` });
    return r.ok;
  }, [store, refreshSaves]);

  const startGame = (nation) => {
    if (!provinces) return;
    const r = newGame({ nation, political, ownersWithProvinces: provinces.features.map((f) => f.properties.owner) });
    if (!r.ok) { setNotice({ kind: 'error', text: `Partita non creata: ${r.reason}` }); return; }
    setGame(r.state); setRunning(false); setNotice(null); setTab('map');
  };
  const loadGame = (slot) => {
    const r = store?.read(slot);
    if (!r || !r.ok) { setNotice({ kind: 'error', text: r ? describeSaveError(r) : 'Salvataggi non disponibili in questo browser.' }); return; }
    setGame(r.state); setRunning(false); setNotice(null); setTab('map');
  };
  const exitGame = () => { saveTo('auto', 'automatico'); setRunning(false); setGame(null); setTab('game'); };
  const toggleRun = () => { if (running) saveTo('auto', 'automatico'); setRunning((v) => !v); };

  // un tick al giorno; si ferma da solo se l'app va in secondo piano (telefono)
  useEffect(() => {
    if (!running) return undefined;
    const ms = SPEEDS.find((s) => s.id === speed).ms;
    const id = setInterval(() => setGame((g) => (g ? advanceDay(g) : g)), ms);
    return () => clearInterval(id);
  }, [running, speed]);
  useEffect(() => {
    const onHide = () => { if (document.hidden) { setRunning((was) => { if (was) saveTo('auto', 'automatico'); return false; }); } };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [saveTo]);
  // salvataggio automatico ogni 30 giorni di gioco
  useEffect(() => { if (game && game.day > 0 && game.day % 30 === 0) saveTo('auto', 'automatico'); }, [game, saveTo]);

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
    <>
      <nav className="tabs" aria-label="Schermate">
        <strong className="brand">Grand Strategy WWII</strong>
        <button type="button" className={tab === 'game' ? 'on' : ''} aria-pressed={tab === 'game'} onClick={() => setTab('game')}>Partita</button>
        <button type="button" className={tab === 'map' ? 'on' : ''} aria-pressed={tab === 'map'} onClick={() => setTab('map')}>Mappa</button>
        <button type="button" className={tab === 'status' ? 'on' : ''} aria-pressed={tab === 'status'} onClick={() => setTab('status')}>Stato</button>
        <FullscreenButton />
      </nav>
      <p className="rotate-hint" role="note">Il gioco è pensato in orizzontale: ruota il telefono.</p>
    </>
  );

  if (tab === 'game') {
    return (
      <div className="shell">
        {tabs}
        {provincesStatus !== 'ready' ? (
          <LoadingScreen done={provincesProgress.done} total={provincesProgress.total} error={provincesStatus === 'error' ? (provincesError ?? new Error('errore sconosciuto')) : null} />
        ) : game ? (
          <main className="app">
            <header><h1>Partita in corso</h1><p className="muted">{NATION_NAMES[game.player]} · {game.date}. Usa la barra nella schermata Mappa per far scorrere il tempo.</p></header>
            <button type="button" className="nation-btn" onClick={() => setTab('map')}>Torna alla mappa</button>{' '}
            <button type="button" className="nation-btn" onClick={exitGame}>Esci dalla partita</button>
          </main>
        ) : (
          <NewGame nations={choosable} saves={saves} canSave={store !== null} notice={notice} onStart={startGame} onLoad={loadGame} />
        )}
      </div>
    );
  }

  if (tab === 'map') {
    return (
      <div className="shell">
        {tabs}
        {game ? (
          <GameBar game={game} playerName={NATION_NAMES[game.player]} running={running} speed={speed} canSave={store !== null} notice={notice}
            onToggle={toggleRun} onStep={() => setGame((g) => advanceDay(g))} onSpeed={setSpeed}
            onSave={() => { if (saveTo('manual', 'manuale')) setNotice({ kind: 'info', text: 'Partita salvata.' }); }} onExit={exitGame} />
        ) : null}
        {provincesStatus !== 'ready' ? (
          <LoadingScreen done={provincesProgress.done} total={provincesProgress.total} error={provincesStatus === 'error' ? (provincesError ?? new Error('errore sconosciuto')) : null} />
        ) : (
        <div className="map-layout">
          <MapScreen provinces={provincesWithCities} rivers={rivers} riversGeo={riversGeo} lakes={lakes} nationNames={NATION_NAMES} nationControl={control} selectedId={provinceId} onSelect={selectProvince} layer={layer} onLayerChange={setLayer} showRivers={showRivers} onToggleRivers={() => setShowRivers((v) => !v)} seas={seaFile} showSeas={showSeas} onToggleSeas={() => setShowSeas((v) => !v)} selectedSeaId={seaId} onSelectSea={selectSea} labelData={labelData} crossingPoints={crossingPoints} showBridges={showBridges} onToggleBridges={() => setShowBridges((v) => !v)} transport={transport} showTransport={showTransport} onToggleTransport={() => setShowTransport((v) => !v)} />
          {seaId && seaById.get(seaId) ? (
            <SeaPanel zone={seaById.get(seaId)} byId={seaById} onClose={() => setSeaId(null)} onSelect={selectSea} />
          ) : (
            <ProvincePanel item={selectedItem} nationNames={NATION_NAMES} nationControl={control} onClose={() => setProvinceId(null)} />
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
        <p className="muted">Prototipo: mappa del 1936 e partita con calendario e salvataggi; economia, unità ed eventi non ancora attivi.</p>
      </header>

      <section aria-labelledby="status-title">
        <h2 id="status-title">Stato</h2>
        <ul className="status">
          <li>
            Dati: {!validation ? (waterStatus === 'error' ? 'fiumi e laghi non caricati' : 'caricamento di fiumi e laghi…') : validation.ok ? 'validi' : `${validation.errors.length} errori`} ({nations.length} nazioni,{' '}
            {resources.length} risorse, {rivers?.length ?? '…'} fiumi, {lakes?.features.length ?? '…'} laghi, {crossings.length} attraversamenti, {provinces?.features.length ?? '…'} province)
          </li>
          <li>Offline: {pwa.offlineReady ? 'pronto' : 'non ancora confermato'}</li>
          <li>Schermo intero: {{ installed: 'attivo (app installata)', api: 'disponibile col pulsante ⛶ nella barra', none: 'non disponibile in questo browser; su iPhone: Condividi → Aggiungi alla schermata Home' }[fullscreenSupport(window)]}</li>
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
