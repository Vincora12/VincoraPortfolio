import { FormEvent, useEffect, useRef, useState } from 'react';
import { replyWithLocalTools, shouldUseLocalTools, streamReply } from './stream';
import { appendMessage, loadBrain } from './store/client';
import { EMPTY_BRAIN, type BrainMessage, type BrainState } from './store/types';
import { Markdown } from '../system/Markdown';
import type { ToolResult, ToolUse } from '../ai/tools';

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;
}

export function Brain({
  embedded = false,
  runTool,
}: {
  embedded?: boolean;
  runTool?: (use: ToolUse) => ToolResult;
}) {
  const [state, setState] = useState<BrainState>(EMPTY_BRAIN);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState<{ name: string; mediaType: string; data: string } | null>(null);
  const [document, setDocument] = useState<{ name: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showThreads, setShowThreads] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
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
    if ((!text && !image && !document) || busy) return;

    const conversationId = active?.id ?? id('thread');
    const userMessage: BrainMessage = {
      id: id('msg'),
      ts: new Date().toISOString(),
      role: 'user',
      content: text || (image ? 'Analizza questa immagine.' : 'Analizza questo documento.'),
      ...(document ? {
        context: `FILE: ${document.name}\n${document.text}`,
        attachment: { kind: 'document' as const, name: document.name },
      } : image ? {
        attachment: { kind: 'image' as const, name: image.name },
      } : {}),
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
      const prompt = document
        ? `${text || 'Analizza questo documento.'}\n\n[ALLEGATO]\nFILE: ${document.name}\n${document.text}`
        : text || 'Analizza questa immagine.';
      const onChunk = (chunk: string) => {
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
      };

      if (runTool && shouldUseLocalTools(text) && !image && !document) {
        await replyWithLocalTools(
          messages,
          prompt,
          controller.signal,
          onChunk,
          runTool,
        );
      } else {
        await streamReply(
          messages,
          prompt,
          controller.signal,
          onChunk,
          image ? { mediaType: image.mediaType, data: image.data } : undefined,
        );
      }
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
      setDocument(null);
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
        <button className="brain__history" type="button" onClick={() => setShowThreads((value) => !value)}>
          CHAT
        </button>
        <h1>VINZ.MON</h1>
        <button
          className="brain__new"
          type="button"
          onClick={() => {
            setState((current) => ({ ...current, activeConversationId: null }));
            setShowThreads(false);
            setError(null);
          }}
        >
          NUOVA
        </button>
      </header>

      {showThreads && (
        <aside className="brain__threads" aria-label="Conversazioni">
          <div className="brain__threads-head">
            <strong>CONVERSAZIONI</strong>
            <button type="button" onClick={() => setShowThreads(false)}>CHIUDI</button>
          </div>
          {state.conversations.length === 0 ? (
            <p>Nessuna conversazione salvata.</p>
          ) : (
            state.conversations.map((conversation) => (
              <button
                type="button"
                key={conversation.id}
                className={conversation.id === state.activeConversationId ? 'is-active' : ''}
                onClick={() => {
                  setState((current) => ({ ...current, activeConversationId: conversation.id }));
                  setShowThreads(false);
                }}
              >
                <strong>{conversation.title}</strong>
                <small>{new Date(conversation.updatedAt).toLocaleDateString('it-IT')}</small>
              </button>
            ))
          )}
        </aside>
      )}

      <section className="brain__messages" aria-live="polite">
        {loading && <div className="brain__loading">CARICAMENTO…</div>}
        {!loading && messages.length === 0 && (
          <div className="brain__empty">
            <strong>Come posso aiutarti?</strong>
            <p>Conversazione, domande, idee e ricerca sul web.</p>
          </div>
        )}
        {messages.map((message, index) => (
          <article className={`brain__message brain__message--${message.role}`} key={message.id || index}>
            <span>{message.role === 'user' ? 'TU' : 'BRAIN'}</span>
            <div className="brain__bubble">
              {message.role === 'assistant' ? (
                <Markdown source={message.content} />
              ) : (
                <>
                  {message.attachment && <small className="brain__file">{message.attachment.name}</small>}
                  <p>{message.content}</p>
                </>
              )}
              {message.interrupted && <small>[INTERROTTA]</small>}
            </div>
            {message.role === 'assistant' && message.id !== 'streaming' && (
              <button
                type="button"
                className="brain__copy"
                onClick={() => {
                  void navigator.clipboard.writeText(message.content).then(() => {
                    setCopied(message.id);
                    window.setTimeout(() => setCopied(null), 1200);
                  });
                }}
              >
                {copied === message.id ? 'COPIATO' : 'COPIA'}
              </button>
            )}
          </article>
        ))}
        {error && (
          <div className="brain__error" role="alert">
            <p>{error}</p>
            {messages.at(-1)?.role === 'user' && (
              <button
                type="button"
                onClick={() => {
                  setDraft(messages.at(-1)?.content ?? '');
                  setError(null);
                }}
              >
                RIPROVA
              </button>
            )}
          </div>
        )}
        <div ref={end} />
      </section>

      <form className="brain__composer" onSubmit={send}>
        {(image || document) && (
          <div className="brain__attachment">
            <span>{image?.name ?? document?.name}</span>
            <button type="button" onClick={() => { setImage(null); setDocument(null); }}>RIMUOVI</button>
          </div>
        )}
        <label className="brain__attach">
          <span aria-hidden="true">＋</span><span className="sr-only">Allega immagine</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,text/plain,text/markdown,text/csv,application/json"
            disabled={busy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (!file) return;
              if (file.size > 5 * 1024 * 1024) {
                setError('L’allegato supera 5 MB.');
                return;
              }
              if (!file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = () => {
                  const text = String(reader.result ?? '');
                  if (text.length > 9_000) setError('Documento abbreviato ai primi 9.000 caratteri.');
                  setDocument({ name: file.name, text: text.slice(0, 9_000) });
                  setImage(null);
                };
                reader.readAsText(file);
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
          <button type="submit" disabled={!draft.trim() && !image && !document}>INVIA</button>
        )}
      </form>
    </main>
  );
}
