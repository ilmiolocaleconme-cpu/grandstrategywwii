# Contratto dati delle unità — fase 1 (05/11/2026)

Scopo: elencare cosa il gioco conosce di ogni unità, da dove viene, cosa manca e cosa non è modellato. Documento di sola descrizione: non cambia codice, dati né salvataggi. Base: audit di fase 0 (`docs/` e scratchpad), letture dirette del codice indicate in ogni riga.

Legenda provenienza: **catalogo** = `data/units/units.json` (statico); **template** = `data/units/templates/*.json`; **stato** = `state` di partita (salvato); **regola** = codice in `src/rules` (calcolato, non salvato); **config** = dati di bilanciamento in `data/units/condition_config.json`.

## 1. Catalogo unità (`data/units/units.json`, 512 voci, sola lettura)

| Campo | Presenza | Significato | Note |
|---|---|---|---|
| `id` | 512/512 | Identificativo `U#####` | Stabile, non è il nome |
| `nation` | 512/512 | Paese | |
| `branch` | 512/512 | Forza armata (testo) | Solo terra nel catalogo |
| `echelon` | 512/512 | `command`, `division`, `brigade` | Nessun valore navale o aereo |
| `category` | 512/512 | `command`, `infantry`, `mountain`, `airborne`, `cavalry`, `motorized`, `mechanized`, `armored` | Mappate ai tipi di consumo in `src/rules/militaryReserve.js` |
| `variant`, `rawType`, `name` | 512/512 | Variante, tipo grezzo, nome | `name` è il nome mostrato |
| `startYear`, `endYear`, `sourceStartYear`, `startPrecision`, `dating` | 512/512 | Date di attivazione e precisione | `isActiveAt` in `src/data/units.js` usa `startYear`/`endYear` |
| `source`, `verification` | 512/512 | Fonte e stato di verifica | |
| `review` | 512/512 | Revisione (stato, nota) | Usata da `isActiveAt` in modalità strict |
| `commandLevel` | 157/512 | `corps`, `army`, `support`… | Solo per i comandi |
| `corps`, `army` | 192 e 52 | Appartenenza gerarchica iniziale | Dato di partenza, non stato |
| `station` | 73/512 | Sede | Non per tutte le unità |
| `supersededBy` | 4/512 | Successore | Genealogia parziale |
| `note`, `placeholder` | 102 e 46 | Nota; segnaposto | I segnaposto non vanno mostrati come dati |

**Non presenti nel catalogo**: navi, aerei, personale, equipaggiamento, cavalli, comandanti (questi vengono da altri file), feriti, veterani, genealogia completa, ritratti, simboli.

## 2. Template (`data/units/templates/*.json`, schema `unit-template-v1` / `v2`)

Campi di primo livello: `schema`, `id`, `status`, `note`, `appliesTo` (nazione, categoria, scaglione, `activeFrom`), `orgLevel`, `formation`, `mobility`, `regimentsInfantry`, `battalionsPerRegiment`, `manpower`, `horses`, `equipment`, `organicSupport`, `effectiveSupply`, `costs`.

Ogni voce numerica ha la forma `{ value, basis, referenceYear, source, effective: { value, asOf, basis, source } }` (`src/data/templates.js`).

| Elemento | Significato | Provenienza |
|---|---|---|
| `value` | Valore previsto dal template | Dichiarata nel file |
| `basis` | `utente`, `ipotesi`, `fonte`… (ammessi in `BASES`) | Dichiarata; validata in `templates.js` |
| `referenceYear` | Anno del dato | Obbligatorio per `utente` (validazione strict) |
| `effective.value` | Dotazione effettiva | `null` finché non c'è un dato con data |
| `status` | Testo libero (es. `BOZZA_DA_CONFERMARE`) | Non controllato dal codice |

**Template incompleti**: un valore `null` con `basis: "da_definire"` significa "non definito": `compositionOf` (`src/rules/unitInfo.js:27`) lo salta e non lo mostra.

**Template presenti** (sample da `data/units/templates`): Germania fanteria 1936/1939, Germania corazzata 1936, Francia fanteria 1936/1939, Gran Bretagna fanteria 1936, Italia fanteria 1940. Il catalogo di equipaggiamento è in `data/units/equipment/catalog.json`.

## 3. Istanze di divisione (`state.forces.divisions`, schema `forces-v1`, stato)

Una voce per divisione con template: `{ templateId, since, items, cadre? }`.
- `items`: mappa per voce (`manpower.war`, `manpower.cadre`…), con `planned`, `effective`, `source` (`src/rules/forces.js`, `buildDivision`).
- `cadre: true` solo per i quadri (`startsAsCadre` nel template).
- Le divisioni senza template non hanno istanza: non si inventa una dotazione.

**Campi del personale presenti**: solo `manpower.war` e `manpower.cadre`. Non esistono ufficiali, sottufficiali, truppa, specialisti, equipaggi, feriti, dispersi, prigionieri, caduti, veterani come voci separate.

## 4. Condizione (`state.conditions`, schema `conditions-v1`, stato)

