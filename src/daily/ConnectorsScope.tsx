/* ============================================================================
   COLLEGAMENTI — una riga per connettore, il resto in un pop up

   🔷 «Per pulire un pochino: tutti i pop-up che clicco, si apre il pop-up
   che mi spiega e metto tutti i dati, così la sezione file è pulita.» Stesso
   principio di `SkillStore.tsx` — un pulsante per riga, il modulo intero
   (spiegazione, campi, scelta del progetto) si apre solo quando serve,
   invece di stare sempre spiegato per intero nella pagina.
   ========================================================================= */

import { useEffect, useState, type ReactNode } from 'react';
import {
  connectGoogle,
  disconnectGoogle,
  googleClientId,
  isGoogleConnected,
  saveGoogleClientId,
  listGoogleCalendars,
  assignCalendarToProject,
} from '../connectors/google';
import { loadGoogleConfig } from '../connectors/store';
import {
  forgetVault,
  isVaultPickerSupported,
  loadVaultLabel,
  loadVaultProjectId,
  pickVault,
  setVaultProject,
  uploadVaultFiles,
} from '../connectors/obsidian';
import {
  forgetICloudFolder,
  isFolderPickerSupported,
  loadICloudFolderLabel,
  loadICloudProjectId,
  pickICloudFolder,
  setICloudProject,
  uploadICloudFiles,
} from '../connectors/icloud';
import { listCustomConnectors, removeCustomConnector, upsertCustomConnector } from '../connectors/custom';
import type { CustomConnector } from '../connectors/types';

type Popup = 'google' | 'obsidian' | 'icloud' | { customId: string | null } | null;

function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="daily-skills-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="daily-skills-overlay__close" onClick={onClose}>
        CHIUDI ✕
      </button>
      <div className="skillstore">
        <h2 className="skillstore__title">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function ScopeToggle({
  isGlobal,
  projectTitle,
  onGlobal,
  onHere,
}: {
  isGlobal: boolean;
  projectTitle: string;
  onGlobal: () => void;
  onHere: () => void;
}) {
  return (
    <div className="daily-scope">
      <button type="button" className="daily-scope__btn" aria-pressed={isGlobal} onClick={onGlobal}>
        GENERALE
      </button>
      <button type="button" className="daily-scope__btn" aria-pressed={!isGlobal} onClick={onHere}>
        SOLO {projectTitle.toUpperCase()}
      </button>
    </div>
  );
}

