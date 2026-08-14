/* ============================================================================
   TIPI DI ASSET CANONICI (§23)
   🔒 LOCKED — "The asset system distinguishes canonical character art,
   UI-derived crops and prototype-specific implementation assets."

   Qui vivono solo le DEFINIZIONI degli slot. La compilazione dei prompt sta
   in assets-pipeline/promptCompiler.ts, il manifest in
   assets-pipeline/manifest.ts, i file importati in assets-pipeline/assetStore.ts.
   ========================================================================= */

import type { AssetStatusMap, AssetType } from './types';

export interface AssetTypeDef {
  type: AssetType;
  /**
   * 🔶 v1.9 §23.2 — a che giro si genera. Non è cosmetico: un asset di stadio
   * 1 va prodotto ALLEGANDO l'immagine dello stadio 0 come riferimento, perché
   * un modello di immagini non tiene un personaggio identico partendo due
   * volte dallo stesso testo. La consistenza si ottiene passandogli la faccia,
   * non descrivendogliela meglio.
   */
  stage: 0 | 1 | 2;
  /** Asset la cui immagine va allegata al prompt. Vuoto solo per il master. */
  dependsOn: AssetType[];
  /** `asset_id` usato nel manifest (§24.4) e nel nome del file di prompt. */
  assetId: string;
  /** Indice del file di prompt nel pacchetto (§22.2). */
  promptFile: string;
  label: string;
  /** A cosa serve, in italiano, per la UI del prototipo. */
  purpose: string;
  /** Dove viene usato nel prodotto: alimenta `usage` nel manifest. */
  usage: string[];
}

/**
 * Gli OTTO tipi canonici, nell'ordine dei file di §22.2.
 * UI NODE PORTRAIT non è uno slot separato: §23 dice esplicitamente di
 * derivarlo dal Profile Portrait e di non creare asset ridondanti.
 */
export const ASSET_TYPES: readonly AssetTypeDef[] = [
  {
    type: 'character_master',
    stage: 0,
    dependsOn: [],
    assetId: 'master_01',
    promptFile: '01_CHARACTER_MASTER_PROMPT.txt',
    label: 'CHARACTER MASTER',
    purpose: 'Fonte di verità visiva. Riferimento di consistenza per ogni altro asset.',
    usage: ['companion-home', 'consistency-reference'],
  },
  {
    type: 'profile_portrait',
    stage: 1,
    dependsOn: ['character_master'],
    assetId: 'portrait_01',
    promptFile: '02_PROFILE_PORTRAIT_PROMPT.txt',
    label: 'PROFILE PORTRAIT',
    purpose: 'Ritratto generato apposta per profilo, memorie, notifiche e nodi. Mai un ritaglio.',
    usage: ['specimen-profile', 'memories', 'mindline-node', 'notifications'],
  },
  {
    type: 'bio_doodle',
    stage: 2,
    dependsOn: ['character_master'],
    assetId: 'doodle_01',
    promptFile: '03_BIO_DOODLE_PROMPT.txt',
    label: 'BIO DOODLE',
    purpose: 'Interpretazione da quaderno, usata SOLO in BIO / PERSONAL FILE. Non è un Appearance.',
    usage: ['bio-personal-file'],
  },
  {
    type: 'reaction_pack',
    stage: 1,
    dependsOn: ['character_master'],
    assetId: 'reactions_01',
    promptFile: '04_REACTION_PACK_PROMPT.txt',
    label: 'EXPRESSION SHEET',
    purpose:
      'Le sei espressioni canoniche, griglia 3×2. È quello che cambia in testa alla chat a ogni risposta.',
    usage: ['chat', 'companion-home', 'memories'],
  },
  {
    /* 🔶 v1.9 §23.1 — nuovo. Serve alla splash e alla testa della chat: senza
       un ciclo di riposo il .mon è un'illustrazione ferma, e la differenza fra
       «c'è» e «è disegnato» è tutta lì. */
    type: 'idle_animation',
    stage: 1,
    dependsOn: ['character_master'],
    assetId: 'idle_01',
    promptFile: '05_IDLE_ANIMATION_PROMPT.txt',
    label: 'IDLE ANIMATION',
    purpose: 'Ciclo di respiro a 6 frame. Schermata d’ingresso e presenza viva in chat.',
    usage: ['splash', 'chat-header', 'companion-home'],
  },
  {
    type: 'encounter_hero',
    stage: 1,
    dependsOn: ['character_master'],
    assetId: 'hero_01',
    promptFile: '06_ENCOUNTER_HERO_PROMPT.txt',
    label: 'ENCOUNTER HERO',
    purpose: 'Asset di rivelazione per FIRST ENCOUNTER / NEW ENCOUNTER.',
    usage: ['first-encounter', 'new-encounter'],
  },
];

