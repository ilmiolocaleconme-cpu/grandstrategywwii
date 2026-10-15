# Province al 1/1/1936 (`data/provinces/`)

Feature GeoJSON (coordinate `[lon, lat]`), un file per nazione. Stato: **dati reali ma approssimati, letti dalla mappa**.

## Organizzazione dei file
- `data/provinces/<OWNER>.json` (18 file: DEU, POL, AUT, BEL, LUX, CZE, NLD, ITA, YUG, DANZIG, CHE, LIE, FRA, HUN, ROM, BGR, GRC, ALB): `{ "type": "FeatureCollection", "owner": "<OWNER>", "features": [...] }`, una feature per riga. Ogni provincia sta nel file del proprio `owner` (controllato). Slovacchia sta in `CZE.json`; Zara e Dodecaneso in `ITA.json`.
- `data/provinces/_meta.json`: `schema` (`provinces-meta-v1`), `order` (ordine di unione delle nazioni) e `metadata` (fonte, licenza, semplificazione, copertura, limiti: gli stessi campi che il vecchio file unico aveva in cima).
- **Caricamento.** Tutti i file si caricano all'avvio, **in parallelo**, e si uniscono in memoria in una sola FeatureCollection (`src/data/provinces.js`; nel browser l'elenco lo fissa `import.meta.glob` in `src/data/loadProvinces.js`, in Node `scripts/load-provinces.js`). **Nessun caricamento per area**: causerebbe buchi mentre si scorre e bordi nazionali (`nationalBorderPath`) che cambiano all'arrivo del vicino. La mappa parte solo a caricamento completo; se un file non arriva, si mostra l'errore con l'elenco dei file mancanti e il pulsante «Ricarica».
- **Precache.** Ogni file è un chunk a sé nella build e deve stare nel precache del service worker: `node scripts/check-precache.js` (dopo `npm run build`, eseguito dalla CI) lo controlla.
- **Aggiungere una nazione:** nuovo `data/provinces/<OWNER>.json` e il codice in `order` di `_meta.json`; `npm test` e `npm run validate:data` segnalano file mancanti, non elencati, province nel file sbagliato e id duplicati.
- Il vecchio `data/provinces_1936.json` (file unico) è stato rimosso: la divisione è senza perdite (370 feature identiche una a una, stessi metadati, stesso modello di mappa e stessi bordi nazionali). Nell'unione cambia solo l'ordine di tre province (Slovacchia, Zara, Dodecaneso), ora vicine alla loro nazione.

