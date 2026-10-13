# Stato di implementazione

Aggiornato alla fase 1. Legenda: **T** implementato e testato · **NT** implementato ma non testato · **P** parziale · **PR** prototipo · **S** simulato · **M** mancante.

| Area | Stato | Note |
|---|---|---|
| Validatore del catalogo dati (`src/data/validate.js`) | T | 13 test con `node --test`: id duplicati, campi mancanti, riferimenti, cicli di confluenze |
| Dati: nazioni (GER, ITA, JPN) | P | Solo id, nome, capitale come testo; nessun legame con province |
| Dati: risorse | PR | Bozza di design, non storica |
| Dati: fiumi e attraversamenti | P | Schema e regole di validazione presenti; **nessun dato reale**, file vuoti. Servono fonti geografiche verificabili e con licenza compatibile |
| Progetto React/Vite, PWA, service worker | M | Bloccato: npm non raggiungibile dall'ambiente di sviluppo usato |
| Mappa, economia, commercio, unità, ricerca, diplomazia, prestiti, IA, salvataggi | M | |

## Comandi

- `npm test` — esegue i test (richiede solo Node >= 20, nessuna dipendenza).
- `npm run validate:data` — valida i file in `data/`.
