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
import { buildMapModel, ownerColor } from './map/geo.js';
import { withTerrain } from './data/terrain.js';
import { buildCanvasModel } from './map/canvasModel.js';
import initialIndustry from '../data/industry/initial_industry.json';
import initialStocks from '../data/industry/initial_stocks.json';
import initialCash from '../data/industry/initial_cash.json';
import economyData from '../data/economy/economy.json';
import populationData from '../data/population/population.json';
import fertilizerData from '../data/agriculture/fertilizer_effect.json';
import horseBreeding from '../data/agriculture/horse_breeding.json';
import hospitalCare from '../data/medical/hospital_care.json';
import { newGame, playableNations, initEconomy } from './game/state.js';
import { advanceDay } from './game/engine.js';
import { initForcesState, nationManpowerPool } from './game/forcesState.js';
import { createTradeSystem, openTradeContract, cancelTradeContract } from './game/tradeState.js';
import { TradePanel } from './ui/TradePanel.jsx';
import { tradeGoods, tradeRows, previewTrade, describeTradeFailure } from './ui/tradeView.js';
import { createGameSea } from './game/seaState.js';
import seaRoutesParams from '../data/sea_routes_params.json';
import unitsFile from '../data/units/units.json';
import deploymentFile from '../data/units/deployment_1936.json';
import entrenchFile from '../data/units/entrenchment.json';
import { validateEntrenchConfig } from './rules/entrench.js';
import { divisionsUnder } from './rules/orbat.js';
import { unitsByProvince } from './data/deployment.js';
import officersFile from '../data/officers/officers.json';
import { commandersSystem } from './game/commandersState.js';
import { buildMoveNet } from './data/moveNet.js';
import { orderMove, cancelOrders, createMovementSystem, currentDeployment, initialPositions } from './game/movementState.js';
import ArmyPanel from './ui/ArmyPanel.jsx';
import TheaterPanel from './ui/TheaterPanel.jsx';
import CommandPanel from './ui/CommandPanel.jsx';
import { playerAttach, playerDetach } from './game/orbatState.js';
import { createOrbatState } from './rules/orbat.js';
import { theaterMarks, describeAssignment } from './ui/theaterView.js';
import { createAiWarSystem } from './game/aiWarSystem.js';
import { createTheaterSystem, theaterAlerts, playerForceAttack, playerAssign, playerCancelAssignment, provinceController, isFighter, playerToggleEntrench, entrenchOf } from './game/theaterState.js';
import { enemiesOf } from './rules/war.js';
import { activeAssignments } from './rules/theater.js';
import { positionOf } from './rules/movement.js';
import conditionConfig from '../data/units/condition_config.json';
import { createConditionSystem, playerSetPolicy } from './game/conditionState.js';
import readiness from '../data/units/readiness.json';
import tplDeuInfantry from '../data/units/templates/divisione_fanteria_germania_1936.json';
import tplDeuArmored from '../data/units/templates/divisione_corazzata_germania_1936.json';
import tplGbrInfantry from '../data/units/templates/divisione_fanteria_gran_bretagna_1936.json';
import tplFraInfantry from '../data/units/templates/divisione_fanteria_francia_1936.json';
import { createEconomySystem } from './game/economySystem.js';
import { createConstruction } from './game/construction.js';
import mineSites from '../data/resources/mine_sites.json';
import { loadIndustryCatalog } from './data/industry.js';
import recipesFile from '../data/industry/recipes.json';
import factoryLevelsFile from '../data/industry/factory_levels.json';
import technologiesFile from '../data/research/technologies.json';
import securityFile from '../data/security/security.json';
import diplomacyConfig from '../data/diplomacy/diplomacy.json';
import diplomacyStart from '../data/diplomacy/relations_1936.json';
import presenceFile from '../data/military/province_presence.json';
import garrisonEstimateFile from '../data/military/garrison_estimate_1936.json';
import { presenceFromEstimate } from './data/garrison.js';
import infraConfig from '../data/infrastructure/infrastructure.json';
import portLevelsFile from '../data/ports/port_levels.json';
import portsBaseFile from '../data/ports/ports_1936.json';
import coastalCitiesFile from '../data/ports/coastal_cities.json';
import { provincePortRows, portSummary } from './ui/portView.js';
import { portPinsByProvince } from './map/portIcons.js';
import linkEdgesFile from '../data/infrastructure/link_edges.json';
import extractionBaseline from '../data/resources/extraction_baseline.json';
import hydroPlants from '../data/resources/hydro_plants.json';
import factoriesCsv from '../data/industry/factories.csv?raw';
import structuresCsv from '../data/infrastructure/structures.csv?raw';
import categoriesCsv from '../data/industry/production_categories.csv?raw';
import extraFactoriesCsv from '../data/industry/factories_extra.csv?raw';
import extraStructuresCsv from '../data/infrastructure/structures_extra.csv?raw';
import { browserStorage, createSaveStore } from './game/save.js';
import GameBar from './ui/GameBar.jsx';
import { ProvinceBuild, EconomyPanel } from './ui/BuildPanel.jsx';
import { ResearchPanel, SecurityPanel } from './ui/SecurityPanel.jsx';
import { securitySummary, sabotageRows, describeOrderFailure } from './ui/securityView.js';
import { createResearch } from './game/research.js';
import { createInfraIndex, infraNet, applyLinkLevels } from './data/infrastructure.js';
import { idsChecksum } from './data/adjacency.js';
import { entityOfProvinceId } from './data/provinceOwner.js';
import { provinceLinkRows, infraSummary } from './ui/infraView.js';
import { createSecurity } from './game/security.js';
import { createAiSecurity } from './game/aiSecurity.js';
import { createDiplomacyGame } from './game/diplomacyState.js';
import { DiplomacyPanel } from './ui/DiplomacyPanel.jsx';
import { notableRows, pairView, describeDiplomacyFailure } from './ui/diplomacyView.js';
import { provinceBuildOptions, economySummary, describeBuildFailure, upgradeOptions } from './ui/buildOptions.js';
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
const START_ECONOMY = { nationIds: nations.map((n) => n.id), industry: initialIndustry, stocks: initialStocks, cash: initialCash, economy: economyData, population: populationData, horses: horseBreeding };

