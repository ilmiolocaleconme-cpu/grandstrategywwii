// Punti di tocco con risposta nota: per un campione di province si sceglie un punto ben all'interno (polo di
// inaccessibilità, lontano dai confini) e lo si converte in coordinate dello schermo a zoom 1 e a zoom 1,6^3 attorno al
// centro della vista. Lontano dai confini il risultato non dipende da arrotondamenti né dall'«aggiustamento del tocco» di Chromium.
//   node scripts/bench/make-points.mjs <larghezza> <altezza> <y-del-contenitore> > points.json
import { loadProvinces } from '../load-provinces.js';
import { HOME_BOUNDS, project, zoomAt } from '../../src/map/geo.js';
import { layoutOf, affineOf, screenToView } from '../../src/map/canvasView.js';
import { poleOfInaccessibility, mainPolygon } from '../../src/map/labelfit.js';

const [W, H, Y0] = process.argv.slice(2).map(Number);
const provinces = await loadProvinces();
const PAD = HOME_BOUNDS.w * 0.02;
const VB = { x: HOME_BOUNDS.x - PAD, y: HOME_BOUNDS.y - PAD, w: HOME_BOUNDS.w + 2 * PAD, h: HOME_BOUNDS.h + 2 * PAD };
const lay = layoutOf(VB, W, H);
const [fx, fy] = screenToView(VB, lay, 160, 330 - Y0); // rotella come nelle misure: due scatti da x2 attorno a (160,330)
const views = { k1: { k: 1, x: 0, y: 0 }, k4: zoomAt(zoomAt({ k: 1, x: 0, y: 0 }, 2, fx, fy), 2, fx, fy) };
const poles = provinces.features.map((f) => {
  const polys = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map((poly) => poly.map((ring) => ring.map(([lon, lat]) => project(lon, lat))));
  const main = mainPolygon(polys);
  const pole = poleOfInaccessibility(main);
  return { name: f.properties.name, id: f.properties.id, x: pole.x, y: pole.y, d: pole.d };
});
const out = {};
for (const [name, view] of Object.entries(views)) {
  const a = affineOf(view, VB, lay);
  const pts = [];
  for (const p of poles) {
    const px = a.sx * p.x + a.tx;
    const py = a.sx * p.y + a.ty + Y0;
    // dentro la mappa, lontano dalla barra degli strumenti (in alto) e dalla legenda (in basso), e a più di 4 px dal confine
    if (px < 10 || px > W - 10 || py < Y0 + 140 || py > Y0 + H - 90 || p.d * a.sx < 4) continue;
    pts.push({ x: Math.round(px), y: Math.round(py), name: p.name, id: p.id, margin: Math.round(p.d * a.sx * 10) / 10 });
  }
  // campione ripetibile e distribuito: ogni n-esimo punto, al massimo 80
  const step = Math.max(1, Math.floor(pts.length / 80));
  out[name] = pts.filter((_, i) => i % step === 0).slice(0, 80);
}
console.log(JSON.stringify(out));
