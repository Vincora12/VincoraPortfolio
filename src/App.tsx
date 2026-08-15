/* ============================================================================
   SHELL DEL PROTOTIPO

   Due livelli di navigazione:
   • FASI — superfici che cambiano lo stato del sistema (incubazione, incontro,
     shift, evoluzione, branch). Occupano tutto lo schermo e non hanno tab.
   • LIVE — la navigazione persistente MON / ME / MINDLINE di §11, più le
     schermate di consultazione aperte in overlay.

   §26 — i controlli DEV non compaiono mai senza dev mode attiva.
   ========================================================================= */

import { useEffect, useState } from 'react';
import { useApp, type Phase, syncWithServer, pullIngested, maybeSpeakFirst } from './state/store';
import { applyPaletteDna } from './engine/colorDna';
import { preloadMonAssets } from './assets-pipeline/assetStore';
import { Icon } from './system/Icon';
import { haptic } from './system/haptics';
import { PROGRESSION } from './engine/progression';
import { applySigilFavicon } from './system/favicon';
import { t } from './i18n/it';

import { SplashScreen } from './screens/Splash';
import { PersonalityScanScreen } from './screens/PersonalityScan';
import { ProtocolSetupScreen } from './screens/ProtocolSetup';
import { IncubationScreen } from './screens/Incubation';
import { EncounterScreen } from './screens/Encounter';
import { CompanionHomeScreen } from './screens/CompanionHome';
import { UniversalInputScreen } from './screens/UniversalInput';
import { MeOverviewScreen } from './screens/MeOverview';
import { MindlineShiftScreen } from './screens/MindlineShift';
import { EvolutionScreen } from './screens/Evolution';
import { NewBranchScreen } from './screens/NewBranch';
import { SpecimenProfileScreen } from './screens/SpecimenProfile';
import { DexScreen } from './screens/Dex';
import { MindlineMapScreen } from './screens/MindlineMap';
import { CalendarScreen } from './screens/SyncCalendar';
import { HeritageDnaScreen } from './screens/HeritageDna';
import { HistoryScreen } from './screens/History';
import { DailyScanScreen } from './screens/DailyScan';
import { DevPanel } from './dev/DevPanel';
import { PageReader } from './screens/PageReader';

export type Tab = 'mon' | 'me' | 'calendar' | 'mindline';
export type Overlay =
  | null
  | 'specimen'
  /* 🔶 v1.9 — via 'bio' (adesso è una scheda del profilo) e via 'memories'
     (leggere l'archivio rompe la magia: resta solo in DEV). */
  | 'history'
  | 'heritage'
  | 'input'
  | 'scan'
  | 'dev'
  /* 🔷 v1.17 §21.2 — una pagina scritta dal .mon. Porta con sé il nome, che è
     anche il suo indirizzo: `page:canada` ↔ `#/p/canada`. È l'unico overlay
     con un argomento, e per questo è scritto così invece che come parola
     singola — un secondo campo di stato che dice «quale pagina» si
     desincronizzerebbe dal primo alla prima distrazione. */
  | `page:${string}`;

/** Il nome della pagina dentro un overlay, o `null` se non è una pagina. */
export function pageSlugOf(overlay: Overlay): string | null {
  return typeof overlay === 'string' && overlay.startsWith('page:')
    ? overlay.slice('page:'.length)
    : null;
}

/** Le fasi su campo nero, lette dal board. */
// 🔶 v1.10 — il PROTOCOLLO non è qui di proposito. §10.5 riserva l'inversione
// agli eventi, e dichiarare la propria dieta non è un evento: è la superficie
// più pratica del prodotto, e va su campo bianco come la registrazione.
const INK_PHASES: Phase[] = ['scan', 'incubation', 'first-encounter', 'new-encounter'];

