/* ============================================================================
   SHELL DEL PROTOTIPO

   Due livelli di navigazione:
   • FASI — superfici che cambiano lo stato del sistema (incubazione, incontro,
     shift, evoluzione, branch). Occupano tutto lo schermo e non hanno tab.
   • LIVE — la navigazione persistente MON / ME / MINDLINE di §11, più le
     schermate di consultazione aperte in overlay.

   §26 — i controlli DEV non compaiono mai senza dev mode attiva.
   ========================================================================= */

import { lazy, Suspense, useEffect, useState, type ComponentProps } from 'react';
import {
  useApp,
  type Phase,
  syncWithServer,
  pullIngested,
  pullLessons,
  maybeSpeakFirst,
  scheduleRemoteSave,
  stepModel,
} from './state/store';
import { applyPaletteDna } from './engine/colorDna';
import { applySkin } from './engine/skin';
import { applyLayout } from './engine/layout';
import { preloadMonAssets, syncAssetsWithServer } from './assets-pipeline/assetStore';
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
import { UniversalInputScreen } from './screens/UniversalInput';
import { MeOverviewScreen } from './screens/MeOverview';
import { TodayChecklistScreen } from './screens/TodayChecklist';
import { MindlineShiftScreen } from './screens/MindlineShift';
import { EvolutionScreen } from './screens/Evolution';
import { NewBranchScreen } from './screens/NewBranch';
import { SpecimenProfileScreen } from './screens/SpecimenProfile';
import { DexScreen } from './screens/Dex';
import { MindlineMapScreen } from './screens/MindlineMap';
import { ActivateScreen } from './screens/Activate';
import { HeritageDnaScreen } from './screens/HeritageDna';
import { HistoryScreen } from './screens/History';
import { DailyScanScreen } from './screens/DailyScan';
import { DevPanel } from './dev/DevPanel';
import { PageReader } from './screens/PageReader';
import type { ToolUse } from './ai/tools';
const IntegratedChat = lazy(() => import('./assistant-original/IntegratedChat').then((module) => ({ default: module.IntegratedChat })));

const runChatTool = (use: ToolUse) => useApp.getState().runMonTool(use);
const toyRefreshes = new Set<string>();

function LazyChat(props: ComponentProps<typeof IntegratedChat>) {
  return (
    <Suspense fallback={<div className="brain-loader" aria-label="Apertura chat"><strong>VINZ.MON</strong><span /></div>}>
      <IntegratedChat {...props} />
    </Suspense>
  );
}

/* ============================================================================
   🔷 «Il nav sotto deve avere prima la chat — appena entri c'è la chat aperta
      — poi al centro il mon, e nel mon metti altre tab con la mind.map e il
      mind.dex; e poi c'è ME, con anche i giorni dentro.»

   🔶 DA QUATTRO A TRE, e non è una potatura: è un cambio di gerarchia.

   Prima la barra elencava quattro POSTI allo stesso livello — MON, ME, GIORNI,
   MINDLINE — e il posto dove si passa il tempo, la conversazione, non c'era
   nemmeno: ci si arrivava da dentro MON, con un pulsante. L'app diceva di
   essere «companion-first» e faceva della chat una sotto-vista.

   Adesso la barra elenca tre RELAZIONI:
     CHAT   parlare con lui        ← ed è quello che è aperto quando entri
     MON    chi è, e da dove viene ← con dentro mind.map, mind.dex, mind.social
     ME     come sto io            ← con dentro i giorni

   🔒 Niente è stato tolto. Le quattro schermate di prima ci sono tutte: due
   sono scese di un livello, sotto la voce di cui parlano. La mind.map racconta
   le forme del .mon, quindi sta in MON; il calendario racconta i miei giorni,
   quindi sta in ME.
   ========================================================================= */
export type Tab = 'chat' | 'mon' | 'me' | 'today';

/** Le viste dentro MON. La prima è la creatura. */
export type MonView = 'mon' | 'map' | 'dex';

