/* ============================================================================
   DEV → UMORE (MASTER SPEC v1.12 §10.6)

   L'umore è la cosa meno ispezionabile che abbiamo costruito: non ha una
   schermata, non si dichiara mai in chat, e per progetto si sente SOLO in come
   il .mon dice le cose. Che è esattamente quello che vogliamo — e anche
   esattamente il modo in cui un bug ci resterebbe dentro per settimane senza
   che nessuno se ne accorga.

   Qui si vede lo stato vero, la sua base, e la distanza fra i due. Come per
   l'archivio delle memorie: esiste un posto in cui si guarda, e non è una
   superficie di prodotto.
   ========================================================================= */

import { useActiveMon, useApp } from '../state/store';
import { Row, SystemLabel } from '../system/components';
import { displayName } from '../engine/types';
import { baselineFor, moodPhrase } from '../engine/mood';
import { MAX_ACTIVE } from '../engine/opinions';
import { MAX_NOTES, voiceVersion } from '../engine/notebook';
import { Button } from '../system/components';

/** Barra da −100 a +100 (o 0–100), con il punto di riposo segnato sopra. */
function MoodBar({
  label,
  value,
  home,
  min,
  max,
}: {
  label: string;
  value: number;
  home: number;
  min: number;
  max: number;
}) {
  const pct = (v: number) => ((v - min) / (max - min)) * 100;

  return (
    <div className="moodbar">
      <div className="moodbar__head">
        <span className="t-micro">{label}</span>
        <span className="t-micro">
          {value > 0 && min < 0 ? '+' : ''}
          {value}
        </span>
      </div>
      <div className="moodbar__track">
        <span className="moodbar__home" style={{ left: `${pct(home)}%` }} aria-hidden="true" />
        <span className="moodbar__dot" style={{ left: `${pct(value)}%` }} aria-hidden="true" />
      </div>
    </div>
  );
}

