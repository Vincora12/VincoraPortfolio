/* ============================================================================
   DEV → VOCE

   Dove si incolla il token e si prova la voce di un .mon prima che il momento
   vero arrivi.

   🔷 v1.13 — qui c'era la CHIAVE del fornitore, e un avviso che spiegava
   perché tenerla nel browser fosse accettabile per un prototipo di una persona
   sola. Non lo era più da quando questa è diventata l'app di tutti i giorni
   con un budget vero dietro: adesso le chiavi stanno sul server e il browser
   ha solo un token che apre le tue funzioni.

   La schermata continua a dire dove finisce quello che incolli, perché è
   sempre una scelta con una conseguenza — solo molto più piccola di prima.
   ========================================================================= */

import { useState } from 'react';
import { useApp, useActiveMon } from '../state/store';
import { Button, SystemLabel, TextField, Window } from '../system/components';
import { VOICE_MODEL, buildVoiceSystemPrompt } from '../ai/voicePrompt';

export function VoiceSection() {
  const token = useApp((s) => s.token);
  const setToken = useApp((s) => s.setToken);
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
    const { result, failure } = await generateIntroduction(token, mon, mood);
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
          : failure === 'capped'
            ? 'Tetto mensile raggiunto: è una decisione tua, non un guasto.'
            : 'Chiamata fallita: token sbagliato, funzioni non pubblicate o rete assente.',
    );
  };

  return (
    <>
      <Window title="TOKEN">
        {token ? (
          <>
            <p className="t-small">
              <SystemLabel tone="character">ATTIVO</SystemLabel> La voce dei `.mon` passa dall'AI.
            </p>
            <Button block variant="secondary" onClick={() => setToken(null)}>
              RIMUOVI IL TOKEN
            </Button>
          </>
        ) : (
          <>
            <TextField
              label="Token del backend"
              placeholder="lo stesso valore di VINZMON_TOKEN"
              value={draft}
              onChange={setDraft}
              onSubmit={() => {
                setToken(draft);
                setDraft('');
              }}
            />
            <Button
              block
              variant="primary"
              disabled={draft.trim().length === 0}
              onClick={() => {
                setToken(draft);
                setDraft('');
              }}
            >
              SALVA
            </Button>
          </>
        )}

        {/* Cosa è cambiato, e cosa no. */}
        <p className="t-small dev__note">
          Il token resta nel <strong>localStorage di questo browser</strong>, come prima la chiave —
          ma non è più una chiave del fornitore: apre solo le tue funzioni, dove il{' '}
          <strong>tetto mensile è già applicato</strong>. Se esce, cambi{' '}
          <code>VINZMON_TOKEN</code> su Netlify, ripubblichi, e il vecchio smette di valere.
        </p>
        <p className="t-micro dev__note">
          Lo stesso token lo useranno le Shortcut di iPhone: è la stessa porta.
        </p>
        <p className="t-micro dev__note">VOCE: {VOICE_MODEL} — le chiavi vivono sul server</p>
      </Window>

      <Window title="PROVA LA VOCE">
        {mon ? (
          <>
            <p className="t-small">
              Chiede a <strong>{mon.data.name}</strong> di presentarsi, come farà alla nascita.
            </p>
            <Button block variant="primary" loading={busy} onClick={() => void tryVoice()}>
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
