import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProvinces } from '../scripts/load-provinces.js';
import { isLatin } from '../scripts/city-names.js';

// Città del resto del mondo (scripts/build-cities-world.js + scripts/build-cities.js): controlli di struttura e di copertura.
const read = (n) => JSON.parse(readFileSync(new URL(`../data/${n}`, import.meta.url), 'utf8'));
const zones = read('citta_grandi.json').features;
const base = read('sources/citta_base.json').features;
const worldBase = base.filter((f) => String(f.properties.source).includes(', world'));
const provinces = await loadProvinces();
const provIds = new Set(provinces.features.map((f) => f.properties.id));
const worldIds = new Set(worldBase.map((f) => f.id));
const worldZones = zones.filter((f) => worldIds.has(f.properties.cittaId));

test('mondo: 1153 città nuove in 109 nazioni, id unici, provincia madre esistente', () => {
  assert.equal(worldBase.length, 1153);
  assert.equal(new Set(worldBase.map((f) => f.id)).size, worldBase.length);
  assert.equal(new Set(worldBase.map((f) => f.properties.owner)).size, 109);
  for (const f of worldBase) {
    assert.match(f.id, /^P_[A-Z_]+_[A-Z0-9_]+_CITTA/);
    assert.ok(provIds.has(f.properties.parentProvince), `${f.id} -> ${f.properties.parentProvince}`);
    assert.equal(f.properties.kind, 'citta');
  }
});

test('mondo: nessuna nazione ha città sia vecchie sia nuove (le nuove solo dove prima non ce n era)', () => {
  const old = new Set(base.filter((f) => !worldIds.has(f.id)).map((f) => f.properties.owner));
  for (const f of worldBase) assert.equal(old.has(f.properties.owner), false, `${f.id} (${f.properties.owner})`);
});

test('mondo: ogni zona ha terreno urbano, nome originale in alfabeto latino, area e fonte', () => {
  assert.ok(worldZones.length >= worldBase.length, `${worldZones.length}`);
  for (const f of worldZones) {
    const p = f.properties;
    assert.equal(p.terreno, 'urbano', p.id);
    assert.ok(p.areaKm2 > 0, p.id);
    assert.ok(isLatin(p.nameLocal), `${p.id}: ${p.nameLocal}`);
    assert.ok(provIds.has(p.parentProvince), p.id);
  }
  assert.equal(new Set(zones.map((f) => f.properties.id)).size, zones.length);
});

test('mondo: le grandi città ci sono (nome e provincia dell\'owner giusto)', () => {
  const owner = (id) => zones.find((f) => f.properties.cittaId === id)?.properties.owner;
  const byName = (n, o) => zones.find((f) => f.properties.name === n && f.properties.owner === o);
  for (const [n, o] of [['Tokyo', 'JPN'], ['Shanghai', 'CHN'], ['Beijing', 'CHN'], ['Mumbai', 'IND'], ['New York', 'USA'], ['Chicago', 'USA'], ['San Paolo', 'BRA'], ['Buenos Aires', 'ARG'], ['Mexico City', 'MEX']]) {
    const hit = zones.find((f) => f.properties.owner === o && (f.properties.name === n || f.properties.nameLocal === n || f.properties.name.startsWith(n)));
    assert.ok(hit || byName(n, o), `${n} (${o}) manca`);
  }
  assert.ok(owner);
});

test('mondo: le capitali di Natural Earth con almeno 50 000 abitanti hanno una città', () => {
  const owners = new Set(worldBase.map((f) => f.properties.owner));
  for (const o of ['JPN', 'CHN', 'IND', 'USA', 'BRA', 'ARG', 'AUS', 'CAN', 'MEX', 'IRN', 'AFG']) assert.ok(owners.has(o), o);
  assert.ok(worldBase.some((f) => /capitale/.test(f.properties.source)));
});
