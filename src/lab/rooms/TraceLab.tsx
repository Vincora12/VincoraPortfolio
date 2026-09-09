/* ============================================================================
   TRACE.LAB — l'osservabilità, in un posto solo

   🔒 NON RISCRIVE NIENTE. Lo stesso `chatTrace` che la chat già registra e lo
   stesso `LiveDebug` che SYSTEM.LAB già monta: qui hanno un indirizzo proprio,
   perché TRACE non è prodotto quotidiano e non deve stare accanto a CHAT.
   ========================================================================= */

import { useEffect, useState } from 'react';

import { lastChatTrace, loadLastPersistedTrace, subscribeChatTrace, type ChatTrace } from '../../ai/chatTrace';
import { LabStyle } from '../embed/LabStyle';
import systemCss from '../skin/system.css?inline';
import { LiveDebug } from './liveDebug';
import { LabTop, Notice, PageHead, Rows, Section } from './parts';

type View = 'exchange' | 'live';

function ExchangeTrace() {
  const [trace, setTrace] = useState<ChatTrace | null>(() => lastChatTrace());
  useEffect(() => subscribeChatTrace(() => setTrace(lastChatTrace())), []);

  /* Il LAB è un documento a parte: se in questa pagina non è passato niente,
     si chiede al server l'ultimo trace salvato dalla chat vera. */
  useEffect(() => {
    if (lastChatTrace()) return;
    let live = true;
    void loadLastPersistedTrace().then((saved) => {
      if (live && saved && !lastChatTrace()) setTrace(saved);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!trace) {
    return (
      <Notice title="NESSUNO SCAMBIO DA MOSTRARE">
        Vai in chat, scrivi qualcosa e torna qui: compare il percorso dell’ultima risposta.
      </Notice>
    );
  }

  return (
    <>
      <Section title="ULTIMO SCAMBIO">
        <Rows
          rows={[
            ['PERCORSO', trace.path === 'strumenti' ? 'con strumenti' : 'diretto'],
            ['ESITO', trace.error ? `fallito — ${trace.error}` : 'risposto'],
            ['MODELLO', trace.model ?? '—'],
            ['EFFORT', trace.effort ?? '—'],
            ['VOCE DEL .MON', trace.characterVoice ? 'sì' : 'no'],
            ['SYSTEM', `${trace.systemChars} caratteri`],
          ]}
        />
      </Section>

      {trace.personality && (
        <Section title="PERSONA">
          <Rows
            rows={[
              ['.MON', trace.personality.monName],
              ['VOICE PRESET', trace.personality.voicePreset],
            ]}
          />
        </Section>
      )}

      {trace.contextSelection?.length ? (
        <Section title="SELEZIONE DEL CONTESTO">
          <Rows rows={trace.contextSelection.map(item => [`${item.source} · ${item.id}`, `${item.reason} · ${item.chars} caratteri`])} />
        </Section>
      ) : null}
      {trace.systemPromptComposition?.length ? (
        <Section title="COMPOSIZIONE DEL SYSTEM" note="Quanto pesa ogni blocco. Il testo non viene conservato né mostrato.">
          <Rows rows={trace.systemPromptComposition.map((block) => [block.name, `${block.chars} caratteri`])} />
        </Section>
      ) : null}

      {trace.steps?.length ? (
        <Section title="PASSI">
          <Rows rows={trace.steps.map((step, index) => [`${index + 1}. ${step.label}`, `${step.detail} · ${step.ms}ms`])} />
        </Section>
      ) : null}
    </>
  );
}

export function TraceLab({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<View>('exchange');

  return (
    <div className="app">
      <LabStyle css={systemCss} />
      <LabTop
        tabs={[
          { id: 'exchange', label: 'SCAMBIO' },
          { id: 'live', label: 'LIVE DEBUG' },
        ]}
        active={view}
        onTab={(id) => setView(id as View)}
        onBack={onBack}
      />

      <main>
        <PageHead
          kicker="TRACE"
          title="Cosa è successo davvero"
          lead="Il percorso dell'ultima risposta e lo stato vivo del thread. Osservabilità, non prodotto quotidiano."
        />
        {view === 'exchange' ? <ExchangeTrace /> : <LiveDebug />}
        <div className="footer mono">TRACE.LAB · OBSERVABILITY / NOT A DAILY SURFACE</div>
      </main>
    </div>
  );
}
