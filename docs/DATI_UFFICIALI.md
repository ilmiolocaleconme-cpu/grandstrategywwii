# Ufficiali e comandanti (28/10/2026)

Stato: **implementato e testato con test mirati (dati, validazione, regola dei comandanti, salvataggio schema 4: 14 test in `tests/officers.test.js`, tutti passati)**; **non collegato** all'interfaccia né a `GAME_SYSTEMS` di App.jsx; suite completa, build e offline **non eseguiti** dopo il cambio di schema; **mancante**: interfaccia (scheda ufficiale, pulsanti assegna/confronta), valori della scheda (offensiva, difesa, logistica...), comandanti di divisione e di comandi superiori.

## File
- `data/officers/source/ufficiali_comando_1935_1945_master.csv` (copia non modificata, separatore `;`, 185 righe) e `template_card_ufficiale_ui.csv` (campi della scheda): sha256 in `officers.json`.
- `data/officers/officer_reviews.json`: Tovey OFF-0111 duplicato di OFF-0110; dubbi su Stumme (Afrika-Korps), Rommel alla 7. Panzer dal 1935, Guderian (fine del ruolo), Gariboldi (10ª Armata). Un ufficiale dubbio non viene schierato in automatico.
- `data/officers/officers.json` (generato con `npm run build:officers`), `src/data/officers.js`, `src/rules/commanders.js`.
- Modello a due livelli: la persona compare in più righe (incarichi con id diversi, `personKey` = nome). Le date `1935-01-01` sono l'inizio della finestra, non una nomina (`dating: window_start`).
- I comandi del catalogo unità hanno ora `commandLevel` (corps, army, army_group, theater, district, high_command), ricavato da tipo e nome.

## Regola dei comandanti (decisa dall'utente il 28/10/2026)
Corpi d'armata e armate: **schierati in automatico, ma il giocatore può sempre scegliere chi comanda.**
- Automatico: ufficiale della stessa nazione, di terra, disponibile alla data, con quel livello nel profilo; preferisce chi ha la stessa formazione nel CSV; gli ufficiali SS comandano in automatico solo comandi SS. Non tocca mai una scelta del giocatore; sostituisce un automatico quando l'ufficiale non è più disponibile.
- Giocatore: può scegliere qualsiasi ufficiale di terra della propria nazione, anche non ancora disponibile o con livello diverso, con **avvisi** (data, dati dubbi, livello fuori profilo). Blocchi: nazione diversa, ufficiale non di terra, livello non gestito, id inesistenti.
- Un ufficiale comanda una formazione sola: sceglierlo altrove lo toglie dalla precedente. `releaseCommander` libera il comando (il successivo `autoAssign` lo riempie).

## Salvataggio (schema 4)
- `state.commanders = { schema: 'commanders-v1', assignments: { <idComando>: { officerId, mode: 'auto'|'player', since } } }`. Migrazione 3→4 in `src/game/save.js` (aggiunge uno stato vuoto); i salvataggi vecchi non si perdono.
- `src/game/commandersState.js`: `commandersSystem({units, officers, fallback})` (sistema giornaliero puro, deterministico, riproducibile dal salvataggio), `playerAssignCommander`, `playerReleaseCommander`, `validateCommandersShape`, `migrateV3toV4`.
- Prudenza dell'automatico (`fallback: 'dated'`, default): senza ufficiale della stessa formazione usa solo ufficiali con data di disponibilità vera; le date di comodo 1935-01-01 non bastano. `fallback: 'any'` le accetta (scelta non storica).
- Sullo stato `newGame` il sistema **non è ancora registrato** in `GAME_SYSTEMS`: oggi i comandanti si schierano solo se si chiama il sistema esplicitamente (test).

## Limiti noti
- Al 1/1/1936 l'automatico (default) schiera 1 comando su 13: Armata del Kwantung ← Minami (stessa formazione nel CSV; disponibile fino al 1/1/1936, dal 2/1/1936 resta libero). Con `fallback: 'any'` anche I. Armeekorps ← Witzleben. Per avere comandanti al via servono altri ufficiali o le scelte del giocatore.
- Gli abbinamenti vengono dal CSV, non da una verifica storica: schieramento di prova.
- Aeronautica e marina: gli ufficiali (74) sono nel catalogo ma non comandano nulla (mancano i sistemi aereo e navale).
- I valori 0–100 della scheda non sono nel CSV e non sono stati inventati.
