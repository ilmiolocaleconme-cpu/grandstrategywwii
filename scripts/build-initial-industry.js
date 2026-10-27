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
const MW = { steel: 12, alu: 18, chem: 14, ref: 10, syn: 20, rub: 9, mach: 14, comp: 12, eng: 18, mun: 12 };
const FACT = { steel: ['FCT-STEEL', 'REC-STEEL-001'], alu: ['FCT-ALUMINIUM', 'REC-ALU-001'], ref: ['FCT-REFINERY', 'REC-FUEL-OIL-001'], syn: ['FCT-SYNFUEL', 'REC-FUEL-COAL-001'], rub: ['FCT-RUBBER', 'REC-RUBBER-001'], chem: ['FCT-CHEMICAL', 'REC-CHEM-001'], mach: ['FCT-MACHINERY', 'REC-MACHINERY-001'], comp: ['FCT-COMPONENTS', 'REC-COMPONENTS-001'], eng: ['FCT-ENGINE', 'REC-ENGINES-001'], mun: ['FCT-MUNITIONS', 'REC-MUNITIONS-001'], therm: ['FCT-POWER', 'REC-ELECTRIC-COAL-001'] };

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
    k.mach = Math.max(1, Math.round(m / 8)); k.comp = Math.max(1, Math.round(m / 10)); k.eng = Math.max(1, Math.round(m / 10)); k.mun = Math.max(1, Math.round(m / 5));
    k.chem = Math.max(1, Math.ceil(k.mun / 2));
  }
  const demand = Object.entries(k).reduce((s, [f, c]) => s + (c || 0) * MW[f], 0);
  k.therm = demand > (hy[n] ?? 0) ? Math.ceil((demand - (hy[n] ?? 0)) / 120) : 0;
  if (!Object.values(k).some(Boolean)) continue;
  const order = ['steel', 'alu', 'ref', 'syn', 'rub', 'chem', 'mach', 'comp', 'eng', 'mun', 'therm'];
  nations[n] = { tier, owner: entities.get(n).owner, facilities: order.filter((f) => k[f] > 0).map((f) => ({ factory: FACT[f][0], recipeId: FACT[f][1], count: k[f] })) };
}
const doc = {
  schema: 'initial-industry-v1',
  quality: 'DESIGN_DEFAULT',
  asOf: '1936-01-01',
  note: 'Industria iniziale: stime di progetto approvate in chat il 27/10/2026, NON dati storici per impianto. Fascia A = grandi potenze, B = un impianto per risorsa locale (può essere una colonia o un\'entità non giocabile: `owner` indica chi la possiede), C = le nazioni in `tierC`, nessuna industria iniziale (la costruisce il giocatore; decisione del 27/10/2026). Le centrali a carbone coprono solo il fabbisogno non coperto dall\'idroelettrico già nei CSV (hydro_plants.json): per la Germania, senza idro nei CSV, il valore è MISSING_DATA.',
  counts: 'numero di impianti identici, ciascuno con la capacità del Pack (nessuna modifica ai file del Pack)',
  nations,
  tierC: nationIds.filter((id) => !nations[id]),
  baseGrid: { megawatts: 40, quality: 'MISSING_DATA', appliesTo: 'tierC', rationale: 'Rete di base per le nazioni senza industria (approvata in chat il 27/10/2026): basta per le prime miniere e impianti piccoli e per mantenere qualche divisione. Valore di progetto, non storico: da sostituire con dati reali. Il mantenimento militare è previsto ma non attivo (Fase 5).' },
};
fs.writeFileSync(new URL('../data/industry/initial_industry.json', import.meta.url), JSON.stringify(doc, null, 2) + '\n');
console.log(`industria iniziale: ${Object.values(nations).filter((x) => x.tier === 'A').length} entità in fascia A, ${Object.values(nations).filter((x) => x.tier === 'B').length} in B, ${doc.tierC.length} nazioni in C`);
