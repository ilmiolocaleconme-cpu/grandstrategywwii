// Genera data/industry/initial_industry.json (industria iniziale 1/1/1936, fasce A e B; la fascia C parte senza industria).
// Tutti i numeri sono DESIGN_DEFAULT (approvati in chat il 27/10/2026): nessun dato storico per impianto.
// Uso: npm run build:industry   (richiede data/resources/*.json già generati)
import fs from 'node:fs';
import { resourceExtraction, totalByPrefix } from '../src/data/extraction.js';

const j = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const ctx = { production: j('data/resources/production_1936.json'), factors: j('data/resources/extraction_factors.json'), scaleFile: j('data/resources/extraction_scale.json'), pointsByProvince: j('data/resources/resource_points.json').byProvince, extra: j('data/resources/resource_locations_extra.json') };
const R = ['iron_ore', 'coal', 'oil', 'bauxite', 'rubber'];
const ext = Object.fromEntries(R.map((r) => [r, resourceExtraction(r, ctx)]));
const nationIds = j('data/nations.json').map((n) => n.id);
const entities = new Map(j('data/political_1936.json').map((e) => [e.id, e]));
const hydro = j('data/resources/hydro_plants.json');
const hy = {};
for (const p of hydro.plants ?? []) if ((p.era ?? 'pre1936') !== 'event') { const n = (p.provinceId ?? '').split('_')[1]; if (n) hy[n] = (hy[n] ?? 0) + (p.megawatts ?? 0); }

