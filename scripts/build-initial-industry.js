// Genera data/industry/initial_industry.json (industria iniziale 1/1/1936, fasce A e B; la fascia C parte senza industria).
// Tutti i numeri sono DESIGN_DEFAULT (approvati in chat il 27/10/2026): nessun dato storico per impianto.
// Uso: npm run build:industry   (richiede data/resources/*.json già generati)
import fs from 'node:fs';
import { resourceExtraction, totalByPrefix } from '../src/data/extraction.js';

const j = (p) => JSON.parse(fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'));
const ctx = { production: j('data/resources/production_1936.json'), factors: j('data/resources/extraction_factors.json'), scaleFile: j('data/resources/extraction_scale.json'), pointsByProvince: j('data/resources/resource_points.json').byProvince, extra: j('data/resources/resource_locations_extra.json') };
const R = ['iron_ore', 'coal', 'oil', 'bauxite', 'rubber'];
const ext = Object.fromEntries(R.map((r) => [r, resourceExtraction(r, ctx)]));
const nationIds = j('data/nations.json').map((n) => n.id);
const entities = new Map(j('data/political_1936.json').map((e) => [e.id, e]));
const hydro = j('data/resources/hydro_plants.json');
const hy = {};
for (const p of hydro.plants ?? []) if ((p.era ?? 'pre1936') !== 'event') { const n = (p.provinceId ?? '').split('_')[1]; if (n) hy[n] = (hy[n] ?? 0) + (p.megawatts ?? 0); }

const A = { USA: 30, DEU: 12, USSR: 10, GBR: 8, FRA: 4, JPN: 4, BEL: 2, ITA: 1, CZE: 1, POL: 1, CAN: 1, SWE: 1 }; // acciaierie
const MW = { tank: 24, art: 15, steel: 12, alu: 18, chem: 14, ref: 10, syn: 20, rub: 9, mach: 14, comp: 12, eng: 18, mun: 12, wpn: 8 };
const FACT = { steel: ['FCT-STEEL', 'REC-STEEL-001'], alu: ['FCT-ALUMINIUM', 'REC-ALU-001'], ref: ['FCT-REFINERY', 'REC-FUEL-OIL-001'], syn: ['FCT-SYNFUEL', 'REC-FUEL-COAL-001'], rub: ['FCT-RUBBER', 'REC-RUBBER-001'], chem: ['FCT-CHEMICAL', 'REC-CHEM-001'], mach: ['FCT-MACHINERY', 'REC-MACHINERY-001'], comp: ['FCT-COMPONENTS', 'REC-COMPONENTS-001'], eng: ['FCT-ENGINE', 'REC-ENGINES-001'], mun: ['FCT-MUNITIONS', 'REC-MUNITIONS-001'], therm: ['FCT-POWER', 'REC-ELECTRIC-COAL-001'], tank: ['FCT-TANKS', 'REC-TANK-CZE-LT35'], art: ['FCT-ARTILLERY', 'REC-ARTILLERY-001'], wpn: ['FCT-WEAPONS', null] };
// Fabbriche di carri e di artiglieria: oggi solo la Cecoslovacchia (richiesta dell'utente del 29/10/2026; Škoda e ČKD). Le altre nazioni non le hanno ancora: mancano le ricette per i loro modelli.
// Carri (decisione dell'utente del 12/11/2026): una fabbrica di carri anche per DEU, FRA, GBR, ITA, JPN e USA, con il carro del proprio catalogo
// (il più leggero, il più adatto al 1936); la URSS no finché il catalogo non ha un suo carro (nessuna divisione corazzata sovietica nei dati).
const ARMS = { CZE: { tank: 1, art: 1 }, DEU: { wpn: 1, art: 1, tank: 1 }, FRA: { wpn: 1, art: 1, tank: 1 }, GBR: { wpn: 1, art: 1, tank: 1 }, ITA: { wpn: 1, art: 1, tank: 1 }, USSR: { wpn: 1, art: 1 }, JPN: { wpn: 1, art: 1, tank: 1 }, USA: { wpn: 1, art: 1, tank: 1 } };
// Armi leggere e artiglieria (richiesta dell'utente del 10/11/2026): un impianto di ciascun tipo per le nazioni che hanno voci nel catalogo equipaggiamenti (USSR e JPN da fonti web del 10/11/2026, provvisorie)
// (data/units/equipment/catalog*.json). Ricetta di default = prodotto REC-<equipment_id> generato da equipment_production.json: valore di gioco, non storico;
// il giocatore la cambia dall'impianto. USA dal T/O 70 del 1940 (scheda fornita dall'utente, 11/11/2026).
const EQUIP = { DEU: { wpn: 'REC-INW-DEU-RIFLE', art: 'REC-ART-DEU-HOW-105', tank: 'REC-TNK-DEU-TANK' }, FRA: { wpn: 'REC-INW-FRA-RIFLE-1939', art: 'REC-ART-FRA-ART75M1897', tank: 'REC-TNK-FRA-H39-1940' }, GBR: { wpn: 'REC-INW-GBR-RIFLE', art: 'REC-ART-GBR-FIELD', tank: 'REC-TNK-GBR-LIGHT-TANK-1939' }, ITA: { wpn: 'REC-INW-ITA-RIFLE-1940', art: 'REC-ART-ITA-GUN75-1940', tank: 'REC-TNK-ITA-L3-ARM-1940' },
  USSR: { wpn: 'REC-INW-USSR-RIFLE-1939', art: 'REC-ART-USSR-GUN76-1939' }, JPN: { wpn: 'REC-INW-JPN-RIFLE-1939', art: 'REC-ART-JPN-GUN75-DIV-1939', tank: 'REC-TNK-JPN-TYPE95-1942' },
  USA: { wpn: 'REC-INW-USA-RIFLE-1940', art: 'REC-ART-USA-HOW105-1940', tank: 'REC-TNK-USA-LIGHT-TANK-1940' } };
// Fabbriche di munizioni per nazione (decisione dell'utente del 04/11/2026, «per equilibrare il gioco»): copertura della domanda di
// attacco continuo di tutte le divisioni del catalogo (348 divisioni, data/military/ammo_consumption.json) con almeno il 100 %.
// 100 t/giorno per fabbrica. Le nazioni senza divisioni nel catalogo non ne ricevono. Il vecchio calcolo (un quinto delle acciaierie) è
// sostituito da questa tabella; le altre nazioni di fascia A restano a 0 fabbriche di munizioni.
const MUN = { USA: 6, GBR: 3, DEU: 6, USSR: 6, ITA: 3, FRA: 4, JPN: 5, BEL: 0, CAN: 0, CZE: 0, POL: 0, SWE: 0 };

const candidates = new Set(Object.keys(A));
for (const r of R) for (const id of ext[r].byProvince.keys()) candidates.add(id.split('_')[1]);
const nations = {};
for (const n of [...candidates].sort()) {
  if (!entities.has(n)) throw new Error(`entità politica sconosciuta: ${n}`);
  const e = Object.fromEntries(R.map((r) => [r, totalByPrefix(ext[r], n)]));
  const m = A[n] ?? (e.iron_ore >= 200 ? 1 : 0);
  const tier = A[n] ? 'A' : 'B';
  const k = { steel: m };
  k.alu = Math.floor(e.bauxite / 280) || (tier === 'A' && m >= 8 ? Math.max(1, Math.round(m / 8)) : 0);
  if (tier === 'A' && !k.alu && m >= 4) k.alu = 1;
  k.ref = Math.floor((e.oil * 0.8) / 110) || (tier === 'A' && n !== 'DEU' && m >= 4 ? 1 : 0);
  k.syn = n === 'DEU' ? 2 : 0;
  k.rub = Math.floor(e.rubber / 108) || (tier === 'A' && m >= 4 ? 1 : 0);
  if (tier === 'A') {
    k.mach = Math.max(1, Math.round(m / 8)); k.comp = Math.max(1, Math.round(m / 10)); k.eng = Math.max(1, Math.round(m / 10)); k.mun = MUN[n] ?? 0;
    k.chem = Math.max(1, Math.ceil(k.mun / 2));
  }
  Object.assign(k, ARMS[n] ?? {});
  const demand = Object.entries(k).reduce((s, [f, c]) => s + (c || 0) * MW[f], 0);
  k.therm = demand > (hy[n] ?? 0) ? Math.ceil((demand - (hy[n] ?? 0)) / 120) : 0;
  if (!Object.values(k).some(Boolean)) continue;
  const order = ['steel', 'alu', 'ref', 'syn', 'rub', 'chem', 'mach', 'comp', 'eng', 'mun', 'wpn', 'tank', 'art', 'therm'];
  nations[n] = { tier, owner: entities.get(n).owner, facilities: order.filter((f) => k[f] > 0).map((f) => ({ factory: FACT[f][0], recipeId: EQUIP[n]?.[f] ?? FACT[f][1], count: k[f] })) };
}
const doc = {
  schema: 'initial-industry-v1',
  quality: 'DESIGN_DEFAULT',
  asOf: '1936-01-01',
  note: 'Industria iniziale: stime di progetto approvate in chat il 27/10/2026, NON dati storici per impianto. Fascia A = grandi potenze, B = un impianto per risorsa locale (può essere una colonia o un\'entità non giocabile: `owner` indica chi la possiede), C = le nazioni in `tierC`, nessuna industria iniziale (la costruisce il giocatore; decisione del 27/10/2026). Le centrali a carbone coprono solo il fabbisogno non coperto dall\'idroelettrico già nei CSV (hydro_plants.json): per la Germania, senza idro nei CSV, il valore è MISSING_DATA.',
  counts: 'numero di impianti identici, ciascuno con la capacità del Pack (nessuna modifica ai file del Pack)',
  nations,
  tierC: nationIds.filter((id) => !nations[id]),
  minorArtillery: {
    appliesTo: 'tierC', factory: 'FCT-ARTILLERY', recipeId: 'REC-ARTILLERY-001', count: 1, throttle: 0.05, startStock: { steel: 760, components: 65 },
    quality: 'DESIGN_DEFAULT',
    rationale: "Regola dell'utente del 29/10/2026: i paesi minori (fascia C) hanno un solo template di artiglieria e un minimo di produzione; scorta iniziale scelta dall'utente (opzione «scorta», poi aumentata). Numeri PROPOSTI da Claude, non approvati: una fabbrica limitata al 5% della capacità (circa 1,2 pezzi al giorno con il pezzo di riferimento da 3 t) e una scorta iniziale di 760 t di acciaio e 65 t di componenti, IN AGGIUNTA alla riserva minima di 500 t delle costruzioni: bastano per circa 180 giorni (consumo 4,2 t e 0,35 t al giorno), poi la nazione deve fare commercio (richiesta dell'utente 29/10/2026; il commercio non esiste ancora nel codice). Il pezzo di riferimento è un segnaposto (REC-ARTILLERY-001, MISSING_DATA).",
  },
  baseGrid: { megawatts: 40, quality: 'MISSING_DATA', appliesTo: 'tierC', rationale: 'Rete di base per le nazioni senza industria (approvata in chat il 27/10/2026): basta per le prime miniere e impianti piccoli e per mantenere qualche divisione. Valore di progetto, non storico: da sostituire con dati reali. Il mantenimento militare è previsto ma non attivo (Fase 5).' },
};
fs.writeFileSync(new URL('../data/industry/initial_industry.json', import.meta.url), JSON.stringify(doc, null, 2) + '\n');
console.log(`industria iniziale: ${Object.values(nations).filter((x) => x.tier === 'A').length} entità in fascia A, ${Object.values(nations).filter((x) => x.tier === 'B').length} in B, ${doc.tierC.length} nazioni in C`);
