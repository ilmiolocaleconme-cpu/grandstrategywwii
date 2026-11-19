// Formazione di divisioni nuove dai modelli dell'editor (19/11/2026). Funzioni PURE.
// Decisioni dell'utente (19/11/2026):
// - «nasce come quadro»: la divisione compare subito nella provincia scelta con gli uomini presi dal bacino; armi, mezzi e cavalli arrivano
//   dal magazzino con i rinforzi giornalieri (src/game/reinforcementSystem.js), niente gratis;
// - «stesse regole»: anche le divisioni storiche che si formano DOPO l'inizio della partita prendono uomini, armi e cavalli dal bacino e
//   dal magazzino (drawOnActivation, usata dal sistema di attivazione), non più gratis;
// - «addestramento per tipo»: per `trainingDays[categoria]` giorni la divisione non combatte (src/game/warCommon.js → isFighter).
// Regole in data/units/modules/raise_rules.json. L'unità va nel registro della partita (src/rules/unitRegistry.js, id X#####).
import { addDays } from './calendar.js';
import { designTemplate } from '../data/modules.js';
import { initialEffective } from '../rules/readiness.js';
import { registerUnit, createUnitRegistry } from '../rules/unitRegistry.js';
import { createMovementState } from '../rules/movement.js';
import { markNew, createConditionState } from '../rules/divisionCondition.js';

export const RAISE_RULES_SCHEMA = 'division-raise-rules-v1';
const CATS = ['infantry', 'motorized', 'mechanized', 'armored', 'mountain', 'cavalry', 'airborne'];
const r3 = (v) => Math.round(v * 1000) / 1000;
const isStock = (path) => path === 'horses' || path.startsWith('equipment.');

/** Errori delle regole (lista vuota = valide). */
export function validateRaiseRules(r) {
  if (r?.schema !== RAISE_RULES_SCHEMA) return [`formazione: schema ${JSON.stringify(r?.schema)}`];
  const e = [];
  for (const c of CATS) if (!(Number.isInteger(r.trainingDays?.[c]) && r.trainingDays[c] > 0)) e.push(`formazione: giorni di addestramento di ${c} mancanti`);
  if (!(r.minManpowerShare > 0 && r.minManpowerShare <= 1)) e.push('formazione: minManpowerShare fra 0 e 1');
  for (const [n, names] of Object.entries(r.names ?? {})) for (const c of CATS) if (typeof names?.[c] !== 'string' || !names[c].includes('{n}')) e.push(`formazione: nome ${n}/${c} senza {n}`);
  if (typeof r.defaultName !== 'string' || !r.defaultName.includes('{n}')) e.push('formazione: defaultName senza {n}');
  return e;
}

/** Nome della divisione nuova: schema della nazione per categoria, col primo numero non usato da altre unità della nazione con quel nome. */
export function divisionName(rules, nation, category, units) {
  const pattern = rules.names?.[nation]?.[category] ?? rules.defaultName;
  const [pre, post] = pattern.split('{n}');
  const used = new Set();
  for (const u of units) {
    if (u.nation !== nation || typeof u.name !== 'string' || !u.name.startsWith(pre) && pre !== '') continue;
    const rest = u.name.slice(pre.length);
    const m = rest.match(/^(\d+)/);
    if (m && rest.slice(m[1].length) === post) used.add(Number(m[1]));
  }
  let n = 1; while (used.has(n)) n += 1;
  return pattern.replace('{n}', String(n));
}

/**
 * Cosa serve per formare una divisione dal modello: { men, available, minMen, ok, reason, equipment: [{ item, need, stock }] }.
 * pool = uomini liberi del bacino (già al netto delle altre formazioni).
 */
