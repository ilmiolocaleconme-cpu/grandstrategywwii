// Validatore del catalogo dati. Puro JavaScript, nessuna dipendenza, nessun I/O:
// lavora su oggetti già caricati, quindi è usabile sia in Node sia nel browser.

export const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
export const RIVER_CLASSES = ['main', 'secondary', 'tributary'];
export const CROSSING_TYPES = ['bridge_road', 'bridge_rail', 'ford', 'ferry'];
export const CROSSING_STATES = ['intact', 'damaged', 'destroyed', 'temporary'];
export const POLITICAL_TYPES = ['country', 'colony', 'puppet', 'special'];
export const POLITICAL_STATUSES = [
  'independent',
  'dominion',
  'colony',
  'protectorate',
  'mandate',
  'puppet',
  'occupied',
  'condominium',
  'commonwealth',
  'leased',
  'free_city',
  'special',
  'de_facto',
];
export const BORDER_QUALITIES = ['verified', 'approximate', 'hypothesis'];
export const PROVINCES_AS_OF = '1936-01-01';
// Proprietari ammessi pur non essendo entità del dataset politico (solo come owner).
export const EXTERNAL_OWNERS = ['LEAGUE'];

function checkCollection(name, items, requiredFields, errors) {
  if (!Array.isArray(items)) {
    errors.push(`${name}: deve essere un array`);
    return new Map();
  }
  const byId = new Map();
  items.forEach((item, index) => {
    const where = `${name}[${index}]`;
    if (item === null || typeof item !== 'object') {
      errors.push(`${where}: elemento non valido`);
      return;
    }
    for (const field of requiredFields) {
      if (item[field] === undefined || item[field] === null || item[field] === '') {
        errors.push(`${where}: campo obbligatorio mancante "${field}"`);
      }
    }
    if (typeof item.id !== 'string' || !ID_PATTERN.test(item.id)) {
      errors.push(`${where}: id non valido (${JSON.stringify(item.id)})`);
      return;
    }
    if (byId.has(item.id)) {
      errors.push(`${name}: id duplicato "${item.id}"`);
      return;
    }
    byId.set(item.id, item);
  });
  return byId;
}

function checkRiverGraph(rivers, errors) {
  // Ogni affluente deve confluire in un fiume esistente; nessun ciclo.
  for (const river of rivers.values()) {
    if (river.class === 'tributary' && !river.flowsInto) {
      errors.push(`rivers: l'affluente "${river.id}" non indica flowsInto`);
    }
    if (river.flowsInto && !rivers.has(river.flowsInto)) {
      errors.push(`rivers: "${river.id}" confluisce in "${river.flowsInto}" che non esiste`);
    }
  }
  for (const start of rivers.values()) {
    const seen = new Set([start.id]);
    let current = start;
    while (current.flowsInto && rivers.has(current.flowsInto)) {
      if (seen.has(current.flowsInto)) {
        errors.push(`rivers: ciclo di confluenze che coinvolge "${start.id}"`);
        break;
      }
      seen.add(current.flowsInto);
      current = rivers.get(current.flowsInto);
    }
  }
}

function checkPolitical(political, nations, errors) {
  const entities = checkCollection(
    'political',
    political,
    ['id', 'name', 'type', 'owner', 'controller', 'status', 'playable'],
    errors,
  );
  for (const e of entities.values()) {
    if (!POLITICAL_TYPES.includes(e.type)) {
      errors.push(`political: "${e.id}" ha un type non valido "${e.type}"`);
    }
    if (!POLITICAL_STATUSES.includes(e.status)) {
      errors.push(`political: "${e.id}" ha uno status non valido "${e.status}"`);
    }
    if (typeof e.playable !== 'boolean') {
      errors.push(`political: "${e.id}" playable deve essere booleano`);
    }
    if (e.playable === true && !nations.has(e.id)) {
      errors.push(`political: "${e.id}" è giocabile ma non ha una voce in nations.json`);
    }
    if (typeof e.owner === 'string' && !entities.has(e.owner) && !EXTERNAL_OWNERS.includes(e.owner)) {
      errors.push(`political: "${e.id}" ha un owner inesistente "${e.owner}"`);
    }
    if (typeof e.controller === 'string' && !entities.has(e.controller)) {
      errors.push(`political: "${e.id}" ha un controller inesistente "${e.controller}"`);
    }
  }
  // nations.json descrive le nazioni giocabili: ogni id deve esistere nel dataset politico.
  // Eccezione: `appearsLater: true` dichiara un'entità che nasce dopo il 1/1/1936 (per evento).
  for (const nation of nations.values()) {
    const inPolitical = entities.has(nation.id);
    if (nation.appearsLater === true) {
      if (inPolitical) {
        errors.push(`nations: "${nation.id}" è appearsLater ma esiste già in political_1936`);
      }
    } else if (!inPolitical) {
      errors.push(`nations: "${nation.id}" non esiste in political_1936`);
    }
  }
}

