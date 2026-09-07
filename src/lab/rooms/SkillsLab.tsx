/* ============================================================================
   SKILLS.LAB — le capacità installabili di VINZ

   Due viste sole: quello che è installato, e la banca da cui si installa.

   🔒 SI ISPEZIONA PRIMA DI INSTALLARE. Una skill è codice e istruzioni scritte
   da altri: il dettaglio mostra sorgente, elenco dei file, se contiene script e
   il testo di SKILL.md prima che tu decida. Dopo l'installazione la skill nasce
   SPENTA; accenderla è un gesto separato.

   ⚠️ COSA NON FA, DETTO CHIARO. VINZ non esegue gli script di una skill e non
   concede niente automaticamente — shell, filesystem, rete e segreti restano
   fuori. Le skill installate non entrano ancora nel prompt della chat: questa
   stanza le porta sul Mac e le governa, il collegamento al runtime è il passo
   successivo. È scritto anche in `docs/VINZ_CURRENT_SIMPLIFICATION.md`.
   ========================================================================= */

import { useCallback, useEffect, useState } from 'react';

import { useApp } from '../../state/store';
import { LabStyle } from '../embed/LabStyle';
import skillsCss from '../skin/skills.css?inline';
import systemCss from '../skin/system.css?inline';
import { Btn, LabTop, Notice, PageHead, Section } from './parts';

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

interface InstalledSkill extends StoreSkill {
  repo: string;
  ref: string;
  installedAt: string;
  enabled: boolean;
}

const TABS = [
  { id: 'installed', label: 'INSTALLED' },
  { id: 'store', label: 'STORE' },
];

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

function ScriptFlag({ has }: { has: boolean }) {
  return has ? <strong>CONTIENE SCRIPT</strong> : <>nessuno script</>;
}

