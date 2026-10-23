import { formatDate } from '../game/calendar.js';
import flagsFile from '../../data/flags.json';
import descriptionsFile from '../../data/nation_descriptions.json';
import Flag from './Flag.jsx';

const REASONS = {
  invalid_json: 'file illeggibile (non è JSON valido)',
  wrong_format: 'non è un salvataggio di questo gioco',
  newer_version: 'creato da una versione più recente del gioco',
  missing_migration: 'versione troppo vecchia: manca la conversione',
  invalid_state: 'dati incoerenti',
  read_failed: 'il browser ha bloccato la lettura',
};

export function describeSaveError(r) {
  const base = REASONS[r.reason] ?? r.reason;
  const kept = r.backedUp ? ' L\'originale è stato conservato (copia «.broken»).' : '';
  return `Salvataggio non caricato: ${base}.${kept}`;
}

function SaveCard({ title, info, onLoad }) {
  if (!info) return null;
  return (
    <button type="button" className="save-card" onClick={onLoad}>
      <strong>{title}</strong>
      <span>{info.player} · {formatDate(info.date)}</span>
    </button>
  );
}

/** Schermata iniziale: scelta della nazione e ripresa dei salvataggi. Niente stato proprio. */
export default function NewGame({ nations, saves, canSave, notice, onStart, onLoad }) {
  return (
    <main className="app newgame">
      <header>
        <h1>Nuova partita</h1>
        <p className="muted">Si parte dal 1 gennaio 1936. Per ora il tempo scorre ma non esistono ancora economia, unità o eventi: è il nucleo su cui costruirli.</p>
      </header>
      {notice ? <p className={notice.kind === 'error' ? 'warn' : 'muted'} role="status">{notice.text}</p> : null}
      {!canSave ? <p className="warn">Questo browser non permette di salvare (finestra privata o dati bloccati): la partita si perde alla chiusura.</p> : null}
      {saves.auto || saves.manual ? (
        <section aria-labelledby="continue-title">
          <h2 id="continue-title">Continua</h2>
          <div className="save-cards">
            <SaveCard title="Manuale" info={saves.manual} onLoad={() => onLoad('manual')} />
            <SaveCard title="Automatico" info={saves.auto} onLoad={() => onLoad('auto')} />
          </div>
        </section>
      ) : null}
      <section aria-labelledby="pick-title">
        <h2 id="pick-title">Scegli la nazione</h2>
        <ul className="nation-scroll" aria-label="Nazioni: scorri in orizzontale">
          {nations.map((n) => (
            <li key={n.id}>
              <button type="button" className="nation-card" onClick={() => onStart(n.id)}>
                <Flag flag={flagsFile.flags[n.id]} />
                <strong>{n.name}</strong>
                <span className={descriptionsFile.descriptions[n.id] ? 'nation-desc' : 'nation-desc muted'}>{descriptionsFile.descriptions[n.id] || 'Descrizione in arrivo'}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="muted">Il Giappone non è ancora scegliibile: mancano le sue province sulla mappa.</p>
      </section>
    </main>
  );
}
