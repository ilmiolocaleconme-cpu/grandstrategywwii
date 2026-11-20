// Caserme (data/military/barracks.json, 20/11/2026): lettura e validazione dei dati. Funzioni PURE.

/** Errori del file delle caserme. ctx: { provinceExists?(id) → bool }. */
export function validateBarracksData(doc, { provinceExists = null } = {}) {
  const e = [];
  if (!doc || doc.schema !== 'barracks-v1') return ['caserme: schema non valido'];
  if (!Array.isArray(doc.nations)) e.push('caserme: `nations` deve essere un elenco');
  if (!(Number.isInteger(doc.capacityDivisions) && doc.capacityDivisions >= 1)) e.push('caserme: capacityDivisions deve essere un intero ≥ 1');
  if (!(Number.isInteger(doc.maxPerProvince) && doc.maxPerProvince >= 1)) e.push('caserme: maxPerProvince deve essere un intero ≥ 1');
  const levels = Array.isArray(doc.levels) ? doc.levels : [];
  if (!levels.length) e.push('caserme: nessun livello');
  levels.forEach((l, i) => {
    if (l.level !== i + 1) e.push(`caserme: i livelli devono essere 1, 2, 3… (trovato ${l.level} in posizione ${i + 1})`);
    if (!(Number.isInteger(l.experienceBonus) && l.experienceBonus >= 0)) e.push(`caserme: livello ${l.level}, experienceBonus non valido`);
    if (!(l.trainingFactor > 0 && l.trainingFactor <= 1)) e.push(`caserme: livello ${l.level}, trainingFactor fuori da (0, 1]`);
    const b = doc.build?.[String(l.level)];
    if (!b || !(b.ecv >= 0) || !(b.steel >= 0) || !(Number.isInteger(b.days) && b.days > 0)) e.push(`caserme: costo del livello ${l.level} mancante o non valido`);
  });
  const ids = new Set();
  for (const [nation, list] of Object.entries(doc.initial ?? {})) {
    if (!doc.nations?.includes(nation)) e.push(`caserme: ${nation} ha caserme iniziali ma non è fra le nazioni con caserme`);
    for (const b of list) {
      if (typeof b.id !== 'string' || ids.has(b.id)) e.push(`caserme: id mancante o doppio (${b.id})`);
      ids.add(b.id);
      if (typeof b.province !== 'string') e.push(`caserme: ${b.id} senza provincia`);
      else if (provinceExists && !provinceExists(b.province)) e.push(`caserme: ${b.id}, provincia sconosciuta ${b.province}`);
      if (!levels.some((l) => l.level === b.level)) e.push(`caserme: ${b.id}, livello ${b.level} inesistente`);
    }
    const per = new Map();
    for (const b of list) per.set(b.province, (per.get(b.province) ?? 0) + 1);
    for (const [p, n] of per) if (n > doc.maxPerProvince) e.push(`caserme: ${nation} ha ${n} caserme in ${p} (massimo ${doc.maxPerProvince})`);
  }
  return e;
}

export const barracksEnabled = (doc, nation) => Boolean(doc?.nations?.includes(nation));
export const barracksLevelDef = (doc, level) => doc.levels.find((l) => l.level === level) ?? null;
export const maxBarracksLevel = (doc) => doc.levels.length;
/** Costo per arrivare al livello `level` (1 = caserma nuova): { ecv, steel, days } (copia) o null. */
export const barracksBuildCost = (doc, level) => (doc.build?.[String(level)] ? { ...doc.build[String(level)] } : null);
