# Risorse: punteggi di output e tiratura a punti

Bozza di design (`quality = reference`): serve a **bilanciare il gioco**, non a ricostruire la storia. Non è ancora collegata a partita, economia o interfaccia.
La tabella dei risultati è in `docs/RISORSE_PUNTI_TABELLA.md` (generata).

## Da dove si parte
- L'utente ha fornito (24/10/2026) lo stesso CSV dei luoghi delle risorse con una colonna in più, `punteggio_output_1_10`: copia byte per byte in `data/resources/risorse_con_punteggi.csv` (sha256 in `SOURCE_PUNTEGGI.json`). Le 196 righe coincidono con `risorse_riferimento.csv` in tutte le altre colonne.
- Il punteggio vale **dentro la risorsa**: 10 = massimo produttore di quella risorsa. Non si confrontano punteggi di risorse diverse.
- `data/resources/punteggi_output.csv` ha una riga per luogo: `score_user` (quello dell'utente, mai modificato), `score_final` (quello usato dal modello), `model_use` (`yes`/`no`), `note` (motivo obbligatorio per ogni correzione, esclusione o riga aggiunta da Claude).

## Regole del modello (`src/data/resourcePoints.js`, parametri in `data/resources/modello_punti.json`)
1. Entrano solo i **giacimenti** (`kind = deposit`) con `model_use = yes`. Fuori: aggregati, totali nazionali, flussi commerciali (18 righe) e un duplicato (nichel «Canada e Birmania», già contato come Sudbury).
2. Righe dello stesso luogo in anni diversi sono **un solo centro produttivo** (chiave: risorsa + paese + prima parola del luogo). **Base** = riga più antica (il gioco parte il 1° gennaio 1936); **picco** = punteggio massimo (crescita di guerra, `fattorePicco`: calcolato, non ancora applicato).
3. **Peso = step ^ (punteggio − 1)**: il punteggio è una scala logaritmica, ogni punto in più moltiplica la produzione per `step`.
4. I punti di ogni risorsa sommano a `budgetPerResource` (100, quindi sono percentuali della tiratura mondiale).
5. I punti di un centro vanno al suo **controllore** (`control_text`: il Regno Unito comprende dominion e colonie) e si dividono in parti uguali tra le sue **province** (`location_provinces.csv`). Un centro senza province (USA, Giappone, Cina, India…) conta solo a livello di nazione, finché non esistono quelle mappe.

## Scelta di `step` (Ipotesi)
- `step ≈ 2,8` riproduce la scala delle quantità reali (da 1 a 10 sono circa 4 ordini di grandezza), ma produce monopoli quasi totali (nichel 99%, molibdeno 98%, uranio 98%).
- `step = 1` rende tutti i giacimenti uguali: ignora i punteggi.
- **Default 1,7**: gli USA hanno il 24% del petrolio e il 21% del carbone, e i monopoli storici restano forti ma non assoluti. La tabella generata mostra la quota del primo a 1,4 / 1,7 / 2 / 2,8: la scelta finale è del game design.

## Correzioni ai punteggi (5, tutte in `punteggi_output.csv`)
| Riga | Prima | Dopo | Motivo |
| --- | ---: | ---: | --- |
| Carbone, Regno Unito | 8 | 9 | [Probabile] circa 200 Mt, più della Ruhr (130 Mt, 9) |
| Petrolio, URSS 1938 | 10 | 9 | [Probabile] 29,0 Mt come il Venezuela (27,6 Mt, 9); resta un solo 10 (USA) |
| Ferro, Germania | 6 | 8 | [Ipotesi] stessa quantità della Svezia (9) ma minerale povero |
| Ferro, Brasile | 3 | 2 | [Probabile] 30000 t, meno di Ungheria e Grecia (3) |
| Tungsteno, Portogallo 1943 | 8 | 7 | [Probabile] 2520 t come nel 1938 (7); il picco 1942 resta 8 |

Il punteggio dell'utente è sempre conservato in `score_user`: per tornare indietro basta rimettere lo stesso valore in `score_final`.

## Cose da sapere
- **Petrolio 1937:** i punteggi sono coerenti con i valori reali, non con le quantità del CSV, che sono circa un decimo (già segnalate `value_suspect`). Il modello usa solo i punteggi: le quantità non entrano.
- **Riga aggiunta da Claude** (petrolio tedesco, Nienhagen/Wietze/Hemmingstedt): punteggio 3 [Ipotesi], da confermare.
- **Basi dopo il 1938** (9 centri, per esempio rubber Malaya 1939, tungsteno USA 1943): il punteggio descrive un anno successivo alla partenza del gioco.
- **Lacune del CSV** [Probabile, da verificare prima di bilanciare]: alluminio senza USA, URSS, Francia e Regno Unito (la Germania ne risulta al 50%); ferro senza URSS (Krivoj Rog, Urali), Regno Unito, India, Cina; carbone senza Cina, Sudafrica, Australia; frumento con soli 5 centri. Il modello non aggiunge righe da solo: le lacune vanno decise insieme.
- **Copertura province:** molti centri non hanno ancora province (per esempio 19 su 24 del petrolio): contano solo per nazione.

## Come rigenerare
`npm run build:resource-points` → `data/resources/resource_points.json` e `docs/RISORSE_PUNTI_TABELLA.md`. `npm run validate:data` e `tests/resource_points.test.js` controllano che i file generati siano allineati e che il CSV ricevuto non sia alterato.
