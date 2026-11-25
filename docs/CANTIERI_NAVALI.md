# Cantieri navali: scali ed esperienza

Decisioni dell'utente del 25/11/2026. I numeri sono valori di bilanciamento proposti da Claude (DESIGN_DEFAULT), non dati storici.

## Regola generale

- Ogni cantiere può costruire **qualsiasi tipologia** di nave, purché il dislocamento standard non superi il limite del suo **livello di scalo**.
- Lo scalo si **potenzia** un livello alla volta, come i porti (ordine di costruzione `{ kind: 'slipway', cittaId }`).
- Un cantiere che costruisce sempre la stessa tipologia guadagna **esperienza** e diventa più veloce. L'esperienza riduce **solo i giorni di costruzione**: materiali e caratteristiche della nave non cambiano (scelta A). La qualità delle navi dipende dalla ricerca.

## Livelli di scalo (`data/naval/slipway_levels.json`)

| Livello | Nome | Dislocamento massimo | Per raggiungerlo |
|---|---|---|---|
| 1 | Scalo piccolo | 3.000 t | viene con il cantiere |
| 2 | Scalo medio | 15.000 t | 120 ECV, 120 giorni, 400 lavoratori |
| 3 | Scalo grande | 38.000 t | 260 ECV, 240 giorni, 800 lavoratori |
| 4 | Scalo per grandi corazzate | nessun limite | 450 ECV, 365 giorni, 1.200 lavoratori |

L'acciaio è ECV × `economy.construction.steelPerEcv`; la difficoltà scala costo e tempo, come per i porti.

Livelli iniziali del 1936 (`slipway` in `data/naval/shipyards_1936.json`):
- **4**: Genova, Trieste, Kure, Nagasaki, Yokosuka, Amburgo, Wilhelmshaven, New York, Filadelfia, Norfolk, Leningrado, Nikolaev.
- **3**: Kiel, Brest, Saint-Nazaire, Glasgow, Newcastle, Belfast, Boston, Portsmouth, Plymouth.
- **1**: nazioni minori (Gdynia, Malmö, Göteborg, Rotterdam, Amsterdam, Anversa, Danzica).
- **2**: tutti gli altri.

Lo scalo sta sulla città costiera: alla conquista passa con il suo livello. Un cantiere costruito in partita (`FCT-SHIPYARD`) in una provincia senza cantieri storici dà uno scalo di livello 1 sulla prima città costiera della provincia.

## Esperienza (da implementare con la produzione navale)

Si riusa la curva delle fabbriche (`data/industry/production_experience.json`), applicata ai giorni invece che ai pezzi: giorni = giorni base ÷ fattore.

- Contatore per **cantiere e tipologia** (corazzata, portaerei, incrociatore, cacciatorpediniere, sommergibile, scorta): cresce solo nei giorni in cui il cantiere lavora a quella tipologia.
- Fattore 0,6 a 0 giorni → 1,0 a un anno → 1,2 a due anni: prima nave circa 1,7 × il tempo base, dopo due anni circa 0,83 ×.
- Passare a un'altra tipologia azzera l'esperienza; una tipologia vicina (es. incrociatore ↔ cacciatorpediniere) ne conserva metà, come la «stessa catena» delle fabbriche.

## Stato

- **Implementato e testato** (`tests/shipyard_slipways.test.js`): livelli di scalo, livelli iniziali, potenziamento (ordine, costo, completamento, salvataggio), pannello «Cantieri navali» nella scheda della provincia.
- **Mancante**: catalogo delle navi, produzione navale, limite di tonnellaggio applicato alle costruzioni, esperienza dei cantieri. Oggi il livello di scalo non limita ancora nulla perché nessun cantiere costruisce navi.
