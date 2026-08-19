/* ============================================================================
   INSEGNA — LA CHAT COL RESOLVER

   🔷 «Vorrei poter parlare con il resolver: metti una chat con lui, così gli
      insegno io, e quello che gli insegno resta nella memoria anche se
      resetti.»

   ⚠️ È UNA SCHEDA A PARTE E NON UN PEZZO DI RESOLVER, perché sono due attività
   diverse: là si chiede un prompt per la creatura di adesso, qui si cambia il
   modo in cui verranno risolte TUTTE quelle dopo. Metterle insieme farebbe
   sembrare la seconda un accessorio della prima.

   🔒 La conversazione NON si conserva. Le lezioni sì.
   Un registro di chiacchiere cresce, non si rilegge mai e va salvato per
   sempre; quello che conta è la riga che resta nella memoria — ed è visibile
   qui sotto, una per riga, cancellabile. Se la chat sparisce non hai perso
   niente; se sparisse una lezione avresti perso l'unica cosa che stavi
   costruendo.
   ========================================================================= */

import { useState } from 'react';
import { useApp } from '../state/store';
import { Button, SystemLabel } from '../system/components';
import { useElapsed, waitingText } from './useElapsed';

interface Turno {
  id: string;
  mio: boolean;
  testo: string;
}

export function TeachSection() {
  const token = useApp((s) => s.token);
  const lessons = useApp((s) => s.lessons);
  const teach = useApp((s) => s.teachResolver);
  const forget = useApp((s) => s.forgetLesson);
  const attiva = useApp((s) => s.activeMonName);

  const [bozza, setBozza] = useState('');
  const [turni, setTurni] = useState<Turno[]>([]);
  const [busy, setBusy] = useState(false);
  const [guasto, setGuasto] = useState<string | null>(null);
  const waiting = useElapsed(busy);

  const manda = async () => {
    const testo = bozza.trim();
    if (!testo || busy) return;

    const prima = lessons.length;
    setTurni((t) => [...t, { id: `m${Date.now()}`, mio: true, testo }]);
    setBozza('');
    setBusy(true);
    setGuasto(null);

    const { reply, failure, detail } = await teach(testo);
    setBusy(false);

    if (reply) {
      setTurni((t) => [...t, { id: `r${Date.now()}`, mio: false, testo: reply }]);
    }
    if (failure) setGuasto(detail ?? `chiamata fallita (${failure})`);
    /* 🔒 Se la memoria non è cresciuta si dice, invece di lasciar credere che
       abbia imparato: «ha risposto» e «ha imparato» sono due cose diverse, e
       la seconda è quella per cui esiste questa schermata. */
    if (!failure && useApp.getState().lessons.length === prima) {
      setGuasto('ha risposto, ma non c’era niente di nuovo da tenere');
    }
  };

  return (
    <div className="dev__section">
      <p className="t-meta dev__label">
        INSEGNA AL RESOLVER{' '}
        <SystemLabel tone={lessons.length > 0 ? 'character' : 'default'}>
          {lessons.length === 0 ? 'NIENTE ANCORA' : `${lessons.length} LEZIONI`}
        </SystemLabel>
      </p>

      <p className="t-micro dev__note">
        Non è il .mon: è la parte che decide <em>come</em> sono fatte le
        creature. Digli cosa funziona e cosa no — «gli occhiali tondi mi hanno
        stancato», «le mani grandi rendono sempre». Quello che impara resta
        nella memoria, e ricominciare da capo non lo cancella.
        {attiva && <> Adesso state guardando <strong>{attiva}</strong>.</>}
      </p>

      {/* --- La conversazione, che vive quanto la schermata --- */}
      {turni.length > 0 && (
        <div className="dev__talk">
          {turni.map((t) => (
            <p key={t.id} className={t.mio ? 'dev__talk-mine' : 'dev__talk-his'}>
              {t.testo}
            </p>
          ))}
        </div>
      )}

      {busy && <p className="t-small dev__note">{waitingText('ci sta pensando', waiting)}</p>}
      {guasto && <p className="t-micro dev__note">⚠️ {guasto}</p>}

      <textarea
        className="dev__paste"
        value={bozza}
        onChange={(e) => setBozza(e.target.value)}
        placeholder="Gli occhiali tondi mi hanno stancato…"
        rows={3}
        aria-label="Cosa vuoi insegnargli"
      />
      <Button
        block
        variant="primary"
        loading={busy}
        disabled={!token || bozza.trim().length === 0}
        onClick={() => void manda()}
      >
        DIGLIELO
      </Button>
      {!token && <p className="t-micro dev__note">Serve il segreto: ATTIVA VINZ.MON.</p>}

      {/* --- Quello che ha imparato: l'unica cosa che resta --- */}
      {lessons.length > 0 && (
        <>
          <p className="t-meta dev__label">QUELLO CHE HA IMPARATO</p>
          <ul className="rowlist">
            {lessons.map((l) => (
              <li key={l.id} className="dev__lesson">
                <p className="t-micro">{l.text}</p>
                {/* 🔒 Quello che avevi detto TU, sotto e in italiano. Se la riga
                    sopra è storta, questa è l'unica prova di cosa intendevi. */}
                <p className="t-micro dev__note">
                  gli avevi detto: «{l.said}»
                  {l.about && <> · guardando {l.about}</>}
                </p>
                <Button small onClick={() => forget(l.id)}>
                  DIMENTICALA
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
