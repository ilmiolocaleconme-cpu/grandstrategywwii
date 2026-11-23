// Dottrine (23/11/2026, decisione dell'utente 3A): modelli da scegliere per settore, profilo leggero per l'IA di produzione e di ricerca.
// Dati in data/ai/doctrines.json. Funzioni PURE.

/** Errori del catalogo delle dottrine. `groups` = gruppi di equipaggiamento ammessi, `branches` = rami di ricerca, `nationIds` = nazioni. */
export function validateDoctrines(doc, { groups, branches, nationIds }) {
  const errors = [];
  const max = doc.maxWeight;
  if (!(max > 0 && max <= 0.5)) errors.push('maxWeight non valido');
  const sectors = Object.keys(doc.sectors ?? {});
  const byId = new Map();
  for (const d of doc.doctrines ?? []) {
    if (byId.has(d.id)) errors.push(`${d.id}: duplicata`);
    byId.set(d.id, d);
    if (!sectors.includes(d.sector)) errors.push(`${d.id}: settore ${d.sector} inesistente`);
    if (!d.name_it) errors.push(`${d.id}: manca il nome`);
    for (const [k, w] of Object.entries(d.roles ?? {})) {
      if (!groups.includes(k)) errors.push(`${d.id}: gruppo ${k} inesistente`);
      if (!(w > 0 && w <= max)) errors.push(`${d.id}: peso ${k}=${w} fuori da (0, ${max}]`);
    }
    for (const [k, w] of Object.entries(d.research ?? {})) {
      if (!branches.includes(k)) errors.push(`${d.id}: ramo ${k} inesistente`);
      if (!(w > 0 && w <= max)) errors.push(`${d.id}: peso ${k}=${w} fuori da (0, ${max}]`);
    }
  }
  const checkSet = (label, set) => {
    for (const s of sectors) if (!set?.[s]) errors.push(`${label}: manca il settore ${s}`);
    for (const [s, id] of Object.entries(set ?? {})) {
      const d = byId.get(id);
      if (!d) errors.push(`${label}: dottrina ${id} inesistente`);
      else if (d.sector !== s) errors.push(`${label}: ${id} non è del settore ${s}`);
    }
  };
  checkSet('fallback', doc.fallback);
  for (const [n, set] of Object.entries(doc.defaults ?? {})) {
    if (!nationIds.includes(n)) errors.push(`defaults: ${n} non è una nazione`);
    checkSet(n, set);
  }
  return errors;
}

/** Dottrine in vigore per la nazione, per settore: scelta in partita (nation.doctrines) > predefinita della nazione > fallback. */
export function doctrinesOf(doc, nationId, nation = null) {
  const byId = new Map(doc.doctrines.map((d) => [d.id, d]));
  const out = {};
  for (const s of Object.keys(doc.sectors)) {
    const pick = [nation?.doctrines?.[s], doc.defaults?.[nationId]?.[s], doc.fallback[s]].find((id) => byId.get(id)?.sector === s);
    out[s] = byId.get(pick);
  }
  return out;
}

/** Moltiplicatore della dottrina (≥ 1): `{ role }` gruppo di equipaggiamento, oppure `{ branch }` ramo di ricerca. Somma dei pesi dei settori. */
export function doctrineFactor(active, { role = null, branch = null }) {
  let add = 0;
  for (const d of Object.values(active)) {
    if (role) add += d?.roles?.[role] ?? 0;
    if (branch) add += d?.research?.[branch] ?? 0;
  }
  return 1 + add;
}
