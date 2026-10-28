import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test("docs/INVENTARIO_DATI.md corrisponde ai dati: rigenerarlo con 'node scripts/report-inventory.js'", () => {
  const r = spawnSync(process.execPath, ['scripts/report-inventory.js', '--check'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
});
