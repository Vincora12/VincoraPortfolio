/* ============================================================================
   AGGIUNGI UNA SKILL — solo lo store, dentro MIND

   🔷 «Lo store delle skill non mi piace, non mi sembra intuitivo. Poi è nel
   Lab ma va tolto da lì: deve essere un pop up con solo lo store, che si apre
   quando clicco "Aggiungi una skill".»

   🔴 PRIMA ERA "SKILLS.LAB" INTERO: una pagina con la navigazione di LAB
   intorno, due schede (INSTALLATE/STORE) da capire prima ancora di cercare
   qualcosa, e una scheda di dettaglio che apriva un elenco file grezzo e il
   testo integrale di SKILL.md come prima cosa. Chi cercava «aggiungi una
   skill» doveva prima orientarsi nel Lab, poi scegliere la scheda giusta.

   🔒 QUESTO POP UP FA UNA COSA SOLA. Cerchi, guardi una scheda, installi.
   Le skill già installate — accenderle, spegnerle — restano native in
   `MindPanel`, dove già vivono nella stessa lista di THINK e ACT: gestirle
   non è "aggiungere", è la superficie quotidiana che già esiste.

   ⚠️ L'ISPEZIONE PRIMA DI INSTALLARE RESTA, cambia solo la forma. Una skill è
   codice e istruzioni scritte da altri — VINZ non esegue i suoi script e non
   le concede niente finché non la accendi — e quella garanzia non si toglie
   per sembrare più semplice. Qui è un passo dentro lo stesso pop up, non una
   pagina a parte con un dump di file.
   ========================================================================= */

import { useEffect, useState } from 'react';

import './daily.css';

interface StoreSkill {
  id: string;
  sourceId: string;
  sourceLabel: string;
  name: string;
  description: string;
  homepage: string;
  files: string[];
  hasScripts: boolean;
  bytes: number;
}

async function api<T>(token: string | null, query: string, body?: unknown): Promise<T> {
  if (!token) throw new Error('VINZ.MON non è attivo: manca il token.');
  const response = await fetch(`/api/skills${query}`, {
    method: body ? 'POST' : 'GET',
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  });
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || !data) throw new Error(data?.error ?? `Richiesta non riuscita (${response.status}).`);
  return data;
}

function sizeLabel(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

export function SkillStore({ token, onClose, onInstalled }: { token: string | null; onClose: () => void; onInstalled: () => void }) {
  const [store, setStore] = useState<StoreSkill[] | null>(null);
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<{ skill: StoreSkill; manifest: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setError('');
    api<{ skills: StoreSkill[] }>(token, '?op=store')
      .then((body) => { if (live) setStore(body.skills); })
      .catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : 'Catalogo non raggiungibile.'); });
    return () => { live = false; };
  }, [token]);

  const needle = query.trim().toLowerCase();
  const results = !store ? [] : needle
    ? store.filter((skill) => `${skill.name} ${skill.description}`.toLowerCase().includes(needle))
    : store;

  async function inspect(skill: StoreSkill) {
    setBusy(true);
    setError('');
    try {
      const body = await api<{ skill: StoreSkill; manifest: string }>(
        token,
        `?op=inspect&sourceId=${encodeURIComponent(skill.sourceId)}&id=${encodeURIComponent(skill.id)}`,
      );
      setDetail(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ispezione non riuscita.');
    } finally {
      setBusy(false);
    }
  }

  async function install(skill: StoreSkill) {
    setBusy(true);
    setError('');
    try {
      await api(token, '', { action: 'install', id: skill.id, sourceId: skill.sourceId });
      setDetail(null);
      onInstalled();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Installazione non riuscita.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="daily-skills-overlay" role="dialog" aria-modal="true" aria-label="Aggiungi una skill">
      <button type="button" className="daily-skills-overlay__close" onClick={onClose}>
        CHIUDI ✕
      </button>

      {!detail ? (
        <div className="skillstore">
          <h2 className="skillstore__title">Aggiungi una skill</h2>
          <p className="skillstore__lead">
            Una skill è una procedura: come VINZ fa una cosa. Nasce spenta e non esegue niente da sola.
          </p>

          <input
            className="skillstore__search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca per nome o descrizione…"
            aria-label="Cerca una skill"
            autoFocus
          />

          {error && <p className="daily-panel__error" role="alert">{error}</p>}
          {!store && !error && <p className="daily-panel__meta">Carico il catalogo…</p>}
          {store && !results.length && <p className="daily-panel__empty">Nessuna skill trovata con questo testo.</p>}

          <ul className="daily-list skillstore__list">
            {results.map((skill) => (
              <li key={`${skill.sourceId}/${skill.id}`} className="daily-row">
                <div className="daily-row__main">
                  <p className="daily-row__title">{skill.name}</p>
                  {skill.description && <p className="daily-row__meta">{skill.description}</p>}
                  <p className="daily-row__meta">
                    {skill.sourceLabel} · {sizeLabel(skill.bytes)}{skill.hasScripts ? ' · contiene script' : ''}
                  </p>
                </div>
                <button type="button" className="daily-row__action" disabled={busy} onClick={() => void inspect(skill)}>
                  Aggiungi
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="skillstore">
          <button type="button" className="daily-panel__ghost skillstore__back" onClick={() => setDetail(null)}>
            ← Torna alla ricerca
          </button>

          <h2 className="skillstore__title">{detail.skill.name}</h2>
          {detail.skill.description && <p className="skillstore__lead">{detail.skill.description}</p>}

          <p className="daily-row__meta">
            {detail.skill.sourceLabel} · {detail.skill.files.length} file · {sizeLabel(detail.skill.bytes)}
            {detail.skill.hasScripts ? ' · CONTIENE SCRIPT' : ' · nessuno script'}
          </p>

          {/* 🔒 Prima di installare: cosa c'è dentro, non dopo. Chiusa di
              default — la trasparenza non deve significare aprire un dump
              di codice appena arrivi qui. */}
          <details className="skillstore__manifest">
            <summary>Leggi SKILL.md prima di installare</summary>
            <pre>{detail.manifest.slice(0, 6000) || '(nessuna descrizione trovata all’origine)'}</pre>
          </details>

          {error && <p className="daily-panel__error" role="alert">{error}</p>}

          <div className="skillstore__actions">
            <button type="button" className="daily-row__action" disabled={busy} onClick={() => void install(detail.skill)}>
              Installa — resta spenta
            </button>
            <button type="button" className="daily-panel__ghost" disabled={busy} onClick={() => setDetail(null)}>
              Annulla
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
