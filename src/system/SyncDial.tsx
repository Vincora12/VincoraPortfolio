/* ============================================================================
   IL QUADRANTE SYNC — condiviso fra la pagina vera e DEV

   🔷 «Solo nel DEV in alto mi fai vedere la barra.» Prima esisteva solo dentro
   `TodayChecklistScreen`: per guardarla mentre si prova da DEV bisognava
   uscire, cambiare tab, e tornare indietro per premere di nuovo «+1 GIORNO».

   🔒 STESSO COMPONENTE, NON UNA COPIA. Se domani cambia come si calcola lo
   streak o come appare un traguardo raggiunto, cambia in un posto solo — la
   pagina vera e DEV non possono disallinearsi perché non c'è una seconda
   versione da dimenticare di aggiornare.

   In DEV i tre traguardi sono SOLO mostrati (nessun `onClick`): premerli per
   davvero resta un gesto della pagina vera, non un tasto rapido nascosto in
   un pannello di sviluppo.

   🔷 «La notifica di "MON IN CREAZIONE" mi piaceva» — quella è `GenerationDial`
   (system/GenerationDial.tsx): dodici trattini che si accendono uno alla
   volta, non una linea che cresce. Il quadrante SYNC adesso usa lo stesso
   principio, portato a 30 — un trattino per ogni giorno dei 30 che contano
   per il desiderio — invece del conic-gradient a fetta che aveva prima.
   Stessa idea del progetto, non un'invenzione nuova.
   ========================================================================= */

import type { CSSProperties } from 'react';

const DIAL_TICKS = 30;

export function SyncDial({
  streak,
  evolutionReady,
  megaReady,
  wishReady,
  onEvolve,
  onMega,
  onWish,
}: {
  streak: number;
  evolutionReady: boolean;
  megaReady: boolean;
  wishReady: boolean;
  /** Omessi in DEV: il quadrante diventa uno stato da leggere, non un comando. */
  onEvolve?: () => void;
  onMega?: () => void;
  onWish?: () => void;
}) {
  const done = Math.min(streak, DIAL_TICKS);
  return (
    <div className="sync-check__dial">
      <div className="sync-check__ticks" aria-hidden="true">
        {Array.from({ length: DIAL_TICKS }, (_, index) => (
          <i
            key={index}
            className={index < done ? 'is-done' : ''}
            style={{ '--dial-index': index } as CSSProperties}
          />
        ))}
      </div>
      <strong>{streak}</strong>
      <SyncCheckpoint value="2" ready={evolutionReady} className="sync-checkpoint--2" label="Evolvi" onClick={onEvolve} />
      <SyncCheckpoint value="7" ready={megaReady} className="sync-checkpoint--7" label="Megaevolvi" onClick={onMega} />
      <SyncCheckpoint value="30" ready={wishReady} className="sync-checkpoint--30" label="Esprimi un desiderio" onClick={onWish} />
    </div>
  );
}

function SyncCheckpoint({
  value,
  ready,
  className,
  label,
  onClick,
}: {
  value: string;
  ready: boolean;
  className: string;
  label: string;
  onClick?: () => void;
}) {
  if (!onClick) {
    return (
      <span className={`sync-checkpoint ${className}`} data-ready={ready} aria-label={`${label} al giorno ${value}`}>
        {value}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={`sync-checkpoint ${className}`}
      data-ready={ready}
      onClick={onClick}
      disabled={!ready}
      aria-label={`${label} al giorno ${value}`}
    >
      {value}
    </button>
  );
}
