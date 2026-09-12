/* ============================================================================
   FILES — il materiale che ho dato a VINZ

   🔷 «Aggiungi file è già dentro questa cartella, no?» Sì — prima erano due
   sistemi scollegati: un upload che finiva in un blob nel database (ovunque
   raggiungibile ma con un tetto piccolo) e una cartella vera sul Mac che
   VINZ organizzava da solo. Ora sono la stessa cosa: quello che carichi qui
   e quello che VINZ crea vivono nella STESSA cartella reale
   (`~/VinzMon/<progetto>/`, anche per Generale) — vedi
   `netlify/functions/_shared/vinzWorkspace.ts` per la logica vera sul Mac.
   ========================================================================= */

import { useCallback, useEffect, useRef, useState } from 'react';

import { GLOBAL_PROJECT_ID } from '@/engine/projects';
import { ProjectPill, type ProjectRef } from '@/assistant-original/ProjectPill';
import { getCurrentProjectScope, subscribeProjectScope } from '@/state/currentProject';
import { loadWorkspace, uploadWorkspaceFile, deleteWorkspaceEntry, type WorkspaceEntry } from '@/connectors/vinzWorkspace';
import { ConnectorsScope } from './ConnectorsScope';

import './daily.css';

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function kindLabel(name: string): string {
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toUpperCase() : '';
  if (!extension) return 'File';
  if (['JPG', 'JPEG', 'PNG', 'GIF', 'WEBP', 'HEIC', 'SVG'].includes(extension)) return 'Immagine';
  return extension;
}

async function encodeBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  /* A blocchi: `String.fromCharCode(...tutto)` sfonda lo stack sui file grandi. */
  for (let index = 0; index < buffer.length; index += 8192) {
    binary += String.fromCharCode(...buffer.subarray(index, index + 8192));
  }
  return btoa(binary);
}

export function FilesPanel({ token }: { token: string | null }) {
  /* 🔷 «In FILES ci sono ancora i progetti sopra, sarà questo?» Sì: questo
     pannello aveva un proprio selettore di progetto, scollegato da quello
     che chat/ME/nav condividono da quando esiste `state/currentProject.ts`
     — potevi collegare un connettore a "Generale" qui dentro mentre stavi
     parlando con VINZ dentro un altro progetto, e lui non lo vedeva mai.
     Stesso stato di tutta l'app, non un terzo pezzo separato. */
  const [scope, setScope] = useState(getCurrentProjectScope);
  useEffect(() => subscribeProjectScope(setScope), []);
  const [root, setRoot] = useState('');
  const [tree, setTree] = useState<WorkspaceEntry[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  /* Generale non ha un progetto vero, ma ha comunque la sua cartella —
     stessa chiave stabile (`GLOBAL_PROJECT_ID`) già usata altrove per
     "il progetto quando non ce n'è uno selezionato". */
  const workspaceId = scope.projectId ?? GLOBAL_PROJECT_ID;
  const workspaceTitle = scope.projectId ? scope.projectTitle : 'Generale';

  const load = useCallback(async () => {
    if (!token) {
      setError('VINZ.MON non è attivo su questo dispositivo.');
      setBusy(false);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await loadWorkspace(token, workspaceId, workspaceTitle);
      setRoot(result.root);
      setTree(result.tree);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'File non disponibili.');
    } finally {
      setBusy(false);
    }
  }, [token, workspaceId, workspaceTitle]);

  useEffect(() => {
    void load();
  }, [load]);

  /* 🔷 Stesso evento di `TabBar` (App.tsx): cambiare progetto qui aggiorna
     anche il thread della chat, non solo questo pannello — un solo stato,
     letto da tre posti. A differenza del nav, qui NON si salta su CHAT: sei
     già dove volevi essere. */
  function onProjectChange(next: ProjectRef | null) {
    window.dispatchEvent(new CustomEvent('vinz-select-project', { detail: next }));
  }

  async function add(list: FileList | null) {
    if (!list?.length || !token) return;
    setBusy(true);
    setError('');
    try {
      for (const file of Array.from(list)) {
        const base64 = await encodeBase64(file);
        const result = await uploadWorkspaceFile(token, workspaceId, workspaceTitle, file.name, base64);
        if (!result.ok) throw new Error(result.error);
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Caricamento non riuscito.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove(entry: WorkspaceEntry) {
    if (!token) return;
    if (!window.confirm(`Eliminare «${entry.path}»?`)) return;
    setBusy(true);
    setError('');
    try {
      const result = await deleteWorkspaceEntry(token, workspaceId, workspaceTitle, entry.path);
      if (!result.ok) throw new Error(result.error);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Eliminazione non riuscita.');
    } finally {
      setBusy(false);
    }
  }

  const files = (tree ?? []).filter((entry) => entry.type === 'file');

  return (
    <section className="daily-panel" aria-label="FILES">
      <ProjectPill scope={scope} onChange={onProjectChange} />

      <input
        ref={input}
        type="file"
        multiple
        className="daily-panel__file"
        onChange={(event) => void add(event.target.files)}
      />
      <button
        type="button"
        className="daily-panel__ghost"
        disabled={busy || !token}
        onClick={() => input.current?.click()}
      >
        + Aggiungi file
      </button>
      {root && <p className="daily-row__meta">{root}</p>}

      {error && (
        <p className="daily-panel__error" role="alert">
          {error}
        </p>
      )}

      {!error && !busy && files.length === 0 && (
        <p className="daily-panel__empty">Nessun file. Quello che carichi qui — e quello che VINZ ci organizza da solo — resta lì.</p>
      )}

      <ul className="daily-list">
        {files.map((file) => (
          <li key={file.path} className="daily-row">
            <div className="daily-row__main">
              <p className="daily-row__title">{file.path}</p>
              <p className="daily-row__meta">
                {kindLabel(file.path)} · {sizeLabel(file.size ?? 0)}
              </p>
            </div>
            <button type="button" className="daily-row__action" disabled={busy} onClick={() => void remove(file)}>
              Elimina
            </button>
          </li>
        ))}
      </ul>

      {busy && <p className="daily-panel__meta">Un momento…</p>}

      <ConnectorsScope projectId={scope.projectId} projectTitle={scope.projectTitle} />
    </section>
  );
}
