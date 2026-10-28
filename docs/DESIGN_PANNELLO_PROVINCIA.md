# Pannello Provincia (28/10/2026)

Il pannello è il punto da cui il giocatore legge il territorio. Regola di fondo: **una sola fonte per ogni dato**, riferimenti tramite id,
stato dinamico separato dai dati storici. Il pannello **non contiene formule di gioco**: mostra fatti e stati derivati in modo trasparente;
dove il dato manca scrive «n/d», non un valore inventato.

## Livelli di dati
| Livello | Dove | Contenuto |
|---|---|---|
| Geografia (esistente) | `data/provinces/`, `terrain.json`, `regions.json`, `links.json` | geometria, terreno, regione, collegamenti: **non modificati** |
| Dati per provincia (nuovo) | `data/population/`, `data/agriculture/`, `data/military/province_presence.json` | un file per tema, chiave = id provincia **madre**, schema versionato, qualità dichiarata |
| Stato di partita (nuovo) | `state.provinces` (`src/game/provinceState.js`) | mappa **sparsa**: solo i campi diversi dal default; assente = default |
| Vista (nuovo) | `src/rules/provinceView.js` | funzione pura che assembla i tre livelli per il pannello |

I tre file per provincia sono **volutamente vuoti** (`quality: MISSING_DATA`): nel repository non esiste una popolazione, un potenziale
agricolo o una presenza militare per provincia. Il contratto è pronto e validato (`npm run validate:data`); i valori si aggiungono con una
fonte dichiarata (`USER_ESTIMATE`) o come stima di design (`DESIGN_DEFAULT`). Le produzioni (cibo, frumento) **non si salvano**: si calcoleranno.

## Campi dei file per provincia
- **Popolazione**: `population`, `workforce` (≤ population), `growthPerYear` (−0,1…0,1).
- **Agricoltura**: `potential` (0–10), `wheatShare` (0–1). Il frumento non è esclusivo di alcune province: ogni provincia può avere un potenziale.
- **Presenza militare**: `garrison`, `hq`, `fortifications`, `antiAir`, `radar` (0–3), `installations` (id `structure_id` del Pack). Solo PRESENZA: le unità restano nel sistema esercito.
- Ogni voce può avere `quality` (`USER_ESTIMATE`, `DESIGN_DEFAULT`, `reference`, `MISSING_DATA`). Campi sconosciuti o fuori limite = errore.

## Stato dinamico (`state.provinces[idMadre]`)
`controller` (null = segue la nazione), `occupation` (`none`/`occupied`/`contested`), `stability`, `resistance`, `damage`, `bombing`,
`infrastructureDamage` (0–1), `powerShortage`, `workforceShortage`, `resourceShortage`, `isolated`, `logisticProblems`, `weatherEffects`,
`combatEffects`, `events`. Il campo è **facoltativo**: i salvataggi vecchi restano validi, quindi `STATE_SCHEMA` non cambia.
`patchProvinceState` è pura e rifiuta campi o valori non validi. **Proprietà ≠ controllo ≠ occupazione**: un protettorato ha controller diverso
dal proprietario senza essere occupato; l'occupazione è un flag esplicito.

## Cosa deriva da dati esistenti (nessuna rete nuova)
- **Logistica**: conteggio dei tratti di `links.json` fra province madri diverse (ferrovia / strade). Stato: `isolated` se senza tratti o segnata,
  `strained` se infrastrutture danneggiate o bombardamenti, `excellent` con ferrovia e ≥ 2 tratti, altrimenti `normal`. **Nessun punteggio 0–100**:
  sarebbe una formula arbitraria.
- **Energia**: solo l'idroelettrico di `hydro_plants.json` per provincia madre; il pool in MW resta per nazione (`rules/production.js`).
- **Slot industriali**: 14 per provincia, 10 per zona urbana (`rules/slots.js`).
- **Ponti e guadi**: restano in `crossings.json`; il pannello rimanda lì.

## Interfaccia (mobile-first)
Intestazione sempre visibile (nome, proprietario, controllo, stato, 5 indicatori) → avviso dinamico → schede espandibili (`<details>`, area
di tocco ≥ 44 px). Livello A: Panoramica (aperta). Livello B: Militare, Logistica, Economia, Infrastrutture. Livello C: Popolazione,
Occupazione, Dati e fonti (le informazioni geografiche di prima: validità, fonte, licenza, limiti noti). Ogni scheda: titolo → stato →
indicatore principale → al massimo 4 metriche → modificatori → dettagli.
Priorità dinamica (solo ordine e apertura, i dati non cambiano): normale = Militare, Logistica, Economia; bombardata (danno ≥ 30 % o
bombardamenti) = avviso ⚠ Danni, poi Militare, Infrastrutture, Economia; isolata = avviso 🔴 Logistica, poi Logistica, Militare, Infrastrutture.

## Limiti noti
- Il pannello mostra la provincia **madre** per i dati per provincia, ma i collegamenti si leggono dal pezzo selezionato aggregato sulla madre.
- Non esiste ancora un sistema che scriva `state.provinces` (bombardamenti, occupazione): oggi la scheda reagisce solo se lo stato è valorizzato
  (testato con stati sintetici).
- Non verificati: `vite build` e `check-precache` (Vite non installabile in questo ambiente), peso dei nuovi file sul telefono, resa a 360×640.
