/* ============================================================================
   00 — INGRESSO (MASTER SPEC §13.1, riscritta in v1.10 §13.7)

   Una schermata sola, con dentro quello che ti stava aspettando: l'uovo che
   respira durante l'incubazione, il .mon che si muove dopo. Niente dati,
   niente barre, niente riassunto della giornata.

   È l'unica superficie del prodotto che non serve a fare qualcosa. Serve a
   stabilire CHI ti stava aspettando prima che tu cominci a leggere numeri —
   e per un'app che dice di essere «companion-first, dashboard-second» (§2)
   è la differenza fra dirlo e farlo.

   🔷 v1.10 — DUE CAMBI, e il secondo corregge una regola che avevo scritto io.

   1. Compare anche durante l'INCUBAZIONE, con l'uovo. Prima esisteva solo
      dopo la nascita, e i primi sette giorni — quelli che decidono se l'app
      viene riaperta — non avevano nessun momento di presenza.

   2. NON entra più da sé dopo qualche secondo. §13.1 lo prevedeva perché la
      schermata non aveva nessuna via d'uscita visibile: era un saluto muto, e
      restarci bloccati sarebbe stato un difetto. Adesso c'è un ingresso
      dichiarato — si entra quando si decide di entrare, e si può restare a
      guardare quanto si vuole. Una schermata che ti butta fuori dopo quattro
      secondi non è un posto dove stare.
   ========================================================================= */

import { useState } from 'react';
import { useApp, useActiveMon, useIncubation } from '../state/store';
import { RotationViewer } from '../system/AssetSlot';
import { EggVessel } from '../system/EggVessel';
import { MonName, SpeciesName } from '../system/MonName';
import { haptic } from '../system/haptics';
import { t } from '../i18n/it';

export function SplashScreen({ onEnter }: { onEnter: () => void }) {
  const phase = useApp((s) => s.phase);
  const mon = useActiveMon();
  const inc = useIncubation();

  /* Il tocco sull'uovo. `pokes` rimonta il componente, e rimontarlo fa
     ripartire l'animazione di salto dall'inizio: è il modo più semplice di
     far succedere una cosa adesso invece che al prossimo ciclo.

     ⚠️ Sta PRIMA del `return null` qui sotto. Uno `useState` dopo un'uscita
     condizionale cambia l'ordine degli hook fra un render e l'altro, e React
     se ne accorge solo a schermo — TypeScript no. */
  const [pokes, setPokes] = useState(0);

  const incubating = phase === 'incubation';
  if (!incubating && !mon) return null;

  const enter = () => {
    haptic('tick');
    onEnter();
  };

  const poke = () => {
    haptic('tick');
    setPokes((n) => n + 1);
  };

  return (
    <div className="splash">
      {/* Tutto lo spazio va alla creatura: è il motivo per cui la schermata
          esiste.

          ⚠️ NON è un pulsante. Lo era, e apriva la chat — ma dentro c'è un
          visore che si trascina per ruotare, e un trascinamento dentro un
          pulsante finisce sempre in un click involontario. Adesso la creatura
          risponde al gesto che le appartiene, e alla chat si va dalla porta. */}
      <div className="splash__stage">
        {incubating ? (
          /* Toccare l'uovo lo fa saltare. Non porta da nessuna parte, ed è il
             punto: un'app viva ha almeno una cosa che risponde per il gusto
             di rispondere. */
          <button
            type="button"
            className="splash__poke"
            onClick={poke}
            aria-label="Tocca l’uovo"
          >
            <EggVessel
              key={pokes}
              progress={inc.progress}
              days={inc.day}
              total={inc.total}
              size={260}
              lively
            />
          </button>
        ) : (
          /* 🔷 v1.10 §13.9 — la rotazione a trascinamento vive QUI, non solo
             sepolta nel profilo. È la schermata dove guardi la creatura: farla
             girare è la cosa che si prova a fare per istinto, e prima non
             rispondeva. Senza sprite resta il ritratto che respira. */
          <RotationViewer monName={mon!.data.name} idleWhenStill />
        )}
      </div>

      <div className="splash__id">
        {incubating ? (
          <>
            <span className="t-display splash__name">{t.incubation.title}</span>
            <span className="t-meta splash__form">
              {inc.day} / {inc.total} {t.incubation.day}
            </span>
          </>
        ) : (
          <>
            <span className="t-display splash__name">
              <MonName name={mon!.data.name} />
            </span>
            <span className="t-meta splash__form">
              <SpeciesName /> · {mon!.data.evolution_state?.label ?? 'BASIC FORM'}
            </span>
          </>
        )}
      </div>

      {/* L'ingresso è dichiarato, non indovinato. È l'unica cosa che questa
          schermata chiede, ed è per questo che può permettersi di essere
          l'unica cosa scritta in fondo. */}
      <button type="button" className="splash__enter" onClick={enter}>
        <span className="t-display">{t.splash.chat}</span>
        <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}
