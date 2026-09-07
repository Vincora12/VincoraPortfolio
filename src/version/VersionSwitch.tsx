/* ============================================================================
   CAMBIA VERSIONE

   🔒 STA FUORI DALLE DUE APP, NON DENTRO. Montato da `main.tsx` come fratello
   di `<App />`, non come suo figlio: così la versione attuale torna al
   selettore senza che `App.tsx` cambi di una riga, e la barra di navigazione
   di VINZ resta quella che è.

   ⚠️ STA SUL BORDO DESTRO, A METÀ ALTEZZA, E DA CHIUSO È UNA LINGUETTA. La
   prima versione stava in alto a destra e COPRIVA «Nuova chat» della Current:
   un controllo temporaneo che rompe un pulsante vero è un controllo sbagliato.
   Il bordo a metà è l'unico punto libero in tutte e due le versioni — provato,
   non supposto.
   ========================================================================= */

import { useState } from 'react';

import { backToSelector, type VinzVersion } from './entry';
import './version.css';

export function VersionSwitch({ version }: { version: VinzVersion }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        className="vswitch vswitch--tab"
        aria-label="Cambia versione di VINZ.MON"
        onClick={() => setOpen(true)}
      >
        {version === 'v2' ? 'V2' : 'C'}
      </button>
    );
  }

  return (
    <div className="vswitch vswitch--open">
      <button type="button" className="vswitch__go" onClick={backToSelector}>
        CAMBIA VERSIONE
      </button>
      <button
        type="button"
        className="vswitch__hide"
        aria-label="Chiudi"
        onClick={() => setOpen(false)}
      >
        ×
      </button>
    </div>
  );
}