/* ============================================================================
   🔷 v1.15 §23.5 — QUI C'ERA IL SIGILLO, ED È USCITO DALLA PIPELINE.

   Era il settimo asset: un marchio monocromo da far generare a un modello di
   immagini. Non è mai stato prodotto, e ripensandoci non deve esserlo.

   Un sigillo è esattamente il tipo di cosa in cui il codice batte un modello:

   • deve essere LEGGIBILE A 24px, e a «estremamente semplice» un modello di
     immagini risponde aggiungendo dettaglio, perché è quello che sa fare;
   • deve DERIVARE dai dati in modo verificabile — il codice può garantire che
     quelle punte vengano dalla Family, un modello può solo provarci;
   • deve ESISTERE DAL PRIMO GIORNO: compare nella Mindline, nel dossier, nel
     profilo, e uno slot vuoto lì sarebbe un buco permanente;
   • deve CAMBIARE CON LUI — una stirpe condivide l'inclinazione, e con il
     codice è una riga, con le immagini sono due generazioni da tenere
     coerenti.

   Quindi il sigillo resta un disegno del sito (`engine/sigil.ts`), e gli
   asset da generare scendono da sette a sei. Tutti e sei sono il personaggio;
   il sigillo era l'unico puramente geometrico, ed è per questo che è l'unico
   che si può togliere senza perdere niente.
   ========================================================================= */

export function assetTypeDef(type: AssetType): AssetTypeDef {
  const d = ASSET_TYPES.find((a) => a.type === type);
  if (!d) throw new Error(`Tipo di asset sconosciuto: ${type}`);
  return d;
}

/**
 * Mappa stato iniziale: ogni slot parte da `waiting`.
 * §21.2 — "A generated .mon is immediately valid as structured data even when
 * all visual asset slots are still empty."
 */
export function emptyAssetStatus(): AssetStatusMap {
  return ASSET_TYPES.reduce((acc, a) => {
    acc[a.type] = 'waiting';
    return acc;
  }, {} as AssetStatusMap);
}

/** Etichetta del segnaposto mostrata nella UI (§21.2). */
export function placeholderLabel(type: AssetType): string {
  const index = ASSET_TYPES.findIndex((a) => a.type === type) + 1;
  return `ASSET_${String(index).padStart(2, '0')} // WAITING FOR IMAGE`;
}


/* ============================================================================
   🔷 v1.11 §23.3 — QUI VIVEVA LA ROTAZIONE, e non c'è più.

   Otto frame per un giro completo del personaggio: era il singolo asset più
   caro del pacchetto, ed era anche il più difficile da ottenere — otto viste
   coerenti dello stesso soggetto sono la cosa che i modelli di immagini
   sbagliano per prima, molto prima di sbagliare un'espressione.

   In cambio dava un gesto che si usa una volta e poi mai più.

   L'IDLE fa lo stesso lavoro meglio e a metà prezzo: la creatura sulla
   schermata di casa dev'essere VIVA, non girevole. Quattro frame in
   ping-pong bastano, e non chiedono al modello nessuna coerenza rotazionale.

   Conto: 8 asset e 25 frame → 7 asset e 15 frame. Il 40% in meno da generare
   per ogni .mon, senza perdere niente che si guardasse davvero.
   ========================================================================= */


