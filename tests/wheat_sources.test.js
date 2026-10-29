// Frumento 1933-36 (USDA World Wheat Prospects, 30/9/1936): la tabella sorgente, i punteggi, le righe aggiunte e le province coerenti tra loro.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv } from '../src/data/csv.js';

const text = (p) => readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8');
const rows = parseCsv(text('resources/produzione_frumento_1936.csv'), { name: 'produzione_frumento_1936.csv' });
const locations = parseCsv(text('resources/resource_locations.csv'), { name: 'resource_locations.csv' }).filter((l) => l.resource_id === 'wheat');
const scores = new Map(parseCsv(text('resources/punteggi_output.csv'), { name: 'punteggi_output.csv' }).map((s) => [s.location_id, s]));
const links = parseCsv(text('resources/location_provinces.csv'), { name: 'location_provinces.csv' });
const terrain = JSON.parse(text('terrain.json')).province;
const usa = rows.find((r) => r.id === 'USA');

test('tabella sorgente: media dei tre raccolti e punteggio = 9 + ln(media / USA) / ln 1,7, da 1 a 10', () => {
  assert.equal(rows.length, 40);
  assert.equal(new Set(rows.map((r) => r.id)).size, 40, 'nessun paese doppio');
  for (const r of rows) {
    const avg = (Number(r.raccolto_1933_34_kbu) + Number(r.raccolto_1934_35_kbu) + Number(r.raccolto_1935_36_kbu)) / 3;
    assert.equal(Number(r.media_kbu), Math.round(avg), r.id);
    const raw = 9 + Math.log(avg / (Number(usa.media_kbu))) / Math.log(1.7);
    assert.ok(Math.abs(Number(r.punteggio_calcolato) - raw) < 0.01, r.id);
    assert.equal(Number(r.punteggio_finale), Math.max(1, Math.min(10, Math.round(raw))), r.id);
  }
  assert.equal(usa.punteggio_finale, '9');
});

test('ogni paese della tabella ha una riga di luogo e un punteggio finale uguale (India: 6 dell\'utente corretto a 8)', () => {
  const byCountry = new Map(locations.map((l) => [l.country_id, l]));
  for (const r of rows) {
    const loc = byCountry.get(r.id);
    assert.ok(loc, `${r.id} senza riga nei luoghi`);
    assert.equal(scores.get(loc.location_id).score_final, r.punteggio_finale, r.id);
    assert.ok(links.some((k) => k.location_id === loc.location_id), `${r.id} senza province`);
  }
  const ind = scores.get(byCountry.get('IND').location_id);
  assert.deepEqual([ind.score_user, ind.score_final], ['6', '8']);
});

test('province del frumento: mai a maggioranza di montagna, deserto o tundra (righe generate dal terreno)', () => {
  const generated = locations.filter((l) => l.source === 'claude_note' && l.place_text === 'Pianure e colline cerealicole');
  assert.equal(generated.length, 36);
  for (const l of generated) {
    const mine = links.filter((k) => k.location_id === l.location_id);
    assert.ok(mine.length > 0, l.country_id);
    const ok = mine.filter((k) => { const f = terrain[k.province_id]?.frazioni ?? {}; return (f.deserto ?? 0) + (f.tundra ?? 0) + (f.montagna ?? 0) < 0.5; });
    assert.ok(ok.length >= Math.min(3, mine.length), `${l.country_id}: nessuna provincia adatta`);
  }
});
