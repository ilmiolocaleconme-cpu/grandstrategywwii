# Eventi da fare più avanti (memoria)

**Stato: elenco di promemoria. Nessun sistema di eventi esiste nel codice** (verificato il 29/10/2026: `src/game` e `src/rules` non hanno eventi storici; i soli «eventi» del codice sono notifiche interne di comandanti e province). Questo file raccoglie gli eventi storici decisi o segnalati in chat, per modellarli quando si crea il sistema degli eventi.

## Come si usa
- Ogni chat che incontra un fatto storico che **non può stare nei dati iniziali del 1° gennaio 1936** lo aggiunge qui (id, data, effetto, dati coinvolti, stato). Non lo mette come dato iniziale falso.
- Una voce nasce `da-fare`; diventa `implementato` solo quando l'evento esiste nel codice, con test. Una data non verificata si scrive come `ipotesi`, mai come certa.
- Il file sta nel repository (`docs/`, branch `test`); le sessioni lo richiamano nel filo (`claude/filo/`).

## Eventi decisi dall'utente

| ID | Evento | Data | Effetto previsto | Dati coinvolti | Stato |
|---|---|---|---|---|---|
| EVT-MENG | Nascita di Mengjiang | 12/05/1936 | Crea l'entità `MENG` (fantoccio, controllore `JPN`) e le assegna il territorio ora cinese (Chahar e Suiyuan) | `nations.json` (`appearsLater: true`), `political_1936.json` (non presente), `docs/DESIGN_CONTROLLO_TERRITORIO.md` | da-fare; la data è nella nota di design (fonte indicata lì), le condizioni di innesco e le province no |
| EVT-ESP-GC | Inizio della guerra civile spagnola | **17/07/1936** (rivolta delle guarnigioni del Marocco spagnolo, Franco e Mola), esteso alla penisola il **18/07/1936**; innesco: assassinio di José Calvo Sotelo il 13/07/1936 | Divide il controllo del territorio spagnolo tra Repubblica e nazionalisti (non è nei dati del 1/1/1936) | `data/provinces/ESP.json`, `data/provinces/MAR_ES.json`, `docs/DATI_PROVINCE.md` (colori dell'immagine spagnola) | da-fare; date indicate dall'utente il 29/10/2026 (schermata di un riassunto con fonti Wikipedia e altre, non una fonte primaria); regole di divisione e province per fazione da definire |
| EVT-SAU-OIL | Primo pozzo petrolifero produttivo in Arabia Saudita (Dammam n. 7) | inizio 1938 | Il giacimento saudita parte con produzione 0 al 1936 e si attiva con l'evento | `data/resources/resource_locations.csv` (RL-0040, riferimento 1939), `location_notes.csv`; il paese non ha ancora province nel repository | da-fare; data dall'utente (29/10/2026), il valore «21000 barili/giorno» non è verificato |
| EVT-CSK-CARRI | La Germania acquisisce i carri cecoslovacchi LT vz. 35 e LT vz. 38 come Panzer 35(t) e 38(t) (occupazione della Cecoslovacchia) | **15/03/1939** (data indicata dall'utente il 29/10/2026) | **Il pool di carri cecoslovacchi passa alla Germania** (indicazione dell'utente): i carri escono dal pool CZE ed entrano in quello tedesco, senza duplicazioni; quantità = quelle possedute da CZE alla data (oggi non definite: la Cecoslovacchia non ha forze nei dati). I due modelli entrano nel catalogo dei carri tedeschi disponibili; lo scafo del 38(t) servirà più avanti per il cacciacarri Hetzer (non ancora catalogato) | `data/units/models/carri_tedeschi_1934_1945.json` (`eventModels`: MDL-DEU-PZ35T, MDL-DEU-PZ38T, `availability.date` = 1939-03-15), `political_1936.json` (CZE) | da-fare; indicazione dell'utente del 29/10/2026 («da aggiungere in futuro con un evento») |
| EVT-CSK-SUDETI | Annessione dei Sudeti alla Germania (Conferenza di Monaco) | **ottobre 1938** (indicazione dell'utente 29/10/2026); [Probabile] accordo firmato il 29-30/09/1938, occupazione dal 1° ottobre: giorno preciso da verificare | I territori di confine a maggioranza tedesca passano dalla Cecoslovacchia alla Germania | `data/provinces/CZE.json` (5 province: Slovacchia, Moravia-Slesia, Boemia sponda A e B, Rutenia subcarpatica: **i Sudeti non sono una provincia a sé**, confini attuali), `political_1936.json` (CZE) | da-fare; serve prima suddividere le province di Boemia e Moravia |
| EVT-CSK-ANNESSIONE | Annessione e smembramento della Cecoslovacchia: ingresso tedesco a Praga, creazione del Protettorato di Boemia e Moravia, Slovacchia repubblica indipendente sotto forte influenza nazista | **15/03/1939** (indicazione dell'utente 29/10/2026); il 14/03/1939 il presidente Emil Hácha, a Berlino, firma la capitolazione sotto la minaccia dei bombardamenti; occupazione senza resistenza | Cecoslovacchia (CZE) cessa; nascono il Protettorato di Boemia e Moravia (sotto la Germania) e la Slovacchia indipendente (influenza tedesca); innesca EVT-CSK-CARRI (stessa data) | `nations.json` e `political_1936.json`: nessuna voce per Protettorato e Slovacchia (da creare con `appearsLater`), `data/provinces/CZE.json` | da-fare; la Slovacchia indipendente e il protettorato non esistono nei dati |

Contesto ESP (nessun effetto di gioco): le due fazioni sono Repubblica (Seconda Repubblica Spagnola) e nazionalisti guidati da Franco; sostegno militare esterno indicato nella schermata: Italia, Germania e Portogallo ai nazionalisti. La schermata è troncata: il resto (aiuti alla Repubblica) non è stato letto.

Contesto SAU (nessun effetto di gioco): concessione alla SOCAL nel 1933, prospezioni a Dhahran dal 1935, nel 1936 joint venture Caltex con Texaco (indicazioni dell'utente, 29/10/2026).

## EVT-ESP-GC: decisioni dell'utente (29/10/2026)
- **Enclave: sì.** Le enclave si modellano per zona-città, senza spezzare la provincia.
- **Le città dentro le province vanno attribuite alle fazioni** per la Spagna: ogni città (zona con id proprio) ha la sua fazione, anche quando la provincia è dell'altro campo.
- **I ribelli compaiono come divisioni ribelli** al momento dell'evento: nascono come unità, non sono presenti prima del 17/07/1936.
- **Scelta del giocatore nel momento in cui scatta l'evento:** chi gioca la Spagna può scegliere se continuare con i repubblicani o passare a un'altra fazione spagnola (le parole dell'utente: «altra fazione spagnola»; quali fazioni siano giocabili oltre ai nazionalisti non è stato detto).
- Prima dell'evento la Spagna è una nazione sola (`ESP`, giocabile nella ruota delle nazioni, `playable: true`).

- **Fazioni giocabili (risposta dell'utente, 29/10/2026): nazionalisti e repubblicani.** Sono le due fazioni fra cui sceglie il giocatore all'evento.
- **Aiuti esteri: Italia, Germania e Unione Sovietica possono aiutare, ognuna una fazione.** Mappa ipotizzata da Claude (non detta dall'utente per nome): Italia e Germania con i nazionalisti, URSS con i repubblicani (coerente con la schermata, che cita Italia, Germania e Portogallo con i nazionalisti). «Possono aiutare» = è una scelta, non un automatismo.
- **Scatteranno eventi per le nazioni coinvolte** (interpretazione di Claude della frase «scatterà no eventi per le nazioni coinvolte», da confermare: se intendeva il contrario, cioè nessun evento, va corretto qui): un evento per ciascuna delle tre nazioni quando decide di aiutare.

| ID | Evento | Nazione | Fazione aiutata | Data | Stato |
|---|---|---|---|---|---|
| EVT-ESP-AIUTO-ITA | Aiuto italiano nella guerra civile spagnola | Italia | nazionalisti (ipotesi) | da definire | da-fare |
| EVT-ESP-AIUTO-DEU | Aiuto tedesco nella guerra civile spagnola | Germania | nazionalisti (ipotesi) | da definire | da-fare |
| EVT-ESP-AIUTO-URSS | Aiuto sovietico nella guerra civile spagnola | Unione Sovietica | repubblicani (ipotesi) | da definire | da-fare |

Cosa conta l'aiuto (denaro, merci, unità, volontari) e quando può partire non è stato deciso: nessun valore inventato. Legame col sistema già previsto di prestito di contingenti agli alleati (istruzioni del Progetto): da valutare, perché qui le fazioni non sono alleate formali.

Lacune verificate il 29/10/2026 (nessun dato inventato):
- Nel repository non esistono unità spagnole (`data/units`: nessuna riga `ESP` negli ordini di battaglia): le divisioni ribelli e quelle repubblicane non hanno ancora dati.
- Non esiste un'entità politica per i ribelli/nazionalisti: va definita (id, nome, tipo, controllore) con l'evento, come per `MENG`.
- Manca la tabella città per città (la bozza sotto è a livello di province).

## EVT-ESP-GC: bozza di assegnazione per fazione (29/10/2026, da una mappa fornita dall'utente)
**Stato: IPOTESI, lettura di una mappa schematica, non un dato.** La mappa mostra la Spagna all'inizio della guerra civile (fine luglio 1936), con due colori e quadratini nelle città; **non ha una legenda**: lettura per convenzione (beige = nazionalisti, rosa = repubblicani), da confermare. L'immagine non è stata copiata nel repository (licenza non nota). `docs/DATI_PROVINCE.md` annota che diverse province erano divise fra i due campi: per questo la tabella ha tre stati e non si assegna un valore secco a ogni sponda dei dati (le «sponde» del repository sono tagli lungo i fiumi, non fronti).

| Stato | Province (nomi dei dati) |
|---|---|
| Nazionalista | La Coruña, Lugo, Orense, Pontevedra, León, Zamora, Salamanca, Valladolid, Palencia, Burgos, Soria, Segovia, Ávila, Álava, Navarra, Logroño, Zaragoza, Huesca, Cáceres, Cádiz, Baleares (Maiorca e Ibiza; **Minorca repubblicana**), Canarie (La Palma repubblicana), protettorato del Marocco spagnolo |
| Repubblicano | Madrid, Guadalajara, Cuenca, Ciudad Real, Albacete, Jaén, Almería, Málaga, Murcia, Alicante, Valencia, Castellón, Tarragona, Barcelona, Gerona, Lérida, Badajoz, Huelva, Vizcaya, Guipúzcoa, Santander, Asturias, Minorca |
| Diviso o con enclave (decisione 29/10: sì, per città) | Sevilla (città e zona nazionaliste), Córdoba (la città è un'enclave nazionalista in provincia repubblicana), Granada (città nazionalista in provincia repubblicana), Teruel (città nazionalista, provincia contesa), Toledo (Alcázar assediato), Asturias (Oviedo nazionalista in provincia repubblicana), Gijón e El Ferrol come punti sulla mappa |

Da verificare e da decidere con l'utente:
- Badajoz e Huelva: la lettura dell'immagine li dà repubblicani; la loro caduta nelle settimane successive è un evento successivo, non iniziale.
- Le enclave sono mostrate sulla mappa come quadratini sulle città: le città del repository sono zone a sé (id proprio), quindi le enclave si modellano per zona senza spezzare la provincia (confermato dall'utente il 29/10/2026).
- Il sistema di eventi non esiste: nessun dato di gioco è stato modificato.

## Candidati da verificare (non sono eventi decisi)
Controllo del 29/10/2026 sui luoghi delle risorse. 93 gruppi di giacimenti hanno la prima riga di dati dopo il 1936, ma di solito è solo l'anno di riferimento della fonte (1937, 1938), non l'inizio del giacimento: **non vanno trattati come eventi**. Restano da verificare questi casi, dove l'avvio potrebbe essere davvero successivo al 1936:

| Voce | Perché | Certezza |
|---|---|---|
| Petrolio del Kuwait, Burgan (RL-0041, riferimento 1938) | Il campo di Burgan fu scoperto nel 1938 e la produzione commerciale è successiva (ricordo di Claude) | [Ipotesi] non verificato |
| Uranio in Belgio, Olen (RL-0196, riferimento 1940) | Da capire se l'attività esisteva già al 1936 | [Ipotesi] non verificato |
| Tungsteno negli USA, Idaho (RL-0139, riferimento 1943) | Possibile espansione bellica, non un avvio | [Ipotesi] non verificato |
| Tungsteno in Portogallo (RL-0123, 0124, 0125, 1938-1944) | Il boom bellico è un aumento di output, non un nuovo giacimento: si gestisce con il modello di estrazione, non con un evento | [Probabile] non verificato |

## Eventi che il sistema dovrà poter esprimere (requisiti emersi finora)
- Creare un'entità politica (Mengjiang) e spostare territorio da una nazione a un'altra.
- Cambiare il controllo di un territorio senza cambiarne la proprietà (guerra civile).
- Attivare un giacimento o un impianto a una data (petrolio saudita).
- Date certe nei dati, condizioni di innesco esplicite, nessun effetto casuale non riproducibile (il motore è deterministico: stesso stato, stesso risultato).
- Trasferire un pool di mezzi tra nazioni senza duplicarlo (carri cecoslovacchi → Germania, EVT-CSK-CARRI): i mezzi escono da una nazione ed entrano nell'altra.
- Rendere disponibile un modello (`eventModels` in `data/units/models/`) solo con un evento, mai per data.
- Attivare unità e leve successive al 1/1/1936 (indicazione dell'utente: per la Germania le nuove leve arrivano con eventi) e modificare la quota del pool di uomini (`src/rules/manpowerPool.js`: leggi, diplomazia, mobilitazione totale, età di leva): gli eventi sono la fonte dei modificatori; nessun evento reale è ancora definito.
- Smembrare una nazione in più entità (Cecoslovacchia → Protettorato di Boemia e Moravia + Slovacchia indipendente) e trasferire territorio e forze alla nazione annessionista; far scattare eventi collegati alla stessa data (EVT-CSK-ANNESSIONE → EVT-CSK-CARRI).

