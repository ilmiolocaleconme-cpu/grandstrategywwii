# Stato di implementazione

Aggiornato dopo il primo deploy (infrastruttura web). Legenda: **T** implementato e testato · **NT** implementato ma non testato · **P** parziale · **PR** prototipo · **S** simulato · **M** mancante.

| Area | Stato | Note |
|---|---|---|
| Validatore del catalogo dati (`src/data/validate.js`) | T | 30 test con `node --test` (23 su catalogo e dataset politico, 7 su province e geometria): id duplicati, campi mancanti, riferimenti, cicli di confluenze, dataset politico |
| Dati: nazioni (`data/nations.json`, 72 voci; MENG con `appearsLater`) | P | id, nome, nome locale, capitale (testo). Capitali in italiano, nome originale in `nameLocal`. Iran, Iraq e Nepal (non giocabili) non hanno voce. Ogni id esiste in `political_1936`; nessun legame con province |
| Dati: dataset politico 1/1/1936 (`data/political_1936.json`) | T | 163 entità (solo campi id, name, type, owner, controller, status, playable). Validato da `validateCatalog` (id, owner, controller, type, status, playable, riferimenti da `nations.json`) con test dedicati. Include 20 territori aggiunti dopo il brief (Hong Kong, Malta, Cipro, Gibilterra, Aden, Camerun e Togo francesi, Nauru, Nuova Guinea, Samoa Occidentali, Dodecaneso, Marocco, Guinea e Sahara spagnoli, Ifni, Groenlandia, Bhutan, Papua, Camerun e Togo britannici). Mengjiang è escluso: nasce per evento (vedi `docs/DESIGN_CONTROLLO_TERRITORIO.md`). Giocabilità e alcuni status sono scelte di design/storiche da rivedere. **Non ancora letto dalla mappa né dall'app** (`src/App.jsx` non lo carica); nessuna geometria |
| Dati: province al 1/1/1936 (`data/provinces_1936.json`, 68 province da OpenHistoricalMap, CC0) | P | Germania, Polonia, Austria, Belgio, Lussemburgo, 3 terre cecoslovacche. Validate (schema, owner, date, anelli) e testate (città note, sovrapposizioni entro soglia) in `tests/provinces.test.js`. Confini tutti `approximate`; poligoni costieri non ritagliati; Slovacchia mancante. **Non ancora letto dalla mappa né dall'app.** Dettagli in `docs/DATI_PROVINCE.md` |
| Regole fantocci / controllo territorio, evento di nascita di Mengjiang | M | Solo nota di design (`docs/DESIGN_CONTROLLO_TERRITORIO.md`); nessun sistema di eventi nel codice |
| Dati: risorse | PR | Bozza di design, non storica |
| Dati: fiumi e attraversamenti | P | Schema e regole di validazione presenti; **nessun dato reale**, file vuoti. Servono fonti geografiche verificabili e con licenza compatibile |
| Dipendenze (React 19, Vite 8, vite-plugin-pwa 2) | T | Installate da GitHub Actions (run riuscito, `package-lock.json` nel repository) |
| Build di produzione (`npm run build`) | T | Eseguita dalla CI (`.github/workflows/ci.yml`) insieme a test e validazione dati; manifest e `sw.js` presenti in `dist/` |
| App React minima (`src/App.jsx`): scelta nazione, stato dati | PR | Pubblicata su Vercel e aperta a mano su un telefono: le nazioni e lo stato dei dati compaiono. Nessun test automatico dell'interfaccia |
| PWA: manifest, precache, service worker (`vite.config.js`, `src/pwa.js`) | P | Offline **provato a mano** su un solo telefono (browser normale, modalità aereo): l'app si apre. Non provati: aggiornamento di versione, installazione come app, altri browser. Nessun test automatico. Icone in `public/icons/` segnaposto. In incognito non funziona, come previsto |
| Mappa, economia, commercio, unità, ricerca, diplomazia, prestiti, IA, salvataggi | M | |

## Comandi

- `npm test` — esegue i test (Node ^20.19 o >=22.12).
- `npm run validate:data` — valida i file in `data/`.
- `npm run dev` / `npm run build` / `npm run preview` — sviluppo, build e anteprima della build.
