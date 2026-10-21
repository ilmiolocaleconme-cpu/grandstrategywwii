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

Sulla mappa si mostrano questi ponti **più** i passaggi di confine di `data/crossing_points.json` (livello dalla larghezza del fiume) solo dove sullo stesso fiume non c'è un ponte entro 15 km (`mergeCandidates`).

## Mappa (Canvas)

- Pulsante **═**: strade e ferrovie (spento all'avvio, il file si scarica alla prima accensione). Pulsante **⊓**: ponti.
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
- **2 (da zoom 20)**:** disegno «vero». Strada principale gialla con mezzeria; **autostrada a due carreggiate** con spartitraffico; **ferrovia con due rotaie e traversine**; **ferrovia potenziata a doppio binario** (quattro rotaie).
- **Ponti da zoom 20:** impalcato ruotato lungo la linea (campo `ang` in `data/transport_bridges.json`, gradi 0–179, direzione della strada/ferrovia più importante). Aspetto per tipo, stile dallo schema di riferimento: **legno** (strada secondaria: tavolato e montanti), **muratura** (strada principale e autostrada: mezzeria e spalle tonde), **ferro a traliccio con X** (doppio binario, strada+ferrovia), **ferrovia in ferro** (binario unico: blocchi agli angoli). Il materiale è un'**ipotesi grafica derivata dal livello**, non un dato storico.
- Zoom massimo portato da 40 a 120 (`MAX_K` in `src/map/geo.js`). Legenda con campioni disegnati dallo stesso codice della mappa.
Test: `tests/transport_style.test.js` (contesto Canvas simulato). Verificato con screenshot in Chromium headless; **non provato sul telefono reale**.

## Densità e zoom massimo

- Da molto lontano (zoom < 8) le strade e le ferrovie **non si disegnano**; fino a 12 restano autostrade e linee principali (rank ≤ 4), fino a 18 rank ≤ 6, poi tutto.
- Oltre zoom 20 i segni (spessori, tratteggi, impalcati dei ponti) crescono fino a ×2,6 a zoom 120 (`sizeBoost`), così a zoom massimo restano ben riconoscibili.
- Ponti diradati nella generazione (`thinDeg` 0,07° ≈ 5–8 km): sullo stesso fiume, il ponte più importante assorbe quelli vicini, così non ce ne sono quattro intorno allo stesso fiume. Le posizioni restano quelle vere degli incroci.

## Grafo dei collegamenti (la rete usata dalla mappa)

La mappa disegna `data/links.json` (schema `links-v2`, `src/data/links.js`, `scripts/build-links.js`, `npm run build:links -- <cartella Natural Earth con ne_10m_populated_places_simple.geojson>`), non più le linee di Natural Earth.
- **Sedi:** per ogni provincia la città più popolosa (Natural Earth populated places); senza città, un punto interno (`basis`).
- **Un collegamento per coppia di province confinanti** (`adjacency.json`: 4.341 coppie, 4.327 collegamenti: 14 tratte marittime lunghe, > 120 km, sono state scartate perché non servono al gioco). Niente linee parallele né sovrapposte.
- **Tracciato** (`src/data/linkroute.js`, 6 test): deve restare dentro le due province, mai sul mare né sopra una terza. Tentativi in ordine: 1) retta tra le sedi (2.368); 2) **un punto sul confine condiviso**, due tratti dritti (1.044); 3) percorso a griglia sulla terra delle due province (A*, senza tagli d'angolo) poi tirato a tratti dritti (598); 4) via terra ma passando sopra altre province, di solito sponde di fiume o enclave (239); 5) nessuna terra: **tratta marittima** (traghetto, tratteggio azzurro, sempre gradino 1, senza ponti): 92, di cui 78 restano (≤ 120 km). Il tipo di tracciato è nel campo `how` del collegamento (assente = retta).
- **Un solo tipo visibile per collegamento, scala a 6 gradini:** 1 strada sterrata · 2 strada · 3 strada principale · 4 autostrada · 5 ferrovia a binario unico · 6 ferrovia potenziata (doppio binario). La ferrovia sostituisce la strada.
- **Gradino di un collegamento:** dal percorso migliore sulla rete reale (`transport.json`) tra le due sedi, dentro le due province: il gradino raggiunto da almeno metà della lunghezza (il minimo assoluto sarebbe troppo severo); per le strade basta il 30% di autostrada 1936 per il gradino 4. Senza dati: strada sterrata. **Strozzatura:** un collegamento non supera mai il gradino delle sue due province (il gradino di una provincia è il massimo dei suoi collegamenti), verificato da `validateLinks` e dai test.
- **Ponti = tratti della linea:** dove la linea incrocia un fiume medio o grande, il tratto a cavallo (semilunghezza 1,2 / 2 / 3 km) diventa il ponte; uno per fiume e collegamento. Materiale per gradino: legno (1-2), muratura (3-4), ferro (5-6).
- **Disegno:** collegamenti da zoom 8 (ferrovie e autostrade), strade principali da 12, tutto da 18; sedi come punti da 12; da zoom 12 autostrada e doppio binario sono già due linee vicine; dettaglio completo (carreggiate, binari, ponti veri) da zoom 20.
- **Ponti (disegno, `drawBridgeDeck` in `transportStyle.js`, come nella tavola dei simboli):** legno (strade comuni e sterrate: tavolato, montanti tondi), muratura ad arco (strada principale: conci sfalsati, profilo ad arco, contrafforti quadrati), autostrada (due carreggiate, pile tonde), ferro a travata (binario unico: travi piene, blocchi di fondazione), ferro a traliccio (doppio binario: controventi a X). Il ponte è orientato come il tratto e lungo come lui, almeno 30 px. Il ponte autostradale compare solo in legenda finché nessun collegamento è un'autostrada.
- **Numeri attuali (2.084 province):** 4.327 collegamenti (sterrata 3.015, strada 182, principale 81, autostrada 0, ferrovia 542, potenziata 507; le 78 tratte marittime sono contate tra le sterrate), 1.713 sedi, 1.596 ponti. Nessuna autostrada compare perché dove esiste c'è anche una ferrovia, che vince.
- **Limiti:** rete moderna, non del 1936; i percorsi «sopra altre province» (239) sono la parte meno curata; strade solo principali nei dati; nessuna regola di gioco legata al grafo (movimento, rifornimenti, danni ai ponti, miglioramento di livello); collegamenti e ponti non toccabili.
`transport.json` resta solo come ingresso di calcolo (l'app non lo carica più); `transport_bridges.json` è stato eliminato.
