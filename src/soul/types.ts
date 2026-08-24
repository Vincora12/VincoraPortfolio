/* ============================================================================
   SOUL — i tipi

   🔒 LA FONTE VISIVA È `docs/lab/reference/soul-master-sketch.png`, non una
   descrizione di questa testata. Tre facce, disegnate a mano: corpo tondo
   viola, fiamma a zig-zag sopra, faccia verde di due occhi e una bocca.
   Sinistra assonnata/scocciata, centro neutra, destra arrabbiata.

   ⚠️ QUELLO CHE NON DEVE DIVENTARE, ed è scritto nel brief perché è la deriva
   naturale: una emoji, una bolla generica, una mascotte da assistente, una
   faccia anime, un avatar aziendale. Se un giorno un parametro rende una di
   queste cose, il parametro è sbagliato, non lo schizzo.

   🔒 VIOLA E VERDE NON SONO I COLORI DELLA SOUL. Sono i colori DELL'ESEMPIO.
   Il corpo prende il colore dal .mon attivo; qui restano solo come ripiego
   quando non c'è nessun .mon.
   ========================================================================= */

export type SoulExpression =
  | 'neutral'
  | 'sleepy'
  | 'annoyed'
  | 'angry'
  | 'amused'
  | 'skeptical'
  | 'happy'
  | 'excited'
  | 'sad'
  | 'concerned'
  | 'surprised'
  | 'deadpan';

export const SOUL_EXPRESSIONS: SoulExpression[] = [
  'neutral', 'deadpan', 'sleepy', 'annoyed', 'angry', 'skeptical',
  'amused', 'happy', 'excited', 'sad', 'concerned', 'surprised',
];

export type SoulMouth = 'flat' | 'zigzag' | 'up' | 'down' | 'open' | 'fang' | 'small';

export const SOUL_MOUTHS: SoulMouth[] = ['flat', 'small', 'zigzag', 'fang', 'up', 'down', 'open'];

/* ============================================================================
   IL MODELLO A PARAMETRI

   🔒 NESSUNA IMMAGINE PER ESPRESSIONE, dice il brief, e la ragione è pratica:
   dodici espressioni × ogni ritocco della forma = dodici file da rifare. Qui
   una espressione è un insieme di NUMERI sulla stessa faccia, quindi
   cambiare la forma del corpo le aggiorna tutte insieme.
   ========================================================================= */

/** Lo stato della faccia: quello che cambia fra un'espressione e l'altra. */
export type SoulFaceState = {
  /** 0 = chiuso, 1 = spalancato. La palpebra scende da sopra. */
  leftEyeOpen: number;
  rightEyeOpen: number;
  /** Gradi. Positivo = palpebra che scende verso il naso: è quello che fa «arrabbiato». */
  leftEyeTilt: number;
  rightEyeTilt: number;
  mouthType: SoulMouth;
  mouthWidth: number;
  mouthOpen: number;
  mouthTilt: number;
};

/** La forma del corpo e della fiamma. */
export type SoulShape = {
  size: number;
  bodyWidth: number;
  bodyHeight: number;
  roundness: number;
  wispHeight: number;
  wispWidth: number;
  wispBend: number;
  wispLean: number;
};

/** I sei strati di movimento (§6 del brief). */
export type SoulMotion = {
  floatAmplitude: number;
  floatDurationSec: number;
  breathAmount: number;
  wispSwayDeg: number;
  wispDurationSec: number;
  blinkIntervalSec: number;
  talkPulse: number;
  reactionSquash: number;
};

export type SoulColor = {
  /** Da dove viene il colore del corpo. `TEST` serve solo dentro il laboratorio. */
  bodySource: 'MON_PRIMARY' | 'TEST';
  bodyTest: string;
  face: string;
  autoContrast: boolean;
  /** Quanto l'umore può muovere il colore. Il brief mette i tetti: ±8° / ±16% / ±8%. */
  hueMood: number;
  satMood: number;
  litMood: number;
};

export type SoulTuning = {
  shape: SoulShape;
  face: {
    expression: SoulExpression;
    eyeSpacing: number;
    eyeWidth: number;
    eyeHeight: number;
    eyeTilt: number;
    asymmetry: number;
    mouthType: SoulMouth | 'AUTO';
    mouthWidth: number;
    mouthHeight: number;
    mouthTilt: number;
    faceY: number;
  };
  motion: SoulMotion;
  color: SoulColor;
};

/* ============================================================================
   IL SEGNALE CHE ARRIVA COL MESSAGGIO

   🔒 §7 del brief, e la riga che conta è l'ultima: «Do not create a second
   model call only to infer emotion». L'espressione viaggia INSIEME alla
   risposta, non dietro una seconda chiamata — che costerebbe il doppio e
   arriverebbe in ritardo sulla faccia.
   ========================================================================= */
export type SoulCue = {
  expression: SoulExpression;
  /** 0..1 — quanto è marcata. */
  intensity: number;
  /** 0..1 — quanta energia nel movimento. */
  energy: number;
};

/** Come sta il .mon adesso, ridotto a quello che la faccia sa usare. */
export type SoulMoodInput = {
  /** 0..100 — il tono. */
  tone: number;
  /** 0..100 — la carica. */
  charge: number;
};
