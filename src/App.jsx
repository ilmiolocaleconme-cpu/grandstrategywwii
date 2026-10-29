import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import resources from '../data/resources.json';
import political from '../data/political_1936.json';
import nations from '../data/nations.json';
import crossings from '../data/crossings.json';
import { validateCatalog } from './data/validate.js';
import { loadProvinces, unwatchProvinces } from './data/loadProvinces.js';
import { initPwa } from './pwa.js';
import { withRetry } from './data/retry.js';
import MapView from './map/MapView.jsx';
import MapCanvas from './map/MapCanvas.jsx';
import { markCapitals, markCapitalsInCollection, withCities } from './map/citta.js';
import ProvincePanel from './map/ProvincePanel.jsx';
import { provinceLinkStats } from './rules/provinceView.js';
import { SeaPanel, useSeaIndex } from './map/SeaLayer.jsx';
import { buildMapModel } from './map/geo.js';
import { withTerrain } from './data/terrain.js';
import { buildCanvasModel } from './map/canvasModel.js';
import initialIndustry from '../data/industry/initial_industry.json';
import initialStocks from '../data/industry/initial_stocks.json';
import initialCash from '../data/industry/initial_cash.json';
import economyData from '../data/economy/economy.json';
import populationData from '../data/population/population.json';
import { newGame, playableNations, initEconomy } from './game/state.js';
import { advanceDay } from './game/engine.js';
import { initForcesState } from './game/forcesState.js';
import unitsFile from '../data/units/units.json';
import deploymentFile from '../data/units/deployment_1936.json';
import { unitsByProvince } from './data/deployment.js';
import readiness from '../data/units/readiness.json';
import tplDeuInfantry from '../data/units/templates/divisione_fanteria_germania_1936.json';
import tplDeuArmored from '../data/units/templates/divisione_corazzata_germania_1936.json';
import tplGbrInfantry from '../data/units/templates/divisione_fanteria_gran_bretagna_1936.json';
import { createEconomySystem } from './game/economySystem.js';
import { createConstruction } from './game/construction.js';
import mineSites from '../data/resources/mine_sites.json';
import { loadIndustryCatalog } from './data/industry.js';
import recipesFile from '../data/industry/recipes.json';
import extractionBaseline from '../data/resources/extraction_baseline.json';
import hydroPlants from '../data/resources/hydro_plants.json';
import factoriesCsv from '../data/industry/factories.csv?raw';
import structuresCsv from '../data/infrastructure/structures.csv?raw';
import categoriesCsv from '../data/industry/production_categories.csv?raw';
import { browserStorage, createSaveStore } from './game/save.js';
import GameBar from './ui/GameBar.jsx';
import { ProvinceBuild, EconomyPanel } from './ui/BuildPanel.jsx';
import { provinceBuildOptions, economySummary, describeBuildFailure } from './ui/buildOptions.js';
import { RESOURCE_META } from './data/provinceResources.js';
import { initialClock, msPerDay, pressBack, pressForward, pressPause } from './game/speed.js';
import NewGame, { describeSaveError } from './ui/NewGame.jsx';
import LoadingScreen from './ui/LoadingScreen.jsx';
import { PRELOAD_GIVE_UP_MS, layerNeedsCover, preloadComplete, preloadProgress } from './ui/preload.js';
import { LegendList } from './map/MapView.jsx';
import TransportLegend from './map/TransportLegend.jsx';
import FullscreenButton from './ui/FullscreenButton.jsx';
import flagsFile from '../data/flags.json';
import { nationBounds } from './map/focus.js';
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
    Promise.all([withRetry(() => import('../data/rivers.json')), withRetry(() => import('../data/rivers_geo.json')), withRetry(() => import('../data/lakes.json'))])
      .then(([r, g, l]) => alive && setWater({ status: 'ready', rivers: r.default, riversGeo: g.default, lakes: l.default }))
      .catch(() => alive && setWater({ status: 'error', rivers: null, riversGeo: null, lakes: null }));
    return () => { alive = false; };
  }, [start]);
  return water;
}

