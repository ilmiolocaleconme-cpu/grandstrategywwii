// Dati per il pannello «Divisioni» (editor a moduli, 18/11/2026). Funzioni PURE, nessuno stato React.
import { moduleAvailable, designCategory, designProblems, sumComposition } from '../data/modules.js';

export const TYPE_LABEL = Object.freeze({
  infantry: 'Fanteria', motorized_infantry: 'Fanteria motorizzata', mechanized_infantry: 'Fanteria meccanizzata', tank: 'Carri',
  anti_tank: 'Anticarro e cacciacarri', artillery: 'Artiglieria', support: 'Supporto e servizi',
});
export const CATEGORY_LABEL = Object.freeze({ infantry: 'fanteria', motorized: 'motorizzata', mechanized: 'meccanizzata', armored: 'corazzata' });
const TYPE_ORDER = Object.keys(TYPE_LABEL);
const itDate = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Battaglioni della nazione raggruppati per tipo: [{ type, label, rows: [{ id, name, men, count, available, reason }] }]. */
export function moduleGroups(modules, list, { nation, date, researched, techName = (x) => x }) {
  const count = new Map(list);
  const rows = modules.filter((m) => m.nation === nation).map((m) => {
    const ok = moduleAvailable(m, { nation, date, researched });
    const missing = [m.requiresTech ?? []].flat().filter((t) => !researched?.has(t));
    const reason = ok ? null : [missing.length ? `richiede ${missing.map(techName).join(' + ')}` : null, m.availableFrom && date < m.availableFrom ? `dal ${itDate(m.availableFrom)}` : null].filter(Boolean).join(' · ');
    return { id: m.id, type: m.type, name: m.name_it, men: m.men, divisional: m.divisional === true, count: count.get(m.id) ?? 0, available: ok, reason };
  });
  return TYPE_ORDER.map((type) => ({ type, label: TYPE_LABEL[type], rows: rows.filter((r) => r.type === type) })).filter((g) => g.rows.length);
}

/** Aggiunge (delta = +1/-1) un battaglione all'elenco [[id, n]], senza andare sotto zero. */
export function bump(list, id, delta) {
  const m = new Map(list);
  const n = Math.max(0, (m.get(id) ?? 0) + delta);
  if (n === 0) m.delete(id); else m.set(id, n);
  return [...m.entries()];
}

/** Riepilogo di una composizione: uomini, cavalli, battaglioni, categoria, mezzi principali e problemi. */
export function designSummary(list, ctx) {
  const valid = list.filter(([id, n]) => n > 0 && ctx.modules.some((m) => m.id === id));
  const sum = sumComposition(ctx.modules, valid);
  const pick = (re) => Object.entries(sum.equipment).filter(([k]) => re.test(k)).reduce((s, [, v]) => s + v, 0);
  const highlights = [
    { label: 'Carri', qty: pick(/^TNK-/) }, { label: 'Cacciacarri e cannoni d\'assalto', qty: pick(/^TD-/) },
    { label: 'Pezzi d\'artiglieria e anticarro', qty: pick(/^ART-DEU-(LEFH|SFH|LEIG|SIG|PAK|K18)|^ART-.*-(AT|GUN|HOW)/) },
    { label: 'Semicingolati', qty: pick(/SDKFZ/) }, { label: 'Autocarri', qty: pick(/TRUCK/) },
  ].filter((h) => h.qty > 0);
  // potenza di fuoco a dotazione piena (src/rules/battleV2.js → rawFirepower, passata da App.jsx): contro fanteria, contro corazzati, corazza media
  const fp = ctx.firepowerOf && valid.length ? ctx.firepowerOf(sum.equipment, sum.men) : null;
  const firepower = fp ? { soft: Math.round(fp.small.soft + fp.artillery.soft + fp.direct.soft), hard: Math.round(fp.small.hard + fp.artillery.hard + fp.direct.hard), armor: fp.armor } : null;
  return {
    men: sum.men, horses: sum.horses, battalions: valid.reduce((s, [, n]) => s + n, 0), category: designCategory(valid, ctx.modules),
    highlights, firepower, problems: designProblems(valid, ctx),
  };
}

/** Divisioni del giocatore riorganizzabili: [{ id, name, category, template, designId }] (solo divisioni con istanza). */
export function divisionRows(state, nation, units, designs, templateLabel = (id) => id) {
  const names = new Map(designs.map((d) => [d.id, d.name]));
  return units.filter((u) => u.nation === nation && u.echelon === 'division' && state.forces?.divisions?.[u.id])
    .map((u) => { const d = state.forces.divisions[u.id]; return { id: u.id, name: u.name, category: u.category, template: names.get(d.templateId) ?? templateLabel(d.templateId), designId: names.has(d.templateId) ? d.templateId : null }; })
    .sort((a, b) => a.name.localeCompare(b.name, 'it', { numeric: true }));
}

/**
 * Cosa serve per riorganizzare le divisioni scelte: [{ item, name, need, stock }] (solo equipaggiamenti, i più scarsi prima) e uomini mancanti.
 * previewOf(id) → { missing } (src/game/designsState.js → reorganizePreview). Le divisioni che già usano il modello o che danno errore sono saltate.
 */
export function reorgNeeds(state, nation, ids, previewOf, nameOf = (x) => x) {
  const need = {}; let men = 0; let count = 0;
  for (const id of ids) {
    let p; try { p = previewOf(id); } catch { continue; }
    count += 1;
    for (const [k, q] of Object.entries(p.missing)) { if (k === 'manpower.war') men += q; else if (k.startsWith('equipment.')) need[k] = (need[k] ?? 0) + q; }
  }
  const stocks = state.nations?.[nation]?.stocks ?? {};
  const rows = Object.entries(need).map(([k, q]) => ({ item: k, name: nameOf(k.slice('equipment.'.length)), need: q, stock: Math.floor(stocks[k] ?? 0) }))
    .sort((a, b) => (a.stock / a.need) - (b.stock / b.need) || (a.name < b.name ? -1 : 1));
  return { count, men, rows };
}
