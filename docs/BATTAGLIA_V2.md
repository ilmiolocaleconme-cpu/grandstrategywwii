# Battaglia terrestre v2 (16/11/2026, branch `test`)

Stato: **implementata e testata nelle regole e nel sistema giornaliero** (`tests/battle_v2.test.js`, 30 test); **non verificata** con `vite build`, nel browser, su telefono e offline (compilazione di prova con esbuild riuscita). **Tutti i numeri sono ipotesi di bilanciamento di Claude, da approvare**: `data/units/battle_v2.json` (ogni blocco ha il suo `rationale`).

File: `src/rules/battleV2.js` (regole pure), `src/game/theaterState.js` (`prepareV2`, `battlePhase`, `cohesionPhase`), `src/game/casualtyState.js` (ospedali), `src/game/theaterPlan.js` (stima dei piani), `src/App.jsx` (`BATTLE_V2_CTX`). Si accende con `ctx.battleCfg`: senza, vale la battaglia v1 (i test v1 restano invariati).

## Cosa fa
1. **Potenza di fuoco dalle armi.** Ogni pezzo effettivo dà attacco contro fanteria (soft) e contro corazzati (hard); la potenza contro un nemico con quota corazzata H è soft × (1 − H) + hard × H. Sostituisce uomini × categoria × dotazione. Scala: fanteria tedesca 1936 al completo ≈ i suoi uomini. Buchi dei template (fucili o mitragliatrici senza quantità) colmati con valori medi per uomo; divisione senza nessuna quantità nota = regola v1.
2. **Coesione** (`state.cohesion`, 0–100, assente = 100). Cala in linea secondo la pressione nemica, frenata da morale, esperienza, comandante sopra la divisione, difesa e trincea. La parte cede a coesione media ≤ 20 (o sotto il 25% degli uomini). Pesa sulla potenza (60–100%). Si recupera fuori dalla battaglia.
3. **Larghezza del fronte.** Divisioni in linea per parte secondo il terreno (8 pianura … 4 montagna, 3 città); le altre in riserva, senza perdite.
4. **Munizioni e carburante.** Le divisioni in linea consumano dalle scorte nazionali (`munitions`, `fuel`); la copertura riduce artiglieria (fino al 20%), armi leggere (60%), mezzi (40%).
5. **Perdite divise.** Morti 22%, feriti 66%, dispersi 12%; prigionieri in ritirata (3% + fino all'8% per l'inseguimento di truppe mobili); resa di chi cede senza via di ritirata. Registro `state.casualties`; i feriti passano dagli ospedali (guariti al pool); morti, dispersi, prigionieri e ricoverati escono dal pool reclutabile.
6. **Fasi e contesto.** Preparazione d'artiglieria il primo giorno (+50% all'artiglieria dell'attaccante); inseguimento; stagione (inverno a nord, fango a est) per data e posizione; comandante = bonus di tenuta. Perdite giornaliere ridotte all'1% (tetto 2,5%).

## Aggiunte del 17/11/2026
- **Calibro e tipo di carro.** Dove il catalogo dà il calibro, mortai, cannoni, obici e anticarro pesano per fascia (`firepower.byCaliber`); i carri per ruolo (`firepower.tankRoles`: tankette 12/3 … pesante 80/80), con una corazza relativa che scala la quota corazzata della divisione. Senza dato vale il peso medio della categoria.
- **Morale ed esperienza si muovono** (`condition`): esperienza +0,15 per giorno in linea (tetto 90); morale +3 a chi vince, −5 a chi si ritira, −1 nei giorni con oltre il 2% di perdite; a riposo risale di 0,5 al giorno fino al valore di partenza della nazione. Scritti in `state.conditions`, come le altre regole di condizione.
- **Chi difende** perde il 20% in meno di coesione: a forze pari cede prima chi attacca.

