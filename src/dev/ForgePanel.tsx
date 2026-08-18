/* ============================================================================
   FAI TUTTO (§8.1 · §10 · §22.4)

   🔷 «Adesso mi aspetto che tutto vada con un solo click.»

   I pezzi c'erano tutti e nessuno li chiamava in fila. Peggio: le immagini
   partivano da sole leggendo il prompt CONCATENATO, perché nessuno aveva
   compilato quello buono — cioè il compilatore esisteva e le immagini non lo
   usavano quasi mai.

   🔒 IL PREZZO SI DICE PRIMA. È l'unico pulsante dell'app che, premuto, spende
   quasi un euro. Un pulsante che scopre il conto dopo non è un pulsante, è una
   trappola — e il tetto mensile difende dal disastro, non dalla sorpresa.
   ========================================================================= */

import { useState } from 'react';
import { useActiveMon, useApp } from '../state/store';
import { Button, SystemLabel } from '../system/components';

export function ForgePanel() {
  const mon = useActiveMon();
  const token = useApp((s) => s.token);
  const forge = useApp((s) => s.forgeEverything);
  const progress = useApp((s) => s.forgeProgress);
  const [problems, setProblems] = useState<string[] | null>(null);

  if (!mon) return null;

  const running = progress !== null;

  return (
    <div className="dev__section">
      <p className="t-meta dev__label">FAI TUTTO</p>
      <p className="t-micro dev__note">
        La bio, i sei prompt riscritti dall’AI e le sei immagini, in fila. Il
        master per primo: è quello che gli altri prompt citano come riferimento
        di consistenza, e senza di lui uscirebbero sei creature diverse.
      </p>
      {/* 🔒 Il conto, prima. */}
      <p className="t-micro dev__note">
        Costa circa <strong>0,75 €</strong> a creatura — sei immagini (~$0,24),
        sei prompt (~$0,60), la bio (~$0,02). Il tetto mensile resta quello di
        sempre: se lo tocca, si ferma e te lo dice.
      </p>

      <Button
        block
        variant="primary"
        small
        disabled={running || !token}
        onClick={() => {
          setProblems(null);
          void forge(mon.data.name).then(setProblems);
        }}
      >
        {running ? 'IN CORSO…' : 'FAI TUTTO'}
      </Button>

      {!token && (
        <p className="t-micro dev__note">Serve il segreto: ATTIVA VINZ.MON.</p>
      )}

      {progress && (
        <p className="t-small dev__note">
          {progress.done}/{progress.total} — {progress.label}
        </p>
      )}

      {/* Vuoto = è andato tutto. Va detto, o non si distingue da «non ha fatto
          niente». */}
      {problems !== null && problems.length === 0 && (
        <p className="t-small">
          <SystemLabel tone="character">FATTO</SystemLabel> bio, prompt e
          immagini ci sono tutti.
        </p>
      )}
      {problems !== null && problems.length > 0 && (
        <>
          <p className="t-small">
            <SystemLabel tone="alert">NON TUTTO</SystemLabel> il resto è a posto.
          </p>
          <ul className="rowlist">
            {problems.map((p, i) => (
              <li key={i} className="t-micro dev__note">
                {p}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
