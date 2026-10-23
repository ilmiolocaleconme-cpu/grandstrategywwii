import { useEffect, useState } from 'react';
import { enterFullscreenLandscape, exitFullscreenAndUnlock, fullscreenSupport, isFullscreen } from './fullscreen.js';

// Pulsante ⛶ nella barra: schermo intero e blocco in orizzontale (Android/Chrome e desktop).
// Non compare con l'app installata a schermo intero né dove il browser non lo permette (iPhone/Safari).
export default function FullscreenButton() {
  const [support] = useState(() => fullscreenSupport(window));
  const [on, setOn] = useState(() => isFullscreen(window));
  useEffect(() => {
    const sync = () => setOn(isFullscreen(window));
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);
  if (support !== 'api') return null;
  const toggle = () => { if (on) exitFullscreenAndUnlock(window); else enterFullscreenLandscape(window); };
  return (
    <button type="button" className={on ? 'on' : ''} aria-pressed={on} aria-label={on ? 'Esci dallo schermo intero' : 'Schermo intero e orizzontale'} onClick={toggle}>⛶</button>
  );
}
