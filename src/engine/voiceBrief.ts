/* ============================================================================
   DA DODICI NUMERI A UNA PERSONA — SINTESI DETERMINISTICA (§13, §14)

   🔷 «Il Voice DNA descrive tendenze, non obblighi. Non deve dimostrare ogni
      tratto. Deve rispondere al momento, e la personalità emerge da cosa
      sceglie.»

   ════════════════════════════════════════════════════════════════════════════
   IL GUASTO, E NON ERA IL MODELLO

   Il system prompt della voce riceveva i dodici assi così:

     - humor 82/100 (deadpan, camp, absurd, dark, sarcasm, nonsense…)
     - writing 25/100 (verbosity, sentence length, fragments, CAPS…)
     - temperament 71/100 (energy, confidence, patience, competitiveness…)
     …

   con sopra la riga: «Let the high and low ones actually show.»

   Dodici numeri, ognuno con otto o dieci parametri elencati dentro, e l'ordine
   di FARLI VEDERE. Un modello che riceve quella roba fa l'unica cosa
   ragionevole: prova a esibirli tutti in ogni risposta. Battuta perché humor è
   alto, domanda perché la curiosità sta in temperament, richiamo affettuoso
   perché bond è alto, tutto corto perché writing è basso — e quello che esce
   non è una persona, è un curriculum recitato.

   🔒 IL VOICE DNA NON È IL PROBLEMA E NON SI TOCCA. Il preset resta, le
   mutazioni restano, le deviazioni restano, i numeri restano salvati e
   ispezionabili in DEV. Quello che cambia è la TRADUZIONE: da tabella di
   parametri a descrizione di una persona.

   ⚠️ E LA TRADUZIONE È CODICE, NON UN'ALTRA CHIAMATA A UN MODELLO. La regola
   di tutta questa revisione è «usa l'AI per le decisioni che richiedono AI»:
   qui non c'è nessuna decisione, c'è una tabella da leggere. Aggiungere una
   chiamata per farsi riformulare quello che il programma già sa sarebbe la
   stessa spesa senza valore che abbiamo tolto dai prompt derivati.
   ════════════════════════════════════════════════════════════════════════════

   🔒 COME SI LEGGE UNA SOGLIA QUI DENTRO. Ogni asse produce UNA riga solo se è
   davvero marcato — sotto 30 o sopra 70. Un asse a 50 non dice niente su
   nessuno, e una riga che vale per tutti è rumore che spinge fuori dalla
   finestra le righe che contano. Un .mon medio esce con quattro o cinque
   righe; uno estremo con nove. Nessuno con dodici.
   ========================================================================= */

import { VOICE_AXES, voicePresetDef } from './generation-config';
import type { VoiceAxisId } from './generation-config';
import type { VoiceDna } from './types';

/** Quanto sotto/sopra un asse deve stare per meritare una riga. */
const BASSO = 30;
const ALTO = 70;

/**
 * Cosa vuol dire, per come si comporta, un asse basso o alto.
 *
 * ⚠️ Ogni riga è scritta come TENDENZA, mai come istruzione. «Fa battute» è un
 * ordine; «l'umorismo è secco e arriva quando arriva» è un modo di essere. La
 * differenza sembra sottile e non lo è: la prima forma produce una battuta per
 * risposta, la seconda produce un tipo.
 *
 * 🔒 Le frasi non nominano mai VINZ né gli danno un compito conversazionale
 * («chiedi», «rispondi», «commenta»): descrivono un carattere. Un verbo
 * all'imperativo qui dentro tornerebbe a essere un copione.
 */
const LETTURA: Record<VoiceAxisId, { basso: string; alto: string }> = {
  temperament: {
    basso: 'low energy: slow to react, patient, unbothered by silence',
    alto: 'high energy: quick, confident, impatient, competitive when it matters',
  },
  relationship: {
    basso: 'independent: keeps a little distance, does not seek closeness',
    alto: 'close and protective: complicity is the default register',
  },
  humor: {
    basso: 'not a joker: humour is rare and dry when it happens',
    alto: 'humour comes easily — dry, absurd or dark depending on the moment',
  },
  writing: {
    basso: 'says little: short sentences, fragments, no build-up',
    alto: 'talks at length when the subject deserves it, and elaborates',
  },
  lexicon: {
    basso: 'plain words, nothing sophisticated',
    alto: 'precise, technical or sophisticated vocabulary comes naturally',
  },
  language: {
    basso: 'plain Italian, almost no English',
    alto: 'code-switches into English and internet register without thinking about it',
  },
  digitalArtifacts: {
    basso: 'speaks like a person, never like a machine',
    alto: 'file, error and percentage metaphors are part of how he thinks',
  },
  emotion: {
    basso: 'emotionally restrained: feelings are there, they just do not get announced',
    alto: 'emotionally open: enthusiasm, irritation and vulnerability show',
  },
  rituals: {
    basso: 'no rituals, no recurring formulas',
    alto: 'has his own ways of greeting, celebrating and complaining',
  },
  /* §28 — i confini stanno alti per tutti e non sono un tratto di carattere:
     nominarli qui li farebbe sembrare negoziabili. Restano nel blocco delle
     regole assolute, dove sono scritti come divieti. */
  boundaries: { basso: '', alto: '' },
  evolution: {
    basso: 'lives in the present tense, little self-awareness',
    alto: 'self-aware, notices his own patterns',
  },
  bond: {
    basso: 'still formal with VINZ: no shared history in the way he talks',
    alto: 'talks like someone with shared history: callbacks, shorthand, familiarity',
  },
};

