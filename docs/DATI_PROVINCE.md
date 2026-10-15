# Province al 1/1/1936 (`data/provinces_1936.json`)

FeatureCollection GeoJSON (coordinate `[lon, lat]`). Stato: **dati reali ma approssimati, non ancora letti dalla mappa né dall'app**.

## Provenienza e licenza
- Fonte: [OpenHistoricalMap](https://www.openhistoricalmap.org), relazioni `admin_level=4` valide il 1/1/1936, scaricate il 2026-10-14 tramite Overpass API. Licenza CC0 (campo `license` per feature; nessuna relazione ha un tag `license` diverso).
- Ogni feature riporta `ohmRelation` e `wikidata` per risalire alla relazione originale. I file grezzi OHM **non** sono nel repository.
- Natural Earth admin-1 5.1.1 (dominio pubblico) è stato scartato come fonte generale (confini moderni, granularità disomogenea) ed è usato **solo per i Paesi Bassi**, perché OHM ha per il 1936 soltanto Frisia, Limburgo e Utrecht su 11.

## Copertura (79 province)
| owner | contenuto |
|---|---|
| DEU | Länder e province prussiane (29) |
| POL | 16 voivodati |
| AUT | 8 Länder |
| BEL | 9 province |
| LUX | 3 distretti |
| NLD | 11 province da **Natural Earth** (non OHM), `borderQuality: "hypothesis"` |
| CZE | Boemia, Moravia-Slesia, Rutenia subcarpatica (**manca la Slovacchia**) |

Il Reich e la Cecoslovacchia usano la versione precedente al 3/7/1936.

## Qualità e limiti noti
- Le 11 province olandesi sono `hypothesis`: confini odierni, solo terraferma (niente Wadden, IJsselmeer, estuari), Flevoland esclusa perché nel 1936 era mare/Zuiderzee, date `validFrom`/`validTo` assunte (`dateBasis: "assumed"`). Semplificazione 0,0002° per anello, nessuna sovrapposizione tra province olandesi (campionamento a 0,003°).
- Lungo i confini con Belgio e Germania le province olandesi (senza mare) si sovrappongono a quelle OHM (con mare): circa 110 campioni su 355.000 coperti a 0,02° (~0,03%, qualche centinaio di km²). Il test le ammette solo tra NLD e BEL/DEU con soglia 0,05%.
- Le 68 feature OHM sono `borderQuality: "approximate"`: OHM segnala `needs source for boundary lines` e nessun confine è verificato su fonte primaria.
- Semplificazione Douglas-Peucker 0,004° (~400 m) applicata per way, così i confini condivisi restano coincidenti; 125 way chiuse minuscole e alcuni anelli degenerati (Amburgo, Turingia, Hannover, Sassonia prussiana) sono stati scartati. Le aree totali variano meno dell'1,5% rispetto all'originale.
- I poligoni costieri non sono ritagliati sulla costa e includono mare (`knownIssues: ["includes_sea"]` per Schleswig-Holstein, Amburgo, Oldenburg, Hannover, Meclemburgo: casi misurati; altri possibili).
- Berlino è un buco nel Brandeburgo; Vienna è inclusa nella Bassa Austria.
- Sovrapposizioni residue della fonte (coppie elencate in `tests/provinces.test.js`): Liegi/Renania, Lussemburgo belga/Diekirch, Hannover/Schleswig-Holstein, Sassonia prussiana/Slesia inferiore e Brandeburgo. Il test fallisce se compare una coppia nuova o se si supera lo 0,02% dei punti campionati.
- Non ci sono ancora Francia, Svizzera, Danimarca, Italia, Iberia, Balcani, Scandinavia, URSS e altri.

## Controlli automatici
`npm run validate:data` e `npm test` (`tests/provinces.test.js`): schema, owner esistente in `political_1936`, validità alla data, anelli chiusi, id univoci, città di prova nella provincia attesa, sovrapposizioni entro soglia.
