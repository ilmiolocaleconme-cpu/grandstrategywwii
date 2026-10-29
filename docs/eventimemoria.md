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
| EVT-ESP-GC | Inizio della guerra civile spagnola | luglio 1936 | Divide il controllo del territorio spagnolo (non è nei dati del 1/1/1936) | `data/provinces/ESP.json`, `docs/DATI_PROVINCE.md` (colori dell'immagine spagnola) | da-fare; giorno e regole di divisione da definire |
| EVT-SAU-OIL | Primo pozzo petrolifero produttivo in Arabia Saudita (Dammam n. 7) | inizio 1938 | Il giacimento saudita parte con produzione 0 al 1936 e si attiva con l'evento | `data/resources/resource_locations.csv` (RL-0040, riferimento 1939), `location_notes.csv`; il paese non ha ancora province nel repository | da-fare; data dall'utente (29/10/2026), il valore «21000 barili/giorno» non è verificato |

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
