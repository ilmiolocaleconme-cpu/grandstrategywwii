# Risorse + Industria — Fase 0 (solo dati)

Stato: **implementato e testato** (`tests/recipes.test.js`, 8 test; controllato da `npm run validate:data`). Nessuna regola di gioco: il motore (`SYSTEMS`) resta vuoto fino alla Fase 1.
Etichette dei dati: `DESIGN_DEFAULT` = valore di design proposto, non storico; `MISSING_DATA` = dato mancante, non inventato.

## File
- `data/industry/recipes.json` (schema `recipes-v1`): 7 ricette + 1 flusso. Capacità ed energia NON sono ripetute: restano in `data/industry/factories.csv` (`base_capacity_per_day`, `energy_consumption`, copia del Pack v11.1 con sha256).
- `data/resources/extraction_scale.json` (schema `extraction-scale-v1`): tonnellate al giorno per punto di produzione, solo per le 6 materie prime consumate da una ricetta; le altre sono `null` (UI: «N/D», mai zero).
- `data/resources.json`: 5 voci nuove (`fuel`, `processed_rubber`, `chemicals`, `electricity`, `hydro`). `hydro` è `fonte-energia`: un flusso, mai uno stock.
- `src/data/recipes.js`: validazione, `fullCapacityFlows`, `pointsToUnits`.

## Ricette (per 1 t di prodotto)
| Ricetta | Fabbrica | Ingressi | Capacità/giorno | Fabbisogno a pieno regime | Energia/giorno |
|---|---|---|---|---|---|
| Acciaio | FCT-STEEL | 1,6 ferro + 0,8 carbone | 100 | 160 ferro + 80 carbone | 12 |
| Alluminio | FCT-ALUMINIUM | 4 bauxite | 70 | 280 bauxite | 18 |
| Carburante (petrolio) | FCT-REFINERY | 1,1 petrolio | 100 | 110 petrolio | 10 |
| Carburante (carbone) | FCT-SYNFUEL | 4 carbone | 70 | 280 carbone | 20 |
| Gomma lavorata | FCT-RUBBER | 1,2 gomma | 90 | 108 gomma | 9 |
| Prodotti chimici | FCT-CHEMICAL | 0,5 zolfo | 80 | 40 zolfo | 14 |
| Elettricità | FCT-POWER | 0,5 carbone per MWh | 120 MWh (definita qui) | 60 carbone | n/d |
| Elettricità idro | — | nessuno | **MISSING_DATA** | — | — |

## Scala di estrazione (t/giorno per punto)
carbone 100 · ferro 80 · petrolio 50 · bauxite 60 · gomma 10 · zolfo 2. Regola: il primo produttore mondiale alimenta circa 5-10 impianti a pieno regime.
Esiti verificati in test sui punti base: USA ≥ 5 acciaierie con sole risorse nazionali; Germania < 3 (poco ferro: importa) ma ≥ 3 impianti di carburante sintetico dal carbone; Germania quasi senza petrolio.

## Decisioni di integrazione
- Il repository resta la fonte: ID `FCT-*` al posto di `steel_mill`/`oil_refinery`/`power_plant_coal` del pacchetto; capacità dalle fabbriche del Pack (non 100 per tutte).
- Nessun impianto di estrazione nuovo (`mine_coal`, `oil_field`...): l'estrazione resta il centro produttivo a punti. Nessun esaurimento dei giacimenti (deciso in chat 26/10/2026).
- Un solo carburante con due vie (deciso in chat). Le catene tra prodotti (acciaio → componenti → aerei) NON sono ancora definite: le ricette usano solo materie prime, il validatore lo impone.

## Idroelettrica (dati dell'utente, 26/10/2026)
- Flusso in MW, senza ingressi e **senza autoconsumo** (deciso). Mai uno stock.
- `data/resources/centrali_idroelettriche_pre_1936.csv` (15 centrali, base già attiva) e `..._1936_1945.csv` (23, entrano in servizio alla data): copie fedeli con sha256 in `SOURCE_IDRO.json`.
- `data/resources/hydro_plants.json` (generato da `npm run build:hydro`): 38 centrali con provincia ricavata dalle coordinate, `era` (`pre1936` o `event`), `validFrom`. Moduli: `src/data/hydro.js`, `scripts/build-hydro.js`. Test: `tests/hydro.test.js`.
- `hydro_province_overrides.csv`: 2 centrali di Niagara (Schoellkopf → New York, Sir Adam Beck → Ontario). Le coordinate cadono sul fiume di confine e il poligono semplificato le mette dal lato sbagliato; vale il luogo dichiarato nel CSV, con motivo.
- Segnalazioni sui dati ricevuti (non corretti): Fusen-ko dichiara «Sinuiju» ma le coordinate sono in Ryanggang (vale la coordinata); Hoover Dam è a cavallo di Nevada e Arizona (il punto cade in Arizona); Vemork e Cubatão compaiono in entrambi i file come fasi diverse.
- La base **non è completa**: sono solo le centrali fornite. Una stima per i grandi bacini mancanti resta da approvare.

## Decisioni del 26/10/2026
- G1 idro: dati forniti dall'utente + stime di Claude (marcate, da mostrare prima).
- G2: nessun autoconsumo per la centrale a carbone: 120 MWh netti; il consumo 25 del Pack è ignorato (`noSelfConsumption`).
- G3: ricette di componenti, motori, macchinari e munizioni da definire ORA, in Fase 0 (proposta da approvare).
- G4: consumo di carburante per categoria di unità: proposta semplice da approvare.
- G5: tonnellate per ogni massa, MWh per l'elettricità.

## Lacune ancora aperte
| ID | Problema | Perché blocca | Proposta |
|---|---|---|---|
| G3 | Ricette di componenti, motori, macchinari, munizioni: da proporre | catena fino ad aerei e camion | proposta in arrivo, da approvare |
| G4 | Consumo di carburante delle unità: da proporre | bilancio carburante, carbone, elettricità | proposta in arrivo, da approvare |
| G6 | Fasi multiple della stessa centrale (Vemork, Cubatão): additive o cumulative? | cambia la potenza totale | domanda all'utente |
| G7 | Stima della base idro mancante (grandi bacini non forniti) | senza base l'idro è molto sotto la realtà | proposta DESIGN_DEFAULT da approvare |
