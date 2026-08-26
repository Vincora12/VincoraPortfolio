/* ============================================================================
   FIRST SYNC — L'INGRESSO
   (VINZMON_COMPLETE_NARRATIVE_SYSTEM_FOR_CLAUDE v4 §3, §3.1)

   🔷 «Deve sembrare un'iniziazione / First Sync, non un quiz da BuzzFeed.»

   ════════════════════════════════════════════════════════════════════════════
   COSA RENDE UN RITO DIVERSO DA UN QUIZ, in pratica e non a parole:

     • una domanda per volta, a tutto schermo — non una lista da scorrere
     • due strade concrete, non «quanto sei d'accordo da 1 a 5»
     • nessuna barra di avanzamento in percentuale: tacche, come il Signal Scan
     • nessuna anteprima di cosa stai diventando
     • alla fine nessun punteggio, nessuna percentuale, nessun verdetto

   🔒 E SOPRATTUTTO: il risultato non viene mai presentato come «ecco chi sei».
   §3.1 lo vieta in due righe separate — niente percentuali, e mai dire che un
   archetipo è la vera personalità dell'utente. Qui il tipo si vede una volta
   sola, come punto di partenza dichiarato, e la frase che lo accompagna dice
   che è una lente e non una diagnosi.
   ════════════════════════════════════════════════════════════════════════════
   ========================================================================= */

import { useState } from 'react';
import { useApp, useFirstSync } from '../state/store';
import { Button, ScreenHead, SystemLabel } from '../system/components';
import { SYNC_QUESTIONS, typeDef } from '../engine/firstSync';
import { haptic } from '../system/haptics';

export function FirstSyncScreen() {
  const { answers, complete, result } = useFirstSync();
  const answerSync = useApp((s) => s.answerSync);
  const lockFirstSync = useApp((s) => s.lockFirstSync);
  const leaveFirstSync = useApp((s) => s.leaveFirstSync);

  const [step, setStep] = useState(0);

  const q = SYNC_QUESTIONS[step]!;
  const chosen = answers[q.index];
  const last = step === SYNC_QUESTIONS.length - 1;

  const choose = (id: string) => {
    haptic('tick');
    answerSync(q.index, id);
    /* Avanza da sé come il Signal Scan: una domanda per schermata vuol dire
       che il passaggio non deve costare un secondo tocco. Sull'ultima resta
       ferma, perché lì il gesto dopo è chiudere il sync. */
    if (!last) window.setTimeout(() => setStep((v) => v + 1), 180);
  };

  /* --- La chiusura: il tipo, una volta sola, senza numeri ---

     🔒 LA CONDIZIONE È `result`, NON UNO STATO LOCALE. Il tipo esiste solo
     dopo che `lockFirstSync` l'ha calcolato e salvato: legarci la schermata
     vuol dire che non può comparire una versione vuota di questo momento,
     nemmeno per un fotogramma. */
  if (result) {
    const def = typeDef(result.type);
    return (
      <div className="screen screen--ink firstsync firstsync--result">
        <div className="screen__body firstsync__resultbody">
          <SystemLabel tone="character">FIRST SYNC COMPLETO</SystemLabel>
          <h1 className="t-display firstsync__type">{result.type}</h1>
          <p className="t-title firstsync__typelabel">{def.label}</p>
          <p className="t-body firstsync__tendency">{def.tendency}</p>
          {/* 🔒 La riga che §3 e §15 chiedono entrambi. Non è una nota legale
              in fondo: è la cosa più importante di questa schermata, e sta
              dove si legge. */}
          <p className="t-small firstsync__disclaimer">
            Non è una diagnosi e non è una verità su di te. È il punto da cui
            VINZ.MON comincia a immaginare la tua prima creatura — e da cui puoi
            allontanarti quando vuoi.
          </p>
        </div>
        <footer className="screen__foot">
          <Button variant="primary" block haptics="impact" onClick={leaveFirstSync}>
            CONTINUA
          </Button>
        </footer>
      </div>
    );
  }

  return (
    <div className="screen screen--ink firstsync">
      <ScreenHead title="FIRST SYNC" sub="PRIMA CHE COMINCI" />

      <div className="screen__body firstsync__body">
        <div className="firstsync__index">
          <span className="t-meta">
            {String(q.index).padStart(2, '0')} / {SYNC_QUESTIONS.length}
          </span>
          {/* Tacche, non percentuale: dice a che punto sei, non quanto manca. */}
          <span className="firstsync__ticks" aria-hidden="true">
            {SYNC_QUESTIONS.map((other) => (
              <span
                key={other.index}
                className={`firstsync__tick ${answers[other.index] ? 'firstsync__tick--done' : ''} ${
                  other.index === q.index ? 'firstsync__tick--here' : ''
                }`}
              />
            ))}
          </span>
        </div>

        <h2 className="t-display firstsync__question">{q.question}</h2>

        <div className="firstsync__answers">
          {q.answers.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`firstsync__answer ${chosen === a.id ? 'firstsync__answer--on' : ''}`}
              aria-pressed={chosen === a.id}
              onClick={() => choose(a.id)}
            >
              <span className="firstsync__answertext">{a.label}</span>
              {/* Lo stato non è solo colore (§17). */}
              <span className="firstsync__mark" aria-hidden="true">
                {chosen === a.id ? '■' : '□'}
              </span>
            </button>
          ))}
        </div>
      </div>

      <footer className="screen__foot screen__foot--stack">
        {last && complete ? (
          <Button variant="primary" block haptics="impact" onClick={lockFirstSync}>
            CHIUDI IL SYNC
          </Button>
        ) : (
          <Button
            variant="primary"
            block
            disabled={!chosen}
            onClick={() => setStep((v) => Math.min(SYNC_QUESTIONS.length - 1, v + 1))}
          >
            {chosen ? 'AVANTI' : 'SCEGLI UNA STRADA'}
          </Button>
        )}

        <div className="firstsync__foot">
          <Button variant="ghost" small disabled={step === 0} onClick={() => setStep((v) => Math.max(0, v - 1))}>
            INDIETRO
          </Button>
          <p className="t-micro firstsync__note">
            NESSUNA RISPOSTA È MIGLIORE DI UN’ALTRA. PUOI TORNARE INDIETRO FINO ALLA FINE.
          </p>
        </div>
      </footer>
    </div>
  );
}