const A = { USA: 30, DEU: 12, USSR: 10, GBR: 8, FRA: 4, JPN: 4, BEL: 2, ITA: 1, CZE: 1, POL: 1, CAN: 1, SWE: 1 }; // acciaierie
const MW = { veh: 16, feed: 6, stud: 2, pharma: 10, tank: 24, art: 15, steel: 12, alu: 18, chem: 14, ref: 10, syn: 20, rub: 9, mach: 14, comp: 12, eng: 18, mun: 12, wpn: 8 };
const FACT = { veh: ['FCT-VEHICLES', 'REC-VEH-DEU-TRUCK'], steel: ['FCT-STEEL', 'REC-STEEL-001'], alu: ['FCT-ALUMINIUM', 'REC-ALU-001'], ref: ['FCT-REFINERY', 'REC-FUEL-OIL-001'], syn: ['FCT-SYNFUEL', 'REC-FUEL-COAL-001'], rub: ['FCT-RUBBER', 'REC-RUBBER-001'], chem: ['FCT-CHEMICAL', 'REC-CHEM-001'], mach: ['FCT-MACHINERY', 'REC-MACHINERY-001'], comp: ['FCT-COMPONENTS', 'REC-COMPONENTS-001'], eng: ['FCT-ENGINE', 'REC-ENGINES-001'], mun: ['FCT-MUNITIONS', 'REC-MUNITIONS-001'], therm: ['FCT-POWER', 'REC-ELECTRIC-COAL-001'], tank: ['FCT-TANKS', 'REC-TANK-CZE-LT35'], art: ['FCT-ARTILLERY', 'REC-ARTILLERY-001'], wpn: ['FCT-WEAPONS', null], feed: ['FCT-FEED', 'REC-FEED-001'], stud: ['FCT-STUD', 'REC-HORSES-001'], pharma: ['FCT-PHARMA', 'REC-PHARMA-001'] };
// Fabbriche di carri e di artiglieria: oggi solo la Cecoslovacchia (richiesta dell'utente del 29/10/2026; Škoda e ČKD). Le altre nazioni non le hanno ancora: mancano le ricette per i loro modelli.
// Carri (decisione dell'utente del 12/11/2026): una fabbrica di carri anche per DEU, FRA, GBR, ITA, JPN e USA, con il carro del proprio catalogo
// (il più leggero, il più adatto al 1936); la URSS dal 12/11/2026 col T-26 (template della divisione carri 1940).
// Cavalli (decisione dell'utente del 13/11/2026: «tutte le grandi potenze»): un mangimificio e un allevamento iniziali per DEU, FRA, GBR, ITA, JPN, POL, USA, URSS.
// Senza, all'inizio nessuna nazione produce cavalli. Il mangimificio usa il frumento nazionale. Industria farmaceutica (scelta dell'utente del 14/11/2026):
// senza, la medicina finisce al giorno 150 e gli allevamenti si fermano; serve anche agli ospedali.
// Veicoli (decisione dell'utente del 18/11/2026, «tutte e tre»): la Germania parte con 3 fabbriche di veicoli (Opel, Daimler-Benz, Büssing), ricetta autocarri da 3 t.
// URSS (decisione dell'utente del 19/11/2026): 2 fabbriche di veicoli, ZIS (Mosca, ZIS-5 da 3 t) e GAZ (Gor'kij, GAZ-AA da 1,5 t; in EXTRA).
// USA (decisione dell'utente del 21/11/2026, «gli USA iniziano neutrali e in isolamento, solo dopo la produzione di massa»): 2 fabbriche di veicoli,
// autocarri da 1,5 t; la seconda (in EXTRA) passa al GMC da 2,5 t dal 1/1/1941. Jeep, scout car, M8 e semicingolati: riconversione dell'IA o del giocatore.
const VEHICLES = { DEU: 3, USSR: 1, USA: 1, GBR: 1, ITA: 1, FRA: 1, JPN: 1 }; // GBR e ITA dal 24/11/2026, FRA e JPN dal 25/11/2026 (passo 3)
const HORSES = ['DEU', 'FRA', 'GBR', 'ITA', 'JPN', 'POL', 'USA', 'USSR'];
const ARMS = { CZE: { tank: 1, art: 1 }, DEU: { wpn: 1, art: 2, tank: 1 }, FRA: { wpn: 1, art: 1, tank: 1 }, GBR: { wpn: 1, art: 1, tank: 1 }, ITA: { wpn: 1, art: 1, tank: 1 }, USSR: { wpn: 1, art: 1, tank: 1 }, JPN: { wpn: 1, art: 1, tank: 1 }, USA: { wpn: 1, art: 1, tank: 1 } };
// Armi leggere e artiglieria (richiesta dell'utente del 10/11/2026): un impianto di ciascun tipo per le nazioni che hanno voci nel catalogo equipaggiamenti (USSR e JPN da fonti web del 10/11/2026, provvisorie)
// (data/units/equipment/catalog*.json). Ricetta di default = prodotto REC-<equipment_id> generato da equipment_production.json: valore di gioco, non storico;
// il giocatore la cambia dall'impianto. USA dal T/O 70 del 1940 (scheda fornita dall'utente, 11/11/2026).
const EQUIP = { DEU: { wpn: 'REC-INW-DEU-RIFLE', art: 'REC-ART-DEU-LEFH18', tank: 'REC-TNK-DEU-PZ-I' }, FRA: { wpn: 'REC-INW-FRA-RIFLE-1939', art: 'REC-ART-FRA-ART75M1897', tank: 'REC-TNK-FRA-R35', veh: 'REC-VEH-FRA-CITROEN23' }, GBR: { wpn: 'REC-INW-GBR-RIFLE', art: 'REC-ART-GBR-18PDR', tank: 'REC-TNK-GBR-MK6', veh: 'REC-VEH-GBR-TRUCK15' }, ITA: { wpn: 'REC-INW-ITA-RIFLE-1940', art: 'REC-ART-ITA-GUN75-27-ARM-1940', tank: 'REC-TNK-ITA-L3-35', veh: 'REC-VEH-ITA-SPA-DOV35' },
  USSR: { wpn: 'REC-INW-USSR-RIFLE-1939', art: 'REC-ART-USSR-GUN76-1939', tank: 'REC-TNK-USSR-T26-1940', veh: 'REC-VEH-USSR-ZIS5' }, JPN: { wpn: 'REC-INW-JPN-RIFLE-1939', art: 'REC-ART-JPN-GUN75-T38', tank: 'REC-TNK-JPN-TYPE95-1942', veh: 'REC-VEH-JPN-ISUZU-T94' },
  USA: { wpn: 'REC-INW-USA-RIFLE-1940', art: 'REC-ART-USA-GUN75-1940', tank: 'REC-TNK-USA-M2A2', veh: 'REC-VEH-USA-TRUCK15' } }; // USA carro: M2A2 (passo 4, 21/11/2026; prima la voce di classe)
