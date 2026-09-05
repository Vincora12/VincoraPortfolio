/* ============================================================================
   AGENT.LAB — il pannello di chat, riusato in due posti

   🔒 UNA SOLA IMPLEMENTAZIONE, DUE MONTAGGI. La stanza AGENT.LAB (chat
   principale, nessun contesto) e il modal aperto da un nodo del FLOW di
   CREATION.LAB (chat con contesto) usano esattamente questo componente — non
   due copie della stessa logica di invio/storico/errori.

   ⚠️ NON RIUSA `IntegratedChat` (la chat vera di VINZ.MON,
   `src/assistant-original/`). Tracciato prima di scrivere questo file:
   `IntegratedChat` porta un adattatore di storico a livello di MODULO
   (`persistentThreadAdapter`, `IntegratedChat.tsx`) con un prefisso fisso —
   montarne una seconda istanza qui dentro leggerebbe/scriverebbe lo STESSO
   storico della chat reale del .mon, non uno separato. Questo pannello ha il
   proprio storico, sotto una propria chiave di `localStorage`, e non tocca
   in nessun modo lo stato o lo storage della chat vera — G5 (nessuna
   regressione della chat del MON) è garantito così, non per fortuna.

   🔒 CHI ESEGUE COSA. Nessuno strumento gira qui nel browser: il server
   (`netlify/functions/agent-lab.ts`) legge il progetto ed esegue l'intero
   giro strumenti prima di rispondere — questo componente manda un messaggio
   e riceve un testo finito, come qualunque altra chiamata a `/api/ai`.
   ========================================================================= */

import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../state/store';
import { askAgentLab, type AgentLabRequest } from '../../ai/backend';
import { Btn, Notice } from './parts';

export interface AgentLabStepContext {
  stepId?: string;
  stepLabel?: string;
  stepDetail?: string;
  stepPhase?: string;
}

type ChatEntry = { role: 'user' | 'assistant'; text: string; toolTrace?: { name: string; ok: boolean }[] };

function readStored(key: string | undefined): ChatEntry[] {
  if (!key) return [];
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? (parsed as ChatEntry[]) : [];
  } catch {
    return [];
  }
}

function writeStored(key: string | undefined, entries: ChatEntry[]): void {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(entries.slice(-40)));
  } catch {
    /* storage pieno o non disponibile: la chat resta solo in memoria per questa sessione */
  }
}

/* Le quattro etichette dell'ESPLICABILITÀ (§ del task): un badge, non un
   giudizio nuovo — è il modello a scriverle nel testo, questo componente si
   limita a farle risaltare invece di lasciarle annegare nella prosa. */
const EXPLAIN_TAG = /\[(DERIVATO DALL'UTENTE|EREDITATO DAL MON|GENERATO\/STOCASTICO|NON DETERMINABILE)\]/g;

function renderWithTags(text: string) {
  const parts: (string | { tag: string })[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(EXPLAIN_TAG)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push(text.slice(lastIndex, index));
    parts.push({ tag: match[1] ?? '' });
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.map((part, i) =>
    typeof part === 'string'
      ? <span key={i} style={{ whiteSpace: 'pre-wrap' }}>{part}</span>
      : <span key={i} className="agentlab-chip agentlab-tag">{part.tag}</span>,
  );
}

export function AgentLabChat({ context, persistKey }: { context?: AgentLabStepContext | null; persistKey?: string }) {
  const token = useApp((s) => s.token);
  const storageKey = persistKey ? `vinzmon.agentlab.thread.${persistKey}.v1` : undefined;
  const [history, setHistory] = useState<ChatEntry[]>(() => readStored(storageKey));
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => writeStored(storageKey, history), [storageKey, history]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [history, busy]);

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setError('');
    setBusy(true);
    setDraft('');
    const withUser = [...history, { role: 'user' as const, text }];
    setHistory(withUser);

    const request: AgentLabRequest = {
      message: text,
      messages: history.map(({ role, text: t }) => ({ role, text: t })),
      context: context ?? null,
    };
    const result = await askAgentLab(token, request);
    setBusy(false);
    if (!result.data) {
      setError(
        result.failure === 'no-token'
          ? 'Prima attiva VINZ.MON: Agent.lab usa la stessa chiave dell’app.'
          : (result.detail ?? 'Richiesta non riuscita. Riprova.'),
      );
      return;
    }
    setHistory([...withUser, { role: 'assistant', text: result.data.text, toolTrace: result.data.toolTrace }]);
  };

  return (
    <div className="agentlab-chat">
      {context && (context.stepId || context.stepLabel) && (
        <Notice title={`CONTESTO — ${context.stepLabel ?? context.stepId ?? ''}`}>
          {context.stepDetail ?? 'Passo del FLOW di CREATION.LAB. Chiedi come funziona davvero: Agent.lab verifica nel codice, non ripete questa descrizione.'}
        </Notice>
      )}

      <div className="agentlab-msglist" ref={listRef}>
        {history.length === 0 && (
          <p className="note">
            Fai una domanda su come funziona davvero il progetto. Agent.lab legge il codice reale
            prima di rispondere — non spiega a memoria.
          </p>
        )}
        {history.map((entry, i) => (
          <div className={`agentlab-msg agentlab-msg--${entry.role}`} key={i}>
            <span className="agentlab-msg__who mono">{entry.role === 'user' ? 'TU' : 'AGENT.LAB'}</span>
            <div className="agentlab-msg__text">{renderWithTags(entry.text)}</div>
            {entry.toolTrace && entry.toolTrace.length > 0 && (
              <div className="agentlab-msg__trace mono">
                {entry.toolTrace.map((t, j) => (
                  <span key={j} className={`agentlab-chip${t.ok ? '' : ' agentlab-trace--error'}`}>
                    {t.name}{t.ok ? '' : ' ✕'}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <p className="note">Agent.lab sta leggendo il progetto…</p>}
      </div>

      {error && <Notice title="AGENT.LAB NON RISPONDE">{error}</Notice>}

      <div className="agentlab-composer">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Come funziona davvero...? Quali file lo controllano? Da dove arrivano gli input?"
          rows={3}
          disabled={busy}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
      </div>
      <Btn onClick={() => void send()} disabled={busy || draft.trim().length === 0} variant="dark">
        {busy ? 'LEGGO IL PROGETTO…' : 'INVIA'}
      </Btn>
    </div>
  );
}
