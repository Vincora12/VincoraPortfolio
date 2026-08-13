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
import { Row } from '../system/components';
import { baselineFor, moodPhrase } from '../engine/mood';

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
    </div>
  );
}
