// Città a parte: un livello sovrapposto alle province, che non le ritaglia (Berlino resta nel suo Gau).
// Il modello è lo stesso delle province (buildCanvasModel), così il disegno e la ricerca del punto toccato restano
// quelli già testati. Toccando una città si seleziona la sua provincia madre (il pannello non conosce ancora le città).
import { buildCanvasModel, pickProvinceAt } from './canvasModel.js';

/** Modello delle città: `cities` sono feature GeoJSON con `properties.parentProvince`. */
export function buildCityModel(cities) {
  return buildCanvasModel({ type: 'FeatureCollection', features: cities });
}

/** Città sotto il punto (unità di mappa, come pickProvinceAt), o null. */
export function pickCityAt(model, x, y) {
  return model ? pickProvinceAt(model, x, y) : null;
}
