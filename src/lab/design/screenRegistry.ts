/* ============================================================================
   LE SCHERMATE VERE, E DOVE ABITANO

   🔒 REGOLA DEL PACCHETTO: «DESIGN.LAB MUST MOUNT REAL VINZ.MON REACT
   COMPONENTS IN AN ISOLATED PREVIEW. DO NOT COPY THE UI.»

   Questa tabella è la parte che rende la regola verificabile: per ogni
   schermata dice QUALI FILE la disegnano davvero. Non è documentazione — è
   quello che il pannello mostra accanto alla preview, così quando si chiede
   una modifica si sa già dove finirà.

   ⚠️ IL PACCHETTO DI CODEX PUNTAVA A `src/assistant-original/*` per la CHAT.
   Quella cartella non esiste in questo repo e non è mai esistita: la chat è
   `src/screens/CompanionHome.tsx`. Un registro che elenca file inesistenti
   non è una svista di percorso — dice al modello di leggere il vuoto e
   inventare il resto. I percorsi qui sotto sono verificati uno per uno.
   ========================================================================= */

import type { DesignScreenId } from './types';

export type DesignScreenDefinition = {
  id: DesignScreenId;
  label: string;
  /** LIVE = ha la barra in fondo. PHASE = occupa tutto, senza barra (§11). */
  group: 'LIVE' | 'PHASE';
  source: string[];
  notes: string;
};

export const DESIGN_SCREENS: DesignScreenDefinition[] = [
  {
    id: 'chat',
    label: 'CHAT',
    group: 'LIVE',
    source: ['src/screens/CompanionHome.tsx', 'src/screens/screens.css'],
    notes:
      'La conversazione vera, con la TabBar vera. Il runtime resta quello di produzione ma in sola lettura: nessun messaggio inviato, nessuna scrittura.',
  },
  {
    id: 'mon',
    label: 'VINZ.MON',
    group: 'LIVE',
    source: ['src/App.tsx', 'src/screens/Splash.tsx', 'src/screens/screens.css'],
    notes: 'Il vero MonTab con dentro la vera SplashScreen. Istantanea dello store, in sola lettura.',
  },
  {
    id: 'mind-map',
    label: 'MIND.MAP',
    group: 'LIVE',
    source: ['src/App.tsx', 'src/screens/MindlineMap.tsx', 'src/screens/screens.css'],
    notes: 'Il vero MonTab sulla vista mappa, su campo nero come in produzione.',
  },
  {
    id: 'mind-dex',
    label: 'MIND.DEX',
    group: 'LIVE',
    source: ['src/App.tsx', 'src/screens/Dex.tsx', 'src/screens/screens.css'],
    notes: 'Il vero MonTab sulla vista dex, su campo nero come in produzione.',
  },
  {
    id: 'me',
    label: 'ME',
    group: 'LIVE',
    source: [
      'src/App.tsx',
      'src/screens/MeOverview.tsx',
      'src/screens/SyncCalendar.tsx',
      'src/screens/screens.css',
    ],
    notes:
      'Il vero MeTab: le sue schede ME / GIORNI restano vere e si toccano davvero, ma solo in INTERACT.',
  },
  {
    id: 'incubation',
    label: 'INCUBATION',
    group: 'PHASE',
    source: ['src/screens/Incubation.tsx', 'src/system/system.css'],
    notes: 'La fase vera, senza barra in fondo. In INSPECT nessun controllo esegue il suo click.',
  },
  {
    id: 'encounter',
    label: 'ENCOUNTER',
    group: 'PHASE',
    source: ['src/screens/Encounter.tsx', 'src/system/system.css'],
    notes: 'La rivelazione vera, senza barra in fondo, sul .mon attivo di adesso.',
  },
];

export const designScreen = (id: DesignScreenId) =>
  DESIGN_SCREENS.find((screen) => screen.id === id)!;
