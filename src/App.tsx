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
import { useApp, type Phase } from './state/store';
import { applyPaletteDna } from './engine/colorDna';
import { preloadMonAssets } from './assets-pipeline/assetStore';
import { Icon } from './system/Icon';
import { haptic } from './system/haptics';
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
import { MindlineMapScreen } from './screens/MindlineMap';
import { CalendarScreen } from './screens/SyncCalendar';
import { HeritageDnaScreen } from './screens/HeritageDna';
import { HistoryScreen } from './screens/History';
import { DailyScanScreen } from './screens/DailyScan';
import { DevPanel } from './dev/DevPanel';

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
  | 'dev';

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

  const goTab = (next: Tab) => {
    if (next === 'mon') setMonView('creature');
    setTab(next);
  };

  // §10.2 — cambiare .mon ritematizza gli accenti senza toccare l'architettura.
  useEffect(() => {
    applyPaletteDna(paletteDna);
  }, [paletteDna]);

  // Gli asset importati vivono in IndexedDB: vanno ricaricati a ogni avvio.
  useEffect(() => {
    if (activeMonName) void preloadMonAssets(activeMonName);
  }, [activeMonName]);

  // §26 — la dev mode si apre solo di proposito: ?dev=1 nell'indirizzo.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('dev') === '1') {
      setDev({ enabled: true });
    }
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

  return (
    <div className="proto-stage">
      <div className="proto-frame" data-field={inkField ? 'ink' : undefined}>
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
        {phase === 'live' && !overlay && <TabBar tab={tab} onChange={goTab} />}
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
          return <MeOverviewScreen />;
        case 'calendar':
          return <CalendarScreen onGo={onGo} />;
        case 'mindline':
          return <MindlineMapScreen onGo={onGo} />;
      }
  }
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

  return (
    <div className="proto-statusbar t-micro">
      <span>VINZ.MON</span>
      <span className="proto-statusbar__right">
        <span>
          {t.common.day} {day} · {sync} {t.common.sync}
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
