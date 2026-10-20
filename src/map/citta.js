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
  const base = (f) => f.properties.name.replace(/ sud$/, '').replace(/ \(sponda [A-Z]\)$/, '');
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

// Zoom (view.k) da cui si scrivono i nomi: le capitali un po' prima, tutte le città solo da vicino.
export const CAPITAL_NAME_ZOOM = 2.5;
export const CITY_NAME_ZOOM = 5;

/** Città da etichettare al livello di zoom `k`: capitali (con la stella) da CAPITAL_NAME_ZOOM, le altre da CITY_NAME_ZOOM. */
export function cityNamesAt(items, k) {
  return items.filter((it) => it.props.kind === 'citta' && (it.props.capitale ? k >= CAPITAL_NAME_ZOOM : k >= CITY_NAME_ZOOM));
}

/** Segna le capitali anche fra le città già presenti nelle province (es. Budapest, divisa dal Danubio). */
export function markCapitalsInCollection(collection, nations) {
  const idx = collection.features.map((f, i) => (f.properties.kind === 'citta' ? i : -1)).filter((i) => i >= 0);
  const marcate = markCapitals(idx.map((i) => collection.features[i]), nations);
  const features = [...collection.features];
  idx.forEach((i, k) => { features[i] = marcate[k]; });
  return { ...collection, features };
}