function ringProblem(ring) {
  if (!Array.isArray(ring) || ring.length < 4) return 'anello con meno di 4 punti';
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) return 'anello non chiuso';
  for (const p of ring) {
    if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return 'coordinata non numerica';
    if (p[0] < -180 || p[0] > 180 || p[1] < -90 || p[1] > 90) return 'coordinata fuori intervallo';
  }
  return null;
}

function checkProvinces(provinces, political, errors, warnings) {
  if (provinces === null || typeof provinces !== 'object' || !Array.isArray(provinces.features)) {
    errors.push('provinces: deve essere una FeatureCollection con "features"');
    return;
  }
  const owners = new Map(Array.isArray(political) ? political.map((e) => [e?.id, e]) : []);
  const seen = new Set();
  let approximate = 0;
  let hypothesis = 0;
  provinces.features.forEach((feature, index) => {
    const props = feature?.properties ?? {};
    const where = `provinces[${index}]`;
    if (typeof props.id !== 'string' || !ID_PATTERN.test(props.id)) {
      errors.push(`${where}: id non valido (${JSON.stringify(props.id)})`);
      return;
    }
    if (seen.has(props.id)) errors.push(`provinces: id duplicato "${props.id}"`);
    seen.add(props.id);
    if (feature.id !== props.id) errors.push(`provinces: "${props.id}" ha feature.id diverso da properties.id`);
    for (const field of ['name', 'owner', 'source', 'license', 'validFrom', 'validTo']) {
      if (typeof props[field] !== 'string' || props[field] === '') {
        errors.push(`provinces: "${props.id}" campo obbligatorio mancante "${field}"`);
      }
    }
    if (props.owner && !owners.has(props.owner)) {
      errors.push(`provinces: "${props.id}" ha un owner inesistente "${props.owner}"`);
    }
    if (!BORDER_QUALITIES.includes(props.borderQuality)) {
      errors.push(`provinces: "${props.id}" ha un borderQuality non valido "${props.borderQuality}"`);
    } else if (props.borderQuality === 'approximate') {
      approximate += 1;
    } else if (props.borderQuality === 'hypothesis') {
      hypothesis += 1;
    }
    if (props.validFrom > PROVINCES_AS_OF || props.validTo <= PROVINCES_AS_OF) {
      errors.push(`provinces: "${props.id}" non è valida alla data ${PROVINCES_AS_OF}`);
    }
    const geometry = feature.geometry;
    if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) {
      errors.push(`provinces: "${props.id}" ha una geometria non valida`);
      return;
    }
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    if (!Array.isArray(polygons) || polygons.length === 0) {
      errors.push(`provinces: "${props.id}" non ha poligoni`);
      return;
    }
    for (const polygon of polygons) {
      for (const ring of polygon) {
        const problem = ringProblem(ring);
        if (problem) {
          errors.push(`provinces: "${props.id}" ${problem}`);
          return;
        }
      }
    }
  });
  if (approximate > 0 || hypothesis > 0) {
    warnings.push(
      `provinces: su ${provinces.features.length} province, ${approximate} hanno confini approssimati e ${hypothesis} sono ipotesi`,
    );
  }
}