/** Le viste dentro ME. La prima sono i numeri di oggi. */
export type MeView = 'me' | 'calendar';
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
  /* 🔷 §19.5 — l'attivazione guidata. Sta fra gli overlay e non in DEV: è la
     prima cosa che si fa, e DEV è l'ultimo posto dove uno la cercherebbe. */
  | 'activate'
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
  const voiceModel = useApp((s) => s.voiceModel);
  const setVoiceModel = useApp((s) => s.setVoiceModel);
  const setDev = useApp((s) => s.setDev);
  const resumeFormEvolution = useApp((s) => s.resumeFormEvolution);
  const evolutionJob = useApp((s) => s.evolutionJob);
  const token = useApp((s) => s.token);

  useEffect(() => {
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js');
  }, []);

  useEffect(() => {
    window.addEventListener('vinzmon-health-journal', scheduleRemoteSave);
    return () => window.removeEventListener('vinzmon-health-journal', scheduleRemoteSave);
  }, []);

  /* Se l'app era chiusa, il server ha continuato. Al rientro riprendiamo il
     job persistente e scarichiamo gli asset già completati. */
  useEffect(() => {
    resumeFormEvolution();
  }, [resumeFormEvolution, evolutionJob?.serverJobId, evolutionJob?.status]);

  /* Pipeline Toy v2: le prime generazioni potevano conservare il rendering
     CEL pur essendo archiviate nello slot Toy. Si corregge una volta sola,
     usando il Master esistente e senza ricreare evoluzione, doodle o sticker. */
  useEffect(() => {
    if (!token || !activeMonName || evolutionJob?.status === 'running') return;
    const record = useApp.getState().mons[activeMonName];
    if (!record || record.data.asset_manifest_status.character_master !== 'resolved') return;
    const migrationKey = `vinzmon:toy-pipeline-v2:${activeMonName}`;
    if (localStorage.getItem(migrationKey) === 'ready' || toyRefreshes.has(activeMonName)) return;
    toyRefreshes.add(activeMonName);
    void import('./assets-pipeline/remoteGeneration')
      .then(({ refreshToyAsset }) => refreshToyAsset(token, record, stepModel('image')))
      .then(() => localStorage.setItem(migrationKey, 'ready'))
      .catch((error) => {
        toyRefreshes.delete(activeMonName);
        console.warn('[toy] aggiornamento automatico non riuscito:', error);
      });
  }, [activeMonName, evolutionJob?.status, token]);

  /* 🔷 «Appena entri c'è la chat aperta.» */
  const [tab, setTab] = useState<Tab>('chat');
  const [overlay, setOverlay] = useState<Overlay>(null);

  /* 🔶 QUESTO STATO DICEVA «creatura o chat». Non serve più a quello: la chat
     è una tab sua. Adesso dice quale delle quattro viste di MON stai
     guardando, e la prima è sempre la creatura.

     🔒 STA QUI E NON DENTRO `MonTab` per una ragione precisa: il campo nero
     dipende da questa scelta — la mind.map si guarda su fondo scuro — e il
     campo nero lo decide la cornice, che sta a questo livello. Uno stato
     chiuso dentro la tab obbligherebbe a rimbalzarlo su, che è lo stesso
     stato con un giro in più.

     Si riparte dalla creatura al primo avvio, a ogni cambio di fase (quando
     l'uovo si schiude, quello che ti aspetta non è più lo stesso) e ogni volta
     che si rientra nella tab. */
  const [monView, setMonView] = useState<MonView>('mon');
  const [meView, setMeView] = useState<MeView>('me');
  /* V1: la Chat è sempre raggiungibile, anche prima di configurare il Game. */
  const [assistantOpen, setAssistantOpen] = useState(false);

  /* Subito dopo HATCH si entra nella sola superficie che può essere vera in
     quel momento: la soglia di nascita. Non lasciamo che la tab iniziale CHAT
     faccia sembrare che il comando non abbia funzionato. Dopo questo primo
     ingresso la navigazione resta libera mentre il lavoro continua. */
  useEffect(() => {
    if (phase !== 'live' || evolutionJob?.kind !== 'hatch') return;
    setTab('mon');
    setMonView('mon');
  }, [phase, evolutionJob?.kind]);

  useEffect(() => {
    const openChat = () => { setAssistantOpen(false); setOverlay(null); setTab('chat'); };
    window.addEventListener('vinzmon-open-chat', openChat);
    return () => window.removeEventListener('vinzmon-open-chat', openChat);
  }, []);

  /* ⚠️ L'INCUBAZIONE HA UNA PORTA SUA, e non può usare le tab.

     🔴 L'avevo dimenticato riordinando la barra, e l'incubazione si era
     bloccata: il vecchio `monView` faceva due lavori — quale vista di MON, e
     «uovo o conversazione con l'uovo» — e nel separarli mi ero portato dietro
     solo il primo. Toccare la porta non faceva più niente, perché la barra in
     quei sette giorni non c'è e non c'è nessuna tab dove andare.

     🔒 Quindi resta un interruttore suo, che vale SOLO in incubazione: guardo
     l'uovo, oppure gli sto parlando. */
  const [onEgg, setOnEgg] = useState(true);

  useEffect(() => {
    setMonView('mon');
    setMeView('me');
    setOnEgg(true);
  }, [phase]);

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
    /* Rientrare in una tab la riporta alla sua prima vista: una tab che si
       riapre dove l'avevi lasciata sembra non aver risposto al tocco. */
    if (next === 'mon') setMonView('mon');
    if (next === 'me') setMeView('me');
    setOverlay(null);
    setTab(next);
  };

  // §10.2 — cambiare .mon ritematizza gli accenti senza toccare l'architettura.
  useEffect(() => {
    applyPaletteDna(paletteDna);
  }, [paletteDna]);

  /* 🔷 §10 — L'ASPETTO SCELTO PARLANDO CON LUI.

     ⚠️ E VA RIMESSO A OGNI AVVIO, non solo quando cambia. La pelle vive nello
     stato salvato; i token CSS no — quelli sono attributi di un elemento che
     al ricaricamento nasce pulito. Senza questa riga una modifica sparirebbe
     alla prima riapertura e sembrerebbe che non l'avesse fatta.

     🔒 Sta DOPO la palette e non prima: il Color DNA scrive `--char-*`, la
     pelle scrive `--white`, `--ink` e compagnia. Non si toccano — e l'ordine
     lo dice comunque, così resta vero anche se un giorno si sovrapponessero. */
  const skin = useApp((s) => s.skin);
  useEffect(() => {
    applySkin(skin);
  }, [skin]);

  /* §13 — i pezzi nascosti e spostati. Stessa ragione della pelle: le regole
     vivono in un tag di stile che al ricaricamento non c'è. */
  const layout = useApp((s) => s.layout);
  useEffect(() => {
    applyLayout(layout);
  }, [layout]);

  /* ⚠️ LA VIA DI FUGA, E NON È PARANOIA.

     Il catalogo è chiuso e i valori sono validati, ma resta una combinazione
     che nessuna validazione può escludere: inchiostro e sfondo dello stesso
     colore. Due modifiche legittime prese una alla volta, e l'app diventa
     illeggibile — compreso il pulsante DEV che servirebbe per rimetterla a
     posto, e compreso il campo per dirglielo.

     🔒 `?aspetto=reset` non passa dalla UI: si scrive nella barra
     dell'indirizzo, che funziona anche quando lo schermo è bianco su bianco.
     È l'unico comando dell'app che non ha bisogno di vedere l'app.

     🔶 E ADESSO RIMETTE ANCHE I PEZZI. Da quando si possono nascondere degli
     elementi, «non si vede niente» ha due cause possibili — un colore o un
     pezzo sparito — e chi scrive quell'indirizzo non sa quale delle due gli
     è capitata. Una via di fuga che ne ripara solo una non è una via di
     fuga. */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('aspetto') !== 'reset') return;
    useApp.getState().resetSkin();
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  /* Il sigillo corrente resta nella scheda del browser. L’icona installata
     sulla Home è invece il marchio VINZ.MON statico fornito dall’utente: non
     deve cambiare quando evolve la creatura. */
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
      const token = useApp.getState().token;
      if (token) await syncAssetsWithServer(token);

      /* 🔴 «Se modifico un valore dal lab, va sul server e si modifica anche
         in VINZ.MON?» — TOKENS, CATALOGHI e i pesi degli assi vivono in tre
         chiavi a parte da questo stato di gioco, e VINZ.LAB — installato
         come icona sua — non condivide più il `localStorage` di VINZ.MON.
         Le tre chiavi ora si scambiano anche dal server (stesso token): qui
         si scarica quello che il lab ha eventualmente cambiato, e si
         riapplica ai CSS — a differenza del lab, qui i nomi sono quelli
         veri (`--ink`, `--muted`...) e vanno DAVVERO applicati. */
      const [{ pullTokenOverridesFromServer, applyTokenOverrides }, { pullCatalogFromServer }, { pullWeightsFromServer }] =
        await Promise.all([
          import('./engine/designTokens'),
          import('./engine/catalogTuning'),
          import('./engine/axisTuning'),
        ]);
      await Promise.all([pullTokenOverridesFromServer(), pullCatalogFromServer(), pullWeightsFromServer()]);
      applyTokenOverrides();

      /* Dopo il salvataggio, non prima: se le due copie divergono si prende
         quella buona e POI ci si applica sopra quello che le Shortcut hanno
         lasciato. Al contrario, i dati della notte finirebbero su uno stato
         che sta per essere sostituito. */
      const applied = await pullIngested();
      if (applied > 0) console.info(`[sync] ${applied} segnali dalle scorciatoie`);

      /* ⚠️ LE LEZIONI HANNO UN GIRO LORO, e va fatto anche quando il
         salvataggio della partita è stato rifiutato.

         🔒 `syncWithServer` è arbitrato dal giorno di gioco: dopo un
         RICOMINCIA DA CAPO il server ha una copia più avanti e vince lui.
         Le lezioni non c'entrano niente con quella contesa — non appartengono
         a nessuna partita — e infatti stanno in una chiave separata, che
         nessun reset può far tornare indietro. */
      void pullLessons();

      /* 🔷 v1.14 §13.10 — e solo ALLA FINE il messaggio spontaneo, perché
         alcune delle cose che potrebbe dire dipendono dai dati appena
         arrivati: «la giornata è quasi chiusa» ha senso solo dopo aver
         guardato cosa hanno lasciato le Shortcut stanotte. */
      maybeSpeakFirst();
    });
  }, [token]);

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
  /* 🔶 ERA ANCHE LA HOME DI MON, e adesso non più: quella la rende `MonTab`,
     come prima delle sue quattro viste. Qui resta solo l'INCUBAZIONE, che non
     è una tab — è una fase, senza barra sotto e senza niente accanto. */
  const onCreature = phase === 'incubation' && onEgg;

  /* Il board mostra anche la MINDLINE su campo nero, non solo le fasi evento.

     🔶 E LA HOME DEL .MON NE È USCITA. Qui c'era `onCreature ||`, cioè: ovunque
     si veda la creatura, campo nero. Era una regola presa quando la creatura
     era un disegno nostro fatto per il nero.

     🔷 «È ancora nera questa schermata.»

     Il character master esce su fondo chiaro e con lo sfondo trasparente: sul
     nero se ne guardano i contorni appoggiati su una base per cui non sono
     stati disegnati, e si giudica male una creatura che invece è giusta. La
     home è il posto dove la si guarda più di ogni altro, quindi è il posto
     dove sbagliare fondo costa di più.

     🔒 L'INCUBAZIONE RESTA NERA, e non per dimenticanza: è in `INK_PHASES`.
     Lì non c'è nessun master da guardare — c'è un uovo, ed è un evento. */
  const inkField =
    INK_PHASES.includes(phase) ||
    overlay === 'dev' ||
    /* 🔶 Era `tab === 'mindline'`, che non esiste più. La DECISIONE non è
       cambiata: le tre viste d'archivio si guardano su campo nero, la
       creatura no. Sono scese dentro MON, quindi la condizione le segue. */
    /* La MIND.MAP resta una superficie scura di percorso. Il MIND.DEX invece
       è uno scaffale ottico bianco: non deve ereditare il campo nero solo
       perché vive accanto alla mappa. */
    (phase === 'live' && tab === 'mon' && monView === 'map' && !overlay);

  // Con la tab bar in fondo, il margine di sistema lo prende lei: il composer
  // non deve aggiungere il suo, o resterebbe uno spazio vuoto doppio.
  //
  // 🔷 «Il nav deve esserci ma sparire quando chatto.» Non è una condizione di
  // React: dipende dal FOCUS del campo di scrittura, che cambia decine di
  // volte senza che nessuno stato si muova. Sta in CSS — `base.css`, la regola
  // `:has(...:focus)` — così la barra c'è mentre leggi la conversazione e se
  // ne va quando sale la tastiera, senza un render in mezzo.
  const hasTabBar = phase === 'live' && overlay !== 'dev' && overlay !== 'activate';

  return (
    <div className="proto-stage">
      <div
        className={`proto-frame ${hasTabBar ? 'has-tabbar' : ''}`}
        data-field={inkField ? 'ink' : undefined}
      >
        {!assistantOpen && (phase !== 'live' || tab === 'mon') && (
          <StatusBar
            showDev={devEnabled && overlay !== 'dev'}
            onOpenDev={() => setOverlay('dev')}
            onActivate={() => setOverlay('activate')}
            assistantOpen={assistantOpen}
            onToggleAssistant={() => setAssistantOpen((open) => !open)}
          />
        )}

        {/* ⚠️ L'ordine conta: l'ingresso stava PRIMA dell'overlay, quindi con
            la splash aperta il pannello DEV si apriva sotto e non si vedeva.
            Un overlay è una navigazione esplicita e vince sempre su un
            saluto. */}
        {overlay ? (
          <OverlayScreen overlay={overlay} onClose={() => setOverlay(null)} onGo={setOverlay} />
        ) : assistantOpen ? (
          <LazyChat runTool={runChatTool} voiceModel={voiceModel} onModelChange={setVoiceModel} />
        ) : phase === 'live' ? (
          <>
            <div className={`live-chat ${tab === 'chat' ? '' : 'live-chat--hidden'}`}>
              <LazyChat runTool={runChatTool} voiceModel={voiceModel} onModelChange={setVoiceModel} />
            </div>
            {tab !== 'chat' && (
              <PhaseScreen
                phase={phase}
                tab={tab}
                monView={monView}
                meView={meView}
                onMonView={setMonView}
                onMeView={setMeView}
                onGo={setOverlay}
                onEnterChat={() => goTab('chat')}
              />
            )}
          </>
        ) : onCreature ? (
          <SplashScreen onEnter={() => setOnEgg(false)} />
        ) : (
          <PhaseScreen
            phase={phase}
            tab={tab}
            monView={monView}
            meView={meView}
            onMonView={setMonView}
            onMeView={setMeView}
            onGo={setOverlay}
            onEnterChat={() => goTab('chat')}
          />
        )}

        {/* 🔷 La barra resta anche sulla creatura: è una tab, non una
            schermata che copre tutto. */}
        {hasTabBar && <TabBar tab={tab} onChange={goTab} />}
      </div>
    </div>
  );
}

