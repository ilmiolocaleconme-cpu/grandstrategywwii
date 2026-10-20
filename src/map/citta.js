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
  const nordDi = new Map();
  for (const f of cities) {
    const gruppo = f.properties.cittaId ?? f.id;
    if (f.properties.name === capitali.get(f.properties.owner) && (!nordDi.has(gruppo) || f.id < nordDi.get(gruppo))) nordDi.set(gruppo, f.id);
  }
  return cities.map((f) => {
    const gruppo = f.properties.cittaId ?? f.id;
    const capitale = [...nordDi.keys()].includes(gruppo) && capitali.get(f.properties.owner) === f.properties.name.replace(/ sud$/, '');
    if (!capitale) return f;
    return { ...f, properties: { ...f.properties, capitale: true, capital: nordDi.get(gruppo) === f.id } };
  });
}
