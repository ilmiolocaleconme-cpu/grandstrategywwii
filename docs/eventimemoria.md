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

Contesto ESP (nessun effetto di gioco): le due fazioni sono Repubblica (Seconda Repubblica Spagnola) e nazionalisti guidati da Franco; sostegno militare esterno indicato nella schermata: Italia, Germania e Portogallo ai nazionalisti. La schermata è troncata: il resto (aiuti alla Repubblica) non è stato letto.

Contesto SAU (nessun effetto di gioco): concessione alla SOCAL nel 1933, prospezioni a Dhahran dal 1935, nel 1936 joint venture Caltex con Texaco (indicazioni dell'utente, 29/10/2026).

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

