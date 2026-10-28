# AUDIT — Risorse primarie + Industria (stato del repository)

Data audit: 26/10/2026 · Repository: `ilmiolocaleconme-cpu/grandstrategywwii` · Accesso: **sola lettura** (clone in locale, nessuna modifica, nessun push).
Etichette: [Certo] verificato leggendo/eseguendo · [Probabile] inferenza forte · [Ipotesi] da confermare.

## 0. Esito in una riga
[Certo] Il motore economico **non esiste**: `SYSTEMS = []` in `src/game/engine.js`. Non c'è nulla da "integrare" per stock, logistica, ricette, energia, danni, riparazioni, pool. Esistono solo **dati** (risorse, fabbriche, slot, punti di produzione) e **UI di mappa** (icone risorse). Il task va quindi letto come "costruire il primo sistema economico sopra i dati esistenti", non come "collegare sistemi già presenti".

## 1. Repository e branch
- [Certo] 11 branch remoti: `main`, `test`, `test2`, `test-2`, `feature/resource-locations`, `feature/barra-livelli`, `feature/scelta-nazione`, `sponde-citta-fiumi`, `unione-sponde-test-main`, `ccr-b0ea72c6-1n4wy9` + riferimenti `refs/pull/1..5`.
- [Certo] Più recente: `test` (26/10/2026 08:49), **7 commit avanti a `main`**, 0 indietro. `main` ultimo commit 24/10/2026.
- [Certo] Contraddizione con le note di progetto ("nel repository solo main e test"): i branch extra esistono. Nessuno è stato toccato.
- Base dell'audit: `origin/test` @ `cab25514`.

## 2. Stack e verifiche eseguite
- [Certo] React 19.3, Vite 8.3, vite-plugin-pwa 2.0, JavaScript (niente TypeScript, niente lint, niente typecheck). Test: `node --test`.
- [Certo] `npm test`: **445/445 passati**. `npm run validate:data`: OK (72 nazioni, 22 risorse, 2965 province, 7247 collegamenti).
- [Non verificato] `npm run build`: non eseguibile qui, `npm install` fallisce per DNS (`ENOTFOUND registry.npmjs.org`) nell'ambiente cloud. Non è un difetto del repo.
- Lint/typecheck: non disponibili nel repo.

## 3. Risorse
| Aspetto | Stato nel repo |
|---|---|
| Catalogo | `data/resources.json`: 22 voci. 18 materie prime + `steel` e `aluminium` (`tipo: prodotto`) + `food`, `manpower` |
| ID | `coal, oil, iron_ore, bauxite, rubber, wheat, tungsten, sulphur, tin, manganese, chromium, nickel, cobalt, molybdenum, vanadium, antimony, mercury, uranium` — i primi 3 coincidono col pacchetto |
| Dove stanno | `data/resources/resource_points.json` (19 risorse, 148 centri, 157 province), `province_resources.json`, `resource_locations.csv` (luoghi di riferimento, `quality = reference`) |
| Modello | `modello_punti.json`: 100 punti per risorsa, `step 1.7`, tetto di sviluppo (`extraLevels = 2`). **Punti relativi, non tonnellate/giorno** |
| Codice | `src/data/provinceResources.js`, `resourcePoints.js`, `resourceLocations.js`, `src/map/resourceIcons.js` |
| UI | livello Risorse sulla mappa: icone e province colorate. Nessun pannello Risorse nazionale, nessun dettaglio risorsa |
| Consumo | nessun sistema consuma risorse |
| Mancanti rispetto al task | energia idroelettrica (flusso, non stock), gomma lavorata, elettricità, carburante come prodotto, componenti |

## 4. Industria
| Aspetto | Stato nel repo |
|---|---|
| Catalogo | `data/industry/factories.csv`: 20 tipi (`FCT-STEEL`, `FCT-ALUMINIUM`, `FCT-REFINERY`, `FCT-SYNFUEL`, `FCT-POWER`, `FCT-RUBBER`, `FCT-COMPONENTS`, `FCT-AIRCRAFT`, `FCT-VEHICLES`, `FCT-TANKS`...) con capacità giornaliera, energia, manodopera, ECV, giorni, tecnologia. `balance_status = PROVISIONAL` |
| Slot | `data/industry/province_industry.csv`: 1024 province + 732 parti di città, tutte `provisional_uniform` (14 slot). `src/rules/slots.js`, `data/buildings.json` |
| Ricette | **assenti**. Solo il legame prodotto→fabbrica in `resources.json` (`da`, `fabbrica`) |
| Impianti in partita | **assenti**: nessuno stato per impianti costruiti, danno, efficienza, riparazione |
| Estrazione | non modellata come impianto: è il centro in `resource_points.json` |
| Collegamento a logistica | nessuno. Esiste il grafo `data/links.json` (7247 collegamenti, 1406 ponti) usato solo dalla mappa |