/* ============================================================================
   🔶 v1.9 §23.1 — EXPRESSION SHEET

   La chat mostra il .mon in testa e gli cambia faccia a ogni risposta. Perché
   funzioni servono espressioni **indicizzabili**: un «reaction pack» generico
   non si può interrogare, sei riquadri in posizione fissa sì.

   Perché sei e non sedici. I Mood di catalogo sono 16, ma sono l'identità
   della creatura, non il suo stato momentaneo: disegnarne sedici versioni
   consistenti è irrealistico e nessuno noterebbe la differenza fra due vicini.
   Sei coprono l'intero registro di una conversazione e restano disegnabili
   senza che la faccia scivoli fra un riquadro e l'altro.
   ========================================================================= */

export const EXPRESSIONS = ['NEUTRAL', 'WARM', 'AMUSED', 'ALERT', 'LOW', 'INTENSE'] as const;
export type Expression = (typeof EXPRESSIONS)[number];

export const EXPRESSION_SPEC = {
  frames: 6,
  columns: 3,
  rows: 2,
  /** L'ordine di lettura della griglia. L'app indicizza per posizione. */
  order: EXPRESSIONS,
  framing: 'bust',
  anchor: 'center',
  background: 'transparent',
} as const;

export const EXPRESSION_BRIEF: Record<Expression, string> = {
  NEUTRAL: 'presenza a riposo, sguardo diretto, nessuna emozione forte',
  WARM: 'aperto e vicino, tratti che si ammorbidiscono',
  AMUSED: 'divertito, ironico, un lato del volto più alto dell’altro',
  ALERT: 'attento, sorpreso o incuriosito, tutto il corpo che si orienta',
  LOW: 'spento, stanco o malinconico — senza pietismo e senza dramma',
  INTENSE: 'carico, determinato o teso, energia trattenuta',
};

/* --- IDLE ANIMATION (v1.9 §23.1) ------------------------------------------
   Un ciclo di respiro, non una posa. Sei frame bastano: sotto si vede lo
   scatto, sopra si disegna consistenza che nessuno percepisce.
   -------------------------------------------------------------------------- */

export const IDLE_SPEC = {
  frames: 4,
  columns: 4,
  rows: 1,
  /** Ping-pong: 4 frame diventano 6 passi percepiti senza disegnarne altri. */
  playback: 'ping-pong',
  fps: 8,
  anchor: 'bottom-center',
  background: 'transparent',
} as const;

/* ============================================================================
   🔶 v1.9 §23.2 — ORDINE DI PRODUZIONE

   Il conto, per ogni .mon:

     STADIO 0   1 immagine    CHARACTER MASTER          — solo testo
     STADIO 1   4 immagini    PORTRAIT · IDLE · EXPRESSIONS · HERO
     STADIO 2   2 immagini    BIO DOODLE · SIGIL

     = 8 generazioni, 25 frame disegnati
       (master 1 · portrait 1 · rotation 8 · idle 6 · espressioni 6 · hero 1
        · doodle 1 · sigil 1)

   La regola che rende il conto sensato: **dallo stadio 1 in poi il prompt va
   accompagnato dall'immagine dello stadio 0.** Un modello di immagini non
   riproduce lo stesso personaggio due volte partendo dallo stesso testo, per
   quanto il testo sia preciso — la consistenza si ottiene mostrandogli la
   faccia, non descrivendogliela meglio. È il motivo per cui il master esiste
   e per cui non si può generare in parallelo tutto insieme.

   Lo stadio 2 è a parte perché cambia medium: il doodle è un altro linguaggio
   (GB §12: è la BIO, non un Appearance) e il sigillo è un marchio monocromo.
   Vogliono il master come riferimento di identità, non di resa.
   ========================================================================= */

