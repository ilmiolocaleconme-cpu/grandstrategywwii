#!/usr/bin/env python3
"""
Classificazione del terreno delle province -> data/terrain.json (schema terrain-v1).

Fonti (Natural Earth, pubblico dominio), NON nel repository:
  raster 1:50m (circa 3,7 km per pixel): GRAY_50M_SR, HYP_50M_SR, NE2_50M_LC_SR
      git clone --depth 1 --filter=blob:none --sparse https://github.com/nvkelso/natural-earth-raster ner
      git -C ner sparse-checkout set --no-cone /50m_rasters/GRAY_50M_SR /50m_rasters/HYP_50M_SR /50m_rasters/NE2_50M_LC_SR
  vettori 1:10m: ne_10m_geography_regions_polys, ne_10m_playas
      git clone --depth 1 --filter=blob:none --sparse https://github.com/nvkelso/natural-earth-vector nev
      git -C nev sparse-checkout set --no-cone /geojson/ne_10m_geography_regions_polys.geojson /geojson/ne_10m_playas.geojson

Uso:
  python3 -I scripts/terrain/build_terrain.py --raster <ner/50m_rasters> --vector <nev/geojson> [--preview out.png]

Metodo (stima, NON misura di quota):
  - rugosita = deviazione standard 5x5 del rilievo ombreggiato (GRAY_50M_SR): alta in montagna, ~0 in pianura;
  - tinta = (R - B) mediato 5x5 della tinta ipsometrica (HYP_50M_SR): sale con la quota media;
  - copertura = colori di NE2_50M_LC_SR (foresta, deserto, ...) piu poligoni NE (deserti, delta, playas).
  Ogni provincia "madre" (le sponde dei fiumi ereditano) riceve le frazioni di area per tipo.
Le soglie stanno in CONFIG e sono state tarate su luoghi noti (vedi docs/TERRENO.md).
"""
import argparse, json, os, sys
import numpy as np
import tifffile, cv2

CONFIG = {
    'rug_montagna': 14.0,          # rugosita >= : montagna
    'rug_montagna_alta': 9.0,      # con tinta alta: montagna anche a rugosita minore
    'tinta_alta': 28.0,
    'rug_collina': 5.0,            # rugosita >= : collina
    'tinta_altopiano': 20.0,       # tinta >= : terreno rialzato (collina) anche se piatto
    'deserto_r': 235, 'deserto_g': 225,
    'foresta_gr': 27, 'foresta_rb_max': 12,   # G-R >= e R-B <= (NE2); piu alto di 24 per non scambiare le colture per bosco
    'foresta_gr_nord': 14, 'foresta_rb_max_nord': 12, 'lat_nord': 58.0,  # taiga: colori piu chiari
    'tundra_lat': 66.0,
    'primaria_montagna': 0.35,     # frazione di montagna che basta per etichettare la provincia "montagna"
}
CLASSI = ['pianura', 'collina', 'montagna', 'foresta', 'palude', 'deserto', 'tundra']

# Zone paludose NON presenti nei dati NE: poligoni a mano, approssimati (ipotesi), da sostituire con fonti migliori.
PALUDI_MANUALI = [
    {'nome': 'Paludi del Pripet (Polesie)', 'ring': [[24.0, 51.4], [26.5, 51.2], [29.0, 51.5], [31.0, 51.8],
                                                      [30.5, 52.6], [28.0, 52.8], [25.5, 52.5], [24.0, 52.2]]},
]
DELTE_NE_OK = {'Danube Delta', 'Volga Delta'}  # il Delta del Nilo e agricolo: non e palude


def carica_province(repo):
    pdir = os.path.join(repo, 'data', 'provinces')
    madri = {}
    for fn in sorted(os.listdir(pdir)):
        if not fn.endswith('.json') or fn.startswith('_') or fn.startswith('ne_') or fn.startswith('citta_'):
            continue
        j = json.load(open(os.path.join(pdir, fn), encoding='utf-8'))
        for ft in j['features']:
            p = ft['properties']
            mid = p.get('parentProvince') or p['id']
            m = madri.setdefault(mid, {'id': mid, 'owner': p['owner'], 'name': None, 'geoms': []})
            if not p.get('parentProvince'):
                m['name'] = p['name']
            elif m['name'] is None:
                m['name'] = p['name'].split(' (')[0]
            m['geoms'].append(ft['geometry'])
    return madri


