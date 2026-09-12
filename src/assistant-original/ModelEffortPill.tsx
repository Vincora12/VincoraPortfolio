/* ============================================================================
   LA PILLOLA MODELLO + IMPEGNO — al posto dei topic in alto

   🔷 «Togli i topic in alto, tanto non mi servono, ma metti la possibilità
   con la stessa grandezza di scegliere anche dentro la chat l'intelligenza
   artificiale che voglio usare... e anche il tipo di impegno.»

   Stessa grandezza di `TopicChips` apposta (`.vinz-model-pill > button`
   ricalca `.vinz-topic-chips > button`): un indice minuscolo, non un
   cockpit. Il catalogo è lo stesso vero di LAB → SYSTEM → AI (`VOICE_CHOICES`
   in `routing.ts`), non un elenco inventato qui — un modello aggiunto o
   tolto lì compare/sparisce anche qui da solo.

   🔒 UNA SOLA FONTE DI VERITÀ. Questa pillola non registra un suo
   `modelContext`: legge e scrive lo stesso `modelChoice` che
   `useConversationOptions` già persiste su `custom.model`/`custom.effort` e
   già registra una volta sola. Due registrazioni per la stessa cosa erano
   esattamente il difetto già trovato («la scelta non torna fra LAB e la
   chat») — non lo si ripete qui. */

import { useEffect, useRef, useState, type FC } from 'react';
import { VOICE_CHOICES, ROUTING } from '../../netlify/functions/_shared/routing';
import { useApp } from '../state/store';

export interface ModelChoice {
  model: string;
  effort: string;
  setModel: (model: string) => void;
  setEffort: (effort: string) => void;
}

const MODEL_OPTIONS: { id: string; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  ...VOICE_CHOICES.map((c) => ({ id: c.model, label: c.label })),
];

/* «piccolo, medio, forte, alto» → tre livelli veri: sono gli unici che
   l'endpoint accetta (`effort?: 'none' | 'low' | 'medium' | 'high'` in
   ai.ts) — "none" resta implicito (nessuna preferenza), non un quarto
   bottone da spiegare. */
const EFFORT_OPTIONS: { id: string; label: string }[] = [
  { id: '', label: 'Auto' },
  { id: 'low', label: 'Basso' },
  { id: 'medium', label: 'Medio' },
  { id: 'high', label: 'Alto' },
];

/* «Claude Opus 5» → «Opus 5»: sulla pillola conta stare piccoli, il nome
   completo resta nel menu aperto. */
function shortLabel(label: string): string {
  return label.replace(/^GPT-5\.6 /, '').replace(/^Claude /, '');
}

export const ModelEffortPill: FC<{ choice: ModelChoice }> = ({ choice }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  /* 🔷 «Se in LAB ho messo Sol, qui deve esserci scritto Sol — non "Auto ·
     Sol". "Auto" vuol dire "come da LAB", non mi serve rileggerlo ogni
     volta.» Il valore sotto resta "auto" (segue la preferenza generale, si
     sposta da solo se la cambi in LAB), ma quello che si VEDE è sempre e
     solo il modello vero a cui corrisponde adesso — mai la parola "auto"
     accanto. */
  const globalVoiceModel = useApp((s) => s.stepModels.voice) ?? ROUTING['character-voice'].model;
  const activeModel = MODEL_OPTIONS.find((m) => m.id === choice.model) ?? MODEL_OPTIONS[0]!;
  const activeEffort = EFFORT_OPTIONS.find((e) => e.id === choice.effort);
  const resolvedLabel = activeModel.id === 'auto'
    ? shortLabel(MODEL_OPTIONS.find((m) => m.id === globalVoiceModel)?.label ?? globalVoiceModel)
    : shortLabel(activeModel.label);
  const label = `${resolvedLabel}${activeEffort && activeEffort.id ? ` · ${activeEffort.label}` : ''}`;

  return (
    <div className="vinz-model-pill" ref={rootRef}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="true">
        <span>{label}</span>
      </button>
      {open && (
        <div className="vinz-model-pill__menu" role="menu" aria-label="Modello e impegno">
          <p className="vinz-model-pill__heading">MODELLO</p>
          <div className="vinz-model-pill__options">
            {MODEL_OPTIONS.map((m) => (
              <button
                key={m.id}
                type="button"
                aria-current={m.id === activeModel.id || undefined}
                onClick={() => choice.setModel(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <p className="vinz-model-pill__heading">IMPEGNO</p>
          <div className="vinz-model-pill__options">
            {EFFORT_OPTIONS.map((e) => (
              <button
                key={e.id}
                type="button"
                aria-current={e.id === choice.effort || undefined}
                onClick={() => choice.setEffort(e.id)}
              >
                {e.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
