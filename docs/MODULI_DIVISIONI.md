# Divisioni a battaglioni (moduli) — fase 1: veicoli e fanteria motorizzata (18/11/2026)

Decisioni dell'utente (18/11/2026): **editor a moduli** (come Hearts of Iron), prima **veicoli e motorizzata**, prima la **Germania**.
Stato: dati, regole e test pronti; **l'editor (interfaccia per comporre le divisioni) non esiste ancora**: è la fase 2.

## Cosa c'è
- `data/units/modules/modules_deu.json`: 9 battaglioni tedeschi (fanteria a piedi, motorizzata, meccanizzata su Sd.Kfz. 251, compagnie pesanti di reggimento, gruppo d'artiglieria leggera e pesante motorizzato, gruppo anticarro, battaglione carri, servizi) e 2 composizioni. **Organici stimati da Claude, non verificati.**
- `src/data/modules.js`: validazione, somma dei battaglioni, template generato, velocità di marcia dai veicoli.
- `scripts/build-module-templates.js` (`npm`: nessuno; `node scripts/build-module-templates.js`) genera `divisione_motorizzata_germania_1937.json` (15.250 uomini) e `divisione_meccanizzata_germania_1938.json` (leichte Division, 10.400). Il validatore controlla che i file coincidano con i moduli.
- Catalogo: `VEH-DEU-TRUCK` (autocarri da 3 t) e `VEH-DEU-SDKFZ251` (semicingolato, nuova categoria `HALF_TRACK`). Produzione alla fabbrica di veicoli `FCT-VEHICLES` (prima senza ricette). Sd.Kfz. 251 dal 1/6/1939 con la ricerca.
- Ricerca: ramo **Motorizzazione** — `TECH-MOT-INF` (già acquisita nel 1936 da Germania, Regno Unito, Francia, USA) e `TECH-MECH-HT` (semicingolati).
- Movimento: una divisione con veicoli nel template marcia da 20 km/g (nessun veicolo) alla velocità della sua categoria (tutti i veicoli previsti), in proporzione agli autocarri effettivi (`vehicleMarchSpeed`). Senza veicoli nel template nulla cambia.
- Battaglia: il semicingolato vale 6/0,3 (mitragliatrice di bordo); l'autocarro non spara.

## Esiti simulati (contro 1 fanteria francese 1939, 16.400 uomini)
Divisione motorizzata 1937: vince in 9 giorni, 1.590 prigionieri (inseguimento motorizzato). leichte Division 1938: respinta in 10 giorni (formazione esplorante più piccola). Fanteria tedesca 1939: vince in 10 giorni.

## Aggiunte del 18/11/2026 (decisioni dell'utente)
- **Sistema degli eventi** (`src/game/eventsState.js`, `data/events/events.json`): eventi con data ed effetti `reorganize` (cambio di categoria di un'unità, in `state.unitChanges`, letto da `unitOf`/`unitsView`/`unitsList`; il catalogo non cambia) e `grant_stock` (materiale alla scorta nazionale). Ogni evento si esegue una volta (`state.events`).
- **Evento EV-DEU-MOT-1937** (1/10/1937, data unica approssimata): 2., 13., 20. e 29. Infanterie-Division diventano motorizzate → il gioco le porta al template motorizzato; 3.800 autocarri alla scorta tedesca (circa il 60% del previsto), che i rinforzi automatici portano alle divisioni. Finché i camion non arrivano marciano a piedi.
- **3 fabbriche di veicoli tedesche all'inizio** (Opel, Daimler-Benz, Büssing; `scripts/build-initial-industry.js`): producono autocarri. Effetti: una centrale termica in più, piccola scorta di carbone (regola dei 150 giorni), 42 t di acciaio al giorno, entrate −0,3/giorno.
- La quota corazzata in battaglia resta quella della categoria, non dipende ancora dai semicingolati.
- Le altre nazioni non hanno battaglioni.

## Cacciacarri, cannoni d'assalto e brigate (18/11/2026)

Tecnologie nuove nel ramo Corazzati: **TECH-ARM-ASSAULT** (cannone d'assalto, dopo il 75 corto) e **TECH-ARM-TD** (cacciacarri semoventi, dopo il 37/50). `requiresTech` di modelli e battaglioni può essere un elenco: servono tutte.

| Modello | Dal | Tecnologie | Altro |
|---|---|---|---|
| StuG III (75 corto) | 02/1940 | cannone d'assalto | |
| Panzerjäger I | 03/1940 | cacciacarri | fino al 02/1941 |
| StuG III G (75 lungo) | 03/1942 | cannone d'assalto + 75 lungo | |
| Marder III | 04/1942 | cacciacarri + 75 lungo | Boemia, fino al 05/1944 |
| Jagdpanzer IV | 01/1944 | cacciacarri + corazza inclinata | |
| Hetzer | 04/1944 | cacciacarri + corazza inclinata | Boemia |
| Jagdpanther | 01/1944 | cacciacarri + carro pesante + corazza inclinata | |

Battaglioni tedeschi (`modules_deu.json`): MOD-DEU-STUG, STUG-G, PZJG-SP (Marder), JPZ, HETZER (compagnia), JAGDPANTHER. Nessuna composizione li usa ancora: entreranno con l'editor.

Brigate: `echelon: 'brigade'` ora ha istanza nelle forze se esiste un template di brigata per la nazione. Template: TPL-USSR-TBR-1935 (160 carri BT/T-26, 2 700 uomini) e TPL-USSR-TBR-1941 (47 carri, 1 300 uomini). Le 3 brigate aviotrasportate sovietiche restano senza template. In battaglia una brigata occupa **mezzo posto** nel fronte e consuma metà munizioni e carburante. Le brigate sovietiche non sono nello schieramento del 1936 (come quasi tutta l'Armata Rossa), quindi non compaiono ancora sulla mappa.

## Editor a moduli (18/11/2026)

Menu → **Divisioni**. Decisioni dell'utente: **limiti storici** e **riorganizzazione graduale**.

- Schermata a tutto schermo (19/11/2026, richiesta dell'utente con un esempio): la partita va in pausa all'apertura e riprende alla chiusura se correva; colonne modelli / composizione / riepilogo (con potenza di fuoco), icone e illustrazioni SVG originali (`src/ui/unitIcons.jsx`); in verticale una colonna sola.
- *Nuovo*: battaglioni della nazione con − / +, disponibili solo se ricercati e dalla loro data; si può partire da un modello (`presets` e composizioni storiche). Limiti in `data/units/modules/editor_rules.json`: 18.000 uomini, 30 battaglioni, massimi per tipo (carri 4, artiglieria 6, anticarro 3, supporto 4, fanteria 12), almeno 3 battaglioni di combattimento, esattamente un reparto di servizi divisionali (`divisional: true`).
- *Modelli*: elenco, divisioni che lo usano, eliminazione solo se non usato.
- *Riorganizza*: la divisione passa subito al modello (`src/game/designsState.js`, riusa `upgradeDivision` con la mappa delle voci); ciò che ha si porta, ciò che manca arriva coi rinforzi (scorte e produzione), ciò che avanza (equipaggiamenti del catalogo e cavalli) torna in magazzino, gli uomini in più tornano al bacino. La categoria dell'unità segue il modello (carri → corazzata, semicingolati → meccanizzata, tutto motorizzato → motorizzata).
- Stato: `state.designs` (facoltativo, `division-designs-v1`), salvato con la partita.
- Illustrazioni (18/11/2026): 24 PNG fornite dall'utente in `src/assets/units` (pulite, 256 px, 256 colori, ~380 kB in tutto), metadati in `data/assets/unit_illustrations.json`, campo `illustration` di ogni battaglione; usate nelle schede, nelle righe e nella testata. Generiche, non identificazioni storiche: da sostituire per nazione.
- Battaglioni ippotrainati aggiunti per la fanteria a piedi (artiglieria leggera e pesante, compagnie pesanti, servizi). Solo Germania: le altre nazioni non hanno ancora battaglioni. L'IA non usa l'editor.

## Battaglioni con nomi tedeschi (19/11/2026)

Richiesta dell'utente: nomi tedeschi. Ogni battaglione ha `name_de` (mostrato in grande) e `name_it` (traduzione sotto). Nuovi battaglioni, tutti stime di Claude:

| name_de | tipo | effetto reale in gioco |
|---|---|---|
| leichte Panzer-Abteilung | carri | 70 Pz I |
| Kradschützen-Bataillon | fanteria motorizzata | motociclette (contano come veicoli per la marcia) |
| Aufklärungs-Abteilung / (mot.) | esplorazione | solo le sue armi (autoblindo Sd.Kfz. 222) |
| Pionier-Bataillon / (mot.) | genio | senza genio, una divisione di un modello del giocatore subisce la penalità del fiume 1,5 volte (`noEngineerRiverPenalty`) |
| Flak-Abteilung (mot.), leichte Flak-Kompanie | contraerea | 8,8 cm forte anche contro i carri; aerei non ancora simulati |
| Gebirgsjäger-Bataillon, Gebirgs-Artillerie-Abteilung | montagna | divisione «mountain»: +30% in montagna |
| Reiter-Abteilung | cavalleria | divisione «cavalry» (terreno della cavalleria) |
| Fallschirmjäger-Bataillon | paracadutisti | richiede TECH-INF-AIRBORNE (ricercata dal 1936 da Germania e URSS); lancio non simulato |
| Sanitäts-Kompanie (mot.) | supporto | nessun effetto oltre a uomini e autocarri |

La categoria segue i battaglioni: metà o più della fanteria da montagna, paracadutista o a cavallo → quella categoria. Modelli di partenza: Infanterie-Division (1936, con Aufklärung e Pioniere), Panzer-Division (1939), Gebirgs-Division (1938), Kavallerie-Brigade (1939), Fallschirmjäger-Division (1940). Nuove armi producibili: 8,8 cm Flak, 7,5 cm GebG 36, Sd.Kfz. 222, Kraftrad; contraerea (anche la 2 cm tedesca e quella britannica) ora producibile.

## Formare divisioni nuove (19/11/2026)

Decisioni dell'utente: **nasce come quadro**, **stesse regole** per le storiche, **addestramento per tipo**.

- Divisioni → scegli un tuo modello → **Forma**: modello, provincia (deposito della nazione o province delle sue divisioni nel 1936, se ancora sue), quante (1–10). A destra: magazzino / necessari per ogni arma.
- La divisione nasce subito nel registro della partita (id `X#####`), nella provincia scelta, con gli uomini liberi del bacino (servono almeno il 30% dell'organico); armi, mezzi e cavalli partono da zero e li portano i rinforzi giornalieri dal deposito.
- Nome tedesco col primo numero libero (`data/units/modules/raise_rules.json`), es. «37. Infanterie-Division».
- Addestramento: fanteria e cavalleria 90 giorni, motorizzata e montagna 120, meccanizzata, corazzata e paracadutisti 150. Intanto non combatte (`isFighter`); esperienza e morale da unità nuova (`markNew`).
- Stesse regole: le divisioni storiche che si formano DOPO l'inizio della partita prendono uomini e dotazione dal bacino e dal magazzino (`drawOnActivation`); quelle già esistenti all'inizio restano come prima.
- Corretto: gli uomini delle divisioni create in partita ora contano come arruolati (prima il bacino non scendeva).
- Limiti: solo il giocatore (l'IA non forma divisioni); solo la Germania ha battaglioni.

## Armi delle divisioni tedesche: fabbriche iniziali (19/11/2026)

Prima la Germania aveva un solo impianto di armi leggere (fucili) e uno d'artiglieria (obici da 105): mortai, mitragliatrici, pistole, anticarro, cannoni di fanteria e obici pesanti restavano a zero e le divisioni nuove non si completavano. Ora (`scripts/build-initial-industry.js`, `EXTRA`), stime di Claude:

| impianto | ricetta | pezzi/giorno | giorni per una Infanterie-Division |
|---|---|---|---|
| armi leggere | fucili (già c'era) | 800 | 14 |
| armi leggere | pistole | 800 | 2,5 |
| armi leggere | MG 34 leggera / pesante | 100 / 100 | 4,8 / 1,2 |
| artiglieria ×2 | leFH 18 (obice 10,5 cm) | 2,45 ciascuno | 7,3 |
| artiglieria | sFH 18 (obice 15 cm) | 0,89 | 13,5 |
| artiglieria | GrW 34 / GrW 36 (mortai) | 15 / 20 | 3,5 / 4 |
| artiglieria | PaK 36 | 5,7 | 6,8 |
| artiglieria | leIG 18 | 10,5 | 1,9 |

Costo: 33 t di acciaio al giorno in più e una centrale a carbone in più (6). Il sIG 33 non ha impianto proprio: si ottiene cambiando la ricetta di un impianto. Prova nel browser: due Infanterie-Division formate il 1/1/1936 al 54–58% della dotazione dopo 30 giorni (media per arma). Le altre grandi potenze: ancora un impianto per tipo.

## URSS dai battaglioni (19/11/2026)

Decisione dell'utente «Tutto dai battaglioni»: anche i template dei fucilieri sovietici sono la somma dei battaglioni (`data/units/modules/modules_ussr.json`, nomi russi traslitterati in `name_ru` + `name_it`). Stessi id di prima per 1936 e 1939 (TPL-USSR-RIFLE-1936, TPL-USSR-INF-1939): il set CSV `USSR-INF-1939` del manifesto ha `templateOutput: false` e genera ormai solo il catalogo. Organici: stime di Claude (ESTIMATED); il 1939 è tarato sui numeri con fonte del vecchio CSV.

| template | uomini | note |
|---|---|---|
| TPL-USSR-RIFLE-1936 | 15.250 | 9 battaglioni senza mortai, un reggimento d'artiglieria |
| TPL-USSR-INF-1939 (dal 1/9/1939) | 17.970 | 243+ DT, 178 Maxim, 72 AT 45, 42 cannoni da 76, 28 obici da 122, 12 da 152 |
| TPL-USSR-INF-1941 (dal 1/4/1941) | 16.780 | più PPD, un gruppo da 122 in meno |
| TPL-USSR-INF-1942 (dal 1/3/1942) | 13.630 | PPSh-41 (richiede TECH-INF-EMERG), servizi ridotti |
| TPL-USSR-MTN-1940 | 8.670 | artiglieria da montagna = cannone reggimentale da 76 (approssimazione) |
| TPL-USSR-CAV-1936 | 7.350 | 4 reggimenti di cavalleria, un battaglione BT |
| TPL-USSR-MOT-1940 | 11.240 | 216 BT, 710 ZIS-5, 274 GAZ-AA |
| TPL-USSR-ABN-1936 (brigata) | 3.500 | dà l'istanza alle 3 brigate aviotrasportate |

Codice: `templateFromComposition` accetta `echelon: 'brigade'` (file `brigata_*`); `name_ru` mostrato nell'editor come `name_de`. Fabbriche iniziali URSS: 2 di veicoli (ZIS-5, GAZ-AA) e un impianto per pistola, DT, Maxim, mortaio da 82, 76 reggimentale, AT 45, obice da 122 e contraerea da 76 (AT 45 e 122 senza data d'inizio dal 19/11/2026, scelta dell'utente). Obici da 152, mortai da 50 e 120 e contraerea da 37 non hanno impianto iniziale: producibili solo dal 1938-39. Mancano: fucili anticarro PTRD/PTRS, mortai da 107 mm, illustrazioni sovietiche (oggi generiche con insegne tedesche).
