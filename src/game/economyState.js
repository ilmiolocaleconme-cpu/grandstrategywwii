// Stato economico per nazione (schema 2): cassa, scorte, impianti, miniere costruite, rete di base e forze armate.
// Solo funzioni PURE. Gli impianti hanno la forma che `produceDay` (src/rules/production.js) già legge; in più `territory` (entità politica
// dove sorgono: una colonia lavora per il proprietario, ma il luogo resta tracciato per controllo e danni).
// Forze armate (terrestri, navali, aeree): campi VUOTI di proposito. Non esistono ancora cataloghi né ordini di battaglia 1936 (MISSING_DATA):
// il salvataggio non cambia forma quando arriveranno.

export const DIFFICULTIES = ['facile', 'media', 'reale'];
export const DEFAULT_DIFFICULTY = 'media';

const emptyForces = () => ({ land: [], naval: [], air: [] });
const emptyNation = () => ({ balance: 0, stocks: {}, facilities: [], mines: [], baseGridMw: 0, forces: emptyForces() });

/**
 * Stato iniziale delle nazioni dai dati: { [idProprietario]: { balance, stocks, facilities, mines, baseGridMw, forces } }.
 * ctx: { political (array), nationIds (array), industry (initial_industry.json), stocks (initial_stocks.json) }
 * - gli impianti e le scorte di una colonia vanno al proprietario (`owner`); ogni impianto ricorda il `territory`;
 * - la fascia C (industry.tierC) riceve la rete di base; le altre nazioni 0;
 * - `balance` parte da 0: la cassa iniziale non è ancora definita (MISSING_DATA, decisione da prendere).
 */
export function buildNations({ political, nationIds, industry, stocks }) {
  const ownerOf = new Map(political.map((e) => [e.id, e.owner ?? e.id]));
  // `nations` contiene le nazioni scegliibili e ogni altra entità che possiede industria (es. Iran, non giocabile)
  const nations = {};
  for (const id of [...nationIds].sort()) nations[id] = emptyNation();
  for (const id of industry.tierC ?? []) if (nations[id]) nations[id].baseGridMw = industry.baseGrid.megawatts;
  for (const territory of Object.keys(industry.nations).sort()) {
    const owner = ownerOf.get(territory);
    if (!owner) throw new Error(`stato economico: ${territory} non è un'entità politica`);
    if (!nations[owner]) nations[owner] = emptyNation(); // entità non giocabile con industria (es. Iran)
    for (const f of industry.nations[territory].facilities) {
      for (let k = 1; k <= f.count; k += 1) {
        const list = nations[owner].facilities;
        list.push({ id: `${owner}:${territory}:${f.factory}:${f.recipeId}:${k}`, type: f.factory, recipeId: f.recipeId, territory, damage: 0, priority: list.length + 1, active: true });
      }
    }
  }
  for (const territory of Object.keys(stocks.stocks).sort()) {
    const owner = ownerOf.get(territory);
    if (!owner) throw new Error(`stato economico: scorte di ${territory}, che non è un'entità politica`);
    if (!nations[owner]) nations[owner] = emptyNation();
    for (const [res, t] of Object.entries(stocks.stocks[territory])) nations[owner].stocks[res] = (nations[owner].stocks[res] ?? 0) + t;
  }
  return nations;
}

/** Errori di coerenza di `state.nations` (lista vuota = valido). `nations === null` = non ancora inizializzato (salvataggio dello schema 1). */
export function validateNations(nations, { player } = {}) {
  if (nations === null) return [];
  if (typeof nations !== 'object' || Array.isArray(nations)) return ['stato: nations non è un oggetto'];
  const errors = [];
  const seen = new Set();
  const num = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  for (const [id, n] of Object.entries(nations)) {
    if (n === null || typeof n !== 'object') { errors.push(`stato: nations["${id}"] non valido`); continue; }
    if (!num(n.balance)) errors.push(`stato: ${id}, cassa non valida`);
    if (!num(n.baseGridMw)) errors.push(`stato: ${id}, rete di base non valida`);
    for (const [r, v] of Object.entries(n.stocks ?? {})) if (!num(v)) errors.push(`stato: ${id}, scorta di ${r} non valida`);
    if (!n.stocks || typeof n.stocks !== 'object') errors.push(`stato: ${id}, scorte mancanti`);
    if (!Array.isArray(n.facilities)) errors.push(`stato: ${id}, impianti mancanti`);
    for (const f of n.facilities ?? []) {
      if (typeof f.id !== 'string' || f.id === '') errors.push(`stato: ${id}, impianto senza id`);
      else if (seen.has(f.id)) errors.push(`stato: impianto duplicato ${f.id}`);
      else seen.add(f.id);
      if (!(f.damage >= 0 && f.damage <= 1)) errors.push(`stato: ${f.id}, danno fuori da 0-1`);
      if (typeof f.type !== 'string' || typeof f.recipeId !== 'string') errors.push(`stato: ${f.id}, tipo o ricetta mancanti`);
    }
    if (!Array.isArray(n.mines)) errors.push(`stato: ${id}, miniere mancanti`);
    const fo = n.forces;
    if (!fo || !Array.isArray(fo.land) || !Array.isArray(fo.naval) || !Array.isArray(fo.air)) errors.push(`stato: ${id}, forze armate non valide`);
  }
  if (player !== undefined && !(player in nations)) errors.push('stato: player assente da nations');
  return errors;
}

/** Migrazione schema 1 → 2. Un salvataggio dello schema 1 non ha mai avuto economia (nessun sistema attivo): `nations` resta null e si inizializza dai dati iniziali al caricamento. */
export function migrateV1toV2(state) {
  return { ...state, schema: 2, difficulty: DEFAULT_DIFFICULTY, nations: null };
}
