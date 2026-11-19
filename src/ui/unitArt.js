// Illustrazioni delle unità (PNG fornite dall'utente il 18/11/2026; metadati in data/assets/unit_illustrations.json).
// Vite le copia nella build con l'hash e il service worker le mette in cache: funzionano offline.
import meta from '../../data/assets/unit_illustrations.json';

const FILES = import.meta.glob('../assets/units/*.png', { eager: true, import: 'default' });
const BY_ID = new Map(meta.items.map((it) => [it.id, { ...it, url: FILES[`../assets/units/${it.file}`] ?? null }]));

/** { id, file, description, url } dell'illustrazione, o null. */
export const unitArt = (id) => BY_ID.get(id) ?? null;

/** Illustrazione rappresentativa di una categoria di divisione (schede dei modelli). */
export const CATEGORY_ART = Object.freeze({ infantry: 'fanteria', motorized: 'trasporto_camion', mechanized: 'semicingolato', armored: 'carro_medio', mountain: 'alpini', cavalry: 'cavalleria', airborne: 'paracadutisti' });

/** Composizione della testata per categoria: [{ id, x (% da sinistra), h (% dell'altezza), z }] da dietro in avanti. */
export const BANNER_ART = Object.freeze({
  infantry: [{ id: 'artiglieria_ippotrainata', x: 62, h: 52 }, { id: 'trasporto_ippotrainato', x: 82, h: 46 }, { id: 'fanteria', x: 12, h: 86 }, { id: 'fanteria', x: 26, h: 80 }, { id: 'fanteria_motorizzata', x: 40, h: 84 }],
  motorized: [{ id: 'trasporto_camion', x: 22, h: 62 }, { id: 'artiglieria_trainata', x: 60, h: 44 }, { id: 'logistica_camion', x: 80, h: 58 }, { id: 'fanteria_motorizzata', x: 42, h: 84 }],
  mechanized: [{ id: 'carro_medio', x: 74, h: 56 }, { id: 'semicingolato', x: 26, h: 64 }, { id: 'fanteria_meccanizzata', x: 50, h: 78 }],
  mountain: [{ id: 'artiglieria_ippotrainata', x: 74, h: 50 }, { id: 'alpini', x: 18, h: 86 }, { id: 'alpini', x: 36, h: 78 }, { id: 'fanteria', x: 52, h: 74 }],
  cavalry: [{ id: 'trasporto_ippotrainato', x: 80, h: 50 }, { id: 'cavalleria', x: 20, h: 88 }, { id: 'cavalleria', x: 42, h: 80 }, { id: 'cavalleria', x: 62, h: 74 }],
  airborne: [{ id: 'contraerea', x: 86, h: 46 }, { id: 'fanteria', x: 22, h: 82 }, { id: 'paracadutisti', x: 46, h: 70 }, { id: 'paracadutisti', x: 68, h: 92 }],
  armored: [{ id: 'carro_pesante', x: 76, h: 60 }, { id: 'semicingolato', x: 52, h: 52 }, { id: 'carro_medio', x: 24, h: 70 }, { id: 'fanteria', x: 44, h: 72 }],
});
