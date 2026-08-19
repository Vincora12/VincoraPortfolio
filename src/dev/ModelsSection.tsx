/* ============================================================================
   AI / MODELLI — CHI SERVE QUALE LAVORO

   🔷 «La UI deve farmi vedere chiaramente QUALE AI serve QUALE STEP.»
   🔷 «Non creare un cockpit con cinquanta opzioni.»

   Otto righe, una per lavoro. Ogni riga dice come si chiama, chi lo serve
   adesso, cosa costa, e quanto ci ha messo l'ultima volta davvero.

   ⚠️ E NON SI CHIAMA «COMPILER» DA NESSUNA PARTE. I nomi sono quelli del
   lavoro — CHARACTER MASTER, BIO, INSEGNA, VOCE — perché devi poter capire
   cosa stai scegliendo senza sapere com'è fatto dentro.
   ========================================================================= */

import { useEffect, useState } from 'react';
import { useApp } from '../state/store';
import { Button, SystemLabel } from '../system/components';
import { lastRuns, subscribeToRuns, type StepRun } from '../ai/telemetry';
import {
  AI_STEPS,
  AI_STEP_ORDER,
  choicesFor,
  modelForStep,
  type AiStepId,
} from '../../netlify/functions/_shared/routing';

/** Il prezzo di un modello, se il catalogo lo conosce. */
function prezzo(capability: string, model: string): string | null {
  const c = choicesFor(capability as never).find((x) => x.model === model) as
    | { price?: { input: number; output: number }; perImage?: number }
    | undefined;
  if (!c) return null;
  if (typeof c.perImage === 'number') return `$${c.perImage.toFixed(2)} a immagine`;
  if (c.price) return `$${c.price.input} / $${c.price.output} per milione`;
  return null;
}

export function ModelsSection() {
  const stepModels = useApp((s) => s.stepModels);
  const setStepModel = useApp((s) => s.setStepModel);
  const cheap = useApp((s) => s.useCheapPreset);
  const quality = useApp((s) => s.useQualityPreset);

  /* La telemetria vive fuori da zustand: ci si abbona come al contatore
     della spesa. */
  const [runs, setRuns] = useState<[AiStepId, StepRun][]>(lastRuns());
  useEffect(() => subscribeToRuns(() => setRuns(lastRuns())), []);
  const runOf = (id: AiStepId) => runs.find(([k]) => k === id)?.[1] ?? null;

  return (
    <div className="dev__section">
      <p className="t-meta dev__label">AI / MODELLI</p>
      <p className="t-micro dev__note">
        Ogni lavoro sceglie il suo. Cambiare una riga non cambia le altre — era
        il difetto di prima, quando quattro lavori diversi condividevano un
        menu solo.
      </p>

      {/* ⚠️ IL PRESET ECONOMICO NON TOCCA IL CHARACTER MASTER, ed è dichiarato
          sul pulsante invece che scoperto dopo. «Non voglio un pulsante
          economico che mi peggiora i character.» */}
      <div className="dev__grid">
        <Button small onClick={quality}>
          QUALITÀ (I PREDEFINITI)
        </Button>
        <Button small onClick={cheap}>
          ECONOMICO · MASTER RESTA SOL
        </Button>
      </div>

      <ul className="rowlist">
        {AI_STEP_ORDER.map((id) => {
          const step = AI_STEPS[id];
          const attivo = modelForStep(id, stepModels[id]);
          const pool = choicesFor(step.capability);
          const run = runOf(id);
          const costo = prezzo(step.capability, attivo);

          return (
            <li key={id} className="dev__step">
              <p className="t-meta">
                {step.label}{' '}
                {step.qualityCritical && <SystemLabel tone="character">QUALITÀ</SystemLabel>}
                {step.background && <SystemLabel>IN BACKGROUND</SystemLabel>}
              </p>
              <p className="t-micro dev__note">{step.it}</p>

              {/* 🔒 Un elenco di uno solo NON diventa un menu finto: dove non
                  c'è scelta si dice il modello e basta. */}
              {pool.length > 1 ? (
                <div className="dev__grid">
                  {pool.map((c) => (
                    <Button
                      key={c.model}
                      small
                      variant={c.model === attivo ? 'character' : 'secondary'}
                      onClick={() =>
                        setStepModel(id, c.model === step.fallback ? null : c.model)
                      }
                    >
                      {c.label}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="t-micro dev__note">{attivo} — non ci sono alternative.</p>
              )}

              <p className="t-micro dev__note">
                {costo ?? 'prezzo non a catalogo'}
                {stepModels[id] ? ' · scelto da te' : ' · predefinito'}
                {/* ⚠️ MISURATO, non stimato: è l'ultima chiamata vera. */}
                {run && (
                  <>
                    {' · ultima: '}
                    <strong>{(run.ms / 1000).toFixed(1)}s</strong>
                    {' · '}
                    {run.model}
                    {run.background ? ' · in background' : ''}
                    {!run.ok && ` · non riuscita${run.why ? ` (${run.why})` : ''}`}
                  </>
                )}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