export function SkillsLab({ onBack }: { onBack: () => void }) {
  const token = useApp((state) => state.token);
  const [tab, setTab] = useState('installed');
  const [installed, setInstalled] = useState<InstalledSkill[]>([]);
  const [store, setStore] = useState<StoreSkill[]>([]);
  const [detail, setDetail] = useState<{ skill: StoreSkill; manifest: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');

  const loadInstalled = useCallback(async () => {
    setInstalled((await api<{ skills: InstalledSkill[] }>(token, '?op=installed')).skills);
  }, [token]);

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Operazione non riuscita.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void run(loadInstalled);
  }, [run, loadInstalled]);

  useEffect(() => {
    if (tab !== 'store' || store.length) return;
    void run(async () => {
      setStore((await api<{ skills: StoreSkill[] }>(token, '?op=store')).skills);
    });
  }, [tab, store.length, token, run]);

  const installedKeys = new Set(installed.map((skill) => `${skill.sourceId}/${skill.id}`));
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? store.filter((skill) => `${skill.name} ${skill.description}`.toLowerCase().includes(needle))
    : store;

  return (
    <div className="app">
      <LabStyle css={`${systemCss}\n${skillsCss}`} />
      <LabTop tabs={TABS} active={tab} onTab={setTab} onBack={onBack} />
      <main>
        <PageHead
          kicker="SKILLS"
          title="Capacità di VINZ"
          lead="Una skill è una procedura: come VINZ fa una cosa. Non è memoria, non è identità, non è uno strumento."
        />

        {error && <Notice title="ERRORE">{error}</Notice>}
        {notice && <Notice title="FATTO">{notice}</Notice>}

        {tab === 'installed' && (
          <Section
            title="INSTALLATE"
            note="Una skill installata nasce spenta. VINZ non esegue i suoi script e non le passa ancora al prompt della chat."
          >
            {!installed.length && !busy && <p className="note">Nessuna skill installata. Vai in STORE.</p>}
            {installed.map((skill) => (
              <article className="skill" key={`${skill.sourceId}/${skill.id}`}>
                <p className="skill__name">{skill.name}</p>
                <p className="skill__meta">
                  {skill.sourceLabel} · {skill.repo} · {skill.enabled ? 'ATTIVA' : 'SPENTA'} ·{' '}
                  <ScriptFlag has={skill.hasScripts} />
                </p>
                {skill.description && <p className="skill__desc">{skill.description}</p>}
                <div className="skill__actions">
                  <Btn
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api(token, '', {
                          action: skill.enabled ? 'disable' : 'enable',
                          id: skill.id,
                          sourceId: skill.sourceId,
                        });
                        await loadInstalled();
                      })
                    }
                  >
                    {skill.enabled ? 'DISATTIVA' : 'ATTIVA'}
                  </Btn>
                  <Btn
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        if (!window.confirm(`Disinstallare «${skill.name}»? I file vengono eliminati dal Mac.`)) return;
                        await api(token, '', { action: 'uninstall', id: skill.id, sourceId: skill.sourceId });
                        await loadInstalled();
                        setNotice(`«${skill.name}» disinstallata.`);
                      })
                    }
                  >
                    DISINSTALLA
                  </Btn>
                </div>
              </article>
            ))}
          </Section>
        )}

        {tab === 'store' && (
          <Section
            title="STORE"
            note="Sorgenti pubbliche in formato SKILL.md. Il catalogo lo legge il Mac, non il browser."
          >
            <div className="skill-search">
              <span className="mono">CERCA</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="nome o descrizione"
                aria-label="Cerca una skill"
              />
            </div>

            {!store.length && busy && <p className="note">Carico il catalogo…</p>}
            {!!store.length && !filtered.length && <p className="note">Nessuna skill con questo testo.</p>}

            {filtered.map((skill) => (
              <article className="skill" key={`${skill.sourceId}/${skill.id}`}>
                <p className="skill__name">{skill.name}</p>
                <p className="skill__meta">
                  {skill.sourceLabel} · {skill.files.length} file · {sizeLabel(skill.bytes)} ·{' '}
                  <ScriptFlag has={skill.hasScripts} />
                  {installedKeys.has(`${skill.sourceId}/${skill.id}`) ? ' · INSTALLATA' : ''}
                </p>
                {skill.description && <p className="skill__desc">{skill.description}</p>}
                <div className="skill__actions">
                  <Btn
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        setDetail(
                          await api<{ skill: StoreSkill; manifest: string }>(
                            token,
                            `?op=inspect&sourceId=${encodeURIComponent(skill.sourceId)}&id=${encodeURIComponent(skill.id)}`,
                          ),
                        );
                      })
                    }
                  >
                    ISPEZIONA
                  </Btn>
                </div>
              </article>
            ))}
          </Section>
        )}

        <div className="footer mono">SKILLS.LAB · INSPECT BEFORE INSTALL / NOTHING RUNS BY ITSELF</div>
      </main>

      {detail && (
        <div className="skill-sheet" role="dialog" aria-modal="true" aria-label={detail.skill.name}>
          <div className="skill-sheet__panel">
            <div className="skill-sheet__head">
              <h2>{detail.skill.name}</h2>
              <button type="button" className="skill-sheet__close" onClick={() => setDetail(null)} aria-label="Chiudi">
                ×
              </button>
            </div>

            <Section title="PROVENIENZA">
              <p className="skill__meta">
                {detail.skill.sourceLabel} · {sizeLabel(detail.skill.bytes)} · <ScriptFlag has={detail.skill.hasScripts} />
              </p>
              <p className="skill__desc">
                <a href={detail.skill.homepage} target="_blank" rel="noreferrer noopener">
                  {detail.skill.homepage}
                </a>
              </p>
              {detail.skill.description && <p className="skill__desc">{detail.skill.description}</p>}
            </Section>

            <Section title="FILE" note="Questi file vengono scritti sul Mac. Nessuno viene eseguito.">
              <pre className="skill-files">{detail.skill.files.join('\n')}</pre>
            </Section>

            <Section title="SKILL.MD" note="Le istruzioni della skill, così come sono scritte all'origine.">
              <pre className="skill-manifest">{detail.manifest.slice(0, 6000)}</pre>
            </Section>

            <div className="skill__actions">
              <Btn
                variant="dark"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await api(token, '', { action: 'install', id: detail.skill.id, sourceId: detail.skill.sourceId });
                    await loadInstalled();
                    setDetail(null);
                    setTab('installed');
                    setNotice(`«${detail.skill.name}» installata e spenta. Accendila quando vuoi.`);
                  })
                }
              >
                INSTALLA — RESTA SPENTA
              </Btn>
              <Btn disabled={busy} onClick={() => setDetail(null)}>
                ANNULLA
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
