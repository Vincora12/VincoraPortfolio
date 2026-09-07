/* ============================================================================
   FILES — il materiale che ho dato a VINZ

   🔒 NESSUNA INFRASTRUTTURA NUOVA. I file stanno dove VINZ.MON già li mette: i
   `ProjectFile` dello spazio GLOBAL, con le stesse mutazioni `upload-files` e
   `remove-files` e gli stessi limiti del backend (5 MB per file, 40 file,
   20 MB in tutto). Niente cartelle, niente Drive: una lista.
   ========================================================================= */

import { useCallback, useEffect, useRef, useState } from 'react';

import { GLOBAL_PROJECT_ID, type Project, type ProjectFile } from '@/engine/projects';
import { loadProject, mutateProject } from '@/projects/client';

import './daily.css';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

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

async function encode(file: File): Promise<ProjectFile> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  /* A blocchi: `String.fromCharCode(...tutto)` sfonda lo stack sui file grandi. */
  for (let index = 0; index < buffer.length; index += 8192) {
    binary += String.fromCharCode(...buffer.subarray(index, index + 8192));
  }
  return { id: crypto.randomUUID(), name: file.name, size: buffer.length, data: btoa(binary) };
}

export function FilesPanel({ token }: { token: string | null }) {
  const [project, setProject] = useState<Project | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!token) {
      setError('VINZ.MON non è attivo su questo dispositivo.');
      setBusy(false);
      return;
    }
    setBusy(true);
    setError('');
    try {
      setProject(await loadProject(token, GLOBAL_PROJECT_ID));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'File non disponibili.');
    } finally {
      setBusy(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add(list: FileList | null) {
    if (!list?.length || !project || !token) return;
    setBusy(true);
    setError('');
    try {
      const chosen = Array.from(list);
      const tooBig = chosen.find((file) => file.size > MAX_FILE_BYTES);
      if (tooBig) throw new Error(`«${tooBig.name}» supera 5 MB.`);
      const files = await Promise.all(chosen.map(encode));
      setProject(
        await mutateProject(token, {
          action: 'upload-files',
          projectId: project.id,
          revision: project.revision,
          files,
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Caricamento non riuscito.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove(file: ProjectFile) {
    if (!project || !token) return;
    if (!window.confirm(`Eliminare «${file.name}»?`)) return;
    setBusy(true);
    setError('');
    try {
      setProject(
        await mutateProject(token, {
          action: 'remove-files',
          projectId: project.id,
          revision: project.revision,
          ids: [file.id],
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Eliminazione non riuscita.');
    } finally {
      setBusy(false);
    }
  }

  const files = project?.files ?? [];

  return (
    <section className="daily-panel" aria-label="FILES">
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
        disabled={busy || !project}
        onClick={() => input.current?.click()}
      >
        + Aggiungi file
      </button>

      {error && (
        <p className="daily-panel__error" role="alert">
          {error}
        </p>
      )}

      {!error && !busy && files.length === 0 && (
        <p className="daily-panel__empty">Nessun file. Quello che carichi qui resta a disposizione di VINZ.</p>
      )}

      <ul className="daily-list">
        {files.map((file) => (
          <li key={file.id} className="daily-row">
            <div className="daily-row__main">
              <p className="daily-row__title">{file.name}</p>
              <p className="daily-row__meta">
                {kindLabel(file.name)} · {sizeLabel(file.size)}
              </p>
            </div>
            <button type="button" className="daily-row__action" disabled={busy} onClick={() => void remove(file)}>
              Elimina
            </button>
          </li>
        ))}
      </ul>

      {busy && <p className="daily-panel__meta">Un momento…</p>}
    </section>
  );
}
