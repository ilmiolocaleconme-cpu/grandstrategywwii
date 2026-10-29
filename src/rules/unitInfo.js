// Scheda informativa di un'unità, ricavata SOLO da ciò che lo stato di partita e i dati contengono davvero.
// Funzione PURA. Ciò che il progetto non modella (fatica, morale, organizzazione, esperienza...) NON si inventa: compare in
// `notModeled`, così il pannello lo dice invece di mostrare numeri finti.
import { chainOf, childrenOf, orbatLevel } from './orbat.js';
import { MANAGED_LEVELS } from './commanders.js';
import { positionOf } from './movement.js';

export const NOT_MODELED = Object.freeze(['fatica', 'morale', 'organizzazione', 'esperienza', 'rifornimenti']);

/**
 * state: stato della partita; unit: voce del catalogo; ctx: { unitsById: Map, officersById: Map, initial: Map unità → provincia, provinceName(id) }.
 */
export function unitInfo(state, unit, { unitsById, officersById, initial, provinceName = (x) => x }) {
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
  // posizione e ordine di marcia
  const here = positionOf(state.movement, initial, unit.id);
  const order = state.movement?.orders?.[unit.id] ?? null;
  const movement = {
    province: here, provinceName: here ? provinceName(here) : null,
    order: order ? { to: order.path[order.path.length - 1], toName: provinceName(order.path[order.path.length - 1]), nextName: provinceName(order.path[order.leg + 1]), daysLeft: order.daysLeft, totalDays: order.totalDays } : null,
  };
  return { id: unit.id, name: unit.name, nation: unit.nation, echelon: unit.echelon, category: unit.category, commandLevel: unit.commandLevel ?? null, commander, chain, children: kids, strength, movement, notModeled: NOT_MODELED };
}
