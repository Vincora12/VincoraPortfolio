/* ============================================================================
   04 — FIRST SIGNAL / INCUBATION (§12)

   "Initial relationship and data-acquisition state."
   Board S05: campo nero, DAY n / 28, SIGNAL STABILITY, linguaggio scanner.

   🟡 §18 — la terminologia definitiva dopo l'abbandono del nome DIGIVINZ non è
   fissata: le stringhe vivono in i18n/it.ts e sono marcate come provvisorie.

   §12/01 — nessuno spoiler della forma futura: qui non si mostra e non si
   anticipa nessun .mon.
   ========================================================================= */

import { useEffect, useRef, useState } from 'react';
import type { Overlay } from '../App';
import { useApp, useIncubation, useToday } from '../state/store';
import { Button, DataDots, IconButton, ScannerFrame, SegmentedBar, SignalWave, TextField } from '../system/components';
import { EggVessel } from '../system/EggVessel';
import { STAT_KEYS, isKnown } from '../engine/types';
import { t } from '../i18n/it';

export function IncubationScreen({ onGo }: { onGo: (o: Overlay) => void }) {
  const inc = useIncubation();
  const today = useToday();
  const day = useApp((s) => s.day);
  const stats = useApp((s) => s.health.stats);
  const hatch = useApp((s) => s.hatch);
  const simulateSyncedDays = useApp((s) => s.simulateSyncedDays);
  const chat = useApp((s) => s.chat);
  const sendToEgg = useApp((s) => s.sendToEgg);
  const syncDay = useApp((s) => s.syncDay);

  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    });
  }, [chat.length]);

  const submit = () => {
    if (draft.trim().length === 0) return;
    sendToEgg(draft);
    setDraft('');
  };

  return (
    <div className="screen screen--ink">
      <div className="screen__body incubation">
        <header className="incubation__head">
          <p className="t-meta">{t.incubation.subtitle}</p>
          <h1 className="t-display incubation__title">{t.incubation.title}</h1>
        </header>

        {/* 🔷 v1.10 §7.3 — il guscio cambia a ogni giorno chiuso: una crepa
            nuova, la massa dentro più densa, il respiro più corto. È lo stesso
            valore che riempiva la barra a segmenti, disegnato invece che
            contato — e infatti la barra è stata tolta.

            Resta un oggetto di sistema, non un uovo illustrato (§18A), e la
            massa dentro non deve MAI leggersi come una sagoma: §12/01 vieta di
            anticipare la forma. */}
        <div className="incubation__stage">
          <ScannerFrame>
            <div className="incubation__vessel">
              <EggVessel
                progress={inc.progress}
                days={inc.day}
                total={inc.total}
                size={176}
              />
            </div>
          </ScannerFrame>
        </div>

        {/* 🔶 v1.10 §7.2 — SI PARLA ALL'UOVO, e l'uovo risponde con dei suoni.

            v1.9 §7.1 aveva aperto la registrazione durante l'incubazione, ma
            con un pulsante che portava a una schermata di segnali: registravi
            senza che ci fosse nessuno dall'altra parte. Sette giorni così sono
            un modulo, non un rapporto.

            Adesso è la stessa chat di dopo — stesso campo, stessa estrazione,
            stessa riga di conferma — con l'unica differenza che conta: quello
            che c'è dentro non sa ancora parlare. Vedi `eggVoice.ts` per il
            perché i suoni non sono un vezzo grafico. */}
        <div className="incubation__chat" ref={listRef}>
          {chat.length === 0 && (
            <p className="t-small incubation__empty">{t.incubation.chatEmpty}</p>
          )}
          {chat.map((m) => (
            <div key={m.id} className={`bubblerow bubblerow--${m.from}`}>
              {m.sound ? (
                /* Un suono non è una battuta di dialogo: non ha la bolla, ha
                   l'onda. Se sembrasse un messaggio, sembrerebbe che parli. */
                <div className={`eggsound eggsound--${m.sound.toLowerCase()}`}>
                  <SignalWave seed={m.id.length * 131 + m.day} width={64} height={18} />
                  <span className="eggsound__text">{m.text}</span>
                </div>
              ) : (
                <div className={`bubble bubble--${m.from}`}>
                  <p className="bubble__text">{m.text}</p>
                  {m.extracted && (
                    <span className="bubble__flag bubble__flag--rec t-micro">
                      {t.home.recorded} {m.extracted.join(' · ')}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="composer composer--egg">
          <IconButton icon="plus" label={t.input.title} onClick={() => onGo('input')} />
          <TextField
            label={t.incubation.chatLabel}
            placeholder={t.incubation.chatPlaceholder}
            value={draft}
            onChange={setDraft}
            onSubmit={submit}
          />
          <IconButton
            icon="send"
            label="Invia"
            haptics="confirm"
            onClick={submit}
            disabled={draft.trim().length === 0}
          />
        </div>

        {/* Chiudere la giornata resta un gesto esplicito: §6 vuole che sia
            l'utente a dire «ecco, è andata così», e nessuna quantità di
            messaggi lo fa al posto suo. */}
        <div className="incubation__day-close">
          <span className="t-micro">
            {today.closed
              ? t.incubation.todayClosed
              : today.canClose
                ? t.incubation.todayReady
                : t.incubation.todayOpen(today.known)}
          </span>
          {!today.closed && today.canClose && (
            <Button variant="ghost" haptics="confirm" onClick={syncDay}>
              {t.incubation.closeDay}
            </Button>
          )}
        </div>

        <div className="incubation__readouts">
          <div className="incubation__row">
            <span className="t-meta">{t.incubation.day}</span>
            <span className="t-display incubation__day">
              {inc.day} <span className="incubation__total">/ {inc.total}</span>
            </span>
          </div>

          <SegmentedBar
            value={inc.stability}
            segments={12}
            label={t.incubation.stability}
            readout={`${Math.round(inc.stability * 100)}%`}
            tone={inc.stability > 0.6 ? 'positive' : 'warning'}
          />

          <div className="incubation__signals">
            <span className="t-micro">SEGNALI LETTI</span>
            <div className="incubation__chips">
              {STAT_KEYS.map((k) => (
                <span
                  key={k}
                  className={`incubation__chip ${isKnown(stats[k].value) ? 'incubation__chip--on' : ''}`}
                >
                  {k}
                  {/* Il colore non basta (§17): lo stato è anche scritto. */}
                  <em>{isKnown(stats[k].value) ? 'OK' : '—'}</em>
                </span>
              ))}
            </div>
          </div>

          <div className="incubation__trace" aria-hidden="true">
            <SignalWave seed={day * 977} width={320} height={28} />
            <DataDots cols={40} rows={3} />
          </div>
        </div>
      </div>

      <footer className="incubation__foot">
        <p className="t-small incubation__note">
          {inc.ready ? t.incubation.ready : t.incubation.waiting}
        </p>

        <Button
          variant="primary"
          block
          disabled={!inc.ready}
          haptics="impact"
          onClick={hatch}
          aria-describedby="hatch-note"
        >
          {inc.ready ? t.incubation.hatch : t.incubation.notReady}
        </Button>

        <p id="hatch-note" className="t-micro incubation__definitive">
          {inc.ready
            ? t.incubation.definitive
            : `MANCANO ${inc.total - inc.day} GIORNI SINCRONIZZATI`}
        </p>

        {/* Il tempo scorre solo dal pannello DEV: nel prodotto reale è la vita
            dell'utente a farlo avanzare. Qui il tasto resta accessibile perché
            senza di esso il prototipo non sarebbe testabile (§20).

            🔶 Simula giorni *sincronizzati*, non giorni passati: l'incubazione
            conta le volte che ti sei presentato, e il tempo da solo non basta
            più a farla finire. */}
        <button
          type="button"
          className="incubation__skip t-micro"
          onClick={() => simulateSyncedDays(7)}
        >
          + 7 GIORNI SINCRONIZZATI (SIMULAZIONE)
        </button>
      </footer>
    </div>
  );
}
