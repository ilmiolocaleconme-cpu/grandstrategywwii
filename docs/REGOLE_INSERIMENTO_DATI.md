# Regole per inserire dati geografici (province) — Grand Strategy WWII

Da passare a chi continua il lavoro. Riassumono come sono stati inseriti finora i dati e i controlli che devono passare. Repository: `ilmiolocaleconme-cpu/grandstrategywwii`, **branch `test`**. Non toccare `main`, `fronte1936`, `zerofila`. Niente force push. Niente cancellazioni o rinomine senza aver letto il contenuto.

## 1. Dove vanno i file
- Un file per nazione/territorio: `data/provinces/<OWNER>.json`. È una `FeatureCollection` con `"owner": "<OWNER>"`, **una feature per riga**.
- `data/provinces/_meta.json` (`schema: provinces-meta-v1`): `order` (elenco dei codici, tutti e soli i file presenti) e `metadata.coverage` / `limitations`. **`coverage[0]` deve restare la prima voce** (è il sentinella del precache). Aggiungere il nuovo codice a `order` e una riga a `coverage`.
- `<OWNER>` = un `id` che esiste in `data/political_1936.json`. Ogni file contiene solo province con quell'`owner`. Se il territorio non c'è nel catalogo politico, **prima** si aggiunge lì (con `owner`, `controller`, `status`).

## 2. Proprietario e controllore (colonie, mandati)
- Una colonia o un mandato è un territorio a sé (`LBA`, `ALG`, `SYR`…), con `controller` = chi lo controlla nel 1936 (Libia → `ITA`, Algeria → `FRA`, Palestina → `GBR`).
- Il **colore politico** e la legenda seguono `controller`; il pannello mostra «Territorio» e «Controllato da». Non mettere province coloniali dentro il file della madrepatria.
- L'Irlanda indipendente (`IRL`) non è nel Regno Unito (`GBR`): Irlanda del Nord sì, Stato Libero no.

## 3. Campi obbligatori di ogni provincia
`id`, `name`, `nameLocal`, `owner`, `adminLevel`, `kind`, `validFrom`, `validTo`, `dateBasis`, `borderQuality`, `source`, `license`, `derivedFromNe`, `knownIssues`, `notes`, più `feature.id` **uguale** a `properties.id`.
- `id`: `P_<OWNER>_<NOME_MAIUSCOLO_SENZA_ACCENTI>` (solo lettere, cifre, `_`; es. `P_LBA_TRIPOLI`). Unico in tutto il gioco.
- Date: `validFrom <= 1936-01-01 < validTo` (`9999-12-31` se non finisce); `dateBasis: "assumed"` se la data è un'ipotesi.
- `borderQuality`: `verified`, `approximate` o `hypothesis`. **Default `hypothesis`**. `verified` solo con fonte storica verificata del 1936.
- `source` e `license` sempre veri. Immagine fornita dall'utente = **solo guida di tracciamento**; se non si sa quale file è, scrivere «licenza da accertare». Natural Earth = Public Domain.
- `knownIssues`: etichette tecniche (`land_only`, `modern_borders`, `raggruppata_da_unita_attuali`, `tracciato_da_immagine`, `raster_0_002_gradi`, …); `notes`: spiegazione in italiano di ogni approssimazione.

## 4. Geometria
- Lon/lat gradi decimali, 4 decimali, `Polygon` o `MultiPolygon`; anello esterno per primo, anelli **chiusi** (primo = ultimo punto), almeno 4 punti, nessun anello che attraversa ±180° (spezzare in due).
- **Confini condivisi = stessi vertici.** Le province confinanti (anche di nazioni diverse) devono avere gli stessi vertici sul confine: niente sovrapposizioni né buchi. Procedura usata: costruire le catene dai confini topologici, agganciare (snap) i vertici esterni ai vertici dei vicini già presenti, propagare i nodi spostati a tutte le catene, riscrivere gli anelli.
- Fonte geometrica preferita: contorni attuali di Natural Earth 10m admin-1 v5.1.1 (da usare «ricomposti» su unità storiche); per i confini 1936 diversi da quelli attuali, tracciare da una mappa storica georeferenziata (scala + traslazione, controllare l'adattamento sul contorno attuale) e **ritagliare sulla terraferma**.
- Le unità storiche si ricompongono raggruppando unità attuali; dichiarare in `notes` cosa è stato accorpato (es. Powys = 3 contee; Yorkshire unico).
- Isole lontane (Canarie, Azzorre, Madeira…) restano alle **coordinate reali**, senza riquadri.

## 5. Dopo ogni inserimento (obbligatorio)
1. Aggiornare i conteggi attesi in `tests/province_files.test.js` (per nazione e totale) e nei test di area (`tests/*.test.js`).
2. Aggiungere un test per la nazione: numero di unità, aree plausibili (soglie larghe), città note dentro l'unità giusta (città costiere: punto subito all'interno), nessuna sovrapposizione col campionamento a 0,02° con i vicini.
3. Eseguire `node --test tests/*.test.js` (tutto verde) e, quando il registro npm è raggiungibile, `npm run validate:data` e `npm run build`.
4. Aggiornare `docs/DATI_PROVINCE.md`, `docs/STATO_IMPLEMENTAZIONE.md` e `_meta.json`.
5. Controllo visivo a 360×640 px (telefono): colori, etichette, legenda, nessuna sovrapposizione.
6. Commit sul branch `test` con messaggio chiaro, push senza force.

## 6. Cosa dichiarare nel resoconto
Distinguere sempre: **implementato e testato** / implementato ma non testato / parziale / prototipo / simulato / mancante. Non dichiarare verificati `vite build`, precache o offline se non eseguiti. Segnalare ogni approssimazione (confini attuali al posto di quelli 1936, unità accorpate, licenza non verificata).

## 7. Stato dei dati (16/10/2026, branch `test`)
1020 province in 45 file (ALG: 19 regioni strategiche accorpate da 48 wilaya attuali). Presenti: Europa centrale e occidentale, Baltici (Estonia, Lettonia, Lituania con Memel), Danimarca, Norvegia, Svezia, Finlandia, URSS (177 unità moderne, ipotesi), Balcani, Spagna, Portogallo, Marocco (francese e spagnolo), Regno Unito (Inghilterra 40, Galles 10, Scozia 32, Irlanda del Nord 6), Stato Libero d'Irlanda (5 province storiche), Islanda (1), Algeria, Tunisia, Libia (5 unità storiche 1934-43), Egitto, Palestina, Transgiordania, Siria, Libano, Turchia, Cipro, Malta, Gibilterra.
Mancanti, tra gli altri: Iran, Iraq, Iran, Africa a sud del Sahara, Asia, Americhe. Da fare: evento storico della guerra civile spagnola (luglio 1936), spezzare le geometrie a ±180° per Figi e Aleutine (la Ciukotka è già spezzata, con vertici di cucitura accoppiati), usare `lonDelta` nelle rotte; sostituire le unità sovietiche moderne con quelle del 1936 e correggere Petsamo, Carelia, Petseri, Abrene e Tuva.
Cautela: le province di molti paesi sono **confini attuali**, non quelli del 1936 (Libia è l'eccezione storica; Inghilterra ricomposta in contee 1936; Scozia a council area attuali).
