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

import { useApp, useActiveMon, useIncubation } from '../state/store';
import { IdleMon } from '../system/LiveMon';
import { EggVessel } from '../system/EggVessel';
import { MonName, SpeciesName } from '../system/MonName';
import { displayName } from '../engine/types';
import { haptic } from '../system/haptics';
import { t } from '../i18n/it';

export function SplashScreen({ onEnter }: { onEnter: () => void }) {
  const phase = useApp((s) => s.phase);
  const mon = useActiveMon();
  const inc = useIncubation();

  const incubating = phase === 'incubation';
  if (!incubating && !mon) return null;

  const enter = () => {
    haptic('tick');
    onEnter();
  };

  return (
    <div className="splash">
      {/* Tutto lo spazio va alla creatura: è il motivo per cui la schermata
          esiste. Toccarla entra, perché è la cosa che si tocca per istinto. */}
      <button type="button" className="splash__stage" onClick={enter} aria-label={t.splash.enter}>
        {incubating ? (
          <EggVessel progress={inc.progress} days={inc.day} total={inc.total} size={260} />
        ) : (
          <IdleMon monName={mon!.data.name} alt={displayName(mon!.data.name)} />
        )}
      </button>

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
