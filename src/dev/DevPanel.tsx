/* ============================================================================
   DEV://VINZ.MON (§20.1)

   🔒 LOCKED (§20) — strato di simulazione per sviluppatori, capace di
   bypassare tempo reale, integrazioni non disponibili e chiamate API mancanti
   SENZA cambiare il modello di prodotto rivolto al giocatore.

   🔒 §26 — "The player-facing UI never exposes raw dev controls unless dev
   mode is enabled." Questo pannello è raggiungibile solo con `?dev=1`.

   Contiene esattamente le voci di §20.1, nell'ordine della spec.
   ========================================================================= */

import { useEffect, useState } from 'react';
import { useApp, useActiveMon, useGrowth, useScan, useToday } from '../state/store';
import { haptic } from '../system/haptics';
import { Button, FolderTabs, IconButton, Row, TextField } from '../system/components';
import {
  DAILY_SIGNALS,
  DAILY_SIGNAL_LABELS,
  PROGRESSION,
} from '../engine/progression';
import { seedSpread } from '../engine/personalityScan';
import { PERSONALITY_KEYS } from '../engine/signals';
import { STAT_KEYS, UNKNOWN, isKnown } from '../engine/types';
import type { StatKey } from '../engine/types';
import { BatchGenerator } from './BatchGenerator';
import { AssetImport } from './AssetImport';
import { CatalogSection } from './CatalogSection';
import { BioSection } from './BioSection';
import { buildInfo, buildLabel } from '../system/build';
import { DesignTest } from './DesignTest';
import { PromptPreview } from './PromptPreview';
import { VoiceSection } from './VoiceSection';
import { CostSection } from './CostSection';
import { MemorySection } from './MemorySection';
import { MoodSection } from './MoodSection';
import { RaritySection } from './RaritySection';
import { ToolsSection } from './ToolsSection';

type DevTab =
  | 'time'
  | 'signals'
  | 'mindline'
  | 'generate'
  | 'bio'
  | 'voice'
  | 'prompt'
  | 'assets'
  | 'progression'
  | 'cost'
  | 'memory'
  | 'mood'
  | 'rarity'
  | 'catalog'
  | 'designtest'
  | 'tools';

/* ============================================================================
   COME SI NAVIGA QUI DENTRO (§29)

   🔷 «Rendi più facile, DEV ora è molto complesso.»

   Aveva ragione: quindici schede in fila. Erano nate una alla volta, ognuna
   giustificata, e nessuna aveva mai guardato le altre quattordici — il modo
   classico in cui un pannello diventa un cruscotto d'aereo senza che nessuno
   abbia mai deciso di farne uno.

   🔒 LA CURA NON È TOGLIERE ROBA. Serve tutta: sono le uniche finestre su
   pezzi di motore che non hanno una superficie di prodotto. La cura è
   ammettere che non si usano allo stesso modo — quattro cose si fanno ogni
   volta, le altre undici si aprono quando qualcosa non torna.

   Quindi due livelli, e un INIZIO che contiene le quattro. Chi apre DEV per
   far passare dei giorni non deve più leggere quindici parole per trovare la
   prima.
   ========================================================================= */

type DevGroup = 'start' | 'tempo' | 'creatura' | 'voce' | 'conti';

const GROUPS: { id: DevGroup; label: string; tabs: { id: DevTab; label: string }[] }[] = [
  { id: 'start', label: 'INIZIO', tabs: [] },
  {
    id: 'tempo',
    label: 'TEMPO',
    tabs: [
      { id: 'time', label: 'TEMPO' },
      { id: 'signals', label: 'SEGNALI' },
      { id: 'progression', label: 'PROGRESSIONE' },
    ],
  },
  {
    id: 'creatura',
    label: 'CREATURA',
    tabs: [
      { id: 'generate', label: 'GENERA' },
      { id: 'bio', label: 'BIO' },
      { id: 'mindline', label: 'MINDLINE' },
      /* 🔷 v1.16 §15.3 — la rarità era l'unica parte del motore che non si
         poteva guardare mentre la si tarava. */
      { id: 'rarity', label: 'RARITÀ' },
      { id: 'assets', label: 'ASSET' },
      /* 🔶 Stava sotto VOCE, e era il posto sbagliato: questo è il prompt
         delle IMMAGINI, non quello del personaggio. Chi genera una faccia a
         mano arriva da qui — dalla creatura — e trovarsi il testo da copiare
         due gruppi più in là è il modo di non trovarlo mai. */
      { id: 'prompt', label: 'PROMPT IMMAGINI' },
      /* 🔷 §20.3 — accendere e spegnere Family, resa, designer, stile,
         temperamento. Sta in CREATURA perché è quello che decide cosa può
         nascere, non come si comporta poi. */
      { id: 'catalog', label: 'CATALOGHI' },
      /* 🔷 §12 del master: il protocollo con cui un designer si approva o si
         scarta. Sta accanto ai CATALOGHI perché è lì che finisce la decisione
         che prendi guardando le prove. */
      { id: 'designtest', label: 'PROVE' },
    ],
  },
  {
    id: 'voce',
    label: 'VOCE',
    tabs: [
      { id: 'voice', label: 'PROVA' },
      /* 🔶 v1.9 §15.1 — le memorie NON sono una schermata di prodotto:
         leggere l'archivio rompe l'illusione che si stia ricordando invece di
         registrare. Qui si controlla che ci siano. */
      { id: 'memory', label: 'MEMORIA' },
      /* 🔷 v1.12 §10.6 — in superficie l'umore dice una riga sola e quasi mai.
         Questo resta il posto dove si vedono i numeri. */
      { id: 'mood', label: 'UMORE E OPINIONI' },
      /* 🔷 v1.17 §21 — gli strumenti non partono da soli: li fa partire un
         modello. Senza chiavi resterebbero non provati. */
      { id: 'tools', label: 'STRUMENTI' },
    ],
  },
  { id: 'conti', label: 'SPESA', tabs: [{ id: 'cost', label: 'COSTI' }] },
];

