// Riserva militare di munizioni e divisioni INTERE (regola approvata dall'utente il 04/11/2026).
// Regole:
//  1. Una divisione si conta intera: la capacità sostiene `floor` di divisioni, mai frazioni (una nazione con 49,8 divisioni ne sostiene 49).
//  2. Riserva minima di munizioni di una nazione = somma del consumo di attacco di ciascuna divisione ATTIVA al 1/1/1936 × RESERVE_DAYS.
//  3. Copertura: la produzione di munizioni deve sostenere TUTTE le divisioni attive in attacco continuo (ammo_consumption.json).
//  4. Le scorte militari non dipendono dal deficit d'acciaio delle fabbriche (quello resta per l'industria, regola dei 150 giorni).
// Funzioni PURE. Il consumo per categoria viene da data/military/ammo_consumption.json; una categoria di divisione senza consumo è un errore, non zero.
import { dailyAmmo } from '../data/ammo.js';
import { isActiveAt } from '../data/units.js';

export const RESERVE_DAYS = 30; // approvato dall'utente (04/11/2026)
export const MUNITIONS_ID = 'munitions';
export const FACTORY_OUTPUT_T = 100; // t/giorno per fabbrica di munizioni (catalogo factories.csv, FCT-MUNITIONS)
export const RESERVE_DATE = '1936-01-01';

// categoria di divisione (units.json) → categoria di consumo (ammo_consumption.json)
export const DIVISION_AMMO_CATEGORY = Object.freeze({
  infantry: 'infantry_foot', mountain: 'infantry_foot', airborne: 'infantry_foot', cavalry: 'infantry_foot',
  motorized: 'infantry_motorized', mechanized: 'infantry_motorized', armored: 'armor',
});

/** Divisioni attive alla data, con la categoria di consumo. Lancia se una categoria non ha un consumo. */
export function activeDivisions(units, ammo, date = RESERVE_DATE) {
  const out = [];
  for (const u of units) {
    if (u.echelon !== 'division' || !isActiveAt(u, date)) continue;
    const cat = DIVISION_AMMO_CATEGORY[u.category];
    const daily = cat ? dailyAmmo(ammo, cat, 'attack') : null;
    if (daily === null) throw new Error(`divisione ${u.id} (${u.category}) senza consumo di munizioni`);
    out.push({ id: u.id, nation: u.nation, daily });
  }
  return out;
}

/** Quante divisioni intere sostiene una produzione (t/giorno), prendendo le più economiche per prime. */
export function wholeDivisionsSupported(capacityPerDay, dailyCosts) {
  let left = Math.max(0, capacityPerDay); let count = 0;
  for (const c of [...dailyCosts].sort((a, b) => a - b)) {
    if (c > left) break;
    left -= c; count += 1;
  }
  return { count, leftover: Math.round(left * 1000) / 1000 };
}

/** Per nazione: { divisions, dailyNeed (t/giorno), reserve (t), capacity (t/giorno), supported (divisioni intere), covered }. */
export function militaryReserve({ divisions, factories, days = RESERVE_DAYS }) {
  const byNation = new Map();
  for (const d of divisions) {
    if (!byNation.has(d.nation)) byNation.set(d.nation, []);
    byNation.get(d.nation).push(d.daily);
  }
  const out = {};
  for (const [nation, costs] of [...byNation].sort(([a], [b]) => a.localeCompare(b))) {
    const dailyNeed = costs.reduce((s, c) => s + c, 0);
    const capacity = (factories[nation] ?? 0) * FACTORY_OUTPUT_T;
    const { count } = wholeDivisionsSupported(capacity, costs);
    out[nation] = {
      divisions: costs.length,
      dailyNeed: Math.round(dailyNeed * 1000) / 1000,
      reserve: Math.round(dailyNeed * days * 1000) / 1000,
      capacity,
      supported: count,
      covered: capacity >= dailyNeed,
    };
  }
  return out;
}
