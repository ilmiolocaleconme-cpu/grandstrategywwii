# Gaue della NSDAP (livello aggiuntivo alle province)

**Stato: dati e livello sulla mappa implementati e testati (logica e dati); tutti i confini sono ipotesi.** I Gaue sono distretti di partito, non una divisione amministrativa: stanno **accanto** alle province (`data/provinces_1936.json`), non le sostituiscono.

## Dati

- `data/gaue_1936.json`: 32 Gaue (31 del Reich più Danzica), id `G_*`, `owner` `DEU` (Danzica: `DANZIG`), `borderQuality: hypothesis`, `provinceIds` (province coperte) e `partialProvinceIds` (province divise).
- **Riferimento storico.** La mappa di origine (fornita dall'utente, © B. Schulte, 01.2021, pannello 31.12.1937) è del dicembre 1937, non del 1° gennaio 1936. Differenze note: nel 1936 il Gau si chiamava Mecklenburg-Lübeck e comprendeva lo Stato di Lubecca (nei dati è così); la Grande Amburgo (1° aprile 1937) non è recepita (Amburgo è la sola città-stato). Gli stessi Gaue erano già in vigore a gennaio 1936 (Saarpfalz, Kurhessen, Mainfranken, Franken e Bayerische Ostmark nascono tra il 1933 e il 1935), ma i confini interni non sono verificati.
- **Licenza.** L'immagine è protetta da diritto d'autore. I dati contengono solo confini ricavati e semplificati (fatti storici, geometria rifatta), ma l'uso va chiarito prima di pubblicare. Segnalato in `license` e in `limitations`.

## Come sono stati costruiti

1. **Segmentazione dell'immagine**: componenti connesse delle aree colorate separate dalle linee bianche dei Gaue; ogni componente è stata assegnata a un Gau dall'etichetta (nomi letti a mano), le piccole exclavi al Gau del vicino più prossimo.
2. **Georeferenziazione**: trasformazione polinomiale di secondo grado che massimizza la sovrapposizione col contorno delle province tedesche e di Danzica (IoU 0,96; con la sola affine 0,88). Scarto residuo di alcuni km ai bordi.
3. **Assegnazione**: ogni parte (poligono) di provincia va al Gau con più punti sulla mappa georeferenziata, tranne le città-stato (Amburgo → Hamburg, Brema → Weser-Ems, Lubecca → Mecklenburg-Lübeck, Berlino → Berlin). Sei parti sono divise perché contengono più Gaue: Baviera (5 Gaue più Saarpfalz per il Palatinato), Vestfalia (2), Provincia del Reno (4), Assia-Nassau (2), Hannover (3), Sassonia prussiana (3).
4. **Linee di taglio**: spigoli fra celle di 0,01° con Gau diverso, ripuliti (filtro di maggioranza, componente più grande per Gau, niente frammenti sotto 150 km²), semplificati con Douglas-Peucker a 0,04° (~4 km) e agganciati ai vertici del bordo della provincia (o a un vertice inserito sul suo spigolo).
5. **Unione**: le facce dello stesso Gau sono fuse cancellando gli spigoli condivisi; il bordo esterno è fatto con gli stessi spigoli delle province.

## Verifiche (`tests/gaue.test.js`, 6 test)

- 32 nomi attesi, id unici, tutti `hypothesis` con fonte e licenza.
- 47 città note cadono ciascuna in un solo Gau, quello storico.
- Area totale dei Gaue = area delle province tedesche e di Danzica entro lo 0,5% e punti interni di ogni provincia coperti da un solo Gau.
- Bordi esterni uguali a quelli delle province (al massimo 8 spigoli suddivisi, oggi 4).
- Il validatore (`checkGaue` in `src/data/validate.js`) rifiuta una provincia inesistente.

## Limiti

- I Gaue seguivano spesso i distretti (Kreis), che qui non esistono: dentro una provincia le linee sono approssimate.
- Sassonia prussiana, Hannover e Assia-Nassau: provinceIds ricavati dalla maggioranza di punti, non da liste storiche.
- Le exclavi minuscole (p. es. enclavi turingie) vanno al Gau del territorio che le circonda o a quello più vicino.
- Nessun effetto sul gioco: i Gaue sono solo un livello della mappa (nessuna regola li usa).
- Gli script di costruzione non sono nel repository; i dati risultanti sì.
