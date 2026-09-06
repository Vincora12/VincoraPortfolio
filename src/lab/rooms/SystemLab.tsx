/* ============================================================================
   ⚙️ SYSTEM.LAB

   🔒 FONTE DEL DISEGNO: `docs/lab/design/system-lab.html`. Questo file è
   quella pagina tradotta in React — stesse schede, stessi titoli, stessi
   testi, stesse classi CSS — con dietro il MOTORE VERO invece dei dati
   finti.

   Nel disegno c'era uno `state` inventato: `day:12`, `sync.lifetime:12`,
   tre memorie scritte a mano. Qui al suo posto c'è `useApp`, cioè lo stato
   vero della creatura. È esattamente la richiesta: «le pagine lasciale
   com'erano, integra la parte che c'era dietro per poi utilizzarle».

   ⚠️ E DOVE IL MOTORE NON C'È ANCORA, IL DISEGNO RESTA E LO DICE. Il
   disegno stesso porta i suoi riquadri «LAB PREVIEW»: quelli non sono
   decorazione, sono la riga che distingue un controllo collegato da uno che
   somiglia a un controllo. Un pulsante finto senza cartello è la cosa
   peggiore che ci possa stare qui dentro.
   ========================================================================= */

import { useCallback, useEffect, useState } from 'react';
import { useApp, useActiveMon } from '../../state/store';
/* PERSONA → VOICE riusa questo hook (attesa) per la stessa chiamata di
   DEV → VOCE → PROVA — vedi PersonaVoice più sotto. */
import { useElapsed, waitingText } from '../../dev/useElapsed';
import { STAT_KEYS, UNKNOWN, isKnown } from '../../engine/types';
import type { StatKey } from '../../engine/types';
import { DAILY_SIGNALS, DAILY_SIGNAL_LABELS, dateForDay } from '../../engine/progression';
import { completeDayStreak, syncBalance, syncRewardProgress } from '../../engine/syncRewards';
import { readHealthJournal, HEALTH_JOURNAL_EVENT } from '../../engine/healthJournal';
import { loadPing, loadSetup, loadShortcutStatus, loadUsage, saveMonthlyCap, loadRuntimeLog, loadV2Issues, loadRemote, type ShortcutStatus, type UsageDashboard, type UsageEvent, type RuntimeEvent } from '../../ai/backend';
import type { V2Issue } from '../../ai/v2Issues';
import { lastRuns } from '../../ai/telemetry';
import { freshSecret } from '../../engine/secret';
import { projectJourneyState, validateJourneyCoherence } from '../../engine/journey';
import { estimateMonthlyCost } from '../../engine/costEstimate';
import {
  AI_STEPS,
  AI_STEP_ORDER,
  choicesFor,
  modelForStep,
  recommendedModel,
} from '../../../netlify/functions/_shared/routing';
import { Btn, Grid, LabTop, Notice, PageHead, Range, Rows, Section, Status } from './parts';
/* 🔷 LAB CONSOLIDATION + SAVE CONTROL. Il confronto LOCALE·SERVER e il
   verdetto vivono in `state/saveComparison.ts` — le stesse funzioni che
   `dev/ServerSection.tsx` usa già, non una copia. Le tre azioni
   (`saveNowToServer`, `restoreFromServer`, `startNewGame`) vivono in
   `state/store.ts`: sono i meccanismi canonici, questa scheda li chiama e
   basta. */
import { compareSaves, peekSave, quandoFa, type SavePeek } from '../../state/saveComparison';
import { restoreFromServer, saveNowToServer, startNewGame } from '../../state/store';
import { LabStyle } from '../embed/LabStyle';
import systemCss from '../skin/system.css?inline';
import {
  formatBytes,
  browserStorageEstimate,
  localStorageSnapshot,
  byCategory,
  CATEGORY_LABEL,
  indexedDbSnapshot,
  byIndexedDbCategory,
  INDEXEDDB_CATEGORY_LABEL,
  prototypeFieldBreakdown,
  computeSharedStorageStatus,
  computeLocalStorageStatus,
  LOCAL_STORAGE_LIMIT_LABEL,
  type BrowserStorageEstimate,
  type LocalStorageSnapshot,
  type IndexedDbSnapshot,
  type FieldBreakdown,
  type StorageStatus,
  type LocalStorageStatus,
} from '../storageInspector';
import { lastStorageOperation } from '../../system/localStorageDiagnostics';
import { LiveDebug } from './liveDebug';

const TABS = [
  { id: 'setup', label: 'SETUP' },
  /* 🔷 LAB CONSOLIDATION + SAVE CONTROL — «mi devi mettere un tasto salva
     allora.» Prima scheda dopo SETUP perché la domanda che ci porta qui è
     la stessa: «sta funzionando davvero, o sto solo indovinando?» — solo
     che questa volta la risposta è sulla partita, non sul backend. */
  { id: 'save', label: 'SAVE' },
  /* 🔷 LAB INFORMATION ARCHITECTURE CLEANUP — CREATURE non esiste più qui:
     era una destinazione top-level in concorrenza con CREATION.LAB per lo
     stesso concetto («la creatura attuale»). RESOLVER/LESSONS/ASSETS/STATE
     vivono ora dentro CREATION.LAB, dove c'era già FLOW/STATE/HISTORY —
     un solo posto per «chi è / come nasce» il .mon, non due. */
  { id: 'ai', label: 'AI' },
  { id: 'simulation', label: 'SIMULATION' },
  /* 🔷 Era «MEMORY», ed era il nome sbagliato: qui dentro non c'è mai stata
     una memoria personale, sono MOOD/OPINIONS/BUILD MODE — lo strato di
     persona, non di ricordo. Adesso porta anche VOCE, nativa, non un
     iframe: chiama `generateIntroduction` — la stessa funzione che
     DEV → VOCE → PROVA ha sempre chiamato. */
  { id: 'memory', label: 'PERSONA' },
  { id: 'machines', label: 'MACHINES' },
  { id: 'usage', label: 'USAGE' },
  { id: 'runtime-log', label: 'RUNTIME LOG' },
  { id: 'storage', label: 'STORAGE' },
  { id: 'live-debug', label: 'LIVE DEBUG' },
  /* 🔷 brief Shortcuts §11, e la regola scritta nell'atrio del lab:
     «se cambia come l'app... chiama API, va in SYSTEM.LAB». `/api/shortcut`
     è esattamente questo — e finora esisteva SOLO in DEV → SHORTCUT API,
     dentro l'app vera, non qui. Due superfici diverse, la stessa domanda
     («Nel lab c'è tutto?»), e qui la risposta era no finché non c'era
     questa scheda. */
  { id: 'shortcuts', label: 'SHORTCUTS' },
  /* VINZ.MON PROTOTYPE V1 → V2 (docs/PROTOTYPE_V1_STATUS.md). Sola
     lettura: la cattura resta nella Chat, qui si legge solo l'elenco
     canonico server-side — non un secondo posto dove editarlo. */
  { id: 'v2-issues', label: 'V2 ISSUES' },
  /* 🔷 LAB CONSOLIDATION — «integra la parte che c'era dietro per poi
     utilizzarle», non ridisegnarla. TEMPO, CREATURA e metà di VOCE vivono
     ancora solo dentro DEV://VINZ.MON: rifarle qui una a una è il
     refactor grosso che questo giro doveva evitare («se inizia a
     richiedere refactor grandi, fermati»). Questa scheda non le nasconde
     — dice dove sono, con lo stesso nome che hanno là — finché non
     arriva il loro turno nella lista delle priorità. */
  { id: 'legacy', label: 'LEGACY' },
];

