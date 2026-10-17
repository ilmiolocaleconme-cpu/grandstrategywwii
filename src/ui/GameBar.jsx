import { formatDate } from '../game/calendar.js';

export const SPEEDS = [
  { id: 1, label: '1×', ms: 1000 },
  { id: 2, label: '2×', ms: 400 },
  { id: 3, label: '3×', ms: 120 },
];

/** Barra della partita: data, nazione, pausa/avvio, velocità, salvataggio. Non possiede stato. */
export default function GameBar({
  game, playerName, running, speed, canSave, notice, onToggle, onStep, onSpeed, onSave, onExit,
}) {
  return (
    <div className="gamebar" role="region" aria-label="Partita">
      <div className="gb-info">
        <strong>{formatDate(game.date)}</strong>
        <span className="muted">{playerName}</span>
      </div>
      <div className="gb-controls">
        <button type="button" onClick={onToggle} aria-pressed={running}>{running ? '⏸ Pausa' : '▶ Avvia'}</button>
        <button type="button" onClick={onStep} disabled={running} aria-label="Avanza di un giorno">+1 g</button>
        {SPEEDS.map((s) => (
          <button key={s.id} type="button" className={speed === s.id ? 'on' : ''} aria-pressed={speed === s.id} onClick={() => onSpeed(s.id)}>{s.label}</button>
        ))}
        <button type="button" onClick={onSave} disabled={!canSave}>Salva</button>
        <button type="button" onClick={onExit}>Esci</button>
      </div>
      {notice ? <p className={`gb-note ${notice.kind === 'error' ? 'warn' : 'muted'}`} role="status">{notice.text}</p> : null}
    </div>
  );
}
