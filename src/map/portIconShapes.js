// Disegno delle icone dei porti (viewBox 64 × 64): usato dal generatore degli SVG (scripts/build-port-icons.js) e dal disegno sulla mappa.
// shapes = forme chiuse, always = tratti di struttura, lines = dettagli, wave = onde (o null).
export const ICONS = {
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