// Fabbriche di munizioni per nazione (decisione dell'utente del 04/11/2026, «per equilibrare il gioco»): copertura della domanda di
// attacco continuo di tutte le divisioni del catalogo (348 divisioni, data/military/ammo_consumption.json) con almeno il 100 %.
// 100 t/giorno per fabbrica. Le nazioni senza divisioni nel catalogo non ne ricevono. Il vecchio calcolo (un quinto delle acciaierie) è
// sostituito da questa tabella; le altre nazioni di fascia A restano a 0 fabbriche di munizioni.
// Armi delle divisioni (19/11/2026, richiesta dell'utente «Ok fallo» dopo la formazione delle divisioni): con un solo impianto per tipo la Germania
// produceva solo fucili e obici da 105; mortai, mitragliatrici, pistole, anticarro, cannoni di fanteria e obici pesanti restavano a zero. Impianti in più,
// uno per arma, con la ricetta del modello usato dai battaglioni (data/units/modules/modules_deu.json). Obici leggeri: 2 impianti (il collo di bottiglia,
// ~2,45 al giorno ciascuno). Stime di Claude, non dati storici per impianto. Le altre grandi potenze: da fare (i loro template usano voci di classe).
// URSS (19/11/2026, «tutto dai battaglioni»): un impianto per ogni arma dei battaglioni del 1936 (data/units/modules/modules_ussr.json) più il mortaio da 82
// (dal 1936, serve all'organico 1939). AT 45 e obici da 122 senza data d'inizio (scelta dell'utente del 19/11/2026). Linee riservate qui sotto (20/11/2026);
// Stime di Claude, non dati storici per impianto.
const EXTRA = { USSR: [['wpn', 'REC-INW-USSR-PISTOL-TT33'], ['wpn', 'REC-MG-USSR-LMG-1939'], ['wpn', 'REC-MG-USSR-HMG-1939'], ['art', 'REC-ART-USSR-MOR82'], ['art', 'REC-ART-USSR-GUN76-REGT'], ['art', 'REC-ART-USSR-AT45-1939'], ['art', 'REC-ART-USSR-HOW122-1939'], ['art', 'REC-ART-USSR-AA76'], ['veh', 'REC-VEH-USSR-GAZAA'],
  // 20/11/2026 («inserisci ciò che manca»): obice da 152 (senza data d'inizio) e linee RISERVATE ai modelli futuri, che producono il modello del 1936
  // della stessa famiglia e si riconvertono alla data (plannedRecipe, src/game/retoolSystem.js): mortai da 50 (1938) e 120 (1939), contraerea
  // da 37 (1939), fucili anticarro PTRD (settembre 1941). Mortaio da 107 e cannone da montagna: nessuna linea (nessuna divisione da montagna nel 1936).
  ['art', 'REC-ART-USSR-HOW152-1939'], ['art', 'REC-ART-USSR-MOR82', { recipeId: 'REC-ART-USSR-MOR50', from: '1938-01-01' }],
  ['art', 'REC-ART-USSR-MOR82', { recipeId: 'REC-ART-USSR-MOR120', from: '1939-01-01' }], ['art', 'REC-ART-USSR-AA76', { recipeId: 'REC-ART-USSR-AA37', from: '1939-01-01' }],
  ['art', 'REC-ART-USSR-AT45-1939', { recipeId: 'REC-ART-USSR-PTRD', from: '1941-09-01' }]], DEU: [['wpn', 'REC-INW-DEU-PISTOL-1939'], ['wpn', 'REC-MG-DEU-MG34-L'], ['wpn', 'REC-MG-DEU-MG34-S'], ['art', 'REC-ART-DEU-SFH18'], ['art', 'REC-ART-DEU-GRW34'], ['art', 'REC-ART-DEU-GRW36'], ['art', 'REC-ART-DEU-PAK36'], ['art', 'REC-ART-DEU-LEIG18']] };
