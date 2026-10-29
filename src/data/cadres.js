// Quadri di divisione: template dedicato per unità che in tempo di pace esistono come nucleo (comando, ufficiali, sottufficiali, depositi)
// e diventano divisioni complete solo con una legge di mobilitazione (decisione dell'utente, 29/10/2026). Funzioni PURE.
// Ogni quadro è anche un "unit-template-v1" (stesse regole di previsto/effettivo, basi e fonti di templates.js) con kind = 'cadre'.
import { validateTemplate } from './templates.js';

export const CADRE_SCHEMA = 'cadre-templates-v1';

export function validateCadreTemplates(doc, { nationIds, templateIds } = {}) {
  const errors = [];
  if (doc?.schema !== CADRE_SCHEMA) errors.push(`schema ${JSON.stringify(doc?.schema)}`);
  if (!Array.isArray(doc?.templates) || doc.templates.length === 0) return [...errors, 'templates mancante o vuoto'];
  const seen = new Set();
  for (const t of doc.templates) {
    const tag = `quadro ${t.id}`;
    errors.push(...validateTemplate(t).map((e) => `${tag}: ${e}`));
    if (seen.has(t.id)) errors.push(`${tag}: id duplicato`);
    seen.add(t.id);
    if (t.kind !== 'cadre') errors.push(`${tag}: kind ${JSON.stringify(t.kind)} (atteso "cadre")`);
    if (t.id !== `TPL-${t.nation}-CADRE-1936`) errors.push(`${tag}: id incoerente con la nazione ${t.nation}`);
    if (nationIds && !nationIds.has(t.nation)) errors.push(`${tag}: nazione ${t.nation} sconosciuta`);
    const m = t.mobilization;
    if (!m || typeof m !== 'object') { errors.push(`${tag}: mobilization mancante`); continue; }
    if (m.combatReady !== false) errors.push(`${tag}: un quadro non è pronto al combattimento (combatReady deve essere false)`);
    if (m.law !== null && !String(m.law).trim()) errors.push(`${tag}: legge di mobilitazione vuota (usare null se non modellata)`);
    if (m.expandsTo !== null && templateIds && !templateIds.has(m.expandsTo)) errors.push(`${tag}: expandsTo ${m.expandsTo} non esiste tra i template di divisione`);
    for (const [path, l] of [['manpower.cadre', t.manpower?.cadre], ['equipment.cadre', t.equipment?.cadre]]) {
      if (!l) errors.push(`${tag}: manca ${path}`);
      else if (l.basis === 'da_definire' && l.value !== null) errors.push(`${tag}: ${path} da_definire ma con un valore`);
    }
  }
  return errors;
}
