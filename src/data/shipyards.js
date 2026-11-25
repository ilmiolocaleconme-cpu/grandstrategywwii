// Cantieri navali storici 1936 (data/naval/shipyards_1936.json): BOZZA di presenza per la mappa, basis «ipotesi». Solo dati e funzioni PURE.
// Non è capacità produttiva: il cantiere (FCT-SHIPYARD) non ha ricetta e oggi non produce navi.
// Livello di scalo (25/11/2026): `slipway` 1-4 per cantiere, soglie e costi in data/naval/slipway_levels.json.
import { difficulty } from './economy.js';
export const SHIPYARDS_SCHEMA = 'shipyards-v1';
const KINDS = ['navy', 'private', 'mixed'];
const BASES = ['utente', 'ipotesi'];

/** Errori (lista vuota = valido). coastal = città costiere del catalogo (cittaId → { name, owner, parentProvince }); slipways = slipway_levels.json (facoltativo: senza, il livello si controlla solo come intero 1-4). */
export function validateShipyards(doc, { coastal, slipways = null }) {
  const maxSlip = slipways ? maxSlipwayLevel(slipways) : 4;
  const errors = [];
  if (doc?.schema !== SHIPYARDS_SCHEMA) return [`cantieri: schema ${JSON.stringify(doc?.schema)}, atteso ${SHIPYARDS_SCHEMA}`];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doc.asOf ?? '')) errors.push('cantieri: asOf non valido');
  if (!String(doc.note ?? '').trim()) errors.push('cantieri: nota di origine mancante');
  if (!Array.isArray(doc.shipyards)) return [...errors, 'cantieri: shipyards non è un array'];
  const ids = new Set(); const cities = new Set();
  for (const y of doc.shipyards) {
    const p = `cantieri ${y?.id}`;
    if (typeof y?.id !== 'string' || y.id === '') { errors.push('cantieri: voce senza id'); continue; }
    if (ids.has(y.id)) errors.push(`${p}: id duplicato`);
    ids.add(y.id);
    const c = coastal?.[y.cittaId];
    if (!c) errors.push(`${p}: la città ${JSON.stringify(y.cittaId)} non è una città costiera del catalogo`);
    else {
      if (cities.has(y.cittaId)) errors.push(`${p}: due cantieri sulla stessa città (uno per città)`);
      cities.add(y.cittaId);
      if (y.nation !== c.owner) errors.push(`${p}: nazione ${y.nation} diversa dal proprietario della città (${c.owner})`);
      if (y.name !== c.name) errors.push(`${p}: nome ${JSON.stringify(y.name)} diverso dalla città (${c.name})`);
    }
    if (!String(y.operator ?? '').trim()) errors.push(`${p}: senza operatore`);
    if (!KINDS.includes(y.kind)) errors.push(`${p}: tipo ${JSON.stringify(y.kind)}`);
    if (!BASES.includes(y.basis)) errors.push(`${p}: basis ${JSON.stringify(y.basis)}`);
    if (!Number.isInteger(y.slipway) || y.slipway < 1 || y.slipway > maxSlip) errors.push(`${p}: livello di scalo ${JSON.stringify(y.slipway)} (atteso 1-${maxSlip})`);
  }
  return errors;
}

export const SLIPWAY_LEVELS_SCHEMA = 'slipway-levels-v1';

/** Livelli di scalo: consecutivi da 1, tonnellaggio crescente (null solo all'ultimo = nessun limite), costi non decrescenti, livello 1 gratuito. */
export function validateSlipwayLevels(file) {
  if (file?.schema !== SLIPWAY_LEVELS_SCHEMA) return [`scali: schema ${file?.schema}, atteso ${SLIPWAY_LEVELS_SCHEMA}`];
  const errors = [];
  if (!['DESIGN_DEFAULT', 'verified'].includes(file.quality)) errors.push('scali: qualità sconosciuta');
  const ls = file.levels ?? [];
  if (ls.length < 2) errors.push('scali: servono almeno 2 livelli');
  ls.forEach((l, i) => {
    const last = i === ls.length - 1;
    if (l.level !== i + 1) errors.push(`scali: livelli non consecutivi (atteso ${i + 1})`);
    if (!l.name_it) errors.push(`scali: L${l.level} senza nome`);
    if (last ? !(l.maxTons === null || l.maxTons > 0) : !(l.maxTons > 0)) errors.push(`scali: L${l.level} con tonnellaggio non valido`);
    if (i > 0 && l.maxTons !== null && !(l.maxTons > ls[i - 1].maxTons)) errors.push(`scali: L${l.level} non permette più tonnellaggio del precedente`);
    if (i === 0 && (l.ecv !== 0 || l.days !== 0)) errors.push('scali: il livello 1 viene con il cantiere (costo 0)');
    if (i > 0 && (!(l.ecv > 0) || !Number.isInteger(l.days) || l.days < 1 || !(l.workers >= 0))) errors.push(`scali: L${l.level} con costo, durata o lavoratori non validi`);
    if (i > 1 && !(l.ecv >= ls[i - 1].ecv && l.days >= ls[i - 1].days)) errors.push(`scali: L${l.level} costa meno o dura meno del livello precedente`);
  });
  return errors;
}

export const maxSlipwayLevel = (file) => file.levels.length;
export const slipwayDef = (file, level) => (file?.levels ?? []).find((l) => l.level === level) ?? null;

/** Una nave di `tons` (dislocamento standard) entra nello scalo di livello `level`? */
export function slipwayFits(file, level, tons) {
  const d = slipwayDef(file, level);
  return Boolean(d) && (d.maxTons === null || tons <= d.maxTons);
}

const round = (v) => Math.round(v * 1000) / 1000;

/** Costo per portare uno scalo da `fromLevel` a `fromLevel + 1`: { ecv, steel, workers, days } oppure null. */
export function slipwayCost(file, economy, fromLevel, difficultyId) {
  if (!(fromLevel >= 1)) return null;
  const to = slipwayDef(file, fromLevel + 1);
  const d = difficulty(economy, difficultyId);
  const k = economy.construction?.steelPerEcv;
  if (!to || !d || !(k > 0)) return null;
  return { ecv: round(to.ecv * d.costMul), steel: round(to.ecv * k * d.costMul), workers: to.workers, days: Math.ceil(to.days * d.timeMul) };
}
