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
  recommendedModel,
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

/* ============================================================================
   🔴 DOVE VANNO I SOLDI DAVVERO — e come sceglie il pulsante «CONSIGLIATO».

   «Per ogni sezione tu inserisci nel quale mi consigli di usare dato il costo
   basso e la gestione dei dati. Automaticamente selezionano quella.»

   Prima il pulsante economico si limitava a saltare gli step `qualityCritical`
   e mettere Luna dappertutto — ed era già il predefinito, quindi premerlo su
   una partita pulita non cambiava NIENTE. Ora chiama `recommendedModel` (in
   `routing.ts`) per ogni step: gli step `qualityCritical` (CHARACTER MASTER,
   VOCE, IMMAGINI) restano sempre dove sono — lì non si risparmia, per scelta
   esplicita — gli step che portano dati personali dell'utente scelgono il più
   economico FRA QUELLI CHE NON SI ALLENANO SUI TUOI DATI senza consenso
   (oggi esclude solo Moonshot/Kimi), gli altri scelgono il più economico del
   catalogo senza altri vincoli. La riga sotto ogni step, qui sotto, dice il
   perché — costo o dati — con le stesse parole che usa il motore.

   La riga qui sotto dice invece quanto pesa ciascuna cosa su una generazione
   intera, così la scelta si fa guardando i numeri invece che i nomi.
   ========================================================================= */

/* Quattro immagini per creatura — master, toy, doodle, sticker. Listino
   agosto 2026, a 1024: low ~$0,006 · medium ~$0,053 · high ~$0,211.

   🔶 QUI C'ERA SCRITTO «SEI», ed era sbagliato: i tre asset storici
   (ritratto, idle, hero) sono in `LEGACY_ASSET_TYPES` e la pipeline non li
   genera più. Ogni conto fatto su sei era gonfiato di un terzo. */
const COSTO_IMMAGINI = {
  /* Tutte e quattro in bozza: l'interruttore qui sotto. */
  bozza: 4 * 0.006,
  /* Come è OGGI: doodle e sticker li dichiara `assets.ts` in bozza, master e
     toy restano pieni. È il predefinito, non un risparmio da accendere. */
  normale: 2 * 0.053 + 2 * 0.006,
  /* Come era PRIMA che la qualità venisse dichiarata per asset. */
  primaDiTutto: 4 * 0.053,
};

