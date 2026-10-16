// Da eseguire DOPO `npm run build`: controlla che ogni file di data/provinces/ (nazioni + _meta)
// sia finito in un chunk JavaScript proprio e che quel chunk compaia nel precache del service
// worker (dist/sw.js). Senza, offline la mappa non partirebbe (il caricamento è tutto-o-niente).
// Uscita con codice 1 se qualcosa non torna.
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { listProvinceFiles, provincesDir } from './load-provinces.js';
import { META_NAME, fileName } from '../src/data/provinces.js';

/** Indirizzi presenti nel precache di un service worker generato da Workbox (anche minificato). */
export function precacheUrls(swText) {
  const urls = new Set();
  for (const m of swText.matchAll(/["']?\burl["']?\s*:\s*(?:"([^"]+)"|'([^']+)')/g)) {
    urls.add((m[1] ?? m[2]).replace(/^\.?\//, ''));
  }
  return urls;
}

/**
 * `chunks`: { "assets/x.js": testo } della build; `markers`: { nome file: stringa che compare solo
 * nei dati di quel file }. Ritorna gli errori (lista vuota se ogni file è in un chunk proprio e nel precache).
 */
export function checkPrecache({ chunks, swText, markers }) {
  const errors = [];
  const cached = precacheUrls(swText);
  if (cached.size === 0) errors.push('sw.js: nessun indirizzo nel precache (formato non riconosciuto?)');
  const names = Object.keys(markers);
  for (const name of names) {
    const hits = Object.entries(chunks).filter(([, text]) => text.includes(markers[name])).map(([path]) => path);
    if (hits.length === 0) errors.push(`${name}.json: non trovato in nessun chunk della build`);
    else if (hits.length > 1) errors.push(`${name}.json: presente in più chunk (${hits.join(', ')})`);
    for (const path of hits) {
      if (!cached.has(path)) errors.push(`${name}.json: il chunk ${path} non è nel precache di sw.js`);
      const others = names.filter((n) => n !== name && chunks[path].includes(markers[n]));
      if (others.length > 0) errors.push(`${name}.json: il chunk ${path} contiene anche ${others.join(', ')} (devono restare file separati)`);
    }
  }
  return errors;
}

/**
 * Stringhe-sentinella che compaiono solo nei dati: id della prima provincia di ogni nazione; per _meta l'inizio
 * della prima voce di `metadata.coverage` (non il campo "schema": è anche una costante del codice, nel bundle principale).
 */
export async function provinceMarkers(dirUrl = provincesDir) {
  const markers = {};
  for (const file of await listProvinceFiles(dirUrl)) {
    const data = JSON.parse(await readFile(new URL(file, dirUrl), 'utf8'));
    const name = fileName(file);
    markers[name] = name === META_NAME ? String(data.metadata.coverage[0]).slice(0, 30) : data.features[0].properties.id;
  }
  return markers;
}

async function readChunks(distDir) {
  const chunks = {};
  const assets = new URL('assets/', distDir);
  for (const n of await readdir(assets)) if (n.endsWith('.js')) chunks[`assets/${n}`] = await readFile(new URL(n, assets), 'utf8');
  return chunks;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const distDir = new URL('../dist/', import.meta.url);
  let errors;
  try {
    errors = checkPrecache({
      chunks: await readChunks(distDir),
      swText: await readFile(new URL('sw.js', distDir), 'utf8'),
      markers: await provinceMarkers(),
    });
  } catch (error) {
    errors = [`impossibile leggere dist/ (eseguire prima npm run build): ${error.message}`];
  }
  errors.forEach((e) => console.error(`ERRORE ${e}`));
  console.log(errors.length === 0 ? 'OK: tutti i file delle province sono in chunk separati e nel precache' : 'FALLITO: controllo del precache');
  process.exit(errors.length === 0 ? 0 : 1);
}