// Ciclo economico giornaliero (estrazione → produzione → entrata): game/economySystem.js. Dati nel bundle, funziona offline.
const GAME_CATALOG = { levels: factoryLevelsFile, technologies: technologiesFile, recipes: new Map(recipesFile.recipes.map((r) => [r.id, r])), factories: loadIndustryCatalog({ factoriesCsv, structuresCsv, categoriesCsv, extraFactoriesCsv, extraStructuresCsv }).byId };
// Strade e ferrovie in partita (data/infrastructure.js): collegamenti tra province madri, livello di partenza e massimo; i miglioramenti sono ordini di costruzione 'infra'.
const GAME_PORTS = { levels: portLevelsFile, coastal: coastalCitiesFile.cities, base: portsBaseFile };
const GAME_INFRA = { config: infraConfig, index: createInfraIndex(linkEdgesFile) };
const ENTITY_IDS = political.map((e) => e.id);
const entityOfProvince = (id) => entityOfProvinceId(id, ENTITY_IDS);
const gameNet = (state) => (MOVE_NET.net ? infraNet(MOVE_NET.net, GAME_INFRA.index, infraConfig, state) : null); // rete con la velocità delle strade del momento
// Costruzioni (game/construction.js): `GAME_BUILD.start(stato, nazione, ordine)` ordina; UI: ui/BuildPanel.jsx
// Ospedali (data/medical/hospital_care.json): il personale esce dal pool reclutabile; la regola delle retrovie (rules/hospitals.js isRear) non è applicata finché non esiste lo stato di guerra.
const hospitalManpower = (state, nationId) => nationManpowerPool(state, nationId, { units: unitsFile.units, population: state.nations[nationId].population, baseShare: populationData.recruitment.baseShare }).available;
export const GAME_BUILD = createConstruction({ catalog: GAME_CATALOG, economy: economyData, sites: mineSites, hydro: hydroPlants, political, workersShare: populationData.workersShare.value, infra: GAME_INFRA, hospitals: { params: hospitalCare, manpowerAvailable: hospitalManpower }, ports: GAME_PORTS });
// Ricerca (game/research.js), sicurezza e sabotaggio (game/security.js) e IA (game/aiSecurity.js). I nemici dell'IA vengono dalla diplomazia (guerra o rapporto <= soglia), giocatore compreso.
const GAME_RESEARCH = createResearch({ technologies: technologiesFile, economy: economyData });
const GAME_SECURITY = createSecurity({ security: securityFile, economy: economyData, political, presence: presenceFromEstimate(garrisonEstimateFile) });
// Diplomazia minima (30/10/2026): parametri DESIGN_DEFAULT, situazione 1936 hypothesis. Rapporti, alleanze, accessi, costi di guerra, consenso al commercio.
const GAME_DIPLOMACY = createDiplomacyGame({ config: diplomacyConfig, start: diplomacyStart });
const GAME_AI = createAiSecurity({ research: GAME_RESEARCH, security: GAME_SECURITY, hostilesOf: GAME_DIPLOMACY.hostilesOf });
// Forze (game/forcesState.js): istanze di divisione create alla partita nuova e al caricamento di un salvataggio che ancora non le ha. Germania e Regno Unito (fanteria) hanno template (29/10/2026); la fanteria britannica parte come quadro al 30%.
const FORCES_CTX = { units: unitsFile.units, templates: [tplDeuInfantry, tplDeuArmored, tplGbrInfantry, tplFraInfantry], ratio: readiness.initialFillRatio.value };
const withForces = (state) => GAME_DIPLOMACY.init(initForcesState(state, FORCES_CTX).state); // anche la diplomazia: stato iniziale 1936 se manca
// Rete di movimento (province + adiacenza): si carica a partita aperta; finché manca, nessun ordine può esistere, quindi il sistema non fa nulla.
const MOVE_NET = { net: null };
const GAME_SEA = { sea: null }; // rotte marittime con i porti reali (game/seaState.js): si crea quando arrivano le zone di mare e le province
const INITIAL_POSITIONS = initialPositions(deploymentFile);
const UNITS_BY_ID = new Map(unitsFile.units.map((u) => [u.id, u]));
const OFFICERS_BY_ID = new Map(officersFile.officers.map((o) => [o.id, o]));
const ENTRENCH_ERRORS = validateEntrenchConfig(entrenchFile);
if (ENTRENCH_ERRORS.length) console.error('Trinceramento: configurazione non valida, uso i valori predefiniti.', ENTRENCH_ERRORS);
const THEATER_CTX = { getNet: gameNet, unitsById: UNITS_BY_ID, deploymentDoc: deploymentFile, initial: INITIAL_POSITIONS, entrenchCfg: ENTRENCH_ERRORS.length ? undefined : { maxBonus: entrenchFile.maxBonus, rampDays: entrenchFile.rampDays, curve: entrenchFile.curve } };
const GAME_SYSTEMS = [
  commandersSystem({ units: unitsFile.units, officers: officersFile.officers }),
  createConditionSystem(conditionConfig),
  (state) => (MOVE_NET.net ? createMovementSystem(gameNet(state))(state) : state),
  createAiWarSystem(THEATER_CTX), // IA di guerra: difesa e attacco delle nazioni non tue (solo se in guerra)
  createTheaterSystem(THEATER_CTX), // guerra, incarichi di teatro, battaglie e conquista
  GAME_DIPLOMACY.diplomacyDay, // rapporti (guerra, commercio) e contratti vietati: prima del commercio
  GAME_BUILD.constructionDay,
  createEconomySystem({ catalog: GAME_CATALOG, economy: economyData, baseline: extractionBaseline, hydro: hydroPlants, political, cash: initialCash, sites: mineSites, livestock: { fertilizer: fertilizerData, horses: horseBreeding } }),
  createTradeSystem({ resources, getNet: gameNet, getSea: (state) => (GAME_SEA.sea ? GAME_SEA.sea.at(state) : null) }), // commercio v1: contratti via terra e via mare con i porti reali (consegne e partenze); nessuna interfaccia ancora
  GAME_RESEARCH.researchDay,
  GAME_SECURITY.securityDay,
  GAME_AI.aiDay,
];

