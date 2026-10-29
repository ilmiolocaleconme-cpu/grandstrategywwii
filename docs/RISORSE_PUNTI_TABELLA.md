# Tiratura delle risorse a punti (generato)

File generato da `npm run build:resource-points`: non modificare a mano. Spiegazione e regole in `docs/RISORSE_PUNTI.md`.
Parametri: step 1.7, 100 punti di output base mondiale per risorsa (quindi percentuali), almeno 2 livelli di sviluppo oltre la base. Punteggio 1 = peso 1; ogni punto in più moltiplica l'output per 1.7.

## Materie prime (livello Risorse della mappa)

| Risorsa | Centri | Primi tre controllori (output base) | Produttori effettivi | Potenziale mondiale (tetto / base) | Quota del primo a step 1.4 / 1.7 / 2 / 2.8 | Dominante |
| --- | ---: | --- | ---: | ---: | --- | --- |
| Antimonio | 7 | Cina 70%, Bolivia 14%, Messico 8% | 1.93 | ×1,57 | 50% / 70% / 82% / 94% | sì (Cina) |
| Bauxite | 12 | Francia 26%, Regno Unito 16%, Ungheria 15% | 6.55 | ×2,59 | 19% / 26% / 32% / 45% | no |
| Cromo | 5 | Regno Unito 56%, Turchia 35%, Francia 4% | 2.25 | ×2,89 | 53% / 56% / 57% / 57% | sì (Regno Unito) |
| Carbone | 18 | Stati Uniti 21%, Regno Unito 17%, Germania 15% | 7.26 | ×2,05 | 16% / 21% / 27% / 40% | no |
| Cobalto | 3 | Belgio 81%, Regno Unito 17%, Francia 2% | 1.45 | ×1,35 | 69% / 81% / 88% / 96% | sì (Belgio) |
| Minerale di ferro | 21 | Stati Uniti 19%, URSS 19%, Regno Unito 14% | 7.53 | ×1,76 | 14% / 19% / 23% / 30% | no |
| Manganese | 6 | URSS 62%, Regno Unito 26%, Brasile 7% | 2.16 | ×1,71 | 46% / 62% / 73% / 87% | sì (URSS) |
| Mercurio | 5 | Italia 47%, Spagna 47%, Cecoslovacchia 2% | 2.22 | ×1,76 | 42% / 48% / 49% / 50% | no |
| Molibdeno | 4 | Stati Uniti 86%, Cile 10%, Norvegia 2% | 1.34 | ×1,27 | 69% / 86% / 93% / 98% | sì (Stati Uniti) |
| Nichel | 3 | Regno Unito 90%, Francia 6%, Cuba 4% | 1.23 | ×1,19 | 76% / 90% / 96% / 99% | sì (Regno Unito) |
| Petrolio | 24 | Stati Uniti 24%, URSS 15%, Venezuela 14% | 7.73 | ×2,09 | 16% / 24% / 32% / 46% | no |
| Gomma naturale | 2 | Regno Unito 63%, Paesi Bassi 37% | 1.87 | ×1,26 | 58% / 63% / 67% / 74% | sì (Regno Unito) |
| Zolfo | 5 | Stati Uniti 80%, Italia 10%, Giappone 6% | 1.54 | ×1,39 | 60% / 80% / 90% / 98% | sì (Stati Uniti) |
| Stagno | 7 | Regno Unito 54%, Paesi Bassi 31%, Bolivia 11% | 2.51 | ×1,54 | 45% / 54% / 61% / 71% | sì (Regno Unito) |
| Tungsteno | 7 | Cina 65%, Portogallo 13%, Bolivia 8% | 2.19 | ×1,65 | 45% / 65% / 79% / 93% | sì (Cina) |
| Uranio | 5 | Belgio 86%, Regno Unito 10%, Cecoslovacchia 2% | 1.33 | ×1,33 | 72% / 86% / 93% / 98% | sì (Belgio) |
| Vanadio | 4 | Stati Uniti 57%, Peru 34%, Regno Unito 7% | 2.25 | ×2,89 | 48% / 57% / 63% / 73% | sì (Stati Uniti) |
| Frumento | 41 | Regno Unito 18%, Stati Uniti 14%, Francia 11% | 10.88 | ×2,72 | 16% / 19% / 20% / 28% | no |

## Prodotti (capacità industriale: fonderie e fabbriche, non giacimenti)

| Prodotto | Centri | Primi tre controllori (output base) | Produttori effettivi | Potenziale mondiale (tetto / base) | Quota del primo a step 1.4 / 1.7 / 2 / 2.8 | Dominante |
| --- | ---: | --- | ---: | ---: | --- | --- |
| Alluminio | 12 | Germania 23%, Stati Uniti 23%, Regno Unito 16% | 5.9 | ×2,55 | 20% / 23% / 27% / 34% | no |

«Produttori effettivi» = 1 / somma dei quadrati delle quote dei controllori (più è alto, più la risorsa è distribuita). «Dominante» = un solo controllore oltre il 50%. «Potenziale mondiale» = somma dei tetti di tutti i centri divisa per l'output base: di quanto può crescere in totale se ogni centro arriva al suo tetto.
