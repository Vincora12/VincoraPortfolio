/* ============================================================================
   IL COMPILATORE A DUE STADI (VINZ.MON PROMPT COMPILER v1)

   🔷 Pacchetto scritto altrove e portato qui. L'architettura è diversa dalla
   mia, ed è migliore — vale la pena scrivere perché, o fra un mese sembrerà
   un giro inutile.

     COM'ERA QUI     fatti → concatenazione → un modello RISCRIVE il prompt
     COM'È ADESSO    fatti → un modello prende le DECISIONI (JSON) → codice
                     deterministico scrive il prompt da quelle decisioni

   La differenza non è di eleganza. Con la prima forma il modello consegna
   prosa, e per controllarla si può solo cercare stringhe dentro un testo — è
   quello che facevo, e cercare un esadecimale dentro un paragrafo è un
   controllo che passa per caso. Con la seconda consegna un oggetto con chiavi
   dichiarate: si controlla che le decisioni ci siano tutte e che i conteggi
   stiano nei limiti. È verificabile davvero.

   🔒 E c'è una conseguenza pratica grossa: la risoluzione è MOLTO più corta di
   un prompt riscritto — uno o due mila token contro ottomila — perché sono
   decisioni, non testo finito. Una chiamata più corta ha una possibilità di
   stare dentro i dieci secondi delle funzioni; una da ottomila token non ne
   aveva nessuna.

   ⚠️ I tipi qui sono ALLARGATI rispetto al pacchetto originale dove i nostri
   dati sono più ricchi: `rarity` da noi arriva fino a SINGULAR e lo stato dei
   capelli ha tre valori, non due. Stringere i nostri dati per farli entrare in
   un tipo più povero avrebbe buttato informazione vera per far contento un
   file. Vedi `adapter.ts`.
   ========================================================================= */

import type { NumericGrammar } from '../../engine/generation-config';

export type { NumericGrammar };

/**
 * Quello che il RESOLVER decide.
 *
 * 🔒 Ogni chiave è una decisione di design che i fatti non contengono: i fatti
 * dicono «Family BEAST, Role CORRIERE», questo dice QUALE massa domina e QUALI
 * due o tre zone l'affinità trasforma. È esattamente il pezzo che una
 * concatenazione non può produrre, perché non è scritto da nessuna parte.
 */
export interface CreativeResolution {
  corePersonality: string[];
  dominantIdentityMass: string;
  silhouetteLandmarks: string[];
  proportionalExaggeration: string;
  ridiculousSpecificFeature: string;
  facialAttitude: string;
  familySystems: string[];
  archetypeBodyPlan: string;
  affinityZones: string[];
  roleBehavior: string[];
  roleStructuralMotif?: string;
  fashionMasses: string[];
  hairConstruction: string;
  eyewearConstruction: string;
  culturalTranslation: string[];
  asymmetryBudget: string[];
  negativeSpaces: string[];
  detailBudget: string[];
  memorySentence: string;
  appealBehaviors: string[];
  visualDNALock: string[];
}

/** I fatti, nella forma che il resolver e il compilatore leggono. */
export interface ResolverInput {
  name: string;
  rarity: string;
  family: string;
  archetype: string;
  affinity: string;
  size: string;
  humanoidity: number;
  role: string;
  fashion: string;
  mood: string[];
  characterDesignDNA: string;
  detailDensity: number;
  appearance: string;
  palette: {
    dominantBase: { hex: string; name: string };
    acidHero: { hex: string; name: string };
    contrast: { hex: string; name: string };
    microAccent?: { hex: string; name: string };
    neutrals?: { hex: string; name: string }[];
  };
  vinzIdentity: {
    /** ⚠️ Stringa e non unione: da noi ce n'è anche un terzo, GROWN-OUT. */
    hairMode: string;
    eyewearCategory: string;
    eyewearSolution?: string;
  };
  activeCulturalDNA: string[];
  characterDNA: {
    silhouetteQuirk?: string;
    anatomicalGimmick?: string;
    faceEyeLogic?: string;
    bodyLanguageDefault?: string;
    recurringMotif?: string;
    contradictions?: string[];
  };
}

export interface CompiledPrompt {
  masterVersion: '1.2';
  prompt: string;
  /** Cose fuori posto che non bloccano, ma vanno dette. */
  warnings: string[];
  numericGrammar: NumericGrammar;
}