/** In quale gruppo vive una scheda. Serve a non perdere il segno tornando indietro. */
const GROUP_OF: Record<DevTab, DevGroup> = Object.fromEntries(
  GROUPS.flatMap((g) => g.tabs.map((t) => [t.id, g.id])),
) as Record<DevTab, DevGroup>;

export function DevPanel({ onClose, onGo }: { onClose: () => void; onGo?: (o: 'activate') => void }) {
  const [group, setGroup] = useState<DevGroup>('start');
  const [tab, setTab] = useState<DevTab>('time');

  /* La scheda mostrata è sempre coerente col gruppo scelto: cambiando gruppo
     si apre la sua PRIMA scheda, invece di lasciare a schermo quella di prima
     con sopra una fila di linguette che non la contengono. */
  const pick = (g: DevGroup) => {
    setGroup(g);
    const first = GROUPS.find((x) => x.id === g)?.tabs[0];
    if (first) setTab(first.id);
  };

  const current = GROUPS.find((g) => g.id === group);
  const inGroup = group !== 'start' && GROUP_OF[tab] === group;

  return (
    <div className="screen dev">
      <header className="dev__head">
        <div>
          <h1 className="t-display dev__title">DEV://VINZ.MON</h1>
          {/* 🔷 §29 — la targhetta sta QUI e non solo in INIZIO: la domanda
              «si è aggiornato?» te la fai aprendo DEV, non navigando dentro. */}
          <p className="t-micro">
            STRATO DI SIMULAZIONE · <span className="dev__build">{buildLabel()}</span>
          </p>
        </div>
        <IconButton icon="close" label="Chiudi il pannello" light onClick={onClose} />
      </header>

      <FolderTabs
        tabs={GROUPS.map((g) => ({ id: g.id, label: g.label }))}
        active={group}
        onChange={pick}
        label="Aree del pannello DEV"
      />

      {current && current.tabs.length > 1 && (
        <FolderTabs
          tabs={current.tabs}
          active={tab}
          onChange={setTab}
          label={`Sezioni di ${current.label}`}
        />
      )}

      <div className="screen__body dev__body">
        {group === 'start' && <StartSection onGo={onGo} onClose={onClose} />}
        {inGroup && tab === 'time' && <TimeSection />}
        {inGroup && tab === 'signals' && <SignalsSection />}
        {inGroup && tab === 'mindline' && <MindlineSection onClose={onClose} />}
        {inGroup && tab === 'generate' && <GenerateSection />}
        {inGroup && tab === 'bio' && <BioSection />}
        {inGroup && tab === 'voice' && <VoiceSection />}
        {inGroup && tab === 'prompt' && <PromptPreview />}
        {inGroup && tab === 'assets' && <AssetsSection />}
        {inGroup && tab === 'progression' && <ProgressionSection />}
        {inGroup && tab === 'cost' && <CostSection />}
        {inGroup && tab === 'memory' && <MemorySection />}
        {inGroup && tab === 'mood' && <MoodSection />}
        {inGroup && tab === 'rarity' && <RaritySection />}
        {inGroup && tab === 'catalog' && <CatalogSection />}
        {inGroup && tab === 'designtest' && <DesignTest />}
        {inGroup && tab === 'tools' && <ToolsSection />}
      </div>
    </div>
  );
}

/* ============================================================================
   TEMPO — "Advance time: +1 DAY, +7 DAYS, END WEEK, NEXT MINDLINE SHIFT"
   ========================================================================= */

/* ============================================================================
   DEV → INIZIO

   🔒 QUATTRO COSE, E LA REGOLA È CHE NON DEVONO DIVENTARE CINQUE.

   Questa schermata vale finché ci sta in uno schermo senza scorrere. Ogni
   aggiunta è una riga in meno di quel margine, e il giorno che lo finisce
   questo pannello è tornato quello di prima con un nome nuovo.

   Se una cosa serve ma non ogni volta, il suo posto è il gruppo giusto qui
   sopra. Il criterio non è «è utile» — sono utili tutte — è «la faccio ogni
   volta che apro?».
   ========================================================================= */

