# Inventario dei dati (generato)

File generato da `node scripts/report-inventory.js`: **non modificarlo a mano**.
Conta ciò che è nei file di `data/`; non dice se i dati sono storicamente corretti né se il gioco li usa.

## Cataloghi

| Catalogo | File | Voci |
|---|---|---|
| Nazioni | `data/nations.json` | 72 |
| Entità politiche 1/1/1936 | `data/political_1936.json` | 190 |
| Province | `data/provinces/*.json` | 3088 in 178 file |
| Risorse | `data/resources.json` | 32 |
| Fiumi | `data/rivers.json` | 1200 |
| Laghi | `data/lakes.json` | 2484 |
| Attraversamenti (ponti, guadi, traghetti) | `data/crossings.json` | 9 |
| Zone marittime | `data/sea_zones.json` | 202 |
| Adiacenze terrestri | `data/adjacency.json` | 7423 |
| Collegamenti tra province | `data/links.json` | non contati qui (vedi `npm run validate:data`) |
| Nodi urbani | `data/city_links.json` | 2089 |
| Collegamenti urbani | `data/city_links.json` | 2546 |
| Terreno (province madri con voce propria) | `data/terrain.json` | 2601 |
| Regioni | `data/regions.json` | 39 |
| Unità (catalogo da CSV) | `data/units/units.json` | 512 |
| Edifici | `data/buildings.json` | 14 |

## Qualità dei confini delle province

Su 3088 province: verificate 0, approssimate 54, ipotesi 3034.

## Province per file