// USA (21/11/2026, passo 3 dello schema unico; scelte dell'utente 1B, 2A, 3A): una linea per ogni arma dei battaglioni del 1936
// (data/units/modules/modules_usa.json) e linee RISERVATE ai modelli futuri, che producono il modello del 1936 della stessa famiglia e si
// riconvertono alla data (plannedRecipe): carabina M1 (10/1941), bazooka (6/1942), anticarro da 37 e mortaio da 60 (1/1940), obice M1 da 155 (1/1942,
// la linea produce prima il vecchio M1918). Le linee di base (fucile e 75 mm) passano al Garand (1/1937) e al 105 (1/1940): BASE_PLAN qui sotto.
// Stime di Claude, non dati storici per impianto.
EXTRA.USA = [['wpn', 'REC-INW-USA-RIFLE-1940', { recipeId: 'REC-INW-USA-CARBINE-M1', from: '1941-10-01' }], ['wpn', 'REC-INW-USA-PISTOL-M1911'],
  ['wpn', 'REC-INW-USA-SMG-THOMPSON'], ['wpn', 'REC-MG-USA-BAR-1940'], ['wpn', 'REC-MG-USA-HMG-1940'], ['wpn', 'REC-MG-USA-M2-1940'],
  ['wpn', 'REC-MG-USA-HMG-1940', { recipeId: 'REC-GL-USA-BAZOOKA', from: '1942-06-01' }], ['art', 'REC-ART-USA-MORTAR81-1940'],
  ['art', 'REC-ART-USA-GUN75-1940', { recipeId: 'REC-ART-USA-AT37-1940', from: '1940-01-01' }],
  ['art', 'REC-ART-USA-MORTAR81-1940', { recipeId: 'REC-ART-USA-MOR60', from: '1940-01-01' }],
  ['art', 'REC-ART-USA-HOW155-M1918', { recipeId: 'REC-ART-USA-HOW155-1940', from: '1942-01-01' }],
  ['veh', 'REC-VEH-USA-TRUCK15', { recipeId: 'REC-VEH-USA-GMC-CCKW', from: '1941-01-01' }]];
// Piano storico delle linee di base (la prima linea di ogni fabbrica d'armi della nazione).
// Regno Unito (24/11/2026, passo 3, scelta A dell'utente): una linea per ogni arma dei battaglioni del 1936 (data/units/modules/modules_gbr.json)
// e linee riservate ai modelli futuri che producono un modello del 1936 e si riconvertono alla data (plannedRecipe): Bren (9/1937), mortaio da 2 pollici
// (1/1938), Boys (11/1937), anticarro da 2 libbre (1/1937), obice da 5,5 pollici (5/1941), Universal Carrier (6/1936). Linee di base (BASE_PLAN):
// fucile → No. 4 (7/1941), 18 libbre → 25 libbre (1/1940). Stime di Claude, non dati storici per impianto.
EXTRA.GBR = [['wpn', 'REC-INW-GBR-PISTOL-WEBLEY'], ['wpn', 'REC-MG-GBR-LEWIS', { recipeId: 'REC-MG-GBR-BREN', from: '1937-09-01' }], ['wpn', 'REC-MG-GBR-VICKERS'],
  ['art', 'REC-ART-GBR-MOR3IN'], ['art', 'REC-ART-GBR-MOR3IN', { recipeId: 'REC-ART-GBR-MOR2IN', from: '1938-01-01' }],
  ['art', 'REC-ART-GBR-MOR3IN', { recipeId: 'REC-ART-GBR-BOYS', from: '1937-11-01' }], ['art', 'REC-ART-GBR-18PDR', { recipeId: 'REC-ART-GBR-2PDR-ARM-1939', from: '1937-01-01' }],
  ['art', 'REC-ART-GBR-HOW45', { recipeId: 'REC-ART-GBR-HOW55', from: '1941-05-01' }],
  ['veh', 'REC-VEH-GBR-TRUCK3T'], ['veh', 'REC-VEH-GBR-TRUCK15', { recipeId: 'REC-VEH-GBR-CARRIER', from: '1936-06-01' }],
  ['tank', 'REC-TNK-GBR-MK6', { recipeId: 'REC-TNK-GBR-MATILDA1', from: '1937-06-01', then: { recipeId: 'REC-TNK-GBR-MATILDA2', from: '1939-06-01', then: { recipeId: 'REC-TNK-GBR-VALENTINE', from: '1940-06-01', then: { recipeId: 'REC-TNK-GBR-CHURCHILL', from: '1941-06-01' } } } }]];
