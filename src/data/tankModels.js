// Catalogo dei modelli di carro (data/units/models/*.json): solo dati e funzioni PURE. Gli anni di produzione sono interi: l'inizio vale dal 1° gennaio.
export const MODELS_SCHEMA = 'tank-models-v1';
const CLASSES = ['light', 'medium', 'heavy'];

export function validateTankModels(doc) {
  const errors = [];
  if (doc?.schema !== MODELS_SCHEMA) return [`modelli: schema ${JSON.stringify(doc?.schema)}`];
  const ids = new Set(); const names = new Set();
  for (const m of doc.models ?? []) {
    const p = `modelli: ${m.id ?? '?'}`;
    if (!/^MDL-[A-Z]+-[A-Z0-9-]+$/.test(m.id ?? '')) errors.push(`${p}: id non valido`);
    if (ids.has(m.id)) errors.push(`${p}: id duplicato`);
    ids.add(m.id);
    if (names.has(m.designation)) errors.push(`${p}: designazione duplicata ${m.designation}`);
    names.add(m.designation);
    if (m.nation !== doc.nation) errors.push(`${p}: nazione ${m.nation} diversa da ${doc.nation}`);
    if (!CLASSES.includes(m.class)) errors.push(`${p}: classe ${JSON.stringify(m.class)}`);
    if (!Number.isInteger(m.productionStart) || !Number.isInteger(m.productionEnd) || m.productionStart > m.productionEnd) errors.push(`${p}: anni di produzione non validi`);
    if (!Number.isInteger(m.producedApprox) || m.producedApprox <= 0) errors.push(`${p}: quantità non valida`);
    if (!String(m.source ?? '').trim()) errors.push(`${p}: senza fonte`);
    if (!['utente', 'ipotesi'].includes(m.basis)) errors.push(`${p}: basis ${JSON.stringify(m.basis)}`);
  }
  const evIds = new Set();
  for (const m of doc.eventModels ?? []) {
    const p = `modelli (evento): ${m.id ?? '?'}`;
    if (!/^MDL-[A-Z]+-[A-Z0-9-]+$/.test(m.id ?? '')) errors.push(`${p}: id non valido`);
    if (ids.has(m.id) || evIds.has(m.id)) errors.push(`${p}: id duplicato`);
    evIds.add(m.id);
    if (names.has(m.designation)) errors.push(`${p}: designazione duplicata ${m.designation}`);
    if (m.nation !== doc.nation) errors.push(`${p}: nazione ${m.nation} diversa da ${doc.nation}`);
    if (!CLASSES.includes(m.class)) errors.push(`${p}: classe ${JSON.stringify(m.class)}`);
    if (!/^[A-Z]{3}$/.test(m.originNation ?? '')) errors.push(`${p}: nazione d'origine mancante`);
    if (m.availability?.type !== 'event' || !/^EVT-[A-Z0-9-]+$/.test(m.availability?.eventId ?? '')) errors.push(`${p}: disponibilità non legata a un evento`);
    if (m.availability?.date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(m.availability?.date ?? '')) errors.push(`${p}: data dell'evento non valida`);
    if ('productionStart' in m || 'productionEnd' in m) errors.push(`${p}: un modello a evento non ha anni di produzione`);
    if (!String(m.source ?? '').trim()) errors.push(`${p}: senza fonte`);
  }
  return errors;
}

/** Modelli in produzione alla data (inizio dal 1° gennaio dell'anno di inizio, fine al 31 dicembre dell'anno di fine). */
export function modelsAvailableAt(doc, isoDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) throw new Error(`data non valida: ${isoDate}`);
  const y = Number(isoDate.slice(0, 4));
  return doc.models.filter((m) => m.productionStart <= y && y <= m.productionEnd);
}
