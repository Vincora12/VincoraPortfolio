/* ============================================================================
   05 — INCUBAZIONE

   🔷 v1.10 §13.6 — RISCRITTA PER TOGLIERE.

   Aveva otto blocchi impilati: intestazione, uovo grande dentro una cornice
   scanner, chat, composer, riga della giornata, GIORNI RACCONTATI, SIGNAL
   STABILITY, sei chip di segnali letti, un tracciato decorativo, e un piede
   fisso con un pulsante HATCH disabilitato per sette giorni. Si scorreva, e
   la cosa che serviva davvero — parlare con l'uovo — stava schiacciata in
   mezzo.

   Adesso ce ne sono tre:

     1. una barra compatta in cima: l'uovo e quanti giorni ha sentito
     2. la chat, che prende tutto il resto e scorre da sola
     3. una striscia sopra il composer, che dice una cosa alla volta

   Cosa è sparito e perché:

   • SIGNAL STABILITY e i sei chip FORM/ATK/SPD/... — sono la stessa
     informazione che DEV → SEGNALI mostra meglio, e sono vocabolario del
     motore su una superficie di prodotto. Non sono stati spostati: erano
     duplicati.
   • Il tracciato (onda + puntini) — decorazione.
   • Il piede fisso con HATCH — restava lì sette giorni a dire «non ancora»,
     cioè occupava il posto migliore dello schermo per non fare niente.
     Adesso compare quando serve, e quando compare è l'unica cosa che chiede
     di essere toccata.

   §12/01 — nessuno spoiler della forma futura: qui non si mostra e non si
   anticipa nessun .mon.
   ========================================================================= */

import { useEffect, useRef, useState } from 'react';
import type { Overlay } from '../App';
import { useApp, useIncubation, useToday } from '../state/store';
import { Button, HoldButton, IconButton, SignalWave, TextField } from '../system/components';
import { EggVessel } from '../system/EggVessel';
import { t } from '../i18n/it';

export function IncubationScreen({ onGo }: { onGo: (o: Overlay) => void }) {
  const inc = useIncubation();
  const today = useToday();
  const hatch = useApp((s) => s.hatch);
  const syncDay = useApp((s) => s.syncDay);
  const chat = useApp((s) => s.chat);
  const sendToEgg = useApp((s) => s.sendToEgg);
  const devEnabled = useApp((s) => s.dev.enabled);
  const simulateSyncedDays = useApp((s) => s.simulateSyncedDays);

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
    <div className="screen screen--ink incubation">
      {/* --- 1. L'uovo, piccolo, con accanto il solo numero che conta --- */}
      <header className="incubation__bar">
        <EggVessel progress={inc.progress} days={inc.day} total={inc.total} size={78} />
        <div className="incubation__count">
          <span className="t-meta incubation__phase">{t.incubation.subtitle}</span>
          <span className="t-display incubation__num">
            {inc.day}
            <em className="incubation__of">/ {inc.total}</em>
          </span>
          <span className="t-micro incubation__unit">{t.incubation.day}</span>
        </div>
      </header>

      {/* --- 2. La chat. È la schermata, non un pezzo della schermata. --- */}
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

      {/* --- 3. Una striscia sola, che dice una cosa alla volta.

           È lo stesso schema della Home, dove la linea di SYNC diventa
           l'annuncio quando si riempie: uno slot che cambia lavoro invece di
           due elementi che si contendono lo spazio. --- */}
      {inc.ready ? (
        <div className="incubation__strip incubation__strip--ready">
          <span className="incubation__stripline">
            <strong className="t-meta">{t.incubation.ready}</strong>
            <span className="t-micro">{t.incubation.definitive}</span>
          </span>
          {/* 🔷 v1.10 §13.8 — si tiene premuto, come ogni trasformazione.
              Nascere è la piu' grande di tutte e fino a qui era un tocco
              secco: la stessa gravità di un pulsante qualsiasi. */}
          <HoldButton onComplete={hatch} hint={t.shift.hold}>
            {t.incubation.hatch}
          </HoldButton>
        </div>
      ) : (
        <div className="incubation__strip">
          <span className="t-micro incubation__stripstate">
            {today.closed
              ? t.incubation.todayClosed
              : today.canClose
                ? t.incubation.todayReady
                : t.incubation.todayOpen(today.known)}
          </span>
          {!today.closed && today.canClose && (
            <Button small variant="secondary" haptics="confirm" onClick={syncDay}>
              {t.incubation.closeDay}
            </Button>
          )}
        </div>
      )}

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

      {/* Il tempo scorre solo da DEV: nel prodotto reale è la vita dell'utente
          a farlo avanzare. §29 vieta i controlli DEV in produzione, e questo
          stava in chiaro per tutti — adesso segue la dev mode come il resto. */}
      {devEnabled && (
        <button
          type="button"
          className="incubation__skip t-micro"
          onClick={() => simulateSyncedDays(7)}
        >
          DEV — VIVI 7 GIORNI
        </button>
      )}
    </div>
  );
}