// Italia (24/11/2026, passo 3, scelta dell'utente: una linea per arma): armi dei battaglioni del 1936 (data/units/modules/modules_ita.json) e linee che si
// riconvertono alle date storiche: Fiat 14/35 → Breda 37 (6/1937), 65/17 → 47/32 (10/1938), seconda linea del 75/27 → obice 75/18 (1/1937),
// pistola → MAB 38 (6/1938), GT17 → Alce (6/1939); contraerea Breda 20/65. Linea di base del fucile → Carcano 91/38 (1/1938). Stime di Claude.
EXTRA.ITA = [['wpn', 'REC-INW-ITA-PISTOL-BERETTA34'], ['wpn', 'REC-INW-ITA-PISTOL-BERETTA34', { recipeId: 'REC-INW-ITA-SMG-MAB38', from: '1938-06-01' }], ['wpn', 'REC-MG-ITA-BREDA30'],
  ['wpn', 'REC-MG-ITA-FIAT1435', { recipeId: 'REC-MG-ITA-BREDA37', from: '1937-06-01' }],
  ['art', 'REC-ART-ITA-BRIXIA45-1940'], ['art', 'REC-ART-ITA-GUN65-17', { recipeId: 'REC-ART-ITA-AT47-1940', from: '1938-10-01' }], ['art', 'REC-ART-ITA-HOW100-1940'],
  ['art', 'REC-ART-ITA-GUN75-27-ARM-1940', { recipeId: 'REC-ART-ITA-HOW75-18', from: '1937-01-01' }], ['art', 'REC-ART-ITA-AA20-BREDA'],
  ['veh', 'REC-VEH-ITA-MOTO-GT17', { recipeId: 'REC-VEH-ITA-MOTO-ALCE', from: '1939-06-01' }],
  ['tank', 'REC-TNK-ITA-L3-35', { recipeId: 'REC-TD-ITA-SEM-75-18', from: '1941-03-01', then: { recipeId: 'REC-TD-ITA-SEM-75-34', from: '1943-03-01' } }]];
// Francia (25/11/2026, passo 3, scelta dell'utente: una linea per arma): armi della fanteria 1936 (data/units/modules/modules_fra.json) e riconversioni:
// pistola → Mle 1935 (6/1937); seconda linea di pistole → MAS 38 (1/1939); seconda linea del 155 C → 105 L (1/1937); 25 mm → 47 mm anticarro (1/1938);
// seconda linea del 25 mm → contraerea Hotchkiss 25 mm (1/1939); René-Gillet → AX2 (1/1938). Fucile → MAS 36 nel piano di base (1/1937). Stime di Claude.
EXTRA.FRA = [['wpn', 'REC-INW-FRA-PISTOL-1939', { recipeId: 'REC-INW-FRA-PISTOL-MAS35', from: '1937-06-01' }], ['wpn', 'REC-INW-FRA-PISTOL-1939', { recipeId: 'REC-INW-FRA-SMG-MAS38', from: '1939-01-01' }],
  ['wpn', 'REC-MG-FRA-FM2429'], ['wpn', 'REC-MG-FRA-HOTCHKISS1914'], ['wpn', 'REC-GL-FRA-VB1916'],
  ['art', 'REC-ART-FRA-HOW155C'], ['art', 'REC-ART-FRA-HOW155C', { recipeId: 'REC-ART-FRA-GUN105L', from: '1937-01-01' }], ['art', 'REC-ART-FRA-MORTAR60'], ['art', 'REC-ART-FRA-MORTAR81'],
  ['art', 'REC-ART-FRA-AT25', { recipeId: 'REC-ART-FRA-AT47-ARM-1940', from: '1938-01-01' }], ['art', 'REC-ART-FRA-AT25', { recipeId: 'REC-ART-FRA-AA25', from: '1939-01-01' }],
  ['veh', 'REC-VEH-FRA-RENAULT-3T'], ['veh', 'REC-VEH-FRA-MOTO-RG', { recipeId: 'REC-VEH-FRA-MOTO-AX2', from: '1938-01-01' }],
  ['tank', 'REC-TNK-FRA-SOMUA-S35'], ['tank', 'REC-TNK-FRA-B1', { recipeId: 'REC-TNK-FRA-B1BIS-1940', from: '1937-06-01' }]];
