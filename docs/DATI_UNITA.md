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

## Francia 1936 dal file dell'utente (28/10/2026)
`data/units/source/francia_1936_oob.csv` (copia non modificata, sha256 in `units.json`). Integrato in `units.json` da `mergeOob1936` (stesso meccanismo per Germania e URSS, sotto):
- 6 divisioni già presenti nel CSV (1re DLM, 1re/2e/10e/14e/19e DI) sono anticipate al 1936 con revisione `corrected`, certezza **probabile**, `basis: user_file` (dato fornito dall'utente, da verificare su SHD). Le altre 14 di fanteria e 4 di cavalleria sono nuove (`S36-FRA-nnn`).
- Al 1/1/1936: 20 divisioni di fanteria, 4 di cavalleria, 1 meccanizzata leggera (coerente con il limite basso del testo di Tournès: 20–25).
- Inattive per dubbio: 5ª divisione di cavalleria (il testo di Tournès ne conta 4) e le 4 divisioni coloniali (data di costituzione non verificata; il CSV dice 1939).
- 3ª/5ª/9ª/15ª DI hanno nel CSV una versione motorizzata: la versione 1936 termina nel 1938 (`supersededBy`) per non contarle due volte. La data della motorizzazione è assunta dal CSV, non verificata.
- Difetto del file: le 32 righe terrestri hanno una virgola in più prima di `data_riferimento`. Il lettore ripara solo questo caso preciso e lo conta (`repairedRows`).
- Non importati (fuori dal catalogo terrestre, 8 righe): 2 squadre navali, flotta sottomarina, aviazione navale, 3 divisioni aeree, Raggruppamento indocinese-malgascio. Servono sistemi navale/aereo che il repository non ha ancora.
- Gli ufficiali sono "Da verificare" quasi ovunque; la colonna non è stata importata.
- Le righe francesi di `oob_1936_stime.csv` restano come controllo indipendente (intervallo 20–25), ma ora il catalogo ha i nomi.

## Germania e URSS 1936 dai file dell'utente (28/10/2026)
`germania_1936_oob.csv` e `urss_1936_oob.csv` in `data/units/source/` (copie non modificate). Le righe terrestri hanno la stessa virgola in più del file francese (riparata e contata). Le righe di marina e aviazione hanno campi spostati (DEU 2 righe, URSS 5) e **non vengono lette**: sono elencate in `malformedRows`.

**Germania** (+33 unità): conteggio invariato al 1/1/1936 (30 fanteria + 3 corazzate), come deciso. Aggiunti 13 Wehrkreis e 12 Armeekorps come comandi (`commandLevel`: `district`/`corps`; le divisioni assegnate ai corpi sono nella nota, non ancora come relazioni). Inattive per dubbio: 31ª–36ª Infanterie-Division (il CSV si ferma alla 30ª; formazione non verificata) e 2ª/3ª Kavallerie-Division (la 1ª era già dubbia). Non importate: 5 unità SS (non Heer), 3 incrociatori tascabili, 2 navi da battaglia (varate dopo il 1/1/1936), 9 Geschwader, 6 Luftkreis.

**URSS** (+49 unità): 12 distretti militari (attivi), 3 brigate aviotrasportate (attive, certezza probabile). Inattivi per dubbio: 23 corpi fucilieri e 7 di cavalleria (numerazione 1°–N° probabilmente generica; i corpi reali non erano numerati in sequenza) e 4 corpi meccanizzati (il file li numera 1°–4°; Wikipedia nomina l'11º e il 45º). **Il file non contiene divisioni di fucilieri**: restano le 15 del CSV, quindi il totale di divisioni 1936 dell'URSS è sconosciuto. Note dubbie del file: la Flotta del Nord "elevata a flotta nel 1935" (la data corretta è probabilmente il 1937, non verificata); marina e armate aeree non importate.

## Segnaposto fucilieri URSS e template (28/10/2026)
Su richiesta dell'utente: 46 divisioni anonime (`S36-USSR-F-nnn`, revisione `placeholder`, **inattive** nella politica strict), 2 per ciascuno dei 23 corpi fucilieri (limite basso di "2-3 divisioni" del file; 3 per corpo darebbe 69). Non sono unità storiche: numeri, nomi e distretti reali vanno inseriti dopo la revisione. Il template `data/units/templates/divisione_fucilieri_urss_1936.json` ha tutti i valori numerici a `null` (organico, reggimenti, equipaggiamento): nessun dato inventato. Da decidere con l'utente: quante divisioni, quali nomi reali, organico di pace/guerra, se sono territoriali o di quadri.

## Riferimenti per template di divisione e artiglieria (28/10/2026)
`data/units/templates/divisioni_1936_riferimenti.json`: forma della divisione (triangolare/quadrata) e artiglieria divisionale per nazione, ogni valore con anno di riferimento e fonte. **Quasi nessun valore è del 1936**: le fonti trovate sono del 1938–1943 (Germania 1943: 3 reggimenti, 36×105 mm + 12×150 mm, ~17.000 uomini; Francia 1939–40: 3 RI, 36×75 mm + 24×155 mm; Italia: triangolare fino al 1938, poi binaria). Verificato per il periodo prebellico solo: USA e Giappone con divisione quadrata, Italia triangolare prima del 1938. Non trovate: Regno Unito, organico di Giappone/USA/URSS, fucilieri sovietici 1936 (territoriali o di quadri). `null` = nessuna fonte, non inventato.
