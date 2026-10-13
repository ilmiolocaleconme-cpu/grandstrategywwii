// Validatore del catalogo dati. Puro JavaScript, nessuna dipendenza, nessun I/O:
// lavora su oggetti già caricati, quindi è usabile sia in Node sia nel browser.

export const ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
export const RIVER_CLASSES = ['main', 'secondary', 'tributary'];
export const CROSSING_TYPES = ['bridge_road', 'bridge_rail', 'ford', 'ferry'];
export const CROSSING_STATES = ['intact', 'damaged', 'destroyed', 'temporary'];

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

/**
 * Valida un catalogo { nations, resources, rivers, crossings }.
 * Ritorna { ok, errors, warnings }. Non modifica l'input.
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
      warnings.push(`rivers: "${river.id}" è marcato come approssimazione`);
    }
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
