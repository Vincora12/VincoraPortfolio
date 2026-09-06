import { useState } from 'react';

type MemoryItem = { id?: string; text?: string; createdAt?: string; metadata?: Record<string, unknown> };
export type PersonalMemoryProjection = {
  memories?: MemoryItem[];
  counts?: { knowledge?: number; entities?: number; episodes?: number };
  relations?: Array<{ subject: string; predicateLabel: string; object?: string; value?: string }>;
  episodes?: Array<{ summary: string; date?: string; type: string }>;
};

/** Read-only projection of the existing personal memory service, never a second store. */
export function MemoryInspector({ memory, error, retry }: { memory: PersonalMemoryProjection | null; error: string; retry: () => void }) {
  const [query, setQuery] = useState('');
  if (error) return <section className="me-health__section"><h2>MEMORY</h2><p role="alert">{error}</p><button type="button" onClick={retry}>RIPROVA</button></section>;
  if (!memory) return <section className="me-health__section"><h2>MEMORY</h2><p role="status">Caricamento…</p></section>;
  const search = query.trim().toLocaleLowerCase('it-IT');
  const matches = (text: string) => !search || text.toLocaleLowerCase('it-IT').includes(search);
  const memories = (memory.memories ?? []).filter((item) => matches(item.text ?? ''));
  const relations = (memory.relations ?? []).filter((item) => matches(`${item.subject} ${item.predicateLabel} ${item.object ?? item.value ?? ''}`));
  const episodes = (memory.episodes ?? []).filter((item) => matches(item.summary));
  const count = memories.length + relations.length + episodes.length;
  const total = (memory.memories?.length ?? 0) + (memory.relations?.length ?? 0) + (memory.episodes?.length ?? 0);
  return <section className="me-memory me-memory-inspector">
    <header><h2>MEMORY</h2><p>{total} elementi disponibili · {memory.memories ? 'MEMORIA PERSONALE' : 'ME · PROIEZIONE DERIVATA'}</p></header>
    <label>CERCA NELLA MEMORIA CARICATA<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={200} placeholder="Persona, progetto, preferenza…" /></label>
    <p className="me-health__empty">La ricerca filtra i dati già ricevuti. Le interpretazioni non sono fatti verificati. Correzione e cancellazione diretta non sono esposte dal servizio attuale.</p>
    <button type="button" onClick={retry}>AGGIORNA</button>
    {!count && <p className="me-health__empty">{total ? 'Nessun risultato per questa ricerca.' : 'Nessuna memoria disponibile.'}</p>}
    {memories.slice(0, 200).map((item, index) => {
      const source = typeof item.metadata?.source === 'string' ? item.metadata.source : 'NON ESPOSTA';
      return <details className="me-memory__relation" key={item.id ?? index}><summary>{(item.text ?? '').slice(0, 180)}</summary><p>{item.text}</p><small>FONTE: {source} · CONFERMA: NON ESPOSTA</small>{item.createdAt && <small>{new Date(item.createdAt).toLocaleDateString('it-IT')}</small>}</details>;
    })}
    {relations.slice(0, 200).map((item, index) => <article className="me-memory__relation" key={`relation-${index}`}><strong>{item.subject} · {item.predicateLabel} · {item.object || item.value}</strong><small>PROIEZIONE ME · PROVENIENZA NON ESPOSTA</small></article>)}
    {episodes.slice(0, 100).map((item, index) => <details className="me-memory__relation" key={`episode-${index}`}><summary>{item.summary.slice(0, 180)}</summary><p>{item.summary}</p><small>{item.type}{item.date ? ` · ${new Date(item.date).toLocaleDateString('it-IT')}` : ''}</small></details>)}
    {(memories.length > 200 || relations.length > 200 || episodes.length > 100) && <p>Vista limitata. Restringi la ricerca per trovare altri elementi.</p>}
  </section>;
}