export function raisePreview(state, { nation, designId }, { modules, rules, pool }) {
  const design = state.designs?.byId?.[designId];
  if (!design || design.nation !== nation) return { ok: false, reason: 'modello inesistente' };
  const t = designTemplate(design, modules);
  const men = t.manpower.war.value;
  const minMen = Math.ceil(men * rules.minManpowerShare);
  const stocks = state.nations?.[nation]?.stocks ?? {};
  const equipment = Object.entries(t.equipment).map(([k, l]) => ({ item: `equipment.${k}`, need: l.value, stock: Math.floor(stocks[`equipment.${k}`] ?? 0) }));
  const horses = t.horses?.value ?? 0;
  const ok = pool >= minMen;
  return { ok, reason: ok ? null : `servono almeno ${minMen} uomini liberi nel bacino (ne hai ${Math.floor(pool)})`, men, available: Math.floor(pool), minMen, horses, equipment, trainingDays: rules.trainingDays[design.category], category: design.category };
}

/**
 * Forma una divisione: la registra, la mette nella provincia, prende gli uomini dal bacino (fino all'organico) e la segna in addestramento.
 * Armi, mezzi e cavalli partono da zero: li portano i rinforzi. ctx: { modules, rules, pool (uomini liberi), units (elenco per i nomi), conditionCfg? }.
 * Lancia un Error se non si può. Ritorna { state, id, name }.
 */
export function raiseDivision(state, { nation, designId, province }, ctx) {
  const pre = raisePreview(state, { nation, designId }, ctx);
  if (!pre.ok) throw new Error(pre.reason);
  if (!province) throw new Error('scegli la provincia dove formarla');
  const design = state.designs.byId[designId];
  const template = designTemplate(design, ctx.modules);
  const items = {};
  for (const [path, it] of Object.entries(initialEffective(template, 1))) items[path] = { planned: it.planned, effective: 0, source: 'ratio' };
  items['manpower.war'] = { ...items['manpower.war'], effective: Math.min(items['manpower.war'].planned, Math.floor(ctx.pool)) };
  const name = divisionName(ctx.rules, nation, design.category, ctx.units);
  const until = addDays(state.date, ctx.rules.trainingDays[design.category]);
  const reg = registerUnit(state.unitRegistry ?? createUnitRegistry(), {
    nation, branch: null, echelon: 'division', category: design.category, variant: null, name, startYear: Number(state.date.slice(0, 4)), endYear: null,
    origin: 'player', formedOn: state.date, design: designId,
  });
  const division = { templateId: designId, since: state.date, items, training: { until } };
  const movement = state.movement ?? createMovementState();
  let s = {
    ...state,
    unitRegistry: reg.registry,
    forces: { ...state.forces, divisions: { ...state.forces.divisions, [reg.id]: division } },
    movement: { ...movement, positions: { ...movement.positions, [reg.id]: province } },
  };
  if (ctx.conditionCfg) s = { ...s, conditions: markNew(s.conditions ?? createConditionState(), [reg.id], ctx.conditionCfg, state.date) };
  return { state: s, id: reg.id, name };
}

/** true se la divisione è ancora in addestramento alla data dello stato. */
export const inTraining = (state, id) => { const t = state.forces?.divisions?.[id]?.training; return Boolean(t && state.date < t.until); };

/**
 * «Stesse regole» per le divisioni storiche che si formano durante la partita: la dotazione calcolata con la frazione iniziale si prende
 * davvero dal magazzino (armi, mezzi, cavalli: quanto c'è) e dal bacino (uomini: quanti sono liberi). Ritorna { items, nations, pool }.
 */
export function drawOnActivation(items, nation, nations, pool) {
  const stocks = { ...(nations?.[nation]?.stocks ?? {}) };
  let left = Math.max(0, Math.floor(pool));
  const out = {};
  for (const [path, it] of Object.entries(items)) {
    let eff = it.effective;
    if (path === 'manpower.war') { eff = Math.min(eff, left); left -= eff; } else if (isStock(path)) { eff = Math.min(eff, Math.floor(stocks[path] ?? 0)); if (eff > 0) stocks[path] = r3((stocks[path] ?? 0) - eff); }
    out[path] = { ...it, effective: eff };
  }
  const changed = nations?.[nation] ? { ...nations, [nation]: { ...nations[nation], stocks } } : nations;
  return { items: out, nations: changed, pool: left };
}
