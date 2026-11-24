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
import { barracksEnabled, barracksLevelDef } from '../data/barracks.js';
import { barracksRows, pickBarracks } from './barracksState.js';

// Caserme (20/11/2026, decisione dell'utente): per le nazioni elencate in data/military/barracks.json una divisione si forma solo in una caserma
// libera della provincia scelta, nasce lì, e il livello della caserma accorcia l'addestramento (trainingFactor) e alza l'esperienza iniziale
// (experienceBonus, entro il tetto di addestramento delle unità nuove). ctx.barracks = { params, controllerOf(state, provincia) }; senza, come prima.
const barracksCtx = (ctx, nation) => (ctx.barracks && barracksEnabled(ctx.barracks.params, nation) ? ctx.barracks : null);

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
  for (const [v, w] of Object.entries(r.variants ?? {})) if (!/^[A-Z]{2,5}$/.test(w?.territory ?? '') || !/^P_[A-Z]+_/.test(w?.depot ?? '') || w.depot.split('_')[1] !== w.territory) e.push(`formazione: variante ${v} senza territorio o deposito validi`);
  return e;
}

/** Nome della divisione nuova: schema della nazione per categoria, col primo numero non usato da altre unità della nazione con quel nome. */
// ordinale inglese (21/11/2026, nomi delle divisioni USA): 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, 22nd…
export function englishOrdinal(n) {
  const t = n % 100;
  return `${n}${t >= 11 && t <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] ?? 'th'}`;
}

export function divisionName(rules, nation, category, units, variant = null) {
  const pattern = (variant ? rules.names?.[nation]?.[`${category}:${variant}`] : null) ?? rules.names?.[nation]?.[category] ?? rules.defaultName; // variante (24/11/2026): «4th Indian Infantry Division»
  const [pre, post] = pattern.split('{n}');
  const english = rules.ordinals?.[nation] === 'en';
  const used = new Set();
  for (const u of units) {
    if (u.nation !== nation || typeof u.name !== 'string' || !u.name.startsWith(pre) && pre !== '') continue;
    const rest = u.name.slice(pre.length);
    const m = rest.match(english ? /^(\d+)(?:st|nd|rd|th)/ : /^(\d+)/);
    if (m && rest.slice(m[0].length) === post) used.add(Number(m[1]));
  }
  let n = 1; while (used.has(n)) n += 1;
  return pattern.replace('{n}', english ? englishOrdinal(n) : String(n));
}

/**
 * Cosa serve per formare una divisione dal modello: { men, available, minMen, ok, reason, equipment: [{ item, need, stock }] }.
 * pool = uomini liberi del bacino (già al netto delle altre formazioni).
 */
export function raisePreview(state, { nation, designId, province = null }, { modules, rules, pool, barracks = null }) {
  const design = state.designs?.byId?.[designId];
  if (!design || design.nation !== nation) return { ok: false, reason: 'modello inesistente' };
  const t = designTemplate(design, modules);
  const men = t.manpower.war.value;
  const minMen = Math.ceil(men * rules.minManpowerShare);
  const stocks = state.nations?.[nation]?.stocks ?? {};
  const equipment = Object.entries(t.equipment).map(([k, l]) => ({ item: `equipment.${k}`, need: l.value, stock: Math.floor(stocks[`equipment.${k}`] ?? 0) }));
  const horses = t.horses?.value ?? 0;
  let ok = pool >= minMen;
  let reason = ok ? null : `servono almeno ${minMen} uomini liberi nel bacino (ne hai ${Math.floor(pool)})`;
  // divisioni di una variante (24/11/2026): si formano solo nel loro territorio (le indiane in India, raise_rules.variants)
  const where = design.variant ? rules.variants?.[design.variant] : null;
  if (ok && where && province && String(province).split('_')[1] !== where.territory) { ok = false; reason = `questa divisione si forma solo in ${where.name_it ?? where.territory}`; }
  let trainingDays = rules.trainingDays[design.category];
  let barracksInfo = null;
  const bk = barracksCtx({ barracks }, nation);
  if (bk) {
    const rows = barracksRows(state, bk.params, nation, bk.controllerOf);
    const free = rows.reduce((x, r) => x + r.free, 0);
    const pick = province ? pickBarracks(rows, province) : pickBarracks(rows, null, { anywhere: true });
    const lv = pick ? barracksLevelDef(bk.params, pick.level) : null;
    if (lv) trainingDays = Math.max(1, Math.round(trainingDays * lv.trainingFactor));
    barracksInfo = { free, id: pick?.id ?? null, name: pick?.name ?? null, level: pick?.level ?? null, experienceBonus: lv?.experienceBonus ?? 0 };
    if (ok && free === 0) { ok = false; reason = 'nessuna caserma libera: aspetta che finisca un addestramento o costruisci una caserma (Costruzioni, nella provincia)'; }
    else if (ok && province && !pick) { ok = false; reason = 'in questa provincia non c\'è una caserma libera'; }
  }
  return { ok, reason, men, available: Math.floor(pool), minMen, horses, equipment, trainingDays, category: design.category, barracks: barracksInfo };
}

/**
 * Forma una divisione: la registra, la mette nella provincia, prende gli uomini dal bacino (fino all'organico) e la segna in addestramento.
 * Armi, mezzi e cavalli partono da zero: li portano i rinforzi. ctx: { modules, rules, pool (uomini liberi), units (elenco per i nomi), conditionCfg? }.
 * Lancia un Error se non si può. Ritorna { state, id, name }.
 */
export function raiseDivision(state, { nation, designId, province }, ctx) {
  if (!province) throw new Error('scegli la provincia dove formarla');
  const pre = raisePreview(state, { nation, designId, province }, ctx);
  if (!pre.ok) throw new Error(pre.reason);
  const design = state.designs.byId[designId];
  const template = designTemplate(design, ctx.modules);
  const items = {};
  for (const [path, it] of Object.entries(initialEffective(template, 1))) items[path] = { planned: it.planned, effective: 0, source: 'ratio' };
  items['manpower.war'] = { ...items['manpower.war'], effective: Math.min(items['manpower.war'].planned, Math.floor(ctx.pool)) };
  const name = divisionName(ctx.rules, nation, design.category, ctx.units, design.variant ?? null);
  const until = addDays(state.date, pre.trainingDays); // con la caserma: giorni ridotti dal suo livello
  const reg = registerUnit(state.unitRegistry ?? createUnitRegistry(), {
    nation, branch: null, echelon: 'division', category: design.category, variant: design.variant ?? null, name, startYear: Number(state.date.slice(0, 4)), endYear: null,
    origin: 'player', formedOn: state.date, design: designId,
  });
  const division = { templateId: designId, since: state.date, items, training: pre.barracks?.id ? { until, barracksId: pre.barracks.id } : { until } };
  const movement = state.movement ?? createMovementState();
  let s = {
    ...state,
    unitRegistry: reg.registry,
    forces: { ...state.forces, divisions: { ...state.forces.divisions, [reg.id]: division } },
    movement: { ...movement, positions: { ...movement.positions, [reg.id]: province } },
  };
  if (ctx.conditionCfg) {
    const conditions = markNew(s.conditions ?? createConditionState(), [reg.id], ctx.conditionCfg, state.date);
    const bonus = pre.barracks?.experienceBonus ?? 0;
    if (bonus > 0) { const e = conditions.byUnit[reg.id]; conditions.byUnit[reg.id] = { ...e, experience: Math.min(ctx.conditionCfg.training.newUnitCap, e.experience + bonus) }; }
    s = { ...s, conditions };
  }
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