export function App() {
  const phase = useApp((s) => s.phase);
  const activeMonName = useApp((s) => s.activeMonName);
  const paletteDna = useApp((s) =>
    s.activeMonName ? (s.mons[s.activeMonName]?.data.palette_dna ?? null) : null,
  );
  const sigil = useApp((s) =>
    s.activeMonName ? (s.mons[s.activeMonName]?.sigil ?? null) : null,
  );
  const devEnabled = useApp((s) => s.dev.enabled);
  const setDev = useApp((s) => s.setDev);

  const [tab, setTab] = useState<Tab>('mon');
  const [overlay, setOverlay] = useState<Overlay>(null);

  /* 🔷 v1.10 §13.7 — LA HOME È IL PERSONAGGIO.
     
     Non è una schermata di benvenuto da superare: è dove stai. La tab MON ha
     due viste — la creatura e la conversazione — e quella di partenza è
     sempre la creatura. Alla chat ci si va, e ci si torna.
     
     Si riparte dalla creatura in tre casi: al primo avvio, a ogni cambio di
     fase (quando l'uovo si schiude, quello che ti aspetta non è più lo
     stesso) e ogni volta che si rientra nella tab MON. */
  const [monView, setMonView] = useState<'creature' | 'chat'>('creature');
  useEffect(() => setMonView('creature'), [phase]);

  /* ============================================================================
     §21.2 — L'INDIRIZZO DI UNA PAGINA

     🔷 «Mettermi una pagina facile da raggiungere.»

     Sul telefono «facile da raggiungere» vuol dire sulla schermata home, e per
     starci serve un indirizzo. `#/p/canada` è quello: apri quel link e l'app
     parte già sulla pagina, quindi da Safari la si può aggiungere alla home e
     diventa un'icona a sé.

     🔒 Si usa il frammento — la parte dopo il cancelletto — e non un percorso
     vero perché non c'è un server che serva `/p/canada`: chiederglielo darebbe
     una pagina non trovata. Il frammento resta nel browser, e funziona anche
     con il sito fermo.
     ========================================================================= */
  useEffect(() => {
    const open = () => {
      const m = /^#\/p\/([a-z0-9-]{2,32})$/.exec(window.location.hash);
      if (m) setOverlay(`page:${m[1]}`);
    };
    open();
    window.addEventListener('hashchange', open);
    return () => window.removeEventListener('hashchange', open);
  }, []);

  /* L'indirizzo segue quello che guardi, così «condividi» e «aggiungi a Home»
     prendono la pagina giusta invece della radice. */
  useEffect(() => {
    const slug = pageSlugOf(overlay);
    const wanted = slug ? `#/p/${slug}` : '';
    if (window.location.hash !== wanted) {
      // `replaceState` e non `hash =`: cambiare l'hash impilerebbe una voce
      // nella cronologia a ogni apertura, e il tasto indietro diventerebbe un
      // labirinto di pagine già chiuse.
      window.history.replaceState(null, '', `${window.location.pathname}${wanted}`);
    }
  }, [overlay]);

  const goTab = (next: Tab) => {
    if (next === 'mon') setMonView('creature');
    setTab(next);
  };

  // §10.2 — cambiare .mon ritematizza gli accenti senza toccare l'architettura.
  useEffect(() => {
    applyPaletteDna(paletteDna);
  }, [paletteDna]);

  /* 🔷 v1.15 §23.6 — il sigillo diventa l'icona della scheda, e cambia con la
     creatura. Sulla schermata home dell'iPhone non può fare lo stesso: iOS
     legge l'icona una volta sola, quando aggiungi la scorciatoia, e da lì la
     tiene in cache per sempre. */
  useEffect(() => {
    applySigilFavicon(sigil);
  }, [sigil]);

  // Gli asset importati vivono in IndexedDB: vanno ricaricati a ogni avvio.
  useEffect(() => {
    if (activeMonName) void preloadMonAssets(activeMonName);
  }, [activeMonName]);

  /* 🔷 v1.13 §20 — all'avvio si guarda se il server ha più storia di questo
     telefono. Una volta sola, e non blocca niente: se la rete non c'è, l'app
     parte con la copia locale e riproverà al prossimo avvio.

     Gira DOPO la reidratazione di zustand perché questo effetto scatta al
     primo render, e a quel punto il `localStorage` è già stato letto —
     altrimenti confronterebbe il server con uno stato vuoto e scaricherebbe
     sempre, anche quando il telefono è quello più avanti. */
  useEffect(() => {
    void syncWithServer().then(async (outcome) => {
      if (outcome === 'scaricato') console.info('[sync] ripreso il salvataggio dal server');
      /* Dopo il salvataggio, non prima: se le due copie divergono si prende
         quella buona e POI ci si applica sopra quello che le Shortcut hanno
         lasciato. Al contrario, i dati della notte finirebbero su uno stato
         che sta per essere sostituito. */
      const applied = await pullIngested();
      if (applied > 0) console.info(`[sync] ${applied} segnali dalle scorciatoie`);

      /* 🔷 v1.14 §13.10 — e solo ALLA FINE il messaggio spontaneo, perché
         alcune delle cose che potrebbe dire dipendono dai dati appena
         arrivati: «la giornata è quasi chiusa» ha senso solo dopo aver
         guardato cosa hanno lasciato le Shortcut stanotte. */
      maybeSpeakFirst();
    });
  }, []);

  /* ============================================================================
     🔷 «La modalità DEV in alto sempre presente anche se accedo senza url dev,
     tanto scelgo io di non cliccare ed entrare.»

     Concesso, e la ragione regge: §26 vieta di esporre i controlli DEV «in
     produzione», ma quella regola protegge GLI UTENTI di un prodotto — e qui
     l'utente è uno, è il proprietario, ed è quello che ha scritto la regola.
     Nascondere l'interruttore a sé stessi non è sicurezza, è attrito.

     ⚠️ MA UNA COSA CAMBIA DAVVERO, E ANDAVA SISTEMATA INSIEME.

     Con l'indirizzo `?dev=1` il pannello era una cosa che si raggiungeva di
     proposito. Adesso è a due tocchi da qualunque schermata, sempre — e dentro
     c'è RESET COMPLETO, che cancella la partita senza chiedere niente. Una
     porta che prima era in fondo a un corridoio adesso è in salotto: la
     maniglia va cambiata, e infatti quel pulsante ora chiede conferma.

     `?dev=1` continua a funzionare e non serve più a niente: chi ha un
     segnalibro vecchio non trova un errore. */
  useEffect(() => {
    setDev({ enabled: true });
  }, [setDev]);

  /* Vale anche per l'incubazione, con l'uovo al centro: i sette giorni che
     decidono se l'app viene riaperta non avevano nessun momento di presenza.
     §12/01 resta rispettato — l'uovo non anticipa niente, ed è la stessa cosa
     che si vede in piccolo nella barra della chat. */
  const onCreature =
    monView === 'creature' &&
    (phase === 'incubation' || (phase === 'live' && tab === 'mon' && activeMonName !== null));

  // Il board mostra anche la MINDLINE su campo nero, non solo le fasi evento.
  const inkField =
    onCreature ||
    INK_PHASES.includes(phase) ||
    overlay === 'dev' ||
    (phase === 'live' && tab === 'mindline' && !overlay);

  // Con la tab bar in fondo, il margine di sistema lo prende lei: il composer
  // non deve aggiungere il suo, o resterebbe uno spazio vuoto doppio.
  const hasTabBar = phase === 'live' && !overlay;

  return (
    <div className="proto-stage">
      <div
        className={`proto-frame ${hasTabBar ? 'has-tabbar' : ''}`}
        data-field={inkField ? 'ink' : undefined}
      >
        <StatusBar
          showDev={devEnabled && overlay !== 'dev'}
          onOpenDev={() => setOverlay('dev')}
        />

        {/* ⚠️ L'ordine conta: l'ingresso stava PRIMA dell'overlay, quindi con
            la splash aperta il pannello DEV si apriva sotto e non si vedeva.
            Un overlay è una navigazione esplicita e vince sempre su un
            saluto. */}
        {overlay ? (
          <OverlayScreen overlay={overlay} onClose={() => setOverlay(null)} onGo={setOverlay} />
        ) : onCreature ? (
          <SplashScreen onEnter={() => setMonView('chat')} />
        ) : (
          <PhaseScreen
            phase={phase}
            tab={tab}
            onGo={setOverlay}
            onBack={() => setMonView('creature')}
          />
        )}

        {/* 🔷 La barra resta anche sulla creatura: è una tab, non una
            schermata che copre tutto. Da lì si va a ME, GIORNI e MINDLINE
            senza dover prima entrare in chat. */}
        {hasTabBar && <TabBar tab={tab} onChange={goTab} />}
      </div>
    </div>
  );
}

