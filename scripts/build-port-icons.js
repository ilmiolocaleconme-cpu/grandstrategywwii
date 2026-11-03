// Genera le icone SVG originali dei porti (commerciale, cantiere navale) in due stili: contorno e pieno. Uso: node scripts/build-port-icons.js
// Disegno originale (non derivato da altre icone). Colore = currentColor; nel pieno i dettagli usano --icon-cut (default bianco).
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = new URL('../public/icons/map/', import.meta.url);
mkdirSync(OUT, { recursive: true });

// Ogni icona: shapes = forme chiuse (riempite nel pieno), lines = tratti di dettaglio (nel pieno in colore di taglio), always = tratti sempre in colore pieno.
import { ICONS } from '../src/map/portIconShapes.js';

const svg = (def, solid) => {
  const sw = 2.6;
  const common = `stroke-linecap="round" stroke-linejoin="round"`;
  const fill = solid ? 'currentColor' : 'none';
  const shapes = def.shapes.map((d) => `<path d="${d}" fill="${fill}"/>`).join('');
  const always = def.always.map((d) => `<path d="${d}" fill="none"/>`).join('');
  const detailStroke = solid ? 'var(--icon-cut, #fff)' : 'currentColor';
  const lines = def.lines.map((d) => `<path d="${d}" fill="none" stroke="${detailStroke}" stroke-width="${solid ? 2 : sw}"/>`).join('');
  const wave = def.wave ? `<path d="${def.wave}" fill="none"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" stroke-width="${sw}" ${common}>${shapes}${always}${wave}${lines}</svg>\n`;
};
for (const [name, def] of Object.entries(ICONS)) {
  writeFileSync(new URL(`${name}.svg`, OUT), svg(def, false));
  writeFileSync(new URL(`${name}-pieno.svg`, OUT), svg(def, true));
}
console.log('Icone scritte in public/icons/map/:', Object.keys(ICONS).flatMap((n) => [`${n}.svg`, `${n}-pieno.svg`]).join(', '));
