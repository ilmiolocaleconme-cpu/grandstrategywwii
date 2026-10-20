// Controlli sulla mappa a nodi condivisi (bozza di province, sponde e città).
// Il file di input è prodotto da tools/ (script mappa_nodi.py, non nel repository):
//   MAPPA_BOZZA=/percorso/mappa_nodi_bozza.json node --test tests/mappa_nodi.test.js
// Senza la variabile i test vengono saltati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FILE = process.env.MAPPA_BOZZA;
const skip = FILE ? false : 'MAPPA_BOZZA non impostata';
const bozza = FILE ? JSON.parse(readFileSync(FILE, 'utf8')) : { verifica: {}, province: [] };
const voci = bozza.province;
const byId = new Map(voci.map((f) => [f.id, f.properties]));
const citta = voci.filter((f) => f.properties.tipo === 'citta');
const sponde = voci.filter((f) => f.properties.tipo === 'sponda');

test('verifica: nessuna sovrapposizione fra le province di base (cucitura)', { skip }, () => {
  assert.equal(bozza.verifica.sovrapposizioni_maggiori_0_01_km2, 0);
});

test('verifica: nessuna provincia madre cambia area di oltre l’1%', { skip }, () => {
  assert.deepEqual(bozza.verifica.madri_con_area_diversa_oltre_1_per_cento, []);
});

test('id unici e ogni voce ha un tipo noto', { skip }, () => {
  assert.equal(new Set(voci.map((f) => f.id)).size, voci.length);
  for (const f of voci) assert.ok(['originale', 'sponda', 'citta'].includes(f.properties.tipo), f.id);
});

test('ogni sponda deriva dalla sua provincia madre, ogni città punta a una provincia presente', { skip }, () => {
  for (const f of voci) {
    if (f.properties.tipo === 'sponda') assert.ok(f.id.startsWith(`${f.properties.parent}_SP`), f.id);
    if (f.properties.tipo === 'citta') {
      const madre = byId.has(f.properties.parent) || voci.some((v) => v.id.startsWith(`${f.properties.parent}_SP`));
      assert.ok(madre, `${f.id} -> ${f.properties.parent}`);
    }
  }
});

test('Berlino: Gau intatto e città a parte sovrapposta (nessun ritaglio)', { skip }, () => {
  assert.equal(byId.get('P_DEU_BERLIN').tipo, 'originale');
  const c = byId.get('P_DEU_BERLINO_CITTA');
  assert.ok(c, 'manca la città di Berlino');
  assert.equal(c.tipo, 'citta');
  assert.equal(c.parent, 'P_DEU_BERLIN');
});

test('Amburgo: Gau intatto anche se l’Elba lo attraversa, città a parte', { skip }, () => {
  assert.equal(byId.get('P_DEU_HAMBURG').tipo, 'originale');
  assert.equal(byId.get('P_DEU_AMBURGO_CITTA')?.parent, 'P_DEU_HAMBURG');
});

test('Stalingrado è divisa in due parti sul Volga', { skip }, () => {
  const parti = citta.filter((f) => f.properties.cittaId === 'P_USSR_STALINGRADO_CITTA');
  assert.equal(parti.length, 2);
  assert.ok(parti.every((f) => f.properties.parent === 'P_USSR_VOLGOGRAD'));
  assert.ok(parti.every((f) => f.properties.parti === 2));
});

test('le città divise hanno tante voci quante parti dichiarate', { skip }, () => {
  const gruppi = new Map();
  for (const f of citta) {
    const k = f.properties.cittaId ?? f.id;
    gruppi.set(k, (gruppi.get(k) ?? 0) + 1);
  }
  for (const f of citta) {
    const k = f.properties.cittaId ?? f.id;
    assert.equal(gruppi.get(k), f.properties.parti, `${f.id}: parti dichiarate ${f.properties.parti}`);
  }
});

test('Sofia è presente come città e non perde area', { skip }, () => {
  const s = byId.get('P_BGR_SOFIA_CITTA');
  assert.ok(s, 'manca Sofia');
  assert.ok(s.areaKm2 > 1000, `area ${s.areaKm2}`);
});

test('Leningrado, Kursk, Sebastopoli sono città con nome storico', { skip }, () => {
  const nomi = new Set(citta.map((f) => f.properties.name.replace(/ \(parte .+\)$/, '')));
  for (const n of ['Leningrado', 'Kursk', 'Sebastopoli', 'Stalingrado']) assert.ok(nomi.has(n), n);
});

test('le città nate da un nome non verificato sono segnalate', { skip }, () => {
  for (const f of citta) assert.equal(typeof f.properties.nomeDaVerificare, 'boolean', f.id);
});

test('nessuna sponda ha area nulla o negativa', { skip }, () => {
  for (const f of [...sponde, ...citta]) assert.ok(f.properties.areaKm2 > 0, f.id);
});
