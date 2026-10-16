# Fiumi, laghi e attraversamenti

Stato: **dati reali ma approssimati** (Natural Earth, corso moderno). Le regole di gioco sui fiumi (movimento, combattimento, rifornimenti, piene) **non sono ancora implementate**: qui c'è il terreno su cui costruirle.

## Dati

| File | Contenuto | Fonte e licenza |
|---|---|---|
| `data/rivers.json` | Catalogo: 329 fiumi (133 principali, 136 secondari, 60 affluenti) con classe, `flowsInto`, navigabilità, larghezza, lunghezza | Natural Earth 10m `rivers_lake_centerlines` + `rivers_europe` v5.0.0 (area originale) e `rivers_lake_centerlines_scale_rank` + `rivers_europe` v5.1.1 (fiumi aggiunti), pubblico dominio |
| `data/rivers_geo.json` | 736 tratti `LineString` (`riverId`, `segment`, `inLake`) | idem; Douglas-Peucker 0,002°, 4 decimali |
| `data/lakes.json` | 119 laghi (area ≥ 25 km² o con nome ≥ 8 km²) | Natural Earth 10m `lakes` + `lakes_europe`, pubblico dominio |
| `data/crossings.json` | **Vuoto**: ponti, guadi e traghetti non hanno ancora una fonte | — |

La mappa e le regole leggono gli stessi file (`src/map/geo.js`, `src/data/rivers.js`): nessuna discrepanza tra grafica e simulazione.

### Come sono stati derivati i campi

- **Un fiume = un gruppo di tratti con lo stesso Wikidata** (altrimenti lo stesso nome). I tratti di `rivers_europe` che ricalcano la linea centrale (≥ 70 % dei punti entro 0,02°) sono scartati per non avere doppioni; gli altri (per esempio l'alto corso) sono tenuti. I tratti senza nome né Wikidata (26) sono scartati: non sono identificabili.
- **`flowsInto` (confluenza)**: la direzione del disegno in Natural Earth non è affidabile, quindi si guardano gli estremi liberi di ogni fiume: se uno è entro 0,04° dalla linea di un fiume di importanza pari o maggiore (`scalerank`), quello è lo sbocco. Correzioni a mano (`flowsIntoBasis: curated`): delta del Reno (Waal e Lek → Meuse, Nederrijn → Lek, IJssel e Reno → mare), Mur → Drava → Danubio. Le altre sono `derived_from_geometry` (con `_uncertain` quando c'erano più candidati). **Non verificate una per una** oltre ai casi controllati dai test.
- **Classe**: `main` se non confluisce in nessun fiume dell'area, `secondary` se confluisce in un principale, `tributary` negli altri casi.
- **Navigabilità**: Natural Earth non la contiene. 19 fiumi sono segnati navigabili da un elenco curato **non verificato** (`navigableBasis: curated_unverified`: Reno e delta, Mosa, Mosella, Meno, Danubio, Elba, Oder, Vistola, Weser, Warta, Sava, Po, Tibisco, Senna, Daugava); tutti gli altri sono `unknown_assumed_false`. Non c'è profondità né tratto navigabile: va aggiunta da una fonte.
- **Larghezza**: solo una classe (`widthClass`) stimata dal `scalerank` (`widthBasis: proxy_from_natural_earth_scalerank`), non un valore in metri.

### Fiumi aggiunti: Gran Bretagna, Irlanda, Spagna, Portogallo, Nord Africa, Scandinavia, Finlandia (114 fiumi, 404 tratti)

Stesso metodo del resto del catalogo, con queste differenze e limiti:

- **Ritaglio sul territorio:** le linee sono tagliate sulle province presenti (`GBR`, `ESP`, `PRT`, `GIB`, `MAR`, `MAR_ES`, `ALG`, `TUN`, `LBA`, `EGY`, `DNK`, `NOR`, `SWE`, `FIN`) con un margine di 0,04° per le foci. **Irlanda:** non esistono province `IRL`, il ritaglio usa i confini attuali di Natural Earth; i fiumi irlandesi sono disegnati ma senza province sotto. Un fiume entra solo se la parte ritagliata è ≥ 25 km e ≥ 30 % del corso in Natural Earth (`clipped_to_territory` quando è tagliato).
- **Nomi:** `name` = `name_en` di Natural Earth, `nameLocal` = nome locale della fonte; dove la fonte è sbagliata o troncata si usa il nome inglese o una correzione a mano (Skellefteälven, Ångermanälven, Vuoksi, Kymijoki, Lule älv, Torne älv). Nove fiumi hanno `name_not_verified` (nomi senza Wikidata o ambigui: Hossanj, Mane, Verkselv, Luirojoki, Bann, Blackwater, Annalee, Vorma, Karasjohka).
- **Etichette NE sbagliate:** il corso inferiore del Glomma è etichettato «Vorma» (unito al Glomma, `lower_course_labelled_vorma_in_ne`); il corso inferiore dell'Ume älv è la linea «Vindel» (`lower_course_labelled_vindel_in_ne`): la confluenza Ume → Vindel segue la geometria, non l'idrografia reale.
- **Corsi incompleti nella fonte:** il Tago finisce a Salvaterra (manca l'estuario fino a Lisbona), il Lule älv a 24 km da Luleå. Non sono stati completati a mano.
- **Confluenze:** derivate dalla geometria (`derived_from_geometry`) con correzioni a mano (`curated`): Stora e Lilla Lule → Lule älv, Vorma → Glomma, Jiloca → Jalón → Ebro; Swale, Barrow e Hallingdalselva senza sbocco (i fiumi in cui confluiscono non sono in Natural Earth). `Segre` (già presente) ora confluisce nell'Ebro. Rosetta e Damietta sono distributari del Nilo (`distributary_of_R_NILE`), non affluenti.
- **Navigabilità:** solo sette fiumi, da elenco curato **non verificato** (Nilo, Tamigi, Shannon, Guadalquivir, Tago, Duero, Göta älv).
- **Lunghezze:** misurate sulla linea generalizzata e ritagliata, tra il 55 e il 105 % del valore reale: non sono misure.
- **Esclusi:** canali (Suez, Ismailiya, Caledonian), la Garonna (francese), i fiumi baltici e Giordano. **Natural Earth non ha nessun fiume per Danimarca, Algeria, Tunisia e Libia**: restano vuoti e non sono stati inventati. Altre fonti verificabili (OpenStreetMap, HydroSHEDS) non sono raggiungibili da questo ambiente.
- Test: `tests/fiumi_nord_iberia.test.js` (7).

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
4. **Fiumi di confine** e fiumi non ancora coperti (Danimarca, Algeria, Tunisia, Libia, Baltico, URSS) quando arriveranno le province.
