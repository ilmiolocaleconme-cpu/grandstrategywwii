// Fiumi come dati di gioco: modello, distanza dalla linea e attraversamenti dei confini
// tra province. Usa le stesse geometrie della mappa (data/rivers_geo.json): nessuna
// discrepanza tra grafica e regole. Nessun I/O e nessuna dipendenza.

const KM_LAT = 110.57;

export function kmPerLon(lat) {
  return 111.32 * Math.cos((lat * Math.PI) / 180);
}

/** Modello { rivers: Map(id -> { entry, lines }), byClass } dal catalogo e dalla geometria. */
export function buildRiverModel(catalog, geo) {
  const rivers = new Map(catalog.map((entry) => [entry.id, { entry, lines: [] }]));
  for (const f of geo.features) {
    const r = rivers.get(f.properties.riverId);
    if (r) r.lines.push({ coordinates: f.geometry.coordinates, inLake: Boolean(f.properties.inLake) });
  }
  return { rivers };
}

/** Distanza minima in km tra un punto e una polilinea (proiezione locale piana). */
export function distanceToLineKm(lon, lat, coordinates) {
  const kx = kmPerLon(lat);
  let best = Infinity;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const [x1, y1] = coordinates[i];
    const [x2, y2] = coordinates[i + 1];
    const ax = (x1 - lon) * kx;
    const ay = (y1 - lat) * KM_LAT;
    const bx = (x2 - lon) * kx;
    const by = (y2 - lat) * KM_LAT;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const d = Math.hypot(ax + t * dx, ay + t * dy);
    if (d < best) best = d;
  }
  return best;
}

export function distanceToRiverKm(model, riverId, lon, lat) {
  const r = model.rivers.get(riverId);
  if (!r) return Infinity;
  return Math.min(...r.lines.map((l) => distanceToLineKm(lon, lat, l.coordinates)));
}

/** Punti equidistanti (circa `stepKm`) lungo una polilinea, estremi inclusi. */
export function sampleLine(coordinates, stepKm = 2) {
  const out = [coordinates[0]];
  for (let i = 0; i < coordinates.length - 1; i++) {
    const [x1, y1] = coordinates[i];
    const [x2, y2] = coordinates[i + 1];
    const lat = (y1 + y2) / 2;
    const len = Math.hypot((x2 - x1) * kmPerLon(lat), (y2 - y1) * KM_LAT);
    const n = Math.max(1, Math.ceil(len / stepKm));
    for (let k = 1; k <= n; k++) out.push([x1 + ((x2 - x1) * k) / n, y1 + ((y2 - y1) * k) / n]);
  }
  return out;
}

export function lineLengthKm(coordinates) {
  let km = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const [x1, y1] = coordinates[i];
    const [x2, y2] = coordinates[i + 1];
    km += Math.hypot((x2 - x1) * kmPerLon((y1 + y2) / 2), (y2 - y1) * KM_LAT);
  }
  return km;
}

/**
 * Punti in cui un fiume passa da una provincia a un'altra: sono i luoghi dove, nelle regole,
 * serviranno ponti, guadi e traghetti. Una sola provincia per campione; i campioni fuori da
 * ogni provincia (mare, paesi non coperti) non generano attraversamenti.
 * Ritorna [{ riverId, from, to, lon, lat }] (lon, lat = punto di campionamento dopo il passaggio).
 */
export function riverProvinceCrossings(model, provinceIndex, { stepKm = 2 } = {}) {
  const events = [];
  const provinceId = (lon, lat) => {
    const hits = provinceIndex.provincesAt(lon, lat);
    return hits.length === 1 ? hits[0].properties.id : null;
  };
  for (const [riverId, { lines }] of model.rivers) {
    for (const line of lines) {
      let last = null;
      for (const [lon, lat] of sampleLine(line.coordinates, stepKm)) {
        const id = provinceId(lon, lat);
        if (id === null) continue;
        if (last !== null && id !== last) events.push({ riverId, from: last, to: id, lon, lat });
        last = id;
      }
    }
  }
  return events;
}

/** Raggruppa gli attraversamenti per coppia di province (ordine alfabetico). */
export function riverBorderGraph(events) {
  const pairs = new Map();
  for (const e of events) {
    const [a, b] = e.from < e.to ? [e.from, e.to] : [e.to, e.from];
    const key = `${a}|${b}`;
    if (!pairs.has(key)) pairs.set(key, { a, b, rivers: new Set(), count: 0 });
    const p = pairs.get(key);
    p.rivers.add(e.riverId);
    p.count += 1;
  }
  return pairs;
}

/**
 * Province lungo un fiume e coppie di province affacciate sulle due rive.
 * Sonda: a ogni campione (stepKm) si guarda a destra e a sinistra della linea, a `offsetDeg` gradi.
 * Serve dove il fiume fa da confine (Reno, Mosa, Danubio), cioè dove riverProvinceCrossings
 * vede solo una parte dei passaggi. Un ponte può unire due province affacciate oppure stare
 * dentro una sola provincia (Colonia, Maastricht): in quel caso la provincia è in `along`.
 * Ritorna { along: Map<provincia, campioni sul fiume>, facing: Map<"A|B" ordinate, campioni> }.
 */
export function riverBanks(model, provinceIndex, riverId, { stepKm = 3, offsetDeg = 0.03 } = {}) {
  const along = new Map();
  const facing = new Map();
  const ids = (lon, lat) => provinceIndex.provincesAt(lon, lat).map((f) => f.properties.id);
  const entry = model.rivers.get(riverId);
  if (!entry) return { along, facing };
  for (const line of entry.lines) {
    const s = sampleLine(line.coordinates, stepKm);
    for (let i = 1; i < s.length - 1; i += 1) {
      const [lon, lat] = s[i];
      let dx = s[i + 1][0] - s[i - 1][0];
      let dy = s[i + 1][1] - s[i - 1][1];
      const n = Math.hypot(dx, dy) || 1;
      dx /= n;
      dy /= n;
      for (const id of ids(lon, lat)) along.set(id, (along.get(id) ?? 0) + 1);
      const left = ids(lon - dy * offsetDeg, lat + dx * offsetDeg);
      const right = ids(lon + dy * offsetDeg, lat - dx * offsetDeg);
      if (left.length === 1 && right.length === 1 && left[0] !== right[0]) {
        const key = [left[0], right[0]].sort().join('|');
        facing.set(key, (facing.get(key) ?? 0) + 1);
      }
    }
  }
  return { along, facing };
}

/** Fiumi sulla catena di confluenze fino alla foce: [id, flowsInto, ...]. */
export function downstreamChain(catalog, riverId) {
  const byId = new Map(catalog.map((r) => [r.id, r]));
  const chain = [];
  for (let cur = byId.get(riverId); cur; cur = cur.flowsInto ? byId.get(cur.flowsInto) : undefined) {
    chain.push(cur.id);
    if (chain.length > catalog.length) break; // difesa dai cicli
  }
  return chain;
}
