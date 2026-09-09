/* ============================================================================
   CONNETTORI

   🔷 «Mi manca collegare Google, second brain e tanti altri connettori a cui
   lui può attingere informazioni. Questi mettili tutti, anche custom che poi
   creo in altri siti.»

   🔒 NIENTE CHIAVI QUI DENTRO VANNO SUL SERVER. A differenza di AI (chiavi
   dei modelli, in `.env` via `secrets.ts`), questa scheda scrive solo in
   `localStorage`/IndexedDB del browser — vedi `src/connectors/types.ts` per
   il perché. `token`/`saveSecret` non servono a questa pagina.

   Ordine deciso: Google Calendar (il più naturale per un assistente
   quotidiano) → secondo cervello locale (Obsidian: nessun OAuth, solo il
   permesso a una cartella) → connettori custom (generico, per i siti che
   arriveranno dopo) → Instagram, in coda perché l'API Meta per uso personale
   è dismessa e quella rimasta vuole account Business e revisione dell'app,
   non garantita. Gmail/Drive/Foto sono lo stesso Client ID di Calendar, ma
   ogni scope è un vero strumento da scrivere e verificare a parte: prossimi
   in coda, non un mezzo lavoro oggi. */

import { useState } from 'react';
import { Btn, Notice, Section, Status } from './parts';
import {
  connectGoogle,
  disconnectGoogle,
  googleClientId,
  isGoogleConnected,
  saveGoogleClientId,
} from '../../connectors/google';
import { forgetVault, isVaultPickerSupported, loadVaultLabel, pickVault } from '../../connectors/obsidian';
import {
  listCustomConnectors,
  removeCustomConnector,
  upsertCustomConnector,
} from '../../connectors/custom';
import type { CustomConnector } from '../../connectors/types';

function GoogleConnector() {
  const [clientId, setClientId] = useState(() => googleClientId());
  const [connected, setConnected] = useState(() => isGoogleConnected());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
  }

  return (
    <div className="keyfield">
      <div className="keyfield__head">
        <strong className="mono">GOOGLE CALENDAR</strong>
        <Status label={connected ? 'COLLEGATO' : 'NON COLLEGATO'} ok={connected} />
      </div>
      <p className="note">Legge (sola lettura) gli eventi del tuo Google Calendar personale, così VINZ può parlarne senza che tu li ripeta.</p>
      {!connected && (
        <>
          <p className="note">
            Serve un Client ID OAuth tuo: console.cloud.google.com → APIs & Services → Credentials → Create
            Credentials → OAuth client ID → tipo “Web application”, origine autorizzata questo indirizzo. Nessun
            client secret: il flusso gira tutto nel browser.
          </p>
          <div className="keyfield__row">
            <input
              type="text"
              className="mono"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="xxxxxxxx.apps.googleusercontent.com"
              aria-label="Google Client ID"
              disabled={busy}
            />
            <Btn onClick={() => void connect()} disabled={busy || !clientId.trim()}>
              {busy ? 'COLLEGO…' : 'COLLEGA'}
            </Btn>
          </div>
        </>
      )}
      {connected && <Btn onClick={disconnect}>SCOLLEGA</Btn>}
      {error && <Notice title="ERRORE">{error}</Notice>}
    </div>
  );
}

function ObsidianConnector() {
  const [label, setLabel] = useState<string | null>(() => loadVaultLabel());
  const [error, setError] = useState('');
  const supported = isVaultPickerSupported();

  async function connect() {
    setError('');
    const result = await pickVault();
    if (!result.ok) { setError(result.error); return; }
    setLabel(result.label);
  }

  async function disconnect() {
    await forgetVault();
    setLabel(null);
  }

  return (
    <div className="keyfield">
      <div className="keyfield__head">
        <strong className="mono">SECONDO CERVELLO (OBSIDIAN)</strong>
        <Status label={label ? `COLLEGATO · ${label}` : 'NON COLLEGATO'} ok={Boolean(label)} />
      </div>
      <p className="note">
        Nessun account, nessuna chiave: scegli la cartella del tuo vault e VINZ legge i file .md da lì, in
        locale. Il permesso resta su questo browser.
      </p>
      {!supported && <Notice title="BROWSER NON SUPPORTATO">Serve Chrome, Edge o un browser Chromium per scegliere una cartella locale.</Notice>}
      {supported && !label && <Btn onClick={() => void connect()}>SCEGLI CARTELLA VAULT</Btn>}
      {supported && label && <Btn onClick={() => void disconnect()}>SCOLLEGA</Btn>}
      {error && <Notice title="ERRORE">{error}</Notice>}
    </div>
  );
}