export function ModelsSection() {
  const stepModels = useApp((s) => s.stepModels);
  const setStepModel = useApp((s) => s.setStepModel);
  const cheap = useApp((s) => s.useCheapPreset);
  const quality = useApp((s) => s.useQualityPreset);
  const dev = useApp((s) => s.dev);
  const setDev = useApp((s) => s.setDev);

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
          CONSIGLIATO · COSTO + DATI
        </Button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          🔷 LA LEVA VERA, e sta sopra l'elenco perché è quella che conta.

          Le quattro immagini sono la parte più grossa del costo di una
          generazione. Il menu dei modelli qui sotto muove il resto — utile,
          ma non è lì che si risparmia. */}
      <p className="t-meta dev__label">IMMAGINI — LA VOCE PIÙ GROSSA DI UNA GENERAZIONE</p>
      <label className="dev__check">
        <input
          type="checkbox"
          checked={dev.draftImages}
          onChange={(e) => setDev({ draftImages: e.target.checked })}
        />
        IMMAGINI IN BOZZA (quality: low)
      </label>
      <p className="t-micro dev__note">
        Quattro immagini per creatura. Adesso ne costano{' '}
        <strong>${COSTO_IMMAGINI.normale.toFixed(3)}</strong>: doodle e sticker
        li dichiara già `assets.ts` in bozza — si vedono piccoli — e master e
        toy restano pieni. Prima erano ${COSTO_IMMAGINI.primaDiTutto.toFixed(3)}.
      </p>
      <p className="t-micro dev__note">
        Con l’interruttore acceso scendono tutte e quattro a{' '}
        <strong>${COSTO_IMMAGINI.bozza.toFixed(3)}</strong>. Dieci rigenerazioni
        di prova: ${(COSTO_IMMAGINI.bozza * 10).toFixed(2)} contro{' '}
        ${(COSTO_IMMAGINI.normale * 10).toFixed(2)}.
      </p>
      <p className="t-micro dev__note">
        {dev.draftImages
          ? 'ACCESA: le prossime immagini escono in bozza. Per la creatura che vuoi TENERE, spegnila e rigenera.'
          : 'SPENTA: qualità piena, come in produzione. Accendila mentre provi, non mentre tieni.'}
      </p>

      <ul className="rowlist">
        {AI_STEP_ORDER.map((id) => {
          const step = AI_STEPS[id];
          const attivo = modelForStep(id, stepModels[id]);
          const pool = choicesFor(step.capability);
          const run = runOf(id);
          const costo = prezzo(step.capability, attivo);
          const consiglio = recommendedModel(id);

          return (
            <li key={id} className="dev__step">
              <p className="t-meta">
                {step.label}{' '}
                {step.qualityCritical && <SystemLabel tone="character">QUALITÀ</SystemLabel>}
                {step.background && <SystemLabel>IN BACKGROUND</SystemLabel>}
              </p>
              <p className="t-micro dev__note">{step.it}</p>
              {/* 🔷 Il consiglio è sempre visibile, anche quando coincide con
                  l'attivo — «perché» è la parte che il pulsante da solo non
                  dice: qui distingue costo da dati. */}
              <p className="t-micro dev__note">
                <SystemLabel tone={step.qualityCritical ? undefined : 'character'}>
                  CONSIGLIO
                </SystemLabel>{' '}
                <strong>{consiglio.model}</strong> — {consiglio.why}
              </p>
              {/* 🔷 Uno step con due modelli deve DIRLO qui, o il menu qui
                  sotto racconta metà della verità: mostrerebbe un modello
                  solo mentre a rispondere sono due. */}
              {step.everyday && !stepModels[id] && (
                <p className="t-micro dev__note">
                  <SystemLabel>A DUE VELOCITÀ</SystemLabel> tutti i giorni{' '}
                  <strong>{step.everyday}</strong>; sui messaggi che lo meritano —
                  una domanda, o più di centoquaranta caratteri —{' '}
                  <strong>{step.fallback}</strong>. Circa un messaggio su cinque si
                  alza. Scegliendo un modello qui sotto, quello vale per tutti e due.
                </p>
              )}

              {/* 🔒 Un elenco di uno solo NON diventa un menu finto: dove non
                  c'è scelta si dice il modello e basta.

                  🔷 «Quando clicco le altre, mettimi anche una media di
                  costo... però ragiona meglio, aiutami nella scelta.» Un
                  pulsante con solo il nome non aiuta a scegliere: qui sotto
                  ogni alternativa porta il SUO prezzo e la riga `it` che il
                  catalogo (routing.ts) già scrive per quel modello — non un
                  numero e basta, il perché che sta dietro. */}
              {pool.length > 1 ? (
                <div className="dev__modelcards">
                  {pool.map((c) => {
                    const rich = c as {
                      it?: string;
                      price?: { input: number; output: number };
                      perImage?: number;
                    };
                    const isActive = c.model === attivo;
                    const isRecommended = c.model === consiglio.model && !isActive;
                    const prezzoRiga =
                      typeof rich.perImage === 'number'
                        ? `$${rich.perImage.toFixed(2)} a immagine`
                        : rich.price
                          ? `$${rich.price.input} / $${rich.price.output} per milione — ${
                              rich.price.output >= 20
                                ? 'livello grosso'
                                : rich.price.output >= 8
                                  ? 'livello di mezzo'
                                  : 'livello piccolo'
                            }`
                          : 'prezzo non a catalogo';
                    return (
                      <button
                        key={c.model}
                        type="button"
                        className={`dev__modelcard${isActive ? ' dev__modelcard--active' : ''}`}
                        onClick={() =>
                          setStepModel(id, c.model === step.fallback ? null : c.model)
                        }
                      >
                        <p className="t-meta">
                          {c.label}{' '}
                          {isActive && <SystemLabel tone="character">ATTIVO</SystemLabel>}
                          {isRecommended && <SystemLabel>CONSIGLIATO</SystemLabel>}
                        </p>
                        <p className="t-micro dev__note">{prezzoRiga}</p>
                        {rich.it && <p className="t-micro dev__note">{rich.it}</p>}
                      </button>
                    );
                  })}
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