## Panzer tedeschi (17/11/2026)
- **Le Panzer-Division non combattevano**: il template del 1936 aveva solo i 416 carri, senza uomini, e la battaglia scarta le divisioni senza uomini. Ora il template ha uomini (11.800), armi leggere (9.000), mitragliatrici (420), 24 obici da 105, 48 anticarro da 37 mm e 45 mortai: **stime di Claude** (reliability ESTIMATED), struttura e 416 carri restano quelli dell'utente.
- **Ogni Panzer ha il suo peso** (`firepower.tankModels`): Panzer I 18/2 corazza 0,4; Panzer II 25/10 0,5; Panzer III 40/50 1; Panzer IV 65/45 1,05; Panther 70/95 1,5; Tiger I 85/100 1,6; Tiger II 90/120 1,9.
- **I carri prodotti restano registrati per modello** dentro la voce «carri» (`models`, in `src/rules/reinforcements.js`); i pezzi persi si tolgono in proporzione.
- **La dotazione iniziale** (carri mai tracciati) segue il parco tedesco dell'anno di nascita della divisione (`firepower.fleetMix`): 1936 solo Panzer I; 1939 45% I, 40% II, 5% III, 10% IV; 1941 20% II, 50% III, 30% IV; 1944 50% IV, 40% Panther, 10% Tiger. Quote a memoria, non verificate. Carri cechi (Pz 35(t), 38(t)) assenti dal catalogo.
- Esiti simulati (Panzer-Division contro 1 divisione): fanteria FRA 11 giorni (parco 1936), 6 giorni (1940); corazzata FRA 8 giorni; corazzata URSS respinta nel 1941, vittoria nel 1943.

## Confronto su battaglie tipo (template reali, morale 70, esperienza 45)
| Scontro | v1 | v2 |
|---|---|---|
| 1 DEU contro 1 FRA, pianura | 60+ giorni, −66% / −74% | 10 giorni, difensori in ritirata, −8% / −15% |
| 1 DEU contro 1 FRA trincerata | — | 8 giorni, attaccanti respinti, −14% / −6% |
| 3 DEU contro 1 FRA, pianura | 1 giorno, −1% / −6% | 5 giorni, −1% / −15% |
| 3 DEU contro 1 FRA trincerata in montagna | 24 giorni, −23% / −61% | 15 giorni, −9% / −25% |
| 1 corazzata URSS contro 1 fanteria DEU | 43 giorni, −43% / −76% | 5 giorni, −2% / −22% (1.667 prigionieri) |
| 2 ITA contro 1 FRA in montagna | 56 giorni, vince chi attacca, −61% / −75% | 8 giorni, attaccanti respinti, −13% / −6% |
| 2 GIA contro 1 URSS, pianura | 8 giorni, vince chi attacca | 11 giorni, attaccanti respinti, −12% / −12% |

## Limiti dichiarati
- Voci aggregate (artiglieria britannica) = peso medio. I carri delle ricette generiche (`tanks`, senza modello) contano secondo il parco dell'anno di nascita della divisione.
- Morale ed esperienza: i numeri sono ipotesi di Claude sulle regole qualitative dell'utente; mancano rimpiazzi inesperti, morte o cattura dei comandanti, prestigio nazionale. Gli ufficiali non hanno un valore: conta solo averne uno.
- Munizioni e carburante: consumo solo in battaglia; nessuna rete logistica (la scorta nazionale arriva ovunque).
- Stagione: regola per data e posizione, non meteo. Ponti distrutti, aviazione e artiglieria di corpo d'armata non modellati.
- Guarigione dei feriti senza posto in ospedale (1% al giorno): ipotesi di Claude, senza la quale una nazione senza ospedali perderebbe tutti i feriti.
- Template incompleti (Francia 1936, URSS 1936, corazzata tedesca 1936 senza uomini): restano alla regola v1.
- Interfaccia: solo il registro delle battaglie e l'etichetta «Coesione» nel pannello Esercito; nessuna schermata delle perdite.