function emptyCustomConnector(): CustomConnector {
  return { id: '', name: '', baseUrl: '', headerName: 'Authorization', headerValue: '' };
}

function CustomConnectors() {
  const [list, setList] = useState<CustomConnector[]>(() => listCustomConnectors());
  const [draft, setDraft] = useState<CustomConnector>(emptyCustomConnector());
  const [error, setError] = useState('');

  function add() {
    setError('');
    const name = draft.name.trim();
    const baseUrl = draft.baseUrl.trim();
    if (!name || !baseUrl) { setError('Servono almeno nome e indirizzo.'); return; }
    try { new URL(baseUrl); } catch { setError('L’indirizzo non è un URL valido.'); return; }
    const id = name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `connettore-${Date.now()}`;
    upsertCustomConnector({ ...draft, id, name, baseUrl });
    setList(listCustomConnectors());
    setDraft(emptyCustomConnector());
  }

  function remove(id: string) {
    removeCustomConnector(id);
    setList(listCustomConnectors());
  }

  return (
    <Section
      title="CONNETTORI CUSTOM"
      note="Per qualunque altro sito con una sua API: nome, indirizzo base, e la chiave nell'header che quel servizio si aspetta. VINZ lo chiama con id_connettore quando lo nomini."
    >
      {list.map((c) => (
        <div key={c.id} className="keyfield">
          <div className="keyfield__head">
            <strong className="mono">{c.name}</strong>
            <span className="note mono">id: {c.id}</span>
          </div>
          <p className="note">{c.baseUrl}</p>
          <Btn variant="danger" onClick={() => remove(c.id)}>RIMUOVI</Btn>
        </div>
      ))}
      <div className="keyfield">
        <div className="keyfield__head"><strong className="mono">NUOVO CONNETTORE</strong></div>
        <div className="keyfield__row">
          <input type="text" className="mono" placeholder="nome (es. Notion)" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
        </div>
        <div className="keyfield__row">
          <input type="text" className="mono" placeholder="https://api.esempio.com/" value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} />
        </div>
        <div className="keyfield__row">
          <input type="text" className="mono" placeholder="header (default Authorization)" value={draft.headerName} onChange={(e) => setDraft({ ...draft, headerName: e.target.value })} />
          <input type="password" className="mono" placeholder="valore, es. Bearer xxxx" value={draft.headerValue} onChange={(e) => setDraft({ ...draft, headerValue: e.target.value })} />
        </div>
        <Btn onClick={add}>AGGIUNGI</Btn>
      </div>
      {error && <Notice title="ERRORE">{error}</Notice>}
    </Section>
  );
}

export function Connectors() {
  return (
    <section className="page active">
      <div className="kicker mono">SYSTEM.LAB / CONNETTORI</div>
      <h1>CONNETTORI</h1>
      <p className="lead">Da dove VINZ può attingere informazioni oltre a ME e alla conversazione — sempre in lettura, sempre con le tue credenziali, mai passando dal server.</p>

      <Section title="GOOGLE" note="Solo Calendar per adesso. Gmail e Drive sono lo stesso Client ID: in coda come prossimo connettore, non ancora collegabili da qui.">
        <GoogleConnector />
      </Section>

      <Section title="SECONDO CERVELLO">
        <ObsidianConnector />
      </Section>

      <CustomConnectors />

      <Section title="INSTAGRAM" note="In coda, non collegabile adesso.">
        <div className="keyfield">
          <div className="keyfield__head">
            <strong className="mono">INSTAGRAM</strong>
            <Status label="IN CODA" ok={false} />
          </div>
          <p className="note">
            L’API per uso personale (Basic Display) è stata dismessa. Quella rimasta (Graph API) vuole un
            account Business/Creator e in molti casi la revisione dell’app da parte di Meta — settimane, non
            garantita. Resta qui come promemoria della priorità, non come pulsante che funziona.
          </p>
        </div>
      </Section>
    </section>
  );
}