/* --- Fasi ------------------------------------------------------------------ */

function PhaseScreen({
  phase,
  tab,
  monView,
  meView,
  onMonView,
  onMeView,
  onGo,
  onEnterChat,
}: {
  phase: Phase;
  tab: Tab;
  monView: MonView;
  meView: MeView;
  onMonView: (v: MonView) => void;
  onMeView: (v: MeView) => void;
  onGo: (o: Overlay) => void;
  onEnterChat: () => void;
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
        case 'chat':
          return <LazyChat runTool={runChatTool} />;
        case 'mon':
          return <MonTab view={monView} onView={onMonView} onGo={onGo} onEnterChat={onEnterChat} />;
        case 'me':
          return <MeTab view={meView} onView={onMeView} onGo={onGo} />;
        case 'today':
          return <TodayChecklistScreen />;
      }
  }
}

/* ============================================================================
   IL SELETTORE DI VISTA DENTRO UNA TAB

   🔶 ERA SCRITTO A MANO DENTRO L'ARCHIVIO, tre pulsanti copiati uno dall'altro.
   Adesso serve in due posti — dentro MON e dentro ME — e due copie di tre
   pulsanti sono il modo in cui due schermate cominciano a comportarsi
   diversamente senza che nessuno l'abbia deciso.

   🔒 Le classi restano `archive__*`: sono già nel foglio di stile e già
   provate. Rinominarle sarebbe stato un secondo cambio, dentro un cambio già
   grosso, per guadagnare un nome più bello.
   ========================================================================= */

