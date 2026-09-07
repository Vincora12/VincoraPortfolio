/* ============================================================================
   Vinz.mon_v2 — LA SHELL

   🔒 STESSA SHELL, STESSA BARRA. `TabBar`, `MonTab`, `MeTab`, `OverlayScreen`
   e `TodayChecklistScreen` sono importati dalla Current, non ricopiati: MON, ME
   e SYNC in V2 sono letteralmente le stesse schermate, sugli stessi dati, con
   la stessa barra di navigazione. L'unica cosa che V2 sostituisce è la CHAT.

   ⚠️ QUESTO FILE NON MODIFICA LA CURRENT. Importa e basta. L'unico ritocco che
   `App.tsx` ha ricevuto è una parola — `export` davanti a `OverlayScreen` — e
   nessun comportamento della versione attuale cambia.

   🔷 L'ONBOARDING RESTA DELLA CURRENT. Se il salvataggio non è ancora in fase
   `live` (uovo, scansione, incubazione), V2 non ripropone quel percorso: lo
   dice e rimanda alla versione attuale. Duplicare la macchina delle fasi
   servirebbe solo a farla divergere.
   ========================================================================= */

import { useState } from 'react';

import { MeTab, MonTab, OverlayScreen, TabBar, type MeView, type MonView, type Overlay, type Tab } from '@/App';
import { TodayChecklistScreen } from '@/screens/TodayChecklist';
import { useApp } from '@/state/store';

import { V2Chat } from './ui/ChatView';
import './v2.css';

export function VinzV2App() {
  const phase = useApp((state) => state.phase);
  const [tab, setTab] = useState<Tab>('chat');
  const [monView, setMonView] = useState<MonView>('mon');
  const [meView, setMeView] = useState<MeView>('me');
  const [overlay, setOverlay] = useState<Overlay>(null);

  const live = phase === 'live' && !overlay;

  return (
    <div className="proto-stage">
      <div className={`proto-frame v2app ${live ? 'has-tabbar' : ''}`}>
      {overlay ? (
        <OverlayScreen overlay={overlay} onClose={() => setOverlay(null)} onGo={setOverlay} />
      ) : phase !== 'live' ? (
        <main className="v2gate">
          <p className="v2gate__title">Vinz.mon_v2</p>
          <p className="v2gate__text">
            Questo salvataggio è ancora nella fase «{phase}». L'avvio — uovo, scansione, incubazione — resta
            nella versione attuale: aprila dal selettore, completa il percorso e torna qui.
          </p>
        </main>
      ) : (
        <>
          {/* La chat resta montata anche quando guardi un'altra scheda: uscire
              e rientrare non deve ricostruire la conversazione da zero. */}
          <div className={`v2app__chat ${tab === 'chat' ? '' : 'v2app__chat--hidden'}`}>
            <V2Chat />
          </div>
          {tab === 'mon' && (
            <MonTab
              view={monView}
              onView={setMonView}
              onGo={setOverlay}
              onEnterChat={() => setTab('chat')}
              onDiscussInsight={() => setTab('chat')}
            />
          )}
          {tab === 'me' && <MeTab view={meView} onView={setMeView} onGo={setOverlay} />}
          {tab === 'today' && <TodayChecklistScreen />}
        </>
      )}

      {live && <TabBar tab={tab} onChange={setTab} />}
      </div>
    </div>
  );
}
