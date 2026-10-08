Grand Strategy WWII — Architettura del progetto

1. Obiettivo

Grand Strategy WWII è un gioco strategico storico per dispositivi mobili, ambientato nell'epoca della Seconda guerra mondiale, con campagne dinamiche e percorsi storici o alternativi.

Il progetto deve privilegiare una simulazione coerente, una gestione accessibile e un'interfaccia ottimizzata per il gioco su mappa.

2. Principi architetturali

- Sistemi di gioco integrati e condivisi.
- Dati separati dalla logica di simulazione.
- Regole comuni a tutte le nazioni, con caratteristiche nazionali specifiche.
- Simulazione efficiente, adatta ai dispositivi mobili.
- Database strutturati e aggiornabili senza duplicare le regole.
- Compatibilità con JavaScript moderno e moduli ECMAScript.

3. Nazioni principali

Le nazioni iniziali prioritarie sono:

- Germania (Deutschland).
- Italia.
- Giappone.

L'architettura deve consentire l'aggiunta di altre nazioni, mantenendo compatibili economia, diplomazia, produzione, ricerca e sistemi militari.

4. Mappa strategica

La mappa globale costituisce l'interfaccia principale del gioco.

Deve supportare:

- Regioni, province, capitali e grandi città.
- Settori urbani per il combattimento nelle grandi città.
- Terreno, fiumi, condizioni meteorologiche e neve.
- Territori occupati e rischio di ribellione.
- Risorse, miniere, infrastrutture e impianti industriali.
- Strade e ferrovie con tre livelli di sviluppo.
- Porti, aeroporti, depositi e hub logistici.
- Livelli grafici selezionabili per economia, industria, territorio e condizioni operative.

I combattimenti urbani devono essere rappresentati sulla stessa mappa globale, senza obbligare il giocatore ad aprire una schermata separata.

5. Economia e industria

L'economia collega risorse, infrastrutture, produzione e fabbisogni militari.

Comprende:

- Miniere e depositi di risorse.
- Pozzi petroliferi e raffinerie.
- Carburanti sintetici prodotti dal carbone.
- Centrali a carbone, lignite e impianti idroelettrici.
- Industrie civili, militari, aeronautiche e cantieri navali.
- Produzione alimentare e progressi verso alimenti conservati.
- Collegamenti tra risorse, hub e stabilimenti.
- Potenziamento delle strutture attraverso tecnologie e investimenti.
- Efficienza produttiva progressiva per categorie di equipaggiamento.

L'acqua e l'uranio non fanno parte delle risorse gestionali previste.

Il giocatore mantiene il controllo sulle decisioni produttive. Il sistema può suggerire collegamenti industriali e logistici, senza applicarli automaticamente senza autorizzazione.

6. Sistema militare terrestre

L'organizzazione militare segue la gerarchia:

Teatri operativi → Corpi d'armata → Divisioni.

Le categorie comprendono:

- Fanteria.
- Fanteria semimotorizzata e motorizzata.
- Forze speciali.
- Carri armati.
- Artiglieria.
- Artiglieria semovente.
- Cacciacarri.
- Contraerea e unità di supporto.

Il sistema prevede simboli militari NATO, ufficiali assegnabili, trinceramenti, fortificazioni, modernizzazione, rimpiazzi e perdite.

7. Combattimento terrestre

Il combattimento utilizza un sistema condiviso di valori e modificatori.

I fattori comprendono:

- Forza e organizzazione delle unità.
- Equipaggiamento e qualità delle formazioni.
- Terreno, fiumi e fortificazioni.
- Meteo e condizioni stagionali.
- Rifornimenti e collegamenti logistici.
- Supporto aereo e artiglieria.
- Superiorità numerica e composizione delle forze.
- Esperienza, ufficiali e preparazione difensiva.

Le regole devono essere bilanciate tra le nazioni e utilizzare calcoli efficienti per i dispositivi mobili.

8. Aeronautica e marina

Aeronautica

Il sistema aereo utilizza teatri operativi, raggio d'azione e missioni per:

