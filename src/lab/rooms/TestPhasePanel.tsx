/* ============================================================================
   LA FASE DI PROVA, A SCHERMO

   🔷 «Devo vedere una sezione dove questa cosa è selezionata, e devo poterla
      disabilitare e abilitare altre cose.»

   Questo pannello compare DENTRO i tre passi che la fase blocca — Family,
   Size, Character Design DNA — e non in una schermata a parte. È il posto
   giusto per una ragione precisa: la domanda «perché esce sempre un angelo?»
   nasce guardando il passo della Family, e la risposta deve stare lì.

   ⚠️ E DICE CHE COSA SUCCEDE SE LA SPEGNI, non solo che si può spegnere. Una
   fase di prova non è un difetto: serve a giudicare il disegno tenendo fermi
   i tre assi più grossi. Spegnerla è una scelta legittima e va fatta sapendo
   che da lì in poi due creature diverse potrebbero esserlo perché sono di due
   specie diverse, non perché il generatore ha lavorato meglio.
   ========================================================================= */

import { useState } from 'react';
import {
  FAMILIES,
  DESIGN_DNA,
  TEST_PHASE,
  type TestPhase,
} from '../../engine/generation-config';
import {
  effectiveTestPhase,
  isTestPhaseTuned,
  resetTestPhase,
  setTestPhase,
} from '../../engine/testPhaseTuning';

const SIZES = ['TINY', 'MEDIUM', 'GIANT'] as const;

export function TestPhasePanel({ asse }: { asse: 'family' | 'size' | 'characterDesigner' }) {
  const [, ridisegna] = useState(0);
  const tocca = () => ridisegna((n) => n + 1);
  const fase: TestPhase = effectiveTestPhase(TEST_PHASE);

  const etichetta =
    asse === 'family' ? 'FAMILY' : asse === 'size' ? 'TAGLIA' : 'CHARACTER DESIGNER';

  const opzioni: readonly string[] =
    asse === 'family'
      ? FAMILIES.map((f) => f.id)
      : asse === 'size'
        ? SIZES
        : DESIGN_DNA.map((d) => d.id);

  return (
    <div className="tune">
      <div className="tune__head">
        <b>🔒 FASE DI PROVA · {fase.enabled ? 'ATTIVA' : 'SPENTA'}</b>
        <small>{isTestPhaseTuned() ? 'modificata da te' : 'come nel codice'}</small>
      </div>

      <p className="hint">
        {fase.enabled ? (
          <>
            Tre assi sono <b>fermi</b>: FAMILY = <b>{fase.family}</b>, SIZE = <b>{fase.size}</b>,
            DESIGNER = <b>{fase.characterDesigner}</b>. È per questo che nasce sempre la stessa
            specie. Serve a giudicare il disegno: se ogni creatura cambiasse anche specie, taglia e
            disegnatore, non si capirebbe mai se due forme sono diverse per merito del generatore o
            perché sono due cose diverse.
          </>
        ) : (
          <>
            La fase è spenta: Family, taglia e disegnatore vengono sorteggiati. Due creature
            possono essere diverse perché sono di specie diverse — non perché il generatore abbia
            lavorato meglio.
          </>
        )}
      </p>

      <div className="tune__row">
        <span>FASE DI PROVA</span>
        <button
          type="button"
          className={`tune__toggle ${fase.enabled ? '' : 'tune__toggle--off'}`}
          onClick={() => {
            setTestPhase({ enabled: !fase.enabled });
            tocca();
          }}
        >
          {fase.enabled ? 'ATTIVA' : 'SPENTA'}
        </button>
        <code />
      </div>

      {fase.enabled && (
        <div className="tune__row">
          <span>{etichetta} FERMA SU</span>
          <select
            value={String(fase[asse])}
            aria-label={`valore fermo di ${etichetta}`}
            onChange={(e) => {
              setTestPhase({ [asse]: e.target.value } as Partial<TestPhase>);
              tocca();
            }}
          >
            {opzioni.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <code />
        </div>
      )}

      {isTestPhaseTuned() && (
        <button
          type="button"
          className="btn"
          style={{ marginTop: 8 }}
          onClick={() => {
            resetTestPhase();
            tocca();
          }}
        >
          RIMETTI COME NEL CODICE
        </button>
      )}
    </div>
  );
}
