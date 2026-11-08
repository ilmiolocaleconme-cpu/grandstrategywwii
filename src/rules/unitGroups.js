// Gruppi di unità sul segnalino toccato e ordini dati a un comando. Funzioni PURE, senza stato.
import { divisionsUnder, orbatLevel } from './orbat.js';

const sum = (parts, k) => parts.reduce((n, p) => n + (p[k] ?? 0), 0);

/**
 * Gruppo di una nazione «in una provincia» per il tocco sul segnalino. Le unità sono raggruppate per la loro posizione ESATTA, che può essere
 * una città (una città è una destinazione a sé) o una sotto-provincia; il segnalino, invece, porta la provincia MADRE. Si uniscono quindi
 * tutti i gruppi della nazione la cui posizione ha quella provincia madre. Senza questo, un comando spostato su una città (es. Brema) e
 * rimasto solo non si poteva toccare. `motherOf(id)` dà la madre di una posizione (undefined = è già una madre).
 * Un'unità ha una sola posizione, quindi non compare in due gruppi: le liste si concatenano e i conteggi si sommano.
 * Con un solo gruppo restituisce lo stesso oggetto; senza gruppi null.
 */
export function groupAt(provinceUnits, motherOf, province, nation) {
  if (!provinceUnits || !province) return null;
  const parts = [];
  for (const [key, groups] of Object.entries(provinceUnits)) {
    if ((motherOf?.(key) ?? key) !== province) continue;
    const g = groups.find((x) => x.nation === nation);
    if (g) parts.push(g);
  }
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return { ...parts[0], units: parts.flatMap((p) => p.units), divisions: sum(parts, 'divisions'), commands: sum(parts, 'commands') };
}

const COMMAND_LEVELS = new Set(['corps', 'army', 'army_group', 'theater']);

/**
 * Le unità scelte più le divisioni agli ordini di ogni comando scelto, a ogni livello: un ordine dato a un corpo vale per le sue divisioni,
 * ciascuna parte dalla propria posizione. Senza doppioni, nell'ordine di ingresso; le unità non comandi restano com'erano.
 */
export function withSubordinates({ orbat, ids, unitsById }) {
  const out = new Set(ids);
  for (const id of ids) {
    const level = orbatLevel(unitsById.get(id) ?? {});
    if (COMMAND_LEVELS.has(level)) for (const d of divisionsUnder(orbat, id, unitsById)) out.add(d);
  }
  return [...out];
}
