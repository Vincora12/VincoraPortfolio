/* ============================================================================
   REMOTE CHAT HISTORY V1 — merge senza perdita per un conflitto reale

   🔒 Usato SOLO quando una scrittura condizionale (`If-Match`/`X-Only-If-New`,
   vedi `netlify/functions/user-data.ts`) viene rifiutata dal server — cioè
   quando un ALTRO client ha scritto la STESSA chiave nella stessa finestra
   di tempo (G5/G6 del task REMOTE CHAT HISTORY V1). Nel caso comune (nessun
   conflitto) queste funzioni non vengono nemmeno chiamate.

   Le due sole forme JSON che vivono sotto il prefisso
   `assistant-ui-official-chatgpt:` (vedi `LocalStorageThreadListAdapter` in
   `@assistant-ui/core`, che le scrive):
   - `...:messages:<remoteId>` → { headId?, messages: [{ message: {id, ...},
     parentId, runConfig? }] } — il repository di UN thread;
   - `...:threads` → [{ remoteId, status, title?, custom?, ... }] — l'indice
     dei thread.

   Nessuna delle due funzioni sotto scarta MAI un messaggio o un thread per
   risolvere il conflitto: unione, mai sottrazione. Dove due lati modificano
   davvero la STESSA cosa (stesso id messaggio, o stesso campo di metadata
   sullo stesso thread) una scelta deterministica va fatta — documentata
   accanto a ciascuna funzione, non nascosta. */

interface RepoMessageItem {
  message: { id: string; createdAt?: string | number };
  parentId: string | null;
  [key: string]: unknown;
}
interface Repo {
  headId?: string | null;
  messages: RepoMessageItem[];
}

function parseRepo(raw: string | null): Repo | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Repo;
    return Array.isArray(candidate.messages) ? candidate : null;
  } catch {
    return null;
  }
}

function messageTimeMs(item: RepoMessageItem | undefined): number {
  const created = item?.message?.createdAt;
  if (typeof created !== 'string' && typeof created !== 'number') return 0;
  const date = new Date(created);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

/**
 * Unione per `message.id` — nessun messaggio scritto da NESSUNO dei due lati
 * viene mai perso. A parità di id (lo stesso messaggio conosciuto da
 * entrambi) vince la versione di `ours`: è la versione più recente che
 * QUESTO client conosce di quel messaggio (tipicamente la propria risposta
 * ancora in streaming, aggiornata ad ogni token — vedi `append()` in
 * `LocalStorageThreadListAdapter.tsx`, che sostituisce per id). Un id
 * uguale scritto da DUE client diversi per contenuti diversi non è un caso
 * previsto dal generatore di id di assistant-ui (`newLocalMessageId`, uuid
 * casuale) — se capitasse comunque, "ours vince" è la scelta che non fa mai
 * crashare né perdere l'altro messaggio, che resta con il suo id originale.
 *
 * `headId` — punta al messaggio più recente (per `createdAt`) fra i due
 * candidati; se nessuno dei due è risolvibile nell'insieme unito, resta
 * quello di `ours`. Riconciliare QUALE ramo è "il più recente" in un vero
 * conflitto di branching non è garantito perfetto — è il limite reale
 * documentato in REMOTE_CHAT_HISTORY_V1.md: nessun messaggio si perde mai,
 * ma quale head "vince" in un conflitto di branch è una euristica.
 */
export function mergeMessageRepositories(serverRaw: string | null, oursRaw: string): string {
  const server = parseRepo(serverRaw);
  const ours = parseRepo(oursRaw);
  if (!ours) return serverRaw ?? oursRaw;
  if (!server) return oursRaw;

  const byId = new Map<string, RepoMessageItem>();
  for (const item of server.messages) byId.set(item.message.id, item);
  for (const item of ours.messages) byId.set(item.message.id, item);
  const messages = [...byId.values()];

  const headCandidates = [server.headId, ours.headId].filter(
    (id): id is string => typeof id === 'string' && byId.has(id),
  );
  const headId = headCandidates.length
    ? headCandidates.reduce((best, id) => (messageTimeMs(byId.get(id)) >= messageTimeMs(byId.get(best)) ? id : best))
    : (ours.headId ?? server.headId ?? null);

  return JSON.stringify(headId ? { headId, messages } : { messages });
}

interface ThreadEntry {
  remoteId: string;
  [key: string]: unknown;
}

function parseThreads(raw: string | null): ThreadEntry[] | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ThreadEntry[]) : null;
  } catch {
    return null;
  }
}

/**
 * Unione per `remoteId` — un thread creato da un client non sparisce mai
 * perché un altro client ha salvato l'indice nello stesso istante (G3). A
 * parità di `remoteId` (stesso thread toccato da entrambi — es. uno lo
 * rinomina, l'altro lo archivia nella stessa finestra) i campi di `ours`
 * vincono: rappresenta l'azione che questo client sta effettivamente
 * ritentando in questo momento, e non deve perdersi silenziosamente solo
 * perché un'altra modifica al MEDESIMO thread è arrivata per prima. Questo
 * è il limite reale documentato in REMOTE_CHAT_HISTORY_V1.md: due modifiche
 * di METADATA diverse sullo STESSO thread nella stessa finestra — non
 * l'esistenza del thread, solo i suoi campi — non sono garantite entrambe
 * sopravviventi; l'esistenza di ENTRAMBI i thread invece lo è sempre.
 *
 * Ordine: quello del server (riflette l'arrangiamento più recente
 * confermato), con in testa gli eventuali thread che SOLO `ours` conosce
 * ancora (es. il thread appena creato che ha causato questo stesso
 * conflitto) — `initialize()` in `LocalStorageThreadListAdapter` mette i
 * thread nuovi in testa con `unshift`, e questo preserva quella convenzione.
 */
export function mergeThreadLists(serverRaw: string | null, oursRaw: string): string {
  const server = parseThreads(serverRaw);
  const ours = parseThreads(oursRaw);
  if (!ours) return serverRaw ?? oursRaw;
  if (!server) return oursRaw;

  const byId = new Map<string, ThreadEntry>();
  for (const entry of server) byId.set(entry.remoteId, entry);
  for (const entry of ours) {
    const existing = byId.get(entry.remoteId);
    byId.set(entry.remoteId, existing ? { ...existing, ...entry } : entry);
  }

  const onlyOurs = ours.map((entry) => entry.remoteId).filter((id) => !server.some((entry) => entry.remoteId === id));
  const order = [...onlyOurs, ...server.map((entry) => entry.remoteId)];
  const seen = new Set<string>();
  const merged: ThreadEntry[] = [];
  for (const id of order) {
    if (seen.has(id)) continue;
    seen.add(id);
    const entry = byId.get(id);
    if (entry) merged.push(entry);
  }
  return JSON.stringify(merged);
}
