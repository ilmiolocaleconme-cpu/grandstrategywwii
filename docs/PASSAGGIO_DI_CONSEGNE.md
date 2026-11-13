# Passaggio di consegne — stato al 06/11/2026

Documento per riprendere il lavoro in una nuova sessione senza perdere le decisioni. Le decisioni dell'utente hanno la precedenza su tutto il resto. Stato del repository: `main` e `ccr-e05b6c3a-hd4gp6` allineati all'ultimo commit del riepilogo di comando (`37b6ad4`). Suite completa: 1107/1107. Build OK.

## Pubblicato su `main` il 08/11/2026 (da `wip/inquadramento-e-fili`, commit 80f3b09)
Suite `node --test` 1132/1132. Build: confermata dall'anteprima Vercel del commit 80f3b09 (stato «success»), **non** eseguita in locale (in quella sessione `vite` non era installato). La resa su telefono è stata vista dall'utente solo sull'anteprima, non verificata da Claude: restano da guardare a 360 e 390 px la scheda, il pannello Comando e i fili.
- **Scheda divisione → «Comando» → «Inquadra in…» / «Scollega»** e **pannello Comando → «Aggiungi a…»**: una lista sola ordinata per vicinanza (decisione dell'utente 07/11/2026): il comando più vicino per primo (segnato «il più vicino»), poi gli altri per distanza crescente, senza distanza noto in fondo. Sotto ogni nome: livello e distanza in km, con «⚠ fuori portata» oltre 300 km. Vale per divisione→corpo/armata, corpo→armata, armata→teatro (i livelli validi li decide `validParents`). Usa `playerAttach`, `playerDetach` (lo stato `orbat.links` esisteva già dallo schema 5: **nessuna migrazione**). Codice: `nearestFirst` e `distanceLabel` in `src/rules/commandLinks.js`.
- **Correzioni 08/11/2026 (segnalate dall'utente su telefono)**: (1) un comando spostato su una città (es. Brema) e rimasto solo **non si poteva toccare**: le unità sono raggruppate per posizione esatta (una città è una destinazione a sé), il segnalino porta la provincia madre e il tocco non trovava il gruppo. Ora `groupAt` (`src/rules/unitGroups.js`) unisce i gruppi della nazione con la stessa madre. Stesso scarto corretto per i fili (normalizzati sulla madre in `App.jsx`). (2) **Gli ordini a un comando valgono per le sue divisioni**: `withSubordinates` aggiunge a quelle scelte le divisioni agli ordini di ogni comando scelto (marcia, incarico, trincea), ciascuna dalla propria posizione; scheda e fili restano sulle unità scelte. Il pannello dice «N unità scelte (M con le forze agli ordini)». **Limite noto**: se una provincia ha un segnalino della città e uno della provincia per la stessa nazione, il tocco su uno dei due apre il gruppo unito e il menu radiale si ancora al primo trovato.
- **Forze agli ordini di un comando** (scelta B dell'utente, 08/11/2026: si parte senza inquadramenti, ma il comando mostra le sue forze): nel pannello del segnalino, sotto la riga del comando, «N divisioni agli ordini» con provincia e distanza dal comando (dalla più vicina; «⚠ fuori portata» oltre 300 km; tetto 5 righe + «altre N»); comando vuoto = «Nessuna divisione agli ordini»; «Aggiungi unità…» (anche nella scheda del comando) apre le unità libere di livello inferiore dalla più vicina al comando. Codice: `src/ui/CommandForces.jsx`, `byDistance` in `src/rules/commandLinks.js`, `subordinatesOf` e `childOptions` in `App.jsx`. Solo per la nostra nazione (di un comando nemico non si dice nulla in più di prima).
- **Mappa: luce sulle divisioni fuori portata** (decisione dell'utente 07/11/2026: fissa, resta accesa finché lo stato non cambia): alone ambra fisso più medaglione «!», senza animazione. Si spegne da sola quando la divisione torna entro 300 km o cambia comando. Solo nostra nazione.
- **Mappa: fili di comando** (decisione 07/11/2026: **solo con la selezione**, mai sempre): compaiono toccando una divisione, un corpo o un'armata (segnalino, scheda di un comando o pannello Comando). Mostrano la catena verso l'alto fino al teatro e, se l'unità scelta è un comando, tutto ciò che ha sotto; i fratelli non scelti non hanno filo. Solo divisioni di terra e nostra nazione (**nemici no**: arriveranno con fog of war e spionaggio, più avanti). Tutti i fili sono **sottili e tratteggiati** (richiesta dell'utente 07/11/2026, la frase era interrotta: «fino» interpretato come «sottile»); il livello del comando si legge dalla lunghezza del tratteggio. I fili raggiungono anche i comandi fuori schermo (ancoraggio nascosto). Un filo manca se uno dei due segnalini non è disegnato (zoom lontano o sovrapposizione): non si inventa. Nessuna legenda ancora.
- Codice: `src/rules/commandLinks.js` (puro, testato: `tests/command_links.test.js`; `commandThreads` con `focusIds`), `src/map/unitIcons.js` (`counterSpec`, `threadEnds`, `nearestPair`, `drawThreads`), `src/App.jsx` (`commandLinks` per la luce, `mapLinks` per i fili, `parentOptions`, `detachCommand`).
- Ancora aperto: legenda dei tratti; se la selezione di un segnalino con molte divisioni mostra troppi fili.

## Come lavorare (regole dell'utente)
- Lingua: italiano. Risposte brevi. Prima la verità scomoda. Etichette sulle affermazioni: [Certo] con prova, [Probabile] inferenza forte, [Ipotesi] lacuna colmata.
- Domande: una alla volta, con opzioni A/B. Per ogni opzione: cosa comporta, differenze, vantaggi, svantaggi, costo. Poi il consiglio, spiegato.
- Piano prima del codice. Per le fasi grandi (scheda unità): audit in sola lettura, poi piano, poi approvazione, poi implementazione.
- Prima di ogni push: suite completa (`npm test`) e build (`npx vite build`). Se verdi, push su `ccr-e05b6c3a-hd4gp6` **e** su `main` (decisione del 06/11/2026). Mai push se un test fallisce.
- Commit: messaggio in italiano, nessun nome del modello nel messaggio o nel codice, riga `Claude-Session` della sessione.
- Non modificare dataset storici o Data Pack senza autorizzazione.
- Icone sempre con etichetta o suggerimento; il colore non è mai l'unico segnale; testo minimo 12 px.

## Decisioni già prese (non riaprirle)
**Tecnologia**
- Resta JavaScript (niente TypeScript). Il riferimento `fronte1936` è un altro repository, in TypeScript: solo riferimento.
- Data Pack di riferimento: v11.1 (`data/PACK_SOURCE.json`). I file rigenerati (industria, scorte, cassa iniziali) sono dati di progetto, con versione e riga di changelog a ogni cambio di numero di gioco.

**Economia e industria**
- Fabbriche di munizioni iniziali: 33 (USA 6, Germania 6, URSS 6, Giappone 5, Francia 4, Gran Bretagna 3, Italia 3, altre 0). Eccezione alla regola (13 fabbriche): da rivedere con navi e aerei.
- Riserva militare: 30 giorni di consumo di attacco per le divisioni attive al 1/1/1936 (100 divisioni). Divisioni intere: la capacità sostiene il numero intero di divisioni, mai frazioni (`src/rules/militaryReserve.js`).
- Addestramento: 2 t di munizioni al giorno per divisione.
- Caserme: costo come l'ospedale (30 ECV, 20 t di acciaio, 45 giorni), senza personale.
- Costo di reclutamento: solo materiale. Il costo di unità non esiste ancora.
- Equipaggiamento: prezzo 1,25 × costo dei materiali (già su `main`).
- Scorte di acciaio: con più fabbriche di munizioni salgono (Italia 39.000 t). È in contrasto con la richiesta di ridurre l'acciaio: da decidere.

**Addestramento ed esperienza**
- Scala: Recluta 0–19, Addestrata 20–39, Esperta 40–59, Veterana 60–79, Élite 80–100.
- Unità nuove: esperienza 10, morale 45. Tetto di addestramento: 39 (non 45).

**Scheda unità (fasi 0–3 fatte)**
- Navigazione a schede: panoramica, organico, composizione, equipaggiamento, comando, operazioni, condizione. Logistica, sanità e storia mostrano «dato non disponibile».
- Simbolo NATO semplificato (forma per affiliazione: rettangolo amico, rombo nemico, quadrato neutrale). Affiliazione da guerra e alleanze.
- Equipaggiamento per categoria con tabella esplicita. Le voci non riconosciute restano in «Non classificati» con il loro codice. Le stime (effettivo = previsto × 0,915) sono marcate «stimato».
- Template incompleti: le voci non definite si contano e si segnalano, non si riempiono.

**Comandi (fase 4)**
- Corpi e armate del catalogo sono gli HQ. Senza posizione reale la posizione è stimata: la provincia dove stanno più divisioni sottostanti, parità all'id più piccolo. Sempre etichettata «stimata».
- I comandi si muovono da soli (le divisioni restano dove sono). Si muovono con l'ordine di marcia come le divisioni, a 20 km/giorno.
- Distanza dal comando: oltre 300 km, una divisione perde 1 punto di prontezza al giorno, tetto 20; si recupera di 1 al giorno. Ipotesi da approvare.
- Sulla mappa i comandi stimati o mossi compaiono come gli altri segnalini (nessun simbolo diverso).

**Registro unità create in partita (schema 8)**
- Id `X#####` con contatore nello stato, mai riusato. Ricerca unica `unitOf`: catalogo prima, registro poi. Il catalogo non si modifica.
- Lo stato ha `unitRegistry` (con `forming`, le formazioni in corso). Migrazione 7→8. Versione futura: schema 9.

**Comandi creati dal giocatore**
- Dalla scheda di una divisione: «Forma un corpo» / «Forma un'armata».
- Costo: uomini dal pool (corpo 300, armata 600). Tempo: corpo 20 giorni, armata 45. Stato maggiore nel template: corpo 60, armata 150. Tutti i numeri sono ipotesi da approvare (`data/units/command_templates.json`).
- Il comando nasce nella provincia della divisione che ha avviato la formazione, quindi è sulla mappa e può muoversi.
- Inquadramento dalla scheda del corpo: «Assegna a un'armata» (solo per i corpi creati dal giocatore).
- Il comando nuovo compare in ORBAT, comandanti, rinforzi e pannello comando (`unitsList`).

**Pannello comando**
- Riepilogo in alto con dati reali: cassa ECV, uomini liberi nel pool, prontezza e morale medi, avvisi. Un dato assente mostra «—», mai zero (`src/rules/commandSummary.js`).

**Stato maggiore variante B nel gioco (08/11/2026, branch `fix/selezione-hq`, da provare su telefono)**
- Il pannello Comando ora ha il layout del mockup B: barra «STATO MAGGIORE» con il riepilogo, albero a nodi tondi (XXX, XXXX…) con pallino di stato, dettaglio con barre (personale, prontezza, morale, forza materiale), azioni tonde con etichetta, barra in basso con cinque sezioni.
- Pallino di stato: verde = nessuna divisione fuori portata (300 km), giallo = alcune, rosso = tutte («fuori comando»). Nessuna soglia inventata (`src/rules/commandStatus.js`).
- «Forza materiale» mostra «—»: la media non è affidabile. Sezioni «Materiali», «Condizione» e «Storia» sono visibili ma disattivate («Non ancora disponibile»).
- Sezione «Ordini»: «Seleziona tutte (N)» spunta le divisioni agli ordini, si tolgono quelle che restano, poi «Muovi (M)» (tocco sulla mappa per la destinazione; barra «Annulla» in basso), «Incarico», «Trincera», «Smetti» valgono solo per le spuntate. Alla fine il pannello si riapre con l'esito (quante partite e perché le altre no).
- Non si creano armate né teatri da qui; nell'albero compaiono solo i comandi che esistono.
- Da verificare su telefono (360/390 px): albero con molti comandi, barra in basso, barra «Annulla» sopra la mappa.

**Scheda unità e rinforzi (09/11/2026, branch `fix/selezione-hq`, da provare su telefono)**
- Un tocco su una divisione sola mostra solo il cerchio (Muovi, Trincera, Supporta spento, «I») e una barra sottile in basso; l'elenco compare solo con più unità nella provincia.
- Scheda unità: riga di pulsanti tondi con etichetta (Inquadra, Scollega, Sospendi/Riprendi rinforzi), sezioni su una striscia scorrevole, nuova sezione «Rinforzi» (`src/rules/reinforcementView.js`): cosa manca, cosa è in viaggio, scorta.
- I rinforzi di cavalli e mezzi dalle scorte esistono già nel motore (`reinforcementSystem.js`), ma NESSUNA produzione riempie le scorte `equipment.*`: i mezzi non arrivano perché la scorta è vuota. Prossimo passo grande (A): ricette di produzione di carri, artiglieria e mezzi → scorte della nazione.
- Barra in alto riordinata (`src/ui/TopMenu.jsx`): «Livelli» a sinistra (livello, fiumi, strade, mari, zoom), data e tempo al centro, «Menu» a destra (Comando, Teatro con il ⚠, Partita) e schermo intero. Da provare su telefono.
- Priorità rinforzi (10/11/2026): campo opzionale `priority` per divisione, collegato al parametro `requests` di `planReinforcements`; le divisioni con priorità sono servite per prime dal pool e dalle scorte (non crea risorse). Pulsante «Priorità rinforzi» nella scheda e nella sezione «Rinforzi».

**Stato maggiore (mockup)**
- Variante B scelta: albero a tutta larghezza, dettaglio sotto, barra in basso con etichette. Stile con cornici d'ottone e bagliore, senza copiare grafica di altri giochi.
- Mockup privato: https://claude.ai/artifact/RryWcLDUQ8WzeWACErfiHb (versione 3). Dati di esempio.

**Risorse prese ai fantocci (12/11/2026, decisione dell'utente, opzione C)**
- Fantoccio = entità che possiede se stessa ma è controllata da un'altra nei dati del 1936 (`puppetsOf` in `src/rules/puppetLevy.js`): Manciukuò → Giappone, Terranova → Regno Unito. I mandati (proprietario LEAGUE) non sono fantocci: la loro economia (estrazione, idroelettrico) va tutta a chi li amministra (`economicOwner`, decisione dell'utente 12/11/2026: Palestina → GBR, Siria → FRA). Stessa regola per i fantocci che non sono nazioni del gioco (Terranova → GBR: ferro di Bell Island 50 t/g); serve `nationIds` in `createEconomySystem`.
- Chi controlla sceglie la quota (0/25/50/75/100%) nel pannello Diplomazia; campo opzionale `state.puppetLevy`. L'economia sposta ogni giorno quella parte dell'estrazione di base (le miniere costruite dal fantoccio restano sue).
- Quota iniziale `diplomacy.puppet.startLevy` = { MAN: 1 } (decisione dell'utente 12/11/2026): il Giappone, giocatore o IA, parte con il 100% del Manciukuò e può abbassarla; si applica solo se `state.puppetLevy` manca.
- Il rapporto scende di `diplomacy.puppet.relationPerDayAtFull` (-0,05/giorno al 100%, valore di progetto) × quota.
- Ferro del Manciukuò 2,6 Mt tramite `data/resources/correzioni_produzione_1936.csv` (i file ricevuti restano invariati, sha256).
- Limiti: Terranova non è una nazione del gioco (il pannello non la mostra); rapporto iniziale Giappone–Manciukuò 0 (manca nei dati del 1936); l'IA non usa ancora le quote.

**Sponde, fase 2: economia per sponda (12/11/2026, decisioni dell'utente)**
- Slot: 14 per OGNI sponda (sostituisce la regola del 22/10); la provincia madre è l'ACCUMULATORE (`byMother` in `src/rules/slots.js`, `src/rules/provinceSum.js`). `province_industry.csv` rigenerato: 3085 posti (+486 × 14 slot).
- Miniere: giacimento DIVISO fra le sponde per area (`share` in `mine_sites.json`, schema v2); la voce della madre resta `legacy` per le miniere dei salvataggi vecchi; costruire sulla madre divisa → `use_bank`. Tetto ×1,1 per tutti (`economy.mines.capFactor`), così crescono anche i siti dove la base era già il massimo (carbone USA).
- Si costruisce nel posto toccato (sponda); miglioramenti di strade, ferrovie e porti restano per provincia madre.
- Pannello della sponda: pulsante «Provincia» nell'angolo → totali (slot, impianti, giacimenti) e dettaglio per sponda; «Sponda» torna indietro.
- Fabbriche iniziali: per nazione, senza luogo (`initial_industry.json`): non toccate. Giappone senza siti di miniera: buco di dati da sistemare.
- Test: `tests/province_sum.test.js`; aggiornati slots, industry, construction_game, build_ui.

**Sponde come posti separati, fase 1: solo movimento (11/11/2026, decisione dell'utente)**
- Segnalato: una divisione in Weser-Ems (sponda B) mandata alla sponda A rispondeva «già lì»: la rete fondeva le sponde nella madre.
- Ora (`src/data/moveNet.js`): ogni sponda è un posto; `bankIndex` dà sponda principale (la più grande per area, stessa dove la mappa disegnava icone e segnalini), `provinceOf`, `isBank`, `banksOf`. La madre divisa resta un NOME DI COMODO: `net.has(madre)` vero, vicini e distanze della sponda principale; `issueMove` la traduce (salvataggi di prima: nessuna migrazione, schema invariato).
- Controllo (`provinceController`): la sponda ha il suo; senza, segue quello scritto sulla madre, poi la nazione. La madre chiesta per nome vale la sponda principale.
- Teatri e IA ragionano per PROVINCIA MADRE (`provinceOf` in theaterPlan.js e aiWarSystem.js); il combattimento e la conquista avvengono per posto (sponda). Un attacco dato col tocco va alla provincia, quindi alla sua sponda principale (limite della fase 1).
- Strade e ferrovie fra sponde: quelle delle madri (`infraNet`); fra sponde sorelle nessun bonus stradale. Nessuna penalità di attraversamento (fase successiva: ponti, guadi).
- Dislocazione 1936: campo `bank` (62 unità) = sponda della città della stazione (zona → `city_links` access), della sede di guarnigione o del corpo d'armata, altrimenti la principale. `scripts/build-deployment.js` rigenerato.
- Segnalini per posto: il tocco porta la sponda (o la zona di città); `canonUnitKeys` riporta le posizioni sulla madre alla sponda principale.
- Decisione dell'utente da confermare: «ogni parte ha le sue capacità industriali e produttività» (B: 14 slot per ogni sponda?) + pulsante in angolo per la vista della provincia intera. Contraddice la regola del 22/10 in `src/rules/slots.js`. Fase 2, non iniziata.
- Test: `tests/sponde_movement.test.js` (dati veri).

**Pulsanti «i» e catena (11/11/2026, decisioni dell'utente dal disegno a mano del 10/11)**
- Segnalino scelto: resta scoperto (anello tratteggiato), a destra un riquadro con «i» (scheda) sopra e catena (Inquadra) sotto, 46 px ciascuno. Supporto = bandierina (non più «+»). Catena attiva solo con UNA unità della propria nazione (spuntarla nell'elenco se il segnalino ne ha di più).
- Elenco unità: su ogni scheda «i» sopra e catena sotto; via il testo iniziale «Usa il menu…» (restano gli avvisi di marcia e unità straniere). Variante A: niente «Inquadra spuntate» in basso (B si può aggiungere dopo).
- La catena apre la scheda di quella unità con «Inquadra in…» già aperto (HQ dal più vicino). Nessuna regola nuova di gioco.
- Icone SVG in `src/ui/ActionIcons.jsx` (i, catena = Inquadra, catena spezzata = Scollega, bandierina = Supporto); regole pure in `src/ui/unitActions.js` (`tests/unit_actions.test.js`).
- Corretto: titolo «Inquadra … in…» tagliato e × fuori dal riquadro; elenco degli HQ senza stile (pulsanti grigi).
- Ancora aperto: testi tecnici «(sponda A/B)» e «comandante non gestito».

## Produzione di equipaggiamenti: interfaccia (10/11/2026)
- `src/ui/recipeView.js` (puro): `facilityRecipeRows` (impianti con ricette di equipaggiamento, scelte con prova a secco di `setFacilityRecipe`, ricette bloccate con la tecnologia richiesta), `batchView`/`batchLine` (lavorazione, giorni al lotto, pezzi in consegna), `splitStocks` (tonnellate separate dai pezzi), `defaultEquipmentRecipe`.
- Economia: sezione «Equipaggiamenti in magazzino (pezzi)» e «Produzione di equipaggiamenti» con scelta ricetta (menu a tendina, conferma se si perdono pezzi in lavorazione, rifiuto con lotti in consegna). Handler `changeRecipe` in `App.jsx`.
- Pannello costruzioni: prima mostrava le ricette di equipaggiamento di TUTTE le nazioni. Ora solo quelle della propria nazione e sbloccate, UNA riga per tipo di fabbrica; la ricetta iniziale di una fabbrica nuova è la prima per id (provvisoria, p. es. può essere la pistola): si cambia dall'impianto.
- Stato: implementato e testato nelle funzioni pure (`tests/recipe_view.test.js`); schermata NON provata su telefono.
- Impianti iniziali (10/11/2026): una fabbrica di armi leggere e una di artiglieria per DEU, FRA, GBR, ITA (generatore `scripts/build-initial-industry.js`, tabella `EQUIP`; scorte ricalcolate con `npm run build:stocks`). URSS e Giappone (10/11/2026, da fonti web: ww2-weapons.com per l'URSS 1939, Wikipedia «Organization of the Imperial Japanese Army» tipo B per il Giappone, quantità PROVISIONAL, modelli non indicati) hanno un set di CSV in `data/units/source/` e template `divisione_*_1939.json` (validi dal 1939, non cambiano lo stato iniziale 1936). Stati Uniti (11/11/2026): scheda dell'utente sulla divisione triangolare T/O 70 del 1 novembre 1940 (FM 101-10), template `divisione_fanteria_usa_1940.json` (vale dal 1940-11, non cambia lo stato 1936); fucili 6.942, 36 mortai da 81, 60 anticarro da 37 (36 se si contano solo i reggimenti), 36 obici da 105, 12 da 155, 8 cannoni da 75; BAR e mitragliatrici .30/.50 senza totale (dato mancante); veicoli (~1.200, stima) NON inseriti; cavalli 0. La divisione «quadrata» del 1936 non è documentata. Fabbriche iniziali anche per gli USA (fucile e obice da 105 mm). `npm run validate:data` ora conosce le ricette generate (prima falliva per le fabbriche iniziali). I test costruiscono il catalogo con `tests/_equipment_recipes.js`.
- Mancano ancora: efficienza/collo di bottiglia per impianto (non salvata nello stato), carri e veicoli (dati mancanti), prezzo dei pezzi da decidere.

## Cosa resta da fare (in ordine di proposta)
1. Albero di comando reale nello stile del mockup B (nella scheda o nel pannello comando).
2. Riepilogo: forza materiale (non mostrata perché il dato medio non è affidabile).
3. Avanzamento delle formazioni in corso nel pannello (quanto manca alla fine).
4. ~~Pulsante «aggiungi a un comando esistente»~~ Correzione: il pannello **Comando** aveva già «Aggiungi a…», «Aggiungi unità…» e «Scollega» (il punto era scritto male). Mancava nella scheda della divisione: ora c'è (vedi «Pubblicato su main il 08/11/2026»). Resta da vedere se il pulsante «Comando» in alto sia raggiungibile su telefono: nello screenshot del 07/11 era sovrapposto a «Teatro».
5. Stato maggiore con personale e dotazione del comando (oggi il template non ha effetti).
6. Unificare le azioni di comando in un unico pannello (oggi sono in tre posti: pannello Comando, scheda del corpo, scheda della divisione).
7. Libreria di simboli NATO completa (oggi semplificata; da verificare con lo standard).
8. Verifica su telefono (360 e 390 px) di tutta la scheda e dei pannelli: mai fatta. **Difetti già visti negli screenshot dell'utente (07/11)**: la barra in basso è tagliata («Coman…»), i titoli vanno a capo su tre righe, il pannello copre metà schermo, i pulsanti «Comando» e «Teatro» in alto si sovrappongono. **È la prima cosa da fare con `vite` installato.**
9. Navi e aerei: più avanti, con le loro fabbriche e i loro consumi.
10. Comunicazioni e combattimento: il combattimento urbano è approvato come bilanciamento; non testato in una partita reale.
11. Scala dell'addestramento e numeri dei comandi: approvazione da confermare.

## Limiti noti
- Nessuna verifica nel browser delle schermate nuove: le prove sono su logica e build.
- Mappa: i segnalini sovrapposti in una stessa provincia non sono gestiti.
- Il registro non modifica le liste costruite dal catalogo che non passano da `unitsList`: controllare ogni nuova lista che usa `units`.

## Dove sta il codice
- Regole: `src/rules/` (`unitRegistry`, `commandFormation`, `commandDistance`, `commandSummary`, `hqPosition`, `militaryReserve`, `unitSheet`, `unitInfo`, `divisionCondition`).
- Stato e migrazioni: `src/game/` (`state.js`, `save.js`, `unitRegistryState.js`, `commandDistanceState.js`, `conditionState.js`).
- Interfaccia: `src/App.jsx`, `src/ui/` (`UnitSheet`, `UnitSections`, `NatoSymbol`, `CommandPanel`, `CommandSummary`, `ProvincePanel`).
- Dati: `data/units/` (catalogo, template, `condition_config.json`, `command_templates.json`), `data/military/ammo_consumption.json`, `data/industry/`.
- Documentazione: `docs/CONTRATTO_DATI_UNITA.md` (fase 1), `docs/DA_FARE.md` (decisioni e lavori aperti), questo file.
- Note di audit della scheda (fuori dal repository): `/tmp/claude-0/-home-user-grandstrategywwii/38e80d11-0ef1-5d85-83bf-fd95ed44e519/scratchpad/audit_fase0_scheda_unita.md`.
## Combattimento: terreno e fortificazioni (13/11/2026)
- **Correzione**: il combattimento terrestre v1 esisteva già (`src/rules/combat.js`, urbano, ritirata, IA di guerra, trinceramento). Mancava che terreno, fortificazioni e fiumi incidessero sull'esito: `ctx.defenseMultiplier` esisteva ma non era collegato.
- **Fatto, implementato e testato** (`tests/defense_modifiers.test.js`, 6 test): `data/combat/defense_modifiers.json` (schema `defense-modifiers-v1`, **tutti i numeri sono ipotesi di bilanciamento da approvare**: terreno pianura/deserto/tundra 1, collina 1,15, foresta 1,2, palude 1,25, montagna 1,4; fortificazioni livello 0-3 = 1 / 1,15 / 1,35 / 1,6; prodotto con tetto 2,5), `src/rules/defenseModifiers.js` (validazione, `defenseMultiplier`, `createDefenseMultiplier`), `data/combat/terrain_class.json` (classe di terreno per provincia, generata da `data/terrain.json` con `scripts/build-terrain-class.js`; test di coerenza con l'originale), collegamento in `src/game/theaterState.js` (`ctx.defenseMultiplier(provincia, stato, rete)`) e in `src/App.jsx`. Le zone urbane valgono 1 (regole proprie). Terreno o livello sconosciuto = 1. Il bonus è distinto dal trinceramento e si moltiplica con esso nella potenza dei difensori.
- **Effetto sulla Maginot**: le 4 province a livello 3 pesano almeno 1,6× per chi difende.
- **Non verificato**: resa in gioco e bilanciamento su una partita reale; `vite build` (solo CI). Il livello di fortificazione è letto dal file statico `province_presence.json`, non dallo stato di partita (nessuna costruzione o distruzione di fortificazioni).
- **Ancora mancante nel combattimento**: fiume forzato: **implementato e testato** solo come bonus del primo giorno di assalto (×1,3 IPOTESI, proporzionale alla quota di attaccanti arrivati dall'altra sponda della stessa provincia; annullato se fra le due sponde c'è un ponte del grafo `data/links.json`, 2773 coppie, ipotesi; i 9 attraversamenti curati di `crossings.json` sono stati eliminati); **stato dei ponti (13/11/2026) implementato e testato come regole, azioni e pannello del posto selezionato (nessun disegno sulla mappa), usato dall'IA con regole semplici (`aiBridges.js`, ipotesi, testato su rete sintetica); 104 ponti ipotetici inferiti per i fiumi principali senza ponti nei dati (`data/bridges_inferred.json`)**: `state.bridges` (integro/distrutto/in ripristino), `src/rules/bridges.js`, `src/game/bridgeState.js` (`playerDestroyBridge`, `playerRepairBridge` richiedono un'unità propria su una sponda; nessun genio/risorse), tempi di ripristino IPOTESI in `data/combat/bridges.json` (10/25/50 giorni); fiume PRINCIPALE con tutti i ponti inagibili = passo impossibile (movimento e marce in corso), fiume minore = si forza con il bonus ai difensori; coppie senza ponti nei dati = si forzano (lacuna dei dati); un ponte distrutto blocca l'intera coppia di province anche se il confine non è tutto fiume; mancano guadi/gelo/piene, genio e fiumi fra province diverse; rifornimenti e munizioni, morale ed esperienza, comandanti, morti/feriti/dispersi separati, perdita di equipaggiamento, supporto aereo e d'artiglieria, pace.