def anelli(geom):
    polys = [geom['coordinates']] if geom['type'] == 'Polygon' else geom['coordinates']
    for poly in polys:
        yield poly  # [esterno, buchi...]


W, H = 10800, 5400


def to_px(lon, lat):
    return (lon + 180.0) / 360.0 * W, (90.0 - lat) / 180.0 * H


def maschera_poligoni(geoms, x0, y0, x1, y1, sub=4):
    """Maschera booleana (y1-y0, x1-x0) dei pixel il cui centro e dentro i poligoni (sovracampionata x sub)."""
    w, h = x1 - x0, y1 - y0
    m = np.zeros((h * sub, w * sub), np.uint8)
    for g in geoms:
        for poly in anelli(g):
            for i, ring in enumerate(poly):
                pts = np.array([[(to_px(lo, la)[0] - x0) * sub, (to_px(lo, la)[1] - y0) * sub] for lo, la in ring], np.float64)
                pts = np.round(pts).astype(np.int32)
                cv2.fillPoly(m, [pts], 1 if i == 0 else 0)
    # un pixel e "dentro" se almeno meta dei suoi sottocampioni lo e
    f = m.reshape(h, sub, w, sub).mean(axis=(1, 3))
    return f  # frazione di copertura 0..1


def classi_pixel(R, rug, tinta, lat):
    """R: dict canali NE2 (r,g,b) e HYP; ritorna indice di classe per pixel (int8) e maschera acqua."""
    r, g, b = R['r'], R['g'], R['b']
    acqua = (R['hr'] >= 246) & (R['hg'] >= 246) & (R['hb'] >= 246) & (r >= 249) & (g >= 249)
    c = np.zeros(rug.shape, np.int8)  # 0 pianura
    alto = tinta >= CONFIG['tinta_altopiano']
    c[(rug >= CONFIG['rug_collina']) | alto] = 1
    mont = (rug >= CONFIG['rug_montagna']) | ((tinta >= CONFIG['tinta_alta']) & (rug >= CONFIG['rug_montagna_alta']))
    c[mont] = 2
    gr = g.astype(np.int16) - r.astype(np.int16)
    rb = r.astype(np.int16) - b.astype(np.int16)
    nord = lat >= CONFIG['lat_nord']
    foresta = np.where(nord, (gr >= CONFIG['foresta_gr_nord']) & (rb <= CONFIG['foresta_rb_max_nord']),
                       (gr >= CONFIG['foresta_gr']) & (rb <= CONFIG['foresta_rb_max']))
    c[foresta & (c < 2)] = 3
    deserto = (r >= CONFIG['deserto_r']) & (g >= CONFIG['deserto_g']) & (rb >= 14)
    c[deserto & (c < 2)] = 5
    tundra = (lat >= CONFIG['tundra_lat']) & (c < 2) & (c != 3)
    c[tundra] = 6
    return c, acqua


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--raster', required=True)
    ap.add_argument('--vector', required=True)
    ap.add_argument('--repo', default=os.path.join(os.path.dirname(__file__), '..', '..'))
    ap.add_argument('--out', default=None)
    ap.add_argument('--preview', default=None, help='PNG di anteprima Europa/Mediterraneo')
    a = ap.parse_args()
    repo = os.path.abspath(a.repo)
    out = a.out or os.path.join(repo, 'data', 'terrain.json')

    ld = lambda n: tifffile.imread(os.path.join(a.raster, n, n + '.tif'))
    gray = ld('GRAY_50M_SR').astype(np.float32)
    hyp = ld('HYP_50M_SR')
    ne2 = ld('NE2_50M_LC_SR')
    k = (5, 5)
    mu = cv2.blur(gray, k); mu2 = cv2.blur(gray * gray, k)
    rug = np.sqrt(np.maximum(mu2 - mu * mu, 0))
    tinta = cv2.blur(hyp[:, :, 0].astype(np.float32) - hyp[:, :, 2].astype(np.float32), k)
    del gray, mu, mu2
    lat_col = (90.0 - (np.arange(H) + 0.5) / H * 180.0).astype(np.float32)[:, None]
    lat_full = np.broadcast_to(lat_col, (H, W))

    # poligoni NE: deserti, playas (-> deserto), delta (-> palude)
    reg = json.load(open(os.path.join(a.vector, 'ne_10m_geography_regions_polys.geojson'), encoding='utf-8'))['features']
    playas = json.load(open(os.path.join(a.vector, 'ne_10m_playas.geojson'), encoding='utf-8'))['features']
    des_geoms = [f['geometry'] for f in reg if f['properties']['FEATURECLA'] == 'Desert'] + [f['geometry'] for f in playas]
    pal_geoms = [f['geometry'] for f in reg if f['properties']['FEATURECLA'] == 'Delta' and f['properties']['NAME'] in DELTE_NE_OK]
    pal_geoms += [{'type': 'Polygon', 'coordinates': [p['ring'] + [p['ring'][0]]]} for p in PALUDI_MANUALI]

    madri = carica_province(repo)
    risultati = {}
    cache_cls = {}
    for mid, m in sorted(madri.items()):
        lons = [pt[0] for g in m['geoms'] for poly in anelli(g) for pt in poly[0]]
        lats = [pt[1] for g in m['geoms'] for poly in anelli(g) for pt in poly[0]]
        x0, y0 = [int(np.floor(v)) - 1 for v in (to_px(min(lons), max(lats)))]
        x1, y1 = [int(np.ceil(v)) + 2 for v in (to_px(max(lons), min(lats)))]
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, W), min(y1, H)
        if x1 - x0 > 5400:  # province a cavallo dell'antimeridiano: non nell'area attuale
            risultati[mid] = None
            continue
        cov = maschera_poligoni(m['geoms'], x0, y0, x1, y1)
        sl = (slice(y0, y1), slice(x0, x1))
        R = {'r': ne2[sl][:, :, 0], 'g': ne2[sl][:, :, 1], 'b': ne2[sl][:, :, 2],
             'hr': hyp[sl][:, :, 0], 'hg': hyp[sl][:, :, 1], 'hb': hyp[sl][:, :, 2]}
        c, acqua = classi_pixel(R, rug[sl], tinta[sl], lat_full[sl])
        # poligoni NE (deserti / paludi) sul riquadro
        md = maschera_poligoni(des_geoms, x0, y0, x1, y1, sub=1) >= 0.5
        mp = maschera_poligoni(pal_geoms, x0, y0, x1, y1, sub=1) >= 0.5
        c[md & (c < 2)] = 5
        c[mp] = 4
        # esclude i pixel di costa (misti mare/terra: alterano le frazioni); se resta poco, usa solo l'acqua piena
        acqua_d = cv2.dilate(acqua.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)
        peso = cov * (~acqua_d)
        campioni = int((cov >= 0.5).sum())
        if peso.sum() < 3.0:
            peso = cov * (~acqua)
        if peso.sum() < 1e-6:
            peso = cov  # tutta acqua per il raster: usa comunque la copertura
        if peso.sum() < 1e-6:
            risultati[mid] = None
            continue
        fr = [float((peso * (c == i)).sum() / peso.sum()) for i in range(len(CLASSI))]
        pesoT = peso / peso.sum()
        risultati[mid] = {
            'id': mid, 'owner': m['owner'], 'name': m['name'],
            'frazioni': fr, 'rug': float((pesoT * rug[sl]).sum()), 'tinta': float((pesoT * tinta[sl]).sum()),
            'campioni': campioni,
        }
        cache_cls[mid] = None

    # etichetta della provincia
    prov = {}
    for mid, r in risultati.items():
        if r is None:
            continue
        fr = r['frazioni']
        if fr[2] >= CONFIG['primaria_montagna']:
            primo = 2
        else:
            primo = int(np.argmax(fr))
        ordine = sorted(range(len(CLASSI)), key=lambda i: -fr[i])
        sec = next((i for i in ordine if i != primo and fr[i] >= 0.20), None)
        conf = 'bassa' if r['campioni'] < 4 else ('media' if r['campioni'] < 20 else 'normale')
        prov[mid] = {
            'terreno': CLASSI[primo],
            'secondario': CLASSI[sec] if sec is not None else None,
            'frazioni': {CLASSI[i]: round(fr[i], 2) for i in range(len(CLASSI)) if round(fr[i], 2) > 0},
            'rugosita': round(r['rug'], 1),
            'tinta': round(r['tinta'], 1),
            'campioni': r['campioni'],
            'affidabilita': conf,
        }

    doc = {
        'schema': 'terrain-v1',
        'classi': CLASSI,
        'metodo': 'stima da raster Natural Earth 1:50m (rilievo ombreggiato, tinte ipsometriche, copertura del suolo) + poligoni NE di deserti e delta; NON sono quote misurate',
        'risoluzione_km': 3.7,
        'fonti': ['Natural Earth GRAY_50M_SR', 'Natural Earth HYP_50M_SR', 'Natural Earth NE2_50M_LC_SR',
                  'Natural Earth 10m geography_regions_polys', 'Natural Earth 10m playas',
                  'paludi del Pripet: poligono a mano, approssimato (ipotesi)'],
        'licenza': 'Public Domain (Natural Earth)',
        'config': CONFIG,
        'province': prov,
    }
    with open(out, 'w', encoding='utf-8') as f:
        f.write('{\n')
        for k_ in ('schema', 'classi', 'metodo', 'risoluzione_km', 'fonti', 'licenza', 'config'):
            f.write(f'  {json.dumps(k_)}: {json.dumps(doc[k_], ensure_ascii=False)},\n')
        f.write('  "province": {\n')
        items = sorted(prov.items())
        for i, (mid, v) in enumerate(items):
            f.write(f'    {json.dumps(mid)}: {json.dumps(v, ensure_ascii=False)}' + (',\n' if i < len(items) - 1 else '\n'))
        f.write('  }\n}\n')
    sys.stderr.write(f'scritte {len(prov)} province in {out} (senza dati: {sum(1 for v in risultati.values() if v is None)})\n')

    if a.preview:
        # Europa/Mediterraneo lon -25..45, lat 28..72
        x0, y0 = [int(v) for v in to_px(-25, 72)]; x1, y1 = [int(v) for v in to_px(45, 28)]
        sl = (slice(y0, y1), slice(x0, x1))
        R = {'r': ne2[sl][:, :, 0], 'g': ne2[sl][:, :, 1], 'b': ne2[sl][:, :, 2],
             'hr': hyp[sl][:, :, 0], 'hg': hyp[sl][:, :, 1], 'hb': hyp[sl][:, :, 2]}
        c, acqua = classi_pixel(R, rug[sl], tinta[sl], lat_full[sl])
        md = maschera_poligoni(des_geoms, x0, y0, x1, y1, sub=1) >= 0.5
        mp = maschera_poligoni(pal_geoms, x0, y0, x1, y1, sub=1) >= 0.5
        c[md & (c < 2)] = 5; c[mp] = 4
        pal = np.array([[236, 232, 150], [176, 150, 90], [110, 80, 60], [60, 130, 70], [60, 140, 170], [240, 210, 120], [190, 200, 210]], np.uint8)
        img = pal[c]; img[acqua] = [30, 60, 110]
        cv2.imwrite(a.preview, img[:, :, ::-1])
        sys.stderr.write(f'anteprima: {a.preview} ({img.shape[1]}x{img.shape[0]})\n')


if __name__ == '__main__':
    main()
