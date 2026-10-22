// Città: sono province come le altre (cliccabili, con il proprio contorno), sovrapposte alla provincia madre.
// Stanno nello stesso modello delle province, aggiunte dopo: a un tocco sovrapposto vince la città.
// Le città si disegnano grigie (centro urbano). Solo le capitali hanno il nome sulla mappa; una capitale divisa
// da un fiume ha il nome su tutte le parti (la parte a nord con la stella, le altre "<capitale> sud").

/** Collezione delle province con le città aggiunte in coda (quindi sopra). `cities` sono feature GeoJSON. */
export function withCities(provinces, cities) {
  if (!provinces || !cities) return provinces;
  return { ...provinces, features: [...provinces.features, ...cities] };
}

/** Segna le capitali. `capitale`: ogni parte della capitale (ha il nome sulla mappa); `capital`: solo la parte a nord (la stella). */
export function markCapitals(cities, nations) {
  const capitali = new Map(nations.map((n) => [n.id, n.capital]));
  // gruppo: la città (cittaId), oppure la provincia madre per le città già nei dati divise in sponde
  const gruppoDi = (f) => f.properties.cittaId ?? f.properties.parentProvince ?? f.id.replace(/_SP\d+$/, '');
  const base = (f) => f.properties.name.replace(/ \(città\)/, '').replace(/ (sud|nord|est|ovest)( \d+)?$/, '').replace(/ \(sponda [A-Z]\)$/, '');
  const nordDi = new Map();
  for (const f of cities) {
    const g = gruppoDi(f);
    if (base(f) === capitali.get(f.properties.owner) && (!nordDi.has(g) || f.id < nordDi.get(g))) nordDi.set(g, f.id);
  }
  return cities.map((f) => {
    const g = gruppoDi(f);
    const capitale = nordDi.has(g) && capitali.get(f.properties.owner) === base(f);
    if (!capitale) return f;
    return { ...f, properties: { ...f.properties, capitale: true, capital: nordDi.get(g) === f.id } };
  });
}

// Zoom (view.k) da cui si scrivono i nomi: le capitali un po' prima, tutte le città solo da vicino,
// le parti secondarie (sud, nord, est, ovest) solo al massimo zoom.
export const CAPITAL_NAME_ZOOM = 2.5;
export const CITY_NAME_ZOOM = 5;
export const PART_NAME_ZOOM = 60;
const PARTE_SECONDARIA = / (sud|nord|est|ovest)( \d+)?$/;

/** Città da etichettare al livello di zoom `k`. */
export function cityNamesAt(items, k) {
  return items.filter((it) => {
    if (it.props.kind !== 'citta') return false;
    if (PARTE_SECONDARIA.test(it.props.name)) return k >= PART_NAME_ZOOM;
    return it.props.capitale ? k >= CAPITAL_NAME_ZOOM : k >= CITY_NAME_ZOOM;
  });
}

// Aggancio del tocco alla città vicina: 16 px dal centro, ma solo da zoom CITY_SNAP_ZOOM. A vista d'insieme (zoom 1)
// ogni punto dell'Europa è a meno di 16 px da una città e le province non si potrebbero più toccare: sotto questo zoom
// vince la provincia (una città si tocca comunque dentro il proprio contorno, che sta sopra la provincia madre).
export const CITY_SNAP_ZOOM = CITY_NAME_ZOOM;
export const CITY_SNAP_PX = 16;

/** Tolleranza in unità di mappa per l'aggancio alla città: `k` = zoom della vista, `scale` = pixel per unità a zoom 1. 0 = nessun aggancio. */
export function citySnapTolerance(k, scale) {
  return k >= CITY_SNAP_ZOOM ? CITY_SNAP_PX / (scale * k) : 0;
}

/** Città più vicina al punto (unità di mappa) entro `tol`, misurata dal centro del riquadro; o null (anche se `tol` è 0). */
export function nearestCityAt(items, x, y, tol) {
  if (!(tol > 0)) return null;
  let best = null;
  let bestD = tol;
  for (const it of items) {
    if (it.props.kind !== 'citta') continue;
    const cx = it.bbox.x + it.bbox.w / 2;
    const cy = it.bbox.y + it.bbox.h / 2;
    const d = Math.hypot(cx - x, cy - y);
    if (d <= bestD) { best = it; bestD = d; }
  }
  return best;
}

/** Segna le capitali anche fra le città già presenti nelle province (es. Budapest, divisa dal Danubio). */
export function markCapitalsInCollection(collection, nations) {
  const idx = collection.features.map((f, i) => (f.properties.kind === 'citta' ? i : -1)).filter((i) => i >= 0);
  const marcate = markCapitals(idx.map((i) => collection.features[i]), nations);
  const features = [...collection.features];
  idx.forEach((i, k) => { features[i] = marcate[k]; });
  return { ...collection, features };
}