function ViewSwitch<V extends string>({
  label,
  view,
  onView,
  items,
}: {
  label: string;
  view: V;
  onView: (v: V) => void;
  items: { id: V; label: string; dot?: boolean }[];
}) {
  return (
    <div className="archive__switch" role="tablist" aria-label={label}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={view === item.id}
          className="archive__seg"
          onClick={() => {
            haptic('tick');
            onView(item.id);
          }}
        >
          {item.label}
          {item.dot && <span className="archive__dot" aria-hidden="true" />}
        </button>
      ))}
    </div>
  );
}

/* ============================================================================
   MON — CHI È, E DA DOVE VIENE

   🔷 «Al centro il mon, e nel mon metti altre tab con la mind.map e il
      mind.dex.»

   🔶 LE TRE VISTE D'ARCHIVIO ERANO UNA TAB A SÉ, in fondo alla barra. Erano
   già insieme fra loro per una ragione scritta allora (v1.14 §12.5): MIND.MAP
   e MIND.DEX rispondono a due domande diverse — «come sono arrivato qui» e
   «chi sono stato» — e fonderle farebbe leggere «ho collezionato dodici
   creature», che è il contrario di §33: una sola entità e le sue forme.

   Quella ragione regge ancora, e adesso ne dice una in più: se sono le forme
   di UNA creatura, il posto dove stanno è dentro quella creatura. Erano
   accanto a lei; adesso sono dentro.

   ⚠️ E CADE L'OBIEZIONE CHE LE TENEVA FUORI. Allora avevo scritto: «non
   meritano una QUINTA scheda in fondo, cinque voci su uno schermo da telefono
   sono cinque bersagli stretti». Vero allora, irrilevante adesso: le voci in
   fondo sono TRE, e queste non ne aggiungono nessuna — stanno dentro una.

   🔶 MIND.SOCIAL È USCITA, e questa volta è stata chiesta.

   🔷 «Vogliamo togliere un po' di cose che complicano il progetto e ora non
      servono? Tipo mindsocial togliamolo proprio: voglio cercare di farlo
      funzionare e poi aggiungo.»

   Era una funzione intera — post settimanali fra le forme vecchie, commenti,
   una chiamata AI sua — appesa a un'app la cui parte centrale, la
   conversazione, non è ancora affidabile. Non è stata tolta perché era
   sbagliata: è stata tolta perché non è il momento. Quando la chat regge, si
   rimette (è tutta in un commit solo, in fondo alla storia).
   ========================================================================= */

