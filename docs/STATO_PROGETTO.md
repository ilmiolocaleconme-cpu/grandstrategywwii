# Stato del progetto — passaggio di consegne (03/11/2026)

Repo: `ilmiolocaleconme-cpu/grandstrategywwii`, branch `main`. Lingua di lavoro: italiano. Regola fissa: mai inventare dati storici (usare `null`/`MISSING_DATA` e dichiararlo); un solo schema scalabile per tutte le nazioni.

## Fatto e in `main`
- **Template unità v2** (`unit-template-v2`), catalogo equipaggiamenti (`equipment_id` = `<PREFISSO>-<NAZ>-<NOME>`), costruzione CSV→JSON (`npm run build:templates`), `templateFor(unit, templates, date)`.
- **Produzione equipaggiamenti** per categoria, a lotti (es. 14 giorni di costruzione, rilascio settimanale), consumo di acciaio proporzionale alla capacità. Prezzo = 1,25 × costo dei materiali, calcolato a runtime; scambiabile tra nazioni (`pezzi`).
- **Rinforzi automatici** con opzione per divisione di interromperli (interruttore "Rinforzi" nella scheda unità e nel menu radiale), trasporto via terra e via mare (porti propri), depositi = capitali.
- **Forze nel tempo**: `createForcesActivationSystem` crea le istanze quando le divisioni diventano attive. Template: DEU 1936/1939, GBR 1936, FRA 1936/1939, ITA 1940.
- **Sedi di guarnigione italiane**: `data/units/source/ita_sedi_guarnigione.json` (34 sedi, Wikipedia EN, fonte secondaria). Stima guarnigioni solo con unità attive al 1/1/1936.
- CI GitHub `test-and-build` (test + build app): è l'unico posto dove l'app viene compilata, nella sandbox di Claude npm/vite non si installano.

## Limiti noti (da non dimenticare)
1. **Aggiornamento template delle istanze** (04/11/2026, branch `claude/aggiornamento-template-divisioni`): implementato e testato per DEU e FRA (dal 1/9/1939), regola e mappa `data/units/equipment/upgrade_map.json` **da approvare** (dettagli in `docs/DATI_UNITA.md`). Finché la PR non è in `main`, i template 1939 non hanno effetto sulle istanze già create. Resta: antiaerei 20 mm tedeschi non accreditati, nessuna mappa per FRA (template 1936 senza quantità). Le 20 divisioni francesi sono quadri al 30%: ricevono equipaggiamento solo dopo la mobilitazione (legge DEU–POL implementata il 04/11/2026, vedi `docs/DATI_UNITA.md`); la parte Linea Maginot (divisioni ai confini, fortificazioni al massimo) **non è fatta**: mancano i parametri.
2. **Italia 1936**: si vedono solo le 4 divisioni alpine; le altre compaiono dal 1939-1942. La sede nei dati è di pace/formazione 1939-1943, non la posizione al 1936.
3. **Non collocate/da verificare**: 8ª Po, 1ª e 2ª Squadra navale, Comando Supremo, Regia Aeronautica; U00209 "32ª corazzata Ariete" è probabile doppione di U00218 (decidere se rimuoverla).
4. Classi mancanti in `CLASS_TO_CATEGORY` (fucile controcarro, mitra, antiaerei, cannoni di fanteria, cavalli); depositi solo nelle capitali per 7 nazioni.
5. Sedi italiane da fonti secondarie: verificare su fonti italiane (regioesercito.it, it.wikipedia) quando raggiungibili.

## Decisioni aperte dell'utente
- **Giappone**: aspettare una fonte del 1941 oppure usare i dati 1944 con la data corretta?
- **Scorta iniziale di acciaio delle nazioni minori** (760 t): abbassarla?
- **Report di produzione per stabilimento** salvato nello stato (consigliato: sì).
- **Aggiornamento template**: approvare o cambiare la regola implementata (carry-over con mappa, voci nuove da 0, eccedenza alla scorta, antiaerei persi, quadri che seguono la versione).
- **Partita da giugno 1940** per avere l'Italia completa (opzione 3 discussa).

## Prossime fasi
Fase 8 (altre nazioni con lo stesso schema), Fase 9 (combattimento). Interfaccia di scelta ricetta in `docs/UI_PROPOSTA_PRODUZIONE.md` non implementata. Agenti per bilanciamento produzioni e per le rotte non ancora lanciati.

## Come lavorare nel repo
- Test: `node --test tests/<file>.test.js` (la suite intera è lenta: un file alla volta in ciclo). Dati: `node scripts/validate-data.js`.
- Rigenerazioni: `node scripts/build-deployment.js` poi `node scripts/build-garrison.js`; `scripts/build-initial-stocks.js` dopo aver toccato ricette o capacità.
- Git: la GraphQL di `gh` non funziona, usare `gh api repos/ilmiolocaleconme-cpu/grandstrategywwii/...`. Clone shallow: creare il ref di tracking con `git fetch origin <branch>:refs/remotes/origin/<branch>`. I commit finiscono con le righe `Co-Authored-By` e `Claude-Session` indicate dalla sessione.
- Stile di risposta richiesto dall'utente: italiano, breve (lavora da telefono), prima la verità scomoda, etichette [Certo]/[Probabile]/[Ipotesi], dire apertamente quando qualcosa non va.
- Altri file di riferimento: `docs/DATI_UNITA.md` (tutte le decisioni sui dati), `docs/UI_PROPOSTA_PRODUZIONE.md`.