/* ============================================================================
   LA CURIOSITÀ NON HA UN ASSE SUO

   §22.7 la chiede — «la vorrei curiosa del mondo, non solo del mio mondo» — e
   nel prompt era un paragrafo uguale per tutti. Un paragrafo uguale per tutti
   è un comportamento uguale per tutti, cioè il contrario di un carattere.

   🔒 Sta dentro `temperament` (che elenca «curiosity» fra i suoi parametri) e
   si legge insieme a `lexicon`: chi ha parole precise si incuriosisce dei
   dettagli, chi ha energia si incuriosisce di tutto e in fretta. Non è un asse
   nuovo — è una lettura di due assi che ci sono già.
   ========================================================================= */
function curiosita(v: VoiceDna): string | null {
  const t = numero(v, 'temperament');
  const l = numero(v, 'lexicon');
  if (t >= ALTO) return 'curiosity is wide and fast: many things catch his attention';
  if (l >= ALTO) return 'curiosity is narrow and deep: one detail at a time, thoroughly';
  if (t <= BASSO) return 'rarely curious out loud, but notices more than he says';
  return null;
}

function numero(v: VoiceDna, id: VoiceAxisId): number {
  const raw = v[id];
  return typeof raw === 'number' ? raw : 50;
}

export interface VoiceBrief {
  /** Le righe di comportamento, già filtrate. Mai dodici. */
  lines: string[];
  /** Quanto parla, in una parola: serve anche alla bio. */
  length: 'short' | 'medium' | 'long';
}

/**
 * La lettura comportamentale del Voice DNA di una creatura.
 *
 * 🔒 Deterministica: stessi numeri, stesse righe. Nessuna chiamata, nessun
 * caso, niente da salvare — si ricalcola quando serve.
 */
export function voiceBrief(voice: VoiceDna, presetId: string): VoiceBrief {
  const lines: string[] = [];

  /* Il preset per primo: è la linea di base, e dirla per prima evita che le
     righe degli assi vengano lette come l'intero carattere. */
  lines.push(`baseline register — ${voicePresetDef(presetId).tone}`);

  for (const axis of VOICE_AXES) {
    const value = numero(voice, axis.id);
    const lettura = LETTURA[axis.id];
    if (value <= BASSO && lettura.basso) lines.push(lettura.basso);
    else if (value >= ALTO && lettura.alto) lines.push(lettura.alto);
  }

  const c = curiosita(voice);
  if (c) lines.push(c);

  const w = numero(voice, 'writing');
  return { lines, length: w <= BASSO ? 'short' : w >= ALTO ? 'long' : 'medium' };
}

/**
 * Il blocco pronto da mettere in un prompt, con l'avvertenza che conta.
 *
 * ⚠️ L'AVVERTENZA NON È DECORAZIONE, È IL PEZZO PIÙ IMPORTANTE DEL BLOCCO.
 * Senza, un elenco di tendenze si legge come un elenco di cose da fare — è
 * esattamente quello che faceva la versione a numeri, e le righe in prosa da
 * sole non lo risolverebbero.
 */
export function voiceBriefBlock(voice: VoiceDna, presetId: string): string {
  const { lines } = voiceBrief(voice, presetId);
  return [
    'HOW YOU TEND TO BE (§13, §14)',
    'These are TENDENCIES, not obligations. They describe what you are like,',
    'not what you must demonstrate. It is completely normal for most of them to',
    'be invisible in any single reply — that is what having a character means,',
    'as opposed to performing one.',
    '',
    ...lines.map((l) => `- ${l}`),
    '',
    'Being funny does not mean joking every time. Being curious does not mean',
    'always asking something. Being close does not mean always reassuring.',
    'Being direct does not mean always pushing back. Talking little does not',
    'mean every reply is the same length.',
  ].join('\n');
}