| Codice | Province | Approssimate | Ipotesi | Verificate |
|---|---|---|---|---|
| AFG | 34 | 0 | 34 | 0 |
| AGO | 18 | 0 | 18 | 0 |
| ALB | 18 | 0 | 18 | 0 |
| ALG | 19 | 0 | 19 | 0 |
| ANT | 3 | 0 | 3 | 0 |
| ANTB | 7 | 0 | 7 | 0 |
| ANTF | 2 | 0 | 2 | 0 |
| ARG | 23 | 0 | 23 | 0 |
| AUS | 10 | 0 | 10 | 0 |
| AUT | 11 | 11 | 0 | 0 |
| BEL | 13 | 13 | 0 | 0 |
| BEN | 11 | 0 | 11 | 0 |
| BFA | 13 | 0 | 13 | 0 |
| BGR | 34 | 0 | 34 | 0 |
| BGU | 10 | 0 | 10 | 0 |
| BHR | 1 | 0 | 1 | 0 |
| BHS | 1 | 0 | 1 | 0 |
| BLZ | 6 | 0 | 6 | 0 |
| BNB | 4 | 0 | 4 | 0 |
| BOL | 9 | 0 | 9 | 0 |
| BOT | 9 | 0 | 9 | 0 |
| BRA | 28 | 0 | 28 | 0 |
| BSO | 1 | 0 | 1 | 0 |
| BTN | 1 | 0 | 1 | 0 |
| BUR | 14 | 0 | 14 | 0 |
| CAF | 16 | 0 | 16 | 0 |
| CAN | 12 | 0 | 12 | 0 |
| CEY | 9 | 0 | 9 | 0 |
| CHE | 26 | 0 | 26 | 0 |
| CHL | 17 | 0 | 17 | 0 |
| CHN | 27 | 0 | 27 | 0 |
| CIV | 19 | 0 | 19 | 0 |
| CMR | 10 | 0 | 10 | 0 |
| COD | 11 | 0 | 11 | 0 |
| COG | 11 | 0 | 11 | 0 |
| COL | 32 | 0 | 32 | 0 |
| COM | 2 | 0 | 2 | 0 |
| CPV | 1 | 0 | 1 | 0 |
| CRI | 8 | 0 | 8 | 0 |
| CUB | 16 | 0 | 16 | 0 |
| CYP | 6 | 0 | 6 | 0 |
| CZE | 5 | 4 | 1 | 0 |
| DANZIG | 2 | 2 | 0 | 0 |
| DEU | 52 | 0 | 52 | 0 |
| DJI | 1 | 0 | 1 | 0 |
| DNK | 12 | 0 | 12 | 0 |
| DOM | 31 | 0 | 31 | 0 |
| ECU | 24 | 0 | 24 | 0 |
| EGY | 38 | 0 | 38 | 0 |
| ERI | 6 | 0 | 6 | 0 |
| ESH | 2 | 0 | 2 | 0 |
| ESP | 80 | 0 | 80 | 0 |
| EST | 12 | 0 | 12 | 0 |
| ETH | 10 | 0 | 10 | 0 |
| FGU | 1 | 0 | 1 | 0 |
| FIN | 29 | 0 | 29 | 0 |
| FJI | 5 | 0 | 5 | 0 |
| FLK | 2 | 0 | 2 | 0 |
| FRA | 122 | 0 | 122 | 0 |
| FRO | 1 | 0 | 1 | 0 |
| GAB | 9 | 0 | 9 | 0 |
| GAM | 1 | 0 | 1 | 0 |
| GBR | 114 | 0 | 114 | 0 |
| GHA | 10 | 0 | 10 | 0 |
| GIB | 1 | 0 | 1 | 0 |
| GIN | 7 | 0 | 7 | 0 |
| GNB | 7 | 0 | 7 | 0 |
| GNQ | 1 | 0 | 1 | 0 |
| GRC | 39 | 0 | 39 | 0 |
| GRL | 6 | 0 | 6 | 0 |
| GTM | 22 | 0 | 22 | 0 |
| GUM | 1 | 0 | 1 | 0 |
| HKG | 1 | 0 | 1 | 0 |
| HND | 17 | 0 | 17 | 0 |
| HTI | 10 | 0 | 10 | 0 |
| HUN | 23 | 0 | 23 | 0 |
| IND | 48 | 0 | 48 | 0 |
| INDO | 54 | 0 | 54 | 0 |
| IRL | 8 | 0 | 8 | 0 |
| IRN | 31 | 0 | 31 | 0 |
| IRQ | 18 | 0 | 18 | 0 |
| ISL | 1 | 0 | 1 | 0 |
| ITA | 87 | 1 | 86 | 0 |
| JAM | 1 | 0 | 1 | 0 |
| JOR | 12 | 0 | 12 | 0 |
| JPN | 48 | 0 | 48 | 0 |
| JPN_MANDATE | 4 | 0 | 4 | 0 |
| KAR | 1 | 0 | 1 | 0 |
| KEN | 8 | 0 | 8 | 0 |
| KOR | 24 | 0 | 24 | 0 |
| KUW | 1 | 0 | 1 | 0 |
| LBA | 5 | 0 | 5 | 0 |
| LBN | 6 | 0 | 6 | 0 |
| LBR | 15 | 0 | 15 | 0 |
| LES | 1 | 0 | 1 | 0 |
| LIE | 1 | 0 | 1 | 0 |
| LTU | 12 | 0 | 12 | 0 |
| LUX | 3 | 3 | 0 | 0 |
| LVA | 11 | 0 | 11 | 0 |
| MAL | 13 | 0 | 13 | 0 |
| MAN | 3 | 0 | 3 | 0 |
| MAR | 19 | 0 | 19 | 0 |
| MAR_ES | 2 | 0 | 2 | 0 |
| MAU | 1 | 0 | 1 | 0 |
| MDG | 22 | 0 | 22 | 0 |
| MDV | 1 | 0 | 1 | 0 |
| MEX | 33 | 0 | 33 | 0 |
| MLI | 8 | 0 | 8 | 0 |
| MLT | 1 | 0 | 1 | 0 |
| MNG | 22 | 0 | 22 | 0 |
| MOZ | 10 | 0 | 10 | 0 |
| MRT | 13 | 0 | 13 | 0 |
| MWI | 6 | 0 | 6 | 0 |
| NCL | 3 | 0 | 3 | 0 |
| NEP | 14 | 0 | 14 | 0 |
| NER | 8 | 0 | 8 | 0 |
| NFL | 1 | 0 | 1 | 0 |
| NGA | 37 | 0 | 37 | 0 |
| NGU | 14 | 0 | 14 | 0 |
| NHEB | 1 | 0 | 1 | 0 |
| NIC | 17 | 0 | 17 | 0 |
| NLD | 15 | 0 | 15 | 0 |
| NLD_EI | 33 | 0 | 33 | 0 |
| NOR | 55 | 0 | 55 | 0 |
| NRU | 1 | 0 | 1 | 0 |
| NZL | 6 | 0 | 6 | 0 |
| OMN | 11 | 0 | 11 | 0 |
| PAL | 8 | 0 | 8 | 0 |
| PAN | 12 | 0 | 12 | 0 |
| PAP | 5 | 0 | 5 | 0 |
| PER | 25 | 0 | 25 | 0 |
| PHL | 17 | 0 | 17 | 0 |
| POL | 20 | 20 | 0 | 0 |
| PRI | 1 | 0 | 1 | 0 |
| PRT | 30 | 0 | 30 | 0 |
| PRY | 17 | 0 | 17 | 0 |
| PYF | 1 | 0 | 1 | 0 |
| QAT | 1 | 0 | 1 | 0 |
| ROM | 54 | 0 | 54 | 0 |
| RUN | 1 | 0 | 1 | 0 |
| RWA | 21 | 0 | 21 | 0 |
| SAU | 13 | 0 | 13 | 0 |
| SEN | 14 | 0 | 14 | 0 |
| SEY | 1 | 0 | 1 | 0 |
| SIA | 6 | 0 | 6 | 0 |
| SLB | 10 | 0 | 10 | 0 |
| SLE | 4 | 0 | 4 | 0 |
| SLV | 14 | 0 | 14 | 0 |
| SOM | 12 | 0 | 12 | 0 |
| STP | 1 | 0 | 1 | 0 |
| SUD | 27 | 0 | 27 | 0 |
| SUR | 8 | 0 | 8 | 0 |
| SVA | 1 | 0 | 1 | 0 |
| SWA | 13 | 0 | 13 | 0 |
| SWE | 27 | 0 | 27 | 0 |
| SWZ | 1 | 0 | 1 | 0 |
| SYR | 18 | 0 | 18 | 0 |
| TCD | 21 | 0 | 21 | 0 |
| TGO | 1 | 0 | 1 | 0 |
| TIB | 1 | 0 | 1 | 0 |
| TIM | 1 | 0 | 1 | 0 |
| TRU | 1 | 0 | 1 | 0 |
| TTO | 1 | 0 | 1 | 0 |
| TUN | 24 | 0 | 24 | 0 |
| TUR | 98 | 0 | 98 | 0 |
| TWN | 4 | 0 | 4 | 0 |
| TZA | 26 | 0 | 26 | 0 |
| UGA | 4 | 0 | 4 | 0 |
| URY | 19 | 0 | 19 | 0 |
| USA | 53 | 0 | 53 | 0 |
| USSR | 334 | 0 | 334 | 0 |
| VEN | 23 | 0 | 23 | 0 |
| WSM | 1 | 0 | 1 | 0 |
| YEM | 20 | 0 | 20 | 0 |
| YUG | 48 | 0 | 48 | 0 |
| ZAF | 9 | 0 | 9 | 0 |
| ZAM | 10 | 0 | 10 | 0 |
| ZIM | 9 | 0 | 9 | 0 |

## Lacune misurate

- Province senza terreno, contando l'ereditarietà delle sponde dalla madre: **6** su 3088 (P_USSR_CHUKCHI_AUTONOMOUS_OKRUG_SP2, P_USSR_CHUKCHI_AUTONOMOUS_OKRUG_SP3, P_USSR_CHUKCHI_AUTONOMOUS_OKRUG_SP4, P_USSR_CHUKCHI_AUTONOMOUS_OKRUG_SP6, P_USSR_CHUKCHI_AUTONOMOUS_OKRUG_SP7, P_USSR_CHUKCHI_AUTONOMOUS_OKRUG_SP9).
- Entità politiche 1936 senza file di province (12): ADN, AND, CMR_GB, DOD, GOA, IFN, KWT, MAC, MCO, SMR, TGO_GB, VAT.
- Nazioni di `nations.json` senza file di province, esclusi i territori che compaiono dopo (4): AND, MCO, SMR, VAT.
- File di province il cui codice non è in `political_1936.json` (0): nessuno.