function StartSection({
  onGo,
  onClose,
}: {
  onGo?: (o: 'activate') => void;
  onClose: () => void;
}) {
  const day = useApp((s) => s.day);
  const phase = useApp((s) => s.phase);
  const token = useApp((s) => s.token);
  const voiceModel = useApp((s) => s.voiceModel);
  const mon = useActiveMon();
  const advanceDays = useApp((s) => s.advanceDays);
  const syncDay = useApp((s) => s.syncDay);
  const setDailySignal = useApp((s) => s.setDailySignal);
  const resetAll = useApp((s) => s.resetAll);
  const keptCount = useApp((s) => s.kept.length);
  const build = buildInfo();

  /* Un giorno «pieno»: si dichiara l'umore — che la simulazione non può
     inventare (§5) — e si chiude. È la sequenza che si fa a mano ogni volta
     per far camminare una partita di prova. */
  const fullDay = () => {
    setDailySignal('MOOD', 'KNOWN', 'dichiarato da DEV');
    syncDay();
    advanceDays(1);
  };

  return (
    <div className="dev__section">
      <p className="t-meta">
        GIORNO {day} · {phase.toUpperCase()}
        {mon ? ` · ${mon.data.name}` : ' · nessuna creatura'}
      </p>

      {/* ════════════════════════════════════════════════════════════════════
          🔷 «Mi segni la versione, così so se si è aggiornato.»

          Due righe, due domande diverse:
          • commit e ora  → il sito è quello nuovo?
          • compiler/config → le creature nuove nascono diverse da prima?

          🔒 Nessuno di questi numeri lo scrivo a mano. Uno che dipendesse dal
          fatto che me lo ricordo direbbe «aggiornato» a un sito vecchio il
          primo giorno che dimentico — cioè mentirebbe proprio nel caso per cui
          esiste.
          ════════════════════════════════════════════════════════════════ */}
      <p className="t-meta dev__label">VERSIONE</p>
      <div className="rowlist">
        <Row label="BUILD" value={build.commit} />
        <Row label="COSTRUITA IL" value={build.at ? `${build.at} UTC` : '—'} />
        {build.branch && <Row label="RAMO" value={build.branch} />}
        <Row label="MOTORE DEI PROMPT" value={`compiler ${build.compiler} · config ${build.config}`} />
      </div>

      {/* 1 — La voce è accesa? È la prima domanda perché è la sola che rende
             diverso tutto il resto: senza, ogni prova gira sul ripiego. */}
      <p className="t-meta dev__label">VOCE</p>
      <p className="t-micro dev__note">
        {token
          ? `Segreto presente. Modello: ${voiceModel ?? 'quello predefinito'}.`
          : 'Nessun segreto: il .mon risponde con le frasi di ripiego, non con le sue.'}
      </p>
      <div className="dev__row">
        <Button small onClick={() => (onGo ? onGo('activate') : onClose())}>
          {token ? 'RIVEDI L’ATTIVAZIONE' : 'ATTIVA VINZ.MON'}
        </Button>
      </div>

      {/* 2 — Far passare il tempo, che è il motivo n.1 per cui questo pannello
             esiste: l'incubazione dura 28 giorni veri. */}
      <p className="t-meta dev__label">TEMPO</p>
      <div className="dev__row">
        <Button small onClick={fullDay}>
          +1 GIORNO CHIUSO
        </Button>
        <Button
          small
          onClick={() => {
            for (let i = 0; i < 7; i++) fullDay();
          }}
        >
          +7 GIORNI
        </Button>
      </div>
      <p className="t-micro dev__note">
        Chiude la giornata e avanza. L’umore lo dichiara DEV al posto tuo:
        è l’unico segnale che nessuna simulazione può inventare.
      </p>

      {/* 3 — La spesa. Sta qui e non solo in COSTI perché è l'unico numero che
             conviene vedere senza essere andato a cercarlo. */}
      <p className="t-meta dev__label">SPESA</p>
      <SpendLine />

      <p className="t-micro dev__note dev__start-note">
        Tutto il resto — segnali, mindline, rarità, asset, prompt, memoria,
        umore, strumenti — sta nei gruppi qui sopra. Serve quando qualcosa non
        torna, non ogni volta.
      </p>

      {/* ════════════════════════════════════════════════════════════════════
          🔷 «Ho perso il pulsante per ricominciare tutto.»

          Stava in fondo a MINDLINE, insieme alle forzature di eleggibilità.
          Ci era finito quando quella era la scheda dove si «rimetteva a posto
          la partita», e raggruppando le schede è diventato irraggiungibile:
          due tocchi, poi scorrere una schermata lunga fino in fondo.

          🔒 STA IN INIZIO PERCHÉ È LÌ CHE LO CERCHI, MA IN FONDO E STACCATO.
          Ricominciare è la cosa più distruttiva dell'app: accanto a «+1
          GIORNO» un dito storto costerebbe mesi. Il margine e la riga che lo
          separa non sono decorazione — sono la distanza fra i comandi di tutti
          i giorni e quello da cui non si torna.
          ════════════════════════════════════════════════════════════════ */}
      <div className="dev__danger">
        <p className="t-meta dev__label">RICOMINCIA DA CAPO</p>
        <ResetAllButton onReset={resetAll} keptCount={keptCount} />
      </div>
    </div>
  );
}

