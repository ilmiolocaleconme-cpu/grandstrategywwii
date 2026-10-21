// Divide in parti le città attraversate da un fiume (npm run build:citta-sponde): ogni fiume di data/rivers_geo.json
// taglia la forma della città, e ogni parte prende una lettera di sponda (A, B, …) come le sponde delle province.
// Le città già divise vengono prima riunite, così lo script si può rieseguire: il risultato dipende solo dalle forme
// e dai fiumi. Il nome diventa «Nome (parte A)», con `parti` e `sponda` come nei dati esistenti.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const CITTA = fileURLToPath(new URL('../data/citta_grandi.json', import.meta.url));
const FIUMI = fileURLToPath(new URL('../data/rivers_geo.json', import.meta.url));
const SCRIPT = fileURLToPath(new URL('./citta-sponde.py', import.meta.url));

// Taglio geometrico con shapely (Python): più affidabile di un taglio a mano in JavaScript.
const PY = `
import json, sys
from shapely.geometry import shape, mapping, LineString, MultiPolygon, Polygon
from shapely.ops import split, unary_union
citta = json.load(open(sys.argv[1]))
fiumi = json.load(open(sys.argv[2]))['features']
lines = [LineString(f['geometry']['coordinates']) for f in fiumi]
out = []
gruppi = {}
for f in citta['features']:
    gruppi.setdefault(f['properties']['cittaId'], []).append(f)
for cid, membri in gruppi.items():
    base = membri[0]['properties']
    nome = base['name'].split(' (parte ')[0]
    poly = unary_union([shape(m['geometry']) for m in membri])
    pezzi = [poly]
    for line in lines:
        nuovi = []
        for p in pezzi:
            if p.intersects(line) and not p.touches(line):
                parti = [g for g in split(p, line).geoms if isinstance(g, Polygon) and g.area > 0]
                nuovi.extend(parti if len(parti) > 1 else [p])
            else:
                nuovi.append(p)
        pezzi = nuovi
    pezzi.sort(key=lambda g: (round(g.centroid.x, 3), round(g.centroid.y, 3)))
    n = len(pezzi)
    for i, p in enumerate(pezzi):
        lettera = chr(ord('A') + i)
        props = {k: v for k, v in base.items() if k not in ('name', 'id', 'parti', 'sponda')}
        props.update({'id': cid if n == 1 else f'{cid}_P{i + 1}', 'name': nome if n == 1 else f'{nome} (parte {lettera})',
                      'cittaId': cid, 'parti': n, 'sponda': None if n == 1 else lettera})
        out.append({'type': 'Feature', 'id': props['id'], 'properties': props, 'geometry': mapping(p)})
citta['features'] = out
json.dump(citta, open(sys.argv[3], 'w'))
`;

export async function buildCittaSponde(citta = CITTA, fiumi = FIUMI) {
  await writeFile(SCRIPT, PY);
  const tmp = `${citta}.tmp.json`;
  try {
    await run('python3', [SCRIPT, citta, fiumi, tmp]);
    const before = JSON.parse(await readFile(citta, 'utf8')).features.length;
    const after = JSON.parse(await readFile(tmp, 'utf8')).features.length;
    await run('mv', [tmp, citta]);
    return { before, after };
  } finally {
    await run('rm', ['-f', SCRIPT, tmp]);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { before, after } = await buildCittaSponde();
  console.log(`Città divise lungo i fiumi: ${before} voci → ${after}`);
}
