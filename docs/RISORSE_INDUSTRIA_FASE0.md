# Risorse + Industria — Fase 0 (solo dati)

Stato: **implementato e testato** (`tests/recipes.test.js`, 8 test; controllato da `npm run validate:data`). Nessuna regola di gioco: il motore (`SYSTEMS`) resta vuoto fino alla Fase 1.
Etichette dei dati: `DESIGN_DEFAULT` = valore di design proposto, non storico; `MISSING_DATA` = dato mancante, non inventato.

## File
- `data/industry/recipes.json` (schema `recipes-v1`): 7 ricette + 1 flusso. Capacità ed energia NON sono ripetute: restano in `data/industry/factories.csv` (`base_capacity_per_day`, `energy_consumption`, copia del Pack v11.1 con sha256).
- `data/resources/extraction_scale.json` (schema `extraction-scale-v1`): tonnellate al giorno per punto di produzione, solo per le 6 materie prime consumate da una ricetta; le altre sono `null` (UI: «N/D», mai zero).
- `data/resources.json`: 5 voci nuove (`fuel`, `processed_rubber`, `chemicals`, `electricity`, `hydro`). `hydro` è `fonte-energia`: un flusso, mai uno stock.
- `src/data/recipes.js`: validazione, `fullCapacityFlows`, `pointsToUnits`.