/** Quanto è stato speso questo mese, in una riga. */
function SpendLine() {
  const [text, setText] = useState('—');
  const token = useApp((s) => s.token);

  useEffect(() => {
    if (!token) {
      setText('nessun segreto: il server non ha niente da raccontare.');
      return;
    }
    void import('../ai/backend').then(({ loadSetup }) =>
      loadSetup(token).then(({ data }) => {
        setText(
          data && typeof data.spentUsd === 'number'
            ? `$${data.spentUsd.toFixed(2)} su $${(data.capUsd ?? 0).toFixed(2)} — ${data.month ?? ''}`
            : 'il server non risponde.',
        );
      }),
    );
  }, [token]);

  return <p className="t-micro dev__note">{text}</p>;
}

function TimeSection() {
  const day = useApp((s) => s.day);
  const phase = useApp((s) => s.phase);
  const advanceDays = useApp((s) => s.advanceDays);
  const simulateSyncedDays = useApp((s) => s.simulateSyncedDays);
  const endWeek = useApp((s) => s.endWeek);
  const bias = useApp((s) => s.bias);
  const setBias = useApp((s) => s.setBias);
  const syncDay = useApp((s) => s.syncDay);
  const today = useToday();
  const growth = useGrowth();

  /**
   * Avanza fino al prossimo punto di decisione, chiudendo ogni giornata.
   *
   * 🔶 Deve chiudere i giorni a mano perché il tempo, da solo, non dà più
   * SYNC: lo dà la conferma dell'utente. Senza `syncDay()` questo ciclo
   * girerebbe 400 volte senza far crescere niente — che è esattamente la
   * regola nuova, vista da dentro.
   */
  const toNextShift = () => {
    for (let i = 0; i < 400; i++) {
      const s = useApp.getState();
      const rec = s.activeMonName ? s.mons[s.activeMonName] : null;
      if (!rec) break;
      if (
        s.progression.sync.sinceGrowth >= PROGRESSION.microGrowthEvery ||
        s.progression.sync.inForm >= PROGRESSION.formEvolutionAt
      ) {
        break;
      }
      // L'umore non lo riempie la simulazione: qui lo dichiara DEV al posto tuo.
      useApp.getState().setDailySignal('MOOD', 'KNOWN', 'dichiarato da DEV');
      useApp.getState().syncDay();
      advanceDays(1);
    }
  };

  return (
    <div className="dev__section">
      <p className="t-meta">GIORNO CORRENTE: {day} · FASE: {phase.toUpperCase()}</p>

      {/* 🔷 v1.10 — «se aggiungo giorni si aggiunge SYNC ma non giorni».

          I pulsanti qui sotto fanno passare il TEMPO, e il tempo da solo non
          dà SYNC: lo dà presentarsi (§7). Chi prova l'app dal pannello se ne
          accorge solo dopo aver premuto tre volte senza vedere cambiare
          niente, il che rende il controllo più confuso della cosa che
          controlla.

          Questo invece vive un giorno per intero — racconta, chiude, passa a
          domani — ed è quello che serve per vedere l'uovo incrinarsi un
          giorno alla volta. */}
      <Button block variant="primary" small onClick={() => simulateSyncedDays(1)}>
        VIVI UN GIORNO (RACCONTA + CHIUDI + DOMANI)
      </Button>

      <p className="t-micro dev__note">
        I pulsanti qui sotto fanno solo passare il tempo: non danno SYNC, non
        chiudono niente e l’incubazione non avanza. È voluto — il tempo non fa
        crescere nessuno.
      </p>

      <div className="dev__grid">
        <Button small onClick={() => advanceDays(1)}>+1 GIORNO</Button>
        <Button small onClick={() => advanceDays(7)}>+7 GIORNI</Button>
        <Button small onClick={endWeek}>FINE SETTIMANA</Button>
        <Button small onClick={() => advanceDays(30)}>+30 GIORNI</Button>
      </div>

      <Button block variant="primary" small onClick={toNextShift}>
        NEXT MINDLINE SHIFT
      </Button>

      <Button block small onClick={syncDay} disabled={!today.canClose}>
        {today.closed ? 'GIORNO GIÀ CHIUSO' : 'CHIUDI IL GIORNO (+1 SYNC)'}
      </Button>

      <div className="rowlist">
        <Row label="OGGI" value={`${today.status} · ${today.known}/3 segnali`} />
        <Row
          label="PROSSIMO EVENTO"
          value={`${growth.event.kind} ${growth.event.have}/${growth.event.need}`}
        />
        <Row label="MICRO-GROWTH" value={growth.microGrowthReady ? 'PRONTO' : 'non ancora'} />
        <Row label="FORM EVOLUTION" value={growth.formEvolutionReady ? 'PRONTA' : 'non ancora'} />
      </div>

      {/* I giorni simulati non sono tutti uguali: il bias descrive che tipo di
          settimane sta vivendo l'utente finto. */}
      <p className="t-meta dev__label">BIAS DELLA SIMULAZIONE</p>
      <DevSlider
        label="DRIFT"
        min={-1}
        max={1}
        step={0.05}
        value={bias.drift}
        onChange={(v) => setBias({ drift: v })}
        hint="negativo = peggioramento, positivo = miglioramento"
      />
      <DevSlider
        label="PROBABILITÀ DI REGISTRARE"
        min={0}
        max={1}
        step={0.05}
        value={bias.logProbability}
        onChange={(v) => setBias({ logProbability: v })}
        hint="quanto spesso l'utente inserisce dati"
      />
      <DevSlider
        label="PROBABILITÀ DI ALLENAMENTO"
        min={0}
        max={1}
        step={0.05}
        value={bias.workoutProbability}
        onChange={(v) => setBias({ workoutProbability: v })}
      />
    </div>
  );
}