/* --- Fasi ------------------------------------------------------------------ */

function PhaseScreen({
  phase,
  tab,
  onGo,
  onBack,
}: {
  phase: Phase;
  tab: Tab;
  onGo: (o: Overlay) => void;
  /** Torna all'ingresso, dove la creatura sta in grande (§13.7). */
  onBack: () => void;
}) {
  switch (phase) {
    case 'scan':
      return <PersonalityScanScreen />;
    case 'protocol':
      return <ProtocolSetupScreen />;
    case 'incubation':
      return <IncubationScreen onGo={onGo} />;
    case 'first-encounter':
      return <EncounterScreen variant="first" />;
    case 'new-encounter':
      return <EncounterScreen variant="new" />;
    case 'shift':
      return <MindlineShiftScreen />;
    case 'evolution':
      return <EvolutionScreen />;
    case 'form-evolution':
      return <NewBranchScreen />;
    case 'live':
      switch (tab) {
        case 'mon':
          return <CompanionHomeScreen onGo={onGo} onBack={onBack} />;
        case 'me':
          return <MeOverviewScreen onGo={onGo} />;
        case 'calendar':
          return <CalendarScreen onGo={onGo} />;
        case 'mindline':
          return <ArchiveTab onGo={onGo} />;
      }
  }
}

