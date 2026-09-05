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

   🔷 UI ALIGNMENT — «stessa UI della chat del MON, non stesso comportamento.»
   Il corpo sotto (bolle, tipografia, composer, pulsante d'invio) riusa gli
   stessi valori visivi della chat vera (`assistant-original/styles.css`:
   colori del tema scuro, raggio delle bolle, forma del composer a pillola,
   bottone d'invio circolare) — non il componente `<ChatGPT/>` in sé, che
   dentro porta voce/reazioni/memoria/ciclo di vita del thread: tutta roba
   che appartiene al .mon, non ad Agent.lab, e che il confine READ/WRITE di
   questo task vieta di toccare. Stessi NUMERI, non stessa MACCHINA.
   ========================================================================= */

import { useEffect, useRef, useState } from 'react';
import { ArrowUpIcon } from 'lucide-react';
import { useApp } from '../../state/store';
import { askAgentLab, type AgentLabRequest } from '../../ai/backend';
import { Notice } from './parts';

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

/* Il composer cresce con il testo come quello vero (fino a un tetto), invece
   di partire già alto su tre righe vuote — quella era la barra sproporzionata
   da assottigliare. */
function autoGrow(el: HTMLTextAreaElement | null): void {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
}

export function AgentLabChat({ context, persistKey }: { context?: AgentLabStepContext | null; persistKey?: string }) {
  const token = useApp((s) => s.token);
  const storageKey = persistKey ? `vinzmon.agentlab.thread.${persistKey}.v1` : undefined;
  const [history, setHistory] = useState<ChatEntry[]>(() => readStored(storageKey));
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => writeStored(storageKey, history), [storageKey, history]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [history, busy]);
  useEffect(() => autoGrow(inputRef.current), [draft]);

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

  const canSend = !busy && draft.trim().length > 0;

  return (
    <div className="agentlab-chat">
      {context && (context.stepId || context.stepLabel) && (
        <Notice title={`CONTESTO — ${context.stepLabel ?? context.stepId ?? ''}`}>
          {context.stepDetail ?? 'Passo del FLOW di CREATION.LAB. Chiedi come funziona davvero: Agent.lab verifica nel codice, non ripete questa descrizione.'}
        </Notice>
      )}

      <div className="agentlab-thread">
        <div className="agentlab-viewport" ref={listRef}>
          <div className="agentlab-viewport__inner">
            {history.length === 0 && (
              <p className="agentlab-empty">
                Fai una domanda su come funziona davvero il progetto. Agent.lab legge il codice
                reale prima di rispondere — non spiega a memoria.
              </p>
            )}
            {history.map((entry, i) =>
              entry.role === 'user' ? (
                <div className="agentlab-row agentlab-row--user" key={i}>
                  <div className="agentlab-bubble">{renderWithTags(entry.text)}</div>
                </div>
              ) : (
                <div className="agentlab-row agentlab-row--assistant" key={i}>
                  <div className="agentlab-copy">
                    <span className="agentlab-copy__who mono">AGENT.LAB</span>
                    {renderWithTags(entry.text)}
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
                </div>
              ),
            )}
            {busy && (
              <div className="agentlab-row agentlab-row--assistant">
                <div className="agentlab-copy agentlab-copy--thinking">Agent.lab sta leggendo il progetto…</div>
              </div>
            )}
          </div>
        </div>

        <div className="agentlab-composer">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Chiedi qualcosa…"
            rows={1}
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="button"
            className="agentlab-send"
            aria-label="Invia"
            disabled={!canSend}
            onClick={() => void send()}
          >
            <ArrowUpIcon size={18} />
          </button>
        </div>
      </div>

      {error && <Notice title="AGENT.LAB NON RISPONDE">{error}</Notice>}
    </div>
  );
}