// Gaue (distretti NSDAP): livello aggiuntivo alle province, stessi controlli sugli anelli.
function checkGaue(gaue, provinces, political, errors, warnings) {
  if (!gaue || gaue.type !== 'FeatureCollection' || !Array.isArray(gaue.features)) {
    errors.push('gaue: deve essere una FeatureCollection con "features"');
    return;
  }
  const owners = new Map(Array.isArray(political) ? political.map((e) => [e?.id, e]) : []);
  const provinceIds = new Set(Array.isArray(provinces?.features) ? provinces.features.map((f) => f.properties?.id) : []);
  const seen = new Set();
  let hypothesis = 0;
  gaue.features.forEach((feature, index) => {
    const props = feature?.properties ?? {};
    const where = `gaue[${index}]`;
    if (typeof props.id !== 'string' || !/^G_[A-Z0-9_]+$/.test(props.id)) {
      errors.push(`${where}: id non valido (${JSON.stringify(props.id)})`);
      return;
    }
    if (seen.has(props.id)) errors.push(`gaue: id duplicato "${props.id}"`);
    seen.add(props.id);
    if (feature.id !== props.id) errors.push(`gaue: "${props.id}" ha feature.id diverso da properties.id`);
    for (const field of ['name', 'owner', 'source', 'license']) {
      if (typeof props[field] !== 'string' || props[field] === '') {
        errors.push(`gaue: "${props.id}" campo obbligatorio mancante "${field}"`);
      }
    }
    if (props.owner && owners.size > 0 && !owners.has(props.owner)) {
      errors.push(`gaue: "${props.id}" ha un owner inesistente "${props.owner}"`);
    }
    if (!BORDER_QUALITIES.includes(props.borderQuality)) {
      errors.push(`gaue: "${props.id}" ha un borderQuality non valido "${props.borderQuality}"`);
    } else if (props.borderQuality === 'hypothesis') {
      hypothesis += 1;
    }
    if (!Array.isArray(props.provinceIds) || props.provinceIds.length === 0) {
      errors.push(`gaue: "${props.id}" deve elencare le province che copre (provinceIds)`);
    } else if (provinceIds.size > 0) {
      for (const pid of [...props.provinceIds, ...(props.partialProvinceIds ?? [])]) {
        if (!provinceIds.has(pid)) errors.push(`gaue: "${props.id}" riferisce la provincia inesistente "${pid}"`);
      }
    }
    const geometry = feature.geometry;
    if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) {
      errors.push(`gaue: "${props.id}" ha una geometria non valida`);
      return;
    }
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (const polygon of polygons) {
      for (const ring of polygon) {
        const problem = ringProblem(ring);
        if (problem) {
          errors.push(`gaue: "${props.id}" ${problem}`);
          return;
        }
      }
    }
  });
  if (hypothesis > 0) warnings.push(`gaue: su ${gaue.features.length} Gaue, ${hypothesis} sono ipotesi (tracciati da immagine, riferimento 31.12.1937)`);
}

// Geometria dei fiumi: ogni tratto riferisce un fiume del catalogo, ogni fiume ha almeno un tratto.
function checkRiversGeo(geo, rivers, errors) {
  if (!geo || geo.type !== 'FeatureCollection' || !Array.isArray(geo.features)) {
    errors.push('riversGeo: deve essere una FeatureCollection');
    return;
  }
  const withGeometry = new Set();
  geo.features.forEach((f, i) => {
    const where = `riversGeo[${i}]`;
    const id = f?.properties?.riverId;
    if (!rivers.has(id)) {
      errors.push(`${where}: riferisce il fiume inesistente "${id}"`);
      return;
    }
    withGeometry.add(id);
    const g = f.geometry;
    if (!g || g.type !== 'LineString' || !Array.isArray(g.coordinates) || g.coordinates.length < 2) {
      errors.push(`${where}: "${id}" ha una linea non valida`);
      return;
    }
    for (const [lon, lat] of g.coordinates) {
      if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lon) > 180 || Math.abs(lat) > 90) {
        errors.push(`${where}: "${id}" ha coordinate fuori intervallo`);
        return;
      }
    }
  });
  for (const id of rivers.keys()) {
    if (!withGeometry.has(id)) errors.push(`riversGeo: il fiume "${id}" non ha nessun tratto`);
  }
}