## Provenienza e licenza
- Fonte: [OpenHistoricalMap](https://www.openhistoricalmap.org), relazioni `admin_level=4` valide il 1/1/1936, scaricate il 2026-10-14 tramite Overpass API. Licenza CC0 (campo `license` per feature; nessuna relazione ha un tag `license` diverso).
- Ogni feature riporta `ohmRelation` e `wikidata` per risalire alla relazione originale. I file grezzi OHM **non** sono nel repository.
- Natural Earth admin-1 5.1.1 (dominio pubblico) è stato scartato come fonte generale (confini moderni, granularità disomogenea) ed è usato **solo per i Paesi Bassi, la Sicilia e la Calabria**, perché OHM ha per il 1936 soltanto Frisia, Limburgo e Utrecht su 11 province olandesi, e non ha Sicilia (solo fino al 1923) né Calabria (solo dal 1947).

## Copertura (370 province)
| owner | contenuto |
|---|---|
| DEU | 32 Gaue NSDAP (ipotesi, vedi `docs/GAUE.md`); le 30 province/Länder originali sono in `data/archive/provinces_deu_1936_lander.json`, non caricate |
| POL | 16 voivodati |
| AUT | 8 Länder |
| BEL | 9 province |
| LUX | 3 distretti |
| ITA | Zara (anello dell'enclave dal contorno del Regno d'Italia OHM) + 16 regioni OHM (Piemonte, Liguria, Lombardia, Venezia Tridentina, Veneto, Venezia Giulia, Emilia, Toscana, Marche, Umbria, Lazio, Abruzzi e Molise, Campania, Puglie, Lucania, Sardegna) + **Sicilia e Calabria da Natural Earth** (`hypothesis`) |
| FRA | 90 dipartimenti da **Natural Earth** (`kind: departement`), come nel 1936: Senna (Parigi e 3 attuali), Senna e Oise (3 attuali) e Corsica (2 attuali) uniti; Alsazia-Lorena e Territorio di Belfort inclusi. `hypothesis` |
| CHE | 25 cantoni da **Natural Earth** (`kind: kanton`); il Giura (cantone dal 1979) è unito a Berna. `hypothesis` |
| LIE | Liechtenstein, 1 stato (11 comuni uniti), da Natural Earth. `hypothesis` |
| HUN | 20 (19 contee attuali e Budapest) da **Natural Earth**; le città-contea sono inglobate nella contea; non sono le 25 contee del 1936. `hypothesis` |
| ROM | 45: 41 județe attuali, București, più **ricostruite**: Basarabia (distretti moldavi a destra del Dniester + Budjak, cioè Odessa a ovest di 30,2° E e a sud di 46,55° N), Bucovina de Nord (regione di Černivci, con Herța e Hotin) e Cadrilater (Dobrič e Silistra, rumeno dal 1913 al 1940). La Romania aveva 71 județe: non ricostruiti. `hypothesis` |
| BGR | 26 oblast attuali (Dobrič e Silistra sono nel Cadrilater rumeno). `hypothesis` |
| GRC | 14 periferie attuali (con Athos; Cicladi senza il Dodecaneso). `hypothesis` |
| ALB | 12 qark attuali. `hypothesis` |
| ITA (Dodecaneso) | 1 provincia: isole a est di 26,15° E della periferia dell'Egeo meridionale (Rodi, Coo, Lero ecc.), italiane dal 1912 al 1947; taglio su longitudine, approssimato. `hypothesis` |
| NLD | 11 province da **Natural Earth** (non OHM), `borderQuality: "hypothesis"` |
| CZE | Boemia, Moravia-Slesia, Rutenia subcarpatica (OHM) + **Slovacchia derivata** (contorno della Cecoslovacchia OHM meno le tre terre; `hypothesis`, `dateBasis: derived`, validità fino al 3/7/1936) |

Il Reich e la Cecoslovacchia usano la versione precedente al 3/7/1936.

## Qualità e limiti noti
- Le 11 province olandesi sono `hypothesis`: confini odierni, solo terraferma (niente Wadden, IJsselmeer, estuari), Flevoland esclusa perché nel 1936 era mare/Zuiderzee, date `validFrom`/`validTo` assunte (`dateBasis: "assumed"`). Semplificazione 0,0002° per anello, nessuna sovrapposizione tra province olandesi (campionamento a 0,003°).
- **Allineamento ai vicini.** Dopo aver unito fonti diverse ho ricalcolato su raster (0,002°, precisione di bordo ~100-200 m) le 11 province olandesi (tolte dai vicini BEL/DEU/LUX, con riempimento delle fessure fino a ~4 km), Campania (tolta Abruzzi e Molise), Marche (tolta Emilia) e Calabria (tolta Lucania). Risultato misurato in finestre di confine: sovrapposizioni ≤1 km², fessure Paesi Bassi-Belgio ~12 km² e Paesi Bassi-Germania ~14 km² (in gran parte acqua: Dollart, Schelda). Il confine non è condiviso a livello di vertici: è allineato entro la precisione del raster. Il test `i confini tra fonti diverse sono allineati entro le tolleranze` fissa le soglie.
- Le 68 feature OHM sono `borderQuality: "approximate"`: OHM segnala `needs source for boundary lines` e nessun confine è verificato su fonte primaria.
- Semplificazione Douglas-Peucker 0,004° (~400 m) applicata per way, così i confini condivisi restano coincidenti; 125 way chiuse minuscole e alcuni anelli degenerati (Amburgo, Turingia, Hannover, Sassonia prussiana) sono stati scartati. Le aree totali variano meno dell'1,5% rispetto all'originale.
- I poligoni costieri non sono ritagliati sulla costa e includono mare (`knownIssues: ["includes_sea"]` per Schleswig-Holstein, Amburgo, Oldenburg, Hannover, Meclemburgo: casi misurati; altri possibili).
- **Berlino** (`P_DEU_BERLIN`): regione a sé (Grande Berlino, ~878 km²), ricavata dai buchi del Brandeburgo: anello principale più 3 exclave, quindi il confine coincide esattamente con quello del Brandeburgo. Qualità `approximate`, nessuna relazione OHM propria.
- **Danzica** (`P_DANZIG_FREE_CITY`, proprietario `DANZIG`): regione dalla relazione OHM 2691478 (Freie Stadt Danzig, valida 1920-12-24 → 1939-09-01), confini ricalcolati sui vicini (Prussia Orientale, Pomerania polacca; sovrapposizioni originali ~6 km²). Il poligono (~2.265 km²) include tratti di mare (la terra era ~1.966 km²): segnalato `may_include_sea`. Il corridoio polacco (Gdynia) resta alla Pomerania.
- Vienna è inclusa nella Bassa Austria.
- Sovrapposizioni residue della fonte (coppie elencate in `tests/provinces.test.js`): Liegi/Renania, Lussemburgo belga/Diekirch, Hannover/Schleswig-Holstein, Sassonia prussiana/Slesia inferiore e Brandeburgo. Il test fallisce se compare una coppia nuova o se si supera lo 0,02% dei punti campionati.
- Italia: relazioni OHM senza `end_date` (Lombardia, Toscana, Lazio, Campania, Umbria, Sardegna) possono avere confini moderni; Zara (enclave in Dalmazia) non è in alcuna regione; Sicilia e Calabria sono unioni non fuse delle province attuali (bordi interni visibili). Italia-Austria (entrambe OHM) coincide senza sovrapposizioni, con ~18 km² di fessura.
- **Iugoslavia** (33 regioni `P_YUG_*`, nome = capoluogo, qualità `hypothesis`): OHM ha per il 1936 solo il contorno del Regno e il download non è andato a buon fine. Il contorno è l'unione di Serbia, Croazia, Bosnia, Slovenia, Montenegro, Macedonia del Nord e Kosovo (Natural Earth 10m admin-1, pubblico dominio) meno Zara e Venezia Giulia italiane (area ~245.700 km², contro ~248.000 storici). La suddivisione interna è stata tracciata da un'immagine fornita dall'utente, georeferenziata con un'affine più una deformazione (thin-plate) su 25 città, a risoluzione di circa 2 km; dall'immagine sono state usate solo le forme, non i colori. **Attenzione:** l'immagine mostra le oblast del 1922–29, non le banovine in vigore nel 1936: nei dati la validità è 'assunta' e segnalata in `knownIssues` (`oblast_1922_29_non_banovine`). Ogni capoluogo cade nella propria regione (test), tranne Dubrovnik, che cade fuori dal contorno costiero semplificato. Kruševac e Dubrovnik sono state ricavate per accrescimento di colore; sei confini sono stati spostati di pochi km per far cadere il capoluogo nella regione giusta. Lagosta non ritagliata. Confini con Ungheria, Romania, Bulgaria, Grecia e Albania non verificabili. Fessure con l'Italia ~80 km² (mare).
- **Spagna** (`ESP`, 48 su 50 province: 47 continentali + Baleares; `P_ESP_*`) e **Marocco spagnolo** (`MAR_ES`, 1 regione, zona nord del protettorato): forme tracciate da un'immagine fornita dall'utente (mappa del luglio 1936 con confini provinciali, 330×285 px, ~5 km/px), georeferenziata con thin-plate su 35 città (errore medio ~9 km) e segmentata con watershed sui capoluoghi; aree entro ~-22/+11% dai valori ufficiali (Gerona -22%, Palencia -14%, Valladolid -13%, Álava -12%: le più lontane). Il confine con la Francia (Navarra, Huesca, Lérida, Gerona, Guipúzcoa) è quello di FRA: stessi vertici, nessuna sovrapposizione (test). Il confine col Portogallo e la costa vengono dall'immagine. **Mancano:** Canarie (Las Palmas, Santa Cruz de Tenerife: l'immagine le ha in un riquadro, ma a latitudine 27–29° N fanno superare il limite di altezza testato per la mappa), Formentera, Ceuta, Melilla, Tangeri, Ifni, Cabo Juby; Andorra non è rappresentata. Qualità `hypothesis`; licenza dell'immagine non verificata (solo guida di tracciamento). **Portogallo e Marocco francese non sono ricavabili dall'immagine** (solo contorni grigi) e restano da fare con un'altra fonte.
- **Colori dell'immagine spagnola:** mostrano la situazione all'inizio della guerra civile (luglio 1936), non quella del 1° gennaio 1936: non sono nei dati delle province. Vanno modellati come evento storico (cambio di controllo). Non è stata estratta nessuna assegnazione: legenda non disponibile e diverse province erano divise tra i due campi, quindi un valore per provincia sarebbe sbagliato.
- Cecoslovacchia: OHM non ha la Slovacchia per il 1936; derivandola per differenza viene 48.500 km² (reali circa 49.000) in un solo pezzo; le tre terre OHM coprono il contorno con 3 km² fuori e 1 km² di sovrapposizione.
- Non ci sono ancora Francia, Svizzera, Danimarca, Iberia, Balcani, Scandinavia, URSS e altri.

