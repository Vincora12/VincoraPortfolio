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
import { loadPing, loadSetup } from '../../ai/backend';
import { lastRuns } from '../../ai/telemetry';
import { Btn, Grid, LabTop, Notice, PageHead, Range, Rows, Section, Status } from './parts';
import '../skin/system.css';

const TABS = [
  { id: 'setup', label: 'SETUP' },
  { id: 'ai', label: 'AI' },
  { id: 'simulation', label: 'SIMULATION' },
  { id: 'memory', label: 'MEMORY' },
  { id: 'usage', label: 'USAGE' },
];

/* Gli otto passi AI, con le stesse etichette e le stesse descrizioni del
   disegno. `routes` dice quale campo dello store vero governa quel passo:
   dove è `null`, il passo esiste ma non ha ancora una manopola sua. */
const AI_STEPS: {
  id: string;
  label: string;
  desc: string;
  critical?: boolean;
  bg?: boolean;
  route: 'voice' | 'compiler' | 'image' | null;
}[] = [
  { id: 'characterMaster', label: '🧠 CREATIVE RESOLVER', desc: 'Routing ID: characterMaster. L’AI produce la CreativeResolution visiva; oggi non parte automaticamente nell’hatch.', critical: true, bg: true, route: 'compiler' },
  { id: 'bio', label: '🧠 WRITTEN BIO', desc: 'Riscrittura AI opzionale della Bio deterministica già esistente.', route: 'compiler' },
  { id: 'imagePrompt', label: '🧠 PROMPT REWRITE', desc: 'Riscrittura AI opzionale. Il prompt deterministico resta sempre disponibile.', route: 'compiler' },
  { id: 'image', label: '🎨 IMAGE ASSETS', desc: 'Genera davvero CEL, Toy, Bio Doodle ed Expression Sheet nel flusso automatico quando il backend è disponibile.', critical: true, route: 'image' },
  { id: 'voice', label: '💬 RUNTIME VOICE', desc: 'AI conversazionale usata quando il .mon parla. Non crea il Voice DNA.', critical: true, route: 'voice' },
  { id: 'teach', label: 'INSEGNA', desc: 'Converte il feedback al resolver in una lezione.', route: null },
  { id: 'reflection', label: 'RIFLESSIONE', desc: 'Lettura settimanale e appunti. Legge storia personale.', route: null },
  { id: 'vision', label: 'VISIONE', desc: 'Guarda una foto e dichiara cosa c’è.', route: null },
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
  const [setup, setSetup] = useState<Awaited<ReturnType<typeof loadSetup>> | null>(null);
  const [ping, setPing] = useState<Awaited<ReturnType<typeof loadPing>> | null>(null);
  const [checking, setChecking] = useState(false);

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
          Si imposta da ATTIVA VINZ.MON, che è la schermata di prodotto: sta lì e non qui perché la
          fa chi installa l’app, non chi la sviluppa.
        </p>
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

function Ai() {
  const voiceModel = useApp((s) => s.voiceModel);
  const compilerModel = useApp((s) => s.compilerModel);
  const imageModel = useApp((s) => s.imageModel);
  const setVoiceModel = useApp((s) => s.setVoiceModel);
  const setCompilerModel = useApp((s) => s.setCompilerModel);
  const setImageModel = useApp((s) => s.setImageModel);

  const runs = Object.fromEntries(lastRuns());

  const attivo = (route: string | null) =>
    route === 'voice' ? voiceModel : route === 'compiler' ? compilerModel : route === 'image' ? imageModel : null;

  const scegli = (route: string | null, model: string) => {
    if (route === 'voice') setVoiceModel(model);
    if (route === 'compiler') setCompilerModel(model);
    if (route === 'image') setImageModel(model);
  };

  const SCELTE: Record<string, string[]> = {
    voice: ['claude-opus-5', 'claude-sonnet-5', 'gpt-5.6-luna', 'gpt-5.6-terra', 'kimi-k3'],
    compiler: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'claude-sonnet-5'],
    image: ['gpt-image-2', 'gpt-image-1'],
  };

  return (
    <section className="page active">
      <PageHead
        kicker="SYSTEM.LAB / ROUTING"
        title="AI"
        lead="Qui scegli quale modello serve le chiamate AI reali. Il badge non significa che quello step faccia parte dell’hatch: CREATION.LAB mostra chiaramente quali chiamate sono automatiche, opzionali o runtime."
      />

      <div style={{ marginTop: 12 }}>
        {AI_STEPS.map((s) => {
          const run = runs[s.id as keyof typeof runs];
          const scelte = s.route ? SCELTE[s.route]! : [];
          const ora = attivo(s.route);
          return (
            <div className="airow" key={s.id}>
              <div className="aihead">
                <strong>{s.label}</strong>
                <div>
                  {s.critical && <small>QUALITY</small>}
                  {s.bg && <small>BACKGROUND</small>}
                </div>
              </div>
              <p className="aidesc">{s.desc}</p>
              {scelte.length > 0 ? (
                <div className="choices">
                  {scelte.map((c) => (
                    <button
                      type="button"
                      key={c}
                      className={`choice ${c === ora ? 'on' : ''}`}
                      onClick={() => scegli(s.route, c)}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              ) : (
                /* 🔒 Il disegno mostrava una scelta anche qui. Nel motore vero
                   questi tre passi NON hanno una manopola: la rotta è fissa
                   nel codice. Disegnare dei pulsanti che non cambiano niente
                   sarebbe peggio che non averli. */
                <p className="note">rotta fissa nel codice · nessuna scelta da fare qui</p>
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
  const runs = lastRuns();
  const imageModel = useApp((s) => s.imageModel);

  return (
    <section className="page active">
      <PageHead
        kicker="SYSTEM.LAB / TELEMETRY"
        title="USAGE"
        lead="Spesa, chiamate, tempi, errori e stato delle pipeline. Numeri tecnici, senza trasformarli in un cockpit."
      />

      <Section
        title="LAST RUN BY STEP"
        note="Legge la telemetria vera di `ai/telemetry.ts`: modello, durata ed esito dell’ultima chiamata di ogni passo."
      >
        {runs.length === 0 ? (
          <p className="note">Nessuna chiamata ancora in questa sessione.</p>
        ) : (
          <Rows
            rows={runs.map(([step, r]) => [
              step,
              `${(r.ms / 1000).toFixed(1)}s · ${r.ok ? 'OK' : 'FAILED'}`,
            ])}
          />
        )}
      </Section>

      <Section
        title="IMAGE PIPELINE"
        note="Contabilità in sola lettura della pipeline di creazione. I controlli degli asset stanno in CREATION.LAB."
      >
        <Rows rows={[['IMAGE MODEL', imageModel ?? 'predefinito']]} />
      </Section>
    </section>
  );
}
