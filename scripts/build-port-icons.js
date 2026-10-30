// Genera le icone SVG originali dei porti (commerciale, cantiere navale) in due stili: contorno e pieno. Uso: node scripts/build-port-icons.js
// Disegno originale (non derivato da altre icone). Colore = currentColor; nel pieno i dettagli usano --icon-cut (default bianco).
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = new URL('../public/icons/map/', import.meta.url);
mkdirSync(OUT, { recursive: true });

// Ogni icona: shapes = forme chiuse (riempite nel pieno), lines = tratti di dettaglio (nel pieno in colore di taglio), always = tratti sempre in colore pieno.
const ICONS = {
  'porto-commerciale': {
    shapes: [
      'M4 41H30L26 52H8Z',                    // scafo della nave
      'M10 33H20V41H10Z',                     // ponte/cabina
      'M8 16H20V24H8Z',                       // container sollevato
      'M47 40H60V50H47Z', 'M47 29H60V38H47Z', // pila di container
    ],
    always: ['M5 12H49', 'M30 12V50', 'M42 12V50', 'M14 12V16', 'M30 50H60'], // braccio, gambe, cavo, banchina
    lines: ['M30 20L42 36M42 20L30 36', 'M51 31V37M56 31V37', 'M51 42V48M56 42V48'], // controventi, nervature container
    wave: 'M4 58q4-3 8 0t8 0 8 0 8 0 8 0 8 0 8 0',
  },
  'cantiere-navale': {
    shapes: [
      'M8 44H56L49 54H15Z',                   // scafo sullo scalo
      'M26 18H38V27H26Z',                     // blocco di scafo in sospensione
    ],
    always: ['M6 12H58', 'M8 12V58', 'M56 12V58', 'M32 12V18', 'M16 58H48'], // portale, gambe, cavo, taglio
    lines: ['M24 44V34M32 44V32M40 44V34M48 44V36', 'M28 22H36'], // ossatura (ordinate) e dettaglio blocco
    wave: null,
  },
};

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
