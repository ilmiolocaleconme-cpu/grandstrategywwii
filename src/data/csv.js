// Lettura dei CSV canonici del Data Pack (UTF-8, virgola, header univoco, BOM ammesso). Funzioni PURE senza I/O.
// Gestisce campi tra virgolette (virgole, "" e a capo dentro il campo): il caricatore del Pack, che divide sulle virgole,
// non lo fa. Righe vuote ignorate; una riga con un numero di colonne diverso dall'header è un errore (mai dati troncati in silenzio).

/** Righe di campi (array di array di stringhe) di un testo CSV. */
export function parseCsvRows(text) {
  const src = String(text).replace(/^﻿/, '');
  const rows = []; let row = []; let field = ''; let inQuotes = false; let started = false;
  const endField = () => { row.push(field); field = ''; started = true; };
  const endRow = () => { endField(); if (!(row.length === 1 && row[0] === '')) rows.push(row); row = []; started = false; };
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false; } else field += ch;
    } else if (ch === '"' && field === '') inQuotes = true;
    else if (ch === ',') endField();
    else if (ch === '\n') endRow();
    else if (ch === '\r') { /* ignorato: \r\n e \n sono uguali */ } else field += ch;
  }
  if (inQuotes) throw new Error('CSV: virgolette non chiuse');
  if (started || field !== '' || row.length) endRow();
  return rows;
}

/** Record di un CSV: [{ colonna: valore }]. Lancia un Error con il numero di riga se l'header ha duplicati o una riga ha colonne diverse. */
export function parseCsv(text, { name = 'CSV' } = {}) {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  if (header.some((h) => h === '')) throw new Error(`${name}: colonna senza nome nell'header`);
  if (new Set(header).size !== header.length) throw new Error(`${name}: colonne duplicate nell'header`);
  return rows.slice(1).map((r, i) => {
    if (r.length !== header.length) throw new Error(`${name}: riga ${i + 2} con ${r.length} colonne invece di ${header.length}`);
    return Object.fromEntries(header.map((h, k) => [h, r[k]]));
  });
}

/** Testo CSV da record (stesso ordine di colonne di `header`): virgolette solo dove servono. */
export function toCsv(header, records) {
  const q = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return `${[header.join(','), ...records.map((r) => header.map((h) => q(r[h])).join(','))].join('\n')}\n`;
}
