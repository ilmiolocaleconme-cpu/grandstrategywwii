# Stato di implementazione

Aggiornato alla fase 2 (infrastruttura web). Legenda: **T** implementato e testato · **NT** implementato ma non testato · **P** parziale · **PR** prototipo · **S** simulato · **M** mancante.

| Area | Stato | Note |
|---|---|---|
| Validatore del catalogo dati (`src/data/validate.js`) | T | 13 test con `node --test`: id duplicati, campi mancanti, riferimenti, cicli di confluenze |
| Dati: nazioni (GER, ITA, JPN) | P | Solo id, nome, capitale come testo; nessun legame con province |
| Dati: risorse | PR | Bozza di design, non storica |
| Dati: fiumi e attraversamenti | P | Schema e regole di validazione presenti; **nessun dato reale**, file vuoti. Servono fonti geografiche verificabili e con licenza compatibile |
| Dipendenze (React 19, Vite 8, vite-plugin-pwa 2) | T | Installate da GitHub Actions (run riuscito, `package-lock.json` nel repository) |
| App React minima (`src/App.jsx`): scelta nazione, stato dati | NT | Scritta, **mai eseguita né compilata**: la verifica è affidata alla CI |
| PWA: manifest, precache, service worker (`vite.config.js`, `src/pwa.js`) | NT | Configurazione scritta, **funzionamento offline non verificato**. Le icone in `public/icons/` sono segnaposto |
| Mappa, economia, commercio, unità, ricerca, diplomazia, prestiti, IA, salvataggi | M | |

## Comandi

- `npm test` — esegue i test (Node ^20.19 o >=22.12).
- `npm run validate:data` — valida i file in `data/`.
- `npm run dev` / `npm run build` / `npm run preview` — sviluppo, build e anteprima della build.