/* ============================================================================
   🔷 v1.14 §12.5 — ARCHIVIO: DUE VISTE, UNA TAB

   MINDLINE e VINZ.DEX rispondono a due domande diverse — «come sono arrivato
   qui» e «chi sono stato» — e devono continuare a sembrarlo: fonderle in una
   cosa sola farebbe leggere «ho collezionato dodici creature», che è il
   contrario di quello che il progetto dice (§33: una sola entità e le sue
   forme).

   ⚠️ Ma non meritano una QUINTA scheda in fondo. Cinque voci su uno schermo
   da telefono sono cinque bersagli stretti, e la navigazione principale
   smette di essere leggibile a colpo d'occhio. Stanno nella stessa tab con
   un segmento sopra: la distinzione vive nelle etichette, che è dove serve.
   ========================================================================= */

function ArchiveTab({ onGo }: { onGo: (o: Overlay) => void }) {
  const [view, setView] = useState<'mindline' | 'dex'>('mindline');

  return (
    <div className="archive">
      <div className="archive__switch" role="tablist" aria-label="Archivio">
        <button
          type="button"
          role="tab"
          aria-selected={view === 'mindline'}
          className="archive__seg"
          onClick={() => {
            haptic('tick');
            setView('mindline');
          }}
        >
          {t.nav.mindline}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'dex'}
          className="archive__seg"
          onClick={() => {
            haptic('tick');
            setView('dex');
          }}
        >
          {t.dex.title}
        </button>
      </div>

      {view === 'mindline' ? <MindlineMapScreen onGo={onGo} /> : <DexScreen onGo={onGo} />}
    </div>
  );
}

