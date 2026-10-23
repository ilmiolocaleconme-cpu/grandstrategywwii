// Schermo intero e blocco in orizzontale per il browser (con l'app installata ci pensa il manifest).
// Funzioni con ambiente iniettabile (env = window): si provano senza browser.

// 'installed' = l'app è già a schermo intero (PWA installata con display fullscreen)
// 'api'       = il browser permette lo schermo intero da un tocco (Android/Chrome, desktop)
// 'none'      = non disponibile (iPhone/Safari: nessuna API di schermo intero per le pagine)
export function fullscreenSupport(env = globalThis) {
  const doc = env.document;
  const asked = typeof env.matchMedia === 'function' ? env.matchMedia('(display-mode: fullscreen)') : null;
  if (asked && asked.matches) return 'installed';
  if (doc && doc.fullscreenEnabled && typeof doc.documentElement?.requestFullscreen === 'function') return 'api';
  return 'none';
}

export function isFullscreen(env = globalThis) {
  return Boolean(env.document?.fullscreenElement);
}

// Va chiamata da un tocco (gesto dell'utente): i browser rifiutano lo schermo intero altrimenti.
// Il blocco dell'orientamento funziona solo a schermo intero e solo dove l'API esiste (Android/Chrome):
// se manca o viene rifiutato, lo schermo intero resta attivo e si segnala locked: false.
export async function enterFullscreenLandscape(env = globalThis) {
  try {
    await env.document.documentElement.requestFullscreen({ navigationUI: 'hide' });
  } catch (e) {
    return { ok: false, locked: false, reason: 'fullscreen-refused' };
  }
  const orientation = env.screen?.orientation;
  if (orientation && typeof orientation.lock === 'function') {
    try {
      await orientation.lock('landscape');
      return { ok: true, locked: true };
    } catch (e) {
      return { ok: true, locked: false, reason: 'orientation-refused' };
    }
  }
  return { ok: true, locked: false, reason: 'orientation-unsupported' };
}

export async function exitFullscreenAndUnlock(env = globalThis) {
  try { env.screen?.orientation?.unlock?.(); } catch (e) { /* niente da sbloccare */ }
  try {
    if (env.document?.fullscreenElement) await env.document.exitFullscreen();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'exit-refused' };
  }
}
