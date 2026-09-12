/* ============================================================================
   AI / MODELLI — CHI SERVE QUALE LAVORO

   🔷 «La UI deve farmi vedere chiaramente QUALE AI serve QUALE STEP.»
   🔷 «Non creare un cockpit con cinquanta opzioni.»

   Otto righe, una per lavoro. Ogni riga dice come si chiama, chi lo serve
   adesso, cosa costa, e quanto ci ha messo l'ultima volta davvero.

   ⚠️ E NON SI CHIAMA «COMPILER» DA NESSUNA PARTE. I nomi sono quelli del
   lavoro — CHARACTER MASTER, BIO, INSEGNA, VOCE — perché devi poter capire
   cosa stai scegliendo senza sapere com'è fatto dentro.
   ========================================================================= */

import { useEffect, useState } from 'react';
import { useApp } from '../state/store';
import { Button, SystemLabel } from '../system/components';
import { lastRuns, subscribeToRuns, type StepRun } from '../ai/telemetry';
import { estimateMonthlyCost, type RealUsageSnapshot } from '../engine/costEstimate';
import type { LocalServicesStatus } from '../ai/backend';
import {
  AI_STEPS,
  AI_STEP_ORDER,
  choicesFor,
  modelForStep,
  recommendedModel,
  type AiStepId,
} from '../../netlify/functions/_shared/routing';

/** Il prezzo di un modello, se il catalogo lo conosce. */
function prezzo(capability: string, model: string): string | null {
  const c = choicesFor(capability as never).find((x) => x.model === model) as
    | { price?: { input: number; output: number }; perImage?: number }
    | undefined;
  if (!c) return null;
  if (typeof c.perImage === 'number') return `$${c.perImage.toFixed(2)} a immagine`;
  if (c.price) return `$${c.price.input} / $${c.price.output} per milione`;
  return null;
}

/* ============================================================================
   🔴 DOVE VANNO I SOLDI DAVVERO — e come sceglie il pulsante «CONSIGLIATO».

   «Per ogni sezione tu inserisci nel quale mi consigli di usare dato il costo
   basso e la gestione dei dati. Automaticamente selezionano quella.»

   Prima il pulsante economico si limitava a saltare gli step `qualityCritical`
   e mettere Luna dappertutto — ed era già il predefinito, quindi premerlo su
   una partita pulita non cambiava NIENTE. Ora chiama `recommendedModel` (in
   `routing.ts`) per ogni step: gli step `qualityCritical` (CHARACTER MASTER,
   VOCE, IMMAGINI) restano sempre dove sono — lì non si risparmia, per scelta
   esplicita — gli step che portano dati personali dell'utente scelgono il più
   economico FRA QUELLI CHE NON SI ALLENANO SUI TUOI DATI senza consenso
   (oggi esclude solo Moonshot/Kimi), gli altri scelgono il più economico del
   catalogo senza altri vincoli. La riga sotto ogni step, qui sotto, dice il
   perché — costo o dati — con le stesse parole che usa il motore.

   La riga qui sotto dice invece quanto pesa ciascuna cosa su una generazione
   intera, così la scelta si fa guardando i numeri invece che i nomi.
   ========================================================================= */

/* Quattro immagini per creatura — master, toy, doodle, sticker. Listino
   agosto 2026, a 1024: low ~$0,006 · medium ~$0,053 · high ~$0,211.

   🔶 QUI C'ERA SCRITTO «SEI», ed era sbagliato: i tre asset storici
   (ritratto, idle, hero) sono in `LEGACY_ASSET_TYPES` e la pipeline non li
   genera più. Ogni conto fatto su sei era gonfiato di un terzo. */
const COSTO_IMMAGINI = {
  /* Tutte e quattro in bozza: l'interruttore qui sotto. */
  bozza: 4 * 0.006,
  /* Come è OGGI: doodle e sticker li dichiara `assets.ts` in bozza, master e
     toy restano pieni. È il predefinito, non un risparmio da accendere. */
  normale: 2 * 0.053 + 2 * 0.006,
  /* Come era PRIMA che la qualità venisse dichiarata per asset. */
  primaDiTutto: 4 * 0.053,
};

