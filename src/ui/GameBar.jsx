import { formatDate } from '../game/calendar.js';
import { MAX_SPEED, SPEEDS } from '../game/speed.js';

const Icon = ({ children }) => <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">{children}</svg>;
const Back = () => <Icon><path d="M10 4v12L2 10zM18 4v12l-8-6z" /></Icon>;
const Pause = () => <Icon><rect x="4" y="3" width="4.5" height="14" rx="1" /><rect x="11.5" y="3" width="4.5" height="14" rx="1" /></Icon>;
const Forward = () => <Icon><path d="M2 4v12l8-6zM10 4v12l8-6z" /></Icon>;

/** Barra della partita: data, nazione e tre pulsanti del tempo (indietro, pausa, avanti), più gli errori di salvataggio. Salva ed Esci stanno nella schermata Partita. Non possiede stato. */
export default function GameBar({
  game, playerName, running, speed, notice, onBack, onPause, onForward, onStep,
}) {
  const label = SPEEDS.find((s) => s.id === speed)?.label ?? '';
  return (
    <div className="gamebar" role="region" aria-label="Partita">
      <div className="gb-info">
        <strong>{formatDate(game.date)}</strong>
        <span className="muted">{playerName}</span>
      </div>
      <div className="gb-controls">
        <div className="gb-clock" role="group" aria-label="Tempo">
          <button type="button" onClick={onBack} disabled={!running} aria-label="Indietro: rallenta, a 1× mette in pausa"><Back /></button>
          <button type="button" className={`gb-pause${running ? '' : ' paused'}`} onClick={onPause} aria-pressed={!running} aria-label={running ? 'Pausa' : 'In pausa: tocca per riprendere'}><Pause /></button>
          <button type="button" onClick={onForward} disabled={running && speed >= MAX_SPEED} aria-label={running ? 'Avanti: accelera' : 'Avanti: riprendi'}><Forward /></button>
          <span className="gb-speed" aria-live="polite">{running ? label : 'Pausa'}</span>
        </div>
        <button type="button" onClick={onStep} disabled={running} aria-label="Avanza di un giorno">+1 g</button>
      </div>
      {notice?.kind === 'error' ? <p className="gb-note warn" role="status">{notice.text}</p> : null}
    </div>
  );
}
