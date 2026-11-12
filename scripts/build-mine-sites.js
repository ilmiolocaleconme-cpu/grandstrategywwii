// Genera data/resources/mine_sites.json: per ogni provincia e risorsa con punti (resource_points.json) e scala di estrazione, la produzione AGGIUNTIVA in t/giorno
// dei livelli di miniera 1..3 rispetto alla base (livello n = n/gapParts della distanza fra base e massimo; scala: extraction_scale.json). Giacimenti non esauribili.
// Tetto (12/11/2026): massimo = max × economy.mines.capFactor (1,1 = +10% per tutti).
// Sponde (12/11/2026): in una provincia divisa da un fiume il giacimento si DIVIDE fra le sponde in proporzione all'area; ogni sponda ha la sua
// miniera e il suo tetto, e la provincia accumula la somma (= il giacimento intero). La voce della provincia madre resta per i salvataggi di prima
// (miniere già costruite lì) ma è `legacy`: non si costruisce più sulla madre.
// Uso: npm run build:mine-sites
import fs from 'node:fs';
import { loadProvinces } from './load-provinces.js';
import { bankIndex, areaOf } from '../src/data/moveNet.js';

const j = (p) => JSON.parse(fs.readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const points = j('resources/resource_points.json').byProvince;
const scale = j('resources/extraction_scale.json').unitsPerPoint;
const mines = j('economy/economy.json').mines;
const parts = mines.gapParts;
const capFactor = mines.capFactor ?? 1;
const round = (v) => Math.round(v * 1000) / 1000;
const NOT_MINEABLE = new Set(['wheat']);

const collection = await loadProvinces();
const banks = bankIndex(collection.features);
const area = new Map(collection.features.map((f) => [f.properties.id, areaOf(f.geometry)]));
const shareOf = (mother) => {
  const ids = banks.banksOf(mother);
  const tot = ids.reduce((s, id) => s + area.get(id), 0);
  return ids.map((id) => [id, tot > 0 ? area.get(id) / tot : 1 / ids.length]);
};

const extraFor = (v, k, share = 1) => Array.from({ length: parts }, (_, i) => round(Math.max(0, v.max * capFactor - v.base) * (i + 1) / parts * k * share));
const byProvince = {};
for (const [pid, res] of Object.entries(points).sort()) {
  for (const [r, v] of Object.entries(res).sort()) {
    const k = scale[r];
    if (typeof k !== 'number') continue; // senza scala (rame, metalli rari...) non si costruiscono miniere
    if (NOT_MINEABLE.has(r)) continue; // il frumento ha una scala ma non è una miniera: l'espansione agricola verrà con il modello agricolo
    if (!banks.isSplit(pid)) { (byProvince[pid] ??= {})[r] = { base: v.base, max: v.max, extraPerDay: extraFor(v, k) }; continue; }
    (byProvince[pid] ??= {})[r] = { base: v.base, max: v.max, extraPerDay: extraFor(v, k), legacy: true };
    for (const [bid, share] of shareOf(pid)) (byProvince[bid] ??= {})[r] = { base: v.base, max: v.max, share: round(share), province: pid, extraPerDay: extraFor(v, k, share) };
  }
}
const sorted = Object.fromEntries(Object.entries(byProvince).sort(([a], [b]) => (a < b ? -1 : 1)));
const doc = { schema: 'mine-sites-v2', quality: 'PROVISIONAL', unit: 't di gioco al giorno in più della base, per livello 1..3 (cumulativo)', capFactor, note: 'Derivato da resource_points.json e extraction_scale.json (scala dei punti, anteriore ai fattori fisici di extraction_factors.json: da riallineare). Massimo = max × capFactor. Province divise da un fiume: una voce per sponda (share = quota di area) e la voce della madre marcata legacy (solo per le miniere costruite prima delle sponde). Le località aggiuntive di resource_locations_extra.json non hanno punti e non sono edificabili.', byProvince: sorted };
fs.writeFileSync(new URL('../data/resources/mine_sites.json', import.meta.url), JSON.stringify(doc, null, 2) + '\n');
const n = Object.values(sorted).reduce((s, x) => s + Object.values(x).filter((v) => !v.legacy).length, 0);
console.log(`siti di miniera costruibili: ${n} su ${Object.values(sorted).filter((x) => Object.values(x).some((v) => !v.legacy)).length} posti (tetto ×${capFactor})`);
