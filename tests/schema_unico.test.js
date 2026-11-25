// Schema unico per tutte le nazioni (20/11/2026, decisione dell'utente): ogni template di divisione o brigata è la somma di battaglioni
// (data/units/modules/modules_<nazione>.json). Questa lista contiene i template NON ancora convertiti: può solo accorciarsi.
// Un template nuovo costruito in un altro modo (CSV, a mano) fa fallire il test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const dir = new URL('../data/units/templates/', import.meta.url);
const all = readdirSync(dir).filter((f) => /^(divisione|brigata)_.*\.json$/.test(f)).map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'))).filter((t) => t.appliesTo);

const DA_CONVERTIRE = new Set([
  // Regno Unito dai battaglioni dal 24/11/2026 (data/units/modules/modules_gbr.json)
  // USA dai battaglioni dal 21/11/2026 (data/units/modules/modules_usa.json)
  // Francia dai battaglioni dal 25/11/2026 (data/units/modules/modules_fra.json)
  // Italia dai battaglioni dal 24/11/2026 (data/units/modules/modules_ita.json)
  // Giappone dai battaglioni dal 25/11/2026 (data/units/modules/modules_jpn.json)
]);

test('schema unico: ogni template è composto da battaglioni, salvo quelli ancora da convertire (lista che può solo accorciarsi)', () => {
  const fromModules = (t) => Array.isArray(t.modules) && t.modules.length > 0;
  const odd = all.filter((t) => !fromModules(t)).map((t) => t.id).sort();
  assert.deepEqual(odd.filter((id) => !DA_CONVERTIRE.has(id)), [], 'template nuovi costruiti fuori dallo schema dei battaglioni');
  assert.deepEqual([...DA_CONVERTIRE].filter((id) => !odd.includes(id)), [], 'template già convertiti: toglierli dalla lista');
});

test('schema unico: Germania e URSS interamente dai battaglioni (URSS corazzati dal 20/11/2026); ogni nazione con battaglioni ha il nome nazionale', () => {
  for (const t of all.filter((x) => x.appliesTo.nation === 'DEU' || x.appliesTo.nation === 'USSR')) assert.ok(Array.isArray(t.modules), t.id);
  for (const f of readdirSync(new URL('../data/units/modules/', import.meta.url)).filter((n) => /^modules_.*\.json$/.test(n))) {
    const doc = JSON.parse(readFileSync(new URL(`../data/units/modules/${f}`, import.meta.url), 'utf8'));
    for (const m of doc.modules) assert.ok(m.name_native && m.name_it, `${f}: ${m.id}`);
    for (const c of doc.compositions) assert.ok(c.name, `${f}: ${c.templateId} senza nome nazionale`);
  }
});
