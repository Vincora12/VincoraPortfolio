/* ============================================================================
   DEV → VOCE

   Dove si incolla la chiave API e si prova la voce di un .mon prima che il
   momento vero arrivi.

   La schermata dice a chiare lettere dove finisce la chiave, perché è una
   scelta con una conseguenza: nel `localStorage` di questo browser. Nascondere
   il compromesso sarebbe peggio che averlo.
   ========================================================================= */

import { useState } from 'react';
import { useApp, useActiveMon } from '../state/store';
import { Button, SystemLabel, TextField, Window } from '../system/components';
import { VOICE_MODEL, buildVoiceSystemPrompt } from '../ai/voicePrompt';

export function VoiceSection() {
  const apiKey = useApp((s) => s.apiKey);
  const setApiKey = useApp((s) => s.setApiKey);
  const mon = useActiveMon();
  // §10.6 — la prova di voce deve sentire l'umore vero: una prova che gira su
  // uno stato neutro non prova la voce che poi ti risponde davvero.
  const mood = useApp((s) => s.mood);

  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [sample, setSample] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  const tryVoice = async () => {
    if (!mon) return;
    setBusy(true);
    setSample(null);
    setProblem(null);

    // Import dinamico: l'SDK pesa, e chi non usa la voce non deve scaricarlo.
    const { generateIntroduction } = await import('../ai/client');
    const { result, failure } = await generateIntroduction(apiKey, mon, mood);
    setBusy(false);

    if (result) {
      setSample(result.text);
      return;
    }
    setProblem(
      failure === 'no-key'
        ? 'Nessuna chiave: la voce resta quella deterministica.'
        : failure === 'refused'
          ? 'Il modello ha declinato la richiesta.'
          : 'Chiamata fallita. Chiave sbagliata, credito finito o rete assente.',
    );
  };

  return (
    <>
      <Window title="CHIAVE API">
        {apiKey ? (
          <>
            <p className="t-small">
              <SystemLabel tone="character">ATTIVA</SystemLabel> La voce dei `.mon` passa dall'AI.
            </p>
            <Button block variant="secondary" onClick={() => setApiKey(null)}>
              RIMUOVI LA CHIAVE
            </Button>
          </>
        ) : (
          <>
            <TextField
              label="Chiave API Anthropic"
              placeholder="sk-ant-…"
              value={draft}
              onChange={setDraft}
              onSubmit={() => {
                setApiKey(draft);
                setDraft('');
              }}
            />
            <Button
              block
              variant="primary"
              disabled={draft.trim().length === 0}
              onClick={() => {
                setApiKey(draft);
                setDraft('');
              }}
            >
              SALVA
            </Button>
          </>
        )}

        {/* Il compromesso, detto per intero. */}
        <p className="t-small dev__note">
          La chiave resta nel <strong>localStorage di questo browser</strong>. Non passa da nessun
          server nostro, ma chiunque apra questo browser può leggerla. Va bene finché il prototipo è
          tuo e basta: prima di darlo a qualcun altro va spostata dietro una funzione serverless.
        </p>
        <p className="t-micro dev__note">MODELLO: {VOICE_MODEL}</p>
      </Window>

      <Window title="PROVA LA VOCE">
        {mon ? (
          <>
            <p className="t-small">
              Chiede a <strong>{mon.data.name}</strong> di presentarsi, come farà alla nascita.
            </p>
            <Button block variant="primary" disabled={busy} onClick={() => void tryVoice()}>
              {busy ? 'STA SCRIVENDO…' : 'GENERA UNA PRESENTAZIONE'}
            </Button>

            {sample && <p className="t-small dev__sample">{sample}</p>}
            {problem && (
              <p className="t-small dev__note">
                <SystemLabel tone="warning">FALLBACK</SystemLabel> {problem}
              </p>
            )}

            <Button block variant="ghost" small onClick={() => setShowPrompt((v) => !v)}>
              {showPrompt ? 'NASCONDI IL SYSTEM PROMPT' : 'MOSTRA IL SYSTEM PROMPT'}
            </Button>
            {showPrompt && <pre className="dev__pre">{buildVoiceSystemPrompt(mon)}</pre>}
          </>
        ) : (
          <p className="t-small dev__note">Nessun `.mon` attivo.</p>
        )}
      </Window>
    </>
  );
}
