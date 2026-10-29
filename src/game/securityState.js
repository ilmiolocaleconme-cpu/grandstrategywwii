// Forma dello stato di sicurezza di una nazione (nation.security, campo facoltativo: assente = nessun agente, nessun reparto). Funzioni PURE, nessuna dipendenza.
// nation.security = { agents: { spy, saboteur }, deployed: { [nazioneBersaglio]: n }, mp: { [luogo]: n }, queue: [...], log: [...], incidents: [...] }

export const emptySecurity = () => ({ agents: { spy: 0, saboteur: 0 }, deployed: {}, mp: {}, queue: [], log: [], incidents: [] });
export const securityOf = (nation) => ({ ...emptySecurity(), ...(nation?.security ?? {}) });

export function validateSecurityShape(id, s) {
  if (s === undefined) return [];
  if (s === null || typeof s !== 'object') return [`stato: ${id}, sicurezza non valida`];
  const errors = [];
  const nn = (v) => Number.isInteger(v) && v >= 0;
  if (!s.agents || !nn(s.agents.spy) || !nn(s.agents.saboteur)) errors.push(`stato: ${id}, agenti non validi`);
  for (const [k, v] of Object.entries(s.deployed ?? {})) if (!nn(v) || v === 0) errors.push(`stato: ${id}, spie schierate in ${k} non valide`);
  for (const [k, v] of Object.entries(s.mp ?? {})) if (!nn(v) || v === 0) errors.push(`stato: ${id}, polizia militare in ${k} non valida`);
  if (!Array.isArray(s.queue ?? [])) errors.push(`stato: ${id}, coda sicurezza non valida`);
  for (const q of s.queue ?? []) {
    if (!['train', 'mp', 'op'].includes(q.kind) || !Number.isInteger(q.daysLeft) || q.daysLeft < 1) errors.push(`stato: ${id}, voce di coda sicurezza non valida`);
  }
  if (!Array.isArray(s.log ?? []) || !Array.isArray(s.incidents ?? [])) errors.push(`stato: ${id}, registro sicurezza non valido`);
  return errors;
}
