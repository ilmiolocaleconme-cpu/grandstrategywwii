// Genera docs/INVENTARIO_DATI.md leggendo i file reali in data/.
// Uso: node scripts/report-inventory.js          (scrive il file)
//      node scripts/report-inventory.js --check  (esce con 1 se il file è vecchio)
// Nessuna data nel testo: l'output dipende solo dai dati, così il controllo è ripetibile.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const out = path.join(root, 'docs', 'INVENTARIO_DATI.md');

const nations = readJson('data/nations.json');
const political = readJson('data/political_1936.json');
const meta = readJson('data/provinces/_meta.json');
const terrain = readJson('data/terrain.json');

const perOwner = new Map();
const quality = { verified: 0, approximate: 0, hypothesis: 0, altro: 0 };
const provinceIds = [];
const provinceEffective = []; // id del terreno: le sponde ereditano dalla madre (parentProvince)
for (const code of meta.order) {
  const fc = readJson(`data/provinces/${code}.json`);
  const row = { n: 0, approximate: 0, hypothesis: 0, verified: 0, altro: 0 };
  for (const f of fc.features) {
    row.n += 1;
    const q = f.properties.borderQuality;
    const k = q in quality && q !== 'altro' ? q : 'altro';
    row[k] += 1;
    quality[k] += 1;
    provinceIds.push(f.properties.id);
    provinceEffective.push([f.properties.id, f.properties.parentProvince ?? f.properties.id]);
  }
  perOwner.set(code, row);
}

const count = (rel, pick) => {
  const j = readJson(rel);
  return pick ? pick(j) : Array.isArray(j) ? j.length : 0;
};

const politicalIds = new Set(political.map((p) => p.id));
const withProvinces = new Set(perOwner.keys());
const politicalNoProv = political.filter((p) => !withProvinces.has(p.id)).map((p) => p.id).sort();
const nationsNoProv = nations
  .filter((n) => !withProvinces.has(n.id) && !n.appearsLater)
  .map((n) => n.id)
  .sort();
const ownersNotPolitical = [...withProvinces].filter((c) => !politicalIds.has(c)).sort();
const terrainIds = new Set(Object.keys(terrain.province));
const noTerrain = provinceEffective.filter(([, eff]) => !terrainIds.has(eff)).map(([id]) => id);

const total = provinceIds.length;
const lines = [];
lines.push('# Inventario dei dati (generato)');
lines.push('');
lines.push('File generato da `node scripts/report-inventory.js`: **non modificarlo a mano**.');
lines.push('Conta ciò che è nei file di `data/`; non dice se i dati sono storicamente corretti né se il gioco li usa.');
lines.push('');
lines.push('## Cataloghi');
lines.push('');
lines.push('| Catalogo | File | Voci |');
lines.push('|---|---|---|');
lines.push(`| Nazioni | \`data/nations.json\` | ${nations.length} |`);
lines.push(`| Entità politiche 1/1/1936 | \`data/political_1936.json\` | ${political.length} |`);
lines.push(`| Province | \`data/provinces/*.json\` | ${total} in ${perOwner.size} file |`);
lines.push(`| Risorse | \`data/resources.json\` | ${count('data/resources.json')} |`);
lines.push(`| Fiumi | \`data/rivers.json\` | ${count('data/rivers.json')} |`);
lines.push(`| Laghi | \`data/lakes.json\` | ${count('data/lakes.json', (j) => j.features.length)} |`);
lines.push(`| Attraversamenti (ponti, guadi, traghetti) | \`data/crossings.json\` | ${count('data/crossings.json')} |`);
lines.push(`| Zone marittime | \`data/sea_zones.json\` | ${count('data/sea_zones.json', (j) => j.zones.length)} |`);
lines.push(`| Adiacenze terrestri | \`data/adjacency.json\` | ${count('data/adjacency.json', (j) => j.edges.length)} |`);
lines.push(`| Collegamenti tra province | \`data/links.json\` | non contati qui (vedi \`npm run validate:data\`) |`);
lines.push(`| Nodi urbani | \`data/city_links.json\` | ${count('data/city_links.json', (j) => j.nodes.length)} |`);
lines.push(`| Collegamenti urbani | \`data/city_links.json\` | ${count('data/city_links.json', (j) => j.links.length)} |`);
lines.push(`| Terreno (province madri con voce propria) | \`data/terrain.json\` | ${terrainIds.size} |`);
lines.push(`| Regioni | \`data/regions.json\` | ${count('data/regions.json', (j) => j.regions.length)} |`);
lines.push(`| Unità (catalogo da CSV) | \`data/units/units.json\` | ${count('data/units/units.json', (j) => j.units.length)} |`);
lines.push(`| Edifici | \`data/buildings.json\` | ${count('data/buildings.json', (j) => j.buildings.length)} |`);
lines.push('');
lines.push('## Qualità dei confini delle province');
lines.push('');
lines.push(`Su ${total} province: verificate ${quality.verified}, approssimate ${quality.approximate}, ipotesi ${quality.hypothesis}${quality.altro ? `, valore non riconosciuto ${quality.altro}` : ''}.`);
lines.push('');
lines.push('## Province per file');
lines.push('');
lines.push('| Codice | Province | Approssimate | Ipotesi | Verificate |');
lines.push('|---|---|---|---|---|');
for (const [code, r] of [...perOwner].sort((a, b) => a[0].localeCompare(b[0]))) {
  lines.push(`| ${code} | ${r.n} | ${r.approximate} | ${r.hypothesis} | ${r.verified} |`);
}
lines.push('');
lines.push('## Lacune misurate');
lines.push('');
lines.push(`- Province senza terreno, contando l'ereditarietà delle sponde dalla madre: **${noTerrain.length}** su ${total}${noTerrain.length ? ` (${noTerrain.join(', ')})` : ''}.`);
lines.push(`- Entità politiche 1936 senza file di province (${politicalNoProv.length}): ${politicalNoProv.join(', ') || 'nessuna'}.`);
lines.push(`- Nazioni di \`nations.json\` senza file di province, esclusi i territori che compaiono dopo (${nationsNoProv.length}): ${nationsNoProv.join(', ') || 'nessuna'}.`);
lines.push(`- File di province il cui codice non è in \`political_1936.json\` (${ownersNotPolitical.length}): ${ownersNotPolitical.join(', ') || 'nessuno'}.`);
lines.push('');

const text = lines.join('\n');
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
  if (cur !== text) {
    console.error('docs/INVENTARIO_DATI.md non è aggiornato: eseguire node scripts/report-inventory.js');
    process.exit(1);
  }
  console.log('OK: inventario aggiornato');
} else {
  fs.writeFileSync(out, text);
  console.log(`Scritto ${path.relative(root, out)} (${total} province in ${perOwner.size} file)`);
}