function checkLakes(lakes, errors) {
  if (!lakes || lakes.type !== 'FeatureCollection' || !Array.isArray(lakes.features)) {
    errors.push('lakes: deve essere una FeatureCollection');
    return;
  }
  const seen = new Set();
  lakes.features.forEach((f, i) => {
    const props = f?.properties ?? {};
    if (typeof props.id !== 'string' || !ID_PATTERN.test(props.id)) {
      errors.push(`lakes[${i}]: id non valido (${JSON.stringify(props.id)})`);
      return;
    }
    if (seen.has(props.id)) errors.push(`lakes: id duplicato "${props.id}"`);
    seen.add(props.id);
    for (const field of ['source', 'license']) {
      if (typeof props[field] !== 'string' || props[field] === '') {
        errors.push(`lakes: "${props.id}" campo obbligatorio mancante "${field}"`);
      }
    }
    const g = f.geometry;
    if (!g || g.type !== 'MultiPolygon' || !Array.isArray(g.coordinates) || g.coordinates.length === 0) {
      errors.push(`lakes: "${props.id}" ha una geometria non valida`);
      return;
    }
    for (const polygon of g.coordinates) {
      for (const ring of polygon) {
        const problem = ringProblem(ring);
        if (problem) {
          errors.push(`lakes: "${props.id}" ${problem}`);
          return;
        }
      }
    }
  });
}

/**
 * Valida un catalogo { nations, resources, rivers, crossings, political? }.
 * `provinces` (FeatureCollection) è opzionale e richiede `political` per i controlli sugli owner. `political` è opzionale: se assente, la sua validazione e i controlli incrociati
 * con nations vengono saltati. Ritorna { ok, errors, warnings }. Non modifica l'input.
 */
export function validateCatalog(catalog) {
  const errors = [];
  const warnings = [];
  const input = catalog ?? {};

  const nations = checkCollection('nations', input.nations, ['id', 'name', 'capital'], errors);
  checkCollection('resources', input.resources, ['id', 'name'], errors);
  const rivers = checkCollection(
    'rivers',
    input.rivers,
    ['id', 'name', 'class', 'navigable', 'approximate'],
    errors,
  );
  const crossings = checkCollection(
    'crossings',
    input.crossings,
    ['id', 'type', 'riverId', 'state', 'approximate'],
    errors,
  );

  if (input.political !== undefined) {
    checkPolitical(input.political, nations, errors);
  }

  if (input.provinces !== undefined) {
    checkProvinces(input.provinces, input.political, errors, warnings);
  }
  if (input.gaue !== undefined) {
    checkGaue(input.gaue, input.provinces, input.political, errors, warnings);
  }
  if (input.riversGeo !== undefined) {
    checkRiversGeo(input.riversGeo, rivers, errors);
  }
  if (input.lakes !== undefined) {
    checkLakes(input.lakes, errors);
  }

  const approximateRivers = [];
  for (const river of rivers.values()) {
    if (!RIVER_CLASSES.includes(river.class)) {
      errors.push(`rivers: "${river.id}" ha una classe non valida "${river.class}"`);
    }
    if (typeof river.navigable !== 'boolean') {
      errors.push(`rivers: "${river.id}" navigable deve essere booleano`);
    }
    if (typeof river.approximate !== 'boolean') {
      errors.push(`rivers: "${river.id}" approximate deve essere booleano`);
    } else if (river.approximate) {
      approximateRivers.push(river.id);
    }
  }
  if (approximateRivers.length > 5) {
    warnings.push(`rivers: ${approximateRivers.length} fiumi su ${rivers.size} sono marcati come approssimazione`);
  } else {
    approximateRivers.forEach((id) => warnings.push(`rivers: "${id}" è marcato come approssimazione`));
  }
  checkRiverGraph(rivers, errors);

  for (const crossing of crossings.values()) {
    if (!CROSSING_TYPES.includes(crossing.type)) {
      errors.push(`crossings: "${crossing.id}" ha un tipo non valido "${crossing.type}"`);
    }
    if (!CROSSING_STATES.includes(crossing.state)) {
      errors.push(`crossings: "${crossing.id}" ha uno stato non valido "${crossing.state}"`);
    }
    if (!rivers.has(crossing.riverId)) {
      errors.push(`crossings: "${crossing.id}" riferisce il fiume inesistente "${crossing.riverId}"`);
    }
    if (crossing.controller != null && !nations.has(crossing.controller)) {
      errors.push(
        `crossings: "${crossing.id}" ha un controllore inesistente "${crossing.controller}"`,
      );
    }
    if (typeof crossing.approximate !== 'boolean') {
      errors.push(`crossings: "${crossing.id}" approximate deve essere booleano`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