// carri francesi (passo 4, 25/11/2026, scelta dell'utente: catena completa): leggeri R 35 → H 39 (1/1939); seconda linea SOMUA S35; terza linea B1 → B1 bis (6/1937).
// Giappone (25/11/2026, passo 3, scelta dell'utente: una linea per arma): armi della quadrata 1936 (data/units/modules/modules_jpn.json) e riconversioni:
// Tipo 11 → Tipo 96 (6/1936) → Tipo 99 (1/1940); seconda linea di pistole → mitra Tipo 100 (1/1942); seconda linea del Tipo 92 da 70 → mortaio da 81 (6/1937);
// seconda linea del 37 mm → contraerea Tipo 98 da 20 mm (6/1938); Rikuo → Tipo 97 (6/1937). Piani di base: fucile → Arisaka Tipo 99 (1/1940), Tipo 38 → Tipo 90 (1/1937).
EXTRA.JPN = [['wpn', 'REC-INW-JPN-PISTOL-T14'], ['wpn', 'REC-INW-JPN-PISTOL-T14', { recipeId: 'REC-INW-JPN-SMG-T100', from: '1942-01-01' }],
  ['wpn', 'REC-MG-JPN-T11', { recipeId: 'REC-MG-JPN-T96', from: '1936-06-01', then: { recipeId: 'REC-MG-JPN-T99', from: '1940-01-01' } }], ['wpn', 'REC-MG-JPN-T92'], ['wpn', 'REC-GL-JPN-T89'],
  ['art', 'REC-ART-JPN-GUN70-T92'], ['art', 'REC-ART-JPN-GUN70-T92', { recipeId: 'REC-ART-JPN-MOR81-T97', from: '1937-06-01' }], ['art', 'REC-ART-JPN-GUN75-REG-1939'],
  ['art', 'REC-ART-JPN-AT37-1939'], ['art', 'REC-ART-JPN-AT37-1939', { recipeId: 'REC-ART-JPN-AA20-T98', from: '1938-06-01' }],
  ['veh', 'REC-VEH-JPN-MOTO-RIKUO', { recipeId: 'REC-VEH-JPN-MOTO-T97', from: '1937-06-01' }],
  ['tank', 'REC-TNK-JPN-T89', { recipeId: 'REC-TNK-JPN-TYPE97-1942', from: '1938-01-01', then: { recipeId: 'REC-TNK-JPN-SHINHOTO', from: '1942-01-01', then: { recipeId: 'REC-TNK-JPN-CHIHE', from: '1943-01-01' } } }]];
