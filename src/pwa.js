import { registerSW } from 'virtual:pwa-register';

// Collega il service worker all'interfaccia. Le funzioni di callback ricevono
// lo stato da mostrare al giocatore: pronto offline, aggiornamento disponibile, errore.
export function initPwa({ onOfflineReady, onUpdateAvailable, onError }) {
  const updateSW = registerSW({
    onOfflineReady,
    onNeedRefresh: onUpdateAvailable,
    onRegisterError: onError,
  });
  // Applica l'aggiornamento solo quando il giocatore lo sceglie.
  return () => updateSW(true);
}
