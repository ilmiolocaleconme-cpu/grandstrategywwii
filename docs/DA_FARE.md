# Da fare (29/10/2026)

Elenco di tutto ciò che è rimasto in sospeso. Stato: **tutto qui è mancante o da approvare** salvo dove indicato. Aggiornare questo file quando una voce si chiude.

## A. Decisioni dell'utente da prendere (nessuna formula si inventa)
1. **Soglie dello stato operativo** (Pronta / Ridotta / Inefficiente / Non operativa): ora 80/50/20 per ogni componente, `DESIGN_DEFAULT` in `data/units/condition_config.json`. Da approvare o cambiare per componente.
2. **Esperienza sul campo**: quanto e come cresce con combattimenti e operazioni prolungate (le divisioni del 1936 oggi restano a 45 per sempre).
3. **Rimpiazzi ed esperienza**: quanto la abbassano rimpiazzi inesperti/esperti e perdite di personale esperto.
4. **Morale**: variazione per ciascuna causa (perdite, sconfitte, accerchiamento, fame, isolamento, bombardamenti, vittorie, riposo, rotazione, comandanti efficaci, eventi) e velocità di recupero. Oggi fermo a 45.
5. **Prontezza**: pesi di munizioni, carburante, rifornimenti, riparazioni, riposo; regola di recupero in area sicura (richiede definire «area sicura»).
6. **Politica d'impiego** (conservativa/normale/aggressiva): oggi solo memorizzata; su cosa deve agire quando esisteranno combattimento e fronti.
7. **Fatica**: non compare in nessun documento guida. Decidere se esiste come valore distinto o è compresa in morale/prontezza.
8. **Affiatamento / «artefatto»**: non implementare senza proposta esplicita (specifica §9).
9. **Documento 07 (Politica, popolazione, economia, mobilitazione)**: il file ricevuto contiene solo il titolo: rinviarlo con il testo.
10. **Regole di rinforzo da confermare**: i rinforzi già partiti arrivano anche se la divisione viene poi sospesa; l'eccesso torna al pool/scorta; «richiesta» = solo priorità.
11. **Template britannico**: valori di pace 1936 (previsto provvisorio da ipotesi 1939-40), discrepanza TA 14 vs 12; se importare il CSV britannico col metodo tedesco (1st Cavalry Division e 66th come `date_doubt`, TA «probabile»).
12. **Quadri delle altre nazioni** (CHN, FRA, ITA, JPN, USA, USSR): `expandsTo` ancora nullo; leggi di mobilitazione non modellate.

## B. Scenari di test della specifica non ancora verificabili
Verificati oggi: 1, 2, 8, 9 (e intervalli, idempotenza dei tick, salvataggio, determinismo) in `tests/division_condition.test.js`.
- 3 (veterana, morale alto, prontezza bassa per munizioni): mancano le munizioni nella prontezza.
- 4 (accerchiata, rifornimenti insufficienti): mancano accerchiamento e rifornimenti.
- 5 e 6 (forti perdite con rimpiazzi inesperti / esperti): mancano perdite e la formula dell'esperienza.
- 7 (area sicura senza equipaggiamento) e 10 (logistica interrotta): mancano area sicura e logistica.

## C. Sistemi mancanti da cui dipende il resto
- Combattimento e perdite con morti/feriti/dispersi.
- Collegare `src/rules/hospitals.js` allo stato (feriti, ospedali costruiti, ritorno al pool); ordine di ricostituzione della specifica §7 (feriti guariti → rimpiazzi dal pool → personale nuovo → equipaggiamento → trasporto → tempo).
- Rete logistica e indicatore di rifornimento per divisione; categoria di mobilità con camion/carburante calcolati.
- Fronti e «area sicura».
- Qualità tecnologica dell'equipaggiamento (serve l'albero tecnologico).
- Chiamare `markNew` (`src/rules/divisionCondition.js`) quando una divisione viene mobilitata/creata dopo il 1936: oggi non è collegato.
- Comandanti delle divisioni (oggi modellati solo corpi e armate).

## D. Movimento e mappa
- Fiumi e attraversamenti (ponti, guadi) nel movimento: requisito del progetto, non applicato.
- Terreno, stagione, ferrovia, mare, guerra/accessi/diplomazia nel movimento (si entra solo in province proprie).
- Velocità di marcia per categoria (`MARCH_KM_PER_DAY`): valori provvisori di bilanciamento da validare.
- Elenco delle unità nel pannello provincia; frecce degli ordini sulla mappa; segnalini delle nazioni oltre le prime due («+N») non cliccabili; mappa SVG di riserva senza segnalini.

## E. Dati
- Dislocazione 1936: 25 unità con stazione non risolvibile; 3 divisioni britanniche (3ª, 4ª, 5ª) e la 23. Infanterie-Division senza sede.
- Dislocazione derivata (ipotesi): sostituire con dati storici per unità quando disponibili.

## F. Verifiche mai eseguite
`vite build`, `node scripts/check-precache.js`, CI, funzionamento offline (compreso il caricamento di `adjacency.json` a partita aperta), resa grafica e tocco dei segnalini su telefono.

## G. Regole qualitative del morale e della prontezza date dall'utente (29/10/2026, 17:47) — NON ancora implementabili
Dettate dall'utente, senza numeri. Dipendono da sistemi che non esistono (combattimento, prestigio, cattura/morte di ufficiali).
- **Morale sale con**: pause operative (riposo), vittorie, **punteggio prestigio nazionale** (non esiste nel repository: va definito).
- **Morale scende con**: molte perdite di uomini in battaglia; battaglie perse, **anche** quando un ufficiale di alto rango viene catturato o ucciso: il comandante del corpo d'armata gerarchicamente sopra la divisione e, peggio ancora, il comandante dell'armata aggregata (serve ORBAT + stato degli ufficiali: oggi un ufficiale non può morire né essere catturato).
- **Prontezza**: dipende dal riposo dopo le battaglie precedenti, «ecc.» (elenco da completare).
- **Conflitto da risolvere** con l'allegato «12c56c54» (proposta di un altro assistente, in parte difforme dalla specifica tecnica): lì la prontezza = organizzazione/addestramento e lo stato operativo è un valore 0–100 che sale e scende; nella specifica tecnica la prontezza è materiale (uomini, mezzi, munizioni, carburante, riposo) e lo stato operativo è DERIVATO e non memorizzato. Implementato oggi: la specifica tecnica. Servono la tua scelta e una scala unica.
- Dall'allegato, ancora da confermare: nessun problema deve abbassare tutti e tre i valori (es. senza carburante la fanteria a piedi combatte quasi normalmente, la corazzata no); avvisi al giocatore solo per divisioni in condizioni preoccupanti; i rimpiazzi non trasformano reclute in veterani; evitare di applicare due volte la stessa penalità.
