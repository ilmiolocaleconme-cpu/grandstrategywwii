// Nomi originali e terreno urbano delle città (data/citta_grandi.json, scripts/city-names.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { localName, NOMI_STORICI, isLatin } from '../scripts/city-names.js';
import { cyrillicToLatin, greekToLatin } from '../scripts/translit.js';

const cities = JSON.parse(readFileSync(new URL('../data/citta_grandi.json', import.meta.url), 'utf8')).features;

test('ogni zona di città ha id proprio, cittaId, nome originale, lingua e terreno urbano', () => {
  assert.equal(new Set(cities.map((c) => c.id)).size, cities.length, 'id duplicati');
  for (const c of cities) {
    const p = c.properties;
    assert.equal(p.id, c.id, `${c.id}: properties.id diverso`);
    assert.ok(p.cittaId && c.id.startsWith(p.cittaId), `${c.id}: cittaId`);
    assert.ok(p.nameLocal && typeof p.nameLocal === 'string', `${c.id}: nameLocal`);
    assert.ok(isLatin(p.nameLocal), `${c.id}: nome non in alfabeto latino: ${p.nameLocal}`);
    assert.equal(p.terreno, 'urbano', c.id);
    assert.ok(p.nameLocalBasis, `${c.id}: base del nome`);
  }
});

test('nomi originali: scelta della lingua per nazione, per repubblica sovietica e nomi storici', () => {
  assert.deepEqual(localName('DEU', { NAME: 'Wroclaw', NAME_DE: 'Breslau' }), { nameLocal: 'Breslau', lang: 'de', basis: 'NE NAME_DE' });
  assert.equal(localName('USSR', { NAME: 'Kyiv', NAME_UK: 'Київ', NAME_RU: 'Киев', ADM0NAME: 'Ukraine' }).nameLocal, 'Kyiv');
  assert.equal(localName('EGY', { NAME: 'Cairo', NAME_AR: 'القاهرة' }).nameLocal, 'Cairo');
  assert.equal(localName('GRC', { NAME: 'Athens', NAME_EL: 'Αθήνα' }).nameLocal, 'Athina', 'greco traslitterato');
  assert.equal(localName('USSR', { NAME: 'Moscow', NAME_RU: 'Москва', ADM0NAME: 'Russia' }).nameLocal, 'Moskva', 'russo traslitterato');
  assert.equal(localName('USSR', { NAME: 'Москва', NAMEASCII: 'Moskva', ADM0NAME: 'Georgia' }).nameLocal, 'Moskva', 'NAME non latino: si passa a NAMEASCII');
  assert.equal(localName('USSR', { NAME: 'Moscow', NAME_UK: 'Москва', NAME_RU: 'Москва', ADM0NAME: 'Russia' }).lang, 'ru');
  assert.equal(localName('ROM', { NAME: 'București' }).nameLocal, 'București');
  assert.equal(localName('USSR', { NAME: 'x', NAME_RU: 'Санкт-Петербург', ADM0NAME: 'Russia' }, 'P_USSR_LENINGRADO_CITTA').nameLocal, 'Leningrad');
  const byId = new Map(cities.map((c) => [c.properties.cittaId, c.properties]));
  for (const id of Object.keys(NOMI_STORICI)) assert.ok(byId.has(id), `${id}: la città non esiste`);
  assert.equal(byId.get('P_USSR_STALINGRADO_CITTA').nameLocal, 'Stalingrad');
});

test('Berlino: capitale divisa dalla Spree, tutta la provincia è città', () => {
  const b = cities.filter((c) => c.properties.cittaId === 'P_DEU_BERLINO_CITTA');
  assert.ok(b.length >= 2, `zone di Berlino: ${b.length}`);
  assert.equal(b[0].properties.nameLocal, 'Berlin');
  assert.ok(b.reduce((s, c) => s + c.properties.areaKm2, 0) > 800);
});

test('traslitterazione: russo, ucraino e greco senza lettere non latine', () => {
  assert.equal(cyrillicToLatin('Санкт-Петербург'), 'Sankt-Peterburg');
  assert.equal(cyrillicToLatin('Нижний Новгород'), 'Nizhniy Novgorod');
  assert.equal(cyrillicToLatin('Щёлково'), 'Shchyolkovo');
  assert.equal(cyrillicToLatin('Київ', 'uk'), 'Kyiv');
  assert.equal(cyrillicToLatin('Харків', 'uk'), 'Kharkiv');
  assert.equal(cyrillicToLatin('Єнакієве', 'uk'), 'Yenakiieve');
  assert.equal(greekToLatin('Αθήνα'), 'Athina');
  assert.equal(greekToLatin('Θεσσαλονίκη'), 'Thessaloniki');
  assert.equal(greekToLatin('Πάτρα'), 'Patra');
});
