// Confronta due file prodotti da functional.mjs (SVG e Canvas): stampa le differenze di selezione per tocco.
//   node scripts/bench/compare-select.mjs svg.json canvas.json
import { readFileSync } from 'node:fs';

const [a, b] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8')));
let total = 0;
let diff = 0;
for (const name of Object.keys(a.taps)) {
  a.taps[name].forEach(([x, y, ta], i) => {
    const tb = b.taps[name][i][2];
    total += 1;
    if (ta !== tb) { diff += 1; console.log(`${name} (${x},${y}): SVG «${ta}» / Canvas «${tb}»`); }
  });
}
console.log(`tocchi uguali: ${total - diff} su ${total}; differenze: ${diff}`);
console.log(`errori di pagina: SVG ${a.errors.length}, Canvas ${b.errors.length}`);