export function SystemLab({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState('setup');

  return (
    <div className="app">
      <LabStyle css={systemCss} />
      <LabTop tabs={TABS} active={tab} onTab={setTab} onBack={onBack} />
      <main>
        {tab === 'setup' && <Setup />}
        {tab === 'save' && <Save />}
        {tab === 'ai' && <Ai />}
        {tab === 'simulation' && <Simulation onOpenUsage={() => setTab('usage')} />}
        {tab === 'memory' && <Memory />}
        {tab === 'machines' && <Machines />}
        {tab === 'usage' && <Usage />}
        {tab === 'runtime-log' && <RuntimeLog />}
        {tab === 'storage' && <StorageInspector />}
        {tab === 'live-debug' && <LiveDebug />}
        {tab === 'shortcuts' && <Shortcuts />}
        {tab === 'v2-issues' && <V2Issues />}
        {tab === 'legacy' && <Legacy />}
        <div className="footer mono">SYSTEM.LAB · SAME VINZ.MON ENGINE / SAME REPOSITORY</div>
      </main>
    </div>
  );
}

type MachineView = {
  id: string; name: string; purpose: string; reads: string[]; trigger: string; writes: string[]; model: string;
  state: { status: string; lastRun: string | null; lastOutput: string | null; usage: { provider: string; model: string; costUsd: number } | null; reflectionContext?: { recent: number; older: number; previousReflections: number; total: number } };
};
type PendingInsightView = { id: string; statement: string; machineId: string; status: string; notification: string; createdAt: string; confidence: number };

function Machines() {
  const token = useApp((s) => s.token);
  const reflectionModel = useApp((s) => s.stepModels.reflection);
  const [machines, setMachines] = useState<MachineView[] | null>(null);
  const [pending, setPending] = useState<PendingInsightView[]>([]);
  const [push, setPush] = useState<{ configured: boolean; subscriptions: number } | null>(null);
  const [error, setError] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const load = async () => {
    if (!token) { setError(true); return; }
    try {
      const response = await fetch('/api/machines', { headers: { authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('machines unavailable');
      const body = await response.json() as { machines?: MachineView[]; pendingInsights?: PendingInsightView[]; push?: { configured: boolean; subscriptions: number } };
      setMachines(body.machines ?? []); setError(false);
      setPending(body.pendingInsights ?? []);
      setPush(body.push ?? null);
    } catch { setError(true); }
  };
  useEffect(() => { void load(); }, [token]);
  const run = async (id: string) => {
    if (!token) return;
    setRunning(id);
    try { await fetch('/api/machines', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ machine: id, preferredModel: reflectionModel ?? null }) }); } finally { setRunning(null); void load(); }
  };
  /* 🔷 LAB INFORMATION ARCHITECTURE CLEANUP — «ME MACHINE still shows
     ANTHROPIC. Trace the actual ME machine, don't just rename the label.»

     🔒 QUELLO CHE HO TROVATO. Il campo `machine.model` non è un modello:
     è il nome della CAPACITÀ (`text-cheap`) dichiarata nel registro
     server (`_shared/machines.ts`) — mostrarlo come «MODEL» lascia
     credere che sia una scelta, quando è solo una categoria. Il modello
     VERO si vede solo in USAGE, dopo un run — e SOLO lì.

     ⚠️ E C'È UN DISALLINEAMENTO VERO SOTTO. Questa scheda manda
     `preferredModel: reflectionModel` — la STESSA scelta della scheda
     AI → RIFLESSIONE — a QUALSIASI macchina tu avvii, ME compresa: è
     already collegata, non due sistemi separati. Ma se in AI → RIFLESSIONE
     non hai scelto nulla, `reflectionModel` è `null`: la scheda AI mostra
     allora un predefinito Claude (`claude-haiku-4-5`), mentre il server,
     ricevendo `null`, cade sul SUO predefinito di riserva — che per
     `text-cheap` è OpenAI (`gpt-5.6-luna`), non Claude. Due «predefinito»
     diversi per la stessa domanda. Il testo qui sotto lo dice, non lo
     nasconde dietro un'etichetta ferma. */
  return <section className="page active">
    <PageHead kicker="SYSTEM.LAB / MACHINE MASTER" title="MACHINES" lead="Macchine indipendenti: lavorano solo quando vengono attivate, mai prima di una risposta in chat." />
    {error && <Notice title="MACHINE STATE NON DISPONIBILE">Il server non risponde oppure manca il token.</Notice>}
    {!machines && !error && <p className="note">Lettura dello stato…</p>}
    <Notice title="MODELLO — DA DOVE VIENE">
      Ogni macchina qui sotto usa lo stesso modello scelto in AI → RIFLESSIONE (`preferredModel`):
      non sono due sistemi separati. Se lì non hai scelto niente, la macchina non cade sul
      predefinito Claude che AI → RIFLESSIONE mostra: cade sul predefinito del server per questa
      capacità, che oggi è OpenAI gpt-5.6-luna. La riga USAGE qui sotto, dopo un run, dice sempre
      il modello VERO — non questa nota.
    </Notice>
    {machines?.map((machine) => <Section key={machine.id} title={machine.name}>
      <Rows rows={[
        ['PURPOSE', machine.purpose],
        ['READS', machine.reads.join(' · ')],
        ['TRIGGER', machine.trigger],
        ['WRITES', machine.writes.join(' · ')],
        ['CAPABILITY', machine.model],
        ['CONFIG SOURCE', reflectionModel ? `AI → RIFLESSIONE: ${reflectionModel}` : 'AI → RIFLESSIONE: nessuna scelta → riserva del server (OpenAI gpt-5.6-luna)'],
        ['DELIVERY', (machine as MachineView & { delivery?: string }).delivery ?? '—'],
        ['STATUS', machine.state.status],
        ['LAST RUN', machine.state.lastRun ? new Date(machine.state.lastRun).toLocaleString('it-IT') : 'NOT RUN'],
        ['LAST OUTPUT', machine.state.lastOutput ?? 'NOT RUN'],
        ...(machine.id === 'reflection' && machine.state.reflectionContext ? [['CONTEXT', `${machine.state.reflectionContext.recent} recent · ${machine.state.reflectionContext.older} older · ${machine.state.reflectionContext.previousReflections} previous reflections · ${machine.state.reflectionContext.total} total`] as [string, string]] : []),
        [
          'MODELLO VERO (USAGE)',
          machine.state.usage
            ? `${machine.state.usage.provider}/${machine.state.usage.model} · $${machine.state.usage.costUsd.toFixed(4)} — dall'ultimo run`
            : 'nessun run ancora — non risolto',
        ],
      ]} />
      <Btn disabled={running !== null} onClick={() => void run(machine.id)}>{running === machine.id ? 'RUNNING…' : 'RUN MACHINE'}</Btn>
    </Section>)}
    <Section title="PENDING INSIGHTS">
      {pending.length ? <Rows rows={pending.map((item) => [`${item.machineId} · ${item.status}`, `${item.statement} · ${Math.round(item.confidence * 100)}% · ${item.notification}`])} /> : <p className="note">Nessun insight in attesa.</p>}
    </Section>
    <Section title="PUSH DELIVERY">
      <Rows rows={push ? [['VAPID', push.configured ? 'CONFIGURED' : 'NOT CONFIGURED'], ['SUBSCRIPTIONS', String(push.subscriptions)]] : [['STATUS', 'NOT AVAILABLE']]} />
    </Section>
  </section>;
}

/* ============================================================================
   SETUP
   ========================================================================= */

function Setup() {
  const token = useApp((s) => s.token);
  const setToken = useApp((s) => s.setToken);
  const day = useApp((s) => s.day);
  const dayBoundaryTime = useApp((s) => s.dayBoundaryTime);
  const setDayBoundaryTime = useApp((s) => s.setDayBoundaryTime);
  const [setup, setSetup] = useState<Awaited<ReturnType<typeof loadSetup>> | null>(null);
  const [ping, setPing] = useState<Awaited<ReturnType<typeof loadPing>> | null>(null);
  const [checking, setChecking] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [draft, setDraft] = useState('');

  /* 🔒 «Configurato e funzionante sono due cose diverse», dice il disegno, e
     per questo si chiamano ENTRAMBE: `/api/setup` sa cosa è configurato,
     `/api/ping` sa cosa risponde. Il disegno lo simulava; qui succede. */
  const check = async () => {
    setChecking(true);
    const [s, p] = await Promise.all([loadSetup(token), loadPing(token)]);
    setSetup(s);
    setPing(p);
    setChecking(false);
  };

  useEffect(() => {
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const risponde = ping?.data != null && !ping.failure;
  const autorizzato = setup?.data?.serverToken === true;

  /* 🔒 `SetupState` NON espone le chiavi, e non è una mancanza: espone
     `ready`, cioè «ce n'è abbastanza per fare questa cosa». È una risposta
     migliore della lista delle chiavi — con una sola chiave OpenAI sono
     vere sia la voce che le immagini — ed è l'unica che il server può dare
     senza raccontare al browser cosa ha in cassaforte. */
  const ready = setup?.data?.ready;

  return (
    <section className="page active">
      <PageHead
        kicker="VINZ.LAB / SYSTEM"
        title="SYSTEM.LAB"
        lead="Configura VINZ.MON e capisci subito cosa è acceso, cosa manca e cosa risponde davvero. La creazione del .mon vive in CREATION.LAB."
      />

      <Section
        title="SYSTEM STATUS"
        note="Configurato e funzionante sono due cose diverse: questa tabella chiama /api/setup e /api/ping insieme, e mostra il primo anello che non regge."
      >
        <Rows
          rows={[
            ['BACKEND', <Status label={risponde ? 'RESPONDS' : 'NO RESPONSE'} ok={risponde} />],
            ['AUTH TOKEN', <Status label={autorizzato ? 'MATCH' : 'NOT READY'} ok={autorizzato} />],
            ['VOICE', <Status label={ready?.voice ? 'READY' : 'MISSING'} ok={ready?.voice === true} />],
            ['PROMPT COMPILER', <Status label={ready?.compile ? 'READY' : 'MISSING'} ok={ready?.compile === true} />],
            ['IMAGES', <Status label={ready?.draw ? 'READY' : 'MISSING'} ok={ready?.draw === true} />],
          ]}
        />
      </Section>

      {/* 🔴 «CONFIGURATO» E «FUNZIONANTE» ERANO ANCORA LA STESSA RIGA.
          Il riquadro qui sopra legge `/api/setup`, che sa solo se la CHIAVE
          C'È. Un account senza credito ha la chiave: risultava READY, e poi
          ogni chiamata moriva con la frase del fornitore — «The quota has
          been exceeded» — che non è mai stata una frase nostra.

          `/api/ping` la domanda vera la faceva già: chiede al fornitore
          l'elenco dei modelli, che non costa niente e non può fallire per il
          motivo che stiamo cercando. Sapeva rispondere e nessuno lo
          mostrava. Adesso la risposta sta sullo schermo, per fornitore:
          la chiave c'è · il fornitore la accetta · i modelli che chiamiamo
          esistono davvero con quel nome. 🔒 Nessuna chiave, nemmeno un
          pezzo: solo sì e no. */}
      <Section
        title="PROVIDERS"
        note="Chiedere l'elenco dei modelli non costa niente e non consuma token: se questa riga è rossa, il problema è dalla parte del fornitore, non del codice."
      >
        {!ping?.data ? (
          <p className="note">Premi RUN SYSTEM CHECK per interrogare i fornitori.</p>
        ) : ping.data.providers.length === 0 ? (
          <p className="note">Nessun fornitore dichiarato.</p>
        ) : (
          <Rows
            rows={ping.data.providers.map((probe) => {
              const sconosciuti = probe.models.filter((m) => !m.known).map((m) => m.model);
              const esito = !probe.configured
                ? `CHIAVE ASSENTE · ${probe.envVar}`
                : !probe.reachable
                  ? `NON RAGGIUNTO${probe.error ? ` · ${probe.error.slice(0, 60)}` : ''}`
                  : !probe.authorized
                    ? `CHIAVE RIFIUTATA · HTTP ${probe.status ?? '?'}`
                    : sconosciuti.length > 0
                      ? `OK, MA NOMI IGNOTI · ${sconosciuti.join(' ')}`
                      : `OK · ${probe.ms} ms`;
              const bene = probe.configured && probe.reachable && probe.authorized && sconosciuti.length === 0;
              return [probe.provider.toUpperCase(), <Status label={esito} ok={bene} />];
            })}
          />
        )}
      </Section>

      <Section
        title="DAY START TIME"
        note="Il confine ricorrente del giorno VINZ.MON. Cambiarlo non riscrive la storia: il tempo reale può solo recuperare un giorno rimasto indietro."
      >
        <div className="day-boundary-control">
          <label htmlFor="day-boundary-time">INIZIO GIORNO</label>
          <input
            id="day-boundary-time"
            type="time"
            step={60}
            value={dayBoundaryTime}
            onChange={(event) => setDayBoundaryTime(event.target.value)}
          />
        </div>
        <Rows rows={[["CURRENT GAME DAY", String(day)], ["BOUNDARY", dayBoundaryTime]]} />
      </Section>

      <Section title="VINZMON TOKEN">
        <p className="note">
          Il segreto vive in questo browser e deve coincidere con VINZMON_TOKEN su Netlify
          Production. Qui si legge se c’è, non quale sia: mostrarlo per intero vorrebbe dire
          scriverlo in uno screenshot.
        </p>
        <div className="secret">
          <code>{token ? `${token.slice(0, 6)}…${token.slice(-4)}` : 'NESSUN TOKEN'}</code>
        </div>
        <p className="note">
          Si genera da ATTIVA VINZ.MON, la schermata di prodotto — ma VINZ.LAB, installato come
          icona sua, è per iOS un'app A PARTE: non condivide il browser storage con VINZ.MON, quindi
          il segreto non arriva qui da solo. Incollalo una volta, preso da ATTIVA VINZ.MON o da
          DEV → SETUP nell'app vera.
        </p>
        <Grid>
          <Btn onClick={() => setShowPaste((v) => !v)}>
            {showPaste ? 'CHIUDI' : token ? 'CAMBIA IL SEGRETO' : 'INCOLLA IL SEGRETO'}
          </Btn>
        </Grid>
        {showPaste && (
          <>
            <label className="field">
              IL SEGRETO DEL CORE SERVER
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="VINZMON_TOKEN"
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
            </label>
            <Grid>
              <Btn
                variant="dark"
                disabled={draft.trim().length < 24 || checking}
                onClick={() => {
                  /* 🔴 Non richiama `check()` qui: chiuderebbe sul `token`
                     di QUESTO render, letto PRIMA di `setToken`. Il
                     `useEffect` qui sotto dipende da `token` e riparte da
                     solo al render successivo, quando lo stato è già
                     aggiornato — la stessa correzione già fatta al tasto
                     in fondo al flusso di CREATION.LAB. */
                  setToken(draft.trim());
                  setDraft('');
                  setShowPaste(false);
                }}
              >
                USA QUESTO
              </Btn>
            </Grid>
          </>
        )}
      </Section>

      <Section
        title="CHECK"
        note="Chiama insieme /api/setup e /api/ping e mostra quale singolo anello della catena non funziona."
      >
        <Grid>
          <Btn variant="dark" onClick={() => void check()} disabled={checking}>
            {checking ? 'CONTROLLO…' : 'RUN SYSTEM CHECK'}
          </Btn>
        </Grid>
        {(setup?.failure || ping?.failure) && (
          <p className="note">
            setup: {setup?.failure ?? 'ok'} · ping: {ping?.failure ?? 'ok'}
          </p>
        )}
      </Section>
    </section>
  );
}

/* ============================================================================
   SAVE — LAB CONSOLIDATION + SAVE CONTROL

   🔷 «Continua a tornare su una partita vecchia.» / «Mi devi mettere un
   tasto salva allora.»

   🔒 QUESTA SCHEDA NON INVENTA UN SECONDO SALVATAGGIO. LOCALE·SERVER usa lo
   stesso confronto di DEV → SERVER (`state/saveComparison.ts`), e le tre
   azioni chiamano i meccanismi canonici di `state/store.ts`:
   `saveNowToServer`, `restoreFromServer`, `startNewGame`. Se uno di questi
   tre cambia comportamento, cambia per ENTRAMBE le superfici — non c'è una
   seconda copia da tenere allineata a mano.

   ⚠️ NUOVA PARTITA non è RIPRENDI DAL SERVER al contrario: pulisce QUESTO
   telefono (`resetAll`, lo stesso reset di sempre) e poi scrive `reset:
   true` sul server, l'unica scrittura che può far tornare indietro il
   giorno. La copia superata non si perde — resta sul server sotto una
   chiave `pre-reset-…` — e i V2 Issues, le lezioni, Mem0 non sono nemmeno
   aperti da questa funzione.
   ========================================================================= */

function Save() {
  const token = useApp((s) => s.token);
  const day = useApp((s) => s.day);

  const [server, setServer] = useState<SavePeek | null | 'loading' | 'error'>('loading');
  const [local, setLocal] = useState<SavePeek | null>(null);
  const [busy, setBusy] = useState<'save' | 'restore' | 'new' | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);

  const guarda = useCallback(() => {
    if (!token) {
      setServer('error');
      return;
    }
    setServer('loading');
    const s = useApp.getState();
    setLocal({
      day: s.day,
      savedAt: null,
      mons: Object.keys(s.mons).length,
      activeMonName: s.activeMonName,
      kept: s.kept.length,
      nodes: s.nodes.length,
    });
    void loadRemote(token).then(({ data, failure }) => {
      if (failure || !data) {
        setServer('error');
        return;
      }
      setServer(data.state == null ? null : peekSave(data.state, data.day, data.savedAt));
    });
  }, [token]);

  useEffect(guarda, [guarda]);

  const verdetto = server && server !== 'loading' && server !== 'error' && local ? compareSaves(local, server) : null;

  return (
    <section className="page active">
      <PageHead
        kicker="VINZ.LAB / SYSTEM"
        title="SAVE"
        lead="Cosa sa questo telefono, cosa sa il server, e le tre decisioni che nessuna delle due parti può prendere da sola."
      />

      {!token && (
        <Notice title="NESSUN TOKEN">
          Senza segreto non c'è niente da chiedere: vai in SETUP e incolla il segreto già su
          Netlify.
        </Notice>
      )}

      {token && (
        <Section
          title="LOCALE · SERVER"
          note="Sola lettura di default: guardare non scrive niente. Le tre azioni qui sotto sono le uniche che scrivono."
        >
          {server === 'loading' && <p className="note">Sto chiedendo…</p>}
          {server === 'error' && (
            <p className="note">
              Il server non ha risposto. Rete giù, o il segreto non vale più — in tutti e due i
              casi questo telefono continua a funzionare da solo, ma NON sta salvando da nessuna
              parte.
            </p>
          )}
          {server === null && (
            <p className="note">Il server risponde, ma non ha ancora nessun salvataggio.</p>
          )}
          {server && server !== 'loading' && server !== 'error' && local && (
            <>
              {verdetto === 'allineati' && (
                <Notice title="🟢 ALLINEATI">
                  Quello che vedi qui è anche quello che c'è sul server. Se chiudi tutto adesso,
                  non perdi niente.
                </Notice>
              )}
              {verdetto === 'server-indietro' && (
                <Notice title="🔴 IL SERVER È INDIETRO">
                  Qualcosa che hai qui non è ancora arrivato sul server. Il salvataggio parte
                  quattro secondi dopo l'ultima cosa che fai — se resta indietro a lungo, usa
                  SALVA QUESTO STATO SUL SERVER qui sotto.
                </Notice>
              )}
              {verdetto === 'server-avanti' && (
                <Notice title="🟡 IL SERVER HA PIÙ ROBA">
                  Se non hai fatto NUOVA PARTITA, si scarica da sola al prossimo avvio. Se hai
                  resettato di proposito o per sbaglio, quel salvataggio resta bloccato apposta:
                  usa RIPRENDI DAL SERVER per tornare a quella copia.
                </Notice>
              )}
              {verdetto === 'divergenti' && (
                <Notice title="🟠 LE DUE COPIE SONO DIVERSE IN DUE DIREZIONI">
                  Ognuna ha qualcosa che l'altra non ha — succede con due dispositivi in
                  parallelo. Guarda i numeri prima di scegliere un'azione.
                </Notice>
              )}

              <p className="note"><strong>ULTIMA SCRITTURA SERVER</strong></p>
              <Rows rows={[['quando', quandoFa(server.savedAt)]]} />

              <p className="note"><strong>QUESTO TELEFONO · SERVER</strong></p>
              <Rows
                rows={[
                  ['giorno', `${local.day} · ${server.day}`],
                  ['forme (.mon)', `${local.mons} · ${server.mons}`],
                  ['in teca', `${local.kept} · ${server.kept}`],
                  ['nodi mindline', `${local.nodes} · ${server.nodes}`],
                  ['mon attivo', `${local.activeMonName ?? '—'} · ${server.activeMonName ?? '—'}`],
                ]}
              />
            </>
          )}
          <Grid>
            <Btn onClick={guarda} disabled={!token}>
              GUARDA DI NUOVO
            </Btn>
          </Grid>
        </Section>
      )}

      {token && (
        <Section
          title="AZIONI"
          note="Le uniche tre scritture di questa scheda. Ognuna dice cosa sta per fare prima di farlo."
        >
          {outcome && <p className="note">{outcome}</p>}

          <Grid>
            <Btn
              onClick={() => {
                setBusy('save');
                setOutcome(null);
                void saveNowToServer().then((r) => {
                  setBusy(null);
                  setOutcome(
                    r.ok
                      ? `Salvato sul server — giorno ${r.day}.`
                      : `Non sono riuscito a salvare: ${r.failure ?? 'errore sconosciuto'}.`,
                  );
                  guarda();
                });
              }}
              disabled={busy !== null}
            >
              {busy === 'save' ? 'STO SALVANDO…' : 'SALVA QUESTO STATO SUL SERVER'}
            </Btn>
          </Grid>
          <p className="note">
            Salva ADESSO, senza aspettare i quattro secondi normali. Utile prima di chiudere
            l'app o cambiare telefono.
          </p>

          {!confirmRestore ? (
            <Grid>
              <Btn onClick={() => setConfirmRestore(true)} disabled={busy !== null}>
                RIPRENDI DAL SERVER
              </Btn>
            </Grid>
          ) : (
            <>
              <p className="note">
                Questo telefono torna alla copia del server
                {server && server !== 'loading' && server !== 'error' && server
                  ? ` — giorno ${server.day}, ${server.mons} forme, mon attivo ${server.activeMonName ?? '—'}`
                  : ''}
                . Perdi quello che c'è solo qui, e non si torna indietro da qui.
              </p>
              <Grid>
                <Btn onClick={() => setConfirmRestore(false)} disabled={busy !== null}>
                  Lascia stare
                </Btn>
                <Btn
                  onClick={() => {
                    setBusy('restore');
                    setOutcome(null);
                    void restoreFromServer().then((data) => {
                      setBusy(null);
                      setConfirmRestore(false);
                      setOutcome(data ? 'Ripreso dal server.' : 'Il server non aveva niente da dare.');
                      guarda();
                    });
                  }}
                  disabled={busy !== null}
                >
                  Riprendi dal server
                </Btn>
              </Grid>
            </>
          )}

          {!confirmNew ? (
            <Grid>
              <Btn onClick={() => setConfirmNew(true)} disabled={busy !== null}>
                NUOVA PARTITA
              </Btn>
            </Grid>
          ) : (
            <>
              <p className="note">
                Ricomincia da capo: questo telefono torna al giorno 1, e il server riceve subito
                la stessa scrittura — così la partita vecchia (giorno {day}) non torna su da sola
                su un altro telefono. La copia vecchia NON viene distrutta, resta sul server da
                parte. Le lezioni, la memoria scritta a mano e i V2 Issues NON vengono toccati da
                questa azione. Non si torna indietro da qui.
              </p>
              <Grid>
                <Btn onClick={() => setConfirmNew(false)} disabled={busy !== null}>
                  Lascia stare
                </Btn>
                <Btn
                  onClick={() => {
                    setBusy('new');
                    setOutcome(null);
                    void startNewGame().then((r) => {
                      setBusy(null);
                      setConfirmNew(false);
                      setOutcome(
                        r.ok
                          ? `Nuova partita — giorno ${r.day}, scritta sul server.`
                          : `Reset fatto su questo telefono, ma NON è arrivato al server: ${r.failure ?? 'errore sconosciuto'}. Riprova SALVA QUESTO STATO SUL SERVER.`,
                      );
                      guarda();
                    });
                  }}
                  disabled={busy !== null}
                >
                  Nuova partita
                </Btn>
              </Grid>
            </>
          )}
        </Section>
      )}
    </section>
  );
}

/* ============================================================================
   AI — «Non vedo modifiche alla schermata AI del lab.»

   🔴 Aveva ragione: questa scheda leggeva e scriveva `voiceModel` /
   `compilerModel` / `imageModel` — i tre campi VECCHI che §19.3 ha sostituito
   con `stepModels`, e che la migrazione tiene in giro solo per un salvataggio
   di prima, non perché qualcuno li usi ancora. L'ho verificato riga per riga
   prima di toccare qualcosa: `forgeOne`, `generateAssetsFor`, `resolveWithAi`,
   `writeBioWithAi`, `writeNarratorWithAi`, `teachResolver`, `compileWithAi` —
   OGNI chiamata vera passa da `runStep`/`stepModel()`, mai da questi tre
   campi. Scegliere un modello qui non cambiava NIENTE di quello che gira
   davvero: era una manopola collegata al niente.

   Adesso legge lo stesso catalogo di DEV → AI/MODELLI (`routing.ts`):
   il consiglio (`recommendedModel`, costo + dati), il prezzo di ogni
   alternativa e il perché — non solo il nome. Stessa fonte di verità nei
   due posti, non due copie da tenere allineate a mano.
   ========================================================================= */
function Ai() {
  const stepModels = useApp((s) => s.stepModels);
  const setStepModel = useApp((s) => s.setStepModel);
  const token = useApp((s) => s.token);
  const runs = Object.fromEntries(lastRuns());

  /* «Metti anche stato per vedere se sono online, com'era nel DEV.» Stessa
     domanda di sempre — `/api/setup` la sa già per fornitore, non solo per
     voce/compilatore/immagini. */
  const [providerReady, setProviderReady] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void loadSetup(token).then(({ data }) => {
      if (!cancelled && data?.providerReady) setProviderReady(data.providerReady);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  /* 🔷 «In alto con quelle scelte metti una media mensile di spesa,
     pensando che io lo uso ogni giorno e faccio evoluzioni ogni 2 giorni.»
     Ricalcolata a ogni render — cambia un modello qui sotto e il numero si
     muove. */
  const stima = estimateMonthlyCost(stepModels);

  return (
    <section className="page active">
      <PageHead
        kicker="SYSTEM.LAB / ROUTING"
        title="AI"
        lead="Per ogni lavoro: chi lo fa adesso, chi consiglio e perché, quanto costano le alternative. Stesso catalogo di DEV → AI/MODELLI, non una copia a parte."
      />

      <Notice title={`STIMA MENSILE: $${stima.totalUsd.toFixed(2)}`}>
        {stima.byCategory.map((c) => `${c.label} · $${c.usd.toFixed(2)}`).join(' — ')}
        <br />
        Premesse: {Math.round(stima.assunzioni.evoluzioniAlMese)} evoluzioni al mese (una ogni 2
        giorni) · {stima.assunzioni.messaggiAlGiorno} messaggi al giorno (assunto, non dichiarato)
        · uno su cinque merita il modello pieno. Stima, non contatore: token per chiamata
        ragionevoli non misurati, senza cache — tende ad essere un filo alta, non bassa.
      </Notice>

      <div style={{ marginTop: 12 }}>
        {AI_STEP_ORDER.map((id) => {
          const step = AI_STEPS[id];
          const attivo = modelForStep(id, stepModels[id]);
          const pool = choicesFor(step.capability);
          const consiglio = recommendedModel(id);
          const run = runs[id];
          return (
            <div className="airow" key={id}>
              <div className="aihead">
                <strong>{step.label}</strong>
                <div>
                  {step.qualityCritical && <small>QUALITY</small>}
                  {step.background && <small>BACKGROUND</small>}
                </div>
              </div>
              <p className="aidesc">{step.it}</p>
              <p className="aidesc">
                CONSIGLIO: <strong>{consiglio.model}</strong> — {consiglio.why}
              </p>

              {pool.length > 1 ? (
                <div className="aicards">
                  {pool.map((c) => {
                    const rich = c as {
                      it?: string;
                      price?: { input: number; output: number };
                      perImage?: number;
                    };
                    const isActive = c.model === attivo;
                    const isRecommended = c.model === consiglio.model && !isActive;
                    const prezzo =
                      typeof rich.perImage === 'number'
                        ? `$${rich.perImage.toFixed(2)} a immagine`
                        : rich.price
                          ? `$${rich.price.input} / $${rich.price.output} per milione`
                          : 'prezzo non a catalogo';
                    const online = providerReady[c.provider];
                    return (
                      <button
                        type="button"
                        key={c.model}
                        className={`choice aicard ${isActive ? 'on' : ''}`}
                        onClick={() => setStepModel(id, c.model === step.fallback ? null : c.model)}
                      >
                        <strong>{c.label}{isRecommended ? ' ★' : ''}</strong>
                        <span className="aicard__price">{prezzo}</span>
                        {rich.it && <span className="aicard__why">{rich.it}</span>}
                        {/* In fondo alla scheda, com'era in DEV → VOCE. */}
                        <span className="aicard__status">
                          <Status
                            label={online === undefined ? 'STATO SCONOSCIUTO' : online ? 'ONLINE' : 'OFFLINE'}
                            ok={online === true}
                          />
                          {online === false && ` manca la chiave di ${c.provider}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="note">{attivo} — non ci sono alternative.</p>
              )}
              <p className="note">
                {run ? `last run ${(run.ms / 1000).toFixed(1)}s · ${run.ok ? 'OK' : 'FAILED'}` : 'no run yet'}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ============================================================================
   TEMPO — FINAL DEV → LAB CONSOLIDATION (CORREZIONE)

   🔷 «The original DEV home/TEMPO screen contains a useful operational
   dashboard… bring its useful functionality into LAB natively.»

   🔒 STESSI NUMERI DI DEV → INIZIO, DISEGNO NUOVO. `syncBalance` /
   `syncRewardProgress` / `completeDayStreak` sono le STESSE funzioni pure
   che disegnano `SyncDial` — qui il disegno è una barra e tre soglie nel
   linguaggio di LAB, non `SyncDial` stesso: quel componente porta le classi
   CSS dell'app (`sync-check__dial`…) che LAB non carica, e importarlo
   sembrerebbe rotto pur essendo identico sotto. Vedi `parts.tsx` per lo
   stesso ragionamento su `CopyBtn`.
   ========================================================================= */

function Tempo({ day, onAdvance, onOpenUsage }: { day: number; onAdvance: () => void; onOpenUsage: () => void }) {
  const startedAt = useApp((s) => s.startedAt);
  const token = useApp((s) => s.token);
  const [journal, setJournal] = useState(readHealthJournal);
  const [spend, setSpend] = useState<{ spentUsd: number; capUsd: number } | 'loading' | 'error'>('loading');

  useEffect(() => {
    const update = () => setJournal(readHealthJournal());
    window.addEventListener(HEALTH_JOURNAL_EVENT, update);
    return () => window.removeEventListener(HEALTH_JOURNAL_EVENT, update);
  }, []);

  useEffect(() => {
    if (!token) { setSpend('error'); return; }
    setSpend('loading');
    void loadUsage(token).then(({ data, failure }) => {
      if (failure || !data) { setSpend('error'); return; }
      setSpend({ spentUsd: data.spentUsd, capUsd: data.monthlyCapUsd });
    });
  }, [token, day]);

  const gameToday = dateForDay(day, startedAt);
  const streak = completeDayStreak(journal, gameToday);
  const balance = syncBalance(streak);
  const evolution = syncRewardProgress('evolution', streak);
  const mega = syncRewardProgress('mega-evolution', streak);
  const wish = syncRewardProgress('wish', streak);
  const pct = (n: number) => `${Math.min(100, (n / 30) * 100)}%`;

  return (
    <Section title="TEMPO" note="Il quadrante SYNC — stessi numeri di DEV → INIZIO, qui nello stile di SYSTEM.LAB.">
      <Rows rows={[['GIORNO', String(day)], ['SYNC', `${balance}/30`]]} />

      <div className="tempo-dial" aria-hidden="true">
        <div className="tempo-dial__fill" style={{ width: pct(balance) }} />
        <span className="tempo-dial__mark" style={{ left: pct(2) }} data-ready={evolution.ready} />
        <span className="tempo-dial__mark" style={{ left: pct(7) }} data-ready={mega.ready} />
        <span className="tempo-dial__mark" style={{ left: pct(30) }} data-ready={wish.ready} />
      </div>
      <Rows
        rows={[
          ['2 · EVOLVI', evolution.ready ? 'PRONTO' : `${evolution.have}/2`],
          ['7 · MEGAEVOLVI', mega.ready ? 'PRONTO' : `${mega.have}/7`],
          ['30 · ESPRIMI UN DESIDERIO', wish.ready ? 'PRONTO' : `${wish.have}/30`],
        ]}
      />

      <Grid>
        <Btn variant="dark" onClick={onAdvance}>+1 GIORNO</Btn>
      </Grid>
      <p className="note">
        Racconta, chiude, avanza e registra pasti e allenamento nel diario — lo stesso +1 GIORNO
        di DEV → INIZIO, non un secondo pulsante.
      </p>

      <p className="note">
        <strong>SPESA DEL MESE:</strong>{' '}
        {spend === 'loading' ? 'sto chiedendo…'
          : spend === 'error' ? 'il server non risponde.'
          : `$${spend.spentUsd.toFixed(2)} / $${spend.capUsd.toFixed(2)}`}
        {' — '}
        <a href="#" onClick={(e) => { e.preventDefault(); onOpenUsage(); }}>dettaglio in AI / USAGE</a>
      </p>
    </Section>
  );
}

/* ============================================================================
   SIMULATION
   ========================================================================= */

function Simulation({ onOpenUsage }: { onOpenUsage: () => void }) {
  const day = useApp((s) => s.day);
  const progression = useApp((s) => s.progression);
  const health = useApp((s) => s.health);
  const bias = useApp((s) => s.bias);
  const dev = useApp((s) => s.dev);
  const nodes = useApp((s) => s.nodes);
  const oggi = useApp((s) => s.days[s.day]);
  const mons = useApp((s) => s.mons);
  const activeMonName = useApp((s) => s.activeMonName);
  const world = useApp((s) => s.world);
  const worldHistory = useApp((s) => s.worldHistory);
  const ledger = useApp((s) => s.ledger);
  const journey = projectJourneyState({ mons, activeMonName, world, ledger });
  const coherence = validateJourneyCoherence(mons, activeMonName, world);

  /* 🔷 FINAL DEV → LAB CONSOLIDATION (CORREZIONE) — «LAB +1 DAY and DEV +1
     DAY must ultimately invoke the same underlying operation.» Era
     `advanceDays`, che NON chiude la giornata (`syncDay()`) e quindi non
     muove mai SYNC TOTAL — la riga qui sotto lo mostrava, ma restava ferma.
     `simulateSyncedDays` è l'azione canonica di DEV → INIZIO: fa tutto quello
     che faceva `advanceDays` più il riempimento del diario e la chiusura del
     giorno. Non è una seconda implementazione: è la stessa, adesso in un
     punto solo. */
  const simulateSyncedDays = useApp((s) => s.simulateSyncedDays);
  const openShift = useApp((s) => s.openShift);
  const setBias = useApp((s) => s.setBias);
  const setSignal = useApp((s) => s.setSignal);
  const setDev = useApp((s) => s.setDev);
  const setDailySignal = useApp((s) => s.setDailySignal);

  const valore = (k: StatKey) => {
    const v = health.stats[k].value;
    return isKnown(v) ? (v as number) : 50;
  };
  const ignoto = (k: StatKey) => !isKnown(health.stats[k].value);

  return (
    <section className="page active">
      <PageHead
        kicker="SYSTEM.LAB / DEV SIMULATION"
        title="SIMULATION"
        lead="Un solo banco di simulazione per tempo, segnali, SYNC e Mindline. Nessun secondo set di pulsanti per far passare i giorni."
      />

      {/* 🔴 QUESTO CARTELLO MANCAVA, ED È LA COSA PIÙ IMPORTANTE DELLA PAGINA.

          VINZ.LAB si installa con un'icona sua e sembra un'app a parte. Non lo
          è: legge e SCRIVE la stessa memoria di VINZ.MON. Premere RUN 1
          COMPLETE DAY qui dentro fa passare un giorno alla creatura VERA, e
          quel giorno non torna indietro.

          ⚠️ CREATION.LAB porta scritto «PRODUCTION = READ ONLY» ed è vero LÌ:
          il duello genera creature che si buttano. Ma quella frase, letta
          all'ingresso del laboratorio, si estende da sola a tutto il resto —
          ed è falsa qui. Una promessa giusta in una stanza diventa una bugia
          nella stanza accanto se nessuno dice dove finisce. */}
      <Notice title="⚠️ QUESTA PAGINA CAMBIA LA CREATURA VERA">
        Non è una simulazione a parte: è lo stesso stato di VINZ.MON. I giorni
        che fai passare qui sono passati davvero, e con la chiave attiva
        finiscono anche sul server.
      </Notice>

      <Tempo day={day} onAdvance={() => simulateSyncedDays(1)} onOpenUsage={onOpenUsage} />

      <Section title="TIME CONTROL" note="Questo è l’unico punto di SYSTEM.LAB che fa avanzare la simulazione.">
        <Rows
          rows={[
            ['CURRENT DAY', String(day)],
            ['SYNC TOTAL', String(progression.sync.lifetime)],
            ['IN CURRENT FORM', String(progression.sync.inForm)],
            ['SINCE GROWTH', String(progression.sync.sinceGrowth)],
            ['BOND', `${Math.round(progression.bond * 100)}%`],
          ]}
        />
        <Grid>
          <Btn variant="dark" onClick={() => simulateSyncedDays(1)}>RUN 1 COMPLETE DAY</Btn>
          <Btn onClick={() => simulateSyncedDays(7)}>RUN 7 COMPLETE DAYS</Btn>
          <Btn onClick={openShift}>NEXT MINDLINE EVENT</Btn>
        </Grid>
      </Section>

      {/* CORE EXTRACTION PHASE 3 — la prima lettura reale del boundary
          Journey (src/engine/journey.ts): Mon attivo, World e Ledger letti
          attraverso projectJourneyState/validateJourneyCoherence invece che
          ricostruiti qui a mano dai campi grezzi dello store.

          NARRATIVE SYSTEM PHASE 2 — WORLD ORIGIN/HISTORY: la riga in più che
          rende visibile la RISE. `worldHistory` esiste solo per una RISE già
          avvenuta; `previousWorldId` solo sul World che una RISE ha aperto. */}
      <Section title="JOURNEY" note="Mon attivo, World e Story Ledger — proiezione e coerenza, non lo stato grezzo.">
        <Rows
          rows={[
            ['ACTIVE MON', journey.activeMon ? journey.activeMon.data.name : '—'],
            ['WORLD', journey.world ? journey.world.name : 'nessuno ancora'],
            ['WORLD ORIGIN', journey.world?.previousWorldId ? `RISE da ${journey.world.previousWorldId}` : journey.world ? 'nascita (seedWorld)' : '—'],
            ['CANON EVENTS', journey.world ? String(journey.world.canon.length) : '—'],
            ['WORLD HISTORY', `${worldHistory.length} mondo/i lasciato/i indietro`],
            ['LEDGER · OPEN SETUPS', String(journey.ledger.setups.filter((setup) => setup.status === 'open').length)],
            ['LEDGER · DO NOT REPEAT', String(journey.ledger.doNotRepeat.length)],
            ['COHERENCE', coherence.issues.length === 0 ? 'OK' : `${coherence.issues.length} da verificare`],
          ]}
        />
        {coherence.issues.length > 0 && (
          <ul className="note" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {coherence.issues.map((issue, index) => <li key={index}>{issue}</li>)}
          </ul>
        )}
      </Section>

      <Section title="CURRENT DAY INPUTS" note="Modifica il giorno corrente prima di simularlo. UNKNOWN resta davvero sconosciuto.">
        {DAILY_SIGNALS.map((key) => (
          <div style={{ padding: '9px 0' }} key={key}>
            <strong className="mono" style={{ fontSize: 9 }}>{DAILY_SIGNAL_LABELS[key]}</strong>
            <div className="picker">
              {(['KNOWN', 'NOT_APPLICABLE', 'UNKNOWN'] as const).map((x) => (
                <button
                  type="button"
                  key={x}
                  className={(oggi?.signals[key].status ?? 'UNKNOWN') === x ? 'on' : ''}
                  onClick={() => setDailySignal(key, x, 'system.lab')}
                >
                  {x === 'NOT_APPLICABLE' ? 'N/A' : x}
                </button>
              ))}
            </div>
          </div>
        ))}

        {STAT_KEYS.map((k) => (
          <Range
            key={k}
            label={k}
            value={valore(k)}
            min={0}
            max={100}
            step={1}
            disabled={ignoto(k)}
            onChange={(v) => setSignal(k, v)}
            after={
              <button type="button" className="btn" onClick={() => setSignal(k, ignoto(k) ? 50 : UNKNOWN)}>
                {ignoto(k) ? 'SET VALUE' : 'UNKNOWN'}
              </button>
            }
          />
        ))}
      </Section>

      <Section title="SIMULATION BIAS">
        <Range label="DRIFT" value={bias.drift} min={-1} max={1} step={0.05} onChange={(v) => setBias({ drift: v })} />
        <Range label="LOG PROBABILITY" value={bias.logProbability} min={0} max={1} step={0.05} onChange={(v) => setBias({ logProbability: v })} />
        <Range label="WORKOUT PROBABILITY" value={bias.workoutProbability} min={0} max={1} step={0.05} onChange={(v) => setBias({ workoutProbability: v })} />
      </Section>

      <Section title="TEST OVERRIDES" note="Questi non fanno passare giorni. Servono solo a forzare condizioni difficili da raggiungere.">
        <Grid>
          <Btn variant={dev.forceContinue ? 'on' : undefined} onClick={() => setDev({ forceContinue: !dev.forceContinue })}>
            {dev.forceContinue ? 'ON' : 'OFF'} · FORCE MICRO
          </Btn>
          <Btn variant={dev.forceBranch ? 'on' : undefined} onClick={() => setDev({ forceBranch: !dev.forceBranch })}>
            {dev.forceBranch ? 'ON' : 'OFF'} · FORCE EVOLUTION
          </Btn>
          <Btn variant={dev.unlockAll ? 'on' : undefined} onClick={() => setDev({ unlockAll: !dev.unlockAll })}>
            {dev.unlockAll ? 'ON' : 'OFF'} · UNLOCK RARITY
          </Btn>
        </Grid>
        <Rows
          rows={[
            ['MINDLINE NODES', String(nodes.length)],
            ['ACTIVE NODE', nodes.length ? `NODE ${String(nodes.length).padStart(2, '0')}` : '—'],
          ]}
        />
      </Section>
    </section>
  );
}

/* ============================================================================
   MEMORY
   ========================================================================= */

function Memory() {
  const memories = useApp((s) => s.memories);
  const mood = useApp((s) => s.mood);
  const opinions = useApp((s) => s.opinions);
  const buildMode = useApp((s) => s.buildMode);
  const setBuildMode = useApp((s) => s.setBuildMode);
  const activeMonName = useApp((s) => s.activeMonName);

  return (
    <section className="page active">
      <PageHead
        kicker="VINZ.LAB / PERSONA"
        title="PERSONA"
        lead="MOOD (il tono di adesso), OPINIONS (quello che il .mon ha maturato) e la modalità operativa della chat — non memoria personale. Qui sotto anche VOICE, che stava solo in DEV → VOCE → PROVA."
      />

      <Notice title="⚠️ ANCHE QUI SI SCRIVE">
        La modalità operativa qui sotto è quella vera: accesa, il .mon smette di essere
        un personaggio anche nella chat normale, finché non la rispegni.
      </Notice>

      <Section
        title="ARCHIVE"
        note="La memoria CONVERSAZIONALE del .mon — non Mem0, non memoria personale: è l'archivio che alimenta la voce, come lo era già in DEV → VOCE → MEMORIA."
      >
        <Rows
          rows={[
            ['MEMORIES', String(memories.length)],
            ['ACTIVE MON', activeMonName ?? '—'],
          ]}
        />
        {memories.length === 0 ? (
          <p className="note">Nessuna memoria ancora: se ne scrivono vivendo, non aprendo questa scheda.</p>
        ) : (
          [...memories].slice(-8).reverse().map((m, i) => (
            <div className="memory" key={i}>
              <strong>{m.kind} · G{m.day}</strong>
              <p>{m.text}</p>
            </div>
          ))
        )}
      </Section>

      <Section title="CURRENT MOOD">
        {mood ? (
          <Rows
            rows={[
              ['TONE', String(Math.round(mood.tone))],
              ['CHARGE', String(Math.round(mood.charge))],
              ['FOOTING', String(Math.round(mood.footing))],
            ]}
          />
        ) : (
          <p className="note">Nessun umore: non c’è ancora una creatura viva.</p>
        )}
      </Section>

      <Section title="OPINIONS">
        {opinions.length === 0 ? (
          <p className="note">Nessuna opinione attiva.</p>
        ) : (
          opinions.map((o, i) => (
            <div className="memory" key={i}>
              <strong>{o.status} · STRENGTH {o.strength}</strong>
              <p>{o.text}</p>
            </div>
          ))
        )}
      </Section>

      {/* 🔷 LAB INFORMATION ARCHITECTURE CLEANUP — «the user does not
          understand what BUILD MODE does. Do NOT simply rename it. Trace
          it.» Tracciato: `buildMode` è REALE, non residuo. Da
          `state/store.ts` (~4978) e `ai/client.ts` (~144-163): quando è
          acceso, la CHAT smette di rispondere in personaggio — il system
          prompt cambia da quello vocale/persona a un prompt operativo
          neutro, la memoria e la cronologia non vengono lette, il modello
          passa a quello "pieno" con ragionamento, e se una chiamata fallisce
          si vede l'errore vero invece della battuta di ripiego in
          personaggio. Non tocca ASSET/RESOLVER/BIO — solo la CHAT. */}
      <Section title="MODALITÀ OPERATIVA IN CHAT">
        <p className="note">
          {buildMode
            ? 'ACCESA: in chat il .mon non risponde più in personaggio. Niente memoria, niente cronologia, modello con ragionamento — e se qualcosa fallisce vedi l\'errore vero, non una battuta di ripiego.'
            : 'SPENTA: la chat risponde in personaggio, con memoria e cronologia, e nasconde i guasti tecnici dietro una frase in tono.'}
        </p>
        <Btn variant={buildMode ? 'on' : undefined} onClick={() => setBuildMode(!buildMode)}>
          {buildMode ? 'TORNA IN PERSONAGGIO' : 'PASSA A MODALITÀ OPERATIVA'}
        </Btn>
      </Section>

      {/* 🔷 FINAL DEV → LAB CONSOLIDATION (CORREZIONE) — VOICE nativa, non un
          iframe: chiama `generateIntroduction`, la STESSA funzione che
          `dev/VoiceSection.tsx` chiama, con la voce e l'umore veri del .mon
          attivo. */}
      <PersonaVoice mood={mood} />
    </section>
  );
}

/* --- VOICE — chiama `generateIntroduction`, la stessa funzione di DEV → VOCE → PROVA --- */
function PersonaVoice({ mood }: { mood: ReturnType<typeof useApp.getState>['mood'] }) {
  const token = useApp((s) => s.token);
  const mon = useActiveMon();
  const [busy, setBusy] = useState(false);
  const waiting = useElapsed(busy);
  const [sample, setSample] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const tryVoice = async () => {
    if (!mon) return;
    setBusy(true);
    setSample(null);
    setProblem(null);
    const [{ generateIntroduction }, { stepModel }] = await Promise.all([
      import('../../ai/client'),
      import('../../state/store'),
    ]);
    const { result, failure } = await generateIntroduction(token, mon, mood, [], stepModel('voice'));
    setBusy(false);
    if (result) { setSample(result.text); return; }
    setProblem(
      failure === 'no-key' ? 'Nessuna chiave: la voce resta quella deterministica.'
        : failure === 'refused' ? 'Il modello ha declinato la richiesta.'
        : failure === 'capped' ? 'Tetto mensile raggiunto: è una decisione tua, non un guasto.'
        : 'Chiamata fallita: token sbagliato, funzioni non pubblicate o rete assente.',
    );
  };

  return (
    <Section title="VOICE" note="Prova la voce vera del .mon attivo, con l'umore di adesso — la stessa chiamata di DEV → VOCE → PROVA.">
      {!mon && <p className="note">Nessuna creatura attiva.</p>}
      {mon && (
        <>
          <Grid>
            <Btn variant="dark" disabled={busy} onClick={() => void tryVoice()}>
              {busy ? waitingText('STO ASCOLTANDO', waiting) : 'PROVA LA VOCE'}
            </Btn>
          </Grid>
          {sample && <p className="note">«{sample}»</p>}
          {problem && <p className="note">{problem}</p>}
        </>
      )}
    </Section>
  );
}

/* ============================================================================
   USAGE
   ========================================================================= */

/**
 * La spesa del mese, giorno per giorno.
 *
 * 🔷 «Un grafico semplice.» Ed è letteralmente questo: barre in un `<svg>`
 * scritto a mano, nessuna libreria nuova per disegnare venti rettangoli. La
 * riga del tetto è la cosa che il grafico deve raccontare — non «quanto ho
 * speso» ma «quanto manca al muro», che è la domanda vera.
 *
 * ⚠️ Il tetto è MENSILE e le barre sono GIORNALIERE: confrontarle sarebbe una
 * bugia (nessun giorno arriva mai vicino al tetto). Quindi la scala verticale
 * è il totale cumulato, e la riga del tetto attraversa quella.
 */
function SpendChart({ daily, capUsd }: { daily: UsageDashboard['daily']; capUsd: number }) {
  if (daily.length === 0) return <p className="note">Nessuna spesa registrata questo mese.</p>;

  let running = 0;
  const cumulative = daily.map((d) => ({ day: d.day, costUsd: d.costUsd, total: (running += d.costUsd) }));
  /* La scala arriva al tetto, sempre: se si fermasse alla spesa massima, una
     barra bassa sembrerebbe alta e il grafico direbbe il contrario del vero. */
  const peak = Math.max(capUsd, running, 0.01);
  const W = 320;
  const H = 96;
  const barW = W / cumulative.length;
  const capY = H - (capUsd / peak) * H;

  return (
    <div className="spend-chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label={`Spesa cumulata del mese: $${running.toFixed(2)} su un tetto di $${capUsd.toFixed(2)}`}>
        {cumulative.map((d) => {
          const h = (d.total / peak) * H;
          return <rect key={d.day} x={(d.day - 1) * barW + 0.5} y={H - h} width={Math.max(1, barW - 1)} height={h}
            className={d.total >= capUsd ? 'spend-chart__bar spend-chart__bar--over' : 'spend-chart__bar'} />;
        })}
        {capUsd > 0 && capY >= 0 && (
          <line x1="0" y1={capY} x2={W} y2={capY} className="spend-chart__cap" />
        )}
      </svg>
      <div className="spend-chart__axis">
        <span>1</span>
        <span className="mono">CUMULATO ${running.toFixed(2)} · TETTO ${capUsd.toFixed(2)}</span>
        <span>{cumulative.length}</span>
      </div>
    </div>
  );
}

function Usage() {
  const token = useApp((s) => s.token);
  const [usage, setUsage] = useState<UsageDashboard | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [capError, setCapError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const read = (): Promise<void> => loadUsage(token).then(({ data }) => {
    setUsage(data);
    setFailed(!data);
    if (data) setDraft(data.monthlyCapUsd.toFixed(2));
  });

  useEffect(() => {
    let cancelled = false;
    void loadUsage(token).then(({ data }) => {
      if (cancelled) return;
      setUsage(data);
      setFailed(!data);
      if (data) setDraft(data.monthlyCapUsd.toFixed(2));
    });
    return () => { cancelled = true; };
  }, [token]);

  /* La stessa validazione del server, scritta una volta qui: un pulsante che
     propone un numero che il server rifiuterà è un pulsante che mente. */
  const parsed = Number(draft.replace(',', '.').trim());
  const valid = usage !== null
    && draft.trim().length > 0
    && Number.isFinite(parsed)
    && parsed >= usage.capMinUsd
    && parsed <= usage.capMaxUsd;

  const commit = async () => {
    if (!usage || !valid) return;
    setSaving(true);
    setCapError(null);
    const { data, failure } = await saveMonthlyCap(token, Math.round(parsed * 100) / 100);
    if (failure || !data) {
      setCapError(failure === 'no-token' ? 'Manca il token: attiva VINZ.MON.' : 'Il server non ha accettato il tetto.');
      setSaving(false);
      setConfirming(false);
      return;
    }
    /* Si rilegge dal server invece di fidarsi della risposta: quello che la
       schermata mostra dev'essere quello che `checkCap()` applicherà. */
    await read();
    setSaving(false);
    setConfirming(false);
  };

  const onSave = () => {
    if (!usage || !valid) {
      setCapError(`Serve un numero fra $${usage?.capMinUsd ?? 0} e $${usage?.capMaxUsd ?? 500}.`);
      return;
    }
    /* 🔴 Abbassare il tetto sotto quello che si è GIÀ speso non è un errore, è
       una decisione — ma è una decisione che chiude l'AI all'istante, e va
       detto prima, non scoperto alla prossima domanda al .mon. */
    if (parsed <= usage.spentUsd) { setConfirming(true); return; }
    void commit();
  };

  const summary = (value: UsageDashboard['today']) => `${value.calls}× · $${value.costUsd.toFixed(4)} · ${value.inputTokens.toLocaleString('it-IT')} in · ${value.outputTokens.toLocaleString('it-IT')} out`;

  return (
    <section className="page active usage-page">
      <PageHead
        kicker="SYSTEM.LAB / TELEMETRY"
        title="USAGE"
        lead="Il registro server-side unico di chiamate, token e costi. Numeri tecnici, senza trasformarli in un cockpit."
      />
      {failed && <p className="note">Il registro non risponde. Riprova entrando di nuovo nella scheda.</p>}
      {!usage && !failed && <p className="note">Lettura del registro…</p>}
      {usage && <>
        <div className="usage-page__actions">
          <Btn onClick={() => window.print()}>ESPORTA / SALVA PDF</Btn>
          <p className="note">Si apre la stampa del dispositivo: scegli “Salva come PDF” per conservare il report.</p>
        </div>
        {/* 🔷 LAB INFORMATION ARCHITECTURE CLEANUP — «audit how the
            telemetry cost is calculated… report whether ACTUAL /
            ESTIMATED / MIXED.»

            🔒 VERIFICATO IN `_shared/spend.ts`: il TESTO è ATTUALE — i
            token di input/output vengono letti dalla risposta vera del
            fornitore, non stimati. Le IMMAGINI sono STIMATE — un prezzo
            fisso per immagine (dal listino) moltiplicato per un fattore di
            qualità (low/medium/high), non il costo reale fatturato dal
            fornitore, che quest'app non riceve mai. Il totale del mese è
            quindi MISTO: preciso sulla parte testo, una stima ragionevole
            sulla parte immagini — che è anche la parte più grande della
            spesa (per un Mon tipico, la maggioranza dei centesimi sono
            immagini). Non è un errore da correggere: è cosa dice davvero
            il numero. */}
        <Notice title="ACCURATEZZA — TESTO ATTUALE, IMMAGINI STIMATE">
          Il costo del TESTO viene dai token veri restituiti dal fornitore. Il costo delle
          IMMAGINI è una stima — prezzo per immagine dal listino × fattore di qualità — non la
          fattura reale, che questa app non riceve. Il totale sotto è quindi MISTO: preciso sul
          testo, stimato sulle immagini (di solito la voce più grande).
        </Notice>
        {/* 🔷 «Il LAB mostra i costi ma non il limite interno che può bloccare
            l'AI.» Prima riga della pagina, prima di ogni dettaglio: quanto ho
            speso, dov'è il muro, e se l'ho già colpito. */}
        <Section title="MONTHLY AI BUDGET">
          <Rows rows={[
            ['CURRENT SPEND', `$${usage.spentUsd.toFixed(2)} / $${usage.monthlyCapUsd.toFixed(2)}`],
            ['REMAINING', `$${usage.remainingUsd.toFixed(2)}`],
            ['PERCENT USED', `${usage.percentUsed.toFixed(1)}%`],
            ['STATUS', <Status label={usage.capped ? 'CAPPED' : 'ACTIVE'} ok={!usage.capped} />],
            ['CAP SOURCE', usage.capSource === 'runtime' ? 'RUNTIME (LAB)' : 'DEFAULT'],
          ]} />
          <SpendChart daily={usage.daily} capUsd={usage.monthlyCapUsd} />
          <div className="cap-editor">
            <label className="field">
              <span>MONTHLY CAP · $</span>
              <input
                value={draft}
                inputMode="decimal"
                aria-label="Tetto mensile in dollari"
                onChange={(e) => { setDraft(e.target.value); setCapError(null); setConfirming(false); }}
              />
            </label>
            <Btn variant="dark" onClick={onSave} disabled={saving || !valid}>
              {saving ? 'SALVO…' : 'SAVE'}
            </Btn>
          </div>
          {capError && <p className="note">{capError}</p>}
          {confirming && (
            <Notice title="SOTTO LA SPESA GIÀ FATTA">
              <p>
                Hai già speso ${usage.spentUsd.toFixed(2)} questo mese.
                Questo limite bloccherà immediatamente le nuove chiamate AI.
              </p>
              <Grid>
                <Btn variant="dark" onClick={() => void commit()} disabled={saving}>
                  {saving ? 'SALVO…' : 'CONFERMA E BLOCCA'}
                </Btn>
                <Btn onClick={() => setConfirming(false)}>ANNULLA</Btn>
              </Grid>
            </Notice>
          )}
          <p className="note">
            È lo stesso tetto che il server applica: vale dalla chiamata successiva,
            senza ripubblicare. Il mese riparte da zero da solo — il tetto resta.
          </p>
        </Section>
        <Section title="SUMMARY">
          <Rows rows={[
            ['TODAY', summary(usage.today)],
            ['7 DAYS', summary(usage.last7Days)],
            ['THIS MONTH', summary(usage.month)],
            ['MONTHLY CAP', `$${usage.monthlyCapUsd.toFixed(2)} · RESTANO $${usage.remainingUsd.toFixed(2)}`],
          ]} />
        </Section>
        <Section title="BY CAPABILITY">
          {Object.keys(usage.byCapability).length === 0 ? <p className="note">Nessuna chiamata registrata.</p> : <Rows rows={Object.entries(usage.byCapability).map(([name, value]) => [name, summary(value)])} />}
        </Section>
        <Section title="BY MODEL / PROVIDER">
          <Rows rows={Object.entries(usage.byModel).map(([name, value]) => [name, summary(value)])} />
        </Section>
        <LastMonCost events={usage.recentEvents} />
        <Section title="RECENT ACTIVITY">
          {usage.recentEvents.length === 0 ? <p className="note">Nessuna attività recente.</p> : <Rows rows={usage.recentEvents.slice(0, 20).map((event) => [
            `${event.action} · ${event.model}`,
            `${event.images ? `${event.images} img · ` : ''}${event.inputTokens.toLocaleString('it-IT')} in · ${event.outputTokens.toLocaleString('it-IT')} out · $${event.estimatedCostUsd.toFixed(4)}`,
          ])} />}
        </Section>
      </>}
    </section>
  );
}

/* ============================================================================
   LAST MON CREATION — COST PER MON

   🔷 «Add a useful way to understand: HOW MUCH DID THIS MON CREATION COST?
   Do NOT fake grouping by arbitrary time windows if a real creation/run id
   exists. First inspect whether calls already carry a mon id… If no
   reliable correlation exists, implement the smallest safe correlation
   metadata needed for FUTURE creation runs. Do not fabricate historical
   per-Mon totals that cannot be proven.»

   🔒 NON ESISTEVA NESSUNA CORRELAZIONE — verificato in `_shared/spend.ts`:
   né `UsageEvent` né `SpendEventMeta` portavano un id di run o il nome
   del .mon, su nessuna chiamata. Il campo `monName` aggiunto a questo
   giro (`AskRequest.monName` → `Payload.monName` → `recordSpend`) copre
   OGGI SOLO la generazione immagini (`generate.ts` → `askImage`) — che è
   anche la voce di spesa più grande, secondo la stessa telemetria che ha
   fatto notare il problema. Resolver e Bio non lo portano ancora: si
   vede sotto, onestamente, come «senza nome».

   ⚠️ NIENTE FINESTRE TEMPORALI ARBITRARIE. Questo pannello raggruppa per
   `monName` reale, non per «le ultime N ore»: se non c'è nessun evento
   con `monName`, lo dice — non inventa un raggruppamento sui tempi. */
function LastMonCost({ events }: { events: UsageEvent[] }) {
  const withName = events.filter((e) => e.monName);
  if (withName.length === 0) {
    return (
      <Section title="COSTO PER MON — ULTIMA CREAZIONE">
        <Notice title="NESSUNA CORRELAZIONE ANCORA">
          Prima di questo aggiornamento nessuna chiamata portava il nome del .mon nel registro di
          spesa: non si può ricostruire il costo di creazioni passate senza inventarlo. Da adesso
          in poi, ogni immagine forgiata lo dichiara — la prossima forgia comparirà qui.
        </Notice>
      </Section>
    );
  }
  const lastName = withName[0]!.monName!;
  const mine = withName.filter((e) => e.monName === lastName);
  const images = mine.filter((e) => e.images > 0);
  const text = mine.filter((e) => e.images === 0);
  const total = mine.reduce((sum, e) => sum + e.estimatedCostUsd, 0);
  const imagesCost = images.reduce((sum, e) => sum + e.estimatedCostUsd, 0);
  const textCost = text.reduce((sum, e) => sum + e.estimatedCostUsd, 0);

  return (
    <Section
      title="COSTO PER MON — ULTIMA CREAZIONE"
      note="Solo le chiamate che portano il nome del .mon (oggi: le immagini). Resolver e Bio non sono ancora etichettati — non contati qui, non inventati."
    >
      <Rows
        rows={[
          ['MON', lastName],
          ['TOTALE (tracciato)', `$${total.toFixed(4)}`],
          ['IMMAGINI', `$${imagesCost.toFixed(4)} · ${images.length} chiamate`],
          ['ALTRO TRACCIATO', `$${textCost.toFixed(4)} · ${text.length} chiamate`],
          ['CHIAMATE TOTALI', String(mine.length)],
        ]}
      />
    </Section>
  );
}

function RuntimeLog() {
  const token = useApp((s) => s.token);
  const [events, setEvents] = useState<RuntimeEvent[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    setError(false);
    void loadRuntimeLog(token).then(({ data, failure }) => {
      if (cancelled) return;
      if (failure || !data) {
        setError(true);
        setEvents([]);
      } else {
        setEvents(data.events);
      }
    });
    return () => { cancelled = true; };
  }, [token]);
  return <section className="page active"><PageHead kicker="SYSTEM.LAB / OBSERVABILITY" title="RUNTIME LOG" lead="Ultime 48 ore di eventi tecnici, senza contenuti personali." />
    {!events ? <p className="note">Lettura del registro…</p> : error ? <p className="note">Runtime Log non disponibile: verifica autenticazione o server.</p> : events.length === 0 ? <p className="note">Nessun evento recente.</p> : <Section title="LAST 48H"><Rows rows={events.map((event) => [`${new Date(event.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}  ${event.scope.toUpperCase()}`, `${event.eventType} · ${event.status}${event.model ? ` · ${event.model}` : ''}${event.error ? ` · ${event.error}` : ''}`])} /></Section>}
  </section>;
}

/* ============================================================================
   V2 ISSUES (LAB → SYSTEM → V2 ISSUES)

   VINZ.MON PROTOTYPE V1 → V2 (docs/PROTOTYPE_V1_STATUS.md,
   docs/V2_ISSUES.md). Sola lettura della fonte canonica server-side
   (netlify/functions/v2-issues.ts) — la cattura resta nella Chat
   ("Segna per la V2 che..."), qui si guarda soltanto. Niente Kanban,
   niente editing: un elenco e, al tocco, i tre campi che contano per
   ricostruire V2.
   ========================================================================= */

function V2Issues() {
  const token = useApp((s) => s.token);
  const [issues, setIssues] = useState<V2Issue[] | null>(null);
  const [error, setError] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setIssues(null);
    setError(false);
    void loadV2Issues(token).then(({ data, failure }) => {
      if (cancelled) return;
      if (failure || !data) {
        setError(true);
        setIssues([]);
      } else {
        setIssues(data.issues);
      }
    });
    return () => { cancelled = true; };
  }, [token]);
  const open = issues && issues.length > 0
    ? issues.filter((issue) => issue.status === 'OPEN').length
    : 0;
  const closed = issues ? issues.length - open : 0;
  return (
    <section className="page active">
      <PageHead
        kicker="SYSTEM.LAB / PROTOTYPE → V2"
        title="V2 ISSUES"
        lead="Requisiti registrati usando il prototipo, per ricostruire VINZ.MON da zero. Si aggiungono dalla Chat («Segna per la V2 che…»), non da qui."
      />
      {!issues ? <p className="note">Lettura dell'elenco…</p>
        : error ? <p className="note">V2 Issues non disponibile: verifica autenticazione o server.</p>
        : issues.length === 0 ? <p className="note">Nessun issue registrato ancora.</p>
        : (
          <>
            <Section title="TOTALI">
              <Rows rows={[
                ['TOTAL', String(issues.length)],
                ['OPEN', String(open)],
                ['CLOSED', String(closed)],
              ]} />
            </Section>
            <Section title="ELENCO" note="Tocca una riga per vedere osservazione, comportamento atteso e requisito finale.">
              {issues.slice().reverse().map((issue) => {
                const expanded = openId === issue.id;
                return (
                  <div key={issue.id} className="v2-issue-row">
                    <button
                      type="button"
                      className="row v2-issue-row__head"
                      onClick={() => setOpenId(expanded ? null : issue.id)}
                      aria-expanded={expanded}
                    >
                      <span>{issue.id} · {issue.title}</span>
                      <span className="value mono">{issue.area} · {issue.type} · {issue.status}</span>
                    </button>
                    {expanded && (
                      <div className="v2-issue-row__detail">
                        <p><strong>OBSERVATION</strong><br />{issue.observation}</p>
                        <p><strong>EXPECTED FINAL BEHAVIOR</strong><br />{issue.expectedBehavior || '—'}</p>
                        <p><strong>FINAL REQUIREMENT</strong><br />{issue.finalRequirement || '—'}</p>
                        <p className="note">creato {new Date(issue.createdAt).toLocaleDateString('it-IT')} · aggiornato {new Date(issue.updatedAt).toLocaleDateString('it-IT')}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </Section>
          </>
        )}
    </section>
  );
}

/* ============================================================================
   STORAGE (LAB → SYSTEM → STORAGE)

   🔷 «Voglio vedere sul mio iPhone quanto storage stiamo usando, quanto
   rimane, quanto pesa localStorage, quanto pesa IndexedDB, quali categorie
   occupano spazio, quali key sono responsabili, cosa è cache e cosa è
   canonico.»

   ⚠️ SOLO LETTURA (per ora). Nessun pulsante cancella niente qui — la logica
   di misura vive in `../storageInspector.ts`, testabile e senza React.

   🔒 Non c'è mai un `value` in questa schermata: né testo di chat, né
   prompt, né token, né immagini. Solo nomi di chiave, byte, percentuali.
   ========================================================================= */

/** `[██████████████░░░░░░] 68%` — letterale, com'era nella richiesta: un
    testo monospaziato si legge sull'iPhone meglio di qualunque libreria di
    grafici, e qui non ne serve una. */
function AsciiBar({ percent, width = 22 }: { percent: number | null; width?: number }) {
  if (percent === null) return <span className="mono storage-bar">[{'░'.repeat(width)}] —</span>;
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  return (
    <span className="mono storage-bar">
      [{'█'.repeat(filled)}{'░'.repeat(width - filled)}] {clamped.toFixed(1)}%
    </span>
  );
}

/** Una riga di categoria: nome, barra proporzionata al totale del suo
    contenitore (non alla quota del browser — sono scale diverse), byte. */
function CategoryRow({ label, bytes, total }: { label: string; bytes: number; total: number }) {
  const percent = total > 0 ? (bytes / total) * 100 : 0;
  const width = 14;
  const filled = Math.max(bytes > 0 ? 1 : 0, Math.round((percent / 100) * width));
  return (
    <div className="storage-cat">
      <span className="storage-cat__label">{label}</span>
      <span className="mono storage-cat__bar">[{'█'.repeat(filled)}{'░'.repeat(width - filled)}]</span>
      <span className="storage-cat__bytes mono">{formatBytes(bytes)} · {percent.toFixed(0)}%</span>
    </div>
  );
}

const MEASUREMENT_LABEL: Record<'measured' | 'estimated' | 'unavailable', string> = {
  measured: 'MEASURED',
  estimated: 'ESTIMATED',
  unavailable: 'NOT AVAILABLE',
};

const STATUS_OK: Record<StorageStatus, boolean> = {
  ACTIVE: true,
  WARNING: false,
  CRITICAL: false,
  'QUOTA EXCEEDED': false,
};

/** Le classificazioni dell'INSPECTOR: cosa succede se questa chiave sparisce. */
const CLASSIFICATION_NOTE: Record<string, string> = {
  CANONICAL: 'unica copia qui',
  'SERVER-BACKED': 'il server ne tiene una copia',
  RECONSTRUCTIBLE: 'torna un default',
  CACHE: 'copia locale di qualcos\'altro',
  UNKNOWN: 'chiave non riconosciuta',
};

interface ServerBucket {
  label: string;
  detail: string;
  sizeLabel: string;
}

function StorageInspector() {
  const token = useApp((s) => s.token);

  const [browser, setBrowser] = useState<BrowserStorageEstimate | null>(null);
  const [local, setLocal] = useState<LocalStorageSnapshot | null>(null);
  const [idb, setIdb] = useState<IndexedDbSnapshot | null>(null);
  const [fields, setFields] = useState<FieldBreakdown[] | null>(null);
  const [quotaHit, setQuotaHit] = useState<typeof lastStorageOperation>(null);
  const [server, setServer] = useState<ServerBucket[] | null>(null);
  const [serverFailed, setServerFailed] = useState(false);
  const [lastStateSave, setLastStateSave] = useState<RuntimeEvent | null | undefined>(undefined);
  const [mem0, setMem0] = useState<{ memories: number | null; note: string } | null>(null);
  const [showInspector, setShowInspector] = useState(false);
  const [expandedField, setExpandedField] = useState<string | null>(null);

  useEffect(() => {
    /* Sincrone e gratuite: nessun motivo di aspettare un frame per queste. */
    setLocal(localStorageSnapshot());
    setFields(prototypeFieldBreakdown());
    /* `lastStorageOperation` è di `localStorageDiagnostics.ts`: un solo
       breadcrumb in memoria, aggiornato da ogni `setItem` dell'app —
       incluso il salvataggio principale. È lo stesso segnale che porta la
       schermata di crash, non una copia parallela. */
    setQuotaHit(lastStorageOperation?.status === 'ERROR' && lastStorageOperation.errorName === 'QuotaExceededError' ? lastStorageOperation : null);
    void browserStorageEstimate().then(setBrowser);
    void indexedDbSnapshot().then(setIdb);
  }, []);

  useEffect(() => {
    if (!token) { setServerFailed(true); return; }
    const headers = { authorization: `Bearer ${token}` };
    let cancelled = false;
    /* 🔒 NIENTE endpoint nuovo per elencare i blob: si usano le stesse GET
       che USAGE, RUNTIME LOG e MACHINES già chiamano, e se ne misura solo la
       risposta — SIZE UNKNOWN dove non c'è già un numero reale da leggere. */
    void Promise.all([
      loadUsage(token),
      loadRuntimeLog(token),
      fetch('/api/machines', { headers }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/me-memory', { headers }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([usage, runtimeLog, machinesJson, meMemoryJson]) => {
      if (cancelled) return;
      const responseBytes = (value: unknown) => {
        try { return new TextEncoder().encode(JSON.stringify(value)).length; } catch { return null; }
      };
      const buckets: ServerBucket[] = [];
      if (usage.data) {
        const bytes = responseBytes(usage.data);
        buckets.push({
          label: 'USAGE LEDGER',
          detail: `${usage.data.month.calls}× questo mese`,
          sizeLabel: bytes ? `~${formatBytes(bytes)} (risposta)` : 'SIZE UNKNOWN',
        });
      } else {
        buckets.push({ label: 'USAGE LEDGER', detail: 'non disponibile', sizeLabel: 'SIZE UNKNOWN' });
      }
      if (runtimeLog.data) {
        const bytes = responseBytes(runtimeLog.data);
        buckets.push({
          label: 'RUNTIME LOG',
          detail: `${runtimeLog.data.events.length} eventi (48h)`,
          sizeLabel: bytes ? `~${formatBytes(bytes)} (risposta)` : 'SIZE UNKNOWN',
        });
        /* 🔒 STORAGE STABILIZATION STEP 1/5 — SERVER STATE legge da qui, non
           da una `fetch` sua: il Runtime Log È la fonte di verità di questo
           salvataggio, non una seconda che rischia di raccontare un'altra
           storia. `events` arriva già ordinato dal più recente (vedi
           `recentRuntimeEvents` server-side, `.reverse()`). */
        setLastStateSave(runtimeLog.data.events.find((event) => event.eventType.startsWith('STATE_REMOTE_SAVE_')) ?? null);
      } else {
        buckets.push({ label: 'RUNTIME LOG', detail: 'non disponibile', sizeLabel: 'SIZE UNKNOWN' });
        setLastStateSave(null);
      }
      if (machinesJson && typeof machinesJson === 'object') {
        const machines = (machinesJson as { machines?: unknown[] }).machines;
        const bytes = responseBytes(machinesJson);
        buckets.push({
          label: 'MACHINES',
          detail: Array.isArray(machines) ? `${machines.length} macchine` : '—',
          sizeLabel: bytes ? `~${formatBytes(bytes)} (risposta)` : 'SIZE UNKNOWN',
        });
      } else {
        buckets.push({ label: 'MACHINES', detail: 'non disponibile', sizeLabel: 'SIZE UNKNOWN' });
      }
      buckets.push({
        label: 'CHATS · RUNTIME CONFIG',
        detail: 'in vinzmon-user-data · dimensione dal mirror locale sotto',
        sizeLabel: 'vedi LOCAL STORAGE',
      });
      buckets.push({
        label: 'ALTRI BLOB (state, assets, evolution, duel, shortcut, push, brain, ingest)',
        detail: 'nessun endpoint elenca questi store dal client',
        sizeLabel: 'SIZE UNKNOWN',
      });
      setServer(buckets);
      setServerFailed(false);

      /* CORE EXTRACTION PHASE 2 — /api/me-memory ora dichiara sempre `backend` (custom/mem0/
         frozen): prima questa sezione indovinava "mem0 attivo" dalla sola presenza di `counts`,
         che però esiste anche nella proiezione ME Model — un falso "mem0" ogni volta che il
         backend reale era l'ME Model. Diagnostica LAB: qui è il posto giusto per leggerlo. */
      if (meMemoryJson && typeof meMemoryJson === 'object') {
        const backend = (meMemoryJson as { backend?: string }).backend;
        const counts = (meMemoryJson as { counts?: { memories?: number } }).counts;
        setMem0(
          backend === 'mem0'
            ? { memories: typeof counts?.memories === 'number' ? counts.memories : null, note: 'mem0 attivo' }
            : { memories: null, note: backend ? `non attivo — backend attuale: ${backend}` : 'non disponibile' },
        );
      } else {
        setMem0({ memories: null, note: 'non disponibile' });
      }
    }).catch(() => { if (!cancelled) setServerFailed(true); });
    return () => { cancelled = true; };
  }, [token]);

  const percentUsed = browser?.usageBytes != null && browser.quotaBytes != null && browser.quotaBytes > 0
    ? (browser.usageBytes / browser.quotaBytes) * 100
    : null;
  const sharedStatus = computeSharedStorageStatus(percentUsed, quotaHit !== null);
  const localStatus: LocalStorageStatus | null = local ? computeLocalStorageStatus(local.totalBytes, quotaHit !== null) : null;
  const LOCAL_STATUS_OK: Record<LocalStorageStatus, boolean> = { HEALTHY: true, WARNING: false, 'QUOTA EXCEEDED': false };

  const localCats = local ? byCategory(local.keys) : [];
  const idbCats = idb ? byIndexedDbCategory(idb.entries) : [];

  return (
    <section className="page active">
      <PageHead
        kicker="SYSTEM.LAB / STORAGE"
        title="STORAGE"
        lead="Capacità e contenuti, letti direttamente dal dispositivo. Sola lettura: niente qui cancella o sposta niente."
      />

      <Section
        title="LOCAL STORAGE"
        note="Tutte le chiavi del dominio, misurate byte per byte (UTF-16, come le tiene davvero il motore) — non è una stima. Nessun browser espone il tetto specifico di localStorage: LIMIT lo dice invece di indovinarlo, e STATUS viene solo da un QuotaExceededError reale o da una soglia prudenziale dichiarata come tale."
      >
        {!local || !localStatus ? <p className="note">Lettura…</p> : <>
          <Rows rows={[
            ['USED', formatBytes(local.totalBytes)],
            ['LIMIT', LOCAL_STORAGE_LIMIT_LABEL],
            ['STATUS', <Status label={localStatus} ok={LOCAL_STATUS_OK[localStatus]} />],
            ['KEYS', String(local.keys.length)],
          ]} />
          {quotaHit && (
            <p className="note">
              ⚠️ Scrittura rifiutata di recente ({new Date(quotaHit.startedAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} · {quotaHit.source} · {quotaHit.keyPrefix}) — QUOTA EXCEEDED resta finché non ricarichi la pagina.
            </p>
          )}
          {localCats.map((cat) => (
            <CategoryRow key={cat.category} label={`${CATEGORY_LABEL[cat.category]} · ${cat.count}`} bytes={cat.bytes} total={local.totalBytes} />
          ))}
        </>}
      </Section>

      <Section
        title="SERVER STATE"
        note="Il salvataggio della partita (`/api/state`, store vinzmon-state) — l'unico che ha un tetto duro. Letto dal Runtime Log, non da una richiesta a sé: è la stessa osservabilità, non una seconda copia."
      >
        {lastStateSave === undefined ? <p className="note">Lettura…</p> : lastStateSave === null ? (
          <p className="note">Nessun salvataggio recente nel Runtime Log (48h). Modifica qualcosa nell'app: il prossimo salvataggio comparirà qui.</p>
        ) : (
          <Rows rows={[
            ['LAST SAVE', new Date(lastStateSave.timestamp).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })],
            ['STATUS', <Status
              label={lastStateSave.eventType === 'STATE_REMOTE_SAVE_OK' ? 'HEALTHY' : lastStateSave.eventType === 'STATE_REMOTE_SAVE_ERROR' && lastStateSave.statusCode === 413 ? 'TOO LARGE' : lastStateSave.eventType === 'STATE_REMOTE_SAVE_ERROR' ? 'FAILED' : 'IN CORSO'}
              ok={lastStateSave.eventType === 'STATE_REMOTE_SAVE_OK'}
            />],
            ['PAYLOAD', lastStateSave.payloadBytes != null ? formatBytes(lastStateSave.payloadBytes) : '—'],
            ['LIMIT', lastStateSave.limitBytes != null ? formatBytes(lastStateSave.limitBytes) : '—'],
            ...(lastStateSave.error ? [['REASON', lastStateSave.error] as [string, string]] : []),
          ]} />
        )}
      </Section>

      <Section title="BROWSER SHARED STORAGE" note={`Quota dell'intera origine — localStorage + IndexedDB + il resto insieme, MAI il limite specifico di localStorage (navigator.storage.estimate) — ${browser ? MEASUREMENT_LABEL[browser.kind] : 'lettura…'}. Non è inventata: se il browser non la dà, resta NOT AVAILABLE.`}>
        <AsciiBar percent={percentUsed} />
        <Rows rows={[
          ['USED', browser?.usageBytes != null ? formatBytes(browser.usageBytes) : '—'],
          ['QUOTA', browser?.quotaBytes != null ? formatBytes(browser.quotaBytes) : '—'],
          ['REMAINING', browser?.usageBytes != null && browser?.quotaBytes != null ? formatBytes(Math.max(0, browser.quotaBytes - browser.usageBytes)) : '—'],
          ['PERCENT USED', percentUsed !== null ? `${percentUsed.toFixed(1)}%` : '—'],
          ['MEASUREMENT', browser ? MEASUREMENT_LABEL[browser.kind] : '…'],
          ['STATUS', <Status label={sharedStatus} ok={STATUS_OK[sharedStatus]} />],
        ]} />
      </Section>

      <Section
        title="INDEXEDDB / ASSETS"
        note="Immagini dei .mon e delle prove del duello — misurate leggendo la dimensione reale di ogni Blob, mai il contenuto."
      >
        {!idb ? <p className="note">Lettura…</p> : idb.kind === 'unavailable' ? <p className="note">IndexedDB non disponibile in questo browser.</p> : <>
          <p className="mono storage-total">{formatBytes(idb.totalBytes)} · {idb.entries.length} record</p>
          {browser?.quotaBytes && <p className="note storage-shared">SHARED BROWSER QUOTA — stessa quota di LOCAL STORAGE, non una separata</p>}
          {idbCats.map((cat) => (
            <CategoryRow key={cat.category} label={`${INDEXEDDB_CATEGORY_LABEL[cat.category]} · ${cat.count}`} bytes={cat.bytes} total={idb.totalBytes} />
          ))}
        </>}
      </Section>

      <Section
        title="SERVER-BACKED DATA"
        note="Quello che VINZ.MON tiene su Netlify, non nel browser. Non condivide la quota qui sopra: è un'altra macchina."
      >
        {serverFailed && !server ? <p className="note">Non disponibile: manca il token o il server non risponde.</p> : !server ? <p className="note">Lettura…</p> : (
          <Rows rows={server.map((bucket) => [bucket.label, `${bucket.detail} · ${bucket.sizeLabel}`])} />
        )}
      </Section>

      <Section
        title="MEM0"
        note="Servizio di memoria a lungo termine, esterno: non è localStorage e non ne condivide la quota."
      >
        <Rows rows={[
          ['SERVICE', 'mem0'],
          ['MEMORIES', mem0?.memories != null ? String(mem0.memories) : 'SIZE UNKNOWN'],
          ['NOTE', mem0?.note ?? '…'],
        ]} />
      </Section>

      <Section title="STORAGE INSPECTOR" note="Ogni chiave di LOCAL STORAGE, classificata per capire cosa succede se sparisce.">
        <Btn onClick={() => setShowInspector((v) => !v)}>{showInspector ? 'NASCONDI LISTA' : `MOSTRA ${local?.keys.length ?? 0} KEYS`}</Btn>
        {showInspector && local && (
          <div className="storage-inspector-list">
            {local.keys.map((item) => (
              <div className="storage-key-row" key={item.key}>
                <span className="storage-key-row__key mono">{item.key}</span>
                <span className="storage-key-row__cat">{CATEGORY_LABEL[item.category]}</span>
                <span className="storage-key-row__size mono">{formatBytes(item.bytes)}</span>
                <span className="storage-key-row__size mono">{local.totalBytes > 0 ? `${((item.bytes / local.totalBytes) * 100).toFixed(1)}%` : '—'}</span>
                <span className={`storage-key-row__class storage-key-row__class--${item.classification.toLowerCase().replace(/\s+/g, '-')}`}>
                  {item.classification}
                  <span className="storage-key-row__class-note"> · {CLASSIFICATION_NOTE[item.classification]}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {fields && fields.length > 0 && (
          <>
            <p className="note" style={{ marginTop: 14 }}>Drill-down di <code>vinzmon.prototype.v4</code> — dimensione per campo, mai il contenuto.</p>
            {fields.map((field) => (
              <div key={field.field}>
                <div
                  className="storage-field-row"
                  role={field.children ? 'button' : undefined}
                  onClick={field.children ? () => setExpandedField((v) => (v === field.field ? null : field.field)) : undefined}
                >
                  <span className="mono">{field.children ? (expandedField === field.field ? '▾ ' : '▸ ') : '  '}{field.field}</span>
                  <span className="mono">{formatBytes(field.bytes)}</span>
                </div>
                {field.children && expandedField === field.field && (
                  <div className="storage-field-children">
                    {field.children.slice(0, 12).map((child) => (
                      <div className="storage-field-row storage-field-row--child" key={child.field}>
                        <span className="mono">{child.field}</span>
                        <span className="mono">{formatBytes(child.bytes)}</span>
                      </div>
                    ))}
                    {field.children.length > 12 && <p className="note">+{field.children.length - 12} altri</p>}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </Section>
    </section>
  );
}

/* ============================================================================
   SHORTCUTS (brief «VINZ.MON iOS Shortcuts — Background Integration», §11)
   ========================================================================= */

const AI_POLICY_LABEL: Record<string, string> = { never: 'MAI', sometimes: 'A VOLTE', usually: 'QUASI SEMPRE' };
const EXAMPLE_BODY = JSON.stringify({ action: 'meal', text: 'piadina con pollo e mozzarella' }, null, 2);

function Shortcuts() {
  const token = useApp((s) => s.token);
  const [status, setStatus] = useState<ShortcutStatus | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  /* «Mettimi anche il generatore di stringa.» Stessa funzione di ATTIVA
     VINZ.MON (engine/secret.ts), non salvata da nessuna parte finché non la
     incolli tu su Netlify. */
  const [proposed, setProposed] = useState<string | null>(null);

  const check = async () => {
    setChecking(true);
    const { data, failure: f } = await loadShortcutStatus(token);
    setStatus(data);
    setFailure(f);
    setChecking(false);
  };

  useEffect(() => {
    void check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <section className="page active">
      <PageHead
        kicker="SYSTEM.LAB / API"
        title="SHORTCUTS"
        lead="Non un gestore delle tue Comandi di iPhone — quelle restano su iOS. Qui c'è solo cosa /api/shortcut sa fare, con cosa costruirci sopra, e cosa è successo davvero nelle ultime chiamate."
      />

      <Section title="IL SEGRETO DELLE SHORTCUT" note="Diverso da VINZMON_TOKEN — revocabile senza toccare voce, immagini o salvataggio.">
        <Rows
          rows={[
            [
              'VINZMON_SHORTCUT_TOKEN',
              <Status
                label={status?.tokenConfigured ? 'CONFIGURED' : 'MISSING'}
                ok={status?.tokenConfigured === true}
              />,
            ],
          ]}
        />
        <Grid>
          <Btn variant="dark" onClick={() => void check()} disabled={checking}>
            {checking ? 'CONTROLLO…' : 'RUN CHECK'}
          </Btn>
          <Btn onClick={() => setProposed(freshSecret())}>
            {proposed ? 'GENERA UN ALTRO' : 'GENERA UN SEGRETO'}
          </Btn>
        </Grid>
        {proposed && (
          <>
            <pre className="json">{proposed}</pre>
            <p className="note">
              Copialo su Netlify (Site configuration → Environment variables) come
              VINZMON_SHORTCUT_TOKEN, ripubblica, e mettilo nell'header Authorization: Bearer …
              della Shortcut su iPhone. Generato qui, in questo browser — non è stato mandato da
              nessuna parte finché non lo incolli tu.
            </p>
          </>
        )}
        {failure && <p className="note">setup: {failure}</p>}
      </Section>

      <Section title="COME CHIAMARLA" note="Shortcut «Ottieni contenuti di URL» · POST · header Authorization: Bearer <VINZMON_SHORTCUT_TOKEN>.">
        <Rows rows={[['ENDPOINT', status?.endpoint ?? '/api/shortcut']]} />
        <pre className="json">{EXAMPLE_BODY}</pre>
      </Section>

      <Section title="AZIONI">
        {status ? (
          <Rows
            rows={status.actions.map((a) => [
              a.label,
              a.enabled ? `${AI_POLICY_LABEL[a.aiPolicy]} · ${a.input}` : 'NOT YET',
            ])}
          />
        ) : (
          <p className="note">nessun dato ancora.</p>
        )}
      </Section>

      <Section title="ULTIME CHIAMATE" note="Solo la forma della chiamata — azione, esito, durata, costo. Mai il contenuto.">
        {status && status.recent.length > 0 ? (
          <Rows
            rows={status.recent.map((c) => [
              `${c.action} · ${new Date(c.at).toLocaleString('it-IT')}`,
              `${c.ok ? 'OK' : 'FAILED'} · ${(c.ms / 1000).toFixed(1)}s${c.costUsd > 0 ? ` · $${c.costUsd.toFixed(4)}` : ''}`,
            ])}
          />
        ) : (
          <p className="note">nessuna chiamata ancora.</p>
        )}
      </Section>
    </section>
  );
}

/* ============================================================================
   LEGACY — LO STATO DELLA CONSOLIDAZIONE

   🔷 «LAB INFORMATION ARCHITECTURE CLEANUP — do not preserve a panel merely
   because code exists for it… List only tools genuinely not yet ported.»

   🔒 CREATURE NON C'È PIÙ COME DESTINAZIONE, E NON PERCHÉ SIA SPARITA:
   LESSONS, ASSET e STATE vivono adesso dentro CREATION.LAB — stesse azioni
   dello store, un solo posto per «la creatura attuale» invece di due.
   ASSISTENTE, SOUL.LAB e DESIGN.LAB sono rimossi del tutto dal prodotto
   (esperimenti falliti o non più utili) — non sono in questa lista perché
   non sono «da portare», sono chiusi.

   🔷 CREATION LAB FIX + UI CLEANUP — RESOLVER è tornato ad essere SOLO qui
   sotto (`dev/ResolverSection.tsx`): come tab a parte in CREATION.LAB
   confondeva senza aggiungere niente che FLOW → passo 05 non dicesse già.
   FAMILY come tab a parte è sparita del tutto: lo stesso ACCESO/SPENTO
   viveva già dentro FLOW → passo 04 (`StepTuning`) — una duplicazione vera,
   non solo percepita. Quello che resta qui sotto è codice vero, ancora
   raggiungibile solo da DEV://VINZ.MON.
   ========================================================================= */

const LEGACY_REMAINING: { titolo: string; dove: string; perche: string }[] = [
  {
    titolo: 'RESOLVER — il prompt AI',
    dove: 'DEV → CREATURA → RESOLVER',
    perche: 'Come tab a parte in CREATION.LAB (\'RESOLVER\') non era chiaro né utile — rimosso da lì. Il motore che chiamava (resolveWithAi/mon.resolution) resta vero e chiamabile da qui.',
  },
  {
    titolo: 'MONDO',
    dove: 'DEV → CREATURA → MONDO',
    perche: 'Canone e registro narrativo del world attivo — si tocca raramente, non nel flusso di ogni giorno.',
  },
  {
    titolo: 'RARITÀ — soglie',
    dove: 'DEV → CREATURA → RARITÀ',
    perche: 'Taratura delle bande di rarità: uno strumento da chi bilancia il motore, non da chi gioca.',
  },
  {
    titolo: 'CATALOGHI — assi diversi da Family',
    dove: 'DEV → CREATURA → CATALOGHI',
    perche: 'CREATION → FLOW → passo 04 copre già l\'asse Family (stesso ACCESO/SPENTO); affinity/role/fashion/mood/appearance/design/size restano qui.',
  },
  {
    titolo: 'PROMPT IMMAGINI — anteprima/riscrittura',
    dove: 'DEV → CREATURA → PROMPT IMMAGINI',
    perche: 'CREATION → ASSETS forgia le immagini vere; questa resta la vista sul prompt grezzo, per chi lo sta mettendo a punto.',
  },
  {
    titolo: 'PROVE — protocollo designer §12',
    dove: 'DEV → CREATURA → PROVE',
    perche: 'Il protocollo con cui un designer approva o scarta un\'immagine — non uno strumento del prototipo di tutti i giorni.',
  },
  {
    titolo: 'GENERAZIONE BATCH',
    dove: 'DEV → CREATURA → GENERA',
    perche: 'Mille generazioni per controllare le distribuzioni statistiche — diagnostica del motore, non creazione.',
  },
  {
    titolo: 'MINDLINE — forzature di eleggibilità',
    dove: 'DEV → CREATURA → MINDLINE',
    perche: 'SIMULATION → NEXT MINDLINE EVENT copre l\'uso normale; le forzature per raggiungere condizioni rare restano qui.',
  },
  {
    titolo: 'STRUMENTI — avvio a mano',
    dove: 'DEV → VOCE → STRUMENTI',
    perche: 'Far partire un tool (promemoria, pagine, ricerca web) a mano per provarlo — diagnostica, non un controllo di persona.',
  },
  {
    titolo: 'SHORTCUT API — setup guidato',
    dove: 'DEV → TEMPO → SHORTCUT API',
    perche: 'LAB → SYSTEM → SHORTCUTS copre lo stato operativo (coda, ultimo invio); il modulo di configurazione iniziale resta in DEV.',
  },
];

function Legacy() {
  return (
    <section className="page active">
      <PageHead
        kicker="VINZ.LAB / SYSTEM"
        title="LEGACY"
        lead="CREATURE non esiste più: LESSONS, ASSET e STATE sono in CREATION.LAB. RESOLVER e FAMILY come tab a parte sono rimossi (duplicavano FLOW). ASSISTENTE, SOUL.LAB e DESIGN.LAB sono rimossi dal prodotto. Quello che resta è codice vero, ancora raggiungibile solo da DEV."
      />

      <Notice title="✅ IL FLUSSO PRINCIPALE È NATIVO">
        SAVE, CREATION (Flow con Archetipi/Lessons/Asset/State), PERSONA (Voice/Mood/Opinions),
        SIMULATION (Tempo/+1 giorno/SYNC) e AI sono componenti di LAB, non finestre su DEV:
        chiamano le stesse azioni dello store, disegnate coi mattoni del laboratorio.
      </Notice>

      <Section
        title="ANCORA SOLO IN DEV"
        note="Ognuna con la ragione per cui non è (ancora) qui: taratura, diagnostica del motore, o setup una tantum — non il flusso quotidiano."
      >
        {LEGACY_REMAINING.map((r) => (
          <div key={r.titolo} style={{ padding: '9px 0', borderBottom: '1px solid var(--line)' }}>
            <p className="note" style={{ margin: 0 }}><strong>{r.titolo}</strong> — {r.dove}</p>
            <p className="note">{r.perche}</p>
          </div>
        ))}
      </Section>

      <Section title="APRI DEV DIRETTAMENTE">
        <p className="note">
          Per queste voci: il pulsante DEV nell'app vera apre lo stesso pannello, con lo stesso
          stato — non una seconda copia.
        </p>
        <Grid>
          <Btn onClick={() => window.location.assign('/')}>TORNA ALL'APP</Btn>
        </Grid>
      </Section>
    </section>
  );
}
