# Rotte marittime (30/10/2026)

Primo livello delle rotte via mare per il commercio. Usa il grafo che esisteva già (`data/sea_zones.json`, 202 zone, 345 collegamenti mare–mare): nessuna geometria nuova. Qualità dei dati: **`hypothesis`** (parametri di progetto, non storici).

## Cosa fa
- **Costi**: ogni collegamento tra due zone ha una distanza (km tra i semi delle due zone, formula dell'emiverseno) e un tempo (km / velocità, con la velocità minore tra i tipi delle due zone). Approssimazione dichiarata: una zona viene attraversata «da seme a seme».
- **Porti**: una provincia per zona di mare, quella con più costa, solo se la costa è almeno `minCoastKm` (10 km). **Ipotesi**: finché non esistono i porti reali del 1936 ogni provincia costiera è un possibile porto. `nationPorts` accetta un filtro (`portFilter`) per restringere ai porti reali quando ci saranno.
- **Percorso**: `findSeaRoute` cerca il percorso più rapido (in giorni) tra i porti del venditore e quelli del compratore; aggiunge `2 × portHandlingDays` di sosta. Risultato: `{ ok, kind: 'sea', km, days, zones, via, ports }`; rifiuti motivati: `same_nation`, `no_port_seller`, `no_port_buyer`, `no_route`.
- **Stretti**: `straitControl` assegna a 7 stretti i controllori al 1/1/1936 (Gibilterra GBR, Suez EGY, Dardanelli e Bosforo TUR, Panama USA, Øresund DNK+SWE, Grande Belt DNK). Uno stretto si chiude a un contratto solo se **tutti** i controllori sono bloccati e nessuno è venditore o compratore (stessa regola della via terra). `via` elenca i controllori attraversati.
- **Ghiaccio**: non modellato. Le zone artiche di transito (`closedZones`: Oceano Artico, Arcipelago canadese, Beaufort, Bering, Siberia orientale, Laptev) sono chiuse sempre. Trovato in prova: senza questa chiusura il percorso più breve Germania–Giappone passava dal Polo. Barents, Mar Bianco e Mare di Groenlandia restano aperti (Murmansk, Arkhangelsk).
- **Commercio**: `openContract` accetta un percorso `kind: 'sea'`; il ritardo di consegna sono i `days` del percorso. `revalidateRoutes` ricontrolla i contratti via mare con `seaRouteOf` (cambia strada se lo stretto si chiude e c'è un giro, sospende se non c'è più passaggio, riattiva quando riapre). `openTradeContract` accetta `order.mode`: `'land'` (predefinito, come prima), `'sea'` o `'auto'` (il più rapido).

## File
- `data/sea_routes_params.json` (`sea-routes-v1`): velocità per tipo, sosta, soglia di costa, zone chiuse, controllo degli stretti. Controllato da `node scripts/validate-data.js`.
- `src/data/seaRoutes.js`: `validateSeaRoutesParams`, `buildSeaGraph`, `nationPorts`, `findSeaRoute`, `createSeaContext`, `haversineKm`.
- `src/rules/trade.js`, `src/game/tradeState.js`: integrazione.
- `tests/sea_routes.test.js`.

## Non fatto (limiti dichiarati)
- Interfaccia: nessun pannello o selettore del modo di trasporto; l'app non crea ancora il contesto marittimo.
- Salvataggio: un contratto via mare salva `route.zones` e `route.ports` dentro lo stato del commercio; **non è stata provata la migrazione né un salvataggio reale** (schema invariato, 7).
- Capacità dei porti (`INF-013/14/15` non sono collegate alle province), flotte e navi mercantili, rischi e perdite in mare, blocchi per guerra (oggi `blocked` e `closedZones` li passa il chiamante), stagioni.
- Traghetti (`data/city_links.json`, 41 tratte marittime province–province): fuori dal grafo del mare, come deciso.
- Velocità e controllo degli stretti sono scelte di Claude (`DESIGN_DEFAULT`), non verificate su fonti. Il regime del Bosforo cambia con la convenzione di Montreux (luglio 1936).
- Il controllo degli stretti è fisso nei parametri (non segue le conquiste). I porti usano il proprietario (`owner`) delle province, non il controllore effettivo (`controller`) di `DESIGN_CONTROLLO_TERRITORIO.md`: una colonia (per esempio la Libia, `owner` LBA) non dà porti all'Italia.
