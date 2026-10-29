import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv } from '../src/data/csv.js';
import { mergeProduction, validateProduction, mtPerYearToGameTonsPerDay, TERRITORIES } from '../src/data/production.js';

const url = (p) => new URL(`../${p}`, import.meta.url);
const doc = JSON.parse(readFileSync(url('data/resources/production_1936.json'), 'utf8'));
const resources = JSON.parse(readFileSync(url('data/resources.json'), 'utf8'));
const first = parseCsv(readFileSync(url('data/resources/produzione_risorse_mondiale_1936.csv'), 'utf8'), { name: 'primo' });
const complete = parseCsv(readFileSync(url('data/resources/produzione_risorse_mondiale_completo_1936.csv'), 'utf8'), { name: 'completo' });
const get = (res, ter) => doc.rows.find((r) => r.resource === res && r.territory === ter);

test('produzione: il rame è nel catalogo risorse come materia prima', () => {
  const copper = resources.find((r) => r.id === 'copper');
  assert.ok(copper);
  assert.equal(copper.tipo, undefined);
});

const tin = parseCsv(readFileSync(url('data/resources/produzione_stagno_1936.csv'), 'utf8'), { name: 'produzione_stagno_1936.csv' });

test('produzione: il file generato coincide con la fusione dei tre CSV', () => {
  const { rows } = mergeProduction(first, complete, tin);
  assert.deepEqual(doc.rows, rows);
});

test('stagno 1936 (ricerca del 29/10/2026, ITRDC 1937 via Nature, tonnellate lunghe): 6 territori, totale circa 155.300 long ton, Malesia prima', () => {
  const rows = doc.rows.filter((r) => r.resource === 'tin');
  assert.equal(rows.length, 6);
  assert.ok(rows.every((r) => r.source === 'ricerca'));
  assert.deepEqual(rows.map((r) => r.territory), ['Malesia Britannica', 'Indie Orientali Olandesi', 'Bolivia', 'Siam', 'Cina (Nazionalista)', 'Nigeria Britannica']);
  assert.equal(get('tin', 'Malesia Britannica').mt, 0.067878); // 66.806 long ton × 1,016047
  assert.equal(get('tin', 'Indie Orientali Olandesi').scope, 'P_NLD_EI_');
  const totalLongTons = rows.reduce((s, r) => s + r.mt, 0) / 1.016047e-6;
  assert.ok(Math.abs(totalLongTons - 155297) < 2, `totale ${totalLongTons}`); // 66.806+31.546+24.074+12.678+10.664+9.529; il mondo era 179.600 (altri paesi senza dati)
});

test('produzione: il completo prevale e le righe mancanti arrivano dal primo', () => {
  assert.equal(get('oil', 'Iran').mt, 8); // 8,3 nel primo
  assert.equal(get('oil', 'Iran').source, 'completo');
  for (const [res, ter, mt] of [['iron_ore', 'Svezia', 11], ['coal', 'Giappone', 40], ['oil', 'Romania', 8.7], ['bauxite', 'Suriname', 0.24], ['sulphur', 'Cile', 0.025], ['rubber', 'Ceylon', 0.067], ['rubber', 'Indocina Francese', 0.042], ['rubber', 'Brasile', 0.015], ['copper', 'Unione Sovietica', 0.08]]) {
    assert.equal(get(res, ter)?.mt, mt, `${res}/${ter}`);
    assert.equal(get(res, ter).source, 'primo');
  }
  assert.equal(get('iron_ore', 'Germania').mt, 6.5); // solo nel completo
});

test('produzione: la Manciukuò e le colonie hanno il loro prefisso, Terranova è NFL, le Indie Olandesi solo le province EI', () => {
  assert.equal(get('coal', 'Manciukuò').prefix, 'MAN');
  assert.equal(get('iron_ore', 'Canada (Terranova)').prefix, 'NFL');
  assert.equal(get('oil', 'Indie Orientali Olandesi').scope, 'P_NLD_EI_');
  assert.equal(get('coal', 'Canada').prefix, 'CAN');
});

test('produzione: Australia e l\'aggregato Belgio/Congo Belga non sono nelle righe, ma restano tra le note', () => {
  assert.equal(get('coal', 'Australia'), undefined);
  assert.equal(doc.rows.some((r) => r.territory.includes('/')), false);
  assert.ok(doc.conflicts.some((c) => c.territory === 'Australia'));
  assert.ok(doc.conflicts.some((c) => c.territory === 'Iran' && c.primo === 8.3));
  assert.ok(Object.keys(TERRITORIES).length > 30);
});

test('produzione: validatore rifiuta duplicati, risorse ignote, prefissi senza province', () => {
  const provinceIds = new Set(['P_USA_X', 'P_NLD_EI_JAVA']);
  const ok = { schema: 'production-1936-v1', rows: [{ resource: 'coal', territory: 'Stati Uniti', prefix: 'USA', mt: 1, source: 'completo' }] };
  assert.deepEqual(validateProduction(ok, { resources, provinceIds }), []);
  const bad = { schema: 'production-1936-v1', rows: [ok.rows[0], ok.rows[0], { resource: 'zzz', territory: 'A', prefix: 'USA', mt: 1, source: 'completo' }, { resource: 'coal', territory: 'B', prefix: 'QQQ', mt: 0, source: 'x' }] };
  const e = validateProduction(bad, { resources, provinceIds }).join('|');
  assert.match(e, /duplicato/);
  assert.match(e, /non esiste in resources/);
  assert.match(e, /mt non valido/);
  assert.match(e, /fonte sconosciuta/);
  assert.match(e, /senza province/);
});

test('produzione: conversione Mt/anno → t/giorno di gioco', () => {
  assert.equal(mtPerYearToGameTonsPerDay(50, 43.8), 3127.5); // ferro USA
  assert.equal(mtPerYearToGameTonsPerDay(6.5, 43.8), 406.6); // ferro Germania
});
