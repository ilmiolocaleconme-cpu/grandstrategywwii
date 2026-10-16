# Fiumi, laghi e attraversamenti

Stato: **dati reali ma approssimati** (Natural Earth, corso moderno). Le regole di gioco sui fiumi (movimento, combattimento, rifornimenti, piene) **non sono ancora implementate**: qui c'è il terreno su cui costruirle.

## Dati

| File | Contenuto | Fonte e licenza |
|---|---|---|
| `data/rivers.json` | Catalogo: 540 fiumi (211 nuovi dell'URSS inclusi) con classe, `flowsInto`, navigabilità, larghezza, lunghezza | Natural Earth 10m `rivers_lake_centerlines` + `rivers_europe` v5.0.0 (area originale) e `rivers_lake_centerlines_scale_rank` + `rivers_europe` v5.1.1 (fiumi aggiunti), pubblico dominio |
| `data/rivers_geo.json` | 2044 tratti `LineString` (`riverId`, `segment`, `inLake`) | idem; Douglas-Peucker 0,002°, 4 decimali |
| `data/lakes.json` | 896 laghi (435 dell'URSS inclusi; area ≥ 25 km² o con nome ≥ 8 km²) | Natural Earth 10m `lakes` + `lakes_europe` v5.0.0 (119 originali) e v5.1.1 (342 aggiunti), pubblico dominio |
| `data/crossings.json` | **Pilota Reno/Mosa**: 9 attraversamenti (8 sul Reno, 1 sulla Mosa), tutti `approximate`, nessuno `verified`, senza coordinate (vedi «Attraversamenti» sotto) | Wikipedia (fatti: anno, tipo, località) e inventario cantonale argoviese; licenza da accertare per quest'ultimo |

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

### Fiumi aggiunti: URSS (211 fiumi nuovi, 5 fiumi esistenti estesi; 796 tratti)

Natural Earth 10m `rivers_lake_centerlines_scale_rank` + `rivers_europe` (versione di sviluppo 5.2.0-pre, commit ca96624), stesso metodo del resto; solo fiumi con nome, canali esclusi.

- **Ritaglio:** sulle 177 province `USSR` con margine di 0,04° (bisezione dei punti di ingresso e uscita). Lunghezza minima 25 km nel territorio. Tratti di `rivers_europe` che ricalcano la linea centrale (≥ 70 % dei punti entro 0,02°) scartati.
- **Fiumi già presenti** (Dnestr, Daugava, Neman, Kemijoki, Prypiat, ecc.): si aggiungono solo i vertici non già coperti (distanza > 0,01° dai tratti esistenti) e collegati (entro 0,05°) ai tratti esistenti; i tratti isolati sono tenuti solo se lunghi almeno 100 km e marcati `segments_not_connected_to_earlier_course` (Southern Bug, Lutto). Il fiume è sempre quello con lo stesso Wikidata: **non verificato** che i raggruppamenti di Natural Earth siano corretti (le lunghezze di Jänisjoki e Vuoksi nel catalogo sono molto superiori al reale).
- **Confluenze:** derivate dalla geometria con la stessa regola del resto (estremo libero entro 0,04° dalla linea di un fiume di importanza pari o maggiore) più una regola nuova: un estremo che tocca l'estremo di un altro fiume (entro 0,06°) è una prosecuzione (fiume spezzato, delta, lago) e non una confluenza. Risultato: **120 fiumi su 211 hanno uno sbocco**; gli altri sfociano in mari o laghi assenti o non sono rilevati (Prypiat → Dnieper non è rilevata; Tobol → Irtysh e Selenga → Baikal mancano). I distributari dei delta (Lena: Bykovskaya, Trofimovskaya, ecc., `*_PROTOKA`) sono fiumi a sé.
- **Due fiumi omonimi:** l'Oka europeo (affluente del Volga) ha l'id `R_OKA`; quello siberiano (affluente dell'Angara) `R_OKA_ANGARA`.
- **Navigabilità:** solo 12 fiumi da elenco curato **non verificato** (Volga, Don, Dnieper, Dvina settentrionale, Neva, Ob, Irtysh, Yenisey, Lena, Amur, Kama, Oka europeo).
- **Limiti:** corsi di confine (Amur, Amu Darya, Panj, Kura) possono essere tagliati o spostati dal ritaglio sul confine semplificato (due vertici fuori margine nel test); lunghezze tra il 79 % (Yenisey) e il 98 % del reale per i grandi fiumi, non sono misure; i laghi sovietici sono stati aggiunti dopo (sezione sotto).
- Test: `tests/fiumi_urss.test.js` (6).

### Laghi aggiunti: URSS (435 laghi, 40 bacini artificiali)

Natural Earth 10m `lakes` + `lakes_europe` (5.2.0-pre, commit ca96624). Stessa soglia (≥ 25 km² o con nome ≥ 8 km²), isole interne ≥ 3 km² come buchi, Douglas-Peucker 0,002°; un lago è dentro se il centroide o almeno metà dei vertici sono nelle province sovietiche (margine 0,04°). Tolti i duplicati tra le due fonti e i laghi con Wikidata già presente (Peipus).

- **Presenti:** Baikal, Ladoga, Balkhash, Onega, Issyk-Kul, Zaysan, Khanka, Alakol, Sarygamysh, Aral Nord e Sud, Taymyr e altri; 238 senza nome (`L_NONAME_n`).
- **Bacini artificiali:** 40 segnati `reservoir_may_postdate_1936` (Kuybyshev, Rybinsk, Bratsk, Zeya, Tsimlyansk, Vilyuy, ecc.): molti sono **posteriori al 1936** e non sono stati esclusi perché la fonte non dà la data in modo utilizzabile (`year` è −99 quasi ovunque).
- **Esclusi:** il Mar Caspio e le sue lagune (sono mare sulla mappa) e i laghi effimeri e le saline della bassa del Caspio settentrionale (49-59° E, 43-48,5° N), non attendibili come laghi permanenti.
- **Limiti:** aree del poligono Natural Earth, non misure (Balkhash 17.551 contro 16.400-18.200 km² a seconda della fonte); il lago d'Aral è mostrato ai livelli moderni (molto ridotto rispetto al 1936); i tratti di fiume `inLake` ora attraversano laghi disegnati, ma non sono stati ricontrollati uno per uno.
- Test: `tests/laghi_urss.test.js` (4).

### Fiumi dentro i laghi

Natural Earth disegna i fiumi come linee d'asse che attraversano i laghi, e sulla mappa si vedevano linee sopra l'acqua. Ora ogni tratto è **diviso sui poligoni dei laghi del catalogo** (`data/lakes.json`, bisezione dei punti di ingresso e uscita): `inLake` è vero solo dove la linea sta dentro un lago disegnato (14.631 km, 280 → 2044 tratti in tutto, lunghezze dei fiumi invariate).

- **Dati e regole:** i tratti `inLake` restano nei dati, così la continuità del fiume (navigazione, confluenze) non si perde.
- **Mappa:** i tratti `inLake` non si disegnano; si vedono, tratteggiati, solo quelli del fiume selezionato.
- **Limiti:** nei grandi bacini artificiali (Kuybyshev, Rybinsk, Bratsk) il Volga e altri fiumi spariscono per tutta la lunghezza del bacino (bacini posteriori al 1936: vedi i laghi); una corda tra due vertici fuori dal lago può tagliarne un'insenatura (test: ≤ 0,5 % degli archi); le linee d'asse di laghi non presenti nel catalogo (piccoli o esclusi) restano visibili come fiumi.
- Test: `tests/fiumi_laghi.test.js` (3).

### Densità sulla mappa

A vista d'insieme tutti i 540 fiumi coprivano la mappa. `riverRankLimit` (in `src/map/geo.js`) mostra solo i fiumi grandi (`scalerank` ≤ 5) con zoom < 1,8, anche i medi (≤ 8) fino a 3,5, tutti oltre; il fiume selezionato resta sempre visibile. Soglie scelte a occhio, **non provate su telefono**.

### Laghi aggiunti: Gran Bretagna, Irlanda, Spagna, Portogallo, Nord Africa, Baltici, Danimarca, Norvegia, Svezia, Finlandia (342 laghi)

- **Selezione:** stessa soglia del resto (≥ 25 km² o con nome ≥ 8 km²), centroide dentro il territorio delle province presenti (margine 0,04°; Irlanda: confini attuali, nessuna provincia `IRL`). Tolti i duplicati tra `lakes` e `lakes_europe` e i laghi già presenti (per Wikidata o per posizione e area). 298 sono in Scandinavia e Finlandia, 19 in Gran Bretagna e Irlanda, 14 in Iberia, 9 nei Baltici, 2 in Nord Africa (Nasser, Grande Lago Amaro).
- **Forma:** `MultiPolygon` semplificato a 0,002°; le isole interne ≥ 3 km² restano come buchi (la mappa disegna con `evenodd`). Ottantatré laghi non hanno nome in Natural Earth: id `L_NONAME_n`, come già fatto per gli altri.
- **Limiti:** `areaKm2` è l'area del poligono Natural Earth e può differire molto dal valore reale per i laghi con molte isole (Saimaa 9.309, Päijänne 4.189 km²: sovrastimate). Laghi artificiali moderni (Nasser, Lokka, Porttipahta) non distinti da quelli del 1936. Laghi in più parti hanno più poligoni con lo stesso Wikidata (come Como). I chott algerini e tunisini sono nel dataset pluviale di Natural Earth e non sono inclusi.
- Test: `tests/laghi_nord_iberia.test.js` (4).

## Cosa c'è già nel codice

- `src/data/validate.js`: validazione di catalogo, grafo delle confluenze (nessun ciclo), tratti (fiume esistente, coordinate) e laghi.
- `src/data/rivers.js`: `buildRiverModel`, `distanceToRiverKm`, `riverProvinceCrossings` (dove un fiume passa da una provincia all'altra: sono i punti che richiederanno ponti, guadi o traghetti), `riverBorderGraph`, `downstreamChain`.
- Mappa: pulsante ≈ per mostrare/nascondere fiumi e laghi, tocco su un fiume per aprirne la scheda.
- `tests/rivers.test.js` (10 test) e un test in `tests/map.test.js`: validità, grafo, 14 città sulle rive entro 6 km, lunghezze entro il 15 %, attraversamenti sintetici e reali.

## Limiti da tenere presenti

- Corso **moderno**, non del 1936 (canalizzazioni, dighe e regolazioni successive non corrette); linea generalizzata a 1:10 milioni.
- Il poligono Natural Earth del Neusiedlersee è più piccolo del lago reale.
- I fiumi che **corrono lungo** un confine (Oder, Neisse, Reno, Mosa, Danubio in tratti) producono eventi di attraversamento solo in parte e con rumore (sul Danubio: 209 eventi contro circa 45 coppie di province davvero affacciate). Per i ponti si usa `riverBanks` (sonda sulle due rive), non `riverProvinceCrossings`.
- Nessun dato su piene, gelo, disgelo, profondità e guadi. Ponti e traghetti: solo il pilota Reno/Mosa (9 voci).
- Nel catalogo il **Waal olandese è tracciato come parte di `R_RHINE`** (Natural Earth): `R_WAAL` copre solo 54 km vicino alla Mosa. Il Nederrijn ad Arnhem non è nel catalogo, quindi il ponte di Arnhem (1935) non si può inserire.

## Attraversamenti (ponti, ponti di barche, traghetti, guadi)

Schema di ogni voce di `data/crossings.json` (validato da `src/data/validate.js`):

- `id` (es. `X_RHINE_MAXAU_PONTONE`), `name`, `type` (`bridge_road`, `bridge_rail`, `bridge_pontoon`, `ford`, `ferry`), `carries` (elenco esplicito del traffico: `road`, `rail` o entrambi; il tipo da solo non basta, il ponte di barche di Maxau portava strada e ferrovia), `riverId`, `state` (stato iniziale: `intact`, `damaged`, `destroyed`, `temporary`), `controller` (nazione o `null` per un ponte di frontiera), `approximate`.
- `place` (testo) e **`sideA` / `sideB`**: le province delle due rive. Possono coincidere (ponte dentro una provincia: Colonia, Remagen, Nimega, Maastricht). **Non ci sono coordinate**: non si inventano; la posizione è il luogo più le province delle rive.
- `validFrom` / `validTo` (inizio incluso, fine esclusa; `9999-12-31` = senza fine), `dateBasis` (`source` o `assumed`). Un attraversamento può nascere dopo il 1/1/1936 (Maxau fisso 1938, Waalbrug 16/6/1936): non c'è alla partenza e comparirà per evento (il sistema di eventi non esiste ancora).
- `dataQuality` (`verified`, `approximate`, `hypothesis`; oggi nessuna voce è `verified`), `source`, `license`, `knownIssues`, `notes`. Le distruzioni storiche (1940, 1945) sono scritte in `notes` come informazione: **non** sono eventi di gioco né cambiano `state`.

Controlli: il validatore verifica campi, tipi, date (ISO, `validFrom <= validTo`), fiume e controllore esistenti e, se le province sono nel catalogo, che `sideA`/`sideB` esistano. `tests/crossings.test.js` verifica con la geometria che le rive siano coerenti: stessa provincia attraversata dal fiume, oppure coppia di province **affacciate** (`riverBanks`).

Funzioni pure sui dati: `src/data/crossings.js` (`crossingExistsAt`, `crossingsAt`, `crossingProvinces`) e `riverBanks` in `src/data/rivers.js`.

### Regola di attraversamento (`src/rules/crossings.js`)

Funzioni pure, testate in `tests/crossing_rules.test.js`. Lo stato di partita di ogni attraversamento è `{ state, controller }` (`initialCrossingState`, `buildCrossingStates` lo ricavano dal dato; il dato non viene mai modificato).

**`canCross(crossing, runtime, { date, traffic, actor, access })`** → `{ ok, capacity, reason }`. Controlli in quest'ordine: esistenza alla data (`not_built_yet`, `no_longer_exists`), traffico trasportato (`wrong_traffic`), stato (`destroyed`; con passaggio temporaneo la ferrovia è negata: `temporary_road_only`), controllore (`controller_denied` se il controllore non è `null`, non è l'attore e non è in `access`). Capacità qualitativa: intatto = `full`, danneggiato o temporaneo = `reduced`, distrutto = `none`.

**`applyCrossingAction(crossing, runtime, azione, { engineers, by })`** → `{ ok, runtime, reason }` con uno stato nuovo (quello dato non cambia):

| Azione | Da → a | Requisiti |
|---|---|---|
| `damage` | intatto → danneggiato; temporaneo → distrutto | — |
| `destroy` | intatto, danneggiato, temporaneo → distrutto | — |
| `repair` | danneggiato → intatto | genio |
| `build_temporary` | distrutto → temporaneo | genio; solo ponti (non guadi né traghetti) |
| `rebuild` | distrutto, temporaneo → intatto | genio |
| `capture` | cambia il controllore, lo stato non cambia | `by` = nazione |

**Scelte di progetto provvisorie** (da rivedere con le regole di movimento): il passaggio temporaneo porta solo strada, anche se l'originale portava la ferrovia; `access` (chi ha diritto di passare) lo fornisce il chiamante perché la diplomazia non esiste; un controllore `null` (ponte di frontiera) non limita nessuno.

**Non implementato:** tempi di attraversamento, portata, costi e durata dei lavori del genio (mancano il modello di movimento, i rifornimenti e l'economia: qualsiasi numero oggi sarebbe inventato), stagioni, piene, gelo e disgelo, guadi e traghetti con condizioni (nei dati non ce ne sono), diplomazia e accesso. Le funzioni non sono ancora collegate a nessun ciclo di partita né all'interfaccia.

Lacune del pilota: sulla Mosa c'è un solo ponte (Maastricht), nessun traghetto o guado sul Reno e sulla Mosa, nessun ponte tra Belgio e Paesi Bassi o tra Francia e Belgio. Limite delle fonti: dati raccolti da Wikipedia e da un solo inventario cantonale, nessuna fonte storica primaria; per questo nessuna voce è `verified`.

## Prossimi passi, in ordine di dipendenza

1. **Estendere i ponti oltre il pilota Reno/Mosa** (`data/crossings.json`, 9 voci oggi; schema e controlli: sezione «Attraversamenti»). Mancano le coordinate (non vanno inventate). Fonte da provare per l'inventario di massa: OpenHistoricalMap (storica) con una richiesta Overpass che l'utente scarica dal telefono, come per le province (non provata da qui):
   ```
   [out:json][timeout:180];
   (way["bridge"]["highway"~"motorway|trunk|primary|secondary|tertiary"](43.5,5.5,55.5,24.5);
    way["bridge"]["railway"="rail"](43.5,5.5,55.5,24.5););
   out tags geom;
   ```
   Poi filtrare per `start_date` ≤ 1936 e `end_date` > 1936; i ponti senza date restano `approximate` e non verificati. In alternativa OpenStreetMap con `start_date` < 1936 (dati moderni, più completi ma meno storici). Inventario prima, geometrie dopo (i download grandi falliscono).
2. **Collegare i ponti ai fiumi** (distanza dalla linea ≤ 1,5 km, `distanceToRiverKm`) e alle coppie di province di `riverBorderGraph`.
3. **Regole**: costo e tempo di attraversamento per classe di larghezza e stagione, bonus difensivo, rifornimenti interrotti da un ponte distrutto, genio (ponte temporaneo, riparazione), trasporto fluviale per i fiumi navigabili con continuità del percorso.
4. **Fiumi di confine** e fiumi non ancora coperti (Danimarca, Algeria, Tunisia, Libia, Baltico; l'URSS è coperta, vedi sopra) quando arriveranno le province.
