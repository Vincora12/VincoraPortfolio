import { FormEvent, useEffect, useRef, useState } from 'react';
import { streamReply } from './stream';
import { appendMessage, loadBrain } from './store/client';
import { EMPTY_BRAIN, type BrainMessage, type BrainState } from './store/types';

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

export function Brain() {
  const [state, setState] = useState<BrainState>(EMPTY_BRAIN);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement | null>(null);
  const active = state.conversations.find((item) => item.id === state.activeConversationId);
  const messages = active?.messages ?? [];

  useEffect(() => {
    void loadBrain().then(setState).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;

    const conversationId = active?.id ?? id('thread');
    const userMessage: BrainMessage = {
      id: id('msg'),
      ts: new Date().toISOString(),
      role: 'user',
      content: text,
    };
    setDraft('');
    setError(null);
    setBusy(true);
    const withUser = await appendMessage(state, conversationId, userMessage);
    setState(withUser);
    const controller = new AbortController();
    abort.current = controller;
    let answer = '';

    try {
      await streamReply(messages, text, controller.signal, (chunk) => {
        answer += chunk;
        setState((current) => {
          const next = structuredClone(current);
          const conversation = next.conversations.find((item) => item.id === conversationId);
          if (!conversation) return current;
          const existing = conversation.messages.find((item) => item.id === 'streaming');
          if (existing) existing.content = answer;
          else conversation.messages.push({ id: 'streaming', ts: new Date().toISOString(), role: 'assistant', content: answer });
          return next;
        });
      });
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'La risposta si è interrotta.');
      }
    } finally {
      if (answer.trim()) {
        const assistantMessage: BrainMessage = {
          id: id('msg'),
          ts: new Date().toISOString(),
          role: 'assistant',
          content: answer,
          ...(controller.signal.aborted ? { interrupted: true } : {}),
        };
        setState(await appendMessage(withUser, conversationId, assistantMessage));
      } else setState(withUser);
      setBusy(false);
      abort.current = null;
    }
  }

  function stop() {
    abort.current?.abort();
    setBusy(false);
  }

  return (
    <main className="brain">
      <header className="brain__header">
        <h1>BRAIN LAB</h1>
        <span>V0 · SOLO CONVERSAZIONE</span>
      </header>

      <section className="brain__messages" aria-live="polite">
        {loading && <div className="brain__loading">CARICAMENTO…</div>}
        {!loading && messages.length === 0 && (
          <div className="brain__empty">
            <strong>Nessuna memoria. Nessuna personalità.</strong>
            <p>Solo una conversazione in streaming, isolata da VINZ.MON.</p>
          </div>
        )}
        {messages.map((message, index) => (
          <article className={`brain__message brain__message--${message.role}`} key={index}>
            <span>{message.role === 'user' ? 'TU' : 'BRAIN'}</span>
            <p>{message.content}{message.interrupted ? '\n\n[INTERROTTA]' : ''}</p>
          </article>
        ))}
        {error && <p className="brain__error">{error}</p>}
        <div ref={end} />
      </section>

      <form className="brain__composer" onSubmit={send}>
        <textarea
          aria-label="Messaggio"
          placeholder="Scrivi qualcosa…"
          rows={2}
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
        />
        {busy ? (
          <button type="button" onClick={stop}>STOP</button>
        ) : (
          <button type="submit" disabled={!draft.trim()}>INVIA</button>
        )}
      </form>
    </main>
  );
}
