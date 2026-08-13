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

import { IncubationScreen } from './screens/Incubation';
import { EncounterScreen } from './screens/Encounter';
import { CompanionHomeScreen } from './screens/CompanionHome';
import { UniversalInputScreen } from './screens/UniversalInput';
import { MeOverviewScreen } from './screens/MeOverview';
import { MindlineShiftScreen } from './screens/MindlineShift';
import { EvolutionScreen } from './screens/Evolution';
import { NewBranchScreen } from './screens/NewBranch';
import { SpecimenProfileScreen } from './screens/SpecimenProfile';
import { BioFileScreen } from './screens/BioFile';
import { MindlineMapScreen } from './screens/MindlineMap';
import { HeritageDnaScreen } from './screens/HeritageDna';
import { MemoriesScreen } from './screens/Memories';
import { HistoryScreen } from './screens/History';
import { DailyScanScreen } from './screens/DailyScan';
import { DevPanel } from './dev/DevPanel';

export type Tab = 'mon' | 'me' | 'mindline';
export type Overlay =
  | null
  | 'specimen'
  | 'bio'
  | 'memories'
  | 'history'
  | 'heritage'
  | 'input'
  | 'scan'
  | 'dev';

/** Le fasi su campo nero, lette dal board. */
const INK_PHASES: Phase[] = ['incubation', 'first-encounter', 'new-encounter'];

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

  // Il board mostra anche la MINDLINE su campo nero, non solo le fasi evento.
  const inkField =
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

        {overlay ? (
          <OverlayScreen overlay={overlay} onClose={() => setOverlay(null)} onGo={setOverlay} />
        ) : (
          <PhaseScreen phase={phase} tab={tab} onGo={setOverlay} />
        )}

        {phase === 'live' && !overlay && <TabBar tab={tab} onChange={setTab} />}
      </div>
    </div>
  );
}

/* --- Fasi ------------------------------------------------------------------ */

function PhaseScreen({
  phase,
  tab,
  onGo,
}: {
  phase: Phase;
  tab: Tab;
  onGo: (o: Overlay) => void;
}) {
  switch (phase) {
    case 'incubation':
      return <IncubationScreen />;
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
          return <CompanionHomeScreen onGo={onGo} />;
        case 'me':
          return <MeOverviewScreen />;
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
    case 'bio':
      return <BioFileScreen onClose={onClose} />;
    case 'memories':
      return <MemoriesScreen onClose={onClose} />;
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
  const items: { id: Tab; label: string; icon: 'mon' | 'me' | 'mindline' }[] = [
    { id: 'mon', label: t.nav.mon, icon: 'mon' },
    { id: 'me', label: t.nav.me, icon: 'me' },
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
