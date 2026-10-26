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

## Lacune (nessuna soluzione possibile senza una decisione o un dato)
| ID | Problema | Perché blocca | Proposta |
|---|---|---|---|
| G1 | Nessun sito idroelettrico né capacità per provincia | senza dati l'idro non produce | dati dall'utente o stime marcate DESIGN_DEFAULT per i grandi bacini |
| G2 | `FCT-POWER` ha capacità 0 e consumo 25 nel Pack | la generazione è definita nelle ricette (120) e il consumo 25 è ambiguo (autoconsumo?) | confermare: autoconsumo scalato dalla generazione netta |
| G3 | Ricette di componenti, motori, macchinari, munizioni assenti | collegare i consumatori militari (Fase 5) richiede ingressi decisi | definirle insieme alle unità |
| G4 | Consumo di carburante delle unità non definito | senza consumatori il bilanciamento di carburante, carbone ed elettricità non è chiudibile | definire con le unità |
| G5 | Unità: tutto in tonnellate; il pacchetto usava barili per il petrolio e kg per l'uranio | la conversione sarebbe inventata | confermare t per tutto |
