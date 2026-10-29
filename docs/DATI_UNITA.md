# Catalogo unità (28/10/2026)

Stato: **implementato e testato (dati, validazione, regole di attivazione)**; **mancante**: ordine di battaglia 1936, uso in gioco (produzione, movimento, combattimento, interfaccia). Tutto il catalogo resta `DA_VERIFICARE`: nessuna fonte è stata verificata.

## File
- `data/units/source/unita_cronologia_1935_1945.csv` — copia non modificata del CSV ricevuto (364 righe, sha256 in `units.json`). Le due copie ricevute erano identiche.
- `data/units/unit_reviews.json` — revisioni manuali (stato, certezza, motivo). Una data si corregge solo con certezza "certo".
- `data/units/units.json` — generato con `npm run build:units`.
- `src/data/units.js` — classificazione, validazione, `isActiveAt`, `unitsActiveAt`, `countActive`.
- `tests/units.test.js`.

## Regole
- Il CSV ha solo l'anno: l'inizio è assunto al 1° gennaio, la fine al 31 dicembre (`startPrecision: 'year'`).
- "1935" nel CSV è l'inizio della finestra, non una data di costituzione (`dating: 'window_start'`).
- Politica `strict`: sono inattive le unità con revisione `date_doubt`, `duplicate`, `excluded`, `faction_doubt`.
- Revisioni: 4./5. Panzer → 1938; Fronte di Leningrado → 1941; 1. Gebirgs esclusa (decisione utente); 1. Kavallerie e 1re/2e DLM dubbie; Kantō/Kwantung e 32ª/132ª Ariete duplicati; 8th Route Army e New 4th Army fuori dalla fazione CHN.

## Limiti noti
- Al 1/1/1936 (strict) restano: DEU 30 fanteria + 3 corazzate; JPN 15; ITA 4 alpine; GBR 5; URSS 15 + 1; USA 3; FRA 0. Non è un ordine di battaglia reale: per FRA/GBR/ITA/USA/URSS le date sono di mobilitazione o designazione bellica.
- Mancano la divisione alpina Pusteria e le forze di Polonia, Cecoslovacchia e altri paesi.
- Ipotesi non confermate dall'utente: Germania storica dal 1/1/1936; politica strict.

## Decisioni dell'utente (28/10/2026)
- Germania: il 1/1/1936 resta com'è (30 divisioni di fanteria + 3 corazzate). Le leve successive (Aufstellungswellen) arrivano tramite eventi, che usano lo stesso motore della formazione manuale (guida "02 — Divisioni, creazione, supporti e ricostituzione", §29). Il meccanismo "unità attivata da evento" non è ancora implementato: oggi esiste solo l'attivazione per data.

## Stime aggregate 1936 (`data/units/oob_1936_stime.csv`)
Sono intervalli per nazione, categoria e livello, **non unità nominate**: non entrano nel catalogo e non creano unità in gioco. Ogni riga ha fonte e certezza (certo/probabile/ipotesi). Fonti realmente consultate in questa sessione: il testo di Tournès del 1936 sull'esercito francese (blog, interno incoerente: 20 o 25 divisioni) e Wikipedia per la cavalleria sovietica (36, ma il dettaglio somma 32) e i corpi meccanizzati (4 a inizio 1936). Le righe di UK, Italia, USA e la fanteria URSS sono ipotesi non verificate; per l'Italia non stimo le divisioni di fanteria perché il 1936 è falsato dalla guerra d'Etiopia.

