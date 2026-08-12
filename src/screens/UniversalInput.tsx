/* ============================================================================
   07 — UNIVERSAL INPUT (§12)

   "Camera, tell, measure, workout e natural-language input."
   Board S08: sheet con quattro righe grandi e una X per chiudere.

   §1 — l'app deve ridurre l'attrito: prima i dati automatici, poi foto e
   linguaggio naturale, i moduli solo quando non se ne può fare a meno. Qui la
   nota testuale è sempre facoltativa.
   ========================================================================= */

import { useState } from 'react';
import { useApp, useActiveMon } from '../state/store';
import { Button, IconButton, TextField } from '../system/components';
import { Icon, type IconName } from '../system/Icon';
import { displayName } from '../engine/types';
import { t } from '../i18n/it';

type InputKind = 'camera' | 'tell' | 'measure' | 'workout';

const OPTIONS: { kind: InputKind; icon: IconName; label: string; hint: string }[] = [
  { kind: 'camera', icon: 'camera', label: t.input.camera, hint: t.input.cameraHint },
  { kind: 'tell', icon: 'tell', label: t.input.tell, hint: t.input.tellHint },
  { kind: 'measure', icon: 'measure', label: t.input.measure, hint: t.input.measureHint },
  { kind: 'workout', icon: 'workout', label: t.input.workout, hint: t.input.workoutHint },
];

export function UniversalInputScreen({ onClose }: { onClose: () => void }) {
  const mon = useActiveMon();
  const logInput = useApp((s) => s.logInput);
  const [selected, setSelected] = useState<InputKind | null>(null);
  const [note, setNote] = useState('');

  const confirm = () => {
    if (!selected) return;
    logInput(selected, note);
    onClose();
  };

  return (
    <div className="screen sheet">
      <div className="sheet__head">
        <div>
          <h1 className="t-display sheet__title">{t.input.title}</h1>
          <p className="t-small sheet__sub">{t.input.subtitle}</p>
        </div>
        <IconButton icon="close" label={t.common.close} light onClick={onClose} />
      </div>

      <div className="screen__body sheet__body">
        <div className="stack">
          {OPTIONS.map((o) => (
            <button
              key={o.kind}
              type="button"
              className="inputrow"
              aria-pressed={selected === o.kind}
              onClick={() => setSelected(o.kind)}
            >
              <span className="inputrow__icon">
                <Icon name={o.icon} size={20} strokeWidth={2} />
              </span>
              <span className="inputrow__labels">
                <span className="inputrow__label t-display">{o.label}</span>
                <span className="inputrow__hint t-small">{o.hint}</span>
              </span>
              {/* Lo stato selezionato non è solo colore: c'è un segno (§17). */}
              <span className="inputrow__mark" aria-hidden="true">
                {selected === o.kind ? '■' : '□'}
              </span>
            </button>
          ))}
        </div>

        {selected && (
          <div className="sheet__note">
            <p className="t-meta">
              NOTA PER {mon ? displayName(mon.data.name) : 'IL SISTEMA'}
            </p>
            <TextField
              label={t.input.notePlaceholder}
              placeholder={t.input.notePlaceholder}
              value={note}
              onChange={setNote}
              onSubmit={confirm}
            />
            <p className="t-micro sheet__hint">
              Una nota abbastanza significativa può diventare una memoria.
            </p>
          </div>
        )}
      </div>

      <footer className="sheet__foot">
        <Button variant="ghost" onClick={onClose}>
          {t.input.cancel}
        </Button>
        <Button variant="primary" disabled={!selected} onClick={confirm}>
          {t.input.confirm}
        </Button>
      </footer>
    </div>
  );
}