`{ schema, byUnit: { [unitId]: { experience, morale, readiness, policy, isNew, trainedThrough? } } }` (`src/rules/divisionCondition.js`, `src/game/conditionState.js`). Il campo è opzionale: se assente, `createConditionState()` lo crea vuoto.

Parametri (config, non stato): `data/units/condition_config.json` (`condition-v1`). Livelli di esperienza: Recluta 0–19, Addestrata 20–39, Esperta 40–59, Veterana 60–79, Élite 80–100. Unità nuove: esperienza 10, morale 45, prontezza 45. Tetto di addestramento: 39.

**Derivati (non salvati)**: stato operativo (`operationalState`), fascia di valore (`valueBand`), forza materiale (`materialStrength`). Calcolati da `divisionCondition.js`, non memorizzati.

## 5. Comandanti (`state.commanders`, schema `commanders-v1`, stato)

`assignments[unitId] = { officerId, source, since }` (`src/rules/commanders.js`). Livelli gestiti: solo `corps` e `army` (`MANAGED_LEVELS`). Le divisioni hanno `non_gestito`. Ufficiali: `data/officers/officers.json` (sola lettura).

## 6. Gerarchia ORBAT (`state.orbat`, schema `orbat-v1`, stato)

`{ schema, links: { [childId]: parentId } }` (`src/rules/orbat.js`). Livelli inquadrabili (`orbatLevel`): `command` (corps, army…), `support`, `division` (divisioni e brigate). Aerei, navi, distretti: `null` (non inquadrabili). Operazioni validate: `canAttach`, `attach`, `detach`.

## 7. Movimento e rinforzi (stato)

- `state.movement` (`movement-v1`): `positions` e `orders` per unità (`src/rules/movement.js`). Opzionale.
- `state.forces.transfers`: rinforzi in viaggio (`id, divisionId, item, qty, from, sentOn, arrivesOn`) (`src/rules/reinforcements.js`).
- `forces.divisions[id].reinforce`: interruttore (assente = attivo). I trasferimenti già in viaggio arrivano anche se si disattiva l'interruttore (assunzione da confermare, già documentata).

## 8. Teatri, guerra, combattimento (stato, opzionali)

- `state.theaters` (`theaters-v1`): incarichi di teatro (`src/rules/theater.js`); senza un HQ come entità.
- `state.war` (`war-v1`), `state.combat` (`combat-v1`, log limitato a 100 voci), `state.entrench` (`entrench-v1`).
- Combattimento urbano (`resolveUrbanBattleDay`): regola, nessun campo di stato dedicato.

## 9. Personale, cavalli, equipaggiamento: fonti e pool

| Voce | Fonte | Stato nel gioco |
|---|---|---|
| Pool uomini (`manpower.war`) | `src/rules/manpowerPool.js`, quota della popolazione | Presente, aggregato per nazione |
| Cavalli | template `horses`, flussi in `economyState.js` | Presenti nei template; pool biologico `horses/national_horse_pool` **non verificato** nel codice |
| Equipaggiamento per categoria | template `equipment` + `catalog.json` | Presente come previsto; quantità effettive quasi tutte `null` |
| Munizioni | `data/military/ammo_consumption.json`, riserva in `src/rules/militaryReserve.js` | Riserva come scorta iniziale; consumo non ancora collegato alle unità |

## 10. Salvataggi

- Schema di stato `STATE_SCHEMA = 7` (`src/game/state.js:23`). Migrazioni `migrateV1toV2` … `migrateV6toV7` in `src/game/save.js`.
- Campi opzionali (assenti nei vecchi salvataggi): `movement`, `conditions`, `theaters`, `war`, `combat`, `entrench`.
- Nessun identificativo dinamico di unità: le unità sono sempre quelle del catalogo.

## 11. Differenze tra tipologie

| Tipologia | Catalogo | Istanza in partita | Comandante | ORBAT | Condizione |
|---|---|---|---|---|---|
| Terra (divisione, brigata) | Sì | Sì (se template) | Solo corpi e armate sopra | Sì | Sì |
| Comando (corpo, armata) | Sì | No | Sì (corps/army) | Sì | No |
| Aerea | No | No | No | No | No |
| Navale | No | No | No | No | No |

## 12. Campi mancanti o non modellati (per la scheda)

- Personale per categoria (ufficiali, truppa, specialisti, equipaggi).
- Feriti, dispersi, prigionieri, caduti, recuperi.
- Veterani come quota del personale effettivo.
- Equipaggiamento effettivo per categoria con quantità (presente/efficiente/danneggiato/in riparazione).
- Rifornimenti e munizioni per unità.
- Manutenzione e usura.
- HQ come entità (fase 3, da progettare).
- Registro dinamico delle unità create in partita (decisione 4a–4c: id `X` + contatore, template del catalogo, schema 8: da realizzare).
- Aerei e navi: nessun dato nel catalogo; il file di origine li scarta (`src/data/units.js`, `skipped`).

## 13. Verifiche di questa fase

- Letture di `units.json` (512 voci) e del codice indicato.
- Nessuna modifica a codice, dati, salvataggi.
- Test: da eseguire prima del push su `main` (suite completa e build), come da regola concordata.