// Grafo dei collegamenti (~1,3 MB: strade, ferrovie e ponti come tratti della linea): caricato dopo la mappa e messo in cache dal
// service worker.
function useLinks(start) {
  const [file, setFile] = useState(null);
  useEffect(() => {
    if (!start || file) return undefined;
    let alive = true;
    withRetry(() => import('../data/links.json')).then((m) => alive && setFile(m.default)).catch(() => {});
    return () => { alive = false; };
  }, [start, file]);
  return file;
}

// Zone marittime (~95 kB): come fiumi e laghi, caricate dopo la mappa e messe in cache dal service worker.
function useSeaData(start) {
  const [sea, setSea] = useState({ status: 'loading', file: null });
  useEffect(() => {
    if (!start) return undefined;
    let alive = true;
    withRetry(() => import('../data/sea_zones.json'))
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
    withRetry(() => import('../data/labels.json')).then((m) => alive && setLabels(m.default)).catch(() => {});
    return () => { alive = false; };
  }, [start]);
  return labels;
}

// Terra di base (data/land_base.json, ~350 kB): precaricata all'apertura con gli altri dati della mappa, così la mappa si disegna una volta sola
function useLandBase(enabled) {
  const [land, setLand] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    withRetry(() => import('../data/land_base.json')).then((m) => alive && setLand(m.default)).catch(() => {});
    return () => { alive = false; };
  }, [enabled]);
  return land;
}

// Risorse per provincia (data/resources/province_resources.json, piccolo): si scaricano solo aprendo il livello Risorse
function useProvinceResources(enabled) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!enabled || data) return undefined;
    let alive = true;
    withRetry(() => import('../data/resources/province_resources.json')).then((m) => alive && setData(m.default.byProvince)).catch(() => {});
    return () => { alive = false; };
  }, [enabled, data]);
  return data;
}

// Dati per provincia (popolazione, agricoltura, presenza militare) e centrali idroelettriche: file piccoli, si scaricano solo
// quando si apre il pannello di una provincia; nel precache per l'offline. Un file che non arriva = «n/d» nel pannello.
function useProvinceData(enabled) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!enabled || data) return undefined;
    let alive = true;
    Promise.all([
      withRetry(() => import('../data/population/province_population.json')),
      withRetry(() => import('../data/agriculture/province_agriculture.json')),
      withRetry(() => import('../data/military/province_presence.json')),
      withRetry(() => import('../data/resources/hydro_plants.json')),
    ]).then(([pop, agr, mil, hyd]) => alive && setData({ population: pop.default, agriculture: agr.default, military: mil.default, hydro: hyd.default })).catch(() => {});
    return () => { alive = false; };
  }, [enabled, data]);
  return data;
}

