# Battaglia terrestre v2 (16/11/2026, branch `test`)

Stato: **implementata e testata nelle regole e nel sistema giornaliero** (`tests/battle_v2.test.js`, 24 test); **non verificata** con `vite build`, nel browser, su telefono e offline (compilazione di prova con esbuild riuscita). **Tutti i numeri sono ipotesi di bilanciamento di Claude, da approvare**: `data/units/battle_v2.json` (ogni blocco ha il suo `rationale`).

File: `src/rules/battleV2.js` (regole pure), `src/game/theaterState.js` (`prepareV2`, `battlePhase`, `cohesionPhase`), `src/game/casualtyState.js` (ospedali), `src/game/theaterPlan.js` (stima dei piani), `src/App.jsx` (`BATTLE_V2_CTX`). Si accende con `ctx.battleCfg`: senza, vale la battaglia v1 (i test v1 restano invariati).

## Cosa fa
1. **Potenza di fuoco dalle armi.** Ogni pezzo effettivo dà attacco contro fanteria (soft) e contro corazzati (hard); la potenza contro un nemico con quota corazzata H è soft × (1 − H) + hard × H. Sostituisce uomini × categoria × dotazione. Scala: fanteria tedesca 1936 al completo ≈ i suoi uomini. Buchi dei template (fucili o mitragliatrici senza quantità) colmati con valori medi per uomo; divisione senza nessuna quantità nota = regola v1.
2. **Coesione** (`state.cohesion`, 0–100, assente = 100). Cala in linea secondo la pressione nemica, frenata da morale, esperienza, comandante sopra la divisione, difesa e trincea. La parte cede a coesione media ≤ 20 (o sotto il 25% degli uomini). Pesa sulla potenza (60–100%). Si recupera fuori dalla battaglia.
3. **Larghezza del fronte.** Divisioni in linea per parte secondo il terreno (8 pianura … 4 montagna, 3 città); le altre in riserva, senza perdite.
4. **Munizioni e carburante.** Le divisioni in linea consumano dalle scorte nazionali (`munitions`, `fuel`); la copertura riduce artiglieria (fino al 20%), armi leggere (60%), mezzi (40%).
5. **Perdite divise.** Morti 22%, feriti 66%, dispersi 12%; prigionieri in ritirata (3% + fino all'8% per l'inseguimento di truppe mobili); resa di chi cede senza via di ritirata. Registro `state.casualties`; i feriti passano dagli ospedali (guariti al pool); morti, dispersi, prigionieri e ricoverati escono dal pool reclutabile.
6. **Fasi e contesto.** Preparazione d'artiglieria il primo giorno (+50% all'artiglieria dell'attaccante); inseguimento; stagione (inverno a nord, fango a est) per data e posizione; comandante = bonus di tenuta. Perdite giornaliere ridotte all'1% (tetto 2,5%).

## Confronto su battaglie tipo (template reali, morale 70, esperienza 45)
| Scontro | v1 | v2 |
|---|---|---|
| 1 DEU contro 1 FRA, pianura | 60+ giorni, −66% / −74% | 9 giorni, difensori in ritirata, −6% / −14% |
| 3 DEU contro 1 FRA, pianura | 1 giorno, −1% / −6% | 5 giorni, −1% / −15% |
| 3 DEU contro 1 FRA trincerata in montagna | 24 giorni, −23% / −61% | 14 giorni, −7% / −26% |
| 1 corazzata URSS contro 1 fanteria DEU | 43 giorni, −43% / −76% | 5 giorni, −2% / −22% (1.667 prigionieri) |
| 2 ITA contro 1 FRA in montagna | 56 giorni, vince chi attacca, −61% / −75% | 10 giorni, attaccanti respinti, −12% / −10% |

## Limiti dichiarati
- Pesi per CATEGORIA d'arma: Panzer I e Panzer IV valgono uguale; nessuna differenza fra calibri.
- Morale ed esperienza si leggono soltanto: crescita e calo restano da decidere (`docs/DA_FARE.md`, A.2–A.4). Gli ufficiali non hanno un valore: conta solo averne uno.
- Munizioni e carburante: consumo solo in battaglia; nessuna rete logistica (la scorta nazionale arriva ovunque).
- Stagione: regola per data e posizione, non meteo. Ponti distrutti, aviazione e artiglieria di corpo d'armata non modellati.
- Guarigione dei feriti senza posto in ospedale (1% al giorno): ipotesi di Claude, senza la quale una nazione senza ospedali perderebbe tutti i feriti.
- Template incompleti (Francia 1936, URSS 1936, corazzata tedesca 1936 senza uomini): restano alla regola v1.
- Interfaccia: solo il registro delle battaglie e l'etichetta «Coesione» nel pannello Esercito; nessuna schermata delle perdite.