## Francia 1936 dal file dell'utente (28/10/2026)
`data/units/source/francia_1936_oob.csv` (copia non modificata, sha256 in `units.json`). Integrato in `units.json` da `mergeOob1936` (stesso meccanismo per Germania e URSS, sotto):
- 6 divisioni già presenti nel CSV (1re DLM, 1re/2e/10e/14e/19e DI) sono anticipate al 1936 con revisione `corrected`, certezza **probabile**, `basis: user_file` (dato fornito dall'utente, da verificare su SHD). Le altre 14 di fanteria e 4 di cavalleria sono nuove (`S36-FRA-nnn`).
- Al 1/1/1936: 20 divisioni di fanteria, 4 di cavalleria, 1 meccanizzata leggera (coerente con il limite basso del testo di Tournès: 20–25).
- Inattive per dubbio: 5ª divisione di cavalleria (il testo di Tournès ne conta 4) e le 4 divisioni coloniali (data di costituzione non verificata; il CSV dice 1939).
- 3ª/5ª/9ª/15ª DI hanno nel CSV una versione motorizzata: la versione 1936 termina nel 1938 (`supersededBy`) per non contarle due volte. La data della motorizzazione è assunta dal CSV, non verificata.
- Difetto del file: le 32 righe terrestri hanno una virgola in più prima di `data_riferimento`. Il lettore ripara solo questo caso preciso e lo conta (`repairedRows`).
- Non importati (fuori dal catalogo terrestre, 8 righe): 2 squadre navali, flotta sottomarina, aviazione navale, 3 divisioni aeree, Raggruppamento indocinese-malgascio. Servono sistemi navale/aereo che il repository non ha ancora.
- Gli ufficiali sono "Da verificare" quasi ovunque; la colonna non è stata importata.
- Le righe francesi di `oob_1936_stime.csv` restano come controllo indipendente (intervallo 20–25), ma ora il catalogo ha i nomi.

## Germania e URSS 1936 dai file dell'utente (28/10/2026)
`germania_1936_oob.csv` e `urss_1936_oob.csv` in `data/units/source/` (copie non modificate). Le righe terrestri hanno la stessa virgola in più del file francese (riparata e contata). Le righe di marina e aviazione hanno campi spostati (DEU 2 righe, URSS 5) e **non vengono lette**: sono elencate in `malformedRows`.

**Germania** (+33 unità): conteggio invariato al 1/1/1936 (30 fanteria + 3 corazzate), come deciso. Aggiunti 13 Wehrkreis e 12 Armeekorps come comandi (`commandLevel`: `district`/`corps`; le divisioni assegnate ai corpi sono nella nota, non ancora come relazioni). Inattive per dubbio: 31ª–36ª Infanterie-Division (il CSV si ferma alla 30ª; formazione non verificata) e 2ª/3ª Kavallerie-Division (la 1ª era già dubbia). Non importate: 5 unità SS (non Heer), 3 incrociatori tascabili, 2 navi da battaglia (varate dopo il 1/1/1936), 9 Geschwader, 6 Luftkreis.

**URSS** (+49 unità): 12 distretti militari (attivi), 3 brigate aviotrasportate (attive, certezza probabile). Inattivi per dubbio: 23 corpi fucilieri e 7 di cavalleria (numerazione 1°–N° probabilmente generica; i corpi reali non erano numerati in sequenza) e 4 corpi meccanizzati (il file li numera 1°–4°; Wikipedia nomina l'11º e il 45º). **Il file non contiene divisioni di fucilieri**: restano le 15 del CSV, quindi il totale di divisioni 1936 dell'URSS è sconosciuto. Note dubbie del file: la Flotta del Nord "elevata a flotta nel 1935" (la data corretta è probabilmente il 1937, non verificata); marina e armate aeree non importate.

## Segnaposto fucilieri URSS e template (28/10/2026)
Su richiesta dell'utente: 46 divisioni anonime (`S36-USSR-F-nnn`, revisione `placeholder`, **inattive** nella politica strict), 2 per ciascuno dei 23 corpi fucilieri (limite basso di "2-3 divisioni" del file; 3 per corpo darebbe 69). Non sono unità storiche: numeri, nomi e distretti reali vanno inseriti dopo la revisione. Il template `data/units/templates/divisione_fucilieri_urss_1936.json` ha tutti i valori numerici a `null` (organico, reggimenti, equipaggiamento): nessun dato inventato. Da decidere con l'utente: quante divisioni, quali nomi reali, organico di pace/guerra, se sono territoriali o di quadri.

## Riferimenti per template di divisione e artiglieria (28/10/2026)
`data/units/templates/divisioni_1936_riferimenti.json`: forma della divisione (triangolare/quadrata) e artiglieria divisionale per nazione, ogni valore con anno di riferimento e fonte. **Quasi nessun valore è del 1936**: le fonti trovate sono del 1938–1943 (Germania 1943: 3 reggimenti, 36×105 mm + 12×150 mm, ~17.000 uomini; Francia 1939–40: 3 RI, 36×75 mm + 24×155 mm; Italia: triangolare fino al 1938, poi binaria). Verificato per il periodo prebellico solo: USA e Giappone con divisione quadrata, Italia triangolare prima del 1938. Non trovate: Regno Unito, organico di Giappone/USA/URSS, fucilieri sovietici 1936 (territoriali o di quadri). `null` = nessuna fonte, non inventato.

## Template di divisione: fanteria tedesca 1936 (29/10/2026)
- File: `data/units/templates/divisione_fanteria_germania_1936.json` (`TPL-DEU-INF-1936`, stato `BOZZA_DA_CONFERMARE`). Test: `tests/units.test.js`.
- Scelta dell'utente: organico di **guerra**. Valori forniti dall'utente (basis `utente`): ricostruzione **1937–38** dal rapporto di A. C. Wedemeyer (via dokumen.pub), fonte secondaria **non verificata da me**: non sono un organico documentato del 1/1/1936.
- Contenuto: 3 reggimenti da 3 battaglioni, 17.263 uomini, 4.465 cavalli; fucili 13.500, pistole 3.000, mitragliatrici leggere 355 e pesanti 133, mortai 50 mm 37 e 81 mm 54, cannoni di fanteria 75 mm 20 e 150 mm 6, controcarro 37 mm 75, obici 105 mm 36, obici 150 mm 8, cannoni 105 mm 4 (artiglieria divisionale = 48 pezzi, come nel riferimento 1943), antiaerei 20 mm 16 (**aggregati dalla Luftwaffe**, non organici certi).
- Mobilità "trainata": ipotesi coerente con i cavalli, non dichiarata dalla fonte.
- Distinzione prevista: **organico previsto** (questo file) e **dotazione effettiva** (`effectiveSupply`, non definita): la produzione dovrà colmare la differenza.
- Da definire (null): organico di pace, veicoli, radio, costi, tempi, manutenzione.
- Il CSV `divisioni_tedesche_estratto_v11_1.csv` (54 righe) coincide con il catalogo già importato (0 differenze su id, nome e anno): nessun dato nuovo.
- Non collegato a produzione, caserme o stato di gioco: oggi nessuna regola legge i template.

## Template di divisione: corazzata tedesca 1936 (29/10/2026)
- File: `data/units/templates/divisione_corazzata_germania_1936.json` (`TPL-DEU-PZ-1936`, `BOZZA_DA_CONFERMARE`). Test: `tests/units.test.js`.
- Modello **teorico 1935–37** fornito dall'utente (simile alla 1. Panzer-Division del 15/10/1935), fonte secondaria **non verificata da me**. Struttura: 2 reggimenti carri da 2 battaglioni (4 in tutto), 1 brigata di fanteria, 1 battaglione motociclisti, 1 reggimento di artiglieria, reparti controcarro, ricognizione, genio e trasmissioni; antiaerea e ricognizione aerea aggregate (non organiche certe).
- **416 carri = organico teorico, non disponibilità del 1936**: le prime divisioni corazzate non erano pienamente operative fino alle manovre del 1937.
- Da definire (null): uomini, cavalli, armi, artiglieria, veicoli, radio, dotazione effettiva, costi, tempi. Non collegato a produzione o stato di gioco.

## Previsto ed effettivo, mobilità per componente (29/10/2026)
- Decisione dell'utente: ogni voce numerica di un template ha un valore **previsto** (`value`) e uno **effettivo** (`effective`: valore, data `asOf`, fonte). Esempio dell'utente (non dati storici): cavalli previsti 5000, effettivi 4780; carri previsti 500, effettivi 437. Gli esempi sono usati solo nei test come casi sintetici.
- `src/data/templates.js`: `validateTemplate` (base `utente|ipotesi|da_definire`; valore non nullo con fonte; effettivo intero, non superiore al previsto, con data e fonte), `leaves`, `fillRatio` (rapporto effettivo/previsto, `null` se manca un dato). Controllato anche da `scripts/validate-data.js`.
- Nei due template tedeschi tutti gli `effective` sono `null`: nessun dato effettivo del 1936 è stato inventato. Nella corazzata il campo dei carri si chiama `carri` (previsto 416, effettivo da definire).
- Mobilità della divisione corazzata per componente, indicata dall'utente: fanteria, ricognizione e artiglieria **motorizzate** (basis `utente`).
- Mancante: regola che usa `fillRatio` (efficienza, rinforzi, produzione); nessuna regola legge ancora i template.

## Dotazione effettiva iniziale e pool nazionale di uomini (29/10/2026)
- `data/units/readiness.json` (`readiness-v1`) e `src/rules/readiness.js`: all'avvio l'effettivo di ogni voce numerica dei template = previsto × **0,915** (media dei due esempi dell'utente: 0,956 e 0,874), `USER_EXAMPLE`, **non un dato storico**. Un dato reale nel campo `effective` del template ha sempre la precedenza. I template su disco restano con `effective` null. Test: `tests/units.test.js`.
- Non esistono ancora istanze di divisione nello stato di gioco (forza e dotazione per divisione): `initialEffective` è calcolato ma nessuno lo salva.
- **Pool nazionale di uomini (decisione dell'utente, 29/10/2026):** quota base **5% della popolazione** (ESEMPIO, `data/population/population.json` → `recruitment.baseShare`, `USER_ESTIMATE`). Può aumentare con leggi, diplomazia, nuove leve (per la Germania), mobilitazione totale e aumento dell'età di leva: `src/rules/manpowerPool.js` accetta modificatori additivi (`{id, kind:'add', value, source}`, quota limitata a 0–100%) e calcola `{share, capacity, enlisted, available, overdrawn}`. **Nessun modificatore reale è definito**: i test usano esempi sintetici. Test: `tests/manpower.test.js` (4 test, passati). Germania 1936: 68,5 milioni × 5% = 3.425.000 di capacità.
- **Da stabilire con l'utente:** regole di rimpiazzo delle perdite dal pool, addestramento, costi e tempi, tetto massimo della quota. **Non collegato** allo stato di gioco (nessuno schema nuovo: mancano le istanze di divisione, quindi `enlisted` non si calcola ancora) né all'interfaccia.

## Quadri di divisione (29/10/2026)
Decisione dell'utente: dove i dati sono dubbi (divisioni che nel 1936 esistevano solo come nucleo), si usa un **quadro**, un template dedicato per nazione che diventa divisione completa solo con una **legge di mobilitazione**.
- File: `data/units/templates/quadri_1936.json` (`cadre-templates-v1`, stato `DA_DEFINIRE`), 8 template `TPL-<NAZIONE>-CADRE-1936` (CHN, DEU, FRA, GBR, ITA, JPN, USA, USSR). Codice: `src/data/cadres.js` (`validateCadreTemplates`), controllato anche da `scripts/validate-data.js`. Test: `tests/cadres.test.js`.
- Ogni quadro è anche un `unit-template-v1` (previsto/effettivo, basi e fonti di `templates.js`). Nessun valore numerico è stato inventato: `manpower.cadre` e `equipment.cadre` sono `null` (`da_definire`).
- `mobilization`: `combatReady` sempre `false` (il quadro non combatte), `law` = `null` (nessuna legge di mobilitazione ancora modellata), `expandsTo` = template di divisione completa. Esiste solo per DEU (`TPL-DEU-INF-1936`) e URSS (`TPL-USSR-RIFLE-1936`); per le altre nazioni è `null` finché non c'è un template di divisione.
- Regola: nessuna divisione nasce gratis; la differenza tra quadro e divisione completa si paga con riservisti e dotazione (scorte o produzione).
- **Non ancora collegato**: le unità dubbie di `units.json` (31ª–36ª Infanterie-Division, Territorial Army, divisioni coloniali francesi, segnaposto fucilieri URSS) non puntano ancora a un quadro; nessuna regola di gioco legge i quadri; manca il sistema di mobilitazione.

## Istanze di divisione nello stato (schema 6, 29/10/2026)
- `state.forces = { schema: 'forces-v1', initialized, divisions: { idUnità: { templateId, since, items: { 'manpower.war': { planned, effective, source }, ... } } } }`. `source`: `template` (dato reale) o `ratio` (frazione di esempio 0,915).
- `src/rules/forces.js` (`initForces`, `templateFor`, `enlistedManpower`, `validateForcesState`) e `src/game/forcesState.js` (`initForcesState`, `migrateV5toV6`, `validateForcesShape`, `nationManpowerPool`). Migrazione 5→6 con stato vuoto; `initForcesState` crea le istanze una sola volta, in modo deterministico.
- Al 1/1/1936: 33 istanze (Germania: 30 fanterie + 3 Panzer). Le **altre 67 divisioni attive non hanno istanza** (nessun template: Francia, Giappone, URSS, Regno Unito, Italia, USA, e in Germania gebirgs e cavalleria). Le fanterie hanno 15.796 uomini effettivi (17.263 × 0,915); le Panzer non hanno organico (null nel template): niente invenzioni.
- Pool della Germania: capacità 3.425.000 − arruolati 473.880 = 2.951.120 disponibili (stesso calcolo di `manpowerPool`, ora dallo stato).
- **Non collegato** a `App.jsx` (nessuna chiamata a `initForcesState` all'avvio), nessuna interfaccia; nessuna regola applica perdite o rinforzi alle istanze. Test: `tests/forces.test.js` (5 test).

## Catalogo dei carri tedeschi 1934–1945 (29/10/2026)
- File: `data/units/models/carri_tedeschi_1934_1945.json` (`tank-models-v1`, `DA_VERIFICARE`), codice `src/data/tankModels.js` (`validateTankModels`, `modelsAvailableAt`), test `tests/tank_models.test.js` (3), controllo in `validate-data`.
- Dati: tabella incollata dall'utente (Panzer I, II, III, IV, Panther, Tiger I, Tiger II) con designazione, Sd.Kfz., anni di produzione, esemplari e ruolo. **Non verificata da me.** Nessuna statistica di combattimento (corazza, cannone) è stata inventata.
- Anni interi, inizio dal 1° gennaio: al 1/1/1936 risultano disponibili Panzer I, II e **IV** (inizio 1936 nella tabella). Il Panzer IV potrebbe non essere disponibile in quella data (prime consegne più tarde): **da decidere**.
- **Non collegato** al template della corazzata (`carri` resta un numero unico) né al tech tree: i modelli diventeranno sblocchi della ricerca.
- Controllo del 29/10/2026 sul Panzer III con la pagina indicata dall'utente (corazzati.it, scheda Pz.Kpfw. III): conferma la fine della produzione (agosto 1943); **non** dà l'anno di inizio né le quantità per versione (15.000 scafi comprendendo i cannoni d'assalto); adozione in serie dal settembre 1939, Ausf. A–C in piccole quantità. L'inizio 1937 della tabella resta non confermato. Il controllo è nel campo `checks` del modello. Per il 1/1/1936 il Panzer III non è disponibile in nessuna delle due letture.
- **Carri cecoslovacchi (evento, 29/10/2026):** `eventModels` del catalogo contiene Panzer 35(t) (LT vz. 35) e Panzer 38(t) (LT vz. 38), con origine `CZE`, disponibili **solo** con l'evento `EVT-CSK-CARRI` (data **15/03/1939**, indicata dall'utente). Nessun anno di produzione né quantità: non forniti. Non compaiono mai per data (test). Nessun sistema di eventi esiste ancora nel codice.
- Il pool di carri cecoslovacchi passa alla Germania con l'evento (indicazione dell'utente, 29/10/2026): campo `transfer` dei due modelli (da `CZE` a `DEU`, nessuna duplicazione, validato). **Limite:** la Cecoslovacchia non ha unità né un pool di carri nei dati (0 unità nel catalogo), quindi oggi non c'è nulla da trasferire; le quantità andranno definite insieme ai dati di CZE.

## Rinforzi delle divisioni (29/10/2026)
Regola dell'utente: i rinforzi passano dal pool; se ci sono abbastanza risorse vengono integrati, con una regola di spostamento, nelle unità che ne hanno bisogno o ne fanno richiesta; il giocatore può decidere di non rinforzare più una divisione.
- Codice: `src/rules/reinforcements.js` (`planReinforcements`, `dispatch`, `applyArrivals`, `setReinforcement`, `netDeficit`, `inTransit`, `validateReinforcementFields`). Test: `tests/reinforcements.test.js` (6, casi sintetici). Forma dei campi controllata da `validateForcesShape`.
- Stato (tutto opzionale, **nessuna migrazione**, schema invariato): `forces.divisions[id].reinforce` (assente = attivo) e `forces.transfers` (rinforzi in viaggio: `id, divisionId, item, qty, from, sentOn, arrivesOn`).
- Assegnazione: prima le divisioni con richiesta, poi la più scoperta (effettivo/previsto), mai oltre la carenza né oltre le risorse. Uomini dal pool (`manpower.war`, meno quelli già in viaggio), altre voci dalle scorte passate dal chiamante; senza scorte non si assegna nulla (non si inventa). I rinforzi in viaggio sono riservati: nessun doppio invio. L'effettivo non supera mai il previsto.
- **Assunzioni da confermare**: (1) i rinforzi già partiti arrivano anche se il giocatore sospende dopo l'invio; (2) l'eccedenza oltre il previsto torna al pool/scorte; (3) "fanno richiesta" = priorità nell'ordine, non crea risorse.
- **Non definito**: giorni di trasferimento (`transitDays` è obbligatorio e va derivato da logistica/movimento, non esistono ancora), costi, addestramento delle reclute, rinforzo delle divisioni senza template (67 al 1/1/1936).
- **Non collegato**: nessuna chiamata da `App.jsx` o dal motore di partita, nessuna interfaccia per sospendere i rinforzi, nessun consumo effettivo dal pool a ogni giorno.

## Carri cecoslovacchi (30/10/2026) e stato dell'industria carri

- `data/units/models/carri_cecoslovacchi_1935_1938.json`: LT vz. 35 (1936-1938) e LT vz. 38 (1938), nazione CZE. Nomi e descrizioni dall'utente; **anni, quantità (434 per LT vz. 35) e produttori (Škoda, ČKD) sono ricordi di Claude, basis `ipotesi`, da verificare**. `producedApprox` è ora facoltativo (LT vz. 38: quantità non indicata). Dal 1939 la CZE non produce più: i carri passano alla Germania con EVT-CSK-CARRI. Implementato e testato (validazione + disponibilità per data).
- **Cosa la Cecoslovacchia ha già** (dati esistenti): fascia A con 7 impianti (acciaieria, chimico, macchinari, componenti, motori, munizioni, centrale a carbone), scorte iniziali, cassa iniziale, popolazione, profilo commerciale 1930 (armi e veicoli Škoda/Tatra; importa carburanti e tessili, partner non nominati).
- **Cosa manca, per TUTTE le nazioni, non solo per la CZE**: `FCT-TANKS` esiste in `factories.csv` ma nessuna ricetta lo usa e non esiste il prodotto «carri» in `resources.json`; la produzione (`produceDay`) non è collegata alle unità né a SYSTEMS. La CZE non ha una fabbrica di carri nell'industria iniziale, nessuna unità/divisione e nessun template. Stato: **mancante**.


## Template: fanteria britannica 1936 (29/10/2026)
- File: `data/units/templates/divisione_fanteria_gran_bretagna_1936.json` (`TPL-GBR-INF-1936`, `BOZZA_DA_CONFERMARE`). Test: `tests/template_gbr.test.js`. Collegato in `src/App.jsx` (`FORCES_CTX`).
- **Previsto provvisorio** = cifre 1939-40 (13.863 uomini, 72 cannoni da 25 libbre, 48 controcarro da 2 libbre, 27 antiaerei da 20 mm), basis `ipotesi`: fonti web deboli, anno incerto (documento con intestazione 1944-45 e titolo 1939-40). Struttura: 3 brigate × 3 battaglioni. Le stesse cifre restano in `referenceFigures` con la fonte (il test le tiene allineate).
- **Parte come quadro al 30%** (esempio dell'utente, `initialFillRatio` 0,3 `USER_EXAMPLE`, `startsAsCadre`): al 1/1/1936 le 5 divisioni regolari hanno 4.159 uomini su 13.863. Il template può avere una propria frazione iniziale: `buildDivision` la usa al posto di quella globale (0,915) e segna l'istanza `cadre: true`.
- **Mobilitazione**: `mobilize(forces, id)` (in `src/rules/reinforcements.js`) toglie il flag di quadro; da quel momento i rinforzi (pool + scorte, con tempo di trasferimento) portano la divisione al 100% **solo se ci sono le risorse**, mai oltre il previsto. Il quadro non riceve rinforzi (`skipped.reason = 'cadre'`). Non crea uomini né mezzi. Manca la legge di mobilitazione (condizioni, costi, durata): oggi `mobilize` è un comando manuale.
- **Organico di pace 1936: non trovato online** (Hansard 9/3/1936: solo totali nazionali, 208.630 regolari e 175.094 Territorial Army). Cavalli, armi leggere, mortai, veicoli e radio: `null`.
- 1936 secondo le fonti web: 5 divisioni regolari e **14** Territorial Army; il file dell'utente ne elenca 12 (stima del repo: 12): da verificare. Le Territorial Army del catalogo restano al 1939 (inattive nel 1936).
- Il quadro `TPL-GBR-CADRE-1936` (quadri_1936.json) ora si espande in `TPL-GBR-INF-1936`.
- **Verificato**: 37 test sui moduli toccati e `validate-data`. **Non verificato**: `vite build` (npm non raggiungibile) e la resa in gioco.

### Carri e artiglieria a pezzi (29/10/2026, richiesta dell'utente)
- Prodotti `tanks` e `artillery` in `data/resources.json` con `unit: "pezzi"`; prezzi per pezzo in `economy.json` (carro 0,6 ECV, pezzo 0,16 ECV: **di progetto**, scelti per avere valore aggiunto positivo).
- Ricette con `outputUnit: "pieces/day"` e `massTonnes` (peso del pezzo): pezzi al giorno = `base_capacity_per_day` della fabbrica (t di lavorazione) / peso. FCT-TANKS 45 t/giorno → LT vz. 35 (10,5 t) 4,286 pezzi/giorno, LT vz. 38 (9,7 t) 4,639. Ingressi per pezzo: acciaio 1,2 × peso, motori 0,08 × peso, componenti 0,10 × peso (artiglieria senza motori).
- **Tutti i numeri sono proposte di Claude non approvate**: i pesi sono ricordi [Probabile] da verificare; le percentuali degli ingressi e i prezzi sono di progetto. `REC-ARTILLERY-001` è un segnaposto (pezzo di riferimento da 3 t, `MISSING_DATA`) finché non esiste un catalogo di artiglieria.
- La Cecoslovacchia parte con 1 fabbrica di carri (ricetta LT vz. 35) e 1 di artiglieria (`ARMS` in `scripts/build-initial-industry.js`); le altre nazioni non ne hanno. Rigenerati industria, scorte e cassa: la cassa di molte nazioni cambia di 0,2 ECV al giorno perché **il file in repository era già non allineato allo script** (verificato rigenerando da HEAD), non per questa modifica.
- Limiti: i pezzi prodotti restano frazionari nello stock (nessun arrotondamento); nessun collegamento fra carri prodotti e le unità/divisioni; `produceDay` non è ancora in SYSTEMS. Stato: ricette e produzione **implementate e testate come dati/regole** (`tests/pieces.test.js`, 5 test); produzione di unità: **mancante**.

### Regola decisa: paesi minori, licenze e acquisto di prodotti pronti (29/10/2026, indicazione dell'utente)
- I paesi minori hanno **un solo template di artiglieria** (non un catalogo proprio).
- Per avere modelli più avanzati (carri più moderni, artiglieria di tecnologia successiva) possono: **acquistare licenze produttive** (producono in casa un modello altrui) oppure **acquistare fisicamente prodotti pronti** (pezzi finiti dal produttore).
- **Stato: mancante.** Non esiste ancora nulla di tutto questo nel codice. Requisiti che ne derivano: accordo commerciale/diplomatico fra venditore e acquirente; costo (denaro o merci) e tempi di consegna; acquisto di pezzi finiti = trasferimento dal pool del venditore a quello dell'acquirente senza duplicazione; licenza = nuova ricetta per l'acquirente (con condizioni: durata, royalty o limiti, da stabilire); vincolo di tecnologia (il modello deve essere sbloccato dal venditore e, per la licenza, l'acquirente deve avere la fabbrica adatta); rotte di consegna reali (porti, ferrovie), possibili blocchi.
- **Da definire con l'utente:** quali nazioni sono «minori» (ipotesi di Claude: la fascia C di `initial_industry.json`, 51 nazioni senza industria iniziale), cosa contiene il template unico di artiglieria, prezzi e condizioni delle licenze.



## Unità sulla mappa, movimento e scheda unità (29/10/2026)

Stato: **implementato e testato** per dati e regole (`tests/deployment.test.js`, `tests/movement.test.js`, `tests/unit_info.test.js`); **interfaccia implementata ma non verificata** (nessun `vite build`, nessuna prova in browser o su telefono; solo controllo di sintassi e dei collegamenti con esbuild).

- **Dislocazione 1/1/1936** (`data/units/deployment_1936.json`, generata da `scripts/build-deployment.js`): base *ipotesi*, derivata da stazione → città → provincia madre e dal corpo d'armata. 85 unità collocate, 25 no (elenco in `unplaced`).
- **Livello «Esercito»**: segnalini NATO (APP-6 semplificato) per nazione; si toccano per aprire il pannello (`src/map/unitIcons.js`, `src/ui/ArmyPanel.jsx`).
- **Movimento** (`src/rules/movement.js`, `src/data/moveNet.js`, `src/game/movementState.js`): campo opzionale `state.movement` (nessuna migrazione). Percorso con meno passi lungo l'adiacenza; ogni passo dura ⌈km tra i centri / velocità⌉ giorni. **Velocità per categoria = valori di partenza provvisori (ipotesi di bilanciamento), non dati storici.** Si entra solo in province controllate dalla propria nazione.
- **Non modellati nel movimento**: fiumi e attraversamenti, terreno, stagione, rifornimenti, mare, ferrovia, guerra/diplomazia/accessi, combattimento. Un nuovo ordine sostituisce il precedente; durante il passo l'unità resta nella provincia di partenza.
- **Scheda unità** (`src/rules/unitInfo.js`): comandante (solo corpi e armate; il sistema di assegnazione automatica `commandersSystem` ora gira nella partita), inquadramento e forze assegnate (ORBAT dello stato), consistenza (uomini effettivi/previsti, quadro, rinforzi), posizione e ordine di marcia. **Fatica, morale, organizzazione, esperienza e rifornimenti non esistono nel progetto**: la scheda li dichiara «non modellati».

### Paesi minori: minimo di produzione di artiglieria (29/10/2026)
- Fascia C = «paesi minori» (conferma dell'utente); scelta «scorta»: ogni nazione di fascia C (51) parte con **1 fabbrica di artiglieria** (`minorArtillery` in `initial_industry.json`, ricetta segnaposto `REC-ARTILLERY-001`) e una scorta di **760 t di acciaio e 65 t di componenti**, **in aggiunta** alla riserva minima di 500 t di acciaio per le costruzioni (aumentata il 29/10/2026 su richiesta dell'utente: bastano per circa 180 giorni, poi la nazione deve fare commercio).
- Nuovo campo di impianto `throttle` (0-1, default 1) in `produceDay`: quota di capacità voluta, diversa dal danno. Fascia C: 5% → circa 1,17 pezzi al giorno, 4,2 t di acciaio e 0,35 t di componenti al giorno; energia 15 MW × 5% (dentro la rete di base da 40 MW).
- **Numeri proposti da Claude, non approvati** (5%, 760 t, 65 t). Con la scorta aggiuntiva la fabbrica non tocca la riserva delle costruzioni finché dura la scorta (circa 180 giorni); dopo, il pool di acciaio è comune e la fabbrica consuma anche la riserva (4,2 t al giorno). La cassa iniziale non conta il valore di questa produzione.
- Rigenerati industria, scorte e cassa; la cassa cambia anche per aggiornamenti di altre chat non rigenerati nel repository.
- Testato in `tests/pieces.test.js` (8 test). Acquisto di licenze e prodotti pronti: sempre **mancante**.
- **Magazzini e commercio: mancanti.** Richiesta dell'utente (29/10/2026): aggiungere magazzini ai paesi minori, che poi dovranno fare commercio. Oggi esistono solo i depositi di carburante (`fuel_storage.json`: L1 1.500 t, L2 5.000 t, L3 15.000 t, solo carburante) e **non ci sono magazzini con capacità per le merci generiche né strutture piazzate nello stato di gioco**; il commercio non è nel codice. Non ho aggiunto magazzini finti: servono (1) capacità di magazzino per risorsa e le strutture `depot` come istanze nello stato, (2) il sistema di commercio. Finché mancano, la scorta iniziale non ha limiti di capacità.
