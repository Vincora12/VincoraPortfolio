/* ============================================================================
   UNA SOLA SCHERMATA, VERA, DENTRO UN IFRAME

   🔒 «LAB TESTS / PREVIEWS / SIMULATIONS MUST NOT MUTATE PRODUCTION STATE OR
   REMOTE DATA.»

   ⚠️ PERCHÉ QUI NON C'È `<App/>`. `App.tsx` non è solo un contenitore: al
   montaggio fa partire la sincronizzazione col server, l'ingestione, il primo
   messaggio spontaneo del .mon, il precaricamento degli asset. Montare `App`
   dentro una preview vorrebbe dire che aprire il laboratorio SCRIVE — manda
   richieste, sposta il turno, può far parlare la creatura a vuoto. Quindi la
   preview monta le schermate vere senza il loro motore, e i guardiani
   (`installPreviewGuards`) chiudono la porta anche a quello che restasse.

   🔒 MA LA CORNICE È VERA. `proto-stage`, `proto-frame`, `data-field`,
   `has-tabbar` e la `TabBar` sono gli stessi di `App.tsx` — importati, non
   ricopiati. Il campo nero è la parte che si sbaglia più facilmente: una
   MIND.MAP su carta bianca non è la MIND.MAP, e una preview che mente sul
   colore di fondo è peggio di nessuna preview.
   ========================================================================= */

import { useState, type ReactNode } from 'react';
import type { DesignScreenId } from './types';
import { DesignInspectorBridge } from './DesignInspectorBridge';

import {
  MonTab,
  MeTab,
  TabBar,
  type MeView,
  type MonView,
  type Overlay,
  type Tab,
} from '../../App';
import { DesignChatPreview } from './DesignChatPreview';
import { IncubationScreen } from '../../screens/Incubation';
import { EncounterScreen } from '../../screens/Encounter';

/** Niente naviga, fuori dalla preview non c'è dove andare. */
const noGo: (o: Overlay) => void = () => {};
const noop = () => {};

export function DesignPreviewRoute({ screen }: { screen: DesignScreenId }) {
  /* Le schede interne restano vere e si toccano davvero: è la differenza fra
     guardare una schermata e provarla. In INSPECT il bridge annulla i click
     prima che arrivino qui, quindi lo stato non si muove comunque. */
  const [monView, setMonView] = useState<MonView>(
    screen === 'mind-map' ? 'map' : screen === 'mind-dex' ? 'dex' : 'mon',
  );
  const [meView, setMeView] = useState<MeView>('me');

  let content: ReactNode = null;
  let tab: Tab | null = null;

  /* ⚠️ IL CAMPO NERO SI CALCOLA COME IN `App.tsx`, non si dichiara nel
     registro. Dentro MON il colore dipende dalla VISTA — la creatura sta su
     carta, la mappa e il dex sul nero — e la vista qui si può cambiare col
     dito. Un valore fisso sarebbe stato giusto al primo render e sbagliato al
     secondo: è esattamente il bug per cui la home restò nera. */
  const inkField =
    screen === 'incubation' ||
    screen === 'encounter' ||
    ((screen === 'mon' || screen === 'mind-map' || screen === 'mind-dex') && monView !== 'mon');

  switch (screen) {
    case 'chat':
      content = <DesignChatPreview />;
      tab = 'chat';
      break;
    case 'mon':
    case 'mind-map':
    case 'mind-dex':
      content = (
        <MonTab view={monView} onView={setMonView} onGo={noGo} onEnterChat={noop} />
      );
      tab = 'mon';
      break;
    case 'me':
      content = <MeTab view={meView} onView={setMeView} onGo={noGo} />;
      tab = 'me';
      break;
    case 'incubation':
      content = <IncubationScreen onGo={noGo} />;
      break;
    case 'encounter':
      content = <EncounterScreen variant="first" />;
      break;
  }

  // Come in App.tsx: nella tab CHAT il nav sparisce, la conversazione prende
  // tutto lo spazio. La preview mente sulla cornice se qui resta diversa.
  const hasTabBar = tab !== null && tab !== 'chat';

  return (
    <div className="proto-stage designlab-preview-root">
      <div
        className={`proto-frame ${hasTabBar ? 'has-tabbar' : ''}`}
        data-field={inkField ? 'ink' : undefined}
      >
        {content}
        {hasTabBar && tab && <TabBar tab={tab} onChange={noop} />}
        <DesignInspectorBridge screen={screen} />
      </div>
    </div>
  );
}
