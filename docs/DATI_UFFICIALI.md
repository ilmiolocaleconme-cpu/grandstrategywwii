# Ufficiali e comandanti (28/10/2026)

Stato: **implementato e testato (dati, validazione, regola dei comandanti, 9 test in `tests/officers.test.js`)**; **mancante**: interfaccia (scheda ufficiale, pulsanti assegna/confronta), integrazione nei salvataggi, valori della scheda (offensiva, difesa, logistica...), comandanti di divisione e di comandi superiori.

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

## Limiti noti
- Al 1/1/1936 l'automatico schiera solo 2 comandi su 13 (I. Armeekorps ← Witzleben; Armata del Kwantung ← Minami): il CSV non ha altri ufficiali di corpo/armata disponibili in quella data. Per avere comandanti al via servono altri ufficiali o le scelte del giocatore.
- Witzleben al I. Armeekorps e Minami al Kwantung vengono dal CSV, non da una verifica: schieramento di prova.
- Aeronautica e marina: gli ufficiali (74) sono nel catalogo ma non comandano nulla (mancano i sistemi aereo e navale).
- I valori 0–100 della scheda non sono nel CSV e non sono stati inventati.
