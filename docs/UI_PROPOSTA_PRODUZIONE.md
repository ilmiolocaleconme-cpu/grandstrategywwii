# Proposta UI: produzione equipaggiamenti, lotti, scorte, rinforzi

Solo analisi, nessun codice toccato. Data: 03/11/2026.

## 0. Premessa importante

Il codice descritto NON è in `main` né in questo worktree: sta nel branch `claude/fase4-produzione-equipaggiamenti` (5 commit sopra main). File letti da lì con `git show`: `src/game/facilityRecipe.js`, `src/data/equipmentProduction.js`, `src/rules/reinforcementTransit.js`, `src/rules/production.js` (`batchStep`), `data/units/equipment/equipment_production.json`. Il branch tocca già `src/App.jsx` (solo `GAME_CATALOG` con `EQUIPMENT_RECIPES`). Prima di implementare la UI serve il merge del branch.

Fatti verificati sul codice:
- `setFacilityRecipe(state, nation, facilityId, recipeId, {catalog, table, researched})` esiste ma NON è chiamata da nessuna parte (né App né UI). Lancia `Error` con motivo in italiano.
- `planReinforcements`, `dispatch`, `applyArrivals`, `setReinforcement`, `mobilize` esistono ma NON sono chiamate dal motore (`grep` in `src/`: solo `horsePool.js` li cita in un commento). `makeTransitDays` non è usata. I rinforzi quindi oggi non accadono in partita.
- Gli impianti hanno `{ id, type, recipeId, level, damage, provinceId? }` più `wip`, `runDays`, `batches[{qty, readyOn}]` (opzionali). Il rapporto di `produceDay` (efficienza, collo di bottiglia, stato) NON è salvato nello stato.

## 1. Pannelli esistenti

Navigazione: barra unica in alto (`nav.tabs` in `App.jsx`): livelli/zoom (portale mappa), `GameBar`, pulsante `Teatro`, pulsante `Partita`, schermo intero. Due schermate: `tab='map'` e `tab='game'` ("Partita").

| File | Cosa mostra | Stato ricevuto |
|---|---|---|
| `App.jsx` (tab Partita, ~r.652) | `EconomyPanel`, `TradePanel`, `ResearchPanel`, `SecurityPanel` impilati in una pagina a scorrimento | props costruite in App da `game` con funzioni pure (`economySummary`, `researchRows`, ...) |
| `ui/BuildPanel.jsx` `EconomyPanel` | cassa, popolazione, lavoratori, energia, cantieri, miglioramenti, **Scorte (t)** come testo, `<details>` Impianti raggruppati per tipo/livello | `summary` da `economySummary()` in `ui/buildOptions.js` |
| `ui/BuildPanel.jsx` `ProvinceBuild` | costruzioni nella provincia (miniere, ospedali, fabbriche) | `options` da `provinceBuildOptions()`, ordini via `onOrder(order) -> {ok,text}` |
| `ui/BuildPanel.jsx` `UpgradeList` | righe "miglioramenti" con bottone | `upgradeOptions()` |
| `map/ProvincePanel.jsx` | scheda provincia sulla mappa; ospita `ProvinceBuild` come slot `build` | `item`, `game`, ... |
| `ui/ArmyPanel.jsx` | unità del segnalino; `Info` (dl) con **Consistenza** e **Dotazione** (prime 3 voci equipment, "altre N voci") e "rinforzi sospesi" | `unitInfo(game, unit, ctx)` in `rules/unitInfo.js` |
| `ui/TheaterPanel.jsx`, `ui/TradePanel.jsx`, `ui/SecurityPanel.jsx` | pannello a elenco con righe `build-row` | rows da `*View.js` puri |

Convenzioni:
- Logica di presentazione in file `*View.js`/`buildOptions.js` PURI (testabili senza React); i componenti sono sottili.
- Azioni: callback `onX(...) -> { ok, text }`; il componente tiene `msg` locale e lo mostra con classe `muted` o `warn` (`role="status"`). Errori del dominio spiegati da `describe*Failure`.
- Righe: `<ul className="build-list"><li className="build-row"><div><strong/>…<div className="muted small"/><div className="warn small"/></div><button className="nation-btn"/></li></ul>`; sezioni con `<section aria-label>`, `h2/h3`, `<details>` per liste lunghe.
- Stile (`styles.css`, 350 righe, nessun framework): variabili `--bg --panel --ink --muted --accent --warn`; bottoni min 34-48 px; `.panel` laterale (340 px) in orizzontale, in verticale diventa cassetto in basso max 55%; media query landscape `max-height:600px` riduce i controlli (gioco pensato in orizzontale, `rotate-hint`). Testi tutti in italiano, numeri con `toLocaleString('it-IT')`.

