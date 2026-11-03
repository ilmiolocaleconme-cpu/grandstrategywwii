// Template di unità: organico PREVISTO ("value") e dotazione EFFETTIVA ("effective") per ogni voce numerica (decisione dell'utente, 29/10/2026:
// per esempio cavalli previsti 5000, effettivi 4780; carri previsti 500, effettivi 437). Funzioni PURE.
// Forma di una voce: { value, basis, referenceYear, source, effective?: { value, asOf, basis, source } }.
// Regole: la base è 'utente' | 'ipotesi' | 'da_definire'; un valore non nullo ha una fonte; l'effettivo non supera il previsto, è un intero >= 0 e
// se non nullo ha una data (asOf) e una fonte; "utente" richiede un anno di riferimento.
export const BASES = ['utente', 'ipotesi', 'da_definire'];

// Schema v2 (Fase 2, decisione dell'utente 03/11/2026): additivo rispetto a v1. In v2 `basis`, `source`, `referenceYear` e (negli effettivi) `asOf`
// sono FACOLTATIVI: la provenienza non è obbligatoria; si cerca la massima veridicità ma senza imporla. L'attendibilità storica è il campo
// facoltativo `reliability`. Un template v1 si valida esattamente come prima. La validità storica è appliesTo.validFrom/validTo (activeFrom resta
// valido come sinonimo di validFrom); i template sono per nazione + categoria + scaglione, con più versioni in finestre di date diverse.
export const SCHEMA_V1 = 'unit-template-v1';
export const SCHEMA_V2 = 'unit-template-v2';
export const SCHEMAS = [SCHEMA_V1, SCHEMA_V2];
export const RELIABILITY = ['VERIFIED', 'STANDARD_TOE', 'PROVISIONAL', 'ESTIMATED', 'MISSING_DATA', 'DATED_VARIANT'];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Finestra di validità di un template: { from, to } (date ISO o null = senza limite). validFrom ha la precedenza su activeFrom. */
export function templateWindow(t) {
  const a = t?.appliesTo ?? {};
  return { from: a.validFrom ?? a.activeFrom ?? null, to: a.validTo ?? null };
}

/** Vero se il template vale alla data (estremi inclusi). Senza data (null) vale sempre: compatibile con il comportamento precedente. */
export function isTemplateValidAt(t, date) {
  if (date == null) return true;
  const { from, to } = templateWindow(t);
  return (from === null || from <= date) && (to === null || date <= to);
}

export const isLeaf = (o) => o !== null && typeof o === 'object' && !Array.isArray(o) && ('basis' in o || 'value' in o);

/** Percorsi e voci di tutte le foglie di un template (esclusi i campi di intestazione). */
export function leaves(template) {
  const out = [];
  const walk = (o, path) => {
    if (isLeaf(o)) { out.push([path, o]); return; }
    if (o !== null && typeof o === 'object' && !Array.isArray(o)) for (const [k, v] of Object.entries(o)) walk(v, path ? `${path}.${k}` : k);
  };
  for (const key of ['formation', 'mobility', 'structure', 'regimentsInfantry', 'battalionsPerRegiment', 'manpower', 'horses', 'equipment', 'organicSupport', 'referenceFigures']) {
    if (key in template) walk(template[key], key);
  }
  return out;
}

export function validateTemplate(t) {
  const errors = [];
  if (!SCHEMAS.includes(t.schema)) errors.push(`schema ${JSON.stringify(t.schema)}`);
  const strict = t.schema !== SCHEMA_V2; // v1 (e schema sconosciuto): regole originali; v2: provenienza facoltativa
  if (!/^TPL-[A-Z]+-[A-Z]+-\d{4}$/.test(t.id ?? '')) errors.push(`id non valido: ${t.id}`);
  const win = t.appliesTo ?? {};
  for (const k of ['activeFrom', 'validFrom', 'validTo']) if (win[k] != null && !DATE_RE.test(win[k])) errors.push(`appliesTo.${k} non è una data AAAA-MM-GG: ${win[k]}`);
  const { from, to } = templateWindow(t);
  if (from !== null && to !== null && to < from) errors.push(`finestra di validità incoerente: ${from} > ${to}`);
  if (t.initialFillRatio !== undefined) {
    const f = t.initialFillRatio;
    if (typeof f.value !== 'number' || !(f.value > 0 && f.value <= 1)) errors.push('initialFillRatio.value deve essere nell\'intervallo (0, 1]');
    if (strict && !String(f.source ?? '').trim()) errors.push('initialFillRatio senza fonte');
  }
  if (t.startsAsCadre !== undefined && typeof t.startsAsCadre !== 'boolean') errors.push('startsAsCadre non booleano');
  for (const [path, l] of leaves(t)) {
    if (strict ? !BASES.includes(l.basis) : (l.basis !== undefined && !BASES.includes(l.basis))) errors.push(`${path}: basis ${JSON.stringify(l.basis)}`);
    if (l.reliability !== undefined && !RELIABILITY.includes(l.reliability)) errors.push(`${path}: reliability ${JSON.stringify(l.reliability)}`);
    if (strict && l.value !== null && l.value !== undefined && !String(l.source ?? '').trim()) errors.push(`${path}: valore senza fonte`);
    if (strict && l.basis === 'utente' && l.referenceYear == null && l.value !== null) errors.push(`${path}: basis utente senza anno di riferimento`);
    if (l.effective !== undefined) {
      const e = l.effective;
      if (typeof l.value !== 'number') errors.push(`${path}: effettivo su una voce non numerica`);
      else if (e.value !== null && e.value !== undefined) {
        if (!Number.isInteger(e.value) || e.value < 0) errors.push(`${path}: effettivo non valido (${e.value})`);
        else if (e.value > l.value) errors.push(`${path}: effettivo ${e.value} supera il previsto ${l.value}`);
        if (strict ? !DATE_RE.test(e.asOf ?? '') : (e.asOf != null && !DATE_RE.test(e.asOf))) errors.push(`${path}: effettivo senza data`);
        if (strict && !String(e.source ?? '').trim()) errors.push(`${path}: effettivo senza fonte`);
      }
    }
  }
  return errors;
}

/** Rapporto effettivo/previsto (0..1) di una voce, oppure null se manca uno dei due (non si inventa). */
export function fillRatio(leaf) {
  if (typeof leaf?.value !== 'number' || leaf.value === 0 || leaf.effective?.value == null) return null;
  return leaf.effective.value / leaf.value;
}