## Ricette (rapporto per 1 t di prodotto; capacità e fabbisogno sono GIORNALIERI per UNA fabbrica a pieno regime: con N fabbriche si moltiplica per N, con ingressi parziali si produce e consuma in proporzione)
| Ricetta | Fabbrica | Ingressi | Capacità (t/giorno; MW per l'elettricità) | Fabbisogno a pieno regime | Energia assorbita (MW) |
|---|---|---|---|---|---|
| Acciaio | FCT-STEEL | 1,6 ferro + 0,8 carbone | 100 | 160 ferro + 80 carbone | 12 |
| Alluminio | FCT-ALUMINIUM | 4 bauxite | 70 | 280 bauxite | 18 |
| Carburante (petrolio) | FCT-REFINERY | 1,1 petrolio | 100 | 110 petrolio | 10 |
| Carburante (carbone) | FCT-SYNFUEL | 4 carbone | 70 | 280 carbone | 20 |
| Gomma lavorata | FCT-RUBBER | 1,2 gomma | 90 | 108 gomma | 9 |
| Prodotti chimici | FCT-CHEMICAL | 0,5 zolfo | 80 | 40 zolfo | 14 |
| Macchinari | FCT-MACHINERY | 1,2 acciaio | 70 | 84 acciaio | 14 |
| Componenti | FCT-COMPONENTS | 0,6 acciaio + 0,2 alluminio + 0,1 gomma lavorata | 80 | 48 acciaio + 16 alluminio + 8 gomma | 12 |
| Motori | FCT-ENGINE | 0,8 acciaio + 0,3 alluminio | 60 | 48 acciaio + 18 alluminio | 18 |
| Munizioni | FCT-MUNITIONS | 0,6 acciaio + 0,4 prodotti chimici | 100 | 60 acciaio + 40 chimici | 12 |
| Elettricità (potenza) | FCT-POWER | 0,5 t/giorno di carbone per ogni MW in funzione | 120 MW netti (definiti qui, nessun autoconsumo) | 60 t/giorno di carbone | 0 |
| Elettricità idro | — | nessuno | **MISSING_DATA** | — | — |

## Scala di estrazione (t/giorno per punto)
carbone 100 · ferro 80 · petrolio 50 · bauxite 60 · gomma 10 · zolfo 2. Regola: il primo produttore mondiale alimenta circa 5-10 impianti a pieno regime.
Esiti verificati in test sui punti base: USA ≥ 5 acciaierie con sole risorse nazionali; Germania < 3 (poco ferro: importa) ma ≥ 3 impianti di carburante sintetico dal carbone; Germania quasi senza petrolio.

## Decisioni di integrazione
- Il repository resta la fonte: ID `FCT-*` al posto di `steel_mill`/`oil_refinery`/`power_plant_coal` del pacchetto; capacità dalle fabbriche del Pack (non 100 per tutte).
- Miniere costruibili per provincia e risorsa (deciso in chat 26/10/2026, sostituisce la scelta iniziale di Fase 0 «nessun impianto nuovo»): 3 livelli che portano i punti da `base` verso `max` (`resource_points.json`), mai oltre. Nessun esaurimento dei giacimenti. Costi in `data/economy/economy.json`. Il catalogo edifici e la costruzione in partita NON sono ancora implementati (solo dati, funzioni `mineCost`, `minePoints` e test).
- Un solo carburante con due vie (deciso in chat). Le catene tra prodotti (acciaio → componenti → aerei) NON sono ancora definite: le ricette usano solo materie prime, il validatore lo impone.

## Idroelettrica (dati dell'utente, 26/10/2026)
- Flusso in MW, senza ingressi e **senza autoconsumo** (deciso). Mai uno stock.
- `data/resources/centrali_idroelettriche_pre_1936.csv` (15 centrali, base già attiva) e `..._1936_1945.csv` (23, entrano in servizio alla data): copie fedeli con sha256 in `SOURCE_IDRO.json`.
- `data/resources/hydro_plants.json` (generato da `npm run build:hydro`): 38 centrali con provincia ricavata dalle coordinate, `era` (`pre1936` o `event`), `validFrom`. Moduli: `src/data/hydro.js`, `scripts/build-hydro.js`. Test: `tests/hydro.test.js`.
- `hydro_province_overrides.csv`: 2 centrali di Niagara (Schoellkopf → New York, Sir Adam Beck → Ontario). Le coordinate cadono sul fiume di confine e il poligono semplificato le mette dal lato sbagliato; vale il luogo dichiarato nel CSV, con motivo.
- Segnalazioni sui dati ricevuti (non corretti): Fusen-ko dichiara «Sinuiju» ma le coordinate sono in Ryanggang (vale la coordinata); Hoover Dam è a cavallo di Nevada e Arizona (il punto cade in Arizona); Vemork e Cubatão compaiono in entrambi i file come fasi diverse.
- La base **non è completa**: sono solo le centrali fornite. Una stima per i grandi bacini mancanti resta da approvare.

## Pool elettrico nazionale (regola dell'utente, 26/10/2026)
Fonte: indicazione in chat; **non è scritta** in PROJECT_MASTER né in ARCHITETTURA (verificato).
- L'elettricità è un **pool nazionale**, non uno stock e non per provincia: la somma della potenza delle centrali della nazione (idro + carbone).
- Ogni **nuova costruzione o potenziamento** di una centrale aumenta il pool.
- **Taratura storica:** l'Italia copriva oltre il 95% del fabbisogno elettrico nazionale (soprattutto con l'idro). Obiettivo di verifica per la Fase 1: con l'industria iniziale dell'Italia, l'idro deve coprire almeno il 95% della domanda.
- Domanda = somma dell'energia delle fabbriche attive; con pool < domanda, la produzione scende in proporzione (da confermare).
- **Unità (G8, deciso):** tutto in MW. Pool = somma dei MW delle centrali; domanda = somma dei MW delle fabbriche (`energy_consumption` del Pack letto come MW, es. acciaieria 12 MW). Nessuna conversione.

