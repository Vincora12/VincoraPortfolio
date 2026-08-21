import { FormEvent, useEffect, useRef, useState } from 'react';
import { streamReply } from './stream';
import { appendMessage, loadBrain } from './store/client';
import { EMPTY_BRAIN, type BrainMessage, type BrainState } from './store/types';
import { Markdown } from '../system/Markdown';

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

export function Brain({ embedded = false }: { embedded?: boolean }) {
  const [state, setState] = useState<BrainState>(EMPTY_BRAIN);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState<{ name: string; mediaType: string; data: string } | null>(null);
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
    if ((!text && !image) || busy) return;

    const conversationId = active?.id ?? id('thread');
    const userMessage: BrainMessage = {
      id: id('msg'),
      ts: new Date().toISOString(),
      role: 'user',
      content: text || 'Analizza questa immagine.',
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
      await streamReply(messages, text || 'Analizza questa immagine.', controller.signal, (chunk) => {
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
      }, image ? { mediaType: image.mediaType, data: image.data } : undefined);
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
      setImage(null);
      abort.current = null;
    }
  }

  function stop() {
    abort.current?.abort();
    setBusy(false);
  }

  return (
    <main className={`brain ${embedded ? 'brain--embedded' : ''}`}>
      <header className="brain__header">
        <h1>VINZ.MON</h1>
        <span>ASSISTENTE PERSONALE</span>
      </header>

      <section className="brain__messages" aria-live="polite">
        {loading && <div className="brain__loading">CARICAMENTO…</div>}
        {!loading && messages.length === 0 && (
          <div className="brain__empty">
            <strong>Come posso aiutarti?</strong>
            <p>Conversazione, domande, idee e ricerca sul web.</p>
          </div>
        )}
        {messages.map((message, index) => (
          <article className={`brain__message brain__message--${message.role}`} key={index}>
            <span>{message.role === 'user' ? 'TU' : 'BRAIN'}</span>
            <div className="brain__bubble">
              {message.role === 'assistant' ? (
                <Markdown source={message.content} />
              ) : (
                <p>{message.content}</p>
              )}
              {message.interrupted && <small>[INTERROTTA]</small>}
            </div>
          </article>
        ))}
        {error && <p className="brain__error">{error}</p>}
        <div ref={end} />
      </section>

      <form className="brain__composer" onSubmit={send}>
        {image && (
          <div className="brain__attachment">
            <span>{image.name}</span>
            <button type="button" onClick={() => setImage(null)}>RIMUOVI</button>
          </div>
        )}
        <label className="brain__attach">
          <span aria-hidden="true">＋</span><span className="sr-only">Allega immagine</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            disabled={busy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (!file) return;
              if (file.size > 5 * 1024 * 1024) {
                setError('L’immagine supera 5 MB.');
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                const value = String(reader.result ?? '');
                setImage({ name: file.name, mediaType: file.type, data: value.split(',')[1] ?? '' });
              };
              reader.readAsDataURL(file);
            }}
          />
        </label>
        <textarea
          aria-label="Messaggio"
          placeholder="Chiedi qualsiasi cosa…"
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
          <button type="submit" disabled={!draft.trim() && !image}>INVIA</button>
        )}
      </form>
    </main>
  );
}