/* ============================================================================
   SEGNALI — "Manipulate selected ME signals and test values without waiting
   for real Health/fitness inputs" + "Inject a simulated event, mood, memory,
   focus or behaviour signal" + "Grant / remove prototype XP and Bond"

   🔶 «XP» qui è storia: la valuta è SYNC, e si dà in giorni interi.
   ========================================================================= */

function SignalsSection() {
  const health = useApp((s) => s.health);
  const progression = useApp((s) => s.progression);
  const setSignal = useApp((s) => s.setSignal);
  const grantSync = useApp((s) => s.grantSync);
  const grantBond = useApp((s) => s.grantBond);
  const injectEvent = useApp((s) => s.injectEvent);
  const personality = useApp((s) => s.personality);
  const reopenScan = useApp((s) => s.reopenScan);
  const scan = useScan();

  const [eventText, setEventText] = useState('');

  return (
    <div className="dev__section">
      <p className="t-meta dev__label">SEGNALI ME</p>
      {STAT_KEYS.map((key: StatKey) => {
        const v = health.stats[key].value;
        return (
          <div key={key} className="dev__signal">
            <div className="dev__signalhead">
              <span className="t-meta">{key}</span>
              <span className="t-micro">{isKnown(v) ? Math.round(v) : 'UNKNOWN'}</span>
            </div>
            <div className="dev__signalrow">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={isKnown(v) ? v : 0}
                aria-label={`Valore di ${key}`}
                onChange={(e) => setSignal(key, Number(e.target.value))}
              />
              {/* Rimettere un segnale su UNKNOWN è essenziale per testare la
                  regola di §3: dato mancante ≠ dato pessimo. */}
              <Button small variant="ghost" onClick={() => setSignal(key, UNKNOWN)}>
                UNKNOWN
              </Button>
            </div>
          </div>
        );
      })}

      <p className="t-meta dev__label">PROGRESSIONE</p>
      <div className="rowlist">
        <Row label="SYNC TOTALI" value={String(progression.sync.lifetime)} />
        <Row label="IN QUESTA FORMA" value={String(progression.sync.inForm)} />
        <Row label="DALL'ULTIMA CRESCITA" value={String(progression.sync.sinceGrowth)} />
        <Row label="BOND" value={`${Math.round(progression.bond * 100)}%`} />
      </div>

      <div className="dev__grid">
        <Button small onClick={() => grantSync(7)}>+7 SYNC</Button>
        <Button small onClick={() => grantSync(-7)}>−7 SYNC</Button>
        <Button small onClick={() => grantBond(0.2)}>+20% BOND</Button>
        <Button small onClick={() => grantBond(-0.2)}>−20% BOND</Button>
      </div>
      <p className="t-micro dev__note">
        In prodotto un giorno vale al massimo +1 SYNC, e lo dà solo la chiusura
        della giornata. Questi pulsanti scavalcano la regola per non dover
        aspettare 28 giorni a ogni prova.
      </p>

      {/* §12 — il seme è la cosa che più cambia quale Family esce, e senza una
          lettura in DEV non c'è modo di accorgersi se lo scan sta funzionando:
          un seme piatto e un seme mai compilato producono la stessa creatura. */}
      <p className="t-meta dev__label">SIGNAL SCAN (§12)</p>
      <div className="rowlist">
        <Row label="RISPOSTE" value={`${scan.answered}/12`} />
        <Row label="SCOSTAMENTO DAL NEUTRO" value={`${Math.round(seedSpread(personality) * 100)}%`} />
      </div>
      <div className="dev__seed">
        {PERSONALITY_KEYS.map((k) => (
          <span key={k} className="dev__seeditem t-micro">
            {k}
            <em>{Math.round(personality[k])}</em>
          </span>
        ))}
      </div>
      <Button small block onClick={reopenScan}>
        RIFAI IL SIGNAL SCAN
      </Button>

      <p className="t-meta dev__label">INIETTA UN EVENTO</p>
      <TextField
        label="Testo dell'evento da iniettare"
        placeholder="Cosa è successo…"
        value={eventText}
        onChange={setEventText}
      />
      <div className="dev__grid">
        {(['event', 'joke', 'milestone', 'gift'] as const).map((k) => (
          <Button
            key={k}
            small
            disabled={eventText.trim().length === 0}
            onClick={() => {
              injectEvent(k, eventText.trim());
              setEventText('');
            }}
          >
            {k.toUpperCase()}
          </Button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================================
   MINDLINE — "Force CONTINUE / EVOLVE eligibility", "Force BRANCH / NEW SIGNAL
   eligibility", "Reset current node, restore a prior node or clone a scenario"
   ========================================================================= */

function MindlineSection({ onClose }: { onClose: () => void }) {
  const dev = useApp((s) => s.dev);
  const setDev = useApp((s) => s.setDev);
  const nodes = useApp((s) => s.nodes);
  const mons = useApp((s) => s.mons);
  const openShift = useApp((s) => s.openShift);
  const resetCurrentNode = useApp((s) => s.resetCurrentNode);
  const restoreNode = useApp((s) => s.restoreNode);
  const cloneScenario = useApp((s) => s.cloneScenario);
  const activeMonName = useApp((s) => s.activeMonName);

  const activeNodeId = activeMonName ? mons[activeMonName]?.data.mindline_node : null;

  return (
    <div className="dev__section">
      <p className="t-meta dev__label">FORZATURE DI ELEGGIBILITÀ</p>
      <label className="dev__check">
        <input
          type="checkbox"
          checked={dev.forceContinue}
          onChange={(e) => setDev({ forceContinue: e.target.checked })}
        />
        FORZA MICRO-GROWTH (ignora i 7 giorni)
      </label>
      <label className="dev__check">
        <input
          type="checkbox"
          checked={dev.forceBranch}
          onChange={(e) => setDev({ forceBranch: e.target.checked })}
        />
        FORZA FORM EVOLUTION (ignora i 28 giorni)
      </label>
      {/* §25 DEV://UNLOCK_ALL — «For testing only; must never leak to
          production behavior.» Sblocca tutti i livelli di rarità. */}
      <label className="dev__check">
        <input
          type="checkbox"
          checked={dev.unlockAll}
          onChange={(e) => setDev({ unlockAll: e.target.checked })}
        />
        DEV://UNLOCK_ALL — tutti i livelli di rarità
      </label>

      {/* Un'azione DEV che porta a una schermata di prodotto chiude il
          pannello: altrimenti resterebbe sopra la fase appena aperta. */}
      <Button
        block
        variant="primary"
        small
        onClick={() => {
          openShift();
          onClose();
        }}
      >
        APRI MINDLINE SHIFT
      </Button>

      <p className="t-meta dev__label">NODI ({nodes.length})</p>
      <div className="rowlist">
        {[...nodes].reverse().map((n) => (
          <Row
            key={n.id}
            label={`${n.id} · ${n.monName}`}
            value={n.id === activeNodeId ? 'ATTIVO' : 'ripristina →'}
            onClick={n.id === activeNodeId ? undefined : () => restoreNode(n.id)}
          />
        ))}
      </div>

      <p className="t-meta dev__label">SCENARIO</p>
      <div className="dev__grid">
        <Button small onClick={resetCurrentNode}>RESET NODO</Button>
        <Button small onClick={cloneScenario}>CLONA SCENARIO</Button>
      </div>
      <p className="t-micro dev__note">
        RESET NODO rigenera il .mon corrente con un nuovo seed, mantenendo il
        nodo e l'eredità. CLONA crea un ramo parallelo per confronti a coppie.
      </p>

    </div>
  );
}

/* ============================================================================
   ⚠️ IL PULSANTE CHE CANCELLA TUTTO CHIEDE DUE VOLTE.

   Finché il pannello si apriva solo con `?dev=1` nell'indirizzo, arrivare qui
   era già una scelta deliberata. Da quando il tasto DEV è sempre in alto, non
   lo è più: questo pulsante sta a due tocchi da qualunque schermata, e cancella
   mesi in un colpo.

   La conferma NON è un `confirm()` del browser: su iPhone quel dialogo compare
   in un punto imprevedibile e si chiude con un tocco a caso fuori. Qui invece
   il pulsante si trasforma, dice cosa stai per perdere con i numeri veri, e
   per confermare devi premere una seconda volta un bersaglio DIVERSO.
   ========================================================================= */

function ResetAllButton({ onReset, keptCount }: { onReset: () => void; keptCount: number }) {
  const [armed, setArmed] = useState(false);
  const day = useApp((s) => s.day);
  const forms = useApp((s) => Object.keys(s.mons).length);
  const memories = useApp((s) => s.memories.length);

  if (!armed) {
    return (
      <Button block variant="secondary" small onClick={() => setArmed(true)}>
        RESET COMPLETO DELLA SIMULAZIONE
      </Button>
    );
  }

  return (
    <div className="dev__control">
      <p className="t-small dev__note">
        Stai per cancellare <strong>{day} giorni</strong>, {forms}{' '}
        {forms === 1 ? 'forma' : 'forme'} e {memories}{' '}
        {memories === 1 ? 'ricordo' : 'ricordi'}.{' '}
        {keptCount > 0
          ? `I ${keptCount} .mon nella teca restano.`
          : 'Non hai conservato nessun .mon nella teca: non resta niente.'}
      </p>
      <div className="dev__control dev__control--row">
        <Button small onClick={() => setArmed(false)}>
          Lascia stare
        </Button>
        <Button
          variant="secondary"
          small
          onClick={() => {
            setArmed(false);
            onReset();
          }}
        >
          Cancella tutto
        </Button>
      </div>
    </div>
  );
}

/* ============================================================================
   GENERA — batch + ispezione di Character Data, rarità ed Heritage (§20.1/20.2)
   ========================================================================= */

function GenerateSection() {
  const mon = useActiveMon();
  const trace = useApp((s) => s.lastTrace);
  const [showJson, setShowJson] = useState(false);

  return (
    <div className="dev__section">
      <BatchGenerator />

      {/* §29 — «The prototype must expose a GENERATION TRACE in DEV only
          showing scores, penalties, chosen pool, rarity normalization and
          final random seed.» §29 vieta di mostrarla in produzione. */}
      {trace && (
        <>
          <p className="t-meta dev__label">GENERATION TRACE (§24)</p>
          <p className="t-micro dev__note">
            seed {trace.seed} · config {trace.generation_config_version}
          </p>

          <div className="rowlist">
            {trace.steps.map((s) => (
              <Row
                key={`${s.step}-${s.stage}`}
                label={`${String(s.step).padStart(2, '0')} ${s.stage}`}
                value={
                  <span className="dev__factor">
                    <strong>{s.outcome}</strong>
                    {s.note && <em className="t-micro">{s.note}</em>}
                  </span>
                }
              />
            ))}
          </div>

          {/* §17 — i punteggi di fit per Family, con penalità e rumore.
              È esattamente ciò che il giocatore non deve mai vedere. */}
          {trace.steps
            .filter((s) => s.candidates && s.candidates.length > 0)
            .map((s) => (
              <div key={`cand-${s.step}`}>
                <p className="t-meta dev__label">CANDIDATI — {s.stage}</p>
                <div className="rowlist">
                  {s.candidates!.map((c) => (
                    <Row
                      key={c.id}
                      label={`${c.chosen ? '▸ ' : '  '}${c.id}`}
                      value={
                        <span className="dev__factor">
                          <strong>{c.total.toFixed(1)}</strong>
                          <em className="t-micro">
                            fit {c.fit.toFixed(1)} · novità {c.noveltyPenalty} · cultura{' '}
                            {c.culturalModifier.toFixed(1)} · rumore {c.noise.toFixed(1)}
                          </em>
                        </span>
                      }
                    />
                  ))}
                </div>
              </div>
            ))}

          <p className="t-meta dev__label">RARITÀ — PUNTEGGIO (§16)</p>
          <div className="rowlist">
            {trace.rarity.breakdown.map((b) => (
              <Row
                key={b.component}
                label={b.component.toUpperCase()}
                value={
                  <span className="dev__factor">
                    <strong>
                      {b.points.toFixed(1)} / {b.max}
                    </strong>
                    <em className="t-micro">{b.it}</em>
                  </span>
                }
              />
            ))}
            <Row
              label="TOTALE"
              value={`${trace.rarity.score}/100 → tetto ${trace.rarity.cap}`}
            />
          </div>

          {/* §26 — normalizzazione: la quota dei livelli bloccati viene
              ridistribuita, non persa. */}
          <p className="t-meta dev__label">RARITÀ — POOL (§26)</p>
          <div className="rowlist">
            <Row
              label="SBLOCCATI"
              value={trace.rarity.unlockedPool
                .map((p) => `${p.rarity} ${p.chance.toFixed(1)}%`)
                .join(' · ')}
            />
            <Row
              label="DOPO IL TETTO"
              value={trace.rarity.eligiblePool
                .map((p) => `${p.rarity} ${p.chance.toFixed(1)}%`)
                .join(' · ')}
            />
            <Row label="ESTRATTA" value={trace.rarity.rolled} />
          </div>
        </>
      )}

      {mon && mon.data.heritage_traits.length > 0 && (
        <>
          <p className="t-meta dev__label">SELEZIONE HERITAGE (§23)</p>
          <div className="rowlist">
            {mon.data.heritage_traits.map((h) => (
              <Row
                key={h.id}
                label={h.category.toUpperCase()}
                value={
                  <span className="dev__factor">
                    <strong>{h.transformed}</strong>
                    <em className="t-micro">era: {h.origin}</em>
                  </span>
                }
              />
            ))}
          </div>
        </>
      )}

      {mon && (
        <>
          <Button block small onClick={() => setShowJson((v) => !v)}>
            {showJson ? 'NASCONDI' : 'MOSTRA'} CHARACTER DATA (JSON)
          </Button>
          {showJson && <pre className="dev__json">{JSON.stringify(mon.data, null, 2)}</pre>}
        </>
      )}
    </div>
  );
}

/* ============================================================================
   ASSET — import e stato degli slot (§22.3)
   ========================================================================= */

function AssetsSection() {
  /* Tutto il giro a mano — trascina, stato degli slot, prompt da copiare —
     sta in `AssetImport`. Qui c'era un SECONDO elenco degli stessi slot che
     avevo aggiunto sopra al primo: due liste della stessa cosa, una sotto
     l'altra, sulla stessa schermata. */
  return (
    <div className="dev__section">
      <AssetImport />
    </div>
  );
}

/* ============================================================================
   PROGRESSIONE — i tre segnali del giorno e la cadenza.

   🔶 Sostituisce la vecchia scheda ECONOMIA, che tarava costi in XP e crescita
   del costo per evoluzione. Non c'è più niente da tarare: la cadenza è fissata
   dalla spec (7 / 7 / 28) e un giorno vale al massimo +1 SYNC. Quello che serve
   in DEV è poter dichiarare i segnali a mano, perché la simulazione non può
   inventare l'umore.
   ========================================================================= */

function ProgressionSection() {
  const days = useApp((s) => s.days);
  const day = useApp((s) => s.day);
  const setDailySignal = useApp((s) => s.setDailySignal);
  const syncDay = useApp((s) => s.syncDay);
  const today = useToday();

  const synced = Object.values(days).filter((d) => d.syncAwarded).length;

  return (
    <div className="dev__section">
      <p className="t-micro dev__note">
        SYNC misura quanti giorni VINZ.MON ha potuto leggere, non quanto stai
        bene. Un giorno vale +1 e basta: registrare dieci pasti migliora la
        qualità del contesto, non la velocità della crescita.
      </p>

      <p className="t-meta dev__label">GIORNO {day} — I TRE SEGNALI</p>
      {DAILY_SIGNALS.map((key) => {
        const entry = today.day.signals[key];
        return (
          <div key={key} className="dev__signal">
            <div className="dev__signalhead">
              <span className="t-meta">{DAILY_SIGNAL_LABELS[key]}</span>
              <span className="t-micro">{entry.status}</span>
            </div>
            <div className="dev__grid">
              {(['KNOWN', 'NOT_APPLICABLE', 'UNKNOWN'] as const).map((status) => (
                <Button
                  key={status}
                  small
                  variant={entry.status === status ? 'primary' : 'ghost'}
                  onClick={() => setDailySignal(key, status, 'impostato da DEV')}
                >
                  {status === 'NOT_APPLICABLE' ? 'N/A' : status}
                </Button>
              ))}
            </div>
          </div>
        );
      })}
      <p className="t-micro dev__note">
        NOT_APPLICABLE non è un buco: un giorno di riposo è una risposta, e vale
        come segnale noto esattamente quanto un allenamento.
      </p>

      <Button block variant="primary" small onClick={syncDay} disabled={!today.canClose}>
        {today.closed ? 'GIORNO GIÀ CHIUSO' : 'SYNC DAY (+1)'}
      </Button>

      <p className="t-meta dev__label">CADENZA</p>
      <div className="rowlist">
        <Row label="INCUBAZIONE" value={`${PROGRESSION.incubationSyncDays} giorni sincronizzati`} />
        <Row label="MICRO-GROWTH" value={`ogni ${PROGRESSION.microGrowthEvery}`} />
        <Row label="FORM EVOLUTION" value={`a ${PROGRESSION.formEvolutionAt}, come offerta`} />
        <Row label="GIORNI CHIUSI FINORA" value={String(synced)} />
      </div>

      {/* 🔷 v1.10 §13.9 — banco di prova dell'aptica.

          Serve perché su iPhone la vibrazione NON si può verificare da qui:
          Safari non implementa la Vibration API, e l'unica strada è un effetto
          collaterale dello switch di iOS 17.4+. Funziona o no a seconda della
          versione e delle impostazioni del telefono, e l'unico modo di saperlo
          è premere e sentire. */}
      <HapticBench />

      {/* 🔷 v1.10 — arriva dal profilo, dove non doveva stare. §29 confina la
          traccia di generazione in DEV, e il SEED era su una schermata di
          prodotto. DATA CONFIDENCE è un concetto del motore — quanto il
          generatore si fida della finestra recente — non un fatto sulla
          persona: era già uscito da ME e questa è la seconda metà di quella
          stessa correzione. */}
      <GenerationTelemetry />
    </div>
  );
}

function HapticBench() {
  return (
    <>
      <p className="t-meta dev__label">VIBRAZIONE</p>
      <div className="dev__grid">
        <Button small onClick={() => haptic('tick')}>TICK</Button>
        <Button small onClick={() => haptic('confirm')}>CONFIRM</Button>
        <Button small onClick={() => haptic('impact')}>IMPACT</Button>
      </div>
      <p className="t-micro dev__note">
        Android vibra con la Vibration API. iPhone non ce l’ha: si usa lo
        switch nascosto di iOS 17.4+, che è una scorciatoia e può smettere di
        funzionare senza preavviso. Se qui non senti niente, l’aptica su questo
        telefono non è disponibile — e va bene: §17 vieta che una vibrazione
        sia l’unico modo di sapere una cosa.
      </p>
    </>
  );
}

function GenerationTelemetry() {
  const mon = useActiveMon();
  const sync = useApp((s) => s.progression.sync);
  if (!mon) return null;
  const d = mon.data;

  return (
    <>
      <p className="t-meta dev__label">COME È STATO CALCOLATO</p>
      <div className="rowlist">
        <Row label="STADIO" value={String(d.evolution_state?.stage ?? 0)} />
        <Row label="RARITY SCORE" value={`${d.rarity_score}/100`} />
        <Row label="DATA CONFIDENCE" value={`${d.data_confidence}%`} />
        <Row label="SYNC TOTALI" value={String(sync.lifetime)} />
        <Row label="GENERATO AL GIORNO" value={String(d.generated_at_day)} />
        <Row label="SEED" value={String(d.seed)} />
        {/* §29 — ogni .mon conserva la versione di config con cui è nato:
            cambiare i pesi non riscrive la storia. */}
        <Row label="CONFIG" value={d.generation_config_version} />
      </div>
    </>
  );
}

/* --- Controlli ------------------------------------------------------------- */

function DevSlider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  hint,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <div className="dev__control">
      <div className="dev__controlhead">
        <span className="t-meta">{label}</span>
        <span className="t-micro">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p className="t-micro dev__note">{hint}</p>}
    </div>
  );
}