// Terreno (data/terrain.json, ~200 kB): blocco a parte, dopo la prima schermata; nel precache per l'offline
function useTerrain(enabled) {
  const [terrain, setTerrain] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    withRetry(() => import('../data/terrain.json')).then((m) => alive && setTerrain(m.default)).catch(() => {});
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
    withRetry(() => import('../data/citta_grandi.json')).then((m) => alive && setCities(m.default.features)).catch(() => {});
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

// Dati iniziali dell'economia (pochi kB, nel bundle: funzionano offline). Stato economico per nazione: vedi game/economyState.js
const START_ECONOMY = { nationIds: nations.map((n) => n.id), industry: initialIndustry, stocks: initialStocks, cash: initialCash, economy: economyData, population: populationData };

// Ciclo economico giornaliero (estrazione → produzione → entrata): game/economySystem.js. Dati nel bundle, funziona offline.
const GAME_CATALOG = { recipes: new Map(recipesFile.recipes.map((r) => [r.id, r])), factories: loadIndustryCatalog({ factoriesCsv, structuresCsv, categoriesCsv }).byId };
// Costruzioni (game/construction.js): `GAME_BUILD.start(stato, nazione, ordine)` ordina; UI: ui/BuildPanel.jsx
export const GAME_BUILD = createConstruction({ catalog: GAME_CATALOG, economy: economyData, sites: mineSites, hydro: hydroPlants, political, workersShare: populationData.workersShare.value });
// Forze (game/forcesState.js): istanze di divisione create alla partita nuova e al caricamento di un salvataggio che ancora non le ha. Germania e Regno Unito (fanteria) hanno template (29/10/2026); la fanteria britannica parte come quadro al 30%.
const FORCES_CTX = { units: unitsFile.units, templates: [tplDeuInfantry, tplDeuArmored, tplGbrInfantry], ratio: readiness.initialFillRatio.value };
const withForces = (state) => initForcesState(state, FORCES_CTX).state;
const GAME_SYSTEMS = [
  GAME_BUILD.constructionDay,
  createEconomySystem({ catalog: GAME_CATALOG, economy: economyData, baseline: extractionBaseline, hydro: hydroPlants, political, cash: initialCash, sites: mineSites }),
];

const RESOURCE_NAMES = new Map(resources.map((r) => [r.id, r.name])); // nomi italiani anche dei prodotti (acciaio, gomma lavorata, ...)
const BUILD_CTX = { build: GAME_BUILD, catalog: GAME_CATALOG, sites: mineSites, economy: economyData, resourceLabel: (id) => RESOURCE_META[id]?.label ?? RESOURCE_NAMES.get(id) ?? id };

const NATION_NAMES = Object.fromEntries(political.map((e) => [e.id, e.name]));
// chi controlla ogni territorio nel 1936 (colonie, protettorati, mandati): decide il colore politico
const NATION_CONTROL = Object.fromEntries(political.map((e) => [e.id, e.controller ?? e.id]));

// Tre schermate: partita (nuova/continua), mappa strategica (province del 1936) e stato dei dati.
// La partita oggi fa solo scorrere il tempo (src/game/engine.js): le altre meccaniche non sono ancora implementate.
export default function App() {
  const [tab, setTab] = useState('game');
  const [game, setGame] = useState(null);
  const [clock, setClock] = useState(initialClock); // { running, speed }: tre pulsanti (indietro, pausa, avanti), vedi src/game/speed.js
  const { running, speed } = clock;
  const setRunning = (fn) => setClock((c) => ({ ...c, running: typeof fn === 'function' ? fn(c.running) : fn }));
  const [notice, setNotice] = useState(null);
  const store = useMemo(() => { const st = browserStorage(); return st ? createSaveStore(st) : null; }, []);
  const [saves, setSaves] = useState({ auto: null, manual: null });
  const refreshSaves = useCallback(() => setSaves({ auto: store?.info('auto') ?? null, manual: store?.info('manual') ?? null }), [store]);
  useEffect(() => { refreshSaves(); }, [refreshSaves]);
  const gameRef = useRef(null);
  gameRef.current = game;
  const { provinces, status: provincesStatus, error: provincesError, progress: provincesProgress } = useProvinces();
  // SVG: fiumi e laghi si caricano subito (come prima). Canvas (prototipo): dopo la comparsa delle province, per non rallentare la prima schermata
  // Sulla schermata di scelta della nazione non si carica e non si costruisce nulla della mappa (modello di ~770 mila vertici,
  // fiumi, mari, collegamenti): il telefono resta libero per la ruota. Il lavoro parte quando c'è una partita o si apre la mappa.
  const mapWanted = game !== null || tab === 'map';
  const [mapReady, setMapReady] = useState(true); // false da quando parte una partita fino a mappa disegnata: copertura con la bandiera
  const [coverGiveUp, setCoverGiveUp] = useState(false);
  const [readyKey, setReadyKey] = useState(0); // cresce a ogni richiesta di copertura (avvio partita, cambio livello): la mappa ricomincia a controllare se è pronta
  // Precaricamento (deciso in chat 27/10/2026): all'apertura si scaricano i dati di TUTTE le mappe, così a partita iniziata il cambio livello
  // non rimostra la bandiera. Si scarica e si legge soltanto: il modello pesante della mappa si costruisce dopo la scelta della nazione.
  const { rivers, riversGeo, lakes, status: waterStatus } = useWaterData(true);
  const { file: seaFile, status: seaStatus } = useSeaData(true);
  const links = useLinks(USE_CANVAS);
  const [showTransport, setShowTransport] = useState(false);
  const transport = showTransport ? links : null;
  const labelData = useLabelData(true);
  const land = useLandBase(USE_CANVAS);
  const [layer, setLayer] = useState('political');
  const [toolsHost, setToolsHost] = useState(null); // contenitore in barra dove la mappa mette livelli e zoom (una sola barra in alto)
  const citiesRaw = useCities(USE_CANVAS);
  // le città sono province a parte: entrano nello stesso modello e sono cliccabili come le altre
  const cities = useMemo(() => (citiesRaw ? markCapitals(citiesRaw, nations) : null), [citiesRaw]);
  // terreno e risorse arrivano già all'apertura: il modello della mappa si costruisce una volta sola, dopo la scelta della nazione
  const terrain = useTerrain(USE_CANVAS);
  const provinceResources = useProvinceResources(true);
  const preloadItems = useMemo(() => (USE_CANVAS ? [
    { label: 'Fiumi e laghi', done: waterStatus !== 'loading' },
    { label: 'Mari e rotte', done: seaStatus !== 'loading' },
    { label: 'Città', done: citiesRaw !== null },
    { label: 'Nomi', done: labelData !== null },
    { label: 'Terra di base', done: land !== null },
    { label: 'Terreno', done: terrain !== null },
    { label: 'Risorse', done: provinceResources !== null },
    { label: 'Collegamenti', done: links !== null },
  ] : []), [waterStatus, seaStatus, citiesRaw, labelData, land, terrain, provinceResources, links]);
  const [preloadGaveUp, setPreloadGaveUp] = useState(false);
  useEffect(() => {
    if (provincesStatus !== 'ready' || preloadGaveUp) return undefined;
    const id = setTimeout(() => setPreloadGaveUp(true), PRELOAD_GIVE_UP_MS); // un file che non arriva non deve bloccare l'apertura
    return () => clearTimeout(id);
  }, [provincesStatus, preloadGaveUp]);
  const appReady = preloadComplete({ provincesReady: provincesStatus === 'ready', items: preloadItems, gaveUp: preloadGaveUp });
  const openProgress = preloadProgress(provincesProgress, preloadItems);
  const provincesWithCities = useMemo(() => withTerrain(withCities(provinces && markCapitalsInCollection(provinces, nations), cities), terrain), [provinces, cities, terrain]);
  const seaById = useSeaIndex(seaFile);
  const [showSeas, setShowSeas] = useState(true);
  const [seaId, setSeaId] = useState(null);
  const [provinceId, setProvinceId] = useState(null);
  const [showRivers, setShowRivers] = useState(true);
  // Il pannello dei dati è nascosto: toccando una provincia, città o zona di mare compare solo il pulsante «i»;
  // il pannello si apre toccandolo. Se è già aperto, toccare un'altra voce ne aggiorna il contenuto; toccare il vuoto lo chiude.
  const [infoOpen, setInfoOpen] = useState(false);
  const provinceData = useProvinceData(game !== null || infoOpen); // scaricati all'avvio della partita (o alla prima apertura del pannello), non a ogni selezione
  const linkStats = useMemo(() => (infoOpen && links && provinces ? provinceLinkStats(links, provinces.features.map((f) => f.properties)) : null), [infoOpen, links, provinces]);
  const selectProvince = (id) => { setProvinceId(id); setSeaId(null); if (id == null) setInfoOpen(false); };
  const selectSea = (id) => { setSeaId(id); setProvinceId(null); if (id == null) setInfoOpen(false); };
  const [pwa, setPwa] = useState({ offlineReady: false, updateAvailable: false, error: null });
  const [applyUpdate, setApplyUpdate] = useState(null);

  const mapItems = useMemo(() => (provincesWithCities && mapWanted ? (USE_CANVAS ? buildCanvasModel(provincesWithCities) : buildMapModel(provinces)).items : []), [provincesWithCities, provinces, mapWanted]);
  // nome leggibile di una provincia (anche madre) per code e liste; se manca, l'id
  const provinceName = useMemo(() => { const m = new Map(); for (const f of provinces?.features ?? []) { const pr = f.properties; if (pr?.name) { m.set(f.id ?? pr.id, pr.name); if (pr.parentProvince && !m.has(pr.parentProvince)) m.set(pr.parentProvince, pr.name); } } return (id) => m.get(id) ?? id; }, [provinces]);
  const selectedItem = mapItems.find((i) => i.id === provinceId) ?? null;
  // ordini di costruzione del giocatore: le regole sono in GAME_BUILD, qui si applica solo il risultato e si riferisce l'esito
  const placeOrder = (order) => {
    const r = GAME_BUILD.start(game, game.player, order);
    if (!r.ok) return { ok: false, text: describeBuildFailure(r) };
    setGame(r.state);
    return { ok: true, text: 'Ordine avviato: costi pagati, il cantiere è in corso.' };
  };
  const buildOptions = useMemo(() => {
    const id = selectedItem?.props?.parentProvince ?? selectedItem?.props?.id;
    return game && id ? provinceBuildOptions(game, game.player, id, BUILD_CTX) : null;
  }, [game, selectedItem]);
  const focus = useMemo(() => (game && provinces ? nationBounds(provinces.features, game.player) : null), [game?.player, provinces]); // eslint-disable-line react-hooks/exhaustive-deps
  const provinceUnits = useMemo(() => unitsByProvince(unitsFile.units, deploymentFile, game?.date ?? '1936-01-01'), [game?.date]);
  const layerReady = (layer !== 'terrain' || terrain !== null) && (layer !== 'resources' || provinceResources !== null); // dati del livello scelto arrivati
  const dataReady = waterStatus !== 'loading' && seaStatus !== 'loading' && citiesRaw !== null && labelData !== null && land !== null && layerReady;
  // cambio di livello (Politico / Terreno / Risorse): la mappa si ridisegna e va mostrata solo a disegno finito, come all'avvio
  const changeLayer = (next) => {
    if (next === layer) return;
    setLayer(next);
    // i dati di tutti i livelli sono caricati prima della partita (precaricamento all'apertura): il cambio livello non mostra nessuna copertura.
    // La bandiera resta solo come ripiego se i dati del livello non sono arrivati (file lento o mancante).
    if (!game || !layerNeedsCover(next, { terrain, resources: provinceResources })) return;
    setMapReady(false); setCoverGiveUp(false); setReadyKey((k) => k + 1);
  };
  useEffect(() => {
    if (mapReady) return undefined;
    const id = setTimeout(() => setCoverGiveUp(true), 45000); // un file che non arriva non deve tenere la bandiera per sempre
    return () => clearTimeout(id);
  }, [mapReady]);
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
    const r = newGame({ nation, political, ownersWithProvinces: provinces.features.map((f) => f.properties.owner), start: START_ECONOMY });
    if (!r.ok) { setNotice({ kind: 'error', text: `Partita non creata: ${r.reason}` }); return; }
    setGame(withForces(r.state)); setClock(initialClock()); setNotice(null); setTab('map'); setMapReady(false); setCoverGiveUp(false);
  };
  const loadGame = (slot) => {
    const r = store?.read(slot);
    if (!r || !r.ok) { setNotice({ kind: 'error', text: r ? describeSaveError(r) : 'Salvataggi non disponibili in questo browser.' }); return; }
    setGame(withForces(initEconomy(r.state, { political, start: START_ECONOMY }))); setClock(initialClock()); setNotice(null); setTab('map'); setMapReady(false); setCoverGiveUp(false);
  };
  const saveManual = () => { if (saveTo('manual', 'manuale')) setNotice({ kind: 'info', text: 'Partita salvata.' }); };
  const exitGame = () => { saveTo('auto', 'automatico'); setRunning(false); setGame(null); setTab('game'); };
  const pressClock = (press) => { const next = press(clock); if (clock.running && !next.running) saveTo('auto', 'automatico'); setClock(next); };

  // un tick al giorno; si ferma da solo se l'app va in secondo piano (telefono)
  useEffect(() => {
    if (!running) return undefined;
    const ms = msPerDay(speed);
    const id = setInterval(() => setGame((g) => (g ? advanceDay(g, GAME_SYSTEMS) : g)), ms);
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
    let update = null;
    update = initPwa({
      onOfflineReady: () => setPwa((s) => ({ ...s, offlineReady: true })),
      // senza una partita in corso l'aggiornamento si applica subito (niente rischio di perdere nulla); con una partita resta il pulsante
      onUpdateAvailable: () => { if (gameRef.current === null && update) update(); else setPwa((s) => ({ ...s, updateAvailable: true })); },
      onError: (error) => setPwa((s) => ({ ...s, error })),
    });
    setApplyUpdate(() => update);
  }, []);

  // Una sola barra: livelli e zoom (portale della mappa), data e tempo (solo sulla mappa con una partita) e Partita.
  // Mappa, legenda e stato non hanno più un pulsante: da Partita si torna alla mappa e si aprono Info e Stato.
  const tabs = (
    <>
      <nav className="tabs" aria-label="Schermate">
        <strong className="brand">Grand Strategy WWII</strong>
        <div className="nav-tools-host" ref={setToolsHost} />
        {game && tab === 'map' ? (
          <GameBar game={game} playerName={NATION_NAMES[game.player]} running={running} speed={speed}
            onBack={() => pressClock(pressBack)} onPause={() => pressClock(pressPause)} onForward={() => pressClock(pressForward)} onStep={() => setGame((g) => advanceDay(g, GAME_SYSTEMS))} />
        ) : null}
        <button type="button" className={tab === 'game' ? 'on' : ''} aria-pressed={tab === 'game'} onClick={() => setTab('game')}>Partita</button>
        <FullscreenButton />
      </nav>
      {game && tab === 'map' && notice?.kind === 'error' ? <p className="gb-note warn" role="status">{notice.text}</p> : null}
      <p className="rotate-hint" role="note">Il gioco è pensato in orizzontale: ruota il telefono.</p>
    </>
  );

  const statusSection = (
    <section aria-labelledby="status-title" className="info-section">
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
          <button type="button" onClick={applyUpdate}>Aggiorna ora</button>
        </p>
      )}
    </section>
  );

  // Legenda (nazioni o terreno, secondo il livello attivo; strade, ferrovie e ponti se il livello è acceso)
  const infoSection = (
    <section aria-labelledby="info-title" className="info-section">
      <h2 id="info-title">Info: legenda</h2>
      <LegendList layer={layer} nationNames={NATION_NAMES} nationControl={control} items={mapItems} />
      {showTransport ? <TransportLegend /> : <p className="muted">Strade, ferrovie e ponti: accendi il livello ≈ per vederne la legenda.</p>}
    </section>
  );

  if (tab === 'game') {
    return (
      <div className="shell">
        {tabs}
        {!appReady ? (
          <LoadingScreen done={openProgress.done} total={openProgress.total} error={provincesStatus === 'error' ? (provincesError ?? new Error('errore sconosciuto')) : null} />
        ) : game ? (
          <main className="app">
            <header><h1>Partita in corso</h1><p className="muted">{NATION_NAMES[game.player]} · {game.date}. Il tempo si governa con i pulsanti nella barra in alto, sulla mappa.</p></header>
            {notice ? <p className={notice.kind === 'error' ? 'warn' : 'muted'} role="status">{notice.text}</p> : null}
            <button type="button" className="nation-btn" onClick={() => { setNotice(null); setTab('map'); }}>Torna alla mappa</button>{' '}
            <button type="button" className="nation-btn" onClick={saveManual} disabled={store === null}>Salva</button>{' '}
            <button type="button" className="nation-btn" onClick={exitGame}>Esci dalla partita</button>
            <EconomyPanel summary={economySummary(game, game.player, { build: GAME_BUILD, catalog: GAME_CATALOG, workersShare: populationData.workersShare.value, resourceLabel: BUILD_CTX.resourceLabel, provinceName })} />
            {infoSection}
            {statusSection}
          </main>
        ) : (
          <>
            <NewGame nations={choosable} nationNames={NATION_NAMES} saves={saves} canSave={store !== null} notice={notice} onStart={startGame} onLoad={loadGame} />
            <main className="app">{statusSection}</main>
          </>
        )}
      </div>
    );
  }

  // tab === 'map'
  return (
    <div className="shell">
      {tabs}
      {!appReady ? (
        <LoadingScreen done={openProgress.done} total={openProgress.total} error={provincesStatus === 'error' ? (provincesError ?? new Error('errore sconosciuto')) : null} />
      ) : (
      <div className="map-layout">
        {USE_CANVAS && !mapReady && !coverGiveUp && game ? (
          <div className="map-cover">
            <LoadingScreen nation={{
              name: NATION_NAMES[game.player] ?? game.player,
              flag: flagsFile.flags[game.player],
              steps: [
                ...(layer === 'political' || layer === 'army' ? [] : [{ label: layer === 'terrain' ? 'Terreno' : 'Risorse', done: layerReady }]),
                { label: 'Fiumi e laghi', done: waterStatus !== 'loading' },
                { label: 'Mari e rotte', done: seaStatus !== 'loading' },
                { label: 'Città', done: citiesRaw !== null },
                { label: 'Nomi sulla mappa', done: labelData !== null },
                { label: 'Terra di base', done: land !== null },
                { label: 'Disegno della mappa', done: mapReady },
              ],
            }} />
          </div>
        ) : null}
        <MapScreen land={land} focus={focus} dataReady={dataReady} readyKey={readyKey} onReady={() => setMapReady(true)} provinces={provincesWithCities} rivers={rivers} riversGeo={riversGeo} lakes={lakes} nationNames={NATION_NAMES} nationControl={control} selectedId={provinceId} onSelect={selectProvince} layer={layer} onLayerChange={changeLayer} showRivers={showRivers} onToggleRivers={() => setShowRivers((v) => !v)} seas={seaFile} showSeas={showSeas} onToggleSeas={() => setShowSeas((v) => !v)} selectedSeaId={seaId} onSelectSea={selectSea} labelData={labelData} transport={transport} showTransport={showTransport} onToggleTransport={() => setShowTransport((v) => !v)} toolsHost={toolsHost} provinceResources={provinceResources} provinceUnits={provinceUnits} />
        {!(seaId && seaById.get(seaId)) && !selectedItem ? null : infoOpen ? (
          seaId && seaById.get(seaId) ? (
            <SeaPanel zone={seaById.get(seaId)} byId={seaById} onClose={() => setInfoOpen(false)} onSelect={selectSea} />
          ) : (
            <ProvincePanel item={selectedItem} nationNames={NATION_NAMES} nationControl={control} provinceResources={provinceResources} provinceData={provinceData} linkStats={linkStats} hydro={provinceData?.hydro ?? null} game={game} onClose={() => setInfoOpen(false)} build={buildOptions ? <ProvinceBuild key={selectedItem.id} options={buildOptions} onOrder={placeOrder} /> : null} />
          )
        ) : (
          <button type="button" className="info-btn" aria-label="Mostra i dati della selezione" onClick={() => setInfoOpen(true)}>i</button>
        )}
      </div>
      )}
    </div>
  );
}
