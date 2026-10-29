// Regole pure di spionaggio e difesa: difesa di un luogo, probabilità, tiro deterministico. Nessun Math.random, nessun Date.now.
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r3 = (v) => Math.round(v * 1000) / 1000;

/** Tiro deterministico in [0, 1) da una chiave testuale (FNV-1a + mescolamento): stesso stato e stessa chiave → stesso numero, quindi la partita si riproduce dal salvataggio. */
export function roll01(...parts) {
  const s = parts.join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Difesa di un luogo: polizia locale + guarnigione (livello 0-3) + polizia militare (× moltiplicatore col controspionaggio). Ritorna anche i tre contributi. */
export function defenseScore(cfg, { mp = 0, garrison = 0, counterIntel = false }) {
  const local = cfg.localPolice.defense;
  const gar = garrison * cfg.garrison.defensePerLevel;
  const police = mp * cfg.militaryPolice.defense * (counterIntel ? cfg.militaryPolice.ciMultiplier : 1);
  return { local, garrison: r3(gar), militaryPolice: r3(police), total: r3(local + gar + police) };
}

/** Probabilità di riuscita di un sabotaggio: base − difesa × peso + bonus delle spie schierate (fino a maxSpyBonus), limitata a [minChance, maxChance]. */
export function sabotageChance(cfg, defense, spies = 0) {
  const s = cfg.sabotage;
  return r3(clamp(s.baseChance - s.chancePerDefense * defense + s.spyBonus * Math.min(spies, s.maxSpyBonus), s.minChance, s.maxChance));
}

/** Probabilità che l'operazione venga scoperta (e il sabotatore catturato): cresce con la difesa. */
export function detectionChance(cfg, defense) {
  const s = cfg.sabotage;
  return r3(clamp(s.detectBase + s.detectPerDefense * defense, s.minDetect, s.maxDetect));
}

/** Probabilità giornaliera di scoprire UNA spia straniera schierata, per la nazione con controspionaggio e `policeTotal` reparti di polizia militare. */
export function catchChance(cfg, policeTotal) {
  const c = cfg.counterintelligence;
  return r3(Math.min(c.maxCatch, c.catchBase + c.catchPerPolice * policeTotal));
}

/** Errori di coerenza del file dei parametri (lista vuota = valido). */
export function validateSecurityConfig(file, { techIds = null } = {}) {
  if (file?.schema !== 'security-v1') return [`sicurezza: schema ${file?.schema}, atteso security-v1`];
  const errors = [];
  if (!['DESIGN_DEFAULT', 'verified'].includes(file.quality)) errors.push('sicurezza: qualità sconosciuta');
  const pos = (v, what) => { if (!(typeof v === 'number' && v > 0)) errors.push(`sicurezza: ${what} non valido`); };
  for (const [k, a] of Object.entries(file.agents ?? {})) { pos(a.cost_ecv, `costo ${k}`); pos(a.days, `giorni ${k}`); }
  if (!file.agents?.spy || !file.agents?.saboteur) errors.push('sicurezza: servono spia e sabotatore');
  const m = file.militaryPolice ?? {};
  pos(m.cost_ecv, 'costo polizia militare'); pos(m.days, 'giorni polizia militare'); pos(m.defense, 'difesa polizia militare'); pos(m.maxPerPlace, 'massimo per luogo');
  if (!(m.ciMultiplier >= 1)) errors.push('sicurezza: ciMultiplier deve essere ≥ 1');
  pos(file.localPolice?.defense, 'polizia locale'); pos(file.garrison?.defensePerLevel, 'guarnigione');
  const s = file.sabotage ?? {};
  pos(s.cost_ecv, 'costo sabotaggio'); pos(s.days, 'giorni sabotaggio');
  if (!(s.damage > 0 && s.damage <= 1)) errors.push('sicurezza: danno del sabotaggio fuori da (0, 1]');
  if (!(s.minChance >= 0 && s.maxChance <= 1 && s.minChance < s.maxChance)) errors.push('sicurezza: limiti di probabilità non validi');
  if (!(s.minDetect >= 0 && s.maxDetect <= 1 && s.minDetect < s.maxDetect)) errors.push('sicurezza: limiti di scoperta non validi');
  if (!(file.counterintelligence?.maxCatch > 0 && file.counterintelligence.maxCatch <= 1)) errors.push('sicurezza: maxCatch non valido');
  pos(file.repair?.perDay, 'riparazione al giorno');
  for (const [cap, t] of Object.entries(file.capabilities ?? {})) if (techIds && !techIds.has(t)) errors.push(`sicurezza: la capacità ${cap} richiede ${t}, che non esiste`);
  if (!file.capabilities?.agents || !file.capabilities?.counterintelligence) errors.push('sicurezza: mancano le capacità agents e counterintelligence');
  return errors;
}