/* 🔒 ESPORTATA PER DESIGN.LAB, e non è un dettaglio di comodo: la regola del
   pacchetto dice «MOUNT REAL COMPONENTS — DO NOT COPY THE UI». Il laboratorio
   poteva rifare da sé lo switch a tre voci con dentro le tre schermate: sarebbe
   stata una copia, e il giorno dopo una copia vecchia. Esportare la vera
   costa una parola e toglie di mezzo l'unico modo in cui la preview poteva
   mentire. Il comportamento in produzione non cambia di niente. */
export function MonTab({
  view,
  onView,
  onGo,
  onEnterChat,
}: {
  view: MonView;
  onView: (v: MonView) => void;
  onGo: (o: Overlay) => void;
  onEnterChat: () => void;
}) {
  return (
    <div className="archive">
      <ViewSwitch
        label="Viste del .mon"
        view={view}
        onView={onView}
        items={[
          { id: 'mon', label: t.nav.mon },
          { id: 'map', label: t.archive.map },
          { id: 'dex', label: t.archive.dex },
        ]}
      />

      {view === 'mon' && <SplashScreen onEnter={onEnterChat} />}
      {view === 'map' && <MindlineMapScreen onGo={onGo} />}
      {view === 'dex' && <DexScreen onGo={onGo} onOpenMon={() => onView('mon')} />}
    </div>
  );
}

