/* ============================================================================
   MON CORE — execution mode selector: [AUTO] [ANSWER] [ACTION] [WORK]

   Not decoration: the value is read by `createNetlifyChatModel` and passed to
   `decideTurn()` (src/mon-core/turnDecision.ts), which validates it. A WORK
   request outside a Project (or in Vinz.World) is shown as unavailable here
   and, if it still arrives, recorded as rejected while AUTO decides.
   Same pill/menu styles as `ModelEffortPill`, same place in the context bar.
   ========================================================================= */
import { useEffect, useRef, useState, type FC } from 'react';
import { setModeRequest, useModeRequest } from '@/mon-core/modeStore';
import type { ModeRequest } from '@/mon-core/turnDecision';

const OPTIONS: { id: ModeRequest; label: string; hint: string }[] = [
  { id: 'AUTO', label: 'AUTO', hint: 'MON CORE sceglie ogni volta' },
  { id: 'ANSWER', label: 'ANSWER', hint: 'Solo risposta, nessuno strumento' },
  { id: 'ACTION', label: 'ACTION', hint: 'Strumenti VINZ, pochi passaggi' },
  { id: 'WORK', label: 'WORK', hint: 'Lavoro in più passaggi con CEREBRO' },
];

export const ModePill: FC<{ workAvailable: boolean }> = ({ workAvailable }) => {
  const mode = useModeRequest();
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

  const effective = mode === 'WORK' && !workAvailable ? 'AUTO' : mode;
  return (
    <div className="vinz-model-pill vinz-mode-pill" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        title={mode === 'WORK' && !workAvailable ? 'WORK richiede un progetto: decide AUTO' : 'Modo di esecuzione (MON CORE)'}
      >
        <span>{effective}</span>
      </button>
      {open && (
        <div className="vinz-model-pill__menu" role="menu" aria-label="Modo di esecuzione">
          <p className="vinz-model-pill__heading">MODO</p>
          <div className="vinz-model-pill__options">
            {OPTIONS.map((option) => {
              const disabled = option.id === 'WORK' && !workAvailable;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-current={option.id === mode || undefined}
                  disabled={disabled}
                  title={disabled ? 'Serve un progetto (non Vinz.World)' : option.hint}
                  onClick={() => { setModeRequest(option.id); setOpen(false); }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