const RESOURCE_NAMES = new Map(resources.map((r) => [r.id, r.name])); // nomi italiani anche dei prodotti (acciaio, gomma lavorata, ...)
const BUILD_CTX = { build: GAME_BUILD, catalog: GAME_CATALOG, sites: mineSites, economy: economyData, hospitals: hospitalCare, resourceLabel: (id) => RESOURCE_META[id]?.label ?? RESOURCE_NAMES.get(id) ?? id };

const NATIONS_WITH_UNITS = new Set(unitsFile.units.map((u) => u.nation)); // nazioni con unità nel catalogo: i possibili avversari
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
  const linksRaw = useLinks(USE_CANVAS);
  const [showTransport, setShowTransport] = useState(false);
  // collegamenti con i gradini della PARTITA (livello di partenza o migliorato): la mappa e le regole usano lo stesso dato. Se le province non corrispondono al grafo non si applica nulla.
  const links = useMemo(() => {
    if (!linksRaw || !provinces) return linksRaw;
    const ids = provinces.features.map((f) => f.properties.id);
    if (idsChecksum(ids) !== linksRaw.checksum) return linksRaw;
    const mother = new Map(provinces.features.map((f) => [f.properties.id, f.properties.parentProvince ?? f.properties.id]));
    return applyLinkLevels(linksRaw, { provinceIds: ids, motherOf: (id) => mother.get(id), index: GAME_INFRA.index, state: game });
  }, [linksRaw, provinces, game?.infrastructure]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const [armySel, setArmySel] = useState(null); // { province, nation } del segnalino toccato
  const [armyChecked, setArmyChecked] = useState(() => new Set());
  const [armyNotice, setArmyNotice] = useState(null);
  const [moveNet, setMoveNet] = useState(null);
  const [command, setCommand] = useState(null); // { selected, notice } quando il pannello Comando (catena di comando) è aperto
  const [theater, setTheater] = useState(null); // { draft: null | { kind, provinces: [], units: [] }, notice } quando il pannello Teatro è aperto
  // destinazione di un ordine: con un segnalino proprio aperto e unità spuntate, il tocco su una provincia è un ordine di marcia
  const selectProvince = (id) => {
    if (id != null && theater?.draft && moveNet) {
      const item = mapItems.find((i) => i.id === id);
      const mother = item ? (item.props.parentProvince ?? item.props.id) : id;
      setTheater((t) => { const ps = t.draft.provinces; return { ...t, notice: null, draft: { ...t.draft, provinces: ps.includes(mother) ? ps.filter((x) => x !== mother) : [...ps, mother] } }; });
      return;
    }
    if (id != null && armySel && layer === 'army' && game && armySel.nation === game.player && armyChecked.size > 0 && moveNet) {
      const item = mapItems.find((i) => i.id === id);
      const to = item ? (item.props.parentProvince ?? item.props.id) : id;
      const movers = [...armyChecked].map((uid) => UNITS_BY_ID.get(uid)).filter(Boolean).map((u) => ({ id: u.id, category: u.category }));
      const r = orderMove(game, { units: movers, to, nation: game.player, deploymentDoc: deploymentFile, net: infraNet(moveNet, GAME_INFRA.index, infraConfig, game) });
      if (r.moved.length) setGame(r.state);
      const slowest = r.moved.reduce((m, x) => Math.max(m, x.days), 0);
      const why = { no_route: 'nessun percorso su territorio tuo', same_province: 'già lì', unknown_position: 'posizione sconosciuta' };
      setArmyNotice(`${r.moved.length ? `${r.moved.length} unità in marcia verso ${moveNet.name(to)} (fino a ${slowest} giorni). ` : ''}${r.failed.length ? `${r.failed.length} non partite: ${[...new Set(r.failed.map((f) => why[f.reason] ?? f.reason))].join(', ')}.` : ''}`);
      return;
    }
    setProvinceId(id); setSeaId(null); if (id == null) setInfoOpen(false);
  };
  // tocco su un porto del livello Porti: si apre la scheda della città portuale (se è sulla mappa), altrimenti quella della provincia
  const selectPort = ({ province, cittaId }) => selectProvince(mapItems.some((i) => i.id === cittaId) ? cittaId : province);
  const selectUnits = (g) => { if (theater?.draft) return; setCommand(null); setArmySel(g); setArmyChecked(new Set()); setArmyNotice(null); setProvinceId(null); setSeaId(null); setInfoOpen(false); };
  const toggleArmy = (uid) => setArmyChecked((s) => { const n = new Set(s); if (n.has(uid)) n.delete(uid); else n.add(uid); return n; });
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
    if (!r.ok) return { ok: false, text: describeBuildFailure(r, techName) };
    setGame(r.state);
    return { ok: true, text: 'Ordine avviato: costi pagati, il cantiere è in corso.' };
  };
  // ricerca e sicurezza: le regole sono in GAME_RESEARCH e GAME_SECURITY, qui si applica solo il risultato e si riferisce l'esito
  const techName = useMemo(() => { const m = new Map(technologiesFile.technologies.map((t) => [t.id, t.name_it])); return (id) => m.get(id) ?? id; }, []);
  const secCtx = useMemo(() => ({
    security: GAME_SECURITY, cfg: securityFile, techName,
    nationName: (id) => NATION_NAMES[id] ?? id,
    facilityName: (type) => GAME_CATALOG.factories.get(type)?.name_it ?? type,
    placeName: (id) => (String(id).startsWith('P_') ? provinceName(id) : NATION_NAMES[id] ?? id),
  }), [techName, provinceName]);
  const applyOrder = (r, okText) => {
    if (!r.ok) return { ok: false, text: describeOrderFailure(r, { techName }) };
    setGame(r.state);
    return { ok: true, text: okText };
  };
  const researchRows = useMemo(() => (game ? GAME_RESEARCH.listFor(game, game.player) : null), [game]);
  const securityView = useMemo(() => (game ? securitySummary(game, game.player, { ...secCtx, state: game }) : null), [game, secCtx]);
  // commercio: il giocatore è una delle due parti; il percorso usa la rete di movimento e le rotte marittime con i porti reali (se già caricate)
  const tradeGoodList = useMemo(() => tradeGoods(economyData, resources), []);
  const tradeCtx = () => ({ economy: economyData, resources, net: gameNet(game), sea: GAME_SEA.sea ? GAME_SEA.sea.at(game) : null, consent: GAME_DIPLOMACY.tradeConsent });
  const orderOf = (o) => (o.direction === 'sell' ? { seller: game.player, buyer: o.partner } : { seller: o.partner, buyer: game.player });
  const previewTradeOrder = useCallback((o) => previewTrade(game, { ...orderOf(o), good: o.good, perDay: o.perDay, days: o.days, mode: o.mode }, tradeCtx()), [game, moveNet, seaFile]); // eslint-disable-line react-hooks/exhaustive-deps
  const openTrade = (o) => {
    const r = openTradeContract(game, { ...orderOf(o), good: o.good, perDay: o.perDay, days: o.days, mode: o.mode }, tradeCtx());
    if (!r.ok) return { ok: false, text: describeTradeFailure(r.reason) };
    setGame(r.state);
    return { ok: true, text: `Contratto ${r.contract.id} aperto: parte domani.` };
  };
  const cancelTrade = (id) => { const r = cancelTradeContract(game, id); if (!r.ok) return { ok: false, text: describeTradeFailure(r.reason) }; setGame(r.state); return { ok: true, text: `Contratto ${id} annullato.` }; };
  const tradePartners = useMemo(() => (game ? Object.keys(game.nations).filter((id) => id !== game.player).map((id) => ({ id, name: NATION_NAMES[id] ?? id })).sort((a, b) => a.name.localeCompare(b.name, 'it')) : []), [game?.player]); // eslint-disable-line react-hooks/exhaustive-deps
  const tradeList = useMemo(() => (game ? tradeRows(game, game.player, { nationName: (id) => NATION_NAMES[id] ?? id, goods: tradeGoodList }) : []), [game?.trade, game?.day, game?.player]); // eslint-disable-line react-hooks/exhaustive-deps
  // diplomazia: azioni del giocatore verso una nazione (rapporti, alleanze, accesso, guerra e pace)
  const dipAct = (fn, okText) => (target) => {
    const r = fn(game, game.player, target);
    if (!r.ok) return { ok: false, text: describeDiplomacyFailure(r.reason, r) };
    setGame(r.state);
    return { ok: true, text: typeof okText === 'function' ? okText(r, NATION_NAMES[target] ?? target) : okText };
  };
  const dipActions = {
    improve: dipAct(GAME_DIPLOMACY.improveRelations, (r, n) => `Rapporti con ${n} migliorati.`),
    alliance: dipAct(GAME_DIPLOMACY.proposeAlliance, (r, n) => `${n} accetta l'alleanza (nemico comune: ${NATION_NAMES[r.enemy] ?? r.enemy}).`),
    breakAlliance: dipAct(GAME_DIPLOMACY.breakAlliance, (r, n) => `Alleanza con ${n} rotta.`),
    access: dipAct(GAME_DIPLOMACY.requestAccess, (r, n) => `${n} concede il passaggio alle tue truppe.`),
    revoke: (target) => { const r = GAME_DIPLOMACY.revokeAccessTo(game, game.player, target); if (!r.ok) return { ok: false, text: describeDiplomacyFailure(r.reason) }; setGame(r.state); return { ok: true, text: 'Accesso ritirato.' }; },
    war: dipAct(GAME_DIPLOMACY.declareWar, (r, n) => `Guerra dichiarata a ${n}.`),
    peace: dipAct(GAME_DIPLOMACY.makePeace, (r, n) => `Pace con ${n}.`),
  };
  const nationNameOf = (id) => NATION_NAMES[id] ?? id;
  const dipRows = useMemo(() => (game?.diplomacy ? notableRows(game, game.player, diplomacyConfig, nationNameOf) : []), [game?.diplomacy, game?.war, game?.player]); // eslint-disable-line react-hooks/exhaustive-deps
  const startResearch = (techId) => applyOrder(GAME_RESEARCH.start(game, game.player, techId), 'Ricerca avviata: costo pagato.');
  const trainAgent = (role) => applyOrder(GAME_SECURITY.train(game, game.player, role), 'Addestramento avviato: costo pagato.');
  const trainPolice = (place) => applyOrder(GAME_SECURITY.trainMilitaryPolice(game, game.player, place), 'Reparto di polizia militare in addestramento.');
  const deploySpy = (targetId) => applyOrder(GAME_SECURITY.deploySpy(game, game.player, targetId), 'Spia schierata.');
  const launchSabotage = (targetId, facilityId) => applyOrder(GAME_SECURITY.sabotage(game, game.player, { targetNation: targetId, facilityId }), 'Sabotaggio in preparazione: l\'esito arriva a fine operazione.');
  const buildOptions = useMemo(() => {
    const id = selectedItem?.props?.parentProvince ?? selectedItem?.props?.id;
    return game && id ? provinceBuildOptions(game, game.player, id, BUILD_CTX) : null;
  }, [game, selectedItem]);
  const provinceUpgrades = useMemo(() => {
    const id = selectedItem?.props?.parentProvince ?? selectedItem?.props?.id;
    return game && id ? upgradeOptions(game, game.player, { ...BUILD_CTX, provinceId: id }) : null;
  }, [game, selectedItem]);
  const provinceLinks = useMemo(() => {
    const id = selectedItem?.props?.parentProvince ?? selectedItem?.props?.id;
    return game && id ? provinceLinkRows(game, id, { infra: GAME_INFRA, build: GAME_BUILD, provinceName, nationId: game.player }) : null;
  }, [game, selectedItem, provinceName]);
  const provincePorts = useMemo(() => {
    const id = selectedItem?.props?.parentProvince ?? selectedItem?.props?.id;
    return game && id ? provincePortRows(game, id, { ports: GAME_PORTS, build: GAME_BUILD, nationId: game.player, techName }) : null;
  }, [game, selectedItem, techName]);
  const harbours = useMemo(() => (game ? portSummary(game, game.player, { ports: GAME_PORTS, entityOf: entityOfProvince }) : null), [game]);
  const portPins = useMemo(() => portPinsByProvince(GAME_PORTS, game), [game?.ports]); // eslint-disable-line react-hooks/exhaustive-deps -- livello Porti: i porti con livello ≥ 1 per provincia (senza partita: quelli del 1936)
  const network = useMemo(() => (game ? infraSummary(game, game.player, { infra: GAME_INFRA, entityOf: entityOfProvince }) : null), [game]);
  const nationUpgrades = useMemo(() => (game ? upgradeOptions(game, game.player, BUILD_CTX) : null), [game]);
  const focus = useMemo(() => (game && provinces ? nationBounds(provinces.features, game.player) : null), [game?.player, provinces]); // eslint-disable-line react-hooks/exhaustive-deps
  const provinceUnits = useMemo(() => unitsByProvince(unitsFile.units, currentDeployment(deploymentFile, game), game?.date ?? '1936-01-01'), [game?.date, game?.movement]); // eslint-disable-line react-hooks/exhaustive-deps
  const armyGroup = armySel ? (provinceUnits[armySel.province] ?? []).find((x) => x.nation === armySel.nation) ?? null : null;
  // Teatro: incarichi (attacco/difesa) con province scelte sulla mappa, guerra e registro delle battaglie
  const theaterCtx = { getNet: gameNet, unitsById: UNITS_BY_ID };
  const startAssign = () => {
    if (!game || !armyGroup) return;
    const ids = (armyChecked.size ? [...armyChecked] : armyGroup.units.map((u) => u.id)).filter((uid) => { const u = UNITS_BY_ID.get(uid); return u && u.nation === game.player && isFighter(game, u); });
    setTheater({ draft: { kind: 'attack', provinces: [], units: ids }, notice: ids.length ? null : 'Nessuna di queste unità può combattere (serve una divisione con dotazione).' });
    setArmySel(null);
  };
  const confirmAssign = () => {
    try {
      const d = theater.draft;
      const r = playerAssign(game, { kind: d.kind, provinces: d.provinces, units: d.units, ctx: theaterCtx });
      setGame(r.state);
      setTheater({ draft: null, notice: `Incarico ${r.id} dato: le unità si mettono in marcia.` });
    } catch (e) { setTheater((t) => ({ ...t, notice: e.message })); }
  };
  const theaterCards = useMemo(() => (theater && game && moveNet && game.theaters
    ? activeAssignments(game.theaters).filter((a) => a.nation === game.player).map((a) => describeAssignment(a, {
      net: moveNet, positionOf: (u) => positionOf(game.movement, INITIAL_POSITIONS, u), controllerOf: (p) => provinceController(game, moveNet, p),
      unitName: (u) => UNITS_BY_ID.get(u)?.name ?? u, effectiveOf: (u) => game.forces?.divisions?.[u]?.items?.['manpower.war']?.effective ?? null,
    })) : []), [theater, game, moveNet]);
  const alerts = useMemo(() => (game && moveNet && game.theaters ? theaterAlerts(game, THEATER_CTX, game.player) : []), [game, moveNet]);
  const theaterMarkSet = useMemo(() => (game && moveNet ? theaterMarks({ state: game, pick: theater?.draft?.provinces ?? [], colorOf: (n) => ownerColor(n), alerts }) : null), [game?.provinces, game?.theaters, game?.player, theater?.draft?.provinces, moveNet, alerts]); // eslint-disable-line react-hooks/exhaustive-deps
  // rete di movimento: si carica (e si costruisce) quando c'è una partita; l'adiacenza è un file a parte, non nel pacchetto principale
  useEffect(() => {
    if (!game || moveNet || !provinces) return undefined;
    let alive = true;
    import('../data/adjacency.json').then((m) => {
      if (!alive) return;
      try { const net = buildMoveNet(provinces, m.default); MOVE_NET.net = net; setMoveNet(net); } catch (e) { setArmyNotice(`Movimento non disponibile: ${e.message}`); }
    }).catch(() => { if (alive) setArmyNotice('Movimento non disponibile: file di adiacenza non caricato.'); });
    return () => { alive = false; };
  }, [!!game, !!provinces, moveNet]); // eslint-disable-line react-hooks/exhaustive-deps
  // rotte marittime: servono le zone di mare e le province (stesso ordine di data/sea_zones.json); i porti vengono da data/ports e da state.ports
  useEffect(() => {
    if (!game || GAME_SEA.sea || !seaFile || !provinces) return;
    try {
      const props = provinces.features.map((f) => f.properties);
      const mother = new Map(props.map((p) => [p.id, p.parentProvince ?? p.id]));
      GAME_SEA.sea = createGameSea({ seaFile, params: seaRoutesParams, provinceIds: props.map((p) => p.id), motherOf: (id) => mother.get(id) ?? id, entityOf: entityOfProvince, ports: GAME_PORTS });
    } catch (e) { setArmyNotice(`Rotte marittime non disponibili: ${e.message}`); }
  }, [!!game, !!seaFile, !!provinces]); // eslint-disable-line react-hooks/exhaustive-deps
  const layerReady = (layer !== 'terrain' || terrain !== null) && (layer !== 'resources' || provinceResources !== null); // dati del livello scelto arrivati
  const dataReady = waterStatus !== 'loading' && seaStatus !== 'loading' && citiesRaw !== null && labelData !== null && land !== null && layerReady;
  // cambio di livello (Politico / Terreno / Risorse): la mappa si ridisegna e va mostrata solo a disegno finito, come all'avvio
  const changeLayer = (next) => {
    if (next === layer) return;
    setLayer(next);
    if (next !== 'army') setArmySel(null);
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
        {game && tab === 'map' ? <button type="button" className={command ? 'on' : ''} aria-pressed={Boolean(command)} onClick={() => { setCommand((c) => (c ? null : { selected: null, notice: null })); setTheater(null); setArmySel(null); }}>Comando</button> : null}
        {game && tab === 'map' ? <button type="button" className={theater ? 'on' : ''} aria-pressed={Boolean(theater)} onClick={() => { setTheater((t) => (t ? null : { draft: null, notice: null })); setCommand(null); }}>Teatro{alerts.filter((al) => al.level === 'short').length ? ` ⚠${alerts.filter((al) => al.level === 'short').length}` : ''}</button> : null}
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
            <EconomyPanel summary={economySummary(game, game.player, { build: GAME_BUILD, catalog: GAME_CATALOG, workersShare: populationData.workersShare.value, resourceLabel: BUILD_CTX.resourceLabel, provinceName, infra: infraConfig, hospitalKinds: hospitalCare.kinds, portLevels: portLevelsFile })} upgrades={nationUpgrades} onOrder={placeOrder} network={network} harbours={harbours} />
            <DiplomacyPanel partners={tradePartners} rows={dipRows} detail={(id) => pairView(game, game.player, id, diplomacyConfig, nationNameOf)} cfg={diplomacyConfig} actions={dipActions} />
            <TradePanel goods={tradeGoodList} partners={tradePartners} rows={tradeList} onPreview={previewTradeOrder} onOpen={openTrade} onCancel={cancelTrade} />
            <ResearchPanel rows={researchRows} onStart={startResearch} />
            <SecurityPanel summary={securityView} onTrain={trainAgent} onPolice={trainPolice} onDeploy={deploySpy} onSabotage={launchSabotage} rowsFor={(t) => sabotageRows(game, game.player, t, secCtx)} />
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
                ...(layer === 'political' || layer === 'army' || layer === 'ports' ? [] : [{ label: layer === 'terrain' ? 'Terreno' : 'Risorse', done: layerReady }]),
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
        <MapScreen land={land} focus={focus} dataReady={dataReady} readyKey={readyKey} onReady={() => setMapReady(true)} provinces={provincesWithCities} rivers={rivers} riversGeo={riversGeo} lakes={lakes} nationNames={NATION_NAMES} nationControl={control} selectedId={provinceId} onSelect={selectProvince} layer={layer} onLayerChange={changeLayer} showRivers={showRivers} onToggleRivers={() => setShowRivers((v) => !v)} seas={seaFile} showSeas={showSeas} onToggleSeas={() => setShowSeas((v) => !v)} selectedSeaId={seaId} onSelectSea={selectSea} labelData={labelData} transport={transport} showTransport={showTransport} onToggleTransport={() => setShowTransport((v) => !v)} toolsHost={toolsHost} provinceResources={provinceResources} provinceUnits={provinceUnits} onSelectUnits={selectUnits} marks={theaterMarkSet} provincePorts={portPins} onSelectPort={selectPort} />
        {command && game ? (
          <CommandPanel orbat={game.orbat ?? createOrbatState()} units={unitsFile.units} nation={game.player} date={game.date} nationName={NATION_NAMES[game.player]} selectedId={command.selected} notice={command.notice}
            onSelect={(id) => setCommand((c) => ({ ...c, selected: id, notice: null }))}
            onAttach={(unitId, parentId) => { try { const r = playerAttach(game, { unitId, parentId, units: unitsFile.units }); setGame(r.state); setCommand((c) => ({ ...c, notice: `${UNITS_BY_ID.get(unitId).name} è ora agli ordini di ${UNITS_BY_ID.get(parentId).name}.` })); return true; } catch (e) { setCommand((c) => ({ ...c, notice: e.message })); return false; } }}
            onDetach={(unitId) => { try { const r = playerDetach(game, unitId, { units: unitsFile.units }); setGame(r.state); setCommand((c) => ({ ...c, notice: `${UNITS_BY_ID.get(unitId).name} non ha più un comando superiore.` })); } catch (e) { setCommand((c) => ({ ...c, notice: e.message })); } }}
            onClose={() => setCommand(null)} />
        ) : null}
        {theater && game ? (
          <TheaterPanel alerts={alerts} onForce={(id, f) => { try { setGame((g) => playerForceAttack(g, id, f)); } catch (e) { setTheater((t) => ({ ...t, notice: e.message })); } }} draft={theater.draft} unitCount={theater.draft?.units.length ?? 0} cards={theaterCards} enemies={enemiesOf(game.war, game.player).map((n) => NATION_NAMES[n] ?? n)}
            candidates={[...NATIONS_WITH_UNITS].filter((n) => n !== game.player && !enemiesOf(game.war, game.player).includes(n)).map((n) => ({ id: n, name: NATION_NAMES[n] ?? n })).sort((a, b) => a.name.localeCompare(b.name, 'it'))}
            log={(game.combat?.log ?? []).slice(-8).reverse()} nameOf={(p) => moveNet?.name(p) ?? p} notice={theater.notice}
            onKind={(kind) => setTheater((t) => ({ ...t, notice: null, draft: { ...t.draft, kind, provinces: [] } }))}
            onRemove={(p) => setTheater((t) => ({ ...t, draft: { ...t.draft, provinces: t.draft.provinces.filter((x) => x !== p) } }))}
            onConfirm={confirmAssign} onCancelDraft={() => setTheater({ draft: null, notice: null })}
            onCancelAssignment={(id) => { try { setGame((g) => playerCancelAssignment(g, id)); setTheater((t) => ({ ...t, notice: `Incarico ${id} annullato.` })); } catch (e) { setTheater((t) => ({ ...t, notice: e.message })); } }}
            onDeclareWar={(n) => { const r = GAME_DIPLOMACY.declareWar(game, game.player, n); if (r.ok) { setGame(r.state); setTheater((t) => ({ ...t, notice: `Guerra dichiarata a ${NATION_NAMES[n] ?? n}.` })); } else setTheater((t) => ({ ...t, notice: describeDiplomacyFailure(r.reason, r) })); }}
            onClose={() => setTheater(null)} />
        ) : armyGroup && layer === 'army' && game ? (
          <ArmyPanel group={{ ...armyGroup, province: armySel.province }} game={game} unitsById={UNITS_BY_ID} officersById={OFFICERS_BY_ID} initial={INITIAL_POSITIONS}
            provinceName={provinceName} conditionConfig={conditionConfig} onPolicy={(uid, p) => setGame((g) => playerSetPolicy(g, uid, p, conditionConfig, UNITS_BY_ID.get(uid)?.nation))} canMove={armySel.nation === game.player && moveNet !== null} selected={armyChecked} onToggle={toggleArmy} onSelectAll={(ids) => setArmyChecked(new Set(ids))} onClear={() => setArmyChecked(new Set())} flag={flagsFile.flags[armySel.nation]} nationName={NATION_NAMES[armySel.nation]}
            onAssign={armySel.nation === game.player && moveNet ? startAssign : undefined} onCommand={armySel.nation === game.player ? () => { const first = [...armyChecked][0] ?? null; setCommand({ selected: first, notice: null }); setTheater(null); setArmySel(null); } : undefined} entrenchOf={(id) => entrenchOf(game, id, THEATER_CTX.entrenchCfg)} onEntrench={armySel.nation === game.player && moveNet ? (on) => { try { setGame((g) => playerToggleEntrench(g, { unitIds: [...armyChecked], on, ctx: THEATER_CTX })); setArmyNotice(on ? 'Le unità scelte si trincerano: il bonus cresce ogni giorno fermo.' : 'Le unità scelte smettono di trincerarsi.'); } catch (e) { setArmyNotice(e.message); } } : undefined} subordinates={(id) => divisionsUnder(game.orbat ?? { links: {} }, id, UNITS_BY_ID).map((d) => ({ id: d, name: UNITS_BY_ID.get(d).name, province: provinceName(positionOf(game.movement, INITIAL_POSITIONS, d)) }))} onClose={() => setArmySel(null)} onCancel={() => { setGame((g) => cancelOrders(g, [...armyChecked])); setArmyNotice('Ordini annullati: le unità restano dove sono.'); }} notice={armyNotice} />
        ) : !(seaId && seaById.get(seaId)) && !selectedItem ? null : infoOpen ? (
          seaId && seaById.get(seaId) ? (
            <SeaPanel zone={seaById.get(seaId)} byId={seaById} onClose={() => setInfoOpen(false)} onSelect={selectSea} />
          ) : (
            <ProvincePanel item={selectedItem} nationNames={NATION_NAMES} nationControl={control} provinceResources={provinceResources} provinceData={provinceData} linkStats={linkStats} hydro={provinceData?.hydro ?? null} game={game} onClose={() => setInfoOpen(false)} build={buildOptions ? <ProvinceBuild key={selectedItem.id} options={buildOptions} onOrder={placeOrder} upgrades={provinceUpgrades} links={provinceLinks} ports={provincePorts} focusPortId={selectedItem.id} /> : null} />
          )
        ) : (
          <button type="button" className="info-btn" aria-label="Mostra i dati della selezione" onClick={() => setInfoOpen(true)}>i</button>
        )}
      </div>
      )}
    </div>
  );
}