export function ModelsSection() {
  const stepModels = useApp((s) => s.stepModels);
  const setStepModel = useApp((s) => s.setStepModel);
  const cheap = useApp((s) => s.useCheapPreset);
  const quality = useApp((s) => s.useQualityPreset);
  const dev = useApp((s) => s.dev);
  const setDev = useApp((s) => s.setDev);
  const token = useApp((s) => s.token);
  const finalResponseLocalFirst = useApp((s) => s.finalResponseLocalFirst);
  const setFinalResponseLocalFirst = useApp((s) => s.setFinalResponseLocalFirst);

  /* La telemetria vive fuori da zustand: ci si abbona come al contatore
     della spesa. */
  const [runs, setRuns] = useState<[AiStepId, StepRun][]>(lastRuns());
  useEffect(() => subscribeToRuns(() => setRuns(lastRuns())), []);
  const runOf = (id: AiStepId) => runs.find(([k]) => k === id)?.[1] ?? null;

  /* 🔷 «Metti anche stato per vedere se sono online, com'era nel DEV.»
     `/api/setup` dice, fornitore per fornitore, se la sua chiave è
     configurata — la stessa domanda che DEV → VOCE fa da sempre, qui per
     ogni scelta di ogni step, non solo per la voce. */
  const [providerReady, setProviderReady] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void import('../ai/backend').then(({ loadSetup }) =>
      loadSetup(token).then(({ data }) => {
        if (!cancelled && data?.providerReady) setProviderReady(data.providerReady);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="dev__section">
      <p className="t-meta dev__label">AI / MODELLI</p>
      <p className="t-micro dev__note">
        Ogni lavoro sceglie il suo. Cambiare una riga non cambia le altre — era
        il difetto di prima, quando quattro lavori diversi condividevano un
        menu solo.
      </p>

      <ControlRoomHeader
        token={token}
        stepModels={stepModels}
        finalResponseLocalFirst={finalResponseLocalFirst}
        setFinalResponseLocalFirst={setFinalResponseLocalFirst}
      />

      {/* ⚠️ IL PRESET ECONOMICO NON TOCCA IL CHARACTER MASTER, ed è dichiarato
          sul pulsante invece che scoperto dopo. «Non voglio un pulsante
          economico che mi peggiora i character.» */}
      <div className="dev__grid">
        <Button small onClick={quality}>
          QUALITÀ (I PREDEFINITI)
        </Button>
        <Button small onClick={cheap}>
          CONSIGLIATO · COSTO + DATI
        </Button>
      </div>

      {/* 🔷 «In alto con quelle scelte metti una media mensile di spesa,
          pensando che io lo uso ogni giorno e faccio evoluzioni ogni 2
          giorni.» Ricalcolata a ogni render: cambia un modello qui sotto e
          il numero si muove — è il punto, non un totale fisso da leggere
          una volta. */}
      <MonthlyEstimateBox stepModels={stepModels} token={token} />

      {/* ══════════════════════════════════════════════════════════════════
          🔷 LA LEVA VERA, e sta sopra l'elenco perché è quella che conta.

          Le quattro immagini sono la parte più grossa del costo di una
          generazione. Il menu dei modelli qui sotto muove il resto — utile,
          ma non è lì che si risparmia. */}
      <p className="t-meta dev__label">IMMAGINI — LA VOCE PIÙ GROSSA DI UNA GENERAZIONE</p>
      <label className="dev__check">
        <input
          type="checkbox"
          checked={dev.draftImages}
          onChange={(e) => setDev({ draftImages: e.target.checked })}
        />
        IMMAGINI IN BOZZA (quality: low)
      </label>
      <p className="t-micro dev__note">
        Quattro immagini per creatura. Adesso ne costano{' '}
        <strong>${COSTO_IMMAGINI.normale.toFixed(3)}</strong>: doodle e sticker
        li dichiara già `assets.ts` in bozza — si vedono piccoli — e master e
        toy restano pieni. Prima erano ${COSTO_IMMAGINI.primaDiTutto.toFixed(3)}.
      </p>
      <p className="t-micro dev__note">
        Con l’interruttore acceso scendono tutte e quattro a{' '}
        <strong>${COSTO_IMMAGINI.bozza.toFixed(3)}</strong>. Dieci rigenerazioni
        di prova: ${(COSTO_IMMAGINI.bozza * 10).toFixed(2)} contro{' '}
        ${(COSTO_IMMAGINI.normale * 10).toFixed(2)}.
      </p>
      <p className="t-micro dev__note">
        {dev.draftImages
          ? 'ACCESA: le prossime immagini escono in bozza. Per la creatura che vuoi TENERE, spegnila e rigenera.'
          : 'SPENTA: qualità piena, come in produzione. Accendila mentre provi, non mentre tieni.'}
      </p>

      <ul className="rowlist">
        {AI_STEP_ORDER.map((id) => {
          const step = AI_STEPS[id];
          const attivo = modelForStep(id, stepModels[id]);
          const pool = choicesFor(step.capability);
          const run = runOf(id);
          const costo = prezzo(step.capability, attivo);
          const consiglio = recommendedModel(id);

          const isAuto = !stepModels[id];

          return (
            <li key={id} className="dev__step">
              <p className="t-meta">
                {step.label}{' '}
                {/* 🔷 CONTROL ROOM — AUTO 🔒 quando lo step segue il predefinito,
                    MANUALE quando l'utente ha scelto un modello di persona: la
                    STESSA differenza di sempre (`stepModels[id]` assente o no),
                    solo resa esplicita invece che implicita nel confronto coi
                    pulsanti sotto. */}
                {isAuto ? <SystemLabel>AUTO 🔒</SystemLabel> : <SystemLabel tone="warning">MANUALE</SystemLabel>}
                {step.qualityCritical && <SystemLabel tone="character">QUALITÀ</SystemLabel>}
                {step.background && <SystemLabel>IN BACKGROUND</SystemLabel>}
                {isAuto && !step.qualityCritical && step.capability === 'text-cheap' && (
                  <SystemLabel tone="character">PROVA PRIMA IL LOCALE</SystemLabel>
                )}
                {!isAuto && (
                  <>
                    {' '}
                    <button type="button" className="dev__inlinebtn" onClick={() => setStepModel(id, null)}>
                      RIPORTA AD AUTO
                    </button>
                  </>
                )}
              </p>
              <p className="t-micro dev__note">{step.it}</p>
              {/* 🔷 Il consiglio è sempre visibile, anche quando coincide con
                  l'attivo — «perché» è la parte che il pulsante da solo non
                  dice: qui distingue costo da dati. */}
              <p className="t-micro dev__note">
                <SystemLabel tone={step.qualityCritical ? undefined : 'character'}>
                  CONSIGLIO
                </SystemLabel>{' '}
                <strong>{consiglio.model}</strong> — {consiglio.why}
              </p>
              {/* 🔷 Uno step con due modelli deve DIRLO qui, o il menu qui
                  sotto racconta metà della verità: mostrerebbe un modello
                  solo mentre a rispondere sono due. */}
              {step.everyday && !stepModels[id] && (
                <p className="t-micro dev__note">
                  <SystemLabel>A DUE VELOCITÀ</SystemLabel> tutti i giorni{' '}
                  <strong>{step.everyday}</strong>; sui messaggi che lo meritano —
                  una domanda, o più di centoquaranta caratteri —{' '}
                  <strong>{step.fallback}</strong>. Circa un messaggio su cinque si
                  alza. Scegliendo un modello qui sotto, quello vale per tutti e due.
                </p>
              )}

              {/* 🔒 Un elenco di uno solo NON diventa un menu finto: dove non
                  c'è scelta si dice il modello e basta.

                  🔷 «Quando clicco le altre, mettimi anche una media di
                  costo... però ragiona meglio, aiutami nella scelta.» Un
                  pulsante con solo il nome non aiuta a scegliere: qui sotto
                  ogni alternativa porta il SUO prezzo e la riga `it` che il
                  catalogo (routing.ts) già scrive per quel modello — non un
                  numero e basta, il perché che sta dietro. */}
              {pool.length > 1 ? (
                <div className="dev__modelcards">
                  {pool.map((c) => {
                    const rich = c as {
                      it?: string;
                      price?: { input: number; output: number };
                      perImage?: number;
                    };
                    const isActive = c.model === attivo;
                    const isRecommended = c.model === consiglio.model && !isActive;
                    const prezzoRiga =
                      typeof rich.perImage === 'number'
                        ? `$${rich.perImage.toFixed(2)} a immagine`
                        : rich.price
                          ? `$${rich.price.input} / $${rich.price.output} per milione — ${
                              rich.price.output >= 20
                                ? 'livello grosso'
                                : rich.price.output >= 8
                                  ? 'livello di mezzo'
                                  : 'livello piccolo'
                            }`
                          : 'prezzo non a catalogo';
                    const online = providerReady[c.provider];
                    return (
                      <button
                        key={c.model}
                        type="button"
                        className={`dev__modelcard${isActive ? ' dev__modelcard--active' : ''}`}
                        onClick={() =>
                          setStepModel(id, c.model === step.fallback ? null : c.model)
                        }
                      >
                        <p className="t-meta">
                          {c.label}{' '}
                          {isActive && <SystemLabel tone="character">ATTIVO</SystemLabel>}
                          {isRecommended && <SystemLabel>CONSIGLIATO</SystemLabel>}
                        </p>
                        <p className="t-micro dev__note">{prezzoRiga}</p>
                        {rich.it && <p className="t-micro dev__note">{rich.it}</p>}
                        {/* 🔷 In fondo, come nel DEV → VOCE di sempre: online o
                            manca la chiave di quel fornitore. */}
                        <p className="t-micro dev__note">
                          <SystemLabel tone={online ? 'character' : 'warning'}>
                            {online === undefined ? 'STATO SCONOSCIUTO' : online ? 'ONLINE' : 'OFFLINE'}
                          </SystemLabel>
                          {online === false && ` — manca la chiave di ${c.provider}`}
                        </p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="t-micro dev__note">{attivo} — non ci sono alternative.</p>
              )}

              <p className="t-micro dev__note">
                {costo ?? 'prezzo non a catalogo'}
                {stepModels[id] ? ' · scelto da te' : ' · predefinito'}
                {/* ⚠️ MISURATO, non stimato: è l'ultima chiamata vera. */}
                {run && (
                  <>
                    {' · ultima: '}
                    <strong>{(run.ms / 1000).toFixed(1)}s</strong>
                    {' · '}
                    {run.model}
                    {run.background ? ' · in background' : ''}
                    {!run.ok && ` · non riuscita${run.why ? ` (${run.why})` : ''}`}
                  </>
                )}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ============================================================================
   STIMA MENSILE — «vedi quanto sto lavorando ultimamente, così sarà ogni
   giorno.» Vive fuori da `ModelsSection` per restare quasi puro: riceve
   `stepModels`, e recupera da solo l'unica cosa in più che gli serve — il
   ritmo vero degli ultimi sette giorni da `/api/usage`, la stessa fonte già
   mostrata in DEV → USAGE. Se non c'è ancora una settimana vera (app appena
   attivata), resta la premessa dichiarata di prima — mai uno zero silenzioso.
   ========================================================================= */
function MonthlyEstimateBox({ stepModels, token }: { stepModels: Partial<Record<AiStepId, string>>; token: string | null }) {
  const [real, setReal] = useState<RealUsageSnapshot | undefined>(undefined);
  useEffect(() => {
    if (!token) return;
    let live = true;
    void import('../ai/backend').then(({ loadUsage }) =>
      loadUsage(token).then(({ data }) => {
        if (live && data?.last7DaysByCapability) setReal(data.last7DaysByCapability as RealUsageSnapshot);
      }),
    );
    return () => { live = false; };
  }, [token]);

  const stima = estimateMonthlyCost(stepModels, real);
  return (
    <div className="dev__estimate">
      <p className="t-meta dev__label">STIMA MENSILE, CON QUESTE SCELTE</p>
      <p className="t-display dev__estimate-total">${stima.totalUsd.toFixed(2)}</p>
      <div className="rowlist">
        {stima.byCategory.map((c) => (
          <p className="t-micro dev__note" key={c.label}>
            {c.label} · ${c.usd.toFixed(2)}
          </p>
        ))}
      </div>
      {stima.usaDatiVeri ? (
        <p className="t-micro dev__note">
          Ritmo degli ultimi 7 giorni, proiettato su un mese — non più indovinato: cambia da solo
          man mano che usi VINZ.MON diversamente. Il prezzo segue comunque il modello scelto qui
          sopra.
        </p>
      ) : (
        <p className="t-micro dev__note">
          Premesse (nessuna settimana vera ancora nel registro spese): {Math.round(stima.assunzioni.evoluzioniAlMese)} evoluzioni al mese (una ogni 2
          giorni, come detto) · {stima.assunzioni.messaggiAlGiorno} messaggi al giorno (non
          dichiarato — assunto, cambia se il tuo uso è diverso) · un messaggio su cinque abbastanza
          importante da meritare il modello pieno. Appena ci sono sette giorni veri, questa riga
          sparisce da sola.
        </p>
      )}
      <p className="t-micro dev__note">
        🟡 Dove manca il ritmo vero, anche i token per chiamata sono numeri ragionevoli, non
        misurati — tende a essere un filo più alto del vero, non più basso.
      </p>
    </div>
  );
}

/* ============================================================================
   CONTROL ROOM — la stanza dei bottoni sopra l'elenco degli step

   🔷 «Un pannello che mi faccia capire quale AI gira dove, e mi lasci
   scegliere quando voglio il locale invece del cloud.» Nessuno stato nuovo
   duplicato: i conteggi AUTO/MANUALE/LOCALE/PREMIUM sotto sono calcolati da
   `AI_STEPS`/`stepModels`, la STESSA fonte che l'elenco sotto già legge —
   se uno step cambia, questi numeri cambiano da soli, mai una seconda lista
   scritta a mano da tenere allineata.

   🔒 LOCAL ONLY e Mem0/Ollama/Local Core sono VERITÀ DI RETE, non un
   indovinello: il primo legge/scrive `/api/usage` (stessa verità
   server-side del tetto mensile), i secondi `/api/repo-ops` — che su
   Netlify ospitato risponde onestamente "non disponibile qui" invece di
   fingere un dato che non può avere.
   ========================================================================= */

function providerFor(capability: string, model: string): string | undefined {
  return (choicesFor(capability as never).find((c) => c.model === model) as { provider?: string } | undefined)?.provider;
}

/** Esportato: `SystemLab.tsx` (SYSTEM.LAB → ROUTING) monta la STESSA testata
    invece di una seconda scritta a mano — un'unica sorgente di verità per
    conteggi/LOCAL ONLY/flusso/stato servizi, visibile da entrambi gli
    ingressi (DEV → AI/MODELLI e SYSTEM.LAB → ROUTING). */
export function ControlRoomHeader({
  token,
  stepModels,
  finalResponseLocalFirst,
  setFinalResponseLocalFirst,
}: {
  token: string | null;
  stepModels: Partial<Record<AiStepId, string>>;
  finalResponseLocalFirst: boolean;
  setFinalResponseLocalFirst: (value: boolean) => void;
}) {
  const [localOnly, setLocalOnly] = useState<{ enabled: boolean; loading: boolean; saving: boolean }>({
    enabled: false,
    loading: true,
    saving: false,
  });
  const [services, setServices] = useState<{ status: LocalServicesStatus | null; unavailable: boolean; loading: boolean }>({
    status: null,
    unavailable: false,
    loading: true,
  });

  useEffect(() => {
    if (!token) return;
    let live = true;
    void import('../ai/backend').then(({ loadUsage }) =>
      loadUsage(token).then(({ data }) => {
        if (live && data) setLocalOnly({ enabled: data.localOnlyMode, loading: false, saving: false });
      }),
    );
    void import('../ai/backend').then(({ loadLocalServicesStatus }) =>
      loadLocalServicesStatus(token).then((result) => {
        if (!live) return;
        if (result.status === 503 || result.failure) setServices({ status: null, unavailable: true, loading: false });
        else setServices({ status: result.data, unavailable: false, loading: false });
      }),
    );
    return () => { live = false; };
  }, [token]);

  const toggleLocalOnly = () => {
    const next = !localOnly.enabled;
    setLocalOnly((s) => ({ ...s, saving: true }));
    void import('../ai/backend').then(({ saveLocalOnlyMode }) =>
      saveLocalOnlyMode(token, next).then(({ data }) => {
        setLocalOnly({ enabled: data?.localOnlyMode ?? next, loading: false, saving: false });
      }),
    );
  };

  let autoCount = 0;
  let localCount = 0;
  /* 🔷 AUTO LOCAL-FIRST (2026-09-12) — «mi aspettavo che auto mi abbinasse
     llm locali dove serve»: `modelForStep` torna sempre il predefinito
     CLOUD dello step, mai Ollama — era la lettura onesta di PRIMA di questa
     modifica, ma ora `runStep` (state/store.ts) prova DAVVERO il locale per
     primo su ogni step in AUTO, non critico, con un catalogo locale
     (text-cheap). Contare solo `modelForStep` tornerebbe a mentire nel
     verso opposto: "0 in locale" quando in realtà ci si prova sempre. Le
     tre categorie sotto riflettono le tre cose vere che possono succedere
     per uno step: locale scelto A MANO, AUTO che ci prova ogni volta, o
     niente da provare (nessun locale per quella capacità, o protetto). */
  let autoTriesLocalCount = 0;
  let premiumCount = 0;
  for (const id of AI_STEP_ORDER) {
    const step = AI_STEPS[id];
    const isAuto = !stepModels[id];
    if (isAuto) autoCount += 1;
    const attivo = modelForStep(id, stepModels[id]);
    const provider = providerFor(step.capability, attivo);
    if (provider === 'ollama') {
      localCount += 1;
    } else if (isAuto && !step.qualityCritical && step.capability === 'text-cheap') {
      autoTriesLocalCount += 1;
    } else {
      premiumCount += 1;
    }
  }
  const manualCount = AI_STEP_ORDER.length - autoCount;

  const FLOW = [
    'MESSAGGIO UTENTE',
    'CONTESTO (deterministico)',
    'VOCE/RAGIONAMENTO — il modello scelto qui sotto',
    'CHIAMATA STRUMENTI — locale quando può, cloud quando serve',
    'RISULTATO STRUMENTI',
    finalResponseLocalFirst ? 'RISPOSTA FINALE — prova locale, poi il modello scelto' : 'RISPOSTA FINALE — il modello scelto',
    'ESTRAZIONE MEMORIA (Mem0, sola lettura qui sotto)',
  ];

  return (
    <div className="dev__estimate">
      <p className="t-meta dev__label">AI CONTROL ROOM</p>
      <p className="t-micro dev__note">
        {autoCount} step in AUTO · {manualCount} scelti a mano · {localCount} su locale scelto a mano (Ollama, $0)
        {autoTriesLocalCount > 0 && <> · {autoTriesLocalCount} in AUTO provano prima il locale, poi il cloud se serve</>}
        {' · '}{premiumCount} solo su API a pagamento.
      </p>

      <label className="dev__check">
        <input type="checkbox" checked={localOnly.enabled} disabled={localOnly.loading || localOnly.saving} onChange={toggleLocalOnly} />
        LOCAL ONLY — blocca ogni chiamata cloud (mai un ripiego silenzioso: una richiesta che servirebbe il cloud si rifiuta con un errore chiaro)
      </label>

      <label className="dev__check">
        <input
          type="checkbox"
          checked={finalResponseLocalFirst}
          onChange={(e) => setFinalResponseLocalFirst(e.target.checked)}
        />
        RISPOSTA FINALE — prova prima il modello locale (Ollama), passa al modello scelto solo se quello non risponde
      </label>

      <p className="t-meta dev__label">FLUSSO DI UNA RICHIESTA</p>
      <ol className="dev__flow">
        {FLOW.map((step) => (
          <li key={step} className="t-micro dev__note">{step}</li>
        ))}
      </ol>

      <p className="t-meta dev__label">SERVIZI LOCALI E MEMORIA</p>
      {services.loading ? (
        <p className="t-micro dev__note">Verifica in corso…</p>
      ) : services.unavailable ? (
        <p className="t-micro dev__note">Non disponibile da qui: questi stati esistono solo parlando al Local Core Server sul Mac, non sulla versione ospitata.</p>
      ) : (
        <>
          <p className="t-micro dev__note">
            Local Core: <SystemLabel tone={services.status?.core?.online ? 'character' : 'warning'}>{services.status?.core?.online ? 'ONLINE' : 'OFFLINE'}</SystemLabel>
            {' · '}Ollama: <SystemLabel tone={services.status?.ollama?.online ? 'character' : 'warning'}>{services.status?.ollama?.online ? `ONLINE (${services.status.ollama.models.join(', ') || 'nessun modello'})` : 'OFFLINE'}</SystemLabel>
          </p>
          <p className="t-micro dev__note">
            Mem0: <SystemLabel tone={services.status?.mem0?.online ? 'character' : 'warning'}>{services.status?.mem0?.online ? 'ONLINE' : 'OFFLINE'}</SystemLabel>
            {services.status?.mem0?.online && (
              <> {' — '}LLM estrazione: <strong>{services.status.mem0.llmModel ?? '?'}</strong>, embedder: <strong>{services.status.mem0.embedderModel ?? '?'}</strong> (dipendenze cloud, sola lettura)</>
            )}
          </p>
        </>
      )}
    </div>
  );
}