/* --- Overlay --------------------------------------------------------------- */

function OverlayScreen({
  overlay,
  onClose,
  onGo,
}: {
  overlay: Exclude<Overlay, null>;
  onClose: () => void;
  onGo: (o: Overlay) => void;
}) {
  switch (overlay) {
    case 'specimen':
      return <SpecimenProfileScreen onClose={onClose} onGo={onGo} />;
    case 'history':
      return <HistoryScreen onClose={onClose} />;
    case 'heritage':
      return <HeritageDnaScreen onClose={onClose} />;
    case 'input':
      return <UniversalInputScreen onClose={onClose} />;
    case 'scan':
      return <DailyScanScreen onClose={onClose} />;
    case 'dev':
      return <DevPanel onClose={onClose} />;
    default: {
      const slug = pageSlugOf(overlay);
      return slug ? <PageReader slug={slug} onClose={onClose} /> : null;
    }
  }
}

/* --- Navigazione persistente (§11) ----------------------------------------- */

function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const items: { id: Tab; label: string; icon: 'mon' | 'me' | 'scan' | 'mindline' }[] = [
    { id: 'mon', label: t.nav.mon, icon: 'mon' },
    { id: 'me', label: t.nav.me, icon: 'me' },
    // 🔶 v1.8 §13 promuove il calendario a superficie primaria.
    { id: 'calendar', label: t.nav.calendar, icon: 'scan' },
    { id: 'mindline', label: t.nav.mindline, icon: 'mindline' },
  ];

  return (
    <nav className="tabbar" aria-label="Navigazione principale">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="tabbar__item"
          aria-current={tab === item.id ? 'page' : undefined}
          onClick={() => {
            haptic('tick');
            onChange(item.id);
          }}
        >
          <Icon name={item.icon} size={20} strokeWidth={2} />
          {item.label}
        </button>
      ))}
    </nav>
  );
}

/* --- Barra di stato -------------------------------------------------------- */

function StatusBar({ showDev, onOpenDev }: { showDev: boolean; onOpenDev: () => void }) {
  const day = useApp((s) => s.day);
  const sync = useApp((s) => s.progression.sync.lifetime);
  const inForm = useApp((s) => s.progression.sync.inForm);
  const phase = useApp((s) => s.phase);

  /* 🔷 v1.14 — «VINZ.MON» in alto non serviva: sei dentro l'app, sai dove sei,
     e quel nome rubava metà barra alla sola cosa che cambia. Il giorno resta;
     il SYNC diventa una barra che si riempie, perché un numero che sale non
     dice quanto manca — e quanto manca è l'unica domanda che quel dato
     risponde. */
  const target = phase === 'incubation' ? PROGRESSION.incubationSyncDays : PROGRESSION.formEvolutionAt;
  const have = phase === 'incubation' ? sync : inForm;
  const progress = Math.min(1, have / target);

  return (
    <div className="proto-statusbar t-micro">
      <span className="proto-statusbar__day">
        {t.common.day} {day}
      </span>

      <span
        className="proto-statusbar__sync"
        role="progressbar"
        aria-label={`${t.common.sync} — ${have} di ${target}`}
        aria-valuenow={have}
        aria-valuemax={target}
      >
        <span className="proto-statusbar__syncfill" style={{ width: `${progress * 100}%` }} />
      </span>

      <span className="proto-statusbar__right">
        <span className="proto-statusbar__count">
          {have}/{target}
        </span>
        {/* Il trigger DEV sta qui e non fluttuante sopra la schermata:
            in overlay senza tab bar copriva il contenuto. */}
        {showDev && (
          <button
            type="button"
            className="devtrigger"
            onClick={onOpenDev}
            aria-label="Apri il pannello sviluppatore"
          >
            DEV
          </button>
        )}
      </span>
    </div>
  );
}