## Controlli automatici
`npm run validate:data` e `npm test` (`tests/provinces.test.js`): schema, owner esistente in `political_1936`, validità alla data, anelli chiusi, id univoci, città di prova nella provincia attesa, sovrapposizioni entro soglia.

## Confini interni semplificati (leggibilità)

Per rendere la mappa leggibile (soprattutto su telefono) i confini **interni** tra province dello stesso Stato sono stati ri-semplificati. Non sono stati toccati i confini tra Stati diversi, le coste e gli anelli non condivisi.

- **Metodo.** Gli archi condivisi esattamente da due province con lo stesso `owner` vengono semplificati una volta sola (Douglas-Peucker, coordinate proiettate), con lo stesso tracciato sui due lati: nessuna fessura né sovrapposizione nuova. La soglia è al massimo 0,05° (~5 km) e comunque non oltre il 5% della radice dell'area della provincia più piccola delle due, così Berlino, Danzica e i piccoli Stati non si deformano. I punti dove si incontrano tre o più province restano fissi.
- **Risultato.** Vertici totali da 83.299 a circa 41.000. Arco per arco, i 28.016 archi esterni sono identici all'originale (3 punte di larghezza zero sono state eliminate). Le aree variano meno del 3% (Sassonia prussiana +1,1%).
- **Limiti.** I confini interni sono volutamente poco precisi e non vanno usati per misure. 39 tratti restano al dettaglio originale perché semplificarli avrebbe creato incroci tra confini. La Sassonia prussiana è ancora irregolare perché composta da tante piccole exclavi. Il controllo degli incroci confronta solo i tratti nuovi: nei dati originali ci sono già circa 2.900 incroci tra segmenti di province di Stati diversi (disallineamenti noti, da rivedere).
- **Come si disegna.** `nationalBorderPath` (`src/map/geo.js`) traccia più spessi i confini nazionali e le coste; i confini interni sono più sottili e semitrasparenti.
- **Riproducibilità.** Lo script di semplificazione non è nel repository (come gli altri strumenti di preparazione dati); i dati risultanti sono in `data/provinces/`.

