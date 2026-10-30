// Scheda informativa di un'unità, ricavata SOLO da ciò che lo stato di partita e i dati contengono davvero.
// Funzione PURA. Ciò che il progetto non modella (fatica, morale, organizzazione, esperienza...) NON si inventa: compare in
// `notModeled`, così il pannello lo dice invece di mostrare numeri finti.
import { chainOf, childrenOf, orbatLevel } from './orbat.js';
import { MANAGED_LEVELS } from './commanders.js';
import { positionOf } from './movement.js';
import { templateFor } from './forces.js';
import { conditionOf, experienceLevel, materialStrength, valueBand, operationalState } from './divisionCondition.js';

// (esperienza, morale, prontezza e stato operativo ora esistono: vedi divisionCondition.js; qui restano i sistemi ancora senza modello)
// Sistemi descritti nei documenti guida dell'utente (06 Esperienza, morale, prontezza; 05 Logistica; 04 Sanità) ma ANCORA SENZA modello né
// valori iniziali nel codice. `rule` = la regola del documento, in breve. «Fatica» non compare in nessun documento guida.
export const NOT_MODELED = Object.freeze([
  { id: 'rifornimento', rule: 'indicatore semplice di soddisfacimento dalla rete logistica comune; penalità progressive' },
  { id: 'sanità', rule: 'morti, feriti, dispersi; percorso feriti: sanità divisionale → evacuazione → ospedale → recupero' },
]);

const COMP_LABEL = {
  formation: 'Formazione', mobility: 'Mobilità', regimentsInfantry: 'Reggimenti di fanteria', battalionsPerRegiment: 'Battaglioni per reggimento', horses: 'Cavalli',
  brigateFanteria: 'Brigate di fanteria', battaglioniPerBrigata: 'Battaglioni per brigata', reggimentiFanteria: 'Reggimenti di fanteria', battaglioniPerReggimento: 'Battaglioni per reggimento',
  reggimentiCarri: 'Reggimenti carri', battaglioniPerReggimentoCarri: 'Battaglioni per reggimento carri', battaglioniMotociclisti: 'Battaglioni motociclisti', reggimentiArtiglieria: 'Reggimenti di artiglieria',
};
const humanize = (k) => COMP_LABEL[k] ?? k.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/^./, (c) => c.toUpperCase());

/** Composizione teorica della divisione dal template (formazione, reggimenti, battaglioni, supporti organici). Ogni riga porta la base del dato (utente/ipotesi/fonte).
 * null se per la categoria non c'è un template. I valori `null` (da_definire) non compaiono: non si mostrano dati che non esistono. */
export function compositionOf(unit, templates) {
  const t = templates ? templateFor(unit, templates) : null;
  if (!t) return null;
  const rows = [];
  const add = (key, leaf) => { if (leaf && leaf.value !== null && leaf.value !== undefined && !Array.isArray(leaf.value)) rows.push({ key, label: humanize(key), value: leaf.value, basis: leaf.basis ?? null }); };
  add('formation', t.formation);
  for (const k of ['regimentsInfantry', 'battalionsPerRegiment']) add(k, t[k]);
  for (const [k, v] of Object.entries(t.structure ?? {})) add(k, v);
  add('mobility', t.mobility);
  add('horses', t.horses);
  const support = Array.isArray(t.organicSupport?.value) ? t.organicSupport.value : [];
  return { templateId: t.id, status: t.status ?? null, rows, support };
}

/**
 * state: stato della partita; unit: voce del catalogo; ctx: { unitsById: Map, officersById: Map, initial: Map unità → provincia, provinceName(id) }.
 */
export function unitInfo(state, unit, { unitsById, officersById, initial, provinceName = (x) => x, conditionConfig = null, templates = null }) {
  const name = (id) => unitsById.get(id)?.name ?? id;
  // comandante: i comandanti sono gestiti solo per corpi e armate (src/rules/commanders.js)
  let commander;
  if (unit.category === 'command' && MANAGED_LEVELS.includes(unit.commandLevel)) {
    const a = state.commanders?.assignments?.[unit.id];
    const off = a ? officersById.get(a.officerId) : null;
    commander = off
      ? { status: 'assegnato', name: off.name, rank: off.rank, source: a.source, since: a.since }
      : { status: 'vacante' };
  } else {
    commander = { status: 'non_gestito', reason: 'i comandanti sono modellati solo per corpi e armate' };
  }
  // inquadramento: padri e forze assegnate (figli diretti) dall'ordine di battaglia della partita
  const orbat = state.orbat ?? { links: {} };
  const chain = chainOf(orbat, unit.id).map((id) => ({ id, name: name(id) }));
  const kids = childrenOf(orbat, unit.id).map((id) => ({ id, name: name(id), level: orbatLevel(unitsById.get(id) ?? {}) }));
  // consistenza (solo divisioni con istanza): uomini effettivi/previsti, quadro, rinforzi
  const inst = state.forces?.divisions?.[unit.id];
  const men = inst?.items?.['manpower.war'] ?? null;
  const strength = inst
    ? { templateId: inst.templateId, manpower: men ? { planned: men.planned, effective: men.effective, ratio: men.planned > 0 ? men.effective / men.planned : null } : null, cadre: inst.cadre === true, reinforce: inst.reinforce !== false }
    : null;
  // prontezza materiale: solo ciò che i dati contengono (uomini e dotazione effettivi/previsti); munizioni, carburante, rifornimenti, riparazioni e riposo no
  const equipment = inst
    ? Object.entries(inst.items).filter(([k, v]) => k.startsWith('equipment.') && v.planned > 0).map(([k, v]) => ({ item: k.slice('equipment.'.length), planned: v.planned, effective: v.effective, ratio: v.effective / v.planned })).sort((a, b) => (a.ratio - b.ratio) || (a.item < b.item ? -1 : 1))
    : [];
  // condizione (solo divisioni con dotazione): esperienza, morale, prontezza e stato operativo derivato, ciascuno con la sua causa
  let condition = null;
  if (inst && conditionConfig) {
    const c = conditionOf(state.conditions, unit.id, conditionConfig, unit.nation);
    const material = materialStrength({ manpowerRatio: strength.manpower?.ratio ?? null, equipment });
    const op = operationalState({ manpowerRatio: strength.manpower?.ratio ?? null, equipmentWorstRatio: equipment[0]?.ratio ?? null, morale: c.morale, readiness: c.readiness, cadre: strength.cadre }, conditionConfig);
    condition = { experience: c.experience, experienceLevel: experienceLevel(c.experience, conditionConfig), morale: c.morale, moraleBand: valueBand(c.morale, conditionConfig).name, readiness: c.readiness, readinessBand: valueBand(c.readiness, conditionConfig).name, material, policy: c.policy, isNew: c.isNew, operational: op };
  }
  // posizione e ordine di marcia
  const here = positionOf(state.movement, initial, unit.id);
  const order = state.movement?.orders?.[unit.id] ?? null;
  const movement = {
    province: here, provinceName: here ? provinceName(here) : null,
    order: order ? { to: order.path[order.path.length - 1], toName: provinceName(order.path[order.path.length - 1]), nextName: provinceName(order.path[order.leg + 1]), daysLeft: order.daysLeft, totalDays: order.totalDays } : null,
  };
  return { id: unit.id, name: unit.name, nation: unit.nation, echelon: unit.echelon, category: unit.category, commandLevel: unit.commandLevel ?? null, commander, chain, children: kids, strength, equipment, condition, movement, composition: unit.echelon === 'division' || unit.echelon === 'brigade' ? compositionOf(unit, templates) : null, notModeled: NOT_MODELED };
}
