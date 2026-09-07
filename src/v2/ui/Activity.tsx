/* ============================================================================
   «STA LAVORANDO · 14s»

   Una riga sola mentre l'agente lavora, che si apre se vuoi guardarci dentro.
   La conversazione resta pulita: i log non stanno mai aperti da soli.
   ========================================================================= */

import { useEffect, useState } from 'react';

import type { V2ToolRun } from '../chat/types';

function seconds(ms: number): string {
  return `${Math.max(0, Math.round(ms / 1000))}s`;
}

export function WorkingRow({ startedAt, runs }: { startedAt: number; runs: V2ToolRun[] }) {
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="v2act">
      <button type="button" className="v2act__row" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`v2act__caret ${open ? 'v2act__caret--open' : ''}`}>▸</span>
        <span className="v2act__label">Sta lavorando</span>
        <span className="v2act__time">· {seconds(now - startedAt)}</span>
      </button>
      {open && <ToolList runs={runs} empty="Nessuno strumento chiamato finora." />}
    </div>
  );
}

export function ActivityLog({ runs, engine, model }: { runs: V2ToolRun[]; engine?: string; model?: string }) {
  const [open, setOpen] = useState(false);
  const total = runs.reduce((sum, run) => sum + (run.ms ?? 0), 0);

  return (
    <div className="v2act">
      <button type="button" className="v2act__row" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className={`v2act__caret ${open ? 'v2act__caret--open' : ''}`}>▸</span>
        <span className="v2act__label">
          {runs.length ? `${runs.length} strumento${runs.length > 1 ? 'i' : ''}` : 'Attività'}
        </span>
        {total > 0 && <span className="v2act__time">· {seconds(total)}</span>}
      </button>
      {open && (
        <>
          <ToolList runs={runs} empty="Nessuno strumento chiamato per questa risposta." />
          <p className="v2act__meta">
            Motore: {engine ?? '—'}
            {model ? ` · modello: ${model}` : ''}
          </p>
        </>
      )}
    </div>
  );
}

function ToolList({ runs, empty }: { runs: V2ToolRun[]; empty: string }) {
  if (!runs.length) return <p className="v2act__meta">{empty}</p>;

  return (
    <ul className="v2act__list">
      {runs.map((run) => (
        <li key={run.id} className="v2act__item">
          <span className={`v2act__status v2act__status--${run.status}`}>
            {run.status === 'running' ? '…' : run.status === 'ok' ? '✓' : '✕'}
          </span>
          <div className="v2act__body">
            <p className="v2act__name">
              {run.name}
              {run.ms !== undefined && <span className="v2act__time"> · {run.ms}ms</span>}
            </p>
            {run.error && <p className="v2act__error">{run.error}</p>}
            {run.result && <pre className="v2act__result">{run.result}</pre>}
          </div>
        </li>
      ))}
    </ul>
  );
}
