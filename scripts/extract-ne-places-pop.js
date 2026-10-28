// Estrae da Natural Earth 10m populated places (shapefile estratto da ne_10m_populated_places.zip) SOLO [lon, lat, POP_MAX, POP_MIN]
// in data/sources/ne_places_pop.json (sottoinsieme piccolo; il file originale pesa 48 MB). Uso:
//   node scripts/extract-ne-places-pop.js <cartella con ne_10m_populated_places.shp/.dbf>
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('uso: node scripts/extract-ne-places-pop.js <cartella>'); process.exit(1); }
const shpBuf = await readFile(join(dir, 'ne_10m_populated_places.shp'));
const dbf = await readFile(join(dir, 'ne_10m_populated_places.dbf'));
const version = (await readFile(join(dir, 'ne_10m_populated_places.VERSION.txt'), 'utf8')).trim();

// DBF: intestazione 32 byte, descrittori di campo da 32 byte fino a 0x0D, poi record (1 byte di cancellazione + campi)
const n = dbf.readUInt32LE(4); const headLen = dbf.readUInt16LE(8); const recLen = dbf.readUInt16LE(10);
const fields = [];
for (let o = 32, off = 1; dbf[o] !== 0x0d; o += 32) {
  const name = dbf.toString('latin1', o, o + 11).replace(/\0.*$/, ''); const len = dbf[o + 16];
  fields.push({ name, len, off }); off += len;
}
const col = (name) => fields.find((f) => f.name === name);
const cMax = col('POP_MAX'); const cMin = col('POP_MIN');
if (!cMax || !cMin) throw new Error('campi POP_MAX/POP_MIN non trovati');
const num = (rec, c) => Number(dbf.toString('latin1', headLen + rec * recLen + c.off, headLen + rec * recLen + c.off + c.len).trim()) || 0;

// SHP punti: intestazione 100 byte; record = 8 byte intestazione + tipo(4) + x(8) + y(8)
const places = [];
let pos = 100; let rec = 0;
while (pos < shpBuf.length) {
  const len = shpBuf.readInt32BE(pos + 4) * 2;
  if (shpBuf.readInt32LE(pos + 8) === 1) {
    const lon = shpBuf.readDoubleLE(pos + 12); const lat = shpBuf.readDoubleLE(pos + 20);
    const pMax = num(rec, cMax); const pMin = num(rec, cMin);
    if (pMax > 0 || pMin > 0) places.push([Math.round(lon * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4, pMax, pMin]);
  }
  pos += 8 + len; rec += 1;
}
if (rec !== n) throw new Error(`record shp ${rec} ≠ dbf ${n}`);
const out = {
  schema: 'ne-places-pop-v1', source: `Natural Earth ${version} 10m populated places (ne_10m_populated_places.zip, forniti dall'utente)`, license: 'Public Domain (Natural Earth)',
  note: 'Solo [lon, lat, POP_MAX, POP_MIN] dei luoghi con popolazione > 0. POP_MAX/POP_MIN sono stime MODERNE (LandScan), non del 1936; POP_MAX è l\'area metropolitana. Rigenerare con scripts/extract-ne-places-pop.js.',
  sourceDbfSha256: createHash('sha256').update(dbf).digest('hex'), total: n, places,
};
await writeFile(new URL('../data/sources/ne_places_pop.json', import.meta.url), `${JSON.stringify(out)}\n`);
console.log(`${places.length} luoghi con popolazione su ${n}`);
