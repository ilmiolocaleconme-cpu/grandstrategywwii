# Terreno delle province

Stato: **stima da raster Natural Earth (pubblico dominio), non quote misurate.** Dal 16/11/2026 il terreno entra nella **battaglia terrestre** (vedi «Terreno in battaglia»); movimento, rifornimenti e stagioni non lo usano ancora.

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

## Terreno in battaglia (16/11/2026, branch `test`)
Numeri in `data/units/terrain_combat.json` (**ipotesi di bilanciamento, da approvare**), calcolo in `src/rules/terrainCombat.js`, aggancio in `src/game/theaterState.js` (`battleGround`). Test: `tests/terrain_combat.test.js` (11).
- **Difesa**: la potenza dei difensori è moltiplicata per la media delle classi pesata sulle `frazioni` (pianura e deserto 1; tundra 1,05; collina 1,15; foresta 1,25; palude 1,3; montagna 1,5). Si moltiplica con trinceramento e resto.
- **Categoria**: ogni divisione, in attacco e in difesa, rende secondo il terreno (corazzati ×0,5 in montagna e palude, ×0,7 in foresta, ×1,1 nel deserto; truppe da montagna ×1,3 in montagna; fanteria ×0,9 solo in palude).
- **Fiume**: un attaccante il cui ultimo passo di marcia ha scavalcato un fiume medio (×0,75) o grande (×0,6) combatte ridotto finché resta in quel posto. Le coppie di posti divise da un fiume stanno in `data/military/river_crossings.json` (2.601 coppie, derivate dai ponti di `links.json`: `npm run build:river-crossings`); la provenienza è `state.movement.from`.
- **Zone urbane**: nessun terreno (valgono le regole urbane); il fiume conta solo se la coppia è nella tabella (oggi le zone urbane non ci sono).
- Dal 16/11/2026 la battaglia v2 (`docs/BATTAGLIA_V2.md`) aggiunge fuoco dalle armi, coesione, fronte, rifornimenti e perdite divise sopra queste regole.
- **Piani**: incarichi d'attacco del giocatore e IA di guerra contano la difesa del terreno nella superiorità richiesta (1,5:1 × terreno). Il fiume e il terreno per categoria **non** entrano ancora nella stima.
- **Registro battaglie**: «terreno: difesa +N%» e «N div. oltre il fiume».
- **Non fatto**: stato dei ponti (distrutto, riparato, genio), tempi di attraversamento nel movimento, stagioni (piene, gelo), terreno nel movimento e nei rifornimenti, scheda della provincia con il valore di difesa. In partita terreno e fiumi si caricano con due blocchi a parte: **non verificato** con `vite build`, nel browser e offline.
