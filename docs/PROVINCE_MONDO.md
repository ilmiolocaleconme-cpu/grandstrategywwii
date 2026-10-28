# Province del resto del mondo (25/10/2026, ipotesi)

Fino al 24/10/2026 la mappa copriva Europa, Mediterraneo e URSS. Ora ha una o più province per ogni nazione e colonia con un'entità
in `data/political_1936.json`, per poter collocare risorse, industrie e unità ovunque. **Sono confini amministrativi MODERNI**, non quelli del 1936:
ogni provincia è `borderQuality: hypothesis` con `knownIssues: ["modern_borders", "land_only", "coarse_grid"]`.

## Come sono fatte
- Fonte: Natural Earth 10m admin-1 v5.1.1 (pubblico dominio), più admin-0 dove manca la suddivisione. Generatore: `scripts/build-provinces-ne.js`
  (istruzioni nell'intestazione: serve un clone sparse di `natural-earth-vector`). Scrive `data/provinces/<OWNER>.json` e aggiunge il codice a `_meta.json`.
- **Griglia di 0,02°** (~2 km): i vertici sono agganciati alla griglia, quindi due province vicine condividono gli stessi punti e non restano
  buchi tra loro. Isole sotto ~300 km² (5000 km² per Canada, Groenlandia, Cile, Nuova Zelanda, Australia, Alaska) e buchi piccoli sono omessi;
  una provincia sotto 0,04 gradi² (enclavi di città, isolotti) si omette se la nazione ne ha almeno 3.
- Dove una nazione avrebbe più di 20 divisioni, e Natural Earth indica la regione, si fondono per regione (`dissolve`: i lati condivisi si annullano,
  restano i contorni esterni): Uganda 112→4, Filippine 118→17, Thailandia 77→6, Vietnam 63→9, Burkina Faso 45→13, Guinea 34→8, Ceylon 25→9, ecc.
  Il Giappone, l'India, gli USA, la Cina e le Indie orientali olandesi restano alla grana intera.
- Paesi piccoli o a isole (Capo Verde, Seychelles, Mauritius, Nauru, Samoa, Guinea equatoriale, Bhutan, Gibuti, Swaziland, Lesotho, Togo, Timor, Nuove Ebridi,
  Gambia) sono una provincia sola.

## Scelte di gioco (non storiche)
- India britannica = India + Pakistan + Bangladesh attuali; Indocina francese = Vietnam + Laos + Cambogia; Sudan anglo-egiziano = Sudan + Sud Sudan;
  Corea = Sud + Nord; Ruanda-Urundi; Manciukuo = Liaoning, Jilin, Heilongjiang (Mengjiang e Rehe NON ritagliati); Tibet separato dalla Cina;
  Terranova (con Labrador) separata dal Canada; Papua e Nuova Guinea australiana dividono la Papua Nuova Guinea.
- **Non coperti** (troppo piccoli o senza entità): Vaticano, San Marino, Andorra, Monaco, Macao, Goa, Antille olandesi, Aden, Ifni, Hong Kong, Karafuto,
  Mandato giapponese, Camerun e Togo britannici, Kwantung. Mancano anche entità che il dataset politico non ha: Guyana britannica, Nuova Caledonia,
  Bahrein, Kuwait, Sarawak, Trinidad: i loro giacimenti restano senza provincia.
- L'Alaska perde le Aleutine occidentali (a est dell'antimeridiano): un riquadro che attraversa ±180° rompe terreno e collegamenti.

## Conseguenze
- Terreno, adiacenza, zone di mare, nomi, collegamenti e industria sono stati rigenerati per tutte le province (`docs/TERRENO.md`: il terreno è una stima da raster).
  Le province nuove non hanno strade, ferrovie né fiumi dedicati: i collegamenti sono linee semplici tra le sedi (`how: straight/bend/...`).
- Confini con le province più vecchie: qualche decina di celle da 0,02° si sovrappongono (deserto algerino, Giordania, Siria-Iraq, Libia-Ciad); `tests/med.test.js` le tollera
  solo se una delle due province è `coarse_grid`.
- Slot industriali: le nuove province ricevono gli stessi 14 slot provvisori e uniformi di tutte (`data/industry/province_industry.csv`).
- Il peso dei file delle province è salito da ~9 MB a ~15 MB: **da misurare su telefono** (avvio e fluidità non verificati).
- Bandiere semplificate per le nazioni scegliibili nuove (Cina, Canada, Siam, Etiopia, Argentina, Brasile, Cile, Messico, Australia, Nuova Zelanda, Sudafrica): descrizioni ancora vuote.
