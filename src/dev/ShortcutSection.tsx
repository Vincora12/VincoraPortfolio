/* ============================================================================
   DEV → SHORTCUT API (brief «VINZ.MON iOS Shortcuts — Background
   Integration», §11)

   «Do NOT try to mirror or manage the user's actual Apple Shortcuts list
   inside VINZ.LAB. […] What VINZ.LAB should show instead is a small
   "SHORTCUT API" inspector for the integration surface.»

   Non un elenco delle tue Comandi — iOS ha già quello. Questo dice cosa
   `/api/shortcut` sa fare, con cosa costruire la Shortcut, e cosa è successo
   nelle ultime chiamate — la stessa onestà di DEV → COSTI: un numero misurato,
   non promesso.
   ========================================================================= */

import { useEffect, useState } from 'react';
import { useApp } from '../state/store';
import { Row, SystemLabel } from '../system/components';
import type { ShortcutStatus } from '../ai/backend';

const AI_POLICY_LABEL: Record<string, string> = {
  never: 'MAI',
  sometimes: 'A VOLTE',
  usually: 'QUASI SEMPRE',
};

const EXAMPLE_BODY = JSON.stringify({ action: 'meal', text: 'piadina con pollo e mozzarella' }, null, 2);

export function ShortcutSection() {
  const token = useApp((s) => s.token);
  const [status, setStatus] = useState<ShortcutStatus | null | 'loading' | 'error'>('loading');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      return;
    }
    let cancelled = false;
    void import('../ai/backend').then(({ loadShortcutStatus }) =>
      loadShortcutStatus(token).then(({ data }) => {
        if (!cancelled) setStatus(data ?? 'error');
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="dev__section">
      <p className="t-meta dev__label">SHORTCUT API</p>
      <p className="t-micro dev__note">
        Non un elenco delle tue Comandi — quelle restano su iPhone. Qui c'è
        solo cosa questa porta sa fare, con cosa costruirci sopra una
        Shortcut, e cosa è successo nelle ultime chiamate.
      </p>

      {status === 'loading' && <p className="t-micro dev__note">sto chiedendo al server…</p>}
      {status === 'error' && (
        <p className="t-micro dev__note">il server non risponde — serve un token valido.</p>
      )}

      {status && status !== 'loading' && status !== 'error' && (
        <>
          <p className="t-meta dev__label">IL SEGRETO DELLE SHORTCUT</p>
          <div className="rowlist">
            <Row
              label="VINZMON_SHORTCUT_TOKEN"
              value={
                status.tokenConfigured ? 'configurato' : 'MANCANTE — le Shortcut non possono chiamare'
              }
            />
          </div>
          <p className="t-micro dev__note">
            {status.tokenConfigured
              ? 'È un secondo segreto, diverso da quello dell\'app: revocarlo non tocca voce, immagini, salvataggio.'
              : 'Genera un valore lungo e casuale (come per VINZMON_TOKEN) e mettilo su Netlify. Finché manca, ogni chiamata dalle Shortcut torna 401.'}
          </p>

          <p className="t-meta dev__label">COME CHIAMARLA</p>
          <p className="t-micro dev__note">
            Shortcut "Ottieni contenuti di URL" · POST · {status.endpoint} · Header{' '}
            <code>Authorization: Bearer &lt;VINZMON_SHORTCUT_TOKEN&gt;</code> · Corpo JSON:
          </p>
          <pre className="dev__pre">{EXAMPLE_BODY}</pre>

          <p className="t-meta dev__label">AZIONI</p>
          <div className="rowlist">
            {status.actions.map((a) => (
              <div key={a.id} className="dev__step">
                <p className="t-meta">
                  {a.label}{' '}
                  {!a.enabled && <SystemLabel tone="warning">NON ANCORA</SystemLabel>}
                  {a.enabled && (
                    <SystemLabel tone={a.aiPolicy === 'never' ? undefined : 'character'}>
                      AI {AI_POLICY_LABEL[a.aiPolicy]}
                    </SystemLabel>
                  )}
                </p>
                <p className="t-micro dev__note">
                  {a.it} — <code>action: "{a.id}"</code>, ingresso: {a.input}
                </p>
              </div>
            ))}
          </div>

          <p className="t-meta dev__label">ULTIME CHIAMATE</p>
          {status.recent.length === 0 ? (
            <p className="t-micro dev__note">nessuna chiamata ancora.</p>
          ) : (
            <div className="rowlist">
              {status.recent.map((c, i) => (
                <Row
                  key={i}
                  label={`${c.action} · ${new Date(c.at).toLocaleString('it-IT')}`}
                  value={`${c.ok ? '✓' : '✗'} · ${(c.ms / 1000).toFixed(1)}s${c.costUsd > 0 ? ` · $${c.costUsd.toFixed(4)}` : ''}${c.reason ? ` · ${c.reason}` : ''}`}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