## Scorte di carburante e depositi (G9, deciso 26/10/2026)
- La scorta massima è la somma della capacità dei depositi costruiti (`data/military/fuel_storage.json`, strutture INF-010/011/012 del Pack): L1 1.500 t, L2 5.000 t, L3 15.000 t. Valori `DESIGN_DEFAULT` approvati.
- Nessuno stoccaggio gratuito (`baseCapacity = 0`): l'eccesso oltre la capacità si perde (`stockAfterDay`). Un deposito occupa uno slot della provincia (`depot` in `buildings.json`), quindi costruirlo in pace costa un posto che servirebbe a una fabbrica.
- **G10 (deciso):** i depositi valgono per ora SOLO per il carburante. Munizioni e altre merci si decideranno insieme alle unità e ai loro consumi.
- Calibrazione: un L3 dà circa 85 giorni di un esercito da 175 t/giorno (Germania 1939, stima).

## Decisioni del 26/10/2026
- G1 idro: dati forniti dall'utente + stime di Claude (marcate, da mostrare prima).
- G2: nessun autoconsumo per la centrale a carbone: 120 MWh netti; il consumo 25 del Pack è ignorato (`noSelfConsumption`).
- G3: ricette di macchinari, componenti, motori e munizioni approvate dall'utente (26/10/2026): inserite. Gli ingressi possono ora essere anche prodotti (acciaio, alluminio, gomma lavorata, chimici), senza cicli.
- G4: consumo di carburante per categoria, approvato dimezzato (una sola leva, Pack intatto): `data/military/fuel_consumption.json`, `src/data/fuel.js`, `tests/fuel.test.js`. Segnaposto per categoria, da riscalare con il catalogo unità. Una raffineria (100 t/giorno) regge 8 divisioni corazzate, il sintetico (70) 5.
- G5: tonnellate per ogni massa; l'elettricità è una potenza in MW (G8).
- G6: ampliamenti della stessa centrale additivi (Vemork 216 MW dal 1937, Cubatão 524 MW dal 1936).

## Lacune ancora aperte
| ID | Problema | Perché blocca | Proposta |
|---|---|---|---|
| G3b | Ricette di armi leggere, artiglieria, camion, carri, aerei e navi: non definite | dipendono dal catalogo delle unità | con le unità (Fase 5) |
| G7 | Base idro mancante: i totali per nazione vanno tarati sulla domanda (Italia ≥ 95%), non su MW assoluti | serve l'industria iniziale per nazione (non esiste ancora) | tarare in Fase 1, quando l'industria iniziale è definita |