- **Semplificazione dei confini interni.** I confini interni sono stati semplificati in modo topologico (tolleranza ≤0,05°, spigoli condivisi invariati, giunzioni fisse); i confini esterni sono rimasti identici. Lo script non è nel repository.

## Francia, Svizzera e Liechtenstein (metodo)
- **Fonte:** Natural Earth 10m admin-1 v5.1.1 (dominio pubblico), confini moderni, solo terraferma (laghi esclusi: nessun Lemano né Costanza). Monaco e Andorra non sono inclusi (nessuna fonte). Dopo il 1936 cambiano: Tenda e Briga (1947, nei dati restano all'Italia OHM), i comuni svizzeri e le fusioni dipartimentali.
- **Allineamento:** raster a etichette (0,0025°) con priorità ai vicini già presenti (BEL, LUX, DEU, AUT, ITA); le fessure tra Stati diversi fino a ~3 km sono colmate (~1.560 km², in gran parte acqua); i bordi tra etichette sono tracciati sul reticolo come **archi condivisi**, così i confini interni (dipartimenti, cantoni) combaciano vertice per vertice e quelli verso i vicini sono agganciati ai loro tracciati. Misura su raster 0,001°: sovrapposizioni 0,4–7 km² e fessure 1–7 km² per ciascun tratto di confine (centinaia di km), mai buchi evidenti.
- **Semplificazione:** costa 0,003°, confini nazionali 0,003°, verso i vicini 0,0008°, interni fino a 0,015° (≈1,5 km).
- **Limiti:** le città costiere possono cadere appena fuori dal poligono (Ajaccio, Bastia, Calvi in prova); una striscia di sovrapposizione di circa 1 km² tra Moselle e Saarpfalz è ammessa dal test (`KNOWN_OVERLAPS`); lo script di costruzione non è nel repository.

## Europa orientale (stesso metodo)
- Stessa procedura di Francia e Svizzera (raster a etichette 0,0025°, archi condivisi, aggancio ai vicini): priorità ai vicini già presenti (AUT, CZE, POL, YUG, ITA), fessure tra Stati diversi colmate fino a ~3 km (~740 km²), buchi interni fino a 2.500 km² colmati con la contea più vicina (città-contea ungheresi; ~4.300 km² in tutto).
- Misura su raster 0,001° lungo i confini con i vicini: sovrapposizioni 2–8 km², fessure 2–4 km² per tratto (test d'allineamento in `tests/provinces.test.js`, soglie circa il doppio del misurato).
- **Limiti:** suddivisioni moderne (non 1936); il confine Ungheria-Slovacchia ha fessure fino a ~16–21 km² perché la Slovacchia è derivata dal contorno OHM; l'URSS non è sulla mappa (Dniester e Prut esterni senza vicino); Turchia non presente; città costiere (Costanza, Salonicco?) possono cadere appena fuori dal poligono; il confine tra Baranja e Vojvodina dipende dalle regioni iugoslave ipotetiche già presenti; lo script non è nel repository.
