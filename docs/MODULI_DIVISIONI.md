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

- *Nuovo*: battaglioni della nazione con − / +, disponibili solo se ricercati e dalla loro data; si può partire da un modello (`presets` e composizioni storiche). Limiti in `data/units/modules/editor_rules.json`: 18.000 uomini, 30 battaglioni, massimi per tipo (carri 4, artiglieria 6, anticarro 3, supporto 4, fanteria 12), almeno 3 battaglioni di combattimento, esattamente un reparto di servizi divisionali (`divisional: true`).
- *Modelli*: elenco, divisioni che lo usano, eliminazione solo se non usato.
- *Riorganizza*: la divisione passa subito al modello (`src/game/designsState.js`, riusa `upgradeDivision` con la mappa delle voci); ciò che ha si porta, ciò che manca arriva coi rinforzi (scorte e produzione), ciò che avanza (equipaggiamenti del catalogo e cavalli) torna in magazzino, gli uomini in più tornano al bacino. La categoria dell'unità segue il modello (carri → corazzata, semicingolati → meccanizzata, tutto motorizzato → motorizzata).
- Stato: `state.designs` (facoltativo, `division-designs-v1`), salvato con la partita.
- Battaglioni ippotrainati aggiunti per la fanteria a piedi (artiglieria leggera e pesante, compagnie pesanti, servizi). Solo Germania: le altre nazioni non hanno ancora battaglioni. L'IA non usa l'editor.