/* ============================================================================
   ME — COME STO IO

   🔷 «E poi c'è ME, con anche i giorni dentro.»

   🔒 Il calendario era una tab primaria per decisione di v1.8 §13. Scende, e
   la ragione è la stessa per cui allora era salito: dice quanto ti sei
   presentato, cioè una cosa su di TE. Sotto ME sta accanto ai numeri che
   parlano della stessa persona, invece che accanto alla creatura che non li
   ha prodotti.
   ========================================================================= */

/* 🔒 ESPORTATA PER DESIGN.LAB, come `MonTab`. Il corpo è quello nuovo: ME non
   ha più le sue due schede — i calendari sono scesi dentro dieta e sport — e
   `view`/`onView` restano nella firma perché chi la chiama non deve cambiare. */
export function MeTab({
  view: _view,
  onView: _onView,
  onGo,
}: {
  view: MeView;
  onView: (v: MeView) => void;
  onGo: (o: Overlay) => void;
}) {
  return (
    <div className="archive"><MeOverviewScreen onGo={onGo} /></div>
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
      return <DevPanel onClose={onClose} onGo={onGo} />;
    case 'activate':
      return <ActivateScreen onClose={onClose} />;
    default: {
      const slug = pageSlugOf(overlay);
      return slug ? <PageReader slug={slug} onClose={onClose} /> : null;
    }
  }
}

