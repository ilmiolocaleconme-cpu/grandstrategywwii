# Terreno delle province

Stato: **stima da raster Natural Earth (pubblico dominio), non quote misurate.** Nessuna regola di gioco usa ancora il terreno: qui ci sono i dati e il livello «Terreno» della mappa su cui costruirle.

## Dati
- `data/terrain.json` (schema `terrain-v1`): 1.026 province madri su 1.027. Le **sponde** dei fiumi ereditano il terreno della madre (`parentProvince`); le **zone urbane** restano `urbano` (`data/citta_grandi.json`).
- **Senza dato**: `P_USSR_CHUKCHI_AUTONOMOUS_OKRUG` (a cavallo dell'antimeridiano ±180°; lo script lo salta). Sulla mappa è grigio scuro.
- Per provincia: `terreno` (principale), `secondario` (se ≥ 20 %), `frazioni` (quota di area per tipo), `rugosita`, `tinta`, `campioni` (pixel), `affidabilita` (`bassa` < 4 pixel, `media` < 20, `normale`).

## Tipi (7 + urbano)
pianura, collina (include gli altopiani aperti), montagna, foresta, palude, deserto, tundra, urbano.

## Come si calcola (`scripts/terrain/build_terrain.py`, `npm run build:terrain -- --raster … --vector …`)
Raster 1:50m di Natural Earth (circa 3,7 km per pixel), ogni provincia campionata con i suoi poligoni (sovracampionati ×4, pixel di costa esclusi):
1. **Rugosità** = deviazione standard 5×5 del rilievo ombreggiato (`GRAY_50M_SR`). ≥ 14 montagna, ≥ 5 collina, sotto pianura.
2. **Tinta ipsometrica** (`HYP_50M_SR`, R − B mediato): sale con la quota media. ≥ 20 terreno rialzato (collina anche se piatto: Meseta, Anatolia); ≥ 28 con rugosità ≥ 9 montagna.
3. **Copertura** (`NE2_50M_LC_SR`): verde-azzurro = foresta (G − R ≥ 27 a sud di 58° N, ≥ 14 a nord: taiga); beige pallido = deserto; sopra 66° N senza foresta = tundra. Foresta sostituisce pianura e collina, non montagna.
4. **Poligoni NE**: deserti con nome e playas → deserto; delta del Danubio e del Volga → palude (il Delta del Nilo è agricolo, escluso).
5. **Etichetta**: montagna se ≥ 35 % dell'area è montagna, altrimenti il tipo con più area. Le frazioni restano nel file per regole più fini.
Soglie in `CONFIG` dello script, tarate su ~60 luoghi noti (Alpi, Po, Polonia, Meseta, Sahara, Lapponia, Pripet…). Anteprima: `--preview out.png`.

## Limiti (da sapere prima di usarlo nelle regole)
- **Non sono quote.** Nessun modello altimetrico (DEM) era raggiungibile dall'ambiente (pip, npm e siti esterni bloccati; solo GitHub). Con un DEM vero (SRTM/ETOPO) la classificazione migliorerebbe molto.
- **Foresta**: i colori non separano bosco da colture di una stessa tonalità (Landes e Polonia hanno colori simili). Tende a sovrastimare in Europa centrale e a sottostimare i boschi isolati.
- **Palude**: i dati NE hanno solo i delta del Danubio e del Volga. Le **paludi del Pripet** sono un poligono **a mano, approssimato (ipotesi)** in `PALUDI_MANUALI`; coprono per intero le province che le contengono (Polesie 67 %). Mancano Po, Camargue, Zeeland, Biebrza, torbiere finlandesi.
- **Altopiani**: contati come collina; la Meseta e l'Anatolia centrale non hanno un tipo proprio.
- Province piccole (Gibilterra, Malta, Liechtenstein, città-stato): pochi pixel, `affidabilita` bassa.
- Le province di molti paesi sono confini attuali, non del 1936 (vedi `REGOLE_INSERIMENTO_DATI.md`).
- La Lombardia risulta «montagna» col 41 % di Alpi e il 49 % di pianura: il singolo tipo per provincia è una semplificazione; usare `frazioni`.

## Mappa
Livello **Terreno** (pulsanti dei livelli, legenda e scheda provincia con «stima da raster»). Il file (~200 kB) si scarica solo quando si apre il livello, per non far ricostruire il modello della mappa all'avvio.
