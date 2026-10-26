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