/* --- Navigazione persistente (§11) ----------------------------------------- */

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  /* 🔶 QUATTRO POSTI SONO DIVENTATI TRE RELAZIONI, e l'ordine è il messaggio:
     la conversazione è la PRIMA, non una cosa che si raggiunge da dentro un
     profilo. Il .mon sta al centro perché è il centro.

     🔶 v1.8 §13 aveva promosso il calendario a superficie primaria. Adesso
     scende dentro ME — non declassato, riavvicinato: dice quanto ti sei
     presentato, cioè una cosa su di te.

     🔒 Tre bersagli invece di quattro vuol dire tre bersagli più larghi, su
     uno schermo dove il dito è il puntatore. */
  const items: { id: Tab; label: string; activeLabel: string; icon: 'tell' | 'mon' | 'me' | 'clock' }[] = [
    { id: 'chat', label: t.nav.chat, activeLabel: 'CHAT', icon: 'tell' },
    { id: 'mon', label: t.nav.mon, activeLabel: 'VINZ.MON', icon: 'mon' },
    { id: 'me', label: t.nav.me, activeLabel: 'ME', icon: 'me' },
    { id: 'today', label: 'Controlla la giornata', activeLabel: 'OGGI', icon: 'clock' },
  ];

  return (
    <nav className="tabbar" aria-label="Navigazione principale">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="tabbar__item"
          aria-label={item.label}
          aria-current={tab === item.id ? 'page' : undefined}
          onClick={() => {
            haptic('tick');
            onChange(item.id);
          }}
        >
          <Icon name={item.icon} size={15} strokeWidth={2} />
          <span className="tabbar__label">{item.activeLabel}</span>
        </button>
      ))}
    </nav>
  );
}

/* --- Barra di stato -------------------------------------------------------- */

/**
 * Il pulsante che accende la voce, o niente se è già accesa.
 *
 * 🔒 Guarda il token e basta: è la sola condizione che l'app può controllare
 * da sola senza chiamare nessuno. Se il token c'è ma sul server manca una
 * chiave, il pulsante sparisce lo stesso e il problema lo racconta la
 * schermata — perché quello è uno stato in cui hai già fatto la procedura, e
 * riproportela a ogni apertura sarebbe darti dell'incapace.
 */
function ActivateChip({ onClick }: { onClick: () => void }) {
  const token = useApp((s) => s.token);
  if (token) return null;
  return (
    <button type="button" className="activatechip" onClick={onClick}>
      ATTIVA VINZ.MON
    </button>
  );
}

function StatusBar({
  showDev,
  onOpenDev,
  onActivate,
  assistantOpen,
  onToggleAssistant,
}: {
  showDev: boolean;
  onOpenDev: () => void;
  onActivate: () => void;
  assistantOpen: boolean;
  onToggleAssistant: () => void;
}) {
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
      <span className="proto-statusbar__day" data-pezzo="giorno">
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
        {/* 🔷 §19.5 — ATTIVA sta qui e sparisce quando è fatto. È l'unico
            pulsante dell'app che si toglie di mezzo da solo: finché la voce è
            spenta è la cosa più importante dello schermo, dopo non è più
            niente. Metterlo in DEV — dove sono finite tutte le altre cose di
            impianto — avrebbe voluto dire nasconderlo proprio a chi apre
            l'app per la prima volta. */}
        <ActivateChip onClick={onActivate} />
        {phase !== 'live' && (
          <button type="button" className="devtrigger" onClick={onToggleAssistant}>
            {assistantOpen ? 'GAME' : 'CHAT'}
          </button>
        )}
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
