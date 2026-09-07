/* ============================================================================
   LA CHAT DI Vinz.mon_v2

   Una conversazione vera: i messaggi si salvano, sopravvivono al refresh e la
   risposta arriva da un motore reale — LobeHub se configurato e raggiungibile,
   altrimenti il Local Core di VINZ.

   🔒 SE NESSUN MOTORE RISPONDE non si inventa niente: la composizione si
   disabilita e la barra in testa dice cosa manca. Il resto di V2 (MON, ME,
   SYNC) continua a funzionare.
   ========================================================================= */

import { useCallback, useEffect, useRef, useState } from 'react';

import { Markdown } from '@/system/Markdown';

import type { ChatEngine, EngineId, HealthState } from '../chat/engine';
import { lobehubEngine } from '../chat/lobehub';
import {
  appendMessage,
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  subscribe,
} from '../chat/store';
import { newId, type V2Conversation, type V2ToolRun } from '../chat/types';
import { vinzCoreEngine } from '../chat/vinzCore';
import { ActivityLog, WorkingRow } from './Activity';

const ENGINES: Record<EngineId, ChatEngine> = {
  'lobehub': lobehubEngine,
  'vinz-core': vinzCoreEngine,
};

const ACTIVE_KEY = 'vinzmon.v2.activeConversation';

interface Pending {
  startedAt: number;
  runs: V2ToolRun[];
}

