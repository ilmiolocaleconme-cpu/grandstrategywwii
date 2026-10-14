# Design: controllo del territorio e Stati fantoccio

**Stato: solo progetto. Nessuna di queste regole è implementata** (nessun sistema di movimento, rifornimenti, diplomazia o eventi esiste nel codice). I dati le rendono possibili tramite la separazione tra `owner` (sovranità) e `controller` (controllo effettivo) in `data/political_1936.json`.

## Regole decise per gli Stati fantoccio

Un fantoccio ha `owner` = se stesso e `controller` = la potenza dominante (esempio: Manchukuo, `owner` MAN, `controller` JPN).

1. **Colore sulla mappa.** Colore dell'`owner`, con banda o tratteggio del colore del `controller`, così si riconosce subito un fantoccio.
2. **Accesso e rifornimenti.** La potenza `controller` si muove e si rifornisce nel territorio senza permesso, come in territorio proprio.
3. **Punti e condizioni di vittoria.** Il territorio fantoccio non conta come territorio della potenza `controller` finché non viene annesso.
4. **Annessione.** Azione esplicita che porta `owner` alla potenza dominante. È l'unico modo in cui un fantoccio "diventa" territorio della potenza. Storicamente non avviene (Mengjiang resta fantoccio fino al 1945), quindi è un percorso alternativo, non storico.

## Evento: nascita di Mengjiang

- **Perché un evento.** Al 1/1/1936 Mengjiang non esisteva: l'area era cinese (Chahar e Suiyuan, con un movimento autonomista mongolo e forte pressione giapponese). Per questo non è in `political_1936.json`.
- **Anagrafica.** È già in `nations.json` con `"appearsLater": true`; il validatore accetta un id assente da `political_1936` solo con quel campo, e lo rifiuta se l'id è già presente.
- **Effetto dell'evento.** Crea l'entità `{ id: "MENG", name: "Mengjiang", type: "puppet", owner: "MENG", controller: "JPN", status: "puppet", playable: false }` e sposta il territorio relativo da CHN a MENG.
- **Data.** **1936-05-12**, formazione del Governo Militare Mongolo, indicata come data di costituzione di Mengjiang (decisione del progetto; verificata su [Wikipedia: Mengjiang](https://en.wikipedia.org/wiki/Mengjiang), che riporta la data del 12 maggio 1936). Tappe successive, per eventuali eventi futuri: rinominato nell'ottobre 1937 come governo autonomo unificato mongolo; il 1° settembre 1939 diventa il governo autonomo unito di Mengjiang. Capitale indicata: Kalgan. Le condizioni di innesco restano da definire.
- **Territorio.** L'assegnazione delle province a MENG dipende dalla futura geometria della mappa; non è definita.
- **Giocabilità.** `playable: false` per ora. Se dovrà essere selezionabile, va deciso nel dato dell'evento.
