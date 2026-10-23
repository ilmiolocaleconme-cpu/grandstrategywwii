// Controllo del tempo a tre pulsanti (indietro, pausa, avanti), come un registratore. Funzioni PURE: ricevono e restituiscono
// { running, speed }. `speed` è ricordata anche in pausa: riprendere riparte alla velocità di prima.
//  - avanti: in pausa riprende alla velocità ricordata; in corso passa a quella successiva (1× → 2× → 3×), al massimo resta 3×;
//  - indietro: in corso scende di una velocità; a 1× mette in pausa; in pausa non fa nulla;
//  - pausa: ferma; se è già ferma riprende (alterna).
export const SPEEDS = Object.freeze([
  { id: 1, label: '1×', ms: 1000 },
  { id: 2, label: '2×', ms: 400 },
  { id: 3, label: '3×', ms: 120 },
]);
export const MIN_SPEED = SPEEDS[0].id;
export const MAX_SPEED = SPEEDS[SPEEDS.length - 1].id;

export const initialClock = () => ({ running: false, speed: MIN_SPEED });

/** Intervallo in millisecondi tra due giorni di gioco alla velocità data. */
export function msPerDay(speed) {
  const s = SPEEDS.find((x) => x.id === speed);
  if (!s) throw new Error(`velocità sconosciuta: ${speed}`);
  return s.ms;
}

export function pressForward({ running, speed }) {
  if (!running) return { running: true, speed };
  return { running: true, speed: Math.min(MAX_SPEED, speed + 1) };
}

export function pressBack({ running, speed }) {
  if (!running) return { running, speed };
  if (speed <= MIN_SPEED) return { running: false, speed };
  return { running: true, speed: speed - 1 };
}

export function pressPause({ running, speed }) {
  return { running: !running, speed };
}
