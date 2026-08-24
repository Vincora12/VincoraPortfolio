import { useMemo, useState } from 'react';
import { DESIGN_SCREENS, designScreen } from './screenRegistry';
import { DesignLabPreviewFrame } from './DesignLabPreviewFrame';
import type { DesignPatch, DesignScreenId, DesignSelection } from './types';
import './designLab.css';

const initialPatch: DesignPatch = {
  id: 'r0',
  label: 'R0 · CURRENT UI',
  target: 'none',
  scope: 'screen',
  cssText: '',
};

export function DesignLabShell({ onClose }: { onClose: () => void }) {
  const [screen, setScreen] = useState<DesignScreenId>('mon');
  const [inspect, setInspect] = useState(true);
  const [selection, setSelection] = useState<DesignSelection | null>(null);
  const [patch, setPatch] = useState<DesignPatch>(initialPatch);
  const [draft, setDraft] = useState('');

  const meta = useMemo(() => designScreen(screen), [screen]);

  return (
    <div className="designlab">
      <header className="designlab__header">
        <div>
          <strong>DESIGN.LAB</strong>
          <span>REAL COMPONENT MODE</span>
        </div>
        <button type="button" onClick={onClose}>CHIUDI</button>
      </header>

      <nav className="designlab__screens" aria-label="Schermate reali">
        {DESIGN_SCREENS.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-current={screen === item.id ? 'page' : undefined}
            onClick={() => {
              setScreen(item.id);
              setSelection(null);
              setPatch(initialPatch);
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <section className="designlab__workspace">
        <div className="designlab__canvas">
          <div className="designlab__canvashead">
            <div>
              <b>{meta.label}</b>
              <span>{meta.group} · REAL SOURCE</span>
            </div>
            <button type="button" onClick={() => setInspect((v) => !v)}>
              {inspect ? 'INSPECT ON' : 'INTERACT'}
            </button>
          </div>

          <DesignLabPreviewFrame
            screen={screen}
            cssText={patch.cssText ?? ''}
            inspect={inspect}
            onSelect={setSelection}
          />
        </div>

        <aside className="designlab__chat">
          <div className="designlab__selection">
            <span>SELECTED</span>
            <strong>{selection?.elementId ?? 'Tocca un elemento nella preview'}</strong>
            {selection && (
              <>
                <small>{selection.tag}</small>
                <code>{selection.classes.join(' ')}</code>
              </>
            )}
          </div>

          <div className="designlab__sources">
            <span>REAL SOURCE</span>
            {meta.source.map((path) => <code key={path}>{path}</code>)}
          </div>

          <div className="designlab__conversation">
            <div className="designlab__ai">
              🤖 Posso spiegarti l’elemento selezionato oppure proporti una
              modifica. Prima leggo il componente, il CSS e i token che lo
              controllano. Nessuna conversazione modifica VINZ.MON direttamente.
            </div>
          </div>

          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Es. questa nav la vorrei più Y2K e più grafica…"
          />

          <button
            type="button"
            className="designlab__propose"
            disabled={!draft.trim() || !selection}
            onClick={() => {
              /*
               * CONNECT TO DESIGN AI HERE.
               *
               * The backend request must include:
               * - user request
               * - selected screen + selection metadata
               * - source file contents for the selected owner
               * - computed CSS / relevant tokens
               * - current Design Lab patch stack
               *
               * The model returns a STRUCTURED DesignPatch.
               * Never execute arbitrary model text as JS.
               */
              setPatch({
                id: `proposal-${Date.now()}`,
                label: 'AI PROPOSAL',
                target: selection?.elementId ?? 'unknown',
                scope: 'component',
                cssText: patch.cssText ?? '',
                notes: ['Placeholder until Design AI backend is wired.'],
              });
            }}
          >
            🤖 CREA PROPOSTA
          </button>

          <div className="designlab__patch">
            <span>CURRENT PATCH</span>
            <strong>{patch.label}</strong>
            <small>{patch.scope} · {patch.target}</small>
          </div>
        </aside>
      </section>
    </div>
  );
}
