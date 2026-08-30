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

import { useEffect, useState } from 'react';
import { useApp } from '../../state/store';
import { STAT_KEYS, UNKNOWN, isKnown } from '../../engine/types';
import type { StatKey } from '../../engine/types';
import { DAILY_SIGNALS, DAILY_SIGNAL_LABELS } from '../../engine/progression';
import { loadPing, loadSetup, loadShortcutStatus, loadUsage, type ShortcutStatus, type UsageDashboard } from '../../ai/backend';
import { lastRuns } from '../../ai/telemetry';
import { freshSecret } from '../../engine/secret';
import { estimateMonthlyCost } from '../../engine/costEstimate';
import {
  AI_STEPS,
  AI_STEP_ORDER,
  choicesFor,
  modelForStep,
  recommendedModel,
} from '../../../netlify/functions/_shared/routing';
import { Btn, Grid, LabTop, Notice, PageHead, Range, Rows, Section, Status } from './parts';
import { LabAssistantPanel } from '../assistant/LabAssistantPanel';
import '../skin/system.css';

const TABS = [
  { id: 'setup', label: 'SETUP' },
  { id: 'ai', label: 'AI' },
  { id: 'simulation', label: 'SIMULATION' },
  { id: 'memory', label: 'MEMORY' },
  { id: 'usage', label: 'USAGE' },
  /* 🔷 brief Shortcuts §11, e la regola scritta nell'atrio del lab:
     «se cambia come l'app... chiama API, va in SYSTEM.LAB». `/api/shortcut`
     è esattamente questo — e finora esisteva SOLO in DEV → SHORTCUT API,
     dentro l'app vera, non qui. Due superfici diverse, la stessa domanda
     («Nel lab c'è tutto?»), e qui la risposta era no finché non c'era
     questa scheda. */
  { id: 'shortcuts', label: 'SHORTCUTS' },
  { id: 'assistant', label: '🤖 ASSISTENTE' },
];

export function SystemLab({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState('setup');

  return (
    <div className="app">
      <LabTop tabs={TABS} active={tab} onTab={setTab} onBack={onBack} />
      <main>
        {tab === 'setup' && <Setup />}
        {tab === 'ai' && <Ai />}
        {tab === 'simulation' && <Simulation />}
        {tab === 'memory' && <Memory />}
        {tab === 'usage' && <Usage />}
        {tab === 'shortcuts' && <Shortcuts />}
        {tab === 'assistant' && <LabAssistantPanel />}
        <div className="footer mono">SYSTEM.LAB · SAME VINZ.MON ENGINE / SAME REPOSITORY</div>
      </main>
    </div>
  );
}

/* ============================================================================
   SETUP
   ========================================================================= */

function Setup() {
  const token = useApp((s) => s.token);
  const setToken = useApp((s) => s.setToken);
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
              IL SEGRETO GIÀ SU NETLIFY
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
   AI
   ========================================================================= */

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
   SIMULATION
   ========================================================================= */

function Simulation() {
  const day = useApp((s) => s.day);
  const progression = useApp((s) => s.progression);
  const health = useApp((s) => s.health);
  const bias = useApp((s) => s.bias);
  const dev = useApp((s) => s.dev);
  const nodes = useApp((s) => s.nodes);
  const oggi = useApp((s) => s.days[s.day]);

  const advanceDays = useApp((s) => s.advanceDays);
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
          <Btn variant="dark" onClick={() => advanceDays(1)}>RUN 1 COMPLETE DAY</Btn>
          <Btn onClick={() => advanceDays(7)}>RUN 7 COMPLETE DAYS</Btn>
          <Btn onClick={openShift}>NEXT MINDLINE EVENT</Btn>
        </Grid>
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
        kicker="SYSTEM.LAB / INNER STATE"
        title="MEMORY"
        lead="Quello che VINZ.MON ricorda, pensa e usa quando parla. Qui stanno anche gli strumenti tecnici che non devono mai diventare una schermata utente."
      />

      <Notice title="⚠️ ANCHE QUI SI SCRIVE">
        La Build Mode qui sotto è quella vera: accesa, il .mon smette di essere
        un personaggio anche nella chat normale, finché non la rispegni.
      </Notice>

      <Section title="ARCHIVE">
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

      <Section title="BUILD MODE">
        <p className="note">
          {buildMode
            ? 'Build Mode ON: nessun personaggio, nessuna memoria, nessun ripiego.'
            : 'Character mode ON. Build Mode rende espliciti i guasti degli strumenti.'}
        </p>
        <Btn variant={buildMode ? 'on' : undefined} onClick={() => setBuildMode(!buildMode)}>
          {buildMode ? 'BACK TO CHARACTER' : 'TURN ON BUILD MODE'}
        </Btn>
      </Section>
    </section>
  );
}

/* ============================================================================
   USAGE
   ========================================================================= */

function Usage() {
  const token = useApp((s) => s.token);
  const [usage, setUsage] = useState<UsageDashboard | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadUsage(token).then(({ data }) => {
      if (cancelled) return;
      setUsage(data);
      setFailed(!data);
    });
    return () => { cancelled = true; };
  }, [token]);

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
