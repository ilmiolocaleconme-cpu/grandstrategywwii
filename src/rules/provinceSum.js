// Provincia come ACCUMULATORE (decisione dell'utente 11/11/2026): una provincia divisa da un fiume non ha valori propri, è la somma
// delle sue sponde. Ogni sponda ha 14 slot, le sue fabbriche, le sue miniere (giacimento diviso per area, data/resources/mine_sites.json).
// Funzione PURA: la usa il pulsante «Provincia» nel pannello della sponda.

/**
 * state: partita; nationId: nazione che guarda; motherId: provincia madre; banks: id delle sponde;
 * ctx: { slots (per sponda), sites (mine_sites.json), catalog: { factories: Map }, slotsPerFactory, nameOf(id) }.
 * Ritorna { id, banks: [{ id, name, slots, used, factories, mines: { risorsa: livello }, extra: { risorsa: t/giorno } }], total: { … } }.
 * Fabbriche e miniere costruite sulla madre prima delle sponde (salvataggi vecchi) si contano a parte in `legacy`.
 */
export function provinceSum(state, nationId, motherId, banks, { slots, sites, catalog, slotsPerFactory = 1, nameOf = (id) => id }) {
  const nation = state?.nations?.[nationId] ?? null;
  const isIndustry = (f) => catalog?.factories?.get(f.type)?.factory_class === 'industry';
  const at = (id) => {
    const facilities = (nation?.facilities ?? []).filter((f) => f.provinceId === id);
    const industry = facilities.filter(isIndustry).length;
    const queued = (nation?.construction ?? []).filter((c) => c.kind === 'factory' && c.provinceId === id && c.slot).length;
    const mines = {}; const extra = {};
    for (const m of nation?.mines ?? []) {
      if (m.provinceId !== id) continue;
      mines[m.resource] = m.level;
      extra[m.resource] = sites?.byProvince?.[id]?.[m.resource]?.extraPerDay?.[m.level - 1] ?? 0;
    }
    return { factories: facilities.length, used: (industry + queued) * slotsPerFactory, mines, extra };
  };
  const rows = banks.map((id) => ({ id, name: nameOf(id), slots, ...at(id) }));
  const legacy = at(motherId);
  const total = { slots: slots * banks.length, used: legacy.used, factories: legacy.factories, extra: { ...legacy.extra }, deposits: {} };
  for (const r of rows) {
    total.used += r.used; total.factories += r.factories;
    for (const [res, t] of Object.entries(r.extra)) total.extra[res] = Math.round(((total.extra[res] ?? 0) + t) * 1000) / 1000;
    for (const [res, s] of Object.entries(sites?.byProvince?.[r.id] ?? {})) {
      if (s.legacy) continue;
      total.deposits[res] = Math.round(((total.deposits[res] ?? 0) + (s.extraPerDay?.[s.extraPerDay.length - 1] ?? 0)) * 1000) / 1000;
    }
  }
  return { id: motherId, name: nameOf(motherId), banks: rows, legacy: legacy.factories || legacy.used || Object.keys(legacy.mines).length ? legacy : null, total };
}
