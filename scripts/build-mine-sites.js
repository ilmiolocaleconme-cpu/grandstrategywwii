// Genera data/resources/mine_sites.json: per ogni provincia e risorsa con punti (resource_points.json) e scala di estrazione, la produzione AGGIUNTIVA in t/giorno
// dei livelli di miniera 1..3 rispetto alla base (livello n = n/gapParts della distanza fra base e max; scala: extraction_scale.json). Giacimenti non esauribili.
// Uso: npm run build:mine-sites
import fs from 'node:fs';

const j = (p) => JSON.parse(fs.readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const points = j('resources/resource_points.json').byProvince;
const scale = j('resources/extraction_scale.json').unitsPerPoint;
const parts = j('economy/economy.json').mines.gapParts;
const round = (v) => Math.round(v * 1000) / 1000;
const byProvince = {};
for (const [pid, res] of Object.entries(points).sort()) {
  for (const [r, v] of Object.entries(res).sort()) {
    const k = scale[r];
    if (typeof k !== 'number') continue; // senza scala (rame, metalli rari...) non si costruiscono miniere
    const extra = Array.from({ length: parts }, (_, i) => round((v.max - v.base) * (i + 1) / parts * k));
    (byProvince[pid] ??= {})[r] = { base: v.base, max: v.max, extraPerDay: extra };
  }
}
const doc = { schema: 'mine-sites-v1', quality: 'PROVISIONAL', unit: 't di gioco al giorno in più della base, per livello 1..3 (cumulativo)', note: 'Derivato da resource_points.json e extraction_scale.json (scala dei punti, anteriore ai fattori fisici di extraction_factors.json: da riallineare). Le località aggiuntive di resource_locations_extra.json non hanno punti e non sono edificabili.', byProvince };
fs.writeFileSync(new URL('../data/resources/mine_sites.json', import.meta.url), JSON.stringify(doc, null, 2) + '\n');
console.log(`siti di miniera: ${Object.values(byProvince).reduce((s, x) => s + Object.keys(x).length, 0)} su ${Object.keys(byProvince).length} province`);