## Economia di base (26/10/2026, DESIGN_DEFAULT)
- `data/economy/economy.json` (schema `economy-v1`): valuta unica ECV (stessa unità di `construction_ecv` del Pack, non denaro reale), prezzi per tonnellata di ogni merce con ricetta (elettricità senza prezzo: è un servizio), quota fissa per provincia/città/capitale, tre difficoltà (Facile/Media/Reale) come soli moltiplicatori di costo, tempo, scorte iniziali ed entrata, costi dei 3 livelli di miniera.
- Taratura: un'acciaieria a pieno regime ha un margine di 1,64 ECV/giorno e si ripaga in circa 73 giorni (verificato in test).
- Mancano: la popolazione (nessun dato nel repository), lo stato di tesoreria nel salvataggio (schema 2), il collegamento al ciclo di partita, i consumatori. «Reale» è solo la difficoltà più dura con questi numeri, non una difficoltà storica verificata.
- Codice: `src/data/economy.js` (validazione, `difficulty`, `mineCost`, `minePoints`), `src/rules/treasury.js` (`dailyIncome`, `spend`), test in `tests/economy.test.js` (10).
- Entrata a **valore aggiunto** (deciso in chat 26/10/2026): prodotti meno ingressi consumati, per non contare due volte una catena. Il validatore rifiuta prezzi per cui una ricetta ha valore aggiunto non positivo. La centrale a carbone è un costo (l'elettricità non ha prezzo); l'entrata non scende mai sotto zero.
- Vincoli di costruzione (`src/rules/construction.js`, `canStartBuild`): denaro, acciaio, manodopera, energia disponibile nel pool, tecnologia richiesta; elenca tutti i vincoli mancanti. Il Pack dà per le fabbriche solo ECV, giorni, manodopera ed energia: il costo in acciaio delle fabbriche NON è definito (solo per le miniere).

## Ricalibrazione della scala (26/10/2026)
Carbone 100→125 e ferro 80→100 t/giorno per punto (+25%, DESIGN_DEFAULT), per avere all'inizio una copertura mondiale della domanda a pieno regime di circa l'80% (deciso in chat: poi cresce con le miniere, e la domanda cresce con le fabbriche costruite). Conto con i punti `base`: ferro mondiale 10.000 t/giorno; 61 acciaierie (fascia A) ne chiedono 9.760 (copertura 102%), 76 acciaierie (A + circa 15 della fascia B) 12.160 (copertura 82%). La fascia B va quindi dimensionata per restare vicino a 76 acciaierie in totale. Valore da ricontrollare quando le fasce B e C saranno inserite.

## Produzione storica 1936 e rame (26/10/2026)
- Due CSV dell'utente (stime della produzione 1936 per risorsa e nazione) sono copiati byte per byte in `data/resources/` con sha256 in `SOURCE_PRODUZIONE.json`. `scripts/build-production.js` (`npm run build:production`) li fonde in `production_1936.json` (54 righe): il file «completo» prevale dove si sovrappone, le righe che ha solo il primo si aggiungono (Svezia ferro 11 Mt, Giappone carbone 40, Romania petrolio 8,7, Suriname bauxite, Cile zolfo, Ceylon, Indocina e Brasile gomma, URSS rame). Qualità `USER_ESTIMATE`: il ferro di USA, Francia, URSS, Regno Unito, Germania e Belgio coincide con le fonti US Bureau of Mines e NBER; il resto non è verificato.
- Note nel file (`conflicts`): Iran petrolio 8,3 (primo) contro 8,0 (completo, prevale); Rhodesia rame 0,14 contro 0,15; Australia carbone esclusa (1,45 Mt nel primo file, 14,5 nella tabella di sintesi, assente nel completo: da decidere); la riga aggregata «Belgio / Congo Belga» saltata.
- Territori: ogni nazione del CSV ha un prefisso di province; le Indie Orientali Olandesi sono solo le province `P_NLD_EI_*`, il ferro di Terranova è `NFL`, l'Indocina è `INDO`.
- Il **rame** entra nel catalogo risorse (32 voci) come materia prima, ma senza punti nelle province, senza prezzo e senza ricette: scala `null` (N/D). Non è in `RESOURCE_ORDER`, quindi non compare ancora sulla mappa.
- Conversione proposta: 1 t di gioco ≈ 43,8 t reali (`production_1936.json`, DESIGN_DEFAULT; 1 acciaieria = 1,6 Mt/anno). NON ancora applicata ai punti delle province: i valori finali per nazione vanno approvati prima.

## Estrazione per provincia dalla produzione reale (26/10/2026)
- Metodo deciso in chat: quote fra nazioni dai dati reali (`production_1936.json`), un fattore per risorsa (`extraction_factors.json`, t reali per 1 t di gioco). Solo il **ferro è tarato** (43,8: 1 acciaieria ≈ 1,6 Mt/anno di acciaio; copre circa l'89% di 80 acciaierie). Carbone, petrolio, bauxite, gomma, zolfo sono **PROVVISORI**: scelti perché i territori con produzione storica mantengano il totale di prima, cambia solo la ripartizione; da tarare con le fasce B e C e i consumatori.
- `src/data/extraction.js` (`resourceExtraction`): la produzione di una nazione si divide tra le sue province con punti in proporzione ai punti base; il resto resta punti × scala. Se una nazione ha produzione ma nessuna provincia con punti per quella risorsa, **non si inventa dove**: va in `unallocated` (MISSING_DATA).
- Non assegnato oggi: ferro (India, Algeria, Manciukuò, Cina), carbone (Cina, Sudafrica, Canada), gomma (Ceylon, Indocina, Brasile, Liberia), zolfo (Cile) e tutto il rame (7 territori).
- Stato: implementato e testato come funzioni pure (7 test), NON collegato al ciclo di partita; i punti in `resource_points.json` non sono cambiati.

## Posizioni aggiuntive dei giacimenti (27/10/2026, APPROXIMATE)
`data/resources/resource_locations_extra.json`: 19 righe approvate in chat per i territori con produzione storica 1936 ma senza province con punti per quella risorsa (ferro: India, Algeria, Manciukuò, Cina; carbone: Cina, Sudafrica, Canada; gomma: Ceylon, Indocina, Brasile, Liberia; zolfo: Cile; rame: sette territori). Sono **solo aggiunte**: `resource_points.json` non cambia e nessuna provincia già esistente cambia valore (verificato in test). Quota divisa in parti uguali tra le province di ciascun giacimento; Balkhash non ha una provincia, quindi il rame sovietico va tutto agli Urali (Sverdlovsk). Con queste posizioni `unallocated` è vuoto per tutte le risorse. Il rame ha un fattore provvisorio senza effetto: i suoi t/giorno non sono definiti finché non esistono consumatori.

## Zolfo, gomma e gomma sintetica (27/10/2026)

- **Fattori di estrazione alzati su richiesta dell'utente** (entrambi PROVISIONAL, in `data/resources/extraction_factors.json`): zolfo 36,4 → 13,1 (mondo: da 201 a circa 541 t/giorno), gomma 1,8 → 1,37 (da 1.235 a circa 1.622 t/giorno). Cambia solo la scala: le quote fra nazioni restano quelle reali di `production_1936.json`.
- **Gomma sintetica** `REC-RUBBER-SYN-001` (DESIGN_DEFAULT): 3,5 t di carbone per 1 t di gomma lavorata, nell'impianto chimico `FCT-CHEMICAL` (capacità 100 t/giorno, Pack non modificato). Il rapporto è una stima di progetto, non un dato storico. Sblocco tecnologico: MISSING_DATA. Non è nell'industria iniziale.
- Stato: implementato e testato come dati (test su ricette e totali di estrazione). Non ancora collegato al ciclo di gioco (`SYSTEMS`).

## Industria iniziale 1/1/1936 (27/10/2026)

- File `data/industry/initial_industry.json` (schema `initial-industry-v1`, DESIGN_DEFAULT), generato da `npm run build:industry`; validatore `src/data/initialIndustry.js`, test `tests/initial_industry.test.js`.
- **Fascia A** (12 entità: USA, Germania, URSS, Gran Bretagna, Francia, Giappone, Belgio, Italia, Cecoslovacchia, Polonia, Canada, Svezia): acciaierie, raffinerie, alluminio, gomma, chimica, macchinari, componenti, motori, munizioni e centrali a carbone. **Fascia B** (13): un impianto per risorsa locale (alcune sono colonie o entità non giocabili: Ceylon, Malesia, Suriname, Iran; `owner` indica chi le possiede). **Fascia C** (51 nazioni, `tierC`): nessuna industria, la costruisce il giocatore.
- Tutti i numeri sono stime di progetto approvate in chat, non dati storici per impianto. Le centrali a carbone coprono solo il fabbisogno non coperto dall'idroelettrico dei CSV: per la Germania (nessun idro nei CSV) è MISSING_DATA.
- Decisioni del 27/10/2026 ancora da realizzare: mantenimento di alcune divisioni (Fase 5), vendita del surplus di sole risorse naturali (Fase 2).
- Stato: dati implementati e testati; non ancora istanziati nelle partite né collegati a `SYSTEMS`.
- **Rete di base** (approvata 27/10/2026): 40 MW per ognuna delle 51 nazioni di fascia C (`baseGrid`, MISSING_DATA, valore di progetto). Il mantenimento delle divisioni è previsto ma non attivo.

## Stock iniziali (27/10/2026)

- `data/industry/initial_stocks.json` (schema `initial-stocks-v1`, DESIGN_DEFAULT), generato da `npm run build:stocks`; logica in `src/data/initialStocks.js`; test `tests/initial_stocks.test.js` (ricalcolo dalla regola).
- **Regola** (richiesta dell'utente: "una nazione deve almeno resistere 5 mesi senza commercio"): 150 giorni con l'industria iniziale a pieno regime (scelta tra 80% e 100%: 100%). Stock = giorni × (consumo − produzione nazionale), solo dove manca. 24 entità, 62 voci. Le nazioni che si bastano (es. Paesi Bassi) e la fascia C non hanno stock.
- Limiti: copre l'industria, non l'esercito (Fase 5); i deficit di carbone delle nazioni piccole dipendono da dati di produzione 1936 mancanti (MISSING_DATA); gli stock non sono sottratti a nessuno. Non ancora istanziati nelle partite.

## Stato di gioco schema 2 (28/10/2026)

- `STATE_SCHEMA` = 2. Nuovi campi: `difficulty` (facile / media / reale) e `nations`: per ogni proprietario `{ balance, stocks, facilities, mines, baseGridMw, forces: { land, naval, air } }` (`src/game/economyState.js`). Oltre alle 72 nazioni c'è l'Iran (non giocabile, con una raffineria).
- Gli impianti hanno la forma letta da `produceDay` (`id, type, recipeId, damage, priority, active`) più `territory`: gli impianti e le scorte delle colonie (Ceylon, Malesia, Suriname) vanno al proprietario, il luogo resta tracciato.
- **Forze armate: campi vuoti** (MISSING_DATA): non esistono cataloghi né ordini di battaglia 1936 di divisioni, navi e aerei. **Cassa iniziale**: vedi sezione sotto (30 giorni di entrata + 200 ECV). **Miniere costruite**: elenco vuoto (le costruisce il giocatore).
- Migrazione 1→2 (`migrateV1toV2`): `nations` resta `null` e `initEconomy` lo inizializza dai dati iniziali al caricamento; è esatto perché in un salvataggio dello schema 1 l'economia non è mai evoluta (nessun sistema in `SYSTEMS`).
- App: `startGame` passa i dati iniziali a `newGame`; `loadGame` chiama `initEconomy`. I due JSON iniziali sono nel bundle (pochi kB, funzionano offline).
- **Scoperta del test di integrazione:** le scorte iniziali coprono solo il deficit, quindi il giorno 1 la Germania non produce acciaio se l'estrazione non è nel ciclo giornaliero. Serve un passo giornaliero "estrazione → scorta" prima di `produceDay`, ancora da inserire in `SYSTEMS`.
- Stato: implementato e testato (`tests/economy_state.test.js`); `SYSTEMS` ancora vuoto; l'app non è stata provata in browser né compilata (npm non raggiungibile).

## Cassa iniziale e difficoltà sulle scorte (28/10/2026)

- `data/industry/initial_cash.json` (schema `initial-cash-v1`, DESIGN_DEFAULT), generato da `npm run build:cash`; test `tests/initial_cash.test.js`.
- **Regola** (decisa in chat): cassa = 30 giorni di entrata giornaliera + 200 ECV uguali per tutte. Entrata a difficoltà Media: valore aggiunto (miniere nazionali + impianti a pieno regime − ingressi) + quota province + capitale. Le città grandi non sono contate. Esempi: USA circa 7.400 ECV (241 ECV/giorno), Germania circa 2.100, mediana della fascia C 332.
- **Difficoltà** (lacuna corretta): `stockMul` di `economy.json` (facile 1,5 · media 1 · reale 0,7) ora si applica anche a scorte iniziali e cassa; prima non veniva applicato.
- Stato: implementato e testato; la cassa non cresce ancora (il ciclo giornaliero entrate/spese non è in `SYSTEMS`).
