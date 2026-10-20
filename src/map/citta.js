// Città: sono province come le altre (cliccabili, con il proprio contorno), ma sovrapposte alla provincia madre.
// Stanno nello stesso modello delle province, aggiunte dopo: a un tocco sovrapposto vince la città.
// Solo le capitali delle nazioni hanno il nome sulla mappa (con una stella).

/** Collezione delle province con le città aggiunte in coda (quindi sopra). `cities` sono feature GeoJSON. */
export function withCities(provinces, cities) {
  if (!provinces || !cities) return provinces;
  return { ...provinces, features: [...provinces.features, ...cities] };
}

/** Segna le capitali: una città è capitale se il suo nome è la capitale della nazione (nations.json). Una città divisa in
 *  parti (Roma sui due lati del Tevere) è capitale una sola volta, sulla prima parte, così il nome compare una volta. */
export function markCapitals(cities, nations) {
  const capitali = new Map(nations.map((n) => [n.id, n.capital]));
  const primaParte = new Map();
  for (const f of cities) {
    const gruppo = f.properties.cittaId ?? f.id;
    if (!primaParte.has(gruppo) || f.id < primaParte.get(gruppo)) primaParte.set(gruppo, f.id);
  }
  return cities.map((f) => {
    const base = f.properties.name.replace(/ \(parte .+\)$/, '');
    const isCapital = primaParte.get(f.properties.cittaId ?? f.id) === f.id && capitali.get(f.properties.owner) === base;
    return isCapital ? { ...f, properties: { ...f.properties, capital: true } } : f;
  });
}