export const GENERATION_STAGES: readonly { stage: 0 | 1 | 2; label: string; note: string }[] = [
  {
    stage: 0,
    label: 'FONTE DI VERITÀ',
    note: 'Solo testo. Da qui esce la faccia che tutto il resto deve rispettare.',
  },
  {
    stage: 1,
    label: 'DERIVATI DAL MASTER',
    note: 'Allega l’immagine dello stadio 0 al prompt. Senza, il personaggio scivola.',
  },
  {
    stage: 2,
    label: 'ALTRI LINGUAGGI',
    note: 'Doodle e sigillo: il master serve per l’identità, non per la resa.',
  },
];

/** Gli asset da produrre, nell'ordine giusto. */
export function generationOrder(): AssetTypeDef[] {
  return [...ASSET_TYPES].sort((a, b) => a.stage - b.stage);
}

/** Quanti frame disegnati costa un asset: un foglio ne vale più di uno. */
export function frameCount(type: AssetType): number {
  if (type === 'reaction_pack') return EXPRESSION_SPEC.frames;
  if (type === 'idle_animation') return IDLE_SPEC.frames;
  return 1;
}

/** Il totale dei frame di un .mon completo. Serve a DEV e alla documentazione. */
export function totalFrames(): number {
  return ASSET_TYPES.reduce((sum, a) => sum + frameCount(a.type), 0);
}

/* ============================================================================
   Quale espressione mostrare in chat.

   §5 vieta di fabbricare stati soggettivi dai sensori; qui non si fabbrica
   niente: si sceglie quale delle sei facce già disegnate sta meglio su un
   testo che il .mon ha appena scritto. È una scelta di presentazione, non un
   dato che entra da nessuna parte.
   ========================================================================= */

const MOOD_EXPRESSION: Record<string, Expression> = {
  CUTE: 'WARM',
  AFFECTIONATE: 'WARM',
  ALLURING: 'WARM',
  SEDUCTIVE: 'WARM',
  GOOFY: 'AMUSED',
  CAZZARO: 'AMUSED',
  FLIRTY: 'AMUSED',
  BRIGHT: 'AMUSED',
  WATCHFUL: 'ALERT',
  MYSTERIOUS: 'ALERT',
  CREEPY: 'ALERT',
  SAD: 'LOW',
  CALM: 'NEUTRAL',
  STOIC: 'NEUTRAL',
  AGGRESSIVE: 'INTENSE',
  FERAL: 'INTENSE',
  CHAOTIC: 'INTENSE',
};

/** Segni nel testo che pesano più dell'umore di fondo: è quello che ha appena detto. */
const TEXT_CUES: { expression: Expression; words: string[] }[] = [
  { expression: 'AMUSED', words: ['ahah', 'ridic', 'scherz', 'ovvio', 'certo che'] },
  { expression: 'ALERT', words: ['?', 'davvero', 'aspetta', 'come mai', 'sicuro'] },
  { expression: 'INTENSE', words: ['!', 'adesso', 'muoviti', 'basta', 'forza'] },
  { expression: 'LOW', words: ['non lo so', 'niente', 'poco', 'stanco', 'lascia'] },
  { expression: 'WARM', words: ['grazie', 'bello', 'ci sono', 'vicino', 'mi manchi'] },
];

/**
 * L'espressione con cui il .mon dice una certa cosa. Deterministica: lo stesso
 * testo dà sempre la stessa faccia, quindi non «sfarfalla» a ogni render.
 */
export function expressionFor(text: string, moodPrimary: string): Expression {
  const t = text.toLowerCase();
  for (const cue of TEXT_CUES) {
    if (cue.words.some((w) => t.includes(w))) return cue.expression;
  }
  return MOOD_EXPRESSION[moodPrimary] ?? 'NEUTRAL';
}