export function MoodSection() {
  const mood = useApp((s) => s.mood);
  const day = useApp((s) => s.day);
  const mon = useActiveMon();
  const opinions = useApp((s) => s.opinions);
  const active = opinions.filter((o) => o.status === 'attiva');
  const notes = useApp((s) => s.voiceNotes);
  const decideVoiceNote = useApp((s) => s.decideVoiceNote);
  const pending = notes.filter((n) => n.status === 'proposta');
  const accepted = notes.filter((n) => n.status === 'accettata');

  if (!mood || !mon) {
    return (
      <div className="dev__section">
        <p className="t-small dev__note">
          Nessun umore: non è ancora nato nessuno. L’uovo non ha stati d’animo,
          ha suoni.
        </p>
      </div>
    );
  }

  const home = baselineFor(mon.data.mood_primary);
  const drift =
    Math.abs(mood.tone - home.tone) +
    Math.abs(mood.charge - home.charge) +
    Math.abs(mood.footing - home.footing);

  return (
    <div className="dev__section">
      <p className="t-micro dev__note">
        Il trattino è dove questo temperamento si riposa; il punto è dov’è
        adesso. Se coincidono, non è successo niente di recente — non è un bug.
      </p>

      <div className="rowlist">
        <Row label="TEMPERAMENTO" value={mon.data.mood_primary} />
        <Row label="AGGIORNATO AL GIORNO" value={`${mood.day}${mood.day < day ? ` (oggi è ${day})` : ''}`} />
        <Row label="DISTANZA DALLA BASE" value={String(drift)} />
        <Row label="ULTIMA COSA CHE L’HA MOSSO" value={mood.last ?? '—'} />
      </div>

      <div className="moodbars">
        <MoodBar label="TONO" value={mood.tone} home={home.tone} min={-100} max={100} />
        <MoodBar label="CARICA" value={mood.charge} home={home.charge} min={0} max={100} />
        <MoodBar label="APPIGLIO" value={mood.footing} home={home.footing} min={0} max={100} />
      </div>

      <p className="t-meta dev__label">COME ARRIVA AL MODELLO</p>
      <pre className="dev__prompt t-small">{moodPhrase(mood)}</pre>

      {/* 🔷 v1.12 §16.3 — le opinioni stanno qui e non in MEMORIA di proposito:
          non sono cose che ricorda, sono cose che PENSA. La differenza e' tutta
          in questa schermata, perche' in chat non si vedra' mai etichettata. */}
      <p className="t-meta dev__label">
        COSA E’ ARRIVATO A PENSARE ({active.length}/{MAX_ACTIVE})
      </p>
      <p className="t-micro dev__note">
        Nascono dalla riflessione settimanale. La maggior parte delle settimane
        non ne produce nessuna, ed è il comportamento giusto: una convinzione a
        settimana per un anno sarebbe un oroscopo.
      </p>
      {opinions.length === 0 ? (
        <p className="t-small dev__note">
          Ancora niente. Serve una settimana con almeno tre cose dentro — e la
          chiave, perché è l’unica parte che non gira senza AI.
        </p>
      ) : (
        <ul className="dev__memories">
          {opinions.map((o) => (
            <li key={o.id} className="dev__memory">
              <div className="dev__memoryhead">
                <SystemLabel>
                  {o.status === 'smentita' ? 'SMENTITA' : `FORZA ${o.strength}`}
                </SystemLabel>
                <span className="dev__memoryform t-micro">
                  giorno {o.formedOnDay} · {displayName(o.monName)}
                </span>
              </div>
              <p className="dev__memorytext t-small">{o.text}</p>
            </li>
          ))}
        </ul>
      )}

      {/* 🔷 v1.14 §22 — IL TACCUINO.
          L'unico posto in cui un aggiustamento diventa attivo. Non esiste un
          percorso in cui il .mon se lo applichi da solo, e non deve esistere:
          è tutta la differenza fra proporre e decidere. */}
      <p className="t-meta dev__label">
        IL TACCUINO — VOCE v{voiceVersion(notes)} ({accepted.length}/{MAX_NOTES})
      </p>
      <p className="t-micro dev__note">
        Una volta al mese guarda com’è andato lo scambio — non quanto — e
        propone un aggiustamento al proprio modo di parlare. Il segnale non è
        mai quanto lo usi: sarebbe una macchina che impara a tenerti attaccato.
      </p>

      {pending.length > 0 && (
        <ul className="dev__memories">
          {pending.map((n) => (
            <li key={n.id} className="dev__memory">
              <div className="dev__memoryhead">
                <SystemLabel tone="character">DA DECIDERE</SystemLabel>
                <span className="dev__memoryform t-micro">giorno {n.proposedOnDay}</span>
              </div>
              <p className="dev__memorytext t-small">{n.text}</p>
              <p className="t-micro dev__note">Perché: {n.reason}</p>
              <div className="dev__noteactions">
                <Button variant="primary" onClick={() => decideVoiceNote(n.id, true)}>
                  ACCETTA
                </Button>
                <Button variant="secondary" onClick={() => decideVoiceNote(n.id, false)}>
                  RIFIUTA
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {notes.length === 0 ? (
        <p className="t-small dev__note">
          Ancora niente. Serve un mese con almeno venti risposte alle spalle — e
          il token.
        </p>
      ) : (
        <ul className="dev__memories">
          {notes
            .filter((n) => n.status !== 'proposta')
            .map((n) => (
              <li key={n.id} className="dev__memory">
                <div className="dev__memoryhead">
                  <SystemLabel>
                    {n.status === 'accettata' ? `ATTIVA · v${n.version}` : 'RIFIUTATA'}
                  </SystemLabel>
                  <span className="dev__memoryform t-micro">giorno {n.proposedOnDay}</span>
                </div>
                <p className="dev__memorytext t-small">{n.text}</p>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
