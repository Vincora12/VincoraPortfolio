/* ============================================================================
   IL COMPOSER CON DETTATURA — la stessa interazione della chat principale

   🔷 «Tutti gli assistenti usano l'UI della chat, compresa la dettatura che
      abbiamo per la chat principale.»

   Non è una nuova componente che imita quella di Brain.tsx: è la STESSA
   logica di registrazione — microfono, onda, invio a /api/transcribe — resa
   riusabile FUORI dal runtime di assistant-ui. Gli assistenti del lab
   (LabAssistantPanel, TaxonomyLab) non hanno un Thread/Composer sotto: fanno
   una richiesta sola, non una conversazione — quindi qui il valore è
   controllato (`value`/`onChange`) invece di scrivere nel DOM di
   `ComposerPrimitive.Input`. La CSS resta quella vera: `./brain.css`, non una
   copia — se cambia lì, cambia anche qui.
   ========================================================================= */

import { useEffect, useRef, useState } from 'react';
import WaveSurfer from 'wavesurfer.js';
import RecordPlugin from 'wavesurfer.js/dist/plugins/record.esm.js';
import './brain.css';

export function DictationComposer({
  value,
  onChange,
  onSend,
  token,
  placeholder,
  disabled,
  sending,
  sendingLabel,
  rows = 3,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  token: string | null;
  placeholder?: string;
  disabled?: boolean;
  sending?: boolean;
  sendingLabel?: string;
  rows?: number;
}) {
  const waveRef = useRef<HTMLDivElement>(null);
  const waveSurferRef = useRef<WaveSurfer | null>(null);
  const recordRef = useRef<RecordPlugin | null>(null);
  const submitAfterRef = useRef(false);
  const [mode, setMode] = useState<'idle' | 'starting' | 'recording' | 'transcribing'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [dictationError, setDictationError] = useState<string | null>(null);

  useEffect(() => () => {
    recordRef.current?.destroy();
    waveSurferRef.current?.destroy();
  }, []);

  const transcribe = async (blob: Blob) => {
    if (!token) throw new Error('Prima attiva VINZ.MON.');
    const extension = blob.type.includes('mp4') ? 'm4a' : 'webm';
    const form = new FormData();
    form.set('file', new File([blob], `voice.${extension}`, { type: blob.type }));
    const response = await fetch('/api/transcribe', { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: form });
    const body = (await response.json().catch(() => null)) as { text?: string; error?: string; reason?: string } | null;
    if (!response.ok || !body?.text) throw new Error(body?.reason ?? body?.error ?? 'Trascrizione non riuscita.');
    return body.text;
  };

  const startDictation = async () => {
    if (mode !== 'idle') return;
    setDictationError(null);
    setMode('starting');
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Microfono non supportato da questo browser.');
      if (!waveRef.current) throw new Error('Registratore non pronto. Riprova.');
      recordRef.current?.destroy();
      waveSurferRef.current?.destroy();
      const wavesurfer = WaveSurfer.create({
        container: waveRef.current,
        height: 34,
        waveColor: '#a6a6a6',
        progressColor: '#f5f5f5',
        cursorWidth: 0,
        barWidth: 3,
        barGap: 2,
        barRadius: 3,
        barHeight: 1.15,
        normalize: true,
        interact: false,
      });
      const safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      const record = wavesurfer.registerPlugin(RecordPlugin.create({
        ...(safari && MediaRecorder.isTypeSupported('audio/mp4') ? { mimeType: 'audio/mp4' } : {}),
        scrollingWaveform: true,
        scrollingWaveformWindow: 4,
        renderRecordedAudio: false,
        mediaRecorderTimeslice: 500,
      }));
      waveSurferRef.current = wavesurfer;
      recordRef.current = record;
      submitAfterRef.current = false;
      record.on('record-progress', (duration) => setSeconds(Math.floor(duration / 1000)));
      record.on('record-end', async (blob) => {
        const submit = submitAfterRef.current;
        record.stopMic();
        setSeconds(0);
        if (!submit) { setMode('idle'); return; }
        setMode('transcribing');
        try {
          const text = await transcribe(blob);
          onChange(value ? `${value} ${text}` : text);
        } catch (error) {
          setDictationError(error instanceof Error ? error.message : 'Trascrizione non riuscita.');
        } finally { setMode('idle'); }
      });
      await record.startRecording({ channelCount: 1, echoCancellation: true, noiseSuppression: true });
      setSeconds(0);
      setMode('recording');
    } catch (error) {
      recordRef.current?.stopMic();
      setDictationError(error instanceof Error && error.message ? error.message : 'Consenti l’accesso al microfono e riprova.');
      setMode('idle');
    }
  };

  const finishDictation = (submit: boolean) => {
    submitAfterRef.current = submit;
    if (recordRef.current?.isRecording()) recordRef.current.stopRecording();
  };

  const puoInviare = !disabled && value.trim().length > 0;

  return (
    <div className="aui-composer">
      <div className={`aui-composer__row ${mode !== 'idle' ? 'is-recording' : ''}`}>
        {mode !== 'idle' ? (
          <>
            <button type="button" className="aui-record__cancel" aria-label="Annulla registrazione" disabled={mode === 'starting' || mode === 'transcribing'} onClick={() => finishDictation(false)}>■</button>
            <div
              ref={waveRef}
              className={`aui-record__wave ${mode === 'starting' || mode === 'transcribing' ? 'is-loading' : ''}`}
              data-status={mode === 'transcribing' ? 'TRASCRIZIONE IN CORSO' : 'AVVIO MICROFONO'}
              aria-label={mode === 'starting' ? 'Avvio microfono' : mode === 'transcribing' ? 'Trascrizione in corso' : 'Livello del microfono'}
            />
            <time className="aui-record__time">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</time>
            <button type="button" className="aui-record__send" aria-label="Invia dettatura" disabled={mode === 'starting' || mode === 'transcribing'} onClick={() => finishDictation(true)}>↑</button>
          </>
        ) : (
          <>
            <textarea
              className="aui-composer__input"
              placeholder={placeholder}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              rows={rows}
              disabled={disabled}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  if (puoInviare) onSend();
                }
              }}
            />
            <button type="button" className="aui-composer__mic" aria-label="Avvia dettatura" onClick={() => void startDictation()}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a4 4 0 0 0 4-4V6a4 4 0 1 0-8 0v5a4 4 0 0 0 4 4Zm7-4a7 7 0 0 1-14 0M12 18v4M9 22h6" /></svg>
            </button>
            <button type="button" className="aui-composer__send" aria-label={sending ? 'Sto pensando' : 'Invia'} disabled={!puoInviare || sending} onClick={onSend}>
              INVIA
            </button>
          </>
        )}
      </div>
      {sending && sendingLabel && <p className="aui-composer__status" role="status">{sendingLabel}</p>}
      {dictationError && <p className="aui-record__error" role="alert">{dictationError}</p>}
    </div>
  );
}
