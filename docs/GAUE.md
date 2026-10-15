# Gaue della NSDAP come livello principale della Germania

**Stato: dati e mappa implementati e testati (logica e dati); tutti i confini sono ipotesi.** I 32 Gaue sostituiscono le 30 province/Länder tedesche in `data/provinces_1936.json` (feature `P_DEU_*`, `kind: nsdap_gau`). I Gaue sono distretti di partito, non una divisione amministrativa: la scelta è di design (richiesta dell'utente). Le vecchie province tedesche sono archiviate in `data/archive/provinces_deu_1936_lander.json` e **non sono più caricate dall'app**.

## Dati

- 32 Gaue (31 del Reich più Danzica resta provincia a sé `P_DANZIG_FREE_CITY`), `owner` `DEU`, `borderQuality: hypothesis`, `derivedFromProvinces` e `derivedPartialProvinces` indicano le province d'origine.
- **Slesia.** Il Gau Schlesien è tenuto diviso: **Niederschlesien** (dal Gau Schlesien) e **Oberschlesien** (dalla provincia dell'Alta Slesia). I Gaue con questi nomi esistono storicamente solo dal 1941; è una scelta di design dichiarata.
- **Riferimento storico.** Mappa fornita dall'utente (© B. Schulte, 01.2021, pannello 31.12.1937), non del 1° gennaio 1936. Nel 1936 il Gau si chiamava Mecklenburg-Lübeck e comprendeva Lubecca (nei dati è così); la Grande Amburgo (1937) non è recepita.
- **Licenza.** L'immagine è protetta da diritto d'autore. I dati contengono solo confini ricavati e semplificati; l'uso va chiarito prima di pubblicare (campo `license`).

## Come sono stati costruiti

1. **Segmentazione dell'immagine**: componenti connesse delle aree colorate separate dalle linee bianche dei Gaue; ogni componente è stata assegnata a un Gau dall'etichetta (nomi letti a mano), le piccole exclavi al Gau del vicino più prossimo.
2. **Georeferenziazione**: trasformazione polinomiale di secondo grado che massimizza la sovrapposizione col contorno delle province tedesche e di Danzica (IoU 0,96; con la sola affine 0,88). Scarto residuo di alcuni km ai bordi.
3. **Assegnazione**: ogni parte (poligono) di provincia va al Gau con più punti sulla mappa georeferenziata, tranne le città-stato (Amburgo → Hamburg, Brema → Weser-Ems, Lubecca → Mecklenburg-Lübeck, Berlino → Berlin). Sei parti sono divise perché contengono più Gaue: Baviera (5 Gaue più Saarpfalz per il Palatinato), Vestfalia (2), Provincia del Reno (4), Assia-Nassau (2), Hannover (3), Sassonia prussiana (3).
4. **Linee di taglio**: spigoli fra celle di 0,01° con Gau diverso, ripuliti (filtro di maggioranza, componente più grande per Gau, niente frammenti sotto 150 km²), semplificati con Douglas-Peucker a 0,04° (~4 km) e agganciati ai vertici del bordo della provincia (o a un vertice inserito sul suo spigolo).
5. **Unione**: le facce dello stesso Gau sono fuse cancellando gli spigoli condivisi; il bordo esterno è fatto con gli stessi spigoli delle province.

## Verifiche (`tests/gaue.test.js`)

- 32 nomi attesi, id unici, tutti `hypothesis` con fonte e licenza.
- 47 città note cadono ciascuna in un solo Gau, quello storico.
- Area totale dei Gaue = area delle province tedesche e di Danzica entro lo 0,5% e punti interni di ogni provincia coperti da un solo Gau.
- Bordi esterni uguali a quelli delle province (al massimo 8 spigoli suddivisi, oggi 4).
- Confronto con l'archivio delle vecchie province tedesche; Baviera divisa in almeno 6 Gaue; Oberschlesien derivato dall'Alta Slesia.

## Limiti

- I Gaue seguivano spesso i distretti (Kreis), che qui non esistono: dentro una provincia le linee sono approssimate.
- Sassonia prussiana, Hannover e Assia-Nassau: provinceIds ricavati dalla maggioranza di punti, non da liste storiche.
- Le exclavi minuscole (p. es. enclavi turingie) vanno al Gau del territorio che le circonda o a quello più vicino.
- Nessuna regola di gioco usa ancora le province.
- Confini interni semplificati con un passaggio topologico (spigoli condivisi, 39 tratti protetti): le enclavi sassoni restano frastagliate.
- Gli script di costruzione non sono nel repository; i dati risultanti sì.