## 2. Proposta per i 4 punti

### (a) Scelta della ricetta di una fabbrica
- Dove: nuovo `FacilityList` dentro `EconomyPanel` (sostituisce il contenuto del `<details>` Impianti per le sole fabbriche con ricette-equipaggiamento) e, per coerenza, nello slot `build` di `ProvinceBuild` per gli impianti di quella provincia (`f.provinceId`). Gli impianti iniziali non hanno provincia: compaiono solo nel pannello Economia.
- Dati: `nation.facilities` filtrati sui `type` per cui esistono ricette con `equipmentId` (cioè `FCT-WEAPONS`, `FCT-ARTILLERY` e altre dalla tabella). Per ogni impianto: ricetta attuale (`recipeId`), ricette candidate = `recipesAvailable(EQUIPMENT_RECIPES, table, nation, techsOf(nation))` della stessa `factory` (+ ricette scritte a mano di quel tipo). `techsOf` è in `game/research.js`.
- Funzione pura nuova `ui/recipeView.js`: `facilityRecipeRows(state, nation, {catalog, table, recipes, resourceLabel})` -> righe `{ facilityId, label, where, current, options:[{recipeId, label, ok, message}], locked:[{label, techName}] }`. `ok/message` da prova a secco: `try { setFacilityRecipe(...) }` nello stesso stile di `build.start` (il messaggio è l'`Error.message` già in italiano).
- Interazione (mobile): riga impianto -> tocco apre `<select>` nativo (affidabile su telefono) o elenco di bottoni a tutta larghezza; conferma esplicita perché il cambio PERDE il `wip`. Testo: "Cambiare ricetta azzera i pezzi in lavorazione (N)."
- Stati: nessuna ricetta disponibile -> "Nessun equipaggiamento producibile da questo impianto"; gruppo bloccato -> riga disattivata "Richiede la tecnologia «…»" (`techNameOf`); lotti in consegna -> bottone disattivato con "Ha N lotti in consegna: aspetta il …" (data più lontana di `batches`); errore dalla funzione -> `warn`.
- Handler in App: `changeRecipe(facilityId, recipeId)` con `setGame(g => setFacilityRecipe(g, g.player, ...))` in try/catch, come `placeOrder`.

### (b) Produzione a lotti (wip, runDays, batches)
- Dove: stessa riga di `FacilityList` (una riga compatta + `<details>` per il dettaglio). Niente nuovo pannello.
- Dati per impianto: `recipe.buildDays`, `recipe.releaseEveryDays`, `f.wip`, `f.runDays`, `f.batches`. Derivati puri in `ui/recipeView.js`: giorni al prossimo lotto = `releaseEveryDays - runDays`; pezzi in lavorazione = `floor(wip)` (+ parte frazionaria nel dettaglio); lotti in consegna = somma `qty` e data del primo `readyOn`.
- Testo riga: "Obice 155 mm · prossimo lotto tra 3 g · in consegna 24 pz (dal 12/11)". Barra di avanzamento `runDays/releaseEveryDays` (riuso stile `.ap-bar`).
- Spiegazione fissa sotto la lista (una frase): "Costruzione N giorni, consegna ogni M giorni: il volume non cambia, ritarda solo la consegna." (N, M letti dalla ricetta, non scritti a mano).
- Stati: impianto fermo o senza ricetta equipaggiamento -> nessuna barra; ricetta senza `releaseEveryDays` (carri `REC-TANK-*`, risorse) -> nessun lotto, produzione giornaliera come oggi; `date` assente -> `batchStep` lancia errore: non mostrare nulla e non nascondere l'errore.
- Efficienza/collo di bottiglia: non salvati nello stato. Per mostrare "fermo per mancanza di acciaio" servirebbe salvare l'ultimo rapporto di `produceDay` nello stato (campo nuovo) oppure ricalcolarlo; DECISIONE da prendere (vedi sotto). Senza, la riga mostra solo i lotti.

### (c) Scorte `equipment.<id>`
- Dove: `EconomyPanel`, sezione "Scorte (t)" oggi testo unico. Dividerla in "Risorse (t)" e nuova "Equipaggiamenti (pezzi)" (`<details>` chiuso se vuoto/lungo).
- Problema concreto: `economySummary` mette in `stocks` tutte le chiavi con t>0 e le chiama "t"; le chiavi `equipment.*` sono PEZZI e `resourceLabel` darebbe l'id grezzo. Estendere `economySummary`: separare per prefisso `EQUIPMENT_PREFIX` ('equipment.'), etichetta = `name_it` del catalogo (`mergeEquipmentCatalogs` -> mappa id -> `name_it`), valore intero senza "t".
- Interazioni: sola lettura; tocco su una voce mostra "usata da: N divisioni con carenza" (deficit da `forces.divisions[*].items`), utile per collegare al punto (d).
- Stati: nessuna scorta -> "Nessun equipaggiamento in magazzino. Scegli una ricetta in una fabbrica (sopra)."; scorte che esistono ma voce non nel catalogo -> mostrare l'id e un `warn` (dato incoerente, non nasconderlo).
- Prezzo/valore: NON mostrare valori in ECV (vedi sezione 4).

### (d) Rinforzi alle divisioni
- Dove: (1) `ArmyPanel` `Info`: estendere le righe "Consistenza"/"Dotazione" (oggi 3 voci + "altre N") e aggiungere "Rinforzi"; (2) nuovo pannello a elenco `ReinforcePanel` nella tab Partita (accanto a `ResearchPanel`) per vista d'insieme e ordine di priorità.
- Dati `unitInfo`: aggiungere `info.reinforce` (`forces.divisions[id].reinforce !== false`), `info.cadre`, `info.transfers` = `forces.transfers` filtrati per `divisionId` (`item, qty, sentOn, arrivesOn`), `netDeficit` per voce. Funzione pura nuova `ui/reinforceView.js`: `reinforcementRows(game, nation, {unitsById, itemLabel})`.
- Testi: "In arrivo: 120 uomini, 8 fucili (arrivano il 14/11)"; "Rinforzi sospesi" con bottone "Riprendi rinforzi" (`setReinforcement`); quadro: "Quadro: non riceve rinforzi" + bottone "Mobilita" (`mobilize`); motivi di `skipped`: `no_resources` -> "Mancano risorse nel pool/scorte", `disabled` -> "Rinforzi sospesi", `cadre` -> "Quadro".
- Giorni di trasferimento: mostrare la data di arrivo e, nel dettaglio, "N giorni (di cui M di mare)" SOLO se la rotta attraversa il mare (`transitDaysFromRoute`). Nessun testo "via mare" se `seaDays` è 0.
- Interazioni: interruttore per divisione (riga con `aria-pressed`, come i bottoni di policy in `Info`); "richiesta" (priorità, parametro `requests` di `planReinforcements`) come secondo interruttore.
- Stati: nessun rinforzo in viaggio -> "Nessun rinforzo in viaggio."; rotta inesistente -> `transitDays` lancia: mostrare "Nessun percorso verso la divisione" e non inviare; pool vuoto -> messaggio di carenza.
- PREREQUISITO non UI: collegare `planReinforcements` + `dispatch` + `applyArrivals` al ciclo giornaliero (`game/engine.js`/nuovo sistema) e passare `routeOf` (rete di movimento `moveNet` + `findSeaRoute`). Senza questo la UI mostrerebbe solo dati sempre vuoti.

## 3. Rischi e ordine di implementazione

Rischi:
- Prestazioni: `economySummary` e le opzioni sono ricalcolate a ogni `game` nuovo (`useMemo([game])`); `setFacilityRecipe` in prova a secco per ogni impianto x ricetta può pesare (catalogo con decine di ricette per nazione). Calcolare le opzioni SOLO per la riga aperta (lazy) e memoizzare per `(facilityId, recipeId, lotti)`. Le liste di divisioni (centinaia di unità) vanno in `<details>` chiusi o paginate.
- Schermi piccoli: App.jsx è già lungo (733 righe) e i pannelli si impilano; in verticale `.panel` è max 55% e il gioco chiede orizzontale. Righe a 2 linee max, bottoni >= 40 px, niente tabelle larghe; `<select>` nativo; testi lunghi in `muted small`.
- Stile: usare solo `build-row`, `nation-btn`, `muted`, `warn`, `small`, `ap-bar`; nessuna libreria; nuove classi minime (es. `.lot-bar`).
- Coerenza dati: "Scorte (t)" oggi mescola unità; unità `equipment.*` sono pezzi.
- Cambio ricetta distruttivo (perde `wip`): serve conferma; rifiutato con lotti in consegna.
- `App.jsx` ingrossa: mettere gli handler in un modulo (`game/playerActions.js`) invece di altre righe inline.
- Rapporto `produceDay` non salvato: mostrare "fermo/limitato" richiede decisione sullo stato.
- Salvataggi: campi `wip/runDays/batches/transfers` sono opzionali (nessuna migrazione), ma la UI deve tollerarne l'assenza.

Ordine (ogni passo piccolo, con test Vitest sulle funzioni pure; i test esistenti sono in `tests/`):
1. Merge del branch `claude/fase4-produzione-equipaggiamenti` e verifica test/`validate-data`.
2. `ui/recipeView.js` puro + test (righe, ricette bloccate, lotti in consegna, prova a secco).
3. Scorte: separare equipaggiamenti in `economySummary` + test (etichette dal catalogo, pezzi interi) + `EconomyPanel`.
4. Handler `changeRecipe` in App + `FacilityList` in `EconomyPanel` (solo selezione ricetta, con conferma).
5. Barra e testo dei lotti nella stessa riga (solo lettura).
6. Stesso `FacilityList` nello slot `build` di `ProvinceBuild` (impianti con `provinceId`).
7. Motore: collegare `planReinforcements`/`dispatch`/`applyArrivals` al giorno + test d'integrazione (con `routeOf` reale).
8. `unitInfo` esteso + `ArmyPanel` (riga "Rinforzi", interruttore, mobilita).
9. `ReinforcePanel` nella tab Partita (vista d'insieme).
10. Prova su telefono reale in orizzontale e verticale; ritocchi CSS.

## 4. Dati mancanti: NON inventare

- Prezzo degli equipaggiamenti: assente. `economy.json` ha prezzi solo per le risorse di `resources.json`; `dailyIncome` ignora le merci senza prezzo. Conseguenza reale da verificare: produrre `equipment.*` consuma acciaio e componenti (valorizzati) ma l'uscita vale 0, quindi produrre equipaggiamenti RIDUCE l'entrata giornaliera. Non mostrare "valore"/"ricavo" finché non c'è una decisione sul prezzo (o sul trattarli come beni non commerciati con costo contabile).
- Costo di costruzione di nuovi impianti per equipaggiamenti: nessun dato specifico (si usano i `factoryBuildCost` di sempre).
- Costo/addestramento delle reclute e costo del trasferimento dei rinforzi: dichiarati "NON definiti" in `reinforcements.js`. Giorni di trasferimento: formula `km/TRANSIT_KM_PER_DAY + giorni di mare` ma i km del percorso li deve fornire il chiamante: non esiste ancora il chiamante.
- `manpower.cadre` e `equipment.cadre` sono `null` (`da_definire`): la UI dei quadri non può dare cifre.
- Pesi, giorni di lotto e ingressi per t: tutti `DESIGN_DEFAULT` (bilanciamento, non storici, non approvati). La UI deve poterli etichettare ("valore di gioco, non storico") almeno nel dettaglio.
- Modelli storici (`models` nel catalogo vuoto): i nomi mostrati sono classi ("Fucili (Germania)"), non modelli.
- UI mancante oggi: scelta ricetta, lotti, scorte equipaggiamenti, rinforzi, mobilitazione. Nessuna esiste.
- Quali ricette siano ammesse per tutte le fabbriche (es. solo `FCT-WEAPONS`/`FCT-ARTILLERY`): dipende dalla tabella; categorie assenti (contraerea, veicoli) non producibili (MISSING_DATA).

## 5. Decisioni da prendere

1. Prezzo/valore degli equipaggiamenti (o trattarli senza prezzo): oggi produrli fa perdere entrata.
2. Salvare nello stato il rapporto di produzione per impianto (efficienza, collo di bottiglia) per poterlo mostrare, o accontentarsi dei soli lotti.
3. Chi chiama i rinforzi: collegare `planReinforcements` al ciclo giornaliero (automatico ogni giorno o su richiesta del giocatore) e con quale `routeOf`.
