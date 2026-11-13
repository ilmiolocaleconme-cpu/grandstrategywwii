// Simulazione della qualità dei fucili (13/11/2026): 3 anni (1/1/1936 → 31/12/1938) per le 7 potenze, senza guerra né commercio.
// Sistemi usati: economia (produzione dei fucili con i punti di qualità), ricerca con la scelta dell'IA (ordine alfabetico fra le tecnologie
// disponibili, come in src/game/aiSecurity.js, senza la parte di sicurezza). Uomini previsti: divisioni attive alla data (initForcesState).
// Uso: node scripts/sim-rifles.js [giorni]   → tabella ogni 90 giorni. Solo lettura: non scrive file.
import { readFileSync, readdirSync } from 'node:fs';
import { loadIndustryCatalog } from '../src/data/industry.js';
import { mergeEquipmentCatalogs } from '../src/data/equipmentCatalog.js';
import { buildEquipmentRecipes } from '../src/data/equipmentProduction.js';
import { createEconomySystem } from '../src/game/economySystem.js';
import { newGame } from '../src/game/state.js';
import { advanceDay } from '../src/game/engine.js';
import { createResearch, techsOf } from '../src/game/research.js';
import { initForcesState } from '../src/game/forcesState.js';
import { completeTemplates } from '../src/rules/forces.js';
import { averageQuality, rifleBonus, rifleTechBonus, bestRifleQuality, plannedMenByNation } from '../src/rules/rifleQuality.js';

const root = new URL('../', import.meta.url);
const text = (p) => readFileSync(new URL(`data/${p}`, root), 'utf8');
const json = (p) => JSON.parse(text(p));
const DAYS = Number(process.argv[2] ?? 1095);
const POWERS = ['DEU', 'FRA', 'GBR', 'ITA', 'USSR', 'USA', 'JPN'];

const cat = loadIndustryCatalog({ factoriesCsv: text('industry/factories.csv'), structuresCsv: text('infrastructure/structures.csv'), categoriesCsv: text('industry/production_categories.csv') });
const edir = new URL('data/units/equipment/', root);
const eqCatalog = mergeEquipmentCatalogs(readdirSync(edir).filter((n) => /^catalog.*\.json$/.test(n)).sort().map((f) => JSON.parse(readFileSync(new URL(f, edir), 'utf8'))));
const recipes = [...json('industry/recipes.json').recipes, ...buildEquipmentRecipes(eqCatalog, json('units/equipment/equipment_production.json'))];
const technologies = json('research/technologies.json');
const catalog = { recipes: new Map(recipes.map((r) => [r.id, r])), factories: cat.byId, levels: json('industry/factory_levels.json'), technologies };
const political = json('political_1936.json');
const nationIds = json('nations.json').map((n) => n.id);
const economy = json('economy/economy.json');
const smallArms = json('units/models/fucili_1930_1945.json');
const start = { nationIds, industry: json('industry/initial_industry.json'), stocks: json('industry/initial_stocks.json'), cash: json('industry/initial_cash.json'), economy, population: json('population/population.json'), research: technologies.initialResearch };
const tdir = new URL('data/units/templates/', root);
const templates = completeTemplates(readdirSync(tdir).filter((n) => n.endsWith('.json')).map((f) => JSON.parse(readFileSync(new URL(f, tdir), 'utf8'))).filter((t) => t.appliesTo));
const units = json('units/units.json').units;
const ratio = json('units/readiness.json').initialFillRatio.value;

const research = createResearch({ technologies, economy });
const economySystem = createEconomySystem({ catalog, economy, baseline: json('resources/extraction_baseline.json'), hydro: json('resources/hydro_plants.json'), political, cash: start.cash, smallArms });
const aiResearch = (s) => { // come aiSecurity: ordine alfabetico fra le disponibili che si possono pagare (riserva 150 ECV), tecnologie di sicurezza per ultime
  let st = s;
  for (const id of POWERS) {
    if (st.nations[id]?.research?.active) continue;
    const list = research.listFor(st, id).filter((x) => x.status === 'available' && x.cost.ecv <= st.nations[id].balance - 150);
    const pick = [...list].sort((a, b) => (a.tech.branch === 'security') - (b.tech.branch === 'security') || (a.tech.id < b.tech.id ? -1 : 1))[0];
    if (pick) st = research.start(st, id, pick.tech.id).state;
  }
  return st;
};
const systems = [economySystem, (s) => research.researchDay(s), aiResearch];

let s = newGame({ nation: 'DEU', political, ownersWithProvinces: nationIds, start }).state;
const menAt = (date) => {
  const f = initForcesState({ schema: 7, date, forces: { schema: 'forces-v1', initialized: false, divisions: {} } }, { units, templates, ratio }).state.forces;
  const byId = new Map(units.map((u) => [u.id, u]));
  return plannedMenByNation(f, (id) => byId.get(id)?.nation);
};
const row = (st) => {
  const men = menAt(st.date);
  const year = Number(st.date.slice(0, 4));
  return POWERS.map((n) => {
    const nat = st.nations[n];
    const q = averageQuality(smallArms, nat.rifles?.points ?? 0, men[n] ?? 0, nat.rifles?.count ?? 0);
    const techs = techsOf(nat);
    return { n, punti: Math.round(nat.rifles?.points ?? 0), fucili: nat.rifles?.count ?? 0, uomini: men[n] ?? 0, miglior: bestRifleQuality(smallArms, n, year, techs), qualita: Math.round(q * 1000) / 1000,
      bonus: `${Math.round((rifleBonus(smallArms, 'infantry', q) + rifleTechBonus(smallArms, 'infantry', techs)) * 1000) / 10}%`, tecnologie: [...techs].filter((t) => t.startsWith('TECH-INF')).map((t) => t.slice(9)).join(' ') };
  });
};
for (let d = 0; d <= DAYS; d += 1) {
  if (d % 90 === 0 || d === DAYS) { console.log(`\n== ${s.date} (giorno ${d})`); console.table(row(s)); }
  if (d < DAYS) s = advanceDay(s, systems);
}
