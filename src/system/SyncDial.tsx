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
   ========================================================================= */

import type { CSSProperties } from 'react';

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
  return (
    <div className="sync-check__dial" style={{ '--sync-fill': `${(Math.min(streak, 30) / 30) * 360}deg` } as CSSProperties}>
      <i aria-hidden="true" />
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