// carri giapponesi (passo 4, 25/11/2026, scelta dell'utente: catena): linea di base Tipo 95 Ha-Go; seconda linea Tipo 89 → Chi-Ha (1/1938) → Shinhoto (1/1942) → Chi-He (1/1943).
// carri italiani (passo 4, 24/11/2026, scelta dell'utente: catena completa): linea di base L 3/35 → M 11/39 (1/1939) → M 13/40 (6/1940) → M 14/41 (8/1941)
// → M 15/42 (1/1943); seconda linea L 3/35 → semovente 75/18 (3/1941) → 75/34 (3/1943). Stime di Claude.
// carri da fanteria (passo 4, 24/11/2026; piano in catena scelto dall'utente alle 12:55): Mk VI → Matilda I (6/1937) → Matilda II (6/1939) → Valentine (6/1940) → Churchill (6/1941)
const BASE_PLAN = { DEU: { 'FCT-TANKS': { recipeId: 'REC-TNK-DEU-PZ-II', from: '1937-01-01' } }, JPN: { 'FCT-WEAPONS': { recipeId: 'REC-INW-JPN-ARISAKA-T99', from: '1940-01-01' }, 'FCT-ARTILLERY': { recipeId: 'REC-ART-JPN-GUN75-T90', from: '1937-01-01' } }, FRA: { 'FCT-WEAPONS': { recipeId: 'REC-INW-FRA-MAS36', from: '1937-01-01' }, 'FCT-TANKS': { recipeId: 'REC-TNK-FRA-H39-1940', from: '1939-01-01' } }, ITA: { 'FCT-WEAPONS': { recipeId: 'REC-INW-ITA-CARCANO-9138', from: '1938-01-01' }, 'FCT-TANKS': { recipeId: 'REC-TNK-ITA-M11-39', from: '1939-01-01', then: { recipeId: 'REC-TNK-ITA-M13-40', from: '1940-06-01', then: { recipeId: 'REC-TNK-ITA-M14-41', from: '1941-08-01', then: { recipeId: 'REC-TNK-ITA-M15-42', from: '1943-01-01' } } } } }, GBR: { 'FCT-WEAPONS': { recipeId: 'REC-INW-GBR-NO4', from: '1941-07-01' }, 'FCT-ARTILLERY': { recipeId: 'REC-ART-GBR-25PDR-ARM-1939', from: '1940-01-01' }, 'FCT-TANKS': { recipeId: 'REC-TNK-GBR-A13', from: '1938-06-01' } }, USA: { 'FCT-WEAPONS': { recipeId: 'REC-INW-USA-GARAND', from: '1937-01-01' }, 'FCT-ARTILLERY': { recipeId: 'REC-ART-USA-HOW105-1940', from: '1940-01-01' }, 'FCT-TANKS': { recipeId: 'REC-TNK-USA-M2A4', from: '1939-05-01' } } }; // carri: M2A2 → M2A4 (5/1939); Germania Pz I → Pz II (1/1937, 23/11/2026, stima)
const MUN = { USA: 6, GBR: 3, DEU: 6, USSR: 6, ITA: 3, FRA: 4, JPN: 5, BEL: 0, CAN: 0, CZE: 0, POL: 0, SWE: 0 };

