// Riserva iniziale di armi in magazzino (22/11/2026, decisione dell'utente): armi per N divisioni di fanteria standard per nazione.
// Regole in data/industry/initial_equipment_rules.json; file generato data/industry/initial_equipment.json (scripts/build-initial-equipment.js).
// Funzioni PURE.

/** Errori delle regole: ogni nazione ha una fascia esistente, ogni fascia un numero di divisioni intero ≥ 0. */
export function validateInitialEquipmentRules(rules, nationIds) {
  const errors = [];
  for (const [id, t] of Object.entries(rules.tiers ?? {})) if (!Number.isInteger(t.divisions) || t.divisions < 0) errors.push(`fascia ${id}: divisioni non valide`);
  for (const id of nationIds) if (!rules.nations?.[id]) errors.push(`${id}: manca la fascia`);
  for (const [id, tier] of Object.entries(rules.nations ?? {})) {
    if (!nationIds.includes(id)) errors.push(`${id}: non è una nazione`);
    if (!rules.tiers?.[tier]) errors.push(`${id}: fascia ${tier} inesistente`);
  }
  return errors;
}

/**
 * Template di fanteria standard al `date` della nazione: divisione di fanteria composta da battaglioni (schema unico: ha `modules`),
 * attiva a quella data, la più recente. null se la nazione non ne ha ancora.
 */
export function standardInfantryTemplate(templates, nation, date) {
  const ok = templates.filter((t) => t.appliesTo?.nation === nation && t.appliesTo?.category === 'infantry' && (t.appliesTo?.echelon ?? 'division') === 'division'
    && Array.isArray(t.modules) && !t.appliesTo?.variant && t.appliesTo?.activeFrom && t.appliesTo.activeFrom <= date); // niente varianti (divisioni indiane)
  ok.sort((a, b) => (a.appliesTo.activeFrom < b.appliesTo.activeFrom ? 1 : a.appliesTo.activeFrom > b.appliesTo.activeFrom ? -1 : (a.id < b.id ? -1 : 1)));
  return ok[0] ?? null;
}

/** Documento generato: { nations: { ID: { tier, divisions, templateId, equipment } }, pending: [ID…] } (pending = fascia > 0 ma senza fanteria a battaglioni). */
export function buildInitialEquipment(rules, templates, date) {
  const nations = {};
  const pending = [];
  for (const id of Object.keys(rules.nations).sort()) {
    const tier = rules.nations[id];
    const divisions = rules.tiers[tier].divisions;
    if (divisions === 0) continue;
    const t = standardInfantryTemplate(templates, id, date);
    if (!t) { pending.push(id); continue; }
    const equipment = {};
    for (const [k, leaf] of Object.entries(t.equipment).sort(([a], [b]) => (a < b ? -1 : 1))) if (leaf?.value > 0) equipment[k] = leaf.value * divisions;
    nations[id] = { tier, divisions, templateId: t.id, equipment };
  }
  return {
    schema: 'initial-equipment-v1', asOf: date, reliability: 'ESTIMATED',
    note: 'File generato da scripts/build-initial-equipment.js (data/industry/initial_equipment_rules.json + template di fanteria a battaglioni): non modificare a mano. Pezzi in magazzino a inizio partita, chiave = id del catalogo (stock equipment.<id>).',
    nations, pending,
  };
}

/** Aggiunge la riserva alle scorte delle nazioni (stock `equipment.<id>`), in pezzi. */
export function addInitialEquipment(nations, doc) {
  for (const [id, e] of Object.entries(doc?.nations ?? {})) {
    const n = nations[id];
    if (!n) continue;
    for (const [k, v] of Object.entries(e.equipment)) n.stocks[`equipment.${k}`] = (n.stocks[`equipment.${k}`] ?? 0) + v;
  }
  return nations;
}