- Superiorità aerea.
- Intercettazione e difesa territoriale.
- Bombardamento.
- Supporto alle forze terrestri.
- Ricognizione e trasporto.
- Operazioni navali.

Le perdite possono essere compensate da riserve di velivoli, quando l'opzione è attiva. Non sono previste unità drone per l'ambientazione degli anni Trenta e Quaranta.

Marina

Le unità navali sono organizzate in flotte e teatri operativi.

Il sistema comprende costruzione nei cantieri, efficienza produttiva, ammodernamento nei porti, rotte commerciali marittime, rifornimenti oltremare e protezione delle linee di comunicazione.

Le rotte commerciali devono considerare la sicurezza marittima e le condizioni diplomatiche.

9. Logistica

La logistica deve essere semplice da comprendere, ma significativa sul piano strategico.

Comprende:

- Collegamenti terrestri tra unità, territori e hub.
- Capacità e colli di bottiglia logistici.
- Rifornimenti oltremare.
- Rotte marittime e commerciali.
- Raggio operativo dei velivoli.
- Protezione di porti, aeroporti, depositi e hub.

Il gioco deve indicare chiaramente le principali interruzioni e carenze di rifornimenti.

10. Diplomazia ed eventi storici

La diplomazia comprende trattati, commercio, aiuti, accesso ai territori alleati e relazioni internazionali.

L'accesso militare al territorio di un alleato richiede un'autorizzazione appropriata. La cooperazione economica non concede automaticamente il diritto di transito militare.

Gli eventi storici possono influenzare industria, unità, governi, alleanze e relazioni diplomatiche.

La campagna può seguire un percorso storico oppure svilupparsi attraverso scelte alternative. L'esito della guerra non deve essere vincolato automaticamente al 1945.

11. Ricerca e tecnologie

Gli alberi tecnologici sono strutturati per categorie condivise:

- Esercito e organizzazione militare.
- Veicoli, carri armati e artiglieria.
- Aeronautica.
- Marina.
- Industria ed economia.
- Estrazione mineraria e risorse.
- Energia e carburanti.
- Infrastrutture, logistica e mimetizzazione.

Le tecnologie comuni sbloccano capacità generali; i dati nazionali definiscono modelli ed equipaggiamenti specifici.

12. Dati e interoperabilità

I database devono essere separati dalla logica del gioco.

I file CSV sono previsti per dati tabellari quali unità, navi, ufficiali, tecnologie e modelli nazionali.

Ogni database deve avere identificativi coerenti, campi documentati e relazioni verificabili con gli altri sistemi.

Le modifiche devono evitare duplicazioni, riferimenti mancanti e incompatibilità tra moduli.

13. Interfaccia mobile

L'interfaccia deve consentire di gestire le principali attività dalla mappa.

Priorità:

- Comandi touch intuitivi.
- Schede unità e strutture leggibili.
- Livelli informativi selezionabili.
- Ordini rapidi e gestione semplificata.
- Indicatori visivi per rifornimenti, produzione, combattimento e diplomazia.
- Riduzione delle operazioni ripetitive.

14. Principi di sviluppo

- JavaScript moderno con moduli ECMAScript.
- Separazione tra dati, simulazione e interfaccia.
- Sistemi modulari con contratti e identificativi condivisi.
- Validazione dei CSV e dei riferimenti tra database.
- Test delle regole prima dell'integrazione.
- Ottimizzazione per dispositivi mobili.
- Documentazione aggiornata insieme alle modifiche.

15. Ordine di sviluppo

1. Struttura del progetto e modelli dei dati.
2. Mappa strategica e territori.
3. Nazioni, unità e organizzazione militare.
4. Economia, risorse e industria.
5. Logistica e combattimento.
6. Aeronautica e marina.
7. Diplomazia ed eventi storici.
8. Ricerca e progressione tecnologica.
9. Interfaccia mobile e bilanciamento.
10. Test integrati e prima versione giocabile.

16. Regola fondamentale

Ogni sistema deve essere progettato come parte di un'unica simulazione strategica.

Le regole condivise devono rimanere coerenti tra le nazioni, mentre differenze storiche, industriali e militari devono emergere dai dati e dalle caratteristiche nazionali.
