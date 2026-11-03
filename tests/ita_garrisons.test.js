// Sedi di guarnigione italiane (03/11/2026): ogni voce ha fonte e affidabilità, nessuna sede inventata, nessun doppione.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const json = (p) => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const garr = json('units/source/ita_sedi_guarnigione.json');
const units = json('units/units.json').units;
const dep = json('units/deployment_1936.json');
const provinces = json('provinces/ITA.json').features.map((f) => f.properties);

test('ogni sede italiana ha fonte https, affidabilità dichiarata e provincia esistente nel catalogo', () => {
  const ids = new Set(provinces.map((p) => p.id));
  for (const e of garr.entries) {
    assert.match(e.source, /^https:\/\//, e.unit);
    assert.ok(['alta', 'media'].includes(e.reliability), e.unit);
    assert.ok(ids.has(e.province), `${e.unit}: ${e.province}`);
    assert.equal(units.find((u) => u.id === e.unit)?.nation, 'ITA', e.unit);
  }
  assert.equal(new Set(garr.entries.map((e) => e.unit)).size, garr.entries.length, 'nessun doppione');
});

test('le unità senza fonte letta (missing) restano non collocate: non si inventa', () => {
  const placed = new Set(dep.entries.map((e) => e.unit));
  assert.ok(garr.missing.length > 0);
  for (const m of garr.missing) { assert.ok(m.reason.length > 10); assert.ok(!placed.has(m.unit), `${m.unit} non deve avere una posizione`); }
});

test('nel dislocamento le divisioni italiane con sede sono collocate nella provincia madre della sede', () => {
  const mother = new Map(provinces.map((p) => [p.id, p.parentProvince ?? p.id]));
  const at = new Map(dep.entries.map((e) => [e.unit, e.province]));
  for (const e of garr.entries) assert.equal(at.get(e.unit), mother.get(e.province), e.unit);
  const divs = units.filter((u) => u.nation === 'ITA' && u.echelon === 'division');
  assert.equal(divs.filter((u) => at.has(u.id)).length, divs.length - garr.missing.filter((m) => divs.some((d) => d.id === m.unit)).length);
});
