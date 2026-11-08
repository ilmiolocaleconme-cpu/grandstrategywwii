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
- Non fatto: «priorità rinforzi» (il parametro `requests` di `planReinforcements` esiste ma non è collegato al sistema giornaliero) e la barra in alto riordinata («Livelli» e «Menu»).

**Stato maggiore (mockup)**
- Variante B scelta: albero a tutta larghezza, dettaglio sotto, barra in basso con etichette. Stile con cornici d'ottone e bagliore, senza copiare grafica di altri giochi.
- Mockup privato: https://claude.ai/artifact/RryWcLDUQ8WzeWACErfiHb (versione 3). Dati di esempio.

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
