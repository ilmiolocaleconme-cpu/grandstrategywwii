# Strade, ferrovie e ponti

Stato: **dati reali ma di rete moderna** (Natural Earth 10m, pubblico dominio), tutti `hypothesis`. Il livello è **provvisorio**. Nessuna regola di movimento, costo o miglioramento in partita: qui c'è il terreno su cui costruirle.

## Dati

| File | Contenuto |
|---|---|
| `data/autostrade_1936.json` | Elenco curato delle prime autostrade (vedi sotto), ipotesi |
| `data/transport.json` (1,8 MB, ~430 kB compressi, caricato solo quando si accende il livello ═) | 15.199 tratti: 6.986 strade e 8.213 ferrovie, ritagliati sul territorio delle province, semplificati a 0,01° (~1 km), coordinate a 0,001°. Schema `transport-v1`: `{ id, k: 'road'\|'rail', level, rank, n?, y?, c: [lon, lat, …] }` (`n` e `y` solo sulle autostrade curate) |
| `data/transport_bridges.json` (~330 kB, caricato con la mappa) | 3.305 ponti candidati: dove una strada o ferrovia incrocia un fiume (tratti fuori dai laghi). Schema `transport-bridges-v1`: `{ id, riverId, lon, lat, road, rail, level }` |

Fonte: `ne_10m_roads` e `ne_10m_railroads` (Natural Earth, commit `ca96624`). I file sorgente (~90 MB) **non stanno nel repository**. Per rigenerare:

```
git clone --depth 1 --filter=blob:none --sparse https://github.com/nvkelso/natural-earth-vector ne
git -C ne sparse-checkout set --no-cone /geojson/ne_10m_roads.geojson /geojson/ne_10m_railroads.geojson
npm run build:transport -- ne/geojson      # circa 20 s
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