## 5. Motore e salvataggi
- [Certo] `advanceDay()` esiste ed è puro e deterministico; `SYSTEMS` è vuoto di proposito.
- [Certo] `STATE_SCHEMA = 1`; lo stato contiene solo data, giorno, giocatore, `control`. Nessun stock, nessun impianto.
- [Certo] `src/game/save.js`: versionato, `MIGRATIONS = {}`; aggiungere economia richiede schema 2 + migrazione + test.
- Stock/trasferimenti/danni/riparazioni: assenti.

## 6. UI
- [Certo] `src/App.jsx`, `src/map/MapView.jsx`, `ProvincePanel.jsx`, `MapCanvas.jsx`. Nessun drawer/bottom sheet generico, nessun sistema di tooltip, nessun componente per i bottoni del pacchetto.

## 7. Contraddizioni pacchetto ↔ repo (da decidere)
| ID | Pacchetto | Repo | Proposta |
|---|---|---|---|
| C1 | ID impianto `steel_mill`, `oil_refinery`, `truck_factory` | `FCT-STEEL` (type `steel_mill`), `FCT-REFINERY` (type `refinery`), `FCT-VEHICLES` (type `vehicle_factory`) | il repo vince; mappa di corrispondenza nel validatore |
| C2 | Giacimenti con `reserves` (1000) e pannello "Riserve" | decisione di progetto: niente giacimenti che si esauriscono, ma tetto di sviluppo | non implementare esaurimento; mostrare "N/D" |
| C3 | `mine_coal`, `oil_field`, `iron_mine` come impianti | l'estrazione è il centro produttivo a punti | nessun nuovo tipo impianto: l'estrazione usa i centri esistenti |
| C4 | Capacità nominale 100 per tutti | `base_capacity_per_day` per tipo (45–100) | il repo vince |
| C5 | `recipes.csv`: fattori 1.00/0.50, senza quantità | il task cita 10 ferro + 5 carbone + 2 elettricità → 8 acciaio | servono quantità: **DESIGN_DEFAULT** da approvare |
| C6 | `REC-FUEL-001` solo da petrolio | decisione di progetto: un solo carburante, anche da carbone | aggiungere ricetta carbone→carburante |
| C7 | Unità `t`, `bbl` | i punti non hanno unità fisica | conversione punti→unità = DESIGN_DEFAULT |
| C8 | Giacimenti: solo template (`province_id` letterale) | 148 centri reali nei dati | derivare i giacimenti da `resource_points.json` |

## 8. Rischi
1. Scope: il task descrive un'intera economia (stock, logistica, energia, riparazioni, 6 pannelli UI, ~30 test). Farla in un solo intervento viola "fasi piccole e verificabili".
2. Il grafo di logistica (7247 collegamenti) è pensato per il rendering: usarlo per rifornire impianti richiede una regola di instradamento nuova.
3. Nessun dato storico su quantità: tutto sarebbe DESIGN_DEFAULT.
4. Branch multipli e non sincronizzati: rischio di lavorare su base sbagliata.

## 9. Roadmap proposta (per dipendenza)
- **Fase 0 — Dati:** ricette con quantità (DESIGN_DEFAULT), prodotti mancanti (carburante, gomma lavorata, elettricità, componenti), idro come flusso; validatore e test. Nessun motore.
- **Fase 1 — Stato ed economia base:** schema 2, stock per nazione, sistema `extraction` + `production` in `SYSTEMS`, bilancio verificabile, colli di bottiglia. Test A, B, F.
- **Fase 2 — Logistica:** consegna via grafo collegamenti; ferrovia interrotta. Test C.
- **Fase 3 — Danni e riparazioni:** capacità effettiva, coda officine. Test D, E.
- **Fase 4 — UI:** ResourceOverviewPanel, dettaglio, giacimento, industria, ricetta, bottoni, tooltip.
- **Fase 5 — Collegamento ai consumatori militari** già presenti nei dati.

## 10. Seguito
L'audit descrive il repository prima della Fase 0. La Fase 0 (solo dati) è in `docs/RISORSE_INDUSTRIA_FASE0.md`. Decisioni del 26/10/2026: nessun esaurimento dei giacimenti; quantità delle ricette proposte da Claude e mostrate all'utente prima del push.
