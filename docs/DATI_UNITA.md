# Catalogo unità (28/10/2026)

Stato: **implementato e testato (dati, validazione, regole di attivazione)**; **mancante**: ordine di battaglia 1936, uso in gioco (produzione, movimento, combattimento, interfaccia). Tutto il catalogo resta `DA_VERIFICARE`: nessuna fonte è stata verificata.

## File
- `data/units/source/unita_cronologia_1935_1945.csv` — copia non modificata del CSV ricevuto (364 righe, sha256 in `units.json`). Le due copie ricevute erano identiche.
- `data/units/unit_reviews.json` — revisioni manuali (stato, certezza, motivo). Una data si corregge solo con certezza "certo".
- `data/units/units.json` — generato con `npm run build:units`.
- `src/data/units.js` — classificazione, validazione, `isActiveAt`, `unitsActiveAt`, `countActive`.
- `tests/units.test.js`.

## Regole
- Il CSV ha solo l'anno: l'inizio è assunto al 1° gennaio, la fine al 31 dicembre (`startPrecision: 'year'`).
- "1935" nel CSV è l'inizio della finestra, non una data di costituzione (`dating: 'window_start'`).
- Politica `strict`: sono inattive le unità con revisione `date_doubt`, `duplicate`, `excluded`, `faction_doubt`.
- Revisioni: 4./5. Panzer → 1938; Fronte di Leningrado → 1941; 1. Gebirgs esclusa (decisione utente); 1. Kavallerie e 1re/2e DLM dubbie; Kantō/Kwantung e 32ª/132ª Ariete duplicati; 8th Route Army e New 4th Army fuori dalla fazione CHN.

## Limiti noti
- Al 1/1/1936 (strict) restano: DEU 30 fanteria + 3 corazzate; JPN 15; ITA 4 alpine; GBR 5; URSS 15 + 1; USA 3; FRA 0. Non è un ordine di battaglia reale: per FRA/GBR/ITA/USA/URSS le date sono di mobilitazione o designazione bellica.
- Mancano la divisione alpina Pusteria e le forze di Polonia, Cecoslovacchia e altri paesi.
- Ipotesi non confermate dall'utente: Germania storica dal 1/1/1936; politica strict.

## Decisioni dell'utente (28/10/2026)
- Germania: il 1/1/1936 resta com'è (30 divisioni di fanteria + 3 corazzate). Le leve successive (Aufstellungswellen) arrivano tramite eventi, che usano lo stesso motore della formazione manuale (guida "02 — Divisioni, creazione, supporti e ricostituzione", §29). Il meccanismo "unità attivata da evento" non è ancora implementato: oggi esiste solo l'attivazione per data.

## Stime aggregate 1936 (`data/units/oob_1936_stime.csv`)
Sono intervalli per nazione, categoria e livello, **non unità nominate**: non entrano nel catalogo e non creano unità in gioco. Ogni riga ha fonte e certezza (certo/probabile/ipotesi). Fonti realmente consultate in questa sessione: il testo di Tournès del 1936 sull'esercito francese (blog, interno incoerente: 20 o 25 divisioni) e Wikipedia per la cavalleria sovietica (36, ma il dettaglio somma 32) e i corpi meccanizzati (4 a inizio 1936). Le righe di UK, Italia, USA e la fanteria URSS sono ipotesi non verificate; per l'Italia non stimo le divisioni di fanteria perché il 1936 è falsato dalla guerra d'Etiopia.