function GooglePopup({ projectId, projectTitle, onClose }: { projectId: string | null; projectTitle: string; onClose: () => void }) {
  const [clientId, setClientId] = useState(() => googleClientId());
  const [connected, setConnected] = useState(() => isGoogleConnected());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [calendars, setCalendars] = useState<{ id: string; label: string }[] | null>(null);
  const [assignments, setAssignments] = useState(() => loadGoogleConfig().calendars);

  useEffect(() => {
    if (!connected) return;
    let live = true;
    void listGoogleCalendars().then((result) => {
      if (!live) return;
      if (result.ok) setCalendars(result.calendars);
      else setError(result.error);
    });
    return () => { live = false; };
  }, [connected]);

  async function connect() {
    saveGoogleClientId(clientId);
    setBusy(true);
    setError('');
    const result = await connectGoogle();
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setConnected(true);
  }

  function disconnect() {
    disconnectGoogle();
    setConnected(false);
    setCalendars(null);
  }

  function assign(id: string, label: string, toProject: string | null) {
    assignCalendarToProject(id, label, toProject);
    setAssignments(loadGoogleConfig().calendars);
  }

  return (
    <Overlay title="Google" onClose={onClose}>
      <p className="skillstore__lead">
        Un consenso solo per tre cose: Calendar (eventi), Drive (cerca e legge i tuoi documenti) e Gmail (cerca le tue email) — sempre in sola lettura, mai una scrittura sul tuo account vero.
      </p>

      {!connected && (
        <>
          <p className="daily-row__meta">
            Serve un Client ID OAuth tuo: console.cloud.google.com → APIs &amp; Services → Credentials → Create
            Credentials → OAuth client ID → “Web application”, origine autorizzata questo indirizzo. Nessun client
            secret: il flusso gira tutto nel browser, la chiave non passa mai dal server.
          </p>
          <input
            type="text"
            className="daily-input"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="xxxxxxxx.apps.googleusercontent.com"
            aria-label="Google Client ID"
            disabled={busy}
            autoFocus
          />
          <button type="button" className="daily-row__action" disabled={busy || !clientId.trim()} onClick={() => void connect()}>
            {busy ? 'COLLEGO…' : 'COLLEGA'}
          </button>
        </>
      )}
      {connected && <button type="button" className="daily-row__action" onClick={disconnect}>SCOLLEGA</button>}
      {error && <p className="daily-panel__error" role="alert">{error}</p>}

      {connected && (
        <>
          <p className="daily-group daily-group--act">QUALE CALENDARIO PER {projectTitle.toUpperCase()}</p>
          {!calendars && !error && <p className="daily-panel__meta">Carico i calendari…</p>}
          <ul className="daily-list">
            {calendars?.map((cal) => {
              const current = assignments.find((a) => a.id === cal.id) ?? null;
              const isGlobal = !current || current.projectId === null;
              const isHere = current?.projectId === projectId;
              return (
                <li key={cal.id} className="daily-row">
                  <div className="daily-row__main">
                    <p className="daily-row__title">{cal.label}</p>
                    {current && !isGlobal && !isHere && <p className="daily-row__meta">Assegnato a un altro progetto</p>}
                    {!current && <p className="daily-row__meta">Non assegnato — userà "primary" ovunque</p>}
                  </div>
                  <ScopeToggle isGlobal={isGlobal} projectTitle={projectTitle} onGlobal={() => assign(cal.id, cal.label, null)} onHere={() => assign(cal.id, cal.label, projectId)} />
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Overlay>
  );
}

function ObsidianPopup({ projectId, projectTitle, onClose }: { projectId: string | null; projectTitle: string; onClose: () => void }) {
  const [label, setLabel] = useState<string | null>(() => loadVaultLabel());
  const [scope, setScope] = useState(() => loadVaultProjectId());
  const [error, setError] = useState('');
  const supported = isVaultPickerSupported();

  async function connect() {
    setError('');
    const result = await pickVault();
    if (!result.ok) { setError(result.error); return; }
    setLabel(result.label);
    setScope(loadVaultProjectId());
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError('');
    const result = await uploadVaultFiles(files);
    if (!result.ok) { setError(result.error); return; }
    setLabel(loadVaultLabel());
    setScope(loadVaultProjectId());
  }

  async function disconnect() {
    await forgetVault();
    setLabel(null);
  }

  const isGlobal = scope === null;
  const isHere = scope === projectId;

  return (
    <Overlay title="Secondo cervello (Obsidian)" onClose={onClose}>
      <p className="skillstore__lead">
        Nessun account, nessuna chiave: scegli la cartella del tuo vault e VINZ legge i file .md da lì, in locale. Il permesso resta su questo browser.
      </p>
      {!supported && !label && (
        <>
          {/* 🔒 Su iOS/iPadOS NESSUN browser sa aprire una cartella — non è
              «serve Chrome»: Apple impone lo stesso motore (WebKit) a ogni
              app-browser lì, «Chrome» per iOS compreso. Il ripiego è
              scegliere i file .md una volta, non una cartella viva: da
              aggiornare quando cambiano, non sincronizzata da sola. */}
          <p className="daily-panel__error">Su questo dispositivo non si può scegliere una cartella intera (limite di iOS/Safari, non di questo browser). Puoi comunque caricare i file .md del vault uno per uno.</p>
          <label className="daily-row__action" style={{ display: 'inline-block', cursor: 'pointer' }}>
            CARICA FILE .MD
            <input type="file" accept=".md,.markdown" multiple style={{ display: 'none' }} onChange={(e) => void upload(e.target.files)} />
          </label>
        </>
      )}
      {supported && !label && <button type="button" className="daily-row__action" onClick={() => void connect()}>SCEGLI CARTELLA VAULT</button>}
      {label && (
        <>
          <p className="daily-row__meta">Collegato · {label}</p>
          {!supported && (
            <label className="daily-row__action" style={{ display: 'inline-block', cursor: 'pointer', marginRight: 8 }}>
              RICARICA FILE
              <input type="file" accept=".md,.markdown" multiple style={{ display: 'none' }} onChange={(e) => void upload(e.target.files)} />
            </label>
          )}
          <button type="button" className="daily-row__action" onClick={() => void disconnect()}>SCOLLEGA</button>
        </>
      )}
      {error && <p className="daily-panel__error" role="alert">{error}</p>}

      {label && (
        <>
          <p className="daily-group daily-group--act">A CHI VALE</p>
          <ScopeToggle
            isGlobal={isGlobal}
            projectTitle={projectTitle}
            onGlobal={() => { setVaultProject(null); setScope(null); }}
            onHere={() => { setVaultProject(projectId); setScope(projectId); }}
          />
          {!isGlobal && !isHere && <p className="daily-row__meta">Assegnato a un altro progetto</p>}
        </>
      )}
    </Overlay>
  );
}

function ICloudPopup({ projectId, projectTitle, onClose }: { projectId: string | null; projectTitle: string; onClose: () => void }) {
  const [label, setLabel] = useState<string | null>(() => loadICloudFolderLabel());
  const [scope, setScope] = useState(() => loadICloudProjectId());
  const [error, setError] = useState('');
  const supported = isFolderPickerSupported();

  async function connect() {
    setError('');
    const result = await pickICloudFolder();
    if (!result.ok) { setError(result.error); return; }
    setLabel(result.label);
    setScope(loadICloudProjectId());
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError('');
    const result = await uploadICloudFiles(files);
    if (!result.ok) { setError(result.error); return; }
    setLabel(loadICloudFolderLabel());
    setScope(loadICloudProjectId());
  }

  async function disconnect() {
    await forgetICloudFolder();
    setLabel(null);
  }

  const isGlobal = scope === null;
  const isHere = scope === projectId;

  return (
    <Overlay title="iCloud Drive" onClose={onClose}>
      <p className="skillstore__lead">
        Apple non offre un accesso diretto a iCloud Drive per un'app come questa — niente OAuth possibile qui.
        Ma iCloud Drive sincronizza già i file su questo Mac: scegli quella cartella (di solito "iCloud Drive" nel
        Finder) e VINZ legge i documenti di testo da lì, in locale. PDF, immagini e file binari restano fuori.
      </p>
      {!supported && !label && (
        <>
          {/* 🔒 Stesso limite di Obsidian: su iOS/iPadOS nessun browser sa
              aprire una cartella, non è questione di quale app usi. Da Files
              si possono comunque scegliere singoli file, iCloud Drive
              compreso — è quello il ripiego, non una cartella live. */}
          <p className="daily-panel__error">Su questo dispositivo non si può scegliere una cartella intera (limite di iOS/Safari, non di questo browser). Puoi comunque caricare i file uno per uno dall'app File.</p>
          <label className="daily-row__action" style={{ display: 'inline-block', cursor: 'pointer' }}>
            CARICA FILE
            <input type="file" accept=".md,.markdown,.txt,.csv,.json,.log,.rtf,.yml,.yaml" multiple style={{ display: 'none' }} onChange={(e) => void upload(e.target.files)} />
          </label>
        </>
      )}
      {supported && !label && <button type="button" className="daily-row__action" onClick={() => void connect()}>SCEGLI CARTELLA ICLOUD DRIVE</button>}
      {label && (
        <>
          <p className="daily-row__meta">Collegato · {label}</p>
          {!supported && (
            <label className="daily-row__action" style={{ display: 'inline-block', cursor: 'pointer', marginRight: 8 }}>
              RICARICA FILE
              <input type="file" accept=".md,.markdown,.txt,.csv,.json,.log,.rtf,.yml,.yaml" multiple style={{ display: 'none' }} onChange={(e) => void upload(e.target.files)} />
            </label>
          )}
          <button type="button" className="daily-row__action" onClick={() => void disconnect()}>SCOLLEGA</button>
        </>
      )}
      {error && <p className="daily-panel__error" role="alert">{error}</p>}

      {label && (
        <>
          <p className="daily-group daily-group--act">A CHI VALE</p>
          <ScopeToggle
            isGlobal={isGlobal}
            projectTitle={projectTitle}
            onGlobal={() => { setICloudProject(null); setScope(null); }}
            onHere={() => { setICloudProject(projectId); setScope(projectId); }}
          />
          {!isGlobal && !isHere && <p className="daily-row__meta">Assegnato a un altro progetto</p>}
        </>
      )}
    </Overlay>
  );
}

function emptyCustomConnector(projectId: string | null): CustomConnector {
  return { id: '', name: '', baseUrl: '', headerName: 'Authorization', headerValue: '', projectId };
}

function CustomPopup({
  customId,
  projectId,
  projectTitle,
  onClose,
  onChange,
}: {
  customId: string | null;
  projectId: string | null;
  projectTitle: string;
  onClose: () => void;
  onChange: () => void;
}) {
  const existing = customId ? listCustomConnectors().find((c) => c.id === customId) ?? null : null;
  const [draft, setDraft] = useState<CustomConnector>(() => existing ?? emptyCustomConnector(projectId));
  const [error, setError] = useState('');
  const isGlobal = draft.projectId === null;
  const isHere = draft.projectId === projectId;

  function save() {
    setError('');
    const name = draft.name.trim();
    const baseUrl = draft.baseUrl.trim();
    if (!name || !baseUrl) { setError('Servono almeno nome e indirizzo.'); return; }
    try { new URL(baseUrl); } catch { setError('L’indirizzo non è un URL valido.'); return; }
    const id = draft.id || (name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `connettore-${Date.now()}`);
    upsertCustomConnector({ ...draft, id, name, baseUrl });
    onChange();
    onClose();
  }

  function remove() {
    if (!draft.id) return;
    removeCustomConnector(draft.id);
    onChange();
    onClose();
  }

  return (
    <Overlay title={existing ? existing.name : 'Nuovo connettore custom'} onClose={onClose}>
      <p className="skillstore__lead">
        Per qualunque altro sito con una sua API: nome, indirizzo base, e la chiave nell'header che quel servizio si aspetta. VINZ lo chiama con id_connettore quando lo nomini.
      </p>
      <input type="text" className="daily-input" placeholder="Nome (es. Notion)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} autoFocus />
      <input type="text" className="daily-input" placeholder="https://api.esempio.com/" value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} />
      <input type="text" className="daily-input" placeholder="Header (default Authorization)" value={draft.headerName} onChange={(e) => setDraft({ ...draft, headerName: e.target.value })} />
      <input type="password" className="daily-input" placeholder="Valore, es. Bearer xxxx" value={draft.headerValue} onChange={(e) => setDraft({ ...draft, headerValue: e.target.value })} />

      <p className="daily-group daily-group--act">A CHI VALE</p>
      <ScopeToggle
        isGlobal={isGlobal}
        projectTitle={projectTitle}
        onGlobal={() => setDraft({ ...draft, projectId: null })}
        onHere={() => setDraft({ ...draft, projectId })}
      />
      {!isGlobal && !isHere && <p className="daily-row__meta">Assegnato a un altro progetto</p>}

      {error && <p className="daily-panel__error" role="alert">{error}</p>}

      <div className="skillstore__actions">
        <button type="button" className="daily-row__action" onClick={save}>{existing ? 'SALVA' : 'AGGIUNGI'}</button>
        {existing && <button type="button" className="daily-panel__ghost" onClick={remove}>Rimuovi</button>}
      </div>
    </Overlay>
  );
}

export function ConnectorsScope({ projectId, projectTitle }: { projectId: string | null; projectTitle: string }) {
  const [popup, setPopup] = useState<Popup>(null);
  const [, forceUpdate] = useState(0);
  const refresh = () => forceUpdate((n) => n + 1);

  const googleConnected = isGoogleConnected();
  const vaultLabel = loadVaultLabel();
  const icloudLabel = loadICloudFolderLabel();
  const customs = listCustomConnectors();

  return (
    <section className="daily-panel__section" aria-label="Collegamenti">
      <p className="daily-group daily-group--act">COLLEGAMENTI</p>
      <ul className="daily-list">
        <li className="daily-row">
          <div className="daily-row__main">
            <p className="daily-row__title">Google</p>
            <p className="daily-row__meta">{googleConnected ? 'Collegato · Calendar, Drive, Gmail' : 'Non collegato'}</p>
          </div>
          <button type="button" className="daily-row__action" onClick={() => setPopup('google')}>APRI</button>
        </li>
        <li className="daily-row">
          <div className="daily-row__main">
            <p className="daily-row__title">Secondo cervello</p>
            <p className="daily-row__meta">{vaultLabel ? `Collegato · ${vaultLabel}` : 'Non collegato'}</p>
          </div>
          <button type="button" className="daily-row__action" onClick={() => setPopup('obsidian')}>APRI</button>
        </li>
        <li className="daily-row">
          <div className="daily-row__main">
            <p className="daily-row__title">iCloud Drive</p>
            <p className="daily-row__meta">{icloudLabel ? `Collegato · ${icloudLabel}` : 'Non collegato'}</p>
          </div>
          <button type="button" className="daily-row__action" onClick={() => setPopup('icloud')}>APRI</button>
        </li>
        {customs.map((c) => (
          <li key={c.id} className="daily-row">
            <div className="daily-row__main">
              <p className="daily-row__title">{c.name}</p>
              <p className="daily-row__meta">{c.baseUrl}</p>
            </div>
            <button type="button" className="daily-row__action" onClick={() => setPopup({ customId: c.id })}>APRI</button>
          </li>
        ))}
      </ul>
      <button type="button" className="daily-panel__ghost" onClick={() => setPopup({ customId: null })}>
        + Aggiungi connettore custom
      </button>

      {popup === 'google' && <GooglePopup projectId={projectId} projectTitle={projectTitle} onClose={() => { setPopup(null); refresh(); }} />}
      {popup === 'obsidian' && <ObsidianPopup projectId={projectId} projectTitle={projectTitle} onClose={() => { setPopup(null); refresh(); }} />}
      {popup === 'icloud' && <ICloudPopup projectId={projectId} projectTitle={projectTitle} onClose={() => { setPopup(null); refresh(); }} />}
      {popup !== null && typeof popup === 'object' && (
        <CustomPopup
          customId={popup.customId}
          projectId={projectId}
          projectTitle={projectTitle}
          onClose={() => setPopup(null)}
          onChange={refresh}
        />
      )}
    </section>
  );
}
