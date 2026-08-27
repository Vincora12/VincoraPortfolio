/* ============================================================================
   LE TRE INTERPRETAZIONI
   (VINZMON_COMPLETE_NARRATIVE_SYSTEM_FOR_CLAUDE v4 §4)

   🔷 «Alla fine del First Sync, VINZ.MON genera tre possibili interpretazioni
   dello stesso stato iniziale. L'utente non vede i design finali.»

   ════════════════════════════════════════════════════════════════════════════
   COSA SI VEDE, E PERCHÉ SOLO QUELLO.

   §4 elenca cosa NON si può mostrare — faccia, sagoma, arte finale, vestiti,
   statistiche complete — e cosa si può: «limited information such as Family +
   Affinity». Due etichette.

   ⚠️ NON È AVARIZIA DI INTERFACCIA, È LA CONDIZIONE PERCHÉ LA SCELTA ESISTA.
   Con l'immagine davanti non stai scegliendo un'interpretazione di te: stai
   scegliendo il disegno che ti piace di più, e i tre semi diventano tre
   prodotti in vetrina. Con due parole scegli una direzione — che è la cosa che
   §12 della MASTER SPEC protegge da sempre («never ask the user to choose
   Family» vale sul MECCANISMO, e qui la Family la vedi ma non la puoi
   ottimizzare: sono tre, escono da te, e non sai cosa c'è dietro).

   🔒 LE DUE SCARTATE NON ESISTONO PIÙ. «The other two are possibilities that
   never materialized; they do not enter Dex.» Lo store le cancella al momento
   della scelta: non sono salvate, non hanno un nodo, non si possono recuperare.
   ════════════════════════════════════════════════════════════════════════════
   ========================================================================= */

import { useState } from 'react';
import { useApp } from '../state/store';
import { Button, SystemLabel } from '../system/components';
import { haptic } from '../system/haptics';
import { EggVessel } from '../system/EggVessel';

export function EggChoiceScreen() {
  const eggs = useApp((s) => s.eggs);
  const chooseEgg = useApp((s) => s.chooseEgg);
  const [picked, setPicked] = useState<number | null>(null);

  if (eggs.length === 0) return null;

  const confirm = () => {
    if (picked === null) return;
    haptic('impact');
    chooseEgg(picked);
  };

  return (
    <div className="screen screen--ink eggchoice">
      <header className="eggchoice__head">
        <SystemLabel tone="character">FIRST SYNC COMPLETO</SystemLabel>
        <h1 className="t-display eggchoice__title">TRE LETTURE</h1>
        <p className="t-small eggchoice__sub">
          Lo stesso segnale, interpretato in tre modi. Non vedrai cosa c’è
          dentro prima di sceglierne uno — e le altre due non esisteranno mai.
        </p>
      </header>

      <div className="eggchoice__grid">
        {eggs.map((egg, i) => {
          const on = picked === i;
          return (
            <button
              key={egg.data.name}
              type="button"
              className={`eggchoice__egg ${on ? 'eggchoice__egg--on' : ''}`}
              aria-pressed={on}
              onClick={() => {
                haptic('tick');
                setPicked(i);
              }}
            >
              <span className="t-meta eggchoice__slot">[ UOVO {String(i + 1).padStart(2, '0')} ]</span>
              {/* 🔷 «Un vero uovo dove si percepiscono i colori che saranno
                  del mon.» Il guscio resta lo stesso di sempre (§4 vieta
                  sagoma e arte finale) — solo la massa dentro prende il
                  colore di questo seme, non la sua forma. */}
              <span
                className="eggchoice__vessel"
                aria-hidden="true"
                style={{ color: egg.data.palette_dna.accent }}
              >
                <EggVessel days={0} total={7} progress={0.55} size={56} lively />
              </span>
              <span className="eggchoice__facts">
                <span className="t-meta eggchoice__fact">{egg.data.family}</span>
                <span className="t-micro eggchoice__fact eggchoice__fact--sub">{egg.data.affinity}</span>
              </span>
              <span className="eggchoice__mark" aria-hidden="true">
                {on ? '■' : '□'}
              </span>
            </button>
          );
        })}
      </div>

      <footer className="screen__foot screen__foot--stack">
        <Button variant="primary" block disabled={picked === null} haptics="impact" onClick={confirm}>
          {picked === null ? 'SCEGLI UNA LETTURA' : 'APRI QUESTA'}
        </Button>
        <p className="t-micro eggchoice__note">
          NON SI TORNA INDIETRO. LE ALTRE DUE RESTANO POSSIBILITÀ CHE NON SI SONO
          MATERIALIZZATE.
        </p>
      </footer>
    </div>
  );
}