const candidates = new Set(Object.keys(A));
for (const r of R) for (const id of ext[r].byProvince.keys()) candidates.add(id.split('_')[1]);
const nations = {};
for (const n of [...candidates].sort()) {
  if (!entities.has(n)) throw new Error(`entità politica sconosciuta: ${n}`);
  const e = Object.fromEntries(R.map((r) => [r, totalByPrefix(ext[r], n)]));
  const m = A[n] ?? (e.iron_ore >= 200 ? 1 : 0);
  const tier = A[n] ? 'A' : 'B';
  const k = { steel: m };
  k.alu = Math.floor(e.bauxite / 280) || (tier === 'A' && m >= 8 ? Math.max(1, Math.round(m / 8)) : 0);
  if (tier === 'A' && !k.alu && m >= 4) k.alu = 1;
  k.ref = Math.floor((e.oil * 0.8) / 110) || (tier === 'A' && n !== 'DEU' && m >= 4 ? 1 : 0);
  k.syn = n === 'DEU' ? 2 : 0;
  k.rub = Math.floor(e.rubber / 108) || (tier === 'A' && m >= 4 ? 1 : 0);
  if (tier === 'A') {
    k.mach = Math.max(1, Math.round(m / 8)); k.comp = Math.max(1, Math.round(m / 10)); k.eng = Math.max(1, Math.round(m / 10)); k.mun = MUN[n] ?? 0;
    k.chem = Math.max(1, Math.ceil(k.mun / 2));
  }
  Object.assign(k, ARMS[n] ?? {});
  if (VEHICLES[n]) k.veh = VEHICLES[n]; // fabbriche di veicoli (decisione dell'utente del 18/11/2026)
  if (HORSES.includes(n)) { k.feed = 1; k.stud = 1; k.pharma = 1; }
  const extra = EXTRA[n] ?? [];
  const demand = Object.entries(k).reduce((s, [f, c]) => s + (c || 0) * MW[f], 0) + extra.reduce((s, [f]) => s + MW[f], 0);
  k.therm = demand > (hy[n] ?? 0) ? Math.ceil((demand - (hy[n] ?? 0)) / 120) : 0;
  if (!Object.values(k).some(Boolean)) continue;
  const order = ['steel', 'alu', 'ref', 'syn', 'rub', 'chem', 'mach', 'comp', 'eng', 'mun', 'wpn', 'tank', 'veh', 'art', 'feed', 'stud', 'pharma', 'therm'];
  const facilities = order.filter((f) => k[f] > 0).map((f) => ({ factory: FACT[f][0], recipeId: EQUIP[n]?.[f] ?? FACT[f][1], count: k[f] }));
  for (const [f, recipeId, plan] of extra) facilities.splice(facilities.findLastIndex((x) => x.factory === FACT[f][0]) + 1, 0, { factory: FACT[f][0], recipeId, count: 1, ...(plan ? { plannedRecipe: plan } : {}) });
  for (const [factory, plan] of Object.entries(BASE_PLAN[n] ?? {})) { const f = facilities.find((x) => x.factory === factory && !x.plannedRecipe); if (f) f.plannedRecipe = plan; }
  nations[n] = { tier, owner: entities.get(n).owner, facilities };
}
const doc = {
  schema: 'initial-industry-v1',
  quality: 'DESIGN_DEFAULT',
  asOf: '1936-01-01',
  note: 'Industria iniziale: stime di progetto approvate in chat il 27/10/2026, NON dati storici per impianto. Fascia A = grandi potenze, B = un impianto per risorsa locale (può essere una colonia o un\'entità non giocabile: `owner` indica chi la possiede), C = le nazioni in `tierC`, nessuna industria iniziale (la costruisce il giocatore; decisione del 27/10/2026). Le centrali a carbone coprono solo il fabbisogno non coperto dall\'idroelettrico già nei CSV (hydro_plants.json): per la Germania, senza idro nei CSV, il valore è MISSING_DATA.',
  counts: 'numero di impianti identici, ciascuno con la capacità del Pack (nessuna modifica ai file del Pack)',
  nations,
  tierC: nationIds.filter((id) => !nations[id]),
  minorArtillery: {
    appliesTo: 'tierC', factory: 'FCT-ARTILLERY', recipeId: 'REC-ARTILLERY-001', count: 1, throttle: 0.05, startStock: { steel: 760, components: 65 },
    quality: 'DESIGN_DEFAULT',
    rationale: "Regola dell'utente del 29/10/2026: i paesi minori (fascia C) hanno un solo template di artiglieria e un minimo di produzione; scorta iniziale scelta dall'utente (opzione «scorta», poi aumentata). Numeri PROPOSTI da Claude, non approvati: una fabbrica limitata al 5% della capacità (circa 1,2 pezzi al giorno con il pezzo di riferimento da 3 t) e una scorta iniziale di 760 t di acciaio e 65 t di componenti, IN AGGIUNTA alla riserva minima di 500 t delle costruzioni: bastano per circa 180 giorni (consumo 4,2 t e 0,35 t al giorno), poi la nazione deve fare commercio (richiesta dell'utente 29/10/2026; il commercio non esiste ancora nel codice). Il pezzo di riferimento è un segnaposto (REC-ARTILLERY-001, MISSING_DATA).",
  },
  baseGrid: { megawatts: 40, quality: 'MISSING_DATA', appliesTo: 'tierC', rationale: 'Rete di base per le nazioni senza industria (approvata in chat il 27/10/2026): basta per le prime miniere e impianti piccoli e per mantenere qualche divisione. Valore di progetto, non storico: da sostituire con dati reali. Il mantenimento militare è previsto ma non attivo (Fase 5).' },
};
fs.writeFileSync(new URL('../data/industry/initial_industry.json', import.meta.url), JSON.stringify(doc, null, 2) + '\n');
console.log(`industria iniziale: ${Object.values(nations).filter((x) => x.tier === 'A').length} entità in fascia A, ${Object.values(nations).filter((x) => x.tier === 'B').length} in B, ${doc.tierC.length} nazioni in C`);
