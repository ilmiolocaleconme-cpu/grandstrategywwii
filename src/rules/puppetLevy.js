// Risorse prese dai fantocci (decisione dell'utente 12/11/2026, opzione C): chi controlla un fantoccio sceglie quanta parte delle sue
// risorse estratte prendere (0, 25, 50, 75 o 100%); ogni giorno la quota passa dalle scorte del fantoccio alle sue, e il rapporto fra i due
// scende in proporzione alla quota (diplomacy.json → puppet.relationPerDayAtFull). Campo OPZIONALE `state.puppetLevy` = { fantoccio: quota }:
// assente = 0 per tutti (nessuna migrazione dei salvataggi).
// Fantoccio = entità politica del 1936 che possiede se stessa ma è controllata da un'altra (es. Manciukuò → Giappone, Terranova → Regno Unito).
// I mandati della Società delle Nazioni (proprietario LEAGUE) NON sono fantocci qui: decisione a parte.
// Funzioni PURE.

export const LEVY_STEPS = [0, 0.25, 0.5, 0.75, 1];

/**
 * Chi riceve l'economia di un'entità (estrazione, idroelettrico). Mandati della Società delle Nazioni (proprietario LEAGUE, che non è una
 * nazione): tutto a chi li amministra (decisione dell'utente 12/11/2026), es. Palestina → Regno Unito, Siria → Francia.
 * Danzica (città libera, amministra se stessa) resta a sé.
 * Fantoccio che NON è una nazione del gioco (es. Terranova, controllata dal Regno Unito): tutto a chi lo controlla (decisione dell'utente
 * 12/11/2026), perché non c'è nessuno che possa ricevere le sue risorse né un pannello dove scegliere la quota. nationIds: Set delle nazioni.
 */
export function economicOwner(e, nationIds = null) {
  const owner = e.owner ?? e.id;
  if (owner === 'LEAGUE' && e.controller) return e.controller;
  if (nationIds && !nationIds.has(owner) && e.controller && nationIds.has(e.controller)) return e.controller;
  return owner;
}
const r3 = (x) => Math.round(x * 1000) / 1000;

/** Map fantoccio → nazione che lo controlla, dai dati politici. */
export function puppetsOf(political) {
  const out = new Map();
  for (const e of political ?? []) {
    const owner = e.owner ?? e.id;
    if (owner === e.id && e.controller && e.controller !== e.id) out.set(e.id, e.controller);
  }
  return out;
}

export const levyOf = (state, puppet) => state?.puppetLevy?.[puppet] ?? 0;

/** Estrazione di base del giorno dopo le quote: { nazione: { risorsa: t } } → stessa forma, il fantoccio cede, chi controlla riceve. */
export function applyLevy(supply, puppets, levy) {
  if (!levy || Object.keys(levy).length === 0) return supply;
  const out = Object.fromEntries(Object.entries(supply).map(([k, v]) => [k, { ...v }]));
  for (const [puppet, share] of Object.entries(levy).sort()) {
    const overlord = puppets.get(puppet);
    if (!overlord || !(share > 0) || !out[puppet]) continue;
    out[overlord] ??= {};
    for (const [res, t] of Object.entries(out[puppet])) {
      const moved = r3(t * share);
      if (moved <= 0) continue;
      out[puppet][res] = r3(t - moved);
      out[overlord][res] = r3((out[overlord][res] ?? 0) + moved);
    }
  }
  return out;
}

/** Imposta la quota. Solo chi controlla il fantoccio; solo i valori di LEVY_STEPS. */
export function setLevy(state, puppets, actor, puppet, share) {
  if (puppets.get(puppet) !== actor) return { ok: false, reason: 'not_overlord' };
  if (!LEVY_STEPS.includes(share)) return { ok: false, reason: 'bad_share' };
  const levy = { ...(state.puppetLevy ?? {}) };
  if (share === 0) delete levy[puppet]; else levy[puppet] = share;
  return { ok: true, state: { ...state, puppetLevy: levy } };
}

/** Cosa rende la quota: { risorsa: t al giorno } dell'estrazione di base del fantoccio. */
export function levyYield(supply, puppet, share) {
  return Object.fromEntries(Object.entries(supply[puppet] ?? {}).map(([res, t]) => [res, r3(t * share)]).filter(([, t]) => t > 0));
}
