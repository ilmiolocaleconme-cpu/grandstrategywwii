# Strade, ferrovie e ponti

Stato: **dati reali ma di rete moderna** (Natural Earth 10m, pubblico dominio), tutti `hypothesis`. Il livello è **provvisorio**. Nessuna regola di movimento, costo o miglioramento in partita: qui c'è il terreno su cui costruirle.

## Dati

| File | Contenuto |
|---|---|
| `data/autostrade_1936.json` | Elenco curato delle prime autostrade (vedi sotto), ipotesi |
| `data/transport.json` (**solo ingresso di calcolo** di `build-links.js`, l'app non lo carica più; 1,8 MB, ~430 kB compressi, caricato solo quando si accende il livello ═) | 15.199 tratti: 6.986 strade e 8.213 ferrovie, ritagliati sul territorio delle province, semplificati a 0,01° (~1 km), coordinate a 0,001°. Schema `transport-v1`: `{ id, k: 'road'\|'rail', level, rank, n?, y?, c: [lon, lat, …] }` (`n` e `y` solo sulle autostrade curate) |

Fonte: `ne_10m_roads` e `ne_10m_railroads` (Natural Earth, commit `ca96624`). I file sorgente (~90 MB) **non stanno nel repository**. Per rigenerare:

```
git clone --depth 1 --filter=blob:none --sparse https://github.com/nvkelso/natural-earth-vector ne
git -C ne sparse-checkout set --no-cone /geojson/ne_10m_roads.geojson /geojson/ne_10m_railroads.geojson
npm run build:transport -- ne/geojson      # circa 20 s: rifà solo data/transport.json (i vecchi ponti candidati sono stati eliminati: li sostituiscono i ponti del grafo)
```

## Livelli provvisori (`src/data/transport.js`)

- **Strade:** 1 = secondaria (tipo sconosciuto, `Road`, `Track`, …); 2 = principale (`Major Highway`, `Secondary Highway`, `expressway`); 3 = **autostrada delle prime curate** (vedi sotto). Le autostrade moderne non curate restano a 2: nel 1936 quasi non esistevano e il livello 3 stradale è anche quello a cui il giocatore potrà migliorare la strada (modello a livelli concordato).
- **Ferrovie:** 3 = linea principale (`scalerank` ≤ 6), 2 = binario unico/secondaria. L'**elettrificazione** (livello 4 del modello) non è nei dati: nei dati moderni è molto più estesa che nel 1936, quindi è lasciata al miglioramento in partita.
- **Ponti:** livello = il più alto tra strada e ferrovia sul punto (1 strada secondaria · 2 strada principale o ferrovia secondaria · 3 autostrada curata o linea ferroviaria principale). `road` e `rail` conservano i due livelli.
- **Esclusi:** traghetti (strada e ferrovia), strade con `scalerank` > 6 e ferrovie con `scalerank` > 8 (per leggerezza). Il livello 1 dei ponti c'è (519) perché dentro le strade secondarie ci sono anche i piccoli fiumi.

## Le prime autostrade (livello 3)

`data/autostrade_1936.json` (schema `autostrade-v1`) elenca **13 autostrade aperte entro il 1936**: 8 italiane (Milano–Laghi 1924, Roma–Ostia 1928, Napoli–Pompei 1929, Milano–Bergamo–Brescia 1931, Torino–Milano 1932, Firenze–mare 1932, Padova–Venezia 1933, Genova–Serravalle 1935) e 5 tedesche (Köln–Bonn 1932, Frankfurt–Darmstadt–Mannheim–Heidelberg 1935, München–Salzburg, Halle–Leipzig e Berlin–Stettin 1936). **Anni e percorsi sono dalla memoria dell'autore, non verificati** (`dateBasis: memory_unverified`): la richiesta è che la mappa sia plausibile, non accurata.

Ogni autostrada è una spezzata tra città di passaggio (coordinate al centro città). I tratti di `Major Highway` o `expressway` di Natural Earth che corrono entro `snapKm` = 7 km da quella spezzata diventano **livello 3** (`n` = nome, `y` = anno di apertura, `rank` forzato a 4, quindi visibili già a vista d'insieme); il resto della stessa strada resta a 2. Le strade di rango basso (7-9) si tengono solo dentro questi corridoi. Km agganciati per autostrada in `transport.json` → `autostrade[].matchedKm`: si va da 17 km (Roma–Ostia, 25 km di spezzata) a 172 km (München–Salzburg); **Berlin–Stettin è agganciata solo per 47 km su circa 127** (Natural Earth ha pochi tratti nel corridoio) e Padova–Venezia e Firenze–mare superano la spezzata perché agganciano anche strade parallele. Nessun tratto è stato inventato: dove Natural Earth non ha la strada, l'autostrada ha un buco.

## Come si calcolano i ponti

Incrocio tra i segmenti di ogni strada/ferrovia (a dettaglio pieno di Natural Earth, non semplificata) e i segmenti dei fiumi di `rivers_geo.json` (indice a celle da 0,25°). Incroci dello stesso fiume entro 0,02° sulla stessa linea sono uniti; strada e ferrovia affiancate (entro 0,03°) diventano un solo ponte. Posizione: sul fiume entro 1,5 km e sulla strada/ferrovia entro 4 km (testato; le linee affiancate si uniscono entro 0,03°, quindi la posizione è quella del primo incrocio).

Sulla mappa i ponti si vedono come tratti della linea quando è accesa la rete (pulsante ═): non esiste più un livello separato di marcatori dei ponti.

## Mappa (Canvas)

- Pulsante **═**: strade e ferrovie (spento all'avvio, il file si scarica alla prima accensione). Livelli e zoom stanno nella barra in alto.
- Strade: colore e spessore (livello 1 sabbia sottile, 2 giallo più spesso, 3 arancio spesso per le autostrade). Ferrovie: tratteggio bianco, più spesso e più lungo per le linee principali.
- Densità per zoom: a vista d'insieme solo le linee con `scalerank` ≤ 4, da zoom 1,8 fino a ≤ 6, da zoom 3,5 tutte. Ponti: livello 3 sotto zoom 4, livelli ≥ 2 sotto zoom 8, poi tutti; due ponti nella stessa cella (28, 16 o 10 px) non si sovrappongono (vince il livello più alto).
- Legenda nel pannello «Legenda» (in alto a destra).

## Limiti

- **Rete moderna, non del 1936.** Linee chiuse o costruite dopo il 1936 sono sbagliate in entrambi i sensi; le strade principali di oggi sono più fitte di quelle di allora. Nessuna data per tratto.
- Linee a 1:10 milioni, semplificate: gli incroci con i fiumi sono precisi a qualche km, un ponte può cadere nel punto sbagliato di una città con più ponti, o mancare se strada e fiume sono semplificati in modo da non toccarsi.
- Nessun collegamento con città, porti e province; nessuna capacità numerica, velocità o costo; nessun stato in partita (danni, distruzione, miglioramento); i ponti non sono selezionabili al tocco; la mappa SVG di ripiego non li mostra.
- Non sono stati corretti a mano né i livelli né i ponti mancanti o doppi.
- Test: `tests/transport.test.js` (13).

## Aspetto sulla mappa (disegno per zoom)

Un solo file, `src/map/transportStyle.js`, decide l'aspetto di linee, ponti e legenda. Tre livelli di dettaglio dallo zoom (soglie 12 e 20; i ponti diventano impalcati da 20):
- **0 (lontano):** linee semplici per livello.
- **1 (da zoom 12):** strade con bordo scuro, ferrovie a tratteggio.
- **2 (da zoom 20)**:** disegno «vero». Strada principale gialla con mezzeria; **ferrovia con due rotaie e traversine**. Sempre **una sola corsia o un solo binario**: autostrade a due carreggiate e doppio binario sono state tolte (21/10/2026).
- **Ponti da zoom 20:** impalcato ruotato lungo la linea (campo `ang` in `data/transport_bridges.json`, gradi 0–179, direzione della strada/ferrovia più importante). Aspetto per tipo, stile dallo schema di riferimento: **legno** (strada secondaria: tavolato e montanti), **muratura** (strada principale e autostrada: mezzeria e spalle tonde), **ferro a traliccio con X** (doppio binario, strada+ferrovia), **ferrovia in ferro** (binario unico: blocchi agli angoli). Il materiale è un'**ipotesi grafica derivata dal livello**, non un dato storico.
- Zoom massimo portato da 40 a 120 (`MAX_K` in `src/map/geo.js`). Legenda con campioni disegnati dallo stesso codice della mappa.
Test: `tests/transport_style.test.js` (contesto Canvas simulato). Verificato con screenshot in Chromium headless; **non provato sul telefono reale**.

## Densità e zoom massimo

- Da molto lontano (zoom < 8) le strade e le ferrovie **non si disegnano**; fino a 12 restano le ferrovie (rank ≤ 4), fino a 18 anche le strade principali (rank ≤ 6), poi tutto.
- Oltre zoom 20 i segni (spessori, tratteggi, impalcati dei ponti) crescono fino a ×2,6 a zoom 120 (`sizeBoost`), così a zoom massimo restano ben riconoscibili.
- Ponti diradati nella generazione (`thinDeg` 0,07° ≈ 5–8 km): sullo stesso fiume, il ponte più importante assorbe quelli vicini, così non ce ne sono quattro intorno allo stesso fiume. Le posizioni restano quelle vere degli incroci.

## Grafo dei collegamenti (la rete usata dalla mappa)

La mappa disegna `data/links.json` (schema `links-v2`, `src/data/links.js`, `scripts/build-links.js`, `npm run build:links -- <cartella Natural Earth con ne_10m_populated_places_simple.geojson>`), non più le linee di Natural Earth.
- **Sedi:** per ogni provincia la città più popolosa (Natural Earth populated places); senza città, un punto interno (`basis`).
- **Un collegamento per coppia di province confinanti** (`adjacency.json`: 3.817 coppie, 3.807 collegamenti: 10 tratte marittime lunghe, > 120 km, sono state scartate perché non servono al gioco). Niente linee parallele né sovrapposte.
- **Tracciato** (`src/data/linkroute.js`, 10 test): deve restare dentro le due province, mai sul mare né sopra una terza. **Lungo le coste** (21/10/2026): i primi tentativi chiedono un **margine di 1,5 km dal mare** (`COAST_MARGIN_KM`; i primi e ultimi 8 km vicino alle sedi sono esenti, le città possono stare sulla costa) e la griglia paga ×4 le celle accanto al mare, così il collegamento rientra verso l'interno; se il giro è più lungo di 1,5 × la distanza + 6 km, o non esiste, si ripiega sul tracciato rasente di prima. Tentativi in ordine: 1) retta tra le sedi (2.111); 2) **un punto sul confine condiviso**, due tratti dritti (953); 3) percorso a griglia sulla terra delle due province (A*, senza tagli d'angolo) poi tirato a tratti dritti (528); 4) via terra ma passando sopra altre province, di solito sponde di fiume o enclave (184); 5) nessuna terra: **tratta marittima** (traghetto, tratteggio azzurro, sempre gradino 1, senza ponti): 41, entro 120 km. Poi **ogni angolo si arrotonda** (`smoothPath`: arco quadratico con taglio da 0,45 a 0,05 dei due lati, il primo che resta dentro le province; se nessuno va, l'angolo resta). Il tipo di tracciato è nel campo `how` del collegamento (assente = retta).
- **Un solo tipo visibile per collegamento, scala a 4 gradini, sempre una sola corsia o un solo binario:** 1 strada sterrata · 2 strada · 3 strada principale · 4 ferrovia. Le autostrade (livello 3 di `transport.json`) contano come strada principale, ogni ferrovia (anche a doppio binario) è il gradino 4, che sostituisce la strada.
- **Gradino di un collegamento:** dal percorso migliore sulla rete reale (`transport.json`) tra le due sedi, dentro le due province: il gradino raggiunto da almeno metà della lunghezza (il minimo assoluto sarebbe troppo severo); senza regola speciale per le autostrade 1936. Senza dati: strada sterrata. **Strozzatura:** un collegamento non supera mai il gradino delle sue due province (il gradino di una provincia è il massimo dei suoi collegamenti), verificato da `validateLinks` e dai test.
- **Ponti = tratti della linea:** dove la linea incrocia un fiume medio o grande, il tratto a cavallo (semilunghezza 1,2 / 2 / 3 km) diventa il ponte; uno per fiume e collegamento. Materiale per gradino: legno (1-2), muratura (3), ferro a travata (4).
- **Disegno:** collegamenti da zoom 8 (ferrovie), strade principali da 12, tutto da 18; sedi come punti da 12; dettaglio completo (mezzeria, binari, ponti veri) da zoom 20.
- **Ponti (disegno, `drawBridgeDeck` in `transportStyle.js`, come nella tavola dei simboli):** legno (strade comuni e sterrate: tavolato, montanti tondi), muratura ad arco (strada principale: conci sfalsati, profilo ad arco, contrafforti quadrati), autostrada (due carreggiate, pile tonde), ferro a travata (ferrovia: travi piene, blocchi di fondazione). Il ponte è orientato come il tratto, lungo come lui ma tra 16 e 30 px (`BRIDGE_MIN_PX`, `BRIDGE_MAX_PX`) e disegnato al 70% (`BRIDGE_SCALE`): più piccolo della linea di cui è un tratto (22/10/2026). Il ponte in ferro a traliccio (strada + ferrovia insieme) resta nel codice ma nessun collegamento lo usa e non è in legenda; ponte autostradale e ponte a doppio binario sono stati eliminati.
- **Numeri attuali (1.643 province dopo la fusione delle sponde piccole, 22/10/2026):** 3.807 collegamenti (sterrata 2.510, strada 182, principale 78, ferrovia 1.037; le 31 tratte marittime rimaste sono contate tra le sterrate), 6.392 tratti, 1.454 sedi, 1.407 ponti; `links.json` 1,5 MB. Tracciati: 2.111 rette, 953 con punto sul confine, 528 a griglia, 184 sopra altre province, 41 marittimi (10 scartati perché > 120 km).
- **Limiti:** rete moderna, non del 1936; i percorsi «sopra altre province» (239) sono la parte meno curata; strade solo principali nei dati; nessuna regola di gioco legata al grafo (movimento, rifornimenti, danni ai ponti, miglioramento di livello); collegamenti e ponti non toccabili.
`transport.json` resta solo come ingresso di calcolo (l'app non lo carica più); `transport_bridges.json` è stato eliminato.
