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

## Limiti
- Nessuna divisione dei dati usa il template motorizzato: le 4 divisioni motorizzate storiche (2., 13., 20., 29.) sono fanteria in `units.json`. La 4. leichte Division usa il template leggero dal 1938.
- Nessuna nazione possiede una fabbrica di veicoli all'inizio: gli autocarri si producono solo costruendola.
- La quota corazzata in battaglia resta quella della categoria, non dipende ancora dai semicingolati.
- Le altre nazioni non hanno battaglioni.
