/* ============================================================================
   00 — INGRESSO (MASTER SPEC v1.9 §13.1)

   Una schermata sola, con dentro il .mon che respira. Niente dati, niente
   barre, niente riassunto della giornata: **solo lui.**

   È l'unica superficie del prodotto che non serve a fare qualcosa. Serve a
   stabilire chi ti stava aspettando prima che tu cominci a leggere numeri —
   e per un'app che dice di essere «companion-first, dashboard-second» (§2)
   è la differenza fra dirlo e farlo.

   Compare a ogni apertura, non una volta sola: il punto non è l'onboarding,
   è il saluto. Si passa oltre al primo tocco, ovunque si tocchi, e chi non
   tocca entra da sé dopo qualche secondo — nessuno deve restare bloccato
   davanti a una schermata che non chiede niente.
   ========================================================================= */

import { useEffect } from 'react';
import { useActiveMon } from '../state/store';
import { IdleMon } from '../system/LiveMon';
import { MonName, SpeciesName } from '../system/MonName';
import { displayName } from '../engine/types';
import { haptic } from '../system/haptics';
import { t } from '../i18n/it';

/** Quanto resta da sé prima di entrare. Abbastanza per un respiro intero. */
const AUTO_ENTER_MS = 4200;

export function SplashScreen({ onEnter }: { onEnter: () => void }) {
  const mon = useActiveMon();

  useEffect(() => {
    const id = window.setTimeout(onEnter, AUTO_ENTER_MS);
    return () => window.clearTimeout(id);
  }, [onEnter]);

  if (!mon) return null;
  const short = displayName(mon.data.name);

  return (
    <button
      type="button"
      className="splash"
      onClick={() => {
        haptic('tick');
        onEnter();
      }}
      aria-label={t.splash.enter}
    >
      <span className="splash__stage">
        <IdleMon monName={mon.data.name} alt={short} />
      </span>

      <span className="splash__id">
        <span className="t-display splash__name">
          <MonName name={mon.data.name} />
        </span>
        <span className="t-meta splash__form">
          <SpeciesName /> · {mon.data.evolution_state?.label ?? 'BASIC FORM'}
        </span>
      </span>

      <span className="t-micro splash__hint">{t.splash.enter}</span>
    </button>
  );
}
