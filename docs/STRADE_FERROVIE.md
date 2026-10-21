# Strade, ferrovie e ponti

Stato: **dati reali ma di rete moderna** (Natural Earth 10m, pubblico dominio), tutti `hypothesis`. Il livello è **provvisorio**. Nessuna regola di movimento, costo o miglioramento in partita: qui c'è il terreno su cui costruirle.

## Dati

| File | Contenuto |
|---|---|
| `data/transport.json` (1,8 MB, ~430 kB compressi, caricato solo quando si accende il livello ═) | 15.131 tratti: 6.918 strade e 8.213 ferrovie, ritagliati sul territorio delle province, semplificati a 0,01° (~1 km), coordinate a 0,001°. Schema `transport-v1`: `{ id, k: 'road'\|'rail', level, rank, c: [lon, lat, …] }` |
| `data/transport_bridges.json` (~330 kB, caricato con la mappa) | 3.304 ponti candidati: dove una strada o ferrovia incrocia un fiume (tratti fuori dai laghi). Schema `transport-bridges-v1`: `{ id, riverId, lon, lat, road, rail, level }` |

Fonte: `ne_10m_roads` e `ne_10m_railroads` (Natural Earth, commit `ca96624`). I file sorgente (~90 MB) **non stanno nel repository**. Per rigenerare:

```
git clone --depth 1 --filter=blob:none --sparse https://github.com/nvkelso/natural-earth-vector ne
git -C ne sparse-checkout set --no-cone /geojson/ne_10m_roads.geojson /geojson/ne_10m_railroads.geojson
npm run build:transport -- ne/geojson      # circa 20 s
```

## Livelli provvisori (`src/data/transport.js`)

- **Strade:** 1 = secondaria (tipo sconosciuto, `Road`, `Track`, …); 2 = principale (`Major Highway`, `Secondary Highway`, `expressway`). Le **autostrade restano a 2**: nel 1936 quasi non esistevano e il livello 3 stradale è quello a cui il giocatore potrà migliorare la strada (modello a livelli concordato).
- **Ferrovie:** 3 = linea principale (`scalerank` ≤ 6), 2 = binario unico/secondaria. L'**elettrificazione** (livello 4 del modello) non è nei dati: nei dati moderni è molto più estesa che nel 1936, quindi è lasciata al miglioramento in partita.
- **Ponti:** livello = il più alto tra strada e ferrovia sul punto (1 strada secondaria · 2 strada principale o ferrovia secondaria · 3 linea ferroviaria principale). `road` e `rail` conservano i due livelli.
- **Esclusi:** traghetti (strada e ferrovia), strade con `scalerank` > 6 e ferrovie con `scalerank` > 8 (per leggerezza). Il livello 1 dei ponti c'è (519) perché dentro le strade secondarie ci sono anche i piccoli fiumi.

## Come si calcolano i ponti

Incrocio tra i segmenti di ogni strada/ferrovia (a dettaglio pieno di Natural Earth, non semplificata) e i segmenti dei fiumi di `rivers_geo.json` (indice a celle da 0,25°). Incroci dello stesso fiume entro 0,02° sulla stessa linea sono uniti; strada e ferrovia affiancate (entro 0,03°) diventano un solo ponte. Posizione: sul fiume entro 1,5 km e sulla strada/ferrovia entro 2,5 km (testato).

Sulla mappa si mostrano questi ponti **più** i passaggi di confine di `data/crossing_points.json` (livello dalla larghezza del fiume) solo dove sullo stesso fiume non c'è un ponte entro 15 km (`mergeCandidates`).

## Mappa (Canvas)

- Pulsante **═**: strade e ferrovie (spento all'avvio, il file si scarica alla prima accensione). Pulsante **⊓**: ponti.
- Strade: colore e spessore (livello 1 sabbia sottile, 2 giallo più spesso). Ferrovie: tratteggio bianco, più spesso e più lungo per le linee principali.
- Densità per zoom: a vista d'insieme solo le linee con `scalerank` ≤ 4, da zoom 1,8 fino a ≤ 6, da zoom 3,5 tutte. Ponti: livello 3 sotto zoom 2,5, livelli ≥ 2 sotto zoom 5, poi tutti; due ponti nella stessa cella (24, 15 o 10 px) non si sovrappongono (vince il livello più alto).
- Legenda nel pannello «Legenda» (in alto a destra).

## Limiti

- **Rete moderna, non del 1936.** Linee chiuse o costruite dopo il 1936 sono sbagliate in entrambi i sensi; le strade principali di oggi sono più fitte di quelle di allora. Nessuna data per tratto.
- Linee a 1:10 milioni, semplificate: gli incroci con i fiumi sono precisi a qualche km, un ponte può cadere nel punto sbagliato di una città con più ponti, o mancare se strada e fiume sono semplificati in modo da non toccarsi.
- Nessun collegamento con città, porti e province; nessuna capacità numerica, velocità o costo; nessun stato in partita (danni, distruzione, miglioramento); i ponti non sono selezionabili al tocco; la mappa SVG di ripiego non li mostra.
- Non sono stati corretti a mano né i livelli né i ponti mancanti o doppi.
- Test: `tests/transport.test.js` (10).