export function V2Chat() {
  const [conversations, setConversations] = useState<V2Conversation[]>(() => listConversations());
  const [activeId, setActiveId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_KEY);
    } catch {
      return null;
    }
  });
  const [health, setHealth] = useState<Partial<Record<EngineId, HealthState>>>({});
  const [engineId, setEngineId] = useState<EngineId | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [draft, setDraft] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => subscribe(() => setConversations(listConversations())), []);

  useEffect(() => {
    try {
      if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* niente: la conversazione resta selezionata per questa sessione. */
    }
  }, [activeId]);

  /* Chi risponde: LobeHub se c'è ed è vivo, altrimenti il Core. La scelta è
     automatica al primo giro e poi resta quella scelta a mano. */
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const [lobe, core] = await Promise.all([
        lobehubEngine.health(controller.signal),
        vinzCoreEngine.health(controller.signal),
      ]);
      if (controller.signal.aborted) return;
      setHealth({ 'lobehub': lobe, 'vinz-core': core });
      setEngineId((current) => {
        if (current) return current;
        if (lobe.status === 'online') return 'lobehub';
        if (core.status === 'online') return 'vinz-core';
        return null;
      });
    })();
    return () => controller.abort();
  }, []);

  const active = getConversation(activeId);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [active?.messages.length, pending]);

  const engine = engineId ? ENGINES[engineId] : null;
  const engineHealth = engineId ? health[engineId] : undefined;
  const usable = engine !== null && engineHealth?.status === 'online';

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || !engine || pending) return;

    const conversation = active ?? createConversation();
    if (!active) setActiveId(conversation.id);

    appendMessage(conversation.id, { id: newId('m'), role: 'user', text, createdAt: Date.now() });
    setDraft('');

    const started = Date.now();
    const runs: V2ToolRun[] = [];
    setPending({ startedAt: started, runs });

    const controller = new AbortController();
    const turns = [...(getConversation(conversation.id)?.messages ?? [])].map((message) => ({
      role: message.role,
      content: message.text,
    }));

    try {
      const reply = await engine.send({
        turns,
        signal: controller.signal,
        onToolRun: (run) => {
          const index = runs.findIndex((existing) => existing.id === run.id);
          if (index === -1) runs.push({ ...run });
          else runs[index] = { ...run };
          setPending({ startedAt: started, runs: [...runs] });
        },
      });

      appendMessage(conversation.id, {
        id: newId('m'),
        role: 'assistant',
        text: reply.text || '(risposta vuota)',
        createdAt: Date.now(),
        toolRuns: reply.toolRuns.length ? reply.toolRuns : undefined,
        engine: engine.label,
        model: reply.model,
      });
    } catch (error) {
      appendMessage(conversation.id, {
        id: newId('m'),
        role: 'assistant',
        text: error instanceof Error ? error.message : 'Il motore non ha risposto.',
        createdAt: Date.now(),
        engine: engine.label,
        failed: true,
      });
    } finally {
      setPending(null);
    }
  }, [active, draft, engine, pending]);

  return (
    <div className="v2chat">
      <header className="v2chat__bar">
        <button type="button" className="v2chat__barbtn" onClick={() => setListOpen(!listOpen)}>
          {active ? active.title : 'Conversazioni'}
        </button>
        <button
          type="button"
          className="v2chat__barbtn v2chat__barbtn--ghost"
          onClick={() => {
            const conversation = createConversation();
            setActiveId(conversation.id);
            setListOpen(false);
          }}
        >
          NUOVA
        </button>
      </header>

      {listOpen && (
        <ul className="v2chat__list">
          {conversations.length === 0 && <li className="v2chat__empty">Nessuna conversazione.</li>}
          {conversations.map((conversation) => (
            <li key={conversation.id} className="v2chat__listitem">
              <button
                type="button"
                className="v2chat__listbtn"
                onClick={() => {
                  setActiveId(conversation.id);
                  setListOpen(false);
                }}
              >
                {conversation.title}
              </button>
              <button
                type="button"
                className="v2chat__del"
                aria-label={`Elimina ${conversation.title}`}
                onClick={() => {
                  deleteConversation(conversation.id);
                  if (activeId === conversation.id) setActiveId(null);
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <EngineBar health={health} engineId={engineId} onPick={setEngineId} />

      <div className="v2chat__scroll">
        {!active || active.messages.length === 0 ? (
          <p className="v2chat__hint">
            Scrivi qui sotto. Prova «qual è il mio .mon attivo?» per vedere uno strumento VINZ vero.
          </p>
        ) : (
          active.messages.map((message) => (
            <article
              key={message.id}
              className={`v2msg v2msg--${message.role}${message.failed ? ' v2msg--failed' : ''}`}
            >
              {message.role === 'assistant' ? (
                <div className="v2msg__body">
                  <Markdown source={message.text} />
                </div>
              ) : (
                <p className="v2msg__body">{message.text}</p>
              )}
              {message.role === 'assistant' && !message.failed && (
                <ActivityLog runs={message.toolRuns ?? []} engine={message.engine} model={message.model} />
              )}
            </article>
          ))
        )}
        {pending && <WorkingRow startedAt={pending.startedAt} runs={pending.runs} />}
        <div ref={bottom} />
      </div>

      <form
        className="v2chat__composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <textarea
          className="v2chat__input"
          value={draft}
          rows={1}
          placeholder={usable ? 'Scrivi a VINZ.MON' : 'Chat engine unavailable'}
          disabled={!usable || pending !== null}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
        />
        <button type="submit" className="v2chat__send" disabled={!usable || pending !== null || !draft.trim()}>
          INVIA
        </button>
      </form>
    </div>
  );
}

function EngineBar({
  health,
  engineId,
  onPick,
}: {
  health: Partial<Record<EngineId, HealthState>>;
  engineId: EngineId | null;
  onPick: (id: EngineId) => void;
}) {
  const ids: EngineId[] = ['lobehub', 'vinz-core'];
  const current = engineId ? health[engineId] : undefined;
  const broken = !engineId || current?.status !== 'online';

  return (
    <div className={`v2engine ${broken ? 'v2engine--broken' : ''}`}>
      <div className="v2engine__pills">
        {ids.map((id) => {
          const state = health[id];
          return (
            <button
              key={id}
              type="button"
              className={`v2engine__pill ${engineId === id ? 'v2engine__pill--on' : ''}`}
              onClick={() => onPick(id)}
              disabled={state?.status !== 'online'}
              title={state?.detail ?? 'verifica in corso'}
            >
              {ENGINES[id].label}
              <span className={`v2engine__dot v2engine__dot--${state?.status ?? 'checking'}`} />
            </button>
          );
        })}
      </div>
      {broken && (
        <p className="v2engine__msg">
          Chat engine unavailable — {current?.detail ?? 'nessun motore raggiungibile.'} MON, ME e SYNC restano
          disponibili.
        </p>
      )}
    </div>
  );
}
