# Fiumi, laghi e attraversamenti

Stato: **dati reali ma approssimati** (Natural Earth, corso moderno). Le regole di gioco sui fiumi (movimento, combattimento, rifornimenti, piene) **non sono ancora implementate**: qui c'è il terreno su cui costruirle.

## Dati

| File | Contenuto | Fonte e licenza |
|---|---|---|
| `data/rivers.json` | Catalogo: 215 fiumi (58 principali, 102 secondari, 55 affluenti) con classe, `flowsInto`, navigabilità, larghezza, lunghezza | Natural Earth 10m `rivers_lake_centerlines` + `rivers_europe` v5.0.0, pubblico dominio |
| `data/rivers_geo.json` | 332 tratti `LineString` (`riverId`, `segment`, `inLake`) | idem; Douglas-Peucker 0,002°, 4 decimali |
| `data/lakes.json` | 119 laghi (area ≥ 25 km² o con nome ≥ 8 km²) | Natural Earth 10m `lakes` + `lakes_europe`, pubblico dominio |
| `data/crossings.json` | **Vuoto**: ponti, guadi e traghetti non hanno ancora una fonte | — |

La mappa e le regole leggono gli stessi file (`src/map/geo.js`, `src/data/rivers.js`): nessuna discrepanza tra grafica e simulazione.

### Come sono stati derivati i campi

- **Un fiume = un gruppo di tratti con lo stesso Wikidata** (altrimenti lo stesso nome). I tratti di `rivers_europe` che ricalcano la linea centrale (≥ 70 % dei punti entro 0,02°) sono scartati per non avere doppioni; gli altri (per esempio l'alto corso) sono tenuti. I tratti senza nome né Wikidata (26) sono scartati: non sono identificabili.
- **`flowsInto` (confluenza)**: la direzione del disegno in Natural Earth non è affidabile, quindi si guardano gli estremi liberi di ogni fiume: se uno è entro 0,04° dalla linea di un fiume di importanza pari o maggiore (`scalerank`), quello è lo sbocco. Correzioni a mano (`flowsIntoBasis: curated`): delta del Reno (Waal e Lek → Meuse, Nederrijn → Lek, IJssel e Reno → mare), Mur → Drava → Danubio. Le altre sono `derived_from_geometry` (con `_uncertain` quando c'erano più candidati). **Non verificate una per una** oltre ai casi controllati dai test.
- **Classe**: `main` se non confluisce in nessun fiume dell'area, `secondary` se confluisce in un principale, `tributary` negli altri casi.
- **Navigabilità**: Natural Earth non la contiene. 19 fiumi sono segnati navigabili da un elenco curato **non verificato** (`navigableBasis: curated_unverified`: Reno e delta, Mosa, Mosella, Meno, Danubio, Elba, Oder, Vistola, Weser, Warta, Sava, Po, Tibisco, Senna, Daugava); tutti gli altri sono `unknown_assumed_false`. Non c'è profondità né tratto navigabile: va aggiunta da una fonte.
- **Larghezza**: solo una classe (`widthClass`) stimata dal `scalerank` (`widthBasis: proxy_from_natural_earth_scalerank`), non un valore in metri.

## Cosa c'è già nel codice

- `src/data/validate.js`: validazione di catalogo, grafo delle confluenze (nessun ciclo), tratti (fiume esistente, coordinate) e laghi.
- `src/data/rivers.js`: `buildRiverModel`, `distanceToRiverKm`, `riverProvinceCrossings` (dove un fiume passa da una provincia all'altra: sono i punti che richiederanno ponti, guadi o traghetti), `riverBorderGraph`, `downstreamChain`.
- Mappa: pulsante ≈ per mostrare/nascondere fiumi e laghi, tocco su un fiume per aprirne la scheda.
- `tests/rivers.test.js` (10 test) e un test in `tests/map.test.js`: validità, grafo, 14 città sulle rive entro 6 km, lunghezze entro il 15 %, attraversamenti sintetici e reali.

## Limiti da tenere presenti

- Corso **moderno**, non del 1936 (canalizzazioni, dighe e regolazioni successive non corrette); linea generalizzata a 1:10 milioni.
- Il poligono Natural Earth del Neusiedlersee è più piccolo del lago reale.
- I fiumi che **corrono lungo** un confine (Oder, Neisse, Reno in tratti) non producono eventi di attraversamento: oggi si rilevano solo i passaggi da una provincia a un'altra.
- Nessun dato su piene, gelo, disgelo, profondità, guadi, ponti e traghetti.

## Prossimi passi, in ordine di dipendenza

1. **Ponti, guadi e traghetti** (`data/crossings.json`). Schema già validato: `id`, `type` (`bridge_road`, `bridge_rail`, `ford`, `ferry`), `riverId`, `state` (`intact`, `damaged`, `destroyed`, `temporary`), `approximate`, `controller`. Mancano coordinate (non vanno inventate) e date di costruzione. Fonte da provare: OpenHistoricalMap (storica) con una richiesta Overpass che l'utente scarica dal telefono, come per le province:
   ```
   [out:json][timeout:180];
   (way["bridge"]["highway"~"motorway|trunk|primary|secondary|tertiary"](43.5,5.5,55.5,24.5);
    way["bridge"]["railway"="rail"](43.5,5.5,55.5,24.5););
   out tags geom;
   ```
   Poi filtrare per `start_date` ≤ 1936 e `end_date` > 1936; i ponti senza date restano `approximate` e non verificati. In alternativa OpenStreetMap con `start_date` < 1936 (dati moderni, più completi ma meno storici). Inventario prima, geometrie dopo (i download grandi falliscono).
2. **Collegare i ponti ai fiumi** (distanza dalla linea ≤ 1,5 km, `distanceToRiverKm`) e alle coppie di province di `riverBorderGraph`.
3. **Regole**: costo e tempo di attraversamento per classe di larghezza e stagione, bonus difensivo, rifornimenti interrotti da un ponte distrutto, genio (ponte temporaneo, riparazione), trasporto fluviale per i fiumi navigabili con continuità del percorso.
4. **Fiumi di confine** e fiumi non ancora coperti (Francia, Svizzera, Ungheria, Romania, Balcani meridionali, Baltico, URSS) quando arriveranno le province.
