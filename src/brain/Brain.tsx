import { FormEvent, useEffect, useRef, useState } from 'react';
import { streamReply, type BrainTurn } from './stream';

export function Brain() {
  const [messages, setMessages] = useState<BrainTurn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const end = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(event: FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;

    const history = [...messages, { role: 'user' as const, content: text }];
    setMessages([...history, { role: 'assistant', content: '' }]);
    setDraft('');
    setError(null);
    setBusy(true);
    abort.current = new AbortController();

    try {
      await streamReply(messages, text, abort.current.signal, (chunk) => {
        setMessages((current) => {
          const next = [...current];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, content: last.content + chunk };
          return next;
        });
      });
    } catch (cause) {
      if (!abort.current.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'La risposta si è interrotta.');
      }
    } finally {
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
        {messages.length === 0 && (
          <div className="brain__empty">
            <strong>Nessuna memoria. Nessuna personalità.</strong>
            <p>Solo una conversazione in streaming, isolata da VINZ.MON.</p>
          </div>
        )}
        {messages.map((message, index) => (
          <article className={`brain__message brain__message--${message.role}`} key={index}>
            <span>{message.role === 'user' ? 'TU' : 'BRAIN'}</span>
            <p>{message.content || (busy && index === messages.length - 1 ? '▌' : '')}</p>
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
