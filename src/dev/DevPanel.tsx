/* ============================================================================
   DEV://VINZ.MON (§20.1)

   🔒 LOCKED (§20) — strato di simulazione per sviluppatori, capace di
   bypassare tempo reale, integrazioni non disponibili e chiamate API mancanti
   SENZA cambiare il modello di prodotto rivolto al giocatore.

   🔒 §26 — "The player-facing UI never exposes raw dev controls unless dev
   mode is enabled." Questo pannello è raggiungibile solo con `?dev=1`.

   Contiene esattamente le voci di §20.1, nell'ordine della spec.
   ========================================================================= */

import { useState } from 'react';
import { FolderTabs, IconButton } from '../system/components';
import { buildLabel } from '../system/build';
import { CatalogSection } from './CatalogSection';
import { BioSection } from './BioSection';
import { ResolverSection } from './ResolverSection';
import { ModelsSection } from './ModelsSection';
import { TeachSection } from './TeachSection';
import { DesignTest } from './DesignTest';
import { PromptPreview } from './PromptPreview';
import { VoiceSection } from './VoiceSection';
import { CostSection } from './CostSection';
import { MemorySection } from './MemorySection';
import { MoodSection } from './MoodSection';
import { RaritySection } from './RaritySection';
import { ToolsSection } from './ToolsSection';
/* 🔒 Le sette sezioni che stavano QUI DENTRO adesso stanno in `sections.tsx`,
   e non per ordine: VINZ.LAB deve poter montare LE STESSE, non delle copie.
   Vedi l'intestazione di quel file. */
import {
  StartSection,
  TimeSection,
  SignalsSection,
  MindlineSection,
  GenerateSection,
  AssetsSection,
  ProgressionSection,
} from './sections';

type DevTab =
  | 'time'
  | 'signals'
  | 'mindline'
  | 'generate'
  | 'bio'
  | 'resolver'
  | 'teach'
  | 'voice'
  | 'prompt'
  | 'assets'
  | 'progression'
  | 'cost'
  | 'models'
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
      { id: 'resolver', label: 'RESOLVER' },
      /* 🔷 «Metti una chat con lui, così gli insegno io.» Accanto a RESOLVER
         perché è lo stesso interlocutore, e separata perché è un'altra cosa:
         là si chiede un prompt per la creatura di adesso, qui si cambia come
         verranno risolte tutte quelle dopo. */
      { id: 'teach', label: 'INSEGNA' },
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
  {
    id: 'conti',
    label: 'SPESA',
    tabs: [
      { id: 'cost', label: 'COSTI' },
      /* 🔷 «La UI deve farmi vedere chiaramente quale AI serve quale step.»
         Sta sotto SPESA e non sotto VOCE perché la domanda che ci porta è
         «quanto costa e quanto ci mette», non «come parla». */
      { id: 'models', label: 'AI / MODELLI' },
    ],
  },
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

  /* 🔷 «Il dev in alto è ancora su sfondo bianco, deve essere tutto su nero.»
     `.dev` sfondava su `var(--white)`, che senza un campo d'inchiostro
     invertito resta il bianco vero di `:root`. Le altre schermate a campo
     nero (Incubation, Encounter, MindlineMap…) non ridefiniscono i colori a
     mano: montano `data-field="ink"`, che inverte l'intero set di token
     (bianco↔inchiostro, hairline, muted) in un colpo solo — stesso
     meccanismo, non uno nuovo. */
  return (
    <div className="screen dev" data-field="ink">
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
        {inGroup && tab === 'generate' && <GenerateSection onClose={onClose} />}
        {inGroup && tab === 'bio' && <BioSection />}
        {inGroup && tab === 'resolver' && <ResolverSection />}
        {inGroup && tab === 'teach' && <TeachSection />}
        {inGroup && tab === 'voice' && <VoiceSection />}
        {inGroup && tab === 'prompt' && <PromptPreview />}
        {inGroup && tab === 'assets' && <AssetsSection />}
        {inGroup && tab === 'progression' && <ProgressionSection />}
        {inGroup && tab === 'cost' && <CostSection />}
        {inGroup && tab === 'models' && <ModelsSection />}
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
