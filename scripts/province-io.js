// Lettura e scrittura dei file data/provinces/*.json nello stesso formato di partenza (ce ne sono più di uno: i byte originali si
// ricostruiscono per non produrre diff enormi). Solo script di costruzione.
import { readFile, readdir, writeFile } from 'node:fs/promises';

export const provincesDir = new URL('../data/provinces/', import.meta.url);
const FORMATS = [{ sep: ', ', ascii: false }, { sep: ',', ascii: false }, { sep: ',', ascii: true }, { sep: ', ', ascii: true }];

export function dump(v, { sep, ascii }) {
  const kv = sep === ', ' ? ': ' : ':';
  const str = (s) => { const j = JSON.stringify(s); return ascii ? j.replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`) : j; };
  const go = (x) => {
    if (x === null) return 'null';
    if (typeof x === 'string') return str(x);
    if (typeof x === 'number' || typeof x === 'boolean') return String(x);
    if (Array.isArray(x)) return `[${x.map(go).join(sep)}]`;
    return `{${Object.entries(x).map(([k, y]) => `${str(k)}${kv}${go(y)}`).join(sep)}}`;
  };
  return go(v);
}
export function detectFormat(raw, data) {
  for (const f of FORMATS) for (const nl of ['', '\n']) if (raw === dump(data, f) + nl) return { ...f, nl };
  return null;
}

/** Tutti i file di province: [{ name, data, fmt, touched }]. */
export async function readProvinceDocs() {
  const docs = [];
  for (const name of (await readdir(provincesDir)).filter((n) => n.endsWith('.json') && !n.startsWith('_')).sort()) {
    const raw = await readFile(new URL(name, provincesDir), 'utf8');
    const data = JSON.parse(raw);
    docs.push({ name, data, fmt: detectFormat(raw, data) ?? { sep: ',', ascii: false, nl: '\n', changed: true }, touched: false });
  }
  return docs;
}
export async function writeProvinceDocs(docs) {
  const written = [];
  for (const d of docs) {
    if (!d.touched) continue;
    if (d.fmt.changed) console.log(`attenzione: formato di ${d.name} non riconosciuto, riscritto compatto`);
    await writeFile(new URL(d.name, provincesDir), dump(d.data, d.fmt) + (d.fmt.nl ?? '\n'));
    written.push(d.name);
  }
  return written;
}
